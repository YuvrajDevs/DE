const { T } = require('../_t.cjs');

module.exports = {
  bigdata: T(`
    > **In one line:** "big data" is data that **one ordinary machine can't store or process in the time you need**, because of its **volume, velocity or variety**. The **5 Vs** say what makes it hard and what makes it worth it.

    | V | Meaning | Apex Engines example | Consequence |
    |---|---|---|---|
    | Volume | How much | 864 M readings/day, 15 TB/year | Distributed storage/compute, partitioning, compression, lifecycle tiers |
    | Velocity | How fast it arrives / must be used | Readings every second; alerts within a minute | Streaming, Kafka buffering, incremental processing |
    | Variety | How many shapes | Tables, JSON, PDFs, photos, logs | Schema-on-read landing, flexible formats |
    | Veracity | How trustworthy | Sensor drift, wrong clocks, duplicates | Validation, quality checks, dedupe, provenance |
    | Value | Worth processing? | Predicting failures saves warranty cost | Prioritise, retain what has value, measure outcomes |
    Some lists add variability and visualisation; these five are standard.

    **When is it "big"?** Relative to tools and time budget. A modern single machine (64 cores, 512 GB RAM, NVMe) with DuckDB/Polars handles **hundreds of GB** in minutes: not big. Big = multi-TB, 5 TB/day, scanning 100 TB in a minute, a million events/s, throughput beyond one machine's I/O (several GB/s), many teams sharing a platform, or continuous streaming needing HA. Seniors **don't reach for a cluster by reflex**: distribution costs money and complexity.

    **The real hard parts are rarely volume alone:** variety (hundreds of sources/schemas), velocity (latency SLOs), veracity (quality at scale) and organisational scale drive most architecture. **Cost is a design dimension:** a 10 TB daily scan adds up; pruning, clustering, incremental processing and right-sized compute cut bills 5-10×.

    **Core ideas:** (1) distribute storage in blocks/files (HDFS, object storage); (2) move compute to data or read in parallel from object storage; (3) divide and conquer (map, then reduce/aggregate); (4) tolerate failure (replicate, retry, recompute); (5) scale horizontally. From Google's GFS and MapReduce papers (2003-04) → Hadoop → Spark, object storage, lakehouses.

    **Interview:** the 5 Vs with IoT examples; "is 100 GB big data?" (depends on time budget and tools; usually no).
  `),

  distcomp: T(`
    > **In one line:** distributed computing splits one job across **many machines working in parallel** over a network. You gain capacity and fault tolerance; you pay with **network cost, coordination, partial failures and consistency problems** a single machine never has.

    «««flow
    Coordinator (driver) plans -> splits input into partitions -> workers process in parallel -> shuffle when needed -> combine -> write
    »»»
    **Coordinator** decides what runs where and tracks progress; **workers** compute; **partitions** are the unit of parallelism; **shuffles** move data so all records with one key meet (group by, join).

    **Fallacies of distributed computing** (all false): the network is reliable, latency is zero, bandwidth is infinite, it's secure, topology doesn't change, one administrator, transport is free, the network is homogeneous. So:
    - **Partial failure** is the defining property: some nodes fail while others continue, you can't always tell slow from dead, or know if a remote operation happened → every design answers with timeouts, retries, idempotency and who decides.
    - **No global clock:** clocks drift; ordering across machines by timestamp is unreliable.
    - **Network is the bottleneck:** moving data costs far more than computing on it.
    - **Stragglers:** the slowest task sets stage time (skew, bad node, GC, noisy neighbours) → speculative execution («spark.speculation» runs a slow task twice; outputs must be idempotent), fix skew, remove bad nodes.

    ## Design principles
    1. **Minimise data movement:** filter/project early, broadcast small tables, avoid needless shuffles.
    2. **Independent, deterministic tasks** retryable anywhere.
    3. **Idempotent / atomically committed outputs.**
    4. **Balanced partitions** (no skew).
    5. **Handle failure:** retries, speculation, checkpoints.
    6. **Coarse-grained parallelism:** fewer larger tasks beat millions of tiny ones.

    - **Coordination is expensive:** consensus (ZooKeeper, KRaft/Raft in Kafka) is for metadata, leadership, config, never per record; designs needing global coordination per record don't scale.
    - **Amdahl's law:** the serial part (driver-side collect, a single-partition window, a final sort into one file) caps speed-up whatever the cluster size.
    - **Data locality** mattered with HDFS; with object storage compute and storage are separate, so network bandwidth and caching (Databricks disk cache) matter instead.

    **Parallelism models:** **data** (same op on chunks: Spark, the DE default), **task** (independent DAG branches), **pipeline** (stream stages concurrently).

    ## What goes wrong
    - Driver bottleneck («collect()» on big data crashes it).
    - Non-determinism (random, current time) differs on retry.
    - Side effects in tasks (API per row) repeat on retry and multiply load.
    - Clock-based ordering misorders events.

    **Interview:** what makes it hard (partial failure, network cost, no global clock, coordination, stragglers); designing a job for a cluster (principles above).
  `),

  diststore: T(`
    > **In one line:** distributed storage spreads data across machines so it grows without limit, survives machine loss and reads in parallel. Two families: **distributed file systems** (HDFS) and **object storage** (S3, ADLS Gen2, GCS), now the default for lakes.

    **HDFS:** files split into 128 MB **blocks**, each **replicated 3×** across machines/racks; a **NameNode** holds metadata (which blocks, where), **DataNodes** store blocks; compute runs on the same machines (**data locality**); real directories, renames, appends, strong consistency; storage and compute scale together.

    **Object storage:** **objects** (key → bytes + metadata) in buckets/containers; "folders" are key prefixes (ADLS Gen2's **hierarchical namespace** adds real directories, atomic renames and POSIX-like ACLs, important for Hadoop-style commits and fine security on Azure); designed for 11 nines durability (replication/erasure coding across devices and zones); HTTP APIs; unlimited capacity; pay per GB-month and per request; **storage separate from compute** (any number of engines read the same data; compute can shut down); tiers, versioning, encryption.

    | | HDFS | Object storage |
    |---|---|---|
    | Scaling | Add nodes (compute + storage) | Independent, unlimited |
    | Cost | Machines 24/7 | Storage + requests |
    | Durability | 3× within a cluster | Very high, multi-zone |
    | Ops | You run NameNodes/DataNodes | Managed |
    | Rename / atomic dir ops | Yes, fast | No on S3 (copy + delete per object); yes on ADLS Gen2 HNS |
    | Small files | NameNode memory pressure | Request and listing cost |
    | Latency | Low (local) | Higher (HTTP); throughput via parallelism |
    That rename row is why **table formats** (Delta, Iceberg) exist: object stores lack atomic multi-file commits and fast listing, so a transaction log provides them.

    **Semantics now:** S3 (since 2020), ADLS Gen2 and GCS are strongly consistent for reads-after-writes and listings (old systems/caches may differ). S3 has **per-prefix rate limits** (~3,500 writes / 5,500 reads per second per prefix).

    **Costs:** GB-months are cheap; **requests** (LIST/GET per small file) and **egress** (cross-region/cloud reads) surprise. Small files multiply request costs and hit throttling. **Tiers:** hot/cool/archive with lifecycle policies; archive needs **hours of rehydration**, so never put queried tables there. **Durability ≠ availability:** region outages happen → geo-redundant storage (GRS/RA-GRS) for DR.

    **What goes wrong:** small files in either system; HDFS-style **rename-as-commit** isn't atomic on plain S3 (temp folder + rename exposes partial data) → table formats or object-store committers.

    **Interview:** HDFS vs S3/ADLS for a lake (decoupling, cost, durability, ops, why table formats); is data locality still relevant (less so: parallel network reads replace it).
  `),

  cluster: T(`
    > **In one line:** a cluster is machines acting as one system: a **driver/master** coordinates, **workers** execute, a **resource manager** allocates CPU and memory. In Spark: one **driver** plans and schedules, many **executors** run tasks.

    | Role | Spark | Hadoop/YARN | Kubernetes |
    |---|---|---|---|
    | Coordinates one app | **Driver** (SparkSession; builds plan, schedules) | ApplicationMaster | Driver pod |
    | Cluster resource manager | Standalone, YARN or K8s | **ResourceManager** | Control plane |
    | Machine agent | Worker | **NodeManager** | kubelet |
    | Does work | **Executor** (JVM with cores + memory; runs tasks, caches) | Container | Executor pod |
    | Smallest unit | **Task** (one partition) | Map/reduce task | Task |

    **A run:** submit → driver starts → requests executors (e.g. 20 × 4 cores × 16 GB) → on an action, plan becomes **jobs → stages → tasks** (one per partition) → tasks sent to executor cores (read, compute, shuffle, write) → driver tracks, retries failures, collects small results → executors released.

    ## Sizing
    - **Parallelism = total executor cores** (20 × 4 = 80 tasks at once); partitions decide how many tasks exist.
    - **Partitions** 2-4× cores, ~100-200 MB each.
    - **Executor memory:** working data, shuffle buffers, cache. Too small → spill/OOM; too large → long GC. **4-5 cores per executor** is a common sweet spot.
    - **Driver memory** matters only if you collect or broadcast big tables.

    **Autoscaling / dynamic allocation** adds executors when tasks queue, removes idle ones; needs shuffle data to survive removal (external shuffle service, or decommissioning that migrates blocks). Good for bursty batch; streaming and heavily cached jobs prefer fixed sizes. **Spot/preemptible** workers cut cost 60-90% but vanish: fine for idempotent batch with retries; keep the **driver on on-demand**. The **driver is a single point of failure**: a dead driver kills the app → orchestrator retries, streaming checkpoints.

    **Managed:** Databricks, EMR, Dataproc, Synapse/Fabric Spark, HDInsight (node types, autoscale range, runtime). **Job clusters** (per job, then terminated) are cheaper and isolated: production runs here; **all-purpose clusters** for interactive work (shared → noisy neighbours, use policies); **serverless** hides clusters.

    ## What goes wrong
    - Driver OOM from «collect()», «toPandas()», big broadcasts.
    - Executor OOM from skewed partitions or huge caches.
    - Idle cores: fewer partitions than cores.
    - Lost spot executors → recomputation; long lineage makes it costly (checkpoint).

    **Interview:** driver vs executors and scheduling; what decides parallel tasks (cores; partitions decide task count); job vs all-purpose cluster.
  `),

  parallel: T(`
    > **In one line:** parallel processing splits data into **partitions** processed **at once** on many cores. **How many**, **how big** and **by what key** decides whether a job is fast, slow or crashes.

    **In Spark:** one task per partition. **Input partitions** come from files (~one per block/row group, «spark.sql.files.maxPartitionBytes» = 128 MB). **Shuffle partitions** from wide ops («spark.sql.shuffle.partitions» = 200), now tuned by **AQE** (coalesces small, splits skewed). Each partition writes **at least one output file**.

    | Too few | Too many |
    |---|---|
    | Idle cores (8 partitions, 80 cores) | Scheduling overhead (fixed per-task cost: scheduling, deserialisation, file open) |
    | Huge partitions → spill, OOM | Thousands of tiny output files |
    | Stragglers dominate | Driver pressure; thousands of sub-second tasks make it the bottleneck |
    Rule: **2-4× total cores, ~100-200 MB each**, let AQE tune shuffles.

    **repartition vs coalesce:**
    - «repartition(n)» / «repartition(col)»: **full shuffle**, balanced, up or down, by key (before partitioned writes or joins).
    - «coalesce(n)»: merges **without a full shuffle**, only down; cheap but uneven, and used early it cuts upstream parallelism.
    - Typical: «coalesce» before writing a small result; «repartition(col)» before a partitioned write so each output partition gets few large files.

    **By key:** same-key operations need data together; Spark hash-partitions on shuffle. «repartition('engine_id')» is a **co-location choice**: later per-key ops in the job are shuffle-free, but uneven keys cause skew. Pre-partitioned/bucketed data (bucketing, storage-partitioned joins) can skip a shuffle. **Range partitioning** («repartitionByRange», used by global sorts) samples to choose boundaries: good for sorted files and range queries, sensitive to sampling on skewed data.

    **Parallelism is capped by the narrowest point:** Kafka partitions, file count for non-splittable formats (**one giant gzip = one task**), JDBC numPartitions, a single-partition window, a **«coalesce(1)» early** (forces everything onto one core).

    **Also goes wrong:** skewed keys; many small input files → thousands of tiny partitions (compact); fixed partition settings across dev (small) and prod (big).

    **Interview:** repartition vs coalesce; how many partitions; "10,000 tiny files" (shuffle partitions × output partitions → repartition by the output column, coalesce, AQE, OPTIMIZE/compaction).
  `),

  shuffle: T(`
    > **In one line:** a **shuffle** redistributes data so **all records with one key land on the same machine**, as group-bys, joins, distinct and windows need. It's the most expensive thing a distributed job does: disk writes, network, serialisation and a hard stage boundary.

    **Why:** dealer 14's claims sit in 200 input partitions; «SUM(amount) GROUP BY dealer_id» needs them in one place.

    ## How it works (Spark, sort-based shuffle)
    1. **Map side (shuffle write):** each task computes the target partition per row («hash(key) % numShufflePartitions»), optionally **pre-aggregates** (partial sums per key: a combiner), sorts rows by target and writes one data file + an index to **local disk**.
    2. **Stage boundary:** the next stage waits for all map tasks.
    3. **Reduce side (shuffle read):** each task fetches its blocks from **every** map task over the network and merges. **M × R blocks**: 2,000 × 2,000 = 4 M fetches; 10,000 × 10,000 = 100 M tiny blocks, which is why too many partitions hurts.

    | Operation | Shuffles? |
    |---|---|
    | select, filter, withColumn, map, **coalesce** | No (narrow) |
    | groupBy/agg, distinct, dropDuplicates | Yes |
    | Sort-merge / shuffle-hash join | Yes, both sides |
    | **Broadcast join** | No shuffle of the big side |
    | Global orderBy | Yes (range partitioning) |
    | repartition; windows with PARTITION BY | Yes |

    ## Reducing cost
    1. Filter and select early (the optimiser pushes down a lot, not everything).
    2. **Broadcast** small tables (tens to hundreds of MB).
    3. **Pre-aggregate** facts to the join key before joining.
    4. No unnecessary repartition/orderBy; sort only at the end.
    5. Right-size partitions (AQE) and handle skew (AQE skew join, salting).
    6. **Reuse partitioning:** bucketing, storage-partitioned joins; Spark tracks «outputPartitioning» and skips an Exchange when it already matches.
    7. Compression/serialisation (lz4/zstd, Kryo/UnsafeRow) cut bytes; Tungsten/Photon work on binary rows to avoid object overhead.

    **In the Spark UI:** Shuffle Write/Read sizes, spill (memory/disk), per-task times. Trouble = shuffle larger than input, big spill, a few tasks far slower than the median (skew).

    ## What goes wrong
    - **Spill** when partitions exceed executor memory → more partitions or memory.
    - **Fetch failures:** shuffle files live on executor disks; losing the executor → «FetchFailedException» → map stage recomputed. External shuffle service, decommissioning, remote shuffle services (Celeborn, cloud-managed) help autoscaling/spot clusters.
    - 200 shuffle tasks of 1 KB each for small data.
    - Local disk full of shuffle files.

    **Interview:** what and why expensive; which ops shuffle, avoiding one in a join (broadcast); "400 GB shuffle write for 100 GB input" (exploding join on duplicate keys, missing pre-aggregation, needless repartitions).
  `),

  skew: T(`
    > **In one line:** **data skew** = some keys have **far more rows** than others, so after a shuffle one task gets a giant partition while the rest finish fast; the stage waits for that straggler. The most common cause of slow distributed jobs, and **more machines don't fix it**.

    **Recognise:** in the Spark UI most tasks take seconds, one or two take tens of minutes; max task input/shuffle read 50-100× the median; stuck at "199/200"; one executor OOM while others idle. **Measure:** max/median task duration and shuffle read per stage; top keys on a sample («groupBy(key).count().orderBy(desc).limit(20)»).

    **Causes:** hot keys (one dealer with 40% of claims, a dominant engine model, a default walk-in customer ID); **NULL/placeholder keys** (NULL, 0, "UNKNOWN", empty string: the most common hot keys, usually shouldn't be joined at all); time skew (one huge backfill day); **join amplification** (a hot key on both sides: 10,000 × 10,000 = 100 M rows). Also beyond joins: «groupBy» on a hot key (partial aggregation helps sums/counts, not «collect_list» or distinct counts), windows partitioned by a hot key, «partitionBy» writes of a hot value (one giant file/task), Kafka partitions keyed by a hot device.

    | Fix | How | When |
    |---|---|---|
    | Filter junk keys | Handle NULL/placeholder keys before the join | NULLs never match in inner joins anyway |
    | Broadcast join | Broadcast the small side | One side small |
    | **AQE skew join** | «spark.sql.adaptive.skewJoin.enabled» splits oversized partitions, replicates the matching side | Spark 3+ sort-merge joins; check the UI shows "skew" and split partitions |
    | Salting | Random suffix 0..N-1 on the big side's hot key; replicate the other side N times; join on (key, salt) | Large-large joins with hot keys |
    | Two-phase aggregation | Group by (key, salt), then by key | Skewed group-bys (decomposable aggregates) |
    | Isolate hot keys | Process top-N keys separately (broadcast their matching rows), union with the normal path | A few known giant keys; avoids blowing up the other side N× for every key |
    | Change key/grain | More even key | Design-level |

    **Salting step by step:** (1) big side «salt = int(rand() * N)», key = (dealer_id, salt); (2) other side «explode» into N copies with salt 0..N-1; (3) join on (dealer_id, salt): the hot dealer spreads over N tasks; (4) if aggregating, by (key, salt) then key. Cost: replicated side grows N× → N just big enough. For **distinct counts**, salt by a **hash of the distinct column** (not random) so duplicates land in one sub-group; hash-based salt also gives deterministic outputs on retry.

    ## What goes wrong
    - Adding executors: the giant partition still runs on one core.
    - **More shuffle partitions don't split one hot key** (all its rows hash to the same partition).
    - Skew in windows (PARTITION BY hot key) can't be salted easily → redesign or pre-aggregate.

    **Interview:** what/how to detect (UI task distribution); fixing a skewed join (broadcast, AQE, salting, isolate, filter NULLs); why more nodes/partitions don't help.
  `),

  faulttol: T(`
    > **In one line:** fault tolerance = **keep working correctly when parts fail**, via **keeping copies** (replication) and **being able to redo work** (recomputation from lineage, retries, checkpoints, replayable logs).

    | Strategy | How | Systems | Trade-off |
    |---|---|---|---|
    | Replication | Several copies of each block/partition/row | HDFS 3×, Kafka replication factor, object storage, DBs | Storage cost |
    | Recomputation | Remember how data was made, rebuild lost pieces | Spark lineage, MapReduce retries, replaying Kafka/bronze | Compute time |
    Plus **checkpointing** (save progress/state so recovery doesn't start from zero).

    ## By system
    - **HDFS:** dead DataNode → NameNode re-replicates from surviving copies; NameNode HA (standby + journal nodes).
    - **MapReduce:** failed tasks re-run elsewhere; map output on local disk, reduce output in HDFS.
    - **Spark:** lost partition recomputed from lineage (cheap for narrow chains, expensive after long chains/wide dependencies → checkpoint long iterative lineages); lost shuffle files → re-run that map stage; tasks retried (4 by default); speculation relaunches stragglers.
    - **Structured Streaming:** offsets + state checkpointed each micro-batch; restart resumes from the last committed batch; replayable source + idempotent/transactional sink = exactly-once results.
    - **Kafka:** partitions replicated; an in-sync follower takes over from a failed leader; consumers resume from committed offsets.
    - **Orchestrators:** task retries, re-run failed steps (safe if idempotent).

    **Output commit protocols:** tasks write to temp locations and only the driver commits successful attempts; on object storage without atomic rename that's slow or unsafe → Delta/Iceberg log-based commits or S3A magic committers. **Speculation + non-idempotent side effects** = duplicate external writes → speculate only on tasks whose output goes through the commit protocol.

    ## What goes wrong
    - Very long lineage → slow recomputation (checkpoint or write intermediates).
    - Non-deterministic sources ("latest" from an API) can't be recomputed identically → land data first.
    - Checkpoint deleted or reused by another query → duplicates/failures; incompatible query changes vs checkpoint.
    - **Correlated failures** (zone outage, a bad config/deploy on all nodes, a poison record) defeat replication and retries → zone spreading, canary deploys, per-record error isolation.

    **Interview:** Spark losing an executor (lineage recompute, map-stage re-run, retries); Structured Streaming crash recovery (checkpointed offsets/state, replay, idempotent sink); replication vs recomputation (storage vs compute).
  `),

  tputlat: T(`
    > **In one line:** **latency** = how long **one** item takes end to end; **throughput** = how **many** items per unit of time. Batching raises throughput but adds latency; tuning is choosing the point between them.

    **Intuition:** a bus (batch) moves 60 people efficiently but each waits for it to fill; taxis (per-event) leave at once but move fewer per unit cost.

    | Knob | More batching → | Less batching → |
    |---|---|---|
    | Kafka «linger.ms» / «batch.size» | Throughput, better compression, more latency | Lower latency, more requests |
    | Streaming trigger | Bigger efficient batches, fewer files | Fresher data, more overhead, small files |
    | DB inserts | Bulk 10,000 rows | Row by row |
    | APIs | Batch endpoints | One call per record |
    | Files | Fewer, larger | Many small |

    ## Measuring
    - **Latency as percentiles** (p50/p95/p99): the tail matters more than the average for SLAs/alerts; stragglers, GC and rebalances live there (Turbofan's report prints p50/p95/p99).
    - **Throughput** (records/s, MB/s) and **capacity**: max sustainable throughput before latency explodes. Load-test to find the **knee**; run below ~50-70% of it for headroom.
    - **Little's law:** items in system = throughput × latency. 10,000 events/s × 5 s ≈ 50,000 in flight (buffers, state, memory must hold them).
    - **Backpressure/lag:** input rate > throughput → queues and latency grow without bound; watch lag trends.

    **Design:** decide what matters (dashboards, ML training → throughput; alerts, user features → latency); batch at the boundaries (ingest, writes) where it's cheap; keep the latency-critical path short; **tune batching to the latency SLO, not to zero**.

    **Interview:** definitions + batching trade-off; "latency grows during the day" (input > throughput → lag, skew, state growth, small-file writes slowing; scale partitions/consumers, tune batching).
  `),

  eventual: T(`
    > **In one line:** **eventual consistency** = after a write, replicas may disagree for a while, but **with no new writes they converge**. It buys availability and low latency at the cost of **possibly stale reads**.

    | Model | Guarantee | Example |
    |---|---|---|
    | Linearizable (strong) | Every read sees the latest committed write | Leader reads; Spanner |
    | Sequential / causal | Consistent order; cause before effect | Some distributed DBs |
    | Read-your-writes | You see your own writes | Session guarantees |
    | Monotonic reads | Never see an older value after a newer one | Sticky sessions |
    | Eventual | Converge, no timing promise | DNS, Cassandra at ONE, caches, cross-region replication |
    **Read-your-writes and monotonic reads are what users notice:** a dashboard on a lagging replica shows a claim "not submitted" right after submission → route such reads to the primary or wait for replication.

    **Where DEs meet it:** read replicas and CDC targets lag the source; caches; cross-region replication; NoSQL at low consistency; microservices converging via events; and **the analytics platform itself** (gold lags silver lags source) → show **"data as of"** on every dashboard rather than pretending it's current.

    **Living with it:** know and monitor the staleness bound; **idempotent, order-tolerant** processing (versions, sequence numbers, last-write-wins **by version, not arrival**); reconcile periodically; strong consistency where it matters (financial postings, inventory reservation), eventual where it doesn't (dashboard counts, telemetry).

    **Conflicts when several places write:** **last-write-wins** by timestamp (simple, but clock skew drops real updates); **version vectors/vector clocks** (detect concurrent updates); **CRDTs** (counters/sets that merge automatically); app merge rules (union of tags, max amount). Most pipelines avoid it: **single writer per key + source sequence numbers**.

    **Interview:** what and where you'd accept it; "user saves, refreshes, sees old data" (lagging replica → leader reads or session consistency).
  `),

  cap: T(`
    > **In one line:** **CAP**: during a **network partition** a distributed system must choose **Consistency** (latest write or an error) or **Availability** (a non-error answer, possibly stale). Partitions happen, so the real choice is **CP vs AP** during failures. **PACELC** adds: **Else** (no partition), **Latency vs Consistency**.

    - **C** = linearizability (all nodes behave like one up-to-date copy); **not** ACID's C.
    - **A** = every request to a non-failed node gets a non-error response.
    - **P** = keeps operating while messages between nodes are lost. Not optional in real networks, so "CA" distributed systems don't exist (a single-node DB isn't "CA", it's just not distributed).

    **CP:** the minority side **refuses** what it can't guarantee (errors/timeouts) to avoid divergence: consensus systems (ZooKeeper, etcd, HBase, Spanner, CockroachDB, MongoDB majority writes). **AP:** both sides keep **answering**, maybe stale, reconcile later: Cassandra/DynamoDB at low consistency, DNS, caches. Many are **tunable** per request.

    **PACELC:** partitions are rare, latency is constant; strong consistency needs coordination (waiting for replicas/leader across regions) even when healthy. **PA/EL:** Cassandra, DynamoDB defaults. **PC/EC:** Spanner, HBase (higher write latency).

    **Tunable consistency (Cassandra):** replication factor N, read R, write W: **R + W > N** gives read-your-writes (QUORUM/QUORUM with N = 3); LOCAL_QUORUM keeps latency inside a data centre.

    ## Why a DE cares
    - Extracts from AP stores may be slightly stale/inconsistent across partitions.
    - Serving stores: a stale health score for 2 s is fine (AP); inventory reservation isn't (CP).
    - **Kafka:** «acks=all» + «min.insync.replicas=2» + «unclean.leader.election.enable=false» chooses consistency (producers get errors when too few replicas are in sync); unclean election chooses availability at the risk of data loss.
    - Multi-region analytics: async replication (AP), accept lag.

    **Interview:** CAP example (two DCs lose contact, a write arrives on one side: CP refuses/blocks, AP accepts and reconciles); Cassandra CP or AP (AP, tunable); what PACELC adds; "pick 2 of 3" is a misunderstanding.
  `),

  semantics: T(`
    > **In one line:** **at-most-once** may lose but never duplicates; **at-least-once** never loses but may duplicate; **exactly-once** = each message affects the result once. Real exactly-once is usually **at-least-once delivery + idempotent or transactional processing**.

    | Order of operations | Crash in between → | Semantics |
    |---|---|---|
    | Commit offset, **then** process/write | Message never processed | At-most-once |
    | Process/write, **then** commit offset | Processed again on restart | At-least-once |
    | Output **and** offset atomically, or idempotent write | No loss, no double effect | Effectively exactly-once |
    **Use:** at-most-once for metrics where small loss is fine (sampled telemetry for a live chart); at-least-once is the default (**must** dedupe/write idempotently downstream); exactly-once for money, billing counts, warranty claims.

    ## Achieving exactly-once (end to end or nothing)
    1. **Replayable source** with positions (Kafka offsets, processed-file list, bronze versions).
    2. **Checkpointed progress** (positions + state) and **deterministic processing**.
    3. **Idempotent sink** (MERGE on unique key, insert-if-absent by event_id, overwrite by partition/batch ID) or **transactional sink** (output + progress committed together).
    **Spark Structured Streaming → Delta** is exactly-once because offsets are checkpointed per micro-batch and the Delta sink records the batch ID in its log, so a replayed batch is skipped. Delta and the file sink (with its own log) are idempotent; **«foreachBatch» to arbitrary sinks is at-least-once** unless you use the batchId / MERGE.

    **Kafka EOS:** **idempotent producer** («enable.idempotence=true»: broker dedupes retries via producer ID + sequence numbers); **transactions** (write to several partitions and commit consumer offsets atomically; consumers with «isolation.level=read_committed» see only committed data). That's exactly-once **within Kafka** (consume-transform-produce); writing to an external DB is outside the transaction → idempotent upserts.

    ## What goes wrong
    - **Exactly-once inside, at-least-once at the edges:** alert emails/API calls re-sent on replay → idempotency keys / dedupe tables.
    - Changing or deleting the checkpoint → reprocess from scratch (duplicates) or from latest (loss).
    - **Duplicates already in the source** (device resends on timeout, connector restart, same event at different offsets): exactly-once processing doesn't remove them → dedupe by a producer-assigned event id.
    - Non-deterministic processing on replay.

    **Interview:** the commit-order table; Kafka → Delta exactly-once (checkpointed offsets + idempotent/transactional sink); **proving it** in Turbofan: kill mid-stream, restart, then count, distinct ids and missing ids against a manifest after injected crashes and duplicates.
  `),

  sizing: T(`
    > **In one line:** back-of-envelope sizing turns "10,000 engines sending data" into **events/s, bytes/day, storage/year, partitions and cluster size** in two minutes. Interviewers grade the reasoning, not the exact number.

    | Fact | Value |
    |---|---|
    | Seconds/day; /year | 86,400 ≈ 10^5; ≈ 3 × 10^7 |
    | KB / MB / GB / TB / PB | 10^3 / 10^6 / 10^9 / 10^12 / 10^15 bytes |
    | 1 M events/day | ≈ 12/s average; plan peaks 2-10× |
    | Parquet vs CSV / JSON | 5-10× smaller / 10×+ |
    | Replication | ×3 for HDFS/Kafka |
    | NVMe sequential read; node network | 2-7 GB/s; 10-100 Gb/s (1.25-12.5 GB/s) |
    | Spark simple transforms on Parquet | ~50-200 MB/s per core; ~100-200 MB input per task |
    | Kafka partition | ~5-10 MB/s write is a comfortable plan (can be far higher) |
    | Delta target file size | ~128 MB-1 GB |

    ## Method (say it aloud)
    1. **Clarify:** sources, event rate and size, retention, peak factor, query patterns.
    2. events/s = sources × rate → MB/s = × bytes/event → GB/day = × 86,400.
    3. Stored = × retention ÷ compression × replication.
    4. Derived: Kafka partitions (peak MB/s ÷ per-partition, plus headroom and consumer parallelism), Spark tasks (data per run ÷ 128 MB), cores (÷ per-core throughput), cost, query scan size.
    5. × peak and growth; state assumptions; sanity-check against known systems.

    **Worked example:** 10,000 engines × 1/s = **10,000 events/s**, peak ×3 = 30,000/s. × 500 bytes = 5 MB/s (15 MB/s peak) → **≈ 432 GB/day raw JSON** → Parquet ~8× smaller ≈ 54 GB/day ≈ 20 TB/year (object storage already replicates). Kafka: 15 MB/s ÷ ~5 = 3 → choose **12 partitions** for headroom and parallelism; 7 days raw = 432 GB × 7 × 3 replicas ≈ 9 TB broker storage. Daily batch: 54 GB ÷ 128 MB ≈ 420 tasks → ~100 cores finish in a few waves. (Variant: 50,000 engines × 200 bytes = 10 MB/s ≈ 864 GB/day ≈ 100 GB/day Parquet; 30 days hot ≈ 3 TB; throughput needs few partitions but plan 24-48 for parallelism and growth.)

    **Probes:** peaks and backfills (a reconnecting fleet uploads a buffered day at once); hot keys (one engine 100× chattier); **small files** (10 s triggers × 12 partitions ≈ 100k files/day without compaction); growth (fleet doubles yearly); the query side (a year without pruning = 20 TB per dashboard query).
  `),

  sysdesign: T(`
    > **In one line:** designing a pipeline end to end walks from **requirements** to **sources, ingestion, storage, processing, serving, quality, orchestration, security, operations and cost**, justifying trade-offs at each step. Interviews test the **structure of your thinking** more than tools.

    ## The framework (say the steps)
    1. **Clarify (5 minutes):** consumers and decisions; freshness per consumer; volume now and in 2 years, peaks; sources (types, change patterns, deletes, quality); correctness (provisional OK? exactly-once? finance vs monitoring); history, retention, compliance (PII, export control); budget, existing platform and skills. Ask, then state assumptions.
    2. **Size it.**
    3. **Draw:** sources → ingestion → storage layers → processing → serving → consumers.
    4. **Deep-dive the hard parts:** incremental/CDC, late data, dedupe, model and grain, hot paths.
    5. **Reliability, per component's failure modes:** Kafka down an hour, duplicates, schema change, crash mid-write, region failure → replay, idempotency, contracts, checkpoints, DR; plus DLQ/quarantine, backfills, gates, reconciliation.
    6. **Operations:** orchestration, monitoring (freshness, lag, volume, quality), alerts with owners, runbooks, SLAs, CI/CD and deploys.
    7. **Governance/security:** access, PII, catalog, lineage, retention.
    8. **Cost and evolution:** tiers, right-sizing, incremental, small-file control; how a new source, new consumer or 10× volume fits without a rewrite.

    ## Worked outline: engine telemetry + warranty analytics
    - **Requirements:** 10k engines at 1 reading/s; fault alerts < 1 min; daily health scores; claims analytics joining telemetry with CRM claims; 2 years history; dealers see only their engines.
    - **Size:** ~10k events/s, ~430 GB/day raw, ~55 GB/day Parquet.
    - **Ingestion:** devices → IoT hub/gateway → Kafka (12+ partitions keyed by engine_id, Avro + schema registry); CRM claims via CDC (Debezium) or 15-minute incremental API pulls.
    - **Storage (Delta on ADLS/S3):** bronze raw events + CDC changes; silver deduped typed readings partitioned by date, clustered by engine_id, claims current state via MERGE, SCD2 dims; gold daily health, claims fact + dims, dashboard aggregates.
    - **Processing:** Structured Streaming for bronze/silver and alerts (event-time windows, watermark, dedupe by event_id); batch/incremental Spark or dbt for gold.
    - **Serving:** Power BI on gold via SQL warehouse with dealer row-level security; latest health per engine in a low-latency store for the service app; feature tables for the failure model.
    - **Reliability:** checkpoints + Delta for exactly-once; quarantine bad readings; lookback for daily gold; replay from bronze; claims vs CRM reconciliation.
    - **Ops:** Airflow/Databricks Workflows; lag, freshness, volume, quality alerts; SLAs (gold by 06:00, alerts p95 < 60 s); CI/CD with tests.
    - **Governance:** Unity Catalog owners, PII tags on claims, lineage, retention (raw 90 days hot, aggregates 2+ years).
    - **Cost:** autoscaling job clusters, compaction, downsampling old raw, partition pruning.
    - **Trade-offs:** streaming only for alerts and bronze, batch for analytics; lakehouse instead of lake + warehouse copies.

    **What scores:** asking before designing; numbers and assumptions; **justifying choices and naming alternatives** out loud ("micro-batch every minute instead of continuous because the SLO is 5 minutes and it halves cost and complexity"); thinking about failure; a correctness story (contracts, validation, reconciliation, quality SLIs, lineage); as simple as requirements allow. Follow-ups: 10× volume, duplicates, backfill, how you know it's correct.
  `),
};
