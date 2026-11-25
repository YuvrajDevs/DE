const { learn, mcq, tf, multi, fill, match, order, sql, viz, bug, world, lesson } = require('./_h.cjs');

module.exports = world('sql1', 'SQL Foundations', 'highest priority',
  'From SELECT to joins on a real warehouse: a fictional engine maker with dealers, engines, sensors and the full CRF → SR → PIR → Claim → Credit Note flow you already know from work.',
  [
    lesson('s1', 'SELECT, WHERE, ORDER BY', 15, [
      learn('Meet the warehouse', `
        Every SQL challenge runs on **Apex Engines**, a fictional engine maker. Each run starts from a fresh copy, so you can't break anything.

        | Table | What a row is |
        |---|---|
        | «crf» | a customer request form (issue raised) |
        | «service_requests» | a service job opened from a CRF |
        | «pir» | product incident report after a service job |
        | «claims» | warranty claim raised from a PIR |
        | «credit_notes» | money credited for an approved claim |
        | «engines», «customers», «dealers», «plants» | master data |
        | «sensor_readings» | IoT telemetry every 5 minutes |
        | «parts», «suppliers», «purchase_orders», «inventory», «quality_defects» | supply chain and quality |

        The engine is **SQLite**. It supports CTEs, window functions, UPSERT and JSON. Dates are stored as text like «'2026-11-25 14:02:00'», and «date()», «strftime()» and «julianday()» work on them.
      `),
      learn('Anatomy of a query', `
        «««sql
        SELECT engine_id, model, horsepower          -- columns (projection)
        FROM engines                                 -- source
        WHERE model = 'X15' AND horsepower >= 500    -- row filter
        ORDER BY build_date DESC                     -- sort
        LIMIT 5;                                     -- first N rows
        »»»

        - Strings use **single quotes**: «'X15'». Double quotes are for identifiers.
        - «WHERE» supports «=, <>, <, >=, BETWEEN a AND b, IN (...), LIKE 'X%', IS NULL».
        - «AND» binds tighter than «OR». Use parentheses: «WHERE (a OR b) AND c».
        - «SELECT DISTINCT model» removes duplicate rows from the output.
      `),
      sql({ q: 'List all engines of model **X15**: «engine_id», «serial_no», «build_date». Order by «build_date», newest first.', tables: ['engines'], starter: 'SELECT \nFROM engines\n', solution: `SELECT engine_id, serial_no, build_date FROM engines WHERE model = 'X15' ORDER BY build_date DESC;`, ordered: true, hint: 'WHERE model = \'X15\' then ORDER BY build_date DESC.' }),
      sql({ q: 'Which **distinct** issue types appear in «crf»? Return one column, sorted alphabetically.', tables: ['crf'], starter: 'SELECT ', solution: `SELECT DISTINCT issue_type FROM crf ORDER BY issue_type;`, ordered: true }),
      sql({ q: `Find P1 service requests that are **not closed** («status» is not «'Closed'»). Return «sr_id, crf_id, opened_at, status», oldest first.`, tables: ['service_requests'], solution: `SELECT sr_id, crf_id, opened_at, status FROM service_requests WHERE priority = 'P1' AND status <> 'Closed' ORDER BY opened_at;`, ordered: true, hint: 'Two conditions joined with AND.' }),
      mcq('What does this return?', ["Engines with model X15, or any engine above 2000 hp", "Only X15 engines above 2000 hp", "Engines that are X15 or L9 with more than 2000 hp", "A syntax error"], 2, '«AND» binds tighter than «OR», but here the parentheses group the OR first: (X15 or L9) AND hp > 2000.', { code: "SELECT * FROM engines\nWHERE (model = 'X15' OR model = 'L9') AND horsepower > 2000;", lang: 'sql' }),
      fill(`Complete: «SELECT * FROM customers WHERE customer_name ____ 'K%';» to find names starting with K.`, ['LIKE'], '«%» matches any sequence, «_» exactly one character.'),
      sql({ q: 'Customers in segment **Mining** or **Marine** located in India. Return «customer_id, customer_name, segment». Use «IN».', tables: ['customers'], solution: `SELECT customer_id, customer_name, segment FROM customers WHERE segment IN ('Mining','Marine') AND country = 'India';` }),
    ]),
    lesson('s2', 'NULLs and CASE', 15, [
      learn('NULL is "unknown", not zero', `
        «NULL» means *unknown / missing*. Any comparison with NULL is **unknown**, which «WHERE» treats as false.

        | Expression | Result |
        |---|---|
        | «NULL = NULL» | NULL (not true!) |
        | «NULL <> 5» | NULL |
        | «NULL + 10» | NULL |
        | «NULL IS NULL» | TRUE |
        | «COALESCE(NULL, 0)» | 0 |

        So «WHERE closed_at = NULL» returns **nothing**. Always write «IS NULL» / «IS NOT NULL».

        Aggregates skip NULLs: «COUNT(col)» counts non-null values, «COUNT(*)» counts rows, «AVG(col)» averages only non-null values.
      `),
      tf('«SELECT COUNT(*) FROM sr WHERE closed_at = NULL» counts the open service requests.', false, 'Comparison with NULL yields unknown, so no row passes. Use «closed_at IS NULL».'),
      mcq('The column «approved_amount» holds 100, NULL and 300. What is «AVG(approved_amount)»?', ['133.33', '200', 'NULL', '400'], 1, 'AVG ignores NULLs: (100 + 300) / 2 = 200. If NULL should count as zero, use «AVG(COALESCE(approved_amount, 0))».'),
      sql({ q: 'How many service requests are still open? An open request has no «closed_at». Return a single number.', tables: ['service_requests'], solution: `SELECT COUNT(*) FROM service_requests WHERE closed_at IS NULL;` }),
      learn('CASE: if/else inside SQL', `
        «««sql
        SELECT claim_id, claim_amount,
               CASE
                 WHEN claim_amount >= 200000 THEN 'High'
                 WHEN claim_amount >= 50000  THEN 'Medium'
                 ELSE 'Low'
               END AS amount_band
        FROM claims;
        »»»
        The first matching WHEN wins. This is exactly what your **ageing bucket** calculated fields do in Data Prep.
      `),
      sql({ q: `Build an **ageing bucket** for every service request: days between «opened_at» and «closed_at»; if it is still open, use «'2026-11-25'» as the end date. Buckets: «'0-7'», «'8-15'», «'16+'». Return «sr_id, bucket».`, tables: ['service_requests'], solution: `SELECT sr_id,
  CASE
    WHEN julianday(COALESCE(closed_at, '2026-11-25')) - julianday(opened_at) <= 7 THEN '0-7'
    WHEN julianday(COALESCE(closed_at, '2026-11-25')) - julianday(opened_at) <= 15 THEN '8-15'
    ELSE '16+'
  END AS bucket
FROM service_requests;`, hint: 'julianday(end) - julianday(start) gives days. COALESCE supplies the end date for open rows.', level: 2 }),
      sql({ q: 'Show each claim with an «effective_amount»: «approved_amount» when it exists, otherwise 0. Return «claim_id, status, effective_amount».', tables: ['claims'], solution: `SELECT claim_id, status, COALESCE(approved_amount, 0) AS effective_amount FROM claims;` }),
      mcq('What is «NULL OR TRUE» in SQL three-valued logic?', ['NULL', 'TRUE', 'FALSE', 'Error'], 1, 'OR needs one TRUE to be TRUE, so the unknown side doesn\'t matter. «NULL AND TRUE» is NULL, «NULL AND FALSE» is FALSE.'),
      mcq(`«SELECT * FROM t WHERE region NOT IN ('North', NULL)» returns…`, ['All non-North rows', 'No rows at all', 'Only NULL regions', 'An error'], 1, `Classic trap: «x NOT IN (..., NULL)» becomes «x <> 'North' AND x <> NULL», and the second part is unknown. A NULL inside NOT IN wipes out the whole result. Use NOT EXISTS instead.`),
    ]),
    lesson('s3', 'GROUP BY and aggregates', 18, [
      viz('groupby', 'See GROUP BY happen', 'GROUP BY splits rows into buckets by key, then **collapses each bucket into one row**.'),
      learn('Aggregation rules', `
        «««sql
        SELECT dealer_id, COUNT(*) AS claims, SUM(claim_amount) AS total
        FROM claims
        WHERE status <> 'Rejected'          -- filters ROWS before grouping
        GROUP BY dealer_id
        HAVING SUM(claim_amount) > 500000   -- filters GROUPS after aggregation
        ORDER BY total DESC;
        »»»
        **The golden rule:** every column in SELECT must be either in «GROUP BY» or inside an aggregate («COUNT, SUM, AVG, MIN, MAX»).

        - «WHERE» can't use aggregates. «HAVING» can.
        - «COUNT(DISTINCT engine_id)» counts unique values.
        - «SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END)» is **conditional counting**. You will use it constantly.
      `),
      sql({ q: 'Claims per status: return «status», number of claims, and total «claim_amount» rounded to 2 decimals. Order by number of claims descending.', tables: ['claims'], solution: `SELECT status, COUNT(*) AS n, ROUND(SUM(claim_amount), 2) AS total FROM claims GROUP BY status ORDER BY n DESC;`, ordered: true }),
      sql({ q: `For each dealer, return «dealer_id», total claims, and number of **approved** claims (status «'Approved'» only) using conditional aggregation. Only dealers with at least 10 claims.`, tables: ['claims'], solution: `SELECT dealer_id, COUNT(*) AS total, SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved FROM claims GROUP BY dealer_id HAVING COUNT(*) >= 10;`, hint: 'SUM(CASE WHEN ... THEN 1 ELSE 0 END), and HAVING COUNT(*) >= 10.', level: 2 }),
      sql({ q: `Monthly CRF volume: return month as «'YYYY-MM'» (from «created_at») and the number of CRFs, in month order.`, tables: ['crf'], solution: `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS crfs FROM crf GROUP BY month ORDER BY month;`, ordered: true, hint: "strftime('%Y-%m', created_at)" }),
      mcq('Which query is **invalid** in standard SQL?', [
        'SELECT region, COUNT(*) FROM dealers GROUP BY region',
        'SELECT region, city, COUNT(*) FROM dealers GROUP BY region',
        'SELECT COUNT(*) FROM dealers',
        'SELECT region FROM dealers GROUP BY region HAVING COUNT(*) > 1',
      ], 1, '«city» is neither grouped nor aggregated: which city should represent the group? Postgres, Spark and Snowflake raise an error. SQLite and old MySQL silently pick one, which is a dangerous habit.'),
      tf('«WHERE» is evaluated before «GROUP BY», and «HAVING» after it.', true, 'That is why WHERE can\'t see aggregates and is cheaper: it shrinks the data before grouping.'),
      sql({ q: 'Average days from CRF creation to service request opening, per issue type. Return «issue_type» and the average in days rounded to 2 decimals.', tables: ['crf', 'service_requests'], solution: `SELECT c.issue_type, ROUND(AVG(julianday(s.opened_at) - julianday(c.created_at)), 2) AS avg_days FROM crf c JOIN service_requests s ON s.crf_id = c.crf_id GROUP BY c.issue_type;`, level: 2, hint: 'You will need a JOIN between crf and service_requests on crf_id.' }),
    ]),
    lesson('s4', 'Joins', 20, [
      viz('join', 'Play with every join type', 'Two tiny tables: A has keys 1, 2, 3, NULL and B has keys 2, 3, 3, 4, NULL. Switch join types and watch which rows survive.', { target: 'anti', task: 'Find the join that returns only the rows of A that have NO partner in B (the "orphans").' }),
      learn('Join cheat sheet', `
        | Join | Keeps | Typical use |
        |---|---|---|
        | «INNER JOIN» | matching pairs only | facts with their dimensions |
        | «LEFT JOIN» | all left rows + matches | "all CRFs, with SR if any" |
        | «FULL OUTER JOIN» | everything from both | reconciling two systems |
        | semi join («WHERE EXISTS») | left rows with a match, no duplicates | filtering by existence |
        | anti join («LEFT JOIN … WHERE r.key IS NULL» or «NOT EXISTS») | left rows with no match | orphans, missing records |
        | «CROSS JOIN» | every combination | calendars × entities |

        **Watch the grain.** If the right side has several matches per key, a join **multiplies rows**. Joining claims to credit notes and then summing claim_amount double-counts claims with two credit notes. This is the most common join bug in real pipelines.

        **Filter placement matters in LEFT JOINs:** a condition on the right table in «WHERE» turns the LEFT JOIN back into an INNER JOIN. Put it in «ON» if you want to keep unmatched rows.
      `),
      sql({ q: 'For every claim show «claim_id», the dealer\'s «dealer_name» and «region», and «claim_amount».', tables: ['claims', 'dealers'], solution: `SELECT c.claim_id, d.dealer_name, d.region, c.claim_amount FROM claims c JOIN dealers d ON d.dealer_id = c.dealer_id;` }),
      sql({ q: `Funnel leak: list **closed** service requests that never produced a PIR. Return «sr_id, closed_at». In a real pipeline this kind of anti join is a reconciliation test.`, tables: ['service_requests', 'pir'], solution: `SELECT s.sr_id, s.closed_at FROM service_requests s LEFT JOIN pir p ON p.sr_id = s.sr_id WHERE s.status = 'Closed' AND p.pir_id IS NULL;`, hint: 'LEFT JOIN, then keep rows where the right side is NULL (anti join).', level: 2 }),
      sql({ q: 'Approved or partially approved claims that have **no credit note yet**. Return «claim_id, status, approved_amount».', tables: ['claims', 'credit_notes'], solution: `SELECT c.claim_id, c.status, c.approved_amount FROM claims c WHERE c.status IN ('Approved','Partially Approved') AND NOT EXISTS (SELECT 1 FROM credit_notes n WHERE n.claim_id = c.claim_id);`, level: 2 }),
      sql({ q: 'Full flow: for every **claim**, return «claim_id», the original «issue_type» from its CRF, and the «customer_name». Path: claims → pir → service_requests → crf → customers.', tables: ['claims', 'pir', 'service_requests', 'crf', 'customers'], solution: `SELECT cl.claim_id, c.issue_type, cu.customer_name
FROM claims cl
JOIN pir p ON p.pir_id = cl.pir_id
JOIN service_requests s ON s.sr_id = p.sr_id
JOIN crf c ON c.crf_id = s.crf_id
JOIN customers cu ON cu.customer_id = c.customer_id;`, level: 2, hint: 'Four joins, each on the parent id.' }),
      mcq(`A LEFT JOIN from «crf» to «service_requests» followed by «WHERE s.priority = 'P1'». What happens to CRFs without a service request?`, ['They are kept with NULLs', 'They are removed, because NULL = \'P1\' is not true', 'They become duplicates', 'SQL raises an error'], 1, 'The WHERE runs after the join and rejects NULL priorities, so the LEFT JOIN behaves like an INNER JOIN. Move the condition into ON to keep them.'),
      mcq('«claims» has 97 rows. Each claim has 0 or 1 credit note. How many rows does «claims LEFT JOIN credit_notes» return?', ['Fewer than 97', 'Exactly 97', 'More than 97', 'Exactly 52'], 1, 'LEFT keeps every left row, and at most one match per row means no multiplication.'),
      bug('This query should total claim amounts per dealer, but the numbers are inflated. Which line is the bug?', `SELECT d.dealer_name,
       SUM(c.claim_amount) AS total
FROM dealers d
JOIN claims c ON c.dealer_id = d.dealer_id
JOIN quality_defects q ON q.engine_id = c.dealer_id
GROUP BY d.dealer_name;`, 5, 'The join to quality_defects is on the wrong key (engine_id = dealer_id) and adds many rows per claim (fan-out), so SUM double-counts. Never join a table you don\'t need before aggregating.', 'sql'),
      sql({ q: 'Self-join: list every employee with their manager\'s name. Return «name» and «manager_name». Employees without a manager should appear with NULL.', tables: ['employees'], solution: `SELECT e.name, m.name AS manager_name FROM employees e LEFT JOIN employees m ON m.emp_id = e.manager_id;` }),
    ]),
    lesson('s5', 'Subqueries, set operations and query order', 18, [
      viz('queryorder', 'How the database reads your query', 'You write SELECT first, but the engine evaluates FROM first. Knowing the logical order explains most "why can\'t I use this alias here?" errors.'),
      learn('Subqueries and set operators', `
        **Scalar subquery**: returns one value. «WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims)»

        **IN / EXISTS subquery**: «WHERE dealer_id IN (SELECT dealer_id FROM dealers WHERE region='West')»

        **Correlated subquery**: references the outer row, conceptually re-run per row:
        «««sql
        SELECT * FROM claims c
        WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims x WHERE x.dealer_id = c.dealer_id);
        »»»

        **Set operators** stack results vertically (same number and type of columns):
        - «UNION» removes duplicates (costs a sort/hash), «UNION ALL» keeps them (faster: use it unless you need dedup)
        - «INTERSECT»: rows in both · «EXCEPT»: rows in the first but not the second (great for reconciliation)
      `),
      sql({ q: 'Claims larger than the **overall average** claim amount. Return «claim_id, claim_amount».', tables: ['claims'], solution: `SELECT claim_id, claim_amount FROM claims WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims);` }),
      sql({ q: 'Claims larger than **their own dealer\'s** average claim amount (correlated subquery). Return «claim_id, dealer_id, claim_amount».', tables: ['claims'], solution: `SELECT claim_id, dealer_id, claim_amount FROM claims c WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims x WHERE x.dealer_id = c.dealer_id);`, level: 2 }),
      sql({ q: 'Reconciliation with EXCEPT: which «engine_id»s appear in «quality_defects» but **never** in any CRF?', tables: ['quality_defects', 'crf'], solution: `SELECT engine_id FROM quality_defects EXCEPT SELECT engine_id FROM crf;` }),
      mcq('Why does this fail in most databases?', ['ORDER BY can\'t use aliases', 'WHERE runs before SELECT, so the alias «total» doesn\'t exist yet', 'You can\'t multiply columns', 'Missing GROUP BY'], 1, 'Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. Repeat the expression in WHERE, or wrap it in a CTE/subquery.', { code: 'SELECT qty * unit_price AS total\nFROM purchase_orders\nWHERE total > 100000;', lang: 'sql' }),
      mcq('You need all rows from two monthly extracts that are already guaranteed distinct. Which is best?', ['UNION', 'UNION ALL', 'FULL JOIN', 'INTERSECT'], 1, 'UNION ALL skips the deduplication step, which can be very expensive on big data.'),
      order('Put the logical evaluation order in sequence.', ['FROM / JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY', 'LIMIT']),
    ]),
    lesson('s6', 'Dates, strings and casting', 15, [
      learn('Date and string toolkit (SQLite vs others)', `
        | Need | SQLite (this arcade) | Spark SQL / Snowflake / Postgres |
        |---|---|---|
        | month bucket | «strftime('%Y-%m', ts)» | «date_trunc('month', ts)» / «date_format(ts,'yyyy-MM')» |
        | date part | «date(ts)» | «CAST(ts AS DATE)» / «to_date(ts)» |
        | days between | «julianday(b) - julianday(a)» | «datediff(b, a)» |
        | add days | «date(ts, '+7 day')» | «date_add(ts, 7)» |
        | year | «strftime('%Y', ts)» | «year(ts)» |
        | concat | «a || ' - ' || b» | «concat(a,' - ',b)» / «||» |
        | substring | «substr(s, 1, 3)» | «substring(s,1,3)» |
        | trim / case | «trim(s), upper(s), lower(s)» | same |
        | cast | «CAST(x AS INTEGER)» | «CAST(x AS INT)» |

        Interviews rarely care about dialect. Say *"in Spark I'd use date_trunc"* and write what works.
      `),
      sql({ q: 'Late purchase orders: received **after** the expected date. Return «po_id», «supplier_id» and days late (integer). Ignore POs not yet received.', tables: ['purchase_orders'], solution: `SELECT po_id, supplier_id, CAST(julianday(received_date) - julianday(expected_date) AS INTEGER) AS days_late FROM purchase_orders WHERE received_date > expected_date;`, level: 2 }),
      sql({ q: 'Supplier on-time rate: for each supplier, the percentage of **received** POs that arrived on or before «expected_date», rounded to 1 decimal. Return «supplier_name, on_time_pct».', tables: ['purchase_orders', 'suppliers'], solution: `SELECT s.supplier_name, ROUND(100.0 * SUM(CASE WHEN p.received_date <= p.expected_date THEN 1 ELSE 0 END) / COUNT(*), 1) AS on_time_pct FROM purchase_orders p JOIN suppliers s ON s.supplier_id = p.supplier_id WHERE p.received_date IS NOT NULL GROUP BY s.supplier_name;`, level: 2, hint: 'Multiply by 100.0 (not 100) to avoid integer division.' }),
      mcq('In many SQL engines, «SELECT 7 / 2» returns…', ['3.5', '3', '4', 'Error'], 1, 'Integer division truncates. Use «7 * 1.0 / 2» or «CAST(7 AS DOUBLE) / 2». This is a classic source of rates that come out as 0.'),
      sql({ q: `Build a readable label for each engine: «serial_no || ' (' || model || ')'», e.g. «APX100037 (L9)». Return «engine_id, label» for plant 1 only.`, tables: ['engines'], solution: `SELECT engine_id, serial_no || ' (' || model || ')' AS label FROM engines WHERE plant_id = 1;` }),
    ]),
  ]);
