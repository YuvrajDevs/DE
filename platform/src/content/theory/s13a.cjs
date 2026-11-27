const { T, mcq, tf, multi, scenario, talk, sql, py, order, match, bug } = require('./_t.cjs');

module.exports = {
  // ================================================================== Logical order
  sqlorder: T(`
    > **In one line:** SQL is **declarative**: you describe the result, the engine picks the steps. There are two orders to know: the **logical order** (what each clause can *see*, which decides what is legal and what the result means) and the **physical plan** (what the optimiser actually runs, which decides speed). Confusing the two causes most "why is this wrong / slow" questions.

    ## The logical processing order
    | Step | Clause | What exists at this point |
    |---|---|---|
    | 1 | «FROM» + «JOIN … ON» | Rows from every source, combined. «ON» is evaluated *during* the join |
    | 2 | «WHERE» | Filters single rows. **No aggregates, no window functions, no SELECT aliases** (in standard SQL) |
    | 3 | «GROUP BY» | Rows collapse into groups. After this only group keys and aggregates are legal |
    | 4 | «HAVING» | Filters groups. Can use aggregates |
    | 5 | Window functions | Computed over the rows that survived 1-4 |
    | 6 | «SELECT» | Expressions and aliases are created |
    | 7 | «DISTINCT» | Duplicates of the selected columns removed |
    | 8 | «ORDER BY» | Can use SELECT aliases (and, in most engines, columns not selected unless DISTINCT is used) |
    | 9 | «LIMIT / OFFSET / FETCH» | Rows cut |

    ### What this order explains
    - **Why you cannot filter on a window function in WHERE.** Windows run at step 5, after WHERE. Wrap in a subquery/CTE, or use «QUALIFY» (Snowflake, Databricks, BigQuery, DuckDB).
    - **Why «WHERE COUNT(*) > 1» is an error** and HAVING exists.
    - **Why an alias works in ORDER BY but not in WHERE.** (MySQL, SQLite and Databricks are lenient about aliases in GROUP BY/HAVING; Postgres allows them in GROUP BY; SQL Server allows them in neither. Do not rely on leniency in interviews.)
    - **Why «SELECT DISTINCT a ORDER BY b» fails** in Postgres: after DISTINCT, b is no longer one value per row.
    - **Why window results ignore rows removed by WHERE but see rows removed by HAVING? They do not.** HAVING runs before windows, so windows only see surviving groups. «SUM(SUM(x)) OVER ()» (a window over an aggregate) is legal for that reason: "percent of total across groups".
    - **Why LIMIT without ORDER BY is non-deterministic.** Without an order, "the first 10" is whatever the physical plan produced; it changes between runs, partitions and engine versions. A classic flaky-test cause.

    ## ON vs WHERE in outer joins (the most tested consequence)
    For an **inner join**, a condition in ON and in WHERE give the same result. For a **LEFT join** they do not:
    «««sql
    -- keeps every dealer; claims are matched only if Approved (others become NULL)
    SELECT d.dealer_id, c.claim_id
    FROM dealers d LEFT JOIN claims c ON c.dealer_id = d.dealer_id AND c.status = 'Approved';

    -- silently becomes an INNER join: dealers with no approved claim disappear
    SELECT d.dealer_id, c.claim_id
    FROM dealers d LEFT JOIN claims c ON c.dealer_id = d.dealer_id
    WHERE c.status = 'Approved';
    »»»
    Rule: **conditions on the right-hand (optional) table belong in ON** if you want to keep unmatched left rows. A WHERE on a right-table column (other than «IS NULL») turns the LEFT join into an inner join. Optimisers literally rewrite it to an inner join.

    ## Physical execution: what actually runs
    The optimiser is free to reorder anything that does not change the result:
    - **Predicate pushdown:** a WHERE on a base table is applied *before* the join, or pushed into the storage scan (Parquet row-group skipping, partition pruning).
    - **Projection pushdown / column pruning:** only referenced columns are read. In columnar formats this is a huge I/O saving, which is why «SELECT *» on a wide Parquet table is expensive.
    - **Join reordering:** with N tables there are many join orders; cost-based optimisers use table statistics (row counts, distinct values, histograms) to pick one. Stale statistics produce bad plans.
    - **Partial (pre-)aggregation:** a GROUP BY can be split into a local aggregate before the shuffle and a final aggregate after. This is why «COUNT/SUM» scale well and exact «COUNT(DISTINCT)» does not.
    - **Subquery decorrelation:** correlated subqueries are rewritten to joins when possible.
    - **Constant folding, predicate simplification, dead-column elimination.**

    The guarantee: the physical plan returns what the logical order defines. The exception is **non-deterministic functions** («rand()», «now()», «uuid()», «row_number()» over non-unique orders): the engine may evaluate them a different number of times or in a different order, so "the same query" can return different rows.

    ## Edge cases interviewers like
    - «SELECT a, COUNT(*) FROM t» without GROUP BY: an error in strict engines; SQLite and old MySQL return an arbitrary «a». Know that this is a bug, not a feature.
    - «GROUP BY 1, 2» (positional) is legal in most engines but breaks when columns are reordered; fine for ad-hoc, avoid in production models.
    - **ORDER BY in a subquery or view is not guaranteed** to survive to the outer query. Only the outermost ORDER BY counts.
    - «UNION» removes duplicates (a sort or hash over the whole result); «UNION ALL» does not. Using UNION by default is a common silent performance bug and occasionally a correctness bug (it removes legitimate duplicate rows).
    - Short-circuiting: SQL does not promise left-to-right evaluation of «AND»/«OR». «WHERE x <> 0 AND 10 / x > 1» can still divide by zero in some engines. Use «CASE» (which is ordered) or «NULLIF(x, 0)».

    ## How interviewers test this
    - "Write the clauses in execution order." Then: "So why can I use an alias in ORDER BY but not WHERE?"
    - "Why does this LEFT JOIN return fewer rows than the left table?" (WHERE on the right table.)
    - "How would you get the top claim per dealer without a subquery?" (QUALIFY, where supported.)
  `, {
    check: [
      order('Put the logical processing order right.', ['FROM / JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'Window functions', 'SELECT', 'DISTINCT', 'ORDER BY', 'LIMIT'], 'Every "why is this illegal" question about SQL is answered by this order.'),
      mcq('«SELECT d.*, c.claim_id FROM dealers d LEFT JOIN claims c ON c.dealer_id = d.dealer_id WHERE c.status = \'Approved\'» returns fewer dealers than exist. Why?', ['LEFT JOIN is broken in this engine', 'The WHERE on a right-table column removes the NULL-extended rows, turning it into an inner join', 'Dealers have NULL ids', 'The optimiser reordered the join'], 1, 'Move the status condition into ON to keep every dealer.'),
      tf('An ORDER BY inside a view or subquery guarantees the order of the outer query result.', false, 'Only the outermost ORDER BY is guaranteed.'),
      mcq('You need rows where a window function equals 1, in Postgres (no QUALIFY). Correct approach?', ['WHERE row_number() OVER (...) = 1', 'HAVING row_number() OVER (...) = 1', 'Compute it in a subquery/CTE, filter in the outer query', 'It is impossible'], 2, 'Windows run after WHERE and HAVING, so filter one level up.'),
      multi('Which are legitimate optimiser rewrites that do not change the result?', ['Pushing a WHERE on a base table below a join', 'Reading only referenced columns', 'Turning a LEFT JOIN with WHERE right.col = 5 into an INNER JOIN', 'Dropping an ORDER BY in a subquery', 'Removing a DISTINCT that changes the row count'], [0, 1, 2, 3], 'All except the last preserve semantics. The LEFT→INNER rewrite is legal precisely because the WHERE already discards NULL-extended rows.'),
    ],
    interview: [
      talk('Walk me through what happens, step by step, when this query runs on a warehouse: «SELECT region, SUM(approved_amount) FROM claims JOIN dealers USING (dealer_id) WHERE submitted_at >= \'2026-01-01\' GROUP BY region HAVING SUM(approved_amount) > 1e6 ORDER BY 2 DESC LIMIT 5».', `
        - **Parse and bind:** names resolved against the catalog, types checked.
        - **Logical plan:** scan claims, scan dealers, join, filter, aggregate, filter groups, sort, limit.
        - **Optimise:** push «submitted_at >= …» into the claims scan (partition pruning if partitioned by date, min/max skipping otherwise); read only «dealer_id, submitted_at, approved_amount» from claims and «dealer_id, region» from dealers; dealers is tiny so broadcast it (no shuffle of claims); partial aggregation by region on each worker, then a small final aggregation; HAVING on the final result; a **top-N sort** (keep only the best 5 per worker, then merge) instead of a full sort.
        - **Execute** in parallel tasks; return 5 rows.
        - Mention what could go wrong: NULL dealer_ids silently dropped by the inner join, stale stats making it pick a shuffle join, and «ORDER BY 2» breaking if the select list changes.`),
    ],
    hands: [
      sql({ q: 'Keep **every dealer** and count only their **Approved** claims (0 if none). Return «dealer_id, dealer_name, approved_claims» sorted by «dealer_id». The trap: where you put the status condition.', tables: ['dealers', 'claims'], level: 2,
        solution: `SELECT d.dealer_id, d.dealer_name, COUNT(c.claim_id) AS approved_claims
FROM dealers d
LEFT JOIN claims c ON c.dealer_id = d.dealer_id AND c.status = 'Approved'
GROUP BY d.dealer_id, d.dealer_name
ORDER BY d.dealer_id`, hint: 'Status goes in ON. COUNT(c.claim_id), not COUNT(*), so unmatched dealers count 0.' }),
    ],
  }),

  // ================================================================== NULL
  nulls: T(`
    > **In one line:** NULL means **unknown or missing**, not zero and not empty. Any comparison with NULL yields **UNKNOWN**, and WHERE/ON/HAVING keep only TRUE. That one rule produces the most common silent bugs in SQL: rows vanishing from filters, joins and NOT IN.

    ## Three-valued logic
    | A | B | A AND B | A OR B | NOT A |
    |---|---|---|---|---|
    | TRUE | UNKNOWN | UNKNOWN | TRUE | FALSE |
    | FALSE | UNKNOWN | FALSE | UNKNOWN | TRUE |
    | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

    - «NULL = NULL» is UNKNOWN. «NULL <> 5» is UNKNOWN. Use «IS NULL», «IS NOT NULL», or the null-safe comparison «IS [NOT] DISTINCT FROM» (Postgres, Databricks, Snowflake, DuckDB, SQLite has «IS» / «IS NOT»; Spark also has «<=>»; MySQL «<=>»).
    - **WHERE keeps only TRUE.** «WHERE status <> 'Rejected'» drops rows where status is NULL. If NULL means "not yet decided", you just dropped them. Write «WHERE status IS DISTINCT FROM 'Rejected'» or «COALESCE».
    - **CHECK constraints keep rows unless FALSE.** A CHECK «(amount > 0)» accepts NULL. Asymmetric with WHERE, and a frequent interview gotcha.

    ## The NOT IN trap
    «««sql
    SELECT * FROM toy_a WHERE id NOT IN (SELECT id FROM toy_b);   -- toy_b.id contains a NULL
    »»»
    returns **zero rows**. «x NOT IN (2, 3, NULL)» means «x <> 2 AND x <> 3 AND x <> NULL»; the last term is UNKNOWN, so the whole thing is never TRUE. Fix: «NOT EXISTS» (NULL-safe by construction) or «LEFT JOIN … WHERE b.id IS NULL», or filter NULLs inside the subquery. «IN» with a NULL in the list is harmless for matches; it is only the negation that breaks.

    ## NULL in aggregates
    | Expression | NULL behaviour |
    |---|---|
    | «COUNT(*)» | Counts rows, NULLs included |
    | «COUNT(col)» | Counts non-NULL values |
    | «COUNT(DISTINCT col)» | Distinct non-NULL values |
    | «SUM, AVG, MIN, MAX» | Ignore NULLs. «SUM» of all-NULL (or zero rows) is **NULL**, not 0 |
    | «AVG(col)» | Sum of non-NULL / count of non-NULL. Not the same as «SUM(col)/COUNT(*)» |

    Consequences:
    - «AVG(approved_amount)» over claims where pending claims have NULL approved_amount is the average of *decided* claims. If the business wants "pending counts as 0", write «AVG(COALESCE(approved_amount, 0))». Which one is right is a **business decision**; say so in interviews.
    - A dashboard total of «SUM(x)» shows blank instead of 0 for an empty filter: wrap in «COALESCE(SUM(x), 0)».
    - «COUNT(col) < COUNT(*)» is a quick completeness check.

    ## NULL in GROUP BY, DISTINCT, ORDER BY, UNION, joins
    - **GROUP BY and DISTINCT treat NULLs as equal**: all NULLs form one group. (Inconsistent with «=», but standard.)
    - **UNION / INTERSECT / EXCEPT** also treat NULLs as equal when de-duplicating.
    - **Joins do not match NULL keys.** «ON a.id = b.id» never matches NULL to NULL. Rows with a NULL key disappear from inner joins and are unmatched in outer joins. In a Spark pipeline, **NULL join keys also skew**: all NULLs hash to one partition in a sort-merge join (filter or salt them).
    - **ORDER BY:** NULLs sort first in some engines (SQL Server, MySQL, SQLite ascending), last in others (Postgres, Oracle ascending). Use «NULLS FIRST / NULLS LAST» when it matters.
    - **UNIQUE constraints** allow multiple NULLs in most engines (Postgres, SQLite, Oracle multi-column), but SQL Server allows only one. Postgres 15 added «NULLS NOT DISTINCT».
    - **Window functions:** «LAG» returns NULL at the partition start, «LAST_VALUE» does not skip NULLs unless «IGNORE NULLS» is supported and used.

    ## Functions
    - «COALESCE(a, b, c)»: first non-NULL. Standard, n-ary. «IFNULL / NVL / ISNULL» are two-argument dialect versions.
    - «NULLIF(a, b)»: NULL if a = b, else a. The standard guard for division by zero: «x / NULLIF(y, 0)».
    - Arithmetic and string concatenation with NULL give NULL («'A' || NULL» is NULL in Postgres/SQLite; «CONCAT» in many engines skips NULLs; «CONCAT_WS» skips them).
    - **Boolean columns:** «WHERE NOT is_active» drops NULLs too.

    ## Design guidance
    - Decide what NULL **means** per column and document it in the contract: unknown, not applicable, not yet happened. Do not use one NULL for all three.
    - In dimensions, replace NULL foreign keys with an **"Unknown" member** (surrogate key -1) so facts never drop out of inner joins.
    - Sentinel values («'1900-01-01'», «-999») are worse than NULL: they pass filters and corrupt averages.

    ## How interviewers test this
    - "What does «SELECT COUNT(*), COUNT(x), AVG(x) FROM t» return when x has NULLs?"
    - "This NOT IN query returns nothing. Why?" Then: "Rewrite it."
    - "Two tables both have NULL in the join key. How many rows does the inner join produce for them?" Zero.
  `, {
    check: [
      mcq('«toy_b.id» contains a NULL. What does «SELECT * FROM toy_a WHERE id NOT IN (SELECT id FROM toy_b)» return?', ['Rows of toy_a not in toy_b', 'Zero rows', 'An error', 'All rows of toy_a'], 1, 'x <> NULL is UNKNOWN, so NOT IN is never TRUE. Use NOT EXISTS.'),
      mcq('A column has values 10, 20, NULL, NULL. What is AVG(col)?', ['7.5', '15', 'NULL', '30'], 1, 'AVG ignores NULLs: (10+20)/2.'),
      tf('A CHECK (amount > 0) constraint rejects rows where amount is NULL.', false, 'CHECK passes unless the condition is FALSE; UNKNOWN passes.'),
      mcq('Both tables have two rows with a NULL join key. How many rows do those produce in an INNER JOIN on the key?', ['4', '2', '1', '0'], 3, 'NULL = NULL is UNKNOWN; NULL keys never match.'),
      multi('Which treat NULLs as equal to each other?', ['GROUP BY', 'DISTINCT', 'UNION', 'a = b in a JOIN', 'a IS NOT DISTINCT FROM b'], [0, 1, 2, 4], 'Grouping and set operations group NULLs together; plain equality never matches them.'),
      mcq('SUM over zero matching rows returns…', ['0', 'NULL', 'An error', 'Empty string'], 1, 'Wrap with COALESCE(SUM(x), 0) for reports.'),
    ],
    scenarios: [
      scenario('The disappearing pending claims', `
        A finance dashboard shows "open claim value" as «SUM(claim_amount) WHERE status <> 'Approved' AND status <> 'Rejected'». Finance says it is 30% lower than their spreadsheet. Newly submitted claims arrive with «status = NULL» until the dealer portal assigns one.`, [
        ['Cause?', [
          ['NULL <> \'Approved\' is UNKNOWN, so claims with NULL status are filtered out', true, 'WHERE keeps only TRUE.'],
          ['SUM ignores NULL amounts', false, 'Amounts are filled; status is the NULL.'],
          ['The dashboard caches old data', false, 'The logic is the bug.'],
        ]],
        ['Best fix?', [
          ['Write the filter null-safely (status IS NULL OR status NOT IN (…)), and add a contract test that status is never NULL in silver, mapping NULL to an explicit «Pending» at ingestion', true, 'Fix the query, then fix the data meaning at the source of the layer.'],
          ['COALESCE(claim_amount, 0)', false, 'Wrong column.'],
          ['Tell finance their spreadsheet is wrong', false, 'It is right.'],
        ]],
      ], 'Every NOT / <> / NOT IN on a nullable column is a potential silent row drop.'),
    ],
    interview: [
      talk('Explain three different ways NULLs can silently change the result of a query, and how you protect a pipeline against them.', `
        - **Filters:** «<>», «NOT IN», «NOT col» drop NULL rows because WHERE keeps only TRUE. Use IS DISTINCT FROM / NOT EXISTS / explicit IS NULL branches.
        - **Joins:** NULL keys never match; facts with NULL foreign keys vanish from inner joins. Use an Unknown dimension member and test for orphan/NULL keys.
        - **Aggregates:** AVG ignores NULLs (changes the denominator), SUM of nothing is NULL, COUNT(col) ≠ COUNT(*).
        - **Protection:** define what NULL means per column in the data contract, enforce NOT NULL where the business requires it, completeness checks (COUNT(col)/COUNT(*)) with thresholds, and code review rules for NOT IN.`),
    ],
    hands: [
      sql({ q: 'Return the rows of «toy_a» whose «id» does **not** appear in «toy_b», handling the NULL in toy_b correctly. Treat toy_a\'s NULL id as "not present in toy_b" too. Return «id, val» sorted by «val».', tables: ['toy_a', 'toy_b'], level: 2,
        solution: `SELECT a.id, a.val
FROM toy_a a
WHERE NOT EXISTS (SELECT 1 FROM toy_b b WHERE b.id = a.id)
ORDER BY a.val`, hint: 'NOT EXISTS is NULL-safe; NOT IN returns nothing here.' }),
      sql({ q: 'Completeness profile of «claims»: return one row with «rows_total», «approved_amount_filled» (non-NULL count), «pct_filled» (rounded to 1 dp), «avg_ignoring_nulls» and «avg_nulls_as_zero» (both rounded to 2 dp).', tables: ['claims'], level: 2,
        solution: `SELECT COUNT(*) AS rows_total,
       COUNT(approved_amount) AS approved_amount_filled,
       ROUND(100.0 * COUNT(approved_amount) / COUNT(*), 1) AS pct_filled,
       ROUND(AVG(approved_amount), 2) AS avg_ignoring_nulls,
       ROUND(AVG(COALESCE(approved_amount, 0)), 2) AS avg_nulls_as_zero
FROM claims` }),
    ],
  }),

  // ================================================================== Joins in depth
  joinsdeep: T(`
    > **In one line:** a join pairs rows that satisfy a condition. The result size is **not** bounded by either input: every left row is repeated once per matching right row. Understanding **cardinality (fan-out)**, the **semi/anti** join family and the **algorithms** engines use (nested loop, hash, sort-merge) is what separates "knows JOIN syntax" from "can debug a doubled revenue number".

    ## Join types, precisely
    | Join | Returns |
    |---|---|
    | INNER | Pairs that match |
    | LEFT [OUTER] | Every left row; right columns NULL when no match |
    | RIGHT | Mirror of LEFT (rewrite as LEFT for readability) |
    | FULL [OUTER] | Every row from both sides; NULLs on the side without a match |
    | CROSS | Every pair (m × n). Legit for date spines and small parameter tables |
    | SEMI (EXISTS / IN / Spark «left_semi») | Left rows that have **at least one** match; **never duplicates** the left row; returns only left columns |
    | ANTI (NOT EXISTS / Spark «left_anti») | Left rows with **no** match |
    | Self join | A table joined to itself (hierarchies, comparing rows) |
    | Non-equi / range join | ON uses «<», «BETWEEN» (as-of joins, SCD2 lookups, bucketing) |
    | LATERAL / CROSS APPLY | Right side is a subquery evaluated per left row (top-N per row) |

    ## Cardinality: the source of most join bugs
    - **1:1** and **N:1** (fact to dimension) joins do not change the fact row count. That is the safe direction.
    - **1:N** and **M:N** multiply rows. Joining «orders» (1 row each) to «order_lines» (5 each) to «shipments» (2 each) gives 10 rows per order. Then «SUM(order_total)» is **10× too high**. This is the **fan-out** or "chasm trap".
    - **Detect it:** compare «COUNT(*)» before and after the join; assert the dimension key is unique («COUNT(*) = COUNT(DISTINCT key)»). dbt's «unique» test on dimension keys exists for this reason.
    - **Fix it:** aggregate each child to the parent grain *before* joining; or join only to a unique key; or use EXISTS (semi join) when you only need to know a match exists.
    - «COUNT(DISTINCT order_id)» after a fan-out "fixes" counts but **not sums**. A reviewer seeing DISTINCT sprinkled in a query should suspect an unresolved fan-out.
    - **Duplicate keys in a "dimension"** (e.g. SCD2 history joined without an as-of condition) are the most common real-world fan-out.

    ## Semi and anti joins
    - «WHERE EXISTS (SELECT 1 FROM claims c WHERE c.dealer_id = d.dealer_id)» returns each dealer once, however many claims. An INNER JOIN would return it once per claim.
    - «IN (subquery)» is also a semi join. «NOT IN» is **not** a safe anti join (NULL trap); «NOT EXISTS» is.
    - Engines execute semi/anti joins with the same hash/merge algorithms but stop after the first match, which is cheaper than a join followed by DISTINCT.

    ## Join algorithms (physical)
    | Algorithm | How | Best when | Cost |
    |---|---|---|---|
    | **Nested loop** | For each left row, scan (or index-seek) the right | One side tiny, or an index on the inner side; only option for arbitrary non-equi conditions | O(n·m) without index; O(n·log m) with index |
    | **Hash join** | Build a hash table on the smaller input, probe with the larger | Equi-joins, unsorted inputs, build side fits in memory | O(n + m); spills to disk if the build side is too big |
    | **Sort-merge join** | Sort both on the key, walk them together | Large inputs on both sides, already sorted/bucketed data, Spark's default for big-big equi-joins | O(n log n + m log m), streams well, handles huge data |
    | **Broadcast hash** (distributed) | Copy the small table to every worker; hash join locally | One side small (Spark default threshold 10 MB, often raised to ~100 MB+) | No shuffle of the big side |
    | **Shuffle hash / sort-merge** (distributed) | Repartition both sides by key so matching keys meet | Both sides large | Full shuffle of both inputs |

    OLTP databases lean on **index nested loops**; analytical engines lean on **hash** and **sort-merge**; distributed engines add the **broadcast vs shuffle** decision on top.

    ## Range (non-equi) joins at scale
    «ON e.ts BETWEEN w.start AND w.end» cannot be hashed. Engines fall back to nested loop (Spark: broadcast nested loop join or cartesian product), which explodes on big tables. Techniques: **bucket both sides by a coarse key** (e.g. date or hour) and add an equi condition on it; use an engine's **as-of join** (DuckDB «ASOF JOIN», Databricks range-join hints); or **window over a union** of both tables (see Patterns).

    ## Edge cases
    - Joining on columns of **different types** («'00123'» vs «123») causes implicit casts: missing matches, or a full scan because the index cannot be used.
    - **Trailing spaces and case** in string keys: «'ABC '» ≠ «'ABC'» in most engines (not in SQL Server/MySQL with PAD SPACE collations). Normalise keys at ingestion.
    - **FULL OUTER JOIN + COALESCE(a.key, b.key)** is the standard way to compare two datasets (reconciliation). Remember NULL keys never match, so they appear twice.
    - **USING vs ON:** «USING (id)» outputs one id column; with FULL JOIN that column is effectively «COALESCE(a.id, b.id)».
    - **Joins in a streaming engine** need watermarks so state can be dropped (see Stateful streaming).

    ## How interviewers test this
    - "Table A has 4 rows, B has 5. How many rows can A INNER JOIN B produce?" Anything from 0 to 20. Then "with these values?"
    - "Revenue doubled after you added a join. Why?" Fan-out; prove with counts; aggregate first.
    - "Difference between a semi join and an inner join?" Duplication and output columns.
    - "How does Spark decide between broadcast and sort-merge?" Size estimate vs «spark.sql.autoBroadcastJoinThreshold», hints, AQE at runtime.
  `, {
    check: [
      mcq('toy_a ids: 1, 2, 3, NULL. toy_b ids: 2, 3, 3, 4, NULL. How many rows does «toy_a JOIN toy_b ON a.id = b.id» return?', ['2', '3', '4', '5'], 1, 'id 2 → 1 row, id 3 → 2 rows (duplicate in b), NULLs never match: 3 rows.'),
      mcq('Same tables, LEFT JOIN from toy_a. Row count?', ['4', '5', '3', '6'], 1, '3 matched rows + id 1 unmatched + NULL unmatched = 5.'),
      mcq('Same tables, FULL OUTER JOIN. Row count?', ['5', '6', '7', '8'], 2, 'Left join gives 5; add the right rows with no match: 4 and NULL → 7.'),
      tf('A semi join (EXISTS) can return a left row more than once if several right rows match.', false, 'It returns each qualifying left row once.'),
      mcq('Sum of «order_total» is 10× too high after joining orders → order_lines → shipments. Best fix?', ['SUM(DISTINCT order_total)', 'Aggregate lines and shipments to order grain before joining', 'Use a LEFT JOIN', 'Add ORDER BY'], 1, 'SUM(DISTINCT) would also merge two orders with the same total. Fix the grain.'),
      match('Match the join algorithm to where it shines.', [['Index nested loop', 'OLTP lookup of a few rows by key'], ['Hash join', 'Equi-join where the smaller input fits in memory'], ['Sort-merge join', 'Two very large inputs, or inputs already sorted/bucketed'], ['Broadcast hash join', 'Large fact table joined to a small dimension in a cluster']], 'Physical choice depends on size, sortedness and indexes.'),
    ],
    scenarios: [
      scenario('Revenue went up 38% overnight', `
        A dbt model «fct_claim_value» joins «claims» to «dim_dealer». Yesterday the dealer team switched «dim_dealer» to SCD Type 2 (one row per dealer version, with «valid_from», «valid_to»). Today total approved value is up 38%, but the claims count in the source has not changed.`, [
        ['First diagnostic?', [
          ['Compare row counts of claims before and after the join, and check uniqueness of dealer_id in dim_dealer', true, 'Proves fan-out in two queries.'],
          ['Re-run the model', false, 'It will produce the same wrong number.'],
          ['Check the dashboard cache', false, 'The model output is wrong.'],
        ]],
        ['Correct fix?', [
          ['Join on dealer_id AND submitted_at within [valid_from, valid_to) (or join to the current row only, if current attributes are what the report needs), and add a test that the fact row count is unchanged by the join', true, 'An as-of join restores N:1 cardinality.'],
          ['SELECT DISTINCT after the join', false, 'Masks counts but sums are still inflated where rows differ.'],
          ['Revert SCD2', false, 'Breaks the dealer team\'s history requirement.'],
        ]],
      ], 'Any change to a dimension\'s grain must be checked against every model that joins it.'),
    ],
    interview: [
      talk('How do you choose between hash join and sort-merge join, and how does that map to Spark?', `
        - **Hash join:** build a hash table on the smaller side, probe with the larger. Linear time; needs the build side in memory, otherwise it spills or OOMs. Great when one side is moderate.
        - **Sort-merge:** sort both sides by key and merge. Handles arbitrarily large inputs (external sort), no memory cliff, benefits if data is pre-sorted/bucketed. Extra sort cost.
        - **Spark:** if one side's estimated size is under «autoBroadcastJoinThreshold» (or hinted), **broadcast hash join**: no shuffle of the large side. Otherwise **sort-merge join** with a shuffle of both sides (default), or shuffle hash join if enabled/preferred. **AQE** can switch a sort-merge to broadcast at runtime when a side turns out small after filters, and split skewed partitions.
        - **Signals:** «BroadcastHashJoin» vs «SortMergeJoin» in «explain()»; a stage with a huge shuffle write; one slow task (skew).`),
      talk('A join in production suddenly returns duplicates. How do you investigate?', `
        1. **Confirm and size it:** row count before/after; count by key on each side; find keys with count > 1 on the side that should be unique.
        2. **Find when it started:** compare with yesterday's snapshot / table history (Delta time travel); look at upstream changes (new SCD2, a re-ingested file, a CDC replay without dedupe).
        3. **Fix the root cause** (dedupe at the layer that introduced it, as-of join, unique key) rather than adding DISTINCT downstream.
        4. **Prevent:** unique tests on keys, row-count reconciliation across the join, alert on sudden metric jumps.`),
    ],
    hands: [
      sql({ q: 'Prove a fan-out. For each **dealer**, return «dealer_id», «claims» (number of claims) and «credit_note_rows» (rows you get when joining that dealer\'s claims to «credit_notes»), plus «total_claimed_naive» = SUM(claim_amount) **after** joining to credit_notes and «total_claimed_correct» = SUM(claim_amount) without the join. Round sums to 2 dp. Only dealers that have claims. Sort by «dealer_id».', tables: ['claims', 'credit_notes'], level: 3,
        solution: `WITH naive AS (
  SELECT c.dealer_id, COUNT(*) AS credit_note_rows, ROUND(SUM(c.claim_amount), 2) AS total_claimed_naive
  FROM claims c JOIN credit_notes n ON n.claim_id = c.claim_id
  GROUP BY c.dealer_id
), correct AS (
  SELECT dealer_id, COUNT(*) AS claims, ROUND(SUM(claim_amount), 2) AS total_claimed_correct
  FROM claims GROUP BY dealer_id
)
SELECT c.dealer_id, c.claims, COALESCE(n.credit_note_rows, 0) AS credit_note_rows,
       n.total_claimed_naive, c.total_claimed_correct
FROM correct c LEFT JOIN naive n ON n.dealer_id = c.dealer_id
ORDER BY c.dealer_id`, hint: 'Compute the correct total at claim grain in one CTE and the joined total in another, then put them side by side.' }),
      sql({ q: 'Semi vs inner join. Return the dealers that have **at least one Rejected claim**, each dealer **once**, without using DISTINCT or GROUP BY. Return «dealer_id, dealer_name» sorted by «dealer_id».', tables: ['dealers', 'claims'], level: 2,
        solution: `SELECT d.dealer_id, d.dealer_name
FROM dealers d
WHERE EXISTS (SELECT 1 FROM claims c WHERE c.dealer_id = d.dealer_id AND c.status = 'Rejected')
ORDER BY d.dealer_id` }),
    ],
  }),

  // ================================================================== Aggregation
  aggdeep: T(`
    > **In one line:** aggregation collapses many rows into one per group. Senior-level questions are about **grain** (what one output row means), **conditional aggregation** (many metrics in one pass), **multi-level totals** (ROLLUP, CUBE, GROUPING SETS), the **cost of exact distinct counts** at scale, and **which aggregates can be combined** across partitions and time.

    ## GROUP BY rules
    - Every SELECT expression must be a group key, an aggregate, or a function of group keys (functional dependence is allowed in Postgres when grouping by a primary key).
    - Group by the **key**, not the label, when labels can repeat: two dealers called "Pune Power Services" would merge if you group by name. Group by «dealer_id, dealer_name».
    - **HAVING** filters groups; WHERE filters rows before grouping. Pushing conditions to WHERE is cheaper (fewer rows grouped).

    ## Conditional aggregation: one scan, many metrics
    «««sql
    SELECT dealer_id,
           COUNT(*)                                                AS claims,
           SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END)     AS approved,
           SUM(CASE WHEN status = 'Rejected' THEN claim_amount END) AS rejected_value,
           AVG(CASE WHEN status <> 'Submitted' THEN approved_amount END) AS avg_decided
    FROM claims GROUP BY dealer_id;
    »»»
    - Standard alternative: «COUNT(*) FILTER (WHERE status = 'Approved')» (Postgres, SQLite 3.30+, DuckDB, Spark 3+).
    - This is also how you **pivot** in portable SQL.
    - «CASE … END» without ELSE yields NULL, which aggregates skip: that is how «AVG(CASE …)» averages only the matching rows.

    ## Multi-level totals
    | Construct | Produces |
    |---|---|
    | «GROUP BY ROLLUP (region, dealer)» | (region, dealer), (region), () → subtotals per region and a grand total |
    | «GROUP BY CUBE (region, status)» | Every combination: (region, status), (region), (status), () |
    | «GROUP BY GROUPING SETS ((region), (status), ())» | Exactly the sets you list |
    - Subtotal rows show NULL in the rolled-up column. Use «GROUPING(col)» (1 when the column is aggregated away) to tell a subtotal NULL from a real NULL value.
    - One pass over the data instead of several UNION ALL queries.

    ## Additive, semi-additive, non-additive
    | Kind | Example | Can you sum across…? |
    |---|---|---|
    | Additive | Revenue, quantity | Every dimension, including time |
    | Semi-additive | Inventory on hand, account balance | Across plants/parts yes, **across time no** (use last value or average per period) |
    | Non-additive | Ratios, percentages, distinct counts, medians | Nothing. Store the components (numerator, denominator) and recompute |

    - "Average of averages" is wrong unless group sizes are equal: compute «SUM(x)/SUM(n)».
    - **Distinct counts do not add up**: daily active engines summed over 7 days ≠ weekly active engines. Pre-aggregated tables must either store raw keys, or a **mergeable sketch** (HyperLogLog), or be recomputed at each grain.

    ## Distinct counts at scale
    - Exact «COUNT(DISTINCT x)» needs every distinct value in one place per group: a full shuffle and potentially a huge hash set. Several distinct counts in one query multiply the work (Spark expands rows per distinct aggregate).
    - **Approximate**: «approx_count_distinct» / «APPROX_COUNT_DISTINCT» (HyperLogLog++, ~1-2% error with a few KB of memory per group, **mergeable** across partitions and days). Use for dashboards and monitoring; keep exact for billing and finance.
    - Percentiles likewise: exact «percentile_cont» sorts per group; «approx_percentile» (t-digest/quantile sketches) scales.

    ## Partial aggregation (why SUM scales)
    A distributed engine computes local partial results per partition (sum, count, min, max), shuffles the small partials, and combines. Aggregates that decompose this way (SUM, COUNT, MIN, MAX, AVG as sum+count, HLL sketches) scale linearly. **Median, exact distinct, mode** do not decompose. Knowing this lets you predict which query will be slow before running it.

    ## Edge cases
    - **Grouping by a nullable column** puts all NULLs in one group, which can be the biggest group (skew) and is often unexpected in reports. Label it ("Unknown").
    - **Integer division**: «SUM(approved) / COUNT(*)» is integer division in Postgres/SQL Server/SQLite when both are integers → 0. Multiply by «1.0» or cast.
    - **Floating point sums are not associative**: summing the same doubles in a different order (different partitioning) can change the last digits. Use DECIMAL for money; do not compare float totals with «=» in reconciliation, use a tolerance.
    - **Empty groups do not exist**: a dealer with no claims in a GROUP BY over claims simply has no row. To show zeros, start from the dimension (or a date spine) and LEFT JOIN.
    - **HAVING without GROUP BY** treats the whole table as one group.

    ## How interviewers test this
    - "Count approved, rejected and total per dealer in one query."
    - "Why can't you add up daily distinct users to get monthly?" Then: "How would you make it fast anyway?" (HLL sketches.)
    - "Show a report with per-region subtotals and a grand total." (ROLLUP + GROUPING.)
  `, {
    check: [
      mcq('Daily distinct active engines are 40, 42, 41 over three days. Distinct active engines over the 3 days is…', ['123', 'At most 123 and at least 42', 'Exactly 42', '41'], 1, 'Distinct counts are not additive; the answer is between the max and the sum.'),
      mcq('Which aggregate can be computed per partition and merged exactly?', ['Median', 'Exact COUNT(DISTINCT)', 'SUM', 'Mode'], 2, 'SUM decomposes; the others need all values together.'),
      mcq('Inventory on hand per plant per day. What is a correct monthly figure?', ['SUM over the days', 'The last day\'s value (or the daily average)', 'MAX over all plants', 'COUNT of days'], 1, 'Semi-additive: never sum across time.'),
      tf('In ROLLUP output, a NULL in the dealer column always means the subtotal row.', false, 'It may be a real NULL dealer. Use GROUPING(dealer) to tell them apart.'),
      mcq('«SELECT SUM(is_approved) / COUNT(*) FROM claims» with integer columns in Postgres returns 0. Why?', ['No approved claims', 'Integer division', 'NULLs', 'COUNT returns text'], 1, 'Cast or multiply by 1.0.'),
    ],
    interview: [
      talk('Your daily job computes «weekly unique engines reporting faults» by summing daily distinct counts. What is wrong and how would you design it for billions of events?', `
        - Distinct counts are **non-additive**: an engine active on 3 days is counted 3 times.
        - **Exact option:** keep a compact daily table of (day, engine_id) pairs (deduplicated) and count distinct over the week; it is much smaller than raw events.
        - **Scalable option:** store a **HyperLogLog sketch** per day (and per dimension) and merge sketches for any range: ~1-2% error, KB-sized, mergeable. Good for dashboards.
        - Keep exact for anything financial or contractual. Document which one each metric uses in the semantic layer.`),
    ],
    hands: [
      sql({ q: 'One-pass dealer scorecard. Per «dealer_id» return «claims», «approved» (status Approved), «partially» (Partially Approved), «rejected», «approval_rate_pct» ((approved + partially) / decided claims × 100, where decided = not Submitted; rounded to 1 dp; NULL if no decided claims) and «approved_value» (SUM of approved_amount, NULL treated as 0, rounded to 2 dp). Sort by «dealer_id».', tables: ['claims'], level: 3,
        solution: `SELECT dealer_id,
       COUNT(*) AS claims,
       SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN status = 'Partially Approved' THEN 1 ELSE 0 END) AS partially,
       SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
       ROUND(100.0 * SUM(CASE WHEN status IN ('Approved', 'Partially Approved') THEN 1 ELSE 0 END)
             / NULLIF(SUM(CASE WHEN status <> 'Submitted' THEN 1 ELSE 0 END), 0), 1) AS approval_rate_pct,
       ROUND(SUM(COALESCE(approved_amount, 0)), 2) AS approved_value
FROM claims
GROUP BY dealer_id
ORDER BY dealer_id`, hint: 'SUM(CASE …) per metric; NULLIF in the denominator.' }),
      sql({ q: 'Subtotals without ROLLUP (SQLite has none). Return «region, status, claims» for every (region, status), plus one subtotal row per region with status «\'ALL\'», plus a grand total row with region and status «\'ALL\'». Sort by region, then status (with \'ALL\' sorted after real statuses inside a region, and the grand total last).', tables: ['claims', 'dealers'], level: 3,
        solution: `WITH j AS (SELECT d.region, c.status FROM claims c JOIN dealers d ON d.dealer_id = c.dealer_id),
u AS (
  SELECT region, status, COUNT(*) AS claims, 0 AS lvl FROM j GROUP BY region, status
  UNION ALL
  SELECT region, 'ALL', COUNT(*), 1 FROM j GROUP BY region
  UNION ALL
  SELECT 'ALL', 'ALL', COUNT(*), 2 FROM j
)
SELECT region, status, claims FROM u
ORDER BY CASE WHEN lvl = 2 THEN 1 ELSE 0 END, region, lvl, status`, hint: 'UNION ALL three grouping levels; carry a level number to sort by.' }),
    ],
  }),

  // ================================================================== Windows
  windows: T(`
    > **In one line:** a window function computes a value **for each row** from a set of related rows (its **window**) **without collapsing** them. You define the window with «PARTITION BY» (which rows belong together), «ORDER BY» (their order) and a **frame** (which of those rows count for this row). The frame defaults are where experienced people still get burned.

    ## Anatomy
    «««sql
    SUM(claim_amount) OVER (
      PARTITION BY dealer_id                 -- independent groups
      ORDER BY submitted_at, claim_id        -- order inside each group (tie-breaker!)
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW  -- frame: this row and the 6 before
    )
    »»»

    ## Families
    | Family | Functions | Frame used? |
    |---|---|---|
    | Ranking | «ROW_NUMBER», «RANK», «DENSE_RANK», «NTILE», «PERCENT_RANK», «CUME_DIST» | No (whole partition, by order) |
    | Offset | «LAG(x, n, default)», «LEAD» | No |
    | Value | «FIRST_VALUE», «LAST_VALUE», «NTH_VALUE» | **Yes** |
    | Aggregate | «SUM, AVG, COUNT, MIN, MAX» OVER | **Yes** (whole partition if no ORDER BY) |

    ### ROW_NUMBER vs RANK vs DENSE_RANK on ties (100, 90, 90, 80)
    | | 100 | 90 | 90 | 80 |
    |---|---|---|---|---|
    | ROW_NUMBER | 1 | 2 | 3 (arbitrary which 90) | 4 |
    | RANK | 1 | 2 | 2 | 4 |
    | DENSE_RANK | 1 | 2 | 2 | 3 |
    Use ROW_NUMBER for **dedupe / pick exactly one** (with a deterministic tie-breaker); RANK/DENSE_RANK for **leaderboards** where ties must share.

    ## The frame trap
    - With **ORDER BY and no explicit frame**, the default is «RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW». That gives a running total, but **RANGE includes all peers** (rows with the same ORDER BY value). Two claims at the same timestamp both get the total including each other. Use «ROWS» for a strict row-by-row running total.
    - **«LAST_VALUE(x) OVER (PARTITION BY k ORDER BY t)» returns the current row's value**, not the partition's last, because the default frame ends at the current row. Fix: «ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING», or use «FIRST_VALUE» with descending order.
    - **Without ORDER BY**, aggregate windows cover the whole partition: «SUM(x) OVER (PARTITION BY k)» = group total on every row (percent of total pattern).
    - **ROWS vs RANGE for time windows**: «ROWS 6 PRECEDING» is "last 7 rows", which is "last 7 days" only if there is exactly one row per day with no gaps. For true time ranges use «RANGE BETWEEN INTERVAL 6 DAYS PRECEDING AND CURRENT ROW» (Postgres, Spark with numeric/day ordering, DuckDB) or a **date spine** joined first.

    ## Determinism
    «ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at)» with two events at the same «updated_at» picks one **arbitrarily**, and the choice can differ between runs and between Spark partitions. A dedupe that is not deterministic is not idempotent. Always add a **unique tie-breaker** (event_id, ingestion offset, LSN).

    ## Performance
    - A window needs each partition's rows **co-located and sorted**: in Spark that is a shuffle by the partition key + a sort. Several windows with the **same** PARTITION BY/ORDER BY share one sort; different specs each add one.
    - **No PARTITION BY** = one partition = **all data on one task**. «ROW_NUMBER() OVER (ORDER BY ts)» over a billion rows runs on a single core. Use «monotonically_increasing_id» (Spark) or a partitioned rank if you only need uniqueness.
    - A partition key with a giant group (one engine with 90% of readings, or NULL) means one huge sorted partition: skew and spill.
    - Prefer «MAX_BY / ARG_MAX» (Spark «max_by», DuckDB «arg_max», BigQuery «ANY_VALUE … HAVING MAX») over a window + filter when you only need "latest value per key": it aggregates without sorting.

    ## Patterns built on windows
    - **Dedupe / latest per key:** «ROW_NUMBER() … = 1».
    - **Top N per group:** «DENSE_RANK() <= N».
    - **Change detection:** «x <> LAG(x)» to keep only state changes.
    - **Durations:** «LEAD(ts) - ts» per row (time in each status).
    - **Running totals, moving averages, cumulative distinct (careful: not supported directly)**.
    - **Gaps and islands, sessionization** (see Patterns).
    - **Percent of total:** «x / SUM(x) OVER ()».

    ## How interviewers test this
    - "Difference between RANK and DENSE_RANK" then "why would ROW_NUMBER be dangerous for dedupe?"
    - "Your LAST_VALUE returns the current row. Why?"
    - "7-day moving average when some days have no data."
    - "Why is this window query running on one executor?"
  `, {
    check: [
      mcq('Scores 100, 90, 90, 80 ordered descending. DENSE_RANK of 80?', ['4', '3', '2', '5'], 1, 'Dense ranks do not skip: 1, 2, 2, 3.'),
      mcq('«LAST_VALUE(status) OVER (PARTITION BY order_id ORDER BY updated_at)» returns the current row\'s status. Why?', ['A bug in the engine', 'The default frame ends at the current row', 'LAST_VALUE ignores ORDER BY', 'NULLs'], 1, 'Set ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING.'),
      mcq('Running total with ORDER BY ts and the default frame; two rows share the same ts. What do they get?', ['Different running totals', 'The same total, including both rows', 'NULL', 'An error'], 1, 'The default RANGE frame includes peers. Use ROWS for row-by-row.'),
      tf('«ROW_NUMBER() OVER (ORDER BY ts)» with no PARTITION BY runs on a single task in Spark.', true, 'Everything must be globally ordered in one partition.'),
      mcq('«AVG(x) OVER (ORDER BY day ROWS 6 PRECEDING)» is a true 7-day average only when…', ['Always', 'There is exactly one row per day with no missing days', 'x has no NULLs', 'The table is partitioned'], 1, 'ROWS counts rows, not days. Use RANGE with an interval or a date spine.'),
      multi('Which make a ROW_NUMBER dedupe deterministic?', ['Adding event_id as a tie-breaker in ORDER BY', 'Adding the Kafka offset as a tie-breaker', 'Running it twice', 'Using RANK instead'], [0, 1], 'A unique ordering key is required; RANK would return several rows on ties.'),
    ],
    scenarios: [
      scenario('Different results on every re-run', `
        A silver job keeps the latest status per order with «ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) = 1». A reconciliation test that compares two runs of the same input fails on ~0.3% of orders.`, [
        ['Cause?', [
          ['Orders with two events at the same updated_at: the pick is arbitrary and changes with partitioning', true, 'Non-deterministic tie.'],
          ['ROW_NUMBER is approximate', false, 'It is exact; the order is the problem.'],
          ['Late data', false, 'Same input both runs.'],
        ]],
        ['Fix?', [
          ['Add a unique, meaningful tie-breaker: event sequence / LSN / Kafka offset, then event_id', true, 'Deterministic and reflects true order.'],
          ['Use RANK', false, 'Returns both tied rows.'],
          ['Sort the input file first', false, 'Spark does not preserve input order through shuffles.'],
        ]],
      ], 'Deterministic ordering is a requirement for idempotent pipelines.'),
    ],
    interview: [
      talk('Explain window frames. When would ROWS and RANGE give different answers?', `
        - The **frame** is the subset of the ordered partition used for each row's calculation. ROWS counts physical rows; RANGE uses the ORDER BY **value**.
        - They differ when there are **ties** (RANGE includes all peers of the current row) and when values have **gaps** (RANGE 6 PRECEDING on a date covers 6 days even if only 2 rows exist; ROWS 6 PRECEDING covers 6 rows even if they span months).
        - Default with ORDER BY is RANGE UNBOUNDED PRECEDING → CURRENT ROW, which surprises people with running totals on tied timestamps and with LAST_VALUE.
        - In production I always write the frame explicitly.`),
    ],
    hands: [
      sql({ q: '**Time in each status.** For every event in «raw_orders_feed», after removing exact duplicates of (order_id, status, updated_at) (keep the lowest event_id), return «order_id, status, updated_at, next_updated_at» (the next distinct event\'s updated_at for the same order, NULL for the last) and «hours_in_status» (rounded to 1 dp, NULL for the last). Sort by «order_id, updated_at».', tables: ['raw_orders_feed'], level: 3,
        solution: `WITH d AS (
  SELECT order_id, status, updated_at,
         ROW_NUMBER() OVER (PARTITION BY order_id, status, updated_at ORDER BY event_id) AS rn
  FROM raw_orders_feed
), e AS (SELECT order_id, status, updated_at FROM d WHERE rn = 1)
SELECT order_id, status, updated_at,
       LEAD(updated_at) OVER (PARTITION BY order_id ORDER BY updated_at, status) AS next_updated_at,
       ROUND((julianday(LEAD(updated_at) OVER (PARTITION BY order_id ORDER BY updated_at, status)) - julianday(updated_at)) * 24, 1) AS hours_in_status
FROM e
ORDER BY order_id, updated_at, status`, hint: 'Dedupe with ROW_NUMBER, then LEAD over the clean rows.' }),
      sql({ q: 'Rolling engine health. For each reading in «sensor_readings» return «engine_id, ts, temperature_c» and «temp_avg_last3» = average temperature of this reading and the 2 previous readings **of the same engine** (rounded to 2 dp; NULL temperatures are ignored by AVG), and «temp_jump» = temperature_c minus the previous reading\'s temperature (NULL for the first). Only engine_id 1 and 2. Sort by «engine_id, ts».', tables: ['sensor_readings'], level: 2,
        solution: `SELECT engine_id, ts, temperature_c,
       ROUND(AVG(temperature_c) OVER (PARTITION BY engine_id ORDER BY ts, reading_id ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS temp_avg_last3,
       ROUND(temperature_c - LAG(temperature_c) OVER (PARTITION BY engine_id ORDER BY ts, reading_id), 2) AS temp_jump
FROM sensor_readings
WHERE engine_id IN (1, 2)
ORDER BY engine_id, ts`, hint: 'Explicit ROWS frame; LAG for the jump.' }),
    ],
  }),

  // ================================================================== CTEs
  ctes: T(`
    > **In one line:** subqueries and CTEs let you build a query in named steps. **Correlated** subqueries run (logically) once per outer row; **CTEs** are named subqueries that may or may not be materialised depending on the engine; **recursive CTEs** walk hierarchies and generate series. Know when each is fast, when each is a trap, and how they read in code review.

    ## Kinds of subquery
    | Kind | Example | Notes |
    |---|---|---|
    | Scalar | «(SELECT MAX(x) FROM t)» | Must return ≤ 1 row; more is a runtime error, zero is NULL |
    | Derived table | «FROM (SELECT …) s» | Needs an alias in most engines |
    | IN / EXISTS | «WHERE id IN (SELECT …)» | Semi join |
    | Correlated | «WHERE amount > (SELECT AVG(amount) FROM claims c2 WHERE c2.dealer_id = c1.dealer_id)» | References the outer row. Optimisers usually decorrelate into a join + aggregate; when they cannot, it is O(n²) |

    ## CTEs
    «««sql
    WITH decided AS (
      SELECT * FROM claims WHERE status <> 'Submitted'
    ), per_dealer AS (
      SELECT dealer_id, COUNT(*) AS n FROM decided GROUP BY dealer_id
    )
    SELECT * FROM per_dealer WHERE n > 5;
    »»»
    - Readability first: each CTE is one step with a name; this is exactly how dbt models are written (import CTEs, logical CTEs, final select).
    - **Materialised or inlined?** Postgres ≤ 11 always materialised CTEs (an "optimisation fence": predicates were not pushed in). Postgres 12+ inlines CTEs referenced once (and offers «MATERIALIZED» / «NOT MATERIALIZED»). Spark, Snowflake, BigQuery and most warehouses **inline** CTEs: a CTE referenced three times may be **computed three times**. In Spark, cache or write an intermediate table if an expensive CTE is reused.
    - CTEs do not make queries faster by themselves; they make them clearer. When a CTE is reused and expensive, materialise deliberately (temp table, «cache()», intermediate dbt model).

    ## Recursive CTEs
    «««sql
    WITH RECURSIVE chain AS (
      SELECT emp_id, name, manager_id, 0 AS depth, name AS path
      FROM employees WHERE manager_id IS NULL            -- anchor
      UNION ALL
      SELECT e.emp_id, e.name, e.manager_id, c.depth + 1, c.path || ' > ' || e.name
      FROM employees e JOIN chain c ON e.manager_id = c.emp_id   -- recursive step
    )
    SELECT * FROM chain;
    »»»
    - **Anchor** + **recursive member** joined to the CTE itself; runs until the recursive member returns no rows.
    - Uses: org charts, bill of materials (engine → assemblies → parts, with quantities multiplied down the tree), dependency graphs (which tables are downstream of X: lineage), generating date series.
    - **Cycles** (A manages B manages A, or a BOM loop from bad data) cause infinite recursion. Guard with a depth limit, a path check («WHERE path NOT LIKE '%/' || id || '/%'»), or the SQL standard «CYCLE» clause (Postgres 14+).
    - Spark SQL supports recursive CTEs from **Spark 4.1** (Databricks Runtime 17+ added them first). On older Spark versions the classic answer is an **iterative loop of joins** driven from Python until no new rows appear, or GraphFrames. Always add a depth limit: Spark also caps recursion depth/rows by config.

    ## Choosing
    - Need a per-row comparison to a group statistic → a **window** («AVG(x) OVER (PARTITION BY k)») is usually clearer and faster than a correlated subquery.
    - Need "exists / does not exist" → EXISTS / NOT EXISTS.
    - Need a reusable step → CTE; if reused and costly, materialise.
    - Need hierarchy or series → recursive CTE (or a calendar table for series).

    ## How interviewers test this
    - "Find claims above their dealer's average" (correlated vs window).
    - "Print each employee's chain of managers" (recursive CTE) and "what if the data has a cycle?"
    - "Is a CTE materialised?" (It depends on the engine; say which.)
  `, {
    check: [
      mcq('A scalar subquery returns 2 rows at runtime. What happens?', ['The first is used', 'An error', 'NULL', 'Both are summed'], 1, 'A scalar subquery must return at most one row.'),
      tf('In Spark and most cloud warehouses, a CTE referenced three times is guaranteed to be computed once.', false, 'CTEs are usually inlined; cache or materialise deliberately.'),
      mcq('What stops a recursive CTE?', ['A LIMIT on the anchor', 'The recursive member producing no new rows (or a depth/cycle guard)', 'ORDER BY', 'The engine timeout only'], 1, 'Add a depth or path guard for bad data with cycles.'),
      mcq('Best way to flag claims above their dealer\'s average amount, at scale?', ['Correlated subquery per row', 'AVG(claim_amount) OVER (PARTITION BY dealer_id) in a CTE, then compare', 'A cursor', 'Self join on every pair'], 1, 'One shuffle and sort per dealer, no per-row subquery.'),
    ],
    hands: [
      sql({ q: 'Org chart with a recursive CTE. Return every employee with «emp_id, name, depth» (0 for people with no manager) and «chain» = names from the top manager down to the employee joined by « > ». Sort by «chain».', tables: ['employees'], level: 3,
        solution: `WITH RECURSIVE chain AS (
  SELECT emp_id, name, 0 AS depth, name AS chain FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.emp_id, e.name, c.depth + 1, c.chain || ' > ' || e.name
  FROM employees e JOIN chain c ON e.manager_id = c.emp_id
)
SELECT emp_id, name, depth, chain FROM chain ORDER BY chain` }),
      sql({ q: 'Generate a **date spine** with a recursive CTE for 2026-11-01 to 2026-11-20 and count, per day, how many engines were running in «engine_daily_status» (0 when no rows). Return «day, running_engines» sorted by day.', tables: ['engine_daily_status'], level: 2,
        solution: `WITH RECURSIVE days(day) AS (
  SELECT '2026-11-01'
  UNION ALL
  SELECT date(day, '+1 day') FROM days WHERE day < '2026-11-20'
)
SELECT d.day, COALESCE(SUM(s.is_running), 0) AS running_engines
FROM days d LEFT JOIN engine_daily_status s ON s.day = d.day
GROUP BY d.day
ORDER BY d.day` }),
    ],
  }),
};
