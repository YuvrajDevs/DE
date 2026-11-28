const { T } = require('../_t.cjs');

module.exports = {
  cloudwhat: T(`
    > **In one line:** cloud computing = **renting servers, storage, databases, networks and software on demand over the internet**, paying for use, instead of owning hardware. For data platforms: **elastic scale, separate storage and compute, managed services, pay-per-use**.

    | On-premises | Cloud |
    |---|---|
    | Buy for peak, months ahead | Provision in minutes, scale up and down |
    | CapEx | OpEx per second/hour/GB |
    | You run power, hardware, patching | Provider runs infrastructure (and software, for managed services) |
    | Storage + compute in the same machines | Object storage separate from elastic compute |
    | Fixed capacity | Autoscaling, serverless |
    NIST traits: on-demand self-service, broad network access, resource pooling (multi-tenant), rapid elasticity, measured service.

    **For DE:** lakes on object storage (cheap, durable, unlimited); **ephemeral compute** (a cluster per job, then gone); managed services for warehouses, streaming, orchestration, catalogs, ML; global regions. Elasticity changes architecture, and **cost becomes visible per query and per pipeline**. New duties: FinOps, IAM, network security.

    **Region** = geographic area with several datacentres (Central India, West Europe). **Availability zone** = physically separate datacentre(s) in a region with independent power/network: spread critical systems across AZs. **Data residency/sovereignty** (export control, DPDP/GDPR cross-border rules) decides regions; replicate only where allowed.

    **Shared responsibility:** the provider secures the **cloud** (physical, hypervisor, managed-service internals); you secure what's **in** it (data, identities, access, network config, keys, encryption choices). More managed = provider does more. **Most cloud breaches are misconfigured storage or leaked credentials**, not provider failures.

    **What goes wrong:** runaway costs (idle clusters, unbounded autoscaling, expensive queries, cross-region egress); public buckets; lock-in (mitigate with Parquet/Delta/Iceberg and portable Spark/Airflow/dbt); quotas hit during scale-out.

    **Interview:** benefits (elasticity, decoupling, managed, pay-per-use); region vs AZ; shared responsibility.
  `),

  iaas: T(`
    > **In one line:** service models say **how much the provider manages**: **IaaS** = VMs and networks (you manage OS and software); **PaaS** = a managed platform (you bring code/data); **SaaS** = finished software (you use it). Serverless and managed data services sit at the PaaS end.

    | Layer | On-prem | IaaS | PaaS | SaaS |
    |---|---|---|---|---|
    | Application / data | You | You | You | Provider (you own your data) |
    | Runtime, middleware | You | You | Provider | Provider |
    | OS | You | You | Provider | Provider |
    | Virtualisation, servers, storage, network | You | Provider | Provider | Provider |

    | Model | Data examples | Use |
    |---|---|---|
    | IaaS | Azure VMs, EC2, GCE running your own Kafka/Hadoop/Airflow | Full control, lift-and-shift, special software |
    | PaaS | Azure Databricks, Synapse, Data Factory, Event Hubs, Azure SQL, EMR/Glue/MSK, BigQuery, Cloud Composer, managed Airflow | Most modern platforms (you configure, they operate) |
    | Serverless | BigQuery, Snowflake (largely), Lambda, Azure Functions, serverless SQL, Databricks serverless | Spiky/unpredictable loads; no clusters to size |
    | SaaS | Salesforce, SAP SuccessFactors, Power BI, Fivetran | Business apps, often data **sources** |

    **Trade-off: ops time vs control vs cost at scale.** More managed → less ops, faster delivery, built-in scaling/HA, but less control, possible lock-in, sometimes higher unit cost. IaaS → control and portability, but you patch, scale, secure, keep it alive. Some very large steady-scale companies self-manage; **for a DE 1, default to managed for undifferentiated work** (running Kafka, Spark, Airflow) and explain why.

    **Interview:** the three with examples; run Kafka on VMs or managed (managed unless a requirement forces control).
  `),

  cloudtypes: T(`
    > **In one line:** **public** = shared provider infrastructure (Azure, AWS, GCP); **private** = cloud-style infrastructure for one organisation; **hybrid** = both connected; **multi-cloud** = several public providers. Most large manufacturers are **hybrid**: plants and legacy on-prem, analytics in the public cloud.

    | | Public | Private | Hybrid |
    |---|---|---|---|
    | Owner | Provider | Organisation | Both |
    | Elasticity | Very high | Your hardware | High in the cloud part |
    | Cost | Pay per use | CapEx + ops | Mixed |
    | Control | Shared responsibility | Full | Per workload |
    | Why | Speed, scale, managed services | Regulation, legacy, latency to factories | Gradual migration, residency, plant systems |

    ## Hybrid DE in practice (manufacturing reality)
    - Plant systems (MES, historians like OSIsoft PI, SCADA) stay on-prem for latency and safety.
    - **Connectivity:** VPN or dedicated links (ExpressRoute, Direct Connect).
    - **Self-hosted integration runtimes/gateways** (ADF self-hosted IR, Power BI gateway) reach on-prem DBs securely.
    - **Edge:** filter/aggregate at the edge (IoT Edge) before upload; design for **intermittent connectivity** (buffer at the edge, replay on reconnect, event-time processing).
    - Large file movement; one identity directory (Entra ID/AD) across both; residency and export-control restrictions.

    **Multi-cloud:** benefits (avoid lock-in, best-of-breed, regulation) vs costs (duplicated skills/tooling, egress, harder governance). Usually arrives via acquisitions and SaaS, rarely by design; open formats and catalogs (Delta/Iceberg, Unity Catalog/Polaris) reduce friction.

    **Interview:** the three types; on-prem plant DB → cloud lakehouse securely (private connectivity, self-hosted IR, least-privilege account, TLS, incremental extraction).
  `),

  objstore: T(`
    > **In one line:** object storage (S3, Azure Blob/**ADLS Gen2**, GCS) stores **objects** (bytes + metadata) by key in buckets/containers: **cheap, extremely durable, effectively unlimited, accessed over HTTP**. The foundation of every cloud lake and lakehouse.

    - Keys like «bronze/crm/claims/ingest_date=2026-11-26/part-0001.parquet»; "folders" are prefixes, except **ADLS Gen2 hierarchical namespace** (real directories, POSIX ACLs, atomic renames: matters for big data engines).
    - Objects are **immutable**: replace whole objects.
    - Durability via replication/erasure coding (Azure LRS, ZRS, GRS).
    - **Strong read-after-write consistency** on S3, Azure, GCS today.
    - **Tiers** hot/cool/cold/archive (archive needs rehydration); **lifecycle policies** move/delete by age; **versioning/soft delete** recover objects (and must be included in privacy erasure processes).
    - Security: IAM/RBAC, ACLs, private endpoints, encryption at rest (provider or customer-managed keys) and in transit.

    | You pay for | Note |
    |---|---|
    | GB-month | By tier and redundancy |
    | Requests (PUT/GET/LIST) | Millions of small files = real money |
    | Retrieval (cool/archive) | Extra |
    | Egress | Leaving region/cloud; same region usually free |
    | Early deletion | Minimum retention on cool/archive |

    **Performance:** high throughput through parallel readers, higher per-request latency than local disk; LIST on huge prefixes is slow (table formats keep file lists in metadata); per-prefix request limits (date partitions spread keys); 100 MB-1 GB files efficient, tiny files slow and costly.

    ## For a DE on Azure
    - Layout «/{layer}/{source}/{entity}/{partition}/»; ADLS Gen2 with HNS for analytics.
    - Access via «abfss://container@account.dfs.core.windows.net/path» with **managed identities/service principals** through Unity Catalog storage credentials; no account keys or long-lived SAS tokens.
    - Lifecycle rules for raw; soft delete/versioning on.
    - Table formats for anything queried.
    - **Private endpoints**; storage firewall rules are a frequent cause of "403 from Databricks" incidents.

    **Interview:** why object storage underpins lakes (cost, durability, scale, decoupling); ADLS Gen2 vs Blob (HNS: directories, ACLs, atomic rename); why small files cost more (requests, latency, listing).
  `),

  lakearch: T(`
    > **In one line:** a **data lake architecture** organises object storage into **zones/layers** (landing, bronze, silver, gold) with **conventions, a catalog, security, lifecycle and table formats**, so raw data from every source is stored cheaply and turned into trusted, discoverable datasets without becoming a swamp.

    | Zone | Contents | Format | Access |
    |---|---|---|---|
    | Landing (optional) | Files exactly as delivered (SFTP drops, exports) | Original (CSV, JSON, XML, PDF) | Ingestion only |
    | Bronze/raw | Append-only source copy + load metadata | Delta (or original + Delta) | Data engineers |
    | Silver | Deduplicated, typed, validated, conformed, history | Delta/Iceberg | Engineers, analysts, scientists |
    | Gold | Business models, aggregates, data products | Delta/Iceberg | Business, BI, apps |
    | Sandbox | Exploration | Any | Owners, auto-expiring |
    | Quarantine | Rejected records | Delta | Engineers |
    **Medallion is a convention, not a law:** some add landing before bronze or platinum/semantic after gold. Define each layer's **contract** (what's guaranteed). **Bronze** keeps raw payload + ingestion metadata (source, file/offset, ingest time, schema version), partitioned by ingest date, retained by policy: your replay source and audit trail.

    **Design decisions:** storage accounts/containers per layer or domain (access control, cost tracking); path conventions («abfss://silver@<account>.dfs.core.windows.net/claims/claim_events/»); date partitioning for large tables, clustering otherwise; table format beyond landing; **every table in the catalog** (Unity Catalog, Glue, Purview) with owner, description, tags; RBAC per layer/domain, row/column controls, private endpoints, encryption, no keys in code; lifecycle (raw retention, archive tiers, VACUUM); separate dev/test/prod storage and catalogs.

    **Domain-oriented (mesh direction):** each domain (supply chain, quality, finance) owns storage and data products under central platform standards and a shared catalog.

    **What goes wrong:** **data swamp** (no catalog, owners, conventions, quality checks; copies with unclear lineage); everyone writing to silver (no contracts); PII in raw open to too many; team-private extracts instead of shared governed tables; old versions never vacuumed (silent storage growth). Governance (Unity Catalog, ownership, data products) keeps a lake a lakehouse.

    **Interview:** organising a lake (zones, formats, catalog, security, lifecycle, environments); preventing a swamp.
  `),

  tableformats: T(`
    > **In one line:** **open table formats** (Delta Lake, Iceberg, Hudi) turn a folder of Parquet into a reliable **table**: a metadata/transaction layer gives **ACID commits, schema enforcement/evolution, time travel, efficient updates/deletes/MERGE and fast planning** from file stats. They make a lake a lakehouse.

    **Common idea:** data in Parquet; **metadata** lists the files of each **snapshot** plus schema, partitioning, per-file stats; **atomic commits** (write files, then publish metadata: readers see whole snapshots); **optimistic concurrency** (conflict check at commit); old files kept for time travel until vacuumed/expired.

    | | Delta Lake | Apache Iceberg | Apache Hudi |
    |---|---|---|---|
    | Origin | Databricks 2019 (Linux Foundation) | Netflix 2018 (Apache) | Uber 2016 (Apache) |
    | Metadata | «_delta_log» JSON + Parquet checkpoints | Metadata files → manifest lists → manifests | Timeline of instants in «.hoodie» |
    | Strengths | Deep Spark/Databricks integration, simple, CDF, liquid clustering, deletion vectors | Engine-neutral (Spark, Trino, Flink, Snowflake, BigQuery, Athena), hidden partitioning, **partition evolution**, column IDs | Upsert/streaming focus, record-level indexes, merge-on-read, incremental pulls |
    | Home | Databricks, Fabric/Synapse | Multi-engine, AWS, Snowflake | Upsert-heavy streaming |

    **Convergence (2026):** **Delta UniForm** writes Iceberg (and Hudi) metadata alongside Delta; **Iceberg REST catalogs** (Polaris, Unity Catalog's Iceberg REST API) let engines share tables; **Iceberg v3** adds deletion vectors, row lineage and VARIANT. **Choosing:** Databricks-centred → Delta (+ UniForm for Iceberg readers); multi-engine → Iceberg; upsert-heavy streaming with record indexes → Hudi. **The catalog matters as much as the format.**

    **Features (Delta syntax):** «MERGE INTO» (upserts, CDC); time travel «VERSION AS OF 412» / «TIMESTAMP AS OF», «RESTORE»; enforcement + «mergeSchema»; «OPTIMIZE» (compact), Z-ORDER/liquid clustering (skipping); «VACUUM» (unreferenced files past 7 days); Change Data Feed; NOT NULL/CHECK constraints; deletion vectors.

    **Copy-on-write vs merge-on-read:** COW rewrites affected files (fast reads, heavy for small frequent updates); MOR writes small delta/delete files merged at read (fast writes, slower reads until compaction). Choose by pattern; compaction reconciles.

    ## What goes wrong
    - VACUUM retention too short breaks time travel and long readers/streams.
    - Concurrent MERGEs on overlapping files conflict → partition or serialise.
    - Streaming small files → OPTIMIZE / auto-compaction.
    - **Reading Delta as plain Parquet** (ignoring the log) shows deleted and uncommitted files.
    - Engines with different reader/writer protocol versions/features.

    **Interview:** what Delta adds to Parquet; Delta vs Iceberg vs Hudi; OPTIMIZE/Z-ORDER/VACUUM; time travel and its limit (VACUUM retention).
  `),

  filemove: T(`
    > **In one line:** moving GB-to-PB files into the cloud reliably needs **parallel, chunked, resumable transfers with integrity checks**, over the right channel (internet, private link or physical appliance), with security, cost and validation built in. The posting asks for this explicitly.

    **Problems at scale:** one 200 GB single-stream upload takes hours and restarts from zero on failure; networks drop and firewalls kill long connections; silent corruption is rare but real at TB scale; bandwidth is finite: **1 Gbps ≈ 125 MB/s ≈ ~10 TB/day at best** (100 TB ≈ 9-10+ days at full utilisation); networks are shared with business traffic. Throughput = bandwidth × utilisation × time.

    | Technique | Why |
    |---|---|
    | Chunking/multipart | 64-256 MB parts uploaded in parallel; retry only failed parts (S3 multipart, Azure block blobs) |
    | Parallelism | Many streams to saturate bandwidth; parallelism across files beats one huge file (AzCopy, rclone, «gsutil -m», DistCp) |
    | Resumability | Journals/checkpoints skip completed files/parts |
    | Integrity | MD5/CRC64/SHA-256 per part and file; compare after |
    | Compression | Fewer bytes for text (keep splittable formats for processing) |
    | Throttling | Off-peak windows, bandwidth caps |
    | Incremental sync | Only new/changed files (name + size + checksum or modified time) |
    | Completion markers | «_SUCCESS» or manifest so downstream never reads partial transfers |

    | Situation | Tool |
    |---|---|
    | Scripted bulk copy to Azure | **AzCopy** / «azcopy sync» (parallel, resumable, checksums), Storage Explorer |
    | Recurring on-prem → cloud | **ADF Copy activity + self-hosted IR**; AWS DataSync |
    | HDFS → cloud | **DistCp** |
    | Partner exchange | SFTP (Azure Blob SFTP, AWS Transfer Family), managed file transfer |
    | Steady hybrid traffic | ExpressRoute / Direct Connect |
    | Hundreds of TB-PB or slow links | **Azure Data Box**, AWS Snowball |
    | Streams of small events | Not file transfer: Kafka/Event Hubs |

    ## Reliable ingestion design
    1. Source writes files to staging, then a **manifest** (names, sizes, checksums, row counts).
    2. Parallel copy with retries and checksum verification.
    3. Validate presence, sizes/checksums, row counts.
    4. Mark complete (atomic batch-folder rename or «_SUCCESS»).
    5. Downstream triggers on the marker.
    6. Archive/delete source per policy; log who/what/when/checksums for audit.
    Make loads **idempotent** (re-copying overwrites, not duplicates).

    **Security:** TLS in transit, encryption at rest, private endpoints, short-expiry SAS or managed identities, scan uploads, **export-controlled engineering data** only to approved regions/accounts with restricted access.

    **Interview:** 50 TB on-prem → Azure (estimate first: ≈ 5 days at 1 Gbps; online AzCopy/ADF over ExpressRoute with parallelism, throttling, checksums, incremental sync vs offline Data Box; validate; cut over with a final incremental sync); never reading half-uploaded files (manifests, checksums, markers, atomic moves).
  `),
};
