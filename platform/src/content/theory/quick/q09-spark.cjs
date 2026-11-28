const { T } = require('../_t.cjs');

module.exports = {
  sparkwhat: T(`
    > **In one line:** Apache Spark is a **distributed processing engine**: write transformations once (SQL, Python, Scala, Java, R) and Spark runs them **in parallel across a cluster**, keeping intermediate data **in memory** where possible, with built-in **fault tolerance**. The default engine for large-scale batch and streaming DE.

    **Why it beat MapReduce:** MapReduce wrote every step to disk, chained multi-step work as separate jobs, and needed verbose Java, so iterative ML, multi-stage ETL and interactive queries suffered. Spark (Berkeley 2009, Apache 2013) kept "split, process in parallel, recover" but keeps data **in memory between steps**, plans the **whole job as one optimised DAG**, and offers **DataFrames/SQL**: often 10-100× faster for multi-step work, far less code.

    | Component | Use |
    |---|---|
    | Spark Core | Scheduling, memory, fault tolerance, RDDs |
    | Spark SQL / DataFrames | Structured data, Catalyst optimiser, Tungsten execution |
    | Structured Streaming | Streaming on the DataFrame API |
    | MLlib / GraphX | Distributed ML / graphs (GraphX rarely used) |
    | Spark Connect | Thin client/server protocol |
    Runs on YARN, Kubernetes, Standalone and managed: **Databricks**, EMR, Synapse/HDInsight/Fabric, Dataproc.

    **Why default:** one engine for batch, streaming, SQL, ML; laptop to thousands of nodes; reads/writes Parquet, Delta, Iceberg, JSON, CSV, JDBC, Kafka, cloud storage; huge ecosystem, PySpark for Python users.

    **When not:** data fits one machine (tens of GB → DuckDB/Polars/pandas); millisecond per-event processing (Flink, Kafka Streams); pure SQL already in a warehouse (dbt); millisecond app serving (a database).

    | | Spark | Flink | pandas/Polars/DuckDB | Warehouse SQL |
    |---|---|---|---|---|
    | Scale | Cluster | Cluster | One machine | Managed MPP |
    | Batch | Excellent | Good | Excellent (small/medium) | Excellent |
    | Streaming | Micro-batch, good | True streaming, excellent | No | Limited |
    | Ops | Clusters or managed | Clusters | None | None |

    ## Spark in 2026
    - **4.x line:** 4.0 (2025), **4.1 GA with Databricks Runtime 18**, 4.2 preview mid-2026. Changes: **ANSI SQL on by default** (errors instead of silent NULLs on bad casts/overflow), **VARIANT** type for semi-structured JSON, **Spark Connect**, **SQL scripting** and **recursive CTEs** (4.1), «transformWithState», Python data source API, **Spark Declarative Pipelines** (open-sourced DLT, 4.1), JDK 17/21, Scala 2.13 only.
    - **Spark Connect:** clients talk to a remote Spark server over gRPC (Databricks serverless and shared clusters use it); RDDs/SparkContext aren't available through it: another reason to stay on DataFrames.
    - **Photon** (Databricks) and open-source native accelerators (Gluten/Velox, Comet) run the same plans in vectorised native code.

    **Interview:** why faster than MapReduce (memory between stages, DAG optimisation, fewer disk writes, Catalyst/Tungsten); when not to use it.
  `),

  sparkarch: T(`
    > **In one line:** each Spark app has one **driver** (runs your program, builds and optimises the plan, schedules tasks, tracks state) and many **executors** (worker processes running tasks on partitions, holding cache and shuffle files). A **cluster manager** provides resources.

    **Driver:** every line of PySpark runs here, building a plan. On an action it makes the physical plan, splits **jobs → stages → tasks**, requests executors, sends tasks, retries, collects results. Holds the plan, task metadata, broadcasts (initially) and anything you «collect()». **Single point of failure** for the app. It becomes the bottleneck through planning, scheduling every task, tracking every file (listing millions), collects and building broadcasts: needing a big driver usually means a design problem (collects, huge broadcasts, tiny files).

    **Executors:** JVM processes with **cores** (task slots; tasks run as threads, one per core) and **memory**. Unified memory: **execution** (shuffles, joins, sorts, aggregations) and **storage** (cache, broadcasts) share a pool; plus user memory and overhead (off-heap, Python workers). **PySpark UDFs run in Python worker processes** (one per concurrently running Python task); data is serialised JVM ↔ Python (Arrow makes pandas UDFs much faster).

    **Deploy modes:** **client** (driver where you submit: notebook/laptop; dies with your session) for interactive work; **cluster** (driver in the cluster) for production. **Spark Connect** separates client from driver: the client sends plans, the server runs the driver, so client crashes don't kill the app.

    | Symptom | Usual cause | Fix |
    |---|---|---|
    | Driver OOM | «collect()»/«toPandas()» on big data, huge broadcast, too many tasks/partitions | Write to storage, smaller broadcast, fewer partitions |
    | Executor OOM | Skewed partition, huge per-key aggregation, too few partitions, big cache | More partitions, fix skew, more memory per core |
    | Container killed for memory | Overhead: Python UDFs, off-heap, native libs | Raise memoryOverhead, use built-ins |
    | Long GC | Huge heaps, many objects | Smaller executors, built-in functions |
    | Spill | Partitions bigger than execution memory | More partitions/memory, shuffle less |

    **Interview:** driver vs executors (plan/schedule/collect vs tasks; Python outside transformations runs on the driver); driver OOM causes; why Python UDFs are slow (per-row JVM ↔ Python serialisation, opaque to Catalyst → built-ins or pandas UDFs).
  `),

  rdddf: T(`
    > **In one line:** an **RDD** is Spark's low-level, **schema-less** collection of objects with functional ops (map, filter, reduceByKey). A **DataFrame** is a distributed table **with a schema** whose SQL-like operations **Catalyst** and **Tungsten** can optimise. Use DataFrames by default.

    | | RDD | DataFrame |
    |---|---|---|
    | Schema | No | Yes |
    | You say | **How** (lambdas Spark can't see into) | **What** (select, filter, groupBy, join) |
    | Optimisation | None automatic | Catalyst + Tungsten + AQE |
    | Python speed | Slow (Python objects serialised) | Fast (runs in the JVM; same speed from Python, Scala, SQL for built-ins) |
    | Today | Rare: legacy, custom partitioners, low-level control, unstructured records; not on Spark Connect / shared Databricks compute | Default |

    **Why DataFrames win:** Catalyst does **predicate pushdown** (filter in the file reader), **column pruning**, constant folding, join reordering/strategy choice, plus AQE at runtime; **Tungsten** uses a compact binary row format and whole-stage code generation. RDD lambdas are black boxes with object overhead. Per-partition work exists on DataFrames too («mapInPandas», «mapInArrow»).

    **Datasets** (Scala/Java) add compile-time types («Dataset[Claim]»; a DataFrame is «Dataset[Row]») but lose optimisations when you use typed lambdas («map(x => …)»), which are opaque.

    **Interview:** RDD vs DataFrame vs Dataset; why DataFrames are faster (Catalyst, Tungsten, no Python per-row overhead).
  `),

  lazy: T(`
    > **In one line:** **transformations** (select, filter, join, groupBy…) are **lazy** and only build a plan; **actions** (count, collect, show, write) run the whole plan. Laziness lets Spark optimise the entire pipeline, and explains "why did this run twice?".

    | Transformations (lazy) | Actions (run a job) |
    |---|---|
    | select, filter/where, withColumn, drop | count, collect, take, first, show |
    | join, groupBy().agg(), distinct, orderBy | write/save/saveAsTable, insertInto |
    | union, repartition, coalesce, cache (only marks) | foreach, foreachPartition, toPandas |

    **Benefits:** whole-plan optimisation (a filter after a join is pushed before it; unused columns never read); unused steps never run; the plan (lineage) is the recipe to recompute lost partitions.

    ## Consequences
    - **Each action re-runs the lineage from the source** unless cached: «df.count()» then «df.write» computes everything **twice**. Avoid "count for logging" on expensive DataFrames: cache deliberately, or read counts from write metrics (Delta operation metrics).
    - **Errors surface at the action**, far from the cause (a bad cast 30 lines up). In ANSI mode the message points at the expression: read it.
    - «explain()» shows the plan without running.
    - Timing transformations measures nothing; time the action.
    - Two actions over a live source can see different data.
    - **Python driver code is eager:** a loop of 500 «withColumn» calls builds a huge plan (slow analysis, even stack overflows) → one «select» with a list of expressions, or «withColumns» (3.3+).
    - **Iterative loops** grow lineage each pass → checkpoint or write out periodically.

    **Interview:** what lazy evaluation is and why; spotting actions; "job reads the source twice" (two actions on an uncached DataFrame).
  `),

  dag: T(`
    > **In one line:** on an action Spark turns the plan into a **DAG**, cuts it into **stages** at every **shuffle**, and runs each stage as **tasks** (one per partition). **Job → stages → tasks** is how you read the Spark UI.

    | Level | Created by | Count |
    |---|---|---|
    | Application | One SparkSession/program | 1 |
    | Job | Each action | One per action, plus hidden ones (schema inference, «show()», broadcast building, AQE re-planning: normal) |
    | Stage | Shuffle boundaries | Several per job |
    | Task | One per partition | Hundreds to thousands |

    **Stages form** by pipelining consecutive **narrow** ops (filter, select, withColumn) into one pass per partition (whole-stage codegen); a **wide** op (groupBy, join, distinct, repartition) writes shuffle files, ends the stage, and the next stage reads them.

    **Example:** «read claims → filter → join dealers → groupBy region → write» = stage 1 (read claims, filter, shuffle by dealer_id), stage 2 (read dealers, shuffle by dealer_id), stage 3 (join, partial aggregate, shuffle by region), stage 4 (final aggregate, write). With a **broadcast join** stages 1-3 collapse (no join shuffle). Rule: stages ≈ shuffles + 1.

    **Spark UI:** **Jobs** (which action is slow); **Stages** (duration, input, shuffle read/write, spill, task count); **task distribution** (max ≫ median = skew); **SQL** (physical plan with per-operator rows/time, join strategy, AQE changes); **Executors** (GC, memory, failures).

    **Notes:** too many stages come from needless repartitions/orderBys; stages recompute when several actions share an uncached plan; **skipped stages** (grey) are good: shuffle output reused from an earlier job in the same application (gone after restart); very long lineage slows planning. **Stage retries:** a FetchFailed in stage N re-runs lost map outputs of stage N-1; repeated failures abort («spark.stage.maxConsecutiveAttempts»).

    **Interview:** job/stage/task; counting stages (shuffles + 1); finding the bottleneck (slowest stage, shuffle sizes, spill, skew, plan).
  `),

  narrowwide: T(`
    > **In one line:** a **narrow** transformation builds each output partition from **one** input partition (no movement); a **wide** one needs **many** input partitions, so it **shuffles**. Wide steps set stage boundaries and most of a job's cost.

    | Narrow | Wide |
    |---|---|
    | select, withColumn, filter/where | groupBy().agg(), distinct, dropDuplicates |
    | map, flatMap, explode | join (sort-merge, shuffle-hash) |
    | **union** (concatenates partitions) | global orderBy/sort (range shuffle + sampling job) |
    | **coalesce** (merges locally; why it can collapse upstream parallelism) | repartition |
    | broadcast join (big side stays put) | windows with PARTITION BY |
    | sample, sortWithinPartitions | intersect, except |

    **Why it matters:** narrow chains run as one tight in-memory loop per partition; each wide step costs disk + network + a barrier, and is where skew, spill and OOM happen. Optimise with **fewer, smaller wide steps**: filter/select first, aggregate before joining, broadcast small sides, skip needless sorts («sortWithinPartitions» is narrow and often enough before writing) and repartitions.

    **Partial aggregation:** «groupBy().agg(sum)» first sums per key inside each task (map side), so the shuffle moves one row per key per task. «collect_list» and «countDistinct» can't shrink much, so they shuffle more.

    **Wide ≠ always shuffle:** if input is already partitioned as needed (same keys and partition count), Spark skips the Exchange.

    **Interview:** examples of each; union and coalesce are narrow; reducing the cost of wide steps.
  `),

  cache: T(`
    > **In one line:** «cache()»/«persist()» keep a DataFrame's computed partitions in executor memory/disk after the first action, so later actions **reuse** them instead of recomputing lineage. Good when an expensive result is reused; harmful by reflex.

    **How:** «cache()» only **marks** (lazy); the first action computes and stores; DataFrame «cache()» = «persist(MEMORY_AND_DISK)». Other levels: MEMORY_ONLY (recompute if evicted), DISK_ONLY, «_SER» variants, replicated «_2»: choose by reuse cost vs memory pressure. «unpersist()» frees it (do it: cache competes with execution memory and causes spills elsewhere). **Storage** tab shows what fits. Lost executors lose cached partitions (recomputed from lineage).

    **Cache when** the same DataFrame feeds several actions/branches or a loop (3+ reuses), is expensive (big joins, heavy UDFs) and reasonably small; iterative ML; notebook exploration. A «count()» right after «cache()» is the common (sometimes wasteful) way to materialise it.

    **Don't when** used once; bigger than memory (disk spill may be slower than re-reading pruned Parquet); before a filter (cache the filtered result). On Databricks the **disk cache** (formerly Delta cache: remote Parquet cached on local SSD automatically) often beats «df.cache()» for repeated reads.

    | | cache/persist | checkpoint | Write a table |
    |---|---|---|---|
    | Lineage | Kept | Truncated | Truncated |
    | Survives the app | No | Meant for the app | Yes |
    | Use | Reuse within a job | Break very long lineages | Share across jobs/teams/restarts |

    **What goes wrong:** stale cache over a changed table; caching too much (evicts others, starves execution → spill/OOM); forgetting the action.

    **Interview:** when to cache; cache vs persist (default level); cache vs checkpoint.
  `),

  sparkft: T(`
    > **In one line:** Spark recovers by **retrying tasks**, **recomputing lost partitions from lineage**, **re-running map stages** whose shuffle files were lost, **speculating** on stragglers, and for streaming **restarting from checkpointed offsets and state**. It doesn't replicate data in memory; it relies on recomputation.

    | Failure | Response |
    |---|---|
    | Task throws | Retried up to «spark.task.maxFailures» (4) elsewhere; a deterministic bug (bad data) fails every attempt: the error shown is the 4th |
    | Executor dies | Tasks rescheduled; cached partitions recomputed when needed; lost shuffle files → their map tasks re-run (unless an external shuffle service/decommissioning kept them) |
    | Repeated fetch failures | Stage retried; then job fails |
    | Straggler | Speculative copy if enabled; first to finish wins |
    | Driver dies | App fails (cluster mode can supervise-restart); batch restarts from scratch (make it idempotent); streaming resumes from checkpoint |
    | Spot node reclaimed | Like executor loss; graceful decommissioning migrates shuffle/cache blocks when warned |

    **Recomputation needs** deterministic transformations of reliable inputs (durable files, replayable offsets). It breaks with non-reproducible inputs (live API, a table overwritten mid-job), **non-determinism** («rand()», «now()», unordered «first()»/«row_number») and side effects in tasks (emails re-sent). Non-deterministic recompute can produce different rows than the first attempt, leaving downstream stages inconsistent; Spark detects some indeterminate stages and re-runs dependants, but better to avoid it before shuffles (sort before random sampling, deterministic salts).

    **Commit protocol:** retried/speculative tasks write to temp locations; only one attempt per task commits; Delta makes the job commit atomic, so readers never see partial or duplicate output.

    **Structured Streaming:** planned offsets go to the **offset log before** processing; the **commit log** marks completed batches; state snapshots/deltas persist operator state. Restart reprocesses the last planned-but-uncommitted batch with the same offsets, then continues; with Delta sink → exactly-once.

    **Interview:** executor dies mid-job; no duplicated output on retry (commit protocol, atomic commits); why determinism matters.
  `),

  sparksql: T(`
    > **In one line:** every DataFrame or SQL query goes through **Catalyst** (analysis → logical optimisation → physical planning → code generation) and, at runtime, **AQE**, which re-plans with real statistics.

    «««flow
    SQL / DataFrame -> Unresolved plan -> Analysis (catalog resolves tables, columns, types) -> Optimised logical plan (rules) -> Physical plans (strategies, cost) -> Chosen plan -> Whole-stage codegen -> Execution (+ AQE at stage boundaries)
    »»»

    ## Catalyst optimisations
    - **Predicate pushdown** into the reader (Parquet row-group skipping) or JDBC source. Works for simple column comparisons; fails through UDFs, many casts, complex expressions (Spark 4 can push some filters on VARIANT paths).
    - **Column pruning**, constant folding, boolean simplification, null propagation.
    - **Partition pruning**; **dynamic partition pruning (DPP)**: in a star join a dimension filter («region = 'West'») becomes a runtime filter on the fact's partition column.
    - **Join reordering** via the **CBO** (off by default in OSS; needs «ANALYZE TABLE … COMPUTE STATISTICS FOR ALL COLUMNS»; Databricks collects Delta stats automatically via predictive optimization). AQE covers much at runtime.
    - **Join strategy selection:** broadcast hash (small side under «autoBroadcastJoinThreshold» 10 MB or hinted), shuffle hash, sort-merge (large-large default), nested loop/cartesian (non-equi: dangerous). Details in Join strategies.

    **AQE** (on by default) at each shuffle: coalesces small partitions, switches sort-merge → broadcast when a side is small, splits skewed join partitions.

    **Reading «df.explain("formatted")»:** «FileScan … PushedFilters / PartitionFilters / ReadSchema» (pushdown and pruning working?), «BroadcastHashJoin» vs «SortMergeJoin», each «Exchange» = a shuffle, «AdaptiveSparkPlan isFinalPlan=true» after execution.

    **Hints:** «BROADCAST», «MERGE», «SHUFFLE_HASH», «SHUFFLE_REPLICATE_NL», «REPARTITION», «COALESCE», «REBALANCE» (AQE-aware rebalancing before writes to avoid tiny/huge files).

    **Blocks optimisation:** Python UDFs (opaque; filters can't move past them); wrapping filter/partition columns in functions or casts; missing statistics; non-equi joins; reading CSV/JSON (little pushdown) instead of Parquet/Delta.

    **Interview:** how a join is chosen and forcing broadcast; what AQE does; predicate pushdown and verifying it (PushedFilters in explain).
  `),
};
