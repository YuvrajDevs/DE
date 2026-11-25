const { learn, mcq, tf, multi, match, order, sql, spark, py, viz, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('stream', 'Streaming, Kafka and IoT', 'named in posting',
  'Event-based ingestion: Kafka topics, partitions, consumer groups and offsets, delivery semantics, Spark Structured Streaming with watermarks, and an engine telemetry pipeline end to end.',
  [
    lesson('r1', 'Kafka fundamentals', 20, [
      viz('kafka', 'Run a Kafka topic'),
      learn('The log at the centre', `
        **Kafka** is a distributed, durable, append-only **log** of events.
        - **Topic**: a named stream («engine-telemetry»). Split into **partitions** for parallelism.
        - **Offset**: position of a message within a partition. Ordering is guaranteed **only within a partition**.
        - **Producer**: writes events. Messages with the same **key** go to the same partition (hash(key) % partitions), which preserves per-key order.
        - **Consumer group**: consumers sharing work. Each partition is read by **one** consumer in the group, so max parallelism = number of partitions. Different groups read the same topic independently (alerting app and lake loader both get every event).
        - **Broker**: a Kafka server. **Replication factor** (often 3) copies each partition to other brokers. **ISR** (in-sync replicas) are those caught up with the leader.
        - **Retention**: events are kept for a time/size (e.g. 7 days) whether consumed or not, so consumers can **replay** by resetting offsets.
        - **Consumer lag** = latest offset − committed offset. The key health metric.
        - **Schema Registry** + Avro/Protobuf enforce message schemas and compatible evolution.

        Managed versions: Confluent Cloud, Amazon MSK, Azure Event Hubs (Kafka-compatible). Kafka Connect moves data in/out (JDBC, S3, Debezium CDC).
      `),
      mcq('A topic has 6 partitions and the consumer group has 10 consumers. What happens?', ['All 10 share the load', '6 consumers get one partition each, 4 sit idle', 'Kafka creates 4 more partitions', 'Messages are duplicated to all 10'], 1),
      mcq('Telemetry for each engine must be processed in order. What should the producer use as the message key?', ['A random UUID', 'engine_id', 'The timestamp', 'No key'], 1, 'Same key → same partition → ordered by offset.'),
      mcq('Consumer lag on the lake-loader group has grown steadily for 2 hours. Meaning?', ['Producers stopped', 'Consumers process slower than events arrive: they are falling behind', 'Kafka lost data', 'Retention is too long'], 1, 'Scale consumers (up to the partition count), speed up processing, or add partitions. Watch that lag doesn\'t exceed retention, or unread data is deleted.'),
      tf('Reading a message from Kafka removes it from the topic.', false, 'Kafka is a log, not a queue. Messages stay until retention expires. Each group tracks its own offsets.'),
      match('Match the Kafka term.', [['Offset', 'Position of a message within a partition'], ['Consumer group', 'Consumers splitting partitions of a topic'], ['Replication factor', 'Copies of each partition across brokers'], ['Lag', 'How far a consumer is behind the latest message']]),
    ]),
    lesson('r2', 'Delivery semantics and exactly-once', 15, [
      learn('At-most, at-least, exactly once', `
        | Semantics | How it happens | Risk |
        |---|---|---|
        | **At-most-once** | commit offset **before** processing | crash = lost messages |
        | **At-least-once** | commit offset **after** processing | crash after processing, before commit = **duplicates** on restart |
        | **Exactly-once** | idempotent producer + transactions, or at-least-once + **idempotent/transactional sink** | more complexity/latency |

        In practice most pipelines are **at-least-once + idempotent writes**: dedupe on an event ID, MERGE on a key, or commit output and offsets atomically (Spark Structured Streaming checkpoints + Delta sink give end-to-end exactly-once).

        Remember the raw feed in this arcade: «raw_orders_feed» contains **exact duplicate deliveries**. That is at-least-once in action, and why silver dedupes.
      `),
      mcq('A consumer processes a batch, writes it to the database, then crashes before committing offsets. With at-least-once semantics, what happens on restart?', ['The batch is lost', 'The batch is processed again: duplicates unless the write is idempotent', 'Kafka deletes the batch', 'The consumer skips to the latest offset'], 1),
      multi('Ways to get effectively exactly-once results from an at-least-once stream:', ['MERGE into the target on a unique event_id', 'Use the Spark checkpoint + a transactional sink (Delta)', 'INSERT every event blindly', 'Dedupe with dropDuplicates within a watermark'], [0, 1, 3]),
      scenario('Duplicate alerts flooding the service desk', `The overheating alert service emails service managers when an engine exceeds 105°C. After a consumer restart this morning, managers received **3–4 identical alerts** per engine.`, [
        ['Why did the restart cause duplicates?', [
          ['The consumer reprocessed messages since the last committed offset (at-least-once), and the alert sender isn\'t idempotent', true, 'Restart replays the uncommitted window. Every replayed event re-sent an email.'],
          ['Kafka duplicated the messages', false, 'Kafka replayed from offsets as designed.'],
          ['The engines overheated 4 times', false, 'Same timestamps, same readings.'],
        ]],
        ['Best fix?', [
          ['Make alerting idempotent: record (engine_id, alert_window) sent in a state store/table and skip if already sent', true, 'Idempotency at the side-effect boundary is the robust fix.'],
          ['Switch to at-most-once', false, 'Then a crash loses real overheating alerts. Worse.'],
          ['Never restart consumers', false, 'Restarts are inevitable.'],
        ]],
      ]),
    ]),
    lesson('r3', 'Spark Structured Streaming', 20, [
      viz('watermark', 'Late data and watermarks'),
      learn('Streams as unbounded tables', `
        Structured Streaming treats a stream as a table that keeps growing. You write the **same DataFrame code** and Spark runs it incrementally in micro-batches.

        «««python
        events = (spark.readStream.format("kafka")
                  .option("kafka.bootstrap.servers", "broker:9092")
                  .option("subscribe", "engine-telemetry").load()
                  .select(F.from_json(F.col("value").cast("string"), schema).alias("e")).select("e.*"))

        per_window = (events
          .withWatermark("event_time", "10 minutes")                    # how late data may be
          .groupBy(F.window("event_time", "5 minutes"), "engine_id")
          .agg(F.max("temperature_c").alias("max_temp")))

        (per_window.writeStream
          .format("delta").outputMode("append")
          .option("checkpointLocation", "/chk/telemetry_5min")          # offsets + state: exactly-once
          .trigger(processingTime="1 minute")
          .start("/lake/silver/telemetry_5min"))
        »»»
        - **Event time** (when it happened) vs **processing time** (when Spark saw it). Aggregate on event time.
        - **Watermark** = max event time seen − allowed lateness. Windows older than the watermark are finalised and their state dropped; later events for them are discarded.
        - **Output modes**: «append» (only finalised rows, needs a watermark for aggregations), «update» (changed rows), «complete» (whole result table each time, small aggregates only).
        - **Triggers**: «processingTime="1 minute"», «availableNow=True» (process everything available then stop: streaming code, batch cost).
        - **Checkpoint** location stores offsets and state. Never delete it casually. Changing the query shape may need a new one.
      `),
      mcq('Why is a watermark required for an append-mode windowed aggregation?', ['To encrypt state', 'So Spark knows when a window is complete and can emit it and drop its state', 'To sort the output', 'It isn\'t required'], 1),
      mcq('A streaming job restarts after a cluster failure. What lets it resume without losing or double-counting data?', ['The checkpoint (offsets + state) combined with an idempotent/transactional sink', 'Kafka retention alone', 'Restarting from the latest offset', 'Re-running from the beginning'], 0),
      match('Match the output mode.', [['append', 'Only new, finalised rows'], ['update', 'Rows that changed since the last trigger'], ['complete', 'The entire result table every trigger']]),
      tf('«trigger(availableNow=True)» lets you run streaming code as a cost-efficient scheduled batch.', true, 'It processes all new data since the checkpoint, then stops. Great for hourly incremental loads.'),
    ]),
    lesson('r4', 'An IoT telemetry pipeline', 18, [
      learn('Engine telemetry, end to end', `
        «««flow
        Engine ECM sensors -> IoT gateway / MQTT -> Kafka (key = engine_id) -> Bronze stream (raw JSON) -> Silver (parsed, typed, deduped, unit-normalised) -> Gold (5-min aggregates, anomalies) -> Alerts + dashboards + ML features
        »»»
        Design points interviewers love:
        - **Volume**: 50,000 engines × 1 reading / 5 s ≈ 10,000 events/s ≈ 860M/day. Partition Kafka by engine_id. Partition the lake by date (and cluster by engine_id).
        - **Late / out-of-order** events from engines that lose connectivity, so use event-time processing with watermarks plus a daily batch correction.
        - **Data quality**: physical range checks (temperature −40..150°C), stuck-sensor detection (same value for 1 h), unit normalisation (°F → °C).
        - **Hot path vs cold path**: real-time alerting (seconds) vs historical analytics and ML (batch). That's a **lambda**-style split. A **kappa** architecture uses the stream for both.
        - **Device registry** (DynamoDB/Cassandra) for engine metadata lookups at speed.
      `),
      sql({ q: `Anomaly batch check on the gold side: per engine, the max temperature and the number of readings above **95°C**. Return engines with at least one such reading: «engine_id, max_temp, hot_readings».`, tables: ['sensor_readings'], solution: `SELECT engine_id, MAX(temperature_c) AS max_temp, SUM(CASE WHEN temperature_c > 95 THEN 1 ELSE 0 END) AS hot_readings
FROM sensor_readings GROUP BY engine_id HAVING SUM(CASE WHEN temperature_c > 95 THEN 1 ELSE 0 END) > 0;`, level: 2 }),
      spark({ q: `Tumbling windows in batch: aggregate «sensor_readings» into **15-minute windows** per engine with «F.window("ts", "15 minutes")», computing «avg_temp» (2 decimals) and «min_pressure». Return «engine_id, window_start, avg_temp, min_pressure» where «window_start = F.col("window").getField("start")».`, starter: `r = spark.table("sensor_readings")\n\nresult = None\n`, solution: `r = spark.table("sensor_readings")
result = (r.groupBy("engine_id", F.window(F.to_timestamp("ts"), "15 minutes").alias("window"))
  .agg(F.round(F.avg("temperature_c"), 2).alias("avg_temp"), F.min("oil_pressure_kpa").alias("min_pressure"))
  .select("engine_id", F.col("window").getField("start").alias("window_start"), "avg_temp", "min_pressure"))`, hint: 'groupBy("engine_id", F.window(F.to_timestamp("ts"), "15 minutes").alias("window"))' }),
      spark({ q: `Low oil pressure alert: flag engines whose **last 3 readings** (by «ts») all have «oil_pressure_kpa < 280». Use «row_number» over engine ordered by «ts» descending, keep rn ≤ 3, and group. Return «engine_id» only.`, starter: `r = spark.table("sensor_readings")\n\nresult = None\n`, solution: `r = spark.table("sensor_readings")
w = Window.partitionBy("engine_id").orderBy(F.col("ts").desc())
last3 = r.withColumn("rn", F.row_number().over(w)).filter(F.col("rn") <= 3)
result = (last3.groupBy("engine_id")
  .agg(F.max("oil_pressure_kpa").alias("mx"))
  .filter(F.col("mx") < 280)
  .select("engine_id"))` }),
      talk('Design a pipeline that alerts service managers within 1 minute when an engine overheats, and also stores all telemetry for analytics.', `
        - **Ingest**: engines → IoT gateway → Kafka topic keyed by engine_id (partitions sized for throughput, RF=3, 7-day retention).
        - **Hot path**: Structured Streaming (or Flink) reads Kafka, parses with a schema, filters invalid readings, applies a rule (e.g. temp > 105°C for 2 consecutive readings, or a rolling-window rule), and writes alerts to an alerts topic → notification service. **Idempotent alerting** keyed on (engine, window).
        - **Cold path**: a second consumer group lands raw events to bronze (Delta), then silver (dedupe on event_id within a watermark, unit normalisation, range checks), then gold (5-min aggregates, daily health per engine).
        - **Late data**: watermark (e.g. 10 min) for streaming aggregates, plus a nightly batch recompute of yesterday.
        - **Ops**: consumer lag, events/sec, alert latency, DQ failure rate, dead-letter queue for unparseable events, checkpoints.
        - **Scale numbers**: say them (events/s, bytes/event, daily volume) and size partitions from them.
      `),
    ]),
    lesson('r5', 'Lab: Kafka internals in code', 20, [
      learn('What Kafka does under the hood', `
        - **Partitioner:** «partition = hash(key) % num_partitions» (Kafka uses murmur2; we use crc32 here). Same key, same partition. **Changing the partition count changes the mapping** for new messages, which is why you size partitions up front.
        - **Group assignment:** when consumers join or leave a group, partitions are **rebalanced**. The *range* strategy gives each consumer a contiguous block; *round-robin* deals them out one by one.
        - **Lag** per partition = log-end offset − committed offset. Total lag is the sum.
        - **CLI you'll use:** «kafka-consumer-groups --bootstrap-server b:9092 --describe --group lake-loader» shows partition, current offset, log-end offset and lag; «--reset-offsets --to-datetime …» replays from a time.
      `),
      py({ q: 'Write «partition_for(key, n)» = «zlib.crc32(key.encode()) % n», and «route(keys, n)» returning a dict «{partition: [keys in arrival order]}».', starter: 'import zlib\n\ndef partition_for(key, n):\n    pass\n\ndef route(keys, n):\n    pass\n', tests: `import zlib
assert partition_for('engine-7', 6) == zlib.crc32(b'engine-7') % 6
r = route(['e1', 'e2', 'e1', 'e3', 'e1'], 3)
assert sum(len(v) for v in r.values()) == 5
p = partition_for('e1', 3)
assert r[p][:1] == ['e1'] and r[p].count('e1') == 3, 'all e1 events must land in one partition, in order'`, solution: `import zlib
from collections import defaultdict

def partition_for(key, n):
    return zlib.crc32(key.encode()) % n

def route(keys, n):
    out = defaultdict(list)
    for k in keys:
        out[partition_for(k, n)].append(k)
    return dict(out)` }),
      py({ q: 'Range assignment: «assign_range(partitions, consumers)» splits a sorted list of partition ids into contiguous blocks; the first «len(partitions) % len(consumers)» consumers get one extra. Return «{consumer: [partitions]}» (consumers in the given order; extra consumers get «[]»).', starter: 'def assign_range(partitions, consumers):\n    pass\n', tests: `assert assign_range([0, 1, 2, 3, 4, 5], ['c1', 'c2', 'c3', 'c4']) == {'c1': [0, 1], 'c2': [2, 3], 'c3': [4], 'c4': [5]}
assert assign_range([0, 1], ['a', 'b', 'c']) == {'a': [0], 'b': [1], 'c': []}`, solution: `def assign_range(partitions, consumers):
    parts = sorted(partitions)
    base, extra = divmod(len(parts), len(consumers))
    out, i = {}, 0
    for idx, c in enumerate(consumers):
        size = base + (1 if idx < extra else 0)
        out[c] = parts[i:i + size]
        i += size
    return out` }),
      py({ q: 'Lag report: «lag(end_offsets, committed)» takes dicts «{partition: offset}» and returns «(per_partition_lag dict, total)». A partition with no committed offset counts the whole log («end − 0»).', starter: 'def lag(end_offsets, committed):\n    pass\n', tests: `per, total = lag({0: 100, 1: 250, 2: 40}, {0: 90, 1: 250})
assert per == {0: 10, 1: 0, 2: 40} and total == 50, (per, total)`, solution: `def lag(end_offsets, committed):
    per = {p: end - committed.get(p, 0) for p, end in end_offsets.items()}
    return per, sum(per.values())` }),
      viz('terminal', 'Investigate a lagging consumer group', '', {
        missions: [
          { task: 'Describe consumer group «lake-loader».', accept: '^kafka-consumer-groups(\\.sh)?\\s+.*--describe.*--group\\s+lake-loader|^kafka-consumer-groups(\\.sh)?\\s+.*--group\\s+lake-loader.*--describe', out: 'GROUP        TOPIC             PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG\nlake-loader  engine-telemetry  0          1204331         1204390         59\nlake-loader  engine-telemetry  1          998102          2310557         1312455\nlake-loader  engine-telemetry  2          1100342         1100401         59', why: 'Partition 1 is far behind: a stuck consumer or a hot key on that partition.', hint: 'kafka-consumer-groups --bootstrap-server localhost:9092 --describe --group lake-loader' },
          { task: 'Check which keys dominate partition 1: read 5 messages from it, printing keys.', accept: '^kafka-console-consumer(\\.sh)?\\s+.*--partition\\s+1.*--max-messages\\s+5.*|^kafka-console-consumer(\\.sh)?\\s+.*--max-messages\\s+5.*--partition\\s+1.*', out: 'engine-UNKNOWN\t{...}\nengine-UNKNOWN\t{...}\nengine-UNKNOWN\t{...}\nengine-UNKNOWN\t{...}\nengine-7\t{...}', why: 'A default key ("UNKNOWN") floods one partition: a hot key. Fix at the producer (don\'t send a constant key) and drain the backlog.', hint: 'kafka-console-consumer --bootstrap-server localhost:9092 --topic engine-telemetry --partition 1 --max-messages 5 --property print.key=true' },
        ],
      }),
      mcq('You increase a topic from 6 to 12 partitions. What happens to per-key ordering?', ['Nothing changes', 'New messages for a key may go to a different partition than its older messages, so ordering across the change isn\'t guaranteed', 'Kafka re-sorts all old messages', 'Keys are ignored afterwards'], 1),
    ]),
  ]);
