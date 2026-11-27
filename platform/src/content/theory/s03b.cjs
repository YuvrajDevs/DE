const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Facts
  facts: T(`
    > **In one line:** a **fact table** records **measurable business events or states** at a declared grain: numbers you sum, count or average (amounts, quantities, durations), plus foreign keys to the dimensions that describe them. Facts are long and narrow; they hold most of the rows in a warehouse.

    ## What goes in a fact table
    - **Foreign keys** to dimensions: date_key, dealer_key, engine_key, part_key.
    - **Measures:** claim_amount, approved_amount, qty, days_to_decision.
    - **Degenerate dimensions:** identifiers with no attributes of their own, stored on the fact: claim_id, invoice_number.
    - **Audit columns:** load timestamp, source, batch id.
    Descriptive text (dealer name, region) does **not** go here; it lives in dimensions.

    ## The three classic fact table types
    | Type | Grain | Rows change? | Example | Typical questions |
    |---|---|---|---|---|
    | **Transaction** | One row per event | No (append) | One row per claim submitted, per sensor reading, per invoice line | Totals, counts, trends |
    | **Periodic snapshot** | One row per entity per period | No (new row each period) | Stock per part per warehouse per day; open claims per dealer per month-end | Levels over time, balances |
    | **Accumulating snapshot** | One row per process instance, updated as milestones happen | **Yes** (updated) | One row per claim with submitted_date, assessed_date, approved_date, paid_date | Cycle times, bottlenecks, pipeline stages |
    Also: **factless facts** (events with no measure, e.g. "engine attended training", "part was eligible for promotion"), counted with COUNT(*); and **aggregate facts** (pre-summarised for performance).

    ## Additivity (again, because it is where errors live)
    - **Additive:** sum across every dimension (amount, qty).
    - **Semi-additive:** sum across some dimensions, not time (balances, stock levels). Over time use end-of-period or average.
    - **Non-additive:** ratios, percentages, unit prices, distinct counts. Store the additive components (numerator, denominator) and compute the ratio at query time.

    ## Designing a fact table: decisions
    1. Business process (claims, sensor telemetry, inventory).
    2. Grain (one row per …), and the fact type.
    3. Dimensions that apply at that grain (date, dealer, engine, part).
    4. Measures that are true at that grain.
    5. How late or corrected data is handled (restatements, adjustments as new rows vs updates).
    6. Physical: partition by date, cluster by the most common filter key, file sizes.

    ## Edge cases and what goes wrong
    - **Late-arriving facts:** a claim from last month arrives today. Partition by event date, reprocess affected partitions; snapshots may need restating.
    - **Corrections:** a claim amount is corrected. Options: update in place (simple, loses history), or **insert a reversing/adjusting row** (finance-friendly, auditable).
    - **Duplicates** from at-least-once ingestion: dedupe on the business key before or during load.
    - **Unknown dimension members:** map to -1 "Unknown", never drop the fact.
    - **Accumulating snapshot updates** in a lakehouse mean MERGE/rewrites; keep the table small (current process instances) or partition smartly.
    - **Mixing fact types** (adding daily snapshots into a transaction fact) breaks every sum.

    ## At scale
    Fact tables are the billions-of-rows tables. Their physical design dominates cost: partition by date, cluster by high-use keys, keep measures numeric and narrow, avoid wide text columns, build aggregate facts for heavy dashboards, and process incrementally.

    ## How interviewers test this
    - "Name the three fact table types with examples." Transaction, periodic snapshot, accumulating snapshot.
    - "Where would you store claim approval rate?" Store counts (claims, approved) and compute the rate.
    - "How do you handle a correction to a fact?" Update vs adjustment row, and why finance prefers adjustments.
  `, {
    check: [
      match('Match the fact table type to the example.', [['Transaction', 'One row per sensor reading'], ['Periodic snapshot', 'Stock per part per warehouse per day'], ['Accumulating snapshot', 'One row per claim with submitted, approved and paid dates'], ['Factless', 'Engine attended a recall campaign (no measure)']], 'Each answers a different kind of question.'),
      mcq('Which table type is updated after rows are first inserted?', ['Transaction fact', 'Periodic snapshot', 'Accumulating snapshot', 'Factless fact'], 2, 'Its milestone dates fill in as the process progresses.'),
      tf('Storing the approval rate percentage in a daily fact and averaging it for the month gives the monthly approval rate.', false, 'Non-additive. Store numerator and denominator and compute the ratio at query time.'),
    ],
    hands: [
      sql({ q: '**Semi-additive measure.** «inventory» is a periodic snapshot (one row per plant per part per snapshot_date). Return the **total units on hand per plant at the latest snapshot date** (not summed across dates): «plant_id, units». Sort by «plant_id».', tables: ['inventory'], level: 2,
        solution: `SELECT plant_id, SUM(qty_on_hand) AS units
FROM inventory
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM inventory)
GROUP BY plant_id
ORDER BY plant_id;`,
        hint: 'Filter to the latest snapshot_date with a subquery, then sum across parts per plant.' }),
    ],
  }),

  // ================================================================== Dimensions
  dims: T(`
    > **In one line:** a **dimension table** describes the **who, what, where, when and how** of facts: dealers, engines, parts, dates, statuses. Dimensions are short and wide, full of descriptive text, and they are what users **filter, group and label** by.

    ## What goes in a dimension
    - **Surrogate key** (PK): dealer_key.
    - **Natural key:** dealer_code from the source.
    - **Descriptive attributes**, flattened: dealer_name, city, region, country, segment, opened_date.
    - **Hierarchies** inside the same row: city → region → country.
    - **SCD columns** if history is kept: valid_from, valid_to, is_current, version.
    - **Special members:** -1 Unknown, -2 Not applicable.

    ## Kinds of dimensions you should know
    | Kind | What | Example |
    |---|---|---|
    | **Conformed** | Shared, identical meaning across fact tables and marts | dim_date, dim_dealer used by claims, sales, service facts |
    | **Date / time** | Pre-built calendar with fiscal periods, holidays, weekday flags | dim_date with fiscal_quarter |
    | **Role-playing** | One physical dimension used in several roles | dim_date as submitted_date, approved_date, paid_date |
    | **Junk** | Combines several low-cardinality flags into one small dimension | is_goodwill, is_recall, channel |
    | **Degenerate** | ID with no attributes, kept on the fact | claim_id |
    | **Slowly changing** | Attributes change over time with a history policy | dealer region |
    | **Mini-dimension** | Frequently changing attributes split off from a huge dimension | customer credit band |
    | **Outrigger** | A dimension referenced by another dimension | dim_engine → dim_plant (use sparingly) |
    | **Bridge table** | Resolves M:N between a fact and a dimension | claim ↔ multiple failure codes, with weighting |

    ## Why a date dimension, when every engine has date functions?
    - Fiscal calendars, working days, holidays, plant shutdown weeks are business rules, not functions.
    - Consistent labels ("FY26 Q3") everywhere.
    - BI tools work naturally with it.
    - Cheap: 20 years × 365 rows.

    ## Conformed dimensions: the glue of the warehouse
    If the claims mart and the sales mart each build their own dealer table with different region rules, "claims per sales rupee by region" is meaningless. **One** dim_dealer, owned and reused, makes facts from different processes comparable (drill-across). This is the heart of Kimball's bus matrix and of "certified data products".

    ## Edge cases and what goes wrong
    - **Dimension with duplicate natural keys** (two current rows for dealer 14) fans out every fact join. Test: one current row per natural key.
    - **Attributes that change constantly** (engine running hours) do not belong in a dimension; they are facts or snapshot measures.
    - **Huge dimensions** (millions of customers with SCD2) need careful design: mini-dimensions, clustering.
    - **NULL attributes** make "group by region" show a blank group; use explicit "Unknown"/"Not provided" labels.
    - **Late-arriving dimension members:** a fact references a dealer not yet in the dimension; insert an inferred member (natural key, attributes unknown) and update it when the dealer arrives.

    ## How interviewers test this
    - "What is a conformed dimension and why does it matter?"
    - "What is a role-playing dimension?"
    - "A fact arrives for a dealer not in dim_dealer yet. What do you do?" Inferred/unknown member and later update.
  `, {
    check: [
      mcq('One «dim_date» table is joined three times to a fact as submitted, approved and paid date. This is a…', ['Junk dimension', 'Role-playing dimension', 'Degenerate dimension', 'Bridge table'], 1, 'One physical table, several roles (usually via views/aliases).'),
      mcq('What makes claims and sales facts comparable by dealer region?', ['Each mart having its own dealer table', 'A conformed dim_dealer shared by both, with one definition of region', 'Putting region on the fact', 'A bigger warehouse'], 1, 'Conformed dimensions enable drill-across.'),
      tf('«claim_id» stored on the fact table with no separate dimension is a degenerate dimension.', true, 'An identifier with no descriptive attributes of its own.'),
      mcq('A fact references dealer 88, which is not yet in dim_dealer. Good practice?', ['Drop the fact', 'Create an inferred dimension member for dealer 88 (or use Unknown), load the fact, update the member when details arrive', 'Stop the pipeline until the dealer arrives', 'Assign it to a random dealer'], 1, 'Facts are never lost; the dimension catches up.'),
    ],
    hands: [
      sql({ q: '**Dimension quality report** for «dim_customer_scd2». Per «customer_id» return «versions» (rows), «current_rows» (sum of is_current) and «ok»: 1 if there is exactly one current row and the current row has «valid_to = \'9999-12-31\'», else 0. Sort by «customer_id».', tables: ['dim_customer_scd2'], level: 2,
        solution: `SELECT customer_id,
       COUNT(*) AS versions,
       SUM(is_current) AS current_rows,
       CASE WHEN SUM(is_current) = 1 AND SUM(CASE WHEN is_current = 1 AND valid_to = '9999-12-31' THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END AS ok
FROM dim_customer_scd2
GROUP BY customer_id
ORDER BY customer_id;`,
        hint: 'GROUP BY customer_id; SUM(is_current); a CASE that checks both conditions.' }),
    ],
  }),

  // ================================================================== Star vs snowflake
  star: T(`
    > **In one line:** a **star schema** is a fact table surrounded by **flat (denormalised)** dimension tables, one join per dimension. A **snowflake schema** **normalises** dimensions into sub-tables (dealer → city → region → country). Star is the default for analytics; snowflake saves little and costs joins.

    ## Star schema
    «««flow
    dim_date -> fact_claim <- dim_dealer
    »»»
    plus dim_engine, dim_part, dim_status around the same fact. Every dimension joins directly to the fact.
    - **Pros:** simple for users and BI tools; few joins; fast with columnar engines; easy to understand.
    - **Cons:** repeated attribute values in dimensions (dealer region text repeated per dealer), which is cheap in columnar storage; hierarchies must be maintained in each flattened row.

    ## Snowflake schema
    dim_dealer → dim_city → dim_region → dim_country, each a separate table.
    - **Pros:** less duplication; a region rename happens in one row; can suit very large dimensions with deep hierarchies or shared sub-dimensions.
    - **Cons:** more joins, more complex queries, slower in many engines, more confusing for users.

    ## Comparison
    | | Star | Snowflake |
    |---|---|---|
    | Dimension shape | Flat | Normalised |
    | Joins per query | One per dimension | Several per dimension |
    | Storage | Slightly more | Slightly less |
    | Query simplicity | High | Lower |
    | Performance | Usually better | Usually worse |
    | Maintenance of hierarchies | In the pipeline | In the structure |
    Default recommendation: **star**. Snowflake only when a sub-dimension is large and shared, or a tool requires it.

    ## Other shapes worth knowing
    - **Galaxy / fact constellation:** several fact tables sharing conformed dimensions (claims, sales, service visits all using dim_dealer and dim_date).
    - **One Big Table (OBT):** everything pre-joined into one wide table; excellent for one dashboard or ML, but duplicates logic and becomes hard to maintain across many uses.
    - **Data Vault → star:** vault for integration, star for consumption.

    ## How a star query looks
    «««sql
    SELECT d.region, dt.fiscal_month, SUM(f.claim_amount) AS claimed
    FROM fact_claim f
    JOIN dim_dealer d ON d.dealer_key = f.dealer_key
    JOIN dim_date  dt ON dt.date_key = f.submitted_date_key
    WHERE dt.fiscal_year = 2026
    GROUP BY d.region, dt.fiscal_month;
    »»»
    Engines optimise this pattern ("star join"): filter the small dimensions first, then scan the fact with the resulting keys (dynamic partition pruning / bloom filters in Spark and warehouses).

    ## Edge cases
    - **Dimension join that is not N:1** (duplicate keys in a dimension) inflates facts: test uniqueness.
    - **Facts joined to dimensions on natural keys** when the dimension is SCD2 return multiple matches; join on surrogate key, or on natural key + date range.
    - **BI tools generating snowflake joins** across sub-dimensions slow dashboards; flatten.

    ## How interviewers test this
    - "Star vs snowflake, which and why?"
    - "Why is star faster?" Fewer joins, small dimensions broadcast, star-join optimisations.
    - "What is a galaxy schema?" Multiple facts sharing conformed dimensions.
  `, {
    check: [
      mcq('Why is a star schema usually faster than a snowflake schema in analytics engines?', ['It stores less data', 'Fewer joins: each dimension is one small, flat table joined directly to the fact', 'It uses indexes', 'It avoids facts'], 1, 'Each extra join in a snowflake costs time and complexity.'),
      tf('A galaxy (fact constellation) schema has several fact tables sharing conformed dimensions.', true, 'For example claims and sales facts both using dim_dealer and dim_date.'),
      mcq('Facts are joined to an SCD2 dealer dimension on the natural key «dealer_code» only. What happens?', ['Correct results', 'Each fact matches every historical version of its dealer, multiplying rows', 'Facts are dropped', 'The query fails'], 1, 'Join on the surrogate key stored on the fact, or on natural key plus the validity date range.'),
    ],
    hands: [
      sql({ q: '**A star-schema query** on the practice data: treat «claims» as the fact, «dealers» as a dimension and the month of «submitted_at» as the date dimension. Return «region, month» («strftime(\'%Y-%m\', submitted_at)») and «claimed» (sum of claim_amount, 2 dp) for **2026**, sorted by «region», then «month».', tables: ['claims', 'dealers'], level: 2,
        solution: `SELECT d.region, strftime('%Y-%m', c.submitted_at) AS month, ROUND(SUM(c.claim_amount), 2) AS claimed
FROM claims c
JOIN dealers d ON d.dealer_id = c.dealer_id
WHERE c.submitted_at >= '2026-01-01' AND c.submitted_at < '2027-01-01'
GROUP BY d.region, strftime('%Y-%m', c.submitted_at)
ORDER BY d.region, month;`,
        hint: 'Filter 2026 with a range on submitted_at, group by region and strftime(\'%Y-%m\', submitted_at).' }),
    ],
  }),

  // ================================================================== SCD
  scd: T(`
    > **In one line:** **slowly changing dimensions (SCDs)** are policies for what to do when a dimension attribute changes, like a dealer moving region. **Type 1** overwrites (no history). **Type 2** adds a new row version with validity dates (full history). **Type 3** keeps a "previous value" column. Choosing per attribute is a business decision with big reporting consequences.

    ## The problem it solves
    Dealer 14 was in West until 30 June 2026 and North from 1 July. Question: "Claims by region for 2026". Should dealer 14's January claims count as West (where it was) or North (where it is now)? Both are valid questions. Without a policy, the answer depends on when you ran the pipeline.

    ## The types
    | Type | What happens on change | History | Example use |
    |---|---|---|---|
    | **0** | Never change (retain original) | Original only | Date of first registration |
    | **1** | Overwrite the value | None | Fixing a typo in a dealer name |
    | **2** | Expire the current row, insert a new version | Full | Dealer region, customer segment |
    | **3** | Keep current and previous value in two columns | One step back | "Old region" during a re-organisation |
    | **4** | Current values in the dimension; history in a separate history table | Full, separate | Rapidly changing attributes |
    | **6 (1+2+3)** | Type 2 rows plus a current-value column updated on all versions | Full + current | Report both "as was" and "as is" easily |

    ## Type 2 in detail (the one you must master)
    Columns: «customer_sk» (surrogate, one per version), «customer_id» (natural key), attributes, «valid_from», «valid_to» (or NULL / 9999-12-31 for current), «is_current».

    | customer_sk | customer_id | segment | valid_from | valid_to | is_current |
    |---|---|---|---|---|---|
    | 1 | 3 | Marine | 2024-01-01 | 2025-06-30 | 0 |
    | 2 | 3 | Power Gen | 2025-07-01 | 9999-12-31 | 1 |

    **Load algorithm (per batch):**
    1. Get the latest source snapshot of customers.
    2. Compare tracked attributes to the **current** dimension rows (often via a hash of the tracked columns).
    3. **New customers:** insert with valid_from = effective date, valid_to = 9999-12-31, is_current = 1.
    4. **Changed customers:** update the current row: valid_to = effective date − 1 day (or the change timestamp), is_current = 0; insert a new current row.
    5. **Unchanged:** do nothing.
    6. **Deleted at source:** close the row (and/or flag deleted), never physically remove history.
    In Delta Lake this is one MERGE (with a "staged updates" trick that unions changed rows twice: once to close, once to insert).

    **Using it:** facts store the surrogate key of the version valid **at the event date** (looked up at load time with «event_date BETWEEN valid_from AND valid_to»). Then:
    - "As was" reporting: join on surrogate key.
    - "As is" reporting: join to the current row via natural key (or use a type 6 current column).

    ## Choosing per attribute
    Not every column needs history. Typo fixes → Type 1. Region/segment used in performance reporting → Type 2. Phone number → usually Type 1. Each Type 2 attribute multiplies versions, so be deliberate.

    ## Edge cases and what goes wrong
    - **Overlapping or gapped ranges:** two versions valid on the same day (fan-out) or a gap (facts find no match). Test: for each natural key, ranges must not overlap and must be contiguous.
    - **Multiple changes in one batch:** the source shows only the final value; intermediate changes are lost. CDC preserves them; process in commit order.
    - **Late-arriving changes:** a change effective last month arrives today. Facts already loaded point at the wrong version; you must split the version and re-key affected facts (expensive), or accept it as of load time. Agree the policy.
    - **Changes that revert:** West → North → West creates three versions; that is correct.
    - **Noise changes** (trailing spaces, case) create junk versions. Normalise before hashing.
    - **Timestamps vs dates:** several changes on the same day with date-level validity collide. Use timestamps if intra-day matters.
    - **Point-in-time joins for ML** must use the version valid at the feature date to avoid leakage.

    ## How interviewers test this
    - "Explain SCD type 1, 2 and 3 with examples."
    - "How do you implement SCD2 with MERGE?"
    - "How do facts know which version to use?" Surrogate key lookup at event date.
    - "What tests do you run on an SCD2 dimension?" One current row per key, no overlaps, no gaps, valid_from < valid_to.
  `, {
    check: [
      mcq('A dealer name had a typo that was corrected. Which SCD type is usually right for this attribute?', ['Type 1: overwrite', 'Type 2: new version', 'Type 3: previous value column', 'Type 0'], 0, 'A correction is not a business change worth history.'),
      mcq('In SCD2, how does a fact row link to the dealer version valid when the claim happened?', ['By natural key only', 'By storing the surrogate key of the version whose valid_from/valid_to range contains the event date', 'By the latest version', 'By region'], 1, 'Looked up at load time, so "as was" reporting is a simple join.'),
      multi('Which tests belong on an SCD2 dimension?', ['Exactly one current row per natural key', 'No overlapping validity ranges per key', 'No gaps between consecutive versions', 'All rows have is_current = 1'], [0, 1, 2], 'Only the latest version per key is current.'),
      tf('If the source only provides a daily snapshot, SCD2 may miss intermediate changes that happened within the day.', true, 'CDC captures every change in order.'),
    ],
    scenarios: [
      scenario('The region report that changes every time', `
        Every time the "claims by region, 2026" report is refreshed, last quarter's numbers change a little. dim_dealer is Type 1 on region and dealers are being re-assigned in a re-organisation.`, [
        ['Why do past numbers move?', [
          ['Type 1 overwrites region, so old claims are re-attributed to dealers\' new regions on every refresh', true, 'No history means history is rewritten.'],
          ['Claims are being deleted', false, 'The totals are stable; only the split by region moves.'],
          ['The report has caching problems', false, 'The data itself changed.'],
        ]],
        ['Sales targets were set per region per quarter. Which design matches how performance should be judged?', [
          ['SCD2 on region; facts keyed to the version valid at claim time, so past quarters stay attributed to the region at that time', true, '"As was" reporting.'],
          ['Keep Type 1 and freeze the report', false, 'Freezing hides the problem and blocks corrections.'],
          ['Store region on each fact and never change it', false, 'Works for this one attribute but loses the dimension\'s role; SCD2 is the general solution.'],
        ]],
        ['The VP also wants "current structure" views. How?', [
          ['Add a current-region column to every version (Type 6), or join to the current row by natural key', true, 'Both "as was" and "as is" from one dimension.'],
          ['Build a separate copy of the warehouse', false, 'Unnecessary duplication.'],
          ['Tell the VP to choose one', false, 'Both are legitimate needs.'],
        ]],
      ], 'History policy per attribute is a business decision. SCD2 makes "as was" stable; type 6 adds "as is".'),
    ],
    interview: [
      talk('Implement SCD Type 2 for a customer dimension in a lakehouse. Walk me through it.', `
        - **Inputs:** today's source snapshot (or CDC changes) and the current dimension.
        - **Detect change:** hash of tracked attributes (normalised: trimmed, consistent case/NULL handling) compared with the current row's hash, joined on natural key.
        - **Stage:** new keys → insert; changed keys → two actions: close the current row (valid_to = change date − 1 / change ts, is_current = 0) and insert the new version (valid_from = change date, valid_to = 9999-12-31, is_current = 1).
        - **MERGE trick:** union the changed rows twice (once with the real key to match and close, once with a NULL merge key so they fall into WHEN NOT MATCHED → insert), plus new rows; one atomic MERGE.
        - **Deletes:** close the row, flag deleted.
        - **Idempotency:** re-running the same snapshot finds no changes (hashes equal).
        - **Tests:** one current row per key, no overlaps/gaps, surrogate key unique.
        - **Facts:** look up the surrogate key with event_date between valid_from and valid_to.`),
    ],
    hands: [
      sql({ q: '**Point-in-time (as-was) lookup on an SCD2 dimension.** Which **segment** was each customer in on **2025-03-15**? Return «customer_id, segment, region» from «dim_customer_scd2» for the version valid on that date, sorted by «customer_id». (Customers whose history starts later should not appear.)', tables: ['dim_customer_scd2'], level: 2,
        solution: `SELECT customer_id, segment, region
FROM dim_customer_scd2
WHERE '2025-03-15' BETWEEN valid_from AND valid_to
ORDER BY customer_id;`,
        hint: 'Keep the row whose valid_from <= date <= valid_to.' }),
      py({ q: 'Implement the core of an **SCD2 load**. «scd2_apply(dim, snapshot, as_of)»: «dim» is a list of version dicts «{"id", "segment", "valid_from", "valid_to", "is_current"}» (current rows have «valid_to = "9999-12-31"»); «snapshot» is a dict «{id: segment}» from the source today; «as_of» is today\'s date string. For each id in the snapshot: **new** → add a current row from «as_of»; **changed segment** → close the current row with «valid_to = previous day» and add a new current row; **unchanged** → nothing. Ids missing from the snapshot stay as they are. Return the new list sorted by «(id, valid_from)». Use «datetime» to compute the previous day. Do not mutate the input.', starter: 'from datetime import date, timedelta\n\ndef scd2_apply(dim, snapshot, as_of):\n    pass\n',
        tests: `dim = [{'id': 3, 'segment': 'Marine', 'valid_from': '2024-01-01', 'valid_to': '9999-12-31', 'is_current': 1},
       {'id': 7, 'segment': 'Agriculture', 'valid_from': '2024-01-01', 'valid_to': '9999-12-31', 'is_current': 1}]
out = scd2_apply(dim, {3: 'Power Gen', 7: 'Agriculture', 9: 'Mining'}, '2026-07-01')
assert out == [
  {'id': 3, 'segment': 'Marine', 'valid_from': '2024-01-01', 'valid_to': '2026-06-30', 'is_current': 0},
  {'id': 3, 'segment': 'Power Gen', 'valid_from': '2026-07-01', 'valid_to': '9999-12-31', 'is_current': 1},
  {'id': 7, 'segment': 'Agriculture', 'valid_from': '2024-01-01', 'valid_to': '9999-12-31', 'is_current': 1},
  {'id': 9, 'segment': 'Mining', 'valid_from': '2026-07-01', 'valid_to': '9999-12-31', 'is_current': 1}], out
assert dim[0]['is_current'] == 1, 'input must not be mutated'
again = scd2_apply(out, {3: 'Power Gen', 7: 'Agriculture', 9: 'Mining'}, '2026-07-02')
assert again == out, 'idempotent: same snapshot, no new versions'`,
        solution: `from datetime import date, timedelta

def scd2_apply(dim, snapshot, as_of):
    rows = [dict(r) for r in dim]
    current = {r['id']: r for r in rows if r['is_current'] == 1}
    prev_day = (date.fromisoformat(as_of) - timedelta(days=1)).isoformat()
    for k, seg in snapshot.items():
        cur = current.get(k)
        if cur is None:
            rows.append({'id': k, 'segment': seg, 'valid_from': as_of, 'valid_to': '9999-12-31', 'is_current': 1})
        elif cur['segment'] != seg:
            cur['valid_to'] = prev_day
            cur['is_current'] = 0
            rows.append({'id': k, 'segment': seg, 'valid_from': as_of, 'valid_to': '9999-12-31', 'is_current': 1})
    return sorted(rows, key=lambda r: (r['id'], r['valid_from']))` }),
    ],
  }),

  // ================================================================== Surrogate vs natural keys
  surrogate: T(`
    > **In one line:** a **natural key** comes from the business or source (dealer code, serial number); a **surrogate key** is a meaningless ID generated by the warehouse (1, 2, 3… or a hash). Dimensions use surrogate keys as primary keys so that history, multiple sources and source changes do not break facts.

    ## Why surrogate keys exist
    1. **History (SCD2):** dealer 14 has three versions; the natural key «14» repeats. Each version needs its own unique key.
    2. **Multiple sources:** CRM calls the dealer «D-014», ERP calls it «14». One surrogate key unifies them.
    3. **Source instability:** sources re-code, recycle or reformat IDs (claim numbers restart each year). Facts keyed on surrogates are insulated.
    4. **Special members:** -1 Unknown, -2 Not applicable have no natural key.
    5. **Performance:** compact integers join faster than long composite strings (less important in modern columnar engines, still real).

    ## How to generate them
    | Method | How | Pros | Cons |
    |---|---|---|---|
    | **Sequence / identity** | Database auto-increment; Delta «GENERATED ALWAYS AS IDENTITY» | Small integers | Not deterministic across environments or reloads; coordination in distributed writes; gaps |
    | **Hash key** | Hash of natural key (+ source, + valid_from for SCD2), e.g. xxhash64/SHA-256 | Deterministic: same input → same key in any environment and on rebuild; no lookup needed to compute | Larger; collision risk (tiny with 64+ bits); must normalise inputs consistently |
    | **UUID** | Random 128-bit | Unique without coordination | Not deterministic, large, poor for compression and clustering |
    | **«row_number()» at load** | Number rows in the batch | Simple | Changes on every rebuild: dangerous for keys facts depend on |
    In lakehouses, **deterministic hash keys** are popular because pipelines are rebuilt and backfilled often.

    ## Natural keys still matter
    Keep the natural key as a column in the dimension: it is what users and sources recognise, it is used to look up surrogates during fact loads, and it supports reconciliation with the source.

    ## The fact-loading lookup
    For each incoming fact: find the dimension row with the same natural key (and source) whose validity range contains the event date; take its surrogate key. If none: inferred member or -1 Unknown, plus an alert.

    ## Edge cases and what goes wrong
    - **Rebuilding a dimension regenerates identity keys**, so existing facts point at the wrong rows. Never regenerate surrogates that facts reference; or use deterministic hashes.
    - **Hash input inconsistency:** «"D-014"» vs «"d-014 "» hash differently. Normalise (trim, case, NULL → explicit token, fixed column order and separator).
    - **Concatenation ambiguity:** hashing «"1" + "23"» and «"12" + "3"» gives the same input «"123"». Use a separator: «"1|23"».
    - **Recycled natural keys** (a new dealer gets an old dealer's code): add a source effective date or a business rule to separate them.
    - **Composite natural keys** across countries («(country, claim_no)»): forgetting a part creates collisions.

    ## How interviewers test this
    - "Why use surrogate keys?" History, multi-source, stability, special members, performance.
    - "Identity column or hash key?" Determinism and rebuilds vs size and collisions.
    - "How do facts get the surrogate key?" Lookup by natural key + date range at load time.
  `, {
    check: [
      mcq('A dimension is rebuilt from scratch and its IDENTITY surrogate keys are regenerated. What breaks?', ['Nothing', 'Existing facts now point at different (wrong) dimension rows', 'Only performance', 'The natural keys'], 1, 'Use stable or deterministic keys; never regenerate keys facts depend on.'),
      mcq('Why use a separator when hashing several columns into a key?', ['For readability', 'Without it, different inputs can concatenate to the same string ("1"+"23" vs "12"+"3")', 'Hashes need commas', 'It makes hashes shorter'], 1, 'Separators remove concatenation ambiguity.'),
      tf('Keeping the natural key as a column in a dimension is unnecessary once you have surrogate keys.', false, 'You need it for fact lookups, reconciliation and for users to recognise records.'),
    ],
    hands: [
      py({ q: 'Write «dim_key(source, natural_key)» that returns a **deterministic surrogate key**: the first 16 hex characters of the SHA-256 of «"<source>|<natural_key>"», after **normalising** the natural key (strip spaces, upper-case). «None» natural keys must return the special key «"-1"» (Unknown).', starter: 'import hashlib\n\ndef dim_key(source, natural_key):\n    pass\n',
        tests: `import hashlib
k = dim_key('crm', ' d-014 ')
assert k == hashlib.sha256('crm|D-014'.encode()).hexdigest()[:16], k
assert dim_key('crm', 'D-014') == k, 'normalisation: same dealer, same key'
assert dim_key('erp', 'D-014') != k, 'different source, different key'
assert dim_key('crm', None) == '-1'
assert len(k) == 16`,
        solution: `import hashlib

def dim_key(source, natural_key):
    if natural_key is None:
        return '-1'
    nk = str(natural_key).strip().upper()
    return hashlib.sha256(f'{source}|{nk}'.encode()).hexdigest()[:16]` }),
    ],
  }),
};
