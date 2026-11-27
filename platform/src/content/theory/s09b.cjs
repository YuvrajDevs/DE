const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Cloud data warehouses
  clouddw: T(`
    > **In one line:** cloud data warehouses (Snowflake, Google BigQuery, Amazon Redshift, Azure Synapse dedicated pools / Fabric Warehouse, Databricks SQL) are **managed, massively parallel, columnar SQL engines** that separate storage from compute, scale elastically and bill by usage.

    ## How they work
    - **Storage:** columnar, compressed, in cloud object storage (proprietary micro-partitions or open formats); metadata with min/max statistics for pruning.
    - **Compute:** MPP clusters/virtual warehouses/slots that scan storage in parallel; can be resized, multiplied for concurrency, suspended when idle.
    - **Services layer:** optimiser, metadata, security, transactions, caching (result cache, local SSD cache).

    ## The main players at a glance
    | | Compute model | Billing | Notable |
    |---|---|---|---|
    | **Snowflake** | Virtual warehouses (T-shirt sizes), multi-cluster for concurrency | Credits per second of warehouse time + storage | Zero-copy cloning, time travel, data sharing, Streams & Tasks, Iceberg tables |
    | **BigQuery** | Serverless slots | Per TB scanned (on-demand) or reserved slots | Partitioning + clustering to cut scan cost; nested/repeated columns |
    | **Redshift** | Provisioned clusters (RA3 managed storage) or serverless | Node-hours or RPUs | Sort/distribution keys, Spectrum to query S3 |
    | **Synapse dedicated / Fabric Warehouse** | MPP distributions (Synapse) / serverless capacity (Fabric) | DWUs / capacity units | Azure integration, Power BI, OneLake (Fabric) |
    | **Databricks SQL** | SQL warehouses on Delta tables | DBUs | Lakehouse: same tables used by Spark and ML |

    ## Performance levers (vendor-neutral)
    - **Prune data:** partitioning/clustering on common filters; avoid functions on filter columns; select only needed columns (never SELECT * on wide tables, especially in pay-per-scan engines).
    - **Distribute/co-locate for joins:** distribution keys (Redshift/Synapse), clustering keys.
    - **Materialise heavy logic:** incremental models, materialised views, aggregate tables.
    - **Workload isolation:** separate warehouses/pools for ELT, BI and ad-hoc.
    - **Caching:** result cache for repeated dashboard queries.
    - **Statistics** up to date.

    ## Cost control
    Auto-suspend idle compute; right-size warehouses; resource monitors/budgets and alerts; query timeouts; per-team chargeback; avoid full rebuilds; monitor the most expensive queries weekly.

    ## Warehouse vs lakehouse (today's honest view)
    The lines are blurring: warehouses read open table formats (Snowflake/BigQuery with Iceberg), lakehouses offer warehouse-grade SQL (Databricks SQL, Fabric). Choose by team skills, workloads (BI-heavy vs engineering/ML-heavy), existing contracts, governance and cost.

    ## How interviewers test this
    - "How does a cloud warehouse separate storage and compute and why does it matter?"
    - "How do you reduce BigQuery/Snowflake cost?"
    - "Distribution key vs sort key (Redshift/Synapse)?" Co-locate join rows on the same node vs order data for pruning.
  `, {
    check: [
      mcq('In BigQuery on-demand pricing, which change most directly cuts cost for a dashboard query?', ['Adding more columns to SELECT', 'Partitioning and clustering on the filter columns and selecting only needed columns, so fewer bytes are scanned', 'Using SELECT *', 'Running it more often'], 1, 'You pay per byte scanned.'),
      mcq('Snowflake virtual warehouse sits idle at night. Best practice?', ['Leave it running', 'Auto-suspend after a short idle period (auto-resume on demand)', 'Delete it each night', 'Make it larger'], 1, 'Idle compute is the classic waste.'),
      tf('Running ELT jobs and executive dashboards on separate compute avoids them slowing each other down.', true, 'Workload isolation.'),
    ],
  }),

  // ================================================================== Clusters, scalability, elasticity
  clusters: T(`
    > **In one line:** in the cloud, processing clusters are **created on demand, sized for the job, autoscaled while running and deleted afterwards**. **Scalability** is the ability to handle more load by adding resources; **elasticity** is doing it **automatically, up and down**, so you pay only for what you use. This is what the posting means by "clustered compute cloud-based implementation".

    ## Cluster types (Databricks terms; similar elsewhere)
    | Type | Lifetime | Use |
    |---|---|---|
    | **Job cluster** | Created for a job run, terminated after | Scheduled production pipelines: isolated, cheaper |
    | **All-purpose / interactive** | Long-lived, shared | Notebooks, development, exploration |
    | **SQL warehouse** | On demand with auto-stop | BI and SQL workloads |
    | **Serverless** | Managed by the provider, starts in seconds | Spiky workloads without cluster management |
    | **Pools** | Pre-warmed idle instances | Faster cluster start times |

    ## Sizing a cluster
    - **Worker node type:** memory-optimised for big joins/caches, compute-optimised for CPU-heavy transforms, storage-optimised (local SSD) for heavy shuffles/caching.
    - **Workers:** total cores ≈ desired parallel tasks; start from data size per run (input GB ÷ ~128 MB per task ÷ waves you accept).
    - **Driver:** modest unless collecting/broadcasting a lot.
    - **Autoscaling range:** min for steady state, max as a cost guardrail.
    - **Spot/preemptible workers** for cheaper batch (with on-demand driver and some on-demand workers for stability).
    - **Runtime version** pinned for reproducibility; upgraded deliberately.

    ## Autoscaling in practice
    - Scales out when tasks are pending, in when executors are idle (Spark dynamic allocation / Databricks optimized autoscaling).
    - Works well for batch with varying stages; streaming needs special handling (enhanced autoscaling for Delta Live Tables / careful settings).
    - Limits: node start time (minutes), cloud quotas, shuffle data on removed nodes (decommissioning handles it).

    ## Deploying clusters as code
    Cluster and job definitions belong in version control: **Databricks Asset Bundles**, Terraform, ARM/Bicep, CloudFormation. Then dev/test/prod are reproducible and changes are reviewed. This is "implement and automate deployment of a distributed system" from the posting.

    ## Edge cases and what goes wrong
    - **All jobs on one big all-purpose cluster:** noisy neighbours, no isolation, paying 24/7.
    - **Autoscaling max too high:** a bad query scales to 200 nodes.
    - **Spot interruptions** during long stages without retries/decommissioning.
    - **Cluster start time** too slow for frequent short jobs: use pools or serverless.
    - **Library conflicts** on shared clusters; per-job environments fix it.

    ## How interviewers test this
    - "Job cluster vs all-purpose cluster?"
    - "How would you size a cluster for a 500 GB nightly job?"
    - "Scalability vs elasticity?"
    - "How do you deploy clusters and jobs reproducibly?" Infrastructure/config as code with CI/CD.
  `, {
    check: [
      match('Match the cluster type to its use.', [['Job cluster', 'Scheduled production pipeline, terminated after the run'], ['All-purpose cluster', 'Interactive notebooks and development'], ['SQL warehouse', 'BI and SQL queries'], ['Pool', 'Pre-warmed instances for faster starts']], 'Isolation and cost depend on the right type.'),
      tf('Elasticity means resources scale automatically both up and down with demand.', true, 'Scalability is the capacity to grow; elasticity is doing it automatically.'),
      mcq('Why set a maximum on autoscaling?', ['Spark requires it', 'As a cost and blast-radius guardrail against runaway queries', 'To make jobs faster', 'It is not useful'], 1, 'Unbounded autoscaling can be very expensive.'),
    ],
  }),

  // ================================================================== Cloud security
  cloudsec: T(`
    > **In one line:** cloud data security is layered: **identity and access** (who can do what), **network** (where traffic can flow), **encryption** (data unreadable without keys), **secrets management**, **data-level controls** (masking, row/column security) and **monitoring/audit**. Most real breaches are misconfigurations, not clever attacks.

    ## The layers
    | Layer | Practices |
    |---|---|
    | **Identity (IAM)** | Single directory (Microsoft Entra ID); groups and roles, not individuals; **least privilege**; **managed identities / service principals** for pipelines (no personal accounts, no shared keys); MFA; regular access reviews |
    | **Authorisation (RBAC/ABAC)** | Roles on storage/workspaces; catalog-level grants on catalogs, schemas, tables; attribute/tag-based policies for PII |
    | **Network** | Private endpoints / private links; no public access to storage and databases; VNet injection for compute; firewalls; egress control |
    | **Encryption** | At rest (provider-managed or **customer-managed keys** in Key Vault/KMS); in transit (TLS); column-level encryption for highly sensitive fields |
    | **Secrets** | **Azure Key Vault**, AWS Secrets Manager; secret scopes in Databricks; never in code, notebooks, Git or logs; rotate |
    | **Data-level** | Masking (show «XXXX-1234»), row-level security (dealers see their rows), column-level permissions, tokenisation/pseudonymisation |
    | **Monitoring & audit** | Access logs, query history, alerts on unusual access, Defender/GuardDuty, audit trails for compliance |
    | **Governance & compliance** | Classification of data (public, internal, confidential, restricted), retention, data residency, **export control** restrictions |

    ## Principles
    - **Least privilege**: grant the minimum needed, for the shortest time.
    - **Defence in depth**: assume one layer fails.
    - **Zero trust**: verify every request; network location is not trust.
    - **Separation of environments**: prod data not copied into dev without masking.
    - **Automate**: policies and permissions as code, reviewed in pull requests.

    ## Edge cases and what goes wrong
    - Public storage containers or SAS tokens with long expiry shared in chat.
    - Account keys hard-coded in notebooks committed to Git.
    - Everyone added to an "admin" group "temporarily".
    - Prod PII copied to a dev workspace for testing.
    - Logs that print connection strings or personal data.
    - Service principal secrets that never rotate.

    ## How interviewers test this
    - "How would you secure a data lake on Azure?" Entra ID + RBAC/catalog grants, managed identities, private endpoints, encryption with Key Vault, secrets management, masking/RLS, monitoring.
    - "How should a pipeline authenticate to storage?" Managed identity/service principal with least privilege; never personal credentials or keys in code.
  `, {
    check: [
      mcq('How should a scheduled pipeline authenticate to ADLS?', ['With the storage account key pasted into the notebook', 'With a managed identity or service principal granted least-privilege access, secrets (if any) in Key Vault', 'With the developer\'s personal account', 'Anonymous public access'], 1, 'No personal credentials or keys in code.'),
      multi('Which are security misconfigurations?', ['A public blob container holding customer data', 'A SAS token valid for 2 years shared in a chat', 'Private endpoints for storage', 'Production PII copied unmasked to dev'], [0, 1, 3], 'Private endpoints are a good practice.'),
      tf('Row-level security can let each dealer see only their own claims in the same table.', true, 'Data-level controls complement access to the whole table.'),
    ],
  }),

  // ================================================================== Azure vs AWS vs GCP
  clouds: T(`
    > **In one line:** the three big clouds offer equivalent building blocks under different names. Know the **mapping** so you can talk about any of them, and know Azure best for a Microsoft-centric enterprise.

    ## Service mapping for data engineering
    | Need | Azure | AWS | GCP |
    |---|---|---|---|
    | Object storage / data lake | Blob Storage, **ADLS Gen2** | S3 | Cloud Storage |
    | Spark platform | **Azure Databricks**, Synapse Spark, Fabric, HDInsight | EMR, Databricks on AWS, Glue (Spark) | Dataproc, Databricks on GCP |
    | Data warehouse | Synapse dedicated pools, **Fabric Warehouse**, Databricks SQL | Redshift | BigQuery |
    | Ingestion / ETL service | **Azure Data Factory**, Fabric Data Factory | Glue, DMS (CDC), AppFlow | Dataflow (Beam), Datastream (CDC), Data Fusion |
    | Streaming ingestion | **Event Hubs** (Kafka API), IoT Hub | Kinesis, MSK (managed Kafka) | Pub/Sub, managed Kafka |
    | Stream processing | Stream Analytics, Databricks, Fabric RTI | Kinesis Data Analytics (Flink), EMR | Dataflow |
    | Orchestration | ADF pipelines, Databricks Workflows, managed Airflow | MWAA (Airflow), Step Functions | Cloud Composer (Airflow) |
    | Catalog / governance | **Microsoft Purview**, Databricks **Unity Catalog** | Glue Data Catalog, Lake Formation | Dataplex, Data Catalog |
    | Relational DB | Azure SQL, PostgreSQL/MySQL flexible server | RDS, Aurora | Cloud SQL, AlloyDB, Spanner |
    | NoSQL | **Cosmos DB** (multi-API) | DynamoDB, Keyspaces (Cassandra) | Firestore, Bigtable |
    | BI | **Power BI** | QuickSight | Looker |
    | Secrets | Key Vault | Secrets Manager / KMS | Secret Manager / KMS |
    | Identity | Microsoft Entra ID | IAM | Cloud IAM |
    | IaC | Bicep/ARM, Terraform | CloudFormation, CDK, Terraform | Deployment Manager, Terraform |
    | IoT | IoT Hub, IoT Edge | IoT Core/Greengrass | (partners) |
    | Bulk/offline transfer | Data Box, AzCopy | Snowball, DataSync | Transfer Appliance, Storage Transfer |

    ## How to talk about it
    "I built X on Databricks with Delta on cloud object storage; on Azure that maps to ADLS Gen2 + Azure Databricks + ADF/Workflows + Unity Catalog/Purview + Power BI." Concepts transfer; names change.

    ## How interviewers test this
    - "What Azure services would you use for a lakehouse?" ADLS Gen2, Databricks, ADF, Event Hubs/IoT Hub, Unity Catalog/Purview, Key Vault, Power BI, Azure Monitor.
    - "What is the AWS equivalent of ADLS / Event Hubs / Data Factory?" S3 / Kinesis or MSK / Glue (+ DMS, Step Functions).
  `, {
    check: [
      match('Match the Azure service to its AWS equivalent.', [['ADLS Gen2', 'S3'], ['Event Hubs', 'Kinesis / MSK'], ['Azure Data Factory', 'AWS Glue (+ DMS)'], ['Cosmos DB', 'DynamoDB'], ['Key Vault', 'Secrets Manager / KMS']], 'Same building blocks, different names.'),
      mcq('Which Azure service can accept producers using the Kafka protocol without running Kafka brokers yourself?', ['Azure SQL', 'Event Hubs', 'Purview', 'Key Vault'], 1, 'Event Hubs exposes a Kafka-compatible endpoint.'),
      tf('BigQuery is Google Cloud\'s serverless data warehouse.', true, 'Billed by bytes scanned or reserved slots.'),
    ],
  }),

  // ================================================================== Azure stack and Databricks
  azure: T(`
    > **In one line:** a typical Azure data platform is **ADLS Gen2** (storage) + **Azure Databricks** (Spark, Delta, SQL, ML) + **Azure Data Factory** (ingestion/orchestration) + **Event Hubs / IoT Hub** (streaming) + **Unity Catalog / Microsoft Purview** (governance) + **Key Vault** (secrets) + **Power BI** (consumption), deployed with **IaC and CI/CD**. Microsoft Fabric is the newer all-in-one SaaS option.

    ## The reference architecture
    «««flow
    Sources (SAP/ERP, CRM, plant DBs, IoT, files) -> ADF / Event Hubs / IoT Hub -> ADLS Gen2 (bronze) -> Databricks (Spark, Delta Live Tables, Workflows) -> silver/gold Delta tables -> Databricks SQL / Power BI / ML / APIs
    »»»
    Governed by Unity Catalog (+ Purview for enterprise-wide cataloguing), secured with Entra ID, private endpoints and Key Vault, monitored with Azure Monitor/Log Analytics.

    ## Azure Data Factory (ADF)
    - **Pipelines** of **activities** (Copy, Data Flow, Databricks notebook/job, stored procedure, web, ForEach, If, Lookup).
    - **Linked services** (connections) and **datasets**; **integration runtimes**: Azure IR (cloud), **self-hosted IR** (on-prem/private networks), SSIS IR.
    - **Triggers:** schedule, tumbling window (with dependencies and backfill), storage events.
    - Strength: 100+ connectors, metadata-driven copy at scale, hybrid connectivity. Weakness: complex logic in a GUI; keep heavy transforms in Databricks.

    ## Azure Databricks
    - **Workspaces**, **clusters/job clusters/SQL warehouses/serverless**.
    - **Delta Lake** tables; **Unity Catalog** (three-level namespace «catalog.schema.table», fine-grained permissions, lineage, tags, row filters and column masks, volumes for files).
    - **Workflows (Jobs):** multi-task orchestration with retries, parameters, repair runs.
    - **Delta Live Tables / Lakeflow Declarative Pipelines:** declare tables and expectations (data quality rules); Databricks manages dependencies, incremental processing and quality metrics.
    - **Auto Loader:** incremental file ingestion with schema inference/evolution and rescued data.
    - **Repos / Git folders**, **Asset Bundles** for CI/CD.
    - **MLflow**, feature engineering, model serving, vector search for GenAI.

    ## Microsoft Fabric (awareness)
    SaaS analytics platform on **OneLake** (one logical lake, Delta format): Data Factory, Data Engineering (Spark), Warehouse, Real-Time Intelligence, Power BI in one capacity-based product. Increasingly common in Microsoft-centric companies.

    ## Deployment and environments
    - Separate dev/test/prod workspaces and storage; Unity Catalog catalogs per environment.
    - IaC (Terraform/Bicep) for infrastructure; Asset Bundles or Terraform for jobs; CI/CD with Azure DevOps or GitHub Actions; tests in CI; promote via pull requests.

    ## How interviewers test this
    - "Design an Azure lakehouse." The reference architecture with reasons.
    - "ADF vs Databricks: which does what?" ADF for connectivity/copy/orchestration across systems; Databricks for transformation, streaming and ML.
    - "What is Unity Catalog?" Centralised governance: permissions, lineage, discovery, auditing across workspaces.
    - "What is Auto Loader?" Incremental, scalable file ingestion with schema handling.
  `, {
    check: [
      mcq('Which ADF component lets it reach a database inside a plant\'s private network?', ['Azure IR', 'Self-hosted integration runtime', 'Mapping data flow', 'A tumbling window trigger'], 1, 'Installed inside the private network, it connects outbound securely.'),
      mcq('What is Unity Catalog?', ['A Spark optimiser', 'Databricks\' central governance layer: catalog.schema.table namespace, permissions, lineage, tags, row/column controls and audit', 'A file format', 'A BI tool'], 1, 'Governance across workspaces.'),
      tf('Auto Loader incrementally ingests new files from cloud storage and can handle schema evolution with a rescued-data column.', true, 'It tracks processed files so each is ingested once.'),
      match('Match the Azure service to its role.', [['ADLS Gen2', 'Lake storage'], ['Azure Databricks', 'Spark, Delta, SQL and ML'], ['Azure Data Factory', 'Ingestion and cross-system orchestration'], ['Event Hubs', 'Streaming ingestion'], ['Power BI', 'Dashboards and semantic models']], 'The typical Azure stack.'),
    ],
  }),

  // ================================================================== Cloud cost
  cost: T(`
    > **In one line:** in the cloud, every design decision is also a **cost** decision. Data platform bills come mainly from **compute** (clusters, warehouses), then **storage**, **data movement** and **requests**. FinOps means making cost **visible, attributable and optimised** without hurting SLAs.

    ## Where the money goes
    | Driver | Typical waste | Fix |
    |---|---|---|
    | Idle compute | All-purpose clusters/warehouses running overnight | Auto-terminate/suspend, job clusters, serverless |
    | Over-sized compute | 50 nodes for a job that needs 10 | Right-size from metrics; autoscaling with sane max |
    | Recomputing everything | Full rebuilds of huge tables each run | Incremental processing, partition pruning |
    | Scanning too much | SELECT *, no partition filters (pay-per-scan engines) | Prune columns/partitions, clustering, aggregates |
    | Small files | Request costs, slow jobs | Compaction, better write sizes |
    | Data never deleted | Raw history, old Delta versions, duplicate copies | Lifecycle tiers, VACUUM, retention policies, remove copies |
    | Egress / cross-region | Reading data in another region/cloud | Co-locate compute and storage; replicate deliberately |
    | Always-on streaming | 24/7 cluster for data needed hourly | availableNow / scheduled incremental |
    | On-demand prices for steady load | No reservations | Reserved instances/savings plans, committed use |
    | Premium features unused | Everyone on the most expensive SKU | Match tiers to needs |

    ## Practices
    - **Tagging/labelling** every resource and job with team, project, environment → **chargeback/showback**.
    - **Budgets and alerts** at subscription/workspace level; Snowflake resource monitors; Databricks budget policies.
    - **Cost per pipeline / per table** dashboards; review the top 10 most expensive jobs and queries regularly.
    - **Spot/preemptible** capacity for fault-tolerant batch.
    - **Design reviews include cost estimates** (back-of-envelope compute hours × price).

    ## Trade-offs
    Cheaper isn't always better: a slower but cheaper job that misses the 06:00 SLA costs more in business impact. Optimise **cost per outcome** within SLA.

    ## How interviewers test this
    - "Your Databricks bill doubled. How do you investigate?" Usage by job/cluster/tag, idle clusters, autoscaling, full vs incremental runs, new jobs, data growth, inefficient queries; then fix with job clusters, right-sizing, incremental logic, compaction, schedules.
    - "How do you design a pipeline to be cost-efficient?"
  `, {
    check: [
      multi('Which usually reduce cloud data platform cost?', ['Auto-terminating idle clusters', 'Incremental processing instead of full rebuilds', 'Partition pruning and selecting only needed columns', 'Running every job on the largest cluster'], [0, 1, 2], 'Right-size instead of maximising.'),
      mcq('A streaming job runs 24/7 but consumers only look at the data hourly. Cheaper design with the same code?', ['Keep it running', 'Schedule it hourly with trigger(availableNow=True)', 'Rewrite in SQL', 'Use a bigger cluster'], 1, 'Streaming semantics, batch cost.'),
      tf('Tagging resources by team and project enables chargeback and makes cost owners visible.', true, 'You cannot optimise what you cannot attribute.'),
    ],
  }),
};
