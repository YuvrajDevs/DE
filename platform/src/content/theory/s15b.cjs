const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match, bug } = require('./_t.cjs');

module.exports = {
  // ================================================================== Schema registry
  schemareg: T(`
    > **In one line:** a **schema registry** stores versioned schemas (Avro, Protobuf, JSON Schema) for each topic and **rejects incompatible changes** before a producer can publish them. Messages carry only a small **schema ID**, not the schema. It turns "a producer renamed a field and broke six consumers at 3 a.m." into "the producer's deploy failed in CI".

    ## How it works
    - Producer serialiser registers (or looks up) the schema under a **subject** (by default «<topic>-value» and «<topic>-key»), gets an ID, and writes «[magic byte 0][4-byte schema id][payload]».
    - Consumer deserialiser reads the ID, fetches the writer's schema (cached), and decodes; with Avro it **resolves** the writer schema against the reader schema (fills defaults for missing fields, ignores unknown fields).
    - The registry checks each new version against previous ones using the subject's **compatibility mode**.

    ## Compatibility modes
    | Mode | Guarantee | Allowed changes (Avro) | Who upgrades first |
    |---|---|---|---|
    | **BACKWARD** (default) | New schema can read data written with the previous schema | Delete fields; add fields **with defaults** | **Consumers** first |
    | **FORWARD** | Previous schema can read data written with the new schema | Add fields; delete fields **with defaults** | **Producers** first |
    | **FULL** | Both directions | Add/delete only fields **with defaults** | Either order |
    | ***_TRANSITIVE** | Checked against **all** previous versions, not just the last | Same rules, stricter | |
    | NONE | No checks | Anything | Danger |
    Topics whose data is **replayed from the beginning** (compacted state, event-sourced, long retention) need *_TRANSITIVE: a consumer may read version 1 data with version 7 code.

    ## Breaking changes and how to do them anyway
    - **Renaming** a field = delete + add: breaks under most modes. Use an Avro **alias**, or add the new field, dual-write both for a deprecation window, then drop the old one.
    - **Changing a type** (int → string): incompatible. Allowed promotions in Avro: int → long → float → double, string ↔ bytes.
    - **Changing meaning without changing the schema** (amount now in paise instead of rupees) passes every registry check and is the most dangerous change of all: data contracts must include **semantics**, not just types.
    - Truly breaking redesigns: publish to a **new topic** («claims.v2»), run both, migrate consumers, retire v1.

    ## Format choice
    | | Avro | Protobuf | JSON Schema |
    |---|---|---|---|
    | Encoding | Compact binary, needs writer schema | Compact binary, field numbers | Text |
    | Evolution | Defaults + resolution, very mature in Kafka | Field numbers; never reuse a number | Weaker tooling, permissive |
    | Typical | Kafka/Confluent pipelines | gRPC/microservice shops | Teams starting from JSON |

    ## In the lakehouse
    - Spark «from_avro» with the registry (Databricks supports registry integration) or a deserialiser in the consumer.
    - **Bronze stores the raw bytes / raw JSON plus the schema ID**, so you can re-decode after a fix.
    - Downstream Delta tables have their own schema enforcement; plan schema evolution of silver to follow compatible changes (add nullable columns) and alert on anything else.

    ## How interviewers test this
    - "What is BACKWARD compatibility and who deploys first?"
    - "How do you rename a field in an Avro schema without breaking consumers?"
    - "What kind of change does a schema registry not catch?" (Semantic changes.)
  `, {
    check: [
      mcq('Under BACKWARD compatibility (the default), which change is allowed?', ['Add a field without a default', 'Add a field with a default', 'Change int to string', 'Rename a field'], 1, 'New readers can fill the default when reading old data.'),
      mcq('With BACKWARD compatibility, who should upgrade first?', ['Producers', 'Consumers', 'Both at once', 'The registry'], 1, 'New schema reads old data, so consumers go first.'),
      tf('A schema registry will block a change from rupees to paise in an «amount» field of type long.', false, 'Same type, different meaning: only contracts and tests catch semantic changes.'),
      mcq('A compacted topic is replayed from offset 0 by new consumers. Which mode is safest?', ['BACKWARD', 'FORWARD', 'BACKWARD_TRANSITIVE or FULL_TRANSITIVE', 'NONE'], 2, 'Consumers may read every historical version.'),
      mcq('What is at the start of a Confluent-serialised Kafka message value?', ['The full schema', 'A magic byte and a 4-byte schema ID', 'The topic name', 'A CRC only'], 1, 'Consumers fetch and cache the schema by ID.'),
    ],
    interview: [
      talk('A producer team wants to rename «engine_serial» to «esn» in the telemetry events. How do you roll it out without breaking anything?', `
        - Do not rename in place: it is a delete + add and breaks compatibility.
        - **Step 1:** add «esn» as an optional field with a default (null); producers populate **both** fields. Registry accepts (compatible).
        - **Step 2:** migrate consumers (Spark silver job, alerting service) to read «esn», falling back to «engine_serial».
        - **Step 3:** after every consumer is on the new field and retention has rolled old messages off (or bronze re-processing handles both), stop writing «engine_serial» (allowed if it has a default).
        - Communicate through the data contract/changelog, test with the registry compatibility API in CI, and monitor for nulls in «esn».`),
    ],
  }),

  // ================================================================== Lag and rebalancing
  lagscale: T(`
    > **In one line:** **consumer lag** = latest offset in a partition − the group's committed offset: how far behind you are. It is the number one health metric of a streaming pipeline. You scale consumption by adding consumers **up to the number of partitions**; every membership change triggers a **rebalance**, which pauses consumption and is a classic source of duplicates and lag spikes.

    ## Lag
    - Per partition: «log-end-offset − committed offset». Sum per topic/group; also track **lag in time** (age of the oldest unprocessed message), which is what SLAs care about.
    - Rising lag = processing rate < input rate. Stable non-zero lag can be fine (micro-batch latency). Lag growing on **one partition** only = a hot key or a stuck consumer.
    - Tools: «kafka-consumer-groups --describe», Burrow, Kafka UI, cloud metrics (Event Hubs "incoming vs outgoing messages"), Spark Structured Streaming progress («inputRowsPerSecond» vs «processedRowsPerSecond», offsets per batch).

    ## Scaling consumption
    - In a consumer group, **each partition is consumed by at most one consumer**. Consumers > partitions → idle consumers. So the **partition count is your maximum parallelism**: choose it for future throughput (e.g. target throughput / per-partition throughput, × headroom).
    - Increasing partitions later **changes the key → partition mapping** («hash(key) % partitions»): per-key ordering breaks for keys that move, and compacted topics/state keyed by partition get confused. Plan partition counts up front for keyed topics.
    - Spark reads Kafka partitions as tasks: «minPartitions» can split Kafka partitions into more Spark tasks; «maxOffsetsPerTrigger» caps each micro-batch (backpressure) so a backlog drains in controlled batches instead of one gigantic batch.
    - If processing per record is slow (an external call), parallelise inside the consumer (batching, async) or move the slow part out; more partitions alone may not help.

    ## Rebalancing
    Triggered when a consumer joins, leaves, crashes, or is considered dead:
    - **«session.timeout.ms»** (default 45 s): no heartbeats → consumer declared dead.
    - **«max.poll.interval.ms»** (default 5 min): time between «poll()» calls. If processing one batch takes longer (a slow DB write), the consumer is kicked out, its partitions reassigned, the batch is re-delivered to someone else (duplicates), and when it returns it causes another rebalance: a **rebalance storm**. Fix: smaller «max.poll.records», faster processing, or a longer interval.
    - **Eager** rebalancing (old default) revokes **all** partitions from everyone: stop-the-world. **Cooperative sticky** assignor moves only the partitions that must move. **Static membership** («group.instance.id») lets a restarting consumer (rolling deploy) rejoin without a rebalance. Kafka 4.0's new consumer group protocol (KIP-848, GA) moves assignment to the broker and makes rebalances incremental; Kafka 4.0 also removed ZooKeeper entirely (KRaft only). Kafka 4.2 (February 2026) made **share groups** (KIP-932, "queues for Kafka") production-ready: several consumers can process records of the **same partition** with per-record acknowledgement, so consumer parallelism is no longer capped by the partition count for queue-style work (at the cost of per-partition ordering).
    - Commit offsets **after** processing, and commit in the «onPartitionsRevoked» callback to minimise duplicates during rebalances.

    ## Backpressure and catch-up
    After an outage, 6 hours of backlog arrives at once. Without limits a micro-batch engine tries to process everything in one batch (OOM, huge state). With «maxOffsetsPerTrigger» it drains in bounded batches; measure the **drain rate** (processing rate − input rate) to predict catch-up time. Turbofan's load test measured exactly this: backlog drain and steady-state latency.

    ## How interviewers test this
    - "What is consumer lag and how do you monitor it?"
    - "You have 12 partitions and 20 consumers. What happens?"
    - "Consumers keep rebalancing every few minutes and lag grows. Why?"
    - "Can you just add partitions to a keyed topic?"
  `, {
    check: [
      mcq('Topic with 12 partitions, consumer group with 20 consumers. Result?', ['20-way parallelism', '12 active consumers, 8 idle', 'Kafka rejects the group', 'Each partition is read by two consumers'], 1, 'One consumer per partition per group.'),
      mcq('Processing a batch takes 7 minutes; max.poll.interval.ms is 5 minutes. What happens?', ['Nothing', 'The consumer is removed from the group, partitions are reassigned and the batch is re-delivered (duplicates, rebalance storm)', 'Kafka slows the producer', 'Offsets are lost'], 1, 'Reduce batch size or increase the interval.'),
      tf('Adding partitions to a topic keyed by engine_id preserves the partition of every existing key.', false, 'hash(key) % N changes when N changes.'),
      mcq('Lag grows on only 1 of 24 partitions. Most likely?', ['The cluster is undersized', 'A hot key or a stuck consumer on that partition', 'The schema changed', 'Retention is too short'], 1, 'Skew shows up per partition.'),
      mcq('Which setting lets a consumer restart during a rolling deploy without triggering a rebalance?', ['auto.offset.reset', 'group.instance.id (static membership)', 'acks=all', 'enable.idempotence'], 1, 'Static members keep their assignment within the session timeout.'),
    ],
    hands: [
      py({ q: '**Lag report.** Write «lag_report(end_offsets, committed, rate_in, rate_out)»: «end_offsets» and «committed» are dicts partition → offset (a partition missing from «committed» has lag equal to its end offset). Return a dict with «total_lag», «max_partition» (partition with the largest lag; smallest id on ties), «skewed» (True if the max partition lag is more than 3× the **mean** lag and greater than 0) and «drain_minutes»: total_lag / (rate_out − rate_in) / 60 rounded to 1 dp, or «None» if rate_out ≤ rate_in (never catches up). Rates are messages per second.', starter: 'def lag_report(end_offsets, committed, rate_in, rate_out):\n    pass\n',
        tests: `r = lag_report({0: 1000, 1: 1000, 2: 41000, 3: 1000}, {0: 900, 1: 1000, 2: 1000, 3: 900}, 200, 700)
assert r == {'total_lag': 40200, 'max_partition': 2, 'skewed': True, 'drain_minutes': 1.3}, r
r2 = lag_report({0: 500, 1: 500}, {0: 400}, 100, 100)
assert r2 == {'total_lag': 600, 'max_partition': 1, 'skewed': False, 'drain_minutes': None}, r2`,
        solution: `def lag_report(end_offsets, committed, rate_in, rate_out):
    lags = {p: end - committed.get(p, 0) for p, end in end_offsets.items()}
    total = sum(lags.values())
    mx = max(lags.values())
    max_p = min(p for p, l in lags.items() if l == mx)
    mean = total / len(lags)
    drain = None if rate_out <= rate_in else round(total / (rate_out - rate_in) / 60, 1)
    return {'total_lag': total, 'max_partition': max_p, 'skewed': mx > 0 and mx > 3 * mean, 'drain_minutes': drain}` }),
    ],
  }),

  // ================================================================== Stateful streaming
  statefulstream: T(`
    > **In one line:** stateless streaming (filter, parse, project) is easy. **Stateful** streaming (windowed aggregations, deduplication, stream-stream joins, sessions, "alert once per incident") must keep **state** between micro-batches, decide **when a result is final** and **when state can be dropped**. **Event time + watermarks** answer both. Get them wrong and you get unbounded state (OOM, slow checkpoints) or silently dropped data.

    ## Event time vs processing time
    Sensors buffer offline and send late; networks reorder. Aggregating by **processing time** (when Spark saw it) gives answers that depend on lag; aggregating by **event time** (a field in the event) gives the right answer, but you must wait for late data, and you cannot wait forever.

    ## Watermarks
    «withWatermark('event_ts', '10 minutes')»: the watermark = **max event time seen − 10 minutes** (computed per micro-batch; with several inputs Spark uses the minimum across them by default). Meaning: "I assume no more events older than this will arrive."
    - Windows whose end is before the watermark are **finalised** (emitted in append mode) and their state is **dropped**.
    - Events older than the watermark are **dropped** as too late (count them: Spark exposes «numRowsDroppedByWatermark»).
    - Trade-off: a longer delay = more complete results, more state, later output. A shorter delay = lower latency, more dropped late data. Choose from the **measured lateness distribution** (e.g. p99.9 of «ingest_ts − event_ts»), not a guess. Turbofan injected events 30 s late to prove the choice.
    - One device with a broken clock in the **future** pushes max event time forward and makes everyone else "late". Validate/clamp event timestamps (reject events too far in the future) before the watermark.

    ## Output modes
    | Mode | Emits | Works with |
    |---|---|---|
    | **Append** | Only rows that will never change (finalised windows) | Aggregations **with** a watermark; most sinks (files, Delta append) |
    | **Update** | Rows changed in this batch | Aggregations; sinks that can upsert (foreachBatch + MERGE) |
    | **Complete** | The whole result table each batch | Small aggregates only (state is never dropped) |

    ## Stateful operators
    - **Windowed aggregation:** tumbling («window(ts, '5 minutes')»), sliding («window(ts, '10 minutes', '5 minutes')», each event in several windows), session («session_window(ts, '30 minutes')»).
    - **Deduplication:** «dropDuplicates(['event_id', 'event_ts'])» **with a watermark** so old IDs are forgotten; or «dropDuplicatesWithinWatermark(['event_id'])» (Spark 3.5+) when duplicates may have different timestamps. Without a watermark, dedup state grows forever.
    - **Stream-stream joins:** both sides buffered in state. Inner joins need watermarks on both sides **and a time-range condition** («impressions.ts BETWEEN clicks.ts - interval 1 hour AND clicks.ts») for state to be cleaned up; outer joins require them, and emit the NULL side only after the watermark passes (delayed output).
    - **Stream-static joins:** static side re-read each batch (Delta) or broadcast; no state.
    - **Arbitrary state:** «applyInPandasWithState», «flatMapGroupsWithState», and Spark 4's «transformWithState» (timers, TTL, multiple state variables) for per-key logic like "alert once per incident, reset when healthy".

    ## State store and checkpoints
    - State lives in a **state store** per shuffle partition (HDFS-backed in memory, or **RocksDB** on local disk for large state; RocksDB is the production choice), snapshotted into the checkpoint.
    - The **number of shuffle partitions is fixed** by the checkpoint at first start. Changing «shuffle.partitions» later has no effect for that query.
    - **Changing stateful logic** (grouping keys, aggregation functions, window size, adding a stateful operator) is often **incompatible** with the existing checkpoint: the query fails to restart or produces wrong results. Options: new checkpoint + backfill from bronze, or state reader/rewriter tools.
    - Monitor state rows and memory, checkpoint duration, batch duration vs trigger interval.

    ## Exactly-once with state
    Source offsets + state + sink commit are tied to the batch ID in the checkpoint. Replaying a batch after a crash recomputes the same state transitions and the idempotent sink (Delta) ignores the duplicate commit. Side effects outside the sink (an alert email from foreachBatch) need their own idempotency keys.

    ## How interviewers test this
    - "What is a watermark? What happens to an event that arrives after it?"
    - "Why does my streaming dedupe run out of memory after two weeks?"
    - "Can I change the window from 5 to 10 minutes in a running query?"
    - "How do you choose the watermark delay?"
  `, {
    check: [
      mcq('Max event time seen is 10:40 and the watermark delay is 10 minutes. An event with event time 10:25 arrives. In an append-mode windowed aggregation it is…', ['Included', 'Dropped as too late (older than the 10:30 watermark)', 'Put in a new window', 'Raises an error'], 1, 'Events older than the watermark are dropped; monitor the count.'),
      mcq('A streaming «dropDuplicates("event_id")» without a watermark runs for weeks. What happens?', ['Nothing', 'Dedup state grows without bound until memory/checkpoint problems', 'Duplicates pass through', 'Spark switches to batch'], 1, 'Add a watermark so old keys are evicted.'),
      mcq('Which output mode emits a windowed count only once, when the window is final?', ['Complete', 'Update', 'Append (with a watermark)', 'Any'], 2, 'Append emits rows that will not change.'),
      tf('Changing spark.sql.shuffle.partitions on a restart changes the state partitioning of an existing stateful query.', false, 'The checkpoint fixes it.'),
      mcq('One gateway sends events timestamped 2 days in the future. Effect on a watermarked aggregation?', ['None', 'Max event time jumps forward, the watermark jumps, and normal events are dropped as late', 'Only that gateway is affected', 'Spark rejects the events'], 1, 'Validate and clamp event times before watermarking.'),
      mcq('Stream-stream inner join: what lets Spark clean up join state?', ['Nothing, state is kept forever', 'Watermarks on both sides plus a time-range join condition', 'Broadcasting one side', 'Complete output mode'], 1, 'Without bounds, state grows forever.'),
    ],
    scenarios: [
      scenario('Silent loss after a gateway firmware update', `
        Fleet-health windows (5-minute tumbling, watermark 2 minutes) suddenly show 30% fewer readings for Pune plant engines. Kafka and bronze have all the readings. The new gateway firmware batches readings and uploads them every 4 minutes.`, [
        ['Cause?', [
          ['Readings now arrive up to ~4 minutes late, beyond the 2-minute watermark, so they are dropped from the windows', true, 'Lateness distribution changed; watermark did not.'],
          ['Kafka lost them', false, 'Bronze has them.'],
          ['The window is too long', false, 'The watermark is too short.'],
        ]],
        ['Fix and prevention?', [
          ['Raise the watermark above the new lateness (e.g. 6-8 minutes, from measured p99.9), backfill affected windows from bronze, and alert on numRowsDroppedByWatermark and on the ingest-minus-event-time distribution', true, 'Measure lateness continuously; never let drops be silent.'],
          ['Switch to processing time', false, 'Wrong windows for late devices.'],
          ['Remove the watermark', false, 'Unbounded state.'],
        ]],
      ], 'Watermarks encode an assumption about lateness; monitor that the assumption still holds.'),
    ],
    interview: [
      talk('Design "alert once per overheating incident per engine" in Structured Streaming.', `
        - **Input:** silver readings (validated, deduplicated by reading_id within a watermark), event time «ts», watermark from measured lateness.
        - **Logic per engine** (stateful, keyed by engine_id): track whether the engine is currently "in incident"; when N consecutive readings exceed the threshold, open an incident and emit an alert keyed by (engine_id, incident_start); close it when a reading is below threshold (hysteresis: a lower reset threshold avoids flapping).
        - **Implementation:** «transformWithState»/«applyInPandasWithState» with per-key state and a TTL/timeout so idle engines' state is dropped; or micro-batch gaps-and-islands in foreachBatch against a Delta incident table with MERGE on (engine_id, incident_start).
        - **Exactly-once:** alerts table written with MERGE on the incident key (idempotent); notifications sent from the alerts table by a separate process that records "sent".
        - **Late/out-of-order readings:** order within micro-batches by ts; readings older than the watermark are dropped and counted.
        - **Test:** replay a known engine history and assert the expected incidents; kill and restart mid-incident.`),
    ],
  }),

  // ================================================================== Kafka Connect / Debezium
  connect: T(`
    > **In one line:** **Kafka Connect** is a framework for moving data between Kafka and other systems with **configuration instead of code**: source connectors pull into Kafka, sink connectors push out. **Debezium** is the standard family of source connectors for **log-based CDC**: it reads a database's transaction log and publishes every insert, update and delete as an event.

    ## Connect architecture
    - **Workers** (a cluster in distributed mode) run **connectors**, which are split into **tasks** (the unit of parallelism).
    - **Converters** serialise data (Avro/Protobuf/JSON with a schema registry).
    - **SMTs** (single message transforms) do light per-record changes: rename fields, route topics, mask a field. Not for joins or heavy logic.
    - State (configs, source offsets, status) is stored in Kafka topics, so workers are stateless and restartable.
    - **Error handling:** «errors.tolerance=all» + «errors.deadletterqueue.topic.name» sends bad records to a DLQ topic (sink connectors), with headers explaining the error. Default tolerance «none» stops the task on the first bad record.
    - Managed options: Confluent Cloud connectors, Azure Event Hubs supports the Kafka protocol and Connect; Databricks and ADF have their own native connectors for many sources.

    ## Debezium CDC
    - Reads the **write-ahead log / binlog / redo log** (Postgres logical replication slot, MySQL binlog, SQL Server CDC tables, Oracle LogMiner), so it sees every committed change, including **deletes**, with no load from polling queries.
    - Starts with an **initial snapshot** (consistent read of existing rows), then streams changes from the log position recorded at snapshot time: no gap, no overlap.
    - Event envelope: «before», «after», «op» («c» create, «u» update, «d» delete, «r» snapshot read), «source» (db, table, **LSN / binlog position**, transaction id, «ts_ms» commit time), «ts_ms» (processing time).
    - Topic per table, **keyed by the primary key**, so all changes for a row stay in order in one partition.
    - After a delete, a **tombstone** (key with null value) lets compacted topics drop the key.
    - Ordering for apply: use the source position (LSN), not timestamps.

    ## Things that go wrong
    | Problem | Effect | Mitigation |
    |---|---|---|
    | Postgres replication slot not consumed (connector down for days) | WAL piles up on the source: **disk full on the production database** | Monitor slot lag, alert, set max slot WAL keep size |
    | Schema change in the source table (column added/renamed) | New event schema; downstream breaks if not evolved | Registry compatibility, schema history topic, contract with app team |
    | Large transactions / bulk updates | Burst of millions of events | Capacity, backpressure, bronze absorbs it |
    | Snapshot of a huge table | Long-running read on the source | Incremental snapshots (signal table), off-peak, replica |
    | Connector restart | Re-sends events since last committed offset (at-least-once) | Idempotent apply keyed by PK + LSN |
    | Log retention on the source shorter than an outage | Change history lost: must re-snapshot | Monitor; size retention |

    ## Outbox pattern
    Services write business changes and an **outbox** row in the same transaction; Debezium streams the outbox table to Kafka. This avoids the "dual write" problem (DB commit succeeds, Kafka publish fails, or the reverse) and gives clean, intentional domain events instead of raw table changes.

    ## How interviewers test this
    - "How would you get changes from a SQL Server ERP into the lakehouse with deletes?"
    - "What is the difference between query-based and log-based CDC?"
    - "Why order CDC events by LSN rather than timestamp?"
    - "What can a stalled CDC connector do to the source database?"
  `, {
    check: [
      mcq('Why prefer log-based CDC (Debezium) over polling «updated_at > watermark»?', ['It is simpler to set up', 'It captures every change including hard deletes, in commit order, with little load on the source', 'It does not need Kafka', 'It removes the need for dedupe'], 1, 'Polling misses deletes and intermediate updates, and can miss late commits.'),
      mcq('A Postgres Debezium connector has been down for 4 days. Biggest risk?', ['Kafka disk fills', 'WAL retained by the replication slot fills the source database disk', 'Duplicate snapshot', 'Schema registry outage'], 1, 'Monitor replication slot lag.'),
      mcq('In a Debezium event, «op = "r"» means…', ['Rollback', 'A row read during the snapshot', 'Rename', 'Replay'], 1, 'c, u, d, r (snapshot read).'),
      tf('SMTs are a good place to implement joins between two topics.', false, 'SMTs are single-record transforms; joins belong in a stream processor.'),
      mcq('What does a tombstone after a delete event do?', ['Marks the connector as stopped', 'Lets log compaction remove all records for that key', 'Rolls back the delete', 'Nothing'], 1, 'Key with a null value.'),
    ],
  }),

  // ================================================================== Databricks in depth
  databricks: T(`
    > **In one line:** Databricks is a managed lakehouse platform on Azure/AWS/GCP built around Spark, Delta Lake and **Unity Catalog**. A DE 1 there is expected to know the **compute types** and when each is cost-effective, how **jobs** are built and deployed, how **Unity Catalog** governs data, and the ingestion tools (**Auto Loader**, **Lakeflow Declarative Pipelines / DLT**).

    ## Architecture
    - **Control plane** (run by Databricks): web UI, notebooks, job scheduler, cluster manager, Unity Catalog metadata.
    - **Compute plane**: clusters/VMs either in **your** cloud subscription (classic) or in Databricks' account (**serverless**). Data stays in **your** storage (ADLS Gen2 on Azure).
    - **Workspace**: users, notebooks, repos (Git folders), jobs. Several workspaces (dev/test/prod) attach to one Unity Catalog **metastore** per region.

    ## Compute
    | Compute | For | Notes |
    |---|---|---|
    | **All-purpose cluster** | Interactive notebooks, development | Shared by users, billed while running: **auto-termination** matters |
    | **Job cluster** | Scheduled production jobs | Created per run, terminated after; cheaper DBU rate. Use for pipelines |
    | **SQL warehouse** (pro/serverless) | BI, dashboards, SQL analytics, dbt | Photon engine, auto-scaling, result caching |
    | **Serverless jobs/notebooks** | Jobs without cluster management | Fast start, no tuning of node types |
    | **Instance pools** | Faster cluster start | Pre-warmed VMs |
    - **Photon**: a vectorised C++ engine for SQL/DataFrame operations; big speed-ups for scans, joins, aggregations; does not speed up Python UDFs.
    - **Autoscaling** (min/max workers) and **spot instances** for workers (not driver) reduce cost; streaming jobs autoscale poorly (use enhanced autoscaling in DLT or fixed sizes).
    - **Cluster policies** restrict node types, sizes and tags so teams cannot launch expensive clusters by accident.

    ## Unity Catalog
    - Three-level namespace: **«catalog.schema.table»** (e.g. «prod.warranty.claims_silver»). Typical: catalogs per environment and/or domain.
    - **Securables:** catalogs, schemas, tables, views, volumes (files), functions, models, **external locations** + **storage credentials** (managed identity access to ADLS paths).
    - **Managed tables** (UC controls storage and lifecycle: DROP deletes data) vs **external tables** (data at a path you manage: DROP removes metadata only).
    - **Grants** with SQL («GRANT SELECT ON TABLE … TO warranty_analysts»), inheritance down the hierarchy, ownership.
    - **Row filters and column masks** (functions attached to tables) for fine-grained access: dealers see only their rows; PII masked unless in a group.
    - **Lineage** captured automatically at column level for queries run on UC; **audit logs**; tags; **system tables** («system.billing.usage», «system.access.audit», «system.lakeflow» job runs) for cost and ops reporting.
    - **Delta Sharing** to share tables with other organisations without copying.

    ## Ingestion
    - **Auto Loader** («spark.readStream.format('cloudFiles')»): incrementally ingests new files from cloud storage, tracking processed files in the checkpoint (RocksDB) so each file is processed once. Two discovery modes: **directory listing** (simple; incremental listing) and **file notification** (Event Grid + queue; scales to millions of files). **Schema inference and evolution** with «cloudFiles.schemaLocation»; new columns can fail the stream for a restart with the evolved schema (mode «addNewColumns»), or go to «_rescued_data» (values that did not match the schema) so nothing is silently lost. Run continuously or with «trigger(availableNow=True)» as a cheap incremental batch.
    - «COPY INTO»: idempotent SQL batch load of files (skips files already loaded); good for thousands of files, not millions.
    - **Lakeflow Connect** / partner connectors for SaaS and databases (Salesforce, SQL Server CDC).
    - **Lakeflow Spark Declarative Pipelines** (formerly **Delta Live Tables / DLT**; the declarative core was open-sourced as **Apache Spark Declarative Pipelines** in Spark 4.1): declare streaming tables and materialized views in SQL/Python; the framework manages dependencies, checkpoints, retries, autoscaling and **expectations** («CONSTRAINT valid_amount EXPECT (amount >= 0) ON VIOLATION DROP ROW | FAIL UPDATE») with quality metrics. **AUTO CDC** (the successor of «APPLY CHANGES INTO») handles CDC ordering, deletes and SCD Type 1/2; it is a Databricks Lakeflow feature, not part of open-source SDP. Interviewers may still say "DLT": know both names.

    ## Orchestration and deployment
    - **Jobs / Lakeflow Jobs:** DAGs of tasks (notebook, Python wheel, SQL, dbt, DLT pipeline), task values, retries, timeouts, triggers (schedule, file arrival, table update, continuous), job-level parameters, repair-run (re-run only failed tasks).
    - **Databricks Asset Bundles** (YAML + code in Git) deploy jobs, pipelines and their config to dev/test/prod from CI/CD («databricks bundle deploy -t prod»). The production answer to "how do you get a notebook to prod".
    - Airflow/ADF can trigger Databricks jobs when the company orchestrates outside Databricks.
    - **Secrets**: secret scopes (Key Vault-backed on Azure); never hard-coded tokens; service principals for production jobs, not personal accounts.

    ## How interviewers test this
    - "All-purpose vs job cluster vs SQL warehouse?"
    - "What is Unity Catalog and how do you give a dealer team access to only their rows?"
    - "How does Auto Loader know which files it has already processed? What happens when a new column appears?"
    - "How do you deploy a pipeline from dev to prod on Databricks?"
  `, {
    check: [
      mcq('Cheapest appropriate compute for a nightly production PySpark job?', ['A shared all-purpose cluster left running', 'A job cluster (or serverless jobs) created for the run', 'A SQL warehouse', 'The driver only'], 1, 'Job compute is cheaper and isolated.'),
      mcq('Unity Catalog namespace?', ['database.table', 'catalog.schema.table', 'workspace.table', 'metastore.table'], 1, 'Three levels.'),
      mcq('A source starts sending a new column. Auto Loader with schema evolution mode addNewColumns will…', ['Silently drop it', 'Fail the stream so it restarts with the evolved schema including the new column', 'Corrupt the table', 'Ignore all rows'], 1, 'Restart (automatic in jobs with retries) picks up the new schema.'),
      mcq('How do you show dealers only their own claims in a shared table?', ['Copy a table per dealer', 'A Unity Catalog row filter function on the table based on group membership', 'Trust the BI tool', 'Separate workspaces'], 1, 'Row filters/column masks enforce it at the table.'),
      tf('DROP TABLE on an external table deletes the underlying files.', false, 'Only metadata; managed tables delete data.'),
    ],
    interview: [
      talk('Walk me through building a production ingestion pipeline on Azure Databricks, from files landing in ADLS to a gold table used by Power BI.', `
        - **Landing:** suppliers/devices drop files into an ADLS container; access via a UC external location with a managed identity.
        - **Bronze:** Auto Loader stream («cloudFiles», schema location, rescued data column) with «availableNow» trigger on a schedule (or continuous if latency needs it) into a UC managed Delta table with ingestion metadata (file name, load time).
        - **Silver:** typed, validated, deduplicated (DLT expectations or explicit checks + quarantine table), MERGE for upserts/CDC; liquid clustering on common filters.
        - **Gold:** aggregates/star schema as materialized views or Delta tables refreshed incrementally (CDF); documented, owned, certified.
        - **Serving:** Databricks SQL warehouse; Power BI via the Databricks connector (DirectQuery or import); UC grants, row filters for dealers.
        - **Ops:** Lakeflow Job with retries and alerts; Asset Bundles deployed through CI/CD to dev/test/prod; system tables for cost; data quality metrics and freshness SLAs monitored.`),
    ],
  }),

  // ================================================================== IaC and environments
  iac: T(`
    > **In one line:** production data platforms are built from **code**: infrastructure (storage accounts, workspaces, clusters policies, networks, permissions) with **Terraform/Bicep**, pipelines with **bundles/DAG code**, all promoted through **dev → test → prod** by CI/CD, with **secrets** in a vault and **identities** per environment. Clicking resources together in a portal does not survive audits, disasters or team growth.

    ## Environments
    | Environment | Purpose | Data |
    |---|---|---|
    | **Dev** | Build and experiment | Samples, synthetic, or masked copies |
    | **Test / QA / staging** | Integration and validation (UAT) on production-like data and config | Masked production snapshot or full copy under controls |
    | **Prod** | Serves the business | Real |
    - Same code, different **configuration** (catalog names, paths, cluster sizes, schedules, alert routes).
    - Isolation: separate workspaces/catalogs/storage per environment; production write access only for service principals deployed by CI/CD.
    - Promotion: a merged PR builds an artifact once; the same artifact is deployed to test, validated, then to prod (with approval gates).

    ## Infrastructure as code
    - **Terraform** (multi-cloud, has a Databricks provider; also Bicep/ARM for Azure-only): declare resources; «terraform plan» shows the diff; «apply» makes it so.
    - **State file** records what Terraform manages: store it remotely (Azure Storage with locking), never edit by hand, never commit secrets in it.
    - **Drift:** someone changes a resource in the portal; the next plan shows it. Either import the change into code or let apply revert it.
    - **Modules** for repeatable patterns (a "data product workspace" module).
    - What a DE typically codifies: storage containers, UC catalogs/schemas/grants, external locations, cluster policies, jobs (bundles), Key Vault references, Event Hubs/Kafka topics, monitoring alerts.

    ## Secrets and identity
    - Secrets (DB passwords, API keys, SAS tokens) live in **Azure Key Vault**/AWS Secrets Manager; Databricks secret scopes reference them; values are redacted in notebook output.
    - Prefer **managed identities / service principals with OIDC federation** over stored secrets: nothing to leak or rotate.
    - Least privilege per environment; production identities are not usable from dev.
    - Rotate secrets; detect leaks with secret scanning in Git.

    ## How interviewers test this
    - "How do you move a pipeline from dev to prod?"
    - "Where do you keep credentials for a source database?"
    - "Someone changed a cluster setting in the UI; how do you find and handle it?"
  `, {
    check: [
      mcq('Where should a production pipeline\'s database password live?', ['In the notebook', 'In a Git config file', 'In Key Vault, referenced through a secret scope or the orchestrator\'s secret backend', 'In an environment variable typed on a laptop'], 2, 'Better still: managed identity, no password at all.'),
      mcq('«terraform plan» shows a change nobody made in code. What is it?', ['A Terraform bug', 'Drift: someone changed the resource outside code', 'A new provider version', 'Nothing'], 1, 'Import or revert.'),
      tf('Building a separate artifact for each environment from the same commit is best practice.', false, 'Build once, promote the same artifact; only config differs.'),
    ],
  }),

  // ================================================================== PII and privacy
  pii: T(`
    > **In one line:** personal data (customer names, phone numbers, dealer contacts, technician IDs, vehicle VINs linked to owners, location traces) must be **classified**, **minimised**, **protected** (masking, tokenisation, encryption, access control) and **deletable** on request. In a lakehouse built on immutable files and time travel, "delete" is an engineering problem, and India's **DPDP Act 2023** and the EU **GDPR** make it a legal one.

    ## Classification and minimisation
    - Tag columns at ingestion (Unity Catalog tags, Purview classifications): PII, sensitive PII, confidential business data, export-controlled technical data.
    - **Do not ingest what you do not need.** The cheapest protection is not having the column.
    - Keep PII in as few tables as possible (a customer dimension), referenced by surrogate keys everywhere else.

    ## Protection techniques
    | Technique | What | Reversible? | Use |
    |---|---|---|---|
    | **Access control** | Grants, row filters | n/a | Baseline |
    | **Dynamic masking** | Show «XXXX-1234» unless the user is in an authorised group (column masks) | Data unchanged | Analysts see what they need |
    | **Static masking** | Replace values in non-prod copies | No | Dev/test data |
    | **Tokenisation** | Replace with a token; a secure vault maps back | Yes, for authorised services | Joining across systems without exposing values |
    | **Hashing (with secret salt/HMAC)** | Deterministic pseudonym, joinable | No (but unsalted hashes of phone numbers are trivially brute-forced) | Pseudonymous analytics |
    | **Encryption** at rest / in transit | Storage/TLS | With keys | Default everywhere |
    | **Column-level encryption** | Encrypt specific fields with keys per subject or per domain | With keys | High-sensitivity fields |
    | **Aggregation / k-anonymity** | Publish only groups ≥ k | No | Reports, external sharing |
    **Pseudonymised data is still personal data** under GDPR/DPDP if it can be re-linked. Only truly anonymised data is out of scope.

    ## Right to erasure in a lakehouse
    1. Find every location of the subject's data (lineage, catalog tags, a subject → key index).
    2. «DELETE» (or MERGE) in each Delta table: creates a new version without the rows.
    3. Old versions still contain the data until **VACUUM** removes the files (and deletion vectors are purged with «REORG TABLE … APPLY (PURGE)» before vacuum). Set retention so erasure completes within the legal deadline.
    4. Downstream copies, extracts, ML training sets, Kafka topics (retention or compaction with tombstones), backups.
    5. **Crypto-shredding:** encrypt each subject's PII with a per-subject key; deleting the key makes all copies, including backups and old versions, unreadable. Strong pattern for immutable storage.
    6. Log the request and its completion (auditability).

    ## Retention
    Keep data only as long as needed for its purpose; automate deletion by partition (date) and document retention per dataset. Retention conflicts (warranty claims kept 10 years for legal reasons vs a customer's erasure request) are resolved by **legal policy**, then implemented (e.g. keep claim facts, erase personal identifiers).

    ## How interviewers test this
    - "A customer asks to be deleted. Your data is in Delta with 30 days of time travel. What do you do?"
    - "Is a SHA-256 hash of a phone number anonymous?" (No.)
    - "How do analysts work with data containing PII safely?"
  `, {
    check: [
      mcq('You DELETE a customer\'s rows in a Delta table. Is the data physically gone?', ['Yes, immediately', 'No: earlier versions still reference the old files until VACUUM (and deletion vector purge) removes them', 'Only after OPTIMIZE', 'Only after a cluster restart'], 1, 'Plan retention so erasure completes in time.'),
      tf('An unsalted SHA-256 of a 10-digit phone number is effectively anonymous.', false, '10^10 candidates are brute-forced quickly. It is pseudonymous at best.'),
      mcq('What is crypto-shredding?', ['Deleting encrypted disks', 'Encrypting each subject\'s data with its own key and deleting the key to make every copy unreadable', 'Hashing data twice', 'Zipping and deleting'], 1, 'Works across backups and immutable versions.'),
      mcq('Developers need realistic data in dev. Best approach?', ['Copy production as is', 'Statically masked/synthetic copies with production-like distributions', 'No data at all', 'Give developers production access'], 1, 'Minimise exposure.'),
    ],
    scenarios: [
      scenario('Erasure request with a 30-day deadline', `
        A fleet customer exercises the right to erasure. Their contact details are in «silver.customers», their name is denormalised into «gold.claims_wide» and a nightly CSV extract goes to a partner. Delta tables have 30-day VACUUM retention and 60-day log retention.`, [
        ['Which plan meets the obligation?', [
          ['Delete/null the PII in every table found via lineage/tags (including gold and the extract source), purge deletion vectors and VACUUM within the deadline, notify the partner per contract, and record completion', true, 'Covers versions, downstream copies and audit.'],
          ['Delete from silver only', false, 'Gold and the extract still contain the name.'],
          ['Wait for normal VACUUM', false, '30 days of retention may exceed the deadline once processing time is included.'],
        ]],
        ['What design change prevents this from being painful next time?', [
          ['Keep PII only in the customer dimension (referenced by surrogate key), tag PII columns, and consider per-customer encryption keys', true, 'Minimise copies; make erasure a key deletion.'],
          ['Disable time travel everywhere', false, 'Loses recovery ability.'],
          ['Stop serving claims data', false, 'Not proportionate.'],
        ]],
      ], 'Privacy is a data-modelling and lineage problem as much as a security one.'),
    ],
  }),

  // ================================================================== Data mesh
  mesh: T(`
    > **In one line:** **data mesh** is an organisational approach: **domains own their data as products**, a **self-serve platform** makes building them easy, and **federated computational governance** sets the rules everyone automates. It answers the bottleneck of a single central data team serving a large company. It is not a technology, and it is not right for every organisation.

    ## The four principles
    1. **Domain ownership:** the warranty domain owns warranty data products; manufacturing owns production data. The people who understand the data are accountable for it.
    2. **Data as a product:** each dataset has an owner, consumers, documentation, SLAs, quality checks, versioning and support, like a product (the Cummins posting's "Data-as-a-Product" responsibilities).
    3. **Self-serve data platform:** a platform team provides ingestion, storage, compute, catalog, CI/CD templates, monitoring so domains do not each reinvent them.
    4. **Federated computational governance:** global standards (naming, PII rules, interoperability keys like engine serial number, quality metrics) decided jointly and **enforced by the platform automatically** (policies as code), not by review boards.

    ## Central platform vs mesh
    | | Central data team | Data mesh |
    |---|---|---|
    | Speed for many domains | Bottleneck | Parallel |
    | Consistency | High | Needs strong standards |
    | Required maturity | Lower | High: domains need data engineering skills |
    | Risk | Backlog, context loss | Duplication, inconsistent definitions, "data silos with extra steps" |
    Most large companies land in between: a central platform team + domain-aligned data product teams + a central governance function, often on one lakehouse (Unity Catalog catalogs per domain).

    ## What a DE 1 does in this world
    Builds and maintains data products for a domain: well-modelled, documented, tested, with contracts and SLAs, published in the catalog, reusing platform templates. Understanding consumers (analytics, ML, GenAI) is part of the job.

    ## How interviewers test this
    - "What is data mesh? Would it suit us?"
    - "What makes a dataset a data product?"
    - "How do you prevent ten domains from defining 'active engine' ten ways?" (Shared semantic layer/metrics definitions, governance standards, certified products.)
  `, {
    check: [
      order('List the four data mesh principles in the usual order.', ['Domain ownership', 'Data as a product', 'Self-serve data platform', 'Federated computational governance'], 'Zhamak Dehghani\'s four principles.'),
      tf('Data mesh is mainly a choice of storage technology.', false, 'It is an organisational and operating model.'),
      mcq('Biggest risk when adopting mesh without strong governance?', ['Too much consistency', 'Inconsistent definitions and duplicated, incompatible data products', 'Lower storage costs', 'Faster delivery'], 1, 'Federated governance enforced by the platform is the counterweight.'),
    ],
  }),
};
