const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match, bug } = require('./_t.cjs');

module.exports = {
  // ================================================================== Join strategies
  joinstrat: T(`
    > **In one line:** Spark has five physical join strategies. For equi-joins the real decision is **broadcast** (ship the small side to every executor, no shuffle of the big side) vs **shuffle** (repartition both sides by the key: sort-merge by default). Most Spark performance wins in interviews and in production come from getting this decision right and from fixing the skew a shuffle exposes.

    ## The strategies
    | Strategy | Needs | Shuffle | Memory risk | When Spark picks it |
    |---|---|---|---|---|
    | **Broadcast hash join (BHJ)** | Equi-join, one side small | None for the big side | Small side must fit in driver (collect) and in each executor's memory | Estimated size < «spark.sql.autoBroadcastJoinThreshold» (10 MB default), a «broadcast» hint, or AQE at runtime |
    | **Shuffle sort-merge join (SMJ)** | Equi-join, sortable keys | Both sides | Low: sort spills to disk | Default for large/large |
    | **Shuffle hash join (SHJ)** | Equi-join | Both sides | Build side per partition must fit | Hint «shuffle_hash», or «preferSortMergeJoin=false», or AQE when partitions are small |
    | **Broadcast nested loop join (BNLJ)** | Any condition (non-equi, OR) | None | Broadcast side must fit; O(n·m) compares | Non-equi join with one small side |
    | **Cartesian product** | Any | Both | Output n·m rows | Non-equi join with no small side, or explicit cross join |

    Join-type limits: a broadcast cannot be the **preserved** side of an outer join (for «left join», only the right side can be broadcast; for «full outer», broadcast is not possible).

    ## Reading which one you got
    «df.explain()» or the SQL tab of the Spark UI: «BroadcastHashJoin … BuildRight», «SortMergeJoin» preceded by «Exchange hashpartitioning(key, N)» and «Sort» on both sides, «BroadcastNestedLoopJoin». With AQE on, look at the **final plan** («isFinalPlan=true» / the UI after the query finished), because the initial plan may change.

    ## Making a join cheaper
    1. **Broadcast the small side** («F.broadcast(dim)» or «/*+ BROADCAST(d) */»). Typical: a dimension of tens to a few hundred MB. Raise the threshold deliberately (e.g. 100-200 MB) only with executor and driver memory to match: a broadcast is collected to the driver first, then sent to every executor, and a too-large broadcast fails with driver OOM or timeouts («spark.sql.broadcastTimeout»).
    2. **Shrink before joining:** filter and select columns first; aggregate a big child table to the join grain before joining (fewer rows shuffled).
    3. **Same partitioning on both sides:** if both are already hash-partitioned by the key with the same number of partitions (e.g. after a previous repartition, or **bucketed tables** with matching buckets), Spark can skip the shuffle.
    4. **Fix skew:** AQE skew join, or salting (see Data skew).
    5. **Avoid accidental cartesian products:** a join condition referencing only one side, or an OR condition across columns, turns into BNLJ/cartesian. Rewrite ORs as a UNION of two equi-joins.
    6. **NULL keys:** many NULL keys all hash to one partition in SMJ. Filter them out and union them back when the join type requires keeping them.

    ## Bucketing (briefly)
    «df.write.bucketBy(64, 'engine_id').sortBy('engine_id').saveAsTable(...)» pre-partitions data on write so later joins/aggregations on «engine_id» against another table bucketed the same way skip the shuffle. Works for Hive-format/Spark tables; Delta does not use Spark bucketing (it relies on Z-order/liquid clustering for data skipping instead). Useful for repeated big-big joins on a stable key; overkill otherwise.

    ## Edge cases
    - Statistics drive the estimate: a table read from files without stats may be estimated huge (no broadcast) or tiny after a selective filter the optimiser cannot estimate. AQE fixes many of these at runtime from real shuffle sizes.
    - Broadcasting a DataFrame computed by an expensive query runs that query on the driver side first; cache it if reused.
    - In Structured Streaming, stream-static joins broadcast the static side; stream-stream joins need watermarks (see Stateful streaming).

    ## How interviewers test this
    - "How does Spark join a 2 TB fact with a 50 MB dimension? A 2 TB with a 1.5 TB?"
    - "What is the broadcast threshold and when would you change it?"
    - "Why can't the left side of a LEFT JOIN be broadcast?"
    - "Your join turned into a CartesianProduct. Why?"
  `, {
    check: [
      mcq('2 TB fact joined to a 40 MB dimension on dealer_id. Best strategy?', ['Sort-merge join', 'Broadcast hash join of the dimension', 'Cartesian product', 'Collect both to the driver'], 1, 'No shuffle of the 2 TB side.'),
      mcq('«facts LEFT JOIN dim»: which side can be broadcast?', ['facts (left)', 'dim (right)', 'Either', 'Neither'], 1, 'The preserved side cannot be the broadcast (build) side.'),
      mcq('A join on «a.x = b.x OR a.y = b.y» between two big tables is extremely slow. The plan shows BroadcastNestedLoopJoin / CartesianProduct. Fix?', ['More executors', 'Rewrite as two equi-joins unioned (and deduplicated if needed)', 'Raise the broadcast threshold', 'Cache both'], 1, 'OR across columns is not an equi-join, so no hash/merge join is possible.'),
      tf('Raising autoBroadcastJoinThreshold to 2 GB is a safe general fix for slow joins.', false, 'Broadcasts go through the driver and every executor; large ones cause OOMs and timeouts.'),
      mcq('In a physical plan, «Exchange hashpartitioning(dealer_id, 200)» on both join inputs followed by «Sort» indicates…', ['Broadcast hash join', 'Shuffle sort-merge join', 'Nested loop', 'Cached join'], 1, 'Both sides shuffled by key, then sorted and merged.'),
    ],
    scenarios: [
      scenario('The join that got 10× slower after a filter change', `
        A daily job joins «claims» (900 GB) to «dealers_enriched» (built from three tables, 30 MB after a filter). It used to run in 8 minutes with a BroadcastHashJoin. Someone changed the dealers filter to a Python UDF; now it is a SortMergeJoin and takes 80 minutes.`, [
        ['Why did the strategy change?', [
          ['The optimiser cannot estimate the selectivity of a UDF filter, so it estimates the dealers side as large and picks sort-merge', true, 'Opaque UDFs hide size information.'],
          ['UDFs disable joins', false, 'They do not.'],
          ['The dealers table grew', false, 'It is still 30 MB.'],
        ]],
        ['Best fix?', [
          ['Replace the UDF with built-in expressions (or add an explicit broadcast hint), and keep AQE on so a small runtime size is converted to broadcast', true, 'Restores the estimate or forces the right plan.'],
          ['Double the cluster', false, 'Pays for a shuffle you do not need.'],
          ['Repartition claims to 2,000 partitions', false, 'Still shuffles 900 GB.'],
        ]],
      ], 'Check the physical plan after any logic change, not just the result.'),
    ],
    interview: [
      talk('Explain how Spark executes a join between two large tables, and what you would do if one task takes 40 minutes while the others take 30 seconds.', `
        - **Execution:** both sides are shuffled by the join key into N partitions («spark.sql.shuffle.partitions» or AQE-chosen); each task sorts its partition of both sides and merges them (sort-merge join).
        - **One slow task = skew:** one key (or NULL) holds a large share of rows, so one partition is huge. Confirm in the Spark UI: task duration and shuffle read size max ≫ median for that stage.
        - **Fixes in order:** filter NULL/garbage keys; enable/tune **AQE skew join** («skewJoin.enabled», «skewedPartitionFactor», «skewedPartitionThresholdInBytes») which splits the big partition and replicates the matching side; if the other side is small, broadcast it; otherwise **salt** the hot keys (add a random suffix 0..k on the big side, replicate the small side k times) and aggregate back.
        - Then measure again: the stage's max task time should approach the median.`),
    ],
    hands: [
      spark({ q: `Join «claims» to «dealers» with an explicit **broadcast** of dealers and a **left** join (claims are preserved), keep only claims whose dealer region is not West **or** whose dealer is unknown (no match), and return «claim_id, dealer_id, region» sorted by «claim_id». Call «result.explain()».`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
result = (claims.join(F.broadcast(dealers), "dealer_id", "left")
  .filter(F.col("region").isNull() | (F.col("region") != "West"))
  .select("claim_id", "dealer_id", "region")
  .orderBy("claim_id"))
result.explain()`, hint: 'F.broadcast(dealers) on the right side of a left join; isNull() | (!= "West").' }),
    ],
  }),

  // ================================================================== AQE
  aqe: T(`
    > **In one line:** **Adaptive Query Execution** (on by default since Spark 3.2) re-optimises a query **while it runs**, using the real sizes of completed shuffle stages instead of up-front estimates. It does three big things: **coalesces** too many small shuffle partitions, **switches join strategies** (sort-merge → broadcast) when a side turns out small, and **splits skewed partitions** in joins.

    ## Why it exists
    The static optimiser plans before reading data. Estimates after filters, UDFs, joins and aggregations are often wrong by orders of magnitude, and «spark.sql.shuffle.partitions = 200» is one number for every shuffle of every query, too many for small stages (thousands of tiny tasks) and too few for huge ones (spills). AQE waits for each shuffle (a **query stage**) to finish, looks at the actual output statistics, and re-plans the rest.

    ## The features and their knobs
    | Feature | What it does | Key configs (defaults) |
    |---|---|---|
    | **Coalesce shuffle partitions** | Merges adjacent small post-shuffle partitions toward a target size | «spark.sql.adaptive.coalescePartitions.enabled» (true), «advisoryPartitionSizeInBytes» (64 MB), «coalescePartitions.initialPartitionNum» |
    | **Switch to broadcast join** | If one side's actual shuffle output is small, convert SMJ → BHJ (and read the other side's shuffle locally) | «spark.sql.adaptive.autoBroadcastJoinThreshold» (defaults to the normal threshold) |
    | **Skew join** | Splits a partition much larger than the median into sub-partitions and duplicates the matching partition of the other side | «skewJoin.enabled» (true), «skewedPartitionFactor» (5), «skewedPartitionThresholdInBytes» (256 MB) |
    | **Shuffled hash join conversion** | Uses SHJ when partitions are small enough | «maxShuffledHashJoinLocalMapThreshold» |
    | **Empty relation propagation** | Removes joins/aggregations over empty results | automatic |
    A partition is treated as skewed when it is larger than **both** factor × median **and** the byte threshold.

    ## Practical consequences
    - With AQE you can set a **higher** initial «shuffle.partitions» (e.g. a few thousand for big jobs) and let AQE coalesce down, instead of hand-tuning per job.
    - The plan you see before running («explain()») is the **initial** plan; the Spark UI shows the adaptive final plan («AdaptiveSparkPlan isFinalPlan=true»), «AQEShuffleRead» nodes, and "skew" annotations on joins.
    - AQE cannot fix everything: it does not fix skew in **aggregations** or windows (only in joins), does not help the **first** stage (reading files, no shuffle yet), cannot undo a bad decision that does not involve a shuffle boundary, and cannot fix skew where a single key is bigger than an executor can hold (a split still needs each sub-partition to fit).
    - Structured Streaming micro-batches do not get AQE in the same way (stateful operators need a fixed number of partitions: the state store layout is tied to «shuffle.partitions» at the first run of a checkpoint).

    ## How interviewers test this
    - "What is AQE and what does it change?"
    - "Does AQE fix skew in a groupBy?" (No; it targets joins. Use salting/two-stage aggregation.)
    - "Why can't you change shuffle.partitions for an existing streaming query?" (State is partitioned by it; the checkpoint fixes it.)
  `, {
    check: [
      multi('What can AQE do at runtime?', ['Coalesce many small shuffle partitions', 'Convert a sort-merge join to a broadcast join', 'Split skewed join partitions', 'Fix skew in a groupBy aggregation', 'Speed up the initial file scan'], [0, 1, 2], 'AQE works at shuffle boundaries; join skew only.'),
      mcq('When is a partition considered skewed by AQE (defaults)?', ['Bigger than 64 MB', 'Bigger than 5 × the median partition size and bigger than 256 MB', 'Has NULL keys', 'Takes more than 10 minutes'], 1, 'Both conditions must hold.'),
      tf('«df.explain()» before running a query shows the final plan AQE will use.', false, 'It shows the initial plan; the final adaptive plan appears in the UI after execution.'),
      mcq('You set shuffle.partitions = 2000 with AQE on, for a query whose shuffle is only 3 GB. What happens?', ['2000 tiny tasks run', 'AQE coalesces toward ~64 MB partitions, roughly 50 tasks', 'The job fails', 'Spark ignores the shuffle'], 1, 'Coalescing makes a high initial number safe.'),
    ],
  }),

  // ================================================================== Partition sizing and files
  partsize: T(`
    > **In one line:** the number and size of partitions (in memory) and files (on storage) decide parallelism, memory pressure and read speed. Aim for **~100-200 MB per task in memory** and **~128 MB-1 GB per file on storage**, avoid **thousands of tiny files**, and never let one partition hold most of the data.

    ## Three different "partition" numbers
    | Where | Controlled by | Default |
    |---|---|---|
    | **Read partitions** (input splits) | «spark.sql.files.maxPartitionBytes» (and openCostInBytes) for files; number of Kafka partitions; JDBC numPartitions | 128 MB per split |
    | **Shuffle partitions** | «spark.sql.shuffle.partitions», AQE coalescing, «repartition(n)» | 200 |
    | **Output files** | Number of tasks writing × table partitions each task touches; «repartition», «coalesce», «maxRecordsPerFile», Delta optimized writes / OPTIMIZE | One file per task per partition value |

    ## Sizing rules of thumb
    - **Tasks ≈ 2-4× total executor cores** in a stage keeps every core busy and absorbs stragglers. 1,000 cores and 40 tasks wastes 96% of the cluster.
    - **Too few, too big partitions:** spills, long GC, OOM, poor parallelism.
    - **Too many, too small:** scheduling overhead (each task ~tens of ms), many tiny output files, driver pressure tracking tasks.
    - Shuffle partitions ≈ shuffle size / target partition size (e.g. 500 GB / 200 MB ≈ 2,500). With AQE, set high and let it coalesce.

    ## repartition vs coalesce
    | | repartition(n[, cols]) | coalesce(n) |
    |---|---|---|
    | Shuffle | **Yes**, full | **No**, merges existing partitions |
    | Can increase partitions | Yes | No (only decrease) |
    | Result balance | Even (hash or round robin) | Can be uneven |
    | Danger | Costs a shuffle | «coalesce(1)» collapses the **upstream computation** into 1 task too (no shuffle boundary), so the whole job may run on one core |
    - «repartition('event_date')» before «write.partitionBy('event_date')» → one task per date → **one file per date** (good), but if one date is huge, one task writes it (skew). «repartition(n, 'event_date')» with a salt or «maxRecordsPerFile» balances it.
    - To write one file for a small result: «coalesce(1)» is fine when the input is already small; for an expensive upstream, use «repartition(1)» so the upstream still runs in parallel.

    ## The small files problem
    **Causes:** streaming micro-batches (each batch writes files per partition), many write tasks × many partition values («partitionBy» on a high-cardinality column like engine_id or hour × plant), frequent small appends, over-partitioned shuffles.
    **Costs:** each file is a metadata entry (listing S3/ADLS, Hive metastore, Delta log), an open/close and a footer read. A query over 2 million 50 KB files spends most of its time in overhead; NameNode memory in HDFS; slow planning.
    **Fixes:**
    - Partition the table by **low-cardinality** columns only (date, maybe region): rule of thumb ≥ 1 GB of data per partition value. Do **not** partition by engine_id, customer_id or timestamp.
    - Repartition by the table partition column before writing; Delta **optimized writes** / auto compaction.
    - Periodic **compaction**: Delta «OPTIMIZE» (bin-packs to ~1 GB files), Iceberg «rewrite_data_files», Hive: rewrite partitions.
    - For streaming: larger trigger intervals where latency allows, and auto compaction.
    - Liquid clustering / Z-order instead of fine-grained partitioning for selective filters.

    ## Partition pruning vs data skipping
    - **Partition pruning:** the engine lists only directories matching the filter on the partition column. Requires filtering on the partition column itself.
    - **Data skipping:** per-file min/max statistics (Delta collects them on the first 32 columns by default) let the engine skip files within partitions. Effective only when values are **clustered** (Z-order / liquid clustering / sorted writes); random layout means every file's min/max covers everything.

    ## How interviewers test this
    - "Difference between repartition and coalesce? When does coalesce(1) hurt?"
    - "Your table has 3 million files. Why and how do you fix it?"
    - "Would you partition the telemetry table by engine_id?" (No: high cardinality → tiny files. Partition by date, cluster by engine_id.)
    - "How many shuffle partitions for a 1 TB shuffle?"
  `, {
    check: [
      mcq('«df.filter(...).join(...).coalesce(1).write...» takes hours. Why?', ['coalesce shuffles', 'coalesce(1) removes parallelism from the upstream stage too (no shuffle boundary), so the whole computation runs in one task', 'Writing is slow', 'The join is broadcast'], 1, 'Use repartition(1) if a single output file is truly required.'),
      mcq('Telemetry from 50,000 engines, 2 TB per day. Best table layout in Delta?', ['partitionBy(engine_id)', 'partitionBy(event_date), cluster/Z-order by engine_id', 'partitionBy(event_ts)', 'No layout at all'], 1, 'Low-cardinality partitions, clustering for selective filters.'),
      mcq('A stage has 40 tasks and the cluster has 400 cores. Effect?', ['Fast', '360 cores idle; increase partitions', 'Out of memory', 'Nothing'], 1, 'Aim for 2-4 tasks per core.'),
      tf('Per-file min/max statistics skip files effectively even when data is randomly ordered.', false, 'Random layout makes every file\'s range cover everything; clustering is needed.'),
      mcq('Default input split size for file reads in Spark SQL?', ['64 MB', '128 MB', '1 GB', '256 KB'], 1, 'spark.sql.files.maxPartitionBytes = 128 MB.'),
    ],
    scenarios: [
      scenario('A table nobody can query any more', `
        A streaming job writes sensor data to Delta every 10 seconds, «partitionBy("plant_id", "event_hour")». After three months, a simple «SELECT COUNT(*) WHERE event_date = …» takes 9 minutes. The table has 4.1 million files averaging 180 KB.`, [
        ['Root cause?', [
          ['Small files: 10-second micro-batches × a high-cardinality partition scheme create a few files per batch per partition', true, 'Metadata and open/read overhead dominates.'],
          ['Delta is slow', false, 'Layout is the problem.'],
          ['COUNT(*) needs a full shuffle', false, 'Delta can even answer counts from stats when files are sane.'],
        ]],
        ['Best set of fixes?', [
          ['Partition by event_date only, enable optimized writes/auto compaction, schedule OPTIMIZE (with clustering by plant_id/engine_id), and consider a longer trigger interval', true, 'Fix the scheme, compact, cluster.'],
          ['Delete old data', false, 'Loses data and does not fix the cause.'],
          ['VACUUM', false, 'Removes unreferenced old files; does not merge current small files.'],
        ]],
      ], 'Partitioning by time at hour grain plus another dimension is a classic small-files generator.'),
    ],
    hands: [
      py({ q: '**Plan shuffle partitions and output files.** Write «plan(shuffle_gb, cores, target_mb=200, file_target_mb=512, partitions_written=1)» returning a dict: «shuffle_partitions» = max(ceil(shuffle_gb × 1024 / target_mb), 2 × cores) rounded **up to a multiple of cores**; «tasks_per_core» = shuffle_partitions / cores; «files_per_partition_value» = max(1, ceil(shuffle_gb × 1024 / partitions_written / file_target_mb)).', starter: 'import math\n\ndef plan(shuffle_gb, cores, target_mb=200, file_target_mb=512, partitions_written=1):\n    pass\n',
        tests: `assert plan(500, 400) == {'shuffle_partitions': 2800, 'tasks_per_core': 7.0, 'files_per_partition_value': 1000}
assert plan(1, 64, partitions_written=30) == {'shuffle_partitions': 128, 'tasks_per_core': 2.0, 'files_per_partition_value': 1}
assert plan(90, 48, partitions_written=3)['files_per_partition_value'] == 60`,
        solution: `import math

def plan(shuffle_gb, cores, target_mb=200, file_target_mb=512, partitions_written=1):
    mb = shuffle_gb * 1024
    n = max(math.ceil(mb / target_mb), 2 * cores)
    n = math.ceil(n / cores) * cores
    return {'shuffle_partitions': n, 'tasks_per_core': n / cores,
            'files_per_partition_value': max(1, math.ceil(mb / partitions_written / file_target_mb))}` }),
    ],
  }),

  // ================================================================== Memory
  sparkmem: T(`
    > **In one line:** an executor's memory is split into **execution** (shuffles, joins, sorts, aggregations) and **storage** (cache, broadcasts), sharing one unified pool, plus **overhead** outside the JVM heap (Python workers, network buffers, Arrow). When a task needs more execution memory than it can get, Spark **spills** to disk (slow but survives); when something cannot spill or the container exceeds its limit, you get an **OOM** or the executor is **killed**. Knowing which one you have tells you the fix.

    ## The executor memory layout
    «««
    container memory = spark.executor.memory (JVM heap) + spark.executor.memoryOverhead (+ pyspark.memory / off-heap)
    heap:
      reserved 300 MB
      unified pool = (heap - 300 MB) × spark.memory.fraction (0.6)
          ├─ storage (cache, broadcast)  ─┐  can borrow from each other;
          └─ execution (shuffle, sort,   ─┘  execution can evict cached blocks
               hash tables, aggregation)     down to storageFraction (0.5)
      user memory (the remaining 40%): your objects, UDF data structures, metadata
    overhead: max(384 MB, 10% of executor memory) by default: Python worker processes, netty buffers, thread stacks
    »»»
    Each concurrently running task (one per core) gets a share of execution memory, roughly pool / active tasks. **More cores per executor = less memory per task.**

    ## Spill
    When a sort or aggregation buffer is full, Spark writes sorted runs to local disk and merges them later. Spark UI shows «Spill (Memory)» and «Spill (Disk)» per stage/task. Spill is a symptom: partitions too big for the per-task memory. Fix by **more partitions** (smaller each), less data per row (select fewer columns), fixing skew, or more memory per task (fewer cores per executor / bigger executors).

    ## Kinds of OOM and their fixes
    | Symptom | Likely cause | Fix |
    |---|---|---|
    | **Driver** «java.lang.OutOfMemoryError» / driver crash | «collect()», «toPandas()», huge broadcast built on the driver, very many tasks/files tracked, large «show(n)» | Do not collect big data; aggregate/limit first; write results to storage; lower broadcast threshold; compact files; more driver memory as last resort |
    | Executor heap OOM in a join/aggregation | Skewed partition, broadcast too large, huge rows (big arrays/strings), «collect_list» per key on a hot key | Fix skew (AQE/salting), stop broadcasting, more partitions, avoid unbounded collect_list |
    | **Container killed by YARN/Kubernetes for exceeding memory limits** ("exit code 137", "killed by external signal", "Container killed … physical memory") | **Overhead** exhausted: Python UDF workers, pandas UDF batches, Arrow buffers, off-heap | Raise «memoryOverhead»; smaller Arrow batch size («spark.sql.execution.arrow.maxRecordsPerBatch»); replace Python UDFs with built-ins |
    | GC overhead limit exceeded / long GC pauses | Heap full of objects, too-large partitions, caching too much | More/smaller partitions, cache less (or serialized/disk levels), fewer cores per executor |
    | «FetchFailedException» / lost executors during shuffle | Executor died (often OOM) while others fetched its shuffle files | Fix the OOM above; external shuffle service / decommissioning on autoscaling clusters |

    ## Executor sizing heuristics
    - Typical: **4-5 cores per executor**, 4-8 GB heap per core; very large executors (30+ cores, 100+ GB) suffer long GC and HDFS/S3 client contention; tiny executors (1 core) waste overhead and lose broadcast sharing.
    - Leave headroom for the OS and overhead on each node.
    - On Databricks you pick **node types**: memory-optimised for heavy joins/caching, compute-optimised for CPU-bound transforms, storage-optimised (local SSD) for delta caching and spill-heavy shuffles; Photon changes the CPU/memory profile.

    ## How interviewers test this
    - "Driver OOM vs executor OOM: causes and fixes?"
    - "Your job fails with 'Container killed by YARN for exceeding memory limits' only when the Python UDF is used. Why?"
    - "What is spill and is it bad?"
    - "How would you size executors for a 200-core cluster?"
  `, {
    check: [
      mcq('A notebook calls «df.toPandas()» on 80 GB and crashes. Where is the OOM?', ['Executors', 'The driver', 'The metastore', 'Kafka'], 1, 'All data is collected into the driver process.'),
      mcq('"Container killed for exceeding memory limits" appears only with a Python UDF. Most relevant fix?', ['More spark.executor.memory heap', 'More memoryOverhead (Python workers live outside the heap), or replace the UDF with built-ins', 'Fewer partitions', 'Disable AQE'], 1, 'Python worker memory counts against overhead.'),
      tf('Spill to disk means the job will fail.', false, 'Spill keeps it alive but slow; it signals partitions too large for per-task memory.'),
      mcq('With the unified memory model, can execution evict cached data?', ['Never', 'Yes, down to the protected storageFraction', 'Only on the driver', 'Only in streaming'], 1, 'Storage can also borrow unused execution memory.'),
      mcq('Doubling cores per executor while keeping executor memory the same…', ['Doubles memory per task', 'Halves execution memory available per concurrent task', 'Has no effect', 'Disables spill'], 1, 'Tasks share the executor pool.'),
    ],
    interview: [
      talk('A Spark job that ran fine for months now fails with executor OOM in one stage. Walk me through your diagnosis.', `
        1. **Which stage and operation?** Spark UI: the failing stage, its operator (join/aggregate/window/collect_list), and the error text (heap OOM vs container killed → overhead).
        2. **Is it one task?** Compare max vs median task input/shuffle read in that stage. One giant task → **skew** (a hot key grew, a NULL key flood, a new big customer).
        3. **Did data grow?** Partition sizes vs per-task memory; spill metrics climbing over recent runs.
        4. **Did the plan change?** A broadcast that now exceeds memory because the "small" table grew; a new UDF.
        5. **Fix the cause:** skew handling (AQE, salting, filter NULL keys), stop broadcasting a grown table, more shuffle partitions, remove collect_list explosions, then resize memory if still needed.
        6. **Prevent:** alert on spill and skew metrics, data-volume tests, and record before/after runtimes.`),
    ],
  }),

  // ================================================================== UDFs
  udfs: T(`
    > **In one line:** **built-in functions** run inside the JVM, are visible to the optimiser and are code-generated: always first choice. **Python UDFs** ship every row from the JVM to a Python worker and back (serialisation + per-row Python calls): often 10-100× slower and opaque to the optimiser. **pandas (vectorised) UDFs** move data in Arrow batches and run vectorised pandas/NumPy code: much faster than row UDFs when you genuinely need Python.

    ## Why Python UDFs are slow
    1. Rows are serialised from JVM (UnsafeRow) to Python (pickled or Arrow) and back.
    2. The Python function runs once per row in an interpreter.
    3. The optimiser cannot see inside: no predicate pushdown through it, no constant folding, unknown selectivity (bad join estimates), and it blocks whole-stage code generation for that part.
    4. Python worker memory counts against executor overhead (container kills).

    ## Ladder of choices
    1. **Built-in functions** («F.when», «F.regexp_extract», «F.from_json», «F.transform» / «F.filter» / «F.aggregate» for arrays, «F.expr("…SQL…")», date functions, «F.sha2», window functions). Most "I need a UDF" cases are covered.
    2. **SQL higher-order functions** for arrays/maps instead of exploding and regrouping.
    3. **pandas UDF** («@pandas_udf('double')» Series → Series, or grouped «applyInPandas» per key) for vectorisable Python logic: ML scoring, scientific functions, complex parsing with a Python library.
    4. **Arrow-optimised Python UDF** (Spark 3.5+ «useArrow=True») as a middle ground.
    5. **Scala/Java UDF** when the logic must be custom and fast (runs in the JVM, still opaque to the optimiser).
    6. Row-at-a-time **Python UDF**: last resort, small data.

    ## Correctness traps
    - **Null handling:** your Python function receives «None»; forgetting it raises on the executor and fails the task.
    - **Return type** must match the declared type; a mismatch can silently give NULLs.
    - **Non-deterministic UDFs** («random», calls to now(), external APIs) may be called more than once per row or re-executed on retry: mark them «asNondeterministic()» and never use them for keys.
    - **Calling external services inside a UDF** (an API per row) is a self-inflicted DDoS with no retries/rate control; batch it per partition with «mapPartitions» or move the enrichment out of Spark.
    - Grouped pandas UDFs (applyInPandas) load each **whole group** into one Python process: a hot key = OOM.

    ## How interviewers test this
    - "Why avoid Python UDFs? What do you use instead?"
    - "Difference between a pandas UDF and a regular UDF?"
    - "You need to call a scoring model per engine on 2 billion rows. How?"
  `, {
    check: [
      mcq('First choice to compute «CASE WHEN temp > 95 THEN "HOT" ELSE "OK"» in PySpark?', ['Python UDF', 'pandas UDF', 'F.when(...).otherwise(...)', 'collect and loop'], 2, 'Built-ins are optimised and code-generated.'),
      multi('Why are row-at-a-time Python UDFs slow?', ['Serialisation between JVM and Python per row', 'Per-row Python function calls', 'The optimiser cannot see inside them', 'They run on the driver only'], [0, 1, 2], 'They run on executors, but in separate Python workers.'),
      tf('A pandas UDF processes data in Arrow batches and runs vectorised code, typically much faster than a row UDF.', true, 'Still slower than built-ins, but the right tool when Python is needed.'),
      mcq('A grouped «applyInPandas» per customer fails with OOM for one customer. Why?', ['Arrow bug', 'Each group is loaded whole into one Python worker; a hot key does not fit', 'Too many groups', 'Wrong return type'], 1, 'Split the group (by date) or aggregate first.'),
    ],
    hands: [
      spark({ q: `Replace a UDF with built-ins. Classify each claim: «"HIGH"» when «claim_amount» ≥ 100000, «"MEDIUM"» when ≥ 20000, else «"LOW"»; NULL amounts become «"UNKNOWN"». Return «claim_id, claim_amount, band» sorted by «claim_id», using only «F.when» chains (no udf).`, starter: `claims = spark.table("claims")\n\nresult = None\n`, solution: `claims = spark.table("claims")
result = (claims.withColumn("band",
    F.when(F.col("claim_amount").isNull(), "UNKNOWN")
     .when(F.col("claim_amount") >= 100000, "HIGH")
     .when(F.col("claim_amount") >= 20000, "MEDIUM")
     .otherwise("LOW"))
  .select("claim_id", "claim_amount", "band")
  .orderBy("claim_id"))`, hint: 'Check NULL first: comparisons with NULL are not TRUE.' }),
    ],
  }),

  // ================================================================== Spark UI
  sparkui: T(`
    > **In one line:** a slow or failing Spark job is debugged from evidence: **Jobs → Stages → Tasks** in the Spark UI, the **SQL/DataFrame** tab's physical plan with metrics, and the **Executors** tab. The questions are always the same: *which stage is slow, is the time spread evenly across tasks, how much is read/shuffled/spilled, and what operator caused it?*

    ## The tabs that matter
    | Tab | Look at |
    |---|---|
    | **Jobs** | Which action triggered work; failed jobs; duration |
    | **Stages** | Per stage: duration, input size, shuffle read/write, spill; the **task summary table** (min/25th/median/75th/max of duration, input, shuffle read, GC time) |
    | **SQL / DataFrame** | Visual physical plan with per-operator metrics: rows output per operator, scan «files read / pruned», join type, «number of output rows» for explosions, AQE annotations |
    | **Executors** | Failed tasks per executor, GC time, storage memory used, shuffle read/write; lost executors |
    | **Storage** | Cached DataFrames: fraction cached, size in memory/disk (an RDD "partially cached" means it did not fit) |
    | **Environment** | The effective configs (verify «shuffle.partitions», AQE, time zone) |
    | **Structured Streaming** | Input rate vs processing rate, batch duration, state rows, watermark |

    ## Reading the task summary
    | Pattern | Diagnosis |
    |---|---|
    | Max ≫ median duration and max shuffle read ≫ median | **Skew** |
    | All tasks slow and spilling | Partitions too big / too few |
    | Thousands of tasks of a few ms | Too many tiny partitions or files |
    | High GC time (> 10% of task time) | Memory pressure: too big partitions, too much caching, huge objects |
    | Long **scheduler delay** / task deserialization | Driver overloaded, huge closures, too many tasks |
    | One stage reading far more data than expected | Missing pruning/pushdown, «SELECT *», wrong filter |
    | A stage re-executed | Executor lost (preemption/OOM), FetchFailed, cache evicted |

    ## A method
    1. Find the **longest stage**; map it to the plan (stage IDs in the SQL tab).
    2. Check **input/shuffle volumes** against expectations ("this should read 1 day, it reads 400 days").
    3. Check the **task distribution** (skew, stragglers).
    4. Check **spill and GC**.
    5. Check **rows per operator** in the SQL tab: a join whose output rows ≫ input rows is a fan-out/explosion.
    6. Form a hypothesis, change one thing, compare runtimes and metrics. Record it.

    ## Reading explain()
    «df.explain('formatted')» lists operators bottom-up. Key lines: «FileScan parquet … PartitionFilters: […], PushedFilters: […], ReadSchema: struct<…>» (pruning, pushdown, columns read); «Exchange» (shuffle); «BroadcastExchange»; «HashAggregate» pairs (partial + final); «Window»; «Sort»; «WholeStageCodegen (n)» groupings; «BatchEvalPython»/«ArrowEvalPython» (Python UDFs).

    ## Outside the UI
    - Driver and executor **logs** (stack traces, OOM messages, "Container killed").
    - Cluster metrics (CPU, memory, disk, network): idle CPUs mean too little parallelism; maxed network means shuffle-bound.
    - For Delta: «DESCRIBE HISTORY» operation metrics (files added/removed, rows, execution time) show how writes behave over time (Turbofan used commit history to find the bottleneck).

    ## How interviewers test this
    - "A job that took 20 minutes now takes 3 hours. How do you investigate?"
    - "What in the Spark UI tells you there is skew?"
    - "How do you know if partition pruning worked?"
  `, {
    check: [
      mcq('Stage task summary: median duration 25 s, max 41 min; median shuffle read 120 MB, max 38 GB. Diagnosis?', ['Too many partitions', 'Data skew', 'Driver OOM', 'Slow network everywhere'], 1, 'One partition holds far more data.'),
      mcq('Where do you confirm partition pruning on a read?', ['Executors tab', 'FileScan node: PartitionFilters / files pruned in the SQL tab or explain()', 'Jobs tab', 'Environment tab'], 1, 'Empty PartitionFilters when you expected them = no pruning.'),
      tf('High GC time across all tasks usually points to memory pressure from large partitions or excessive caching.', true, 'Smaller partitions, less caching, or more memory per task.'),
      mcq('A join operator outputs 50 billion rows from inputs of 2 billion and 10 million. Likely?', ['Broadcast', 'Fan-out from duplicate keys (or a near-cartesian condition)', 'Spill', 'AQE'], 1, 'Check key uniqueness on the side that should be unique.'),
    ],
    scenarios: [
      scenario('From 20 minutes to 3 hours', `
        The nightly «gold_fleet_health» job went from 20 minutes to 3 hours overnight. No code change. The Spark UI shows stage 14 (a sort-merge join between readings and engine metadata) taking 2h40m; 799 of 800 tasks finish in under a minute.`, [
        ['What do you check next?', [
          ['The slow task\'s shuffle read size and its key: count rows per join key in the input to find a hot or NULL key that appeared yesterday', true, 'Confirm skew and find its cause in the data.'],
          ['Restart the cluster', false, 'The data will still be skewed.'],
          ['Increase shuffle.partitions', false, 'A single hot key stays in one partition.'],
        ]],
        ['You find 600 million readings with engine_id NULL from a new gateway firmware. Fix?', [
          ['Quarantine NULL engine_id readings in silver with a reason code (they cannot join anyway), alert the device team, and keep AQE skew handling on', true, 'Fix the data contract; the join recovers.'],
          ['Salt the join', false, 'Salting NULLs still produces no matches; they should not be joined.'],
          ['Broadcast readings', false, 'Billions of rows cannot be broadcast.'],
        ]],
      ], 'Performance incidents are often data-quality incidents in disguise.'),
    ],
  }),

  // ================================================================== Delta internals
  delta: T(`
    > **In one line:** a Delta table is **Parquet data files + a transaction log** («_delta_log/») of ordered JSON commits. The log is the source of truth: a file is part of the table only if a commit **added** it and no later commit **removed** it. From that one design come ACID writes with **optimistic concurrency**, **time travel**, **schema enforcement**, **MERGE/UPDATE/DELETE** on immutable files, **change data feed**, and the maintenance chores (**OPTIMIZE**, **VACUUM**) you must schedule.

    ## The log
    - Each commit is «_delta_log/00000000000000000042.json» containing actions: «add» (file path, partition values, size, **min/max/null-count stats**), «remove», «metaData» (schema, partitioning, properties), «protocol» (reader/writer versions, table features), «commitInfo» (operation, metrics, user), «txn» (application transaction ids for idempotent writes).
    - Every 10 commits (configurable) a **checkpoint** Parquet file summarises the state so readers do not replay thousands of JSON files.
    - Reading = find the latest checkpoint + later JSON commits → the set of live files → read them (with data skipping on stats).

    ## Writes and optimistic concurrency
    1. Writer reads the current version N and does its work (writes new Parquet files, which are invisible).
    2. It tries to create commit N+1 **atomically** (put-if-absent on the log file; on S3 this needs a coordination service or S3's conditional writes, which is why multi-cluster writes on S3 historically required DynamoDB-based log stores).
    3. If someone else committed N+1 first, it checks whether that commit **conflicts** with what it read/wrote (same files removed, appends to partitions it read under serializable isolation…). No conflict → retry as N+2. Conflict → «ConcurrentAppendException», «ConcurrentDeleteReadException», «ConcurrentDeleteDeleteException», «MetadataChangedException».
    - Isolation levels: **WriteSerializable** (default) and Serializable.
    - Reduce conflicts: make concurrent writers touch **disjoint partitions** and put the partition predicate in their conditions (MERGE ON includes «t.date = …»), use **row-level concurrency** (Databricks, with deletion vectors), or serialise writers.

    ## UPDATE, DELETE, MERGE on immutable files
    - **Copy-on-write:** find files containing affected rows, rewrite them without/with changed rows, commit remove(old) + add(new). Cost ∝ size of touched files.
    - **Deletion vectors** (merge-on-read): instead of rewriting a 1 GB file to delete 3 rows, write a small bitmap marking those rows deleted; readers filter them. Later OPTIMIZE/purge rewrites. Much cheaper writes, slightly more read work.
    - Matching the MERGE source against stats prunes files: tight clustering on the key makes MERGE touch few files.

    ## Schema
    - **Enforcement:** writes with mismatched columns/types fail by default. Good: bad data does not silently enter.
    - **Evolution:** «mergeSchema» (append) / «spark.databricks.delta.schema.autoMerge.enabled» (MERGE) add new columns; type widening (e.g. int → long) is supported in newer versions; renames/drops need **column mapping** mode.
    - **Constraints:** «NOT NULL», «CHECK (claim_amount >= 0)» are enforced on write: a contract inside the table.
    - **Generated columns:** «event_date GENERATED ALWAYS AS (CAST(event_ts AS DATE))» lets filters on event_ts prune event_date partitions.

    ## Time travel, VACUUM and retention
    - «SELECT … VERSION AS OF 41» / «TIMESTAMP AS OF '…'»; «RESTORE TABLE … TO VERSION AS OF 41» for rollbacks after a bad load.
    - **VACUUM** deletes data files no longer referenced by any version within the retention period (default **7 days**). After VACUUM, time travel to older versions fails (files gone). Never VACUUM with retention shorter than your longest-running reader/stream lag (Delta blocks < 7 days unless you disable the safety check, which can corrupt active readers).
    - Log retention («logRetentionDuration», default 30 days) controls how far back the log itself goes.
    - Right-to-erasure (GDPR/DPDP): a DELETE is not physical deletion until VACUUM removes the old files (and deletion vectors are purged).

    ## Layout and maintenance
    - **OPTIMIZE:** bin-pack small files into ~1 GB files. **Z-ORDER BY (engine_id, ts)**: co-locate related values so min/max stats skip more files (multi-dimensional clustering, rewrites the table region).
    - **Liquid clustering** («CLUSTER BY») replaces partitioning + Z-order for most new tables on Databricks: incremental, keys can be changed later, avoids over-partitioning.
    - **Optimized writes / auto compaction** reduce small files at write time.
    - Stats are collected on the first 32 columns by default: put filter columns early or configure «dataSkippingNumIndexedCols» / «dataSkippingStatsColumns».

    ## Change Data Feed and streaming
    - «delta.enableChangeDataFeed = true» records row-level changes («_change_type»: insert, update_preimage, update_postimage, delete) so downstream tables can process **only changes** (silver → gold incrementally) instead of re-reading everything.
    - A Delta table as a **streaming source** reads new commits; non-append changes (UPDATE/DELETE upstream) break it unless you use «skipChangeCommits» or read the CDF.
    - As a **streaming sink**, Delta records the stream's id and batch id («txn» action) so a replayed micro-batch is skipped: that is the exactly-once sink. In «foreachBatch», use «txnAppId»/«txnVersion» write options to get the same idempotency for your own writes (or MERGE, which is idempotent by key).

    ## Delta vs Iceberg vs Hudi (one line each)
    Delta: Databricks-native, log-based, deepest Spark integration. Iceberg: snapshot/manifest trees, engine-neutral (Snowflake, Trino, Flink), hidden partitioning and partition evolution. Hudi: record-level indexes and merge-on-read optimised for upsert-heavy streaming ingestion. Delta UniForm and Iceberg REST catalogs are blurring the lines.

    ## How interviewers test this
    - "How does Delta give ACID on object storage?"
    - "Two jobs write the same Delta table. What happens?"
    - "What does VACUUM do and what can go wrong?"
    - "How does Delta make a streaming sink exactly-once?"
    - "When would you use Z-order vs partitioning vs liquid clustering?"
  `, {
    check: [
      mcq('What makes a Parquet file part of a Delta table?', ['Being in the table directory', 'A commit in _delta_log that added it and no later commit that removed it', 'Being listed in the Hive metastore', 'Its file name'], 1, 'Files in the folder but not in the log are invisible (e.g. from failed writes).'),
      mcq('After «VACUUM t RETAIN 168 HOURS», what fails?', ['Current queries', 'Time travel to versions whose files were older than 7 days and are now deleted', 'Future writes', 'Schema evolution'], 1, 'VACUUM physically deletes unreferenced files.'),
      mcq('Two jobs MERGE into the same Delta table and one fails with ConcurrentAppendException. Best structural fix?', ['Disable the check', 'Make writers touch disjoint partitions and include the partition predicate in their conditions (or serialise them)', 'Retry forever', 'Use Parquet instead'], 1, 'OCC conflicts come from overlapping reads/writes.'),
      tf('Deletion vectors let Delta delete a few rows without rewriting the whole data file immediately.', true, 'Merge-on-read: a bitmap marks deleted rows.'),
      mcq('How does a Delta streaming sink avoid writing a micro-batch twice after a crash?', ['Kafka transactions', 'It stores the query id and batch id in the log and skips a batch already committed', 'It deletes duplicates later', 'It cannot'], 1, 'Idempotent commit by (appId, version).'),
      mcq('A DELETE removed a customer\'s rows for a privacy request. When is the data physically gone?', ['Immediately', 'After VACUUM removes the old files beyond retention (and deletion vectors are purged)', 'Never', 'After OPTIMIZE only'], 1, 'Old versions still hold it until vacuumed.'),
    ],
    scenarios: [
      scenario('Bad load at 02:00, found at 09:00', `
        A buggy deploy wrote wrong «approved_amount» values into «silver.claims» (Delta) at 02:00 (version 512) via MERGE. Downstream gold tables refreshed at 03:00. It is 09:00, finance is about to publish.`, [
        ['Fastest safe recovery for silver?', [
          ['RESTORE silver.claims TO VERSION AS OF 511, after checking DESCRIBE HISTORY that no valid commits came after 512 (or replay them)', true, 'Time travel makes this a metadata operation.'],
          ['Delete the table and reload from source', false, 'Slow and risky.'],
          ['VACUUM the table', false, 'Destroys the versions you need.'],
        ]],
        ['What else must happen?', [
          ['Re-run the gold refresh (idempotent) from the restored silver, fix and test the deploy, and add a data test (approved_amount ≤ claim_amount) that would have blocked publication', true, 'Recover downstream, then prevent.'],
          ['Nothing: gold reads silver live', false, 'Gold materialised the bad values at 03:00.'],
          ['Disable time travel', false, 'It just saved you.'],
        ]],
      ], 'Keep VACUUM retention long enough to cover your detection time.'),
    ],
    interview: [
      talk('Explain the Delta Lake transaction log and how it provides ACID on cloud object storage.', `
        - **Atomicity:** a write's Parquet files become visible only when a single commit file «N.json» is created atomically; a crash before that leaves orphan files that no reader sees (VACUUM removes them later).
        - **Consistency:** schema enforcement, NOT NULL/CHECK constraints at commit time.
        - **Isolation:** readers read a snapshot (a version); writers use optimistic concurrency: commit N+1 only if no conflicting commit happened since they read, else retry or fail.
        - **Durability:** data and log live in durable object storage.
        - **Extras from the same design:** time travel/RESTORE, data skipping from per-file stats in the log, idempotent streaming sinks via txn ids, CDF. **Chores:** OPTIMIZE/clustering for small files, VACUUM for storage with a retention that respects readers and recovery needs.`),
    ],
    hands: [
      py({ q: '**Simulate a Delta log.** Write «snapshot(commits, version)» returning the **sorted list of live file names** at «version». «commits» is a list (index = version) of action lists like «[("add", "f1"), ("remove", "f0")]». Then write «commit(commits, read_version, actions)» implementing **optimistic concurrency**: if any commit after «read_version» **removed** a file that «actions» also removes, raise «RuntimeError("conflict")»; otherwise append «actions» as the next version and return its number.', starter: 'def snapshot(commits, version):\n    pass\n\ndef commit(commits, read_version, actions):\n    pass\n',
        tests: `log = [[('add', 'a'), ('add', 'b')], [('add', 'c')], [('remove', 'a'), ('add', 'a2')]]
assert snapshot(log, 0) == ['a', 'b']
assert snapshot(log, 2) == ['a2', 'b', 'c']
v = commit(log, 1, [('remove', 'b'), ('add', 'b2')])     # someone removed 'a' since v1: no overlap
assert v == 3 and snapshot(log, 3) == ['a2', 'b2', 'c']
try:
    commit(log, 1, [('remove', 'a'), ('add', 'a3')])      # 'a' was already removed in v2
    assert False
except RuntimeError as e:
    assert 'conflict' in str(e)
assert len(log) == 4`,
        solution: `def snapshot(commits, version):
    live = set()
    for actions in commits[:version + 1]:
        for op, f in actions:
            if op == 'add':
                live.add(f)
            else:
                live.discard(f)
    return sorted(live)

def commit(commits, read_version, actions):
    mine = {f for op, f in actions if op == 'remove'}
    for later in commits[read_version + 1:]:
        if mine & {f for op, f in later if op == 'remove'}:
            raise RuntimeError('conflict')
    commits.append(list(actions))
    return len(commits) - 1` }),
    ],
  }),
};
