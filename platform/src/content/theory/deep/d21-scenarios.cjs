const { scenario } = require('../_t.cjs');

module.exports = {
  fullincr: { scenarios: [
    scenario('Rows that never arrived', `
      A nightly incremental load from the dealer portal's Postgres uses «WHERE updated_at > :last_watermark» and sets the new watermark to «now()» at the end of the run. Finance reports ~0.4% of claims missing in the lakehouse, always ones updated around the time the job runs.`, [
      ['What is the most likely mechanism?', [
        ['Rows committed during or just after the extract with updated_at earlier than now(); setting the watermark to now() skips them forever', true, 'The watermark must come from the data read (max updated_at seen), with an overlap.'],
        ['Postgres lost the rows', false, 'They are in the source.'],
        ['The job ran twice', false, 'That causes duplicates, not gaps.'],
      ]],
      ['Best fix?', [
        ['Set the watermark to the max updated_at actually loaded, re-read an overlap window (e.g. 15 minutes) every run and dedupe by (claim_id, updated_at); backfill the gap once by reloading the affected period', true, 'Closes the gap and repairs history.'],
        ['Run the job more often', false, 'The race remains.'],
        ['Use updated_at >= now() - 1 day without dedupe', false, 'Creates duplicates.'],
      ]],
      ['How would you detect this class of bug automatically?', [
        ['A daily key-count reconciliation between source and target for closed days, alerting on any difference', true, 'Reconciliation catches silent loss.'],
        ['Check that the job succeeded', false, 'It always succeeded.'],
        ['Row count of the target only', false, 'No reference to compare with.'],
      ]],
    ], 'Watermarks derived from the wall clock are a classic silent-loss bug.'),
  ] },
  idempotency: { scenarios: [
    scenario('Doubled alerts after a retry', `
      A Databricks job computes engine alerts and, in the same task, sends emails to service managers and appends alerts to «gold.alerts». The task failed at the final write due to a transient storage error; the automatic retry succeeded. Managers received every email twice; «gold.alerts» is correct.`, [
      ['Why is the table right but the emails wrong?', [
        ['The table write is a single Delta commit (the failed attempt committed nothing), but the emails were sent in the first attempt before the failure and again on retry', true, 'External side effects are outside the transaction.'],
        ['Delta duplicated the data', false, 'The table is correct.'],
        ['The email server duplicated them', false, 'Your code sent them twice.'],
      ]],
      ['Best redesign?', [
        ['Write alerts first with MERGE on (engine_id, alert_level, incident_start); a separate notifier sends only alerts not yet marked sent and records the send with the alert key', true, 'Idempotent writes plus idempotent notification.'],
        ['Disable retries', false, 'Then transient errors lose alerts.'],
        ['Send emails after the job in a separate task without tracking', false, 'A retry of that task still duplicates.'],
      ]],
    ], 'Every side effect needs its own idempotency key.'),
  ] },
  schemaval: { scenarios: [
    scenario('The column that became NULL', `
      Supplier delivery files are read with «spark.read.json(path)» (schema inferred). After a supplier\'s system upgrade, «qty» arrives as the string «"12"» instead of the number 12 in some files. Nothing failed, but the on-time-delivery KPI dropped 18%.`, [
      ['What happened?', [
        ['Inference or the downstream cast turned unparseable/mismatched values into NULL, and NULL quantities dropped out of the KPI calculation', true, 'Silent type drift.'],
        ['Suppliers really delivered less', false, 'Volumes did not change.'],
        ['Spark lost files', false, 'Rows exist; values are NULL.'],
      ]],
      ['Best fix?', [
        ['Read with an explicit schema, cast explicitly with validation (string digits accepted, others quarantined with a reason), alert on null-rate changes per column, and tell the supplier via the contract', true, 'Explicit schema + validation + monitoring + contract.'],
        ['Turn on ANSI mode only', false, 'Helps fail loudly, but you still need a policy for the new format.'],
        ['Fill NULL qty with 0', false, 'Makes the KPI wrong in a different way.'],
      ]],
    ], 'Schema inference in production hides drift.'),
  ] },
  dlq: { scenarios: [
    scenario('The dead-letter queue nobody read', `
      Six months after go-live, someone notices the «telemetry_dlq» table has 41 million rows, 99% with reason «UNKNOWN_ENGINE» since a new engine model was introduced in March. The reliability team has been training models without that model\'s data.`, [
      ['What failed, beyond the reference data?', [
        ['No alerting or ownership on DLQ volume and reasons; the DLQ became a silent sink', true, 'A DLQ is only safe when it is monitored.'],
        ['The DLQ design itself', false, 'Quarantining unknown engines was reasonable.'],
        ['Kafka retention', false, 'The data is in the DLQ.'],
      ]],
      ['Recovery plan?', [
        ['Add the new model\'s engines to the reference data, replay DLQ records through the same pipeline idempotently with their original event times, notify the reliability team of the backfill, and add DLQ rate alerts by reason with an owner', true, 'Fix, replay, communicate, prevent.'],
        ['Delete the DLQ', false, 'Destroys six months of data.'],
        ['Insert DLQ rows directly into gold', false, 'Skips validation and silver logic.'],
      ]],
    ], 'Monitor the DLQ like a product metric.'),
  ] },
  backfill: { scenarios: [
    scenario('Backfill that broke the dashboards', `
      You fixed a bug in the approval-amount logic and started a backfill of 24 months of «gold.claims_daily» with 24 parallel runs during business hours. Within an hour the Databricks SQL dashboards time out, the cluster budget alert fires, and the downstream ML feature job (reading the table\'s Change Data Feed) starts reprocessing two years of "changes".`, [
      ['What should have been done differently? (best answer)', [
        ['Announce the backfill, run a one-month pilot and diff it, throttle concurrency off-peak, write to a staging table and swap (or coordinate CDF consumers), and keep the old version for comparison', true, 'Blast radius control.'],
        ['Run all 24 months in one job', false, 'Same load, less control.'],
        ['Skip the backfill', false, 'History stays wrong.'],
      ]],
      ['Right now, what do you do first?', [
        ['Pause remaining backfill runs, let dashboards recover, inform consumers, then resume in throttled chunks off-peak', true, 'Stop the bleeding, communicate, continue safely.'],
        ['Kill the dashboards', false, 'Users need them.'],
        ['Delete the CDF', false, 'Breaks consumers further.'],
      ]],
    ], 'Backfills are production changes with blast radius.'),
  ] },
  late: { scenarios: [
    scenario('The number that changed after month-end', `
      Finance closed October on 2 November using «gold.claims_monthly». On 20 November the same October number is 3.1% higher, because dealers submitted October-dated claims late and the pipeline recomputes the last 60 days.`, [
      ['What is the core design gap?', [
        ['No defined restatement policy: closed periods change silently instead of being frozen or restated through an explicit, communicated process', true, 'Correct and stable numbers need a policy.'],
        ['The pipeline should ignore late claims', false, 'Then October is permanently wrong.'],
        ['Finance should close later', false, 'Partly, but the platform must support closed periods.'],
      ]],
      ['Best solution?', [
        ['Publish snapshot versions per close (frozen "as reported" table) plus a current "as known" table, show provisional periods on dashboards, and report restatements with their delta', true, 'Both views, clearly labelled.'],
        ['Turn off late data', false, 'Loses data.'],
        ['Use time travel ad hoc', false, 'Retention-limited and not a reporting design.'],
      ]],
    ], 'Late data is a reporting-semantics problem as well as a pipeline one.'),
  ] },
  airflow: { scenarios: [
    scenario('Sensors that ate the cluster', `
      Your Airflow deployment has 200 DAGs each waiting for partner files with «FileSensor(poke_interval=60, mode="poke")». During a partner outage nothing arrives for 10 hours. Meanwhile, unrelated critical DAGs are stuck in "queued".`, [
      ['Why are critical DAGs queued?', [
        ['Poke-mode sensors hold a worker slot for their whole wait, exhausting the executor\'s slots', true, 'Waiting is consuming capacity.'],
        ['The scheduler crashed', false, 'It is scheduling; there are no free slots.'],
        ['Partners caused it directly', false, 'Your sensor configuration did.'],
      ]],
      ['Fix?', [
        ['Use deferrable sensors (or reschedule mode) with timeouts, put sensors in a limited pool, and prefer event-driven triggers (asset/dataset events, storage events) where possible', true, 'Free the slots, bound the wait, react to events.'],
        ['Increase poke_interval to 1 second', false, 'Worse.'],
        ['Add workers indefinitely', false, 'Pays for idle waiting.'],
      ]],
    ], 'Waiting should not occupy compute.'),
  ] },
  skew: { scenarios: [
    scenario('One dealer to rule them all', `
      A daily aggregation «groupBy("dealer_id").agg(collect_list("claim_payload"))» started failing with executor OOM after a large fleet customer moved all servicing to one dealer, which now has 45% of claims. AQE is on.`, [
      ['Why did AQE not fix it?', [
        ['AQE skew handling applies to joins, not to aggregations; and collect_list must hold the whole group in one place', true, 'Know AQE\'s limits.'],
        ['AQE is broken', false, 'It does not target this case.'],
        ['The cluster is too small', false, 'One group cannot be split by adding nodes.'],
      ]],
      ['Best fix?', [
        ['Question the collect_list: aggregate to what consumers need (counts, sums, latest) instead; if a list is truly needed, bucket by (dealer_id, date) or write rows and let consumers page through them', true, 'Remove the unbounded per-key structure.'],
        ['Salt the dealer and collect_list per salt, then concatenate', false, 'The final concatenation still builds the huge list.'],
        ['Increase executor memory each time it grows', false, 'Unbounded growth.'],
      ]],
    ], 'Unbounded per-key collections are skew bombs.'),
  ] },
  lagscale: { scenarios: [
    scenario('Lag that never recovers', `
      An Event Hubs topic with 8 partitions feeds a Structured Streaming job. Input rose from 4,000 to 30,000 events/s after a fleet rollout. The job\'s processing rate plateaus at 12,000 events/s even after you double the cluster from 16 to 32 cores. Lag grows indefinitely.`, [
      ['Why did doubling cores not help?', [
        ['Source parallelism is capped by 8 partitions (8 read tasks per batch) and the downstream stages may be bound by the same partitioning; extra cores sit idle', true, 'Check task counts per stage.'],
        ['Event Hubs throttles Spark', false, 'Possible with throughput units, but the core symptom is parallelism.'],
        ['Spark cannot do 30,000 events/s', false, 'It can with enough parallelism.'],
      ]],
      ['Best set of changes?', [
        ['Increase Spark read parallelism (minPartitions / repartition after read), raise throughput units, plan a topic with more partitions for future growth (Premium/Dedicated tiers allow it), and set maxOffsetsPerTrigger to drain the backlog in bounded batches', true, 'Parallelism at every stage, bounded catch-up.'],
        ['Restart the job repeatedly', false, 'No change.'],
        ['Drop old events to catch up', false, 'Data loss.'],
      ]],
    ], 'Throughput needs parallelism at the source, not only more cores.'),
  ] },
  connect: { scenarios: [
    scenario('Production database disk at 95%', `
      The DBA pages you: the warranty application\'s Postgres disk is at 95% and growing. Your Debezium connector has been failing for 5 days with an authentication error after a password rotation; nobody noticed because the connector status was not monitored.`, [
      ['What is filling the disk?', [
        ['WAL retained by the Debezium replication slot, which cannot advance while the connector is down', true, 'Slots keep WAL until consumed.'],
        ['Kafka logs', false, 'Kafka is on other machines.'],
        ['Delta tables', false, 'They are in cloud storage.'],
      ]],
      ['Immediate action, in order?', [
        ['Fix the connector credentials (from Key Vault) and restart so the slot advances; if the disk will fill first, coordinate with the DBA to drop the slot and plan a re-snapshot; then add alerts on slot lag and connector status', true, 'Protect production first, then data completeness.'],
        ['Delete WAL files manually', false, 'Can corrupt the database.'],
        ['Wait for the weekend', false, 'The database will stop.'],
      ]],
    ], 'CDC connectors are production dependencies of the source database.'),
  ] },
  delta: { scenarios: [
    scenario('VACUUM broke the streaming job', `
      To save storage, someone ran «VACUUM gold.engine_state RETAIN 0 HOURS» with the retention safety check disabled. A downstream streaming job reading «gold.engine_state» as a Delta source (it was 6 hours behind) now fails with FileNotFoundException.`, [
      ['Why?', [
        ['The stream needed files from versions it had not yet processed; VACUUM deleted files no longer referenced by the latest version, including ones those versions referenced', true, 'Retention must exceed the slowest reader\'s lag.'],
        ['The table is corrupt', false, 'The current version is fine.'],
        ['Delta sources cannot lag', false, 'They can; retention protects them.'],
      ]],
      ['How do you recover and prevent?', [
        ['Restart the stream from the current version (new checkpoint or startingVersion) and backfill the missed window from upstream silver; keep default 7-day retention, never disable the safety check, and restrict VACUUM permissions', true, 'Recover data, then guard the operation.'],
        ['RESTORE to an old version', false, 'Its files were deleted.'],
        ['Run OPTIMIZE', false, 'Unrelated.'],
      ]],
    ], 'VACUUM retention protects readers and recovery, not just time travel.'),
  ] },
  sparkmem: { scenarios: [
    scenario('Works in dev, dies in prod', `
      A PySpark job ends with «df.toPandas()» to build an Excel extract. In dev (1 week of data, 300 MB) it works. In prod (2 years, 140 GB) the driver dies after 25 minutes with no clear error, and the orchestrator retries it three times.`, [
      ['Diagnosis?', [
        ['Driver OOM: toPandas collects the whole result to the driver; retries repeat the same failure', true, 'A deterministic failure should not be retried blindly.'],
        ['Executor OOM', false, 'Executors finished their work.'],
        ['Excel limit', false, 'It never got that far.'],
      ]],
      ['Fix?', [
        ['Aggregate/filter to what the extract needs in Spark and write it with Spark (CSV/Parquet in a volume), or serve it through a SQL warehouse query; cap retries for non-transient failures', true, 'Keep big data in the engine.'],
        ['Give the driver 256 GB', false, 'Expensive and the Excel file would still be unusable.'],
        ['Use collect() instead', false, 'Same problem.'],
      ]],
    ], 'Collecting to the driver does not scale with data.'),
  ] },
  dataproduct: { scenarios: [
    scenario('Three answers to one question', `
      In a quarterly review, Quality, Finance and Service each present a different "warranty claim rate per 100 engines" for the same engine model: 4.2, 3.6 and 5.0. Each team built its own extract from different tables.`, [
      ['Root cause?', [
        ['No single governed definition: different numerators (submitted vs approved claims), denominators (engines built vs engines in service) and time bases', true, 'A semantic problem, not a technical one.'],
        ['One team made an arithmetic error', false, 'Each is "right" for its own definition.'],
        ['Data is corrupted', false, 'All three are internally consistent.'],
      ]],
      ['What do you propose as the data engineer?', [
        ['A certified claims data product with documented metric definitions (agreed with the three owners), implemented once in the semantic layer, with variants explicitly named if needed (approved vs submitted rate)', true, 'One definition, many consumers.'],
        ['Pick the middle value', false, 'Not a definition.'],
        ['Let each team keep its extract', false, 'The problem repeats every quarter.'],
      ]],
    ], 'Data products and semantic layers exist to end this meeting.'),
  ] },
  iotingest: { scenarios: [
    scenario('Engines from 1970', `
      After a firmware update on 3,000 engines, the silver telemetry table shows readings dated 1970-01-21, and the hourly fleet-health job reports those engines as "silent" for the current hour.`, [
      ['Likely cause?', [
        ['The firmware now sends epoch seconds (or ms) where milliseconds (or µs) were expected, a unit change; parsing as the wrong unit lands near 1970', true, 'Unit drift.'],
        ['Clocks reset to zero', false, 'Then dates would be 1970-01-01 exactly.'],
        ['Kafka reordered messages', false, 'Ordering does not change dates.'],
      ]],
      ['Robust handling?', [
        ['Validate timestamps against a plausible range (and against ingestion time), detect the unit by magnitude where safe, quarantine implausible values with a reason code, alert per firmware version, and agree the unit in the device data contract', true, 'Range checks plus contract.'],
        ['Use ingestion time for everything', false, 'Loses event-time correctness for buffered readings.'],
        ['Drop the engines from reports', false, 'Hides the problem.'],
      ]],
    ], 'Device data needs sanity checks on time itself.'),
  ] },
  cost: { scenarios: [
    scenario('A 9× cost jump on a quiet month', `
      The monthly Databricks bill jumped 9× though data volume was flat. System tables show one all-purpose cluster (64 workers, no auto-termination) running 24/7 since the 3rd, created for a one-off investigation, plus a streaming job with «trigger(processingTime="1 second")» that someone deployed for a dashboard refreshed hourly.`, [
      ['Which actions give the biggest savings with the least risk?', [
        ['Terminate the idle cluster and enforce auto-termination through cluster policies; change the stream to availableNow on an hourly schedule (or a longer trigger); tag and review top consumers monthly', true, 'Fix the two causes and the guardrail.'],
        ['Reduce storage tiers', false, 'Storage was not the cause.'],
        ['Move everything to a smaller node type', false, 'Does not address idle and over-frequent compute.'],
      ]],
    ], 'Cost incidents are mostly idle compute and mismatched latency.'),
  ] },
  contracts: { scenarios: [
    scenario('Rupees or paise?', `
      On Monday, «claim_amount» totals in gold jump 100×. The dealer portal team changed the API to send amounts in paise (integer) to avoid floating point issues. The JSON schema and types (number) did not change, so all schema checks passed.`, [
      ['Which control would have caught this before publication?', [
        ['A distribution/volume check on key measures (sum and median vs recent history) with a blocking threshold, plus units documented in the data contract', true, 'Semantic changes need semantic checks.'],
        ['Schema registry compatibility', false, 'The schema is the same.'],
        ['NOT NULL constraint', false, 'Values are not null.'],
      ]],
      ['Correct handling of the change itself?', [
        ['Agree a versioned contract change (new field amount_paise or a version flag), convert in silver based on version, backfill the affected days, and inform consumers', true, 'Make the unit explicit.'],
        ['Divide everything by 100 from now on', false, 'Breaks if some sources still send rupees.'],
        ['Reject the API change', false, 'The motivation was valid; manage it.'],
      ]],
    ], 'Types are not meaning.'),
  ] },
  sysdesign: { scenarios: [
    scenario('Design review: one minute alerts and five years of history', `
      You propose: devices → Event Hubs → Spark streaming → Delta bronze/silver/gold → Power BI. Reviewers ask for (a) overheating alerts to service managers within 60 seconds, (b) five years of raw telemetry for ML, (c) a Power BI fleet dashboard refreshed every 15 minutes, (d) costs kept low.`, [
      ['How do you meet (a) without making everything real-time?', [
        ['A dedicated low-latency stream path (continuous or short trigger) only for alert rules on validated readings, writing to an alerts table/notification service; everything else runs on minute-scale micro-batches or availableNow schedules', true, 'Pay for latency only where it is needed.'],
        ['Run all layers with 1-second triggers', false, 'Expensive and fragile.'],
        ['Power BI alerts on a 15-minute refresh', false, 'Misses the 60-second SLA.'],
      ]],
      ['How do you meet (b) cost-effectively?', [
        ['Raw bronze in Delta/Parquet partitioned by date with lifecycle tiering (hot recent months, cool/archive later with a rehydration plan), plus downsampled aggregates for long-range analysis', true, 'Tiered retention with aggregates.'],
        ['Keep everything in Event Hubs for five years', false, 'Not its purpose and expensive.'],
        ['Delete raw after 30 days', false, 'Violates the ML requirement.'],
      ]],
      ['How should Power BI read the data for (c)?', [
        ['From a small gold aggregate table via a Databricks SQL warehouse (import refresh every 15 minutes or DirectQuery on the aggregate), never on raw telemetry', true, 'Serve aggregates to BI.'],
        ['DirectQuery on bronze', false, 'Slow and costly.'],
        ['Export CSVs every 15 minutes', false, 'Fragile and ungoverned.'],
      ]],
    ], 'Separate latency tiers by requirement.'),
  ] },
  pyerrors: { scenarios: [
    scenario('Green job, missing plant', `
      A Python ingestion task loops over 30 plant folders and loads each plant\'s CSVs; inside the loop it has «try: load(p) except Exception: log.warning(...)». One morning the Pune plant\'s file is malformed; the task finishes green and the daily production dashboard silently lacks Pune.`, [
      ['Best change?', [
        ['Collect per-plant failures, write successful plants, then fail the task (or publish with explicit completeness metadata and an alert) if any expected plant is missing, and quarantine the malformed file with the error', true, 'Partial success must be visible.'],
        ['Remove the try/except so the first error stops all plants', false, 'One bad file then blocks 29 good ones; better to load what you can and fail visibly.'],
        ['Log at ERROR level instead of WARNING', false, 'Still green and still missing.'],
      ]],
    ], 'Decide partial-failure semantics explicitly.'),
  ] },
};
