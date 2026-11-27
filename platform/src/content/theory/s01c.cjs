const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Storage architectures
  storage: T(`
    > **In one line:** a **database** stores and serves data for an application; a **warehouse** stores cleaned, integrated, structured data for analysis; a **lake** stores any data, raw, cheaply, as files; a **lakehouse** puts warehouse-like reliability (transactions, schemas, fast SQL) on top of lake files. They are not rivals; most companies run several.

    ## The problem it solves
    Apex Engines needs to: run the dealer portal (fast safe writes), give finance trusted monthly numbers (clean, integrated history), keep years of raw sensor readings and inspection photos cheaply (huge, varied), and let data scientists train models on all of it. No single classic system did all four well. Each architecture appeared to fix the previous one's limits.

    ## The history in four steps (this is why each exists)
    1. **Databases (1970s+):** run applications. Great at transactions; poor at big analysis across systems.
    2. **Data warehouses (1990s+):** copy data out of many databases, clean and model it for analysis. Trusted and fast for SQL, but expensive, rigid (schema before load) and bad with images, logs or huge raw volumes.
    3. **Data lakes (2010s, Hadoop, then cloud object storage):** dump everything as files, cheap and unlimited, decide structure later. Flexible, but no transactions, no schema enforcement, slow SQL, and often a **data swamp**: nobody knows what is there or whether it is correct.
    4. **Lakehouses (late 2010s+):** add a **table format** (Delta Lake, Apache Iceberg, Apache Hudi) on top of lake files. A transaction log gives ACID writes, schema enforcement, time travel and efficient metadata, so the lake can behave like a warehouse for many workloads.

    ## How each works inside
    ### Database
    Storage and compute in one engine; data in pages on disk; indexes; transaction log; buffer cache. You talk only through the engine.

    ### Warehouse
    - Columnar, compressed storage managed by the engine; MPP query execution; cost-based optimiser.
    - **Schema-on-write:** tables are defined first; loads must conform.
    - Modern cloud warehouses (Snowflake, BigQuery, Redshift, Synapse) **separate storage from compute**: data sits in cloud storage in the vendor's format; you scale compute clusters independently and pay for each.
    - Data usually loaded through ETL/ELT into modelled schemas (staging → core → marts).

    ### Lake
    - Files in object storage (S3, Azure Data Lake Storage Gen2, Google Cloud Storage): CSV, JSON, Parquet, Avro, images, PDFs.
    - Any engine can read them (Spark, Trino, Python), that is the freedom and the problem.
    - **Schema-on-read:** structure is applied when queried.
    - Organised by folder conventions: «/raw/crm/claims/ingest_date=2026-11-26/».
    - The missing pieces: no atomic commits (a half-written job leaves half the files), no updates or deletes of single rows without rewriting files, readers can see partial writes, listing millions of files is slow, no enforcement of schema.

    ### Lakehouse
    - Still files in object storage, but data is Parquet **plus a transaction log** (Delta's «_delta_log», Iceberg's metadata tree, Hudi's timeline).
    - A write creates new Parquet files, then **atomically commits** a log entry listing which files are now part of the table. Readers only see committed files. A half-finished job leaves orphan files that no commit points to, so readers never see them.
    - The log records schema (enforced on write), statistics per file (min/max values for skipping), and history (time travel to an older version).
    - Updates, deletes and MERGE work by rewriting affected files (copy-on-write) or writing delete markers (merge-on-read).
    - Multiple engines can read the same open tables. A catalog (Unity Catalog, AWS Glue, Hive metastore, Polaris) tracks table names, permissions and lineage.

    ## The medallion pattern (bronze, silver, gold)
    A common way to organise a lake or lakehouse:
    | Layer | Contains | Rules | Who uses it |
    |---|---|---|---|
    | **Bronze** (raw) | Data as received, plus load metadata | Append-only, never "fixed", kept for replay | Engineers |
    | **Silver** (clean) | Deduplicated, typed, validated, conformed, joined | Tested, one row per business key at a defined grain | Engineers, analysts, data scientists |
    | **Gold** (serve) | Business-level aggregates and dimensional models | Certified, documented, stable contracts | Dashboards, business users, apps |
    It is a convention, not a law. Some companies add a "landing" zone before bronze or a "platinum" serving layer; some skip gold for some data.

    ## Choosing
    | Need | Best fit | Why |
    |---|---|---|
    | Application reads/writes single records | Database (OLTP) | Transactions, indexes, low latency |
    | Trusted SQL analytics, mostly structured, strong BI | Warehouse | Mature SQL, governance, concurrency, simplicity |
    | Cheap storage of everything, including raw and unstructured | Lake | Cost, any format, any engine |
    | Engineering + SQL + ML on one copy of data, large scale | Lakehouse | Open files, ACID, one platform for many workloads |

    Real answer in interviews: **"it depends on workload, data types, scale, skills and existing platforms"**, then give the reasoning. Many companies have a lake/lakehouse for engineering and ML, and a warehouse or the lakehouse's SQL layer for BI.

    ## Trade-offs
    | | Warehouse | Lake | Lakehouse |
    |---|---|---|---|
    | Cost of storage | Medium-high | Lowest | Low |
    | Data types | Mostly structured (+JSON) | Anything | Anything (tables for structured) |
    | Reliability (ACID) | Yes | No | Yes (via table format) |
    | SQL performance | Excellent | Poor to medium | Good to excellent |
    | Openness | Vendor format | Open files | Open table formats |
    | Ops complexity | Low (managed) | Medium | Medium-high |
    | Governance out of the box | Strong | Weak | Good with a catalog |

    ## Edge cases and what goes wrong
    - **Data swamp:** a lake with no catalog, owners or conventions. Nobody trusts or finds anything. Prevention: catalog, naming conventions, owners, retention.
    - **Small files problem:** streaming or frequent jobs write thousands of tiny files; queries spend more time opening files than reading. Fix: compaction (Delta «OPTIMIZE»), right-sizing writes (aim for roughly 128 MB-1 GB files).
    - **Concurrent writers:** two jobs MERGE into the same table; the table format's optimistic concurrency makes one fail with a conflict. Design partitions or serialise writers.
    - **Time travel is not a backup:** old versions are vacuumed after a retention period, and a dropped table can take its history with it.
    - **Vendor lock-in:** a warehouse's proprietary storage makes leaving expensive. Open table formats reduce this; many warehouses now read Iceberg/Delta.
    - **"Lakehouse" as a label:** files in S3 plus Spark is a lake, not a lakehouse. Without a transaction log you do not have ACID.

    ## At scale
    - Petabyte lakes rely on **partitioning** (by date usually) and **file statistics** to skip data; good layout matters more than compute size.
    - Warehouses at scale need workload isolation (separate compute for ELT, BI and data science) and cost controls (auto-suspend, quotas).
    - Metadata itself becomes big data: Iceberg/Delta manage millions of files with manifest files and checkpoints instead of listing folders.

    ## How interviewers test this
    - "Difference between a data lake and a lakehouse?" The key word is **transaction log / table format**: ACID, schema enforcement, time travel, MERGE, on open files.
    - "Why keep a bronze layer if silver is cleaned?" Replay after bugs, audit, new use cases need fields you dropped.
    - "Warehouse or lakehouse for a company starting fresh?" Ask about data types, scale, ML needs, team skills; argue either side with trade-offs.
  `, {
    check: [
      mcq('What turns a plain data lake into a lakehouse?', ['Moving files to SSD', 'A table format with a transaction log (Delta, Iceberg, Hudi) that gives ACID commits, schema enforcement and time travel on top of the files', 'Using Spark instead of Python', 'Converting CSV to JSON'], 1, 'Without the transaction log, files in object storage plus an engine are still just a lake.'),
      mcq('A Spark job writing to a Delta table crashes after writing half its files. What do readers see?', ['Half the new data', 'The previous committed version, because the new files were never committed to the log', 'An error until someone repairs the table', 'Duplicate rows'], 1, 'Atomic commits are the core lakehouse guarantee. Orphan files are later removed by VACUUM.'),
      tf('Time travel in Delta Lake is a substitute for backups.', false, 'Old versions are vacuumed after the retention period, and dropping a table can remove its history. Back up separately where it matters.'),
      match('Match each layer to what it holds.', [['Bronze', 'Data exactly as received, plus load metadata'], ['Silver', 'Deduplicated, typed, validated data at a defined grain'], ['Gold', 'Business-ready aggregates and dimensional models']], 'The medallion layers separate replay, trust and consumption.'),
      mcq('Queries on a lake table got slow after a streaming job ran for a month. Data volume is modest. What is the likely cause?', ['Too few partitions', 'The small files problem: thousands of tiny files to open and list', 'Parquet is slow', 'The table needs more columns'], 1, 'Compaction (OPTIMIZE) and better write sizing fix it.'),
    ],
    scenarios: [
      scenario('Choosing a platform', `
        Apex Engines wants a new analytics platform. Inputs: CRM and ERP tables (structured), 800 million sensor readings a day, PDF inspection reports, and a data science team that will build failure-prediction models in Python. Finance needs trusted monthly reporting in Power BI.`, [
        ['Which option fits all the needs best?', [
          ['A lakehouse (open table format on object storage) with a SQL layer for BI, and raw files kept in the lake', true, 'One copy of data serves engineering, SQL/BI and ML; unstructured files live in the same storage.'],
          ['Only a traditional warehouse', false, 'Struggles with PDFs and raw sensor volume, and data scientists would export data out of it.'],
          ['Only a raw data lake with CSV files', false, 'No ACID, slow SQL, no schema enforcement; finance will not trust it.'],
        ]],
        ['How do you organise the sensor data?', [
          ['Bronze: raw readings as received; silver: deduplicated, typed, partitioned by date; gold: per-engine hourly aggregates for dashboards', true, 'Medallion layers plus date partitioning keep it replayable and fast.'],
          ['Load raw readings straight into the finance gold tables', false, 'Mixes raw and certified data.'],
          ['Keep only daily averages and discard raw', false, 'The data science team needs detail for failure prediction.'],
        ]],
        ['Finance asks if the lakehouse numbers can be trusted like the old warehouse. What makes that true?', [
          ['ACID commits, schema enforcement, data quality tests, a catalog with owners, and certified gold tables', true, 'Trust comes from guarantees and governance, not the platform label.'],
          ['Because cloud storage never loses data', false, 'Durability of storage is not correctness of data.'],
          ['Because Spark is fast', false, 'Speed is not trust.'],
        ]],
      ], 'Platform choice follows workloads: data types, scale, consumers and governance needs.'),
    ],
    interview: [
      talk('Warehouse vs lake vs lakehouse: when would you choose each?', `
        - **Warehouse:** mostly structured data, BI-heavy, wants a managed, simple, highly concurrent SQL platform with strong governance. Trade-off: cost, proprietary storage, weaker for unstructured data and ML.
        - **Lake:** cheapest storage for anything, including raw and unstructured, any engine. Trade-off: no ACID, weak governance, slow SQL, swamp risk. Today mostly the storage layer underneath a lakehouse.
        - **Lakehouse:** open table format (Delta/Iceberg/Hudi) on object storage: ACID, schema enforcement, time travel, MERGE, file statistics, shared by Spark, SQL engines and ML. Trade-off: more to run and tune (file sizes, compaction, vacuum, concurrency).
        - **Real world:** often a mix: lakehouse for engineering and ML, warehouse or lakehouse SQL for BI. Decide on data types, scale, consumers, skills, existing contracts and cost.
        - Add one gotcha to show depth: small files, vacuum and time travel, or concurrent writers.`),
      talk('Explain how a Delta Lake (or Iceberg) commit works and why it makes a lake reliable.', `
        - Data is written as new Parquet files first; nothing is visible yet.
        - The writer then tries to add a new numbered entry to the transaction log listing files added and removed (plus schema and statistics). This is an atomic operation: it either lands or it does not.
        - **Optimistic concurrency:** if another writer committed first, the writer checks for conflicts (did they touch the same files or partitions?). No conflict: retry the commit at the next version. Conflict: fail, and the job retries.
        - Readers build the table from the log, so they see only committed versions: no partial writes, consistent snapshots, time travel by reading an older version.
        - Files no longer referenced are physically removed later by VACUUM, after a retention window (which is why time travel is limited).`),
    ],
    hands: [
      sql({ q: 'Build the **silver** version of the raw orders feed: **one row per order** with its **latest** status. Return «order_id, status, amount, updated_at». Latest means largest «updated_at»; if two events tie on «updated_at» (a duplicate delivery), keep the one with the larger «ingested_at». Sort by «order_id».', tables: ['raw_orders_feed'], level: 2,
        solution: `SELECT order_id, status, amount, updated_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
  FROM raw_orders_feed
) t
WHERE rn = 1
ORDER BY order_id;`,
        hint: 'ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC), then keep rn = 1.' }),
    ],
  }),

  // ================================================================== Pipelines
  pipelines: T(`
    > **In one line:** a data pipeline is an **automated, repeatable sequence of steps** that moves data from sources to destinations and transforms it on the way, with **scheduling, dependencies, checks, retries and monitoring** built in.

    ## The problem it solves
    Without pipelines, data work is a person running scripts in the right order and noticing when something looks wrong. That fails on holidays, at 3 a.m., when the person leaves, and when there are 200 scripts. A pipeline makes the order, timing, error handling and checks **explicit and automatic**.

    ## The parts of a pipeline
    | Part | Question it answers | Example |
    |---|---|---|
    | **Source** | Where does data come from? | CRM API, ERP database, Kafka topic, SFTP files |
    | **Ingestion** | How do we get it out? | Incremental API pull, CDC, file copy |
    | **Storage zones** | Where does it land and live? | Bronze → silver → gold |
    | **Transformations** | What do we change? | Dedupe, cast, join, aggregate, model |
    | **Orchestration** | When, in what order, what if it fails? | Airflow DAG, daily at 01:00, retries 3 |
    | **Quality checks** | Is the data right before we publish? | Unique keys, row count range, freshness |
    | **Serving** | Who reads it and how? | Gold tables, BI semantic model, API |
    | **Observability** | Is it healthy? Who gets told? | Run logs, metrics, alerts to on-call |
    | **Metadata and lineage** | What is it, where did it come from? | Catalog entries, column docs, lineage graph |

    ## How it runs: the DAG
    Steps and their dependencies form a **DAG**, a directed acyclic graph: arrows show "must finish before", and there are no loops.
    «««flow
    extract_claims -> load_bronze -> clean_claims -> join_dealers -> gold_claims_monthly -> refresh_dashboard
    »»»
    with «extract_dealers -> clean_dealers -> join_dealers» joining in. The orchestrator runs steps whose upstream steps succeeded, in parallel where possible, retries failures, and records every run.

    ## The design principles that make a pipeline "engineered"
    1. **Idempotent:** running a step twice for the same input gives the same result. Use overwrite-by-partition or MERGE by key, never blind append.
    2. **Incremental where it matters:** process only new or changed data (watermarks, CDC) instead of everything every time.
    3. **Deterministic by run date:** a run for 2026-11-26 always processes 2026-11-26's data, using the run's logical date, not «now()». That makes backfills and re-runs correct.
    4. **Atomic publish:** consumers never see half-written results (write to staging then swap, or use transactional table formats).
    5. **Fail loudly, early:** validate inputs before expensive work; stop on broken contracts; quarantine bad rows instead of silently dropping them.
    6. **Observable:** every run records rows in and out, duration, data freshness; alerts go to a person who can act.
    7. **Modular:** small steps with clear inputs and outputs, so you can re-run one step and test it alone.
    8. **Config, not code, for environments:** dev, test and prod differ by configuration (paths, credentials from a secret store), not by edited code.

    ## Architecture patterns
    | Pattern | Shape | When |
    |---|---|---|
    | **Batch ETL/ELT** | Scheduled runs, e.g. hourly or daily | Most reporting; data that changes slowly |
    | **Streaming** | Continuous processing of events | Alerts, monitoring, near-real-time features |
    | **Lambda** | A batch path (complete, corrected) plus a streaming path (fast, approximate), merged for serving | Older pattern; costly because logic is written twice |
    | **Kappa** | Everything is a stream; reprocess history by replaying the log | When a durable log (Kafka) holds enough history; one codebase |
    | **Medallion** | Bronze → silver → gold layers | Lake/lakehouse organisation; works with batch or streaming |
    | **Event-driven** | A file arriving or a message triggers the run | Irregular sources; minimises latency without constant polling |
    Modern lakehouses often run **the same code in batch or streaming mode** (Spark Structured Streaming), which removes most of Lambda's double work.

    ## Trade-offs to discuss
    - **Fewer, bigger steps** run faster (less overhead) but are harder to re-run partially and to debug. **More, smaller steps** are clearer but add scheduling overhead and intermediate storage.
    - **Push vs pull:** sources pushing data (events, webhooks) give low latency but you must handle bursts and replays; pulling on a schedule is simpler and controllable but adds latency.
    - **Central platform team vs teams owning their pipelines:** consistency vs speed and domain knowledge (data mesh discussions).

    ## In a real company pipeline
    The Apex Engines daily claims pipeline in full:
    1. Sensor waits until the ERP's nightly invoice file lands (with a timeout and alert).
    2. Extract claims changed since the watermark from the CRM API, paginated, with retries and backoff on 429/5xx.
    3. Land raw to bronze with «_ingested_at», «_source_file», «_run_id».
    4. Validate the contract (required columns, types); bad rows go to «claims_quarantine» with a reason.
    5. MERGE into silver «claims» by «claim_id» (latest «updated_at» wins).
    6. Tests: «claim_id» unique, «dealer_id» exists in dealers, amounts ≥ 0, row count within ±30% of the 4-week average for that weekday.
    7. Rebuild the gold partitions affected (only the months that changed).
    8. Publish: update freshness metadata, notify the BI refresh.
    9. On any failure: retry transient errors; on persistent failure page the owner with the step, error and run link; do not publish partial gold.

    ## Edge cases and what goes wrong
    - **Partial failure mid-pipeline:** silver updated, gold not. Consumers see inconsistent numbers. Fix: publish gold atomically; make dashboards read only published versions.
    - **Upstream late:** the file arrives 3 hours late; downstream runs on yesterday's data and reports "success". Fix: sensors and freshness checks gate the run.
    - **Retry storms:** 50 tasks retry at the same moment against a struggling API and knock it over. Fix: exponential backoff with jitter, pools to limit concurrency.
    - **Hidden dependencies:** a report depends on a table no DAG declares; a change breaks it silently. Fix: lineage, data contracts.
    - **Clock-based logic:** «WHERE date = today()» breaks on re-runs and backfills. Use the logical run date.
    - **Schema change upstream:** handled by contracts, schema checks and evolution rules (see schema evolution).

    ## At scale
    Hundreds of pipelines need: templates and shared libraries (not copy-paste), standard monitoring, data-aware scheduling (run when the upstream table updates, not at a guessed time), cost tracking per pipeline, and ownership metadata. The hard problems become **coordination and reliability**, not code.

    ## How interviewers test this
    - "Walk me through a pipeline you built." Use the parts table above as your structure, and say what you did about idempotency, late data and monitoring.
    - "What makes a pipeline production-ready?" The eight principles.
    - "Your pipeline failed at step 5 of 9. What happens?" Retries for transient errors, no partial publish, alert with context, fix, re-run from the failed step (idempotent steps make this safe).
  `, {
    check: [
      mcq('Which write strategy makes a daily load step idempotent?', ['INSERT the day\'s rows every run', 'Overwrite the day\'s partition (or MERGE by business key) so re-runs give the same result', 'Append and deduplicate once a month', 'Use a bigger cluster'], 1, 'Re-running an append duplicates data. Overwrite-by-partition and MERGE are the standard idempotent patterns.'),
      mcq('A transformation uses «WHERE event_date = CURRENT_DATE - 1». What breaks?', ['Nothing', 'Re-runs and backfills: running it for an older date still processes "yesterday relative to today"', 'It only works in Spark', 'It is slower'], 1, 'Use the run\'s logical date passed in by the orchestrator so every run is reproducible.'),
      order('Order the steps of a well-built daily run.', ['Wait for the upstream file (sensor)', 'Extract changes since the watermark', 'Land raw in bronze', 'Validate contract, quarantine bad rows', 'MERGE into silver', 'Run data tests', 'Publish gold atomically and alert on failure'], 'Validation before expensive work; tests before publishing.'),
      tf('In a Lambda architecture, the same business logic is usually implemented twice: once for batch and once for streaming.', true, 'That duplication is its main cost, and why Kappa and unified batch/stream engines became popular.'),
      multi('Which of these belong in pipeline observability?', ['Rows read and written per step', 'Data freshness (time since last successful load)', 'Run duration trend', 'The developer\'s IDE theme'], [0, 1, 2], 'Volume, freshness, duration and errors tell you whether a pipeline is healthy.'),
    ],
    scenarios: [
      scenario('Half-published numbers', `
        The claims pipeline updates silver at 01:30 and gold at 01:50. Tonight gold failed with an out-of-memory error. At 08:00 one dashboard (reading silver) shows 1,240 new claims; another (reading gold) shows 1,105.`, [
        ['Why do the dashboards disagree?', [
          ['Silver was updated but gold was not, so consumers see two different points in time', true, 'Partial publish across layers creates inconsistent numbers.'],
          ['One dashboard has a wrong formula', false, 'Possible, but the failed gold step explains the gap exactly.'],
          ['Gold always lags by a day', false, 'Not by design here.'],
        ]],
        ['What do you do this morning?', [
          ['Fix or resize the gold step, re-run it for the affected date (it is idempotent), confirm the numbers match, then tell consumers', true, 'Restore consistency and communicate.'],
          ['Delete tonight\'s silver changes', false, 'Destroys good data to hide a problem.'],
          ['Let gold catch up tomorrow', false, 'Leaves the business on inconsistent numbers all day.'],
        ]],
        ['What design change prevents it?', [
          ['Point business dashboards only at gold, publish gold atomically, and show "data as of" freshness so stale gold is visible', true, 'One serving layer, atomic publish and freshness indicators.'],
          ['Give the gold step more retries', false, 'Helps transient failures, not consistency.'],
          ['Merge silver and gold into one layer', false, 'Loses the separation between clean and certified data.'],
        ]],
      ], 'Consistency across layers is a design responsibility, not luck.'),
    ],
    interview: [
      talk('What makes a data pipeline production-ready?', `
        - **Idempotent** steps (overwrite partition or MERGE by key) so retries and re-runs are safe.
        - **Incremental** processing with watermarks or CDC where volume demands, and a way to **backfill**.
        - **Logical run date**, not «now()», so runs are reproducible.
        - **Validation** at the boundary (schema, contract), **quarantine** for bad rows, **data tests** before publishing.
        - **Atomic publish** so consumers never see half results.
        - **Retries with exponential backoff and jitter** for transient errors; fail fast on permanent ones.
        - **Observability:** rows in/out, duration, freshness, alerts with context to a named owner.
        - **Code quality:** version control, tests, CI/CD, config per environment, secrets in a vault.
        - **Documentation and lineage:** grain, owner, SLA, column meanings.
        Close with one concrete example from your own project.`),
      talk('Lambda vs Kappa architecture: explain and say which you would choose today.', `
        - **Lambda:** a batch layer recomputes complete, correct results periodically; a speed layer processes streams for low-latency approximate results; a serving layer merges both. Pro: correctness from batch plus speed. Con: two codebases with the same logic, which drift apart.
        - **Kappa:** one streaming pipeline; to reprocess, replay the log (Kafka retention or a lake table) through new code. Pro: one codebase. Con: needs long log retention or replay from storage; reprocessing huge history through a stream can be slow.
        - **Today:** engines like Spark Structured Streaming and Flink run the same code in batch and streaming, and lakehouse tables act as both sink and replay source. So I would build a unified pipeline (streaming into Delta/Iceberg bronze, incremental silver and gold) and use batch backfills from bronze for reprocessing.`),
    ],
    hands: [
      py({ q: 'Write «run_order(deps)» for a tiny orchestrator. «deps» maps each task to the list of tasks it depends on. Return a list of tasks in an order where **every task comes after all its dependencies**. When several tasks are ready at the same time, take them in **alphabetical** order. If there is a cycle, raise «ValueError» (a DAG cannot have loops). Tasks may appear only as dependencies.', starter: 'def run_order(deps):\n    pass\n',
        tests: `d = {'gold': ['silver'], 'silver': ['bronze_claims', 'bronze_dealers'], 'bronze_claims': [], 'bronze_dealers': [], 'dashboard': ['gold']}
assert run_order(d) == ['bronze_claims', 'bronze_dealers', 'silver', 'gold', 'dashboard'], run_order(d)
assert run_order({'b': ['a']}) == ['a', 'b']
assert run_order({}) == []
try:
    run_order({'a': ['b'], 'b': ['a']}); raise AssertionError('cycle must raise ValueError')
except ValueError:
    pass`,
        solution: `def run_order(deps):
    nodes = set(deps)
    for ups in deps.values():
        nodes.update(ups)
    remaining = {n: set(deps.get(n, [])) for n in nodes}
    done = []
    while remaining:
        ready = sorted(n for n, ups in remaining.items() if not ups)
        if not ready:
            raise ValueError('cycle detected')
        n = ready[0]
        done.append(n)
        del remaining[n]
        for ups in remaining.values():
            ups.discard(n)
    return done` }),
    ],
  }),
};
