const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('../_t.cjs');

module.exports = {
  // ------------------------------------------------------------------ Kafka
  kafkawhat: T(`
    ## Senior depth: Kafka in 2026
    - **KRaft only:** Kafka 4.0 (2025) removed ZooKeeper. Cluster metadata lives in an internal Raft-replicated log managed by controller nodes. Old answers that mention ZooKeeper for offsets/metadata are outdated (offsets have lived in «__consumer_offsets» since 0.9).
    - **Tiered storage** (GA in Kafka 3.9): older log segments move to object storage while recent ones stay on broker disks, making long retention (months) affordable and broker recovery faster. It changes the "Kafka is not for long-term storage" answer: it can be, cost-effectively, though the lakehouse is still the analytical store.
    - **Queues for Kafka:** share groups (KIP-932, production-ready in Kafka 4.2, February 2026) allow queue-style consumption with per-record acknowledgement and more consumers than partitions.
    - **Managed and compatible services:** Confluent Cloud, Amazon MSK, **Azure Event Hubs** (Kafka protocol endpoint, the likely choice in an Azure shop like Cummins), Redpanda, WarpStream-style object-storage-backed brokers. Know that "Kafka API" ≠ "Apache Kafka": features like transactions, compaction or Connect may differ per tier/service.
  `),
  brokers: T(`
    ## Senior depth
    - **Partition count is hard to change later** for keyed topics (key→partition mapping changes). Size it for peak throughput and consumer parallelism 1-2 years out, but not wildly: each partition costs open file handles, memory, replication traffic and longer leader elections. Tens to low hundreds per topic is typical; thousands per broker is a smell.
    - **Hot partitions:** a key with disproportionate traffic (one plant gateway forwarding for 5,000 engines under one key) saturates one partition and one consumer. Choose keys with high cardinality and even traffic; if per-key ordering must hold for a hot entity, consider sub-keys (engine_id instead of plant_id).
    - **Sticky partitioning** for null keys (since Kafka 2.4) fills one partition's batch before switching, improving batching; records without keys are not round-robined per record any more.
    - **Leader balance and rack awareness:** leaders spread across brokers; replicas across zones («broker.rack»); consumers can fetch from the closest replica (KIP-392) to cut cross-zone costs.
  `),
  prodcons: T(`
    ## Senior depth: producer settings that matter
    | Setting | Effect |
    |---|---|
    | «acks=all» | Wait for all in-sync replicas: durability (default since Kafka 3.0) |
    | «enable.idempotence=true» | Broker de-duplicates producer retries per partition (default since 3.0) |
    | «linger.ms», «batch.size» | Bigger batches = higher throughput, more latency (default linger 5 ms since Kafka 4.0) |
    | «compression.type» | lz4/zstd: less network and disk, more CPU |
    | «max.in.flight.requests.per.connection» ≤ 5 with idempotence | Ordering preserved under retries |
    | «delivery.timeout.ms» | Upper bound on send + retries; after it the send fails: handle the callback error |
    - **Fire-and-forget bug:** not checking send callbacks/futures means failed sends are invisible. Turbofan's producer counts acknowledged sends into a manifest so verification is possible.
    - **Consumer settings:** «auto.offset.reset» (earliest/latest for new groups: the wrong choice silently skips data), «enable.auto.commit» (commits on a timer regardless of processing: at-most-once-ish surprises), «max.poll.records», «isolation.level=read_committed» for transactional producers.
  `),
  offsets: T(`
    ## Senior depth
    - **Spark Structured Streaming does not use consumer-group commits for correctness:** offsets are tracked in its **checkpoint**. Committing to Kafka is optional (for monitoring lag in external tools). Resetting a Spark query means a new checkpoint plus «startingOffsets», not «kafka-consumer-groups --reset-offsets».
    - **Offset retention:** committed offsets of an inactive group expire («offsets.retention.minutes», 7 days by default); a consumer that was down longer restarts from «auto.offset.reset».
    - **Data retention vs offsets:** if a consumer is behind by more than topic retention, the records it needs are deleted: «OffsetOutOfRange» and silent data loss unless «failOnDataLoss» (Spark default true) stops the job. Monitor lag in time against retention.
    - **Replay by time:** «offsetsForTimes» / Spark «startingTimestamp» to reprocess from a point in time after a bug fix.
  `),
  kreplication: T(`
    ## Senior depth
    - **The durability triangle:** replication factor 3 + «min.insync.replicas=2» + «acks=all» tolerates one broker failure with no data loss and continued writes. RF 3 with min ISR 1 loses data if the leader dies right after acknowledging.
    - **Unclean leader election** («false» by default) prevents an out-of-sync replica from becoming leader (which would truncate acknowledged data). Turning it on trades durability for availability.
    - **ISR shrinking** under load (slow followers) silently reduces durability until writes start failing with NotEnoughReplicas. Alert on under-replicated partitions.
    - **Cross-region:** replication inside a cluster is synchronous within a region; across regions use MirrorMaker 2 / Cluster Linking (asynchronous: offsets differ, RPO > 0).
  `),
  retention: T(`
    ## Senior depth
    - **Compaction is not instant:** only the "dirty" part of the log is compacted when the cleaner runs; consumers can still see several values per key and must handle that. Tombstones are kept for «delete.retention.ms» so consumers can observe deletes.
    - **Compact + delete** («cleanup.policy=compact,delete») keeps the latest value per key but also drops keys older than retention: good for state topics where stale keys should expire.
    - **Retention sizing:** size retention to cover the longest plausible consumer outage plus replay needs (often 3-7 days), with tiered storage for longer. The lakehouse bronze layer is the long-term replay source.
    - **Compaction and ordering:** compaction keeps the latest offset per key, so the producer must write per-key updates in order to the same partition (keyed).
  `),
  ordering: T(`
    ## Senior depth
    - **Ordering is per partition, per producer session.** Two producers writing the same key, or a key whose partition changed (partition count increase), lose ordering.
    - **Retries can reorder** without idempotence (batch 2 succeeds, batch 1 retried after it). Idempotent producers keep order with up to 5 in-flight requests.
    - **Spark breaks Kafka order** across a shuffle; inside one micro-batch, rows of a key may be processed in any order. If order matters, sort by a sequence within the key in foreachBatch or use event-time logic, not arrival order.
    - **Consumers with internal thread pools** reorder per key unless work is sharded by key across threads.
    - **Design rule:** carry a monotonic **sequence number or version** in each event; make consumers apply changes only if the version is newer. Then ordering bugs degrade to "ignored stale update" instead of "corrupted state".
  `),
  kvsmq: T(`
    ## Senior depth (2026 update)
    - **Kafka has queues now:** share groups (KIP-932, production-ready in **Kafka 4.2**, February 2026) let many consumers share the records of the same partitions with **per-record acknowledgement, redelivery on lock timeout and delivery-count limits**, which used to be the defining features of RabbitMQ/SQS/Service Bus. Classic consumer groups remain the right tool for ordered, replayable stream processing.
    - **When a broker queue (RabbitMQ, Azure Service Bus, SQS) is still the better choice:** complex routing (topic exchanges, headers), per-message TTL and priorities, request/reply, small task queues where operating Kafka is overkill, built-in DLQ semantics tied to the product.
    - **When Kafka:** high throughput, replay, multiple independent consumer groups on the same data, long retention, stream processing, CDC, and integration with the lakehouse.
    - **Azure mapping:** Event Hubs ≈ Kafka (partitioned log, consumer groups, Kafka protocol); Service Bus ≈ traditional queue/topic broker; IoT Hub ≈ device-facing ingestion with device identity, then routes to Event Hubs-compatible endpoints.
  `),
  ksemantics: T(`
    ## Senior depth
    - **Transactions** let a consume-transform-produce app atomically write output records **and** the consumer offsets; read_committed consumers never see aborted writes. Zombie fencing uses «transactional.id» + epochs so a restarted instance cannot be duplicated by an old one.
    - **Kafka Streams «processing.guarantee=exactly_once_v2»** uses these under the hood.
    - **Limits:** EOS covers Kafka-to-Kafka. Sinks outside Kafka (Delta, Postgres, an API) need idempotent writes or a transactional sink that stores offsets with the data.
    - **Cost:** transactions add latency (commit markers, coordinator round trips); batch them sensibly (commit interval).
  `),

  // ------------------------------------------------------------------ Spark
  sparkwhat: T(`
    ## Senior depth: Spark in 2026
    - **Current line:** Spark 4.x (4.0 in 2025, **4.1 GA with Databricks Runtime 18**, 4.2 in preview mid-2026). Notable 4.x changes: **ANSI SQL mode on by default** (errors instead of silent NULLs on bad casts/overflow), **VARIANT** type for semi-structured JSON, **Spark Connect** (thin client/server protocol; clients no longer run inside the driver JVM), **SQL scripting** and **recursive CTEs** (4.1), «transformWithState» for streaming state, Python data source API, **Spark Declarative Pipelines** (open-sourced from Databricks' DLT, 4.1), JDK 17/21, Scala 2.13 only.
    - **Spark Connect** matters operationally: notebooks and apps talk to a remote Spark server over gRPC; Databricks serverless and shared clusters use it. Some low-level APIs (RDDs, SparkContext) are unavailable through Connect, another reason to stay on DataFrames.
    - **Photon** (Databricks) and native accelerators (Gluten/Velox, Comet in open source) execute Spark plans in vectorised native code: the DataFrame/SQL you write is the same, the engine underneath is faster.
  `),
  sparkarch: T(`
    ## Senior depth
    - **Driver responsibilities that make it a bottleneck:** planning, scheduling every task, tracking metadata of every file (listing millions of files), collecting results, building broadcast tables. Large driver memory needs usually indicate a design problem (collects, huge broadcasts, tiny files).
    - **Executors run tasks in threads** (one per core); a Python worker process per concurrently running Python task when UDFs/pandas UDFs are used.
    - **Client vs cluster deploy mode:** client mode runs the driver where you submit (a notebook/laptop: the driver dies with your session); cluster mode runs it in the cluster (production).
    - **Spark Connect** separates the client from the driver: the client builds plans and sends them; the server runs the driver. Client crashes no longer kill the application.
  `),
  rdddf: T(`
    ## Senior depth
    - **Why DataFrames win:** Catalyst can reorder/prune/push down only what it understands; Tungsten stores rows in compact binary format and generates code. RDD lambdas are black boxes with Java/Python object overhead.
    - **Datasets** (Scala/Java) add compile-time types but lose some optimisations when you use typed lambdas («map(x => …)»), because the lambda is opaque.
    - **RDDs today:** custom partitioners, low-level control over partitions («mapPartitions» exists on DataFrames too via «mapInPandas/mapInArrow»), legacy code. Not available on Spark Connect / shared Databricks compute.
  `),
  lazy: T(`
    ## Senior depth
    - **Each action re-runs the whole lineage** unless cached: «df.count()» followed by «df.write» reads and computes everything twice. Avoid "count for logging" actions on expensive DataFrames, or cache deliberately, or get counts from write metrics (Delta operation metrics).
    - **Errors surface at the action**, far from the line that caused them (a bad cast defined 30 lines earlier). In ANSI mode the error message points at the expression; read it.
    - **Python driver code is eager:** a Python loop that builds 500 «withColumn» calls creates a huge plan (slow analysis, even stack overflows). Use «select» with a list of expressions or «withColumns» (3.3+).
    - **Iterative algorithms** (loops that re-use the previous result) grow the lineage each iteration; checkpoint or write out periodically.
  `),
  dag: T(`
    ## Senior depth
    - **Stage retries:** a FetchFailed in stage N re-runs the lost map outputs of stage N-1; repeated failures abort the job («spark.stage.maxConsecutiveAttempts»).
    - **Job per action, plus hidden jobs:** schema inference, «show()», broadcast building and AQE re-planning create extra jobs you will see in the UI; that is normal.
    - **Skipped stages** in the UI mean Spark reused existing shuffle output (from an earlier action in the same application) instead of recomputing: a free optimisation that disappears when the application restarts.
  `),
  narrowwide: T(`
    ## Senior depth
    - **Wide ≠ always shuffle:** if the input is already partitioned the way the wide operation needs (same keys, same partition count), Spark skips the Exchange.
    - **Narrow operations pipeline together** in one stage via whole-stage code generation: filter → select → withColumn on the same data run as one tight loop per partition.
    - **Union is narrow** (concatenates partitions), **distinct, groupBy, join (non-broadcast), orderBy, window, repartition** are wide; **coalesce** is narrow by design (and that is why it can collapse upstream parallelism).
    - Sorting globally («orderBy») needs a range-partitioning shuffle with a sampling job; «sortWithinPartitions» is narrow and often sufficient before writing.
  `),
  cache: T(`
    ## Senior depth
    - **Storage levels:** MEMORY_AND_DISK (DataFrame default for «cache()»), MEMORY_ONLY (recompute if evicted), DISK_ONLY, «_SER» variants, replicated «_2». Choose by reuse cost vs memory pressure.
    - **Caching is lazy:** the first action materialises it; a «count()» right after «cache()» is the common (sometimes wasteful) way to force it.
    - **Unpersist** when done; cached data competes with execution memory and causes spills elsewhere.
    - **Databricks disk cache** (formerly Delta cache) caches remote Parquet files on local SSDs automatically; often a better choice than «df.cache()» for repeated reads of the same tables.
    - **Cache vs write to a table:** across jobs, notebooks or restarts, only a written table survives. Within one job reusing an expensive intermediate result 3+ times, cache. For long lineages that must be truncated, checkpoint or write.
  `),
  sparkft: T(`
    ## Senior depth
    - **Task failures** retry up to «spark.task.maxFailures» (4) on other executors; a deterministic bug (bad data) fails all attempts: the error you see is the 4th attempt's.
    - **Non-deterministic recomputation:** if lineage includes «rand()» or an unordered «row_number», recomputing a lost partition can produce different rows than the first attempt, and downstream stages that already consumed the old output become inconsistent. Spark detects indeterminate stages and re-runs dependants in some cases; better to avoid non-determinism before shuffles (e.g. sort before random sampling, deterministic salts).
    - **Driver failure** loses the application; batch jobs restart from scratch (make them idempotent), streaming queries restart from the checkpoint.
  `),
  sparksql: T(`
    ## Senior depth
    - **Dynamic partition pruning (DPP):** in a star join, a filter on the dimension (e.g. «region = 'West'») is turned at runtime into a filter on the fact's partition column, pruning fact partitions it could not prune statically.
    - **Predicate pushdown limits:** pushdown into Parquet/Delta works for simple comparisons on columns; it fails through UDFs, many casts, and complex expressions. In Spark 4 with VARIANT, filters on extracted paths can be pushed in some cases.
    - **CBO** (cost-based optimiser, off by default in OSS) uses table/column statistics («ANALYZE TABLE … COMPUTE STATISTICS FOR ALL COLUMNS») for join reordering; Databricks collects stats automatically on Delta (predictive optimization). AQE covers much of the rest at runtime.
    - **Hints:** «BROADCAST», «MERGE», «SHUFFLE_HASH», «SHUFFLE_REPLICATE_NL», «REPARTITION», «COALESCE», «REBALANCE» (AQE-aware rebalancing before writes to avoid tiny or huge files).
  `),
  sss: T(`
    ## Senior depth
    - **Triggers:** default (micro-batch as soon as the previous ends), «processingTime='1 minute'», «availableNow=True» (process everything available in bounded batches, then stop: incremental batch on a schedule, cheap and simple), «continuous» (experimental, rarely used); **real-time mode** on Databricks for sub-second latency use cases.
    - **Checkpoint contents:** offsets log (planned batch), commits log (finished batch), state store snapshots/deltas, metadata (query id). Never share a checkpoint between queries; never delete it to "fix" a problem without understanding the replay consequences.
    - **Changing a running query:** safe: adding filters/projections that do not change state, changing sink options; unsafe: changing grouping keys, aggregations, stateful operators, source topics (sometimes), output mode. Plan migrations as new query + backfill.
    - **Monitoring:** StreamingQueryListener events / «lastProgress»: input vs processed rows per second, batch duration, «numRowsDroppedByWatermark», state rows/memory. Alert when processing rate < input rate for N batches.
    - **Exactly-once in practice** (your Turbofan design): Kafka source offsets in the checkpoint, deterministic transforms, Delta sink (idempotent by batch id), MERGE in foreachBatch for stateful gold, dedupe with watermark for producer duplicates, verified by a crash test.
  `),
};
