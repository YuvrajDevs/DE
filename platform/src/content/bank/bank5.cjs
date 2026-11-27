// Hardest interview questions for a Data Engineer 1 loop, across the whole posting.
// Each answer is a model structure to speak from, not a script.
const { talk } = require('../_h.cjs');

module.exports = {
  sql: [
    talk('A dashboard query on a 2-billion-row fact table takes 4 minutes. Walk me through how you would make it fast, in order.', `
      1. **Measure:** get the query plan (EXPLAIN / query profile). Which step dominates: scan, join, aggregation, spill?
      2. **Read less:** is it scanning the whole table? Filter on the partition/cluster column (date), avoid functions on filter columns («WHERE submitted_at >= … AND < …» not «DATE(submitted_at) = …»), select only needed columns.
      3. **Join smarter:** are dimension joins fanning out (duplicate keys)? Is a small dimension broadcast? Is the join on the right keys and types (no implicit casts)?
      4. **Aggregate earlier:** pre-aggregate the fact to the needed grain before joining.
      5. **Materialise:** a daily aggregate table or materialised view for the dashboard's grain; incremental refresh.
      6. **Layout:** clustering/Z-order on common filters; compaction of small files; up-to-date statistics.
      7. **Compute:** only then consider warehouse size or workload isolation; check concurrency and caching.
      Close: "I'd verify each change with the profile and keep the dashboard on a certified aggregate table."`),
    talk('Explain the difference between ROWS and RANGE window frames, and when a running total gives a surprising answer.', `
      - A window frame defines which rows around the current row are used.
      - **ROWS** counts physical rows: «ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW» includes exactly the rows up to this one.
      - **RANGE** uses values of the ORDER BY column: all rows with the same ORDER BY value as the current row are **peers** and are included together.
      - The default frame when you write ORDER BY without a frame is «RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW». So a running total by date, with several rows on the same date, jumps by the whole day's total on the first of those rows: every row of that date shows the same running total.
      - Fix: specify «ROWS» and a deterministic tie-breaker in ORDER BY when you want row-by-row accumulation; use RANGE intentionally for "per date" cumulative values or time-based frames («RANGE BETWEEN INTERVAL 7 DAYS PRECEDING AND CURRENT ROW» where supported).`),
    talk('How would you find duplicate records in a 500-million-row table, keep the right one, and stop duplicates coming back?', `
      - **Define duplicate:** the business key (and whether different versions of the same key are duplicates or history).
      - **Find:** «GROUP BY key HAVING COUNT(*) > 1» to size the problem; inspect examples to learn where they come from (re-runs, overlapping loads, source duplicates).
      - **Keep the right one:** «ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC, ingested_at DESC, unique_id DESC)» and keep rn = 1. Deterministic tie-breakers.
      - **Fix the table safely:** build a deduplicated version (CTAS / overwrite), validate counts and totals, then swap; or MERGE-delete duplicates in a transactional table format. Keep a backup/time-travel point.
      - **Stop recurrence:** make loads idempotent (MERGE on the key or partition overwrite), add a uniqueness test that fails the pipeline, monitor "duplicates removed" as a metric, fix the upstream cause.`),
  ],
  python: [
    talk('You must process a 60 GB CSV file in Python on a machine with 16 GB RAM. How?', `
      - **Do not load it all:** stream it. Iterate line by line with the csv module, or read in chunks (pandas «chunksize», Polars/DuckDB streaming/lazy scans, PyArrow dataset readers).
      - **Generators** to keep memory flat: «for row in reader: yield transform(row)».
      - **Aggregate incrementally:** keep only running aggregates (dicts of sums/counts) rather than all rows.
      - **Write incrementally:** append batches to Parquet files (row groups) instead of building a giant list.
      - **Better tools:** DuckDB can query the CSV directly with out-of-core execution; converting once to Parquet makes later work far faster.
      - **Robustness:** explicit schema and encoding, bad-row handling (quarantine with line numbers), progress logging, checkpointing (resume from byte offset/line).
      - If it must run repeatedly or grows further, move to Spark.`),
    talk('How do you structure Python pipeline code so it is testable and production-ready?', `
      - **Separate I/O from logic:** pure functions for transformations (input data → output data), thin adapters for reading/writing.
      - **Configuration** via files/env per environment; secrets from a vault; no hard-coded paths.
      - **Typed, small functions** with docstrings; dataclasses or schemas for records.
      - **Error handling:** specific exceptions, retries with backoff only for transient errors, never bare «except: pass».
      - **Logging:** structured logs with run IDs, counts in/out, durations.
      - **Idempotent writes** and parameterisation by logical date.
      - **Tests:** pytest unit tests with edge-case fixtures (empty, duplicates, NULLs, late data); integration test on a sample; CI runs lint + tests on every PR.
      - **Packaging:** project structure, pinned dependencies, virtual environments/containers.`),
  ],
  spark: [
    talk('Walk me through exactly what happens when you run «spark.read.parquet(p).groupBy("dealer_id").agg(F.sum("amount")).write.saveAsTable("t")» on 1 TB.', `
      - **Driver:** builds a logical plan; nothing runs until «saveAsTable» (action).
      - **Catalyst:** resolves columns, prunes to «dealer_id» and «amount» (column pruning), plans a HashAggregate with partial + final aggregation; AQE enabled.
      - **Stage 1:** ~8,000 tasks (1 TB ÷ 128 MB splits) read Parquet row groups (only 2 columns), compute **partial sums per dealer per task**, write shuffle files partitioned by hash(dealer_id).
      - **Shuffle:** stage boundary; each reduce task fetches its partition from all map outputs. AQE looks at real sizes and coalesces the 200 shuffle partitions into fewer if small (dealers are few), or splits skewed ones.
      - **Stage 2:** final aggregation per dealer; write output files via the commit protocol; the table format commits atomically; catalog updated.
      - **Failures:** failed tasks retried; lost shuffle output recomputed from lineage.
      - **What I would check:** spill, skew (one huge dealer), number of output files (coalesce if tiny), and that only 2 columns were read (ReadSchema in the plan).`),
    talk('Your Spark job fails with executor OutOfMemory errors. How do you diagnose and fix it?', `
      - **Find the stage** in the Spark UI; look at task input/shuffle sizes: one huge task = **skew**; all tasks large = **too few partitions** or huge rows.
      - **Check the operation:** wide joins with fan-out (duplicate keys multiplying rows), «collect_list» on big groups, window functions over huge partitions, exploding arrays, caching too much, Python UDFs (memory overhead outside the JVM).
      - **Fixes by cause:**
        - Skew → AQE skew join, salting, broadcast the small side, filter NULL/placeholder keys.
        - Too few partitions → increase shuffle partitions/let AQE split; repartition before heavy operations.
        - Fan-out → deduplicate keys before joining; pre-aggregate.
        - Memory overhead (PySpark) → raise «spark.executor.memoryOverhead», replace UDFs with built-ins or pandas UDFs.
        - Caching → unpersist unused DataFrames; do not cache huge data.
        - Executor sizing → fewer cores per executor (more memory per task) or larger instances.
      - **Verify** with the UI that spill and max task sizes dropped; never just "double the memory" without knowing why.`),
    talk('Delta table queries became slow and storage grew a lot over three months of streaming writes. What happened and what do you do?', `
      - **Small files:** each micro-batch writes small files; thousands per day make planning and reading slow.
      - **Old versions:** every MERGE/overwrite keeps old files for time travel; without VACUUM, storage grows.
      - **Poor layout:** data not clustered by common filters, so file statistics do not skip much.
      - **Fixes:** OPTIMIZE (compaction) on a schedule or auto-compaction/optimized writes; liquid clustering or Z-ORDER on the main filter columns (engine_id, date); VACUUM with an agreed retention (e.g. 7 days, longer if time travel/streams need it); increase trigger interval if latency allows; partition only by date (not high-cardinality columns).
      - **Prevent:** table maintenance job with monitoring of file counts, average file size, table size and version count.`),
  ],
  streaming: [
    talk('Kafka → Spark → Delta is "exactly-once". Name three ways a real team still ends up with duplicates or lost data.', `
      1. **Duplicates in the source:** the producer re-sends the same business event after a crash (new offset, same event): exactly-once processing keeps both. Fix: dedupe by event ID within a watermark, or MERGE on event ID.
      2. **Non-idempotent side effects:** foreachBatch that appends to a JDBC table or sends alerts: replayed batches repeat them. Fix: MERGE/upsert keyed by batchId or event ID; idempotency keys for alerts.
      3. **Checkpoint mistakes:** deleting/relocating the checkpoint (reprocess from earliest → duplicates, or from latest → loss); two queries sharing one checkpoint; incompatible query changes.
      4. **Retention gaps:** the job is down longer than Kafka retention → offsets out of range → data loss.
      5. **Watermarks dropping late data** silently.
      Show you monitor: lag, dropped-late counts, duplicates removed, reconciliation counts vs producer.`),
    talk('Engines can send data up to 3 days late. You need hourly averages per engine that are correct. Design it.', `
      - **Two needs:** fast provisional numbers and correct final numbers.
      - **Streaming path:** event-time hourly windows with a watermark sized for most lateness (e.g. 2 hours), output to a provisional table; late events beyond it go to a late-data table (or bronze only).
      - **Batch correction:** a scheduled job recomputes the last 3-4 days of hourly aggregates from silver (which includes all late events) and **overwrites those partitions** idempotently; downstream gold/dashboards read the corrected table.
      - Alternatively, write raw events to Delta and compute aggregates with incremental batch (availableNow) using a 3-day lookback.
      - **Mark provisional vs final** (e.g. a «is_final» flag once older than 3 days).
      - **Measure lateness** continuously to tune the watermark/lookback; alert when late volume spikes (connectivity incidents).
      - Avoid a 3-day watermark in streaming state: memory and latency cost.`),
  ],
  pipelines: [
    talk('Design incremental ingestion from a REST API with 2 million records, rate limits, pagination and no delete feed.', `
      - **Initial load:** paginate with cursors (not offsets) at a polite rate; checkpoint the cursor so it can resume; land raw pages to bronze with metadata.
      - **Incremental:** query by «updated_since = watermark − overlap», cursor pagination ordered by (updated_at, id); store the new watermark (max updated_at read) **after** the data is durably written.
      - **Rate limits:** token bucket on the client; respect 429 and Retry-After; exponential backoff with jitter; limit concurrency (Airflow pool).
      - **Apply:** dedupe by id within the batch; MERGE into silver.
      - **Deletes:** none in the feed → periodic full key scan (e.g. weekly, cheap ID-only endpoint if available) and anti-join to mark deleted rows, or ask the provider for soft-delete flags/webhooks.
      - **Validation:** schema checks; detect "200 OK with error body"; quarantine bad records.
      - **Monitoring:** records per run, pages, retries, freshness, reconciliation counts against the API's total count.`),
    talk('You must backfill two years of history into a table that is in production and read by dashboards. How do you do it without breaking anything?', `
      - **Plan:** scope, reason, downstream consumers (lineage), expected volume/cost; communicate the window and that historical numbers will change.
      - **Isolate:** build the backfilled table **side by side** (new table or shadow location) instead of rewriting the live one in place.
      - **Run safely:** chunk by month, throttled (max active runs, pools), reading from retained bronze (not hammering the source), idempotent per chunk so failures resume.
      - **Validate:** counts/sums per month against source and old table; explain differences; spot-check known cases; run data tests.
      - **Switch atomically:** swap views/tables (or Delta RESTORE/replace in one commit) during a quiet window; keep the old version for rollback.
      - **Rebuild dependents** (gold aggregates) for the affected period; refresh semantic models; announce completion.`),
    talk('A pipeline you own failed at 03:00. The business needs the data by 07:00. Walk me through your next four hours.', `
      - **03:00-03:15 Triage:** read the alert context and logs; classify: transient (retry), data (bad input), code/config, infrastructure, upstream late.
      - **Contain:** make sure nothing half-written was published; if it was, roll back (time travel) or mark data stale.
      - **Quick path:** transient → re-run the failed step (idempotent); upstream late → wait/notify with an ETA; bad records → quarantine and continue if the rejection rate is acceptable and agreed.
      - **Communicate early:** tell consumers by 06:00 if the 07:00 SLA is at risk, with expected time; show "data as of" on dashboards.
      - **Fix forward** if it is a code bug with a safe small fix; otherwise run the last good version.
      - **After:** reconcile outputs; write the post-mortem (timeline, root cause, actions: tests, alerts, runbook updates).`),
  ],
  modelling: [
    talk('Model engine telemetry, service visits and warranty claims so reliability engineers can analyse failures by model, plant and age.', `
      - **Questions first:** failure rates (failures per engine-month of exposure) by engine model, plant, build month, age band, part; time to failure; telemetry before failures.
      - **Facts:**
        - «fact_claim» (one row per claim; amounts, status, dates, failure code).
        - «fact_service_visit» (one row per visit/repair order).
        - «fact_engine_day» (periodic snapshot: one row per engine per day with running hours, aggregated telemetry, fault counts): gives **exposure** and pre-failure behaviour.
      - **Dimensions:** dim_engine (model, plant, build date, configuration; SCD2 for configuration changes), dim_customer, dim_dealer (SCD2 region), dim_part, dim_failure_code, dim_date.
      - **Conformed keys** across all facts (engine_key, date_key) for drill-across.
      - **Derived metrics:** failure rate = failures / engine-days in service (defined once in the semantic model); age at failure from build date.
      - **Physical:** facts partitioned by date, clustered by engine; telemetry raw kept separately; aggregates per month for dashboards.
      - **Tests:** grain uniqueness per fact, FK resolution, exposure ≥ failures.`),
    talk('A dimension change arrives late: a dealer\'s region change effective last month only reached you today. Facts are already loaded. What do you do?', `
      - **Clarify the business rule:** must historical reporting reflect the change as of its effective date (true "as-was"), or is "as of when we learned it" acceptable?
      - **If effective-dated history is required:**
        - Split the SCD2 versions: close the old version at the effective date − 1, insert the new version from the effective date, and adjust any later versions' ranges.
        - **Re-key affected facts** (those between the effective date and today) to the new surrogate key: a targeted MERGE on the fact table for that dealer and date range.
        - Rebuild affected aggregates; communicate changed numbers.
      - **If not:** apply the change from today (normal SCD2) and document it.
      - **Prevent:** contracts requiring timely change events; use CDC with effective dates; a reprocessing procedure for late dimension changes; tests for overlapping/gapped ranges.`),
  ],
  quality: [
    talk('How do you know the data your pipeline produced today is correct? Be specific.', `
      - **Before processing:** schema/contract validation; file completeness (manifests, counts); freshness of inputs.
      - **During:** quarantine invalid rows with reasons; count rows in/out per step; dedupe metrics.
      - **After (gate before publishing):** uniqueness of the grain key; NOT NULL on keys; referential integrity to dimensions; business rules (approved ≤ claimed, amounts ≥ 0); **reconciliation** of counts and sums against the source for the same cut-off; volume and distribution checks against history.
      - **Publish only if blockers pass** (write-audit-publish); otherwise keep yesterday's data with a visible "as of".
      - **Continuously:** freshness and anomaly monitors; trend of quality results; periodic sample audits against source documents for accuracy.
      - **Evidence:** results stored and shown in the catalog; owners alerted.`),
  ],
  bigdata: [
    talk('Explain how you would do a join of two large datasets in MapReduce, then how Spark does it differently.', `
      - **MapReduce reduce-side join:** mappers read both datasets and emit (join_key, (tag, record)) where tag says which table it came from. Shuffle groups by key. Each reducer receives all records for a key from both tables and combines them (buffering the smaller side per key). Output written to HDFS. Expensive: everything shuffled and written to disk.
      - **Map-side (replicated) join:** if one dataset is small, distribute it to every mapper (distributed cache) and join in the map phase: no shuffle.
      - **Spark:** the same two ideas become **sort-merge join** (shuffle both sides by key, sort, merge) and **broadcast hash join** (send the small side to all executors). Differences: Spark plans the whole query, keeps data in memory between stages, chooses strategies automatically (and adapts with AQE: can switch to broadcast or split skewed partitions at runtime), and you write one line of DataFrame code.`),
    talk('Design an HBase (or Cassandra) table for "latest 100 readings per engine" and "all readings for an engine in a time range". Explain the key and the pitfalls.', `
      - **Access patterns** decide the key: per engine, by time, newest first.
      - **HBase:** row key «salt(engine_id) | engine_id | (Long.MAX − ts)» → rows for an engine are contiguous, newest first (reverse timestamp), range scans for time windows; salt prefix spreads engines across regions to avoid hotspots; column family «m» with signal qualifiers; TTL for retention.
      - **Cassandra:** «PRIMARY KEY ((engine_id, day), ts) WITH CLUSTERING ORDER BY (ts DESC)»; "latest 100" = query today's partition (and yesterday's if needed) with LIMIT 100; TTL for retention.
      - **Pitfalls:** time-first keys → write hotspots; unbounded partitions/rows per engine → add a time bucket; many deletes → tombstones; scanning for analytics → use the lakehouse copy instead.`),
  ],
  cloud: [
    talk('Move 50 TB from an on-prem Hadoop cluster to Azure and keep it in sync until cut-over. How?', `
      - **Estimate:** 50 TB over 1 Gbps ≈ 5 days at full speed; check available bandwidth and business-hours limits. If too slow, use **Azure Data Box** for the bulk and online sync for deltas.
      - **Bulk copy:** DistCp (HDFS → ADLS Gen2 via the ABFS connector) or ADF with a self-hosted IR, parallelised, throttled, over ExpressRoute/VPN; checksums and file counts per directory.
      - **Tables:** convert Hive tables to Delta (CONVERT TO DELTA or rewrite), migrate metastore definitions to Unity Catalog, preserve partitioning.
      - **Delta sync:** repeated incremental copies of new/changed partitions (by modification time/manifest) until cut-over; freeze writes briefly for the final sync.
      - **Validation:** row counts/sums per table/partition, sample comparisons, parallel runs of key jobs.
      - **Security:** map Ranger/Kerberos permissions to Entra ID groups and catalog grants; encryption; private endpoints.
      - **Cut-over and rollback plan**, then decommission.`),
    talk('Your team\'s Azure Databricks cost doubled this month. Investigate and fix it.', `
      - **Attribute:** usage by workspace, cluster, job and tag (system billing tables); compare with last month; find the top jobs/clusters by DBUs.
      - **Common causes:** all-purpose clusters left running; jobs moved from job clusters to all-purpose; autoscaling max raised; a new job doing full rebuilds; streaming jobs running 24/7 unnecessarily; data growth with non-incremental logic; inefficient queries (no pruning); small files making jobs slower.
      - **Fixes:** job clusters + auto-termination; cluster policies (max size, mandatory tags, spot workers); incremental processing; availableNow triggers for non-urgent streams; OPTIMIZE/clustering; right-sizing from metrics; budget alerts.
      - **Prove it:** cost per job before/after; dashboard and monthly review; ownership per tag.`),
  ],
  governance: [
    talk('A customer asks to be deleted. Their data is in bronze JSON, silver Delta tables, a gold extract, Kafka topics and a data scientist\'s training set. What do you do?', `
      - **Find:** catalog PII tags + lineage from the source entity to every downstream asset; include Kafka topics, files, ML training sets and exports.
      - **Delete/anonymise per store:**
        - Delta tables: DELETE by customer key, then VACUUM after the agreed retention so old versions are physically removed; check Change Data Feed and clones.
        - Bronze files: rewrite affected files without the records (or, if designed with pseudonymisation, delete the mapping entry).
        - Kafka: compacted topics → tombstone the key; delete-policy topics expire with retention (document).
        - Training sets/extracts: delete or regenerate; models trained on the data handled per policy.
        - Backups: per retention policy, with suppression on restore.
      - **Prevent reintroduction:** source deletion or a suppression list applied in ingestion.
      - **Evidence:** log actions and completion for audit.
      - **Design going forward:** pseudonymise PII early, isolate PII columns, minimise copies.`),
    talk('How would you turn a messy set of supply-chain tables into a certified, reusable data product?', `
      - **Consumers and decisions:** e.g. supplier on-time delivery and lead-time analytics for procurement, plus inputs to demand planning.
      - **Owner and steward** from supply chain; engineering team as custodian.
      - **Contract:** grain (one row per purchase order line), definitions (on-time = received ≤ expected date; lead time = received − order date), keys, SLA (daily by 06:00), change policy.
      - **Build:** contracts with ERP sources; bronze → silver (deduped, conformed supplier/part keys, SCD2 suppliers) → gold facts and aggregates; idempotent MERGE.
      - **Quality:** tests (uniqueness, FK, received ≥ ordered dates, quantities > 0), reconciliation with ERP, freshness monitors.
      - **Discoverability:** catalog entry with docs, glossary links, tags, lineage, example queries.
      - **Access:** internal groups; supplier-specific shares filtered to their own data.
      - **Certification:** owner sign-off with evidence; deprecate duplicate tables; track adoption.`),
  ],
  ai: [
    talk('Design a RAG assistant over engine service manuals and past repair notes for technicians. Focus on the data side.', `
      - **Sources:** manuals (PDF), service bulletins, repair-note free text (from CRM/service system), part catalogues; owners and update frequency for each.
      - **Ingestion:** extract text (OCR for scans; keep tables), clean boilerplate, split by document structure into chunks (~500 tokens, overlap), attach metadata (engine model, document type, revision/date, language, source URL, security label).
      - **PII/sensitivity:** scrub customer names/phones from repair notes; restrict export-controlled documents by group.
      - **Embeddings + index:** one embedding model; vector index with metadata filters; hybrid search for part numbers and fault codes; incremental refresh via content hashes; deletion of retired revisions.
      - **Permissions:** filter retrieval by the technician's entitlements.
      - **Evaluation:** a labelled set of technician questions with expected source chunks (Hit@k) and answers (faithfulness); run on every change to chunking/model.
      - **Monitoring:** unanswered questions, feedback, latency, cost; lineage from answer → chunk → document revision.`),
    talk('A data scientist\'s failure model looked great in testing and failed in production. What data problems would you look for?', `
      - **Leakage:** features using information after the prediction time (e.g. repair flags, later claims, current SCD values joined to past events).
      - **Training-serving skew:** production features computed by different code, different defaults for NULLs, different units or time zones.
      - **Split issues:** random split on time-series data (future in training), same engine in train and test.
      - **Label problems:** labels from warranty claims miss real failures; delays not accounted for.
      - **Drift:** firmware changes altering sensor scales; new engine models; seasonal effects.
      - **Data quality in production:** missing telemetry, late data, duplicates.
      - **Fix:** point-in-time feature tables shared by training and serving, time-based validation, drift monitoring, feature/label documentation.`),
  ],
  scale: [
    talk('Design a pipeline for 1 billion events per day with dashboards updated every 5 minutes and full history for ML.', `
      - **Size:** 1B/day ≈ 11.6k events/s average, plan 50k/s peak; at 500 B/event ≈ 500 GB/day raw, ~60 GB/day Parquet.
      - **Ingest:** Kafka/Event Hubs, 48-96 partitions keyed by entity, Avro + schema registry, acks=all, 7-day retention.
      - **Process:** Structured Streaming to Delta bronze (append, exactly-once), silver with dedupe on event ID + watermark, typed and partitioned by date, clustered by entity.
      - **Serve 5-minute dashboards:** incremental aggregates every 5 minutes into small gold tables (or streaming aggregation with update mode), served via SQL warehouse with caching; not scanning raw data per dashboard query.
      - **History/ML:** silver kept long-term (tiered storage), feature tables computed in batch.
      - **Reliability:** checkpoints, DLQ, late-data correction job, reconciliation of counts with producers.
      - **Ops/cost:** autoscaling, compaction, lag and freshness alerts, cost per pipeline; load test at 2× peak before launch.`),
    talk('For a service app showing each engine\'s latest health score, would you choose a CP or AP store? Justify.', `
      - The value is updated in batches (daily/hourly scores), read very often, and slightly stale data (seconds or minutes) is acceptable; unavailability (app errors) is worse than staleness.
      - So **AP / low-latency, eventually consistent** reads are fine: e.g. DynamoDB/Cosmos DB/Cassandra with eventual reads, or a cache in front.
      - Writes are idempotent upserts keyed by engine (score + computed_at), so replays and multi-region replication converge (last-writer-wins by computed_at).
      - If the score triggered safety-critical actions or money movement, I would choose stronger consistency for that path.
      - Mention PACELC: even without partitions, prefer latency over strict consistency here.`),
  ],
  devops: [
    talk('Describe a CI/CD setup for a platform using Databricks jobs, dbt models and Airflow DAGs.', `
      - **One Git repo (or a few)** with code, SQL models, DAGs, job definitions (Databricks Asset Bundles) and infrastructure (Terraform).
      - **PR checks (CI):** lint (ruff, sqlfluff); pytest unit tests for Python/PySpark transformations with small fixtures; «dbt build --select state:modified+» against a CI schema with sample data; Airflow DAG import test; «bundle validate»; «terraform plan»; secret scanning.
      - **Merge → CD:** deploy bundles/dbt/DAGs to dev, then test (integration run on masked realistic data, data tests, reconciliation), manual approval, then prod.
      - **Same artefacts, environment config** via variables/targets; service principals per environment; secrets in Key Vault.
      - **Post-deploy:** smoke runs, monitoring, quick rollback (redeploy previous version; table RESTORE if data changed).
      - **Metrics:** deployment frequency, change failure rate.`),
  ],
  project: [
    talk('If your Turbofan telemetry project had to go to production at a real company tomorrow, what would you change?', `
      - **Infrastructure:** managed Kafka/Event Hubs and a managed Spark platform instead of local containers; IaC for everything; dev/test/prod.
      - **Security:** per-device identity and TLS; service principals; secrets in a vault; catalog permissions and PII review.
      - **Reliability:** HA brokers (RF=3, min ISR 2), checkpoint storage on durable cloud storage, DLQ for malformed events, late-data correction batch, replay runbook.
      - **Data management:** schema registry with compatibility rules, contracts with the device firmware team, retention tiers, compaction/OPTIMIZE and VACUUM schedule.
      - **Observability:** lag, freshness, throughput, alert precision; on-call and runbooks.
      - **Scale tests:** load at 2-3× expected fleet size (extend my existing load test) and cost estimate.
      - **Product:** owners, SLAs, catalog entries, a certified gold table for fleet health.
      Shows you know the gap between a project and production.`),
  ],
  interview: [
    talk('Tell me about a time you disagreed with a stakeholder about how a metric should be defined.', `
      **STAR:**
      - **Situation:** two teams computed a KPI (e.g. "open service requests" or "approval rate") differently, so reports disagreed.
      - **Task:** get one trusted definition without blocking delivery.
      - **Action:** listed both definitions with concrete examples where they differ; showed the impact on numbers; involved the data/business owner to decide; documented the agreed definition and edge cases; implemented it once (shared dataset/semantic measure); kept the old view available for a transition period.
      - **Result:** one number in meetings, fewer reconciliation questions.
      - **Learning:** write definitions and acceptance criteria before building.
      Values differences, decision quality and communication are all visible in this answer.`, 'hr'),
    talk('Tell me about a mistake you made at work and what you changed afterwards.', `
      - Choose a real, moderate mistake (e.g. a report published with a filter error, a deployment without enough testing, an assumption about data that was wrong).
      - **Own it:** what you did, why it happened, how you noticed.
      - **Fix:** how you corrected it fast and informed the people affected.
      - **Prevent:** the check, test, checklist or habit you introduced (e.g. reconciliation against the source before publishing, peer review, a validation query you now always run).
      - Interviewers look for ownership, honesty and learning, not perfection.`, 'hr'),
    talk('You have three urgent requests from three managers this week and capacity for one. What do you do?', `
      - Clarify each request: the decision it supports, the deadline, the impact of delay, the effort.
      - Make the trade-off visible: share the list with the people involved (or your lead/product owner) with estimates and impacts.
      - Prioritise by business impact and deadlines; agree it with the person who owns priorities rather than deciding silently.
      - Offer options: a smaller first version for one request, reuse of an existing dataset for another, a date for the third.
      - Communicate early and keep stakeholders updated.
      Shows customer focus, collaboration and decision quality.`, 'hr'),
    talk('Why data engineering, and why this team?', `
      - **Why DE:** from your analytics work you saw that the value of data depends on reliable foundations; you enjoy building systems (pipelines, models) that many people depend on; you have already built end-to-end projects (Turbofan streaming, Strata) on your own.
      - **Why this team:** industrial data (engines, IoT, quality, supply chain) is where data engineering has real-world impact: predictive maintenance, quality, warranty; the posting's focus on data products, AI-ready data and modern cloud platforms matches what you have been building towards.
      - **What you bring:** analytics background (understanding consumers), hands-on projects, fast learning, ownership.
      Keep it specific and honest; avoid generic praise.`, 'hr'),
    talk('Explain to a non-technical manager why last quarter\'s numbers on the dashboard changed after a data fix.', `
      - **Start with the impact:** "Last quarter's claims total went up by 2.3% after we corrected a data issue. Decisions based on regional rankings are unchanged; the West region moved from 3rd to 2nd."
      - **Simple cause:** "Some claims sent late by dealers weren't being counted in the right month. We fixed the process so late claims are now placed in the month they happened."
      - **What we did:** recalculated the affected months and checked the totals against the claims system.
      - **What prevents it:** an automatic check that compares our totals with the source every day.
      - Avoid jargon (watermarks, partitions); offer a one-page note with details.`, 'hr'),
  ],
};
