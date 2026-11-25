const { learn, mcq, tf, multi, fill, match, order, sql, viz, bug, scenario, world, lesson } = require('./_h.cjs');

module.exports = world('sql2', 'Advanced SQL', 'interview core',
  'CTEs, window functions, deduplication, gaps-and-islands, funnels, recursion, MERGE/UPSERT and query performance. This is what DE SQL rounds are made of.',
  [
    lesson('a1', 'CTEs: readable multi-step SQL', 15, [
      learn('WITH: name your steps', `
        A **CTE** (common table expression) is a named subquery you define up front. It turns one unreadable nested query into a pipeline of steps, the way a Data Prep recipe has nodes.

        «««sql
        WITH sr_durations AS (            -- step 1: one row per closed SR
          SELECT sr_id, crf_id,
                 julianday(closed_at) - julianday(opened_at) AS days
          FROM service_requests
          WHERE closed_at IS NOT NULL
        ),
        by_issue AS (                     -- step 2: aggregate
          SELECT c.issue_type, AVG(d.days) AS avg_days, COUNT(*) AS n
          FROM sr_durations d JOIN crf c ON c.crf_id = d.crf_id
          GROUP BY c.issue_type
        )
        SELECT * FROM by_issue WHERE n >= 20 ORDER BY avg_days DESC;
        »»»

        - Later CTEs can reference earlier ones.
        - Most engines inline CTEs, so performance usually matches the equivalent subquery.
        - In interviews, **talk in CTEs**: "first I get one row per engine, then…". It shows structured thinking.
      `),
      sql({ q: `Using CTEs: compute each dealer's total approved amount (treat NULL as 0), then return only dealers above the **average dealer total**. Return «dealer_id, total» rounded to 2 decimals.`, tables: ['claims'], solution: `WITH t AS (
  SELECT dealer_id, SUM(COALESCE(approved_amount, 0)) AS total FROM claims GROUP BY dealer_id
)
SELECT dealer_id, ROUND(total, 2) FROM t WHERE total > (SELECT AVG(total) FROM t);`, level: 2, hint: 'CTE 1 = totals per dealer. Then compare against (SELECT AVG(total) FROM t).' }),
      sql({ q: `Supplier scorecard with CTEs: per supplier, the number of POs, the number received late («received_date > expected_date») and late percentage (1 decimal). Return «supplier_name, pos, late, late_pct», worst first.`, tables: ['purchase_orders', 'suppliers'], solution: `WITH po AS (
  SELECT supplier_id, COUNT(*) AS pos,
         SUM(CASE WHEN received_date > expected_date THEN 1 ELSE 0 END) AS late
  FROM purchase_orders GROUP BY supplier_id
)
SELECT s.supplier_name, po.pos, po.late, ROUND(100.0 * po.late / po.pos, 1) AS late_pct
FROM po JOIN suppliers s ON s.supplier_id = po.supplier_id
ORDER BY late_pct DESC;`, ordered: true, level: 2 }),
      tf('A CTE is always materialized (computed once and stored) by every database.', false, 'Behaviour varies. Postgres 12+ inlines by default, Spark inlines, some engines materialize. Never assume a CTE is a cache. In Spark, use «.cache()» or write an intermediate table.'),
    ]),
    lesson('a2', 'Window functions I: ranking', 20, [
      viz('windowfn', 'Step through a window', 'Window functions compute across related rows **without collapsing them**, unlike GROUP BY. Step row by row and watch the frame.'),
      learn('The OVER clause', `
        «««sql
        function() OVER (PARTITION BY <groups> ORDER BY <sort> [frame])
        »»»
        | Function | Ties | Use for |
        |---|---|---|
        | «ROW_NUMBER()» | 1,2,3,4 (arbitrary on ties) | dedup, latest record per key |
        | «RANK()» | 1,2,2,4 | competition ranking |
        | «DENSE_RANK()» | 1,2,2,3 | Nth highest distinct value |
        | «NTILE(4)» | quartile buckets | segmentation |

        **The #1 interview pattern, "top N per group":**
        «««sql
        WITH ranked AS (
          SELECT c.*, ROW_NUMBER() OVER (PARTITION BY dealer_id ORDER BY claim_amount DESC) AS rn
          FROM claims c
        )
        SELECT * FROM ranked WHERE rn <= 3;
        »»»
        You can't put a window function in WHERE (it is computed in SELECT), so wrap it in a CTE. Snowflake, Databricks and BigQuery offer «QUALIFY rn <= 3» as a shortcut.
      `),
      sql({ q: `Top 2 claims by «claim_amount» for **each dealer**. Return «dealer_id, claim_id, claim_amount».`, tables: ['claims'], solution: `WITH r AS (
  SELECT dealer_id, claim_id, claim_amount,
         ROW_NUMBER() OVER (PARTITION BY dealer_id ORDER BY claim_amount DESC) AS rn
  FROM claims
)
SELECT dealer_id, claim_id, claim_amount FROM r WHERE rn <= 2;`, level: 2 }),
      sql({ q: `Latest record per order: «raw_orders_feed» has several events per «order_id» (and some exact duplicates). Return the **latest status** per order: «order_id, status, updated_at». Break ties with the latest «ingested_at».`, tables: ['raw_orders_feed'], solution: `WITH r AS (
  SELECT order_id, status, updated_at,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
  FROM raw_orders_feed
)
SELECT order_id, status, updated_at FROM r WHERE rn = 1;`, level: 3, hint: 'PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC, keep rn = 1.' }),
      sql({ q: `Second-highest **distinct** «unit_cost» per part category. Return «category, unit_cost». Use DENSE_RANK.`, tables: ['parts'], solution: `WITH r AS (
  SELECT category, unit_cost, DENSE_RANK() OVER (PARTITION BY category ORDER BY unit_cost DESC) AS dr FROM parts
)
SELECT DISTINCT category, unit_cost FROM r WHERE dr = 2;`, level: 2 }),
      mcq('Scores 900, 700, 700, 500. What does «RANK()» (descending) give the 500?', ['3', '4', '2', '5'], 1, 'RANK leaves a gap after ties: 1, 2, 2, **4**. DENSE_RANK would give 3.'),
      mcq('Why does this fail?', ['ROW_NUMBER needs ORDER BY', 'Window functions are evaluated after WHERE, so they can\'t be filtered there', 'PARTITION BY needs two columns', 'It doesn\'t fail'], 1, 'Logical order: WHERE runs before SELECT, where windows are computed. Use a CTE/subquery or QUALIFY.', { code: 'SELECT * FROM claims\nWHERE ROW_NUMBER() OVER (PARTITION BY dealer_id ORDER BY claim_amount DESC) = 1;', lang: 'sql' }),
      tf('Without a unique tiebreaker in ORDER BY, ROW_NUMBER can pick different rows on different runs.', true, 'Non-deterministic results make pipelines non-reproducible. Always add a tiebreaker column (e.g. an ingestion timestamp or id).'),
    ]),
    lesson('a3', 'Window functions II: running totals, LAG/LEAD', 20, [
      learn('Frames, running totals and look-backs', `
        «««sql
        SUM(amount) OVER (PARTITION BY dealer_id ORDER BY submitted_at)          -- running total
        AVG(temp)   OVER (PARTITION BY engine_id ORDER BY ts
                          ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)            -- 3-reading moving avg
        LAG(temp)   OVER (PARTITION BY engine_id ORDER BY ts)                  -- previous reading
        LEAD(ts)    OVER (PARTITION BY engine_id ORDER BY ts)                  -- next reading
        SUM(amount) OVER (PARTITION BY dealer_id)                              -- partition total on every row
        amount * 1.0 / SUM(amount) OVER (PARTITION BY dealer_id)              -- share of total
        »»»
        **Default frame gotcha:** with ORDER BY and no frame, the default is «RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW». RANGE includes all rows **tied** on the ORDER BY value, so running totals jump on ties. Use «ROWS BETWEEN …» when you mean physical rows.
      `),
      sql({ q: `Running total of approved credit-note «amount» by «issued_at» date (across all claims), in date order. Return «cn_id, issued_at, amount, running_total». Use ROWS framing and break ties by «cn_id».`, tables: ['credit_notes'], solution: `SELECT cn_id, issued_at, amount,
       SUM(amount) OVER (ORDER BY issued_at, cn_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total
FROM credit_notes ORDER BY issued_at, cn_id;`, ordered: true, level: 2 }),
      sql({ q: `Overheating spikes: using «sensor_readings», find readings where temperature rose by **more than 8°C** versus the same engine's previous reading. Return «engine_id, ts, temperature_c, prev_temp».`, tables: ['sensor_readings'], solution: `WITH x AS (
  SELECT engine_id, ts, temperature_c,
         LAG(temperature_c) OVER (PARTITION BY engine_id ORDER BY ts) AS prev_temp
  FROM sensor_readings
)
SELECT engine_id, ts, temperature_c, prev_temp FROM x WHERE temperature_c - prev_temp > 8;`, level: 2, hint: 'LAG(temperature_c) OVER (PARTITION BY engine_id ORDER BY ts)' }),
      sql({ q: `3-reading moving average of temperature for **engine 7**: return «ts, temperature_c, ma3» (rounded to 2), in time order.`, tables: ['sensor_readings'], solution: `SELECT ts, temperature_c,
       ROUND(AVG(temperature_c) OVER (ORDER BY ts ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS ma3
FROM sensor_readings WHERE engine_id = 7 ORDER BY ts;`, ordered: true, level: 2 }),
      sql({ q: `Share of each dealer in total claim volume: return «dealer_id», number of claims, and percent of all claims (1 decimal) using a window over an aggregate.`, tables: ['claims'], solution: `SELECT dealer_id, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct FROM claims GROUP BY dealer_id;`, level: 3, hint: 'Windows run after GROUP BY, so SUM(COUNT(*)) OVER () is legal.' }),
      mcq('Time between consecutive service requests opened for the same CRF customer is best computed with…', ['LEAD/LAG', 'RANK', 'GROUP BY + MAX', 'CROSS JOIN'], 0, '«julianday(opened_at) - julianday(LAG(opened_at) OVER (PARTITION BY customer ORDER BY opened_at))»'),
    ]),
    lesson('a4', 'Patterns: dedup, gaps & islands, funnels, pivots', 25, [
      learn('Four patterns that keep coming back', `
        **1. Deduplication.** Exact duplicates: «SELECT DISTINCT». Business duplicates (same key, many versions): «ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC) = 1».

        **2. Gaps and islands.** Find consecutive streaks (days an engine ran, consecutive failures). Trick: «day − ROW_NUMBER()» is constant within a streak.

        **3. Funnels.** Count how many entities reach each stage, and conversion between stages. Your CRF → SR → PIR → Claim → Credit Note dashboard is a funnel.

        **4. Pivot.** Rows to columns with conditional aggregation: «SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) AS approved».
      `),
      sql({ q: `Funnel: return a **single row** with counts of CRFs, service requests, PIRs, claims and credit notes (5 columns).`, tables: ['crf', 'service_requests', 'pir', 'claims', 'credit_notes'], solution: `SELECT (SELECT COUNT(*) FROM crf) AS crfs, (SELECT COUNT(*) FROM service_requests) AS srs, (SELECT COUNT(*) FROM pir) AS pirs, (SELECT COUNT(*) FROM claims) AS claims, (SELECT COUNT(*) FROM credit_notes) AS credit_notes;`, level: 2 }),
      sql({ q: `Funnel by issue type: for each «issue_type», count CRFs and how many reached a **claim**, plus the CRF→claim conversion % (1 decimal). Return «issue_type, crfs, claims, conv_pct».`, tables: ['crf', 'service_requests', 'pir', 'claims'], solution: `SELECT c.issue_type,
       COUNT(DISTINCT c.crf_id) AS crfs,
       COUNT(DISTINCT cl.claim_id) AS claims,
       ROUND(100.0 * COUNT(DISTINCT cl.claim_id) / COUNT(DISTINCT c.crf_id), 1) AS conv_pct
FROM crf c
LEFT JOIN service_requests s ON s.crf_id = c.crf_id
LEFT JOIN pir p ON p.sr_id = s.sr_id
LEFT JOIN claims cl ON cl.pir_id = p.pir_id
GROUP BY c.issue_type;`, level: 3, hint: 'LEFT JOIN down the chain so CRFs that stop early are still counted, and use COUNT(DISTINCT ...).' }),
      sql({ q: `Gaps & islands: in «engine_daily_status», find each engine's **longest streak of consecutive running days** («is_running = 1»). Return «engine_id, longest_streak».`, tables: ['engine_daily_status'], solution: `WITH r AS (
  SELECT engine_id, day,
         julianday(day) - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY day) AS grp
  FROM engine_daily_status WHERE is_running = 1
), streaks AS (
  SELECT engine_id, grp, COUNT(*) AS len FROM r GROUP BY engine_id, grp
)
SELECT engine_id, MAX(len) AS longest_streak FROM streaks GROUP BY engine_id;`, level: 3, hint: 'Within a streak of consecutive days, julianday(day) - ROW_NUMBER() is constant. Group by it.' }),
      sql({ q: `Pivot: one row per dealer with columns «approved, partially_approved, rejected, submitted» counting claims in each status.`, tables: ['claims'], solution: `SELECT dealer_id,
  SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
  SUM(CASE WHEN status = 'Partially Approved' THEN 1 ELSE 0 END) AS partially_approved,
  SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
  SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) AS submitted
FROM claims GROUP BY dealer_id;`, level: 2 }),
      sql({ q: `Find **exact duplicate deliveries** in «raw_orders_feed»: rows with the same «order_id, status, updated_at» appearing more than once. Return «order_id, status, updated_at, copies».`, tables: ['raw_orders_feed'], solution: `SELECT order_id, status, updated_at, COUNT(*) AS copies FROM raw_orders_feed GROUP BY order_id, status, updated_at HAVING COUNT(*) > 1;`, level: 2 }),
      sql({ q: `Month-over-month: monthly CRF counts with the previous month's count and the % change (1 decimal). Return «month, crfs, prev, pct_change» in month order.`, tables: ['crf'], solution: `WITH m AS (
  SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS crfs FROM crf GROUP BY month
)
SELECT month, crfs, LAG(crfs) OVER (ORDER BY month) AS prev,
       ROUND(100.0 * (crfs - LAG(crfs) OVER (ORDER BY month)) / LAG(crfs) OVER (ORDER BY month), 1) AS pct_change
FROM m ORDER BY month;`, ordered: true, level: 3 }),
    ]),
    lesson('a5', 'Recursive CTEs and hierarchies', 12, [
      learn('Walking a tree with WITH RECURSIVE', `
        Org charts, bills of materials (engine → assembly → part) and category trees are **hierarchies**: a row points to its parent.

        «««sql
        WITH RECURSIVE chain AS (
          SELECT emp_id, name, manager_id, 0 AS depth      -- anchor: the roots
          FROM employees WHERE manager_id IS NULL
          UNION ALL
          SELECT e.emp_id, e.name, e.manager_id, c.depth + 1   -- recursive step
          FROM employees e JOIN chain c ON e.manager_id = c.emp_id
        )
        SELECT * FROM chain;
        »»»
        The anchor runs once, then the recursive member runs repeatedly on the previous step's rows until it returns nothing. Always make sure it terminates (cycles in the data will loop forever: add a depth limit).
      `),
      sql({ q: `Everyone who reports **directly or indirectly** to Vikram Joshi (emp_id 2). Return «emp_id, name, depth», where direct reports have depth 1.`, tables: ['employees'], solution: `WITH RECURSIVE r AS (
  SELECT emp_id, name, 1 AS depth FROM employees WHERE manager_id = 2
  UNION ALL
  SELECT e.emp_id, e.name, r.depth + 1 FROM employees e JOIN r ON e.manager_id = r.emp_id
)
SELECT emp_id, name, depth FROM r;`, level: 3 }),
      sql({ q: `Generate a **date spine**: every date from 2026-11-01 to 2026-11-07 (7 rows, one column). Date spines let you report zero-activity days instead of silently skipping them.`, tables: [], solution: `WITH RECURSIVE d(day) AS (
  SELECT '2026-11-01'
  UNION ALL
  SELECT date(day, '+1 day') FROM d WHERE day < '2026-11-07'
)
SELECT day FROM d;`, ordered: true, level: 2 }),
    ]),
    lesson('a6', 'Changing data: DML, UPSERT, MERGE', 18, [
      learn('Writing data safely', `
        «««sql
        INSERT INTO t (a, b) VALUES (1, 'x');
        UPDATE t SET b = 'y' WHERE a = 1;
        DELETE FROM t WHERE a = 1;
        »»»
        **UPSERT** (insert or update if the key exists) is the heart of incremental loading:
        «««sql
        -- SQLite / Postgres
        INSERT INTO orders_current (order_id, status, amount, updated_at)
        SELECT order_id, status, amount, updated_at FROM staging
        ON CONFLICT(order_id) DO UPDATE SET
          status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at
        WHERE excluded.updated_at > orders_current.updated_at;
        »»»
        «««sql
        -- Delta Lake / Snowflake / SQL Server: MERGE
        MERGE INTO orders_current t
        USING staging s ON t.order_id = s.order_id
        WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *;
        »»»
        MERGE needs **one source row per key**. Deduplicate staging first, or the engine errors ("multiple source rows matched").

        **Transactions** («BEGIN … COMMIT / ROLLBACK») make a group of statements all-or-nothing (ACID). Delta and Iceberg bring the same guarantee to files on the lake.
      `),
      sql({ q: `Upsert: load the **latest status per order** from «raw_orders_feed» into «orders_current» (key «order_id») with «INSERT … ON CONFLICT DO UPDATE», only overwriting when the incoming «updated_at» is newer. The checker then reads the whole table.`, tables: ['raw_orders_feed', 'orders_current'], check: 'SELECT order_id, status, amount, updated_at FROM orders_current', solution: `WITH latest AS (
  SELECT order_id, status, amount, updated_at,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
  FROM raw_orders_feed
)
INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM latest WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET
  status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at
WHERE excluded.updated_at > orders_current.updated_at;`, level: 3, hint: 'Deduplicate with ROW_NUMBER first (one source row per key), then INSERT ... SELECT ... ON CONFLICT(order_id) DO UPDATE.' }),
      sql({ q: `Watermark-based incremental load: insert into «orders_current» only feed rows with «updated_at» **after** the watermark stored in «etl_watermarks» (pipeline «'orders'»), latest per order, then move the watermark to the max loaded «updated_at». The checker reads the watermark table.`, tables: ['raw_orders_feed', 'orders_current', 'etl_watermarks'], check: 'SELECT pipeline, last_loaded_at FROM etl_watermarks', solution: `WITH new_rows AS (
  SELECT * FROM raw_orders_feed
  WHERE updated_at > (SELECT last_loaded_at FROM etl_watermarks WHERE pipeline = 'orders')
), latest AS (
  SELECT order_id, status, amount, updated_at,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
  FROM new_rows
)
INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM latest WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at;
UPDATE etl_watermarks
SET last_loaded_at = (SELECT MAX(updated_at) FROM raw_orders_feed WHERE updated_at > last_loaded_at)
WHERE pipeline = 'orders';`, level: 3, hint: 'Two statements: the upsert filtered by the watermark, then an UPDATE of etl_watermarks to MAX(updated_at).' }),
      mcq('A MERGE fails with "multiple source rows matched the same target row". The fix?', ['Use INSERT instead', 'Deduplicate the source to one row per key before merging', 'Disable the primary key', 'Run it twice'], 1, 'Typical cause: staging contains the same order twice (duplicate delivery). Dedup with ROW_NUMBER, keep the latest.'),
      tf('Running the same UPSERT twice with the same input leaves the target unchanged after the first run.', true, 'That is **idempotency**, the property that makes pipelines safe to retry. A plain INSERT would double the rows.'),
    ]),
    lesson('a7', 'Query performance', 15, [
      learn('Why queries are slow, and what to do', `
        **Row stores (OLTP, Postgres, SQLite)**
        - **Index** = sorted lookup structure (B-tree) on columns. Turns full scans into seeks for selective «WHERE», «JOIN» keys and «ORDER BY».
        - Indexes speed reads and slow writes. Don't index everything.
        - **Sargable** predicates can use an index: «WHERE created_at >= '2026-11-01'». Non-sargable ones can't: «WHERE strftime('%Y', created_at) = '2026'» wraps the column in a function.

        **Columnar / distributed (Spark, Snowflake, Databricks)**
        - No classic indexes. Speed comes from **reading less**: select only needed columns, filter on **partition/cluster columns** (pruning), let Parquet min/max stats skip blocks.
        - Big costs are **shuffles** (joins, GROUP BY, DISTINCT, ORDER BY over the network) and **skew**.
        - Pre-aggregate before joining, broadcast small dimensions, avoid «SELECT *», avoid «DISTINCT» as a band-aid for bad joins.

        Always read the plan: «EXPLAIN QUERY PLAN» (SQLite), «EXPLAIN ANALYZE» (Postgres), «df.explain()» (Spark), Query Profile (Snowflake).
      `),
      multi('Which changes typically make a warehouse query faster?', ['Selecting only the columns you need', 'Filtering on the partition column', 'Wrapping the filter column in a function', 'Aggregating before a large join', 'Adding DISTINCT to hide join duplicates'], [0, 1, 3], 'Functions on filter columns defeat pruning/indexes. DISTINCT after a fan-out hides a bug and adds a full shuffle.'),
      mcq('Which predicate is sargable (can use an index on «created_at»)?', [`strftime('%Y-%m', created_at) = '2026-11'`, `created_at >= '2026-11-01' AND created_at < '2026-12-01'`, `substr(created_at, 1, 7) = '2026-11'`, `created_at || '' = '2026-11-01'`], 1, 'A bare column compared with a range can seek in the index. Transforming the column forces evaluating every row.'),
      bug('This daily job got 10× slower after the claims table grew. Which line is the main problem?', `SELECT d.region, COUNT(DISTINCT c.claim_id) AS claims
FROM claims c
JOIN dealers d ON d.dealer_id = c.dealer_id
JOIN credit_notes n ON 1 = 1
WHERE c.submitted_at >= '2026-11-01'
GROUP BY d.region;`, 4, '«JOIN … ON 1 = 1» is a cross join: every claim × every credit note. COUNT(DISTINCT) hides the duplicates while the engine processes a huge intermediate result.', 'sql'),
      scenario('Dashboard query times out', `A **claims dashboard** query on the warehouse went from 8 seconds to 4 minutes over the last month. Nothing in the SQL changed. The claims fact table grew from 2M to 30M rows.`, [
        ['What do you look at first?', [
          ['The query plan / query profile: where is time spent, and how many rows flow through each step?', true, 'Measure before changing anything. The profile shows scans, spills, shuffles and row explosions.'],
          ['Immediately add more compute', false, 'Scaling up may hide the issue for a month and costs money. Diagnose first.'],
          ['Rewrite the whole dashboard', false, 'Premature. You don\'t know the cause yet.'],
        ]],
        ['The profile shows a full scan of all 30M rows although the dashboard only shows the last 90 days. The filter is «WHERE year(submitted_at) = 2026». What do you change?', [
          ['Filter on the raw column with a range: «submitted_at >= current_date - 90», and make sure the table is partitioned/clustered by submit date', true, 'The function on the column blocked pruning. A range on the partition column lets the engine skip old files.'],
          ['Add DISTINCT', false, 'Doesn\'t reduce the scan.'],
          ['Cast the column to string', false, 'Still a function on the column.'],
        ]],
        ['Scan is fixed, but a join to a 10-row «dim_status» table still shuffles 30M rows. What now?', [
          ['Broadcast the small dimension (or let the engine auto-broadcast it)', true, 'The big table stays where it is. Only 10 rows are copied to every worker.'],
          ['Repartition the fact table to 1 partition', false, 'That kills parallelism.'],
          ['Remove the join and hard-code statuses in the BI tool', false, 'Moves business logic to the wrong layer.'],
        ]],
      ], 'Classic debugging loop: **measure → find the biggest cost → fix the cause (not the symptom) → measure again.**'),
    ]),
  ]);
