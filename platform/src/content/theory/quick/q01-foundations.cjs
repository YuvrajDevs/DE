const { T } = require('../_t.cjs');

module.exports = {
  whatde: T(`
    > **In one line:** data engineering moves data from where it is created to where it is used, and makes sure it arrives **correct, on time, understandable and safe**, every day, with no human babysitting.

    **Why it exists:** business questions ("which dealers reject most claims?", "warn us before an engine overheats") need data from **several systems** (CRM claims, ERP invoices, factory builds, engine sensors, PDF reports), joined, cleaned, kept for years and refreshed on schedule. Manual spreadsheet exports work once, then break (exports change, filters forgotten, two people get two numbers). DE turns that into an **automated, tested, monitored system**.

    ## The job
    1. **Ingest** from databases, APIs, files, streams, devices.
    2. **Store** cheaply and durably, keeping history.
    3. **Transform:** clean, dedupe, fix types, join, apply rules, model.
    4. **Serve** dashboards, analysts, scientists, ML, apps.
    5. **Operate:** schedule, monitor, alert, test quality, control access, document, fix.
    Step 5 is engineering vs scripting: it must **still work next month** when the source adds a column, sends duplicates, arrives late or doubles in size.

    «««flow
    Sources -> Ingestion -> Raw storage -> Transform -> Serving tables -> Consumers
    »»»
    Kept trustworthy by:
    - **Orchestration:** order, schedule, retries (Airflow).
    - **Quality checks:** no NULL keys, row count near yesterday's, every claim has a dealer.
    - **Monitoring:** ran? how long, how many rows, how fresh?
    - **Governance:** owner, column meanings, who sees personal data, retention.
    - **CI/CD:** pipeline code reviewed, tested, deployed like software.

    ## Judged on five properties
    | Property | What breaks it |
    |---|---|
    | **Correct** | Duplicates, wrong joins, time-zone bugs, silent NULLs |
    | **Timely** | Late jobs, unnoticed failures |
    | **Complete** | Partial loads, dropped late records |
    | **Understandable** | No docs, cryptic names |
    | **Safe** | Exposed personal data, no retention |
    Senior tests: **run twice, does data double? Skip a day, does anyone know? Source sends garbage, does it stop or spread?**

    **Need DE** when data comes from several systems, is reused, refreshed, large or decision-critical. **Not** for a one-off analysis of one small export (over-engineering).

    **Alternatives that fail at scale:** Excel exports (not repeatable, no history), reports on production DB (slows the business, no cross-system joins), no-code for everything (weak on complex logic, scale, testing, cost), every team its own pipelines (duplicated work, conflicting "revenue"). Tools remove plumbing; someone still designs the flow, grain, correctness and owns failures.

    **A day of a real pipeline:** 01:00 run for **yesterday** → pull changed claims since the **watermark** + ERP file → raw to **bronze** with load metadata → dedupe, cast, standardise, join → **silver** → checks (3% unknown dealers quarantined, rest loaded, owner alerted) → **gold** refresh, dashboard shows "data as of 01:42" → models train on silver.

    ## What goes wrong
    - Source renames a column; job succeeds writing NULLs → **schema checks, contracts**.
    - Retry after a half-write doubles data → **idempotent writes** (partition overwrite or MERGE by key).
    - Late data → reprocess a window; incremental on **updated_at**, not created_at.
    - Green run, 0 rows → **volume and freshness checks**.
    - Two definitions of one metric → **one certified gold table**.
    **At scale** the concepts don't change; the cost of mistakes does: Spark, partitioning, incremental loads, streaming where minutes matter, cost monitoring, heavy automation.

    **Interview:** answer with the flow + the five guarantees + one example of re-run safety or monitoring. Trap "job succeeded, so data is correct?" → **no**: code ran ≠ data right; test the data.
  `),

  roles: T(`
    > **In one line:** the **engineer** makes data available and trustworthy, the **analyst** turns it into answers, the **scientist** into predictions. Same data, different questions.

    Roles split as data grows: reliable 50M-rows-a-day pipelines need software/distributed skill; explaining a drop needs business context and statistics; predicting failures needs ML rigour.

    | | Engineer | Analyst | Scientist |
    |---|---|---|---|
    | Question | Right data, right place, reliably? | What happened and why? | What will happen? |
    | Output | Pipelines, tables, data products | Dashboards, analyses | Models, forecasts |
    | Tools | SQL, Python, Spark, Kafka, Airflow, cloud, Git | SQL, Excel, Power BI | Python, stats, ML |
    | "Done" | Runs daily untouched | Stakeholder acted | Works on new data |
    | Typical failure | Duplicates, late data | Wrong metric definition | Overfitting, leakage |

    **Neighbours:** analytics engineer (dbt models in the warehouse; often part of DE 1), ML engineer (models in production, features, drift), BI developer (semantic layer, dashboards), data architect (platform standards), platform/DataOps (clusters, CI/CD, permissions, cost).

    ## Where hand-offs fail
    - **Vague asks** ("active dealers" = 90-day claim? a sale this year?) → write testable definitions first.
    - **Grain confusion** (row per claim vs per claim line) → totals double.
    - **Scientists cleaning raw data in notebooks** → training differs from production (**training-serving skew**) → shared governed silver tables.

    **For this interview:** the posting stresses working with business/IT and serving analysts, so show the **consumer view**: ask what decision the data supports, partition for how they filter, give scientists history and stable definitions. Your analyst background is an advantage: you know consumers' pain.

    **Edge cases:** BI-tool pipelines are fine for small single-source data, not for reused, historical, tested or slow logic. **Data quality is shared:** source owns entry correctness, engineer owns not damaging it and catching problems, business owner defines "correct".

    **Interview:** changing requirements → write it down, acceptance criteria, small early delivery, version changes. "Why DE?" → you saw consumers suffer late, inconsistent data and want to fix the root.
  `),

  lifecycle: T(`
    > **In one line:** data goes **create → collect → store → process → use → share → archive → delete**; DE designs every stage, especially the forgotten last ones.

    Thinking only "load it" causes: unbounded storage cost, deletion requests across 14 untracked copies, audits you can't reproduce because raw was overwritten.

    | Stage | Key decision |
    |---|---|
    | Create | Good keys and timestamps captured? |
    | Collect | Batch or stream; full or incremental? |
    | Store | Format, partitioning, raw copy kept? |
    | Process | Where logic lives, how tested? |
    | Use | Who consumes, how fresh? |
    | Share | Access, masking, contracts (supplier sees only its parts) |
    | Archive | When hot becomes cold? |
    | Delete | Law, privacy requests, legal hold |

    **Tiers:** hot (days-weeks, fast), warm (months), cold/archive (years, cheap, slow or costly to read). Cloud **lifecycle rules** automate moves and deletion.

    **Retention** is set by law (finance kept for years; personal data no longer than needed: GDPR, India's DPDP Act), business need (2 years for year-over-year, history for models), cost/risk, and **legal hold** (lawsuit overrides deletion). The hard part is **deleting every copy** (raw, silver, gold, backups, extracts, training sets), which needs a catalog, **lineage** and PII tags.

    ## What goes wrong
    - Overwriting raw makes cleaning bugs permanent → keep immutable raw.
    - Deleted rows survive in Delta history until **VACUUM**.
    - Backups and exports outlive retention.
    - Archives nobody can read → archive with schema and docs.
    - Retention shorter than the model needs.

    **At scale:** 10,000 engines × 1/s = 864M readings/day → raw hot 30-90 days, **downsampled** aggregates for years, raw archived only if regulation or retraining needs it.

    **Interview:** customer deletion → find copies via lineage/tags, delete or anonymise including history (vacuum), backups by policy, log it, isolate/pseudonymise PII by design. Sensor retention → "depends on law and use; raw short, aggregates long, archive raw if needed".
  `),

  datatypes: T(`
    > **In one line:** **structured** = fixed rows/columns; **semi-structured** = self-describing, flexible, nested (JSON); **unstructured** = images, PDFs, audio, free text. Shape decides ingestion, storage, validation and querying.

    | | Structured | Semi-structured | Unstructured |
    |---|---|---|---|
    | Schema | Defined before writing, enforced (bad data rejected) | Carried in the data; read-time (**schema-on-read**); records may differ | None; describe files in a **metadata table** |
    | Lives in | Relational DBs, ERP/CRM, warehouse tables, Parquet | JSON (APIs, events), XML, Avro, YAML, key=value logs | Object storage |
    | + | Easy SQL, joins, validation | Producers add fields freely | Holds unique info (photo of the crack) |
    | − | Schema changes need coordination | Missing fields, **type drift** ("2" vs 2), nesting | Not queryable; extraction (OCR, models, LLMs) costly; sensitive |

    **Nuances:** shape is about data, not file type (a CSV "comments" column is unstructured content). **Parquet and Avro are structured** (strict schemas: columnar vs row with evolution). JSON may be perfectly regular. Shape changes along a pipeline: JSON → flat silver → gold; PDF → OCR text → fields → embeddings.

    **In a pipeline:** structured via CDC/extracts, validated on types/keys; semi-structured landed raw, then flattened, exploded, cast; unstructured copied with metadata, checked (type, size, virus, readable), then OCR/transcription/classification/embeddings, served via search or vector indexes.

    ## Flattening traps
    1. **Grain change:** exploding 2 parts makes 2 rows → summing claim amounts double-counts.
    2. **Empty arrays vanish** with «explode»; use «explode_outer» to keep the parent.
    3. **NULL vs missing key vs ""** may mean different things: decide and document.

    **Storage choice:** transactional → relational DB; analytical/large → columnar warehouse/lakehouse; semi-structured at volume → raw in lake, flatten (or VARIANT/JSON columns for light use); unstructured → object storage + metadata table.

    ## What goes wrong
    «"1,200.50"» cast silently to NULL → validate, quarantine, alert. New fields → capture (rescued-data column), don't crash. Deep nesting explodes size → flatten only what's needed, keep raw. One 200 MB JSON can't be split → newline-delimited JSON. Bad encodings/BOMs → normalise on ingest. Photos/PDFs contain personal data → govern them.

    **At scale:** JSON is parsed on every read, so convert to Parquet/Delta early (**parse once**); for unstructured, process each file once and store the output.

    **Interview:** "Is JSON structured?" → semi-structured + flattening + type drift. Dealer PDFs → object storage, metadata keyed by claim_id, extraction with confidence scores, quality checks, keep the original.
  `),

  oltpolap: T(`
    > **In one line:** **OLTP** runs the business (many small, safe reads/writes of single records); **OLAP** analyses it (few huge scans and aggregations). Opposite workloads, opposite designs.

    | | OLTP | OLAP |
    |---|---|---|
    | Query | One record by key | Aggregate millions |
    | Storage | **Row**: whole record together | **Column**: read only needed columns, compress 5-10× |
    | Model | **Normalised**: each fact once, safe updates | **Dimensional** (star): few joins |
    | Speed from | Indexes on keys | Parallel scans, partition pruning |
    | Writes | Constant, small, **ACID** | Bulk loads |
    | History | Current state (overwrites) | Years, integrated |
    | Users | Apps, thousands concurrent | Analysts, dashboards, ML |
    | Examples | PostgreSQL, MySQL, Oracle, SQL Server | Snowflake, BigQuery, Redshift, Databricks SQL, ClickHouse |
    **ACID:** Atomic (all or nothing), Consistent (constraints hold), Isolated (concurrent users don't corrupt each other), Durable (survives crashes). Concurrency via locks or **MVCC**.

    **Row vs column, in numbers:** 1B claims × 40 columns, "amount by region": row store reads 40 columns per row, column store reads 2 → ~20× less data. Fetching one full claim reverses it (1 read vs 40).

    **Why not one system:** analytical scans steal CPU/IO from transactions, long reads pressure locks/MVCC, each layout is wrong for the other workload, no cross-system integration, OLTP overwrites history.
    **Middle grounds:** read replica (same layout, one source, lag), operational data store (integrated current data, little history), HTAP (both formats in one engine; costly). Most enterprises separate, and **DE is the bridge**:
    «««flow
    CRM + ERP + MES (OLTP) -> CDC / extracts -> bronze -> silver -> gold star schema (OLAP) -> Dashboards, ML
    »»»
    At the boundary: **don't hurt the source** (CDC, replica, off-peak indexed «updated_at» extracts; never full-scan production every 5 min), **capture history** it overwrites (SCD, snapshots), **reshape** to dimensional.

    ## What goes wrong
    "Quick report" on production grows and locks tables at month-end. Replica lag shows wrong "current" numbers. Hard deletes are invisible to «updated_at» extracts → CDC/soft deletes. Local times across plants → UTC + original zone. Overwritten attributes (dealer moved region) rewrite history unless captured.

    **At scale:** OLTP → indexes, partitions, replicas, **sharding**. OLAP → parallel compute + layout; cloud **separates storage and compute**.

    **Interview:** why not report on production; why columnar is faster (fewer columns, compression, vectorised); safe extraction (CDC, replicas, indexed incremental, off-peak, rate limits).
  `),

  storage: T(`
    > **In one line:** **database** serves apps; **warehouse** holds clean integrated structured data for analysis; **lake** holds any data raw and cheap as files; **lakehouse** = lake files + a **transaction log** giving warehouse reliability. Companies run several.

    **History:** databases (1970s: transactions, poor cross-system analysis) → warehouses (1990s: trusted fast SQL, but costly, rigid schema-on-write, bad with logs/images) → lakes (2010s: cheap, any format, schema-on-read, but no transactions or enforcement, slow SQL, **data swamps**) → lakehouses (table formats **Delta, Iceberg, Hudi**).

    ## Inside each
    - **Warehouse:** engine-managed columnar storage, MPP, cost optimiser; cloud ones **separate storage and compute**; loaded via ETL/ELT into staging → core → marts.
    - **Lake:** files in S3/ADLS/GCS, folder conventions («ingest_date=2026-11-26/»), any engine reads them. Lacks atomic commits (failed jobs leave half the files), single-row updates/deletes, partial-read protection, fast listing, schema enforcement.
    - **Lakehouse:** Parquet + log («_delta_log», Iceberg metadata, Hudi timeline). Writes add files, then **atomically commit** a log entry; readers see committed files only (orphans from failed jobs are invisible). Log holds schema (enforced), per-file min/max (skipping), history (**time travel**). Updates/MERGE rewrite files (copy-on-write) or add delete markers (merge-on-read). A **catalog** (Unity Catalog, Glue, Hive metastore, Polaris) holds names, permissions, lineage.

    ## Medallion layers
    **Bronze** = as received + load metadata, append-only, kept for replay. **Silver** = deduped, typed, validated, conformed, one row per key at a defined grain, tested. **Gold** = certified business aggregates and dimensional models with stable contracts. A convention: some add landing/platinum, some skip gold.

    | | Warehouse | Lake | Lakehouse |
    |---|---|---|---|
    | Storage cost | Medium-high | Lowest | Low |
    | Data types | Mostly structured | Anything | Anything |
    | ACID / SQL speed | Yes / excellent | No / poor-medium | Yes / good-excellent |
    | Open | Vendor format | Open files | Open formats |
    | Ops / governance | Low / strong | Medium / weak | Medium-high / good with catalog |
    **Choose:** single-record app access → DB; trusted BI on structured data → warehouse; cheap storage of everything → lake; engineering + SQL + ML on one copy at scale → lakehouse. Say "it depends on workload, data types, scale, skills, existing platform" and reason.

    ## What goes wrong
    Data swamp (fix: catalog, owners, naming, retention). **Small files** (fix: compaction/«OPTIMIZE», target ~128 MB-1 GB). Concurrent MERGEs conflict (optimistic concurrency; partition or serialise writers). **Time travel isn't a backup** (vacuumed; drop table loses history). Lock-in (open formats help). "Files + Spark" without a log is a lake, not ACID.

    **At scale:** partitioning (usually date) and file stats skip data (layout beats compute); warehouses need workload isolation and auto-suspend; metadata itself is big (manifests, checkpoints instead of listing).

    **Interview:** lake vs lakehouse → transaction log (ACID, schema, time travel, MERGE). Why bronze → replay, audit, fields you later need.
  `),

  pipelines: T(`
    > **In one line:** an **automated, repeatable sequence of steps** moving and transforming data from sources to destinations, with scheduling, dependencies, checks, retries and monitoring built in.

    Without it, a person runs scripts in order (fails at 3 a.m., on holidays, at 200 scripts).

    **Parts:** source → ingestion (pull, CDC, files) → storage zones (bronze/silver/gold) → transformations → **orchestration** (when, order, retries) → **quality checks** → serving (gold, BI, API) → **observability** (logs, metrics, alerts) → **metadata/lineage**.

    **DAG:** steps with "must finish before" arrows and no loops. The orchestrator runs steps whose upstreams succeeded, in parallel where possible, retries, records runs.
    «««flow
    extract_claims -> load_bronze -> clean_claims -> join_dealers -> gold_monthly -> refresh_dashboard
    »»»

    ## Eight principles
    1. **Idempotent:** overwrite partitions or MERGE by key, never blind append.
    2. **Incremental** where it matters (watermarks, CDC).
    3. **Deterministic by run date:** use the **logical date**, never «now()», so re-runs and backfills are correct.
    4. **Atomic publish:** no half-written results visible.
    5. **Fail loudly and early:** validate before heavy work; quarantine bad rows, never drop silently.
    6. **Observable:** rows in/out, duration, freshness, actionable alerts.
    7. **Modular:** small steps, re-runnable and testable alone.
    8. **Config per environment**, secrets from a store.

    ## Patterns
    | Pattern | When |
    |---|---|
    | Batch ETL/ELT | Most reporting |
    | Streaming | Alerts, monitoring, real-time features |
    | Lambda (batch + stream paths merged) | Older; logic written twice |
    | Kappa (all stream, replay the log) | Log keeps enough history; one codebase |
    | Medallion | Lakehouse layers, batch or stream |
    | Event-driven (file/message triggers) | Irregular sources, low latency without polling |
    Spark runs the same code in batch or streaming, removing Lambda's double work.

    **Trade-offs:** bigger steps = less overhead but harder partial re-runs; smaller = clearer but more overhead. Push = low latency, must absorb bursts/replays; pull = simple, slower. Central team = consistency; domain teams = speed (data mesh).

    **Full example:** wait for ERP file (timeout + alert) → extract changed claims (paginated, backoff on 429/5xx) → bronze with «_ingested_at», «_source_file», «_run_id» → contract check, bad rows to quarantine with reason → MERGE silver by claim_id → tests (unique key, dealer exists, amount ≥ 0, count within ±30% of 4-week same-weekday average) → rebuild affected gold partitions → publish freshness + BI refresh → on failure retry transient errors, page owner with context, never publish partial gold.

    ## What goes wrong
    Silver updated but gold not (inconsistent) → atomic gold publish. Late upstream processed as "success" → sensors, freshness gates. **Retry storms** → backoff with jitter, concurrency pools. Undeclared dependencies → lineage, contracts. «today()» logic breaks backfills → logical date. Upstream schema change → contracts, checks.

    **At scale:** templates, shared libraries, standard monitoring, **data-aware scheduling** (run when upstream updates), cost and ownership per pipeline; problems become coordination and reliability.

    **Interview:** walk a pipeline through the parts + idempotency, late data, monitoring. "Failed at step 5 of 9?" → retry transient, no partial publish, alert, fix, re-run from step 5 (safe because idempotent).
  `),

  etlelt: T(`
    > **In one line:** **ETL** transforms **outside** the destination and loads clean results; **ELT** loads **raw** first and transforms **inside** with the destination's compute (usually SQL). The difference is where/when transformation runs.

    **History:** old warehouses were costly fixed appliances, so a separate ETL server (Informatica, SSIS, DataStage, Talend) loaded only clean rows. Cloud brought **cheap storage** (keep raw), **elastic MPP compute** (warehouse = strongest engine) and **dbt** (versioned, tested SQL), so ELT won: load fast, nothing lost, re-model from raw.

    | | ETL | ELT |
    |---|---|---|
    | Raw in destination | No | Yes |
    | Logic change | Re-extract (if source still has history) | Re-run SQL on raw |
    | Time to first data | Slower | Faster |
    | Sensitive data | Masked **before** landing | Lands raw; protect inside |
    | Builders | ETL specialists | Anyone with SQL |
    | Cost | Licences, servers | Warehouse compute |
    | Tools | Informatica, SSIS, Talend, Python/Spark | Fivetran/Airbyte + dbt + Snowflake/BigQuery/Databricks |

    **Choose ETL** when data must not land raw (PII, regulated, export-controlled), processing is heavy non-SQL (binaries, images, Python, ML scoring), the target is weak (operational DB, SaaS = reverse ETL), or volume is mostly noise (downsample at the edge).
    **Choose ELT** on elastic cloud platforms, with changing requirements, relational logic, and analysts owning SQL.
    **Reality: EtLT** = light transform first (mask PII, fix encoding, add metadata) → bronze → heavy transforms inside. Say where you'd draw the line and why.

    ## What goes wrong
    Non-incremental dbt models scan full raw tables (fix: incremental, pruning, clustering). "Temporary" raw PII access (restrict raw, mask in staging, tag PII). ETL logic hidden in GUIs (version control, documented mappings). ETL threw raw away, so past bugs can't be fixed (ELT's raw retention protects). Logic split across tools (one boundary).

    **At scale:** incremental ELT (new partitions, MERGE) + layout; ETL moves to Spark, so the categories merge; cost governance becomes a design input.

    **Interview:** never pick blindly: where it runs + compliance, transform type, compute, change rate, skills. PII → mask as early as possible.
  `),

  batchstream: T(`
    > **In one line:** **batch** processes collected chunks on a schedule (simple, complete, cheap); **streaming** processes events continuously as they arrive (low latency).

    The deciding question: **what does a delay cost?** A late claim in a monthly report costs nothing; a 6-hour-late overheat warning is useless.

    **Batch:** a bounded chunk ("claims updated yesterday") is processed fully, then the job stops; re-running gives the same answer.
    **Streaming:** events enter a log (Kafka: topics → partitions → offsets); a processor (Spark Structured Streaming, Flink, Kafka Streams) reads continuously, often in micro-batches of seconds. Input is **unbounded**, so it must decide when results are final, keep **state** between events and **checkpoint** state + position to recover without loss or double counting.

    | Concept | Meaning |
    |---|---|
    | Event vs processing time | When it happened vs when seen (a 10:00 reading arriving 10:07 belongs to 10:00) |
    | Windows | Tumbling (fixed), sliding (overlapping), session (activity gaps) |
    | **Watermark** | "Nothing older than X still coming": closes windows, frees state. Too short drops late data; too long costs memory and delay |
    | Late data | Older than watermark: dropped, side output or batch-corrected |
    | State | Must be bounded (watermarks, timeouts) |
    | Delivery semantics | At-most / at-least / exactly-once |
    | Backpressure | Input faster than processing; lag grows |

    | | Batch | Streaming |
    |---|---|---|
    | Latency | Minutes-hours | ms-seconds |
    | Complexity | Low | High (state, time, ordering, recovery) |
    | Cost | Run then stop | Always on |
    | Reprocess | Re-run chunk | Replay log or backfill from storage |
    | Debug | Same input again | Input keeps moving |
    **Micro-batch** (Spark default): seconds, simpler, high throughput. **Per-event** (Flink, Kafka Streams): milliseconds, harder state. Seconds is enough for most DE.

    **Choose:** delay harmless for hours → batch (reports, finance, training); money/safety lost in minutes → streaming (fraud, alerts, live ops); 15-60 min OK → frequent incremental batches (much cheaper). Teams **over-choose streaming**. Real platforms mix: streams for bronze and alerts, batch for corrected gold and training; Delta tables serve both.

    ## What goes wrong
    Crash before committing offsets → reprocessing → need idempotent sinks. Order holds only **within a Kafka partition** → key by engine. Dedupe without a watermark → unbounded state. Too-strict watermark silently drops offline-buffered events → monitor dropped-late count. Nightly batch misses yesterday's stragglers → **lookback window** reprocessed idempotently. Kafka keeps 7 days → replay from bronze.

    **At scale:** batch cost ∝ data scanned; streaming parallelism capped by **partitions** (one consumer per partition per group), so partition counts and keys are capacity decisions; streams cost 24/7.

    **Interview:** streaming = cost of delay first, then the complexity accepted. Late data in batch = lookback + idempotent partition overwrite.
  `),

  realtime: T(`
    > **In one line:** "real-time" is a **latency promise**. Hard real-time = guaranteed ms (machine control, not data platforms); real-time = under a second; near-real-time = seconds to ~15 min. Most "real-time" requests are near-real-time, and the difference is huge in cost.

    Turn the word into a number: **"visible within N seconds, P% of the time"**.

    | Class | Latency | Example | Approach |
    |---|---|---|---|
    | Real-time | < 1 s | Payment fraud check | Streaming, in-memory stores |
    | Near-real-time | s-15 min | Fleet dashboard, fault alerts | Micro-batches, CDC, frequent incremental |
    | Frequent batch | 15 min-hours | Operational reports | Scheduled incremental |
    | Daily batch | Next morning | Finance, training | Nightly |

    **End-to-end latency** is what counts: device buffering → network → Kafka → processing (micro-batch, window, watermark) → table write → dashboard refresh → human. 2-second batches + a 10-minute dashboard refresh = a 10-minute system; a 5-minute window + 10-minute watermark finalises ~15 minutes in; offline buffering adds hours.
    **Measure:** carry «event_ts», «ingested_ts», «processed_ts»; **freshness** = now − max(event_ts); per-record lag as **p50/p95/p99** (averages hide tails); Kafka **consumer lag** = latest − committed offset. Write an SLO ("95% within 60 s").

    **Cost climbs steeply:** daily→hourly cheap; hourly→5 min moderate (incremental, CDC); 5 min→seconds expensive (always-on streaming, state, exactly-once, 24/7 on-call); seconds→ms very expensive. Justify each step by what fresher data lets the business do.
    **Trade-offs:** fresh numbers are **provisional** (late events missing, later corrected: label them); temporary inconsistencies (orders before invoices); more cost (clusters, small files, monitoring).

    ## What goes wrong
    Device clock skew (1970 dates) → validate time ranges, keep ingest time. Good p50, awful p99 from one skewed partition → per-partition percentiles. BI caching wastes pipeline speed. Alert storms → dedupe and cooldowns. Freshness checked globally hides one dead source → check **per source**.

    **Example:** engines → Kafka → bronze every 10 s; fault alerts ~30 s end to end (deduped); dashboard on silver every minute with "data as of"; daily batch gold is authoritative.

    **Interview:** ask what decision, how fast, cost of 1 min/15 min/1 h delay, who watches, volume, acceptable provisional accuracy. Measure end to end with percentiles per source.
  `),

  ingestion: T(`
    > **In one line:** **ingestion** gets data out of sources reliably; **integration** makes different sources fit together (same keys, codes, meaning).

    | Method | Good for | Watch out |
    |---|---|---|
    | Full extract | Small tables, no change tracking, reconciliation | Cost and source load grow |
    | Incremental watermark («updated_at > last») | Reliable indexed updated_at | Misses hard deletes, late commits, updates not touching updated_at; time zones |
    | **CDC** (transaction log, Debezium) | All inserts/updates/deletes, low latency and load | Setup, permissions, schema changes, ordering, initial snapshot |
    | API pull | SaaS (CRM) | 429 limits, pagination bugs, token expiry, changing payloads |
    | Webhooks (push) | Low latency | Missed calls when down, replay, endpoint security |
    | Event streams | IoT, app events | Offsets, duplicates, ordering, schema evolution |
    | File drops | Partners, legacy | Partial, late, duplicate files; encodings |
    | Bulk objects | Documents, media | Size, integrity, sensitivity |
    **Pull** = you control timing, must track position, adds latency. **Push** = fast, but always-on, bursts, replays.

    ## Reliable ingestion checklist
    1. Track position (watermark/offset/files) and update it **only after** data is safely written.
    2. Re-read a small **overlap** and dedupe by key (catches late commits).
    3. Land raw first with «_source», «_ingested_at», «_batch_id», «_file_name».
    4. Validate at the door: schema, required fields, completeness (trailer counts, «_SUCCESS», checksums).
    5. Be polite: rate limits, backoff with jitter, replicas, off-peak, small pages.
    6. Handle deletes: CDC, soft deletes or periodic full key comparison.
    7. Secrets from a vault; least-privilege accounts.
    8. Observe rows, lag, failures, freshness per source.

    ## Integration
    Crosswalk tables map source IDs to one master key («D-014» = «14» = «DLR0014»); standardise codes; convert units and currencies (rate at transaction date); UTC + original zone and fiscal calendars; **entity resolution** to a golden record (MDM); agree meanings ("active", "revenue") once. Ingestion = source → bronze (fails as missing/duplicate rows); integration = bronze → silver (fails as wrong joins and mismatched totals).

    ## What goes wrong
    Long transaction commits with an older «updated_at» after the watermark moved → skipped forever (overlap or CDC). Daylight saving creates duplicate/missing hours. Offset pagination while rows insert skips/repeats → keyset pagination. Partial files → completion markers, row-count checks. Re-sent files → track names + checksums, idempotent loads. HTTP 200 with an error or empty body → validate payloads. Schema changes → contracts, capture unknown fields. First load of years of history → chunked, throttled, separate from daily delta.

    **At scale:** **metadata-driven ingestion** (one generic pipeline + a config table of sources, keys, watermarks); managed connectors (ADF, Fivetran, Airbyte, Kafka Connect/Debezium); parallel, throttled initial loads by key range; large files split, compressed, uploaded in parallel with checksums.

    **Interview:** 500 GB daily-changing table → chunked snapshot, then CDC/watermark increments, MERGE, deletes handled, reconciliation. Watermark vs CDC → simple but misses deletes/late commits vs complete but more setup. Different IDs → owned, tested crosswalk; unmatched rows reported, never dropped.
  `),

  srcdst: T(`
    > **In one line:** a **source** is where data is created and owned (**system of record**); a **destination** is where you deliver it. You own the journey and must **prove** arrival matches departure.

    **Sources** (CRM, ERP, MES, IoT, HR, partners, SaaS): one authoritative system per entity (claim status → CRM, invoice → ERP). You **don't control** their schema, releases, uptime, quality or deletes, and they impose limits (windows, rate limits, no CDC access, no history).
    **Destinations:** analytical (lakehouse, warehouse, marts), serving (low-latency DB, search, vector store, feature store), operational via **reverse ETL** (push a risk flag into the CRM), exports. You **control and are accountable** for schema, layout, retention, access, docs, SLAs.

    **Contract between them:** owners on both sides, schema and types, semantics ("submitted_at = submit click, UTC"), delivery (API within 15 min, deletes as status), change process (30-day notice, versioning), quality targets, destination SLA. (These are **data contracts**.)

    **Reconciliation proves it:** counts per partition, sums of key measures, missing/extra keys (anti-joins), row hashes for silent changes, all at the **same cut-off** with tolerance for in-flight data; automated with alerts.

    | Source trait → design | Destination need → design |
    |---|---|
    | No updated_at/CDC → full extracts + hash diff | BI → dimensional gold, pre-aggregates, stable names |
    | Overwrites history → SCD2/snapshots | ms app lookups → serving store, not warehouse |
    | Hard deletes → CDC or key comparison | ML → point-in-time history |
    | Rate limits → incremental, backoff, off-peak | Regulator → exact format, audit trail |
    | Unreliable → retries, serve last good data with freshness | Reverse ETL → API limits, idempotent upserts, don't overwrite user fields |
    | Schema churn → contracts, tolerant bronze | |

    ## What goes wrong
    Two systems both "own" a field → decide, or pipelines flip-flop. Someone edits the warehouse to "fix" numbers → fix upstream or use a governed adjustments table. Reverse-ETL loops (push → CDC → push) → change detection. Comparing different cut-offs shows fake gaps. Source migration hurts less if reports depend on a stable silver model.

    **Interview:** dashboard ≠ source → same cut-off/filters/definitions, reconcile per day, missing/extra keys, walk back gold → silver → bronze → source.
  `),

  consumers: T(`
    > **In one line:** **consumers** use your data (dashboards, analysts, scientists, ML, apps, partners, AI assistants); **downstream** is everything depending on your table. Your design is judged there.

    | Consumer | Needs |
    |---|---|
    | Business users | Correct consistent KPIs, freshness shown, definitions |
    | Analysts/BI | Dimensional models, clear grain, documented columns, speed |
    | Data scientists | Long history, **point-in-time** correctness, stable features |
    | Production ML | Same feature logic as training, low latency, drift monitoring |
    | Apps | Low-latency serving stores/APIs, availability |
    | Reverse ETL tools | Reliable upserts within API limits |
    | Partners | Agreed format, security, only their data |
    | AI/RAG | Clean, chunked, permission-aware documents, semantic models |
    | Other pipelines | Stable schemas, contracts, change notice |
    **Served via:** gold marts, a **semantic layer** (metrics defined once for all tools), feature stores, APIs, shares (Delta Sharing), vector indexes.

    **Data as a product:** owner, docs, grain, quality checks, SLA, versioning, catalog discoverability, access rules. That's what "certified data products" in the posting means.

    ## Changing safely
    Find readers with **lineage**, **access logs** and **contracts**. Additive changes are usually safe; **breaking** changes (rename, remove, type, grain, meaning) → publish v2 beside v1, announce, migrate, deprecate with a date. **Semantic changes** (same name, new meaning) are the most dangerous: nothing errors, numbers just shift.

    **Design rules:** start from the decision, grain, filters, freshness; one row = one thing; human names; partition and pre-aggregate for real query patterns; show «data_as_of»; certify official tables; row-level security and PII masking.

    ## What goes wrong
    Hidden consumers (Finance spreadsheet on silver) break silently. Three "approval rates" → semantic layer. **Leakage:** today's attributes joined to past events → as-of joins. Apps querying the warehouse per click → serving store. Gold sprawl (400 near-duplicates) → reuse and certify.
    **At scale:** self-service catalog, certified products, automated access, usage monitoring (retire unused tables), cost showback.

    **Interview:** changing a widely used column → lineage, versioning, communication, migration window, deprecation.
  `),
};
