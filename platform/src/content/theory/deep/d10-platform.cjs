const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('../_t.cjs');

module.exports = {
  // ------------------------------------------------------------------ Hadoop / NoSQL
  hadoopwhat: T(`
    ## Senior depth
    - **Where Hadoop still lives in 2026:** on-prem clusters in manufacturing, telecom and banks (Cloudera CDP), regulated or air-gapped environments, and as the **API layer** everywhere: the Hadoop FileSystem API (s3a://, abfss://) is how Spark talks to cloud storage; Parquet/ORC came from that ecosystem; the Hive metastore model became Glue/Unity Catalog.
    - **Migration projects** (Hadoop → Databricks/Azure) are common work for a DE: inventory jobs and Hive tables, convert to Delta, rewrite MapReduce/Hive/Pig jobs as Spark SQL/PySpark, move Oozie schedules to Airflow/Lakeflow Jobs, map Ranger/Sentry permissions to Unity Catalog, validate with row counts and checksums, run in parallel before cutover.
  `),
  hdfs: T(`
    ## Senior depth
    - **NameNode memory:** every file, directory and block is an object in NameNode heap (~150 bytes each). 100 million small files ≈ tens of GB of heap: the hard limit behind the small files problem. HDFS Federation and Router-based federation split namespaces.
    - **HA:** active/standby NameNodes with JournalNodes (quorum journal) and ZooKeeper failover controllers. (HDFS still uses ZooKeeper; Kafka no longer does.)
    - **Erasure coding** (Hadoop 3) stores cold data with ~1.5× overhead instead of 3× replication, at the cost of CPU and slower reconstruction.
    - **Write pipeline:** client → DN1 → DN2 → DN3 with acks back; block placement puts one replica on the local rack and two on another rack.
  `),
  mapreduce: T(`
    ## Senior depth
    - **Combiners** are map-side partial reducers (only for associative/commutative operations): the ancestor of Spark's partial aggregation.
    - **Partitioner and secondary sort:** custom partitioners control which reducer gets a key; secondary sort (composite key + grouping comparator) delivers values in order to the reducer, used for time-ordered processing per key.
    - **Why it was slow:** every job wrote its output to HDFS (replicated) and the next job read it back; multi-step pipelines paid disk I/O and job start-up at every step. Spark keeps intermediate data in memory/local disk within one application and plans the whole DAG.
    - **Interview angle:** you can explain any Spark groupBy/join as map → shuffle → reduce. That is the transferable value.
  `),
  hive: T(`
    ## Senior depth
    - **Execution engines:** MapReduce (legacy), Tez (DAG engine, default on HDP/CDP), Spark. LLAP adds long-lived daemons with caching for interactive queries.
    - **Hive ACID tables** (ORC, transactional=true) support UPDATE/DELETE/MERGE with delta files and compactions (minor/major): the same copy-on-write/merge-on-read trade-off as Delta and Iceberg, earlier and heavier.
    - **Metastore is the long-lived part:** table definitions, partitions, locations. Spark, Trino, Impala share it. Partition counts in the hundreds of thousands make metastore calls slow: another reason table formats store file lists and stats in their own metadata.
    - **Schema-on-read pitfalls:** CSV/JSON external tables with a declared schema return NULLs for mismatched values without errors.
  `),
  hivepart: T(`
    ## Senior depth
    - **Dynamic partition inserts** need «hive.exec.dynamic.partition.mode=nonstrict» and limits («max.dynamic.partitions») that protect the metastore from accidental million-partition writes.
    - **MSCK REPAIR TABLE** / «ALTER TABLE ADD PARTITION» register partitions written directly to storage; forgetting it makes new data invisible. Table formats remove this class of bug.
    - **Bucketing** requires both tables bucketed on the same key with compatible bucket counts, and Spark and Hive use **different bucket hashing**, so Hive-bucketed tables do not give Spark shuffle-free joins (and vice versa).
    - **Iceberg hidden partitioning** (partition by «days(ts)» without a separate column) and partition evolution fix the classic Hive problems of users forgetting the partition filter and of changing partition schemes.
  `),
  hbase: T(`
    ## Senior depth
    - **Hot-spotting:** monotonically increasing row keys (timestamps, sequential IDs) send all writes to one region server. Fixes: salting/hash prefixes, reversing the key, or composite keys led by a well-distributed field (engine_id then reversed timestamp for "latest readings per engine" scans).
    - **Region splits and compactions** (minor/major) cause latency spikes; pre-split tables for known key ranges.
    - **Reads:** Get by key and range Scan are fast; anything else is a full scan. Secondary indexes require Phoenix or a separate index table you maintain.
    - **Accumulo** = Bigtable design with **cell-level security labels** (visibility expressions) and server-side iterators: chosen where per-cell access control matters (defence, government). The posting lists it next to HBase; know that difference.
  `),
  hadoopspark: T(`
    ## Senior depth
    - **Spark on YARN** was the bridge: same cluster, Spark instead of MapReduce. Cloud migration then separates storage (ADLS/S3) from compute (Databricks/EMR).
    - **Validation strategy for migrations:** row counts, column-level aggregates/checksums per partition, sample record diffs, and parallel runs for a few cycles; differences in NULL handling, timestamp time zones, decimal precision and string collation between Hive and Spark are the usual causes.
  `),
  cassandra: T(`
    ## Senior depth
    - **Query-first modelling:** one table per query pattern, denormalised. The partition key decides distribution and must keep partitions bounded (e.g. «(engine_id, day)» for readings, not «engine_id» alone, which grows forever: wide partition problem; aim < ~100 MB per partition).
    - **Clustering columns** order rows within a partition («ORDER BY ts DESC» for latest-first reads).
    - **Tombstones:** deletes write markers that live until «gc_grace_seconds» (10 days); queries scanning many tombstones slow down or fail. TTL-heavy designs and "delete then insert" patterns cause tombstone storms.
    - **Consistency:** tunable per query (ONE, QUORUM, LOCAL_QUORUM, ALL); with RF=3, QUORUM writes + QUORUM reads give read-your-writes. Lightweight transactions (Paxos) for compare-and-set are slow; use sparingly.
    - **For a DE:** extract via the Spark Cassandra connector (token-range parallelism), not via SELECT * through one coordinator; prefer CDC to full scans for change feeds.
  `),
  dynamodb: T(`
    ## Senior depth
    - **Partition key design:** throughput is spread over partitions by hash of the partition key; a hot key throttles even if the table has capacity overall (adaptive capacity helps but has limits). Write sharding (key + suffix) for hot items.
    - **GSIs** are eventually consistent copies with their own capacity; a throttled GSI back-pressures writes to the base table.
    - **Single-table design:** multiple entity types in one table with overloaded keys (PK = «ENGINE#123», SK = «READING#2026-11-27T10:00»), queried by key patterns. Efficient, hard to analyse: export to the lake for analytics.
    - **Analytics path:** DynamoDB Streams (24 h retention, ordered per item) or export to S3 (point-in-time, no RCU cost) into the lakehouse. Never run analytical scans on the live table.
  `),
  mongodb: T(`
    ## Senior depth
    - **Schema design:** embed what is read together and bounded (a claim with its few line items), reference what grows without bound (sensor readings: use time-series collections or a separate collection). The 16 MB document limit punishes unbounded arrays.
    - **Indexes:** compound indexes follow the ESR rule (Equality, Sort, Range field order). Missing indexes = collection scans.
    - **Transactions** exist (multi-document, replica set/sharded) but cost latency; most designs avoid needing them by embedding.
    - **Sharding:** the shard key decides distribution forever-ish (resharding is possible since 5.0 but expensive); monotonically increasing shard keys create hot shards.
    - **For a DE:** extract with change streams (CDC built on the oplog) or the Spark connector; flatten nested documents deliberately; expect type drift between documents. Atlas Vector Search (your Strata project) puts embeddings next to documents, handy for RAG over operational data.
  `),
  scalajava: T(`
    ## Senior depth
    - **Spark 4 is Scala 2.13 only** and runs on Java 17/21 (Databricks Runtime 18 defaults to JDK 21). Library jars compiled for Scala 2.12 do not load: a common upgrade breakage.
    - **When the JVM shows up in a Python job:** JDBC drivers, Kafka/Delta connector jars, Java stack traces in PySpark errors (read the "Caused by" at the bottom), GC tuning, Scala UDFs registered for speed.
    - **Reading Scala you will meet:** case classes as schemas, «Dataset[T]», implicits for encoders, «Option» instead of null, pattern matching. Enough to read and port, not necessarily to write daily.
  `),

  // ------------------------------------------------------------------ Cloud
  cloudwhat: T(`
    ## Senior depth
    - **Shared responsibility:** the provider secures the infrastructure; you secure identities, data access, network exposure, keys and configuration. Most cloud data breaches are misconfigured storage or leaked credentials, not provider failures.
    - **Elasticity changes architecture:** separate storage and compute, ephemeral clusters per job, serverless SQL, pay-per-use. Your design cost is now visible per query and per pipeline.
    - **Regions and data residency:** where data is stored matters legally (export control, DPDP/GDPR cross-border rules). Choose regions deliberately; replicate only where allowed.
  `),
  iaas: T(`
    ## Senior depth
    - **In data terms:** IaaS = VMs where you install Spark/Kafka (full control, full ops burden); PaaS = Databricks, Event Hubs, Azure SQL, managed Airflow (you configure, they operate); SaaS = Salesforce, Power BI (you use). Serverless pushes PaaS further: no clusters to size.
    - **The trade-off is ops time vs control vs cost at scale:** managed services cost more per unit but less in engineering time; at very large steady scale, some companies self-manage. For a DE 1, default to managed and explain why.
  `),
  cloudtypes: T(`
    ## Senior depth
    - **Hybrid is the reality in manufacturing:** plant systems (MES, historians like OSIsoft PI, SCADA) stay on-prem for latency and safety; data flows to the cloud through gateways, VPN/ExpressRoute, and self-hosted integration runtimes (ADF). Design for intermittent connectivity: buffer at the edge, replay on reconnect, event-time processing.
    - **Multi-cloud** usually happens through acquisitions and SaaS, rarely by design; open table formats and catalogs (Delta/Iceberg, UC/Polaris) reduce lock-in.
  `),
  objstore: T(`
    ## Senior depth
    - **ADLS Gen2 specifics:** hierarchical namespace (atomic directory rename, POSIX ACLs), access via «abfss://container@account.dfs.core.windows.net/path», auth with managed identities/service principals through Unity Catalog storage credentials; avoid account keys and long-lived SAS tokens.
    - **Performance:** many parallel readers scale well; listing huge directories is slow (table formats avoid listing); small files cost requests; prefer large Parquet files.
    - **Lifecycle policies** tier and expire data automatically; **soft delete and versioning** protect against accidental deletion (and complicate erasure: include them in privacy processes).
    - **Network:** private endpoints keep traffic off the public internet; firewall rules on storage accounts are a frequent cause of "403 from Databricks" incidents.
  `),
  lakearch: T(`
    ## Senior depth
    - **Medallion is a convention, not a law:** bronze (raw, append-only, replayable), silver (clean, conformed, deduplicated), gold (business-level, consumption-ready). Some teams add landing/raw zones before bronze or platinum/semantic layers after gold. Define the contract of each layer explicitly (what is guaranteed).
    - **Bronze design:** keep raw payload + ingestion metadata (source, file/offset, ingest time, schema version); partition by ingest date; retention by policy. It is your replay source and audit trail.
    - **Data swamp symptoms:** no owners, no catalog entries, no quality checks, duplicated copies with unclear lineage. Governance (Unity Catalog, ownership, data products) is what keeps a lake a lakehouse.
  `),
  tableformats: T(`
    ## Senior depth (2026)
    - **Convergence:** Delta UniForm writes Iceberg (and Hudi) metadata alongside Delta so Iceberg readers can query Delta tables; Iceberg REST catalogs (Polaris, Unity Catalog's Iceberg REST API) let multiple engines share tables; Iceberg v3 adds deletion vectors, row lineage and a VARIANT type, mirroring Delta features.
    - **Choosing in an interview:** Databricks-centred → Delta (+ UniForm for Iceberg consumers); multi-engine (Snowflake, Trino, Flink, Athena) → Iceberg; upsert-heavy streaming with record-level indexes → Hudi. Say the catalog matters as much as the format.
    - **Common capabilities to name:** ACID commits, snapshots/time travel, schema evolution, partition evolution (Iceberg), row-level deletes (copy-on-write vs merge-on-read), compaction, statistics for skipping, change feeds.
  `),
  filemove: T(`
    ## Senior depth
    - **Tools by situation:** AzCopy/«azcopy sync» (parallel, resumable, checksums) for bulk; ADF copy activity with self-hosted integration runtime for on-prem sources; Data Box (physical device) when network transfer would take weeks (100 TB over 1 Gbps ≈ 9-10 days at full utilisation); ExpressRoute for steady hybrid traffic.
    - **Correctness:** verify with checksums (MD5/CRC64) and counts; transfer in chunks with a manifest; make the load idempotent (re-copying a file overwrites, not duplicates).
    - **Throughput math:** bandwidth × utilisation × time; parallelism across files beats one huge file; compress text before transfer (but keep splittable formats for processing).
    - **Security:** encryption in transit (TLS), private endpoints, short-lived credentials, and export-control rules for engineering data crossing borders.
  `),
  clouddw: T(`
    ## Senior depth
    - **Concurrency and workload isolation:** separate warehouses/compute for ETL, BI and ad-hoc users so a heavy backfill does not slow the CEO dashboard. Serverless SQL warehouses scale clusters out for concurrency.
    - **Cost levers:** auto-suspend/stop, result caching, clustering for pruning, materialised views for repeated aggregates, avoiding SELECT *, monitoring top queries by cost.
    - **Lakehouse vs warehouse in 2026:** Databricks SQL, Snowflake, BigQuery and Fabric all query open formats to some degree; the decision is more about ecosystem, governance and team skills than raw capability.
  `),
  clusters: T(`
    ## Senior depth
    - **Right-sizing method:** start from data volume and SLA, run, read the Spark UI (CPU utilisation, spill, skew), then adjust node type and count. Measure cost per run; track it over time.
    - **Autoscaling caveats:** scale-up latency (minutes for new VMs), scale-down losing shuffle/cached data, streaming jobs oscillating. Serverless compute hides most of this at a price premium.
    - **Spot/low-priority VMs** for workers in fault-tolerant batch; never for the driver; fall back to on-demand when spot capacity is gone.
  `),
  cloudsec: T(`
    ## Senior depth
    - **Identity first:** managed identities / service principals with least privilege; no shared personal accounts in production; MFA and conditional access for humans; workload identity federation (OIDC) for CI/CD instead of stored secrets.
    - **Network:** private endpoints/Private Link for storage, Key Vault and Databricks; no public IPs on clusters (secure cluster connectivity); egress control to stop data exfiltration.
    - **Data:** encryption at rest (platform keys, or customer-managed keys in Key Vault for compliance), TLS in transit, column masks/row filters, audit logs retained and monitored.
    - **Common incidents:** a public blob container, a SAS token with long expiry in a notebook, an over-privileged service principal, secrets printed in logs. Prevent with policy (Azure Policy), scanning, and reviews.
  `),
  clouds: T(`
    ## Senior depth: service mapping for data engineers
    | Need | Azure | AWS | GCP |
    |---|---|---|---|
    | Object storage | ADLS Gen2 / Blob | S3 | GCS |
    | Streaming ingestion | Event Hubs, IoT Hub | Kinesis, MSK | Pub/Sub |
    | Spark / lakehouse | Azure Databricks, Fabric | Databricks, EMR, Glue | Databricks, Dataproc |
    | Warehouse | Fabric Warehouse, Synapse dedicated (legacy), Databricks SQL | Redshift | BigQuery |
    | Orchestration / integration | Data Factory, Fabric pipelines | Step Functions, MWAA, Glue workflows | Composer, Workflows |
    | Catalog / governance | Unity Catalog, Microsoft Purview | Glue Data Catalog, Lake Formation | Dataplex |
    | Secrets | Key Vault | Secrets Manager | Secret Manager |
    Microsoft's direction is **Fabric** (OneLake, unified analytics) alongside Azure Databricks; many enterprises run Databricks for engineering and Power BI/Fabric for consumption.
  `),
  azure: T(`
    ## Senior depth
    - **Typical Cummins-style Azure data flow:** devices/plants → IoT Hub / Event Hubs → ADLS Gen2 bronze (Auto Loader or Event Hubs capture) → Azure Databricks (Delta, Unity Catalog, Lakeflow) → gold → Power BI / Databricks SQL / ML; ADF for on-prem and SaaS copies (self-hosted IR); Key Vault, Entra ID (formerly Azure AD), Azure Monitor/Log Analytics, Purview for enterprise catalog.
    - **Event Hubs specifics:** partitions fixed at creation in Standard tier (Premium/Dedicated allow increases); throughput units; Capture to ADLS in Avro/Parquet; Kafka endpoint so Spark's Kafka source works with a SASL connection string (or OAuth).
    - **ADF vs Databricks:** ADF moves and orchestrates (copy, triggers, lookups, simple mapping data flows); Databricks transforms at scale. A common pattern: ADF copies, triggers Databricks jobs, handles alerts.
  `),
  cost: T(`
    ## Senior depth
    - **Attribute cost:** tags on clusters/jobs (team, pipeline, environment), Databricks system tables («system.billing.usage») joined to job runs give cost per pipeline per day. You cannot optimise what you cannot attribute.
    - **Biggest levers:** stop idle compute (auto-termination, job clusters), process incrementally instead of full reloads, prune reads (partitioning/clustering, column selection), fix small files, right-size clusters and use spot, use Photon where it pays, tier/expire storage, avoid cross-region egress.
    - **Unit economics:** cost per million events, per report refresh, per GB processed. Report them; they turn "make it cheaper" into engineering targets.
    - **FinOps trap:** optimising a 2% line item while a forgotten all-purpose cluster runs 24/7. Look at the top 10 consumers first.
  `),

  // ------------------------------------------------------------------ Governance
  govwhat: T(`
    ## Senior depth
    - **Governance that works is automated and embedded:** classification at ingestion, access policies as code, quality checks in pipelines, lineage captured by the platform, ownership in the catalog. Committees without automation produce documents, not trust.
    - **Critical data elements (CDEs):** identify the few fields that drive finance, safety and regulatory reporting (claim amounts, failure codes, engine serial numbers) and govern them most strictly.
    - **Regulations to name for an Indian engineer at a US multinational:** India DPDP Act 2023 (rules notified 2025), GDPR for EU data, US export controls (EAR/ITAR) for engineering data (the posting mentions export controls), SOX for financial reporting controls.
  `),
  metadata: T(`
    ## Senior depth
    - **Operational metadata** (run times, row counts, freshness, quality results, cost) is the third kind next to technical and business metadata, and the one that powers observability.
    - **Active metadata:** metadata that triggers actions (a PII tag that automatically applies a mask; a freshness breach that marks downstream products degraded).
    - **Keep metadata with code:** column descriptions and tags in dbt YAML / table DDL / bundles, deployed by CI, so the catalog is never a stale wiki.
  `),
  catalog: T(`
    ## Senior depth
    - **Unity Catalog vs Purview:** UC governs Databricks assets (tables, volumes, models) with enforcement (grants, masks) and automatic lineage; Purview is an enterprise-wide catalog and classification service across Azure, on-prem and SaaS (scanning, glossary, policies). Many Azure enterprises use both, with UC metadata surfaced in Purview.
    - **Discoverability needs curation:** certified/endorsed tags, owners, sample queries, usage stats ("most queried"), deprecation flags. A catalog with 20,000 uncurated tables is not discoverable.
  `),
  ownership: T(`
    ## Senior depth
    - **RACI for data:** data owner (accountable, business), data steward (definitions and quality rules), data custodian/engineer (implements and operates). Name them per data product in the catalog.
    - **Ownership gaps** show up as orphaned tables, unanswered quality alerts and "who can approve access?" delays. Automate access requests routed to owners; review unused/unowned assets quarterly.
  `),
  access: T(`
    ## Senior depth
    - **Models:** RBAC (roles/groups: the default), ABAC (attributes/tags: "mask all columns tagged PII unless user has clearance"; Unity Catalog ABAC policies), row-level security by business attribute (dealer, region, plant).
    - **Least privilege in practice:** groups not individuals; read access by default to curated gold, not raw bronze; time-bound elevated access; service principals scoped per pipeline; periodic access reviews.
    - **Views vs row filters:** secure views were the old way (one view per audience); table-level row filters and column masks enforce the rule wherever the table is queried, including in notebooks.
  `),
  retentionpol: T(`
    ## Senior depth
    - Retention must be implemented in **every copy**: tables (partition drops), Delta history (VACUUM, log retention), Kafka topics, DLQs, backups, exports, ML training snapshots, notebook outputs.
    - **Legal hold** overrides deletion for data under litigation or audit; the platform needs a way to exempt specific data from automated deletion.
  `),
  dqframe: T(`
    ## Senior depth
    - **Frameworks compared:** dbt tests (in-model, SQL), Great Expectations/GX (Python expectations, data docs), Soda (YAML checks, SodaCL), Lakeflow pipeline expectations (in-pipeline drop/fail/warn with metrics), Databricks Lakehouse Monitoring (profiling, drift), Deequ/PyDeequ (Spark-native metrics and constraints).
    - **Pick by where the logic lives:** SQL models → dbt tests; Spark pipelines → expectations in the pipeline or Deequ; cross-system monitoring → an observability layer. Results go to one quality metrics table regardless of tool.
  `),
  dataproduct: T(`
    ## Senior depth: what "certified" should mean
    - **Owner and support channel**, documented purpose and grain, schema contract with versioning, **SLOs** (freshness, completeness, quality pass rate) measured and published, lineage, access policy, PII classification, usage metrics, deprecation policy.
    - **Interfaces:** a data product may expose several outputs (Delta table, SQL view, API, feature table, semantic model). Consumers depend on the interface, not the internals.
    - **Reusable and discoverable** is the posting's language: one certified "engine warranty claims" product used by finance, quality and ML beats five team-specific extracts that disagree.
  `),
  semantic: T(`
    ## Senior depth
    - **Metric definitions as code:** dbt Semantic Layer (MetricFlow), Databricks **metric views** in Unity Catalog, Power BI semantic models (DAX measures), Cube. Define "approval rate" once, with its filters and grain, and let every tool use it.
    - **Why it matters:** without it, two dashboards compute "active engines" differently and executives lose trust in all of them.
    - **Performance:** semantic layers push queries to the warehouse; pre-aggregations/materialised views keep dashboards fast.
  `),
  aiready: T(`
    ## Senior depth
    - **For ML:** point-in-time correct features (no leakage), consistent offline/online features (feature store), labelled and versioned training sets, documented label definitions (what counts as "failure"), stratified by segment (Turbofan's per-fleet evaluation found the missed fault mode).
    - **For GenAI:** clean, deduplicated, chunked documents with metadata (source, date, access level, product line) for retrieval filtering; permission-aware retrieval (users must not retrieve documents they cannot read); freshness pipelines for re-embedding changed documents; evaluation sets.
    - **Semantic context:** table and column descriptions, metric definitions and relationships make text-to-SQL and AI assistants (Databricks Genie, Copilot) accurate. Good metadata is now an AI input, not just documentation.
  `),

  // ------------------------------------------------------------------ AI / IoT
  ml: T(`
    ## Senior depth
    - **The data engineer's ML responsibilities:** training data pipelines (reproducible, point-in-time), feature pipelines (batch and streaming), inference pipelines (batch scoring at scale, streaming scoring), monitoring inputs for drift, and lineage from model to data versions (MLflow + Unity Catalog models).
    - **Leakage** is the classic data bug in ML: features computed with future information (aggregates over the whole history, joining current dimension values, random train/test splits on time series). Split by time and entity.
    - **Imbalanced labels** (failures are rare) make accuracy meaningless; precision/recall, lead time, false alarm rate matter (Turbofan reports detection rate and warning lead time).
  `),
  features: T(`
    ## Senior depth
    - **Feature stores** (Databricks Feature Engineering in UC, Feast) give: one definition used for training and serving, point-in-time lookups for training sets, online tables for low-latency serving, lineage to models.
    - **Time-series features:** rolling means/std/slopes over windows, time since last event, counts in windows, deltas from baseline per entity. Compute with window functions in batch and the same logic in streaming (or a shared function, with a parity test).
    - **Training-serving skew:** the same feature computed differently in training (batch SQL) and serving (Python service). Share code or a store.
  `),
  genai: T(`
    ## Senior depth
    - **Data engineering for GenAI:** document ingestion (PDF manuals, service bulletins, claims notes) with parsing, OCR, chunking, metadata, deduplication, PII redaction; embedding pipelines with versioning (re-embed when the model changes); vector indexes; evaluation datasets; logging prompts/responses for monitoring (with privacy controls).
    - **Structured data + LLMs:** text-to-SQL works only with a good semantic layer and descriptions; LLM-based extraction from free text (failure descriptions → codes) needs validation, confidence thresholds and human review queues (your Strata classifier pattern).
    - **Governance:** model and prompt versions, cost per call, rate limits, data residency of the model endpoint, and never sending restricted data to external APIs without approval.
  `),
  rag: T(`
    ## Senior depth
    - **Retrieval quality decides answer quality:** chunking strategy (size, overlap, structure-aware), metadata filters, **hybrid search** (vector + keyword/BM25, fused with reciprocal rank fusion: your Strata result 100% vs 52% Hit@5), reranking.
    - **Evaluation:** a labelled question set; retrieval metrics (Hit@k, MRR, recall@k) separately from generation metrics (faithfulness/groundedness, answer correctness); regression-test changes to chunking or embeddings.
    - **Freshness and deletion:** incremental re-indexing of changed documents (CDF on a documents table → embedding job → vector index sync; Databricks Vector Search delta-sync indexes do this), and removal of deleted or access-revoked documents.
    - **Access control:** filter retrieval by the user's permissions; a RAG bot that leaks restricted bulletins is a governance incident.
  `),
  iot: T(`
    ## Senior depth
    - **Time-series storage design:** narrow/long tables (engine_id, ts, signal, value) for flexibility vs wide tables (one column per sensor) for compression and query speed; partition by date, cluster by engine_id and ts; downsampled aggregates (1-minute, 1-hour) for dashboards with long retention, raw for shorter retention.
    - **Device realities:** clock drift and wrong time zones, duplicate sends after reconnect, gaps from connectivity, firmware changes that rename signals or change units, sensor faults (stuck values, spikes). Validate per signal (range, rate of change, flatline detection) and keep device/firmware metadata.
    - **Edge vs cloud:** edge aggregation/filtering reduces bandwidth; edge buffering survives outages; but the cloud should still receive enough raw data for model training.
  `),
  predmaint: T(`
    ## Senior depth
    - **Problem framings:** anomaly detection (no labels), remaining useful life regression (labels from run-to-failure data, as in C-MAPSS), failure-within-N-cycles classification, health indices with thresholds (Turbofan). Choose by available labels and the action the business takes.
    - **Operational metrics:** detection rate, false alarm rate per engine-month, warning lead time distribution (median and p10), cost of missed failure vs unnecessary inspection.
    - **Segment-level evaluation:** a single global metric hides failure modes. Turbofan's FD003 fan-fault miss (56% → 100% after fault-mode-aware scoring) is the perfect example of why.
    - **Data pipeline needs:** consistent per-engine histories, operating-condition normalisation (regimes), maintenance events as labels and resets, point-in-time training sets.
  `),
  iotingest: T(`
    ## Senior depth
    - **Azure path:** devices → IoT Hub (device identity, per-device auth, cloud-to-device commands, routing) → built-in Event Hubs-compatible endpoint or routes to Event Hubs → Spark Structured Streaming / Auto Loader from capture files → Delta. Device Provisioning Service for fleet onboarding.
    - **Throughput planning:** messages/s and bytes/s per IoT Hub unit/tier and per Event Hubs partition/throughput unit; batch messages on devices (several readings per message) to cut per-message costs.
    - **Backpressure and replay:** retention on Event Hubs (1-90 days by tier) is the replay window; bronze in Delta is the long-term one.
  `),

  // ------------------------------------------------------------------ Delivery
  sdlc: T(`
    ## Senior depth
    - **Data-specific SDLC steps:** source analysis and profiling before design; data contracts agreed with producers; test data strategy (synthetic/masked); data validation in UAT against business-reconciled numbers; backfill and cutover plans; hypercare after go-live with daily reconciliation.
    - **Definition of done for a pipeline:** code reviewed and tested, data tests in place, monitoring and alerts configured, runbook written, catalog documented, owner assigned, backfill done and reconciled, consumers signed off.
  `),
  agile: T(`
    ## Senior depth
    - **Data work in sprints:** discovery spikes (profile the source before estimating), thin vertical slices (one source to one gold metric end to end, then widen), explicit acceptance criteria with reconciled numbers.
    - **Kanban fits operational data teams** (incidents, access requests, small changes) with WIP limits and flow metrics (cycle time, throughput); Scrum fits product-style build work. Many teams run both.
    - **Ceremonies you will be asked about:** sprint planning, daily stand-up, review/demo, retrospective, backlog refinement; roles: product owner, scrum master, developers.
  `),
  devops: T(`
    ## Senior depth: CI/CD for data
    - **CI on every PR:** lint/format, unit tests, DAG/bundle validation, dbt compile + build on a CI schema (slim CI), data diff against production for changed models, security scanning.
    - **CD:** deploy bundles/DAGs/infrastructure via pipelines with environment approvals; database/table migrations versioned and backward compatible (add column → backfill → switch readers → drop old later).
    - **Blue/green for tables:** build the new version alongside, validate, swap pointers/views, keep the old for rollback.
    - **DORA metrics** (deployment frequency, lead time, change failure rate, time to restore) apply to data teams too.
  `),
  git: T(`
    ## Senior depth
    - **Branching:** trunk-based with short-lived feature branches and PRs is the norm; GitFlow's long-lived branches create merge pain for pipelines.
    - **What goes in Git:** pipeline code, SQL, DAGs/bundles, infrastructure, tests, docs. Never: data files, secrets, notebook outputs with data (strip outputs), large binaries.
    - **Databricks Git folders** for notebooks/repos; review notebook changes as source files (.py with cell markers) for readable diffs.
    - **Recovering mistakes:** «git revert» for shared history, never force-push shared branches; «git bisect» to find the commit that broke a transformation.
  `),
  testing: T(`
    ## Senior depth
    - **The data testing pyramid:** many fast unit tests on pure logic; fewer integration tests on real engines; data tests on every production run; occasional end-to-end and performance tests.
    - **Regression testing with data diffs:** run old and new code on the same input snapshot, compare outputs per key; every difference must be explained by the change. The strongest safeguard for refactors and migrations.
    - **Test the unhappy paths:** empty input, duplicates, late and out-of-order events, schema changes, NULLs in keys, huge values, time zone boundaries, re-runs (idempotency), crashes mid-write.
  `),
  rca: T(`
    ## Senior depth
    - **Methods:** timeline reconstruction (what changed when: deploys, upstream schema, volume), five whys (with evidence at each step), fishbone for contributing factors, bisecting (data versions via time travel, code via git bisect).
    - **Distinguish trigger, root cause and contributing factors:** a NULL flood (trigger) from a firmware change (root cause) went unnoticed because no null-rate check existed (contributing factor).
    - **Output:** a blameless write-up with impact (which data, which consumers, how long), fix, prevention (tests, alerts, contracts), and follow-up owners. Interviewers love a real one from your work.
  `),
  monitoring: T(`
    ## Senior depth
    - **Golden signals for pipelines:** freshness (lag from source to served), volume (rows vs expected), quality (check pass rates), latency/duration, errors/failures, cost.
    - **Streaming:** consumer lag (offsets and time), input vs processing rate, batch duration vs trigger, state size, dropped late rows.
    - **Alert hygiene:** actionable, owned, deduplicated, with runbooks; severity tiers; regular review of noisy alerts. Track mean time to detect and to resolve.
  `),
  requirements: T(`
    ## Senior depth
    - **Data requirements checklist:** consumers and decisions supported, metric definitions with examples, grain, dimensions, history needs (SCD), freshness, latency, accuracy tolerance, retention, access/PII, volumes and growth, source systems and owners, acceptance tests (reconcile to a known report).
    - **Traceability:** requirement → design element → code → test → validation evidence. A matrix (or tickets linked to PRs and tests) satisfies the posting's "traceability" competency and makes change impact analysis concrete.
    - **Change impact:** use lineage to list affected tables, dashboards and models; estimate effort and risk; communicate before changing.
  `),
  docs: T(`
    ## Senior depth
    - **Docs that get used:** README per pipeline (purpose, inputs, outputs, schedule, owners, how to run, how to backfill), runbook per alert, architecture decision records (ADRs: context, decision, consequences: Turbofan has ADRs), catalog descriptions generated from code.
    - **Validation testing evidence:** test plans tied to acceptance criteria, results with reconciled numbers, sign-off from the business owner. Store with the change, not in someone's inbox.
  `),
  qametrics: T(`
    ## Senior depth
    - **Delivery quality metrics:** defect escape rate (bugs found in production vs before), change failure rate, test coverage of critical logic, data incident count and severity, mean time to detect/recover.
    - **Data product KPIs:** SLO attainment (freshness, quality), consumer adoption (queries, users), support tickets, cost per run.
    - **Use metrics to steer, not punish:** trends over time and targets agreed with the team.
  `),
};
