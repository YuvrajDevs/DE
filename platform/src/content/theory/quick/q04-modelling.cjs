const { T } = require('../_t.cjs');

module.exports = {
  whatmodel: T(`
    > **In one line:** data modelling decides **what things exist** (entities), **what we know** (attributes), **how they relate**, and **how that becomes tables** (keys, grain, types, layout), so data is correct, easy to query and survives change.

    **Why:** without a model every pipeline invents tables («claims_final», «claims_v2_clean») with different grains and definitions: joins fan out, totals disagree, nobody knows which to trust. A model is the shared design, like an architect's drawings.

    **A model captures:** entities (Dealer, Engine, Claim, Part), attributes, relationships and cardinality (dealer 1:N claims; claims M:N parts), identifiers (keys), rules (amount ≥ 0, a claim must have a dealer), **grain** (what one row means), and **history** (which changes to remember and how). Levels: conceptual → logical → physical (next topic).

    | Style | Shape | Best for |
    |---|---|---|
    | Normalised (3NF/ER) | Many narrow tables | OLTP, enterprise integration (Inmon) |
    | Dimensional (Kimball) | Facts + dimensions (star) | BI, analytics |
    | **Data Vault 2.0** | Hubs (business keys), links (relationships), satellites (attributes over time) | Auditable, many changing sources: insert-only loads, complete history, easy parallel loading; many joins, so a dimensional layer still sits on top |
    | One Big Table (OBT) | Pre-joined wide table | One dashboard or ML feature set; fastest for BI/columnar engines, but dimension changes mean rebuilding wide history |
    | Activity schema | One long entity-activity-time table | Product analytics, journeys |
    | Document/query-driven | Nested docs, table per query | NoSQL |

    **Inmon vs Kimball:** Inmon = top-down normalised enterprise warehouse first, marts derived (consistent, slow). Kimball = dimensional marts per process tied by **conformed dimensions** in a **bus matrix** (fast value; inconsistent if conformance is neglected). **Lakehouse practice** combines them: integration-style silver (near-normalised entities), Kimball gold (stars, OBTs as published marts).

    ## How a DE models
    1. Start from business processes and questions. 2. Events become facts, things become dimensions. 3. **Declare grain** before columns. 4. Natural keys from sources, surrogate keys for dimensions. 5. Decide history (SCD2). 6. Physical design (types, partitioning, clustering, files, tests). 7. Document and test grain, definitions, owners. 8. Iterate with consumers.
    **Model for questions, not the source:** source-shaped ("one table per Salesforce object") pushes joins into every report; consumer-shaped puts them in one tested place. Cheap columnar storage makes denormalising easy, so keep stars for **conformance, history, reuse and governance**, not storage. **Evolution** is the real problem: design for additive change (nullable new columns, new facts at new grains), not rewrites.

    **What goes wrong:** modelling the source (300-column CRM object in gold); **no declared grain** (top double-counting cause); one table per report; overwriting history; over-modelling (full Data Vault for 3 sources and 2 dashboards).

    **Interview:** model warranty claims → process, grain, facts/dimensions, keys, SCD, layout, tests. Inmon vs Kimball and how lakehouse layers combine them. "Storage is cheap, why model?" → correctness, consistent metrics, performance, usability.
  `),

  cll: T(`
    > **In one line:** **conceptual** = what the business cares about (entities, relationships, business words); **logical** = exactly what data describes them (attributes, keys, cardinalities, normalisation), technology-free; **physical** = how it's built on a platform (tables, types, partitions, indexes, files). The posting asks you to build physical models and contribute to all three.

    | | Conceptual | Logical | Physical |
    |---|---|---|---|
    | Audience | Business, product owners | Engineers, architects, analysts | Engineers, DBAs, platform |
    | Content | Main entities and relationships | All attributes, PK/FK, cardinality, optionality, 3NF or dimensional, rules | Real names, platform types, nullability, constraints, partitioning, clustering, indexes, file/table format, location, retention, access, denormalisation |
    | Types / tech | None | Generic, none | Specific (Delta on ADLS, Snowflake…) |
    | Purpose | Agree scope and vocabulary cheaply ("claim per engine or per repair visit?") | Precise, implementable on any platform | Performance, cost, operability |
    **Example through the levels:** Dealer submits Claim for an Engine; Claim covers Parts; Supplier supplies Parts; a Claim may produce a Credit Note → «Claim(claim_id PK, dealer_id FK, engine_id FK, submitted_at, claim_amount, status)», «ClaimPart(claim_id, part_id, qty)» resolving M:N → «silver.claims» Delta, partitioned by «submitted_month», clustered by «dealer_id», «claim_amount DECIMAL(12,2) NOT NULL», 7-year retention, PII masked.

    **Lakehouse physical design** covers: Delta, partitioning (date, rarely more), clustering (liquid/Z-order on filters and join keys), DECIMAL money, timestamp zone semantics, NOT NULL/CHECK, generated columns, retention/VACUUM, stats columns, properties (CDF on for incrementally consumed tables). **Logical ≠ physical:** an M:N may become a bridge, a pre-join, or an array/struct when the child set is small and always read with the parent (readings per engine-minute).

    **Flow:** business workshops → detailed rules → platform design/DDL → build, test, document → feed changes back up. **Traceability:** every physical column traces to a logical attribute and business requirement (catalog descriptions, tags), enabling impact analysis (the posting's "traceability"). Review: conceptual with business, logical with architects (keys, cardinality, history), physical with platform (performance, cost, security).

    **What goes wrong:** skipping conceptual (wrong grain: "claim" meant "repair visit"); skipping logical (accidental decisions, painful migrations); diagrams drifting from tables (generate docs from code/catalog); unresolved M:N stored as lists in a column (breaks 1NF/joins); making NOT NULL nullable "so the load passes".

    **Interview:** explain all three with the claims example; physical-only decisions = types, partitioning, clustering, indexes, formats, denormalisation, security.
  `),

  erd: T(`
    > **In one line:** an **ERD** draws entities as boxes and relationships as lines whose end symbols show **cardinality** (one/many) and **optionality** (must/may), so a team sees and agrees on a model at a glance.

    **Crow's foot:** «|» one, «<» many, «o» zero (optional), «|» mandatory. Read each end from the far entity: "a Dealer submits **zero or many** Claims; a Claim has **exactly one** Dealer".

    | Relationship | Example | Physical |
    |---|---|---|
    | 1:1 | Engine ↔ warranty certificate | FK with UNIQUE, or same table |
    | 1:N | Dealer → Claims | FK on the many side |
    | M:N | Claims ↔ Parts | Bridge «claim_parts(claim_id, part_id, qty)» |
    | Recursive | Employee → manager | FK to the same table |
    | Optional | Claim may have a credit note | Nullable FK / child table |

    ## Why a DE reads ERDs
    - **Join paths** and the **grain** of each table (from its PK).
    - **Fan-out:** joining from the "one" side along a 1:N multiplies rows; summing a one-side measure afterwards double-counts. Facts through an M:N bridge fan out unless you **allocate** (weighting factor) or aggregate.
    - **Optionality decides join type:** "claim *may* have a credit note" → LEFT JOIN, or unpaid claims vanish.
    - Every FK becomes a **relationship test**.
    - **Recursive** relationships (manager, assembly → sub-assembly) need recursive queries or a **closure table** (ancestor, descendant, depth) for fast hierarchy queries.
    - **Time-dependent** relationships (engine owned by a customer during a period, then resold) need effective dating, not a plain FK.
    - Dimensional ERD: fact in the middle with N:1 lines to dimensions; bridges for M:N (claim with several failure codes).

    **What goes wrong:** a "1:N" that is really M:N in the data (engine moved customers) silently fans out → **profile the data**, don't trust the diagram; optional modelled as mandatory → inner joins drop data; outdated hand-drawn diagrams (prefer catalog/dbt-generated). When reverse-engineering from sources, FK constraints are often missing in ERP/CRM, so verify with orphan counts and uniqueness checks.

    **Interview:** draw claims/dealers/engines/parts with the M:N bridge, PKs and FKs; verify 1:N by grouping on the FK and testing uniqueness.
  `),

  facts: T(`
    > **In one line:** a **fact table** records measurable business events or states at a **declared grain**: summable numbers plus foreign keys to dimensions. Long and narrow, it holds most warehouse rows.

    **Contains:** dimension FKs (date_key, dealer_key, engine_key), **measures** (claim_amount, qty, days_to_decision), **degenerate dimensions** (IDs with no attributes: claim_id, invoice number), audit columns (load time, source, batch). Descriptive text belongs in dimensions.

    | Type | Grain | Rows change? | Example | Questions |
    |---|---|---|---|---|
    | **Transaction** | One per event | No (append) | Claim submitted, sensor reading, invoice line | Totals, trends |
    | **Periodic snapshot** | One per entity per period | No (new each period) | Stock per part per warehouse per day | Levels, balances |
    | **Accumulating snapshot** | One per process instance, updated at milestones | **Yes** | Claim with dates per milestone | Cycle times, bottlenecks |
    - **Accumulating snapshot** suits CRF → SR → PIR → claim → credit note: a date/key per milestone plus lag measures (days CRF→claim); needs MERGE and late-milestone care; keep it to current instances or partition smartly.
    - **Periodic snapshots** grow as entities × periods even without change → compress unchanged rows or keep history monthly.
    - **Factless facts:** events with no measure (engine inspected, dealer trained) or coverage (active warranty plans); count rows, anti-join for "what didn't happen".
    - **Aggregate facts:** pre-summarised for performance.

    **Additivity:** additive (sum everywhere: amount, qty); semi-additive (not over time: balances, stock → end-of-period or average); non-additive (ratios, prices, distinct counts) → **store components** (claims, approved), compute ratios at query time.

    **Design steps:** process → grain and type → dimensions valid at that grain → measures true at that grain → late/corrected data policy → physical (partition by date, cluster by the main filter, file sizes).

    ## What goes wrong
    - **Late facts** (March claim arrives in June): partition by event date, reprocess affected partitions, restate snapshots, look up the dimension version valid **in March**.
    - **Corrections:** update in place (simple, loses history) or **reversal/adjustment rows** (negative amounts; finance prefers them: auditable, preserves what was reported when).
    - At-least-once duplicates → dedupe on the business key.
    - Unknown dimension members → -1 Unknown, never drop.
    - Mixing fact types (snapshots inside a transaction fact) breaks every sum.

    **At scale:** facts are the billion-row tables, so keep them narrow (keys, measures, degenerate dims), numeric, partitioned by date, clustered by key filters, with aggregate facts for heavy dashboards and incremental processing.

    **Interview:** the three types with examples; claim approval rate stored as counts; correction handling (update vs adjustment row).
  `),

  dims: T(`
    > **In one line:** a **dimension** describes the who/what/where/when/how of facts (dealers, engines, parts, dates, statuses): short, wide, descriptive, used to **filter, group and label**.

    **Contains:** surrogate key (PK), natural key (dealer_code), flattened attributes (name, city, region, country, segment), **hierarchies** in the same row (city → region → country), SCD columns (valid_from, valid_to, is_current, version), **special members** (-1 Unknown, -2 Not applicable) so facts never drop out of joins and reports say "Unknown" explicitly.

    | Kind | What | Example |
    |---|---|---|
    | **Conformed** | Shared, identical meaning across facts/marts | dim_date, dim_dealer for claims, sales, service |
    | Date/time | Pre-built calendar: fiscal periods, holidays, weekday flags | fiscal_quarter |
    | **Role-playing** | One dimension in several roles (views/aliases) | dim_date as submitted/approved/paid date |
    | Junk | Low-cardinality flags combined in one small dimension | is_goodwill, is_recall, channel |
    | Degenerate | ID without attributes, on the fact | claim_id |
    | Slowly changing | Attributes change under a history policy | Dealer region |
    | **Mini-dimension** | Fast-changing attributes split off a big SCD2 dimension so it doesn't explode in versions | Health band, mileage band, credit band |
    | Outrigger | Dimension referencing another (sparingly) | dim_engine → dim_plant |
    | Bridge | M:N between fact and dimension, with weights | Claim ↔ failure codes; engine ↔ applications |

    **Why a date dimension** when engines have date functions: fiscal calendars, working days, holidays, shutdown weeks are business rules; consistent labels ("FY26 Q3"); BI-friendly; tiny (20 years ≈ 7,300 rows).

    **Conformed dimensions are the glue:** if claims and sales marts build separate dealer tables with different region rules, "claims per sales rupee by region" is meaningless. One owned, reused dim_dealer enables drill-across (Kimball bus matrix, "certified data products"). Conformance is **organisational**: one owner and agreed keys (engine serial number) across manufacturing, service, warranty.

    **Size:** most dimensions are small (broadcastable); customer/engine dimensions can reach tens of millions, and SCD2 with daily changes is where storage and join cost hide.

    ## What goes wrong
    Two current rows per natural key fan out every join (test one current row per key). Constantly changing values (running hours) are facts/snapshots, not attributes. Huge SCD2 dimensions need mini-dimensions and clustering. NULL attributes show blank groups → explicit "Unknown". **Late-arriving members** (fact references a dealer not yet loaded) → insert an **inferred member** (natural key, unknown attributes), update it when the dealer arrives.

    **Interview:** conformed dimension and why it matters; role-playing; fact for an unknown dealer → inferred/unknown member, updated later.
  `),

  star: T(`
    > **In one line:** a **star schema** is a fact surrounded by **flat** dimensions (one join each); a **snowflake** normalises dimensions into sub-tables (dealer → city → region → country). Star is the analytics default; snowflaking saves little and costs joins.

    | | Star | Snowflake |
    |---|---|---|
    | Dimensions | Flat (repeated values, cheap in columnar) | Normalised (rename a region once) |
    | Joins | One per dimension | Several per dimension |
    | Queries | Simple, BI-friendly | More complex, confusing |
    | Speed | Usually better | Usually worse |
    | Hierarchies | Maintained by the pipeline | In the structure |
    Snowflake only when a sub-dimension is large and shared, the source already normalises it, or a tool requires it.

    «««sql
    SELECT d.region, dt.fiscal_month, SUM(f.claim_amount)
    FROM fact_claim f
    JOIN dim_dealer d ON d.dealer_key = f.dealer_key
    JOIN dim_date dt ON dt.date_key = f.submitted_date_key
    WHERE dt.fiscal_year = 2026 GROUP BY d.region, dt.fiscal_month;
    »»»
    **Why stars are fast:** small dimensions are broadcast and filtered first, then the fact is scanned with the resulting keys ("star join"; **dynamic partition pruning** and bloom filters: Spark uses the dimension filter to prune fact partitions at runtime).

    **Other shapes:** **galaxy / fact constellation** (several facts sharing conformed dimensions; drill-across by aggregating each fact to a common grain first, **never row-joining two facts** = chasm trap); **OBT** (great for one dashboard/ML, hard to maintain across uses); **Data Vault → star** (vault integrates, star serves).
    **In BI semantic models (Power BI):** stars with single-direction dimension → fact relationships; many-to-many and bidirectional filters give ambiguous, slow models.
    **When not to star:** raw high-volume telemetry for ML (long/wide time-series), key-value lookups, document search.

    **Edge cases:** non-N:1 dimension joins (duplicate keys) inflate facts → uniqueness tests. Joining an SCD2 dimension on the natural key returns several matches → surrogate key, or natural key + date range. BI tools generating snowflake joins slow dashboards → flatten.

    **Interview:** star vs snowflake and why; why star is faster (fewer joins, broadcast dimensions, star-join optimisations); galaxy schema.
  `),

  scd: T(`
    > **In one line:** **slowly changing dimensions** are policies for attribute changes (dealer moves region). **Type 1** overwrites, **Type 2** adds a dated version (full history), **Type 3** keeps a "previous" column. Choose per attribute: it's a business decision with big reporting effects.

    **The problem:** dealer 14 was West until 30 June 2026, North from 1 July. Do its January claims count as West (as was) or North (as is)? Both are valid questions; without a policy the answer depends on when the pipeline ran.

    | Type | On change | History | Use |
    |---|---|---|---|
    | 0 | Never change | Original | First registration date |
    | 1 | Overwrite | None | Typo fixes, phone numbers |
    | 2 | Expire current row, insert new version | Full | Region, segment |
    | 3 | Current + previous columns | One step | "Old region" during a re-org |
    | 4 | Current in dimension, history in a separate table | Full, separate | Rapidly changing attributes |
    | 6 (1+2+3) | Type 2 rows + a current-value column on all versions | Full + current | "As was" and "as is" easily |
    Each Type 2 attribute multiplies versions; mix types per attribute deliberately.

    **Type 2 columns:** surrogate key (one per version), natural key, attributes, «valid_from», «valid_to» (9999-12-31 or NULL for current), «is_current».
    | sk | customer_id | segment | valid_from | valid_to | current |
    |---|---|---|---|---|---|
    | 1 | 3 | Marine | 2024-01-01 | 2025-07-01 | 0 |
    | 2 | 3 | Power Gen | 2025-07-01 | 9999-12-31 | 1 |

    ## Load algorithm
    1. Latest source snapshot (or CDC changes). 2. Compare tracked attributes with current rows via a **hash of tracked columns** (avoids versions for same-value updates). 3. New → insert current. 4. Changed → close the current row (valid_to, is_current = 0), insert a new current version. 5. Unchanged → nothing. 6. Deleted at source → close and/or flag deleted; **never delete history**. In Delta: one MERGE using the staged trick (changed rows unioned twice: once to close, once with a NULL key to insert).
    **Facts** store the surrogate key of the version valid **at the event time**, looked up at load («event_ts ≥ valid_from AND < valid_to»). "As was" → join on surrogate; "as is" → join to the current row by natural key (or a Type 6 column). Late dimensions → inferred member updated later (Type 1 on that row).

    ## Edge cases you must handle
    - **Overlaps or gaps** in ranges (fan-out or no match) → **half-open intervals** [valid_from, valid_to), one convention, tests: one current row per key, no overlaps, no gaps, valid_from < valid_to.
    - **Several changes in one batch:** order by source sequence and build a chain of versions (snapshots lose intermediate states; CDC keeps them, applied in commit order); otherwise MERGE fails with multiple matches.
    - **Late/out-of-order changes** (March change after June change): "close current, insert new" corrupts history → rebuild the key's versions from all change events (easiest, correct) or insert and adjust neighbours, then re-key affected facts (or agree to accept as-of-load).
    - Reverting changes (West → North → West) correctly create 3 versions.
    - **Noise** (spaces, case) creates junk versions → normalise before hashing.
    - Several same-day changes collide with date-level validity → timestamps.
    - **ML point-in-time joins** must use the version valid at the feature date (avoid leakage).
    - **At scale:** compare only changed keys (CDC/hash), cluster by business key, rebuild from CDC history when logic changes.

    **Interview:** Types 1, 2, 3 with examples; SCD2 via MERGE; how facts find the version (surrogate lookup at event date); SCD2 tests.
  `),

  oltpmodel: T(`
    > **In one line:** **OLTP models** are normalised so small writes stay consistent; **analytical models** are dimensional so big reads are fast and consistent. Converting one into the other is core DE work.

    | | OLTP | Analytical |
    |---|---|---|
    | Shape | 3NF, many tables | Star: facts + dimensions |
    | Duplication | Avoided | Accepted in dimensions |
    | History | Current state | Kept (snapshots, SCD2) |
    | Keys | Natural/system | Surrogates in dimensions |
    | Joins per question | Many | Few |
    | Writers | Apps, row by row | Pipelines, batches |
    | Names / codes | «SRV_REQ_STAT_CD», raw codes | «service_request_status», decoded labels («A» → Approved) |

    ## Converting (claims example)
    OLTP: «claim, claim_line, dealer, dealer_address, region, engine, engine_model, status_code».
    1. Process and grain: one row per claim. 2. Flatten dimensions: «dim_dealer» = dealer + address + region with surrogate key and SCD2 on region; «dim_engine» = engine + model + plant. 3. Decode code tables into labels. 4. Fact: per claim, FKs to date/dealer/engine/status, measures (claim_amount, approved_amount, days_to_decision). 5. Look up surrogates **as of the event date**. 6. Unknown members for missing references. 7. Audit columns.
    **Why not query OLTP directly:** 6-10 joins written differently by each analyst, missing history, unreadable codes, poor performance, BI tools prefer stars.

    ## Edge cases
    - **Status:** current status sits on the fact (or a current-status dimension); cycle-time analysis needs a **status-change transaction fact** or an **accumulating snapshot**. OLTP keeps only the current status, so history must come from **CDC, audit/history tables or snapshot diffs**, or it's lost.
    - **Soft vs hard deletes** decide whether incremental loads can see deletions; decide whether deleted rows disappear, are flagged or kept for audit.
    - **Multi-source entities** (dealer in CRM and ERP) conform via a crosswalk.
    - **EAV/polymorphic tables** (Salesforce/ERP custom fields) must be pivoted to typed columns carefully: values are strings, attributes come and go.
    - **Multi-tenant sources** (dealer portals) need the tenant in every analytical key.
    - **Salesforce specifics** (your work): Id-based relationships (lookup vs master-detail), record types, changing picklists, API limits, **SystemModstamp vs LastModifiedDate** for incremental pulls, deleted records via «queryAll» / «isDeleted».

    **Interview:** converting 3NF to a star (steps above); keeping history the source lacks (as-was reporting, audits, ML features, trends).
  `),

  grain: T(`
    > **In one line:** **grain** answers "what does one row represent?" (per claim, per claim per part, per engine per minute). Declare it first and never mix grains; that prevents most analytics errors.

    **Why it's the most important decision:** every number is a sum/count/average over rows; misunderstand the row and every number is wrong with no error. Kimball's four steps: process → **declare grain** → dimensions → facts.

    | Table | Grain |
    |---|---|
    | fact_claim | One per claim |
    | fact_claim_line | One per part per claim |
    | fact_sensor_minute | One per engine per minute |
    | fact_inventory_snapshot | One per part per warehouse per day |
    | fact_claim_status_change | One per status transition |
    | dim_dealer (SCD2) | One per dealer per attribute version |

    **Atomic vs aggregated:** atomic (each claim line, each reading) keeps every option (aggregate up, never drill below the grain); aggregated (daily per dealer) is smaller and faster but closes questions. **Store atomic in silver/core gold, build aggregates on top.** Finer grain costs storage but preserves options. Telemetry example: raw per reading (billions/day), per engine-minute (dashboards), per engine-cycle (degradation models), each with its own consumers and retention.

    ## How grain errors happen
    1. **Mixed grains in one table** (headers + lines; daily rows + monthly adjustments) → sums double-count. Separate tables, or a grain column with documented filters.
    2. **Joining across grains** (claim to claim lines, then summing claim_amount × parts).
    3. **Silent grain change** upstream (row per claim *version*). Grain changes are **breaking**: version the table or publish a new one.
    4. **Measures not true at the grain** (claim total on every line row) → allocate to lines or keep on the header.
    5. **Snapshots summed over time** (30 days of stock = 30× stock): semi-additive, use last/average over time.

    | Measure | Sum across | Example |
    |---|---|---|
    | Additive | All | claim_amount, qty |
    | Semi-additive | Not time | Stock, balance |
    | Non-additive | Nothing (recompute) | Ratios, prices, distinct counts |
    Approval rate = SUM(approved)/SUM(claims) at report level, never an average of daily rates.

    **Protect it:** write the grain in the table description; **test it as uniqueness** («unique(claim_id, snapshot_date)» fails the build); name tables by grain («fact_claim_line»); before every join ask "is this N:1 to my grain?" and aggregate the other side if not.

    **Interview:** define grain with an example and a double-counting failure; dashboard doubled after a join (fan-out from a finer grain); why not average daily rates (non-additive; weight by volume).
  `),

  surrogate: T(`
    > **In one line:** a **natural key** comes from the business/source (dealer code, serial number); a **surrogate key** is a meaningless warehouse ID (sequence or hash). Dimensions use surrogates as PKs so history, multiple sources and source changes don't break facts.

    **Why surrogates:** (1) **SCD2:** dealer 14's three versions each need a unique key. (2) **Multiple sources:** «D-014» (CRM) and «14» (ERP) → one key. (3) **Source instability:** re-coded, recycled or reformatted IDs (claim numbers restarting yearly). (4) **Special members** (-1, -2) have no natural key. (5) Compact integers join faster (less important in columnar engines, still real).

    | Method | Pros | Cons |
    |---|---|---|
    | Sequence/identity (DB auto-increment; Delta «GENERATED ALWAYS AS IDENTITY») | Small integers | Not deterministic across environments/rebuilds; coordination in distributed writes (can limit concurrent Delta writes); gaps |
    | **Hash key** (xxhash64/SHA-256 of source + natural key (+ valid_from for SCD2)) | **Deterministic**: same key in every environment and rebuild, computed without lookup, parallel; the Data Vault standard | Wider; tiny collision risk (64+ bits); inputs must be normalised |
    | UUID | No coordination | Random, large, compresses and clusters badly |
    | «row_number()» / «monotonically_increasing_id()» at load | Simple | **Changes on rebuild or repartition**: breaks idempotency and every fact referencing it |
    Lakehouses favour **deterministic hash keys** (pipelines are rebuilt and backfilled often): e.g. «sha2(concat_ws('||', source_system, natural_key), 256)». Or keep integer surrogates idempotently with a **key-mapping table** (natural → surrogate; look up first, generate only for new keys).

    **Natural keys still matter:** keep them as columns: users and sources recognise them, fact loads look up surrogates by them, reconciliation uses them. **Include the source system**: the same number in two ERPs is two customers until master data says otherwise.

    **Fact lookup:** match natural key (+ source) where the version's validity contains the event date → take its surrogate; none → inferred member or -1 Unknown + alert.

    ## What goes wrong
    Rebuilding a dimension regenerates identity keys, so facts point at wrong rows (never regenerate referenced surrogates, or use hashes; if surrogates change, every referencing fact must be rebuilt). Inconsistent hash inputs («"D-014"» vs «"d-014 "») → normalise (trim, case, NULL token, fixed order). **Concatenation ambiguity** («"1"+"23"» = «"12"+"3"») → separators («"1|23"»). Recycled natural keys → add an effective date or rule. Missing part of a composite key («(country, claim_no)») → collisions.

    **Interview:** why surrogates; identity vs hash (determinism/rebuilds vs size/collisions); how facts get the surrogate (natural key + date-range lookup at load).
  `),
};
