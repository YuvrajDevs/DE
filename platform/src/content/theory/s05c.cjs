const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== CAP
  cap: T(`
    > **In one line:** the **CAP theorem** says that when a **network partition** splits a distributed system, it must choose between **Consistency** (every read gets the latest write, or an error) and **Availability** (every request gets a non-error answer, possibly stale). Since partitions will happen, the real choice is **CP vs AP** during failures. **PACELC** adds: **Else** (no partition), you trade **Latency vs Consistency**.

    ## The three letters, precisely
    - **C (consistency):** linearizability: all nodes behave like a single up-to-date copy. (Not the "C" in ACID.)
    - **A (availability):** every request to a non-failed node gets a response (not an error).
    - **P (partition tolerance):** the system keeps operating even though messages between nodes are lost.
    In a real network, partitions are not optional, so **P is a given**; during a partition you pick C or A.

    ## What CP and AP look like
    - **CP:** during a partition, the minority side **refuses** writes/reads that it cannot guarantee (errors or timeouts) to avoid divergence. Examples: systems using consensus (ZooKeeper, etcd, HBase, Spanner, CockroachDB, MongoDB with majority writes).
    - **AP:** both sides keep **answering**, possibly with stale data, and reconcile later. Examples: Cassandra and DynamoDB at low consistency levels, DNS, many caches.
    - Many systems are **tunable** per request (Cassandra «QUORUM» behaves CP-ish, «ONE» AP-ish).

    ## PACELC: the everyday trade-off
    Partitions are rare; latency is constant. Even with a healthy network, strong consistency needs coordination (waiting for replicas or a leader across regions), which adds latency. So systems are classified e.g. **PA/EL** (available in partitions, low latency otherwise: Cassandra, DynamoDB defaults) or **PC/EC** (consistent always, paying latency: Spanner, HBase).

    ## Why a data engineer should care
    - Choosing **sources and sinks**: reading from an AP store means your extract can be slightly stale or inconsistent across partitions.
    - **Serving stores** for applications: is a stale engine health score acceptable for 2 seconds? (Usually yes → AP is fine.) Inventory reservation? (No → CP.)
    - **Kafka settings** express the same trade-off: «acks=all» + «min.insync.replicas=2» + «unclean.leader.election=false» prefers consistency (producers get errors if not enough replicas); enabling unclean election prefers availability at the risk of losing data.
    - **Multi-region architectures** for analytics: replicate asynchronously (AP) and accept lag.

    ## Common misunderstandings
    - "Pick 2 of 3" as if CA were an option for distributed systems: not when partitions can happen.
    - CAP's C is not ACID's C.
    - CAP is about behaviour **during a partition**, not about everyday performance (that is PACELC).

    ## How interviewers test this
    - "Explain CAP with an example." Two data centres lose connection; a write arrives on one side; CP refuses or blocks, AP accepts and reconciles later.
    - "Is Cassandra CP or AP?" AP by design, tunable.
    - "What does PACELC add?"
  `, {
    check: [
      mcq('During a network partition, a CP system typically…', ['Answers all requests with possibly stale data', 'Refuses or delays some requests on the side that cannot guarantee the latest data', 'Loses all data', 'Ignores the partition'], 1, 'Consistency over availability while partitioned.'),
      tf('"Consistency" in CAP means the same as "consistency" in ACID.', false, 'CAP: every read sees the latest write (linearizability). ACID: transactions preserve constraints.'),
      mcq('What does PACELC add to CAP?', ['A fourth storage layer', 'Even without partitions, systems trade latency against consistency', 'That partitions never happen', 'Security'], 1, 'The everyday trade-off.'),
      mcq('Kafka with «acks=all», «min.insync.replicas=2» and unclean leader election disabled favours…', ['Availability over consistency', 'Consistency/durability over availability: producers get errors rather than risk losing acknowledged data', 'Neither', 'Latency only'], 1, 'Kafka exposes the CAP trade-off in its settings.'),
    ],
  }),

  // ================================================================== Delivery semantics
  semantics: T(`
    > **In one line:** delivery semantics describe what happens to messages when things fail: **at-most-once** (may lose, never duplicates), **at-least-once** (never loses, may duplicate) and **exactly-once** (each message affects the result once). Real "exactly-once" is usually **at-least-once delivery + idempotent or transactional processing**.

    ## Where the guarantee is decided
    It depends on **when the consumer records its progress** relative to **when it produces its output**:
    | Order of operations | Crash in between causes | Semantics |
    |---|---|---|
    | Commit offset, **then** process/write | The message is never processed | **At-most-once** |
    | Process/write, **then** commit offset | The message is processed again on restart | **At-least-once** |
    | Write output **and** offset **atomically** (same transaction), or write idempotently | Neither loss nor double effect | **Exactly-once (effectively)** |

    ## The three, with use cases
    - **At-most-once:** lowest overhead; acceptable for metrics where a small loss is fine (e.g. sampled telemetry for a live chart).
    - **At-least-once:** the default for most pipelines; you **must** deduplicate or write idempotently downstream.
    - **Exactly-once:** needed when duplicates or losses are unacceptable: money, counts used for billing, warranty claims.

    ## How exactly-once is actually achieved
    1. **Replayable source** with positions: Kafka offsets, files with a processed list, bronze table versions.
    2. **Checkpointed progress**: positions (and state) saved durably.
    3. **Idempotent or transactional sink**:
       - **Idempotent:** MERGE on a unique key, insert-if-absent by event_id, overwrite by partition/batch ID.
       - **Transactional:** output and progress committed together (Kafka transactions for Kafka-to-Kafka; Spark → Delta writes a batch ID into the Delta commit so a replayed batch is skipped).
    **Spark Structured Streaming → Delta** is exactly-once end to end because: Kafka offsets are checkpointed per micro-batch, and the Delta sink records the batch ID in its transaction log, so if a batch is replayed after a crash, Delta recognises it and does not write it twice.

    ## Kafka's exactly-once features (EOS)
    - **Idempotent producer** («enable.idempotence=true»): broker deduplicates producer retries using producer ID + sequence numbers, so retries do not create duplicates in the log.
    - **Transactions:** a producer writes to several partitions and commits consumer offsets atomically; consumers with «isolation.level=read_committed» only see committed data. Gives exactly-once for read-process-write **within Kafka**.
    - Beyond Kafka (writing to a database), you still need an idempotent or transactional sink.

    ## Edge cases and what goes wrong
    - **Exactly-once inside the engine, at-least-once at the edges:** sending alert emails or calling APIs from a stream; a replay re-sends them. Use idempotency keys or dedupe tables.
    - **Foreach sinks** («foreachBatch») are at-least-once unless you make the write idempotent (use the batchId).
    - **Changing the checkpoint location** or deleting it → reprocessing from scratch (duplicates) or from latest (loss).
    - **Duplicates already in the source** (the producer sent the same event twice with different offsets): exactly-once processing does not remove them; dedupe by event ID.
    - **Non-deterministic processing** on replay (random, current time) produces different outputs.

    ## How interviewers test this
    - "Explain at-most-once, at-least-once, exactly-once." Use the commit-order table.
    - "How do you get exactly-once from Kafka to a Delta/warehouse table?" Checkpointed offsets + idempotent/transactional sink.
    - "Your Turbofan project: how did you prove exactly-once?" Kill the job mid-stream, restart, show no duplicates and no gaps (counts and unique keys).
  `, {
    check: [
      mcq('A consumer commits its offset **before** writing results. It crashes after committing. What happens to those messages?', ['They are processed twice', 'They are lost: at-most-once', 'They are processed exactly once', 'Kafka resends them automatically'], 1, 'Commit-before-process = at-most-once.'),
      mcq('How does Spark Structured Streaming achieve exactly-once into Delta?', ['By never failing', 'Checkpointed source offsets plus the Delta sink recording batch IDs so replayed batches are not written twice', 'Kafka deletes processed messages', 'By using RDDs'], 1, 'Replayable source + checkpoint + idempotent transactional sink.'),
      tf('Exactly-once processing in Spark guarantees that duplicate events sent twice by the producer are removed.', false, 'Exactly-once covers processing of each record in the log; duplicates in the source need deduplication by event ID.'),
      match('Match the setting/feature to what it gives.', [['enable.idempotence=true (producer)', 'No duplicates in the log from producer retries'], ['Kafka transactions + read_committed', 'Atomic read-process-write within Kafka'], ['MERGE on event_id into the sink', 'Idempotent writes, so replays are harmless'], ['Commit offset after write', 'At-least-once']], 'Exactly-once is built from pieces.'),
    ],
    interview: [
      talk('How did you guarantee and prove exactly-once in your streaming project?', `
        - **Design:** Kafka as a replayable source; Spark Structured Streaming with a checkpoint location per query (offsets + state); writes to Delta, whose sink records the micro-batch ID in the transaction log so a replayed batch is skipped; deduplication on the event ID within a watermark for duplicates coming from producers.
        - **Proof (the part that impresses):** run the producer at a known rate with unique sequence IDs; kill the streaming job mid-batch (several times, at different points); restart from the checkpoint; then check: count of rows = count of produced events, number of distinct IDs = count of rows (no duplicates), no gaps in sequence IDs (no loss).
        - **Edges:** anything outside the transactional sink (alerts) is made idempotent with keys; checkpoint directories are never shared or deleted; logic changes are checked for checkpoint compatibility.
        - Use your real numbers from Turbofan if you have them.`),
    ],
    hands: [
      py({ q: 'Simulate consumer **semantics** with a crash. «consume(messages, mode, crash_after)»: process messages in order. Processing appends the message to «output»; committing sets «committed = index + 1». «mode» is «"at_most_once"» (commit, then process) or «"at_least_once"» (process, then commit). The consumer **crashes** right after the **first** of the two operations for message number «crash_after» (0-based), then **restarts** from «committed» and runs to the end with no further crashes. Return «output».', starter: 'def consume(messages, mode, crash_after):\n    pass\n',
        tests: `m = ['a', 'b', 'c', 'd']
assert consume(m, 'at_least_once', 1) == ['a', 'b', 'b', 'c', 'd'], 'b processed, crash before commit, reprocessed'
assert consume(m, 'at_most_once', 1) == ['a', 'c', 'd'], 'b committed, crash before processing: lost'
assert consume(m, 'at_least_once', 3) == ['a', 'b', 'c', 'd', 'd']
assert consume([], 'at_most_once', 0) == []`,
        solution: `def consume(messages, mode, crash_after):
    output, committed, crashed = [], 0, False
    i = 0
    while i < len(messages):
        if mode == 'at_most_once':
            committed = i + 1
            if i == crash_after and not crashed:
                crashed = True
                i = committed
                continue
            output.append(messages[i])
        else:
            output.append(messages[i])
            if i == crash_after and not crashed:
                crashed = True
                i = committed
                continue
            committed = i + 1
        i += 1
    return output` }),
    ],
  }),

  // ================================================================== Sizing
  sizing: T(`
    > **In one line:** back-of-envelope sizing turns a vague requirement ("10,000 engines sending data") into **numbers**: events per second, bytes per day, storage per year, partitions and cluster size, in two minutes on a whiteboard. Interviewers use it to see whether you can reason about scale.

    ## The numbers to remember
    | Fact | Value |
    |---|---|
    | Seconds per day | 86,400 (≈ 10^5) |
    | Seconds per year | ≈ 31.5 million (≈ 3 × 10^7) |
    | 1 KB / 1 MB / 1 GB / 1 TB / 1 PB | 10^3 / 10^6 / 10^9 / 10^12 / 10^15 bytes |
    | 1 million events/day | ≈ 12 events/s on average |
    | Peak vs average | Plan for 2-10× average (bursts, backfills) |
    | Columnar compression | 5-10× smaller than raw JSON/CSV |
    | Replication | ×3 for HDFS/Kafka copies |
    | Sequential disk / network | Hundreds of MB/s per disk/node; ~1-10 GB/s cluster-wide is ordinary |
    | Kafka partition throughput | Roughly 5-10+ MB/s per partition (depends on setup) |
    | Spark task | Comfortable at ~100-200 MB of input per task |

    ## The method (say it out loud in this order)
    1. **Clarify inputs:** number of sources, event rate, event size, retention, peak factor, query patterns.
    2. **Rate:** events/s = sources × events per source per second.
    3. **Throughput:** MB/s = events/s × bytes per event.
    4. **Daily volume:** bytes/s × 86,400.
    5. **Stored volume:** × retention days, ÷ compression, × replication.
    6. **Derived needs:** Kafka partitions (peak MB/s ÷ per-partition MB/s, with headroom), Spark tasks (data per run ÷ 128 MB), storage cost, query scan size.
    7. **Sanity-check** and state assumptions.

    ## Worked example: engine telemetry
    - 10,000 engines × 1 reading/s = **10,000 events/s** average; peak ×3 = 30,000/s.
    - 500 bytes per JSON event → 5 MB/s average, 15 MB/s peak.
    - Per day: 5 MB/s × 86,400 ≈ **432 GB/day raw JSON**.
    - Parquet ~8× smaller → ≈ 54 GB/day; per year ≈ 20 TB (object storage, already replicated by the cloud).
    - Kafka: 15 MB/s peak ÷ ~5 MB/s per partition = 3 → choose **12 partitions** for headroom and consumer parallelism; retention 7 days of raw: 432 GB × 7 × 3 replicas ≈ 9 TB broker storage.
    - Daily batch over one day of Parquet: 54 GB ÷ 128 MB ≈ 420 tasks → a cluster of ~100 cores finishes in a few waves.

    ## Edge cases interviewers probe
    - **Peaks and backfills** (a reconnecting fleet uploads a day of buffered data at once).
    - **Hot keys** (one engine 100× chattier).
    - **Small files** from frequent micro-batches (10 s triggers × 12 partitions = 100k files/day without compaction).
    - **Growth** (fleet doubles yearly).
    - **Query side:** dashboards scanning a year without partition pruning = 20 TB per query.

    ## How interviewers test this
    - "Estimate storage for X." Use the method aloud, state assumptions, round aggressively, sanity check.
  `, {
    check: [
      mcq('5,000 devices each send 2 events per second. Roughly how many events per day?', ['864,000', '8.64 million', '864 million', '86.4 billion'], 2, '10,000 events/s × 86,400 s ≈ 864 million.'),
      mcq('1 million events per day is on average about…', ['1 event/s', '12 events/s', '1,000 events/s', '100,000 events/s'], 1, '10^6 / 86,400 ≈ 11.6.'),
      tf('When sizing, you should plan only for the average rate.', false, 'Plan for peaks (2-10× average) and backfills.'),
    ],
    hands: [
      py({ q: 'Write «size(devices, events_per_sec, bytes_per_event, retention_days, compression, replication)» returning a dict with: «eps» (events/s), «mb_per_sec» (bytes/s ÷ 10^6), «gb_per_day_raw» (÷ 10^9), and «tb_stored» = raw per day × retention ÷ compression × replication ÷ 1000. Round all floats to **2 dp**.', starter: 'def size(devices, events_per_sec, bytes_per_event, retention_days, compression, replication):\n    pass\n',
        tests: `r = size(10000, 1, 500, 365, 8, 1)
assert r == {'eps': 10000, 'mb_per_sec': 5.0, 'gb_per_day_raw': 432.0, 'tb_stored': 19.71}, r
r2 = size(2000, 0.5, 1000, 7, 1, 3)
assert r2 == {'eps': 1000.0, 'mb_per_sec': 1.0, 'gb_per_day_raw': 86.4, 'tb_stored': 1.81}, r2`,
        solution: `def size(devices, events_per_sec, bytes_per_event, retention_days, compression, replication):
    eps = devices * events_per_sec
    bps = eps * bytes_per_event
    gb_day = bps * 86400 / 1e9
    return {
        'eps': eps,
        'mb_per_sec': round(bps / 1e6, 2),
        'gb_per_day_raw': round(gb_day, 2),
        'tb_stored': round(gb_day * retention_days / compression * replication / 1000, 2),
    }` }),
    ],
  }),

  // ================================================================== System design
  sysdesign: T(`
    > **In one line:** designing a data pipeline end to end means walking from **requirements** to **sources, ingestion, storage, processing, serving, quality, orchestration, security, operations and cost**, making and justifying trade-offs at each step. Interviews test the **structure of your thinking** more than the specific tools.

    ## A framework you can use every time (say the steps out loud)
    1. **Clarify requirements (5 minutes, ask questions):**
       - Consumers and decisions: who uses it, for what?
       - Freshness: real-time, minutes, daily?
       - Volume and growth; peak rates.
       - Data sources: types, change patterns, deletes, quality.
       - Accuracy needs: provisional OK? exactly-once needed?
       - History and retention; compliance (PII, export control).
       - Budget and existing platform/skills.
    2. **Size it** (back-of-envelope).
    3. **High-level architecture:** draw sources → ingestion → storage layers → processing → serving → consumers.
    4. **Go deep on the hard parts:** usually incremental ingestion/CDC, late data, deduplication, the data model and grain, scaling hot paths.
    5. **Reliability:** idempotency, retries, DLQ/quarantine, checkpoints, backfills, quality gates, reconciliation.
    6. **Operations:** orchestration, monitoring, alerting, SLAs, on-call, CI/CD.
    7. **Governance and security:** access control, PII handling, catalog, lineage, retention.
    8. **Cost and trade-offs:** what you chose, what you rejected, why; how it evolves at 10× scale.

    ## Worked outline: "Design a pipeline for engine telemetry and warranty analytics"
    - **Requirements:** 10k engines, 1 reading/s; fault alerts within 1 minute; daily health scores; claims analytics joining telemetry with CRM claims; 2 years of history; dealers see only their engines.
    - **Size:** ~10k events/s, ~430 GB/day raw, ~55 GB/day Parquet.
    - **Ingestion:** devices → IoT hub/gateway → Kafka (12+ partitions, keyed by engine_id, Avro + schema registry). CRM claims via CDC (Debezium) or incremental API pulls every 15 min.
    - **Storage:** Delta lakehouse on ADLS/S3. Bronze: raw events and CDC changes. Silver: deduplicated, typed readings partitioned by date (clustered by engine_id); claims current-state via MERGE; dimensions with SCD2. Gold: daily engine health, claims fact + dimensions, aggregates for dashboards.
    - **Processing:** Spark Structured Streaming for bronze/silver telemetry and fault alerts (event-time windows, watermark, dedupe by event_id); batch/incremental Spark or dbt for gold.
    - **Serving:** Power BI on gold via SQL warehouse (row-level security by dealer); latest health score per engine in a low-latency store for the service app; feature tables for the failure model.
    - **Reliability:** checkpoints + Delta for exactly-once; quarantine for bad readings; late-data lookback for daily gold; replay from bronze; reconciliation of claims vs CRM.
    - **Ops:** Airflow/Databricks Workflows for batch; lag, freshness, volume and quality alerts; SLAs (gold by 06:00; alerts p95 < 60 s); CI/CD with tests.
    - **Governance:** Unity Catalog: owners, tags (PII in claims), lineage, retention (raw readings 90 days hot, aggregates 2+ years).
    - **Cost:** job clusters with autoscaling, compaction, downsampling old raw data, partition pruning.
    - **Trade-offs:** streaming only for alerts and bronze; batch for analytics; lakehouse instead of separate lake + warehouse to avoid copies.

    ## What interviewers look for
    - You **ask before you design**.
    - You state assumptions and numbers.
    - You **justify** each choice and name alternatives.
    - You think about **failure**, not just the happy path.
    - You keep it as simple as the requirements allow.

    ## How interviewers test this
    - "Design a pipeline for X." Use the framework; draw; go deep where they steer.
    - Follow-ups: "What if volume grows 10×?", "What if the source sends duplicates?", "How do you backfill?", "How do you know it is correct?"
  `, {
    check: [
      order('Order the steps of a system design answer.', ['Clarify requirements and consumers', 'Size it (rates, volumes)', 'Draw the high-level architecture', 'Deep dive on the hard parts', 'Reliability and operations', 'Governance, cost and trade-offs'], 'Ask, size, sketch, deepen, harden, justify.'),
      mcq('An interviewer says "design a real-time dashboard pipeline". What should you do first?', ['Name Kafka and Spark immediately', 'Ask what decisions it supports, how fresh it must be, volumes, sources and accuracy needs', 'Draw the database schema', 'Talk about cost'], 1, 'Requirements drive every choice; "real-time" must become a number.'),
      tf('In a design interview, discussing what happens when things fail is as important as the happy path.', true, 'Failure handling is what distinguishes engineers.'),
    ],
    interview: [
      talk('Design a data platform to ingest data from relational databases, event streams and unstructured documents (the posting\'s first responsibility).', `
        - **Clarify:** consumers (BI, data science, GenAI), freshness per source, volumes, compliance (PII, export control), cloud platform (likely Azure).
        - **Ingestion by source type:**
          - Relational: CDC (Debezium/ADF/native) or watermark incremental extracts with overlap; initial chunked snapshot.
          - Events/IoT: Event Hubs/Kafka with schema registry, keyed by device; Structured Streaming into bronze.
          - Unstructured: files to ADLS via secure transfer (checksums), metadata table; extraction jobs (OCR/LLM) produce structured outputs.
        - **Storage:** ADLS Gen2 + Delta, medallion layers, Unity Catalog.
        - **Processing:** Databricks/Spark for silver; dbt or Spark SQL for gold; streaming where latency needs it.
        - **Serving:** SQL warehouse + Power BI; feature tables; vector index for documents (RAG).
        - **Reliability & quality:** idempotent MERGE, quarantine, contracts, DQ gates, reconciliation, replay from bronze.
        - **Automation:** IaC (Terraform/Bicep), CI/CD for code and jobs, orchestrated workflows, environments dev/test/prod.
        - **Governance:** catalog, lineage, ownership, access control (RBAC, row/column security), retention policies, PII tagging and masking.
        - **Monitoring:** freshness, volume, lag, cost, SLAs and alerting.`),
      talk('Your pipeline volume grows 10× next year. What changes?', `
        - **Re-size:** rates, storage, partitions; find which component saturates first.
        - **Ingestion:** more Kafka partitions (plan early; repartitioning keyed topics changes key→partition mapping), more consumers, producer batching/compression.
        - **Processing:** strictly incremental (no full recomputes), partition pruning, file compaction and clustering, broadcast/skew handling, autoscaling job clusters.
        - **Storage:** lifecycle tiers, downsampling old raw data, retention review.
        - **Serving:** pre-aggregates/materialised views for dashboards; caching; workload isolation.
        - **Cost:** cost per pipeline monitoring, spot capacity, budgets.
        - **Ops:** load test before it happens (like the Turbofan load test), capacity alerts at 60-70% utilisation.`),
    ],
  }),
};
