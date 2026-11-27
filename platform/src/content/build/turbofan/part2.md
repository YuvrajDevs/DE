<!-- chapter: contract | 5. Configuration, the event contract and the health logic -->
# 5. Configuration, the event contract and the health logic

This chapter is pure Python: no Kafka, no Spark. It holds the **rules** of the system (what an event looks like, what makes it valid, how health is computed, when to alert). Keeping rules separate from the big tools is the single best design decision in the project: the rules can be tested in milliseconds and reused by Spark, the tests and the calibration script.

## config.py (you created it in chapter 4)

Every path, name and tuning number lives here, and each can be overridden with an environment variable (for example `TT_TRIGGER="1 second"`). Nothing is hard-coded in the jobs.

| Setting | Value | Why |
|---|---|---|
| `TOPIC` / `PARTITIONS` | `engine-telemetry`, 6 | 6 partitions → up to 6 parallel readers; enough for a laptop, small enough to see in Kafka UI |
| `TABLES` | bronze, silver, dlq, three gold tables | Each table is a folder under `lake/` |
| `CHECKPOINTS` | `lake/_checkpoints` | One sub-folder per streaming query. **Never share or delete a checkpoint casually**: it is the query's memory |
| `WATERMARK` | 10 minutes | How late an event may arrive and still be de-duplicated |
| `TRIGGER` | 5 seconds | Micro-batch interval: a balance between latency and overhead |
| `MAX_OFFSETS_PER_TRIGGER` | 200,000 | **Backpressure**: after an outage, Spark catches up in batches of at most 200k instead of swallowing hours at once |

**Why environment variables?** The same code then runs on your laptop, in Docker and on Databricks with different settings and no code change (the "twelve-factor" principle).

## events.py: the contract and the rules

Create `telemetry/events.py`:

{{file:telemetry/events.py}}

### Part 1: the event (`make_event`)

One message looks like this:

```json
{"schema_version": 1, "event_id": "6c1f...", "fleet": "FD001", "engine_id": "FD001-007",
 "cycle": 113, "event_time": "2026-11-25T14:56:44.621Z",
 "op_settings": [0.0007, -0.0004, 100.0], "sensors": {"s1": 518.67, "s2": 642.1, "...": "...", "s21": 23.4}}
```

| Field / choice | Why |
|---|---|
| `event_id = uuid5(engine_id + cycle)` | **Deterministic**: the same reading always gets the same ID. If it is sent twice, both copies have the same ID, so duplicates can be found anywhere downstream. A random ID per send would make a duplicate look like a new event: the most common reason "exactly-once" pipelines are not |
| `engine_id` (used as the Kafka key) | Same key → same partition → each engine's readings stay in order |
| `event_time` set by the producer, in UTC with `Z` | Processing uses **when it happened**, not when it arrived, so late data lands in the right place. UTC avoids time-zone bugs |
| `schema_version` | Lets the format change later without breaking readers |
| `sensors` as a nested object | Keeps the 21 readings together; Spark parses it into columns in silver |

**Tech box: JSON for events.** *Why:* readable, every tool understands it, easy to debug in Kafka UI. *Alternatives:* **Avro/Protobuf** with a schema registry (binary, smaller, schema checked on every send, the production choice at scale). *Impact:* JSON is ~900 bytes per event here; Avro would be several times smaller. The capacity plan mentions switching at large scale.

### Part 2: validation (`validate`)

Returns `None` for a good event, or a **reason code**:
- `MALFORMED_JSON`: not a JSON object at all (for example a truncated message).
- `MISSING_FIELD`: a required field or any sensor is missing or NaN.
- `OUT_OF_RANGE`: a physically impossible value (for example pressure `s11` outside 40-60).

**Why reason codes instead of just "bad"?** You can count them, chart them and route them: "154 missing fields from one producer" tells you where to look. The same rules are written again in Spark in silver (chapter 11) and a test proves both agree.

### Part 3: the health score (`health_index`), in plain words

For each of the 10 drifting sensors:
1. Take the reading's distance from that sensor's **healthy average**, divided by its **healthy spread** (standard deviation). This is a **z-score**: "how many normal-wobbles away from healthy is it?". The healthy average and spread were measured from the first 30 cycles of every FD001 engine (the numbers in `HEALTH_SENSORS`).
2. Multiply by the sensor's **direction** (+1 if it rises with wear, -1 if it falls), so wear always pushes the number **up**.
3. Average the 10 values.

Result: about **0 for a healthy engine**, rising as it wears.

**Why two patterns (HPC and FAN)?** FD003 has a second kind of failure (the fan). In a fan failure, five sensors move in the **opposite** direction to a compressor failure. The first version used only the compressor pattern, so for fan failures the sensors cancelled out and **44 of 100 FD003 engines never alerted**. The fixed version computes both patterns and takes the worse one: `max(hpc, 0.4 × fan)`. The fan pattern is scaled by 0.4 because its sensors move very far (20+ standard deviations) and would otherwise alarm too early. `fault_mode` says which pattern won, so an alert can go to the right team. (Chapter 7 shows how this was measured.)

### Part 4: smoothing and alert levels (`advance_state`)

- One reading is noisy, so the score is smoothed with an **EWMA**: `ewma = 0.2 × new + 0.8 × previous`. It needs only **one number per engine** as memory, which is ideal for streaming (a rolling average of the last 20 readings would need 20 numbers per engine).
- **WARNING** when the EWMA reaches 1.5, **CRITICAL** at 2.5 (calibrated in chapter 7).
- **Levels only go up** until maintenance: an engine does not flap between OK and WARNING.
- An alert is created **only when the level rises**, with ID `engine:LEVEL`, so each alert happens once.
- **Idempotency rule:** events with a cycle **at or before** the last applied cycle are ignored. If Spark re-runs a batch after a crash, nothing changes. Out-of-order events within a batch are sorted by cycle first.

**Check:** you can explain why `event_id` must be deterministic, and what happens in `advance_state` when the same batch is applied twice.

<!-- chapter: tests | 6. Unit tests first -->
# 6. Unit tests first

### Tech box: pytest
- **What:** Python's standard test runner. Functions named `test_*` with `assert` statements.
- **Why here:** the rules in `events.py` decide whether alerts are right. Testing them without Kafka or Spark takes a fraction of a second, so you run them after every change.
- **Alternatives:** `unittest` (built in, more boilerplate), testing only end to end (slow, and when it fails you do not know which rule broke).
- **Impact:** the "replay is idempotent" test is your proof that a crash cannot double-count, written as code.

Create `tests/test_events.py`:

{{file:tests/test_events.py}}

**What each test protects:**

| Test | Protects against |
|---|---|
| `test_event_id_is_deterministic` | Random IDs (would make duplicates undetectable) |
| `test_make_event_roundtrip_is_valid` | The producer writing events the validator rejects |
| `test_validate_reasons` (3 cases, `parametrize`) | Each bad-data type mapping to the right reason code |
| `test_health_index_near_zero_when_healthy` | A broken baseline that alarms on healthy engines |
| `test_state_escalates_and_raises_each_alert_once` | Missing or repeated alerts |
| `test_replaying_a_batch_is_idempotent` | **Double counting after a crash** |
| `test_out_of_order_events...` | Late, out-of-order readings moving an engine backwards |
| `test_fan_fault_is_detected_and_labelled` | The FD003 bug coming back |

Create `tests/test_spark_parity.py` too, but **do not run it yet**: it imports the silver job you write in chapter 12, so it fails until then. It proves the Spark and Python health formulas agree (chapter 12 explains why that matters). In CI, where Spark is not installed, it is skipped automatically.

{{file:tests/test_spark_parity.py}}

Run:

```bash
python -m pytest -q tests/test_events.py
```

**Check:** all tests in `test_events.py` pass.

<!-- chapter: calibrate | 7. Calibrate the alerts on real failures -->
# 7. Calibrate the alerts on real failures

Before streaming anything, find out whether the health score and thresholds actually warn **early** and **only when needed**. This is done offline on all 200 engines, cycle by cycle, using the **same functions** the stream will use.

Create `scripts/calibrate.py`:

{{file:scripts/calibrate.py}}

```bash
python scripts/calibrate.py
```

**How to read the output:**

| Column | Meaning | Good value |
|---|---|---|
| Warned | Engines that got a WARNING before failing | 100% |
| Warning lead median / p10 | Cycles of warning before failure: typical, and the worst 10% | High enough to plan maintenance (~44 median, 25 for the worst 10%) |
| Critical lead | Same for CRITICAL | ~17-18 |
| Warnings > 125 cycles early | Alarms while the engine is still healthy (false alarms) | Close to 0 |

**What you should see:** the old v1 index catches only **56% of FD003**; v2 catches **100% of both fleets** with the same lead time and no extra false alarms.

**Why this matters (the interview story):** a model tuned on one population (FD001) silently failed on another (FD003). It was found only because the evaluation was split **per fleet** instead of one overall number. The fan weight (0.4) was tuned on the odd-numbered FD003 engines and checked on the even-numbered ones, so the result is not "tuned on the test". That is a data-science-quality habit, applied by a data engineer.

**Why α = 0.2 and 1.5 / 2.5?** Several combinations were tried. Lower thresholds warn earlier but alarm more on healthy engines; higher ones warn too late. α = 0.2 with 1.5 / 2.5 caught every engine with ~44 cycles of warning. Try changing `EWMA_ALPHA` or `WARNING_AT` in `events.py` and re-run to see the trade-off yourself.

**Check:** the v2 rows show 100/100 warned for FD001 and FD003.

<!-- chapter: topic | 8. Create the Kafka topic and the command line -->
# 8. Create the Kafka topic and the command line

Create `telemetry/admin.py`:

{{file:telemetry/admin.py}}

| Choice | Why |
|---|---|
| **6 partitions** | Up to 6 consumers (Spark tasks) can read in parallel. Choose partitions for future parallelism: increasing them later changes which partition a key goes to and breaks per-engine ordering |
| **replication_factor=1** | Only one broker locally. Production: 3, so a broker can die without data loss |
| **retention 168 h** | Messages kept 7 days: you can replay a week after a bug |
| **lz4 compression** | Fast compression; less disk and network |
| `admin = client()` kept in a variable | The client must live until the request finishes. The first version did `client().create_topics(...)`: Python deleted the client too early and the topic was silently not created (F5) |

Create `telemetry/cli.py`, one entry point for every command:

{{file:telemetry/cli.py}}

**Why one CLI?** The same command runs the same way on your laptop, in Docker, in a script and from an orchestrator. Notice the `stream` command has **no list default** in argparse: the first version had one and argparse rejected its own default (F6).

```bash
python -m telemetry.cli create-topic --partitions 6
python -m telemetry.cli describe-topic
```

**Check:** `describe-topic` lists 6 partitions, and Kafka UI (http://localhost:8080) shows the topic `engine-telemetry`.

<!-- chapter: producer | 9. The producer: replay the fleet, with chaos -->
# 9. The producer: replay the fleet, with chaos

Create `telemetry/producer.py`:

{{file:telemetry/producer.py}}

### How it works
- **`fleet_stream`** interleaves engines: each "tick", every engine still alive sends its next cycle. So you see 200 engines streaming at once, like a real fleet, instead of engine 1's whole life and then engine 2's.
- **`--loops` / `--start-loop`** replay the fleet under **new engine IDs** (`FD001-007-L1`). Silver only remembers event IDs for 10 minutes, so a second run reusing old IDs 15 minutes later would land as duplicates (F13). Each run gets fresh IDs.
- **Rate control:** `--rate 500` = 500 events per second. The clock is read **once** per step: the first version read it twice, and at high rates the sleep became negative and crashed the producer (F15).
- **`BufferError` handling:** if the local send queue is full, wait for it to drain. That is backpressure on the producer side.
- **Late events** go into a heap (a priority queue) and are released after `--late-seconds`.

### The producer settings (memorise these)

| Setting | Meaning | Why |
|---|---|---|
| `acks=all` | The broker confirms only when all in-sync replicas have the message | No acknowledged message is lost |
| `enable.idempotence=True` | The broker drops the producer's own retry duplicates | Network retries cannot create duplicates |
| `linger.ms=20` | Wait up to 20 ms to fill a batch | Batching = far higher throughput (~28,000 events/s measured) |
| `compression.type=lz4` | Compress batches | Less network and disk |
| `on_delivery` callback | Counts failed sends | A send you never check is a send you cannot trust |
| `flush(60)` at the end | Wait for everything to be delivered | Without it, queued messages are lost when the program exits |

### Chaos: why break your own pipeline?
`--chaos` = 5% duplicates, 3% late by 30 s, 1% bad messages (truncated JSON, a missing field, or impossible pressure `s11 = -1`). Real sources do all of these. If you test only with clean data, your "exactly-once" claim has never been tested.

### The manifest: how exactly-once becomes provable
Each run writes `data/manifests/<run>.ids`, the IDs of every **valid** event it intended to send. Later, `verify` compares this list with what is in silver: missing, extra, duplicates. Ground truth comes from outside the pipeline, so the pipeline cannot "grade its own homework".

### Try it

```bash
python -m telemetry.cli produce --rate 200 --engines 5 --max-events 500
```

Open Kafka UI → Topics → engine-telemetry → Messages. You will see JSON events, the key is the engine ID, and each engine stays on one partition.

**Check:** the producer prints a summary with `messages_sent` and an empty `delivery_errors`, and the messages are visible in Kafka UI.
