<!-- chapter: contract | 5. Configuration, the event contract and the health logic -->
# 5. Configuration, the event contract and the health logic

This chapter is pure Python: no Kafka, no Spark. It holds the **rules** of the system: what an event looks like, what makes it valid, how health is computed, when to alert. Keeping rules separate from the big tools is the best design decision in the project. The rules can be tested in milliseconds and reused by Spark, the tests and the calibration script.

## config.py (created in chapter 4)

Every path, name and tuning number lives in one place, and each can be overridden with an environment variable (for example `TT_TRIGGER="1 second"`).

| Setting | Value | Why |
|---|---|---|
| `TOPIC` / `PARTITIONS` | `engine-telemetry`, 6 | 6 partitions → up to 6 parallel readers: enough for a laptop, few enough to see in Kafka UI |
| `TABLES` | bronze, silver, dlq, three gold tables | Each Delta table is a folder under `lake/` |
| `CHECKPOINTS` | `lake/_checkpoints` | One sub-folder per streaming query. It is the query's memory: never share it between queries, never delete it casually |
| `WATERMARK` | 10 minutes | How late an event may arrive and still be de-duplicated |
| `TRIGGER` | 5 seconds | Micro-batch interval: a balance between delay and overhead |
| `MAX_OFFSETS_PER_TRIGGER` | 200,000 | **Backpressure**: after an outage, Spark catches up in batches of at most 200k instead of swallowing hours at once |

## events.py, walked through

**1. Imports and the version**

{{snip:telemetry/events.py|"""Event contract|NAMESPACE = }}

- `json` turns Python dicts into text and back. `math` is used for `isnan`. `uuid` makes IDs. `datetime, timezone` give timestamps with a time zone.
- `SCHEMA_VERSION = 1` goes into every event, so a future format change can be detected by readers.
- `NAMESPACE` is a fixed UUID used to generate **deterministic** event IDs (explained in 3).

**2. The health-score constants**

{{snip:telemetry/events.py|HEALTH_SENSORS = {|FAN_WEIGHT = 0.4}}

- `HEALTH_SENSORS` maps each of the 10 drifting sensors to a **tuple** `(direction, healthy_mean, healthy_std)`. Example: `"s2": (+1, 642.3832, 0.3795)` means s2 rises with wear, is about 642.38 when healthy, and normally wobbles by about 0.38.
- Those means and standard deviations were measured from the first 30 cycles (healthy) of every FD001 engine.
- `FAN_SIGNS` is the second failure pattern: for fan faults, five sensors move the other way.
- `FAN_WEIGHT = 0.4` scales the fan pattern down so it does not alarm too early (chapter 7 shows how it was chosen).

> **Python lesson: tuples and dicts.** A tuple `(a, b, c)` is a fixed, ordered group of values. You unpack it in one line: `sign, mu, sd = HEALTH_SENSORS["s2"]`. A dict maps keys to values; `.items()` gives `(key, value)` pairs to loop over.

**3. Valid ranges, alert policy and IDs**

{{snip:telemetry/events.py|SENSOR_RANGES = |return str(uuid.uuid5}}

- `SENSOR_RANGES`: every sensor allowed 0-20,000 by default, then tighter ranges for three sensors (`.update` overwrites those keys). Values outside are **physically impossible**, so they mean a broken sensor or a transport error.
- `EWMA_ALPHA = 0.2`, `WARNING_AT = 1.5`, `CRITICAL_AT = 2.5`: the alert policy (chapter 7).
- `engine_id("FD001", 7, 2)` → `"FD001-007-L2"`. `{unit:03d}` pads with zeros to 3 digits so IDs sort nicely. The `-L2` suffix is added only for replay loops 1+.
- `uuid.uuid5(NAMESPACE, "FD001-007:113")` always returns the **same** UUID for the same text. A random `uuid4()` would give a new ID each time.

> **Why deterministic IDs matter.** If the same reading is sent twice, both copies carry the same ID, so the duplicate can be found anywhere downstream. With random IDs a resend looks like a new event, and "exactly-once" is impossible to check. This one line is the foundation of the whole dedupe and verify story.

**4. Building and serialising an event**

{{snip:telemetry/events.py|def make_event|return json.dumps}}

- `now = now or datetime.now(timezone.utc)`: use the time passed in (tests pass a fixed time) or the current UTC time. Passing time in makes the function **testable**.
- `isoformat(timespec="milliseconds").replace("+00:00", "Z")` gives `2026-11-25T08:00:00.000Z`, the standard ISO 8601 UTC format.
- `to_bytes` uses `separators=(",", ":")` to remove spaces: smaller messages. Kafka sends **bytes**, so the string is `.encode()`d (UTF-8).

One event looks like this:

```json
{"schema_version": 1, "event_id": "6c1f...", "fleet": "FD001", "engine_id": "FD001-007",
 "cycle": 113, "event_time": "2026-11-25T14:56:44.621Z",
 "op_settings": [0.0007, -0.0004, 100.0], "sensors": {"s1": 518.67, "s2": 642.1, "...": "...", "s21": 23.4}}
```

> **Tech box: JSON for events.** *Why:* readable, every tool understands it, easy to debug in Kafka UI. *Alternatives:* **Avro / Protobuf** with a schema registry: binary, several times smaller, schema checked on every send. That is the production choice at scale. *Impact here:* ~900 bytes per event; the capacity plan notes the switch for large fleets.

**5. Validation with reason codes**

{{snip:telemetry/events.py|def validate|return None}}

- Returns `None` for a good event, or a **reason code** string. The order of checks matters: first "is it even a dict?", then required fields, then every sensor present, then every sensor in range.
- `event.get(f) in (None, "")` treats missing and empty the same.
- `isinstance(v, float) and math.isnan(v)`: NaN (not a number) is a float that is not equal to itself, so it needs `math.isnan`.
- `lo <= v <= hi` is Python's **chained comparison**.

Why reason codes and not just "bad"? You can count, chart and route them: "154 missing fields from one gateway" tells you where to look. The **same rules** are rewritten in Spark in silver (chapter 12) and a test proves both agree.

**6. The health score**

{{snip:telemetry/events.py|def _index|return "FAN" if}}

In plain words, `_index` does, for each of the 10 sensors:

1. `(sensors[s] - mu) / sd`: how many "normal wobbles" away from healthy the reading is (a **z-score**).
2. multiply by the direction sign, so wear always pushes the number **up**;
3. average the 10 values.

Result: about **0 for a healthy engine**, rising as it wears. `hpc_index` uses the compressor directions, `fan_index` the fan directions, and `health_index` takes `max(hpc, 0.4 × fan)`: the worse of the two. `fault_mode` says which pattern won, so an alert can be routed to the right team.

Worked example: if s2 reads 643.14 → (643.14 − 642.38) / 0.38 ≈ +2.0. If all 10 sensors were 2 wobbles toward wear, the index would be 2.0, above WARNING (1.5).

**7. State and alerts: `advance_state`**

{{snip:telemetry/events.py|def level_for|return state, alerts}}

Read it slowly; it is the heart of the alerting:

- `level_for(ewma)` maps the smoothed score to 0 (OK), 1 (WARNING) or 2 (CRITICAL) with a **conditional expression**.
- `advance_state(prev, events)` takes an engine's previous state (or `None` for a new engine) and a list of its new events, and returns `(new_state, alerts)`.
- `state = dict(prev) if prev else None` makes a **copy**, so the caller's dict is never changed (no hidden side effects).
- `sorted(events, key=lambda x: x["cycle"])`: apply events in cycle order even if they arrived out of order. `lambda x: x["cycle"]` is a tiny unnamed function used as the sort key.
- `if state and e["cycle"] <= state["last_cycle"]: continue`: **the idempotency rule**. A cycle at or before the last applied one is skipped, so replaying a batch after a crash changes nothing.
- `ewma = α × new + (1 − α) × previous`: the EWMA. It needs one number of memory per engine, which is ideal for streaming.
- `lvl = max(prev_level, level_for(ewma))`: levels only go **up** until maintenance; no flapping.
- An alert is appended only when `lvl > prev_level`, with `alert_id = "FD001-007:WARNING"`. Each engine can raise each level once.

{{full:telemetry/events.py}}

**Check:** you can explain why `event_id` must be deterministic, and what `advance_state` does when the same batch is applied twice.

<!-- chapter: tests | 6. Unit tests first -->
# 6. Unit tests first

> **Tech box: pytest.** *What:* Python's standard test runner: functions named `test_*` containing `assert`. *Why here:* the rules in `events.py` decide whether alerts are right, and testing them needs no Kafka or Spark, so tests run in a fraction of a second after every change. *Alternatives:* `unittest` (built in, more boilerplate); testing only end to end (slow, and a failure does not tell you which rule broke). *Impact:* the "replay is idempotent" test is your crash-safety proof, written as code.

### Walkthrough: `tests/test_events.py`

**1. Fixtures as plain values**

{{snip:tests/test_events.py|"""Fast unit tests|def ev(}}

- `ROW` is one synthetic healthy reading; `NOW` a fixed time so outputs are predictable.
- `ev(cycle, hi)` builds a minimal event dict for `advance_state`. Small helper functions like this keep tests short and readable.

**2. Simple asserts**

{{snip:tests/test_events.py|def test_event_id_is_deterministic|assert validate(json.loads}}

- `assert a == b` passes silently or fails with the values shown. That is all pytest needs.
- The round-trip test makes an event, serialises it, parses it back and checks it is valid: it catches the producer and the validator disagreeing.

**3. One test, many cases: `parametrize`**

{{snip:tests/test_events.py|@pytest.mark.parametrize|assert validate(mutate}}

- `@pytest.mark.parametrize` runs the same test three times with different inputs. Each case is reported separately.
- The `lambda` functions **mutate** a good event into a bad one: `None` (malformed), without `engine_id` (missing), with `s11 = -1.0` (out of range). `{**e, "sensors": {...}}` copies a dict and overrides one key.

**4. Testing behaviour, not code**

{{snip:tests/test_events.py|def test_state_escalates|assert s2 == s}}

- Escalation: health jumps to 10 → exactly two alerts, WARNING then CRITICAL.
- **Replay:** apply a batch, then the **same batch again** → state unchanged, no new alerts. This is the test that proves crash recovery cannot double-count.
- **Out of order:** cycles 3, 1, 2 → applied in order; a stale cycle 2 arriving later is ignored.

**5. Guarding the FD003 fix**

{{snip:tests/test_events.py|def _shift|assert fault_mode(fan_row) == "FAN"}}

- `_shift` builds a reading where every health sensor is moved `z` standard deviations in a given pattern's direction: a synthetic "fan fault" engine.
- The test asserts the **old** HPC-only index would miss it and the new index catches it and labels it FAN. If someone "simplifies" the formula later, this test fails.

{{full:tests/test_events.py}}

Create `tests/test_spark_parity.py` too, but **do not run it yet**: it imports the silver job you write in chapter 12, so it fails until then. It proves the Spark and Python health formulas agree. In CI, where Spark is not installed, it is skipped automatically by `pytest.importorskip("pyspark")`.

{{full:tests/test_spark_parity.py}}

Run:

```bash
python -m pytest -q tests/test_events.py
```

`-q` means quiet: one dot per passing test.

**Check:** all tests in `test_events.py` pass.

<!-- chapter: calibrate | 7. Calibrate the alerts on real failures -->
# 7. Calibrate the alerts on real failures

Before streaming anything, find out whether the health score and thresholds actually warn **early** and **only when needed**. This runs offline on all 200 engines, cycle by cycle, with the **same functions** the stream uses.

### Walkthrough: `scripts/calibrate.py`

**1. Making the project importable from a script**

{{snip:scripts/calibrate.py|import statistics|EARLY = 125}}

- `sys.path.insert(0, ...parents[1])` adds the project root to Python's import path, so a script in `scripts/` can `from telemetry import events`.
- `# noqa: E402` tells the linter "imports after code is intentional here".
- `EARLY = 125`: in C-MAPSS, engines are usually considered healthy until ~125 cycles before failure, so a warning earlier than that counts as a **false alarm**.

**2. The designs being compared**

{{snip:scripts/calibrate.py|def old_index|"v2 max}}

- `old_index` is v1 (compressor pattern only). `abs_index` ignores direction. `events.health_index` is v2.
- `DESIGNS` maps a name to `(function, warning threshold, critical threshold)`. Functions are values in Python: you can store them in a dict and call them later.

**3. Replaying every engine**

{{snip:scripts/calibrate.py|def replay|return out}}

- Group rows by engine (`defaultdict(list)` creates an empty list for a new key automatically).
- For each engine, walk its cycles in order, update the EWMA, and record **how many cycles before the last cycle** the WARNING and CRITICAL first fired. That number is the **lead time**.

**4. Summarising**

{{snip:scripts/calibrate.py|def summarise|BLANK}}

- Counts engines warned, the **median** lead time (typical) and the **p10** (the worst 10%), plus warnings earlier than 125 cycles. Median and p10 say more than an average, which one outlier can drag around.

{{full:scripts/calibrate.py}}

```bash
python scripts/calibrate.py
```

**How to read the table:**

| Column | Meaning | Good value |
|---|---|---|
| Warned | Engines that got a WARNING before failing | 100% |
| Warning lead median / p10 | Cycles of warning: typical, and worst 10% | ~44 median, ~25 p10: enough to plan maintenance |
| Critical lead | Same for CRITICAL | ~17-18 |
| Warnings > 125 early | Alarms while still healthy (false alarms) | Close to 0 |

**What you should see:** v1 catches only **56% of FD003**; v2 catches **100% of both fleets** with the same lead time and no extra false alarms.

**Why this matters (the interview story):** a model tuned on one population (FD001) silently failed on another (FD003). It was found only because the evaluation was split **per fleet**. The fan weight 0.4 was tuned on odd-numbered FD003 engines and checked on even-numbered ones, so the result is not "tuned on the test".

**Try it yourself:** change `EWMA_ALPHA` to 0.1 or `WARNING_AT` to 2.0 in `events.py`, re-run, and watch lead times and false alarms move. Put the values back afterwards.

**Check:** the v2 rows show 100/100 warned for FD001 and FD003.

<!-- chapter: topic | 8. Create the Kafka topic and the command line -->
# 8. Create the Kafka topic and the command line

### Walkthrough: `telemetry/admin.py`

{{snip:telemetry/admin.py|def client|print(f"{name}: {e}")}}

- `AdminClient({"bootstrap.servers": BOOTSTRAP})` connects to Kafka for management tasks (create, delete, describe topics). `bootstrap.servers` is the first address a client contacts; Kafka then tells it about every broker.
- `NewTopic(TOPIC, num_partitions=6, replication_factor=1, config={...})` describes the topic: 6 partitions, 1 copy (one broker locally), 7-day retention in milliseconds, lz4 compression.
- `create_topics` is **asynchronous**: it returns a dict of **futures**. `f.result()` waits for the answer and raises if it failed (for example "already exists", which we print and ignore).
- `admin = client()` is kept in a variable on purpose. The first version did `client().create_topics(...)`; Python garbage-collected the client before the request finished and the topic was silently not created (F5).

> **Python lesson: futures.** A future is a placeholder for a result that arrives later. `future.result()` blocks until it arrives. Whatever object owns the connection must stay alive until then.

| Choice | Why |
|---|---|
| **6 partitions** | Up to 6 consumers read in parallel. Choose for future parallelism: increasing partitions later changes which partition each key maps to and breaks per-engine ordering |
| **replication_factor=1** | One broker locally. Production: 3, so a broker can die without data loss |
| **retention 168 h** | Replay up to a week after a bug |
| **lz4** | Fast compression, less disk and network |

{{full:telemetry/admin.py}}

### Walkthrough: `telemetry/cli.py`

**1. Defining commands with argparse**

{{snip:telemetry/cli.py|def main|a = p.parse_args(argv)}}

- `argparse.ArgumentParser` turns command-line text into Python values and writes `--help` for free.
- `add_subparsers` creates **sub-commands**: `download`, `produce`, `stream`, `verify`, like `git commit` / `git push`.
- `type=float`, `default=500` convert and default each option. `action="store_true"` makes a flag (`--chaos`) that is `True` when present.
- `nargs="*"` with `choices=[...]` lets `stream` take zero or more layer names. There is **no list default** here on purpose: argparse validated a list default as one invalid choice (F6), so the default is applied in code below.

**2. Dispatching**

{{snip:telemetry/cli.py|if a.cmd == "download"|print(f"removed}}

- An `if / elif` chain calls the right function per command.
- `from . import producer` is imported **inside** the branch: commands that do not need Kafka or Spark start instantly and do not fail if those libraries are missing.
- `run.main(tuple(a.layers or (...)))` applies the default layers when none were given.
- `raise SystemExit(0 if ok else 1)`: the **exit code** tells scripts and CI whether verify passed. `demo.sh` relies on it.
- `if __name__ == "__main__": main()` runs `main()` only when the file is executed, not when imported.

{{full:telemetry/cli.py}}

**Why one CLI?** The same command runs identically on your laptop, in Docker, in a shell script and from an orchestrator.

```bash
python -m telemetry.cli --help
python -m telemetry.cli create-topic --partitions 6
python -m telemetry.cli describe-topic
```

**Check:** `describe-topic` lists 6 partitions, and Kafka UI (http://localhost:8080) shows the topic `engine-telemetry`.

<!-- chapter: producer | 9. The producer: replay the fleet, with chaos -->
# 9. The producer: replay the fleet, with chaos

### Walkthrough: `telemetry/producer.py`

**1. Interleaving the fleet: a generator**

{{snip:telemetry/producer.py|def fleet_stream|iters = alive}}

- This is a **generator** (it uses `yield`): it produces one `(subset, row, loop)` at a time, on demand, instead of building a huge list. Memory stays small however long the replay is.
- For each loop and subset it groups rows by engine and creates one **iterator** per engine (`iter(sorted(...))`).
- The `while iters:` loop takes **one row from each engine** per pass ("tick"). `next(it, None)` returns `None` when an engine has no more cycles (it has failed), so it drops out of `alive`.
- Result: 200 engines stream side by side like a real fleet, instead of engine 1's whole life followed by engine 2's.

> **Python lesson: generators.** A function with `yield` returns a generator. Each `for x in gen` asks for the next value, and the function runs until the next `yield`. Generators are how you process unbounded streams with constant memory.

**2. Making bad events on purpose**

{{snip:telemetry/producer.py|def _bad_event|return to_bytes(bad), kind}}

- Picks one of three fault types at random. A truncated byte string (malformed JSON), a missing required field, or an impossible pressure `s11 = -1`.
- Bad events get a **random** `uuid4()` ID so they can never be mistaken for a valid event in verification.

**3. The Kafka producer configuration**

{{snip:telemetry/producer.py|producer = Producer({|})}}

| Setting | Meaning | Why |
|---|---|---|
| `acks=all` | Broker confirms only when all in-sync replicas have the message | No acknowledged message is lost |
| `enable.idempotence=True` | Broker drops duplicates caused by the producer's own retries | Network retries cannot create duplicates |
| `linger.ms=20` | Wait up to 20 ms to fill a batch | Batching = far higher throughput (~28,000 events/s measured) |
| `compression.type=lz4` | Compress batches | Less network and disk |
| `queue.buffering.max.messages` | Size of the local send queue | Room for bursts |

> **Tech box: confluent-kafka.** *What:* the Python client built on librdkafka (C). *Why:* fast and supports the idempotent producer. *Alternative:* `kafka-python` (pure Python, slower, fewer features). *How sending works:* `produce()` only puts the message in a local queue; a background thread sends batches; `poll()` runs delivery callbacks; `flush()` waits until everything is delivered.

**4. Sending safely**

{{snip:telemetry/producer.py|def on_delivery|producer.poll(0)}}

- `on_delivery(err, msg)` is a **callback**: the client calls it once per message when the broker answers. Errors are counted, never ignored.
- `def send(...)` is a **nested function**; `nonlocal sent` lets it update a variable of the outer function.
- `except BufferError: producer.poll(0.05)`: if the local queue is full, wait a moment for it to drain and try again. That is producer-side **backpressure**.

**5. The main loop: chaos, rate control, manifest**

{{snip:telemetry/producer.py|for sub, row, loop in fleet_stream|print(f"  {stats}}

- First, any **late** events whose delay is over are released from a **heap** (`heapq`: a priority queue ordered by send time).
- A share of events (`bad_rate`) is replaced by a bad one. Valid ones are recorded in `valid_ids` (the manifest).
- A share (`late_rate`) is held back `late_seconds`; a share (`dup_rate`) is sent twice.
- **Rate control:** `delay = start + events / rate - time.time()`, then sleep if positive. The clock is read **once**: the first version read it twice and crashed at high rates with a negative sleep (F15).
- `Counter()` (from `collections`) counts by key, starting at 0.

**6. Finishing: flush and write the manifest**

{{snip:telemetry/producer.py|while delayed:|return summary}}

- Remaining late events are sent when due, then `producer.flush(60)` waits for every delivery.
- The summary and the **manifest** (`data/manifests/<run>.ids`, one valid event ID per line) are written. The manifest is the ground truth `verify` compares against. It comes from **outside** the pipeline, so the pipeline cannot grade its own homework.

{{full:telemetry/producer.py}}

### Try it

```bash
python -m telemetry.cli produce --rate 200 --engines 5 --max-events 500
```

Open Kafka UI → Topics → `engine-telemetry` → Messages. You will see JSON events whose key is the engine ID, and each engine stays on one partition.

**Check:** the producer prints a summary with `messages_sent` and an empty `delivery_errors`, and the messages are visible in Kafka UI.
