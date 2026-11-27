const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Full vs incremental
  fullincr: T(`
    > **In one line:** a **full load** re-reads and replaces **all** the data every run; an **incremental load** processes **only what is new or changed** since the last run. Full is simple and self-healing; incremental is fast and cheap at scale but needs careful tracking of "what changed".

    ## Full load
    - **How:** extract the whole source table, replace the target (truncate-and-load, or write a new version and swap).
    - **Pros:** simplest logic; automatically picks up updates **and deletes**; self-correcting (yesterday's bug disappears on the next run); no state to track.
    - **Cons:** cost and time grow with total size, not with change; heavy load on the source; long windows; cannot keep history unless you snapshot.
    - **Use when:** small tables (dimensions, reference data, a few million rows), sources without change tracking, periodic reconciliation runs.

    ## Incremental load
    - **How:** remember a **position** (watermark timestamp, max ID, CDC log offset, list of processed files), read only beyond it, then **merge** changes into the target.
    - **Pros:** cost proportional to change; can run often (near-real-time); light on the source.
    - **Cons:** more logic; state to manage; risk of missed records (boundary issues, deletes, late commits); errors accumulate unless reconciled.
    - **Use when:** large or fast-growing tables, frequent refresh, event data.

    ## The variants of incremental
    | Variant | Position | Catches updates? | Catches deletes? | Notes |
    |---|---|---|---|---|
    | Append-only by ID | max(id) | No | No | Only for immutable events with increasing IDs |
    | Watermark on «updated_at» | max(updated_at) | Yes | No | Needs a reliable, indexed column; use an overlap |
    | CDC (log-based) | Log sequence number / offset | Yes | Yes | Most complete; more setup |
    | Snapshot diff | Previous full snapshot | Yes | Yes | Full extract, but incremental apply (hash compare) |
    | File-based | Processed file list | Depends | Depends | Auto Loader / file notifications |
    | Partition-based | Partitions since last run | Within partitions | Within partitions | Reprocess changed partitions fully |

    ## Applying increments to the target
    - **Append:** only for truly immutable events, and only with dedupe on retry.
    - **Upsert / MERGE by key:** update existing, insert new, optionally delete (CDC ops). The standard.
    - **Partition overwrite:** recompute affected partitions completely (e.g. last 3 days) and replace them. Simple and idempotent; great for late data.

    ## The hybrid most good pipelines use
    - Incremental every run (hourly/daily) for speed.
    - A **lookback window** (reprocess the last N days) to catch late data.
    - A periodic **full reconciliation** (weekly) comparing counts/keys with the source, and a full refresh if drift is found.
    - **Backfill** capability: run the incremental logic for any historical range.

    ## Edge cases and what goes wrong
    - **First run:** the watermark is empty; the "incremental" query reads everything in one giant pull. Plan the initial load separately (chunked).
    - **Watermark stored before data is committed** → gap on failure.
    - **Clock skew / timezones** between source and pipeline → missed or duplicated windows.
    - **«updated_at» not updated** by some source code paths (bulk fixes by DBAs) → silent misses. Reconciliation catches it.
    - **Deletes invisible** to watermarks → target keeps rows the source deleted.
    - **Source restores a backup** (data goes back in time) → watermark is ahead of reality.
    - **Schema change mid-stream** in CDC.

    ## How interviewers test this
    - "Full vs incremental: when each?" Size, change rate, deletes, source capabilities, simplicity.
    - "How do you handle deletes in incremental loads?" CDC, soft deletes, periodic key comparison.
    - "How do you know your incremental pipeline is not drifting?" Periodic reconciliation and full refresh.
  `, {
    check: [
      mcq('Which load type automatically reflects rows deleted in the source?', ['Append by max ID', 'Watermark on updated_at', 'Full load (replace everything)', 'None'], 2, 'A full reload mirrors the source, deletes included. Incremental needs CDC or key comparison for deletes.'),
      mcq('Why add a lookback window (reprocess the last 3 days) to a daily incremental job?', ['To make it slower', 'To catch late-arriving or late-committed records, using idempotent partition overwrite or MERGE so re-processing is harmless', 'To delete old data', 'It is required by Spark'], 1, 'Late data is normal; idempotent reprocessing of a small window absorbs it.'),
      tf('An incremental pipeline that never reconciles with the source can drift silently over months.', true, 'Missed boundary records, unnoticed deletes and manual source fixes accumulate.'),
      match('Match the incremental variant to its weakness.', [['Append by max ID', 'Misses updates and deletes'], ['Watermark on updated_at', 'Misses deletes; boundary/late-commit gaps'], ['CDC', 'More setup and operational care'], ['Snapshot diff', 'Still extracts the full table each time']], 'Every variant trades completeness for cost or complexity.'),
    ],
    hands: [
      py({ q: 'Write «next_window(last_watermark, max_seen, overlap_minutes)» for an incremental extractor. It returns «(start, new_watermark)»: «start» = «last_watermark» minus the overlap (or «None» if there is no watermark yet: first run reads everything); «new_watermark» = «max_seen» (the largest «updated_at» actually read), but **never move backwards**: if «max_seen» is «None» (no rows read) or older than «last_watermark», keep «last_watermark». Timestamps are ISO strings «"YYYY-MM-DD HH:MM:SS"».', starter: 'from datetime import datetime, timedelta\n\ndef next_window(last_watermark, max_seen, overlap_minutes):\n    pass\n',
        tests: `assert next_window('2026-11-05 00:00:00', '2026-11-05 06:30:00', 30) == ('2026-11-04 23:30:00', '2026-11-05 06:30:00')
assert next_window(None, '2026-11-05 06:30:00', 30) == (None, '2026-11-05 06:30:00')
assert next_window('2026-11-05 00:00:00', None, 10) == ('2026-11-04 23:50:00', '2026-11-05 00:00:00'), 'no rows read: keep watermark'
assert next_window('2026-11-05 00:00:00', '2026-11-04 23:59:00', 0) == ('2026-11-05 00:00:00', '2026-11-05 00:00:00'), 'never move backwards'
assert next_window(None, None, 5) == (None, None)`,
        solution: `from datetime import datetime, timedelta

FMT = '%Y-%m-%d %H:%M:%S'

def next_window(last_watermark, max_seen, overlap_minutes):
    start = None
    if last_watermark is not None:
        start = (datetime.strptime(last_watermark, FMT) - timedelta(minutes=overlap_minutes)).strftime(FMT)
    if max_seen is None:
        return start, last_watermark
    if last_watermark is not None and max_seen < last_watermark:
        return start, last_watermark
    return start, max_seen` }),
    ],
  }),

  // ================================================================== CDC
  cdc: T(`
    > **In one line:** **change data capture (CDC)** streams **every insert, update and delete** from a source database as it happens, usually by reading the database's **transaction log**, so targets stay in sync with low latency and almost no load on the source.

    ## The problem it solves
    Watermark extraction misses deletes, misses rows whose «updated_at» did not change, struggles with late commits, and queries the production database repeatedly. Full extracts are heavy. CDC reads what the database already writes for its own recovery: the log of every committed change, in order.

    ## The kinds of CDC
    | Kind | How | Pros | Cons |
    |---|---|---|---|
    | **Log-based** | Read the WAL/binlog/redo log (Debezium, native CDC, Oracle GoldenGate, AWS DMS) | Complete (incl. deletes), ordered, low source impact, low latency | Needs log access/permissions, connector operations, retention of logs |
    | **Trigger-based** | DB triggers write changes to a shadow table | Works where logs are not accessible | Adds load and latency to every transaction; fragile |
    | **Query-based** | Poll with «updated_at» / version columns | Simple | Misses deletes and some updates; polling load (not true CDC) |
    | **Snapshot diff** | Compare full snapshots | Works with anything | Heavy; changes between snapshots merge |
    | **Platform features** | SQL Server Change Tracking/CDC, Snowflake Streams, Delta Change Data Feed | Built in | Platform-specific |

    ## What a CDC event looks like (Debezium style)
    «««json
    {"op": "u", "ts_ms": 1764151200000, "source": {"lsn": 8812345, "table": "claims"},
     "before": {"claim_id": 9001, "status": "Submitted", "approved_amount": null},
     "after":  {"claim_id": 9001, "status": "Approved",  "approved_amount": 1200.00}}
    »»»
    «op»: c (create), u (update), d (delete), r (snapshot read). «before»/«after» images, a log position (LSN/offset) for ordering, and a commit timestamp.

    ## The full CDC flow
    «««flow
    Source DB log -> CDC connector (Debezium on Kafka Connect) -> Kafka topic per table (keyed by PK) -> Bronze change table (append every event) -> MERGE into silver (apply in order) -> Gold
    »»»
    1. **Initial snapshot:** the connector reads the current table (op = r), then switches to the log at the exact position it started from, so nothing is missed or doubled.
    2. **Streaming:** each committed change becomes an event, keyed by primary key, so all changes for one row land in one Kafka partition **in order**.
    3. **Bronze:** append all events with offsets: a full audit trail and replay source.
    4. **Apply:** for each key, take the **latest** event in the batch (by log position), then MERGE: «op = d» → delete (or soft-delete), otherwise upsert.

    ## Applying CDC correctly: the rules
    - **Order by log position (LSN/offset), not by wall-clock time.** Timestamps can tie or be out of order.
    - **Collapse per key within a batch:** if a row was inserted, updated twice and deleted within one micro-batch, only the final state matters (unless you are building SCD2/history, then keep all).
    - **Idempotent apply:** reprocessing the same events must give the same result (MERGE with "only apply if newer than what the target holds" using a stored sequence number).
    - **Deletes:** decide hard delete vs soft delete (is_deleted flag + deleted_at) in silver; history tables keep them.
    - **Schema changes:** the connector emits new schemas; the registry and the pipeline must handle them.

    ## Delta Lake Change Data Feed (CDF)
    The lakehouse equivalent going **downstream**: when enabled, Delta records row-level changes (insert, update_preimage, update_postimage, delete) for each commit, so silver → gold can be incremental too: read only the changes since version N.

    ## Edge cases and what goes wrong
    - **Log retention:** if the connector is down longer than the database keeps logs, you lose position and must re-snapshot.
    - **Replication slot growth (PostgreSQL):** a stopped consumer makes the database retain WAL until the disk fills: a production outage caused by the data pipeline. Monitor slot lag.
    - **Out-of-order application** across partitions or batches resurrects deleted rows or applies stale updates.
    - **Large transactions** (a bulk update of 10 million rows) create event storms.
    - **Tombstones:** Kafka deletes are followed by a null-value tombstone for compaction; consumers must handle both.
    - **Primary key changes** appear as delete + insert.
    - **Tables without primary keys** cannot be applied reliably by key.
    - **TOAST / unchanged large columns** may be missing from update events in some databases; the "after" image is partial.

    ## How interviewers test this
    - "What is CDC and why prefer log-based?" Complete (deletes), ordered, low impact, low latency.
    - "How do you apply CDC events to a lakehouse table?" Bronze append, collapse per key by log position, MERGE with delete handling, idempotent.
    - "What can go wrong with CDC?" Log retention, slot growth, ordering, schema changes, big transactions.
  `, {
    check: [
      mcq('Why order CDC events by log sequence number (LSN/offset) rather than by event timestamp?', ['Timestamps are not stored', 'The log position is the true commit order; timestamps can tie or be out of order', 'It is faster', 'Kafka requires it'], 1, 'Applying in the wrong order can resurrect deleted rows or keep stale values.'),
      mcq('A Debezium connector for PostgreSQL has been stopped for 3 days. What production risk grows?', ['None', 'The replication slot retains WAL, which can fill the database disk', 'Kafka topics are deleted', 'Data becomes encrypted'], 1, 'Monitor slot lag; a stopped CDC consumer can take down the source.'),
      tf('Log-based CDC captures hard deletes, unlike watermark extraction on updated_at.', true, 'Deletes are written to the transaction log.'),
      mcq('In one micro-batch, row 9001 has events: insert, update, update, delete. For a current-state silver table, what should you apply?', ['All four in arrival order without checking', 'Only the final state per key (the delete), chosen by highest log position', 'The first insert', 'Nothing'], 1, 'Collapse per key by log position, then MERGE. Keep all events in bronze for history.'),
    ],
    scenarios: [
      scenario('The claim that came back to life', `
        Silver «claims» is fed by CDC. A dealer deleted a duplicate claim 9001 at 10:02:07. Today it is back in silver with status Submitted. Bronze shows two events for 9001 in the same batch: «op=u» with LSN 500 and «op=d» with LSN 510, both with ts_ms equal to the same second.`, [
        ['What went wrong?', [
          ['The apply step picked "latest" by timestamp; with a tie it took the update instead of the delete', true, 'Order by log position, not timestamps.'],
          ['The dealer re-created the claim', false, 'There is no create event.'],
          ['Kafka lost the delete', false, 'The delete is in bronze.'],
        ]],
        ['Fix?', [
          ['Order by LSN within each key, apply the highest, and add a stored sequence check so older events can never overwrite newer state; then reprocess the affected window', true, 'Deterministic ordering plus an idempotent, monotonic apply.'],
          ['Sort by ingestion time instead', false, 'Ingestion time is even less related to commit order.'],
          ['Delete 9001 manually', false, 'Fixes one row; the bug repeats.'],
        ]],
      ], 'CDC correctness depends on applying changes in true commit order, idempotently.'),
    ],
    interview: [
      talk('Design CDC from an operational PostgreSQL database into a Delta lakehouse.', `
        - **Capture:** Debezium PostgreSQL connector on Kafka Connect using logical replication (pgoutput), dedicated replication slot, least-privilege user; initial snapshot then streaming.
        - **Transport:** Kafka topic per table, keyed by primary key; Avro with Schema Registry; retention long enough to recover from outages.
        - **Bronze:** Spark Structured Streaming appends raw events with offsets, LSN, op, ts to a Delta change table (audit + replay).
        - **Silver:** per micro-batch, collapse to the latest event per key by LSN; MERGE: delete or soft-delete on op = d, upsert otherwise, only if incoming LSN > stored LSN (idempotent, monotonic).
        - **Gold:** incremental via Delta Change Data Feed.
        - **Operations:** monitor replication slot lag (protect the source disk), connector status, consumer lag, schema changes; reconcile counts with the source daily; runbook for re-snapshotting.`),
    ],
    hands: [
      py({ q: 'Apply a batch of **CDC events** to a current-state table. «apply_cdc(table, events)»: «table» is a dict «{pk: row_dict}»; each event is «{"op": "c"|"u"|"d", "lsn": int, "pk": ..., "after": dict or None}». Apply events **in LSN order** (they may arrive shuffled). c/u → set «table[pk] = after»; d → remove the key (ignore if absent). Return a **new** dict; do not mutate the input.', starter: 'def apply_cdc(table, events):\n    pass\n',
        tests: `t = {1: {'status': 'Submitted'}}
ev = [{'op': 'd', 'lsn': 30, 'pk': 1, 'after': None},
      {'op': 'u', 'lsn': 20, 'pk': 1, 'after': {'status': 'Approved'}},
      {'op': 'c', 'lsn': 10, 'pk': 2, 'after': {'status': 'Submitted'}},
      {'op': 'u', 'lsn': 40, 'pk': 2, 'after': {'status': 'Rejected'}}]
out = apply_cdc(t, ev)
assert out == {2: {'status': 'Rejected'}}, out
assert t == {1: {'status': 'Submitted'}}, 'input must not change'
assert apply_cdc({}, [{'op': 'd', 'lsn': 1, 'pk': 5, 'after': None}]) == {}`,
        solution: `def apply_cdc(table, events):
    out = dict(table)
    for e in sorted(events, key=lambda e: e['lsn']):
        if e['op'] == 'd':
            out.pop(e['pk'], None)
        else:
            out[e['pk']] = e['after']
    return out` }),
    ],
  }),

  // ================================================================== Idempotency
  idempotency: T(`
    > **In one line:** an operation is **idempotent** if running it **once or many times gives the same result**. In data pipelines it is the property that makes **retries, re-runs and backfills safe**. If you remember one engineering principle from this whole track, make it this one.

    ## The problem it solves
    Pipelines fail and are re-run constantly: orchestrator retries, on-call reruns, backfills, at-least-once delivery from Kafka, a network timeout after a successful write. If a step **appends**, every re-run duplicates data. Duplicates do not error; they silently inflate revenue, claims and counts.

    ## Idempotent vs not
    | Not idempotent | Idempotent alternative |
    |---|---|
    | «INSERT INTO fact SELECT … WHERE date = :d» | «DELETE WHERE date = :d» + INSERT in one transaction, or overwrite the partition («replaceWhere» / INSERT OVERWRITE) |
    | Append events from Kafka | MERGE on event_id (insert if not exists), or dedupe on event_id downstream |
    | «UPDATE balance = balance + 100» | «UPDATE balance = 600 WHERE version = 5» (set to a computed value) |
    | Send an email/alert per run | Record "sent" with an idempotency key; skip if already sent |
    | Generate IDs with row_number() each run | Deterministic IDs (hash of business key) |
    | «WHERE date = today()» | «WHERE date = :logical_date» from the orchestrator |
    | Call an API to create an order on each retry | Pass an idempotency key the API uses to ignore duplicates |

    ## The standard idempotent write patterns
    1. **Partition overwrite:** each run fully recomputes and replaces the partitions it owns (date = run date). Re-run = same partitions replaced with the same content.
    2. **MERGE / upsert by business key:** existing keys updated to the same values, new keys inserted. Re-run = no change.
    3. **Insert-if-absent:** MERGE … WHEN NOT MATCHED THEN INSERT, keyed by a unique event ID.
    4. **Write-then-swap:** build a new version in a staging location, then atomically point readers to it.
    5. **Deterministic inputs:** the same run date always reads the same input slice (logical date, fixed watermarks per run, snapshot versions).

    ## Idempotency across the whole run, not just one step
    A run is idempotent only if **every** side effect is: table writes, watermark updates, file moves, messages published, notifications sent, external API calls. Common leak: the data write is idempotent, but the "archive processed file" step fails half-way and the re-run cannot find the file.

    ## Idempotency vs exactly-once
    - **Exactly-once** is about processing: each input affects the output once.
    - Distributed systems usually deliver **at least once** (retries). **At-least-once delivery + idempotent processing = effectively exactly-once results.** That is how most real exactly-once pipelines work, including Spark → Delta with checkpoints.

    ## Edge cases and what goes wrong
    - **Partition overwrite with dynamic partitions** misconfigured (static mode) wipes the whole table instead of the run's partitions. Know your engine's overwrite mode.
    - **MERGE with duplicate source keys** fails ("multiple source rows matched") or applies one at random. Deduplicate the source first.
    - **Non-deterministic transforms**: «now()», «rand()», unordered «first()» produce different results on re-run.
    - **Late data + partition overwrite**: re-running yesterday's partition today includes late rows: that is good, but downstream aggregates must be re-run too.
    - **Upstream changed between runs**: a re-run reading a live source gets different data. Read from a pinned snapshot (bronze) for reproducibility.

    ## How interviewers test this
    - "What is idempotency and how do you make a pipeline idempotent?" Definition + 2-3 patterns + an example.
    - "Your job appended data and was retried. Fix it." Partition overwrite or MERGE on key, dedupe test.
    - "How do you get exactly-once?" At-least-once + idempotent sink, or transactional writes with offsets.
  `, {
    check: [
      mcq('Which daily load is idempotent?', ['INSERT the day\'s rows', 'Overwrite the target partition for the run date with the recomputed rows', 'Append and hope retries never happen', 'INSERT with a timestamp column'], 1, 'Replacing exactly what the run owns makes re-runs harmless.'),
      mcq('«UPDATE dealer_balance SET balance = balance - 500 WHERE dealer_id = 14» runs twice after a retry. Result?', ['Same as once', 'The balance is reduced twice', 'An error', 'Nothing changes'], 1, 'Relative updates are not idempotent. Set to a computed value with a version check, or record the transaction ID.'),
      tf('At-least-once delivery combined with idempotent processing gives effectively exactly-once results.', true, 'The standard way real systems achieve exactly-once outcomes.'),
      mcq('A MERGE fails with "multiple source rows matched the same target row". What is the fix?', ['Retry it', 'Deduplicate the source to one row per key (e.g. latest by updated_at) before the MERGE', 'Use INSERT instead', 'Disable the check'], 1, 'MERGE needs a unique source key.'),
    ],
    hands: [
      py({ q: 'Make a load **idempotent**. Write «upsert(target, batch, key)» that merges a list of dict rows into «target» (a list of dicts) by «key»: rows with an existing key **replace** the old row, new keys are **added**. If the batch itself has duplicate keys, the **last** one wins. Return the result **sorted by key**. Running it twice with the same batch must give the same result as once.', starter: 'def upsert(target, batch, key):\n    pass\n',
        tests: `t = [{'id': 1, 'v': 'a'}, {'id': 2, 'v': 'b'}]
b = [{'id': 2, 'v': 'B'}, {'id': 3, 'v': 'c'}, {'id': 3, 'v': 'C'}]
once = upsert(t, b, 'id')
assert once == [{'id': 1, 'v': 'a'}, {'id': 2, 'v': 'B'}, {'id': 3, 'v': 'C'}], once
twice = upsert(once, b, 'id')
assert twice == once, 'idempotent'
assert upsert([], [], 'id') == []`,
        solution: `def upsert(target, batch, key):
    rows = {r[key]: r for r in target}
    for r in batch:
        rows[r[key]] = r
    return [rows[k] for k in sorted(rows)]` }),
    ],
  }),

  // ================================================================== Deduplication
  dedupe: T(`
    > **In one line:** deduplication removes **extra copies of the same record** so each real-world thing or event is counted **once**. The hard part is not the code; it is deciding **what "the same" means** and **which copy wins**.

    ## Where duplicates come from
    - **At-least-once delivery:** Kafka producers retry, consumers reprocess after a crash.
    - **Retries and re-runs** of non-idempotent loads.
    - **Overlapping extraction windows** (on purpose, to avoid gaps).
    - **Sources sending the same file twice**, or re-exporting history.
    - **Multiple sources** describing the same entity (CRM and ERP both have the dealer).
    - **Users** creating the same claim twice in the app.
    - **Joins that fan out** (not true duplicates, but they look like them).

    ## Kinds of duplicates
    | Kind | Example | Technique |
    |---|---|---|
    | **Exact duplicates** | Identical rows | «DISTINCT» / dropDuplicates() on all columns |
    | **Same key, same version** | Same event_id delivered twice | Dedupe by event_id |
    | **Same key, multiple versions** | Order 1001: CREATED, CONFIRMED, SHIPPED | Keep the **latest** per key (ROW_NUMBER) for current state; keep all for history |
    | **Same entity, different keys** | "Apex Motors Pvt Ltd" vs "APEX MOTORS PVT. LTD." | Entity resolution / fuzzy matching, golden record |
    | **Business duplicates** | Dealer submitted the same claim twice with different claim IDs | Business rules (same engine + same failure + same day), flag for review |

    ## The workhorse: keep the latest row per key
    «««sql
    SELECT *
    FROM (
      SELECT *, ROW_NUMBER() OVER (
               PARTITION BY order_id
               ORDER BY updated_at DESC, ingested_at DESC, event_id DESC) AS rn
      FROM raw_orders_feed)
    WHERE rn = 1;
    »»»
    The **ORDER BY must be fully deterministic**: if two rows tie on every ordering column, ROW_NUMBER picks one arbitrarily and re-runs can pick differently. Add tie-breakers (ingestion time, offset, a unique ID).
    Use ROW_NUMBER, not RANK (RANK gives ties the same number, so «rn = 1» can return several rows).

    ## Dedup in streaming
    - Spark: «dropDuplicatesWithinWatermark(["event_id"])» (or dropDuplicates with a watermark) keeps state only for the watermark period. Without a watermark, state grows forever.
    - Choose the dedup window from how late duplicates can arrive (producer retries: seconds-minutes; re-sent files: days).
    - For long windows, dedupe at the sink instead: MERGE on event_id into Delta (insert if not exists).

    ## Choosing "the winner"
    - Latest by business timestamp (updated_at) for current state.
    - Highest source priority for multi-source entities (ERP wins for finance fields, CRM wins for contact fields).
    - Most complete record (fewest NULLs) for messy sources.
    - **Never** "whichever came first in the file" unless order is guaranteed.

    ## Edge cases and what goes wrong
    - **Deduping on too few columns** merges genuinely different events (two readings at the same second for different sensors).
    - **Deduping on too many columns** (including ingest_time) keeps duplicates that differ only in metadata.
    - **NULLs in the key:** «PARTITION BY» groups all NULLs together; one survives and real records vanish. Handle NULL keys first.
    - **Case/whitespace** differences defeat exact dedup.
    - **Deleting duplicates in place** without a backup; prefer building a deduplicated table.
    - **Dedup hides upstream bugs:** track how many duplicates you removed; a sudden spike is a signal.

    ## How interviewers test this
    - "Write SQL to keep the latest record per key." ROW_NUMBER with deterministic ordering.
    - "ROW_NUMBER vs RANK vs DENSE_RANK for dedup?" ROW_NUMBER, because ties must still yield one row.
    - "How do you dedupe a stream?" Event ID + watermark-bounded state, or idempotent MERGE at the sink.
  `, {
    check: [
      mcq('Which window function guarantees exactly one row per key when filtering «= 1»?', ['RANK()', 'DENSE_RANK()', 'ROW_NUMBER()', 'NTILE(1)'], 2, 'RANK and DENSE_RANK give ties the same number, so several rows can be 1.'),
      mcq('Two events for the same order tie on «updated_at». Your dedup orders only by «updated_at DESC». Risk?', ['None', 'An arbitrary row wins, and re-runs may choose differently (non-deterministic)', 'Both are dropped', 'An error'], 1, 'Add tie-breakers such as ingested_at and a unique ID.'),
      tf('Streaming dropDuplicates on event_id without a watermark keeps state that grows forever.', true, 'Bound it with a watermark, or dedupe at the sink with MERGE.'),
      mcq('Your dedup step started removing 30% of rows instead of the usual 0.5%. What should you do?', ['Celebrate cleaner data', 'Investigate: a spike in duplicates usually means an upstream bug (re-sent files, retries, non-idempotent load)', 'Lower the threshold', 'Disable dedup'], 1, 'Monitor duplicates removed as a metric.'),
    ],
    hands: [
      sql({ q: 'Remove **exact duplicate deliveries** from the raw feed but keep every real status change: return one row per «(order_id, status, updated_at)», keeping the **earliest ingested** copy. Return «event_id, order_id, status, updated_at, ingested_at» sorted by «event_id».', tables: ['raw_orders_feed'], level: 2,
        solution: `SELECT event_id, order_id, status, updated_at, ingested_at
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id, status, updated_at ORDER BY ingested_at, event_id) AS rn
  FROM raw_orders_feed
)
WHERE rn = 1
ORDER BY event_id;`,
        hint: 'PARTITION BY order_id, status, updated_at; ORDER BY ingested_at, event_id (tie-breaker); keep rn = 1.' }),
    ],
  }),
};
