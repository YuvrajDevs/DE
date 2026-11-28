const { T } = require('../_t.cjs');

module.exports = {
  whatde: T(`
    > **In one line:** data engineering moves data from where it is created to where it is used, and makes sure it arrives **correct, on time, understandable and safe**, every day, without a human babysitting it.

    ## Why it exists
    A company (our example: Apex Engines, the fictional engine maker behind the practice data) creates data in many places: dealers' claims in a CRM, invoices in an ERP, engine builds in a factory system, sensor readings from engines every few seconds, photos and PDF reports. Business questions ("which dealers reject the most claims?", "do plant 3 engines fail earlier?", "warn us before an engine overheats") need data from **several systems, joined, cleaned, kept for years and refreshed on schedule**. Doing it by hand with spreadsheet exports works once, then breaks: exports change, filters are forgotten, two people get two numbers. Data engineering turns that fragile manual work into an **automated, repeatable, tested, monitored system**.

    ## The job, in five parts
    1. **Ingest:** get data out of sources (databases, APIs, files, event streams, devices).
    2. **Store:** land it cheaply and durably, keeping history (lake, warehouse, lakehouse).
    3. **Transform:** clean, dedupe, fix types, join, apply business rules, model into understandable tables.
    4. **Serve:** deliver to dashboards, analysts, data scientists, ML models, applications.
    5. **Operate:** schedule, monitor, alert, test quality, control access, document, fix.
    Part 5 is what separates engineering from scripting: the system must **still work next month** when the source adds a column, sends duplicates, arrives late or doubles in size.

    ## The shape of every data platform
    «««flow
    Sources -> Ingestion -> Raw storage -> Transform (clean, join, model) -> Serving tables -> Consumers
    »»»
    What keeps it trustworthy:
    - **Orchestration** (e.g. Airflow): right order, on schedule, with retries.
    - **Quality checks:** "no NULL claim_id", "row count within 10% of yesterday", "every claim has a dealer".
    - **Monitoring and alerting:** did it run, how long, how many rows, how fresh?
    - **Governance:** owner, column meanings, who sees personal data, how long it is kept.
    - **Version control and CI/CD:** pipeline code is software: reviewed, tested, deployed.

    ## How a data engineer is judged
    | Property | Business question | What breaks it |
    |---|---|---|
    | **Correct** | Can I trust this number? | Duplicates, wrong joins, time-zone bugs, silent NULLs |
    | **Timely** | Fresh enough to act on? | Late jobs, unnoticed failed runs |
    | **Complete** | Anything missing? | Partial loads, dropped late records |
    | **Understandable** | What does this column mean? | No docs, cryptic names |
    | **Safe** | Who can see it? May we keep it? | Exposed personal data, no retention rules |
    Mental tests seniors apply first: **If it runs twice, does data double? If a day is skipped, does anyone know? If the source sends garbage, does it stop or spread?**

    ## When you need it (and when not)
    - **Need it:** data from more than one system, used repeatedly, refreshed regularly, large, or feeding important decisions.
    - **Don't:** a one-time analysis of one small export. A pipeline for a question asked once is over-engineering.

    ## Why companies still hire data engineers
    | Alternative | Why it fails at company scale |
    |---|---|
    | Analysts export to Excel | Not repeatable, error-prone, no history, everyone gets a different number |
    | Reports on the production database | Slows the business systems; cannot join across systems |
    | No-code tool for everything | Fine for simple feeds; weak on complex logic, scale, testing, cost |
    | Every team builds its own pipelines | Duplicated work, conflicting "revenue", no governance |
    Modern tools (managed connectors, dbt, cloud warehouses) remove plumbing, but someone must still design the flow, decide the grain, guarantee correctness and own failures.

    ## One day of a real pipeline (warranty claims)
    1. 01:00 Airflow starts the run for **yesterday's** date.
    2. Pull new/changed claims from the CRM API since the last **watermark**; pick up the ERP's invoice file from SFTP.
    3. Land both unchanged in **bronze** (raw) with metadata (file name, load time).
    4. Dedupe claims, cast amounts to decimal, standardise dealer codes, join to dealers and engines → **silver**.
    5. Quality checks: 3% of claims have an unknown dealer → quarantine those rows, load the rest, alert the owner.
    6. **Gold** tables (claims per dealer per month, approval rate) refresh; dashboard shows "data as of 01:42".
    7. A failure-prediction model trains on the same silver tables.

    ## What goes wrong
    - **Source changes silently:** a renamed column; job "succeeds" but writes NULLs → schema checks, data contracts.
    - **Re-runs double data:** retry after a half-write → idempotent writes (overwrite a partition, or MERGE by key).
    - **Late data:** yesterday's claims arrive tomorrow → reprocess a window; load incrementally on "updated at", not "created at".
    - **Silent success:** green run, 0 rows (API returned an empty page) → volume and freshness checks.
    - **Two definitions of one metric** (finance vs service "approval rate") → one certified, documented gold table.

    ## At scale
    Concepts are the same from 10 thousand to 10 billion rows; the **cost of mistakes** grows. You add distributed processing (Spark), partitioning, incremental instead of full reloads, streaming where minutes matter, cost monitoring and heavy automation (nobody can eyeball a billion rows).

    ## Interview angle
    - "What does a data engineer do?" Weak: "builds ETL". Strong: the flow (ingest, store, transform, serve), the **guarantees** (correct, timely, complete, understandable, safe), plus one example of making a pipeline re-run-safe or monitored.
    - Trap: "If the job succeeded, is the data correct?" **No**: success means the code ran, not that the data is right. That is why you test data, not just code.
  `),

  roles: T(`
    > **In one line:** the **data engineer** makes data available and trustworthy; the **analyst** turns it into answers; the **data scientist** turns it into predictions and models. Same data, different questions and outputs.

    ## Why the roles split
    In small companies one "data person" does everything and is overloaded. As data grows, each part needs depth: reliable pipelines for 50 million rows a day need **software and distributed-systems skill**; explaining why approvals dropped in the South needs **business context and statistics**; predicting failures needs **machine learning rigour**.

    ## Side by side
    | | Data engineer | Data analyst | Data scientist |
    |---|---|---|---|
    | Main question | How do we get the right data to the right place, reliably? | What happened and why? | What will happen, and what should we do? |
    | Output | Pipelines, tables, platform, data products | Dashboards, reports, analyses | Models, forecasts, experiments |
    | Tools | SQL, Python, Spark, Kafka, Airflow, cloud, Git | SQL, Excel, Power BI/Tableau, some Python | Python, statistics, ML libraries |
    | Cares most about | Correctness, reliability, scale, cost | Business meaning, clarity | Accuracy, bias, generalisation |
    | "Done" means | Runs daily untouched | Stakeholder understood and acted | Model works on new data |
    | Typical failure | Duplicates, late data, broken loads | Wrong metric definition, misleading chart | Overfitting, data leakage |

    ## Neighbouring roles
    - **Analytics engineer:** owns in-warehouse transformations (often dbt): clean, tested, documented models. Many DE 1 roles include this.
    - **ML engineer:** puts models into production: feature pipelines, serving, drift monitoring.
    - **BI developer:** semantic layer and dashboards.
    - **Data architect:** platform design and standards.
    - **Platform / DataOps engineer:** clusters, CI/CD, permissions, cost.

    ## Where hand-offs go wrong
    «««flow
    Business question -> Analyst defines metric -> Engineer builds reliable tables -> Analyst builds dashboard -> Scientist reuses tables for models
    »»»
    - **Unclear requirements:** "active dealers" = claim in 90 days? sale this year? Build without asking and you rebuild twice. Turn vague asks into **written, testable definitions**.
    - **Grain confusion:** analyst wants one row per claim, engineer delivers one per claim line → totals double.
    - **Scientists training on raw data** with their own notebook cleaning → training data differs from production (**training-serving skew**). Shared, governed silver tables prevent it.

    ## Why it matters for this interview
    The posting says you work "with Business and IT teams to understand requirements" and deliver to "analysts and other consumers", so they test your **consumer view**: do you ask what decision the data supports? Do you partition and model for how analysts filter (date, region)? Do you give scientists history and stable definitions? Analyst experience is an **advantage**: you know what consumers suffer. Say so.

    ## Edge cases
    - **"Can't the analyst build it in the BI tool?"** For small, single-source data, yes, often fastest. Not when logic is reused by many reports, needs history or testing, or refreshes take hours.
    - **Who owns data quality?** Shared: the source owns correctness at entry; the engineer ensures the pipeline does not damage data and checks catch problems; the business data owner defines "correct".

    ## Interview angle
    - "An analyst keeps changing requirements?" Write the definition down, agree acceptance criteria, deliver a small version early, version changes.
    - "Why move from analytics to DE?" You felt consumers' pain (late, inconsistent, untrusted data) and want to fix the root by building the reliable layer.
  `),

  lifecycle: T(`
    > **In one line:** all data goes through **create → collect → store → process → use → share → archive → delete**. Data engineering designs every stage, especially the last ones people forget.

    ## Why think in a lifecycle
    Beginners think only "load the data". Problems hit other stages: nobody decided how long to keep sensor data (costs grow forever); a customer asks to be deleted and their data sits in 14 untracked copies; an audit needs a 3-year-old report but raw data was overwritten.

    ## The stages
    | Stage | What happens | Key decision | Example |
    |---|---|---|---|
    | Create | Data produced | Good keys and timestamps? | Dealer submits a claim |
    | Collect | Copied out of the source | Batch or stream? Full or incremental? | Hourly API pull of changed claims |
    | Store | Lands durably | Format, partitioning, raw copy kept? | Raw JSON → bronze; Delta → silver |
    | Process | Clean, join, model | Where does logic live, how tested? | Dedupe, standardise dealer codes |
    | Use | Reports, models | Who consumes, how fresh? | Approval dashboard, failure model |
    | Share | Other teams/partners | Access rules, masking, contracts | Supplier sees only its parts' defects |
    | Archive | Cheaper, slower storage | When does hot become cold? | Claims > 2 years to archive tier |
    | Delete | Removed for good | Law, privacy requests, legal hold | Personal data deleted after 7 years |

    ## Hot, warm, cold
    Data is used most when new, so storage is tiered: **hot** (days-weeks, fast, queried constantly), **warm** (months, standard), **cold/archive** (years, very cheap, slow or costly to read, for audit). Cloud **lifecycle rules** automate it: "cool tier after 90 days, archive after 2 years, delete after 7".

    ## Retention (the legal stage)
    How long you keep data, driven by: **law** (finance records kept for years; personal data kept no longer than needed: GDPR, India's DPDP Act), **business need** (models want history; dashboards need 2 years for year-over-year), **cost and risk**, and **legal hold** (lawsuit: do not delete, even if retention says so).
    The hard part is **deletion across copies**: raw, silver, gold, backups, extracts and ML training sets may all hold a customer's email. Governance (catalog, **lineage**, tagged personal-data columns) tells you where data went.

    ## What goes wrong
    - **Overwriting raw:** a cleaning bug becomes permanent. Keep an immutable raw copy (with its own retention).
    - **Deleted from the table but not its history:** Delta keeps old versions for time travel; the row exists in old files until **VACUUM**.
    - **Backups outlive retention:** rules must cover backups and exports.
    - **Archive nobody can read:** archive with schema and documentation.
    - **Retention too short for the model:** sensor data deleted after 30 days, then data science needs a year.

    ## At scale
    10,000 engines × 1 reading/s × 86,400 s = **864 million readings/day**. Typical design: raw hot 30-90 days, **downsampled** aggregates (per-minute/hour min/max/avg) for years, raw archived cheaply if regulation or retraining needs it.

    ## Interview angle
    - "Delete a customer's data?" Find every copy via lineage/tags, delete or anonymise each (including history: vacuum old versions), handle backups by policy, confirm and log, and design pipelines so personal data is isolated or pseudonymised.
    - "How long to keep raw sensor data?" "Depends on regulation and use; I'd ask. Default: raw hot briefly, aggregates long-term, raw archived cheaply if needed for retraining."
  `),

  datatypes: T(`
    > **In one line:** data comes as **structured** (fixed rows and columns), **semi-structured** (self-describing and flexible, often nested, like JSON) or **unstructured** (images, PDFs, audio, free text). The shape decides how you ingest, store, validate and query it.

    ## The three shapes
    **Structured**
    - Same fields and types for every record, defined **before** writing (schema). The database enforces it on write and rejects bad data.
    - Lives in relational databases, ERP/CRM objects, warehouse tables, Parquet.
    - + Easy SQL, joins, aggregates, validation. − Schema changes need coordination; awkward when fields vary.

    **Semi-structured**
    - Carries its own structure (keys, tags) but records may differ: extra or missing fields, nested objects, arrays.
    «««json
    {"claim_id": 9001, "dealer": {"id": 14, "region": "West"},
     "parts": [{"sku": "P-77", "qty": 2}, {"sku": "P-12", "qty": 1}], "notes": null}
    »»»
    - Interpreted when read (**schema-on-read**). Formats: JSON (APIs, events), XML, Avro, YAML, key=value logs.
    - + Flexible; producers add fields without breaking tables. − Consumers must handle missing fields, **type drift** ("qty": "2" one day, 2 the next) and nesting.

    **Unstructured**
    - No tabular shape: images, video, audio, PDFs, emails, free text, CAD drawings.
    - Store the file in object storage plus a **metadata table** (path, claim_id, uploaded_at, size, type). Extract structure later with OCR, speech-to-text, image models or LLMs.
    - + Holds information nothing else does (the photo shows the crack). − Not directly queryable; extraction costly and imperfect; large and often sensitive.

    ## Nuances interviewers like
    - Shape is about the **data, not the file extension**: a CSV with a free-text "comments" column holds unstructured content in a structured file.
    - **Parquet and Avro are structured** (strict schema): Parquet columnar, Avro row-based with schema evolution.
    - JSON can be perfectly regular: semi-structured means it *may* vary.
    - Shape changes through a pipeline: JSON event → flattened silver table → aggregated gold. PDF → OCR text → extracted fields → embeddings for AI search.

    ## Through a pipeline
    | Step | Structured | Semi-structured | Unstructured |
    |---|---|---|---|
    | Ingest | CDC or query extract | API pull, Kafka events | File upload, object copy |
    | Raw store | Parquet/Delta | Raw JSON as received | Files + metadata table |
    | Validate | Types, keys, ranges | Schema, required fields, type drift | File type, size, virus scan, readable? |
    | Transform | Joins, aggregates | Flatten, explode arrays, cast | OCR, transcription, classification, embeddings |
    | Serve | Tables, BI | Flattened tables | Search/vector index, links in reports |

    ## Flattening nested data: three traps
    1. **Grain change:** exploding 2 parts gives 2 rows; the table is now one row per part line, so summing claim-level amounts double-counts.
    2. **Empty arrays vanish:** «parts: []» gives zero rows after «explode»; use «explode_outer» when the parent must survive.
    3. **NULL vs missing vs empty:** «"notes": null», no «notes» key and «""» can mean different things. Decide and document.

    ## Choosing storage
    Transactional with constraints → relational DB. Analytical and large → columnar warehouse/lakehouse. Semi-structured events at volume → land raw in the lake, flatten to tables (or VARIANT/JSON columns for light use). Unstructured → object storage + metadata table + specialised processing.

    ## What goes wrong
    - **Type drift:** «"amount": "1,200.50"» becomes NULL in a strict cast silently → validate, quarantine, alert.
    - **New fields:** usually harmless; capture them (rescued-data column), don't crash.
    - **Deeply nested JSON** can explode table size → flatten only what consumers need; keep raw.
    - **One huge JSON file** (200 MB) can't be split for parallel reads → use newline-delimited JSON.
    - **Encoding:** non-UTF-8, byte-order marks, odd line endings → normalise on ingest.
    - **Sensitive files:** photos/PDFs can contain faces, names, signatures → govern like personal data.

    ## At scale
    Semi-structured is most expensive to query (text parsed on every read), so lakes convert raw JSON to columnar Parquet/Delta early: **parse once, read fast forever**. For unstructured, the cost is processing (OCR, models), so process each file once and store the output.

    ## Interview angle
    - "Is JSON structured?" Semi-structured: has structure but self-describing and flexible. Mention flattening and type drift.
    - "Make dealer PDFs usable for analysts?" Files in object storage, metadata table keyed by claim_id, extraction job (OCR/LLM) writing fields with a confidence score, quality checks, keep the original.
  `),

  oltpolap: T(`
    > **In one line:** **OLTP** systems *run* the business: many small, fast, safe reads and writes of single records. **OLAP** systems *analyse* it: few large queries scanning and aggregating millions of rows. Opposite workloads, so they are built differently.

    ## Why both exist
    The dealer portal must save a claim in ~50 ms for 500 concurrent dealers and never lose or half-save one. Management wants "average claim by region by month for 5 years", which reads millions of rows. Running that on the portal's database slows every dealer.

    ## OLTP: how it works
    - Workload: insert/update/delete/look up **single records by key** ("get claim 9001", "set Approved").
    - **Row storage:** a row's columns stored together → reading/writing one record is one quick operation.
    - **Indexes** on keys → a lookup touches a few pages.
    - **Normalised** schema (customers, dealers, claims in separate tables) → each fact stored once, updates safe.
    - **ACID:** Atomic (all or nothing), Consistent (constraints hold), Isolated (concurrent users don't corrupt each other), Durable (committed survives a crash).
    - **Concurrency control:** locks or MVCC so readers and writers don't block each other badly.
    - Mostly **current state**; old values overwritten. Examples: PostgreSQL, MySQL, Oracle, SQL Server (behind CRMs and ERPs).

    ## OLAP: how it works
    - Workload: scan many rows, few columns, aggregate (SUM, AVG, COUNT by date/region/product).
    - **Column storage:** a query using 3 of 40 columns reads only those 3; similar values together compress **5-10×** better.
    - **Massively parallel** scans across cores/machines.
    - **Denormalised dimensional models** (star schema) → few joins.
    - **Partitioning and pruning:** skip files/blocks that can't match.
    - Bulk loads, not row-by-row; holds **integrated history**. Examples: Snowflake, BigQuery, Redshift, Synapse, Databricks SQL, ClickHouse.

    ## Why row vs column matters
    1 billion claims × 40 columns, "total amount by region": a row store reads all 40 columns per row; a column store reads 2 (and they compress well), often **~20× less data**. Reverse: "fetch claim 9001 with all fields" is one read in a row store but 40 column reads in a column store.

    ## Side by side
    | | OLTP | OLAP |
    |---|---|---|
    | Purpose | Run the business | Analyse it |
    | Query | One record by key | Aggregate millions |
    | Writes | Constant, small | Bulk loads |
    | Storage / model | Row / normalised | Column / dimensional |
    | History | Current state | Years |
    | Users | Apps, thousands concurrent | Analysts, dashboards, scientists |
    | Key metric | Latency per transaction | Scan query time |

    ## Why not one system?
    Resource contention (a 5-minute scan eats CPU/IO transactions need), locking and MVCC pressure from long reads, the wrong storage layout for each other, no integration across systems, and OLTP overwrites history.

    ## Alternatives to full separation
    | Option | Good for | Limits |
    |---|---|---|
    | Read replica | Simple operational reports | Same row layout, one source, replication lag |
    | Operational data store (ODS) | Near-real-time integrated current data | Little history |
    | HTAP database (row + column in one) | Fresh analytics on live data | Cost, complexity |
    | Separate warehouse/lakehouse | Enterprise analytics, history, integration | Latency, data movement |
    Most enterprises separate; **data engineering is the bridge**:
    «««flow
    CRM + ERP + MES (OLTP) -> CDC / extracts -> Lakehouse bronze -> silver -> gold star schema (OLAP) -> Dashboards, ML
    »»»
    At the boundary you must: **extract without hurting the source** (CDC from the transaction log, a replica, or off-peak extracts on an indexed «updated_at»; never full-scan production every 5 minutes), **capture history** the source overwrites (SCD, snapshots), and **reshape** normalised → dimensional.

    ## What goes wrong
    - A "quick report" on production becomes a daily query that locks a hot table at month-end.
    - **Replication lag:** replica 20 minutes behind → wrong "current" numbers at peak.
    - **Hard deletes** vanish; an «updated_at» extract never sees them → CDC or soft deletes.
    - **Time zones:** plants store local time → store UTC plus the original zone.
    - **Overwritten history:** dealer moves West → North; without capturing it, last year's West sales show as North.

    ## At scale
    OLTP scales with indexes, partitioning, replicas, then **sharding** (rows split across servers). OLAP scales with parallel compute and data layout (partitioning, clustering, file sizing); cloud warehouses **separate storage and compute** so you add compute only when busy.

    ## Interview angle
    - "Why not report on the production DB?" Contention, row layout, no integration, no history; a replica is a short-term step, not a warehouse.
    - "Why is a column store faster for aggregates?" Reads only needed columns, compresses better, enables vectorised processing.
    - "Get data out of OLTP safely?" CDC, replicas, incremental extracts on an indexed column, off-peak windows, rate limits.
  `),

  storage: T(`
    > **In one line:** a **database** serves an application; a **warehouse** holds cleaned, integrated, structured data for analysis; a **lake** holds any data, raw, cheaply, as files; a **lakehouse** adds warehouse reliability (transactions, schemas, fast SQL) on top of lake files. Most companies run several.

    ## Why each appeared (history in four steps)
    1. **Databases (1970s+):** run apps; great at transactions, poor at big cross-system analysis.
    2. **Warehouses (1990s+):** copy from many databases, clean and model for analysis. Trusted, fast SQL; but expensive, rigid (schema before load), bad with images, logs, huge raw volumes.
    3. **Lakes (2010s, Hadoop then cloud storage):** dump everything as files, cheap, decide structure later. But no transactions, no schema enforcement, slow SQL, and often a **data swamp** (nobody knows what's there or if it's right).
    4. **Lakehouses (late 2010s+):** a **table format** (Delta Lake, Iceberg, Hudi) on lake files. A **transaction log** gives ACID writes, schema enforcement, time travel and efficient metadata.

    ## How each works inside
    - **Database:** storage + compute in one engine; pages, indexes, transaction log, buffer cache.
    - **Warehouse:** engine-managed columnar storage, parallel (MPP) execution, cost-based optimiser; **schema-on-write**. Cloud warehouses (Snowflake, BigQuery, Redshift, Synapse) **separate storage from compute**: scale and pay for each separately. Data loaded via ETL/ELT into staging → core → marts.
    - **Lake:** files in object storage (S3, ADLS Gen2, GCS): CSV, JSON, Parquet, Avro, images. Any engine can read them (freedom and problem). **Schema-on-read**. Folder conventions like «/raw/crm/claims/ingest_date=2026-11-26/». Missing: atomic commits (a half-written job leaves half the files), single-row updates/deletes without rewriting files, protection from partial reads, fast listing of millions of files, schema enforcement.
    - **Lakehouse:** Parquet files **plus a transaction log** (Delta's «_delta_log», Iceberg's metadata tree, Hudi's timeline). A write adds new files, then **atomically commits** a log entry listing them; readers see only committed files, so a failed job's orphan files are invisible. The log stores schema (enforced), per-file min/max stats (for skipping) and history (time travel). Updates/deletes/MERGE rewrite affected files (copy-on-write) or write delete markers (merge-on-read). Many engines read the same open tables; a **catalog** (Unity Catalog, Glue, Hive metastore, Polaris) tracks names, permissions, lineage.

    ## Medallion layers
    | Layer | Contains | Rules | Users |
    |---|---|---|---|
    | **Bronze** | Data as received + load metadata | Append-only, never "fixed", kept for replay | Engineers |
    | **Silver** | Deduplicated, typed, validated, conformed, joined | Tested; one row per key at a defined grain | Engineers, analysts, scientists |
    | **Gold** | Business aggregates and dimensional models | Certified, documented, stable contracts | Dashboards, business, apps |
    A convention, not a law: some add a "landing" zone or "platinum" layer, some skip gold.

    ## Choosing
    | Need | Fit | Why |
    |---|---|---|
    | App reads/writes single records | Database | Transactions, indexes, low latency |
    | Trusted SQL analytics, mostly structured, strong BI | Warehouse | Mature SQL, governance, concurrency, simple |
    | Cheap storage of everything incl. raw/unstructured | Lake | Cost, any format, any engine |
    | Engineering + SQL + ML on one copy, large scale | Lakehouse | Open files, ACID, many workloads |
    Interview answer: "it depends on workload, data types, scale, skills, existing platform", then reason. Often: lakehouse for engineering/ML plus a warehouse or the lakehouse's SQL layer for BI.

    | | Warehouse | Lake | Lakehouse |
    |---|---|---|---|
    | Storage cost | Medium-high | Lowest | Low |
    | Data types | Mostly structured | Anything | Anything |
    | ACID | Yes | No | Yes (table format) |
    | SQL speed | Excellent | Poor-medium | Good-excellent |
    | Openness | Vendor format | Open files | Open table formats |
    | Ops complexity | Low | Medium | Medium-high |
    | Governance built in | Strong | Weak | Good with a catalog |

    ## What goes wrong
    - **Data swamp:** no catalog, owners, conventions → catalog, naming, owners, retention.
    - **Small files:** frequent jobs write thousands of tiny files; queries spend time opening files → compaction (Delta «OPTIMIZE»), aim for ~128 MB-1 GB files.
    - **Concurrent writers:** two MERGEs into one table → optimistic concurrency fails one; partition the work or serialise writers.
    - **Time travel is not a backup:** old versions are vacuumed; dropping a table can drop its history.
    - **Vendor lock-in:** proprietary warehouse storage; open formats reduce it (many warehouses now read Iceberg/Delta).
    - **Fake lakehouse:** files in S3 + Spark without a transaction log is a lake, not ACID.

    ## At scale
    Petabyte lakes rely on **partitioning** (usually date) and **file statistics** to skip data: layout beats compute size. Warehouses need workload isolation (separate compute for ELT, BI, science) and cost controls (auto-suspend, quotas). Metadata itself becomes big: Iceberg/Delta use manifests and checkpoints instead of folder listing.

    ## Interview angle
    - "Lake vs lakehouse?" Key words: **transaction log / table format** → ACID, schema enforcement, time travel, MERGE on open files.
    - "Why keep bronze if silver is clean?" Replay after bugs, audit, new use cases needing dropped fields.
    - "Warehouse or lakehouse for a new company?" Ask about data types, scale, ML, skills; argue with trade-offs.
  `),

  pipelines: T(`
    > **In one line:** a data pipeline is an **automated, repeatable sequence of steps** that moves and transforms data from sources to destinations, with **scheduling, dependencies, checks, retries and monitoring** built in.

    ## Why
    Without pipelines, a person runs scripts in order and notices problems: fails on holidays, at 3 a.m., when they leave, and at 200 scripts. A pipeline makes order, timing, error handling and checks **explicit and automatic**.

    ## Parts of a pipeline
    | Part | Question | Example |
    |---|---|---|
    | Source | Where from? | CRM API, ERP DB, Kafka topic, SFTP files |
    | Ingestion | How out? | Incremental API pull, CDC, file copy |
    | Storage zones | Where does it live? | Bronze → silver → gold |
    | Transformations | What changes? | Dedupe, cast, join, aggregate, model |
    | Orchestration | When, what order, what if it fails? | Airflow DAG, daily 01:00, 3 retries |
    | Quality checks | Right before publishing? | Unique keys, row-count range, freshness |
    | Serving | Who reads and how? | Gold tables, BI model, API |
    | Observability | Healthy? Who's told? | Run logs, metrics, alerts |
    | Metadata and lineage | What is it, where from? | Catalog, column docs, lineage graph |

    ## The DAG
    Steps and dependencies form a **DAG** (directed acyclic graph): arrows mean "must finish before", no loops.
    «««flow
    extract_claims -> load_bronze -> clean_claims -> join_dealers -> gold_claims_monthly -> refresh_dashboard
    »»»
    with «extract_dealers -> clean_dealers -> join_dealers» joining in. The orchestrator runs steps whose upstreams succeeded, in parallel where possible, retries failures and records every run.

    ## Eight principles of an engineered pipeline
    1. **Idempotent:** same input twice → same result (overwrite by partition or MERGE by key, never blind append).
    2. **Incremental where it matters:** process only new/changed data (watermarks, CDC).
    3. **Deterministic by run date:** the 2026-11-26 run always processes that date, using the **logical date**, not «now()» → correct re-runs and backfills.
    4. **Atomic publish:** consumers never see half-written results (staging then swap, or transactional tables).
    5. **Fail loudly, early:** validate before expensive work; stop on broken contracts; quarantine bad rows, never drop silently.
    6. **Observable:** rows in/out, duration, freshness per run; alerts to someone who can act.
    7. **Modular:** small steps with clear inputs/outputs, re-runnable and testable alone.
    8. **Config, not code, per environment:** dev/test/prod differ by configuration and secrets from a store.

    ## Architecture patterns
    | Pattern | Shape | When |
    |---|---|---|
    | Batch ETL/ELT | Scheduled (hourly/daily) | Most reporting; slow-changing data |
    | Streaming | Continuous events | Alerts, monitoring, real-time features |
    | Lambda | Batch path (complete) + stream path (fast), merged | Older; logic written twice, costly |
    | Kappa | Everything a stream; replay the log to reprocess | Durable log (Kafka) with enough history; one codebase |
    | Medallion | Bronze → silver → gold | Lakehouse organisation, batch or stream |
    | Event-driven | File arrival or message triggers the run | Irregular sources; low latency without polling |
    Lakehouses often run the **same code in batch or streaming** (Spark Structured Streaming), removing Lambda's double work.

    ## Trade-offs
    - **Fewer bigger steps:** less overhead, but harder to re-run partially and debug. **More smaller steps:** clearer, but scheduling overhead and intermediate storage.
    - **Push vs pull:** push (events, webhooks) is low-latency but you handle bursts and replays; scheduled pull is simpler and controllable but slower.
    - **Central platform team vs teams owning pipelines:** consistency vs speed and domain knowledge (data mesh).

    ## A full example (daily claims)
    1. Sensor waits for the ERP invoice file (timeout + alert). 2. Extract claims changed since the watermark (paginated API, retries with backoff on 429/5xx). 3. Land raw in bronze with «_ingested_at», «_source_file», «_run_id». 4. Validate the contract; bad rows → «claims_quarantine» with a reason. 5. MERGE into silver by «claim_id» (latest «updated_at» wins). 6. Tests: unique claim_id, dealer exists, amount ≥ 0, row count within ±30% of the 4-week average for that weekday. 7. Rebuild only affected gold partitions. 8. Publish: update freshness, trigger BI refresh. 9. On failure: retry transient errors; page the owner with step, error and run link; never publish partial gold.

    ## What goes wrong
    - **Partial failure:** silver updated, gold not → inconsistent numbers. Publish gold atomically; dashboards read published versions only.
    - **Upstream late:** runs on yesterday's file and reports success → sensors and freshness gates.
    - **Retry storms:** 50 tasks hit a struggling API at once → exponential backoff with jitter, pools limit concurrency.
    - **Hidden dependencies:** a report uses an undeclared table → lineage, contracts.
    - **Clock logic:** «WHERE date = today()» breaks re-runs/backfills → logical run date.
    - **Upstream schema change** → contracts, schema checks, evolution rules.

    ## At scale
    Hundreds of pipelines need templates and shared libraries, standard monitoring, **data-aware scheduling** (run when upstream updates, not at a guessed time), cost per pipeline and ownership metadata. The hard problems become **coordination and reliability**, not code.

    ## Interview angle
    - "Walk me through a pipeline you built": use the parts table; say how you handled idempotency, late data, monitoring.
    - "Production-ready?": the eight principles.
    - "Failed at step 5 of 9?": retry transient errors, no partial publish, alert with context, fix, re-run from the failed step (safe because steps are idempotent).
  `),

  etlelt: T(`
    > **In one line:** **ETL** = extract, **transform outside** the destination, load the finished result. **ELT** = extract, **load raw**, then transform **inside** the destination with its own compute (usually SQL). The difference is *where and when* transformation happens, which changes cost, flexibility, governance and failure handling.

    ## Why ETL came first, why ELT took over
    - 1990s-2000s warehouses were expensive fixed appliances, so you didn't load raw junk into them. A separate ETL server (Informatica, SSIS, DataStage, Talend) transformed data and loaded only clean rows.
    - Cloud changed the economics: **cheap storage** (keep raw), **elastic parallel compute** (the warehouse is your strongest engine), **SQL tooling** (dbt: versioned, tested, documented transforms). So: load raw first (fast, nothing lost), transform inside, keep raw for replay.

    «««flow
    ETL: Source -> Extract -> Transform (separate engine) -> Load clean -> Warehouse
    »»»
    «««flow
    ELT: Source -> Extract -> Load raw -> Warehouse/Lakehouse -> Transform in place (SQL, dbt, Spark) -> Clean models
    »»»

    ## Side by side
    | | ETL | ELT |
    |---|---|---|
    | Transforms run | Separate engine / Spark cluster | Inside warehouse/lakehouse |
    | Raw in destination | No | Yes |
    | Logic change | Re-extract from source (if it still has history) | Re-run SQL on loaded raw |
    | Time to first data | Slower | Faster |
    | Sensitive data | Masked/removed **before** landing | Lands raw; must be protected inside |
    | Who builds transforms | ETL specialists | Anyone with SQL (analytics engineers) |
    | Cost driver | ETL licences, servers | Warehouse compute |
    | Tools | Informatica, SSIS, DataStage, Talend, custom Python/Spark | Fivetran/Airbyte + dbt + Snowflake/BigQuery/Databricks |

    ## When ETL
    - Data **must not land raw**: personal/regulated data to mask, filter or encrypt first; export-controlled data.
    - **Heavy non-SQL processing**: binary files, images, complex Python, ML scoring.
    - Destination is **weak or expensive** for transforms (operational DB, old appliance, SaaS target = "reverse ETL").
    - **Huge noisy volume**: filter at the edge (e.g. downsample sensors) instead of paying to store and scan it.

    ## When ELT
    Modern cloud warehouse/lakehouse; requirements change often (raw history lets you re-model); transforms are relational (joins, aggregates, dedupe); you want analysts to own logic in version-controlled SQL.

    ## The real answer: both
    In a lakehouse the line blurs. Typical: **EtLT**: extract, a *light* transform (mask PII, fix encoding, add metadata), load to bronze, heavy transforms inside with Spark/SQL. Senior answer: "it's a spectrum; here's where I'd draw the line and why".

    ## What goes wrong
    - **ELT cost surprises:** non-incremental dbt models scan full raw tables every run → incremental models, partition pruning, clustering.
    - **Raw PII exposed:** analysts get "temporary" raw access → restrict raw layers, mask in staging, tag PII.
    - **ETL logic in a GUI** nobody can diff or test → version control, documented mappings.
    - **No history to rebuild:** ETL discarded raw, so a logic bug can't be fixed for past data; ELT's raw retention protects you.
    - **Logic in two places** (ETL tool + warehouse views) → debugging is archaeology; pick one boundary.

    ## At scale
    ELT on billions of rows needs **incremental** transforms (new partitions, MERGE changes) and good layout. ETL at scale moves to Spark (really "ELT into the lake, then Spark"): the categories merge. Cost governance (who pays, runaway queries) becomes a design input.

    ## Interview angle
    - "Which is better?" Never pick blindly: explain where the transform runs, then deciding factors (compliance, transformation type, platform compute, change frequency, skills).
    - "Why the move to ELT?" Cheap storage, elastic MPP compute, dbt, raw kept for replay.
    - "Where mask PII?" As early as possible: light transform before landing, or the first staging layer with raw access tightly restricted.
  `),

  batchstream: T(`
    > **In one line:** **batch** processes collected data in chunks on a schedule; **streaming** processes each event (or tiny group) continuously as it arrives. Batch optimises simplicity, completeness and cost; streaming optimises latency.

    ## Why the choice matters
    A monthly finance report doesn't care if a claim appears 6 hours late; an overheating warning 6 hours late is useless. **The delay the business can tolerate decides the processing style.**

    ## How each works
    **Batch:** data accumulates; a scheduled or file-triggered job reads a **bounded** chunk ("all claims updated yesterday"), processes it all, writes, stops. Input is complete and fixed, so logic is simple and re-running the chunk gives the same answer.
    **Streaming:** events flow into a log like Kafka (topics → partitions → offsets). A processor (Spark Structured Streaming, Flink, Kafka Streams) reads them as they arrive, in micro-batches of seconds or per event. Input is **unbounded** (no "end of day"), so it must decide **when a result is final**. It keeps **state** between events (counts, open windows, last value per key) and **checkpoints** state and read position to recover from crashes without loss or double counting.

    ## Concepts streaming forces on you
    | Concept | Meaning | Why it matters |
    |---|---|---|
    | Event time vs processing time | When it happened vs when seen | A 10:00 reading arriving 10:07 lands in the wrong window if you use processing time |
    | Windows | Tumbling (fixed, no overlap), sliding (overlap), session (activity gaps) | "Avg temperature per engine per 5 minutes" |
    | Watermark | "No events older than X will still arrive" | Lets windows close and state be dropped. Too short drops late data; too long costs memory and delay |
    | Late data | Older than the watermark | Dropped, side output, or fixed by batch |
    | State | Remembered between events | Must be bounded (watermarks, timeouts) or memory grows forever |
    | Checkpointing | Saving offsets + state durably | Recovery after failure |
    | Delivery semantics | At-most/at-least/exactly-once | Whether a crash loses or duplicates |
    | Backpressure | Input faster than processing | Lag grows; slow intake or scale out |

    ## Side by side
    | | Batch | Streaming |
    |---|---|---|
    | Input | Bounded | Unbounded |
    | Latency | Minutes-hours | Milliseconds-seconds |
    | Complexity | Lower | Higher (state, time, ordering, recovery) |
    | Late data | Easy: wait, then process | Watermarks and policies |
    | Cost | Run then stop | Always-on |
    | Reprocessing | Re-run the chunk | Replay the log or backfill from storage |
    | Debugging | Same input again | Input keeps moving |
    | Tools | Spark, SQL/dbt, Airflow | Kafka + Spark Structured Streaming / Flink / Kafka Streams |

    **Micro-batch** (Spark default): process the last N seconds as a small batch; seconds of latency, simpler, high throughput. **Continuous/per-event** (Flink, Kafka Streams): milliseconds, harder state handling. Most DE use cases are fine with seconds.

    ## Choosing
    Ask: **what happens if the data is X minutes late?**
    - Nothing for hours → **batch** (reporting, finance, KPIs, model training).
    - Money or safety lost within minutes → **streaming** (fraud, overheating alerts, live operations, stock for online orders).
    - 15-60 minutes is fine → **frequent small batches / incremental**: far cheaper.
    Senior insight: teams **over-choose streaming**; "real-time dashboard" often means "every 15 minutes".
    Real platforms mix both: sensors stream to bronze and drive alerts; silver/gold are recomputed in batch and corrected for late data; ML trains on batch tables. Delta/Iceberg tables can be a streaming sink and batch source at once.

    ## What goes wrong
    - **Duplicates on retry:** crash before committing the offset → reprocessing; need idempotent sinks or exactly-once.
    - **Out-of-order per key:** "stopped" before "started"; order holds only **within a Kafka partition**, so key by engine.
    - **Unbounded state:** dedupe by event_id without a watermark → state grows until the job crashes.
    - **Watermark too strict:** buffered offline events arrive 2 h late and are silently dropped → monitor the dropped-late count.
    - **Batch midnight bug:** events for yesterday still arriving after midnight are missed → reprocess a **lookback window** (e.g. last 3 days) idempotently.
    - **Reprocessing a stream** when Kafka keeps only 7 days → replay from bronze. Keep bronze.

    ## At scale
    Batch scales with parallelism and pruning (cost ∝ data scanned). Streaming scales with **partitions**: Kafka partitions cap consumer parallelism (one consumer per partition per group), so partition counts and keys are capacity decisions. Streaming clusters cost 24/7; batch clusters shut down.

    ## Interview angle
    - "When stream?" Business cost of delay first, then the complexity you accept (state, late data, exactly-once).
    - "Watermark?" Definition + trade-off (late data vs memory and latency).
    - "Late data in batch?" Lookback window + idempotent overwrite of affected partitions.
  `),

  realtime: T(`
    > **In one line:** "real-time" is a **latency promise**, not a technology. Hard real-time = guaranteed milliseconds (machine control); real-time in data = sub-second to seconds; near-real-time = seconds to minutes. Most business "real-time" requests are near-real-time, and the gap is worth a lot of money and complexity.

    ## Why define it
    People use "real-time" for anything from "this second" to "today". Build to the wrong meaning and you fail the business or waste money. Turn the word into a **number**: "visible within N seconds/minutes of the event, P% of the time".

    ## The latency ladder
    | Class | Latency | Examples | Approach |
    |---|---|---|---|
    | Hard real-time | µs-ms, guaranteed | Engine control unit, braking | Embedded systems, not data platforms |
    | Real-time (soft) | < 1 s | Payment fraud check, live recommendations | Stream processing, in-memory stores |
    | Near-real-time | Seconds-~15 min | Fleet dashboard, fault-code alerts, stock levels | Micro-batch streaming, frequent incremental, CDC |
    | Frequent batch | 15 min-hours | Operational reports | Scheduled incremental jobs |
    | Daily batch | Next morning | Finance, KPIs, training | Nightly pipelines |

    ## Latency is end to end
    What matters is event → someone can act. Every hop adds delay:
    «««flow
    Event happens -> Device buffers/sends -> Network -> Ingest (Kafka) -> Processing (micro-batch, windows, watermark) -> Write to table -> Dashboard refresh -> Human notices
    »»»
    - 2-second micro-batches feeding a dashboard that refreshes every 10 minutes = a **10-minute** system.
    - A 5-minute window + 10-minute watermark finalises ~15 minutes after the window starts.
    - Devices buffering offline add hours for some events regardless.
    Design and measure the **whole path**.

    ## Measuring it
    Carry «event_ts» (source), «ingested_ts» (arrival), «processed_ts» (written):
    - **Freshness** = now − max(event_ts): how old is the newest data?
    - **Per-record lag** = processed_ts − event_ts, reported as **p50/p95/p99** (averages hide slow records).
    - **Kafka consumer lag** = latest offset − committed offset.
    State it as an SLO: "95% of readings visible within 60 s".

    ## Cost rises steeply as latency falls
    Daily → hourly: same tools, cheap. Hourly → 5 min: incremental, CDC, more orchestration, moderate. 5 min → seconds: streaming infrastructure, always-on compute, state, exactly-once, 24/7 on-call, expensive. Seconds → ms: specialised in-memory systems, very expensive. Each step must be justified by **what the business can do with fresher data**.

    ## Trade-offs
    - **Freshness vs completeness:** faster publishing misses late events; near-real-time numbers are **provisional**, later corrected by batch. Label them.
    - **Freshness vs consistency:** orders may show before invoices arrive, so ratios look temporarily wrong.
    - **Freshness vs cost:** always-on clusters, many small writes (small files), more monitoring.

    ## What goes wrong
    - **Clock skew:** device clocks wrong (no time zone, reset to 1970) → validate timestamps against a sane range; keep ingest time.
    - **Good average, terrible tail:** p50 3 s, p99 20 min due to one skewed partition → percentiles per partition.
    - **BI caching:** the tool caches for an hour; pipeline speed wasted.
    - **Alert storms:** one hot engine pages 600 times an hour → dedupe and cooldowns.
    - **Lying freshness checks:** "max(ingested_ts) is recent" passes while one source has stopped → check **per source/partition**.

    ## Example (Apex telemetry)
    Engines → Kafka → Spark job writes bronze every 10 s; fault-code alerts in ~30 s end to end (deduped per engine and fault); fleet dashboard on silver refreshed every minute with "data as of"; daily batch recomputes gold health scores including late readings (the authoritative numbers).

    ## Interview angle
    - "Business wants real-time. What do you ask?" What decision, how fast, cost of 1 min / 15 min / 1 h delay, who watches, volume, acceptable accuracy for provisional numbers.
    - "Measure latency?" End to end, timestamps per hop, percentiles, freshness per source.
  `),

  ingestion: T(`
    > **In one line:** **ingestion** gets data out of a source into your platform reliably. **Integration** makes data from different sources work together: same keys, codes and meaning. Ingestion moves data; integration makes it fit.

    ## Why both
    Sources speak differently: queryable databases, rate-limited paginated APIs, never-ending Kafka events, SFTP files at random times, dealer photos. Once in, dealer «D-014» in the CRM is «14» in the ERP and «DLR0014» in warranty. Ingestion solves the first problem, integration the second.

    ## Ingestion methods
    | Method | How | Good for | Watch out |
    |---|---|---|---|
    | Full extract | Read whole table each run | Small tables, no change tracking, periodic reconciliation | Cost grows; load on source |
    | Incremental watermark | «updated_at > last_watermark» | Reliable indexed «updated_at» | Misses hard deletes; clock/time-zone issues; updates that don't touch «updated_at» |
    | CDC | Read the DB transaction log (Debezium, native) | Every insert/update/delete, low latency, low load | Setup, permissions, schema changes, ordering, initial snapshot |
    | API pull | REST/GraphQL with pagination | SaaS (CRM) | 429 rate limits, pagination bugs, token expiry, changing payloads |
    | Webhooks/push | Source calls you | Low latency, no polling | Missed calls when down; replay; endpoint security |
    | Event streams | Subscribe to Kafka/Event Hubs | IoT, app events | Offsets, duplicates, ordering, schema evolution |
    | File drops | Files to SFTP/object storage | Partners, legacy | Partial, late or duplicate files; naming; encodings |
    | Bulk/unstructured | Copy objects + metadata | Documents, media | Size, integrity, sensitive content |
    **Pull** = you control timing and load, but add latency and must track position. **Push** = low latency, but you must be always up, absorb bursts and handle replays.

    ## Reliable ingestion checklist
    1. **Track position** (watermark, offset, processed files) durably, updated **only after** data is safely written; updating first loses data on a crash.
    2. **Overlap and dedupe:** re-read a small window (watermark − 10 min) to catch late commits, then dedupe by key.
    3. **Land raw first** with «_source», «_ingested_at», «_batch_id», «_file_name».
    4. **Validate at the door:** schema, required fields, completeness (trailer counts, «_SUCCESS» markers, checksums).
    5. **Be polite to sources:** rate limits, backoff with jitter on 429/5xx, replicas, off-peak, small pages.
    6. **Handle deletes:** CDC, soft-delete flags or periodic full key comparison.
    7. **Secrets** from a vault, least-privilege read accounts, never in code.
    8. **Observe:** rows per run, lag behind source, failed pages/files, freshness per source.

    ## Integration: making sources fit
    - **Key mapping:** crosswalk «dealer_xref(source, source_id, dealer_key)» → one master key.
    - **Code standardisation:** "Approved", "APPROVED", "A", "1" → one value.
    - **Units and currencies:** kPa vs psi; INR vs USD at the transaction-date rate.
    - **Time:** UTC plus original zone; business calendars (fiscal months).
    - **Entity resolution:** same customer with slightly different names → rules/fuzzy matching → **golden record** (master data management).
    - **Semantic agreement:** "active", "revenue", "claim date" defined once.
    Most business logic and arguments live here.

    | | Ingestion | Integration |
    |---|---|---|
    | Question | Get data in reliably? | Make it consistent and joinable? |
    | Layer | Source → bronze | Bronze → silver |
    | Skills | Connectors, incremental logic, reliability | Modelling, business rules, MDM, quality |
    | Failure | Missing or duplicated records | Wrong joins, mismatched totals, double counting |

    ## What goes wrong
    - **Non-monotonic watermark:** a long transaction commits at 10:05 with «updated_at = 09:58» after your watermark moved to 10:00 → skipped forever. Overlap window or CDC.
    - **Time zones:** local time without zone; daylight saving creates an hour of duplicates or gaps.
    - **Pagination drift:** offset paging while rows are inserted skips/repeats records → cursor/keyset pagination on a stable key.
    - **Partial files** read while still being written → completion marker or rename-on-complete; check row counts.
    - **Same file twice** → track names + checksums; idempotent loads.
    - **HTTP 200 with an error body**, or an empty list on auth failure → validate payloads, not just status.
    - **Source schema change** → contracts, schema checks, capture unknown fields.
    - **Initial vs ongoing load:** 5 years of history needs a chunked, throttled approach, unlike the daily delta.

    ## At scale
    Thousands of tables → **metadata-driven ingestion** (one generic pipeline reading a config table of sources, keys, watermark columns). Managed connectors (Azure Data Factory, Fivetran, Airbyte, Kafka Connect + Debezium), custom code only where needed. Initial loads parallelised by key ranges and throttled. Large files split, compressed, uploaded in parallel with retries and checksums.

    ## Interview angle
    - "Ingest a 500 GB table that changes daily?" One-time chunked snapshot, then CDC or watermark increments, MERGE into target, deletes handled, reconciliation counts.
    - "Watermark vs CDC?" Watermark is simple but misses deletes and late commits; CDC is complete and low-impact but more setup.
    - "Different dealer IDs in two systems?" Crosswalk/master key table, owned and tested; unmatched records reported, not dropped.
  `),

  srcdst: T(`
    > **In one line:** a **source system** is where data is created and owned (system of record); a **destination** (target, sink) is where your pipeline delivers it. You own the journey and must **prove** what arrived matches what left.

    ## Why it matters
    When the dashboard disagrees with the CRM, everyone asks "which is right?". Without clear ownership and source-destination checks, nobody can answer.

    ## Source systems
    - Operational systems creating data as they run the business: CRM, ERP, MES, IoT platforms, HR, partner feeds, SaaS.
    - **System of record:** one authoritative system per entity (claim status: CRM; invoice amount: ERP). If copies disagree, the system of record wins.
    - You **don't control** their schema, releases, uptime, quality or deletes; you depend on them. They impose limits: extraction windows, rate limits, no CDC permission, no history, changing vendor APIs.

    ## Destinations
    Analytical stores (lakehouse, warehouse, marts); serving stores (low-latency DB/cache, search index, vector store, feature store); operational targets via **reverse ETL** (e.g. push a "high failure risk" flag back into the CRM); files and exports (partners, regulators). You **control** schema, partitioning, retention, access, docs, SLAs, and are **accountable** for them.

    ## The contract between them
    | Item | Example |
    |---|---|
    | Owners | CRM team owns the source; data team owns silver.claims |
    | Schema | claim_id INT not null unique; claim_amount DECIMAL(12,2) ≥ 0 |
    | Semantics | "submitted_at = when dealer pressed submit, UTC" |
    | Delivery | Changes via API within 15 min; deletes as status = 'Deleted' |
    | Change process | Breaking changes announced 30 days ahead, versioned |
    | Quality | < 0.1% null dealer_id |
    | Destination SLA | silver.claims fresh within 1 hour, 99% of days |
    These are **data contracts** (own topic later).

    ## Proving source = destination: reconciliation
    "It ran" isn't proof. Compare **counts** per day/partition, **sums** of key measures, **key sets** (missing/extra IDs via anti-joins), **row hashes** (silent changes), at the **same cut-off time** with tolerance for in-flight records. Automate and alert on breaks.

    ## Design driven by the source
    | Source trait | Consequence |
    |---|---|
    | No «updated_at», no CDC | Full extracts + snapshot hash diff |
    | Overwrites history | Capture changes yourself (SCD2, snapshots) |
    | Hard deletes | CDC or periodic full key comparison |
    | Rate-limited API | Incremental pulls, backoff, off-peak bulk |
    | Unreliable uptime | Retries, alerts, serve last good data with freshness shown |
    | Frequent schema changes | Contracts, checks, evolution-tolerant bronze |

    ## Design driven by the destination
    | Need | Consequence |
    |---|---|
    | BI dashboards | Dimensional gold, pre-aggregates, stable names |
    | App lookups in ms | Key-value/serving store, not the warehouse |
    | ML training | Point-in-time correct history, stable features |
    | Regulatory export | Exact formats, audit trail, reproducibility |
    | Reverse ETL to CRM | Respect API limits, idempotent upserts, never overwrite user-owned fields |

    ## What goes wrong
    - **Two systems claim ownership** of one field (address in CRM and ERP) → decide explicitly, or pipelines flip-flop.
    - **Destination becomes a source:** someone "fixes" numbers in the warehouse → fix upstream, or a governed adjustments table.
    - **Reverse ETL loops:** your push triggers CDC → reprocess → push again → change detection.
    - **Reconciling at different times** shows false differences → compare like with like.
    - **Source migration:** if reports depend on a stable silver model, only ingestion changes when the CRM is replaced.

    ## Interview angle
    - "Dashboard doesn't match source?" Same cut-off, filters and definitions; reconcile counts and sums per day; find missing/extra keys; walk back gold → silver → bronze → source to find the divergence.
    - "System of record?" The authoritative source for an entity; others are copies.
    - "Reverse ETL?" Curated warehouse data sent back into operational tools.
  `),

  consumers: T(`
    > **In one line:** **consumers** are the people and systems using your data (dashboards, analysts, scientists, ML models, apps, partners, AI assistants). **Downstream** = everything that depends on your table, directly or indirectly. Your design is judged downstream.

    ## Why it matters
    A pipeline has no value until used, and every change (renamed column, new grain, delayed run) ripples downstream. Knowing consumers tells you **what to build**; knowing dependencies tells you **what you might break**.

    ## Who consumes and what they need
    | Consumer | Needs |
    |---|---|
    | Executives / business users | Correct, simple, consistent KPIs; freshness shown; definitions |
    | Analysts / BI developers | Clean dimensional models, clear grain, documented columns, good performance |
    | Data scientists | Long history, point-in-time correctness (no future leakage), stable features, raw when needed |
    | ML in production | Same feature logic as training, low-latency serving, drift monitoring |
    | Applications | Low-latency APIs or serving stores, high availability |
    | Operational tools (reverse ETL) | Reliable upserts, API limits respected |
    | Partners | Agreed format, security, only their data |
    | AI assistants / RAG | Clean, chunked, permission-aware documents and semantic models |
    | Other pipelines | Stable schemas, contracts, change notice |

    ## How data is served
    Gold tables/marts (BI, SQL); **semantic layer** (metrics like revenue defined once for every tool: Power BI models, dbt metrics, LookML); feature tables/stores (ML); APIs and serving DBs (apps); files/shares (Delta Sharing, partner extracts); vector indexes (semantic search, RAG).

    ## Data as a product
    A **data product** is a dataset built for consumers like software: owner, documentation, defined grain, quality checks, SLA, versioning, discoverable in a catalog, access rules. The posting stresses "certified data products"; consumer focus turns a table into a product.

    ## Changing things safely
    Before a change ask **who reads this?** using **lineage** (catalog/dbt graph), **query/access logs** (who queried it in 90 days) and **contracts**.
    - **Additive** changes (new column): usually safe.
    - **Breaking** changes (rename, remove, type, grain, meaning): publish «v2» beside «v1», announce, migrate, deprecate with a date, then remove.
    - **Semantic changes are most dangerous:** same name, new meaning ("revenue" now excludes tax). Nothing errors; numbers shift. Document, announce, version.

    ## Designing for consumers
    1. Start from the question: decision, grain, filters, freshness. 2. One row means one thing (state the grain). 3. Human names («claim_submitted_date», not «sub_dt»). 4. Model for query patterns (partition by the common filter; pre-aggregate heavy dashboards). 5. Show freshness («data_as_of»). 6. Certify official tables; deprecate copies. 7. Protect: row-level security (dealers see their region), column masking for PII.

    ## What goes wrong
    - **Unknown consumers:** Finance built a critical spreadsheet on your silver table; your change breaks month-end → lineage and access logs.
    - **Metric drift:** three dashboards, three "approval rates" → semantic layer or one certified table.
    - **Training leakage:** today's dealer region joined to last year's claims → point-in-time (SCD2/as-of) joins.
    - **App on the warehouse** per user click → latency and cost explode; use a serving store.
    - **Gold sprawl:** a table per request, 400 near-duplicates → reuse and certify.

    ## At scale
    Thousands of consumers need self-service: searchable catalog, certified products, semantic layer, automated access requests, usage monitoring (deprecate unused tables), chargeback/showback of cost.

    ## Interview angle
    - "Change a column used by many dashboards?" Lineage, versioning, communication, migration window, deprecation.
    - "Same numbers for scientists and dashboards?" Shared certified silver/gold, semantic layer, same feature logic for training and serving.
    - "What is a data product?" Owner, docs, grain, quality checks, SLA, versioning, discoverable, governed access.
  `),
};
