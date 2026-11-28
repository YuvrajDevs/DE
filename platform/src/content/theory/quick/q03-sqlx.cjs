const { T } = require('../_t.cjs');

module.exports = {
  sqlorder: T(`
    > **In one line:** SQL is **declarative**. The **logical order** decides what each clause can see (what's legal and what the result means); the **physical plan** is what the optimiser actually runs (speed). Mixing them up causes most "why is this wrong/slow" questions.

    | Step | Clause | What exists |
    |---|---|---|
    | 1 | FROM + JOIN … ON | Combined rows («ON» evaluated during the join) |
    | 2 | WHERE | Single-row filter: **no aggregates, windows or SELECT aliases** (standard SQL) |
    | 3 | GROUP BY | Groups; afterwards only keys and aggregates are legal |
    | 4 | HAVING | Group filter, can use aggregates |
    | 5 | Window functions | Over rows surviving 1-4 |
    | 6 | SELECT | Expressions and aliases created |
    | 7 | DISTINCT | Duplicate output rows removed |
    | 8 | ORDER BY | Can use aliases (and unselected columns unless DISTINCT) |
    | 9 | LIMIT / OFFSET / FETCH | Rows cut |

    **What the order explains:**
    - No window functions in WHERE (step 5 > 2): filter in an outer query/CTE, or «QUALIFY» (Snowflake, Databricks, BigQuery, DuckDB).
    - «WHERE COUNT(*) > 1» errors; that's what HAVING is for.
    - Aliases work in ORDER BY, not WHERE. (MySQL, SQLite, Databricks allow them in GROUP BY/HAVING; Postgres in GROUP BY; SQL Server in neither. Don't rely on leniency.)
    - «SELECT DISTINCT a ORDER BY b» fails in Postgres (b no longer has one value per row).
    - Windows see only groups surviving HAVING, so «SUM(SUM(x)) OVER ()» (percent of total across groups) is legal.
    - **LIMIT without ORDER BY is non-deterministic**: rows depend on the plan, partitions, engine version (classic flaky test).

    ## ON vs WHERE in outer joins (most tested)
    Same result for inner joins; **different for LEFT joins**:
    «««sql
    -- keeps every dealer; non-approved claims become NULL
    SELECT d.dealer_id, c.claim_id FROM dealers d
    LEFT JOIN claims c ON c.dealer_id = d.dealer_id AND c.status = 'Approved';
    -- silently an INNER join: dealers without approved claims vanish
    SELECT d.dealer_id, c.claim_id FROM dealers d
    LEFT JOIN claims c ON c.dealer_id = d.dealer_id WHERE c.status = 'Approved';
    »»»
    Conditions on the optional (right) table go in **ON**; a WHERE on a right-table column (except «IS NULL») turns the LEFT into an INNER join (optimisers literally rewrite it).

    ## Physical execution
    The optimiser may reorder anything that keeps the result: **predicate pushdown** (filter before joins, into the scan: Parquet row-group skipping, partition pruning), **column pruning** (why «SELECT *» on wide Parquet is costly), **join reordering** by statistics (stale stats → bad plans), **partial aggregation** before the shuffle (why SUM/COUNT scale and exact COUNT(DISTINCT) doesn't), **subquery decorrelation**, constant folding, dead-column elimination. Exception: **non-deterministic functions** («rand()», «now()», «uuid()», «row_number()» over non-unique orders) may be evaluated differently, so the same query can return different rows.

    ## Edge cases
    - «SELECT a, COUNT(*) FROM t» without GROUP BY: error in strict engines; SQLite/old MySQL return an arbitrary «a» (a bug, not a feature).
    - «GROUP BY 1, 2» breaks when columns are reordered: fine ad hoc, avoid in production.
    - ORDER BY inside a subquery/view isn't guaranteed: only the outermost counts.
    - «UNION» dedupes (costly sort/hash; can remove legitimate duplicates); «UNION ALL» doesn't. Default to UNION ALL.
    - No guaranteed left-to-right short-circuit: «x <> 0 AND 10 / x > 1» can still divide by zero → «CASE» (ordered) or «NULLIF(x, 0)».

    **Interview:** clause order and the alias question; LEFT JOIN losing rows (WHERE on the right table); top claim per dealer without a subquery (QUALIFY).
  `),

  nulls: T(`
    > **In one line:** NULL = **unknown/missing**, not 0 or empty. Any comparison with NULL is **UNKNOWN**, and WHERE/ON/HAVING keep only TRUE, which silently drops rows from filters, joins and NOT IN.

    | A | B | A AND B | A OR B | NOT A |
    |---|---|---|---|---|
    | TRUE | UNKNOWN | UNKNOWN | TRUE | FALSE |
    | FALSE | UNKNOWN | FALSE | UNKNOWN | TRUE |
    | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
    - «NULL = NULL» and «NULL <> 5» are UNKNOWN. Use «IS [NOT] NULL» or null-safe «IS [NOT] DISTINCT FROM» (Postgres, Databricks, Snowflake, DuckDB; SQLite «IS / IS NOT»; Spark and MySQL «<=>»).
    - **WHERE keeps only TRUE:** «status <> 'Rejected'» drops NULL statuses ("not yet decided" claims vanish) → «IS DISTINCT FROM» or COALESCE.
    - **CHECK keeps rows unless FALSE:** CHECK «(amount > 0)» accepts NULL (asymmetric with WHERE; an interview gotcha).

    **NOT IN trap:** «id NOT IN (SELECT id FROM toy_b)» returns **zero rows** if the subquery has a NULL («x <> 2 AND x <> 3 AND x <> NULL» is never TRUE). Fix: **NOT EXISTS**, «LEFT JOIN … WHERE b.id IS NULL», or filter NULLs in the subquery. Plain IN with a NULL is harmless.

    | Aggregate | NULL behaviour |
    |---|---|
    | COUNT(*) | Counts all rows |
    | COUNT(col) / COUNT(DISTINCT col) | Non-NULL values only |
    | SUM, AVG, MIN, MAX | Ignore NULLs; SUM of all-NULL or zero rows is **NULL**, not 0 |
    | AVG(col) | sum(non-NULL)/count(non-NULL) ≠ SUM(col)/COUNT(*) |
    - «AVG(approved_amount)» averages only decided claims; "pending = 0" needs «AVG(COALESCE(approved_amount, 0))». Which is right is a **business decision**: say so.
    - Empty dashboard totals show blank → «COALESCE(SUM(x), 0)».
    - «COUNT(col) < COUNT(*)» is a quick completeness check.

    ## Elsewhere
    - **GROUP BY, DISTINCT, UNION/INTERSECT/EXCEPT treat NULLs as equal** (one NULL group).
    - **Joins never match NULL keys:** such rows vanish from inner joins, stay unmatched in outer joins. In Spark, NULL keys also **skew** (all hash to one partition) → filter or salt.
    - **ORDER BY:** NULLs first ascending in SQL Server, MySQL, SQLite; last in Postgres, Oracle → «NULLS FIRST/LAST».
    - **UNIQUE** allows many NULLs in most engines, one in SQL Server; Postgres 15 adds «NULLS NOT DISTINCT».
    - **Windows:** LAG is NULL at partition start; LAST_VALUE doesn't skip NULLs unless «IGNORE NULLS».
    - **Functions:** «COALESCE(a, b, c)» first non-NULL (IFNULL/NVL/ISNULL are 2-arg dialects); «NULLIF(a, b)» guards division («x / NULLIF(y, 0)»); arithmetic and «||» with NULL give NULL («CONCAT» often and «CONCAT_WS» always skip NULLs); «WHERE NOT is_active» drops NULLs too.

    **Design:** document what NULL means per column (unknown, not applicable, not yet happened; don't overload one NULL). Map NULL foreign keys to an **"Unknown" member** (key -1) so facts survive inner joins. **Sentinels** («1900-01-01», «-999») are worse than NULL: they pass filters and corrupt averages.

    **Interview:** «COUNT(*), COUNT(x), AVG(x)» with NULLs; why NOT IN returns nothing and the rewrite; NULL keys on both sides of an inner join produce **zero** rows.
  `),

  joinsdeep: T(`
    > **In one line:** a join pairs rows meeting a condition; output size isn't bounded by either input (each left row repeats per match). Knowing **cardinality (fan-out)**, **semi/anti joins** and **join algorithms** is what lets you debug a doubled revenue number.

    | Join | Returns |
    |---|---|
    | INNER | Matching pairs |
    | LEFT | All left rows; right columns NULL if no match |
    | RIGHT | Mirror of LEFT (rewrite as LEFT) |
    | FULL | All rows from both; NULLs where unmatched |
    | CROSS | Every pair (m × n): date spines, small parameter tables |
    | SEMI (EXISTS/IN, Spark «left_semi») | Left rows with ≥ 1 match, **never duplicated**, left columns only |
    | ANTI (NOT EXISTS, Spark «left_anti») | Left rows with no match |
    | Self | Table to itself (hierarchies, row comparisons) |
    | Non-equi / range | «<», «BETWEEN» (as-of joins, SCD2 lookups, buckets) |
    | LATERAL / CROSS APPLY | Subquery evaluated per left row (top-N per row) |

    ## Cardinality and fan-out
    - **1:1 and N:1** (fact → dimension) keep the fact row count: the safe direction.
    - **1:N and M:N multiply rows:** orders (1) → order_lines (5) → shipments (2) = 10 rows per order, so «SUM(order_total)» is 10× too high (**fan-out / chasm trap**).
    - **Detect:** COUNT(*) before vs after; assert the dimension key is unique («COUNT(*) = COUNT(DISTINCT key)»; dbt «unique» tests exist for this).
    - **Fix:** aggregate children to the parent grain first; join only on unique keys; use EXISTS when you only need existence.
    - «COUNT(DISTINCT order_id)» after a fan-out fixes counts, **not sums**; DISTINCT sprinkled in a query suggests an unresolved fan-out.
    - Most common real case: an **SCD2 dimension joined without an as-of condition**.

    **Semi/anti:** EXISTS returns each dealer once regardless of claim count (an INNER JOIN returns it per claim). IN (subquery) is a semi join; **NOT IN is not a safe anti join** (NULL trap), NOT EXISTS is. Engines stop at the first match: cheaper than join + DISTINCT.

    ## Join algorithms
    | Algorithm | How | Best when | Cost |
    |---|---|---|---|
    | Nested loop | Per left row, scan or index-seek the right | Tiny side or indexed inner side; only option for arbitrary non-equi | O(n·m); O(n log m) with index |
    | Hash | Build hash on smaller input, probe with larger | Equi-joins, unsorted, build side fits memory | O(n+m); spills if too big |
    | Sort-merge | Sort both, walk together | Both large, pre-sorted/bucketed; Spark's big-big default | O(n log n + m log m); streams, huge data |
    | Broadcast hash (distributed) | Copy small table to every worker | Small side (Spark default 10 MB, often raised to ~100 MB+) | No shuffle of the big side |
    | Shuffle hash / sort-merge (distributed) | Repartition both by key | Both large | Full shuffle of both |
    OLTP leans on index nested loops; analytics on hash and sort-merge; distributed engines add broadcast vs shuffle.

    **Range joins at scale:** «e.ts BETWEEN w.start AND w.end» can't be hashed → nested loop / cartesian (Spark BroadcastNestedLoopJoin), explosive on big tables. Fix: add an **equi condition on a coarse bucket** (day/hour), use **as-of joins** (DuckDB «ASOF JOIN», Databricks range-join hints), or a window over a union of both tables.

    ## Edge cases
    Different key types («'00123'» vs «123») → implicit casts, missed matches, full scans. Trailing spaces and case («'ABC '» ≠ «'ABC'» except in PAD SPACE collations of SQL Server/MySQL) → normalise at ingestion. **FULL OUTER JOIN + COALESCE(a.key, b.key)** is the reconciliation pattern (NULL keys appear twice). «USING (id)» outputs one id column (in FULL JOIN effectively COALESCE). Streaming joins need **watermarks** to drop state.

    **Interview:** A (4 rows) × B (5 rows) INNER JOIN → anything from 0 to 20; revenue doubled after a join → fan-out, prove with counts, aggregate first; semi vs inner (duplication, columns); Spark broadcast vs sort-merge → size estimate vs «spark.sql.autoBroadcastJoinThreshold», hints, AQE at runtime.
  `),

  aggdeep: T(`
    > **In one line:** aggregation collapses rows into one per group. Senior questions: **grain**, **conditional aggregation** (many metrics in one pass), **multi-level totals**, the **cost of exact distinct counts**, and **which aggregates combine** across partitions and time.

    **GROUP BY rules:** every SELECT item is a group key, an aggregate, or a function of keys (Postgres allows functionally dependent columns when grouping by a PK). Group by the **key, not the label** (two dealers named the same would merge: group by «dealer_id, dealer_name»). WHERE filters rows before grouping (cheaper); HAVING filters groups.

    **Conditional aggregation** (one scan, many metrics; also portable pivoting):
    «««sql
    SELECT dealer_id, COUNT(*) AS claims,
           SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END)          AS approved,
           SUM(CASE WHEN status = 'Rejected' THEN claim_amount END)      AS rejected_value,
           AVG(CASE WHEN status <> 'Submitted' THEN approved_amount END) AS avg_decided
    FROM claims GROUP BY dealer_id;
    »»»
    Standard alternative: «COUNT(*) FILTER (WHERE …)» (Postgres, SQLite 3.30+, DuckDB, Spark 3+). A CASE without ELSE yields NULL, which aggregates skip: that's how «AVG(CASE …)» averages only matching rows.

    | Construct | Produces |
    |---|---|
    | «ROLLUP (region, dealer)» | (region, dealer), (region), () = subtotals + grand total |
    | «CUBE (region, status)» | Every combination |
    | «GROUPING SETS ((region), (status), ())» | Exactly those sets |
    One pass instead of several UNION ALLs. Subtotal rows have NULL in rolled-up columns; «GROUPING(col) = 1» tells them apart from real NULLs.

    | Kind | Example | Sum across? |
    |---|---|---|
    | Additive | Revenue, quantity | Everything, incl. time |
    | Semi-additive | Inventory, balance | Across plants/parts, **not time** (last value or period average) |
    | Non-additive | Ratios, percentages, distinct counts, medians | Nothing: store components and recompute |
    "Average of averages" is wrong unless groups are equal size → «SUM(x)/SUM(n)». **Distinct counts don't add up** (7 daily-active counts ≠ weekly active): store raw keys, a mergeable **HyperLogLog** sketch, or recompute per grain.

    **Distinct counts at scale:** exact COUNT(DISTINCT) needs all values together per group (full shuffle, big hash sets); several in one query multiply work (Spark expands rows per distinct aggregate). **approx_count_distinct** (HyperLogLog++, ~1-2% error, KBs per group, mergeable across partitions and days) for dashboards/monitoring; exact for billing and finance. Same for percentiles: exact «percentile_cont» sorts; «approx_percentile» (t-digest) scales.

    **Partial aggregation:** engines compute local partials (sum, count, min, max; AVG as sum+count; HLL) per partition, shuffle the small partials, combine: these scale linearly. **Median, exact distinct, mode** don't decompose, so you can predict which queries will be slow.

    ## Edge cases
    Grouping by a nullable column creates one big NULL group (skew, confusing reports) → label "Unknown". **Integer division** («SUM(approved)/COUNT(*)» = 0 in Postgres/SQL Server/SQLite) → multiply by 1.0 or cast. **Float sums aren't associative** (different partitioning, different last digits) → DECIMAL for money, tolerance in reconciliation. **Empty groups don't exist** → start from the dimension or a date spine and LEFT JOIN to show zeros. HAVING without GROUP BY treats the table as one group.

    **Interview:** approved/rejected/total per dealer in one query; why daily distincts don't sum to monthly and how to make it fast (HLL); subtotals + grand total (ROLLUP + GROUPING).
  `),

  windows: T(`
    > **In one line:** a window function computes a value **per row** from related rows **without collapsing** them, defined by «PARTITION BY» (which rows belong together), «ORDER BY» (their order) and a **frame** (which rows count for this one). Frame defaults catch even experienced people.

    «««sql
    SUM(claim_amount) OVER (
      PARTITION BY dealer_id                       -- independent groups
      ORDER BY submitted_at, claim_id              -- order (with tie-breaker)
      ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)    -- this row + 6 before
    »»»
    | Family | Functions | Uses frame? |
    |---|---|---|
    | Ranking | ROW_NUMBER, RANK, DENSE_RANK, NTILE, PERCENT_RANK, CUME_DIST | No |
    | Offset | LAG(x, n, default), LEAD | No |
    | Value | FIRST_VALUE, LAST_VALUE, NTH_VALUE | **Yes** |
    | Aggregate | SUM/AVG/COUNT/MIN/MAX OVER | **Yes** (whole partition without ORDER BY) |

    | Scores | 100 | 90 | 90 | 80 |
    |---|---|---|---|---|
    | ROW_NUMBER | 1 | 2 | 3 (arbitrary 90) | 4 |
    | RANK | 1 | 2 | 2 | 4 |
    | DENSE_RANK | 1 | 2 | 2 | 3 |
    ROW_NUMBER for **dedupe/pick one** (with a deterministic tie-breaker); RANK/DENSE_RANK for leaderboards.

    ## Frame traps
    - ORDER BY with no frame = «RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW»: RANGE includes **all peers** (same ORDER BY value), so tied timestamps share a running total → use **ROWS** for row-by-row totals.
    - «LAST_VALUE(x) OVER (PARTITION BY k ORDER BY t)» returns the **current row** (frame ends there) → «ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING», or FIRST_VALUE descending.
    - No ORDER BY → whole partition («SUM(x) OVER (PARTITION BY k)» = group total on every row; percent-of-total).
    - «ROWS 6 PRECEDING» = last 7 **rows**, which is 7 days only with exactly one row per day and no gaps → «RANGE BETWEEN INTERVAL 6 DAYS PRECEDING AND CURRENT ROW» (Postgres, Spark with numeric/day ordering, DuckDB) or a **date spine** first.

    **Determinism:** «ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at)» with ties picks arbitrarily, possibly differently per run or Spark partition. Non-deterministic dedupe isn't idempotent → always add a **unique tie-breaker** (event_id, offset, LSN).

    ## Performance
    - Each partition must be co-located and sorted: in Spark a shuffle + sort per distinct window spec (identical specs share one).
    - **No PARTITION BY = everything on one task** («ROW_NUMBER() OVER (ORDER BY ts)» on a billion rows uses one core) → «monotonically_increasing_id» or a partitioned rank if you only need uniqueness.
    - A giant group (one engine with 90%, or NULL) → skew and spill.
    - "Latest value per key" → **max_by/arg_max** (Spark «max_by», DuckDB «arg_max», BigQuery «ANY_VALUE … HAVING MAX») aggregates without sorting.

    **Built on windows:** dedupe/latest (ROW_NUMBER = 1), top-N (DENSE_RANK <= N), change detection («x <> LAG(x)»), durations («LEAD(ts) - ts»), running totals and moving averages (cumulative distinct isn't directly supported), gaps and islands, sessions, percent of total («x / SUM(x) OVER ()»).

    **Interview:** RANK vs DENSE_RANK and why ROW_NUMBER is risky for dedupe; LAST_VALUE returning the current row; 7-day average with missing days; a window running on one executor.
  `),

  ctes: T(`
    > **In one line:** subqueries and CTEs build a query in named steps. **Correlated** subqueries run (logically) per outer row; **CTEs** may or may not be materialised depending on the engine; **recursive CTEs** walk hierarchies and generate series.

    | Subquery | Example | Notes |
    |---|---|---|
    | Scalar | «(SELECT MAX(x) FROM t)» | ≤ 1 row; more = runtime error, none = NULL |
    | Derived table | «FROM (SELECT …) s» | Usually needs an alias |
    | IN / EXISTS | «id IN (SELECT …)» | Semi join |
    | Correlated | «amount > (SELECT AVG(amount) FROM claims c2 WHERE c2.dealer_id = c1.dealer_id)» | Usually decorrelated into join + aggregate; if not, O(n²) |

    **CTEs** («WITH decided AS (…), per_dealer AS (…) SELECT …»): one named step each, exactly how dbt models are written (import CTEs, logic CTEs, final select).
    - **Materialised or inlined?** Postgres ≤ 11 always materialised (an "optimisation fence": no predicate pushdown); Postgres 12+ inlines single-use CTEs («MATERIALIZED / NOT MATERIALIZED» to choose). Spark, Snowflake, BigQuery **inline**: a CTE used 3 times may be **computed 3 times**.
    - CTEs add clarity, not speed. Reused and expensive → materialise deliberately (temp table, «cache()», intermediate dbt model).

    **Recursive CTEs:**
    «««sql
    WITH RECURSIVE chain AS (
      SELECT emp_id, name, manager_id, 0 AS depth, name AS path
      FROM employees WHERE manager_id IS NULL                       -- anchor
      UNION ALL
      SELECT e.emp_id, e.name, e.manager_id, c.depth + 1, c.path || ' > ' || e.name
      FROM employees e JOIN chain c ON e.manager_id = c.emp_id)   -- recursive step
    SELECT * FROM chain;
    »»»
    - Anchor + a member joined to the CTE itself, repeated until it returns no rows.
    - Uses: org charts, **bills of materials** (quantities multiplied down engine → assemblies → parts), dependency/lineage graphs, date series.
    - **Cycles** (A→B→A, bad BOM data) recurse forever → depth limit, path check («path NOT LIKE '%/' || id || '/%'»), or the standard «CYCLE» clause (Postgres 14+).
    - **Spark SQL supports recursive CTEs from Spark 4.1** (Databricks Runtime 17+ first); older Spark: an iterative loop of joins from Python until no new rows, or GraphFrames. Spark also caps recursion depth/rows by config; still add a depth limit.

    **Choose:** compare each row to a group statistic → a **window** («AVG(x) OVER (PARTITION BY k)»), usually clearer and faster than a correlated subquery; existence → EXISTS/NOT EXISTS; reusable step → CTE (materialise if costly); hierarchy or series → recursive CTE (or a calendar table).

    **Interview:** claims above their dealer's average (window vs correlated); manager chain + "what if there's a cycle?"; "is a CTE materialised?" (depends on the engine: name it).
  `),

  patterns: T(`
    > **In one line:** most real SQL problems are one of ~10 patterns. Recognise it, then handle ties, NULLs, gaps, late rows and cost at scale.

    **1. Latest row per key (dedupe)**
    «««sql
    SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id
             ORDER BY updated_at DESC, event_id DESC) rn FROM raw_orders_feed) WHERE rn = 1;
    »»»
    Unique tie-breaker; decide where NULL «updated_at» sorts; in CDC pick the latest **then** drop it if it's a tombstone (delete). At scale «max_by(struct(…), updated_at)» avoids a full sort.

    **2. Top-N per group:** DENSE_RANK <= N (keep ties) or ROW_NUMBER <= N (exactly N). With LATERAL/CROSS APPLY + an index, top-3 per dealer becomes index seeks.

    **3. Gaps and islands** (consecutive running days, consecutive hot readings):
    «««sql
    WITH r AS (SELECT engine_id, day,
             julianday(day) - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY day) AS grp
           FROM engine_daily_status WHERE is_running = 1)
    SELECT engine_id, MIN(day), MAX(day), COUNT(*) FROM r GROUP BY engine_id, grp;
    »»»
    Inside a run, date and row_number both rise by 1, so their difference is constant. **Gaps** = «LEAD(day) - day > 1». For non-date sequences and **state islands** (running/stopped/running): flag rows where state ≠ «LAG(state)», then «SUM(flag) OVER (ORDER BY …)» is the group id.

    **4. Sessionization** (new session after a 30-min gap): «gap = ts − LAG(ts)»; «new = gap IS NULL OR gap > 30 min»; «session_no = SUM(new) OVER (PARTITION BY user ORDER BY ts ROWS UNBOUNDED PRECEDING)». Streaming uses **session windows** with a watermark; late events can **merge two sessions** (batch recomputes; streams need state).

    **5. Running totals, moving averages, YoY:** explicit frames; «LAG(x, 12)» on months is YoY **only if every month exists** → calendar spine first.

    **6. Pivot/unpivot:** pivot via conditional aggregation or «PIVOT»; unpivot via UNION ALL per column, CROSS JOIN to a values list, «UNPIVOT» or Spark «stack()». Wide sensor tables are stored long (engine, ts, sensor, value) and pivoted back for ML features.

    **7. As-of (point-in-time) join:** SCD2 lookup «f.key = d.key AND f.ts >= d.valid_from AND f.ts < d.valid_to» (**half-open** to avoid boundary double matches). Last-known value: join «r.ts <= a.ts», then ROW_NUMBER by «r.ts DESC» per alert; range joins explode, so bucket by time or use «ASOF JOIN». **Mandatory for ML training sets**: features "as of now" joined to past labels leak the future.

    **8. Reconciliation:** FULL OUTER JOIN on key + COALESCE + a status column (only_in_source / only_in_target / mismatch / match), or EXCEPT both ways; hash wide rows instead of comparing every column.

    **9. Funnel and cohort:** funnel = per entity, min timestamp per stage (conditional aggregation), count entities reaching each stage in order (CRF → SR → PIR → claim → credit note); cohort = assign each entity to its first period, count activity by (cohort, periods since start).

    **10. Median/percentiles:** «PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)» (Postgres), «percentile_approx» (Spark), or row_number/count arithmetic. Median isn't mergeable.

    **Interview:** they give a pattern, then twist it: missing days, ties, late events, 5 TB.
  `),

  plans: T(`
    > **In one line:** «EXPLAIN» shows the chosen **physical plan** (access paths, join algorithms, order, estimated rows); «EXPLAIN ANALYZE» runs it and shows **actual** rows and time. Reading plans and writing **sargable** predicates is how you fix slow SQL instead of guessing.

    | Signal | Meaning |
    |---|---|
    | Full scan on a big table with a selective filter | Missing index or non-sargable predicate |
    | Estimated ≪ or ≫ actual rows | **Stale statistics** or correlated columns: plan built for the wrong size (ANALYZE) |
    | Nested loop, large outer side, no index | O(n·m): "the query hangs" |
    | Hash join spilling (batches > 1, temp files) | Build side doesn't fit memory |
    | Sort "external merge" | Sort spilled to disk |
    | Spark «Exchange hashpartitioning» | A shuffle |
    | Spark FileScan «PartitionFilters / PushedFilters» | Pruning/pushdown working; empty when expected = problem |
    | Spark «BroadcastNestedLoopJoin / CartesianProduct» | Non-equi join; dangerous at size |

    **Sargable** (Search ARGument ABLE): indexes, partition pruning and min/max stats work only when the column is **bare** on one side.
    | Not sargable | Rewrite |
    |---|---|
    | «date(submitted_at) = '2026-11-01'» | «submitted_at >= '2026-11-01' AND submitted_at < '2026-11-02'» |
    | «YEAR(build_date) = 2025» | «build_date >= '2025-01-01' AND build_date < '2026-01-01'» |
    | «amount * 1.18 > 1000» | «amount > 1000 / 1.18» |
    | «UPPER(serial_no) = 'ESN123'» | Store normalised or index «UPPER(serial_no)» |
    | «name LIKE '%pune'» | Full-text, reversed column or search index |
    | «CAST(dealer_code AS INT) = 14» | Compare in the column's own type |
    | «col1 = 5 OR col2 = 7» | Often a scan; UNION ALL of two indexed lookups (OLTP) |
    Lakehouse partitions too: «to_date(event_ts) = …» on an «event_date»-partitioned table won't prune unless derivable (Delta **generated columns** can) → filter the partition column itself.

    **Indexes vs pruning:** B-trees serve equality, ranges, ORDER BY, leftmost prefix («(dealer_id, submitted_at)» helps «dealer_id = ?» and «dealer_id = ? AND submitted_at > ?», not «submitted_at > ?» alone); covering indexes allow index-only scans; indexes cost writes/storage and rarely help low-selectivity columns. Warehouses/lakehouses skip data via **partition pruning, per-file min/max stats, clustering/Z-order/liquid clustering, bloom filters, result caches**.

    **Statistics:** cost-based optimisers estimate rows from row counts, distinct values, NULL fraction, histograms, min/max. Wrong estimates → wrong join order and algorithm. Causes: loads since the last ANALYZE, skew (one dealer with 80%), correlated predicates («city = 'Pune' AND region = 'West'» treated as independent). Spark: «ANALYZE TABLE … COMPUTE STATISTICS» feeds the CBO; **AQE** re-plans at runtime with real sizes.

    ## Method for a slow query
    1. Plan with actuals (EXPLAIN ANALYZE, Spark UI SQL tab, Snowflake/Databricks profile).
    2. Find the operator with the most time/rows; compare estimated vs actual.
    3. Ask: data read that should be skipped? Join exploding? Shuffle/sort spilling? One task doing most work (skew)?
    4. Fix the cause: sargable predicate, stats, index/clustering, pre-aggregate, broadcast, salting, join key.
    5. Measure again; keep before/after numbers (your interview story).

    **Interview:** «DATE(created_at)» filter is slow → not sargable; composite (a, b) index questions; estimated 100 vs actual 10M → stale stats → wrong join choice.
  `),

  isolation: T(`
    > **In one line:** the **isolation level** decides which interference anomalies concurrent transactions can cause; implemented with **locks** and/or **MVCC**. Delta/Iceberg bring the same ideas to files: **snapshot isolation + optimistic concurrency**.

    | Anomaly | What happens |
    |---|---|
    | Dirty read | Read uncommitted data later rolled back |
    | Non-repeatable read | Same row, different value on re-read (someone committed between) |
    | Phantom | Same range query returns new rows |
    | Lost update | Both read balance 100, both add 50, both write 150 |
    | Write skew | Each checks a condition on overlapping data and writes different rows; together they break the rule (both on-call engineers go off-call) |

    | Level | Dirty | Non-repeatable | Phantom | Notes |
    |---|---|---|---|---|
    | Read uncommitted | yes | yes | yes | Rare |
    | Read committed | no | yes | yes | **Default: Postgres, SQL Server, Oracle** |
    | Repeatable read | no | no | ANSI: yes | **MySQL InnoDB default** (gap locks block most phantoms) |
    | Snapshot | no | no | no | Postgres "repeatable read" is snapshot; SQL Server SNAPSHOT; **write skew still possible** |
    | Serializable | no | no | no | Equals some serial order; Postgres SSI; costly, aborts need retries |

    **MVCC:** each write creates a version stamped with the transaction ID; readers use a **snapshot** of versions committed before they started, so readers and writers never block each other. Old versions are garbage-collected (Postgres VACUUM; long transactions cause bloat). Delta = MVCC on files: commits add/remove files, readers read a version, VACUUM deletes old files.

    **Preventing lost updates:** atomic update («SET qty = qty - 5 WHERE id = 1 AND qty >= 5»); pessimistic «SELECT … FOR UPDATE»; **optimistic** version check («UPDATE … WHERE version = :v», retry if 0 rows), which is what Delta/Iceberg do per table: commit N+1 only if no conflicting commit happened, else re-check and retry or fail.

    ## Why a data engineer cares
    - **Long OLTP extracts** under read committed see a moving target → snapshot isolation, a replica, or CDC with a consistent start (Debezium snapshot + log position).
    - **«updated_at > watermark»** misses rows from transactions that started before but committed after the extract (earlier timestamp) → **lookback overlap + dedupe**, or log-based CDC.
    - **Two writers on one Delta table** (streaming MERGE + nightly backfill) → «ConcurrentAppendException», «ConcurrentDeleteReadException» → disjoint partitions in conditions, row-level concurrency (deletion vectors + row tracking on recent Databricks), or serialise writers.
    - **DELETE + INSERT in two transactions** leaves the table briefly empty → one transaction, INSERT OVERWRITE, or swap/rename.

    **Interview:** Postgres default (read committed) and what can go wrong; two jobs updating one counter; how Delta handles concurrent writers.
  `),

  dml: T(`
    > **In one line:** «MERGE» (upsert) applies changes atomically (update matched, insert new, optionally delete). It powers incremental loads, CDC apply and SCD2, with strict rules: **unique source keys, deterministic conditions, clause order, cost at scale**.

    «««sql
    MERGE INTO silver.orders t USING staged_changes s ON t.order_id = s.order_id
    WHEN MATCHED AND s.op = 'D' THEN DELETE
    WHEN MATCHED AND s.updated_at > t.updated_at THEN UPDATE SET *
    WHEN NOT MATCHED AND s.op <> 'D' THEN INSERT *
    -- Databricks: WHEN NOT MATCHED BY SOURCE THEN DELETE (full sync)
    »»»
    Clauses evaluate **in order; the first match wins**. «s.updated_at > t.updated_at» makes the apply **monotonic**: replayed or out-of-order older changes can't overwrite newer state (idempotent CDC).

    ## Rules that break pipelines
    1. **One source row per target row:** two matches → "multiple source rows matched" error (standard, Delta, Snowflake default, SQL Server) → dedupe the source to the latest per key by sequence.
    2. **Deterministic ON:** matching on a non-unique column (name) updates many rows.
    3. **NULL keys never match** → inserted every run → duplicates. Filter/quarantine.
    4. **CDC deletes:** soft deletes need downstream filters; hard deletes let a late update **resurrect** the row unless you keep tombstones for a while.
    5. **Schema drift:** «UPDATE SET *» with a new source column fails or is ignored unless «mergeSchema»/«autoMerge». Decide deliberately.

    ## MERGE at scale
    - Delta/Iceberg MERGE = join source to target, find affected **files**, rewrite them (copy-on-write) or write **deletion vectors** (merge-on-read). **Cost follows files touched, not rows changed.**
    - Scattered keys rewrite most files every run → partition/cluster by the column the source is filtered on (event date for late events) and add it to ON («AND t.event_date = s.event_date») so files prune.
    - Broadcast a small source; the target prunes by stats. Low Shuffle Merge, deletion vectors and liquid clustering (Databricks) cut rewrites. OPTIMIZE regularly (MERGE leaves small files).

    | Alternative | When |
    |---|---|
    | Partition overwrite (INSERT OVERWRITE / replaceWhere) | Runs recompute whole partitions (daily facts); simpler, often cheaper |
    | Append + dedupe view | Very high write rate; readers accept a "latest per key" view or compaction |
    | Delete + insert in **one** transaction | Engines without MERGE |
    | Full rebuild + swap (CTAS) | Small/medium tables, logic changes |
    | UPDATE | Few rows; a mass UPDATE rewrites as much as MERGE |

    **Big OLTP deletes:** one 50M-row DELETE holds locks, bloats the log, blocks replication → loop in batches («… LIMIT 10000»), new table + swap, or **drop partitions** (time partitioning makes retention instant).

    **SCD2 in one MERGE:** source = union of (changed rows with the real key → expire current versions) and (same rows with a NULL merge key → never match → inserted as new current versions). Or two steps in one transaction.

    **Interview:** CDC MERGE with inserts/updates/deletes safe under replays; "multiple source rows matched" fix; 2-hour MERGE for 50k changes on 5 TB → scattered files; prune by partition/cluster; deletion vectors.
  `),

  sqltypes: T(`
    > **In one line:** most "numbers don't match" incidents are type problems: **floats for money, integer division, timestamps without zones, implicit casts, collation, wrongly parsed dates**. Choose types deliberately in the contract.

    | Type | Use | Trap |
    |---|---|---|
    | INTEGER/BIGINT | Counts, IDs | INT max ≈ 2.1 billion (use BIGINT for event IDs, big sums); integer division truncates |
    | DECIMAL(p, s) | **Money, values that must reconcile** | Precision overflow; division scale rules differ; two DECIMAL(38,18) multiplied can lose scale in Spark |
    | FLOAT/DOUBLE | Measurements, ML features | 0.1 + 0.2 ≠ 0.3; sums depend on order, so distributed totals vary in the last digits |
    DOUBLE totals compared with «=» fail randomly → DECIMAL or a tolerance. AVG of integers returns an integer in some engines (SQL Server). **Rounding:** SQL «ROUND(2.5)» = 3 (half away from zero), Python «round(2.5)» = 2 (banker's): a common cause of SQL vs Python check mismatches.

    **Strings:** **collation** decides equality/sort: case-insensitive defaults (SQL Server, MySQL) make «'ESN1' = 'esn1'» true; Postgres, Spark, SQLite are case-sensitive, so moving data changes joins. Trailing/non-breaking/zero-width spaces and Unicode forms make "identical" keys differ → normalise (trim, upper, NFC) in silver. VARCHAR(n) truncates or errors when sources widen. **Leading zeros** («'00123'» → 123): part numbers and postal codes are strings.

    | Type | Meaning |
    |---|---|
    | DATE | A calendar day, no zone |
    | TIMESTAMP WITHOUT TIME ZONE («TIMESTAMP_NTZ») | Wall-clock reading; zone implied |
    | TIMESTAMP WITH TIME ZONE («timestamptz», Spark TIMESTAMP = LTZ) | An instant, stored UTC, shown in session zone |
    - **Store instants in UTC**; convert for display or business-day logic.
    - **Business day vs UTC day:** 01:30 IST on 2 Nov = 20:00 UTC on 1 Nov, so a UTC-partitioned table puts it on the "wrong" Indian day → derive the business day explicitly.
    - **DST** (US/Europe, where Cummins operates): 23/25-hour days, repeated or missing hours, so local hourly aggregates gain/lose an hour.
    - **Spark session time zone** («spark.sql.session.timeZone») changes parsing/display → set it (usually UTC) in every job.
    - **Parsing:** «03/04/2026» is ambiguous → explicit formats; reject ambiguous input.
    - **Epoch units:** s vs ms vs µs (Kafka ms, Debezium often µs); a 1000× error lands in 1970 or year 57000.

    **Implicit casts:** «dealer_code = 14» on a string column casts every row (no index, slow) or stops «'014'» matching. **Spark ANSI mode** (default **true** in Spark 4) raises on invalid casts/overflow instead of returning NULL, so jobs can start failing after upgrades: good, but plan for it.
    **Booleans:** map «'false'», «'N'», «0», «''» explicitly. **JSON:** integers over 2^53 lose precision in JavaScript/double parsers → keep IDs as strings.

    **Interview:** money as float (no: DECIMAL, Spark «DecimalType(18, 2)» or larger); Spark vs Python totals differing by 0.0000003 (float order, rounding); 1:30 am Pune claim on the previous day (UTC partitioning).
  `),
};
