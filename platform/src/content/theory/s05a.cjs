const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Big data and the 5 Vs
  bigdata: T(`
    > **In one line:** "big data" is data that **one ordinary machine cannot store or process in the time you need**, because of its **volume, velocity or variety**. The **5 Vs** (volume, velocity, variety, veracity, value) describe what makes it hard and what makes it worth it.

    ## The 5 Vs, with what each forces you to do
    | V | Meaning | Apex Engines example | Engineering consequence |
    |---|---|---|---|
    | **Volume** | How much | 864 M sensor readings/day, 15 TB/year | Distributed storage and compute, partitioning, compression, lifecycle tiers |
    | **Velocity** | How fast it arrives / must be used | Readings every second; alerts within a minute | Streaming, buffering (Kafka), incremental processing |
    | **Variety** | How many shapes | Tables, JSON events, PDFs, photos, logs | Schema-on-read landing, flexible formats, specialised processing |
    | **Veracity** | How trustworthy | Sensors drift, clocks wrong, duplicates | Validation, quality checks, deduplication, provenance |
    | **Value** | Is it worth processing? | Predicting failures saves warranty cost | Prioritise, retain what has value, measure outcomes |
    Some lists add **variability** (changing meaning/rates) and **visualisation**; the first five are the standard.

    ## When is data "big"? (the honest answer)
    It is relative to the tools and the time budget:
    - 50 GB fits in memory on one modern machine; DuckDB or Polars process it in minutes. Not big.
    - 5 TB per day, or a query that must scan 100 TB in a minute, or 1 million events per second: big.
    A senior engineer does **not** reach for a cluster by reflex. Distributed systems add cost and complexity; use them when a single machine (scaled up) truly cannot meet the need.

    ## How big data systems work: the core ideas
    1. **Distribute storage:** split data into blocks/files spread across many machines (HDFS, object storage).
    2. **Move compute to data (data locality)** or read in parallel from object storage.
    3. **Divide and conquer:** split the work into many independent tasks (map), combine results (reduce/aggregate).
    4. **Tolerate failure:** with thousands of machines, failures are constant; replicate data, retry tasks, recompute lost results.
    5. **Scale horizontally:** add machines to add capacity.
    These ideas came from Google's GFS and MapReduce papers (2003-2004), became Hadoop, then evolved into Spark, cloud object storage and lakehouses.

    ## How interviewers test this
    - "What are the 5 Vs? Give an example of each from IoT."
    - "Is 100 GB big data?" Show judgement: it depends on the time budget and tools; often no.
  `, {
    check: [
      match('Match each V to its consequence.', [['Volume', 'Distributed storage and partitioning'], ['Velocity', 'Streaming and incremental processing'], ['Variety', 'Flexible formats and schema-on-read landing'], ['Veracity', 'Validation and deduplication']], 'Each V forces different engineering.'),
      tf('A 40 GB dataset always needs a Spark cluster.', false, 'It often fits on one machine with DuckDB/Polars or a single-node Spark. Use clusters when needed.'),
      mcq('Which idea is common to Hadoop, Spark and cloud lakehouses?', ['Everything on one big server', 'Split data and work across many machines and tolerate machine failures', 'No files', 'Only SQL'], 1, 'Divide, parallelise, tolerate failure.'),
    ],
  }),

  // ================================================================== Distributed computing
  distcomp: T(`
    > **In one line:** distributed computing splits one job across **many machines** that work **in parallel** and communicate over a network. You gain capacity and fault tolerance; you pay with **network cost, coordination, partial failures and consistency problems** that a single machine never has.

    ## How a distributed job works (the general pattern)
    «««flow
    Coordinator (driver/master) plans the job -> splits input into partitions -> workers process partitions in parallel -> exchange data (shuffle) when needed -> combine results -> write output
    »»»
    - A **coordinator** decides what runs where and tracks progress.
    - **Workers** do the actual computation on their partitions.
    - **Partitions** are the unit of parallelism.
    - **Shuffles** move data between workers when an operation needs all records with the same key together (group by, join).

    ## The fallacies of distributed computing (why it is hard)
    Engineers new to distributed systems assume: the network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology doesn't change, there is one administrator, transport cost is zero, the network is homogeneous. **All false.** Consequences:
    - **Partial failure:** some machines fail while others continue; you may not know whether a remote operation happened.
    - **No global clock:** machines' clocks drift; ordering events across machines by timestamp is unreliable.
    - **Network is the bottleneck:** moving data costs far more than computing on it.
    - **Stragglers:** one slow machine delays the whole stage.

    ## Design principles that follow
    1. **Minimise data movement:** filter and project early; broadcast small tables; avoid unnecessary shuffles.
    2. **Make tasks independent and deterministic** so they can be retried anywhere.
    3. **Make outputs idempotent / committed atomically** so retried tasks do not duplicate.
    4. **Balance partitions** (avoid skew) so no worker gets far more work.
    5. **Expect and handle failures** with retries, speculation (run a slow task twice), checkpoints.
    6. **Prefer coarse-grained parallelism:** fewer, larger tasks beat millions of tiny ones (scheduling overhead).

    ## Parallelism models
    - **Data parallelism:** same operation on different chunks (Spark, MapReduce). The data-engineering default.
    - **Task parallelism:** different operations at the same time (independent pipeline branches in a DAG).
    - **Pipeline parallelism:** stages of a stream processed concurrently.

    ## Edge cases and what goes wrong
    - **Driver as bottleneck:** collecting results to the coordinator (Spark «collect()» on a big dataset) crashes it.
    - **Non-determinism:** a task using random numbers or the current time gives different results when retried.
    - **Side effects inside tasks** (calling an API per row) are repeated on retry and multiply load.
    - **Clock-based ordering** across machines misorders events.

    ## How interviewers test this
    - "What makes distributed systems hard?" Partial failure, network cost, no global clock, coordination, stragglers.
    - "How do you design a job to run well on a cluster?" The principles above.
  `, {
    check: [
      mcq('In most distributed data jobs, what is the most expensive resource to waste?', ['CPU cycles', 'Network data movement (shuffles)', 'Disk space', 'Logging'], 1, 'Moving data between machines costs far more than computing on it.'),
      mcq('A Spark task calls an external API for each row. A task fails and is retried. What happens?', ['Nothing special', 'The API calls for that partition are repeated, so side effects and load are duplicated', 'Spark caches the calls', 'The job stops'], 1, 'Tasks must be safe to retry; side effects inside tasks need idempotency or a different design.'),
      tf('Ordering events across many machines by their local timestamps is reliable.', false, 'Clocks drift. Use logical ordering (offsets, sequence numbers) where order matters.'),
    ],
  }),

  // ================================================================== Distributed storage
  diststore: T(`
    > **In one line:** distributed storage spreads data across many machines so it can grow without limit, survive machine loss and be read in parallel. The two families you meet are **distributed file systems** (HDFS) and **object storage** (S3, ADLS Gen2, GCS), with object storage now the default for data lakes.

    ## Distributed file system (HDFS)
    - Files split into large **blocks** (128 MB default), each **replicated** (3 copies) on different machines/racks.
    - A **NameNode** keeps the metadata (which blocks make up which file, where they are); **DataNodes** store blocks.
    - Compute runs on the same machines (**data locality**).
    - Real directories and renames; appends; strong consistency.
    - Scaling storage means adding machines (compute and storage coupled).

    ## Object storage (S3, Azure Blob/ADLS Gen2, GCS)
    - Data stored as **objects** (key → bytes + metadata) in **buckets/containers**; "folders" are just key prefixes (ADLS Gen2 adds a true hierarchical namespace).
    - Massive durability (designed for 11 nines) by replicating/erasure-coding across devices and zones.
    - Accessed over HTTP APIs; virtually unlimited capacity; pay per GB-month and per request.
    - **Separation of storage and compute:** any number of clusters, warehouses or tools read the same data; compute can be shut down while storage remains.
    - Lifecycle tiers (hot, cool, archive), versioning, encryption, fine-grained access.

    ## HDFS vs object storage
    | | HDFS | Object storage |
    |---|---|---|
    | Scaling | Add nodes (compute + storage together) | Independent, effectively unlimited |
    | Cost | Pay for machines 24/7 | Pay for what you store and request |
    | Durability | Replication (3×) within a cluster | Very high, multi-zone |
    | Operations | You run NameNodes and DataNodes | Managed by the cloud |
    | Rename / atomic directory ops | Yes, fast | Historically no (copy + delete); ADLS Gen2 HNS supports atomic rename |
    | Small files | NameNode memory pressure | Request overhead and listing cost |
    | Latency per request | Low (local) | Higher (HTTP), throughput via parallelism |
    That last row is why **table formats** (Delta, Iceberg) exist: object stores lack atomic multi-file commits and fast listing, so a transaction log provides them.

    ## Edge cases and what goes wrong
    - **Small files** in either system: metadata overhead dominates.
    - **"Rename as commit"** patterns from HDFS are not atomic on plain S3: jobs that write to a temp folder and rename can expose partial data. Use table formats or committers designed for object stores.
    - **Request costs and throttling:** millions of tiny GETs/LISTs cost money and hit rate limits (per-prefix limits on S3).
    - **Egress costs** when reading data across regions or clouds.
    - **Eventual consistency** used to affect S3 listings (S3 is now strongly consistent for reads after writes; other stores and caches may differ).

    ## How interviewers test this
    - "HDFS vs S3/ADLS for a data lake?" Decoupled storage/compute, cost, durability, ops; why table formats are needed on object storage.
    - "What is data locality and is it still relevant?" Less so with object storage; parallel network reads replace it.
  `, {
    check: [
      mcq('What is the main architectural advantage of object storage for data lakes?', ['Lower latency per request than local disk', 'Storage separated from compute: scale and pay for each independently, many engines share the data', 'Atomic directory renames everywhere', 'No cost'], 1, 'Decoupling is the big shift from Hadoop clusters.'),
      mcq('Why do lakehouses add a transaction log on top of object storage?', ['To compress data', 'Object storage lacks atomic multi-file commits and fast listing, so the log provides atomic, consistent table versions', 'To encrypt data', 'To replace Parquet'], 1, 'The log is the commit mechanism.'),
      tf('In HDFS, each block is replicated (3 copies by default) on different machines and racks.', true, 'Replication gives durability and parallel reads.'),
    ],
  }),

  // ================================================================== Cluster architecture
  cluster: T(`
    > **In one line:** a cluster is a group of machines working as one system: a **master/driver** that coordinates, **worker** nodes that execute, and a **resource manager** that allocates CPU and memory. In Spark: one **driver** plans and schedules; many **executors** on worker nodes run tasks.

    ## The roles
    | Role | Spark | Hadoop/YARN | Kubernetes |
    |---|---|---|---|
    | Coordinator of one application | **Driver** (SparkContext/SparkSession, builds the plan, schedules tasks) | ApplicationMaster | Driver pod |
    | Resource manager for the cluster | Cluster manager: Standalone, YARN, Kubernetes | **ResourceManager** | Kubernetes control plane |
    | Machine-level agent | Worker | **NodeManager** | kubelet |
    | Unit doing work | **Executor** (JVM process with cores and memory, runs tasks, caches data) | Container | Executor pod |
    | Smallest unit of work | **Task** (one partition) | Map/reduce task | Task |

    ## How a Spark application runs on a cluster
    1. You submit the app; the **driver** starts.
    2. The driver asks the cluster manager for **executors** (e.g. 20 executors × 4 cores × 16 GB).
    3. Your code builds a logical plan; on an action, the driver turns it into **jobs → stages → tasks** (one task per partition).
    4. The driver sends tasks to executor cores; executors read data, compute, shuffle, write.
    5. The driver tracks progress, retries failed tasks, and collects small results.
    6. On finish, executors are released.

    ## Sizing basics
    - **Parallelism** = total executor cores. 20 executors × 4 cores = 80 tasks at once.
    - **Partitions** should be several times the core count (2-4×) so cores stay busy, each partition ideally ~100-200 MB.
    - **Executor memory** holds working data, shuffle buffers and cache; too small → spill to disk or out-of-memory; too large → long GC pauses. 4-5 cores per executor is a common sweet spot.
    - **Driver memory** only needs to be large if you collect results or broadcast large tables.
    - **Autoscaling** adds/removes workers based on pending tasks; **spot/preemptible** nodes cut cost but can disappear (Spark recomputes lost work).

    ## Managed clusters
    Databricks, EMR, Dataproc, Synapse Spark and HDInsight provision clusters for you: choose node types, autoscaling range, runtime version. **Job clusters** (created per job, terminated after) are cheaper and isolated; **all-purpose clusters** are for interactive work. Serverless options hide clusters entirely.

    ## Edge cases and what goes wrong
    - **Driver OOM** from «collect()», «toPandas()» or broadcasting a big table.
    - **Executor OOM** from skewed partitions or huge cached data.
    - **Idle executors** because there are fewer partitions than cores.
    - **Lost executors on spot nodes** causing recomputation; very long lineage makes it expensive (checkpoint).
    - **Noisy neighbours** on shared all-purpose clusters.

    ## How interviewers test this
    - "Explain the Spark driver and executors." Roles, how tasks are scheduled.
    - "What decides how many tasks run in parallel?" Total executor cores; partitions decide how many tasks exist.
    - "Job cluster vs all-purpose cluster?"
  `, {
    check: [
      mcq('20 executors with 4 cores each. How many tasks can run at the same time?', ['20', '4', '80', 'Unlimited'], 2, 'One task per core at a time.'),
      mcq('Calling «df.collect()» on a 50 GB DataFrame most likely…', ['Speeds up the job', 'Crashes the driver with out-of-memory, because all rows are sent to one process', 'Is ignored', 'Runs on executors only'], 1, 'Write results to storage; collect only small results.'),
      match('Match the Spark term.', [['Driver', 'Plans the job and schedules tasks'], ['Executor', 'Process on a worker that runs tasks and caches data'], ['Task', 'Work on one partition'], ['Cluster manager', 'Allocates resources (YARN, Kubernetes, Standalone)']], 'Know the moving parts.'),
      tf('A job cluster is created for one job and terminated afterwards, which is usually cheaper and more isolated than a shared all-purpose cluster.', true, 'Use all-purpose clusters for interactive work.'),
    ],
  }),

  // ================================================================== Parallelism and partitioning
  parallel: T(`
    > **In one line:** parallel processing splits data into **partitions** and processes them **at the same time** on many cores. How data is partitioned, **how many** partitions, **how big**, and **by what key**, decides whether a job is fast, slow or crashes.

    ## Partitions in Spark
    - A DataFrame is a set of partitions; **one task processes one partition**.
    - **Input partitions** come from files: roughly one per file block/row group, controlled by «spark.sql.files.maxPartitionBytes» (default 128 MB).
    - **Shuffle partitions** are created by wide operations (groupBy, join): «spark.sql.shuffle.partitions» (default 200), now often adjusted automatically by **AQE** (adaptive query execution coalesces small ones, splits skewed ones).
    - **Output files:** each partition writes at least one file.

    ## Getting the number right
    | Too few partitions | Too many partitions |
    |---|---|
    | Idle cores (8 partitions on 80 cores) | Scheduling overhead dominates (millions of tiny tasks) |
    | Huge partitions → spills, OOM | Thousands of tiny output files |
    | Stragglers dominate | Driver memory pressure tracking tasks |
    Rules of thumb: partitions ≈ 2-4 × total cores, and ~100-200 MB each; let AQE tune shuffle partitions.

    ## repartition vs coalesce
    - «repartition(n)» or «repartition(col)»: **full shuffle**, balances data, can increase or decrease partitions, can partition by key (useful before writing partitioned tables or for joins).
    - «coalesce(n)»: merges partitions **without a full shuffle**, only decreases; cheap but can create uneven partitions and reduce upstream parallelism if used early.
    Typical use: «coalesce» before writing a small result to avoid many tiny files; «repartition(col)» before a partitioned write so each output partition gets few, large files.

    ## Partitioning by key
    Operations on the same key need the data together. Spark hash-partitions by key during shuffles. If data is already partitioned/bucketed by the join key, a shuffle can be avoided (bucketing, storage-partitioned joins).

    ## Edge cases and what goes wrong
    - **One giant gzip file** → 1 partition → 1 task.
    - **«coalesce(1)»** early in a pipeline forces the whole computation onto one core.
    - **Skewed key** → one partition far bigger than others (next topics).
    - **Many small input files** → thousands of tiny partitions; compact files.
    - **Partition count changes between environments** (dev small data, prod big data) with fixed settings.

    ## How interviewers test this
    - "repartition vs coalesce?"
    - "How many partitions should a job have?"
    - "Why does my job write 10,000 tiny files and how do I fix it?" Shuffle partitions × output partitions; repartition by output partition column, coalesce, AQE, optimize/compaction.
  `, {
    check: [
      mcq('Which reduces the number of partitions without a full shuffle?', ['repartition(10)', 'coalesce(10)', 'groupBy', 'sortBy'], 1, 'coalesce merges existing partitions; it can only decrease and may unbalance them.'),
      mcq('A job reads 2,000 files of 1 MB each. What is the likely issue?', ['Too few partitions', 'Too many tiny partitions/tasks; overhead dominates (compact the files)', 'Skew', 'No issue'], 1, 'Small files create tiny tasks and slow listing.'),
      tf('«coalesce(1)» placed early in a transformation can force the rest of the work onto a single task.', true, 'Use it only at the end, for small outputs.'),
    ],
    hands: [
      py({ q: 'Hash partitioning, the way engines distribute keys. Write «assign(keys, n)» returning a dict «{partition: [keys]}» using «partition = stable_hash(key) % n» where «stable_hash» is the sum of the character codes («ord») of «str(key)» (a toy stable hash: Python\'s «hash()» is randomised per process). Keys keep their input order inside each partition; include **only non-empty** partitions. Then write «skew_ratio(parts)»: largest partition size divided by the average partition size (over non-empty partitions), rounded to 2 dp.', starter: 'def assign(keys, n):\n    pass\n\ndef skew_ratio(parts):\n    pass\n',
        tests: `p = assign(['a', 'b', 'c', 'd'], 2)
assert p == {1: ['a', 'c'], 0: ['b', 'd']}, p
assert skew_ratio(p) == 1.0
hot = assign(['x'] * 8 + ['y', 'z'], 4)
assert sorted(len(v) for v in hot.values()) == [1, 1, 8], hot
assert skew_ratio(hot) == 2.4, skew_ratio(hot)
assert assign([], 3) == {}`,
        solution: `def stable_hash(key):
    return sum(ord(ch) for ch in str(key))

def assign(keys, n):
    parts = {}
    for k in keys:
        parts.setdefault(stable_hash(k) % n, []).append(k)
    return parts

def skew_ratio(parts):
    sizes = [len(v) for v in parts.values() if v]
    return round(max(sizes) / (sum(sizes) / len(sizes)), 2)` }),
    ],
  }),
};
