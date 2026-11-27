const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Kafka and event-driven architecture
  kafkawhat: T(`
    > **In one line:** Apache Kafka is a **distributed, durable, append-only log** of events. Producers write events to **topics**; any number of consumers read them **independently, at their own pace, and can re-read** them. It decouples the systems that create events from the systems that use them, at very high throughput.

    ## The problem it solves
    Without Kafka, every system talks directly to every other: the CRM calls the warehouse loader, the analytics service, the alerting service, the search indexer. N producers × M consumers = N×M fragile point-to-point integrations. If one consumer is slow or down, the producer suffers or data is lost. Kafka puts a durable log in the middle: producers write once; consumers subscribe; each can fail, lag or replay without affecting the others.

    ## Event-driven architecture
    - An **event** is a fact that something happened: "claim 9001 approved at 10:02", "engine 77 reported 104 °C". Immutable, timestamped.
    - **Event-driven** systems react to events instead of polling or calling each other synchronously.
    - **Benefits:** loose coupling, independent scaling, replayability, real-time reactions, a natural audit trail.
    - **Costs:** eventual consistency, harder debugging across services, schema governance, duplicate handling, ordering subtleties.
    - Patterns: **event notification** (something changed, go look), **event-carried state transfer** (the event contains the data), **event sourcing** (the log of events *is* the system of record), **CQRS** (separate write and read models fed by events).

    ## What makes Kafka different from a database or a queue
    - **Log, not a queue:** messages are not deleted when read. They stay for the **retention** period (e.g. 7 days) or forever (compacted topics). Many consumer groups read the same data.
    - **Consumers track their own position** (offsets), so replay is just "move the offset back".
    - **Partitioned for scale:** a topic is split into partitions spread across brokers; throughput scales with partitions.
    - **Sequential disk I/O and batching:** extremely high throughput (millions of messages/s per cluster) on commodity hardware, using the OS page cache and zero-copy transfer.
    - **Replicated** for durability.

    ## The ecosystem
    | Component | Role |
    |---|---|
    | **Brokers** | Servers storing partitions and serving reads/writes |
    | **KRaft controllers** (formerly ZooKeeper) | Cluster metadata and leader election |
    | **Producers / consumers** | Client libraries in apps and pipelines |
    | **Kafka Connect** | Framework for source/sink connectors (Debezium CDC, JDBC, S3, Elasticsearch) |
    | **Schema Registry** | Stores Avro/Protobuf/JSON schemas, enforces compatibility |
    | **Kafka Streams / ksqlDB** | Stream processing libraries/SQL on Kafka |
    | **Managed:** Confluent Cloud, Amazon MSK, Azure Event Hubs (Kafka-compatible API) | |

    ## Where it sits in a data platform
    «««flow
    Apps, devices, CDC -> Kafka topics -> Spark Structured Streaming / Flink / Connect sinks -> Lakehouse bronze, alerting, search, microservices
    »»»
    For data engineering, Kafka is the **real-time ingestion backbone** and a **buffer** that absorbs bursts and lets downstream systems be down for a while without losing data.

    ## When not to use Kafka
    - Low volume, simple request-response integrations (an API call is simpler).
    - When you need per-message acknowledgement routing, priorities or delayed delivery (a traditional message queue may fit better).
    - When a managed cloud ingestion service already covers it more cheaply.
    - When nobody can operate it (use a managed service).

    ## How interviewers test this
    - "What is Kafka and why use it?" Durable distributed log; decoupling; replay; scale.
    - "Kafka vs a database?" Append-only log with retention and consumer-managed positions vs mutable state with queries.
    - "What is event-driven architecture? Pros and cons?"
  `, {
    check: [
      mcq('What happens to a Kafka message after a consumer group reads it?', ['It is deleted', 'It stays until the topic\'s retention expires (or forever with compaction); other groups can read it and the same group can re-read it', 'It moves to a dead-letter topic', 'It is archived to HDFS'], 1, 'Kafka is a log, not a queue that deletes on read.'),
      multi('Which are benefits of putting Kafka between producers and consumers?', ['Producers and consumers are decoupled and scale independently', 'Consumers can replay data by moving offsets', 'A slow consumer does not slow the producer', 'Strong consistency across all consumers instantly'], [0, 1, 2], 'Consumers see data at their own pace: eventual, not instant consistency.'),
      tf('Kafka Connect with a Debezium connector is a common way to stream database changes (CDC) into Kafka.', true, 'Connect runs source and sink connectors without custom code.'),
    ],
  }),

  // ================================================================== Brokers, topics, partitions
  brokers: T(`
    > **In one line:** a Kafka cluster is a set of **brokers** (servers). Data is organised in **topics** (named streams, like tables of events), each split into **partitions**: ordered, append-only logs spread across brokers. **Partitions are the unit of parallelism, ordering and scaling.**

    ## Topics
    - A topic is a named category of events: «claims.events», «engine.telemetry».
    - Configured with: number of partitions, replication factor, retention (time/size), cleanup policy (delete or compact), compression, min in-sync replicas.
    - Naming conventions matter at scale: «<domain>.<entity>.<event>.<version>».

    ## Partitions: how they work
    - Each partition is an **ordered, immutable sequence** of records; each record gets an increasing **offset** (0, 1, 2, …) within its partition.
    - On disk, a partition is a set of **segment files** (e.g. 1 GB each) plus indexes; old segments are deleted or compacted per retention.
    - Records are only ever **appended** at the end; reads are sequential, which is why Kafka is fast.
    - **Ordering is guaranteed only within a partition**, not across a topic.

    ## How records are assigned to partitions
    - **With a key:** «partition = hash(key) % number_of_partitions». All records with the same key (e.g. engine_id) go to the same partition **in order**.
    - **Without a key:** spread across partitions (sticky partitioner batches to one partition at a time, then switches).
    - **Custom partitioner:** your own rule (rarely needed).

    ## Choosing the number of partitions
    - **Throughput:** target MB/s ÷ per-partition MB/s (producer and consumer side), with headroom.
    - **Consumer parallelism:** one partition is read by at most one consumer in a group, so partitions ≥ the maximum consumers you want.
    - **Costs of too many:** more open files, longer leader elections and recovery, more end-to-end latency for replication, memory on clients. Thousands per broker is fine on modern Kafka; millions is not.
    - **Increasing later** is possible, but for keyed topics it **changes the key → partition mapping**: new records for engine 77 may go to a different partition than old ones, breaking per-key ordering across the change. Decide early; over-provision moderately.
    - Partitions can never be decreased.

    ## Brokers and placement
    - Each partition's replicas are spread across brokers (and racks/zones with rack awareness).
    - One replica is the **leader** (serves reads/writes), others are **followers**.
    - Leaders are balanced across brokers so load is spread.

    ## Edge cases and what goes wrong
    - **Hot partition:** a skewed key (one chatty engine, or NULL keys all hashing to one partition) overloads one partition and one consumer.
    - **Ordering across partitions** assumed by consumers that read a whole topic.
    - **Repartitioning a keyed topic** breaks ordering assumptions and state stores keyed by partition.
    - **Too few partitions** caps consumer scaling forever unless you migrate topics.
    - **Large messages** (> 1 MB default limit) rejected; store big payloads in object storage and send a reference.

    ## How interviewers test this
    - "How does Kafka decide which partition a message goes to?"
    - "Does Kafka guarantee ordering?" Only within a partition; key by entity to get per-entity order.
    - "How many partitions would you create?" Throughput + consumer parallelism + headroom; cannot decrease; adding changes key mapping.
  `, {
    check: [
      mcq('You need all events for each engine processed in order. How do you produce them?', ['Without a key', 'With engine_id as the message key, so each engine\'s events go to one partition in order', 'To a topic with one partition per event', 'With a random key'], 1, 'Per-key ordering comes from key-based partitioning.'),
      mcq('You increase a keyed topic from 6 to 12 partitions. What risk appears?', ['Data loss', 'The key-to-partition mapping changes, so new events for a key may go to a different partition than its older events (ordering across the change breaks)', 'Consumers stop', 'Nothing'], 1, 'Plan partition counts early for keyed topics.'),
      tf('Kafka guarantees ordering across all partitions of a topic.', false, 'Only within a partition.'),
      mcq('Where does the offset of a record have meaning?', ['Across the whole cluster', 'Within its partition only', 'Within the topic only', 'Within the consumer group'], 1, 'Each partition has its own offset sequence.'),
    ],
  }),

  // ================================================================== Producers, consumers, groups
  prodcons: T(`
    > **In one line:** **producers** write records to topics; **consumers** read them; consumers with the same **group.id** form a **consumer group** that **shares** the partitions of a topic, each partition read by exactly one member, so the group scales horizontally. Different groups read the same data independently.

    ## Producers
    - Build a record: topic, key, value, headers, timestamp.
    - **Serialise** key and value (Avro/Protobuf/JSON, often with a schema registry).
    - **Partitioner** picks the partition.
    - Records are **batched** per partition («batch.size», «linger.ms») and **compressed** («compression.type»: lz4/zstd/snappy).
    - Sent to the partition leader; the **acks** setting decides when the write counts as successful:
      - «acks=0»: fire and forget (may lose data).
      - «acks=1»: leader wrote it (lost if the leader dies before followers copy).
      - «acks=all»: all in-sync replicas wrote it (with «min.insync.replicas=2», survives one broker loss).
    - **Retries** on transient errors; with «enable.idempotence=true» (default in modern clients) retries do not create duplicates and per-partition order is preserved.

    ## Consumers
    - Subscribe to topics, **poll** batches of records, process them, and **commit offsets** (the position to resume from).
    - Offsets are stored in Kafka's internal «__consumer_offsets» topic per (group, topic, partition).
    - **auto.offset.reset** decides where a new group starts: «earliest» (beginning of retained data) or «latest» (only new data).
    - **Commit strategies:** auto-commit every N seconds (simple, can lose or duplicate on crash), or **manual commit after processing** (at-least-once). Spark Structured Streaming manages offsets in its own checkpoint instead.

    ## Consumer groups and rebalancing
    - Partitions of a topic are divided among the members of a group. 6 partitions, 3 consumers → 2 each. 6 partitions, 8 consumers → 2 consumers idle.
    - A **rebalance** reassigns partitions when members join, leave, crash or are too slow to poll («max.poll.interval.ms»). During a classic rebalance, consumption pauses; **cooperative (incremental) rebalancing** and **static membership** reduce the disruption.
    - Multiple groups = multiple independent readers: the alerting service and the lakehouse ingestion each have their own group and their own offsets.

    ## Lag
    **Consumer lag** = latest offset in the partition − the group's committed offset. Lag that grows means consumers cannot keep up. Monitor per partition: one lagging partition often means skew or a stuck consumer.

    ## Edge cases and what goes wrong
    - **Processing takes longer than max.poll.interval.ms** → the consumer is kicked out, rebalance, partitions reassigned, records reprocessed: a rebalance storm. Reduce batch size, process faster or raise the interval.
    - **Auto-commit + crash** → lost or duplicated records depending on timing.
    - **More consumers than partitions** → idle consumers.
    - **auto.offset.reset=latest** on a new group silently skips all existing data.
    - **Poison messages** that crash deserialisation stop a partition: handle with DLQ.
    - **Consumer processing per record with remote calls** is slow; batch work per poll.

    ## How interviewers test this
    - "What is a consumer group?" Sharing partitions for scale; independent groups for independent uses.
    - "acks=0/1/all?" Durability vs latency.
    - "What causes rebalances and why are they bad?"
    - "How do you monitor consumers?" Lag per partition, rebalance rate, processing time.
  `, {
    check: [
      mcq('A topic has 6 partitions. A consumer group has 8 members. What happens?', ['All 8 share the load equally', '6 consumers each get one partition; 2 stay idle', 'Kafka creates 2 more partitions', 'An error'], 1, 'Partitions cap parallelism within a group.'),
      mcq('Two different services both need every event from «claims.events». How?', ['Use the same group.id', 'Use different group.ids: each group gets every event and keeps its own offsets', 'Duplicate the topic', 'Only one can read it'], 1, 'Groups are independent readers.'),
      mcq('A consumer takes 10 minutes to process a poll batch; max.poll.interval.ms is 5 minutes. What happens?', ['Nothing', 'The consumer is considered dead, a rebalance happens and the batch is reprocessed by someone else, possibly repeatedly', 'Kafka extends the timeout', 'Data is deleted'], 1, 'Rebalance storms often come from slow processing.'),
      tf('A new consumer group with auto.offset.reset=latest will read the topic\'s existing history.', false, 'It starts at the end; use earliest to read retained history.'),
    ],
  }),
};
