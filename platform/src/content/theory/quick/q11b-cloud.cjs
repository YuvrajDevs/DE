const { T } = require('../_t.cjs');

module.exports = {
  clouddw: T(`
    > **In one line:** cloud warehouses (Snowflake, BigQuery, Redshift, Synapse dedicated / Fabric Warehouse, Databricks SQL) are **managed, massively parallel, columnar SQL engines** that separate storage from compute, scale elastically and bill by usage.

    **How:** **storage** columnar, compressed, in object storage (proprietary micro-partitions or open formats) with min/max metadata for pruning; **compute** MPP clusters/virtual warehouses/slots scanning in parallel, resizable, multipliable for concurrency, suspendable; **services** layer for optimiser, metadata, security, transactions, caching (result cache, local SSD).

    | | Compute | Billing | Notable |
    |---|---|---|---|
    | Snowflake | Virtual warehouses (T-shirt sizes), multi-cluster for concurrency | Credits per second + storage | Zero-copy cloning, time travel, data sharing, Streams & Tasks, Iceberg tables |
    | BigQuery | Serverless slots | Per TB scanned or reserved slots | Partitioning + clustering cut scan cost; nested/repeated columns |
    | Redshift | RA3 clusters or serverless | Node-hours or RPUs | Sort/distribution keys; Spectrum over S3 |
    | Synapse dedicated / Fabric Warehouse | MPP distributions / capacity | DWUs / capacity units | Azure + Power BI; OneLake (Fabric) |
    | Databricks SQL | SQL warehouses on Delta | DBUs | Same tables as Spark and ML |

    **Performance levers:** prune (partition/cluster on common filters; no functions on filter columns; select only needed columns, **never «SELECT *» on wide tables, especially pay-per-scan**); co-locate joins (distribution keys in Redshift/Synapse put join rows on the same node; sort/clustering keys order data for pruning); materialise heavy logic (incremental models, materialised views, aggregates); **workload isolation** (separate compute for ETL, BI and ad-hoc so a backfill doesn't slow the CEO dashboard; serverless scales out for concurrency); result cache; fresh statistics.

    **Cost control:** auto-suspend; right-size; resource monitors/budgets and alerts; query timeouts; per-team chargeback; avoid full rebuilds; review the most expensive queries weekly.

    **Warehouse vs lakehouse (2026):** lines blur (Snowflake/BigQuery read Iceberg; Databricks SQL and Fabric offer warehouse-grade SQL). Decide by ecosystem, team skills, workload (BI-heavy vs engineering/ML-heavy), contracts, governance and cost, more than raw capability.

    **Interview:** separating storage and compute and why it matters; cutting BigQuery/Snowflake cost; distribution vs sort key.
  `),

  clusters: T(`
    > **In one line:** cloud clusters are **created on demand, sized for the job, autoscaled while running and deleted after**. **Scalability** = handling more load by adding resources; **elasticity** = doing it **automatically up and down**, paying only for use. The posting's "clustered compute cloud-based implementation".

    | Type (Databricks terms) | Lifetime | Use |
    |---|---|---|
    | Job cluster | Per run, then terminated | Production pipelines: isolated, cheaper |
    | All-purpose | Long-lived, shared | Notebooks, development |
    | SQL warehouse | On demand, auto-stop | BI, SQL |
    | Serverless | Provider-managed, starts in seconds | Spiky loads, no cluster management (price premium) |
    | Pools | Pre-warmed idle instances | Faster starts |

    ## Sizing
    - **Node type:** memory-optimised (big joins/caches), compute-optimised (CPU transforms), storage-optimised local SSD (heavy shuffles/caching).
    - **Workers:** total cores ≈ desired parallel tasks; from input GB ÷ ~128 MB per task ÷ the number of waves you accept.
    - **Driver** modest unless collecting/broadcasting.
    - **Autoscale range:** min for steady state, max as a cost guardrail.
    - **Spot/low-priority** workers for fault-tolerant batch with an **on-demand driver** (and some on-demand workers); fall back to on-demand when spot capacity runs out.
    - **Pin the runtime**; upgrade deliberately.
    - **Right-sizing method:** start from volume and SLA, run, read the Spark UI (CPU use, spill, skew), adjust node type/count, track cost per run over time.

    **Autoscaling:** out when tasks are pending, in when executors idle (dynamic allocation / optimized autoscaling). Good for batch with varied stages; caveats: minutes of VM start-up, scale-down losing shuffle/cache (decommissioning helps), cloud quotas, streaming oscillation (DLT enhanced autoscaling or fixed sizes).

    **Clusters as code:** jobs and cluster definitions in Git via **Databricks Asset Bundles**, Terraform, ARM/Bicep, CloudFormation so dev/test/prod are reproducible and reviewed: the posting's "implement and automate deployment of a distributed system".

    **What goes wrong:** everything on one all-purpose cluster (noisy neighbours, no isolation, 24/7 cost); autoscale max too high (a bad query scales to 200 nodes); spot interruptions without retries/decommissioning; slow start for frequent short jobs (pools/serverless); library conflicts on shared clusters (per-job environments).

    **Interview:** job vs all-purpose; sizing a 500 GB nightly job (~4,000 tasks of 128 MB → e.g. 100-200 cores in a few waves, then tune from the UI); scalability vs elasticity; reproducible deployment (config as code + CI/CD).
  `),

  cloudsec: T(`
    > **In one line:** cloud data security is layered: **identity and access, network, encryption, secrets, data-level controls (masking, row/column security), monitoring/audit**. Most real breaches are misconfigurations, not clever attacks.

    | Layer | Practices |
    |---|---|
    | Identity | One directory (**Microsoft Entra ID**); groups and roles, not individuals; least privilege; **managed identities / service principals** for pipelines (no personal accounts or shared keys in production); MFA and conditional access for humans; **workload identity federation (OIDC)** for CI/CD instead of stored secrets; access reviews |
    | Authorisation | RBAC on storage/workspaces; catalog grants on catalogs/schemas/tables; tag/attribute policies for PII |
    | Network | Private endpoints/Private Link for storage, Key Vault, Databricks; no public access; no public IPs on clusters (secure cluster connectivity), VNet injection; firewalls; **egress control** against exfiltration |
    | Encryption | At rest (platform or **customer-managed keys** in Key Vault/KMS for compliance); TLS in transit; column encryption for very sensitive fields |
    | Secrets | **Azure Key Vault**, AWS Secrets Manager, Databricks secret scopes; never in code, notebooks, Git or logs; rotate |
    | Data-level | Masking («XXXX-1234»), row-level security (dealers see their rows), column permissions, tokenisation/pseudonymisation |
    | Monitoring | Access logs, query history, unusual-access alerts, Defender/GuardDuty, audit trails retained and watched |
    | Governance | Classification (public, internal, confidential, restricted), retention, residency, **export control** |

    **Principles:** least privilege (minimum, shortest time); defence in depth (assume a layer fails); zero trust (network location isn't trust); separated environments (no unmasked prod data in dev); **policies and permissions as code**, reviewed in PRs.

    **Common incidents:** public blob containers; long-expiry SAS tokens in chat or notebooks; account keys committed to Git; everyone "temporarily" in admin; prod PII copied to dev; logs printing connection strings or personal data; over-privileged service principals with never-rotated secrets. Prevent with **Azure Policy**, secret scanning and reviews.

    **Interview:** securing a lake on Azure (Entra ID + RBAC/catalog grants, managed identities, private endpoints, Key Vault encryption and secrets, masking/RLS, monitoring); how a pipeline authenticates to storage (managed identity/service principal, least privilege, never personal credentials or keys in code).
  `),

  clouds: T(`
    > **In one line:** the three clouds offer equivalent building blocks under different names. Know the **mapping** to talk about any of them, and know **Azure** best for a Microsoft-centric enterprise.

    | Need | Azure | AWS | GCP |
    |---|---|---|---|
    | Object storage | Blob, **ADLS Gen2** | S3 | Cloud Storage |
    | Spark/lakehouse | **Azure Databricks**, Fabric, Synapse Spark, HDInsight | EMR, Databricks, Glue (Spark) | Dataproc, Databricks |
    | Warehouse | **Fabric Warehouse**, Databricks SQL, Synapse dedicated (legacy) | Redshift | BigQuery |
    | Ingestion/ETL | **Azure Data Factory**, Fabric Data Factory | Glue, DMS (CDC), AppFlow | Dataflow (Beam), Datastream (CDC), Data Fusion |
    | Streaming ingestion | **Event Hubs** (Kafka API), IoT Hub | Kinesis, MSK | Pub/Sub, managed Kafka |
    | Stream processing | Stream Analytics, Databricks, Fabric RTI | Managed Flink, EMR | Dataflow |
    | Orchestration | ADF, Databricks Workflows, managed Airflow | MWAA, Step Functions, Glue workflows | Composer, Workflows |
    | Catalog/governance | **Unity Catalog**, **Microsoft Purview** | Glue Data Catalog, Lake Formation | Dataplex, Data Catalog |
    | Relational | Azure SQL, PostgreSQL/MySQL flexible | RDS, Aurora | Cloud SQL, AlloyDB, Spanner |
    | NoSQL | **Cosmos DB** (multi-API) | DynamoDB, Keyspaces | Firestore, Bigtable |
    | BI | **Power BI** | QuickSight | Looker |
    | Secrets | Key Vault | Secrets Manager / KMS | Secret Manager / KMS |
    | Identity | Entra ID | IAM | Cloud IAM |
    | IaC | Bicep/ARM, Terraform | CloudFormation, CDK, Terraform | Terraform |
    | IoT | IoT Hub, IoT Edge | IoT Core, Greengrass | Partners |
    | Bulk/offline transfer | Data Box, AzCopy | Snowball, DataSync | Transfer Appliance, Storage Transfer |
    Microsoft's direction is **Fabric** (OneLake, unified analytics) alongside Azure Databricks; many enterprises run Databricks for engineering and Power BI/Fabric for consumption.

    **How to say it:** "I built X on Databricks with Delta on object storage; on Azure that's ADLS Gen2 + Azure Databricks + ADF/Workflows + Unity Catalog/Purview + Power BI." Concepts transfer; names change.

    **Interview:** Azure services for a lakehouse (ADLS Gen2, Databricks, ADF, Event Hubs/IoT Hub, Unity Catalog/Purview, Key Vault, Power BI, Azure Monitor); AWS equivalents of ADLS / Event Hubs / Data Factory (S3 / Kinesis or MSK / Glue + DMS, Step Functions).
  `),

  azure: T(`
    > **In one line:** a typical Azure platform = **ADLS Gen2** + **Azure Databricks** (Spark, Delta, SQL, ML) + **Azure Data Factory** (ingestion/orchestration) + **Event Hubs / IoT Hub** (streaming) + **Unity Catalog / Purview** (governance) + **Key Vault** + **Power BI**, deployed with **IaC and CI/CD**. Microsoft Fabric is the newer all-in-one SaaS option.

    «««flow
    Sources (SAP/ERP, CRM, plant DBs, IoT, files) -> ADF / Event Hubs / IoT Hub -> ADLS Gen2 bronze -> Databricks (Lakeflow pipelines + jobs) -> silver/gold Delta -> Databricks SQL / Power BI / ML / APIs
    »»»
    Governed by Unity Catalog (+ Purview enterprise-wide), secured with Entra ID (formerly Azure AD), private endpoints and Key Vault, monitored with Azure Monitor/Log Analytics. Cummins-style flow: devices/plants → IoT Hub/Event Hubs → bronze (Auto Loader or Event Hubs Capture) → Databricks → gold → Power BI/SQL/ML; ADF for on-prem and SaaS copies via self-hosted IR.

    ## Azure Data Factory
    - **Pipelines** of **activities** (Copy, Data Flow, Databricks notebook/job, stored procedure, web, ForEach, If, Lookup).
    - **Linked services** + **datasets**; **integration runtimes**: Azure IR, **self-hosted IR** (on-prem/private networks), SSIS IR.
    - **Triggers:** schedule, **tumbling window** (dependencies and backfill), storage events.
    - Strengths: 100+ connectors, metadata-driven copy at scale, hybrid connectivity. Weakness: complex logic in a GUI.
    - **ADF vs Databricks:** ADF moves and orchestrates (copy, triggers, lookups, simple mapping data flows, alerts); Databricks transforms, streams and does ML. Common: ADF copies, then triggers Databricks jobs.

    ## Azure Databricks (details in the next topic)
    Workspaces; clusters/job clusters/SQL warehouses/serverless; Delta; **Unity Catalog** («catalog.schema.table», fine permissions, lineage, tags, row filters/column masks, volumes); **Workflows/Jobs** (multi-task, retries, parameters, repair runs); **Lakeflow Declarative Pipelines** (formerly DLT: tables + expectations, managed dependencies and quality metrics); **Auto Loader**; Git folders and **Asset Bundles**; MLflow, feature engineering, model serving, vector search.

    **Event Hubs specifics:** partitions fixed at creation in Standard (Premium/Dedicated allow increases); throughput units; **Capture** to ADLS in Avro/Parquet; **Kafka endpoint** so Spark's Kafka source works with a SASL connection string (or OAuth).

    **Microsoft Fabric:** SaaS on **OneLake** (one logical lake, Delta): Data Factory, Spark, Warehouse, Real-Time Intelligence, Power BI in one capacity-based product; increasingly common in Microsoft shops.

    **Environments:** separate dev/test/prod workspaces, storage and UC catalogs; Terraform/Bicep for infrastructure, Asset Bundles/Terraform for jobs; CI/CD via Azure DevOps or GitHub Actions with tests; promote via PRs.

    **Interview:** design an Azure lakehouse (the flow above with reasons); ADF vs Databricks; Unity Catalog (central permissions, lineage, discovery, audit); Auto Loader (incremental file ingestion with schema handling).
  `),

  databricks: T(`
    > **In one line:** Databricks is a managed lakehouse on Azure/AWS/GCP built on Spark, Delta and **Unity Catalog**. A DE 1 should know the **compute types** and when each pays off, how **jobs** are built and deployed, how **UC** governs data, and the ingestion tools (**Auto Loader**, **Lakeflow Declarative Pipelines / DLT**).

    **Architecture:** **control plane** (Databricks: UI, notebooks, scheduler, cluster manager, UC metadata); **compute plane** in **your** subscription (classic) or Databricks' account (**serverless**); data stays in **your** storage (ADLS). Several workspaces (dev/test/prod) attach to one UC **metastore per region**.

    | Compute | For | Notes |
    |---|---|---|
    | All-purpose | Interactive dev | Shared, billed while running: **auto-termination** |
    | Job cluster | Scheduled production | Per run; cheaper DBU rate |
    | SQL warehouse (pro/serverless) | BI, dashboards, dbt | Photon, autoscaling, result cache |
    | Serverless jobs/notebooks | Jobs without cluster tuning | Fast start |
    | Instance pools | Faster starts | Pre-warmed VMs |
    **Photon:** vectorised C++ engine for SQL/DataFrames (scans, joins, aggregations); doesn't speed Python UDFs. **Autoscaling** + spot workers (not driver) cut cost; streaming autoscales poorly (DLT enhanced autoscaling or fixed). **Cluster policies** restrict node types, sizes and tags.

    ## Unity Catalog
    - «catalog.schema.table» («prod.warranty.claims_silver»); catalogs per environment and/or domain.
    - **Securables:** catalogs, schemas, tables, views, **volumes** (files), functions, models, **external locations + storage credentials** (managed identity to ADLS paths).
    - **Managed tables** (UC owns storage: DROP deletes data) vs **external** (your path: DROP removes metadata).
    - **Grants** in SQL («GRANT SELECT ON TABLE … TO warranty_analysts»), inherited down the hierarchy; ownership.
    - **Row filters and column masks** (functions on tables): dealers see only their rows; PII masked unless in a group.
    - Automatic **column-level lineage**; audit logs; tags; **system tables** («system.billing.usage», «system.access.audit», «system.lakeflow» runs) for cost/ops.
    - **Delta Sharing** to other organisations without copying.

    ## Ingestion
    - **Auto Loader** («readStream.format('cloudFiles')»): tracks processed files in its checkpoint (RocksDB) so each file loads once. Discovery: **directory listing** (simple, incremental) or **file notification** (Event Grid + queue; millions of files). Schema inference/evolution with «cloudFiles.schemaLocation»: a new column stops the stream for a restart with the evolved schema («addNewColumns»), and mismatched values land in «_rescued_data», so nothing is silently lost. Continuous or «availableNow» incremental batch.
    - «COPY INTO»: idempotent SQL batch load (skips loaded files); thousands of files, not millions.
    - **Lakeflow Connect** / partner connectors (Salesforce, SQL Server CDC).
    - **Lakeflow Spark Declarative Pipelines** (formerly **DLT**; core open-sourced as Apache Spark Declarative Pipelines in 4.1): streaming tables and materialized views in SQL/Python with managed dependencies, checkpoints, retries, autoscaling and **expectations** («CONSTRAINT valid_amount EXPECT (amount >= 0) ON VIOLATION DROP ROW | FAIL UPDATE») plus quality metrics. **AUTO CDC** (successor of «APPLY CHANGES INTO») handles CDC ordering, deletes and SCD 1/2 (a Databricks feature, not open-source SDP). Interviewers may still say "DLT".

    ## Orchestration and deployment
    - **Lakeflow Jobs:** DAGs of tasks (notebook, wheel, SQL, dbt, pipeline), task values, retries, timeouts, triggers (schedule, **file arrival**, **table update**, continuous), parameters, **repair run** (re-run only failed tasks).
    - **Asset Bundles** (YAML + code in Git) deploy jobs/pipelines/config per environment from CI/CD («databricks bundle deploy -t prod»): the answer to "notebook to prod".
    - Airflow/ADF can trigger Databricks jobs.
    - Secret scopes (Key Vault-backed); **service principals** for production jobs, not personal accounts or hard-coded tokens.

    **Interview:** all-purpose vs job cluster vs SQL warehouse; UC and dealer row-only access (row filter); how Auto Loader tracks files and handles new columns; dev → prod deployment (bundles + CI/CD).
  `),

  iac: T(`
    > **In one line:** production platforms are built from **code**: infrastructure (storage, workspaces, cluster policies, networks, permissions) with **Terraform/Bicep**, pipelines as **bundles/DAG code**, promoted **dev → test → prod** by CI/CD, with **secrets in a vault** and **identities per environment**. Portal clicking doesn't survive audits, disasters or team growth.

    | Environment | Purpose | Data |
    |---|---|---|
    | Dev | Build, experiment | Samples, synthetic, masked copies |
    | Test/QA/staging | Integration and UAT on prod-like data and config | Masked snapshot or controlled full copy |
    | Prod | Serves the business | Real |
    - **Same code, different config** (catalog names, paths, cluster sizes, schedules, alert routes).
    - **Isolation:** separate workspaces/catalogs/storage; prod write access only for CI/CD-deployed service principals.
    - **Promotion:** a merged PR builds an artifact **once**; the same artifact goes to test, is validated, then prod (approval gates).

    ## Infrastructure as code
    - **Terraform** (multi-cloud, Databricks provider; Bicep/ARM for Azure-only): declare, «terraform plan» shows the diff, «apply» makes it so.
    - **State file:** remote (Azure Storage with locking), never hand-edited, no secrets committed in it.
    - **Drift:** a portal change appears in the next plan → import it into code or let apply revert it.
    - **Modules** for repeatable patterns (a "data product workspace").
    - DE typically codifies containers, UC catalogs/schemas/grants, external locations, cluster policies, jobs (bundles), Key Vault references, Event Hubs/Kafka topics, monitoring alerts.

    **Secrets and identity:** secrets (DB passwords, API keys, SAS tokens) in **Key Vault**/Secrets Manager, referenced by Databricks secret scopes (redacted in output); prefer **managed identities / service principals with OIDC federation** (nothing to leak or rotate); least privilege per environment; prod identities unusable from dev; rotate; secret scanning in Git.

    **Interview:** dev → prod (artifact once, config per environment, CI/CD with gates); where source DB credentials live (Key Vault via secret scope, or managed identity); someone changed a cluster setting in the UI (plan shows drift → codify or revert).
  `),

  cost: T(`
    > **In one line:** every cloud design decision is a **cost** decision. Bills come mainly from **compute**, then **storage**, **data movement** and **requests**. FinOps = making cost **visible, attributable and optimised** without hurting SLAs.

    | Driver | Typical waste | Fix |
    |---|---|---|
    | Idle compute | All-purpose clusters/warehouses overnight | Auto-terminate/suspend, job clusters, serverless |
    | Over-sized | 50 nodes for a 10-node job | Right-size from metrics; sane autoscale max |
    | Recomputing | Full rebuilds every run | Incremental processing, pruning |
    | Over-scanning | «SELECT *», no partition filters (pay-per-scan) | Prune columns/partitions, clustering, aggregates |
    | Small files | Requests, slow jobs | Compaction, better write sizes |
    | Never deleting | Raw history, old Delta versions, copies | Lifecycle tiers, VACUUM, retention, remove copies |
    | Egress | Reading across regions/clouds | Co-locate compute and storage; replicate deliberately |
    | Always-on streaming | 24/7 cluster for hourly needs | availableNow / scheduled incremental |
    | On-demand for steady load | No reservations | Reserved instances, savings plans, committed use |
    | Unused premium features | Top SKU for everyone | Match tiers to needs |
    Also: spot for fault-tolerant batch; Photon where it pays.

    ## Practices
    - **Attribute first:** tag every resource/job (team, pipeline, environment) → chargeback/showback; Databricks «system.billing.usage» joined to job runs = cost per pipeline per day. You can't optimise what you can't attribute.
    - Budgets and alerts (subscription/workspace; Snowflake resource monitors; Databricks budget policies).
    - Cost-per-pipeline/table dashboards; review the **top 10** jobs and queries regularly. **FinOps trap:** optimising a 2% line while a forgotten all-purpose cluster runs 24/7.
    - **Unit economics:** cost per million events, per report refresh, per GB processed: turns "make it cheaper" into targets.
    - Design reviews include cost estimates (compute hours × price).

    **Trade-off:** a cheaper job that misses the 06:00 SLA costs more in business impact → optimise **cost per outcome within SLA**.

    **Interview:** "Databricks bill doubled" (usage by job/cluster/tag, idle clusters, autoscaling, full vs incremental, new jobs, data growth, bad queries → job clusters, right-sizing, incremental, compaction, schedules); designing for cost efficiency.
  `),
};
