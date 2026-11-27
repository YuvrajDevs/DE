const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Offsets
  offsets: T(`
    > **In one line:** an **offset** is the position of a record within a partition (0, 1, 2…). Consumers **commit** the offset of the next record to read; that committed position is what makes resuming, replaying and delivery guarantees possible.

    ## How offsets work
    - Each partition assigns increasing offsets as records are appended. Offsets are never reused; with retention, old offsets disappear (the **log start offset** moves forward).
    - A consumer group stores, per partition, the **committed offset**: "next record to process".
    - On restart or rebalance, the new owner of a partition resumes from the committed offset.
    - Useful positions: **log start offset** (oldest retained), **committed offset** (group position), **high watermark** (last record replicated to all in-sync replicas; consumers can read up to here), **log end offset** (last written).
    - **Lag** = high watermark/log end − committed offset.

    ## Commit timing decides semantics
    - Commit **before** processing → at-most-once.
    - Commit **after** processing → at-least-once (duplicates on crash between processing and commit).
    - Commit **atomically with output** (Kafka transactions, or a sink that stores offsets in the same transaction/version as the data) → exactly-once.

    ## Where offsets live
    - Classic consumers: Kafka's «__consumer_offsets» topic.
    - **Spark Structured Streaming:** in its **checkpoint** directory (it does not rely on Kafka group commits for correctness); the Kafka group id is used mainly for monitoring/permissions.
    - Some sinks store offsets with the data (e.g. a JDBC table of "last processed offset per partition", updated in the same transaction as the data).

    ## Replay and resetting
    - Move a group's offsets to an earlier position (by offset or by timestamp) to reprocess, e.g. after fixing a bug: «kafka-consumer-groups --reset-offsets --to-datetime …».
    - Only works within retention. Beyond it, replay from the lakehouse bronze copy.
    - For Spark, replay means a new checkpoint with «startingOffsets» set, or restoring an old checkpoint.

    ## Edge cases and what goes wrong
    - **Offsets out of range:** the committed offset was deleted by retention (consumer was down too long). The consumer jumps to earliest or latest per «auto.offset.reset»: either reprocessing or **silent data loss**. Alert on lag approaching retention.
    - **Committing offsets for records not yet processed** (async processing threads) → loss on crash.
    - **Transactional topics** contain control markers; offsets are not perfectly contiguous; never assume "offset + 1 = next record".
    - **Deleting a Spark checkpoint** resets progress (duplicates or gaps depending on startingOffsets).

    ## How interviewers test this
    - "What is an offset and what is a committed offset?"
    - "How do you reprocess the last 6 hours of a topic?" Reset group offsets to a timestamp (within retention), or new checkpoint with starting offsets by timestamp; idempotent sink.
    - "What happens if a consumer is offline longer than retention?"
  `, {
    check: [
      mcq('A consumer group was down for 9 days; the topic retention is 7 days. What happens when it restarts?', ['It continues normally', 'Its committed offsets no longer exist; it jumps to earliest or latest per auto.offset.reset, losing or skipping data', 'Kafka restores the data', 'The topic is deleted'], 1, 'Alert on lag approaching retention; keep bronze copies for replay.'),
      mcq('Where does Spark Structured Streaming keep the Kafka offsets it relies on for exactly-once?', ['In __consumer_offsets only', 'In its checkpoint directory', 'In the driver memory', 'In ZooKeeper'], 1, 'The checkpoint is the source of truth for Spark.'),
      tf('Lag is the difference between the latest offset in a partition and the consumer group\'s committed offset.', true, 'Growing lag means consumers cannot keep up.'),
    ],
  }),

  // ================================================================== Replication in Kafka
  kreplication: T(`
    > **In one line:** each partition has a **replication factor** (usually 3): one **leader** replica handles reads and writes, **followers** copy it. Followers that are caught up form the **ISR** (in-sync replicas). With «acks=all» and «min.insync.replicas=2», an acknowledged write survives the loss of a broker.

    ## How it works
    - Producers write to the **leader**; followers **fetch** from the leader continuously.
    - A follower that falls too far behind (time-based: «replica.lag.time.max.ms») is removed from the **ISR**; it re-joins when it catches up.
    - The **high watermark** is the highest offset replicated to all ISR members; consumers only read up to it, so they never see data that could be lost on failover.
    - If the leader fails, the controller elects a new leader **from the ISR**.

    ## The durability settings that work together
    | Setting | Recommended for important data | Meaning |
    |---|---|---|
    | replication.factor | 3 | Three copies of each partition |
    | min.insync.replicas | 2 | A write with acks=all needs at least 2 replicas in sync, else the producer gets an error |
    | acks (producer) | all | Wait for all in-sync replicas |
    | unclean.leader.election.enable | false | Never elect an out-of-sync replica as leader (would lose acknowledged data) |
    | enable.idempotence (producer) | true | No duplicates from retries |
    With RF=3 and min ISR=2, you can lose one broker and keep writing; losing two stops writes (consistency over availability).

    ## Rack / zone awareness
    Spread replicas across racks or availability zones («broker.rack») so one zone outage does not take out all copies. Consumers can read from the closest replica (follower fetching) to save cross-zone traffic.

    ## Edge cases and what goes wrong
    - **RF=1** in production: one broker failure = data loss.
    - **min.insync.replicas=1 with acks=all** gives a false sense of safety: if the ISR shrinks to the leader alone, writes are acknowledged with one copy.
    - **Unclean leader election enabled:** availability restored by electing a stale replica, silently dropping messages.
    - **Under-replicated partitions** metric > 0 for long periods: a broker is unhealthy or overloaded.

    ## How interviewers test this
    - "How does Kafka ensure durability?" RF, ISR, acks=all, min ISR, no unclean election.
    - "What is the ISR?" Replicas caught up with the leader.
    - "What happens when a broker dies?"
  `, {
    check: [
      mcq('RF=3, min.insync.replicas=2, acks=all. Two of the three brokers holding a partition go down. What happens to producers?', ['Writes continue with one copy', 'Writes fail (not enough in-sync replicas) rather than risk losing data', 'Data is lost silently', 'Kafka adds replicas instantly'], 1, 'The settings choose consistency over availability.'),
      tf('Consumers can read records above the high watermark.', false, 'Only up to the high watermark, so they never see data that could vanish on failover.'),
      mcq('Why disable unclean leader election for critical topics?', ['It is faster', 'Electing an out-of-sync replica as leader would silently drop acknowledged messages', 'It saves disk', 'It is required for compaction'], 1, 'Prefer unavailability over silent loss for important data.'),
    ],
  }),

  // ================================================================== Retention and compaction
  retention: T(`
    > **In one line:** Kafka keeps data according to a **cleanup policy**: **delete** (drop segments older than a time or beyond a size) or **compact** (keep at least the **latest value per key** forever). Retention decides how far back consumers can replay and how much storage you pay for.

    ## Delete policy (time/size retention)
    - «retention.ms» (e.g. 7 days) and/or «retention.bytes» per partition.
    - Old **segments** are deleted whole once all their records are past retention (so actual retention is slightly longer than configured).
    - Use for event streams: telemetry, clickstreams, CDC raw events (paired with a lakehouse copy for long history).

    ## Compact policy
    - Kafka keeps the **latest record for each key**; older records with the same key are removed in the background by the log cleaner.
    - A record with a key and **null value** is a **tombstone**: it deletes the key (kept for «delete.retention.ms» so consumers see the delete, then removed).
    - Gives a topic that acts like a **changelog table**: replay it to rebuild the current state of every key.
    - Use for: current state per entity (latest engine configuration, latest customer profile), Kafka Streams state store changelogs, CDC topics where you need the latest row per key, consumer offsets (internally).
    - «cleanup.policy=compact,delete» combines both: compacted, but also expires keys not updated within retention.

    ## Choosing retention
    - **Recovery window:** how long can a consumer be down and still catch up? (Weekend + margin → 7 days is common.)
    - **Replay needs:** bug fixes needing reprocessing; usually served from the lakehouse bronze for anything older.
    - **Cost:** broker disk (× replication factor); **tiered storage** (Kafka 3.6+, Confluent) moves old segments to object storage cheaply for long retention.
    - **Compliance:** personal data in topics is subject to retention and deletion rules (compaction + tombstones can delete per key; plain delete retention cannot delete one record early).

    ## Edge cases and what goes wrong
    - **Compaction is not immediate:** duplicates per key exist until the cleaner runs; consumers must still handle multiple values per key.
    - **Null keys** in a compacted topic are rejected.
    - **Retention too short** + a consumer outage = data loss (offset out of range).
    - **Retention by size** on a bursty topic can drop data much faster than expected during a spike.

    ## How interviewers test this
    - "Delete vs compact cleanup policy?"
    - "What is a tombstone?"
    - "How would you keep the current state of each engine in Kafka?" Compacted topic keyed by engine_id.
  `, {
    check: [
      mcq('Which topic configuration keeps the latest record for each key indefinitely?', ['cleanup.policy=delete with retention.ms=-1', 'cleanup.policy=compact', 'retention.bytes=0', 'min.insync.replicas=1'], 1, 'Compaction keeps at least the latest value per key.'),
      mcq('In a compacted topic, how do you delete a key?', ['You cannot', 'Produce a record with that key and a null value (a tombstone)', 'Delete the partition', 'Reset offsets'], 1, 'Tombstones are later removed after delete.retention.ms.'),
      tf('After compaction runs, a consumer is guaranteed to never see two values for the same key.', false, 'Compaction runs in the background; uncompacted segments can still hold older values.'),
    ],
  }),

  // ================================================================== Ordering
  ordering: T(`
    > **In one line:** Kafka guarantees order **only within a partition**. To keep events for an entity in order, **key by that entity**; then protect order through producer retries (idempotence), consumer parallelism and downstream writes. Global ordering across a topic requires one partition, which kills scalability.

    ## The ordering chain (all links must hold)
    1. **Producer:** same key → same partition. With retries, order can break if a later batch succeeds before an earlier retried batch; **idempotent producers** (default in modern clients, with «max.in.flight.requests.per.connection ≤ 5») keep order.
    2. **Broker:** appends in arrival order per partition.
    3. **Consumer:** reads a partition in order. If you process records **in parallel threads**, you lose order unless you parallelise **by key**.
    4. **Sink:** writing to a table in batches, the final state must reflect the latest event per key: apply by offset/sequence, not arrival order across partitions.

    ## When order matters and when it does not
    - **Matters:** state changes of one entity (claim status transitions, CDC row changes, account balances, engine start/stop).
    - **Doesn't:** independent events aggregated by time windows (temperature averages) where event time drives correctness.

    ## Event time vs order
    Even perfectly ordered partitions can contain events whose **event times** are out of order (device buffering). Ordering guarantees are about **arrival/offset** order, not event time. Stream processors use **event-time windows and watermarks** for time correctness.

    ## Edge cases and what goes wrong
    - **Key changes:** an entity's key changes (re-keying), so its events split across partitions.
    - **Repartitioning** a topic: old and new events of a key in different partitions.
    - **Multiple producers** for the same key (two services updating the same claim) have no ordering between them; use versions/sequence numbers.
    - **Retry topics / DLQs** remove a record from the ordered flow; later events for the same key overtake it.
    - **Spark micro-batch writes** combining events from many partitions: dedupe/apply per key by offset or version.

    ## How interviewers test this
    - "How do you guarantee ordering in Kafka?" Key by entity, idempotent producer, process per partition (or per key), apply by sequence in the sink.
    - "Can you get global ordering?" One partition (no parallelism) or sequence numbers and reordering downstream.
  `, {
    check: [
      mcq('Claim status events must be applied in order per claim. Which design works?', ['Random keys for even load', 'Key by claim_id, idempotent producer, apply in the sink by offset/sequence per claim', 'One topic per claim', 'Process with many threads in any order'], 1, 'Every link of the chain must preserve per-key order.'),
      tf('Ordered partitions guarantee events are in event-time order.', false, 'Offsets reflect arrival order; devices can send old events late.'),
      mcq('A consumer processes records from one partition with 16 parallel threads, any order. Effect?', ['Faster and still ordered', 'Per-key order is lost unless records are routed to threads by key', 'Kafka prevents this', 'No effect'], 1, 'Parallelise by key to keep per-key order.'),
    ],
  }),

  // ================================================================== Kafka vs MQ
  kvsmq: T(`
    > **In one line:** traditional message queues (RabbitMQ, ActiveMQ, Azure Service Bus, SQS) **deliver each message to one consumer and then delete it**, with rich routing and per-message acknowledgement. Kafka is a **durable log** that many consumers read independently, retains data and supports replay at very high throughput. Queues are for **work distribution**; Kafka is for **event streams**.

    ## Side by side
    | | Kafka | Traditional queue (RabbitMQ, SQS, Service Bus) |
    |---|---|---|
    | Model | Partitioned append-only log | Queue (and exchanges/topics for routing) |
    | After consumption | Retained; position per consumer group | Deleted once acknowledged |
    | Multiple independent readers | Natural (consumer groups) | Needs fan-out (exchanges, SNS) creating copies |
    | Replay | Yes, reset offsets | No (once acked, gone) |
    | Ordering | Per partition | Per queue (often weakened with competing consumers) |
    | Throughput | Very high (millions/s) | Moderate-high |
    | Per-message features | Limited (no per-message ack, priority, delay natively) | Rich: priorities, delays, TTL, per-message ack/nack, routing keys |
    | Consumer scaling | By partitions | Add competing consumers freely |
    | Typical use | Event streaming, CDC, telemetry, log aggregation, data pipelines | Task queues, job distribution, request buffering, workflows |

    ## Choosing
    - **Kafka** when: many consumers need the same events; replay matters; high volume; stream processing; feeding a lakehouse.
    - **Queue** when: each message is a **task** to be done once by any worker (send this email, resize this image); you need priorities, delays, per-message retries; volumes are modest.
    - Cloud equivalents: **Azure Event Hubs** (Kafka-like log, Kafka API compatible) vs **Azure Service Bus** (queue); **Kinesis** vs **SQS**; **Pub/Sub** sits in between.

    ## How interviewers test this
    - "Kafka vs RabbitMQ?" Log vs queue; retention/replay; multiple consumer groups; throughput; per-message features.
    - "Which would you use to distribute image-processing jobs to workers?" A queue. "To stream telemetry to analytics and alerting?" Kafka.
  `, {
    check: [
      mcq('Telemetry must feed a lakehouse, an alerting service and a search index, and be replayable after bugs. Best fit?', ['A traditional task queue', 'Kafka (or Event Hubs): retained log, independent consumer groups, replay', 'Email', 'A cron job'], 1, 'Multiple independent readers and replay are Kafka\'s strengths.'),
      mcq('Each uploaded PDF must be processed exactly by one of many workers, with retries and delays per message. Best fit?', ['Kafka', 'A message queue such as RabbitMQ, SQS or Service Bus', 'A data warehouse', 'HDFS'], 1, 'Task distribution with per-message features suits queues.'),
      tf('In a traditional queue, a message is typically removed once a consumer acknowledges it.', true, 'Kafka retains messages regardless of consumption.'),
    ],
  }),

  // ================================================================== Kafka delivery semantics
  ksemantics: T(`
    > **In one line:** Kafka gives you the building blocks for each guarantee: **acks and retries** on the producer (no loss), **idempotent producers** (no duplicates from retries), **transactions** (atomic writes across partitions plus offset commits), and **read_committed** consumers. End-to-end exactly-once also needs an idempotent or transactional **sink**.

    ## Producer side
    | Goal | Settings |
    |---|---|
    | Don't lose acknowledged messages | acks=all, min.insync.replicas=2, RF=3, retries enabled, unclean election off |
    | Don't duplicate on retry | enable.idempotence=true (producer ID + sequence numbers; broker discards duplicates) |
    | Keep order with retries | Idempotence with max.in.flight ≤ 5 |
    | Atomic multi-partition writes | transactional.id + initTransactions / beginTransaction / commitTransaction |

    ## Consumer side
    - **At-most-once:** commit before processing.
    - **At-least-once:** process, then commit (most common).
    - **Exactly-once within Kafka (read-process-write):** a transactional producer writes output records **and** the consumer's offsets in one transaction («sendOffsetsToTransaction»); downstream consumers use «isolation.level=read_committed» to ignore aborted data. Kafka Streams enables this with «processing.guarantee=exactly_once_v2».

    ## End-to-end with external systems
    Kafka transactions do not cover a database or a lakehouse. For Kafka → Delta/warehouse:
    - Spark Structured Streaming: checkpointed offsets + Delta's idempotent batch commits (exactly-once).
    - Kafka Connect sinks: many are at-least-once; exactly-once where the sink supports upserts by key or stores offsets with data.
    - Custom consumers: write data and offsets in the same database transaction, or upsert by a unique event ID.

    ## Edge cases and what goes wrong
    - **Idempotence only covers retries within one producer session.** If the application crashes and restarts, re-sending the same business event creates a new record; dedupe by business event ID downstream.
    - **read_uncommitted consumers** (the default!) see records from aborted transactions.
    - **Zombie producers:** an old instance of a transactional producer keeps writing after a new one started; transactional.id fencing prevents this.
    - **Exactly-once is not free:** transactions add latency and complexity; use where it matters.

    ## How interviewers test this
    - "Does Kafka support exactly-once?" Yes within Kafka (idempotent producer + transactions + read_committed); end to end needs a cooperating sink.
    - "What does enable.idempotence do?"
    - "How do you get exactly-once from Kafka into a lakehouse?" Structured Streaming checkpoint + Delta, or upsert by event ID.
  `, {
    check: [
      mcq('What does «enable.idempotence=true» on a producer prevent?', ['All duplicates everywhere', 'Duplicate records in the log caused by the producer\'s own retries', 'Consumer duplicates after a crash', 'Data loss on broker failure'], 1, 'It covers retries within a producer session, not application-level re-sends.'),
      mcq('Consumers of a transactional topic still see records from aborted transactions. Which setting is missing?', ['acks=all', 'isolation.level=read_committed', 'enable.auto.commit=false', 'compression.type=zstd'], 1, 'The default read_uncommitted shows aborted records.'),
      tf('Kafka transactions alone make writes to an external database exactly-once.', false, 'External sinks need idempotent upserts or storing offsets transactionally with the data.'),
    ],
    hands: [
      py({ q: 'Emulate the broker side of an **idempotent producer**. «append(log, state, producer_id, seq, value)»: «state» maps producer_id → last sequence number accepted. If «seq» is **≤ last accepted** it is a retry duplicate: ignore it and return «"duplicate"». If «seq == last + 1» (or it is the producer\'s first message with seq 0), append «value» to «log», update state, return «"ok"». Any other gap returns «"out_of_order"» without appending. Mutate «log» and «state» in place.', starter: 'def append(log, state, producer_id, seq, value):\n    pass\n',
        tests: `log, st = [], {}
assert append(log, st, 'p1', 0, 'a') == 'ok'
assert append(log, st, 'p1', 1, 'b') == 'ok'
assert append(log, st, 'p1', 1, 'b') == 'duplicate'
assert append(log, st, 'p1', 3, 'd') == 'out_of_order'
assert append(log, st, 'p2', 0, 'x') == 'ok'
assert append(log, st, 'p1', 2, 'c') == 'ok'
assert log == ['a', 'b', 'x', 'c'], log
assert append([], {}, 'p9', 5, 'z') == 'out_of_order'`,
        solution: `def append(log, state, producer_id, seq, value):
    last = state.get(producer_id, -1)
    if seq <= last:
        return 'duplicate'
    if seq != last + 1:
        return 'out_of_order'
    log.append(value)
    state[producer_id] = seq
    return 'ok'` }),
    ],
  }),
};
