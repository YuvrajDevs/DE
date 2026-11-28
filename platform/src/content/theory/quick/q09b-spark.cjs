const { T } = require('../_t.cjs');

module.exports = {
  sss: T(`
    > **In one line:** **Structured Streaming** treats a stream as an **unbounded, growing table**: write the same DataFrame/SQL as batch and Spark runs it **incrementally** (usually micro-batches) with **checkpointing, event-time windows, watermarks and exactly-once sinks**.

    | Piece | What | Options |
    |---|---|---|
    | Source | Where data comes from | Kafka, Event Hubs, files/Auto Loader, Delta, rate (testing) |
    | Trigger | When a micro-batch runs | Default (next as soon as previous ends), «processingTime='1 minute'», «availableNow=True» (process everything available in bounded batches, then stop: incremental batch on a schedule, cheap and simple), continuous (experimental, rare); Databricks **real-time mode** for sub-second |
    | Output mode | What's written | append (final rows), update (changed rows), complete (whole result) |
    | Checkpoint | Offsets log (planned batch), commits log (finished), state snapshots/deltas, metadata (query id) | «checkpointLocation» per query, **never shared**, never deleted to "fix" things without understanding replay |
    | Sink | Destination | Delta (exactly-once), Kafka, files, «foreachBatch» (any batch writer, e.g. MERGE) |
    | Watermark | Allowed lateness | «withWatermark("event_ts","10 minutes")» |
    | State | Kept across batches | Aggregations, dedupe, stream-stream joins, flatMapGroupsWithState/transformWithState |

    «««python
    (readings
      .withWatermark("ts", "10 minutes")
      .groupBy(F.window("ts", "5 minutes"), "engine_id")
      .agg(F.avg("temperature_c").alias("avg_temp")))
    »»»
    Each 5-minute window per engine stays in state until the watermark (max event time − 10 min) passes its end, then is emitted (append) and dropped; older records are dropped; **without a watermark state grows forever**.

    **Patterns:** bronze ingestion (Kafka → parse → append Delta + checkpoint); silver upserts (**foreachBatch + MERGE**, dedupe per key within the batch first, idempotent per batchId); stream-static joins (Delta dimension re-read each batch); stream-stream joins (watermarks on both sides + time-range condition); dedupe («dropDuplicatesWithinWatermark("event_id")»); incremental batch («availableNow» from a scheduler: streaming semantics at batch cost).

    **Changing a running query:** safe = filters/projections that don't touch state, sink options; unsafe = grouping keys, aggregations, stateful operators, output mode, sometimes source topics → plan as new query + backfill.

    **Monitoring:** «lastProgress» / StreamingQueryListener / Streaming UI: input vs processed rows/s, batch duration, state rows and memory, watermark, «numRowsDroppedByWatermark», Kafka lag. Alert when processing < input for N batches or batch duration > trigger.

    **What goes wrong:** incompatible query changes; shared checkpoints corrupt both; small files from frequent triggers (OPTIMIZE, longer triggers, auto-optimize); non-idempotent foreachBatch duplicates on retry; state explosion from high-cardinality keys without watermarks; Kafka retention shorter than downtime.

    **Exactly-once in practice (Turbofan):** Kafka offsets in the checkpoint, deterministic transforms, Delta sink idempotent by batch id, MERGE in foreachBatch for stateful gold, watermark dedupe for producer duplicates, proven by a crash test.

    **Interview:** how it's exactly-once; watermarks and output modes; upserting a stream into Delta (foreachBatch + MERGE, deduped); why availableNow.
  `),

  joinstrat: T(`
    > **In one line:** five physical strategies; for equi-joins the real decision is **broadcast** (small side to every executor, big side not shuffled) vs **shuffle** (both sides repartitioned by key; sort-merge by default). Most Spark wins come from getting this right and fixing the skew a shuffle exposes.

    | Strategy | Needs | Shuffle | Memory risk | Picked when |
    |---|---|---|---|---|
    | **Broadcast hash (BHJ)** | Equi-join, one side small | None for big side | Small side must fit in the driver (collected first) and every executor | Estimate < «autoBroadcastJoinThreshold» (10 MB), a «broadcast» hint, or AQE at runtime |
    | **Sort-merge (SMJ)** | Equi-join, sortable keys | Both | Low (sort spills) | Default large/large |
    | **Shuffle hash (SHJ)** | Equi-join | Both | Build side per partition must fit | «shuffle_hash» hint, «preferSortMergeJoin=false», AQE with small partitions |
    | **Broadcast nested loop (BNLJ)** | Any condition (non-equi, OR) | None | O(n·m) compares | Non-equi with a small side |
    | **Cartesian** | Any | Both | n·m output rows | Non-equi with no small side, or explicit cross join |
    **Outer-join limit:** the **preserved** side can't be broadcast (LEFT JOIN → only the right side; FULL OUTER → no broadcast).

    **See which you got:** «explain()» or the SQL tab: «BroadcastHashJoin … BuildRight», «SortMergeJoin» after «Exchange hashpartitioning(key, N)» + «Sort» on both sides, «BroadcastNestedLoopJoin». With AQE check the **final** plan («isFinalPlan=true»).

    ## Making joins cheaper
    1. **Broadcast the small side** («F.broadcast(dim)», «/*+ BROADCAST(d) */»): typically tens to a few hundred MB. Raise the threshold (e.g. 100-200 MB) only with driver/executor memory to match; too big → driver OOM or «spark.sql.broadcastTimeout». Broadcasting an expensive query's result runs it first: cache if reused.
    2. **Shrink first:** filter, select columns, aggregate a big child to the join grain.
    3. **Same partitioning both sides** (prior repartition, or bucketed tables with matching buckets) skips the shuffle.
    4. **Fix skew:** AQE skew join, salting.
    5. **Avoid accidental cartesians:** a condition referencing only one side, or an OR across columns → BNLJ/cartesian; rewrite ORs as a UNION of two equi-joins.
    6. **NULL keys** all hash to one SMJ partition → filter them out, union back if the join type keeps them.

    **Bucketing:** «df.write.bucketBy(64,'engine_id').sortBy('engine_id').saveAsTable(...)» pre-partitions on write so joins/aggregations with a same-bucketed table skip the shuffle. Hive/Spark tables only; **Delta doesn't use Spark bucketing** (it uses Z-order/liquid clustering). Worth it only for repeated big-big joins on a stable key.

    **Estimates:** stats drive choices; file tables without stats may look huge (no broadcast) or tiny after an unpredictable filter; AQE fixes many from real shuffle sizes. Streaming: stream-static joins broadcast the static side; stream-stream joins need watermarks.

    **Interview:** 2 TB fact + 50 MB dim (broadcast) vs 2 TB + 1.5 TB (sort-merge, fix skew); threshold and when to change it; why LEFT JOIN's left side can't be broadcast; why a join became a CartesianProduct.
  `),

  aqe: T(`
    > **In one line:** **AQE** (default since Spark 3.2) re-optimises a query **while it runs** from the real sizes of completed shuffle stages: it **coalesces** small shuffle partitions, **switches** sort-merge → broadcast when a side is small, and **splits skewed join partitions**.

    **Why:** the static optimiser plans before reading data; estimates after filters, UDFs, joins and aggregations can be off by orders of magnitude, and «shuffle.partitions = 200» is one number for every shuffle (too many tiny tasks for small stages, spills for huge ones). AQE waits for each **query stage** (shuffle) to finish, reads its statistics, and re-plans the rest.

    | Feature | Does | Configs (defaults) |
    |---|---|---|
    | Coalesce partitions | Merge adjacent small post-shuffle partitions toward a target | «coalescePartitions.enabled» (true), «advisoryPartitionSizeInBytes» (64 MB), «coalescePartitions.initialPartitionNum» |
    | Switch to broadcast | Small actual shuffle output → SMJ becomes BHJ (other side read locally) | «adaptive.autoBroadcastJoinThreshold» |
    | Skew join | Split a huge partition, duplicate the matching one | «skewJoin.enabled» (true), «skewedPartitionFactor» (5), «skewedPartitionThresholdInBytes» (256 MB): skewed = bigger than **both** factor × median and the threshold |
    | Shuffled hash join | Use SHJ when partitions are small | «maxShuffledHashJoinLocalMapThreshold» |
    | Empty relation propagation | Drop joins/aggs over empty results | Automatic |

    ## Consequences
    - Set a **high** initial «shuffle.partitions» (a few thousand for big jobs) and let AQE coalesce, instead of hand-tuning.
    - «explain()» before running shows the **initial** plan; the UI shows the final one («isFinalPlan=true», «AQEShuffleRead», "skew" on joins).
    - **Limits:** no fix for skew in **aggregations or windows** (joins only → salting/two-stage aggregation); no help for the **first** stage (file reads, no shuffle yet); can't undo decisions without a shuffle boundary; can't save a single key bigger than an executor can hold.
    - **Streaming:** stateful operators need a fixed partition count; the state store layout is tied to «shuffle.partitions» at the checkpoint's first run, so you can't change it for an existing query.

    **Interview:** what AQE changes; does it fix groupBy skew (no); why shuffle.partitions is fixed for a streaming query.
  `),

  partsize: T(`
    > **In one line:** partition counts/sizes (memory) and file sizes (storage) decide parallelism, memory pressure and read speed. Aim for **~100-200 MB per task in memory**, **~128 MB-1 GB per file**, no **thousands of tiny files**, and no partition holding most of the data.

    | "Partition" | Controlled by | Default |
    |---|---|---|
    | Read splits | «spark.sql.files.maxPartitionBytes» (+ openCostInBytes); Kafka partitions; JDBC numPartitions | 128 MB |
    | Shuffle partitions | «spark.sql.shuffle.partitions», AQE, «repartition(n)» | 200 |
    | Output files | Writing tasks × table partitions each touches; «repartition», «coalesce», «maxRecordsPerFile», Delta optimized writes/OPTIMIZE | One file per task per partition value |

    **Rules:** tasks ≈ **2-4× total cores** (1,000 cores and 40 tasks wastes 96%); too few/big → spill, GC, OOM; too many/small → ~tens of ms overhead per task, tiny files, driver pressure. Shuffle partitions ≈ shuffle size ÷ target (500 GB ÷ 200 MB ≈ 2,500); with AQE set high and let it coalesce.

    | | repartition(n[, cols]) | coalesce(n) |
    |---|---|---|
    | Shuffle | Yes, full | No |
    | Increase? | Yes | No |
    | Balance | Even | Can be uneven |
    | Danger | Costs a shuffle | «coalesce(1)» collapses the **upstream computation** into one task too |
    - «repartition('event_date')» before «write.partitionBy('event_date')» → one task and **one file per date** (good), but a huge date = one task (skew) → «repartition(n,'event_date')» with a salt, or «maxRecordsPerFile».
    - One output file: «coalesce(1)» if the input is already small; «repartition(1)» after an expensive upstream so that still runs in parallel.

    ## Small files
    **Causes:** streaming micro-batches, many tasks × many partition values (partitionBy a high-cardinality column like engine_id, or hour × plant), small frequent appends, over-partitioned shuffles. **Costs:** a metadata entry each (S3/ADLS listing, metastore, Delta log), open/close and footer read; 2 million 50 KB files = mostly overhead; HDFS NameNode memory; slow planning. **Fixes:**
    - Partition by **low-cardinality** columns only (date, maybe region; ≥ ~1 GB per value). Never by engine_id, customer_id or timestamp.
    - Repartition by the partition column before writing; Delta **optimized writes / auto compaction**.
    - Compaction: Delta «OPTIMIZE» (~1 GB bin-packing), Iceberg «rewrite_data_files», Hive partition rewrites.
    - Streaming: longer triggers where latency allows + auto compaction.
    - Liquid clustering / Z-order instead of fine partitioning for selective filters.

    **Pruning vs skipping:** **partition pruning** lists only matching directories (filter on the partition column itself); **data skipping** uses per-file min/max (Delta: first 32 columns by default) and only works when values are **clustered** (Z-order, liquid clustering, sorted writes); random layout makes every file's range cover everything.

    **Interview:** repartition vs coalesce and when coalesce(1) hurts; a table with 3 million files; partition telemetry by engine_id? (no: date partitions + cluster by engine_id); shuffle partitions for 1 TB.
  `),

  sparkmem: T(`
    > **In one line:** executor memory = **execution** (shuffles, joins, sorts, aggregations) + **storage** (cache, broadcasts) in one unified pool, plus **overhead** outside the heap (Python workers, network buffers, Arrow). Too little execution memory → **spill** (slow, survives); something that can't spill or a container over its limit → **OOM** or **killed**. Which one tells you the fix.

    «««text
    container = spark.executor.memory (heap) + spark.executor.memoryOverhead (+ pyspark.memory / off-heap)
    heap: reserved 300 MB
          unified pool = (heap - 300 MB) x spark.memory.fraction (0.6)
             storage (cache, broadcast) <-> execution (shuffle, sort, hash tables, aggregation)
             borrow from each other; execution can evict cache down to storageFraction (0.5)
          user memory (remaining 40%): your objects, UDF structures, metadata
    overhead: max(384 MB, 10% of executor memory): Python workers, netty buffers, thread stacks
    »»»
    Each running task (one per core) gets roughly pool ÷ active tasks: **more cores per executor = less memory per task**.

    **Spill:** a full sort/aggregation buffer writes sorted runs to local disk and merges later (UI: Spill Memory/Disk). A symptom of partitions too big for per-task memory → more partitions, fewer columns, fix skew, or more memory per task (fewer cores per executor).

    | Symptom | Likely cause | Fix |
    |---|---|---|
    | **Driver** OOM / crash | «collect()», «toPandas()», huge broadcast built on the driver, very many tasks/files, big «show(n)» | Aggregate/limit first, write to storage, lower broadcast threshold, compact files; driver memory last |
    | Executor heap OOM in join/agg | Skew, too-large broadcast, huge rows (big arrays/strings), «collect_list» on a hot key | AQE/salting, stop broadcasting, more partitions, bound collect_list |
    | **Container killed** (exit 137, "killed by external signal", "physical memory") | **Overhead** exhausted: Python UDF workers, pandas UDF batches, Arrow buffers, off-heap | Raise «memoryOverhead», lower «spark.sql.execution.arrow.maxRecordsPerBatch», replace Python UDFs with built-ins |
    | GC overhead / long pauses | Heap full of objects, big partitions, over-caching | Smaller partitions, cache less (serialized/disk), fewer cores per executor |
    | «FetchFailedException» / lost executors in shuffle | An executor died (often OOM) while others fetched its files | Fix the OOM; external shuffle service/decommissioning on autoscaling |

    **Sizing:** **4-5 cores per executor**, 4-8 GB heap per core; huge executors (30+ cores, 100+ GB) suffer GC and storage-client contention; 1-core executors waste overhead and lose broadcast sharing; leave headroom per node. Databricks node types: memory-optimised (heavy joins/caching), compute-optimised (CPU transforms), storage-optimised local SSD (disk cache, spill-heavy shuffles); Photon changes the profile.

    **Interview:** driver vs executor OOM; container killed only with a Python UDF (overhead); what spill is and whether it's bad (symptom, not fatal); sizing a 200-core cluster (~40-50 executors × 4-5 cores).
  `),

  udfs: T(`
    > **In one line:** **built-in functions** run in the JVM, are visible to the optimiser and code-generated: always first. **Python UDFs** ship every row JVM → Python → JVM with a per-row Python call: often 10-100× slower and opaque. **pandas UDFs** move Arrow batches and run vectorised pandas/NumPy: much faster when you truly need Python.

    **Why Python UDFs are slow:** (1) rows serialised UnsafeRow → Python (pickle/Arrow) and back; (2) the function runs once per row in an interpreter; (3) the optimiser can't see inside: no pushdown through it, no constant folding, unknown selectivity (bad join estimates), breaks whole-stage codegen; (4) Python worker memory counts against **overhead** (container kills).

    ## Ladder of choices
    1. **Built-ins:** «F.when», «regexp_extract», «from_json», array «transform»/«filter»/«aggregate», «F.expr("…SQL…")», date functions, «sha2», windows. Covers most "I need a UDF" cases.
    2. **SQL higher-order functions** on arrays/maps instead of explode-and-regroup.
    3. **pandas UDF** («@pandas_udf('double')» Series → Series, grouped «applyInPandas») for vectorisable logic: ML scoring, scientific functions, parsing with a Python library.
    4. **Arrow-optimised Python UDF** (3.5+ «useArrow=True»): middle ground.
    5. **Scala/Java UDF:** custom and fast (JVM), still opaque.
    6. Row-at-a-time Python UDF: last resort, small data.

    ## Correctness traps
    - **NULLs** arrive as «None»; unhandled → task fails on the executor.
    - Return value not matching the declared type can silently give NULLs.
    - **Non-deterministic UDFs** (random, now(), external APIs) may run more than once per row or on retry → «asNondeterministic()», never for keys.
    - **External calls per row** = self-inflicted DDoS with no retry/rate control → batch per partition («mapPartitions»/«mapInPandas») or move enrichment out of Spark.
    - Grouped pandas UDFs load a **whole group** into one Python process: a hot key = OOM.

    **Interview:** why avoid Python UDFs and alternatives; pandas UDF vs regular UDF; scoring a model on 2 billion rows (pandas UDF / «mapInPandas» with the model loaded once per partition, or the platform's batch inference).
  `),

  sparkui: T(`
    > **In one line:** debug from evidence: **Jobs → Stages → Tasks**, the **SQL** tab's plan with metrics, and **Executors**. Always ask: *which stage is slow, is time spread evenly across tasks, how much is read/shuffled/spilled, and which operator caused it?*

    | Tab | Look at |
    |---|---|
    | Jobs | Which action did work; failures; durations |
    | Stages | Duration, input, shuffle read/write, spill; **task summary** (min/25th/median/75th/max of duration, input, shuffle read, GC) |
    | SQL / DataFrame | Plan with rows output per operator, files read/pruned per scan, join type, row explosions, AQE notes |
    | Executors | Failed tasks, GC, storage memory, shuffle; lost executors |
    | Storage | Cached data; "partially cached" = didn't fit |
    | Environment | Effective configs (shuffle.partitions, AQE, timezone) |
    | Structured Streaming | Input vs processing rate, batch duration, state rows, watermark |

    | Task-summary pattern | Diagnosis |
    |---|---|
    | Max ≫ median duration and shuffle read | **Skew** |
    | All tasks slow and spilling | Partitions too big / too few |
    | Thousands of few-ms tasks | Too many tiny partitions/files |
    | GC > 10% of task time | Memory pressure (big partitions, over-caching, huge objects) |
    | Long scheduler delay / deserialisation | Driver overloaded, huge closures, too many tasks |
    | A stage reads far more than expected | Missing pruning/pushdown, «SELECT *», wrong filter |
    | Stage re-executed | Lost executor (preemption/OOM), FetchFailed, evicted cache |

    ## Method
    1. Longest stage → map to the plan (stage IDs in SQL tab).
    2. Volumes vs expectations ("should read 1 day, reads 400").
    3. Task distribution (skew, stragglers).
    4. Spill and GC.
    5. Rows per operator: a join with output ≫ input = fan-out.
    6. Hypothesis → change **one** thing → compare runtime and metrics → record it.

    **«explain('formatted')»** (bottom-up): «FileScan parquet … PartitionFilters / PushedFilters / ReadSchema» (pruning, pushdown, columns); «Exchange» (shuffle); «BroadcastExchange»; «HashAggregate» pairs (partial + final); «Window»; «Sort»; «WholeStageCodegen (n)»; «BatchEvalPython»/«ArrowEvalPython» (Python UDFs).

    **Outside the UI:** driver/executor logs (stack traces, OOM, "Container killed"); cluster metrics (idle CPUs = too little parallelism; maxed network = shuffle-bound); Delta «DESCRIBE HISTORY» operation metrics (files added/removed, rows, time) to see write behaviour over time (Turbofan found its bottleneck from commit history).

    **Interview:** 20 minutes became 3 hours (compare stages/volumes/task distribution vs a good run: data growth, skew, lost pruning, small files, plan change); spotting skew in the UI; verifying partition pruning (PartitionFilters, files pruned).
  `),

  delta: T(`
    > **In one line:** a Delta table = **Parquet files + a transaction log** («_delta_log/») of ordered JSON commits. A file belongs to the table only if a commit **added** it and no later commit **removed** it. From that come ACID with **optimistic concurrency**, **time travel**, **schema enforcement**, **MERGE/UPDATE/DELETE** on immutable files, **change data feed**, and chores you must schedule (**OPTIMIZE**, **VACUUM**).

    **The log:** «00000000000000000042.json» holds actions: «add» (path, partition values, size, **min/max/null-count stats**), «remove», «metaData» (schema, partitioning, properties), «protocol» (reader/writer versions, table features), «commitInfo» (operation, metrics, user), «txn» (app transaction ids for idempotent writes). Every 10 commits a **checkpoint** Parquet summarises state. Reading = latest checkpoint + later commits → live files → read with data skipping.

    ## Writes and optimistic concurrency
    1. Read version N; write new (invisible) Parquet files.
    2. Atomically create commit N+1 (put-if-absent; on S3 that historically needed a DynamoDB-backed log store for multi-cluster writes, now S3 conditional writes).
    3. If someone committed N+1 first, check for **conflict** with what you read/wrote. None → retry as N+2. Conflict → «ConcurrentAppendException», «ConcurrentDeleteReadException», «ConcurrentDeleteDeleteException», «MetadataChangedException».
    - Isolation: **WriteSerializable** (default) or Serializable.
    - Fewer conflicts: concurrent writers on **disjoint partitions** with the partition predicate in their conditions (MERGE ON includes «t.date = …»), **row-level concurrency** (Databricks, with deletion vectors), or serialise writers.

    **UPDATE/DELETE/MERGE:** **copy-on-write** rewrites touched files (cost ∝ their size). **Deletion vectors** (merge-on-read) write a small bitmap marking deleted rows instead of rewriting a 1 GB file for 3 rows; readers filter; OPTIMIZE/purge rewrites later (cheap writes, slightly more read work). MERGE prunes files by stats, so clustering on the key makes it touch few files.

    **Schema:** **enforcement** rejects mismatched writes by default; **evolution** via «mergeSchema» (append) / «schema.autoMerge.enabled» (MERGE); type widening (int → long) in newer versions; renames/drops need **column mapping**. **Constraints** («NOT NULL», «CHECK (claim_amount >= 0)») are a contract inside the table. **Generated columns** («event_date GENERATED ALWAYS AS (CAST(event_ts AS DATE))») let event_ts filters prune event_date partitions.

    ## Time travel, VACUUM, retention
    - «VERSION AS OF 41» / «TIMESTAMP AS OF '…'»; «RESTORE TABLE … TO VERSION AS OF 41» after a bad load.
    - **VACUUM** deletes unreferenced files older than retention (**7 days** default); older versions then can't be read. Never go below your longest reader/stream lag (Delta blocks < 7 days unless you disable the check, which can corrupt active readers).
    - «logRetentionDuration» (30 days) bounds the log.
    - **Right to erasure** (GDPR/DPDP): DELETE isn't physical until VACUUM removes old files (and deletion vectors are purged).

    **Layout:** «OPTIMIZE» bin-packs to ~1 GB; «ZORDER BY (engine_id, ts)» co-locates values so stats skip more (rewrites a region); **liquid clustering** («CLUSTER BY») replaces partitioning + Z-order for most new Databricks tables (incremental, keys changeable, no over-partitioning); optimized writes/auto compaction at write time. Stats cover the first 32 columns: put filter columns early or set «dataSkippingNumIndexedCols» / «dataSkippingStatsColumns».

    ## CDF and streaming
    - «delta.enableChangeDataFeed = true» records row changes («_change_type»: insert, update_preimage, update_postimage, delete) so silver → gold processes **only changes**.
    - As a **streaming source**, Delta reads new commits; upstream UPDATE/DELETE breaks it unless «skipChangeCommits» or you read the CDF.
    - As a **streaming sink**, Delta records stream id + batch id («txn») and skips replayed batches: the exactly-once sink. In «foreachBatch» use «txnAppId»/«txnVersion» for the same idempotency (or MERGE).

    **Delta vs Iceberg vs Hudi:** Delta = Databricks-native, log-based, deepest Spark integration; Iceberg = snapshot/manifest trees, engine-neutral (Snowflake, Trino, Flink), hidden partitioning and partition evolution; Hudi = record-level indexes, merge-on-read for upsert-heavy streaming. Delta UniForm and Iceberg REST catalogs blur the lines.

    **Interview:** ACID on object storage (atomic log commits + optimistic concurrency); two jobs writing one table (conflict check, retry or exception; disjoint partitions); VACUUM and its risks; exactly-once streaming sink (txn batch ids); Z-order vs partitioning vs liquid clustering.
  `),
};
