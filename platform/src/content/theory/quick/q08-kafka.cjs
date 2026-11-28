const { T } = require('../_t.cjs');

module.exports = {
  kafkawhat: T(`
    > **In one line:** Apache Kafka is a **distributed, durable, append-only log** of events. Producers write to **topics**; any number of consumers read **independently, at their own pace, and can re-read**. It decouples systems that create events from systems that use them, at very high throughput.

    **Why:** without it every system calls every other (CRM → warehouse loader, analytics, alerting, search): N producers × M consumers fragile point-to-point links, and one slow consumer hurts the producer or loses data. Kafka puts a durable log in the middle: producers write once, each consumer can fail, lag or replay independently.

    **Event-driven architecture:** an **event** is an immutable, timestamped fact ("claim 9001 approved at 10:02"); systems react instead of polling/calling. Benefits: loose coupling, independent scaling, replay, real-time reactions, audit trail. Costs: eventual consistency, cross-service debugging, schema governance, duplicates, ordering subtleties. Patterns: **event notification** (go look), **event-carried state transfer** (data in the event), **event sourcing** (the log *is* the system of record), **CQRS** (separate write/read models fed by events).

    **Why it's different from a queue or DB:** a **log, not a queue** (messages stay for the retention period, e.g. 7 days, or forever when compacted; many groups read the same data); **consumers track their own offsets** (replay = move the offset back); **partitioned** across brokers (throughput scales with partitions); **sequential disk I/O + batching + OS page cache + zero-copy** → millions of messages/s on commodity hardware; **replicated**.

    | Component | Role |
    |---|---|
    | Brokers | Store partitions, serve reads/writes |
    | KRaft controllers | Metadata, leader election |
    | Producers/consumers | Client libraries |
    | Kafka Connect | Source/sink connectors (Debezium CDC, JDBC, S3, Elasticsearch) |
    | Schema Registry | Avro/Protobuf/JSON schemas + compatibility |
    | Kafka Streams / ksqlDB | Stream processing on Kafka |

    «««flow
    Apps, devices, CDC -> Kafka topics -> Spark Structured Streaming / Flink / Connect sinks -> Lakehouse bronze, alerting, search, microservices
    »»»
    For DE it's the **real-time ingestion backbone** and a **buffer** that absorbs bursts and lets downstream be down without losing data.

    ## Kafka in 2026
    - **KRaft only:** Kafka 4.0 (2025) removed ZooKeeper; metadata lives in an internal Raft log on controllers. (Offsets have lived in «__consumer_offsets» since 0.9; ZooKeeper answers are outdated.)
    - **Tiered storage** (GA in 3.9): old segments move to object storage, so months of retention are affordable and broker recovery faster. Kafka *can* now hold long history cheaply, though the lakehouse stays the analytical store.
    - **Share groups** (KIP-932, production-ready in 4.2, Feb 2026): queue-style consumption with per-record acks and more consumers than partitions.
    - **Managed/compatible:** Confluent Cloud, Amazon MSK, **Azure Event Hubs** (Kafka endpoint; likely in an Azure shop like Cummins), Redpanda, object-storage-backed brokers (WarpStream-style). "Kafka API" ≠ Apache Kafka: transactions, compaction or Connect can differ per service/tier.

    **When not:** low-volume request-response (an API call is simpler); needing per-message routing, priorities or delays (a queue); a cheaper managed ingestion service already covers it; nobody can operate it (go managed).

    **Interview:** what/why (durable distributed log, decoupling, replay, scale); vs a database (append-only log, retention, consumer-managed positions vs mutable queryable state); event-driven pros/cons.
  `),

  brokers: T(`
    > **In one line:** a cluster is a set of **brokers**. Data lives in **topics** (named event streams), each split into **partitions**: ordered, append-only logs spread across brokers. **Partitions are the unit of parallelism, ordering and scaling.**

    **Topics** («claims.events», «engine.telemetry»; at scale «<domain>.<entity>.<event>.<version>») are configured with partitions, replication factor, retention (time/size), cleanup policy (delete/compact), compression, min in-sync replicas.

    **Partitions:** each record gets an increasing **offset** within its partition; on disk a partition is **segment files** (e.g. 1 GB) + indexes, deleted/compacted per retention; records are only **appended** and read sequentially (why Kafka is fast). **Order is guaranteed only within a partition**, not across a topic.

    **Assignment:**
    - **With a key:** «hash(key) % partitions» → same key (engine_id) → same partition, in order.
    - **Without a key:** the **sticky partitioner** (since 2.4) fills one partition's batch before switching (better batching; not round-robin per record).
    - Custom partitioners are rarely needed.

    ## How many partitions
    - **Throughput:** target MB/s ÷ per-partition MB/s, with headroom.
    - **Consumer parallelism:** a partition is read by at most one consumer per group → partitions ≥ max consumers you'll want.
    - **Too many costs:** open files, memory, replication traffic, longer leader elections/recovery, more latency. Tens to low hundreds per topic is typical; thousands per broker is fine on modern Kafka but a smell; millions isn't.
    - **Hard to change:** increasing is possible but for keyed topics **changes key → partition mapping** (engine 77's new records go elsewhere, breaking per-key order and partition-keyed state). Can never decrease. Size for 1-2 years out, moderately over-provisioned.

    **Placement:** replicas spread across brokers and racks/zones («broker.rack»); one **leader** serves reads/writes, **followers** copy; leaders balanced; consumers can **fetch from the closest replica** (KIP-392) to cut cross-zone cost.

    ## What goes wrong
    - **Hot partition:** a skewed key (one chatty engine, NULL keys, or a plant gateway sending 5,000 engines under one plant_id) overloads one partition and consumer → high-cardinality, even keys; sub-key (engine_id not plant_id) if per-entity order must hold.
    - Consumers assuming order across partitions.
    - Too few partitions cap consumer scaling until you migrate topics.
    - Messages over 1 MB (default) rejected → store payloads in object storage, send a reference.

    **Interview:** how a partition is chosen; ordering (only within a partition, key by entity); how many partitions (throughput + parallelism + headroom; can't decrease; adding changes key mapping).
  `),

  prodcons: T(`
    > **In one line:** **producers** write records; **consumers** read them; consumers sharing a **group.id** form a **consumer group** that **splits** a topic's partitions (each read by exactly one member), so the group scales out. Different groups read the same data independently.

    ## Producers
    Build a record (topic, key, value, headers, timestamp) → **serialise** (Avro/Protobuf/JSON, often via a registry) → **partitioner** → **batch** per partition and **compress** → send to the partition leader.

    | Setting | Effect |
    |---|---|
    | «acks=0» / «1» / «all» | Fire-and-forget (may lose) / leader wrote it (lost if leader dies before followers copy) / all in-sync replicas wrote it (with «min.insync.replicas=2» survives a broker loss). «all» default since 3.0 |
    | «enable.idempotence=true» | Broker de-duplicates retries per partition, keeps order (default since 3.0) |
    | «max.in.flight.requests.per.connection» ≤ 5 | Required for ordering with idempotence |
    | «linger.ms», «batch.size» | Bigger batches = throughput, more latency (default linger 5 ms since 4.0) |
    | «compression.type» | lz4/zstd/snappy: less network/disk, more CPU |
    | «delivery.timeout.ms» | Bound on send + retries; then the send fails: handle the callback |
    **Fire-and-forget bug:** not checking send callbacks/futures makes failed sends invisible. Turbofan's producer counts acknowledged sends into a manifest so verification is possible.

    ## Consumers
    **Poll** batches, process, **commit offsets** (stored in «__consumer_offsets» per group/topic/partition).
    - «auto.offset.reset» for a new group: «earliest» or «latest» (**latest silently skips all existing data**).
    - «enable.auto.commit» commits on a timer regardless of processing (loss or duplicates on crash). Prefer **manual commit after processing** (at-least-once).
    - Also «max.poll.records», «isolation.level=read_committed» for transactional producers.
    - Spark Structured Streaming keeps offsets in its own checkpoint.

    **Groups:** 6 partitions / 3 consumers → 2 each; 6 / 8 → 2 idle. A **rebalance** reassigns partitions when members join, leave, crash or poll too slowly («max.poll.interval.ms»); classic rebalances pause consumption; **cooperative rebalancing** and **static membership** reduce it. The alerting service and the lakehouse ingestion each have their own group and offsets.

    **Lag** = latest offset − committed offset; growing lag = can't keep up; one lagging partition = skew or a stuck consumer.

    ## What goes wrong
    - Processing longer than «max.poll.interval.ms» → kicked out, rebalance, reprocessing: a **rebalance storm** → smaller batches, faster processing or longer interval.
    - Poison messages crash deserialisation and stop a partition → DLQ.
    - Per-record remote calls are slow → batch per poll.

    **Interview:** consumer group (sharing for scale, independent groups); acks levels (durability vs latency); rebalance causes and cost; monitoring (lag per partition, rebalance rate, processing time).
  `),

  offsets: T(`
    > **In one line:** an **offset** is a record's position in a partition. Consumers **commit** the offset of the **next** record to read; that committed position makes resuming, replaying and delivery guarantees possible.

    **Positions:** **log start offset** (oldest retained; moves forward with retention, offsets never reused); **committed offset** (group position: resume point after restart or rebalance); **high watermark** (last record replicated to all in-sync replicas: consumers read up to here); **log end offset** (last written). **Lag** = log end/high watermark − committed.

    **Commit timing = semantics:** before processing → at-most-once; after → at-least-once (duplicates if crash between); atomically with output (Kafka transactions, or a sink storing offsets in the same transaction/version as data) → exactly-once.

    **Where they live:**
    - Classic consumers: «__consumer_offsets».
    - **Spark Structured Streaming: its checkpoint**, not group commits, for correctness (the group id is for monitoring/permissions; committing to Kafka is optional, for external lag tools).
    - Some sinks store "last offset per partition" in the same DB transaction as the data.

    **Replay:** reset a group by offset or time («kafka-consumer-groups --reset-offsets --to-datetime …», «offsetsForTimes»), only **within retention** (beyond that, replay from bronze). For Spark: a new checkpoint with «startingOffsets» / «startingTimestamp», or restore an old checkpoint (not the reset command).

    ## What goes wrong
    - **Offsets out of range:** the consumer was down longer than **topic retention**, so the needed records are deleted. It jumps to earliest/latest per «auto.offset.reset» (reprocessing or **silent loss**); Spark stops with «failOnDataLoss» (default true). Alert on lag **in time** approaching retention.
    - **Offset retention:** an inactive group's committed offsets expire («offsets.retention.minutes», 7 days) → restart from «auto.offset.reset».
    - Committing offsets for records still being processed by async threads → loss on crash.
    - Transactional topics contain control markers: never assume offset + 1 is the next record.
    - Deleting a Spark checkpoint resets progress (duplicates or gaps).

    **Interview:** offset vs committed offset; reprocessing the last 6 hours (reset to a timestamp within retention, or new checkpoint with starting timestamp, idempotent sink); consumer offline longer than retention.
  `),

  kreplication: T(`
    > **In one line:** each partition has a **replication factor** (usually 3): a **leader** handles reads/writes, **followers** copy it, caught-up followers form the **ISR** (in-sync replicas). With «acks=all» and «min.insync.replicas=2», an acknowledged write survives losing a broker.

    **Mechanics:** producers write to the leader; followers fetch continuously; a follower too far behind («replica.lag.time.max.ms») leaves the ISR and rejoins when caught up; the **high watermark** (highest offset on all ISR members) caps what consumers read, so they never see data that could vanish on failover; a failed leader is replaced **from the ISR** by the controller.

    | Setting | For important data | Meaning |
    |---|---|---|
    | replication.factor | 3 | Three copies |
    | min.insync.replicas | 2 | acks=all writes need ≥ 2 in sync, else producer error (NotEnoughReplicas) |
    | acks | all | Wait for all ISR |
    | unclean.leader.election.enable | false (default) | Never elect an out-of-sync replica (it would truncate acknowledged data) |
    | enable.idempotence | true | No retry duplicates |
    **The durability triangle:** RF 3 + min ISR 2 + acks=all → lose one broker, keep writing, no loss; lose two → writes stop (consistency over availability).

    **Rack/zone awareness:** «broker.rack» spreads replicas across zones; follower fetching cuts cross-zone traffic. **Cross-region:** in-cluster replication is synchronous within a region; across regions MirrorMaker 2 / Cluster Linking are **asynchronous** (offsets differ, RPO > 0).

    ## What goes wrong
    - RF 1 in production: one failure = loss.
    - **min ISR 1 with acks=all** is false safety: when the ISR shrinks to the leader, writes are acked with one copy and lost if it dies right after.
    - **Unclean election on:** availability by electing a stale replica, silently dropping messages.
    - **ISR shrinking** under load silently reduces durability until writes fail → alert on **under-replicated partitions > 0**.

    **Interview:** how Kafka ensures durability (RF, ISR, acks=all, min ISR, no unclean election); what the ISR is; what happens when a broker dies.
  `),

  retention: T(`
    > **In one line:** a **cleanup policy** decides what Kafka keeps: **delete** (drop segments older than a time or beyond a size) or **compact** (keep at least the **latest value per key** forever). Retention decides how far back consumers can replay and what storage you pay for.

    **Delete:** «retention.ms» (e.g. 7 days) and/or «retention.bytes» per partition; whole **segments** are removed once all their records expire (so actual retention is slightly longer). For event streams: telemetry, clickstreams, raw CDC (with a lakehouse copy for long history).

    **Compact:** the log cleaner keeps the **latest record per key**, removing older ones in the background. A key with a **null value** is a **tombstone** (deletes the key; kept for «delete.retention.ms» so consumers see the delete). The topic becomes a **changelog table**: replay to rebuild current state. For latest engine config/customer profile, Kafka Streams changelogs, CDC topics needing latest row per key, consumer offsets internally. «cleanup.policy=compact,delete» also expires keys not updated within retention (state topics where stale keys should go).

    ## Choosing retention
    - **Recovery window:** longest plausible consumer outage + margin (weekend → 7 days is common; 3-7 days typical).
    - **Replay needs:** older replays come from lakehouse bronze (the long-term replay source).
    - **Cost:** broker disk × replication factor; **tiered storage** (3.6+ early access, GA 3.9; Confluent) for cheap long retention.
    - **Compliance:** personal data follows retention/deletion rules; compaction + tombstones can delete per key; delete retention can't remove one record early.

    ## What goes wrong
    - **Compaction isn't instant** (only the "dirty" part is cleaned when the cleaner runs) → consumers still see several values per key.
    - Null keys are rejected in compacted topics.
    - Compaction keeps the latest **offset** per key, so per-key updates must go **in order to one partition** (keyed).
    - Retention too short + consumer outage = loss (offset out of range).
    - **Size-based retention** on bursty topics drops data much faster than expected in a spike.

    **Interview:** delete vs compact; tombstone; current state per engine (compacted topic keyed by engine_id).
  `),

  ordering: T(`
    > **In one line:** Kafka orders **only within a partition** (and per producer session). Keep an entity's events in order by **keying by that entity**, then protect order through producer retries, consumer parallelism and sink writes. Global order needs one partition, which kills scalability.

    ## The chain (every link must hold)
    1. **Producer:** same key → same partition. Without idempotence, retries can reorder (batch 2 succeeds before retried batch 1); **idempotent producers** keep order with ≤ 5 in-flight requests.
    2. **Broker:** appends in arrival order per partition.
    3. **Consumer:** reads a partition in order, but **thread pools reorder** unless work is sharded by key across threads.
    4. **Sink:** batch writes must reflect the latest event per key: apply by offset/sequence, not arrival across partitions. **Spark breaks Kafka order across a shuffle**: within a micro-batch, a key's rows can be processed in any order → sort by a sequence within the key in foreachBatch, or use event-time logic.

    **Order matters** for one entity's state changes (claim status, CDC rows, balances, engine start/stop); **not** for independent events aggregated by event-time windows. **Offset order ≠ event-time order:** perfectly ordered partitions can hold out-of-order event times (device buffering) → event-time windows + watermarks.

    **Design rule:** carry a monotonic **sequence number/version** per event; consumers apply only if newer. Ordering bugs then degrade to "ignored stale update" instead of "corrupted state".

    ## What goes wrong
    - Re-keying an entity, or increasing partitions, splits its events across partitions.
    - **Multiple producers** for one key (two services updating a claim) have no mutual order → versions.
    - Retry topics/DLQs pull a record out; later events for the key overtake it.

    **Interview:** guaranteeing order (key by entity, idempotent producer, per-partition/per-key processing, apply by sequence); global order (one partition, or sequence numbers + downstream reordering).
  `),

  kvsmq: T(`
    > **In one line:** traditional queues (RabbitMQ, ActiveMQ, Azure Service Bus, SQS) **deliver each message to one consumer and delete it**, with rich routing and per-message acks. Kafka is a **durable log** many consumers read independently, with retention and replay at very high throughput. Queues are for **work distribution**; Kafka for **event streams**.

    | | Kafka | Traditional queue |
    |---|---|---|
    | Model | Partitioned append-only log | Queue (+ exchanges/topics for routing) |
    | After consumption | Retained; position per group | Deleted once acked |
    | Many independent readers | Natural (groups) | Needs fan-out copies (exchanges, SNS) |
    | Replay | Reset offsets | No |
    | Ordering | Per partition | Per queue, weakened by competing consumers |
    | Throughput | Millions/s | Moderate-high |
    | Per-message features | Limited natively | Priorities, delays, TTL, ack/nack, routing keys, request/reply, built-in DLQ |
    | Scaling | By partitions | Add competing consumers freely |
    | Use | Streams, CDC, telemetry, logs, pipelines | Task/job queues, request buffering, workflows |

    **Choose Kafka** for many consumers of the same events, replay, high volume, long retention, stream processing, CDC, feeding a lakehouse. **Choose a queue** when each message is a **task** done once by any worker (send an email, resize an image), you need priorities/delays/per-message retries or complex routing, volume is modest and operating Kafka is overkill.

    **2026 update:** Kafka **share groups** (KIP-932, production-ready in 4.2, Feb 2026) give many consumers the records of the same partitions with **per-record acks, redelivery on lock timeout and delivery-count limits**, once the defining queue features. Classic groups remain right for ordered, replayable stream processing.

    **Azure mapping:** **Event Hubs** ≈ Kafka (partitioned log, consumer groups, Kafka protocol); **Service Bus** ≈ queue/topic broker; **IoT Hub** = device-facing ingestion with device identity, routing to Event Hubs-compatible endpoints. Elsewhere: Kinesis vs SQS; Pub/Sub sits in between.

    **Interview:** Kafka vs RabbitMQ (log vs queue, retention/replay, groups, throughput, per-message features); image jobs → a queue; telemetry to analytics + alerting → Kafka.
  `),

  ksemantics: T(`
    > **In one line:** Kafka's building blocks: **acks + retries** (no loss), **idempotent producers** (no retry duplicates), **transactions** (atomic writes across partitions + offset commits) and **read_committed** consumers. End-to-end exactly-once also needs an idempotent or transactional **sink**.

    | Goal | Settings |
    |---|---|
    | Don't lose acked messages | acks=all, min.insync.replicas=2, RF 3, retries, unclean election off |
    | No retry duplicates | enable.idempotence=true (producer ID + sequence numbers; broker discards duplicates) |
    | Order under retries | Idempotence with max.in.flight ≤ 5 |
    | Atomic multi-partition writes | transactional.id + initTransactions / beginTransaction / commitTransaction |

    **Consumer side:** commit before processing = at-most-once; after = at-least-once (most common). **Exactly-once within Kafka (consume-transform-produce):** a transactional producer writes output **and** the consumer offsets in one transaction («sendOffsetsToTransaction»); downstream uses «isolation.level=read_committed» to skip aborted data. Kafka Streams: «processing.guarantee=exactly_once_v2». **Zombie fencing:** «transactional.id» + epochs stop an old instance writing after a new one starts.

    **Beyond Kafka** (Delta, Postgres, an API), transactions don't apply:
    - Spark Structured Streaming: checkpointed offsets + Delta's idempotent batch commits.
    - Connect sinks: often at-least-once; exactly-once where the sink upserts by key or stores offsets with data.
    - Custom consumers: data + offsets in the same DB transaction, or upsert by unique event ID.

    ## What goes wrong
    - **Idempotence covers retries within one producer session only:** an app that crashes and re-sends the same business event creates a new record → dedupe by business event ID downstream.
    - **«read_uncommitted» is the default:** consumers see aborted transactional records.
    - Transactions cost latency (commit markers, coordinator round trips) → use where it matters, batch commits sensibly.

    **Interview:** does Kafka support exactly-once (yes within Kafka; end to end needs a cooperating sink); what «enable.idempotence» does; Kafka → lakehouse (checkpoint + Delta, or upsert by event ID).
  `),

  schemareg: T(`
    > **In one line:** a **schema registry** stores versioned schemas (Avro, Protobuf, JSON Schema) per topic and **rejects incompatible changes** before a producer publishes. Messages carry only a small **schema ID**. "A producer renamed a field and broke six consumers at 3 a.m." becomes "the producer's deploy failed in CI".

    **How:** the producer serialiser registers/looks up the schema under a **subject** (default «<topic>-value», «<topic>-key»), gets an ID, writes «[magic byte 0][4-byte schema id][payload]». The consumer reads the ID, fetches the writer schema (cached) and decodes; Avro **resolves** writer vs reader schema (fills defaults for missing fields, ignores unknown ones). Each new version is checked against the subject's **compatibility mode**.

    | Mode | Guarantee | Allowed (Avro) | Upgrade first |
    |---|---|---|---|
    | **BACKWARD** (default) | New schema reads data from the previous one | Delete fields; add fields **with defaults** | **Consumers** |
    | **FORWARD** | Previous schema reads new data | Add fields; delete fields with defaults | **Producers** |
    | **FULL** | Both | Add/delete only fields with defaults | Either |
    | ***_TRANSITIVE** | Against **all** previous versions | Same, stricter | |
    | NONE | No checks | Anything | Danger |
    Topics **replayed from the beginning** (compacted state, event-sourced, long retention) need *_TRANSITIVE: v7 code may read v1 data.

    ## Breaking changes, done safely
    - **Rename** = delete + add (breaks most modes) → Avro **alias**, or add the new field, dual-write through a deprecation window, then drop the old one.
    - **Type change** (int → string) is incompatible; Avro allows promotions int → long → float → double and string ↔ bytes.
    - **Meaning change with the same schema** (amount now paise, not rupees) passes every check and is the most dangerous: contracts must carry **semantics**.
    - Real redesigns → **new topic** («claims.v2»), run both, migrate consumers, retire v1.

    | | Avro | Protobuf | JSON Schema |
    |---|---|---|---|
    | Encoding | Compact binary, needs writer schema | Compact binary, field numbers | Text |
    | Evolution | Defaults + resolution, mature in Kafka | Field numbers; **never reuse one** | Weaker tooling, permissive |
    | Typical | Kafka/Confluent | gRPC/microservices | Teams starting from JSON |

    **Lakehouse:** Spark «from_avro» with registry integration (Databricks supports it) or a consumer deserialiser; **bronze keeps raw bytes/JSON + schema ID** to re-decode after a fix; silver evolves with compatible changes (add nullable columns) and alerts on anything else.

    **Interview:** BACKWARD and who deploys first; renaming an Avro field safely; what a registry can't catch (semantic changes).
  `),

  lagscale: T(`
    > **In one line:** **consumer lag** (latest offset − committed offset) is the number one streaming health metric. Scale by adding consumers **up to the partition count**; every membership change triggers a **rebalance**, which pauses consumption and causes duplicates and lag spikes.

    **Lag:** per partition «log-end-offset − committed offset»; also **lag in time** (age of the oldest unprocessed message), which SLAs care about. Rising = processing < input; stable non-zero can be fine (micro-batch latency); **one partition** lagging = hot key or stuck consumer. Tools: «kafka-consumer-groups --describe», Burrow, Kafka UI, cloud metrics (Event Hubs incoming vs outgoing), Spark progress («inputRowsPerSecond» vs «processedRowsPerSecond», offsets per batch).

    ## Scaling
    - **Partition count = max parallelism** for a classic group (12 partitions, 20 consumers → 8 idle). Choose for future throughput × headroom.
    - **Adding partitions later** changes «hash(key) % partitions»: per-key order breaks for moved keys; partition-keyed state/compacted topics get confused. Plan keyed topics up front.
    - **Spark:** «minPartitions» splits Kafka partitions into more tasks; «maxOffsetsPerTrigger» caps each micro-batch (backpressure).
    - Slow per-record work (external call) → batch/async inside the consumer or move it out; more partitions alone may not help.
    - **Share groups** (KIP-932, production-ready 4.2, Feb 2026): several consumers process the **same partition** with per-record acks, lifting the partition cap for queue-style work at the cost of per-partition order.

    ## Rebalancing
    - **«session.timeout.ms»** (45 s): no heartbeats → declared dead.
    - **«max.poll.interval.ms»** (5 min) between polls: a batch slower than that (slow DB write) gets the consumer kicked out, its batch re-delivered elsewhere (duplicates), and its return triggers another rebalance: a **rebalance storm** → smaller «max.poll.records», faster processing, longer interval.
    - **Eager** (old default) revokes all partitions (stop-the-world); **cooperative sticky** moves only what must move; **static membership** («group.instance.id») lets rolling restarts rejoin without a rebalance; Kafka 4.0's **new group protocol** (KIP-848, GA) moves assignment to the broker, incremental rebalances.
    - Commit **after** processing, and in «onPartitionsRevoked», to minimise duplicates.

    **Catch-up after an outage:** 6 hours of backlog arrives at once; without limits a micro-batch engine takes it in one batch (OOM, huge state). With «maxOffsetsPerTrigger» it drains in bounded batches; **drain rate = processing rate − input rate** predicts catch-up time (Turbofan's load test measured backlog drain and steady-state latency).

    **Interview:** what lag is and how to monitor; 12 partitions / 20 consumers; rebalancing every few minutes with growing lag (max.poll.interval exceeded); just adding partitions to a keyed topic.
  `),

  statefulstream: T(`
    > **In one line:** stateless streaming (filter, parse, project) is easy. **Stateful** streaming (windows, dedupe, stream-stream joins, sessions, "alert once per incident") keeps **state** between micro-batches and must decide **when a result is final** and **when state can go**. **Event time + watermarks** answer both; get them wrong and you get unbounded state (OOM, slow checkpoints) or silently dropped data.

    **Event vs processing time:** devices buffer and networks reorder; processing-time aggregates depend on lag; event-time aggregates are right but must wait for late data, not forever.

    ## Watermarks
    «withWatermark('event_ts', '10 minutes')» → watermark = **max event time seen − 10 min** (per micro-batch; with several inputs, the minimum across them by default): "no more events older than this".
    - Windows ending before it are **finalised** (emitted in append mode) and their **state dropped**.
    - Older events are **dropped** as too late; count them («numRowsDroppedByWatermark»).
    - Longer delay = more complete, more state, later output; shorter = lower latency, more drops. Choose from **measured lateness** (e.g. p99.9 of «ingest_ts − event_ts»), not a guess (Turbofan injected 30-s-late events to prove its choice).
    - A device clock **in the future** pushes max event time forward and makes everyone "late" → validate/clamp timestamps first.

    | Output mode | Emits | Works with |
    |---|---|---|
    | Append | Only rows that won't change (final windows) | Aggregations **with** a watermark; files, Delta append |
    | Update | Rows changed this batch | Upsert sinks (foreachBatch + MERGE) |
    | Complete | Whole result each batch | Small aggregates only (state never dropped) |

    ## Stateful operators
    - **Windows:** tumbling «window(ts,'5 minutes')»; sliding «window(ts,'10 minutes','5 minutes')» (each event in several); session «session_window(ts,'30 minutes')».
    - **Dedupe:** «dropDuplicates(['event_id','event_ts'])» **with a watermark**, or «dropDuplicatesWithinWatermark(['event_id'])» (3.5+) when duplicates have different timestamps. Without a watermark state grows forever (why dedupe OOMs after two weeks).
    - **Stream-stream joins** buffer both sides: inner joins need watermarks on both **and a time-range condition** («impressions.ts BETWEEN clicks.ts - interval 1 hour AND clicks.ts») for cleanup; outer joins require them and emit the NULL side only after the watermark passes.
    - **Stream-static joins:** static side re-read each batch (Delta) or broadcast; no state.
    - **Arbitrary state:** «applyInPandasWithState», «flatMapGroupsWithState», Spark 4 «transformWithState» (timers, TTL, several state variables) for "alert once per incident, reset when healthy".

    ## State store and checkpoints
    - State per shuffle partition: in-memory HDFS-backed or **RocksDB** on local disk (the production choice for large state), snapshotted to the checkpoint.
    - **Shuffle partition count is fixed by the checkpoint** at first start; changing the setting later does nothing for that query.
    - **Changing stateful logic** (keys, aggregate functions, window size, adding an operator) is often **incompatible**: fails to restart or gives wrong results → new checkpoint + backfill from bronze, or state reader/rewriter tools. So you can't simply change 5- to 10-minute windows in a running query.
    - Monitor state rows/memory, checkpoint duration, batch duration vs trigger.

    **Exactly-once with state:** offsets + state + sink commit are tied to the batch ID; a replayed batch recomputes the same transitions and Delta ignores the duplicate commit. Side effects outside the sink (alert emails in foreachBatch) need their own idempotency keys.

    **Interview:** what a watermark is and what happens to later events; dedupe OOM after two weeks; changing a running window; choosing the delay.
  `),

  connect: T(`
    > **In one line:** **Kafka Connect** moves data between Kafka and other systems by **configuration, not code** (source connectors in, sink connectors out). **Debezium** is the standard **log-based CDC** source family: it reads the transaction log and publishes every insert, update and delete.

    ## Connect
    - **Workers** (distributed cluster) run **connectors**, split into **tasks** (unit of parallelism).
    - **Converters** serialise (Avro/Protobuf/JSON + registry).
    - **SMTs** (single message transforms) do light per-record changes: rename, route topics, mask a field. Not joins or heavy logic.
    - Configs, source offsets and status live in Kafka topics → workers stateless and restartable.
    - **Errors:** default «errors.tolerance=none» stops the task on the first bad record; «errors.tolerance=all» + «errors.deadletterqueue.topic.name» sends bad records (sink side) to a DLQ topic with error headers.
    - Managed: Confluent Cloud connectors; Event Hubs supports the Kafka protocol and Connect; Databricks and ADF have native connectors for many sources.

    ## Debezium
    - Reads WAL/binlog/redo (Postgres logical replication slot, MySQL binlog, SQL Server CDC tables, Oracle LogMiner): every committed change **including deletes**, no polling load.
    - **Initial snapshot** (consistent read), then streams from the log position recorded at snapshot time: no gap, no overlap.
    - Envelope: «before», «after», «op» (c/u/d/r), «source» (db, table, **LSN/binlog position**, transaction id, «ts_ms» commit time), «ts_ms» (processing time).
    - Topic per table, **keyed by primary key** (a row's changes stay ordered in one partition); deletes followed by a **tombstone** for compaction.
    - **Apply by source position (LSN), not timestamps** (timestamps tie and skew).

    | Problem | Effect | Mitigation |
    |---|---|---|
    | Postgres slot not consumed for days | WAL piles up: **disk full on the production DB** | Monitor slot lag, alert, cap max slot WAL keep size |
    | Source schema change | New event schema; downstream breaks | Registry compatibility, schema history topic, contract with app team |
    | Big transaction / bulk update | Millions of events at once | Capacity, backpressure, bronze absorbs it |
    | Snapshot of a huge table | Long read on the source | Incremental snapshots (signal table), off-peak, replica |
    | Connector restart | Re-sends since last committed offset (at-least-once) | Idempotent apply keyed by PK + LSN |
    | Source log retention < outage | Change history lost → re-snapshot | Monitor, size retention |

    **Outbox pattern:** services write the business change **and** an outbox row in one transaction; Debezium streams the outbox. Avoids **dual writes** (DB commits but Kafka publish fails, or the reverse) and gives intentional domain events instead of raw table changes.

    **Interview:** SQL Server ERP → lakehouse with deletes (log-based CDC via Debezium/native CDC → Kafka → bronze → MERGE by PK and LSN); query- vs log-based CDC; why LSN not timestamp; what a stalled connector does to the source (WAL/disk growth).
  `),
};
