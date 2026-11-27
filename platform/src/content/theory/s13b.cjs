const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Patterns
  patterns: T(`
    > **In one line:** most real SQL problems are one of about ten patterns. Recognise the pattern, then worry about the edge cases (ties, NULLs, gaps, late rows) and the cost at scale.

    ## 1. Latest row per key (dedupe)
    «««sql
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, event_id DESC) rn
      FROM raw_orders_feed) WHERE rn = 1;
    »»»
    Edge cases: ties (add a unique tie-breaker), NULL «updated_at» (sorts first or last depending on engine: decide explicitly), deletes in CDC (the latest row may be a tombstone you must drop *after* picking it, not before). At scale: «max_by(struct(...), updated_at)» avoids a full sort.

    ## 2. Top-N per group
    «DENSE_RANK() <= N» when ties should all show, «ROW_NUMBER() <= N» when exactly N. With LATERAL / CROSS APPLY and an index, "top 3 per dealer" can be N index seeks instead of a full sort.

    ## 3. Gaps and islands
    Find consecutive runs (an engine running several days in a row, a sensor above threshold for consecutive readings).
    «««sql
    WITH r AS (
      SELECT engine_id, day,
             julianday(day) - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY day) AS grp
      FROM engine_daily_status WHERE is_running = 1)
    SELECT engine_id, MIN(day) start_day, MAX(day) end_day, COUNT(*) days
    FROM r GROUP BY engine_id, grp;
    »»»
    Why it works: within a run of consecutive dates, date and row_number both increase by 1, so their difference is constant. **Gaps** are the complement: «LEAD(day) - day > 1». For non-date sequences use the "change flag + running sum" variant: flag rows where the state differs from «LAG(state)», then «SUM(flag) OVER (ORDER BY …)» gives a group id. That variant also works for **state islands** (running/stopped/running).

    ## 4. Sessionization
    Split events into sessions when the gap to the previous event exceeds a timeout (e.g. 30 min).
    1. «gap = ts - LAG(ts) OVER (PARTITION BY user ORDER BY ts)»
    2. «new_session = CASE WHEN gap IS NULL OR gap > 30 min THEN 1 ELSE 0 END»
    3. «session_no = SUM(new_session) OVER (PARTITION BY user ORDER BY ts ROWS UNBOUNDED PRECEDING)»
    Streaming equivalent: **session windows** with a watermark. Late events can **merge two sessions** into one: batch recomputes; streaming must handle it with state.

    ## 5. Running totals, moving averages, YoY
    «SUM() OVER (ORDER BY … ROWS UNBOUNDED PRECEDING)», moving windows with explicit frames, «LAG(x, 12)» on a monthly series for year-over-year, but **only if every month exists**: build a calendar spine first, otherwise LAG(12) silently compares to the wrong month.

    ## 6. Pivot / unpivot
    Pivot: conditional aggregation («SUM(CASE WHEN status='Approved' THEN 1 END)») or engine «PIVOT». Unpivot: «UNION ALL» of one select per column, «CROSS JOIN» to a values list, or «UNPIVOT»/«stack()» in Spark. Wide sensor tables (one column per sensor) are usually unpivoted to long (engine, ts, sensor, value) for storage and pivoted back for ML features.

    ## 7. As-of (point-in-time) join
    "What was the dealer's region **at the time** of the claim?" or "the last sensor reading at or before each alert".
    - SCD2 lookup: «ON f.key = d.key AND f.ts >= d.valid_from AND f.ts < d.valid_to» (half-open interval avoids double matches at the boundary).
    - Last-known-value: rank candidates «ROW_NUMBER() OVER (PARTITION BY alert_id ORDER BY r.ts DESC)» after a join on «r.ts <= a.ts». Range join cost explodes on big tables; constrain it with a time bucket or use «ASOF JOIN».
    - Point-in-time correctness is **mandatory for ML training sets**: joining features "as of now" to historical labels leaks the future (data leakage).

    ## 8. Data comparison / reconciliation
    «FULL OUTER JOIN» on the key with «COALESCE» and a status column (only_in_source / only_in_target / mismatch / match), or «EXCEPT» both ways. Compare a **hash of the row** for wide tables instead of every column.

    ## 9. Funnel and cohort
    Funnel: per entity, min timestamp per stage via conditional aggregation, then count entities reaching each stage in order (CRF → SR → PIR → claim → credit note is a funnel). Cohort: assign each entity to its first period, then count activity by (cohort, periods since start).

    ## 10. Median and percentiles
    «PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)» (Postgres), «percentile_approx» (Spark), or row_number/count arithmetic in engines without either. Remember median is not mergeable.

    ## How interviewers test this
    They hand you a table and a question that *is* one of these patterns, then add an edge case: "now some days are missing", "now there are ties", "now events arrive late", "now it is 5 TB".
  `, {
    check: [
      mcq('In the gaps-and-islands trick, what is constant within one run of consecutive dates?', ['The date', 'The row number', 'date minus row_number', 'The count'], 2, 'Both increase by one per row inside a run.'),
      mcq('Year-over-year with «LAG(revenue, 12) OVER (ORDER BY month)» is wrong when…', ['Revenue has decimals', 'Some months have no rows', 'There are 24 months', 'It is never wrong'], 1, 'LAG counts rows. Build a calendar spine first.'),
      mcq('For an SCD2 as-of join, which boundary condition avoids double matches?', ['ts BETWEEN valid_from AND valid_to', 'ts >= valid_from AND ts < valid_to', 'ts > valid_from AND ts > valid_to', 'valid_to IS NULL only'], 1, 'Half-open intervals: the end of one version equals the start of the next.'),
      tf('Joining features "as they are today" to historical training labels is fine as long as the join key is correct.', false, 'That leaks future information. Use point-in-time joins.'),
    ],
    scenarios: [
      scenario('A sensor alarm that keeps re-firing', `
        Turbofan-style data: an alert should fire **once** when an engine's temperature has been above 95 °C for **3 or more consecutive readings**, and once more only after it has dropped below and risen again. The current query flags every reading where the 3-reading moving minimum is above 95, producing 40 alerts for one incident.`, [
        ['Which pattern models "one alert per incident"?', [
          ['Gaps and islands: flag hot readings, group consecutive hot readings into islands, keep islands of length ≥ 3 and emit one alert per island at its third reading', true, 'Each island is one incident.'],
          ['DISTINCT on engine_id', false, 'Would merge separate incidents.'],
          ['A bigger moving window', false, 'Still one flag per reading.'],
        ]],
        ['In streaming, what extra problem appears?', [
          ['A late reading can split or join islands, so state must be kept per engine until the watermark passes, and alerts must be idempotent (keyed by engine + island start)', true, 'Late data changes island boundaries.'],
          ['Nothing changes', false, 'Order and lateness matter for islands.'],
          ['Kafka guarantees no late data', false, 'Producers and networks do.'],
        ]],
      ], 'Turn per-row conditions into per-incident events with islands.'),
    ],
    interview: [
      talk('Given daily engine status (running or not), find each engine\'s longest consecutive running streak. Then: what changes if a day is missing entirely from the data?', `
        - **Query:** filter running days; «grp = day - ROW_NUMBER() OVER (PARTITION BY engine ORDER BY day)»; group by engine, grp; count; take max per engine (ROW_NUMBER over the islands or MAX).
        - **Missing days:** a missing row breaks the streak in the trick above, which may be right ("no data = not running") or wrong ("no data = unknown"). That is a **business decision**; I would ask. If unknown should not break streaks, use a calendar spine and decide how to fill (carry forward last status with a window, or treat as gap).
        - **Duplicates:** two rows for the same day inflate counts and break the arithmetic: dedupe first.
        - **Scale:** one shuffle by engine and a sort; fine for billions of rows as long as no single engine dominates.`),
    ],
    hands: [
      sql({ q: '**Longest running streak per engine.** Using «engine_daily_status», find for each engine its longest run of consecutive days with «is_running = 1». Return «engine_id, streak_start, streak_end, streak_days» (one row per engine that ran at all; if two streaks tie, keep the earliest). Sort by «engine_id».', tables: ['engine_daily_status'], level: 3,
        solution: `WITH r AS (
  SELECT engine_id, day,
         CAST(julianday(day) AS INTEGER) - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY day) AS grp
  FROM engine_daily_status WHERE is_running = 1
), islands AS (
  SELECT engine_id, MIN(day) AS streak_start, MAX(day) AS streak_end, COUNT(*) AS streak_days
  FROM r GROUP BY engine_id, grp
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY streak_days DESC, streak_start) AS rn FROM islands
)
SELECT engine_id, streak_start, streak_end, streak_days FROM ranked WHERE rn = 1 ORDER BY engine_id`, hint: 'day − row_number is constant inside a streak.' }),
      sql({ q: '**Sessionize sensor readings.** In «sensor_readings», a new session starts for an engine when the gap from that engine\'s previous reading is **more than 10 minutes** (or it is the first reading). Return per engine and session: «engine_id, session_no» (1, 2, …), «started», «ended», «readings». Sort by «engine_id, session_no».', tables: ['sensor_readings'], level: 3,
        solution: `WITH g AS (
  SELECT engine_id, ts,
         CASE WHEN LAG(ts) OVER (PARTITION BY engine_id ORDER BY ts, reading_id) IS NULL
                OR (julianday(ts) - julianday(LAG(ts) OVER (PARTITION BY engine_id ORDER BY ts, reading_id))) * 1440 > 10
              THEN 1 ELSE 0 END AS new_session,
         reading_id
  FROM sensor_readings
), s AS (
  SELECT engine_id, ts,
         SUM(new_session) OVER (PARTITION BY engine_id ORDER BY ts, reading_id ROWS UNBOUNDED PRECEDING) AS session_no
  FROM g
)
SELECT engine_id, session_no, MIN(ts) AS started, MAX(ts) AS ended, COUNT(*) AS readings
FROM s GROUP BY engine_id, session_no
ORDER BY engine_id, session_no`, hint: 'Flag new sessions with LAG, then a running SUM of the flag is the session number.' }),
      sql({ q: '**Warranty funnel.** Count how many CRFs reached each stage: «crfs» (all CRFs), «with_sr» (have a service request), «with_pir» (a PIR on one of their SRs), «with_claim», «with_credit_note». One row, five columns. Count each CRF at most once per stage.', tables: ['crf', 'service_requests', 'pir', 'claims', 'credit_notes'], level: 3,
        solution: `SELECT COUNT(DISTINCT f.crf_id) AS crfs,
       COUNT(DISTINCT s.crf_id) AS with_sr,
       COUNT(DISTINCT CASE WHEN p.pir_id IS NOT NULL THEN f.crf_id END) AS with_pir,
       COUNT(DISTINCT CASE WHEN c.claim_id IS NOT NULL THEN f.crf_id END) AS with_claim,
       COUNT(DISTINCT CASE WHEN n.cn_id IS NOT NULL THEN f.crf_id END) AS with_credit_note
FROM crf f
LEFT JOIN service_requests s ON s.crf_id = f.crf_id
LEFT JOIN pir p ON p.sr_id = s.sr_id
LEFT JOIN claims c ON c.pir_id = p.pir_id
LEFT JOIN credit_notes n ON n.claim_id = c.claim_id`, hint: 'Chain LEFT JOINs and COUNT(DISTINCT crf_id) only where the stage\'s key is present. The fan-out is harmless because you count distinct CRFs.' }),
    ],
  }),

  // ================================================================== Plans
  plans: T(`
    > **In one line:** «EXPLAIN» shows the **physical plan** the engine chose: which access paths (full scan, index seek, partition pruning), which join algorithms, in what order, with estimated rows. «EXPLAIN ANALYZE» runs the query and shows **actual** rows and time. Reading plans, and writing **sargable** predicates the engine can use, is how you fix slow SQL instead of guessing.

    ## What to look for
    | Signal | Meaning |
    |---|---|
    | Seq Scan / Full Table Scan on a big table with a selective filter | Missing index, or a non-sargable predicate |
    | Estimated rows ≪ actual rows (or ≫) | **Stale statistics** or correlated columns; the optimiser picked a plan for the wrong size. Run ANALYZE / compute stats |
    | Nested Loop with a large outer side and no index | O(n·m): the classic "query hangs" |
    | Hash join that **spills** (batches > 1, temp files) | Not enough memory for the build side |
    | Sort with "external merge" | Sort spilled to disk |
    | In Spark: «Exchange hashpartitioning» | A shuffle |
    | Spark: «PartitionFilters: [...]» and «PushedFilters: [...]» in FileScan | Pruning and pushdown are working. Empty when you expected them = a problem |
    | Spark: «BroadcastNestedLoopJoin» / «CartesianProduct» | Non-equi join; dangerous on large inputs |

    ## Sargable predicates
    **S**earch **ARG**ument **ABLE**: the engine can use an index, partition pruning or min/max file statistics only if the column is **bare** on one side of the comparison.
    | Not sargable | Sargable rewrite |
    |---|---|
    | «WHERE date(submitted_at) = '2026-11-01'» | «WHERE submitted_at >= '2026-11-01' AND submitted_at < '2026-11-02'» |
    | «WHERE YEAR(build_date) = 2025» | «WHERE build_date >= '2025-01-01' AND build_date < '2026-01-01'» |
    | «WHERE amount * 1.18 > 1000» | «WHERE amount > 1000 / 1.18» |
    | «WHERE UPPER(serial_no) = 'ESN123'» | Store normalised; or an expression index on «UPPER(serial_no)» |
    | «WHERE name LIKE '%pune'» | Leading wildcard cannot seek; use full-text / reversed column / search index |
    | «WHERE CAST(dealer_code AS INT) = 14» | Compare in the column's own type |
    | «WHERE col1 = 5 OR col2 = 7» | Often a scan; «UNION ALL» of two indexed lookups may be better (OLTP) |
    In a lakehouse the same rule applies to **partition columns**: «WHERE to_date(event_ts) = …» on a table partitioned by «event_date» does not prune unless the engine can derive it (Delta *generated columns* can). Filter on the partition column itself.

    ## Indexes (OLTP) vs pruning (OLAP)
    - **B-tree index:** equality and range lookups, ORDER BY, leftmost-prefix rule for composite indexes («(dealer_id, submitted_at)» helps «WHERE dealer_id = ?» and «WHERE dealer_id = ? AND submitted_at > ?», not «WHERE submitted_at > ?» alone).
    - **Covering index** (includes all selected columns): index-only scan, no table lookup.
    - Indexes cost writes and storage; low-selectivity columns (status with 4 values) rarely benefit.
    - **Warehouses/lakehouses** mostly do not have B-tree indexes. They skip data with **partition pruning**, **min/max statistics per file/row group** (data skipping), **clustering / Z-ordering / liquid clustering** (to make min/max ranges tight), **bloom filters** and **result caches**.

    ## Statistics and the optimiser
    Cost-based optimisers estimate row counts from statistics (row count, distinct values, NULL fraction, histograms, min/max). Wrong estimates → wrong join order and join algorithm. Typical triggers: a table loaded since the last ANALYZE, skewed values (one dealer with 80% of claims), correlated predicates («city = 'Pune' AND region = 'West'» estimated as independent). In Spark, «ANALYZE TABLE … COMPUTE STATISTICS» feeds the CBO; **AQE** sidesteps much of this by re-planning at runtime with real sizes.

    ## A method for a slow query
    1. Get the plan with actuals (EXPLAIN ANALYZE, Spark UI SQL tab, Snowflake/Databricks query profile).
    2. Find the operator where most time or rows go; compare estimated vs actual rows.
    3. Ask: is data being read that should be skipped (pruning, columns)? Is a join exploding (fan-out)? Is a shuffle/sort spilling? Is one task doing most of the work (skew)?
    4. Fix the cause: sargable predicate, statistics, index/clustering, pre-aggregate, broadcast, salting, fix the join key.
    5. Measure again. Keep the before/after numbers; they are your interview story.

    ## How interviewers test this
    - "This query filters on «DATE(created_at)» and is slow. Why?"
    - "Composite index on (a, b). Which of these queries use it?"
    - "Estimated 100 rows, actual 10 million. What happened and what does it cause?"
  `, {
    check: [
      mcq('Which predicate is sargable on an index or partition on «submitted_at»?', ['date(submitted_at) = \'2026-11-01\'', 'submitted_at >= \'2026-11-01\' AND submitted_at < \'2026-11-02\'', 'strftime(\'%Y\', submitted_at) = \'2026\'', 'submitted_at || \'\' = \'2026-11-01\''], 1, 'Keep the column bare.'),
      mcq('Composite index on (dealer_id, submitted_at). Which query can seek on it?', ['WHERE submitted_at > \'2026-01-01\'', 'WHERE dealer_id = 4 AND submitted_at > \'2026-01-01\'', 'WHERE status = \'Approved\'', 'WHERE claim_amount > 100'], 1, 'Leftmost prefix rule.'),
      mcq('The plan estimated 100 rows for a join input; it actually produced 12 million. Most likely cause?', ['A bug in EXPLAIN', 'Stale or missing statistics', 'Too many indexes', 'The query is correct and fast'], 1, 'Refresh stats; with bad estimates the join algorithm and order are wrong.'),
      tf('Cloud warehouses and lakehouses mainly skip data with partition pruning and per-file min/max statistics rather than B-tree indexes.', true, 'That is why clustering/Z-order matters: it tightens min/max ranges.'),
      mcq('In a Spark physical plan, «Exchange hashpartitioning(dealer_id, 200)» means…', ['A broadcast', 'A shuffle by dealer_id into 200 partitions', 'An index lookup', 'A cache'], 1, 'Each Exchange is a stage boundary.'),
    ],
    scenarios: [
      scenario('The dashboard query that got slow on Monday', `
        A Databricks SQL dashboard filters «fact_sensor» (8 TB, partitioned by «event_date») with «WHERE date_format(event_ts, 'yyyy-MM') = '2026-11'». It took 6 s last month; now 4 minutes. The table has grown 3× in a month.`, [
        ['What does the query profile most likely show?', [
          ['All partitions scanned: the function on event_ts prevents partition pruning, so cost grows with the whole table', true, 'Non-sargable on the partition key.'],
          ['A broadcast join', false, 'No join.'],
          ['Network latency to the dashboard', false, 'The scan dominates.'],
        ]],
        ['Fix?', [
          ['Filter on event_date directly with a range (event_date >= \'2026-11-01\' AND event_date < \'2026-12-01\'), and consider clustering by engine for common engine filters', true, 'Pruning restored; time back to seconds.'],
          ['Bigger SQL warehouse', false, 'Pays to scan data you did not need.'],
          ['Cache the dashboard', false, 'First load is still 4 minutes and wrong-headed.'],
        ]],
      ], 'Sargability is the same principle for indexes and partitions.'),
    ],
    interview: [
      talk('How do you approach tuning a slow SQL query?', `
        1. **Measure** with the actual plan (EXPLAIN ANALYZE / query profile / Spark UI), not guesses.
        2. Find the expensive operator and compare **estimated vs actual rows**.
        3. Check in order: data read that could be skipped (non-sargable predicates, missing partition filter, SELECT *), **fan-out** in joins, wrong join algorithm (nested loop on big input; shuffle where a broadcast fits), **spill** in sorts/hash, **skew**.
        4. Fix the cause (rewrite predicate, refresh stats, add index/clustering, pre-aggregate, broadcast hint, salting) and re-measure.
        5. Prevent regression: keep the query in a performance test or monitor its runtime.`),
    ],
    hands: [
      sql({ q: 'Rewrite to be **sargable**. The slow version is «SELECT claim_id, submitted_at, claim_amount FROM claims WHERE strftime(\'%Y-%m\', submitted_at) = \'2026-10\'». Write an equivalent query that keeps «submitted_at» bare (a half-open range). Sort by «submitted_at, claim_id».', tables: ['claims'], level: 1,
        solution: `SELECT claim_id, submitted_at, claim_amount
FROM claims
WHERE submitted_at >= '2026-10-01' AND submitted_at < '2026-11-01'
ORDER BY submitted_at, claim_id` }),
      sql({ q: 'Add an index and check the plan. Create an index «ix_claims_dealer_time» on «claims(dealer_id, submitted_at)», then run «EXPLAIN QUERY PLAN» for «SELECT claim_id FROM claims WHERE dealer_id = 4 AND submitted_at >= \'2026-06-01\'». The last statement\'s output is what is shown.', tables: ['claims'], level: 2,
        solution: `CREATE INDEX ix_claims_dealer_time ON claims(dealer_id, submitted_at);
EXPLAIN QUERY PLAN SELECT claim_id FROM claims WHERE dealer_id = 4 AND submitted_at >= '2026-06-01'` }),
    ],
  }),

  // ================================================================== Isolation
  isolation: T(`
    > **In one line:** when transactions run at the same time, the **isolation level** decides which interference anomalies are possible. Databases implement it with **locks** and/or **MVCC** (multi-version concurrency control: readers see a snapshot, writers create new versions). Lakehouse tables (Delta, Iceberg) bring the same ideas to files with **snapshot isolation and optimistic concurrency**.

    ## The anomalies
    | Anomaly | What happens |
    |---|---|
    | **Dirty read** | T1 reads T2's uncommitted change; T2 rolls back; T1 used data that never existed |
    | **Non-repeatable read** | T1 reads a row twice and gets different values because T2 committed an update in between |
    | **Phantom read** | T1 runs the same range query twice and gets new rows inserted by T2 |
    | **Lost update** | T1 and T2 read balance 100, both add 50, both write 150: one update is lost |
    | **Write skew** | Two transactions each check a condition on overlapping data, then write different rows; together they break the rule (two on-call engineers both go off-call because "the other is on") |

    ## The levels (ANSI)
    | Level | Dirty | Non-repeatable | Phantom | Typical default |
    |---|---|---|---|---|
    | Read uncommitted | possible | possible | possible | rarely used |
    | Read committed | no | possible | possible | **Postgres, SQL Server, Oracle** |
    | Repeatable read | no | no | possible (ANSI) | **MySQL InnoDB** (which also blocks most phantoms with gap locks) |
    | Snapshot isolation | no | no | no | Postgres "repeatable read" is really snapshot; SQL Server SNAPSHOT. **Write skew still possible** |
    | Serializable | no | no | no | Result equals some serial order. Postgres SSI, costly; may abort transactions that must be retried |

    ## MVCC in one paragraph
    Each write creates a new row version stamped with the transaction ID. A reader uses a **snapshot**: it sees versions committed before it started, so **readers never block writers and writers never block readers**. Old versions are garbage-collected later (Postgres VACUUM, which is why long-running transactions cause table bloat). Delta Lake is MVCC on files: each commit adds/removes files in the log; readers read a version; VACUUM removes old files.

    ## Preventing lost updates in practice
    - **Atomic update:** «UPDATE t SET qty = qty - 5 WHERE id = 1 AND qty >= 5» (the DB serialises row writes).
    - **Pessimistic locking:** «SELECT … FOR UPDATE» then update.
    - **Optimistic concurrency:** read a version number, update «WHERE version = :v», retry if 0 rows changed. This is exactly what Delta/Iceberg do at the table level: a writer commits version N+1 only if no conflicting commit happened; otherwise it re-checks and retries or fails with a concurrent modification error.

    ## Why a data engineer cares
    - **Extracting from OLTP:** a long-running extract under read committed sees a moving target (rows updated mid-extract). Use a snapshot (repeatable read / snapshot isolation), a replica, or CDC with a consistent starting point (Debezium's initial snapshot + log position).
    - **Incremental extracts with «updated_at > watermark»** miss rows committed late with an earlier timestamp (a transaction that started before your extract but committed after). Use a **lookback overlap** (e.g. watermark minus 10 minutes, then dedupe) or log-based CDC.
    - **Two pipelines writing one Delta table** (a streaming MERGE and a nightly backfill) conflict: «ConcurrentAppendException» / «ConcurrentDeleteReadException». Fix with disjoint partitions in the conditions, row-level concurrency (deletion vectors + row tracking on recent Databricks), or by serialising writers in the orchestrator.
    - **Readers during an overwrite:** a warehouse table overwritten with DELETE + INSERT in two transactions is briefly empty to readers. Use a single transaction, «INSERT OVERWRITE», or a swap/rename.

    ## How interviewers test this
    - "What isolation level does Postgres use by default? What can go wrong at that level?"
    - "Two jobs update the same counter at the same time. What happens and how do you prevent it?"
    - "How does Delta Lake handle two concurrent writers?"
  `, {
    check: [
      match('Match the anomaly.', [['Dirty read', 'Reading a change that is later rolled back'], ['Non-repeatable read', 'Same row, two different values in one transaction'], ['Phantom', 'Same range query returns new rows'], ['Lost update', 'Two read-modify-write cycles, one overwrites the other']], 'Know them by example.'),
      mcq('Default isolation level in PostgreSQL?', ['Read uncommitted', 'Read committed', 'Repeatable read', 'Serializable'], 1, 'Also SQL Server and Oracle. MySQL InnoDB defaults to repeatable read.'),
      tf('Under MVCC, readers do not block writers and writers do not block readers.', true, 'Readers use a snapshot of committed versions.'),
      mcq('An incremental extract uses «updated_at > last_watermark». Which rows can it miss?', ['None', 'Rows from transactions that committed after the extract but carry an earlier updated_at', 'Only deleted rows', 'Rows with NULL amounts'], 1, 'Use an overlap window and dedupe, or log-based CDC. (It also misses hard deletes.)'),
      mcq('How do Delta Lake writers coordinate?', ['A global lock server', 'Optimistic concurrency: commit the next log version if no conflicting commit happened, otherwise retry or fail', 'They do not; last writer wins silently', 'Two-phase commit with Kafka'], 1, 'Conflicts raise ConcurrentModification-type exceptions.'),
    ],
    interview: [
      talk('Explain snapshot isolation and write skew with an example from a data platform.', `
        - **Snapshot isolation:** each transaction reads a consistent snapshot as of its start and commits only if no other transaction wrote the **same rows** since. No dirty, non-repeatable or phantom reads.
        - **Write skew:** two transactions read overlapping data and write **different** rows; neither conflicts on rows, yet the combined result breaks an invariant. Example: rule "at least one active version of each dealer in dim_dealer"; two concurrent jobs each expire a different version after checking the other is active → zero active versions.
        - **Fix:** serializable isolation, an explicit lock / constraint on the invariant, or design the writes so one job owns the invariant (single writer per key), which is the common data-platform answer.`),
    ],
    hands: [
      py({ q: '**Optimistic concurrency.** Implement «commit(store, key, expected_version, new_value)» on a dict «store» mapping key → «(version, value)». If the current version equals «expected_version», write «(version + 1, new_value)» and return «True»; otherwise return «False» and change nothing. A missing key has version 0. Then implement «add_with_retry(store, key, delta, max_retries=3)» that reads, adds «delta» to the value (missing = 0) and commits, retrying on conflict; return the final version written or raise «RuntimeError» after max_retries failures.', starter: 'def commit(store, key, expected_version, new_value):\n    pass\n\ndef add_with_retry(store, key, delta, max_retries=3):\n    pass\n',
        tests: `s = {}
assert commit(s, 'a', 0, 10) is True and s['a'] == (1, 10)
assert commit(s, 'a', 0, 99) is False and s['a'] == (1, 10)
assert add_with_retry(s, 'a', 5) == 2 and s['a'] == (2, 15)
class Racy(dict):
    def __init__(self, *a):
        super().__init__(*a); self.n = 0
    def __getitem__(self, k):
        v = super().__getitem__(k)
        self.n += 1
        if self.n == 1:
            super().__setitem__(k, (v[0] + 1, v[1] + 100))   # someone else commits right after our read
        return v
r = Racy({'x': (1, 1)})
v = add_with_retry(r, 'x', 1)
assert r['x'][1] == 102, r
try:
    class Always(dict):   # someone else commits after every single read
        def __contains__(self, k): return True
        def get(self, k, d=None):
            v = dict.get(self, k, (0, 0)); dict.__setitem__(self, k, (v[0] + 1, v[1])); return v
        def __getitem__(self, k): return self.get(k)
    add_with_retry(Always(), 'z', 1, max_retries=2)
    assert False, 'should raise'
except RuntimeError:
    pass`,
        solution: `def commit(store, key, expected_version, new_value):
    cur = store.get(key, (0, None))[0] if key in store else 0
    if cur != expected_version:
        return False
    store[key] = (cur + 1, new_value)
    return True

def add_with_retry(store, key, delta, max_retries=3):
    for _ in range(max_retries + 1):
        ver, val = store[key] if key in store else (0, 0)
        if commit(store, key, ver, (val or 0) + delta):
            return ver + 1
    raise RuntimeError('too many conflicts')` }),
    ],
  }),

  // ================================================================== MERGE / DML
  dml: T(`
    > **In one line:** «MERGE» (upsert) applies a batch of changes to a target in one atomic statement: update matched rows, insert new ones, optionally delete. It is the backbone of incremental pipelines, CDC apply and SCD2, and it has precise rules that cause real failures: **unique source keys**, **deterministic conditions**, **ordering of clauses** and **cost at scale**.

    ## Shape
    «««sql
    MERGE INTO silver.orders t
    USING (SELECT * FROM staged_changes) s
    ON t.order_id = s.order_id
    WHEN MATCHED AND s.op = 'D' THEN DELETE
    WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
    WHEN NOT MATCHED AND s.op <> 'D' THEN INSERT *
    -- Databricks also: WHEN NOT MATCHED BY SOURCE THEN DELETE  (full sync)
    »»»
    - Clauses are evaluated **in order**; the first matching clause wins for a row.
    - The extra condition «s.updated_at > t.updated_at» makes the apply **monotonic**: an older change replayed later cannot overwrite a newer state. This is what makes CDC apply idempotent under replays and out-of-order batches.

    ## The rules that break pipelines
    1. **One source row per target row.** If two source rows match the same target row, the SQL standard (and Delta, Snowflake by default, SQL Server) raises an error ("multiple source rows matched"). Dedupe the source first: latest per key by sequence number.
    2. **Deterministic ON condition.** Matching on a non-unique column (e.g. name) updates many target rows per source row.
    3. **NULL keys never match**: a source row with a NULL key is always "not matched" and gets inserted every run → duplicates. Filter or quarantine NULL keys.
    4. **Deletes in CDC:** with soft deletes (keep row, set is_deleted) downstream joins must filter; with hard deletes, late updates for a deleted key can **resurrect** it unless you keep tombstones for a period.
    5. **Schema drift:** «UPDATE SET *» with a new source column fails or is ignored unless schema evolution is enabled («mergeSchema» / «autoMerge»). Decide deliberately.

    ## MERGE at scale (lakehouse)
    - Delta/Iceberg MERGE = **join source with target**, find affected files, **rewrite those files** (copy-on-write) or write **deletion vectors** (merge-on-read). Cost is driven by **how many target files contain matched keys**, not by how many rows change.
    - Updates scattered across the whole table (random keys) rewrite most files every run. Keep updates local: **partition or cluster by the column the source is filtered on** (e.g. date for late-arriving events) and add that column to the ON condition so files can be pruned («ON t.id = s.id AND t.event_date = s.event_date» or «t.event_date >= '…'»).
    - Broadcast the source if it is small; the target side is pruned by statistics.
    - **Low Shuffle Merge**, deletion vectors and liquid clustering (Databricks) reduce rewrite cost.
    - Run «OPTIMIZE» periodically: MERGE leaves small files behind.

    ## Alternatives and when to use them
    | Pattern | Use when |
    |---|---|
    | **Partition overwrite** (INSERT OVERWRITE / replaceWhere) | Each run recomputes whole partitions (daily facts). Simpler and often cheaper than MERGE |
    | **Append + dedupe view** | Very high write rate; reads tolerate a "latest per key" view or periodic compaction |
    | **Delete + insert in one transaction** | Engines without MERGE; must be one transaction |
    | **CTAS / full rebuild + swap** | Small/medium tables, or after logic changes |
    | **UPDATE** | Few rows, specific fix. A mass UPDATE in a warehouse rewrites as much as MERGE |

    ## Large deletes and updates in OLTP
    Deleting 50M rows in one statement holds locks, bloats the log and blocks replication. Batch it («DELETE … WHERE id IN (SELECT id … LIMIT 10000)» in a loop), or create-new-table-and-swap, or drop partitions. Partitioning by time turns retention deletes into instant partition drops.

    ## SCD Type 2 with MERGE
    Standard trick: the source is the **union** of (changed rows keyed normally → used to expire current versions) and (the same changed rows with a NULL merge key → always "not matched" → inserted as new current versions). One MERGE expires and inserts atomically. Or two steps in one transaction.

    ## How interviewers test this
    - "Write a MERGE that applies CDC with inserts, updates and deletes, safely under replays."
    - "Your MERGE fails with 'multiple source rows matched'. Why and fix?"
    - "MERGE takes 2 hours on a 5 TB table but only 50k rows change. Why?" (Scattered files; prune by partition/cluster; deletion vectors.)
  `, {
    check: [
      mcq('Why add «AND s.updated_at > t.updated_at» to the WHEN MATCHED UPDATE clause?', ['It is faster', 'So older changes replayed later cannot overwrite newer state (monotonic, idempotent apply)', 'It is required syntax', 'To skip deletes'], 1, 'Protects against replays and out-of-order batches.'),
      mcq('A source row has a NULL merge key. Every run…', ['Updates all target rows', 'Is inserted again, creating duplicates', 'Is ignored', 'Fails the MERGE'], 1, 'NULL never matches. Filter or quarantine NULL keys.'),
      mcq('A Delta MERGE touches 50,000 rows but rewrites 4 TB. Most likely cause?', ['Too many columns', 'Matched keys are spread across most files, so most files are rewritten', 'The cluster is small', 'MERGE always rewrites the whole table'], 1, 'Cost follows files touched. Prune with partition/cluster columns in ON; consider deletion vectors.'),
      tf('When several WHEN MATCHED clauses could apply, all of them run for the row.', false, 'The first matching clause wins.'),
      mcq('Daily fact table recomputed fully for each date. Simplest idempotent write?', ['MERGE on every column', 'Overwrite the date partition (replaceWhere / INSERT OVERWRITE)', 'Append', 'UPDATE every row'], 1, 'Partition overwrite is simpler and cheaper when the run owns whole partitions.'),
    ],
    scenarios: [
      scenario('MERGE started failing after a source change', `
        The nightly MERGE into «silver.dealers» fails with "multiple source rows matched the same target row". The upstream CRM started sending **every** update of a dealer during the day instead of a daily snapshot.`, [
        ['Fix?', [
          ['Deduplicate the source to the latest row per dealer_id by a reliable sequence (updated_at + change sequence), then MERGE', true, 'MERGE needs one source row per key.'],
          ['Switch to INSERT', false, 'Creates duplicates.'],
          ['Disable the check', false, 'Non-deterministic result.'],
        ]],
        ['What extra protection belongs in the pipeline?', [
          ['A uniqueness test on the staged source key before MERGE, failing fast with the offending keys logged', true, 'Turns an opaque engine error into a clear data contract failure.'],
          ['More retries', false, 'Retries reproduce the error.'],
          ['A bigger cluster', false, 'Not a resource problem.'],
        ]],
      ], 'Contracts on the shape of the MERGE source prevent most failures.'),
    ],
    interview: [
      talk('Design the apply step for CDC from a SQL Server table into a Delta silver table. Cover inserts, updates, deletes, replays and out-of-order data.', `
        - **Bronze:** append raw change events (op, before/after, LSN/sequence, commit ts) exactly as received; never mutate.
        - **Per batch:** take changes since the last processed sequence (checkpoint), **dedupe to the latest event per key by LSN** (not by timestamp, which can tie).
        - **MERGE** into silver: WHEN MATCHED AND op='D' → delete (or soft-delete flag); WHEN MATCHED AND s.lsn > t.lsn → update; WHEN NOT MATCHED AND op<>'D' → insert. Store the LSN on the target row.
        - **Replays** are harmless because of the LSN guard; **late older events** are ignored for the same reason.
        - **Deletes + late updates:** keep tombstones (soft delete with lsn) for a retention window so a late update with a lower LSN cannot resurrect the row.
        - **Scale:** partition/cluster silver by something the batch can prune on; OPTIMIZE regularly; monitor rows inserted/updated/deleted per batch and reconcile counts with the source periodically.`),
    ],
    hands: [
      sql({ q: '**Apply a change feed with a monotonic guard.** «orders_current» holds the current state. Apply «raw_orders_feed»: take the **latest** event per order (by updated_at, then event_id), and **upsert** into orders_current only when the event is **newer** than the stored «updated_at» (or the order is new). Use «INSERT … ON CONFLICT(order_id) DO UPDATE … WHERE excluded.updated_at > orders_current.updated_at». Finally «SELECT * FROM orders_current ORDER BY order_id».', tables: ['orders_current', 'raw_orders_feed'], level: 3,
        solution: `INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM (
  SELECT order_id, status, amount, updated_at,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, event_id DESC) AS rn
  FROM raw_orders_feed
) WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET
  status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at
WHERE excluded.updated_at > orders_current.updated_at;
SELECT * FROM orders_current ORDER BY order_id`, hint: 'SQLite needs a WHERE on the SELECT … or a subquery in FROM when using ON CONFLICT; the derived table form works.' }),
      py({ q: '**SCD Type 2 in Python.** «scd2(dim, changes, as_of)»: «dim» is a list of dicts «{key, attr, valid_from, valid_to, is_current}» («valid_to» None for current). «changes» is a list of «{key, attr}» (one per key). For each change: if the key has a current row with the **same** attr, do nothing; if attr differs, close the current row («valid_to = as_of», «is_current = False») and add a new current row with «valid_from = as_of»; if the key is new, add a current row. Return the rows sorted by «(key, valid_from)». Must be idempotent: applying the same changes again with the same as_of changes nothing.', starter: 'def scd2(dim, changes, as_of):\n    pass\n',
        tests: `d = [{'key': 1, 'attr': 'West', 'valid_from': '2026-01-01', 'valid_to': None, 'is_current': True},
     {'key': 2, 'attr': 'North', 'valid_from': '2026-01-01', 'valid_to': None, 'is_current': True}]
ch = [{'key': 1, 'attr': 'South'}, {'key': 2, 'attr': 'North'}, {'key': 3, 'attr': 'East'}]
r = scd2(d, ch, '2026-06-01')
assert r == [
 {'key': 1, 'attr': 'West', 'valid_from': '2026-01-01', 'valid_to': '2026-06-01', 'is_current': False},
 {'key': 1, 'attr': 'South', 'valid_from': '2026-06-01', 'valid_to': None, 'is_current': True},
 {'key': 2, 'attr': 'North', 'valid_from': '2026-01-01', 'valid_to': None, 'is_current': True},
 {'key': 3, 'attr': 'East', 'valid_from': '2026-06-01', 'valid_to': None, 'is_current': True}], r
assert scd2(r, ch, '2026-06-01') == r, 'idempotent'
assert d[0]['is_current'] is True, 'do not mutate the input'`,
        solution: `def scd2(dim, changes, as_of):
    rows = [dict(r) for r in dim]
    current = {r['key']: r for r in rows if r['is_current']}
    for c in changes:
        cur = current.get(c['key'])
        if cur is not None and cur['attr'] == c['attr']:
            continue
        if cur is not None:
            cur['valid_to'] = as_of
            cur['is_current'] = False
        new = {'key': c['key'], 'attr': c['attr'], 'valid_from': as_of, 'valid_to': None, 'is_current': True}
        rows.append(new)
        current[c['key']] = new
    return sorted(rows, key=lambda r: (r['key'], r['valid_from']))` }),
    ],
  }),

  // ================================================================== Types
  sqltypes: T(`
    > **In one line:** most "the numbers don't match" incidents are type problems: **floats for money**, **integer division**, **timestamps without time zones**, **implicit casts** that drop matches, **string collation**, and **dates parsed in the wrong format**. A senior engineer chooses types deliberately in the contract.

    ## Numbers
    | Type | Use | Trap |
    |---|---|---|
    | INTEGER / BIGINT | Counts, IDs | Overflow: INT max ≈ 2.1 billion. Event IDs and sums of counts at scale need BIGINT. Integer division truncates |
    | DECIMAL(p, s) / NUMERIC | **Money, quantities that must reconcile** | Precision/scale overflow; division results get scale rules per engine; multiplying two DECIMAL(38, 18) can lose scale in Spark |
    | FLOAT / DOUBLE | Measurements (sensor temperature, ML features) | 0.1 + 0.2 ≠ 0.3; sums depend on order (partitioning), so distributed totals differ in the last digits between runs |
    - Reconciling DOUBLE totals with «=» fails randomly. Use DECIMAL for money, or compare with a tolerance.
    - «AVG» of an integer column returns an integer in some engines (SQL Server) and a double in others.
    - Rounding: «ROUND(2.5)» is 3 in most SQL engines (half away from zero) but Python's «round(2.5)» is 2 (banker's rounding). Report differences between a Python check and SQL often come from here.

    ## Strings
    - **Collation** decides equality and sort: case-insensitive collations (SQL Server, MySQL defaults) make «'ESN1' = 'esn1'» true; Postgres, Spark, SQLite are case-sensitive by default. Data moving between them changes join results.
    - Trailing spaces, non-breaking spaces, zero-width characters and Unicode normalisation forms make "identical" keys differ. Normalise keys (trim, upper, NFC) in silver.
    - «VARCHAR(n)» truncation or errors when a source widens a field.
    - Leading zeros: «'00123'» stored as integer becomes 123; part numbers and postal codes are **strings**.

    ## Dates and times
    | Type | Meaning |
    |---|---|
    | DATE | A calendar day, no time zone |
    | TIMESTAMP WITHOUT TIME ZONE («TIMESTAMP_NTZ») | A wall-clock reading; meaning depends on an implied zone |
    | TIMESTAMP WITH TIME ZONE («timestamptz», Spark «TIMESTAMP» = LTZ) | An instant; stored as UTC, displayed in the session zone |
    - **Store instants in UTC** (or with zone), convert to local time only for presentation or for "business day" definitions.
    - **Business day vs UTC day:** a claim at 01:30 IST on 2 Nov is 20:00 UTC on 1 Nov. A daily partition by UTC date puts it in the "wrong" Indian business day. Decide which day the business means and derive it explicitly.
    - **DST** (not in India, but in the US/Europe where Cummins operates): local days with 23 or 25 hours, repeated or missing local times. Hourly aggregates in local time get a missing or doubled hour.
    - **Spark session time zone** («spark.sql.session.timeZone») changes how timestamps are parsed and displayed; set it explicitly (usually UTC) in every job, or the same code gives different results on different clusters.
    - **Parsing:** «03/04/2026» is 3 April or 4 March. Always parse with an explicit format; reject ambiguous input in validation.
    - **Epoch units:** seconds vs milliseconds vs microseconds (Kafka timestamps are ms; Debezium often µs). A factor-1000 error puts events in 1970 or the year 57000.

    ## Implicit casts
    - Comparing a string column to a number («WHERE dealer_code = 14») makes the engine cast one side: either every row is cast (no index, slow) or values like «'014'» stop matching.
    - Spark ANSI mode («spark.sql.ansi.enabled», default true in Spark 4) raises on invalid casts and overflow instead of returning NULL. A job can start failing after an upgrade because bad values that used to silently become NULL now error. That is a good thing, but it needs planning.

    ## Booleans and semi-structured
    - «'false'», «'N'», «0», «''» from different sources must be mapped explicitly to boolean.
    - JSON numbers: large integers lose precision in JavaScript/double parsers (IDs over 2^53). Keep IDs as strings in JSON.

    ## How interviewers test this
    - "Why should money not be a float?" Then "what would you use in Spark?" («DecimalType(18, 2)» or larger).
    - "Your daily totals differ between the Spark job and the Python check by 0.0000003. Why?"
    - "A claim submitted at 1:30 am in Pune shows on the previous day in the report. Why?"
  `, {
    check: [
      mcq('Best type for claim amounts that must reconcile to finance?', ['DOUBLE', 'FLOAT', 'DECIMAL(18, 2)', 'VARCHAR'], 2, 'Exact decimal arithmetic.'),
      mcq('A claim submitted at 01:30 IST on 2 Nov appears on 1 Nov in a UTC-partitioned table. Why?', ['A bug in Spark', 'IST is UTC+5:30, so the instant is 20:00 UTC on 1 Nov', 'Late data', 'DST'], 1, 'Define the business day explicitly.'),
      tf('Summing the same DOUBLE values in a different order can give a slightly different result.', true, 'Floating point addition is not associative; distributed order varies.'),
      mcq('Part number «00123» was loaded as INTEGER. What breaks?', ['Nothing', 'Leading zeros are lost and joins to systems using the string code fail', 'Sorting only', 'It becomes NULL'], 1, 'Identifiers are strings.'),
      mcq('An upgrade enables ANSI mode and a job now fails with a cast error. What changed?', ['The data got worse', 'Invalid casts used to become NULL silently; now they raise', 'Spark lost a feature', 'Time zones'], 1, 'Find and handle the bad values instead of turning ANSI off.'),
    ],
    hands: [
      py({ q: '**Money and rounding.** Write «split_amount(total, n)» that splits a money amount (a string like «"100.00"») into «n» parts that are **Decimals with 2 decimal places**, differ by at most 0.01, and **sum exactly** to the total (the first parts get the extra cents). Return a list of strings. Use «decimal.Decimal», not float.', starter: 'from decimal import Decimal\n\ndef split_amount(total, n):\n    pass\n',
        tests: `assert split_amount('100.00', 3) == ['33.34', '33.33', '33.33']
assert split_amount('0.05', 2) == ['0.03', '0.02']
assert split_amount('10.00', 4) == ['2.50', '2.50', '2.50', '2.50']
from decimal import Decimal
parts = split_amount('1234567.89', 7)
assert sum(Decimal(p) for p in parts) == Decimal('1234567.89')
assert max(Decimal(p) for p in parts) - min(Decimal(p) for p in parts) <= Decimal('0.01')`,
        solution: `from decimal import Decimal

def split_amount(total, n):
    cents = int(Decimal(total) * 100)
    base, extra = divmod(cents, n)
    out = []
    for i in range(n):
        c = base + (1 if i < extra else 0)
        out.append(str((Decimal(c) / 100).quantize(Decimal('0.01'))))
    return out` }),
    ],
  }),
};
