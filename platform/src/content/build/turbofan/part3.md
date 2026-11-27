<!-- chapter: spark | 10. The Spark session -->
# 10. The Spark session

### Tech box: Apache Spark and Structured Streaming
- **What it is:** a distributed processing engine. You describe what to do with DataFrames (like tables); Spark plans it and runs it across cores or machines. **Structured Streaming** runs the same DataFrame code continuously on new data, in micro-batches.
- **Why here:** the same API is used for batch and streaming, it reads Kafka and writes Delta natively, it has **checkpoints** for crash recovery, and it is what Databricks (and most Cummins-style data platforms) run.
- **Alternatives:** **Apache Flink** (true event-at-a-time streaming, lower latency, separate skill set), **Kafka Streams** (Java library, Kafka-to-Kafka only), plain Python consumers (you would have to build checkpoints, parallelism, state and exactly-once yourself).
- **Advantages:** one skill for batch and stream, mature exactly-once with Delta, scales from a laptop (`local[*]`) to a cluster without code changes.
- **Impact:** micro-batches add a few seconds of latency. For engine health that changes once per flight, that is fine; for sub-second use cases Flink would be considered.

### Tech box: Delta Lake
- **What it is:** a table format: Parquet data files + a `_delta_log` folder of JSON commit files. A file belongs to the table only once a commit adds it.
- **Why here:** plain Parquet folders break when a job dies mid-write (half-written files are read as data). Delta commits are **atomic**: readers see all of a write or none of it. It also gives **MERGE** (upserts, needed for gold), schema enforcement, time travel and a history of every commit.
- **Alternatives:** Apache Iceberg (similar, engine-neutral), Apache Hudi (upsert-heavy streaming), plain Parquet (no transactions).
- **Impact:** Spark checkpoints + Delta's atomic commits are what make the pipeline **exactly-once into tables**.

Create `telemetry/spark.py`:

{{file:telemetry/spark.py}}

| Line | What and why |
|---|---|
| `PYSPARK_PYTHON = sys.executable` | Spark starts **separate Python worker processes** for pandas code (gold). They must use this venv, or they cannot find `pyarrow` and gold crashes (F9: this exact bug happened) |
| `master("local[*]")` | Run Spark inside this one process using all cores. On a cluster you change only this |
| Delta `spark.sql.extensions` + `catalog` | Turn on Delta SQL and MERGE |
| `shuffle.partitions = 8` | Spark's default is 200, far too many for a laptop (200 tiny tasks per shuffle). Roughly 2× your cores |
| `session.timeZone = UTC` | Timestamps parse and display the same on every machine |
| `RocksDBStateStoreProvider` | Streaming state (dedupe IDs, windows) kept in RocksDB on disk instead of the Java heap: steady memory, the production choice |
| `driver.memory 3g` | Enough for local runs |
| `configure_spark_with_delta_pip(..., extra_packages=[KAFKA_PKG])` | Downloads the Delta and **Kafka connector** jars from Maven Central on first start (about 1 minute, once). The connector version (`_2.13:4.0.1`) must match Spark and Scala versions exactly |

First start may print `... repos.spark-packages.org ... 403`: harmless, Spark tries several download sites (F8).

**Check:** `python -c "from telemetry.spark import get_spark; s = get_spark(); print(s.version); s.stop()"` prints `4.0.1`.

<!-- chapter: bronze | 11. Bronze: store exactly what arrived -->
# 11. Bronze: store exactly what arrived

Create `telemetry/jobs/bronze.py`:

{{file:telemetry/jobs/bronze.py}}

**What it does:** reads the Kafka topic as a stream and writes every message to a Delta table **as received**: the key and value as strings, plus Kafka's coordinates (`topic, partition, offset, kafka_ts`) and the time we ingested it.

| Choice | Why |
|---|---|
| **Nothing parsed, nothing dropped** | Bronze is the **replayable record**. If silver has a bug, fix it and rebuild silver from bronze. Never "clean" in bronze |
| `startingOffsets = earliest` | On the very first start, read everything in the topic. Afterwards the checkpoint decides |
| `maxOffsetsPerTrigger` | Backpressure: each batch takes at most 200k messages |
| `checkpointLocation` | Spark writes "batch N = offsets X..Y" **before** processing and "batch N done" **after** the Delta commit. After a crash it redoes only unfinished batches, and Delta ignores a batch already committed. Result: **exactly-once into bronze** |
| `partitionBy("ingest_date")` | One folder per day: old days can be dropped cheaply; queries for a day read only that folder |
| `outputMode("append")` | Bronze only ever adds rows |

### Tech box: the medallion architecture (bronze / silver / gold)
- **What:** three layers with clear contracts: raw → cleaned/conformed → business-ready.
- **Why:** each layer has one job, so bugs are easy to localise and fix, and the raw layer makes everything rebuildable.
- **Alternatives:** one big job from Kafka straight to final tables (fast to write, impossible to repair after a bug), or two layers.
- **Impact:** in this project, when the health index changed (v1 → v2), silver could be rebuilt from bronze. That is the point.

<!-- chapter: silver | 12. Silver: validate, dead-letter, deduplicate -->
# 12. Silver: validate, dead-letter, deduplicate

Create `telemetry/jobs/silver.py`:

{{file:telemetry/jobs/silver.py}}

### Step by step
1. **Parse** `raw_value` with `from_json` and an **explicit schema** (`EVENT_SCHEMA`). Never let Spark guess the schema of streaming JSON: a guess can change from batch to batch.
2. **Classify** every row with `dlq_reason`: `MALFORMED_JSON`, `MISSING_FIELD`, `OUT_OF_RANGE`, or NULL (valid). These are the **same rules** as `events.validate()` in chapter 5.
3. **Two queries from the same bronze stream:**
   - `silver`: valid rows, one column per sensor, plus `health_index` and `fault_mode` computed as Spark expressions.
   - `dead_letter`: invalid rows with the **raw payload and the reason**, so they can be inspected and replayed after a fix.
4. **Deduplicate:** `withWatermark("event_time", "10 minutes").dropDuplicatesWithinWatermark(["event_id"])`.

### Tech box: dead-letter table
- **What:** a table for records that cannot be processed, with why.
- **Why:** one bad message must never stop millions of good ones, and must never vanish silently either.
- **Alternatives:** fail the whole stream on the first bad record (one broken device stops the fleet), or drop bad records (silent data loss).
- **Impact:** the demo sends 438 bad messages; all 438 end up here, split exactly by reason, and none leak into silver.

### Tech box: watermark-based deduplication
- **What:** Spark remembers each `event_id` for 10 minutes of event time (in the RocksDB state store), drops repeats, then forgets old IDs.
- **Why:** duplicates come from producer retries and replays. Remembering every ID forever would grow memory without limit.
- **Trade-off (say this in interviews):** a duplicate arriving **more than 10 minutes** after the original is not caught. Global dedupe would need a MERGE into silver on `event_id` (more expensive) or a longer watermark (more state). This is a deliberate, documented choice.
- **Alternatives:** `dropDuplicates` without a watermark (state grows forever), MERGE-based dedupe (exact but costly).

**Why the health index is computed in Spark here, not in Python:** built-in Spark expressions run inside the JVM and are optimised; a Python UDF would ship every row to Python and back (slow). But now the formula exists twice (Spark and Python). `tests/test_spark_parity.py` proves they give **identical** results. Run it now:

```bash
python -m pytest -q tests/test_spark_parity.py
```

**Check:** the parity test passes.

<!-- chapter: gold | 13. Gold: engine state, alerts and fleet health -->
# 13. Gold: engine state, alerts and fleet health

Create `telemetry/jobs/gold.py`:

{{file:telemetry/jobs/gold.py}}

### Three gold tables

| Table | One row per | Used for |
|---|---|---|
| `engine_current_state` | engine | "Which engines are closest to failure right now?" |
| `engine_alerts` | engine × level (WARNING / CRITICAL) | Notifying maintenance, each alert exactly once |
| `fleet_health_minute` | fleet × minute | Trend charts |

### How the engine state is updated (every micro-batch)
1. Take the batch's silver events and **join** each engine's events with its **previous state** from the `engine_current_state` table.
2. `groupBy("engine_id").applyInPandas(_fold, ...)`: for each engine, run the **same** `advance_state` function as the unit tests (chapter 5): sort by cycle, update the EWMA, escalate the level, create alerts.
3. **`localCheckpoint(eager=True)`**: compute the result **now** and cut the link back to the state table (explained below).
4. **MERGE alerts** on `alert_id` (`engine:LEVEL`), insert only if new.
5. **MERGE state** on `engine_id`, update only if `last_cycle` moved forward.

**Why it is idempotent:** if Spark crashes after writing but before checkpointing, it replays the same batch. Cycles at or before `last_cycle` are ignored and existing alert IDs are not inserted again. A replay changes nothing.

### Tech box: foreachBatch + MERGE (instead of a built-in stateful operator)
- **What:** `foreachBatch` gives you each micro-batch as a normal DataFrame, so you can run any batch logic, including Delta MERGE.
- **Why:** the state lives in a **normal Delta table** that dashboards can query directly, and the logic is a plain Python function shared with tests.
- **Alternatives:** `applyInPandasWithState` / `transformWithState` (state hidden inside the checkpoint, not queryable), or a key-value store for state at very large scale.
- **Trade-off:** foreachBatch alone is at-least-once; correctness comes from the MERGE keys. And this step is the slowest part of the pipeline (chapter 18).

### The subtle bug this code prevents (F10): read this twice
The first version had **156 engines in CRITICAL but 0 alerts**, with no error. Why: Spark DataFrames are **lazy**. `out` is a recipe that includes "read the previous state table". The code wrote the **state first**, then computed alerts from `out`. Spark recomputed `out` from scratch, re-reading a state table that had **just been updated**, so every event looked "already applied" and no alerts came out. `cache()` did not help because caching is a performance hint, not a guarantee.
**Fix:** `localCheckpoint(eager=True)` (compute once, cut the lineage) and write alerts first.
**Lesson:** in Spark, never read and write the same table in one lazy plan without materialising first.

### Fleet health per minute
A normal streaming aggregation: 1-minute **event-time** windows per fleet, 2-minute watermark, **append** mode. A window is written once, when it is final (the watermark has passed its end). If data stops arriving, the watermark stops moving and the last windows are not written yet. That is correct behaviour, not a bug (F11): the demo's second, slower wave moves the watermark forward.

<!-- chapter: run | 14. Run the streaming application -->
# 14. Run the streaming application

Create `telemetry/jobs/run.py`:

{{file:telemetry/jobs/run.py}}

- Starts the queries in one Spark application: bronze, then silver and dead-letter (after the bronze table exists), then the two gold queries.
- `_monitor` prints and logs each query's batch, rows, input rate and processing rate every 15 s to `lake/_metrics/progress.jsonl` (used by the report and the load test).
- `awaitAnyTermination()`: if **any** query fails, the app stops. That is **fail-fast** (good for correctness). In production you would run layers as separate jobs so a gold bug cannot stop ingestion (lesson from F9).

Run it in **terminal 1**:

```bash
python -m telemetry.cli stream
```

In **terminal 2** (activate the venv there too), send data:

```bash
python -m telemetry.cli produce --rate 500 --engines 20
```

Open the **Spark UI** at http://localhost:4040 → **Structured Streaming** tab: five queries, their input and processing rates, batch durations.

"Current batch is falling behind" warnings in the first minute are normal (JVM warm-up, F7).

**Check:** after a minute, `ls lake/silver/telemetry lake/gold/engine_current_state` shows Delta folders with `_delta_log`.

<!-- chapter: verify | 15. Report and verify: prove it -->
# 15. Report and verify: prove it

Create `telemetry/report.py`:

{{file:telemetry/report.py}}

### Tech box: delta-rs (`deltalake` package)
- **What:** a Rust implementation of Delta Lake with a Python API.
- **Why:** the report, verify and dashboard read tables **without starting Spark** (milliseconds instead of a 20-second JVM start), and without disturbing the running stream.
- **Alternatives:** Spark (slow to start), DuckDB's Delta extension (also good).

**`report`** prints counts per layer, duplicates in silver, dead letters by reason, latency percentiles (p50/p95/p99), engines by alert level, alerts (rows vs distinct), and peak rates.

**`verify`** is the exactly-once proof: the set of IDs in the producer's manifests vs the IDs in silver:
- **missing** = sent but not in silver (data loss)
- **unexpected** = in silver but never sent as valid (a bad record leaked, or a stale replay)
- **duplicates** = silver rows minus distinct IDs

```bash
python -m telemetry.cli report
python -m telemetry.cli verify
```

**Why percentiles, not averages?** One slow batch or the 3% of events deliberately delayed 30 s hide inside an average. p50/p95/p99 tell the real story (F12).

**Check:** `verify` prints `PASS` once the stream has caught up (if it says missing, wait a few seconds and run it again).

<!-- chapter: demo | 16. The crash demo: exactly-once under chaos -->
# 16. The crash demo: exactly-once under chaos

Stop the stream from chapter 14 (Ctrl+C). Create `scripts/demo.sh`:

{{file:scripts/demo.sh|bash}}

```bash
chmod +x scripts/demo.sh
./scripts/demo.sh            # about 6-8 minutes
```

**What happens:**
1. Clean slate: delete the lake, recreate the topic.
2. Start the streaming app in the background.
3. Wave 1: the whole fleet (200 engines) at 3,000 events/s **with chaos**.
4. **12 seconds in: `kill -9`** the streaming app. No graceful shutdown: like a machine losing power.
5. Restart it 5 seconds later. Checkpoints resume every query exactly where it stopped.
6. Wave 2: 40 new engines slowly, so the watermark advances and minute windows close.
7. Wait until `verify` passes, then print `verify` and `report`.

**What you should see** (these are the numbers from re-running this exact project):

| Measure | Value |
|---|---|
| Messages sent (wave 1) | 47,578 = 44,913 valid unique + 2,227 duplicates + 1,386 late (30 s) + 438 bad |
| Wave 2 | 9,874 messages |
| Expected valid unique events | **54,787** |
| In silver | **54,787: 0 missing, 0 duplicates, 0 unexpected → PASS** |
| Dead letters | 438 = 145 MALFORMED_JSON + 154 MISSING_FIELD + 139 OUT_OF_RANGE |
| Alerts | rows = distinct (each engine × level once). The number grows while gold catches up: 425 when `verify` first passed in the original run, 480 (= 240 engines × 2 levels) once every engine has reached CRITICAL |
| Fleet-minute windows | Often **0** right after the demo. Correct behaviour, see F11 in Troubleshooting for how to see them |

Message counts are produced by a fixed random seed, so they should match exactly. Timing-dependent numbers (alerts so far, latency) will differ. What must hold on every machine: `verify` says **PASS** with 0 missing, 0 duplicates, 0 unexpected, and the dead letters add up to the bad messages sent. That is the claim.

**Why this matters:** "exactly-once" is the most over-claimed phrase in data engineering. You **tested** it against duplicates, late data, bad data and a hard crash, and **verified** it against an independent manifest.

**Check:** the final `verify` says `PASS`.
