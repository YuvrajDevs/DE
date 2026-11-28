const { T } = require('../_t.cjs');

module.exports = {
  fullincr: T(`
    > **In one line:** a **full load** re-reads and replaces **all** data every run; an **incremental load** processes **only what's new or changed** since last time. Full is simple and self-healing; incremental is fast and cheap at scale but needs careful tracking of "what changed".

    | | Full load | Incremental load |
    |---|---|---|
    | How | Extract everything, replace target (truncate-and-load, or write new version and swap) | Remember a **position** (watermark, max ID, CDC offset, processed-file list), read beyond it, **merge** into target |
    | Pros | Simplest; picks up updates **and deletes**; self-correcting (yesterday's bug vanishes next run); no state | Cost ∝ change; can run often; light on source |
    | Cons | Cost grows with total size; heavy on source; long windows; no history unless you snapshot | More logic and state; risk of missed rows (boundaries, deletes, late commits); errors accumulate unless reconciled |
    | Use for | Small tables (dims, reference data, a few million rows), sources without change tracking, reconciliation runs | Large/fast-growing tables, frequent refresh, events |

    | Incremental variant | Position | Updates? | Deletes? | Note |
    |---|---|---|---|---|
    | Append by ID | max(id) | No | No | Only immutable events with increasing IDs |
    | Watermark on «updated_at» | max(updated_at) | Yes | No | Reliable, indexed column + overlap |
    | CDC (log) | LSN / offset | Yes | Yes | Most complete; more setup |
    | Snapshot diff | Previous snapshot | Yes | Yes | Full extract, incremental apply (hash compare) |
    | File-based | Processed file list | Depends | Depends | Auto Loader / file notifications |
    | Partition-based | Partitions since last run | Within them | Within them | Reprocess changed partitions fully |

    **Applying increments:** **append** only for immutable events, with dedupe on retry; **MERGE by key** (update, insert, optionally delete for CDC ops) is the standard; **partition overwrite** (recompute e.g. the last 3 days and replace) is simple, idempotent and great for late data.

    **The hybrid good pipelines use:** incremental every run + a **lookback window** (last N days) for late data + a periodic **full reconciliation** (weekly counts/keys vs source, full refresh if drift; a monthly full refresh also catches bugs, if the source still has history) + **backfill** support (the same code accepts «--from --to»).

    ## Keeping incremental correct for years
    - **Watermark from commit order, not the wall clock.** «updated_at > last_max» fails when long transactions commit late with older timestamps, app-server clocks differ, some code paths don't set «updated_at» (DBA bulk fixes skip the trigger), or several rows share the max timestamp and some arrive after the extract. Defences: an **overlap window** (re-read the last N minutes, dedupe by key + version), «>=» with dedupe, or log-based CDC.
    - **Save the watermark atomically with the data.** Data written but watermark not saved → re-run re-reads (fine if idempotent). Watermark advanced but write failed → **data lost forever**. Store it in the same commit (Delta table property, control table in the same transaction) or derive it from the target («SELECT MAX(source_ts) FROM target»).
    - **Deletes are invisible** to timestamps → soft-delete flags, CDC, or weekly **key reconciliation** (anti-join source keys vs target keys).
    - **Cost:** for tables under a few GB that change heavily, full reload + swap is often simpler and cheaper overall.

    ## What goes wrong
    - **First run:** empty watermark = one giant pull → plan the initial load separately, chunked.
    - Clock skew / timezones → missed or duplicated windows.
    - **Source restores a backup** (data goes back in time) → watermark is ahead of reality.
    - Schema change mid-stream in CDC.

    **Interview:** full vs incremental (size, change rate, deletes, source capabilities, simplicity); deletes in incremental (CDC, soft deletes, key comparison); detecting drift (periodic reconciliation + full refresh).
  `),

  cdc: T(`
    > **In one line:** **change data capture (CDC)** streams **every insert, update and delete** from a source database as it happens, usually by reading the database's **transaction log**, so targets stay in sync with low latency and almost no load on the source.

    **Why:** watermark extraction misses deletes, misses rows whose «updated_at» didn't change, struggles with late commits and queries production repeatedly; full extracts are heavy. CDC reads what the database already writes for its own recovery: the ordered log of every committed change. (You don't re-read the table: one snapshot at the start, then only the log.)

    | Kind | How | Pros | Cons |
    |---|---|---|---|
    | **Log-based** | Read WAL/binlog/redo (Debezium, native CDC, GoldenGate, AWS DMS) | Complete incl. deletes, ordered, low impact, low latency | Needs log access, connector ops, log retention |
    | **Trigger-based** | Triggers write to a shadow table | Works without log access | Load + latency on every transaction; fragile |
    | **Query-based** | Poll «updated_at»/version | Simple | Misses deletes/some updates; not true CDC |
    | **Snapshot diff** | Compare full snapshots | Works with anything | Heavy; changes between snapshots merge |
    | **Platform** | SQL Server CT/CDC, Snowflake Streams, Delta Change Data Feed | Built in | Platform-specific |

    **An event (Debezium style):**
    «««json
    {"op": "u", "ts_ms": 1764151200000, "source": {"lsn": 8812345, "table": "claims"},
     "before": {"claim_id": 9001, "status": "Submitted", "approved_amount": null},
     "after":  {"claim_id": 9001, "status": "Approved",  "approved_amount": 1200.00}}
    »»»
    «op»: c create, u update, d delete, r snapshot read; before/after images; a log position (LSN/offset) for ordering; commit timestamp.

    «««flow
    Source DB log -> Debezium on Kafka Connect -> Kafka topic per table (keyed by PK) -> Bronze change table (append all) -> MERGE into silver (in order) -> Gold
    »»»
    1. **Initial snapshot** (op = r), then switch to the log at the exact position the snapshot is consistent at, so nothing is missed or doubled. This handoff is where hand-rolled CDC loses/duplicates data; Debezium and Databricks connectors handle it.
    2. **Stream:** each change is keyed by primary key, so one row's changes land in one Kafka partition **in order**.
    3. **Bronze:** append every event with offsets: audit trail and replay source (silver can be rebuilt by replaying with the same deterministic logic: your DR and bug-fix path).
    4. **Apply:** per key, take the latest event in the batch, MERGE: «op = d» → delete or soft-delete, else upsert.

    ## Apply rules
    - **Order by log position, not wall-clock** (timestamps tie or go out of order).
    - **Collapse per key** within a batch (insert + 2 updates + delete → final state only), unless building SCD2 history.
    - **Idempotent:** "only apply if newer than the target's stored sequence number".
    - Decide **hard vs soft delete** (is_deleted + deleted_at) in silver; history tables keep them.
    - **Schema changes** arrive in events → policy: evolve nullable additions automatically, fail loudly on type changes/drops.
    - **Transactions:** an order + its lines are several events; split across micro-batches, downstream sees inconsistent states → group by transaction id (Debezium provides it) or accept and document eventual consistency.
    - **Truncate** events: usually don't propagate blindly.

    **Delta Change Data Feed (CDF)** is the downstream equivalent: Delta records row changes per commit (insert, update_preimage, update_postimage, delete), so silver → gold reads only changes since version N.

    ## What goes wrong
    - **Log retention:** connector down longer than logs are kept → position lost → re-snapshot.
    - **PostgreSQL replication slot growth:** a stopped consumer makes the DB keep WAL until the disk fills: a production outage caused by the pipeline. Monitor slot lag.
    - **Out-of-order apply** resurrects deleted rows or applies stale updates.
    - **Big transactions / volume:** CDC volume = change rate, not table size; a nightly job updating every row = an event storm the size of the table.
    - **Tombstones:** Kafka deletes are followed by a null-value tombstone for compaction; handle both.
    - **PK changes** appear as delete + insert (don't leave orphans); **tables without PKs** can't be applied by key.
    - **TOAST / large unchanged columns** may be missing from update events (partial after-image).

    **Interview:** why log-based (complete, ordered, low impact, low latency); applying to a lakehouse (bronze append, collapse by log position, MERGE with deletes, idempotent); what goes wrong (retention, slots, ordering, schema, big transactions).
  `),

  idempotency: T(`
    > **In one line:** an operation is **idempotent** if running it **once or many times gives the same result**. It's what makes **retries, re-runs and backfills safe**: if you remember one principle from this track, make it this one.

    **Why:** pipelines are re-run constantly (orchestrator retries, on-call reruns, backfills, Kafka at-least-once, a timeout after a successful write). If a step **appends**, every re-run duplicates. Duplicates don't error; they silently inflate revenue, claims and counts.

    | Not idempotent | Idempotent alternative |
    |---|---|
    | «INSERT INTO fact SELECT … WHERE date = :d» | DELETE that date + INSERT in one transaction, or overwrite the partition («replaceWhere» / INSERT OVERWRITE) |
    | Append Kafka events | MERGE on event_id (insert if not exists), or dedupe downstream |
    | «balance = balance + 100» | «balance = 600 WHERE version = 5» (set a computed value) |
    | Alert/email per run | Record "sent" under an idempotency key; skip if sent |
    | IDs from row_number() each run | Deterministic IDs (hash of business key) |
    | «WHERE date = today()» | «WHERE date = :logical_date» |
    | API "create order" on each retry | Pass an idempotency key the API dedupes on |

    **Write patterns:** (1) **partition overwrite** of the partitions the run owns; (2) **MERGE by business key**; (3) **insert-if-absent** on a unique event ID; (4) **write-then-swap** (build in staging, atomically repoint readers); (5) **deterministic inputs** (logical date, fixed per-run watermarks, pinned snapshots).

    **The whole run must be idempotent**, not one step: table writes, watermark updates, file moves, messages, notifications, API calls. Common leak: the write is idempotent but "archive processed file" fails half-way and the re-run can't find the file. External effects need **idempotency keys** (store "sent" by a deterministic id like engine_id + incident_start, or use the receiver's key support).

    **Idempotency vs exactly-once:** exactly-once = each input affects output once. Systems usually deliver **at least once**, so **at-least-once + idempotent processing = effectively exactly-once results** (how Spark → Delta with checkpoints works).
    - **Kafka idempotent producer** («enable.idempotence=true», default in recent clients) stops duplicates from producer retries within a session, **not** your app re-sending after a restart.
    - **Spark + Delta:** batch «replaceWhere» is idempotent per partition; streaming to Delta is idempotent per batch id; **foreachBatch** only if *you* make it so (MERGE by key or «txnAppId»/«txnVersion»).
    - **Prove it:** produce a known set of unique ids, inject duplicates, crash at different points, compare counts and distinct ids (Turbofan: 54,787 expected = 54,787 in silver, 0 duplicates, 0 missing).
    - Idempotency needs **determinism**: pinned inputs, no «now()», deterministic ordering and keys.

    ## What goes wrong
    - **Partition overwrite in static mode** wipes the whole table instead of the run's partitions: know the engine's overwrite mode.
    - **MERGE with duplicate source keys** fails ("multiple source rows matched") or applies one at random → dedupe source first.
    - Non-deterministic «now()», «rand()», unordered «first()».
    - Re-running yesterday includes late rows (good) but downstream aggregates must re-run too.
    - Upstream changed between runs → read from pinned bronze, not the live source.

    **Interview:** definition + 2-3 patterns + example; "job appended and retried" → partition overwrite or MERGE + dedupe test; exactly-once → at-least-once + idempotent sink, or transactional writes with offsets.
  `),

  dedupe: T(`
    > **In one line:** deduplication removes **extra copies of the same record** so each thing/event counts **once**. The hard part isn't code: it's deciding **what "the same" means** and **which copy wins**.

    **Sources of duplicates:** at-least-once delivery (producer retries, consumer reprocessing), re-runs of non-idempotent loads, deliberately overlapping extraction windows, the same file sent twice or history re-exported, several systems describing one entity (CRM and ERP), users entering a claim twice, fan-out joins (look like duplicates, aren't).

    | Kind | Example | Technique |
    |---|---|---|
    | Exact | Identical rows | DISTINCT / dropDuplicates() |
    | Same key, same version | event_id delivered twice | Dedupe by event_id |
    | Same key, many versions | Order 1001: CREATED → CONFIRMED → SHIPPED | Latest per key (ROW_NUMBER) for current state; keep all for history |
    | Same entity, different keys | "Apex Motors Pvt Ltd" vs "APEX MOTORS PVT. LTD." | Entity resolution / fuzzy match, golden record |
    | Business duplicates | Same claim submitted twice with different IDs | Matching rules (same engine + failure + day, similar amount), human review |

    «««sql
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id
               ORDER BY updated_at DESC, ingested_at DESC, event_id DESC) AS rn
      FROM raw_orders_feed)
    WHERE rn = 1;
    »»»
    - **ORDER BY must be fully deterministic**: ties pick arbitrarily and re-runs differ → tie-breakers (ingestion time, offset, unique ID).
    - **ROW_NUMBER, not RANK** (RANK ties → several rows with rn = 1).

    **Choosing the survivor, explicitly:** latest by source sequence/business timestamp; highest-priority source per field (ERP for finance, CRM for contact); most complete (fewest NULLs). **Never** "first in the file" unless order is guaranteed.

    **Streaming:** «dropDuplicatesWithinWatermark(["event_id"])» (or dropDuplicates + watermark) keeps state only for the watermark period; without a watermark state grows forever. A duplicate arriving **after** the watermark isn't caught → size from producer retry behaviour (seconds-minutes) vs re-sent files (days), and add a safety net: MERGE insert-if-not-exists on event_id at the sink.

    **Layer and cost:** bronze keeps everything (evidence, replay), silver dedupes, never in a BI tool. Global dedupe over a growing table = a full shuffle each run → scope by time (partition + lookback), MERGE into a clustered target, or a compact "seen keys" table. **Measure the duplicate rate** per source per day: a jump means a producer/connector changed.

    ## What goes wrong
    - Too few key columns merge real events (two sensors, same second); too many (incl. ingest_time) keep metadata-only duplicates.
    - **NULL keys:** PARTITION BY groups all NULLs; one survives, real rows vanish → handle NULL keys first.
    - Case/whitespace defeats exact dedupe.
    - Deleting in place without backup → build a deduplicated table.
    - Dedupe hides upstream bugs → track how many you removed.

    **Interview:** latest per key (ROW_NUMBER + deterministic order); ROW_NUMBER vs RANK vs DENSE_RANK; dedupe a stream (event ID + watermark state, or idempotent MERGE).
  `),

  recon: T(`
    > **In one line:** reconciliation **proves** destination matches source (or two systems agree) by comparing **counts, sums, keys and hashes** automatically after every load: "I think it's right" becomes "here's the evidence".

    **Why:** pipelines fail silently (a filter drops rows, a join loses keys, a watermark gap, a cast nulls values, a re-run doubles a day). Tests on the target alone can't see what never arrived. Finance, audit and regulated work require it.

    | Level | Compare | Catches | Cost |
    |---|---|---|---|
    | Row counts | Per day/partition | Missing or doubled loads | Very low |
    | Control totals | SUM of amount/qty per partition | Value changes, partial loads, wrong signs | Low |
    | Key sets | Anti-joins both ways | Exactly which records are missing/extra | Medium |
    | Row hashes | «sha2(concat_ws('|', cols…))» per key | Silent value changes on matching keys (then list differing columns) | Higher |
    | Distributions | Counts per status/region, min/max, NULL rates | Mapping errors, code changes | Low |
    | Cross-system | Approved claims in CRM vs credit notes in ERP | Process breaks between systems | Medium |

    ## Doing it right
    1. **Same cut-off:** compare to the source *as of extraction* (or the extract's control totals / the snapshot/LSN used); reconcile **closed periods** (yesterday), since source and target are rarely at the same moment.
    2. **Same scope and rules** on both sides, or reconcile **at every boundary**: source → bronze (did we receive everything?), bronze → silver (in = out + rejected + duplicates removed), silver → gold (sums by day/dealer), gold → BI (dashboard = table).
    3. **Account for rejects:** «source = loaded + quarantined + deliberately filtered»; every row in exactly one bucket.
    4. **Tolerance:** exact for counts and DECIMAL money; small for floats; in-flight allowance for streaming/still-changing sources (re-check later).
    5. **Automate, alert, store:** a results table (date, check, source_value, target_value, diff, status) feeding alerts, dashboards and audit.
    6. **Drill down:** totals → by day → by key.

    **Control files:** enterprise feeds often carry a trailer/manifest ("1,203 rows, total 4,512,330.25"); validate before loading, reject the whole file on mismatch (partial/corrupt transfer).

    **Finance-grade:** reconcile money flows to general-ledger totals; sign conventions, currencies and posting dates hide mismatches.

    ## What goes wrong
    - Comparing at different times and chasing new data.
    - Timezone boundaries (source local day, target UTC day).
    - Soft-deleted rows counted on one side only.
    - **Duplicates offset by missing rows: counts match, data wrong** → key-level comparison.
    - Float sums differ in the 10th decimal → round or DECIMAL.
    - Reconciliation proves consistency, not truth (the source can be wrong).

    **Interview:** "how do you know the load is complete?" (counts, sums, keys per partition, same cut-off, rejects accounted); "counts match but numbers wrong?" (offsetting duplicates/missing, value changes → key + hash comparison).
  `),

  schemaval: T(`
    > **In one line:** schema validation checks **at the boundary** that incoming data has the expected **columns, types, nullability and formats** before it flows on, so bad structure fails fast and visibly instead of spreading silently.

    | Check | Example |
    |---|---|
    | Required columns | claim_id, dealer_id, claim_amount exist |
    | Unexpected columns | New «warranty_type» → rescued column + notice |
    | Types / parseable | amount → DECIMAL, submitted_at → timestamp |
    | Nullability | claim_id NOT NULL |
    | Formats | dealer_code «^D-\\d{3}$», ISO dates |
    | Enums | status ∈ {Submitted, Approved, Partially Approved, Rejected} |
    | Ranges | amount ≥ 0; temperature −50…200 °C |
    | Cross-field / referential / unique | closed_at ≥ opened_at; dealer exists; one row per key |
    | File-level | Header matches; count matches trailer; UTF-8 |
    The first rows are strictly **schema**, the rest **data quality**; they run together. Order: structure first, then semantics. Row checks are cheap; uniqueness/referential need shuffles/joins, so run them on the incremental batch, not the whole table.

    **Where:** at ingestion with an **explicit schema** (never infer in production: JSON inference samples data, so a field that's int in the sample and string later becomes NULL or fails); Auto Loader with schema hints + rescued data; Delta schema enforcement and constraints («CHECK (claim_amount >= 0)», NOT NULL); schema registry for streams; tools: Great Expectations, Soda, dbt tests, pandera, JSON Schema.

    | Policy | Behaviour | Use when |
    |---|---|---|
    | **Fail fast** | Stop the load | Structural break: missing required column, wrong file, broken contract |
    | **Quarantine** | Load good rows, bad rows + reason to a quarantine table, alert | A few bad values |
    | **Coerce to NULL** | Continue | Almost never for important fields: hides problems |
    Spark modes: «FAILFAST»; «DROPMALFORMED» (silently drops rows, counts stop reconciling: dangerous); «PERMISSIVE» (NULLs + «_corrupt_record»). Production: **permissive + route corrupt records to quarantine + alert on rate**.

    **Evolution policy as code:** additive nullable columns → accept and evolve; type change/drop/rename → block and alert (Delta enforcement + Auto Loader rescued data implement this).

    ## What goes wrong
    - Inference in production changes the schema when data changes.
    - PERMISSIVE without checking «_corrupt_record» = silent NULLs.
    - **Rejection-rate threshold:** 1 bad row per million → quarantine; 30% bad → structural change → fail.
    - Validation that only runs in dev.

    **Interview:** handling bad records (explicit schema, quarantine with reason, rate threshold, alerts, fail fast on structure); the three read modes and when each is acceptable.
  `),

  contracts: T(`
    > **In one line:** a **data contract** is a written, versioned, **testable agreement** between a producer and its consumers: schema, meaning, quality, freshness, ownership and how changes happen. It moves quality **upstream**, to where data is created.

    **Why:** app teams change systems without knowing pipelines depend on them; every rename, type change or new status code breaks analytics, found days later by an angry stakeholder. Contracts make the dependency **explicit** and **enforced at the producer's deploy time**.

    «««yaml
    dataset: crm.claims_events
    version: 2.1.0
    owner: crm-platform-team (producer) / data-eng-claims (consumer contact)
    description: One event per claim state change, emitted on commit.
    schema:
      event_id:      {type: string, required: true, unique: true}
      claim_id:      {type: string, required: true}
      status:        {type: string, enum: [Submitted, Approved, Partially Approved, Rejected]}
      claim_amount:  {type: decimal(12,2), required: true, min: 0, unit: INR, excludes_tax: true}
      submitted_at:  {type: timestamp, timezone: UTC}
    quality: [null_rate(dealer_id) < 0.1%]
    freshness: available within 5 minutes of commit (p95)
    delivery: Kafka topic claims.events.v2, Avro, keyed by claim_id
    change_policy: additive any time; breaking = new major version + 30 days parallel run
    pii: none
    »»»
    **Full contents:** schema (names, types, nullability); **semantics** (units, currency, timezone, what NULL means, enums); keys and grain; freshness/latency SLO; volume expectations; quality rules; PII class; owner and escalation; versioning/deprecation policy.

    **Enforcement:** producer CI (schema-registry compatibility, contract tests fail the build); at ingestion (validate, quarantine, alert the **producer's** on-call too); at publish (dbt model contracts enforce column types/constraints); published in the catalog. **Breaking change** = new major version (new topic/table), dual-publish, consumer migration window, deprecation date: like API versioning. Tooling: schema registries, JSON Schema/Avro/Protobuf, dbt contracts, **Open Data Contract Standard (ODCS)** YAML.

    **Schema vs contract vs SLA:** schema = structure only; contract adds meaning, quality, freshness, ownership, change process; SLA = the service-promise part of a contract.

    **Trade-offs:** fewer surprise breaks, clear ownership, faster debugging, enables data products/mesh; but organisational effort and over-specifying slows teams → start with critical datasets. **Contracts are social first:** they work only when producers accept accountability; a DE's lever is making violations visible (quarantine counts per producer, dashboards) and cheap to fix.

    ## What goes wrong
    - Paper-only contract, not tested in CI, drifts from reality.
    - **Semantic changes pass schema checks** (amount now excludes tax): changes in meaning are breaking.
    - Consumer-written contracts the producer never agreed to have no force.
    - Too-strict enums block legitimate new statuses → define how new values are introduced.

    **Interview:** what is it (agreement + enforcement + versioning, with an example); stopping upstream changes breaking pipelines (contracts, registry compatibility, producer CI, consumer validation + quarantine, lineage for impact).
  `),

  dqdims: T(`
    > **In one line:** data quality is measured along **dimensions** (completeness, validity, accuracy, consistency, uniqueness, timeliness, integrity), each needing different checks. "Good" means "fit for its intended use", so thresholds come from consumers.

    | Dimension | Question | Check (claims) |
    |---|---|---|
    | Completeness | Is everything there? | No NULL dealer_id; today's count within ±20% of same-weekday average; every source key arrived |
    | Validity | Follows rules/format? | status in list; amount ≥ 0; dates parse; codes match pattern |
    | Accuracy | Reflects reality? | Sample vs source documents; amounts agree with ERP credit notes |
    | Consistency | Agrees with itself/other systems? | approved ≤ claimed; dealer region same in CRM and warehouse; totals equal across layers |
    | Uniqueness | Recorded once? | One row per claim_id |
    | Timeliness | Recent enough? | max(updated_at) within 2 h; load done by 06:00 |
    | Integrity | Relationships hold? | Every claim's dealer exists in dim_dealer |

    **Kinds of checks:** **rules** (not null, unique, accepted values, ranges, regex, referential, cross-column); **statistical/anomaly** (volume vs the same weekday over 4 weeks, NULL-rate drift, distribution shift in mean/percentiles, new category values, schema drift): they catch gradual drift and the unknown unknowns fixed rules miss; **reconciliation** (source vs target).

    | Severity | Example | Action |
    |---|---|---|
    | Blocker | Duplicate PKs in a gold fact; 0 rows; totals don't reconcile | Fail; don't publish (circuit breaker) |
    | Error | 2% of claims with unknown dealer | Quarantine, publish rest, alert owner |
    | Warning | Volume −25% on a holiday; a few NULL optional attributes | Notify, continue |
    Rule: **block when failure makes the output wrong, warn when it degrades** (decide by "what decision breaks?").

    **Where:** on ingest (schema, validity → quarantine); after transform (uniqueness, integrity, consistency, reconciliation); **before publish** as a gate (**write-audit-publish**: write to staging, audit, then publish); continuously (freshness/volume monitors).

    **Over time:** store results (dataset, check, pass/fail, failing rows, time) and publish **quality SLIs** per table (% rows passing each rule, freshness lag, completeness of critical columns) next to certified products in the catalog: the posting's **"quality assurance metrics and KPIs"**. Checks cost compute → prioritise **critical data elements** (finance, safety, regulatory). A failure should lead to a fix at the source/earliest layer **plus a test** that would have caught it.

    ## What goes wrong
    - Thresholds so loose tests never fail.
    - Alert fatigue → fewer checks with owners.
    - Holidays/seasonality → seasonal or same-weekday baselines.
    - Only checking the latest batch misses slow drift.
    - Accuracy is hard to automate; sample audits still matter.

    **Interview:** each dimension with a check; when a failed check stops the pipeline (severity by consumer impact, quarantine vs fail, write-audit-publish).
  `),

  errors: T(`
    > **In one line:** good error handling decides for every failure kind whether to **retry, quarantine and continue, or stop**, and makes the failure **visible, explained and recoverable** without corrupting data.

    | Class | Examples | Response |
    |---|---|---|
    | Transient | Timeout, HTTP 429/503, lock timeout, spot node lost | Retry, exponential backoff + jitter, bounded |
    | Data, row-level | Unparseable value, one record missing a field | Quarantine with reason, continue, alert on rate |
    | Data, structural | Missing column, wrong file, broken contract, 0 rows | Fail fast, don't publish, alert owner |
    | Config / code | Bad credentials, wrong path, bug, permission denied | Fail fast (retry won't help) |
    | Resource | OOM, disk full, quota | Fail, alert, fix sizing; maybe retry bigger |
    | Upstream not ready | File not arrived, upstream late | Sensor with timeout, then alert |
    Retrying a permanent error only delays the alert and wastes money.

    ## Principles
    1. **Fail loudly:** a swallowed exception («except: pass») is the worst bug in DE.
    2. **Fail before publishing:** partial results never reach consumers.
    3. **Recovery = re-run** (idempotent steps: fix cause, re-run).
    4. **Keep evidence:** raw input, failing rows, error, run ID, code version, batch id, time: enough to replay after a fix.
    5. **Context in alerts:** what, which step, which run/date, summary, log link, runbook, owner. "Job failed" isn't an alert.
    6. **Bound everything:** timeouts, max retries, max rejection rate.
    7. **Clean up** temp files, locks, half-written staging tables.

    **Patterns:** narrow «try/except» around external calls, re-raise unknowns; quarantine/DLQ tables (reason, raw payload, run ID); **circuit breaker** (stop calling a failing dependency for a while); **checkpoints** so long jobs resume; **compensation** (undo side effects: delete staged files, revert a pointer).

    **Senior decisions:**
    - **Partial failure semantics:** 3 of 50 files fail; publish 47? Finance: all-or-nothing. Telemetry: publish with completeness metadata, backfill later. Make it explicit to consumers.
    - **Poison records** that throw on every retry (a bad value in a UDF) stop a stream forever → validate before risky code, catch per record, quarantine.
    - **Error budget:** e.g. < 0.1% quarantined; exceeding it fails the run, because a sudden 30% reject rate means the source changed.

    ## What goes wrong
    - Error inside the handler (quarantine write fails) hides the original → log first.
    - Catch-all turning failures into empty results (API client returns «[]») → "successful" zero-row load.
    - Retrying non-idempotent operations duplicates side effects.
    - Partial batch success with no record of which items succeeded.
    - **Timeout on commit:** unknown outcome → check before retrying.

    **Interview:** flaky API (classify, retry transient with backoff + jitter, fail fast on 401/403, quarantine bad payloads, contextual alerts, idempotent writes); what must never happen (silent swallowing, publishing partial results).
  `),

  retries: T(`
    > **In one line:** retries repeat an operation that failed for a **temporary** reason. Done right (**bounded, exponential backoff + jitter, idempotent operations only**) they absorb most everyday failures; done wrong they duplicate data, hide real errors and knock over struggling systems.

    **Why:** transient failures are normal (node restart, network blip, rate limit, lock timeout, spot reclaim) and mostly succeed seconds later. Without retries every blip pages someone at 3 a.m.

    ## A good retry policy
    - **What:** timeouts, connection resets, HTTP 429/500/502/503/504, deadlocks, throttling. **Not** 400/401/403/404, validation errors, bugs.
    - **How many:** 3-5, or a total time budget.
    - **Wait:** exponential 1, 2, 4, 8 s… capped (~60 s).
    - **Jitter:** random sleep in 0…backoff, else 500 clients that failed together retry together (**thundering herd**).
    - Honour **Retry-After** on 429/503.
    - **Idempotency is the prerequisite:** never add retries to a step before making it idempotent (or pass an idempotency key).
    - **Timeouts are part of it:** a hung call without a timeout never fails, so never retries.
    - **Observe:** log attempt and reason; alert on rising retry rates (degrading dependency).

    | Layer | Example |
    |---|---|
    | Client | HTTP client retries 503 with backoff |
    | Task | Airflow «retries=3, retry_delay=5 min, retry_exponential_backoff=True» |
    | Job | Spark retries tasks («spark.task.maxFailures=4») and lost stages |
    | Pipeline | Re-run from failed step after a fix |
    | Streaming | Restart from checkpoint; consumer re-reads from last committed offset |
    **Retry multiplication:** 3 client × 3 task × 4 Spark = up to 36 attempts on a struggling source → pick the owning layer; set a **platform retry budget** per time window.

    **Circuit breaker:** after N consecutive failures stop calling for a cool-down, fail fast, probe occasionally. **Task-level retries re-run the whole task** → make it resumable (checkpoints) or cheap, or a failure at 95% repeats the first 95%.

    ## What goes wrong
    - Retrying non-idempotent writes → duplicates.
    - **Retry storms** keep a dependency down → backoff, jitter, breakers, concurrency limits (Airflow pools).
    - Long retries hide failures (6 hours of retrying) → alert on first retry for critical paths, cap total time.
    - Retry after partial batch success → idempotent batch or per-item tracking.
    - Retrying a timeout whose operation actually succeeded.

    **Interview:** retries for a flaky API (transient only, backoff + jitter + cap, Retry-After, bounded, idempotent, metrics); thundering herd.
  `),

  dlq: T(`
    > **In one line:** a **dead-letter queue (DLQ)** or quarantine table is where records that **can't be processed** go, with the reason, instead of **crashing the pipeline** or being **silently dropped**. Good records keep flowing; bad ones stay visible and replayable.

    **Why:** one malformed event in a million shouldn't stop the stream (a **poison pill** that crashes the consumer on every restart) or vanish (invisible data loss).

    «««flow
    Input -> Validate / process -> OK? -> Target table
    »»»
    On failure → DLQ entry with: the **original raw payload** (for replay; never only the parsed/failed version), the **error** as a **reason code** (MALFORMED_JSON, MISSING_FIELD, OUT_OF_RANGE, UNKNOWN_DEALER: free text doesn't aggregate) plus message, and **metadata** (source, topic/partition/offset or file + line, pipeline version, run ID, time, attempt count).

    **Implementations:** Kafka DLQ topic («claims.events.dlq»; Kafka Connect «errors.deadletterqueue.topic.name»); a quarantine Delta table per dataset («silver.claims_quarantine»); built-in DLQs after N attempts in SQS, Service Bus, Pub/Sub.

    ## The lifecycle (where teams fail)
    A DLQ without an owner is a **data leak**:
    1. **Monitor** size and inflow rate, alert (a spike = upstream change or your new deploy); report per producer.
    2. **Triage** by reason code, dashboards, a triage SLA.
    3. **Fix** code, mapping or source.
    4. **Replay** through the **same** pipeline with original event time, idempotently (lands once), mark resolved.
    5. **Govern:** raw payloads often hold PII → same access and retention as main data.

    **Retryable vs not:** transient failures go to **retry topics with delays** (retry-1m, retry-10m) or retry in place; only permanently bad records reach the DLQ (mixing floods it during outages). **Systemic failure** (every record fails after a schema change) → fail fast past a rejection-rate threshold.

    **Ordering:** DLQ-ing one CDC event of a key while later ones apply = out-of-order changes → park the whole key/partition until resolved, or make apply tolerate gaps (version checks).

    **Interview:** poison messages in Kafka (catch, DLQ with context, commit offset, monitor, fix, replay); why not drop bad records (silent loss, audit, can't fix what you can't see).
  `),
};
