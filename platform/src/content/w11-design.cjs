const { learn, mcq, tf, multi, match, order, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('design', 'System Design and Incident Room', 'DE II stretch',
  'A repeatable framework for "design a pipeline" questions, worked design drills on Cummins-style problems, scaling and cost trade-offs, and production incidents to debug.',
  [
    lesson('d1', 'A framework for design questions', 15, [
      learn('Seven steps, every time', `
        Interviewers grade the **process** more than the final diagram. Walk through:

        1. **Clarify requirements**: consumers, decisions supported, **freshness** (daily? 5 min?), **volume** (rows/day, GB/day, growth), sources and their interfaces, history needed, accuracy needs.
        2. **Estimate scale**: back-of-envelope numbers. 10,000 events/s × 300 B ≈ 3 MB/s ≈ 260 GB/day.
        3. **Sketch the flow**: sources → ingest → storage layers → transform → serve, plus orchestration and monitoring around it.
        4. **Choose components and justify them**: batch vs stream, warehouse vs lakehouse, format, partitioning, MERGE strategy. Say the **trade-off** each time.
        5. **Data model**: grain, facts, dimensions, keys, SCD.
        6. **Quality, governance, security**: tests, contracts, lineage, PII, access.
        7. **Operations and failure modes**: retries, idempotency, backfills, late data, schema change, monitoring/alerting, cost.

        Close with: *"Version one would be X. If volume grows 10×, I'd change Y."*
      `),
      order('Order the steps of the design framework.', ['Clarify requirements and consumers', 'Estimate scale', 'Sketch the end-to-end flow', 'Choose components and state trade-offs', 'Design the data model', 'Add quality, governance and security', 'Cover operations, failures and evolution']),
      mcq('An interviewer says "Design a pipeline for supplier delivery KPIs." Your first move?', ['Draw Kafka and Spark boxes', 'Ask who uses it, how fresh it must be, what the sources are and roughly how much data there is', 'Pick Snowflake', 'Write SQL'], 1),
      mcq('Back-of-envelope: 20,000 engines send a 500-byte reading every 10 seconds. Daily raw volume is roughly…', ['8.6 GB', '86 GB', '860 GB', '8.6 TB'], 1, '20,000 / 10 = 2,000 events/s × 500 B = 1 MB/s × 86,400 s ≈ 86 GB/day (before compression).'),
    ]),
    lesson('d2', 'Design drills', 30, [
      talk('Design a **daily supplier-performance data product** for Supply Chain (on-time delivery %, lead-time variance, defect rate per supplier).', `
        - **Requirements**: consumers are procurement managers and the supplier scorecard. Daily freshness by 07:00. 3 years of history. Drill to PO line.
        - **Sources**: ERP (SAP) purchase orders and goods receipts (JDBC/CDC), quality inspection results (MES), supplier master.
        - **Ingest**: CDC or watermark extracts into bronze (Delta/Parquet), partitioned by load date.
        - **Silver**: conformed supplier and part keys, typed dates, dedupe goods receipts, handle partial deliveries.
        - **Gold**: «fct_po_line» (grain: PO line; measures qty ordered/received, promised vs actual date, lead time) + «fct_inspection» + dims (supplier SCD2, part, plant, date). Aggregate table «supplier_scorecard_monthly».
        - **Quality**: received_qty ≤ ordered_qty, dates ordered correctly, FK integrity, reconciliation with ERP totals, freshness alert.
        - **Governance**: catalog entry, metric definitions ("on-time = received ≤ promised + 2 days grace"), owner, access for procurement roles.
        - **Ops**: Airflow/ADF DAG daily, idempotent partition overwrite, backfill by date, SLA monitoring.
        - **Evolve**: near-real-time alerts on late shipments via events later; AI-ready supplier risk features.
      `),
      talk('Design a pipeline that replicates **Salesforce Service Cloud** objects (Case, WorkOrder, Claim) into the lakehouse for analytics, updated every hour.', `
        - **Extract**: Salesforce Bulk API 2.0 for large objects with «SystemModstamp > watermark» (incremental), or Salesforce **Change Data Capture** events / Platform Events for near-real-time. Handle API limits (batch sizes, backoff on 429/limit errors). Use queryAll to catch deleted records («IsDeleted»).
        - **Land**: raw JSON/CSV in bronze with extraction metadata.
        - **Silver**: typed, deduped by Id keeping the latest SystemModstamp, MERGE upsert, soft deletes. Map picklists and record types. Flatten relationship fields.
        - **Gold**: the warranty funnel accumulating snapshot (CRF → SR → PIR → Claim → Credit Note), stage durations, conformed dealer/customer dims.
        - **Quality**: row counts vs SOQL «COUNT()» per object, no duplicate Ids, referential checks between objects.
        - **Ops**: hourly schedule, watermark stored per object and advanced only after a successful MERGE, alert on API failures, schema-drift detection when admins add fields.
        - Mention your hands-on knowledge of these objects and SOQL. That's your edge.
      `),
      talk('The data science team wants an **AI-ready dataset** to predict warranty claims from engine telemetry and service history. Design it.', `
        - **Entity and grain**: one row per engine per day (or per week): a feature table.
        - **Label**: did the engine have a warranty claim within the next 30 days? Built point-in-time, with no future leakage.
        - **Features**: rolling telemetry stats (avg/max temperature, pressure drops, hours run over 7/30 days), service history counts, engine age, model, plant, customer segment, previous failure codes.
        - **Point-in-time correctness**: features as of the prediction date only; SCD2 dims joined by date.
        - **Pipeline**: gold telemetry aggregates + service facts → feature table (Delta) partitioned by date; incremental daily; registered in a feature store / catalog with descriptions.
        - **Quality**: null rates, value ranges, drift monitoring on feature distributions, reproducible snapshots (time travel) for training sets.
        - **Governance**: no PII needed; document lineage for model audits.
      `),
      talk('Design a **near-real-time inventory visibility** view across 4 plants for 16,000 parts.', `
        - **Requirements**: latency target (5 min?), consumers (planners, MRP alerts), accuracy vs ERP.
        - **Sources**: ERP goods movements via CDC (Debezium/ERP connectors) into Kafka; periodic full snapshots for reconciliation.
        - **Processing**: stream of movements (+receipt, −issue, transfer) aggregated into current stock per (plant, part) with a stateful streaming job, or MERGE micro-batches into a Delta table every 5 min.
        - **Serving**: current-state table for dashboards/APIs; daily periodic snapshot fact for history (semi-additive measure!).
        - **Correctness**: nightly reconciliation against the ERP snapshot with auto-correction and alerts; idempotent processing keyed by movement document ID.
        - **Ops**: consumer lag, freshness, reconciliation drift metrics.
      `),
    ]),
    lesson('d3', 'Incident room', 25, [
      scenario('Dashboard numbers don\'t match Salesforce', `The Claims dashboard shows **1,284** approved claims for October. A manager's Salesforce report shows **1,247**. Both are "approved claims in October".`, [
        ['First step?', [
          ['Pin down both definitions exactly: status values included, date field used (submitted vs approved), time zone, and filters', true, 'Most mismatches are definition differences, not bugs. You know this from SOQL validation.'],
          ['Assume Salesforce is right and patch the dashboard by −37', false, 'Never patch numbers.'],
          ['Rebuild the pipeline', false, 'Not before knowing the cause.'],
        ]],
        ['Definitions match. You list claim IDs from both sides. 37 IDs exist only in the warehouse, and they all appear twice with different «_ingested_at». Cause?', [
          ['Duplicate ingestion (at-least-once delivery or a rerun of an append) and the silver layer doesn\'t dedupe on claim_id', true, 'Classic duplicate load. Count distinct IDs vs rows to prove it.'],
          ['Salesforce is missing claims', false, 'They are duplicates on our side.'],
        ]],
        ['Fix and prevent?', [
          ['Dedupe in silver on claim_id (latest version), switch the load to MERGE, add a uniqueness test that blocks publishing, backfill October, and inform consumers', true, 'Fix the data, fix the design, add a guardrail, communicate.'],
          ['Add DISTINCT in the dashboard query', false, 'Hides the problem for this one consumer while every other consumer stays wrong.'],
        ]],
      ]),
      scenario('Pipeline failed at 03:00', `The nightly **fct_claims** DAG failed at the «transform_silver» task with: «AnalysisException: cannot resolve 'claim_amount' given input columns [claim_amt, ...]». Consumers need data by 06:00.`, [
        ['What happened?', [
          ['Upstream schema change: the source renamed claim_amount to claim_amt', true, 'The error names it directly. Read errors carefully before acting.'],
          ['Spark ran out of memory', false, 'Different error.'],
          ['The network failed', false, 'Different error.'],
        ]],
        ['It\'s 03:20. Best action to meet 06:00 safely?', [
          ['Apply a reviewed mapping (claim_amt → claim_amount) via the normal deploy path, re-run from the failed task, verify row counts and totals, and notify consumers of the delay risk', true, 'Fast but controlled. Rerun only the failed and downstream tasks.'],
          ['Edit the production notebook directly and run it', false, 'Untracked hot-fixes create drift and the next deploy will undo them.'],
          ['Publish yesterday\'s data as today\'s', false, 'Stale data presented as fresh is worse than a delay.'],
        ]],
        ['Prevention?', [
          ['Schema contract with the source team plus a schema check at bronze → silver that alerts before the transform runs', true, 'Catch breaking changes at the boundary with a clear message.'],
          ['Turn off failure alerts at night', false, 'No.'],
        ]],
      ]),
      scenario('Cloud bill doubled', `The data platform's monthly compute cost doubled in 3 weeks. No new pipelines were launched.`, [
        ['Where do you start?', [
          ['Break cost down by job/cluster/warehouse (tags) and compare against the previous month', true, 'You can\'t fix what you can\'t attribute. Tag everything.'],
          ['Cancel all jobs', false, 'That stops the business.'],
        ]],
        ['One interactive cluster runs 24/7 at full size, and a daily job now does a full reload of a 3 TB table instead of incremental. Fixes?', [
          ['Auto-termination and job clusters, and restore incremental processing (watermark/CDC + MERGE)', true, 'Idle compute and needless full reprocessing are the two biggest cost leaks.'],
          ['Move everything to a bigger cluster to finish faster', false, 'Bigger is not cheaper.'],
        ]],
      ]),
      scenario('Duplicates after a backfill', `You backfilled September for «fct_claims» after a bug fix. Now September totals are **exactly double**.`, [
        ['Most likely cause?', [
          ['The load appends, so the backfill added a second copy of September instead of replacing it', true, 'Non-idempotent writes plus a rerun means duplicates.'],
          ['Claims doubled in September', false, 'Exactly 2× is a pipeline signature.'],
        ]],
        ['Correct fix?', [
          ['Rewrite September with a partition overwrite (replaceWhere / INSERT OVERWRITE) or MERGE on claim_id, and add a uniqueness test', true, 'Make the write idempotent, then rerun.'],
          ['Divide September by 2 in the dashboard', false, 'Never.'],
        ]],
      ]),
    ]),
    lesson('d4', 'Scaling and cost trade-offs', 15, [
      learn('Trade-offs to say out loud', `
        | Decision | Option A | Option B | Choose A when… |
        |---|---|---|---|
        | Latency | batch | streaming | hours of delay are acceptable (most reporting) |
        | Load | full | incremental | data is small or the source can't give changes |
        | Model | star | one big table | many consumers, conformed metrics |
        | Storage | warehouse tables | lakehouse (Delta/Iceberg) | SQL-only, small team, managed simplicity |
        | Join | broadcast | sort-merge | one side fits in executor memory |
        | Freshness vs cost | always-on cluster | scheduled job clusters | constant low-latency load |

        **Scaling levers, cheapest first:** read less (pruning, columns, incremental) → fix skew and bad joins → right-size partitions/files → caching for reuse → autoscaling → bigger machines.

        **Cost hygiene:** tag resources per pipeline/domain, auto-terminate, spot instances for fault-tolerant batch, lifecycle rules to move cold data to archive tiers, compaction to avoid small files, and monitor cost per pipeline run.
      `),
      mcq('Which lever should you pull **first** when a batch job is slow and expensive?', ['Bigger machines', 'Read less data: partition pruning, column selection, incremental processing', 'More retries', 'Rewrite in another language'], 1),
      multi('Good cost controls for a data platform:', ['Auto-terminate idle clusters', 'Tag jobs by domain/pipeline and review cost per run', 'Keep every intermediate table forever on hot storage', 'Use spot/preemptible nodes for retry-safe batch jobs', 'Compact small files'], [0, 1, 3, 4]),
      tf('Streaming is always the more modern and therefore better choice.', false, 'Streaming costs more to run and operate. Choose it when low latency creates business value.'),
    ]),
  ]);
