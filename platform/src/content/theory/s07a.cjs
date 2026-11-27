const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== What Spark is
  sparkwhat: T(`
    > **In one line:** Apache Spark is a **distributed processing engine**: you write transformations once (SQL, Python, Scala, Java, R) and Spark runs them **in parallel across a cluster**, keeping intermediate data **in memory** where possible, with built-in **fault tolerance**. It is the default engine for large-scale batch and streaming data engineering.

    ## The problem it solves
    Hadoop MapReduce made big data possible but slow and awkward: every step wrote to disk, multi-step jobs were chains of separate MapReduce jobs, and code was verbose Java. Iterative work (machine learning, multi-stage ETL) and interactive queries suffered. Spark (UC Berkeley, 2009; Apache 2013) kept the "split data, process in parallel, recover from failure" idea but:
    - keeps data **in memory between steps**,
    - plans a **whole multi-step job** as one DAG and optimises it,
    - offers **high-level APIs** (DataFrames, SQL) instead of hand-written map and reduce functions.
    Result: often 10-100× faster than MapReduce for multi-step work, and far less code.

    ## What is in Spark
    | Component | Use |
    |---|---|
    | **Spark Core** | Scheduling, memory management, fault tolerance, RDD API |
    | **Spark SQL / DataFrames** | Structured data, SQL, Catalyst optimiser, Tungsten execution |
    | **Structured Streaming** | Streaming on the DataFrame API (micro-batch or continuous) |
    | **MLlib** | Distributed machine learning |
    | **GraphX** | Graph processing (rarely used now) |
    | **Spark Connect** | Thin client/server protocol (remote Spark from any app) |
    Runs on YARN, Kubernetes, Standalone, and managed platforms: **Databricks**, AWS EMR, Azure Synapse/HDInsight/Fabric, Google Dataproc.

    ## Why it is the default for data engineering
    - One engine for batch, streaming, SQL and ML.
    - Scales from a laptop to thousands of nodes.
    - Reads/writes everything: Parquet, Delta, Iceberg, JSON, CSV, JDBC, Kafka, cloud storage.
    - Huge ecosystem and talent pool; PySpark makes it accessible to Python users.

    ## When not to use Spark
    - Data fits comfortably on one machine (tens of GB): DuckDB, Polars or pandas are simpler and faster to start.
    - Low-latency per-event processing in milliseconds: Flink or Kafka Streams.
    - Pure SQL transformations already in a warehouse: dbt + warehouse SQL.
    - Serving queries to apps with millisecond latency: a database.

    ## Spark vs alternatives
    | | Spark | Flink | Pandas/Polars/DuckDB | Warehouse SQL (Snowflake/BigQuery) |
    |---|---|---|---|---|
    | Scale | Cluster | Cluster | Single machine | Managed MPP |
    | Batch | Excellent | Good | Excellent (small/medium) | Excellent |
    | Streaming | Micro-batch, good | True streaming, excellent | No | Limited |
    | Languages | SQL, Python, Scala, Java, R | Java, Scala, SQL, Python | Python, SQL | SQL |
    | Ops | Clusters (or managed) | Clusters | None | None (managed) |

    ## How interviewers test this
    - "Why is Spark faster than MapReduce?" In-memory between stages, DAG optimisation, fewer disk writes, Catalyst/Tungsten.
    - "When would you not use Spark?"
  `, {
    check: [
      mcq('The main reason Spark is faster than MapReduce for multi-step jobs is…', ['It uses a different language', 'It keeps intermediate data in memory and plans the whole job as one optimised DAG instead of writing to disk after every step', 'It has no fault tolerance', 'It uses GPUs'], 1, 'MapReduce writes to disk between every map and reduce phase.'),
      tf('For a 5 GB CSV processed once a day, a single-machine tool like DuckDB or Polars may be a better choice than a Spark cluster.', true, 'Choose the simplest tool that meets the need.'),
      mcq('Which Spark component powers SQL and DataFrame query optimisation?', ['GraphX', 'Catalyst optimiser in Spark SQL', 'MLlib', 'YARN'], 1, 'Catalyst plans and optimises; Tungsten executes efficiently.'),
    ],
  }),

  // ================================================================== Driver and executors
  sparkarch: T(`
    > **In one line:** every Spark application has one **driver** (runs your main program, builds and optimises the plan, schedules tasks, tracks state) and many **executors** (processes on worker nodes that run tasks on partitions, hold cached data and shuffle files). A **cluster manager** provides the resources.

    ## The driver
    - Runs your code («SparkSession»): every line of PySpark you write runs here, building a plan.
    - On an action: converts the logical plan to a physical plan, splits it into **jobs → stages → tasks**, asks for executors, sends tasks, retries failures, collects results.
    - Holds: the plan, task metadata, broadcast variables (initially), and any data you «collect()».
    - **Single point of failure** for the app: if the driver dies, the application dies.

    ## Executors
    - JVM processes on worker nodes, each with **cores** (task slots) and **memory**.
    - Run tasks: read a partition, apply transformations, write shuffle files or output.
    - Memory regions (unified memory manager): **execution** (shuffles, joins, sorts, aggregations) and **storage** (cached data, broadcast blocks) share a pool and borrow from each other; plus user memory and overhead (off-heap, Python workers for PySpark).
    - PySpark: Python code in UDFs runs in **Python worker processes** next to the executor; data is serialised between JVM and Python (Arrow makes pandas UDFs much faster).

    ## Deploy modes
    - **Client mode:** driver runs where you submitted (notebook, edge node). Interactive work.
    - **Cluster mode:** driver runs inside the cluster. Production jobs (survives the submitting machine disconnecting).

    ## Typical memory problems and their meaning
    | Symptom | Where | Usual cause | Fix |
    |---|---|---|---|
    | Driver OOM | Driver | collect()/toPandas() on big data, huge broadcast, too many tasks/partitions | Write to storage, smaller broadcast, fewer partitions |
    | Executor OOM | Executor | Skewed partition, huge aggregation per key, too few partitions, big cached data | More partitions, fix skew, more memory per core |
    | Container killed by YARN/K8s for exceeding memory | Executor overhead | Python UDF memory, off-heap, native libs | Raise memoryOverhead, use built-in functions |
    | Long GC pauses | Executor | Huge heaps, many objects | Smaller executors, fewer objects, built-in functions |
    | Spill to disk | Executor | Partitions bigger than execution memory | More partitions / memory, reduce data shuffled |

    ## How interviewers test this
    - "What runs on the driver vs on executors?" Plan/scheduling/collect on the driver; tasks on executors. Python code outside transformations runs on the driver.
    - "Your job fails with driver OOM. Causes?" collect, toPandas, broadcast too big.
    - "Why are Python UDFs slow?" Serialisation between JVM and Python per row; no optimisation by Catalyst. Prefer built-in functions or pandas UDFs.
  `, {
    check: [
      mcq('Where does a plain Python «for» loop in your PySpark script (outside any DataFrame operation) execute?', ['On every executor', 'On the driver', 'On the cluster manager', 'Nowhere'], 1, 'Only work expressed as DataFrame/RDD operations is distributed.'),
      mcq('Why is a row-by-row Python UDF much slower than the equivalent built-in Spark function?', ['Python is not allowed on executors', 'Each row is serialised between the JVM and a Python worker, and Catalyst cannot optimise inside the UDF', 'UDFs run on the driver', 'They are not slower'], 1, 'Prefer built-in functions; if needed, pandas (vectorised) UDFs with Arrow.'),
      tf('In cluster deploy mode, the driver runs inside the cluster rather than on the machine that submitted the job.', true, 'Preferred for production jobs.'),
    ],
  }),

  // ================================================================== RDD vs DataFrame
  rdddf: T(`
    > **In one line:** an **RDD** (resilient distributed dataset) is Spark's low-level collection of objects with functional operations (map, filter, reduceByKey) and **no schema**. A **DataFrame** is a distributed table **with a schema**, used through SQL-like operations that Spark's optimiser (**Catalyst**) and execution engine (**Tungsten**) can optimise. Use DataFrames by default.

    ## RDDs
    - Immutable, partitioned collection of arbitrary objects; transformations build lineage; actions trigger execution.
    - You tell Spark **how** to do things (lambda functions); Spark cannot see inside them.
    - Fine-grained control; works with unstructured data; the foundation of everything else.
    - Slower in PySpark (Python objects serialised), no automatic optimisation.

    ## DataFrames (and Datasets in Scala/Java)
    - Rows with named, typed columns, like a table.
    - You say **what** you want (select, filter, groupBy, join); Catalyst builds an optimised plan:
      - **predicate pushdown** (filter at the file reader), **column pruning** (read only used columns), **constant folding**, **join reordering/strategy selection**, **adaptive query execution** at runtime.
    - **Tungsten:** compact binary in-memory format, whole-stage code generation, cache-friendly processing.
    - Same performance from Python, Scala or SQL for built-in operations (the plan runs in the JVM).
    - **Datasets** (Scala/Java) add compile-time types to DataFrames («Dataset[Claim]»); a DataFrame is «Dataset[Row]».

    ## Comparison
    | | RDD | DataFrame |
    |---|---|---|
    | Schema | No | Yes |
    | Optimisation | None automatic | Catalyst + Tungsten + AQE |
    | API style | Functional (map/reduce) | Declarative (SQL-like) |
    | Python performance | Slow (Python objects) | Fast (JVM execution) |
    | Use today | Rare: low-level control, legacy code | Default |

    ## When you might still meet RDDs
    - Legacy code; very custom partitioning logic; processing truly unstructured records; some ML internals. Even then, convert to DataFrames as soon as possible.

    ## How interviewers test this
    - "RDD vs DataFrame vs Dataset?"
    - "Why are DataFrames faster?" Catalyst (pushdown, pruning, join strategy), Tungsten (binary format, codegen), no Python per-row overhead.
  `, {
    check: [
      mcq('Why can Spark optimise a DataFrame filter but not the same logic inside an RDD lambda?', ['Lambdas run on the driver', 'Catalyst understands DataFrame expressions (e.g. can push the filter into the file reader); an RDD lambda is opaque code', 'RDDs have no partitions', 'DataFrames are cached'], 1, 'Declarative expressions are analysable; arbitrary functions are not.'),
      tf('A built-in DataFrame aggregation runs at similar speed whether written in PySpark or Scala.', true, 'The plan executes in the JVM; Python only builds it.'),
      mcq('In Scala, a DataFrame is equivalent to…', ['RDD[String]', 'Dataset[Row]', 'A Python list', 'A Hive table'], 1, 'Datasets add compile-time types; DataFrame = Dataset of generic Row.'),
    ],
  }),

  // ================================================================== Lazy evaluation
  lazy: T(`
    > **In one line:** Spark **transformations** (select, filter, join, groupBy…) are **lazy**: they only build a plan. **Actions** (count, collect, show, write, save) trigger execution of the whole plan. Laziness lets Spark optimise the entire pipeline before running it, and explains many "why did this run twice?" surprises.

    ## Transformations vs actions
    | Transformations (lazy, return a DataFrame) | Actions (run the job, return a result or write) |
    |---|---|
    | select, filter/where, withColumn, drop | count, collect, take, first, show |
    | join, groupBy().agg(), distinct, orderBy | write / save / saveAsTable, insertInto |
    | union, repartition, coalesce, cache (marks only) | foreach, foreachPartition, toPandas |

    ## Why laziness is useful
    - **Whole-plan optimisation:** a filter written after a join can be pushed before it; unused columns are never read.
    - **No wasted work:** steps whose results are never used never run.
    - **Fault tolerance:** the plan (lineage) is the recipe to recompute lost partitions.

    ## The consequences you must know
    - **Each action re-runs the plan from the source** unless data is cached/persisted. «df.count()» then «df.write…» reads and computes everything **twice**.
    - **Errors appear late:** a bad cast or missing file may only fail at the action, far from the line that caused it.
    - **«explain()»** shows the plan without running it: use it.
    - **Timing code** around transformations measures nothing; time the action.
    - **Non-deterministic sources** (reading a live table twice) can give different results for two actions on the same DataFrame.

    ## How interviewers test this
    - "What is lazy evaluation and why does Spark use it?"
    - "Which of these are actions?"
    - "My job reads the source twice. Why?" Two actions on an uncached DataFrame.
  `, {
    check: [
      multi('Which are actions?', ['df.count()', 'df.filter(...)', 'df.write.saveAsTable("t")', 'df.groupBy("a").agg(...)'], [0, 2], 'filter and groupBy().agg() are lazy transformations.'),
      mcq('You call «df.count()» and then «df.write.save(...)» on an uncached DataFrame built from a big join. What happens?', ['The join runs once', 'The whole plan, including reading and joining, runs twice', 'The write uses the count\'s result', 'Error'], 1, 'Cache/persist if you really need several actions on the same expensive result.'),
      tf('A typo in a column name used inside a transformation can go unnoticed until an action runs.', false, 'Analysis errors (unknown column) are raised when the DataFrame is defined, because Spark resolves the schema eagerly. Data errors (bad casts, missing files at read time) do appear only at the action.'),
    ],
    hands: [
      spark({ q: `Build the plan for "approved claims per dealer region" (join «claims» to «dealers», keep status «Approved», count per «region» as «approved_claims»), assign it to «result», and call «result.explain()». Notice nothing runs until the platform shows the result (the action).`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
result = (claims.filter(F.col("status") == "Approved")
  .join(dealers, "dealer_id")
  .groupBy("region")
  .agg(F.count("*").alias("approved_claims")))
result.explain()`, hint: 'filter → join → groupBy("region").agg(F.count("*").alias("approved_claims"))' }),
    ],
  }),

  // ================================================================== DAG, jobs, stages, tasks
  dag: T(`
    > **In one line:** on an action, Spark turns your plan into a **DAG** of operations, splits it into **stages** at every **shuffle**, and runs each stage as many **tasks** (one per partition). **Job → stages → tasks** is the vocabulary you use to read the Spark UI and explain performance.

    ## The hierarchy
    | Level | Created by | Count |
    |---|---|---|
    | **Application** | One SparkSession / submitted program | 1 |
    | **Job** | Each action (count, write…) | One per action (sometimes more, e.g. schema inference) |
    | **Stage** | Split at shuffle boundaries (wide transformations) | Several per job |
    | **Task** | One per partition of the stage | Hundreds to thousands per stage |

    ## How stages form
    Spark pipelines consecutive **narrow** transformations (filter, select, withColumn, map) into one stage: each task reads its partition and applies all of them in a single pass (whole-stage code generation). A **wide** transformation (groupBy, join, distinct, repartition) needs a shuffle, so the stage ends after writing shuffle files and a new stage starts by reading them.

    Example: «read claims → filter → join dealers (shuffle) → groupBy region (shuffle) → write»:
    - Stage 1: read claims, filter, write shuffle by dealer_id.
    - Stage 2: read dealers, write shuffle by dealer_id.
    - Stage 3: join, partial aggregate, write shuffle by region.
    - Stage 4: final aggregate, write output.
    (With a broadcast join, stages 1-3 collapse because the join needs no shuffle.)

    ## Reading the Spark UI (what to look at)
    - **Jobs tab:** which action is slow.
    - **Stages tab:** duration per stage, input size, **shuffle read/write**, **spill**, number of tasks.
    - **Task metrics distribution:** min/median/max duration and input; a max far above median = **skew**.
    - **SQL tab:** the physical plan with metrics per operator (rows output, time), join strategies chosen, AQE changes.
    - **Executors tab:** GC time, memory, failed tasks.

    ## Edge cases and what goes wrong
    - **Too many stages** from unnecessary repartitions or orderBys.
    - **Recomputed stages** because nothing is cached and several actions reuse the same plan.
    - **Skipped stages** (grey in the UI) are good: Spark reused shuffle files from an earlier job.
    - **Very long lineage** (iterative loops building on the previous DataFrame) makes planning slow: checkpoint or write intermediate results.

    ## How interviewers test this
    - "Explain job, stage, task." Action → shuffle boundaries → partitions.
    - "How many stages does this code create?" Count shuffles (+1).
    - "How do you find the bottleneck of a slow Spark job?" Spark UI: slowest stage, shuffle sizes, spill, task skew, plan.
  `, {
    check: [
      mcq('What creates a new stage in a Spark job?', ['Every transformation', 'A shuffle (wide transformation)', 'Every column', 'Every file'], 1, 'Narrow operations are pipelined inside one stage.'),
      mcq('How many tasks does a stage reading 400 input partitions run?', ['1', '4', '400', 'One per executor'], 2, 'One task per partition.'),
      tf('Grey "skipped" stages in the Spark UI mean Spark reused existing shuffle output instead of recomputing.', true, 'A sign of reuse, not of a problem.'),
      order('Order Spark\'s execution hierarchy from largest to smallest.', ['Application', 'Job (per action)', 'Stage (between shuffles)', 'Task (per partition)'], 'Action → job; shuffles → stages; partitions → tasks.'),
    ],
  }),
};
