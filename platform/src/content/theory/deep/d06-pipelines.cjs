const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('../_t.cjs');

module.exports = {
  fullincr: T(`
    ## Senior depth: incremental loads that stay correct for years
    - **The watermark must come from the source's commit order, not the wall clock.** «WHERE updated_at > last_max_updated_at» fails when: rows commit late with older timestamps (long transactions), clocks differ between app servers, «updated_at» is not updated by every code path (bulk fixes via SQL skip the trigger), or several rows share the max timestamp and some arrive after the extract. Defences: an **overlap window** (re-read the last N minutes, dedupe by key + version), «>=» with dedupe, or log-based CDC.
    - **Persist the watermark atomically with the data.** If data is written but the watermark update fails, the re-run re-reads (fine if idempotent). If the watermark is advanced but the write failed, data is **lost forever**. Store the watermark in the same transaction (Delta table properties, a control table written in the same commit, or derive it from the target: «SELECT MAX(source_ts) FROM target»).
    - **Deletes are invisible** to timestamp-based incremental loads. Options: soft-delete flags in the source, CDC, or periodic **full reconciliation of keys** (anti-join source keys vs target keys weekly) to detect hard deletes.
    - **Periodic full refresh** of an incremental table (monthly) catches drift and bugs, if the source still has the history.
    - **Cost model:** incremental reduces read volume but adds complexity (state, late data, deletes). For tables under a few GB that change heavily, a full reload with a swap is often simpler and cheaper overall.
    - **Backfill compatibility:** incremental logic must accept an explicit window («--from --to») so the same code handles daily runs and backfills.
  `, {
    hands: [
      py({ q: '**Incremental extract with overlap.** «rows» are source dicts with «id», «updated_at» (ISO strings) and «v». Write «incremental(rows, watermark, overlap_minutes, already_loaded)» that selects rows with «updated_at >= watermark − overlap», drops those already loaded (same «(id, updated_at)» in the set «already_loaded»), returns «(new_rows sorted by (updated_at, id), new_watermark)» where new_watermark is the max «updated_at» of the **selected** rows, or the old watermark if none.', starter: 'from datetime import datetime, timedelta\n\ndef incremental(rows, watermark, overlap_minutes, already_loaded):\n    pass\n',
        tests: `rows = [
 {'id': 1, 'updated_at': '2026-11-27T10:00:00', 'v': 'a'},
 {'id': 2, 'updated_at': '2026-11-27T09:58:00', 'v': 'late commit'},
 {'id': 3, 'updated_at': '2026-11-27T09:40:00', 'v': 'old'},
 {'id': 1, 'updated_at': '2026-11-27T10:05:00', 'v': 'a2'}]
loaded = {(1, '2026-11-27T10:00:00')}
new, wm = incremental(rows, '2026-11-27T10:00:00', 5, loaded)
assert [(r['id'], r['v']) for r in new] == [(2, 'late commit'), (1, 'a2')], new
assert wm == '2026-11-27T10:05:00'
assert incremental([], '2026-11-27T10:00:00', 5, set()) == ([], '2026-11-27T10:00:00')`,
        solution: `from datetime import datetime, timedelta

def incremental(rows, watermark, overlap_minutes, already_loaded):
    lo = (datetime.fromisoformat(watermark) - timedelta(minutes=overlap_minutes)).isoformat()
    sel = [r for r in rows if r['updated_at'] >= lo]
    new = sorted((r for r in sel if (r['id'], r['updated_at']) not in already_loaded),
                 key=lambda r: (r['updated_at'], r['id']))
    wm = max((r['updated_at'] for r in sel), default=watermark)
    return new, max(wm, watermark)` }),
    ],
  }),
  cdc: T(`
    ## Senior depth
    - **Snapshot + stream handoff** is where CDC loses or duplicates data: the initial snapshot must record the log position at which it is consistent, and streaming must start exactly there. Debezium and Databricks connectors handle it; hand-rolled CDC usually does not.
    - **Transactions:** a source transaction updating an order and its lines produces several events. Applying them in separate micro-batches can expose inconsistent intermediate states downstream. If consumers need transactional consistency, group by transaction id (Debezium provides transaction metadata) or accept eventual consistency and document it.
    - **Primary key changes** appear as delete + create; updates to the key column must not leave orphans.
    - **Schema changes** in the source flow into events; your apply step needs a policy (evolve nullable additions automatically, fail loudly on type changes/drops).
    - **Truncate** events exist in some connectors; decide what a truncate means downstream (usually: do not propagate blindly).
    - **Replay and reprocessing:** bronze keeps every change event, so silver can be rebuilt by replaying from the beginning with the same deterministic apply logic. That is your disaster recovery and your bug-fix path.
    - **Volume reality:** CDC volume = change rate, not table size; a nightly batch job that updates every row creates a CDC storm the size of the table.
  `),
  idempotency: T(`
    ## Senior depth
    - **Idempotency keys for external effects:** alerts, emails, API calls, Kafka publishes. Store "sent" records keyed by a deterministic id (engine_id + incident_start) and check before sending; or use the receiver's idempotency-key support.
    - **Idempotent producers in Kafka** («enable.idempotence=true», default in recent clients) prevent duplicates from producer retries within a session; they do not protect against your application re-sending after a restart. Application-level keys still matter.
    - **Spark + Delta:** batch overwrite with «replaceWhere» is idempotent for a partition; streaming to Delta is idempotent per batch id; **foreachBatch** is idempotent only if *you* make it so (MERGE by key, or «txnAppId»/«txnVersion»).
    - **"Exactly once" claims should be proven**: produce a known set with unique ids, inject duplicates, crash at different points, compare counts and distinct ids (Turbofan: 54,787 expected, 54,787 in silver, 0 duplicates, 0 missing).
    - **Idempotency vs determinism:** a job can be idempotent (re-run gives same final state) only if its inputs and logic are deterministic for the same logical date: pinned input snapshots, no «now()», deterministic ordering, deterministic keys.
  `),
  dedupe: T(`
    ## Senior depth
    - **Exact vs business duplicates:** exact copies (same event_id) vs two different records for the same real-world thing (same claim entered twice by a dealer with different IDs). The latter needs **matching rules** (same engine, same failure code, same day, similar amount) and often human review: entity resolution.
    - **Dedupe scope in streaming** is bounded by the watermark: a duplicate arriving after the watermark is not caught. Choose the watermark from producer retry behaviour, and add a batch-level dedupe/merge downstream as a safety net.
    - **Choose the survivor explicitly:** latest by source sequence; most complete record; highest-priority source. Write it as a deterministic ordering with tie-breakers.
    - **Dedupe at the right layer:** bronze keeps everything (evidence and replay); silver dedupes; never dedupe in a BI tool.
    - **Measure duplicates** as a metric over time (duplicate rate per source per day): a jump means a producer or connector changed behaviour.
    - **Cost at scale:** global dedupe over a growing table is a full shuffle each run. Scope it by time (dedupe within the date partition and a lookback), or MERGE insert-if-not-exists against a clustered target, or keep a compact "seen keys" table.
  `),
  recon: T(`
    ## Senior depth
    - **Reconcile at every boundary:** source → bronze (counts per extract window, control totals), bronze → silver (in = out + rejected + duplicates removed), silver → gold (sums of amounts by day/dealer match), gold → BI (dashboard total equals table total).
    - **Hash-based comparison** for wide tables: compute «sha2(concat_ws('|', cols…))» per key on both sides and compare hashes; then list mismatching keys and the columns that differ.
    - **Tolerances:** exact for counts and DECIMAL money; tolerance for floats and for sources that are still changing (compare as of the same snapshot time, or accept a small delta and re-check later).
    - **Timing:** source and target are rarely at the same point in time. Reconcile **closed periods** (yesterday) or compare against the source snapshot/LSN used by the load.
    - **Make results visible:** a reconciliation table (date, check, source_value, target_value, diff, status) feeding an alert and a dashboard, so failures are tracked and trends are visible.
    - **Finance-grade:** for money flows (claims → credit notes), reconcile to the general ledger totals; sign conventions, currencies and posting dates are where mismatches hide.
  `),
  schemaval: T(`
    ## Senior depth
    - **Validate structure, then semantics:** types and required fields (schema), then ranges, enumerations, referential checks, cross-field rules (closed_at ≥ opened_at), uniqueness.
    - **Permissive parsing modes** in Spark: «PERMISSIVE» (bad rows become NULL fields + «_corrupt_record»), «DROPMALFORMED» (silently drops: dangerous), «FAILFAST». In production: permissive + route corrupt records to quarantine with a reason + alert on rate.
    - **Schema-on-read surprises:** JSON inference samples data; a field that is an int in the sample and a string later becomes NULL or fails. Provide explicit schemas for production reads.
    - **Evolution policy as code:** additive nullable columns → accept and evolve; type change/drop/rename → block and alert. Delta enforcement + Auto Loader rescued data column implement this.
    - **Validation cost:** row-level checks are cheap; uniqueness and referential checks need shuffles/joins; run them on the batch (incremental) not the whole table.
  `),
  contracts: T(`
    ## Senior depth
    - **Contents of a real contract:** schema (names, types, nullability), **semantics** (units, currency, time zone, what NULL means, enumerations), keys and grain, freshness/latency SLO, volume expectations, quality rules, PII classification, owner and escalation, versioning/deprecation policy.
    - **Enforcement points:** producer CI (schema compatibility check, contract tests), at ingestion (validation + quarantine), at publish (dbt contracts: enforced column types/constraints on models).
    - **Breaking change process:** new version, dual-publish, consumer migration window, deprecation date. Same as API versioning.
    - **Tooling:** schema registries, JSON Schema/Avro/Protobuf, dbt model contracts, the Open Data Contract Standard (ODCS) YAML, data catalog entries.
    - **Contracts are social first:** they work only when producers accept accountability. A DE's lever: make violations visible (quarantine counts per producer, dashboards) and cheap to fix.
  `),
  dqdims: T(`
    ## Senior depth
    - **Anomaly-based checks** complement fixed rules: volume vs the same weekday last 4 weeks, distribution shifts (mean/percentiles of claim_amount), null-rate drift, new categorical values. Fixed thresholds miss gradual drift; anomaly checks catch the unknown unknowns.
    - **Quality SLIs per table:** % rows passing each rule, freshness lag, completeness of critical columns. Publish them with the dataset (data product).
    - **Blocking vs warning:** block publication (circuit breaker) on checks whose failure makes the output wrong (duplicate keys in a fact, totals not reconciling); warn on checks that degrade but do not invalidate (a few NULL optional attributes).
    - **Data quality is a cost decision:** checks cost compute; prioritise critical data elements (those feeding finance, safety, regulatory reports).
    - **Root cause over symptoms:** a quality failure should lead to a fix at the source or the earliest layer, plus a test that would have caught it.
  `),
  errors: T(`
    ## Senior depth
    - **Partial failure semantics:** if 3 of 50 files fail, do you publish 47? Decide per pipeline: all-or-nothing (finance), or publish with completeness metadata and backfill later (telemetry). Make the decision explicit and visible to consumers.
    - **Poison records** that crash a task on every retry (a malformed value that throws in a UDF) stop a streaming job forever. Validate before risky code, catch per record, route to quarantine.
    - **Error budgets:** a tolerated reject rate (e.g. < 0.1% quarantined); exceeding it fails the run, because a sudden 30% reject rate means the source changed, not that 30% of records are bad.
    - **Error metadata:** keep the raw record, the reason code, the pipeline version, the batch id and timestamp: enough to replay after a fix.
  `),
  retries: T(`
    ## Senior depth
    - **Retry budget at the platform level:** limit total retries per time window so a systemic outage does not turn into a retry storm against a recovering service.
    - **Circuit breaker:** after N consecutive failures, stop calling for a cool-down period and fail fast; probe occasionally.
    - **Idempotency is the prerequisite:** never add retries to a non-idempotent step without making it idempotent first.
    - **Task-level retries in Airflow/Databricks** re-run the whole task: make sure the task is resumable (checkpoints) or cheap, otherwise a failure at 95% repeats the first 95%.
    - **Timeouts** are part of retry policy: a hung call without a timeout never fails, so it never retries. Every external call needs a timeout.
  `),
  dlq: T(`
    ## Senior depth
    - **A DLQ without an owner is a data leak**: records go in, nobody looks, the business loses data silently. Alert on DLQ inflow rate, report it per producer, and define a triage SLA.
    - **Replay path:** after fixing the parser or the producer, replay DLQ records through the **same** pipeline (with their original event time) and verify they land once (idempotent keys).
    - **Reason codes** (MALFORMED_JSON, MISSING_FIELD, OUT_OF_RANGE, UNKNOWN_DEALER) make triage and dashboards possible; free-text exceptions do not aggregate.
    - **Retryable vs non-retryable:** transient failures go to a **retry topic** with delay (or are retried in place); only permanently bad records go to the DLQ. Mixing them floods the DLQ during outages.
    - **Ordering:** sending one record of a key to a DLQ while later records of the same key proceed can apply changes out of order (CDC). For ordered streams, either park the whole key or design the apply to tolerate gaps (version checks).
    - **Privacy:** DLQs contain raw payloads, often with PII; apply the same retention and access controls as the main data.
  `),
  deps: T(`
    ## Senior depth
    - **Data-aware scheduling:** Airflow Datasets/Assets, Databricks table-update triggers and file-arrival triggers start downstream work when upstream data is actually published, not at a guessed time.
    - **Cross-DAG/cross-team dependencies** are the fragile part: sensors that poll forever, implicit dependencies on another team's table. Make them explicit (dataset events, contracts with freshness SLOs) and set sensor timeouts with alerts.
    - **Publication semantics:** downstream must never read a half-written upstream. Use atomic table commits (Delta) and a "published" marker or a version that downstream reads.
    - **Dependency on "all partitions":** a daily gold job needing all 30 plants' files should know which ones are missing and decide: wait, publish partial with metadata, or fail.
  `),
  orch: T(`
    ## Senior depth
    - **Orchestrator ≠ compute:** an Airflow worker running pandas over 20 GB is an anti-pattern. Tasks trigger Spark/Databricks/dbt/warehouse work and wait.
    - **Choosing:** Airflow (most common, Python DAGs, huge provider ecosystem), Databricks Workflows (native for Databricks-only stacks, cheaper to run, good repair-runs), Azure Data Factory (low-code copy/integration, many connectors, common in Azure enterprises like Cummins), Dagster (asset-oriented, strong typing and lineage), Prefect.
    - **What makes orchestration production-grade:** idempotent tasks, parameterised by logical date; retries with backoff; SLAs/timeouts; alerting; backfill support; concurrency limits (pools) to protect sources; secrets via backends; CI tests that DAGs import and have no cycles.
    - **Event-driven vs scheduled:** schedules are simple and predictable; events (file arrival, table updated) reduce latency and wasted runs. Many platforms mix: event-triggered with a scheduled safety run.
  `),
  airflow: T(`
    ## Senior depth
    - **Top-level code runs on every DAG parse** (every few seconds by the scheduler): no DB queries, API calls or heavy imports at module level. Slow parsing delays every DAG.
    - **XCom is for small metadata** (paths, counts, ids), not data. Large XComs bloat the metadata DB (or use a custom object-storage backend).
    - **catchup, start_date and backfills:** a new DAG with a past start_date and catchup=True schedules every missed interval at once. Set catchup deliberately; use «max_active_runs» to limit concurrency.
    - **Pools and priority** protect shared resources (a source DB that tolerates 4 concurrent extracts).
    - **Sensors:** use deferrable operators/reschedule mode so a waiting sensor does not occupy a worker slot for hours.
    - **Idempotent tasks keyed on «data_interval_start/end»**, never on «datetime.now()».
    - **Airflow 3** (3.0 in April 2025; the 3.x line has moved on to 3.1+ with human-in-the-loop tasks, and later minor releases through 2026) changes worth knowing: DAG versioning, assets (renamed from datasets), the task execution API (tasks no longer talk to the metadata DB directly), a new UI, and «logical_date» semantics for manually triggered runs.
    - **Executors:** Local, Celery (worker pool), Kubernetes (pod per task: isolation, slower start). Managed: Astronomer, MWAA, Cloud Composer, and Azure Data Factory's managed Airflow.
  `, {
    interview: [
      talk('Your Airflow DAG for 2026-11-26 ran on 2026-11-27 and loaded the wrong day. What happened?', `
        - Airflow runs a scheduled DAG **after** its data interval ends: the run with logical date 2026-11-26 covers 26 Nov 00:00 → 27 Nov 00:00 and starts on 27 Nov.
        - If the code used «datetime.now()» or «date.today()», it loaded 27 Nov (partial) data instead of 26 Nov. Use «{{ data_interval_start }}» / «{{ ds }}» templated into the task.
        - Fix the code, then **re-run (clear) the affected runs**; because tasks are idempotent by logical date, the re-run overwrites the bad partitions.
        - Add a test that the task's query window comes from the context, and a data test that the loaded date matches the run's interval.`),
    ],
  }),
  dbt: T(`
    ## Senior depth
    - **Materialisations:** view (no storage, compute on read), table (rebuilt each run), **incremental** (merge/append/insert_overwrite strategies with «is_incremental()» filters), ephemeral (inlined CTE), snapshot (SCD2 tracking with check/timestamp strategy), materialized views on supporting adapters.
    - **Incremental pitfalls:** filters based on «max(updated_at) in this table» miss late rows (use a lookback); «unique_key» must truly be unique or MERGE fails/duplicates; schema changes need «on_schema_change»; **full-refresh** must remain possible.
    - **Testing:** generic tests (unique, not_null, accepted_values, relationships), singular tests (custom SQL returning failing rows), unit tests (dbt 1.8+: mock inputs, expected outputs for a model's logic), **model contracts** (enforced types/constraints), source freshness checks.
    - **Slim CI:** «dbt build --select state:modified+ --defer --state prod-artifacts» builds only changed models and their children, reading unchanged parents from prod.
    - **Project structure:** staging (1:1 with sources, rename/cast), intermediate (business logic), marts (facts/dims per domain); «ref()» builds the DAG and lineage; exposures document dashboards.
    - **dbt on Databricks:** runs SQL on a SQL warehouse; incremental merge on Delta; Unity Catalog three-level names. Python models run on clusters.
  `),
  backfill: T(`
    ## Senior depth
    - **Blast radius:** a backfill rewrites history that dashboards, ML models and finance reports already used. Announce it, version it, and keep the old version (time travel) for comparison.
    - **Throughput vs protection:** backfilling 2 years in parallel can overwhelm sources, the cluster budget and downstream incremental jobs (CDF consumers see 2 years of "changes"). Throttle (max active runs), run in chronological chunks, pause or coordinate downstream.
    - **Validate a sample first:** run one day, diff against the current output, explain every difference, then scale.
    - **Code version:** backfill with the fixed code but the same semantics for unaffected columns; record which code version produced each partition (a column or table property).
    - **Streaming backfills:** a new checkpoint replaying from Kafka only works within Kafka retention; beyond that, backfill from bronze in batch mode and then switch the stream over at a known offset/time.
  `),
  late: T(`
    ## Senior depth
    - **Restatement windows:** decide how far back late data can change published numbers (e.g. the last 7 days are provisional, older periods are closed). Dashboards should show which periods are provisional.
    - **Incremental models with lookback:** every run reprocesses the last N days (partition overwrite) so late rows are absorbed; N from the measured lateness distribution.
    - **Late beyond the window:** route to a "late arrivals" table, report the volume, and include it in periodic restatement runs (monthly) if the business needs it.
    - **Dimension late arrival** (a claim references a dealer not yet in the dimension): insert an **inferred member** (dealer key with placeholder attributes), update it when the dealer arrives (type 1 on the inferred row), so facts are never dropped.
    - **Event time vs processing time partitions:** partitioning facts by event date means late rows touch old partitions (more rewrites); partitioning by ingestion date makes writes cheap but queries by event date must scan more. Many lakehouses partition bronze by ingestion date and silver/gold by event date.
  `),
  observ: T(`
    ## Senior depth
    - **Pipeline vs data observability:** "the job succeeded" (pipeline) says nothing about whether the data is right (data). Monitor both: run status/duration and freshness, volume, schema, distribution, lineage.
    - **What to emit from every run:** rows read/written/rejected per stage, duration per stage, watermark/offset positions, data freshness (max event time loaded), quality check results. Store them in a metrics table; that table is the source for dashboards and alerts.
    - **Alert design:** alert on symptoms users feel (freshness SLO breach, failed quality gate), route to an owner, include a runbook link and context (which table, which run, what changed). Page only for urgent; ticket the rest. Every noisy alert erodes trust.
    - **Platform tools:** Databricks system tables + Lakehouse Monitoring, Lakeflow Declarative Pipelines (DLT) expectation metrics, Azure Monitor/Log Analytics, Monte Carlo/Bigeye-style anomaly detection, OpenLineage for lineage events.
  `),
  lineage: T(`
    ## Senior depth
    - **Column-level lineage** answers "which reports break if I change this column?" and "where does this PII field flow?". Unity Catalog captures it automatically for queries on UC tables; OpenLineage integrates Airflow/Spark/dbt; Purview scans Azure sources.
    - **Gaps:** lineage breaks at boundaries tools cannot see: Python code that reads files by path, API extracts, exports to Excel, BI tools without connectors. Register them manually or via OpenLineage emitters.
    - **Uses:** impact analysis before changes, root cause analysis (walk upstream from a broken metric), compliance (prove where personal data goes), cost attribution, deprecating unused tables (no downstream readers in 90 days).
    - **Lineage + quality = blast radius:** when a source fails a check, lineage tells you which downstream products to mark as degraded.
  `),
  sla: T(`
    ## Senior depth
    - **SLA vs SLO vs SLI:** SLI is the measurement (minutes since last successful load), SLO is the internal target (fresh within 2 h, 99% of days), SLA is the external commitment with consequences. Set SLOs tighter than SLAs.
    - **Error budgets:** 99% freshness over 30 days allows ~7 hours of staleness; spend it on deploys and maintenance, stop risky changes when it is exhausted.
    - **Upstream dependencies cap your SLA:** you cannot promise data by 06:00 if the source extract lands at 05:50 on bad days. Measure upstream arrival distributions first.
    - **Per-consumer SLAs:** finance month-end close needs correctness and completeness more than speed; a fleet alert stream needs latency. One pipeline can serve both only if the SLOs are explicit.
  `),
  reliab: T(`
    ## Senior depth
    - **Design for recovery, not just prevention:** keep raw immutable bronze (replayable), time travel on curated tables, idempotent jobs, documented runbooks, tested restores. Mean time to recovery matters more than mean time between failures.
    - **RPO/RTO for data platforms:** RPO = how much data you can lose (bronze replicated across regions/zones: near zero), RTO = how fast you serve again. Delta deep clones or storage geo-replication for DR; metastore/catalog backups too.
    - **Chaos testing:** kill jobs mid-run, inject bad records, duplicate and delay messages, and verify invariants. Turbofan's demo does exactly this; it is a strong interview story.
    - **Change is the biggest risk:** most incidents follow deploys or upstream changes. CI tests, data diffs on PRs, canary runs on a subset, and easy rollback.
    - **Post-incident reviews** (blameless): timeline, root cause, contributing factors, action items with owners, and a test so it cannot recur silently.
  `),
};
