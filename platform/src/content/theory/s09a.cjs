const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Cloud computing
  cloudwhat: T(`
    > **In one line:** cloud computing means **renting computing resources (servers, storage, databases, networks, software) on demand over the internet**, paying for what you use, instead of buying and running your own hardware. For data platforms it brings **elastic scale, separation of storage and compute, managed services and pay-per-use**.

    ## What changes compared with on-premises
    | On-premises | Cloud |
    |---|---|
    | Buy hardware for peak load, months ahead | Provision in minutes, scale up and down |
    | Capital expense (CapEx) | Operating expense (OpEx), per second/hour/GB |
    | You run everything (power, hardware, patching) | Provider runs the infrastructure; managed services run software too |
    | Storage and compute in the same machines | Object storage separate from elastic compute |
    | Fixed capacity | Elastic: autoscaling, serverless |

    ## Core characteristics (NIST definition, in plain words)
    On-demand self-service, broad network access, resource pooling (multi-tenant), rapid elasticity, measured service (pay per use).

    ## What it means for data engineering
    - **Data lakes on object storage** (S3, ADLS, GCS): cheap, durable, unlimited.
    - **Ephemeral compute:** spin up a Spark cluster for a job, shut it down after (job clusters, serverless).
    - **Managed services** for everything: warehouses, Kafka-like streaming, orchestration, catalogs, ML.
    - **Global reach:** regions and availability zones for resilience and data residency.
    - **New responsibilities:** cost management (FinOps), identity and access (IAM), network security, shared-responsibility security.

    ## Regions and availability zones
    - **Region:** a geographic area (e.g. Central India, West Europe) with several datacentres.
    - **Availability zone (AZ):** physically separate datacentre(s) within a region with independent power/network. Spread critical systems across AZs.
    - **Data residency/sovereignty:** where data may legally live (and export-control rules) decides region choice.

    ## The shared responsibility model
    The provider secures the **cloud** (physical, hypervisor, managed service internals); you secure what you put **in** the cloud (data, identities, access policies, network configuration, encryption choices). The more managed the service, the more the provider handles.

    ## Edge cases and what goes wrong
    - **Runaway costs:** clusters left running, unbounded autoscaling, expensive queries, cross-region egress.
    - **Misconfigured access:** public storage buckets are a classic data leak.
    - **Vendor lock-in** with proprietary services; mitigated by open formats (Parquet/Delta/Iceberg) and portable tools (Spark, Airflow, dbt).
    - **Service limits/quotas** hit during scale-out.

    ## How interviewers test this
    - "What are the benefits of the cloud for a data platform?" Elasticity, decoupled storage/compute, managed services, pay-per-use.
    - "Region vs availability zone?"
    - "What is the shared responsibility model?"
  `, {
    check: [
      mcq('What is the biggest architectural change cloud brings to data platforms?', ['Faster CPUs', 'Storage (object storage) separated from elastic compute that can be started and stopped independently', 'No need for SQL', 'Free storage'], 1, 'Decoupling enables ephemeral clusters and many engines on one copy of data.'),
      tf('In the shared responsibility model, the cloud provider is responsible for who in your company can read your storage account.', false, 'Identity and access configuration is your responsibility.'),
      mcq('Why spread a critical system across availability zones?', ['Lower cost', 'To survive the failure of one datacentre within the region', 'To comply with SQL standards', 'For faster queries'], 1, 'AZs have independent power and networking.'),
    ],
  }),

  // ================================================================== IaaS, PaaS, SaaS
  iaas: T(`
    > **In one line:** the service models describe **how much the provider manages**: **IaaS** gives you virtual machines and networks (you manage OS and software); **PaaS** gives you a managed platform (you bring code/data); **SaaS** gives you finished software (you just use it). Serverless and managed data services sit at the PaaS end.

    ## The stack and who manages what
    | Layer | On-prem | IaaS | PaaS | SaaS |
    |---|---|---|---|---|
    | Application / data | You | You | You | Provider (you own your data) |
    | Runtime, middleware | You | You | Provider | Provider |
    | Operating system | You | You | Provider | Provider |
    | Virtualisation, servers, storage, network | You | Provider | Provider | Provider |

    ## Examples in data engineering
    | Model | Examples | Typical use |
    |---|---|---|
    | **IaaS** | Azure VMs, EC2, GCE; installing your own Kafka/Hadoop/Airflow on them | Full control, legacy lift-and-shift, special software |
    | **PaaS** | Azure Databricks, Synapse, Data Factory, Event Hubs, Azure SQL, AWS EMR/Glue/MSK, BigQuery, Cloud Composer, managed Airflow | Most modern data platforms |
    | **Serverless** (PaaS without capacity management) | BigQuery, Snowflake (largely), AWS Lambda, Azure Functions, serverless SQL pools, Databricks serverless | Spiky or unpredictable workloads |
    | **SaaS** | Salesforce, SAP SuccessFactors, Power BI service, Fivetran | Business apps; often **sources** of data |

    ## Trade-offs
    - **More managed** → less ops, faster delivery, built-in scaling and HA, but less control, potential lock-in, sometimes higher unit cost.
    - **Less managed (IaaS)** → full control and portability, but you patch, scale, secure and keep it running.
    Rule of thumb: prefer managed services for undifferentiated work (running Kafka, Spark clusters, Airflow) unless a requirement forces control.

    ## How interviewers test this
    - "IaaS vs PaaS vs SaaS with examples."
    - "Would you run Kafka yourself on VMs or use a managed service? Why?"
  `, {
    check: [
      match('Match the example to the service model.', [['Installing Airflow yourself on Azure VMs', 'IaaS'], ['Azure Databricks', 'PaaS'], ['Salesforce CRM', 'SaaS'], ['BigQuery (no clusters to manage)', 'Serverless / PaaS']], 'How much the provider manages.'),
      mcq('In PaaS, who patches the operating system?', ['You', 'The provider', 'Nobody', 'The data team'], 1, 'You bring code and data; the platform is managed.'),
      tf('SaaS applications such as a CRM are common data sources for data engineering pipelines.', true, 'Ingested via APIs, connectors or exports.'),
    ],
  }),

  // ================================================================== Public, private, hybrid
  cloudtypes: T(`
    > **In one line:** **public cloud** = shared provider infrastructure (Azure, AWS, GCP); **private cloud** = cloud-style infrastructure dedicated to one organisation (on-prem or hosted); **hybrid** = both connected; **multi-cloud** = several public providers. Most large manufacturers run **hybrid**: plants and legacy systems on-prem, analytics in the public cloud.

    ## Comparison
    | | Public | Private | Hybrid |
    |---|---|---|---|
    | Ownership | Provider | Organisation | Both |
    | Scale/elasticity | Very high | Limited by your hardware | High for cloud part |
    | Cost model | Pay per use | CapEx + ops | Mixed |
    | Control/compliance | Shared responsibility | Full | Choose per workload |
    | Typical reason | Speed, scale, managed services | Regulation, legacy, latency to factories | Gradual migration, data residency, plant systems |

    ## Hybrid data engineering in practice
    - **Connectivity:** VPN or dedicated links (Azure ExpressRoute, AWS Direct Connect) between plants/datacentres and the cloud.
    - **Self-hosted integration runtimes / gateways** (e.g. ADF self-hosted IR, Power BI gateway) to reach on-prem databases securely.
    - **Edge processing:** factories and engines generate data that is filtered/aggregated at the edge (IoT Edge) before upload.
    - **Large file movement** from on-prem to cloud (see the dedicated topic).
    - **Identity:** one directory (Entra ID / Active Directory) across both.
    - **Data residency and export control:** some data must stay in certain locations or be restricted to authorised people.

    ## Multi-cloud
    Using several providers (e.g. Azure for analytics, AWS for a product team). Benefits: avoid lock-in, best-of-breed services, regulatory needs. Costs: duplicated skills and tooling, egress fees, harder governance. Open formats (Delta/Iceberg/Parquet) and portable tools reduce friction.

    ## How interviewers test this
    - "Public vs private vs hybrid cloud?"
    - "How would you get data from an on-prem plant database into a cloud lakehouse securely?" Private connectivity, self-hosted integration runtime, least-privilege accounts, encryption in transit, incremental extraction.
  `, {
    check: [
      mcq('A plant database must stay on-prem, but analytics run in Azure. What is this setup called?', ['Public cloud only', 'Hybrid cloud', 'SaaS', 'Private cloud only'], 1, 'On-prem and public cloud connected.'),
      mcq('Which typically lets Azure Data Factory reach an on-prem SQL Server securely?', ['Making the database public on the internet', 'A self-hosted integration runtime inside the corporate network, plus private connectivity', 'Emailing CSV exports', 'Copying via USB'], 1, 'Never expose operational databases publicly.'),
      tf('Multi-cloud architectures often increase egress costs and governance complexity.', true, 'Benefits must outweigh duplicated tooling and data movement costs.'),
    ],
  }),

  // ================================================================== Object storage
  objstore: T(`
    > **In one line:** object storage (Amazon S3, Azure Blob Storage / **ADLS Gen2**, Google Cloud Storage) stores data as **objects** (bytes + metadata) addressed by keys inside buckets/containers. It is **cheap, extremely durable, effectively unlimited and accessed over HTTP**, which makes it the foundation of every cloud data lake and lakehouse.

    ## How it works
    - **Container/bucket** → **objects** with keys like «bronze/crm/claims/ingest_date=2026-11-26/part-0001.parquet». "Folders" are key prefixes (except **ADLS Gen2 with hierarchical namespace**, which has real directories, POSIX-like ACLs and atomic renames: important for big data engines).
    - Objects are **immutable**: you replace whole objects, not edit bytes in place.
    - **Durability** from replication/erasure coding across devices and zones (LRS, ZRS, GRS options in Azure).
    - **Strong read-after-write consistency** on S3, Azure and GCS today.
    - **Access tiers:** hot, cool, cold, archive (cheaper storage, higher access cost/latency; archive needs rehydration).
    - **Lifecycle policies:** move or delete objects by age automatically.
    - **Versioning and soft delete:** recover overwritten/deleted objects.
    - **Security:** IAM/RBAC, ACLs, private endpoints, encryption at rest (provider or customer-managed keys) and in transit.

    ## Cost model (what you actually pay for)
    | Item | Note |
    |---|---|
    | Storage GB-month | Depends on tier and redundancy |
    | Requests (PUT, GET, LIST) | Millions of small files = many requests = real money |
    | Data retrieval (cool/archive) | Reading cold data costs extra |
    | Egress | Leaving the region/cloud is charged; inside the same region usually free |
    | Early deletion | Cool/archive tiers have minimum retention periods |

    ## Performance characteristics
    - High **throughput** via parallelism (many concurrent reads); higher **per-request latency** than local disk.
    - LIST operations on huge prefixes are slow → table formats keep file lists in metadata.
    - Request-rate limits per prefix/partition; spread keys (date partitions do this naturally).
    - Large files (100 MB-1 GB) are efficient; tiny files are slow and costly.

    ## For a data engineer
    - Organise by layer and source: «/{layer}/{source}/{entity}/{partition}/».
    - Use **ADLS Gen2 with hierarchical namespace** for analytics on Azure.
    - Apply lifecycle rules for raw data; enable soft delete/versioning for protection.
    - Access via managed identities/service principals, not account keys.
    - Prefer table formats (Delta/Iceberg) over raw folders for anything queried.

    ## How interviewers test this
    - "Why is object storage the base of data lakes?" Cost, durability, scale, decoupling.
    - "ADLS Gen2 vs Blob storage?" Hierarchical namespace: directories, ACLs, atomic rename.
    - "Why do small files cost more in object storage?" Request costs, latency, listing.
  `, {
    check: [
      mcq('What does enabling the hierarchical namespace on ADLS Gen2 add?', ['Faster CPUs', 'Real directories with atomic rename and POSIX-like ACLs, which big data engines benefit from', 'Free egress', 'SQL support'], 1, 'Plain blob storage only simulates folders with key prefixes.'),
      multi('Which drive object storage cost?', ['GB stored per month (by tier)', 'Number of requests (PUT/GET/LIST)', 'Egress out of the region', 'The number of columns in your files'], [0, 1, 2], 'Columns do not matter; bytes, requests and movement do.'),
      tf('Objects in S3/ADLS can be edited in place byte by byte like a local file.', false, 'Objects are replaced whole; table formats rewrite files to update data.'),
    ],
  }),

  // ================================================================== Lake architecture
  lakearch: T(`
    > **In one line:** a cloud **data lake architecture** organises object storage into **zones/layers** (landing, bronze, silver, gold), with **conventions, a catalog, security, lifecycle and table formats**, so that raw data from every source can be stored cheaply and turned into trusted, discoverable datasets without becoming a swamp.

    ## A reference layout
    | Zone | Contents | Format | Access |
    |---|---|---|---|
    | **Landing** (optional) | Files exactly as delivered (SFTP drops, exports) | Original (CSV, JSON, XML, PDF) | Ingestion service only |
    | **Bronze / raw** | Append-only copy of source data + load metadata | Delta (or original + Delta) | Data engineers |
    | **Silver / cleansed** | Deduplicated, typed, validated, conformed, history | Delta/Iceberg | Engineers, analysts, data scientists |
    | **Gold / curated** | Business models, aggregates, data products | Delta/Iceberg | Business users, BI, apps |
    | **Sandbox / lab** | Exploration by data scientists | Any | Owners only, auto-expiring |
    | **Quarantine** | Rejected records | Delta | Engineers |

    ## Design decisions
    - **Storage accounts/containers per layer or per domain** (simplifies access control and cost tracking).
    - **Path conventions:** «abfss://silver@<account>.dfs.core.windows.net/claims/claim_events/».
    - **Partitioning** by date for large tables; clustering for other filters.
    - **Table format** for everything beyond landing (ACID, schema enforcement, time travel).
    - **Catalog** (Unity Catalog, Glue, Purview): every table registered with owner, description, tags.
    - **Security:** RBAC per layer/domain, row/column-level controls in the catalog, private endpoints, encryption, no account keys in code.
    - **Lifecycle:** raw retention rules, archive tiers, vacuum of old table versions.
    - **Environments:** separate dev/test/prod storage and catalogs.

    ## Domain-oriented lakes (data mesh direction)
    Large companies may give each domain (supply chain, quality, finance) its own storage and data products, with central platform standards and a shared catalog: decentralised ownership, central governance.

    ## Edge cases and what goes wrong
    - **Data swamp:** no catalog, no owners, no conventions.
    - **Everyone writes to silver** directly: no contracts, inconsistent quality.
    - **PII in raw zones** open to too many people.
    - **Copies everywhere:** each team creates its own extracts instead of sharing governed tables.
    - **Old table versions never vacuumed:** storage cost grows silently.

    ## How interviewers test this
    - "How would you organise a data lake?" Zones, formats, catalog, security, lifecycle, environments.
    - "How do you prevent a data swamp?"
  `, {
    check: [
      mcq('What is the best protection against a data lake turning into a swamp?', ['More storage', 'A catalog with owners and descriptions, naming conventions, quality-checked layers and access control', 'Only CSV files', 'Fewer users'], 1, 'Governance, not technology alone.'),
      tf('Sandbox/lab areas for exploration should have owners and automatic expiry.', true, 'Otherwise they become permanent shadow copies.'),
      mcq('Who should normally read the bronze/raw layer?', ['All business users', 'Data engineers (and tightly controlled processes), because it is unvalidated and may contain sensitive data', 'Nobody', 'External partners'], 1, 'Consumers read silver/gold.'),
    ],
  }),

  // ================================================================== Table formats
  tableformats: T(`
    > **In one line:** **open table formats** (Delta Lake, Apache Iceberg, Apache Hudi) turn a folder of Parquet files into a reliable **table**: a metadata/transaction layer gives **ACID commits, schema enforcement and evolution, time travel, efficient updates/deletes/MERGE and fast planning** using file statistics. They are what makes a lake a lakehouse.

    ## How they work (common idea)
    - Data stays in **Parquet** files.
    - **Metadata** records which files make up each table **version (snapshot)**, plus schema, partitioning and per-file statistics.
    - **Commits are atomic:** write new files, then atomically publish new metadata. Readers see whole snapshots.
    - **Optimistic concurrency:** concurrent writers check for conflicts at commit time.
    - Old files are kept for time travel until removed (vacuum/expire snapshots).

    ## The three formats
    | | **Delta Lake** | **Apache Iceberg** | **Apache Hudi** |
    |---|---|---|---|
    | Origin | Databricks (2019, Linux Foundation) | Netflix (2018, Apache) | Uber (2016, Apache) |
    | Metadata | «_delta_log» JSON commits + Parquet checkpoints | Metadata files → manifest lists → manifests (tree of snapshots) | Timeline of instants in «.hoodie» |
    | Strengths | Deep Spark/Databricks integration, simple, Change Data Feed, liquid clustering, deletion vectors | Engine-neutral (Spark, Trino, Flink, Snowflake, BigQuery, Athena), hidden partitioning, partition evolution, column IDs | Upsert/streaming-ingestion focus, record-level indexes, merge-on-read tables, incremental pulls |
    | Typical home | Databricks, Microsoft Fabric/Synapse | Multi-engine lakehouses, AWS, Snowflake | Streaming upsert-heavy pipelines |
    Convergence: **Delta UniForm** and similar features let one table be read as Delta, Iceberg and Hudi. The concepts matter more than the brand.

    ## Key features in practice (Delta syntax)
    - **MERGE INTO** for upserts and CDC application.
    - **Time travel:** «SELECT * FROM claims VERSION AS OF 412» / «TIMESTAMP AS OF '2026-11-25'»; «RESTORE TABLE … TO VERSION AS OF …».
    - **Schema enforcement and evolution:** reject mismatched writes; «mergeSchema» to add columns.
    - **OPTIMIZE** (compact small files), **Z-ORDER / liquid clustering** (co-locate related data for skipping).
    - **VACUUM** (delete files no longer referenced and older than retention, default 7 days).
    - **Change Data Feed:** row-level change stream between versions.
    - **Constraints:** NOT NULL, CHECK.
    - **Deletion vectors:** mark deleted rows without rewriting files (merge-on-read).

    ## Copy-on-write vs merge-on-read
    - **Copy-on-write (COW):** updates rewrite affected files; reads are fast; writes heavy for small frequent updates.
    - **Merge-on-read (MOR):** updates written as small delta/delete files merged at read time; writes fast, reads slower until compaction.
    Choose by write/read pattern; compaction reconciles.

    ## Edge cases and what goes wrong
    - **VACUUM with too short retention** breaks time travel and can break long-running readers/streams.
    - **Concurrent MERGEs** on overlapping files fail with conflicts; partition or serialise.
    - **Small files** from streaming → OPTIMIZE regularly (or auto-compaction).
    - **Reading Delta tables as plain Parquet folders** (ignoring the log) shows deleted and uncommitted files.
    - **Mixing engines** with different format versions/features (reader/writer protocol versions).

    ## How interviewers test this
    - "What does Delta Lake add on top of Parquet?"
    - "Delta vs Iceberg vs Hudi?"
    - "What do OPTIMIZE, Z-ORDER and VACUUM do?"
    - "How does time travel work and what limits it?"
  `, {
    check: [
      mcq('A job reads a Delta table\'s folder directly as plain Parquet files, ignoring «_delta_log». What can go wrong?', ['Nothing', 'It also reads files that were logically deleted or never committed, giving wrong results', 'It is faster and correct', 'It fails'], 1, 'Always read through the table format.'),
      match('Match the Delta command to its purpose.', [['OPTIMIZE', 'Compact small files into larger ones'], ['Z-ORDER / liquid clustering', 'Co-locate related values to improve data skipping'], ['VACUUM', 'Delete unreferenced old files after the retention period'], ['RESTORE', 'Roll the table back to an earlier version']], 'Table maintenance basics.'),
      tf('Running VACUUM with a very short retention can break time travel to older versions.', true, 'The files those versions need are deleted.'),
      mcq('Which format is known for hidden partitioning and partition evolution, with broad multi-engine support?', ['Delta Lake', 'Apache Iceberg', 'CSV', 'ORC'], 1, 'Iceberg tracks partition transforms in metadata.'),
    ],
  }),

  // ================================================================== Large file movement
  filemove: T(`
    > **In one line:** moving large files (GBs to TBs, or petabytes) into the cloud reliably means **parallel, chunked, resumable transfers with integrity checks**, over the right channel (internet, private link or physical appliance), with security, cost and validation built in. The posting asks for this explicitly.

    ## The problems at scale
    - A single 200 GB upload over one connection takes hours and restarts from zero if it fails.
    - Networks drop; firewalls time out long connections.
    - Silent corruption is possible (rare, but at TB scale you must check).
    - Bandwidth is finite: 1 Gbps ≈ 125 MB/s ≈ **~10 TB/day at best**; 100 TB over 1 Gbps ≈ 10+ days.
    - Source systems and networks are shared with business traffic.

    ## Techniques
    | Technique | Why |
    |---|---|
    | **Chunking / multipart upload** | Split into parts (e.g. 64-256 MB), upload in parallel, retry only failed parts (S3 multipart, Azure block blobs) |
    | **Parallelism** | Many concurrent streams to saturate bandwidth (AzCopy, rclone, gsutil -m, DistCp) |
    | **Resumability** | Journals/checkpoints so a restart skips completed files/parts |
    | **Integrity checks** | MD5/CRC/SHA-256 per part and file; compare after transfer |
    | **Compression** before transfer | Fewer bytes (if not already compressed); balance CPU |
    | **Throttling / scheduling** | Off-peak windows, bandwidth caps to protect business traffic |
    | **Incremental sync** | Transfer only new/changed files (by name+size+checksum or modified time) |
    | **Completion markers** | «_SUCCESS» or manifest files so downstream never reads partial transfers |

    ## Channels and tools
    | Situation | Tool/approach |
    |---|---|
    | Ad-hoc / scripted bulk copy to Azure | **AzCopy** (parallel, resumable, checksums), Azure Storage Explorer |
    | Orchestrated recurring copies (on-prem → cloud) | **Azure Data Factory** Copy activity with self-hosted integration runtime; AWS DataSync |
    | Hadoop/HDFS to cloud | **DistCp** (MapReduce-parallel copy) |
    | Partner file exchange | **SFTP** endpoints (Azure Blob SFTP, AWS Transfer Family), managed file transfer (MFT) |
    | Private, high-bandwidth link | ExpressRoute / Direct Connect |
    | Hundreds of TB to PB, or slow links | Physical appliances: **Azure Data Box**, AWS Snowball |
    | Streams of small events | Not file transfer: Kafka/Event Hubs |

    ## A reliable large-file ingestion design
    1. Source writes files to a staging folder, then a **manifest** (file names, sizes, checksums, row counts).
    2. Transfer job (AzCopy/ADF) copies files in parallel with retries and checksum verification.
    3. Validate: all manifest files present, sizes/checksums match, row counts match.
    4. Only then move/mark the batch as complete (atomic rename of the batch folder, or write «_SUCCESS»).
    5. Downstream ingestion triggers on the completion marker.
    6. Archive or delete source files per policy; log the transfer (who, what, when, checksums) for audit.

    ## Security and compliance
    Encryption in transit (TLS) and at rest; private endpoints; SAS tokens with short expiry or managed identities; scanning uploaded files; **export-controlled engineering data** must only go to approved regions/accounts with restricted access.

    ## How interviewers test this
    - "How would you move 50 TB from an on-prem datacentre to Azure?" Estimate bandwidth time first (≈ 5 days at 1 Gbps), then online (AzCopy/ADF over ExpressRoute with parallelism, throttling, checksums, incremental sync) vs offline (Data Box), validation, cut-over with a final incremental sync.
    - "How do you make sure downstream jobs never read a half-uploaded file?" Manifests, checksums, completion markers, atomic moves.
  `, {
    check: [
      mcq('Roughly how long does 100 TB take over a dedicated 1 Gbps link at full speed?', ['About 1 hour', 'About 9-10 days', 'About 1 year', 'About 10 minutes'], 1, '1 Gbps ≈ 125 MB/s ≈ 10.8 TB/day. Consider a physical appliance like Data Box.'),
      multi('What makes a large file transfer reliable?', ['Chunked/multipart uploads with retries per part', 'Checksums verified after transfer', 'A manifest and completion marker before downstream reads', 'Uploading as one single stream to keep it simple'], [0, 1, 2], 'One stream means restarts from zero and no parallelism.'),
      tf('DistCp copies data from HDFS in parallel using MapReduce tasks.', true, 'A standard tool for Hadoop-to-cloud migrations.'),
    ],
    hands: [
      py({ q: 'Write «plan_parts(file_size, part_size)» returning a list of «(part_number, offset, length)» for a multipart upload (part numbers start at 1; the last part may be smaller). Then write «verify(manifest, received)»: both are dicts «{file_name: sha256_hex}»; return a dict with sorted lists «missing» (in manifest, not received), «corrupt» (received with a different checksum) and «unexpected» (received but not in manifest). Raise «ValueError» if «part_size <= 0».', starter: 'def plan_parts(file_size, part_size):\n    pass\n\ndef verify(manifest, received):\n    pass\n',
        tests: `assert plan_parts(250, 100) == [(1, 0, 100), (2, 100, 100), (3, 200, 50)]
assert plan_parts(200, 100) == [(1, 0, 100), (2, 100, 100)]
assert plan_parts(0, 100) == []
try:
    plan_parts(10, 0); raise AssertionError('must raise')
except ValueError:
    pass
m = {'a.parquet': 'h1', 'b.parquet': 'h2', 'c.parquet': 'h3'}
r = {'a.parquet': 'h1', 'b.parquet': 'XX', 'd.parquet': 'h4'}
assert verify(m, r) == {'missing': ['c.parquet'], 'corrupt': ['b.parquet'], 'unexpected': ['d.parquet']}, verify(m, r)`,
        solution: `def plan_parts(file_size, part_size):
    if part_size <= 0:
        raise ValueError('part_size must be positive')
    parts, off, n = [], 0, 1
    while off < file_size:
        length = min(part_size, file_size - off)
        parts.append((n, off, length))
        off += length
        n += 1
    return parts

def verify(manifest, received):
    return {
        'missing': sorted(k for k in manifest if k not in received),
        'corrupt': sorted(k for k in manifest if k in received and received[k] != manifest[k]),
        'unexpected': sorted(k for k in received if k not in manifest),
    }` }),
    ],
  }),
};
