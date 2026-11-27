const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('../_t.cjs');

module.exports = {
  bigdata: T(`
    ## Senior depth
    - **The honest thresholds (2026 hardware):** a single modern machine (64 cores, 512 GB RAM, NVMe) with DuckDB/Polars handles hundreds of GB comfortably. Distributed systems earn their cost when data is multi-TB, throughput exceeds one machine's I/O (~several GB/s), many teams share a platform, or the workload is continuous streaming with HA needs.
    - **The real "big" problems are rarely volume alone:** variety (hundreds of sources and schemas), velocity (latency SLOs), veracity (quality at scale) and organisational scale (many producers and consumers) drive most architecture.
    - **Cost is a design dimension:** a 10 TB daily scan at cloud prices adds up; partition pruning, clustering, incremental processing and right-sized compute are how senior engineers cut bills by 5-10×.
  `),
  distcomp: T(`
    ## Senior depth
    - **Partial failure is the defining property:** a node can fail while others continue, and you cannot always tell a slow node from a dead one. Every distributed design answers: timeouts, retries, idempotency, and who decides (coordination).
    - **Stragglers:** the slowest task decides stage time. Causes: skew, a bad node, GC, noisy neighbours. Mitigations: speculative execution («spark.speculation», duplicates slow tasks; outputs must be idempotent), fixing skew, removing bad nodes.
    - **Coordination is expensive:** consensus (ZooKeeper, KRaft/Raft in Kafka) is used for metadata, leadership and configuration, never for every data record. Designs that need global coordination per record do not scale.
    - **Amdahl's law:** the serial part (driver-side collect, a single-partition window, a final sort into one file) caps speed-up regardless of cluster size.
    - **Data locality** mattered in HDFS (move compute to data); with cloud object storage compute and storage are separated, so network bandwidth and caching (Databricks disk cache) matter instead.
  `),
  diststore: T(`
    ## Senior depth
    - **Object storage semantics:** strongly consistent reads-after-writes and listings on S3 (since 2020), ADLS Gen2, GCS. But: no atomic directory rename on S3 (rename = copy + delete per object), per-prefix request rate limits (S3 ~3,500 writes / 5,500 reads per second per prefix), eventual consistency of some metadata in old systems. Table formats exist largely because of these properties.
    - **ADLS Gen2 hierarchical namespace** gives real directories and atomic renames, POSIX-like ACLs: important for Hadoop-style commits and fine-grained security on Azure.
    - **Costs:** storage per GB-month is cheap; **requests** (LIST/GET per small file) and **egress** are where bills surprise. Small files multiply request costs.
    - **Tiers:** hot/cool/archive with lifecycle policies; archive needs rehydration hours before reading, so never put tables you query in archive.
    - **Durability vs availability:** "11 nines" durability (replication/erasure coding within and across zones) is not the same as availability; region outages happen. Geo-redundant storage (GRS/RA-GRS) for DR.
  `),
  cluster: T(`
    ## Senior depth
    - **Cluster managers:** YARN (Hadoop), Kubernetes (Spark on K8s: pods per executor), Spark standalone, and managed services (Databricks, EMR, Synapse/Fabric Spark, Dataproc) that hide most of it.
    - **Dynamic allocation / autoscaling:** add executors when tasks queue, remove idle ones. Needs shuffle data to survive executor removal (external shuffle service, or decommissioning that migrates shuffle blocks). Autoscaling helps bursty batch; streaming and heavily cached jobs prefer fixed sizes.
    - **Spot/preemptible workers** cut cost 60-90% but can vanish; fine for idempotent batch with retries, keep the **driver on on-demand** nodes.
    - **Driver as single point of failure:** a dead driver kills the application. Jobs need retries at the orchestrator level, and streaming needs checkpoints to resume.
    - **Multi-tenancy:** shared clusters suffer noisy neighbours; production pipelines run on isolated job clusters; interactive users on shared clusters with policies.
  `),
  parallel: T(`
    ## Senior depth
    - **Parallelism limits come from the narrowest point:** Kafka partitions for a streaming source, number of input files for non-splittable formats, JDBC numPartitions, a single-partition window, a coalesce(1).
    - **Partitioning by key** («repartition('engine_id')») is a choice of **co-location**: it makes later per-key operations shuffle-free in the same job, but creates skew if keys are uneven.
    - **Range partitioning** («repartitionByRange», used by global sorts) samples data to choose boundaries; good for sorted output files and range queries, sensitive to sampling on skewed data.
    - **Over-parallelism costs too:** each task has fixed overhead (scheduling, deserialisation, file open). Thousands of sub-second tasks make the driver the bottleneck.
  `),
  shuffle: T(`
    ## Senior depth: inside the shuffle
    - **Map side:** each task writes its output **partitioned by target partition** and sorted into one data file + an index per map task (sort-based shuffle). Bytes written = "shuffle write".
    - **Reduce side:** each task fetches its blocks from every map task's output over the network ("shuffle read"), possibly from many executors: M × R block fetches. With 10,000 map and 10,000 reduce tasks that is 100 million tiny blocks: why too many partitions hurts.
    - **Shuffle files live on executor local disks.** Losing an executor loses its shuffle outputs → «FetchFailedException» → the map stage is recomputed. External shuffle services, decommissioning and remote shuffle services (Celeborn, cloud-managed) address this for autoscaling/spot clusters.
    - **Compression and serialisation** (lz4/zstd, Kryo/UnsafeRow) reduce bytes; Photon/Tungsten operate on binary rows to avoid object overhead.
    - **Avoiding shuffles altogether:** broadcast joins, pre-partitioned/bucketed data, aggregating before joining, reusing an existing partitioning (Spark tracks «outputPartitioning» and skips an Exchange when it already matches).
  `),
  skew: T(`
    ## Senior depth
    - **Skew appears in more than joins:** «groupBy» on a hot key (partial aggregation helps sums/counts but not «collect_list» or distinct counts), windows partitioned by a hot key, writes «partitionBy» a hot value (one giant file/task), Kafka partitions keyed by a hot device.
    - **Two-stage (salted) aggregation:** add «salt = rand() * k» → group by (key, salt) → partial result → group by key. Works for decomposable aggregates; for distinct counts, salt by hash of the distinct column instead of random so duplicates land in the same sub-group.
    - **Isolate the hot keys:** process the top-N hot keys separately (broadcast the matching rows of the other side for just those keys) and union with the normal path. Precise and avoids blowing up the small side k times for every key.
    - **AQE skew join** handles join skew automatically within limits; check that it fired (UI shows "skew" on the join and split partitions).
    - **NULL and default values** («UNKNOWN», 0, empty string) are the most common hot keys and usually should not be joined at all.
    - **Measure:** max/median task duration and shuffle read per stage; top keys by count («groupBy(key).count().orderBy(desc).limit(20)») on a sample.
  `, {
    hands: [
      py({ q: '**Salted two-stage aggregation (simulated).** Given «rows» as «(key, value)» and a number of partitions «n», a naive hash partitioning sends all rows of a key to «hash(key) % n». Write «max_partition_load(rows, n, salt_keys, k)» returning the largest number of rows any partition receives when rows whose key is in «salt_keys» are spread by appending a salt «i % k» (i = the row\'s index in «rows») to the key before partitioning, and other keys are partitioned normally. Use «zlib.crc32(str(x).encode()) % n» as the hash so results are deterministic. Also write «salted_sum(rows, salt_keys, k)» that returns the per-key sums computed in two stages (sum by (key, salt), then by key); it must equal a normal sum.', starter: 'import zlib\nfrom collections import Counter, defaultdict\n\ndef part(x, n):\n    return zlib.crc32(str(x).encode()) % n\n\ndef max_partition_load(rows, n, salt_keys, k):\n    pass\n\ndef salted_sum(rows, salt_keys, k):\n    pass\n',
        tests: `rows = [('HOT', 1)] * 900 + [(f'k{i}', 1) for i in range(100)]
naive = max_partition_load(rows, 8, set(), 1)
salted = max_partition_load(rows, 8, {'HOT'}, 16)
assert naive >= 900, naive
assert salted < 400, salted
s = salted_sum(rows, {'HOT'}, 16)
assert s['HOT'] == 900 and s['k5'] == 1 and len(s) == 101`,
        solution: `import zlib
from collections import Counter, defaultdict

def part(x, n):
    return zlib.crc32(str(x).encode()) % n

def max_partition_load(rows, n, salt_keys, k):
    load = Counter()
    for i, (key, _) in enumerate(rows):
        sk = (key, i % k) if key in salt_keys else key
        load[part(sk, n)] += 1
    return max(load.values())

def salted_sum(rows, salt_keys, k):
    stage1 = defaultdict(int)
    for i, (key, v) in enumerate(rows):
        stage1[(key, i % k if key in salt_keys else 0)] += v
    out = defaultdict(int)
    for (key, _), v in stage1.items():
        out[key] += v
    return dict(out)` }),
    ],
  }),
  faulttol: T(`
    ## Senior depth
    - **Lineage recomputation vs replication:** Spark recomputes lost partitions from lineage (cheap for narrow chains, expensive after long chains or wide dependencies: checkpoint long iterative lineages). Kafka/HDFS/object storage replicate data.
    - **Output commit protocols:** tasks write to temporary locations and only the driver commits successful attempts; on object storage without atomic rename this is slow or unsafe, which is why Delta/Iceberg (log-based commits) or S3A magic committers are used.
    - **Speculative execution + non-idempotent side effects** = duplicate writes to external systems. Only speculate on tasks whose outputs go through the commit protocol.
    - **Correlated failures** (a zone outage, a bad deploy across all nodes, a poison record) defeat replication and retries. Defend with zone spreading, canary deploys, and per-record error isolation.
  `),
  tputlat: T(`
    ## Senior depth
    - **Little's law:** items in system = arrival rate × time in system. 3,000 events/s with 10 s end-to-end latency means ~30,000 events in flight: buffers, state and memory must hold them.
    - **Batching is the main throughput lever and the main latency cost:** Kafka «linger.ms» and «batch.size», Spark trigger intervals, warehouse loads in bulk. Tune to the latency SLO, not to zero.
    - **Tail latency (p99) matters more than average** for SLAs and alerts; stragglers, GC and rebalances live in the tail. Report percentiles (Turbofan's report prints p50/p95/p99).
    - **Measure at saturation:** a load test should find the throughput at which latency starts rising steeply (the knee). Run below ~70% of it in production for headroom.
  `),
  eventual: T(`
    ## Senior depth
    - **Read-your-writes and monotonic reads** are the guarantees users notice: a dashboard reading from a replica that lags may show a claim as "not submitted" right after submission. Route such reads to the primary or wait for replication.
    - **In analytics, eventual consistency appears as freshness:** gold lags silver lags source. Expose "data as of" timestamps on every dashboard instead of pretending data is current.
    - **Conflict resolution:** last-writer-wins by timestamp loses updates when clocks skew; version vectors or CRDTs merge concurrent updates; most data pipelines use a single writer per key plus source sequence numbers to avoid the problem.
  `),
  cap: T(`
    ## Senior depth
    - **CAP is about behaviour during a network partition** only; PACELC adds the everyday trade-off: Else (no partition), Latency vs Consistency. Cassandra/Dynamo-style systems choose availability and low latency with tunable consistency; Spanner/CockroachDB choose consistency with higher write latency.
    - **Tunable consistency (Cassandra):** with replication factor N, read consistency R and write consistency W, «R + W > N» gives read-your-writes (e.g. QUORUM/QUORUM with N=3). LOCAL_QUORUM keeps latency within a data centre.
    - **Kafka's choices:** «acks=all» + «min.insync.replicas=2» + «unclean.leader.election.enable=false» chooses consistency (writes fail when too few replicas are in sync) over availability.
    - **Interview trap:** "CA" systems do not exist in a distributed setting (partitions will happen); a single-node database is not "CA", it is simply not distributed.
  `),
  semantics: T(`
    ## Senior depth
    - **Exactly-once is end-to-end or nothing:** the source must be replayable (Kafka offsets, files), the processing deterministic, and the sink idempotent or transactional, with offsets committed atomically with results (or results keyed so replays overwrite).
    - **Kafka EOS** (idempotent producer + transactions + «isolation.level=read_committed» consumers) gives exactly-once **within Kafka** (consume-transform-produce). Writing to an external DB is outside the transaction: use idempotent upserts.
    - **Spark Structured Streaming** gives exactly-once to sinks that are idempotent (Delta, file sink with its own log); foreachBatch to arbitrary sinks is at-least-once unless you make it idempotent.
    - **Duplicates also come from upstream**: a device resends on timeout, a connector restarts. Even with a perfect pipeline, dedupe by a producer-assigned event id.
    - **Proving it:** count, distinct ids, missing ids from a manifest, after injected crashes and duplicates (the Turbofan verify step).
  `),
  sizing: T(`
    ## Senior depth: numbers worth memorising
    | Quantity | Rough value |
    |---|---|
    | Seconds per day | ~86,400 (≈ 10^5) |
    | 1 million events/day | ~12 events/s average; peak often 5-10× |
    | Sequential disk read (NVMe) | 2-7 GB/s; network 10-100 Gb/s per node (1.25-12.5 GB/s) |
    | Spark task processing (simple transforms on Parquet) | ~50-200 MB/s per core |
    | Kafka partition throughput | ~10 MB/s write per partition is a comfortable planning number (can be much higher) |
    | Parquet compression vs CSV | often 5-10× smaller; JSON → Parquet 10×+ |
    | Delta target file size | ~128 MB-1 GB |
    - **Method:** events/s × bytes/event → MB/s → GB/day; × retention → storage; ÷ per-core throughput → cores; × peak factor and growth → capacity; then cost.
    - **Worked micro-example:** 50,000 engines × 1 reading/s × 200 bytes = 10 MB/s ≈ 864 GB/day raw JSON ≈ ~100 GB/day Parquet. 30 days hot ≈ 3 TB. Kafka: 10 MB/s → a few partitions would do for throughput, but plan for consumer parallelism and growth (e.g. 24-48 partitions).
    - **Say assumptions out loud** and sanity-check the result against known systems; interviewers grade the reasoning, not the exact number.
  `, {
    hands: [
      py({ q: '**Capacity estimate.** Write «capacity(devices, hz, bytes_per_event, parquet_ratio, hot_days, peak_factor, mb_per_core)» returning a dict: «events_per_s» (devices × hz), «mb_per_s» (avg ingest MB/s using 1 MB = 10^6 bytes, rounded to 1 dp), «raw_gb_per_day» (rounded to 0 dp, 1 GB = 10^9 bytes), «parquet_tb_hot» (raw per day / parquet_ratio × hot_days in TB = 10^12 bytes, rounded to 2 dp) and «cores_at_peak» (ceil(mb_per_s × peak_factor / mb_per_core)).', starter: 'import math\n\ndef capacity(devices, hz, bytes_per_event, parquet_ratio, hot_days, peak_factor, mb_per_core):\n    pass\n',
        tests: `r = capacity(50000, 1, 200, 8, 30, 5, 50)
assert r == {'events_per_s': 50000, 'mb_per_s': 10.0, 'raw_gb_per_day': 864, 'parquet_tb_hot': 3.24, 'cores_at_peak': 1}, r
r = capacity(200000, 10, 300, 10, 90, 4, 40)
assert r['mb_per_s'] == 600.0 and r['cores_at_peak'] == 60 and r['raw_gb_per_day'] == 51840, r`,
        solution: `import math

def capacity(devices, hz, bytes_per_event, parquet_ratio, hot_days, peak_factor, mb_per_core):
    eps = devices * hz
    bps = eps * bytes_per_event
    mbps = bps / 1e6
    raw_day = bps * 86400
    return {'events_per_s': eps, 'mb_per_s': round(mbps, 1), 'raw_gb_per_day': round(raw_day / 1e9),
            'parquet_tb_hot': round(raw_day / parquet_ratio * hot_days / 1e12, 2),
            'cores_at_peak': math.ceil(mbps * peak_factor / mb_per_core)}` }),
    ],
  }),
  sysdesign: T(`
    ## Senior depth: what moves a design answer from "junior" to "strong"
    - **Requirements with numbers:** volume now and in 2 years, latency per consumer, correctness needs (finance vs monitoring), retention, compliance. Ask, then state assumptions.
    - **Failure modes per component:** what if Kafka is down for an hour, the source sends duplicates, a schema changes, the job crashes mid-write, a region fails? Answer each with the mechanism (replay, idempotency, contracts, checkpoints, DR).
    - **Data correctness story:** contracts, validation and quarantine, reconciliation, quality SLIs, lineage.
    - **Operations:** monitoring (freshness, lag, volume, quality), alerting with owners, runbooks, backfill strategy, deploy process.
    - **Cost:** storage tiers, compute right-sizing, incremental processing, small-file control.
    - **Evolution:** how a new source, a new consumer or 10× volume fits without a rewrite.
    - **Trade-offs said out loud:** "I chose micro-batch every minute instead of continuous because the SLO is 5 minutes and it halves cost and complexity."
  `),
};
