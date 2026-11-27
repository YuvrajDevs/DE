<!-- chapter: spark | 10. The Spark session -->
# 10. The Spark session

> **Tech box: Apache Spark and Structured Streaming.** *What:* a distributed processing engine. You describe work with **DataFrames** (tables with named, typed columns); Spark plans it and runs it across cores or machines. **Structured Streaming** runs the same DataFrame code continuously on new data, in **micro-batches**. *Why here:* one API for batch and streaming, native Kafka and Delta support, **checkpoints** for crash recovery, and it is what Databricks runs. *Alternatives:* **Flink** (event-at-a-time, lower latency, separate skill set), **Kafka Streams** (Java library, Kafka-to-Kafka), plain Python consumers (you would build checkpoints, parallelism and state yourself). *Impact:* a few seconds of latency from micro-batches, which is fine for engine health that changes once per flight.

> **Tech box: Delta Lake.** *What:* a table format: Parquet data files plus a `_delta_log/` folder of JSON commit files. A file belongs to the table only after a commit adds it. *Why:* plain Parquet folders break when a job dies mid-write (half-written files get read as data). Delta commits are **atomic**: readers see all of a write or none of it. It also gives **MERGE** (needed for gold), schema enforcement, time travel and a history of every commit. *Alternatives:* Iceberg (engine-neutral), Hudi (upsert-heavy), plain Parquet (no transactions). *Impact:* checkpoints + atomic commits = **exactly-once into tables**.

## Three Spark ideas you need before reading any job

1. **Lazy evaluation.** `df.filter(...).select(...)` does not compute anything; it builds a **plan**. Work happens only when something needs results (writing, `count()`, `collect()`). Spark optimises the whole plan first.
2. **Driver and executors.** Your Python program is the **driver**: it builds plans and coordinates. **Executors** do the work on partitions of data. With `local[*]` both live on your laptop, using all cores.
3. **A streaming query** = `readStream` (a source that keeps growing) → transformations → `writeStream` (sink + checkpoint + trigger) → `.start()`. Every trigger interval, Spark processes what arrived since the last batch.

### Walkthrough: `telemetry/spark.py`

{{snip:telemetry/spark.py|KAFKA_PKG|return spark}}

| Line | What and why |
|---|---|
| `KAFKA_PKG = "...spark-sql-kafka-0-10_2.13:4.0.1"` | The Kafka connector jar, as Maven coordinates. `_2.13` is the Scala version and `4.0.1` the Spark version: they must match your Spark exactly |
| `PYSPARK_PYTHON = sys.executable` | Spark starts **separate Python worker processes** for pandas code (gold). They must use this venv, or they cannot find `pyarrow` and gold crashes (F9: this happened) |
| `SparkSession.builder ... .getOrCreate()` | The **builder pattern**: chain settings, then create one session (or reuse an existing one) |
| `master("local[*]")` | Run inside this process using all cores. On a cluster you change only this |
| `spark.sql.extensions` + `spark_catalog` | Turn on Delta SQL commands and MERGE |
| `shuffle.partitions = 8` | Default is 200: far too many tiny tasks on a laptop. About 2× your cores |
| `session.timeZone = UTC` | Timestamps parse and display the same on every machine |
| `RocksDBStateStoreProvider` | Streaming state (dedupe IDs, windows) kept in RocksDB on disk, not the Java heap: stable memory, the production choice |
| `configure_spark_with_delta_pip(..., extra_packages=[KAFKA_PKG])` | Adds the Delta and Kafka jars; Spark downloads them from Maven Central on first start (about a minute, once) |
| `setLogLevel("WARN")` | Hide Spark's very chatty INFO logs |

{{full:telemetry/spark.py}}

First start may print `... repos.spark-packages.org ... 403`: harmless, Spark tries several download sites (F8).

**Check:** `python -c "from telemetry.spark import get_spark; s = get_spark(); print(s.version); s.stop()"` prints `4.0.1`.

<!-- chapter: bronze | 11. Bronze: store exactly what arrived -->
# 11. Bronze: store exactly what arrived

### Walkthrough: `telemetry/jobs/bronze.py`

**1. Read Kafka as a stream**

{{snip:telemetry/jobs/bronze.py|raw = (spark.readStream|.load())}}

- `spark.readStream.format("kafka")` creates a **streaming DataFrame** over the topic. Each row is one Kafka message with fixed columns: `key`, `value` (both **binary**), `topic`, `partition`, `offset`, `timestamp`.
- `startingOffsets = earliest`: on the very first start, read everything in the topic. After that the **checkpoint** decides where to continue; this option is ignored.
- `maxOffsetsPerTrigger`: at most 200,000 messages per batch (backpressure).

**2. Keep everything, add coordinates**

{{snip:telemetry/jobs/bronze.py|out = raw.select(|withColumn("ingest_date"}}

- `F` is `pyspark.sql.functions`: the library of column functions. `F.col("key").cast("string")` turns the binary key into text; `.alias(...)` names the result column.
- Nothing is parsed and nothing is dropped: the raw message is kept as text in `raw_value`.
- `F.current_timestamp()` stamps when we ingested it; `F.to_date` derives the day for partitioning.

> **Spark lesson: columns are expressions.** `F.col("x").cast("string")` is not a value, it is a recipe Spark applies to every row. You combine recipes with `select`, `withColumn`, `filter`. They run in the JVM, fast, without Python touching each row.

**3. Write it as a Delta stream**

{{snip:telemetry/jobs/bronze.py|return (out.writeStream|.start(str(TABLES["bronze"])))}}

- `queryName("bronze")`: the name you see in the Spark UI and in our progress log.
- `outputMode("append")`: bronze only ever adds rows.
- `checkpointLocation`: before processing batch N, Spark writes "batch N = these offsets"; after the Delta commit it writes "batch N done". After a crash it redoes only unfinished batches, and Delta ignores a batch already committed. That is **exactly-once into bronze**.
- `partitionBy("ingest_date")`: one folder per day, so a day can be read or dropped cheaply.
- `trigger(processingTime="5 seconds")`: start a micro-batch every 5 seconds.
- `.start(path)` launches the query in the background and returns a handle.

{{full:telemetry/jobs/bronze.py}}

> **Tech box: the medallion architecture.** *What:* layers with clear contracts: bronze (raw, replayable) → silver (clean, conformed) → gold (business-ready). *Why:* each layer has one job, so bugs are easy to localise, and bronze makes everything rebuildable. *Alternative:* one job from Kafka straight to final tables (quick to write, impossible to repair after a bug). *Impact here:* when the health index changed from v1 to v2, silver could be rebuilt from bronze.

<!-- chapter: silver | 12. Silver: validate, dead-letter, deduplicate -->
# 12. Silver: validate, dead-letter, deduplicate

### Walkthrough: `telemetry/jobs/silver.py`

**1. An explicit schema for the JSON**

{{snip:telemetry/jobs/silver.py|EVENT_SCHEMA = T.StructType|])}}

- `T` is `pyspark.sql.types`. A `StructType` is a list of `StructField(name, type)`: the shape we expect.
- `sensors` is a **nested struct** with one double field per sensor, built with a list comprehension.
- Never let Spark guess the schema of streaming JSON: a guess could change from batch to batch.

**2. Classify every row**

{{snip:telemetry/jobs/silver.py|def classify|return df.withColumn("dlq_reason", reason)}}

- `F.from_json("raw_value", EVENT_SCHEMA)` parses the text into a struct column `e`. Unparseable JSON becomes `null`; missing fields become `null` inside it.
- `malformed`, `missing`, `out_of_range` are **boolean column expressions**. `reduce(lambda a, b: a | b, [...])` ORs a whole list of conditions into one (`|` is OR, `&` is AND for Spark columns; Python's `and/or` do not work on columns).
- `F.when(c1, "A").when(c2, "B").when(c3, "C")` is SQL's `CASE WHEN`: the first true condition wins; no match → `null`, which here means **valid**.
- These are the **same rules** as `events.validate()` in plain Python.

> **Python lesson: `functools.reduce`.** `reduce(f, [a, b, c])` computes `f(f(a, b), c)`. With `lambda a, b: a | b` it turns `[cond1, cond2, cond3]` into `cond1 | cond2 | cond3`, however many conditions there are.

**3. The health score as Spark expressions**

{{snip:telemetry/jobs/silver.py|def _index_expr|return F.when(fan_expr()}}

- The same z-score formula as `events._index`, written with Spark columns: `(F.col(s) - mu) / sd` times the sign, summed, divided by 10.
- `F.greatest(a, b)` is the row-wise maximum: `max(hpc, 0.4 × fan)`.
- Why not call the Python function from Spark (a UDF)? A UDF ships every row from the JVM to Python and back: much slower. Built-in expressions stay in the JVM. The cost is having the formula twice, which `tests/test_spark_parity.py` guards.

**4. Shape the valid rows**

{{snip:telemetry/jobs/silver.py|def valid_events|withColumn("event_date"}}

- Keep valid rows (`dlq_reason` is null), flatten the struct into columns (`e.sensors.s1` → `s1`), keep Kafka coordinates for traceability, add `health_index`, `fault_mode` and `event_date`.
- `*[... for s in SENSORS]` **unpacks** a list of 21 column expressions as separate arguments.

**5. Two queries from one bronze stream**

{{snip:telemetry/jobs/silver.py|def start(spark):|return [q_silver, q_dlq]}}

- `spark.readStream.format("delta").load(bronze)`: Delta tables are streaming **sources** too; each new commit is new input.
- **Silver query:** `withWatermark("event_time", "10 minutes").dropDuplicatesWithinWatermark(["event_id"])`. Spark remembers event IDs for 10 minutes of event time (in RocksDB), drops repeats, then forgets old IDs so memory stays bounded.
- **Dead-letter query:** the invalid rows with the raw payload, reason and Kafka coordinates, so they can be inspected and replayed after a fix.
- Each query has **its own checkpoint**: never share one.
- Silver is partitioned by `event_date` (when it happened), bronze by `ingest_date` (when it arrived): each layer is partitioned by how it is queried.

> **Tech box: dead-letter table.** *Why:* one bad message must never stop millions of good ones, and must never vanish silently. *Alternatives:* fail the stream on the first bad record (one broken device stops the fleet) or drop bad records (silent loss). *Impact:* the demo's 438 bad messages all land here, split by reason, none in silver.

> **Tech box: watermark dedupe, and its trade-off.** A duplicate arriving **more than 10 minutes** after the original is not caught. Global dedupe would need a MERGE into silver on `event_id` (more expensive) or a longer watermark (more state). This is a deliberate, documented choice: say so in interviews.

{{full:telemetry/jobs/silver.py}}

Now run the parity test from chapter 6:

```bash
python -m pytest -q tests/test_spark_parity.py
```

**Check:** the parity test passes.

<!-- chapter: gold | 13. Gold: engine state, alerts and fleet health -->
# 13. Gold: engine state, alerts and fleet health

| Table | One row per | Used for |
|---|---|---|
| `engine_current_state` | engine | "Which engines are closest to failure right now?" |
| `engine_alerts` | engine × level | Notifying maintenance, each alert exactly once |
| `fleet_health_minute` | fleet × minute | Trend charts |

### Walkthrough: `telemetry/jobs/gold.py`

**1. Schemas and creating empty tables**

{{snip:telemetry/jobs/gold.py|STATE_SCHEMA = |spark.createDataFrame([], schema)}}

- `STATE_SCHEMA` and `ALERT_SCHEMA` describe the two Delta tables. `OUT_SCHEMA` is one combined shape, because `applyInPandas` must return a single schema: state rows and alert rows share it, told apart by a `kind` column.
- `ensure_tables` creates empty tables on first run (`createDataFrame([], schema)`), because MERGE needs a target that exists.

**2. The per-engine function `_fold`**

{{snip:telemetry/jobs/gold.py|def _fold|return pd.DataFrame(rows, columns=cols)}}

- Spark will call this **once per engine per micro-batch** with a **pandas DataFrame** holding that engine's new events, each row also carrying the engine's previous state (`prev_*` columns, from the join below).
- `pd.notna(first["prev_last_cycle"])`: is there a previous state? If not, it is a new engine.
- `.to_dict("records")` turns rows into a list of dicts, so the **same `advance_state` function** from chapter 5 (unit-tested) does the logic.
- It returns one `state` row (only if the engine moved forward) plus one row per new alert.

> **Spark lesson: `groupBy(...).applyInPandas(fn, schema)`.** Spark groups rows by key, sends each group to a Python worker as a pandas DataFrame (via Apache Arrow), runs `fn`, and collects the returned DataFrames. It lets you run ordinary Python per group, at the cost of moving data to Python: that is why it is used only where the logic needs it.

**3. One micro-batch: join, fold, MERGE**

{{snip:telemetry/jobs/gold.py|def upsert_state_and_alerts|.execute())}}

and the state MERGE that follows it:

{{snip:telemetry/jobs/gold.py|state = out.filter("kind = 'state'")|.execute())}}

Step by step:

1. `prev = spark.read...engine_state` reads the **current** state table and renames its columns to `prev_*`.
2. `events.join(prev, "engine_id", "left")`: every event gets its engine's previous state (null for new engines). **Left** join, so new engines are not dropped.
3. `.groupBy("engine_id").applyInPandas(_fold, OUT_SCHEMA)`: run the fold per engine.
4. `.localCheckpoint(eager=True)`: compute the result **now** and cut the link back to the state table. Read the bug below: this line is the difference between working and silently broken.
5. **MERGE alerts** on `alert_id`, `whenNotMatchedInsertAll()` only: an alert that already exists is never inserted again, so replays cannot duplicate alerts.
6. **MERGE state** on `engine_id`: update only `when s.last_cycle > t.last_cycle` (never move an engine backwards), insert new engines.

> **Tech box: Delta MERGE (upsert).** `DeltaTable.forPath(...).alias("t").merge(source.alias("s"), "t.key = s.key")` then `whenMatchedUpdate...` / `whenNotMatchedInsert...` and `.execute()`. It updates rows whose key exists and inserts the rest, in **one atomic commit**. It is how you keep "current state" tables correct under retries.

**The bug this prevents (F10).** The first version wrote state first, then computed alerts. Engines showed CRITICAL but there were **0 alerts**, and no error. Spark is **lazy**: `out` was a recipe that included "read the state table". Computing alerts made Spark **recompute** `out`, re-reading a state table that had **just been updated**, so every event looked "already applied". `cache()` did not help: caching is a performance hint, not a guarantee. **Fix:** `localCheckpoint(eager=True)`, and write alerts first. **Rule:** never read and write the same table in one lazy plan without materialising first.

**4. Wiring it into streams**

{{snip:telemetry/jobs/gold.py|def start(spark):|return [q_state, q_fleet]}}

- `foreachBatch(upsert_state_and_alerts)`: Spark calls your function with each micro-batch as a normal DataFrame plus its batch ID, so you can run any batch logic, MERGE included. It has its own checkpoint.
- **Fleet health:** a normal streaming aggregation: `F.window("event_time", "1 minute")` groups events into 1-minute **event-time** windows per fleet, with a 2-minute watermark; `approx_count_distinct` counts engines cheaply (exact distinct counts in streams cost a lot of state).
- **Append** mode writes a window once, when the watermark has passed its end. If data stops, the watermark stops, and the last windows wait (F11). That is correct behaviour.

> **Tech box: foreachBatch + MERGE vs built-in streaming state.** *Why chosen:* the state lives in a normal Delta table that dashboards can query, and the logic is one Python function shared with tests. *Alternatives:* `applyInPandasWithState` / `transformWithState` (state hidden in the checkpoint, not queryable), a key-value store for very large fleets. *Trade-off:* foreachBatch alone is at-least-once (correctness comes from the MERGE keys), and this is the slowest step in the pipeline (chapter 18).

{{full:telemetry/jobs/gold.py}}

<!-- chapter: run | 14. Run the streaming application -->
# 14. Run the streaming application

### Walkthrough: `telemetry/jobs/run.py`

**1. Waiting for upstream tables**

{{snip:telemetry/jobs/run.py|def _wait_for|time.sleep(5)}}

- Silver cannot start reading bronze until the bronze Delta table exists (its first commit). `_wait_for` polls `DeltaTable.isDeltaTable` every 5 s, with a 10-minute timeout and a clear error.

**2. Monitoring every query**

{{snip:telemetry/jobs/run.py|def _monitor|print("  " + }}

- Every 15 s, for each active query, `q.lastProgress` gives Spark's progress report: batch ID, rows, **input rate** vs **processing rate**, batch duration.
- Each record is appended to `lake/_metrics/progress.jsonl` (one JSON object per line), used later by `report` and the load test.
- If processing rate stays below input rate, the pipeline is falling behind: that is the number to alert on in production.

**3. Starting the layers**

{{snip:telemetry/jobs/run.py|def main(|q.stop()}}

- Starts the requested layers in order, waiting for upstream tables.
- The monitor runs in a **daemon thread** (it dies with the program).
- `spark.streams.awaitAnyTermination()` blocks until any query stops. If one fails, the whole app stops: **fail-fast**. In production you would run layers as separate jobs so a gold bug cannot stop ingestion (lesson of F9).
- Ctrl+C stops queries cleanly; even a hard kill is safe because checkpoints resume.

{{full:telemetry/jobs/run.py}}

Run it in **terminal 1**:

```bash
python -m telemetry.cli stream
```

In **terminal 2** (activate the venv there too):

```bash
python -m telemetry.cli produce --rate 500 --engines 20
```

Open the **Spark UI** at http://localhost:4040 → **Structured Streaming** tab: five queries with their input and processing rates. "Current batch is falling behind" in the first minute is normal (JVM warm-up, F7).

**Check:** after a minute, `ls lake/silver/telemetry lake/gold/engine_current_state` shows Delta folders with `_delta_log`.

<!-- chapter: verify | 15. Report and verify: prove it -->
# 15. Report and verify: prove it

> **Tech box: delta-rs (`deltalake` package).** *What:* a Rust implementation of Delta Lake with a Python API. *Why:* the report, verify and dashboard read tables **without starting Spark** (milliseconds instead of a 20-second JVM start) and without disturbing the running stream. *Alternative:* Spark (slow start), DuckDB's Delta extension.

### Walkthrough: `telemetry/report.py`

**1. Reading a Delta table without Spark**

{{snip:telemetry/report.py|def table(|return round(pc.quantile}}

- `DeltaTable(path).to_pyarrow_table(columns=[...])` reads only the listed columns into an **Arrow table** (columnar, in memory).
- Errors (table not created yet) return `None`, so the report works at any stage.
- `pc` is `pyarrow.compute`: vectorised functions like `quantile`, `unique`, `subtract`.

**2. The report**

{{snip:telemetry/report.py|def report()|out["latency_kafka_to_bronze_ms"]}}

- Silver rows vs distinct event IDs = duplicates.
- **Latency** = `silver_ts − event_time` per row (timestamps are microseconds, so ÷ 1000 → ms), summarised as **p50 / p95 / p99**. Percentiles, not averages: one slow batch or the 3% deliberately late events hide inside an average (F12).

**3. Verify: the exactly-once proof**

{{snip:telemetry/report.py|def verify|return ok}}

- `expected` = union of IDs from the producer manifests; `got` = IDs in silver.
- **missing** = expected − got (data loss). **unexpected** = got − expected (a bad record leaked or a stale replay). **duplicates** = rows − distinct IDs.
- Python **set** operations (`-`, `|`) make this a few lines.
- Returns `True/False`, which the CLI turns into exit code 0/1.

{{full:telemetry/report.py}}

```bash
python -m telemetry.cli report
python -m telemetry.cli verify
```

**Check:** `verify` prints `PASS` once the stream has caught up (if it says missing, wait a few seconds and run it again).

<!-- chapter: demo | 16. The crash demo: exactly-once under chaos -->
# 16. The crash demo: exactly-once under chaos

Stop the stream from chapter 14 (Ctrl+C).

### Walkthrough: `scripts/demo.sh`

{{snip:scripts/demo.sh|set -euo pipefail|wait_table()}}

- `set -euo pipefail`: stop on any error (`-e`), on unset variables (`-u`), and if any part of a pipe fails (`pipefail`). Every serious shell script should start like this.
- `cd "$(dirname "$0")/.."`: run from the project root wherever the script is called from.
- `start_stream` runs the streaming app in the background with `nohup ... &` and saves its **process ID** in `data/stream.pid`, so it can be killed later.
- `wait_table` loops until a Delta table's `_delta_log` folder exists.

{{snip:scripts/demo.sh|== 3. wave 1|start_stream}}

- The producer runs in the background (`&`); `$!` is its process ID.
- `kill -9` sends **SIGKILL**: the process dies instantly with no cleanup, like a power cut. That is the strongest crash test you can do on one machine.
- 5 seconds later the stream restarts from its checkpoints.

{{full:scripts/demo.sh}}

```bash
chmod +x scripts/demo.sh
./scripts/demo.sh            # about 6-8 minutes
```

**What happens:**
1. Clean slate: delete the lake, recreate the topic.
2. Start the streaming app in the background.
3. Wave 1: the whole fleet (200 engines) at 3,000 events/s **with chaos**.
4. **12 seconds in: `kill -9`** the streaming app.
5. Restart it 5 seconds later.
6. Wave 2: 40 new engines slowly, so the watermark advances.
7. Wait until `verify` passes, then print `verify` and `report`.

**What you should see** (from re-running this exact project):

| Measure | Value |
|---|---|
| Messages sent (wave 1) | 47,578 = 44,913 valid unique + 2,227 duplicates + 1,386 late (30 s) + 438 bad |
| Wave 2 | 9,874 messages |
| Expected valid unique events | **54,787** |
| In silver | **54,787: 0 missing, 0 duplicates, 0 unexpected → PASS** |
| Dead letters | 438 = 145 MALFORMED_JSON + 154 MISSING_FIELD + 139 OUT_OF_RANGE |
| Alerts | rows = distinct (each engine × level once). The count grows while gold catches up: 425 when `verify` first passed in the original run, 480 (240 engines × 2) once every engine reached CRITICAL |
| Fleet-minute windows | Often **0** right after the demo: correct behaviour, see F11 in Troubleshooting |

Message counts come from a fixed random seed, so they should match exactly. Timing-dependent numbers (alerts so far, latency) will differ. What must hold on every machine: `verify` says **PASS** with 0 missing, 0 duplicates, 0 unexpected, and the dead letters add up to the bad messages sent.

**Why this matters:** "exactly-once" is the most over-claimed phrase in data engineering. You **tested** it against duplicates, late data, bad data and a hard crash, and **verified** it against an independent manifest.

**Check:** the final `verify` says `PASS`.
