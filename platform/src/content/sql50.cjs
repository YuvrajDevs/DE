// "SQL in 50": SQL from zero to interview level. 25 concepts, each = a short explainer + 2 practice queries
// (the second one is there for a second try). All queries run on the same Cummins-style practice database.
const { sql, learn } = require('./_h.cjs');

// learn() applies the same formatting as lessons: dedent, and «x» -> `x`
const c = (id, title, md, questions) => ({ id, title, md: learn(title, md).md, questions });

module.exports = {
  id: 'sql50',
  title: 'SQL in 50',
  blurb: 'SQL from zero to interview level: 25 concepts, each with a short explainer and 2 practice queries. Jump to any step, in any order.',
  concepts: [
    // ---------------------------------------------------------------- basics
    c('select', 'SELECT: show columns from a table', `
      A database keeps data in **tables** (like sheets): rows and columns.
      «SELECT» picks the **columns** you want, «FROM» names the **table**.

      «««sql
      SELECT dealer_name, city    -- the columns you want, separated by commas
      FROM dealers;               -- the table
      »»»
      «SELECT *» means "every column". Handy to look at a table, but in real work you list the columns you need.
      Every query here ends with «;» (optional, but a good habit).
    `, [
      sql({ q: 'Show **every column** of the «dealers» table.', tables: ['dealers'], starter: 'SELECT \nFROM dealers;', solution: 'SELECT * FROM dealers;', hint: '«*» means all columns.' }),
      sql({ q: 'Show only «part_name» and «unit_cost» from the «parts» table.', tables: ['parts'], solution: 'SELECT part_name, unit_cost FROM parts;', hint: 'List the two columns after SELECT, separated by a comma.' }),
    ]),
    c('where', 'WHERE: keep only the rows you want', `
      «WHERE» filters **rows**. Only rows where the condition is true are returned.

      «««sql
      SELECT claim_id, claim_amount
      FROM claims
      WHERE claim_amount > 100000;     -- numbers: no quotes
      »»»
      | Operator | Means |
      |---|---|
      | «=» «<>» | equal, not equal |
      | «>» «>=» «<» «<=» | bigger / smaller |

      Text values go in **single quotes**: «WHERE status = 'Approved'».
    `, [
      sql({ q: 'Claims with «claim_amount» **above 100000**. Return «claim_id, claim_amount».', tables: ['claims'], solution: 'SELECT claim_id, claim_amount FROM claims WHERE claim_amount > 100000;' }),
      sql({ q: 'Customers in the **Mining** segment. Return «customer_id, customer_name».', tables: ['customers'], solution: `SELECT customer_id, customer_name FROM customers WHERE segment = 'Mining';`, hint: `Text needs quotes: segment = 'Mining'.` }),
    ]),
    c('and-or', 'AND, OR, IN, BETWEEN: combine conditions', `
      - «AND»: both must be true. «OR»: at least one is true.
      - «IN (...)»: shortcut for many ORs. «model IN ('X15','ISX')».
      - «BETWEEN a AND b»: inclusive range. «horsepower BETWEEN 400 AND 600».
      - «NOT» flips a condition: «status NOT IN ('Rejected')».

      Mixing AND with OR? Use brackets so the meaning is obvious:
      «WHERE (model = 'X15' OR model = 'ISX') AND horsepower > 500».
    `, [
      sql({ q: '**Approved** claims with «claim_amount» over **50000**. Return «claim_id, claim_amount».', tables: ['claims'], solution: `SELECT claim_id, claim_amount FROM claims WHERE status = 'Approved' AND claim_amount > 50000;` }),
      sql({ q: 'Engines of model **X15 or ISX** (use «IN») with horsepower **between 400 and 600**. Return «engine_id, model, horsepower».', tables: ['engines'], solution: `SELECT engine_id, model, horsepower FROM engines WHERE model IN ('X15','ISX') AND horsepower BETWEEN 400 AND 600;` }),
    ]),
    c('like', 'LIKE: search inside text', `
      «LIKE» matches text patterns:
      - «%» = any number of characters (even none)
      - «_» = exactly one character

      | Pattern | Matches |
      |---|---|
      | «'Fuel%'» | starts with Fuel |
      | «'%Filter'» | ends with Filter |
      | «'%Engine%'» | contains Engine anywhere |

      In SQLite, LIKE ignores upper/lower case for English letters.
    `, [
      sql({ q: 'Parts whose name **contains "Filter"**. Return «part_name».', tables: ['parts'], solution: `SELECT part_name FROM parts WHERE part_name LIKE '%Filter%';` }),
      sql({ q: 'Dealers whose name **starts with K**. Return «dealer_name, city».', tables: ['dealers'], solution: `SELECT dealer_name, city FROM dealers WHERE dealer_name LIKE 'K%';` }),
    ]),
    c('order-limit', 'ORDER BY and LIMIT: sort and take the top', `
      «ORDER BY column» sorts. «ASC» (default) is small to big, «DESC» is big to small.
      «LIMIT n» keeps only the first n rows **after** sorting.

      «««sql
      SELECT claim_id, claim_amount
      FROM claims
      ORDER BY claim_amount DESC   -- biggest first
      LIMIT 5;                     -- top 5
      »»»
      Without ORDER BY, rows come back in no guaranteed order.
    `, [
      sql({ q: 'The **5 biggest claims**. Return «claim_id, claim_amount», biggest first.', tables: ['claims'], solution: 'SELECT claim_id, claim_amount FROM claims ORDER BY claim_amount DESC LIMIT 5;', ordered: true }),
      sql({ q: 'The **3 most recently hired** employees. Return «name, hire_date», newest first.', tables: ['employees'], solution: 'SELECT name, hire_date FROM employees ORDER BY hire_date DESC LIMIT 3;', ordered: true }),
    ]),
    c('distinct', 'DISTINCT: remove repeated rows', `
      «SELECT DISTINCT» returns each different value (or combination of values) once.

      «««sql
      SELECT DISTINCT model FROM engines;            -- each model once
      SELECT DISTINCT segment, country FROM customers; -- each pair once
      »»»
      Useful to answer "which values exist?" and to spot messy data (e.g. "Pune" and "pune").
    `, [
      sql({ q: 'Which engine **models** exist? One row per model, sorted A to Z.', tables: ['engines'], solution: 'SELECT DISTINCT model FROM engines ORDER BY model;', ordered: true }),
      sql({ q: 'Which **countries** do suppliers come from? One row per country, sorted A to Z.', tables: ['suppliers'], solution: 'SELECT DISTINCT country FROM suppliers ORDER BY country;', ordered: true }),
    ]),
    // ---------------------------------------------------------------- cleaning
    c('nulls', 'NULL: missing values', `
      «NULL» means **unknown / missing**. It is not 0 and not an empty text.

      - «= NULL» never works. Use «IS NULL» / «IS NOT NULL».
      - «COALESCE(x, 0)» returns the first value that is not NULL: a way to fill gaps.

      «««sql
      SELECT sr_id FROM service_requests WHERE closed_at IS NULL;   -- still open
      SELECT claim_id, COALESCE(approved_amount, 0) AS approved FROM claims;
      »»»
      «AS approved» gives the result column a name (an **alias**).
    `, [
      sql({ q: 'Service requests that are **still open** (no «closed_at»). Return «sr_id, opened_at».', tables: ['service_requests'], solution: 'SELECT sr_id, opened_at FROM service_requests WHERE closed_at IS NULL;', hint: 'IS NULL, not = NULL.' }),
      sql({ q: 'Every claim with its approved amount, showing **0 when it is missing**. Return «claim_id» and a column named «approved».', tables: ['claims'], solution: 'SELECT claim_id, COALESCE(approved_amount, 0) AS approved FROM claims;' }),
    ]),
    c('case', 'CASE: if / else inside a query', `
      «CASE» creates a new column from rules, checked top to bottom. The first true rule wins.

      «««sql
      SELECT claim_id,
             CASE
               WHEN claim_amount >= 200000 THEN 'High'
               WHEN claim_amount >= 50000  THEN 'Medium'
               ELSE 'Low'
             END AS band
      FROM claims;
      »»»
      Always end with «END» and give the column a name with «AS».
    `, [
      sql({ q: 'Every claim with a **band**: «High» if amount ≥ 200000, «Medium» if ≥ 50000, otherwise «Low». Return «claim_id, band».', tables: ['claims'], solution: `SELECT claim_id, CASE WHEN claim_amount >= 200000 THEN 'High' WHEN claim_amount >= 50000 THEN 'Medium' ELSE 'Low' END AS band FROM claims;` }),
      sql({ q: 'Every employee with a column «level»: «Senior» if salary ≥ 3000000, otherwise «Junior». Return «name, level».', tables: ['employees'], solution: `SELECT name, CASE WHEN salary >= 3000000 THEN 'Senior' ELSE 'Junior' END AS level FROM employees;` }),
    ]),
    c('functions', 'Text and date functions', `
      Functions change values row by row:

      | Function (SQLite) | Example | Gives |
      |---|---|---|
      | «UPPER(x)», «LOWER(x)» | «UPPER('pune')» | PUNE |
      | «LENGTH(x)» | «LENGTH('Pune')» | 4 |
      | «ROUND(x, 2)» | «ROUND(3.14159, 2)» | 3.14 |
      | «DATE(ts)» | «DATE('2026-03-05 10:00')» | 2026-03-05 |
      | «strftime('%Y-%m', ts)» | year-month | 2026-03 |

      Other databases use different names for dates (e.g. «DATE_TRUNC», «FORMAT_DATE»), but the idea is the same.
    `, [
      sql({ q: 'Dealer names in **UPPER CASE**, with their city. Return a column «name» and «city».', tables: ['dealers'], solution: 'SELECT UPPER(dealer_name) AS name, city FROM dealers;' }),
      sql({ q: 'Claims submitted in **March 2026**. Return «claim_id, submitted_at». Use «strftime».', tables: ['claims'], solution: `SELECT claim_id, submitted_at FROM claims WHERE strftime('%Y-%m', submitted_at) = '2026-03';`, hint: `strftime('%Y-%m', submitted_at) = '2026-03'` }),
    ]),
    // ---------------------------------------------------------------- aggregation
    c('aggregates', 'COUNT, SUM, AVG, MIN, MAX: summarise', `
      Aggregate functions turn many rows into **one number**:

      «««sql
      SELECT COUNT(*)              AS claims,     -- number of rows
             SUM(claim_amount)     AS total,
             ROUND(AVG(claim_amount), 2) AS average,
             MIN(claim_amount), MAX(claim_amount)
      FROM claims;
      »»»
      «COUNT(*)» counts rows. «COUNT(column)» counts rows where that column is **not NULL**.
    `, [
      sql({ q: 'For all claims: the **number of claims**, the **total** amount and the **average** amount (rounded to 2 decimals). Columns «claims, total, average».', tables: ['claims'], solution: 'SELECT COUNT(*) AS claims, SUM(claim_amount) AS total, ROUND(AVG(claim_amount), 2) AS average FROM claims;' }),
      sql({ q: 'How many engines are there, and what is the **highest** horsepower? Columns «engines, max_hp».', tables: ['engines'], solution: 'SELECT COUNT(*) AS engines, MAX(horsepower) AS max_hp FROM engines;' }),
    ]),
    c('group-by', 'GROUP BY: one summary per group', `
      «GROUP BY» splits rows into groups and runs the aggregate **once per group**.

      «««sql
      SELECT status, COUNT(*) AS claims
      FROM claims
      GROUP BY status;        -- one row per status
      »»»
      Rule: every column in SELECT is either **in the GROUP BY** or **inside an aggregate** (COUNT, SUM...).
    `, [
      sql({ q: 'Number of claims **per status**. Return «status, claims».', tables: ['claims'], solution: 'SELECT status, COUNT(*) AS claims FROM claims GROUP BY status;' }),
      sql({ q: 'Total claim amount **per dealer**, rounded to 2 decimals. Return «dealer_id, total».', tables: ['claims'], solution: 'SELECT dealer_id, ROUND(SUM(claim_amount), 2) AS total FROM claims GROUP BY dealer_id;' }),
    ]),
    c('having', 'HAVING: filter groups', `
      «WHERE» filters **rows before** grouping. «HAVING» filters **groups after** grouping.

      «««sql
      SELECT dealer_id, COUNT(*) AS claims
      FROM claims
      GROUP BY dealer_id
      HAVING COUNT(*) > 10;      -- only dealers with more than 10 claims
      »»»
      Order of a query: «SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT».
    `, [
      sql({ q: 'Dealers with **more than 10 claims**. Return «dealer_id, claims».', tables: ['claims'], solution: 'SELECT dealer_id, COUNT(*) AS claims FROM claims GROUP BY dealer_id HAVING COUNT(*) > 10;' }),
      sql({ q: 'Engine models whose **average horsepower is above 450**. Return «model, avg_hp» (rounded to whole numbers).', tables: ['engines'], solution: 'SELECT model, ROUND(AVG(horsepower)) AS avg_hp FROM engines GROUP BY model HAVING AVG(horsepower) > 450;' }),
    ]),
    c('conditional-agg', 'COUNT(DISTINCT) and counting with conditions', `
      - «COUNT(DISTINCT customer_id)» counts **different** customers, not rows.
      - Put a CASE **inside** SUM to count only some rows. One query, many counts:

      «««sql
      SELECT dealer_id,
             COUNT(*) AS claims,
             SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved
      FROM claims
      GROUP BY dealer_id;
      »»»
      This "pivot with SUM(CASE…)" is asked in interviews all the time.
    `, [
      sql({ q: 'How many **different customers** have raised a CRF? One number, column «customers».', tables: ['crf'], solution: 'SELECT COUNT(DISTINCT customer_id) AS customers FROM crf;' }),
      sql({ q: 'Per dealer: total claims and how many are **Approved**. Return «dealer_id, claims, approved».', tables: ['claims'], solution: `SELECT dealer_id, COUNT(*) AS claims, SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved FROM claims GROUP BY dealer_id;` }),
    ]),
    // ---------------------------------------------------------------- joins
    c('inner-join', 'INNER JOIN: combine two tables', `
      Tables are linked by **keys**: «claims.dealer_id» points to «dealers.dealer_id».
      A JOIN puts matching rows side by side.

      «««sql
      SELECT c.claim_id, d.dealer_name, c.claim_amount
      FROM claims c                                  -- c is a short name (alias)
      JOIN dealers d ON d.dealer_id = c.dealer_id;    -- how rows match
      »»»
      «JOIN» = «INNER JOIN»: keeps only rows that **match on both sides**.
    `, [
      sql({ q: 'Every claim with its **dealer name**. Return «claim_id, dealer_name, claim_amount».', tables: ['claims', 'dealers'], solution: 'SELECT c.claim_id, d.dealer_name, c.claim_amount FROM claims c JOIN dealers d ON d.dealer_id = c.dealer_id;' }),
      sql({ q: 'Every engine with the **plant name** where it was built. Return «engine_id, model, plant_name».', tables: ['engines', 'plants'], solution: 'SELECT e.engine_id, e.model, p.plant_name FROM engines e JOIN plants p ON p.plant_id = e.plant_id;' }),
    ]),
    c('left-join', 'LEFT JOIN: keep everything from the left, find what is missing', `
      «LEFT JOIN» keeps **every row of the left table**. Where there is no match, the right side is NULL.

      «««sql
      SELECT d.dealer_name, COUNT(c.claim_id) AS claims   -- COUNT(column) skips NULLs, so no match = 0
      FROM dealers d
      LEFT JOIN claims c ON c.dealer_id = d.dealer_id
      GROUP BY d.dealer_name;
      »»»
      **Find missing rows** (an "anti-join"): LEFT JOIN, then keep rows where the right side is NULL:
      «… LEFT JOIN claims c ON … WHERE c.claim_id IS NULL».
    `, [
      sql({ q: 'Every dealer with its **number of claims, including dealers with 0**. Return «dealer_name, claims».', tables: ['dealers', 'claims'], solution: 'SELECT d.dealer_name, COUNT(c.claim_id) AS claims FROM dealers d LEFT JOIN claims c ON c.dealer_id = d.dealer_id GROUP BY d.dealer_name;', hint: 'COUNT(c.claim_id), not COUNT(*), so dealers with no claims get 0.' }),
      sql({ q: 'Dealers that have **no claims at all**. Return «dealer_id, dealer_name». Use LEFT JOIN.', tables: ['dealers', 'claims'], solution: 'SELECT d.dealer_id, d.dealer_name FROM dealers d LEFT JOIN claims c ON c.dealer_id = d.dealer_id WHERE c.claim_id IS NULL;' }),
    ]),
    c('multi-join', 'Joining three or more tables', `
      Chain joins, one link at a time:

      «««sql
      SELECT f.crf_id, cu.customer_name, d.dealer_name
      FROM crf f
      JOIN customers cu ON cu.customer_id = f.customer_id
      JOIN dealers   d  ON d.dealer_id   = f.dealer_id;
      »»»
      Watch the row count: if a key isn't unique on the joined side, rows **multiply** (a classic silent bug).
    `, [
      sql({ q: 'CRFs with issue type **Fuel Leak**, with the customer name and dealer name. Return «crf_id, customer_name, dealer_name».', tables: ['crf', 'customers', 'dealers'], solution: `SELECT f.crf_id, cu.customer_name, d.dealer_name FROM crf f JOIN customers cu ON cu.customer_id = f.customer_id JOIN dealers d ON d.dealer_id = f.dealer_id WHERE f.issue_type = 'Fuel Leak';` }),
      sql({ q: 'Purchase-order spend (**qty × unit_price**) per **supplier name** and **part category**, rounded to 2 decimals. Return «supplier_name, category, spend».', tables: ['purchase_orders', 'suppliers', 'parts'], solution: 'SELECT s.supplier_name, p.category, ROUND(SUM(po.qty * po.unit_price), 2) AS spend FROM purchase_orders po JOIN suppliers s ON s.supplier_id = po.supplier_id JOIN parts p ON p.part_id = po.part_id GROUP BY s.supplier_name, p.category;' }),
    ]),
    c('self-join', 'Self join: a table joined to itself', `
      Sometimes rows point to **other rows in the same table**: «employees.manager_id» is another employee's «emp_id».
      Join the table to itself with two aliases:

      «««sql
      SELECT e.name AS employee, m.name AS manager
      FROM employees e
      LEFT JOIN employees m ON m.emp_id = e.manager_id;   -- LEFT keeps the boss (no manager)
      »»»
    `, [
      sql({ q: 'Every employee with their **manager\'s name** (NULL for the top boss). Return «employee, manager».', tables: ['employees'], solution: 'SELECT e.name AS employee, m.name AS manager FROM employees e LEFT JOIN employees m ON m.emp_id = e.manager_id;' }),
      sql({ q: 'Employees who **earn more than their manager**. Return «employee, salary, manager_salary».', tables: ['employees'], solution: 'SELECT e.name AS employee, e.salary, m.salary AS manager_salary FROM employees e JOIN employees m ON m.emp_id = e.manager_id WHERE e.salary > m.salary;' }),
    ]),
    // ---------------------------------------------------------------- subqueries and CTEs
    c('subquery', 'Subqueries: a query inside a query', `
      A query in brackets can be used like a value or a list:

      «««sql
      -- compare to a single number
      SELECT claim_id, claim_amount FROM claims
      WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims);

      -- check membership in a list
      SELECT customer_name FROM customers
      WHERE customer_id IN (SELECT customer_id FROM engines WHERE model = 'X15');
      »»»
    `, [
      sql({ q: 'Claims **above the average** claim amount. Return «claim_id, claim_amount».', tables: ['claims'], solution: 'SELECT claim_id, claim_amount FROM claims WHERE claim_amount > (SELECT AVG(claim_amount) FROM claims);' }),
      sql({ q: 'Customers who own **at least one X15 engine** (use «IN» with a subquery). Return «customer_name».', tables: ['customers', 'engines'], solution: `SELECT customer_name FROM customers WHERE customer_id IN (SELECT customer_id FROM engines WHERE model = 'X15');` }),
    ]),
    c('exists', 'EXISTS and NOT EXISTS', `
      «EXISTS (subquery)» is true if the subquery returns **at least one row**. The subquery can use the outer row:

      «««sql
      SELECT s.supplier_name
      FROM suppliers s
      WHERE EXISTS (SELECT 1 FROM purchase_orders po
                    WHERE po.supplier_id = s.supplier_id    -- linked to the outer row
                      AND po.received_date IS NULL);
      »»»
      «NOT EXISTS» is the cleanest way to find "things with no matching row", and it is safe with NULLs (unlike «NOT IN»).
    `, [
      sql({ q: 'Suppliers with **at least one purchase order not yet received** («received_date» is NULL). Return «supplier_name».', tables: ['suppliers', 'purchase_orders'], solution: 'SELECT s.supplier_name FROM suppliers s WHERE EXISTS (SELECT 1 FROM purchase_orders po WHERE po.supplier_id = s.supplier_id AND po.received_date IS NULL);' }),
      sql({ q: 'Dealers with **no claims**, this time using «NOT EXISTS». Return «dealer_name».', tables: ['dealers', 'claims'], solution: 'SELECT d.dealer_name FROM dealers d WHERE NOT EXISTS (SELECT 1 FROM claims c WHERE c.dealer_id = d.dealer_id);' }),
    ]),
    c('cte', 'CTEs (WITH): build a query in steps', `
      «WITH name AS (query)» gives a query a name, so you can use it like a table below. Long queries become readable steps.

      «««sql
      WITH dealer_totals AS (
        SELECT dealer_id, SUM(claim_amount) AS total
        FROM claims GROUP BY dealer_id
      )
      SELECT dealer_id, total
      FROM dealer_totals
      WHERE total > (SELECT AVG(total) FROM dealer_totals);
      »»»
      You can chain several: «WITH a AS (…), b AS (… FROM a …) SELECT … FROM b».
    `, [
      sql({ q: 'Dealers whose **total claim amount is above the average dealer total**. Use a CTE. Return «dealer_id, total» (total rounded to 2 decimals).', tables: ['claims'], solution: 'WITH dealer_totals AS (SELECT dealer_id, SUM(claim_amount) AS total FROM claims GROUP BY dealer_id) SELECT dealer_id, ROUND(total, 2) AS total FROM dealer_totals WHERE total > (SELECT AVG(total) FROM dealer_totals);' }),
      sql({ q: 'Per supplier, the **on-time rate** of **received** purchase orders: the share where «received_date <= expected_date», as a percentage rounded to 1 decimal. Use a CTE for the received orders. Return «supplier_id, on_time_pct».', tables: ['purchase_orders'], solution: 'WITH received AS (SELECT supplier_id, CASE WHEN received_date <= expected_date THEN 1 ELSE 0 END AS on_time FROM purchase_orders WHERE received_date IS NOT NULL) SELECT supplier_id, ROUND(100.0 * SUM(on_time) / COUNT(*), 1) AS on_time_pct FROM received GROUP BY supplier_id;', hint: 'Multiply by 100.0 (not 100) so the division is not whole-number division.' }),
    ]),
    // ---------------------------------------------------------------- window functions
    c('row-number', 'ROW_NUMBER: number rows inside each group (dedupe, latest row)', `
      **Window functions** compute a value for each row while looking at other rows, **without collapsing** them like GROUP BY.

      «««sql
      SELECT order_id, status, updated_at,
             ROW_NUMBER() OVER (PARTITION BY order_id      -- restart numbering for each order
                                ORDER BY updated_at DESC)   -- newest gets 1
               AS rn
      FROM raw_orders_feed;
      »»»
      Keep «rn = 1» (in an outer query or CTE) to get **the latest row per key**: the standard way to remove duplicates.
    `, [
      sql({ q: '«raw_orders_feed» has several events per order. Keep only the **latest event per order** (newest «updated_at»). Return «order_id, status, amount».', tables: ['raw_orders_feed'], solution: 'WITH ranked AS (SELECT order_id, status, amount, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM raw_orders_feed) SELECT order_id, status, amount FROM ranked WHERE rn = 1;', hint: 'ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC), then keep rn = 1.' }),
      sql({ q: 'The **first sensor reading** of each engine (earliest «ts»). Return «engine_id, ts, temperature_c».', tables: ['sensor_readings'], solution: 'WITH r AS (SELECT engine_id, ts, temperature_c, ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY ts) AS rn FROM sensor_readings) SELECT engine_id, ts, temperature_c FROM r WHERE rn = 1;' }),
    ]),
    c('rank', 'RANK and DENSE_RANK: top N per group', `
      | Function | Ties get | Next number |
      |---|---|---|
      | «ROW_NUMBER()» | different numbers | 1, 2, 3 |
      | «RANK()» | the same number | 1, 1, 3 (skips) |
      | «DENSE_RANK()» | the same number | 1, 1, 2 (no gap) |

      **Top N per group** = rank inside each group, then keep rank ≤ N:
      «««sql
      WITH r AS (SELECT dealer_id, claim_id, claim_amount,
                        RANK() OVER (PARTITION BY dealer_id ORDER BY claim_amount DESC) AS rnk
                 FROM claims)
      SELECT * FROM r WHERE rnk <= 2;
      »»»
    `, [
      sql({ q: 'The **2 biggest claims of each dealer**. Return «dealer_id, claim_id, claim_amount».', tables: ['claims'], solution: 'WITH r AS (SELECT dealer_id, claim_id, claim_amount, RANK() OVER (PARTITION BY dealer_id ORDER BY claim_amount DESC) AS rnk FROM claims) SELECT dealer_id, claim_id, claim_amount FROM r WHERE rnk <= 2;' }),
      sql({ q: 'Rank employees by salary **within each plant** (highest = 1, ties share a rank, no gaps). Return «name, plant_id, salary, salary_rank».', tables: ['employees'], solution: 'SELECT name, plant_id, salary, DENSE_RANK() OVER (PARTITION BY plant_id ORDER BY salary DESC) AS salary_rank FROM employees;' }),
    ]),
    c('lag-lead', 'LAG and LEAD: compare with the previous or next row', `
      «LAG(x)» reads x from the **previous** row, «LEAD(x)» from the **next** row, in the window's order.

      «««sql
      WITH monthly AS (
        SELECT strftime('%Y-%m', submitted_at) AS month, SUM(claim_amount) AS total
        FROM claims GROUP BY month
      )
      SELECT month, total,
             LAG(total) OVER (ORDER BY month)          AS prev_total,
             total - LAG(total) OVER (ORDER BY month)  AS change
      FROM monthly;
      »»»
      Month-over-month change, "time since the previous event", "did it go up?": all LAG.
    `, [
      sql({ q: 'Monthly claim totals with the **previous month\'s total** next to them. Return «month, total, prev_total» (totals rounded to 2 decimals), oldest month first.', tables: ['claims'], solution: `WITH monthly AS (SELECT strftime('%Y-%m', submitted_at) AS month, ROUND(SUM(claim_amount), 2) AS total FROM claims GROUP BY month) SELECT month, total, LAG(total) OVER (ORDER BY month) AS prev_total FROM monthly ORDER BY month;`, ordered: true }),
      sql({ q: 'For **engine 1**, each sensor reading with the **change in temperature** since its previous reading. Return «ts, temperature_c, temp_change» (change rounded to 2 decimals), in time order.', tables: ['sensor_readings'], solution: 'SELECT ts, temperature_c, ROUND(temperature_c - LAG(temperature_c) OVER (ORDER BY ts), 2) AS temp_change FROM sensor_readings WHERE engine_id = 1 ORDER BY ts;', ordered: true }),
    ]),
    c('running', 'Running totals and moving averages', `
      Add «ORDER BY» inside «OVER» to an aggregate and it becomes **cumulative**:
      «SUM(total) OVER (ORDER BY month)» = running total.

      A **frame** limits which rows count:
      «««sql
      AVG(temperature_c) OVER (ORDER BY ts
                               ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)  -- last 3 readings
      »»»
      Running totals and moving averages are common in reporting and in interview questions.
    `, [
      sql({ q: 'Monthly claim totals with a **running (cumulative) total**. Return «month, total, running_total» (both rounded to 2 decimals), oldest month first.', tables: ['claims'], solution: `WITH monthly AS (SELECT strftime('%Y-%m', submitted_at) AS month, SUM(claim_amount) AS total FROM claims GROUP BY month) SELECT month, ROUND(total, 2) AS total, ROUND(SUM(total) OVER (ORDER BY month), 2) AS running_total FROM monthly ORDER BY month;`, ordered: true }),
      sql({ q: 'For **engine 1**, the **moving average temperature over the last 3 readings** (current + 2 before). Return «ts, temperature_c, moving_avg» (rounded to 2 decimals), in time order.', tables: ['sensor_readings'], solution: 'SELECT ts, temperature_c, ROUND(AVG(temperature_c) OVER (ORDER BY ts ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg FROM sensor_readings WHERE engine_id = 1 ORDER BY ts;', ordered: true }),
    ]),
    // ---------------------------------------------------------------- set operations and data checks
    c('sets', 'UNION, EXCEPT and reconciling data', `
      Stack or compare two query results with the **same columns**:

      | Operator | Gives |
      |---|---|
      | «UNION» | rows from both, duplicates removed |
      | «UNION ALL» | rows from both, duplicates kept (faster) |
      | «EXCEPT» | rows in the first but **not** in the second |
      | «INTERSECT» | rows in both |

      Data engineers use «EXCEPT» to **reconcile**: "which rows in the source are missing or different in the target?"
    `, [
      sql({ q: 'One list of **every city** we operate in: dealer cities and plant cities together, each city once, A to Z. Return «city».', tables: ['dealers', 'plants'], solution: 'SELECT city FROM dealers UNION SELECT city FROM plants ORDER BY city;', ordered: true }),
      sql({ q: 'Reconcile: take the **latest status of each order** from «raw_orders_feed» and return the orders whose «order_id, status» are **not** in «orders_current» (missing there, or a different status). Return «order_id, status».', tables: ['raw_orders_feed', 'orders_current'], solution: 'WITH latest AS (SELECT order_id, status, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM raw_orders_feed) SELECT order_id, status FROM latest WHERE rn = 1 EXCEPT SELECT order_id, status FROM orders_current;', hint: 'Latest row per order with ROW_NUMBER, then EXCEPT the target table.' }),
    ]),
  ],
};
