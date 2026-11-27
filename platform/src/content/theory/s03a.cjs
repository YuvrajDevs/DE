const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== What is data modelling
  whatmodel: T(`
    > **In one line:** data modelling is deciding **what things exist** (entities), **what we know about them** (attributes), **how they relate** (relationships), and **how that becomes tables** (keys, grain, types, layout), so that data is correct, easy to query and survives change.

    ## The problem it solves
    Without a model, every pipeline invents its own tables: «claims_final», «claims_v2_clean», «claims_for_dashboard_new». Each has a slightly different grain and definition. Joins fan out, totals disagree, nobody knows which table to trust. A model is the shared **design** that prevents this, the same way an architect's drawings prevent each builder from improvising a house.

    ## What a model captures
    - **Entities:** the business things: Dealer, Engine, Claim, Part, Service Request.
    - **Attributes:** facts about them: claim amount, engine model, dealer region.
    - **Relationships and cardinality:** a dealer files many claims (1:N); a claim covers many parts and a part appears in many claims (M:N).
    - **Identifiers:** what makes each instance unique (keys).
    - **Rules:** claim amount ≥ 0; a claim must have a dealer; status is one of a known list.
    - **Grain:** exactly what one row of each table represents.
    - **History:** which changes must be remembered (dealer moved region) and how.

    ## The three levels (next topic in depth)
    «««flow
    Conceptual (business entities and relationships) -> Logical (attributes, keys, normalisation, no technology) -> Physical (tables, types, partitions, indexes in a specific platform)
    »»»

    ## The main modelling styles
    | Style | Shape | Best for |
    |---|---|---|
    | **Normalised (3NF / ER)** | Many narrow tables, no duplication | OLTP systems, enterprise integration layers (Inmon) |
    | **Dimensional (Kimball)** | Facts + dimensions (star schema) | BI and analytics |
    | **Data Vault** | Hubs (keys), links (relationships), satellites (attributes over time) | Auditable, multi-source integration layers with heavy change |
    | **One Big Table (OBT)** | Pre-joined, wide table | A specific dashboard or ML feature set |
    | **Document / query-driven** | Nested documents or tables per query | NoSQL operational stores |

    ## Inmon vs Kimball (the classic debate)
    - **Inmon (top-down):** build an enterprise-wide, normalised data warehouse first; derive dimensional data marts from it. Consistent, slower to deliver.
    - **Kimball (bottom-up):** build dimensional marts per business process, tied together by **conformed dimensions** (shared Date, Dealer, Engine dimensions) in a **bus matrix**. Faster value, risk of inconsistency if conformance is neglected.
    - **Modern lakehouse practice:** bronze (raw) → silver (cleaned, integrated, often close to normalised entities) → gold (dimensional marts / OBTs). In effect Inmon-ish integration in silver, Kimball in gold.

    ## How a data engineer models (the process)
    1. **Start from business processes and questions:** "approve warranty claims", "which dealers' claims are rejected most?".
    2. **Identify entities and events:** events (claim submitted, claim approved) become facts; things (dealer, engine, date) become dimensions.
    3. **Declare the grain** of each fact table before choosing columns.
    4. **Choose keys:** natural keys from sources, surrogate keys for dimensions.
    5. **Decide history:** which attributes need SCD2.
    6. **Physical design:** types, partitioning, clustering, file sizes, constraints/tests.
    7. **Document and test:** grain, definitions, owners, tests for uniqueness and relationships.
    8. **Iterate with consumers.**

    ## Edge cases and what goes wrong
    - **Modelling the source system, not the business:** copying the CRM's 300-column object into gold. Consumers inherit every quirk.
    - **No declared grain:** the most common cause of double counting.
    - **One table per report:** hundreds of overlapping tables; no reuse.
    - **Ignoring history:** overwriting attributes that change, then being unable to report "as it was".
    - **Over-modelling:** a full Data Vault for three sources and two dashboards; months of work before value.

    ## How interviewers test this
    - "How would you model warranty claims for analytics?" Process → grain → facts and dimensions → keys → SCD choices → physical layout → tests.
    - "Inmon vs Kimball?" Top-down normalised EDW vs bottom-up dimensional marts with conformed dimensions; how lakehouse layers combine them.
    - "Why does modelling matter if storage is cheap?" Correctness, consistency of metrics, query performance and usability, not storage.
  `, {
    check: [
      mcq('Which is the first decision when designing a fact table?', ['The partition column', 'The grain: exactly what one row represents', 'The table name', 'The file format'], 1, 'Everything else follows from the grain.'),
      match('Match the modelling style to where it fits best.', [['3NF / ER', 'OLTP systems'], ['Dimensional (star)', 'BI and analytics'], ['Data Vault', 'Auditable integration of many changing sources'], ['One Big Table', 'One specific dashboard or ML feature set']], 'Different layers and workloads suit different styles.'),
      tf('Kimball ties separate data marts together with conformed dimensions shared across business processes.', true, 'The bus matrix of conformed dimensions keeps marts consistent.'),
      mcq('Gold tables are a copy of the CRM\'s 300-column claim object. What is the main problem?', ['Too slow', 'Consumers inherit source quirks and naming; the model reflects the system, not the business process', 'Parquet cannot store 300 columns', 'Nothing'], 1, 'Model the business process and consumers\' questions.'),
    ],
    interview: [
      talk('Walk me through how you would model warranty claims for analytics.', `
        - **Process and questions:** claims submitted by dealers, assessed, approved/partially approved/rejected, paid via credit notes. Questions: approval rates, cycle times, cost by engine model/part/dealer/region, trends.
        - **Facts:** «fact_claim» at grain **one row per claim** (amounts, status, dates, durations); possibly «fact_claim_line» at one row per part per claim; «fact_claim_status_change» (one row per status transition) for cycle-time analysis.
        - **Dimensions:** «dim_date», «dim_dealer» (SCD2 on region), «dim_engine» (model, plant, build date), «dim_part», «dim_status».
        - **Keys:** surrogate keys in dimensions; facts store dimension keys plus the natural claim ID.
        - **Physical:** Delta tables, fact partitioned by submitted month or clustered by date; dimension small enough to broadcast.
        - **Quality:** unique claim_id per row in fact_claim, every FK resolves (Unknown member otherwise), amounts ≥ 0, approved ≤ claimed.
        - **Consumption:** semantic layer metrics (approval rate defined once).`),
    ],
  }),

  // ================================================================== Conceptual, logical, physical
  cll: T(`
    > **In one line:** the **conceptual** model says *what* the business cares about (entities and relationships, in business words); the **logical** model says *exactly what data* describes them (attributes, keys, cardinalities, normalisation) without choosing technology; the **physical** model says *how it is built* in a specific platform (tables, types, partitions, indexes, files).

    The posting asks you to "develop physical data models" and "contribute to conceptual, logical and physical" models. Know the difference and what each is for.

    ## Conceptual model
    - **Audience:** business stakeholders, product owners.
    - **Content:** main entities and how they relate, in plain language. No attributes (or only key ones), no types.
    - **Example:** *Dealer* submits *Claim* for an *Engine*; a *Claim* covers one or more *Parts*; *Supplier* supplies *Parts*; a *Claim* may produce a *Credit Note*.
    - **Purpose:** agree on scope and vocabulary: "Is a claim per engine or per repair visit?". Disagreements found here are cheap to fix.

    ## Logical model
    - **Audience:** data engineers, architects, analysts.
    - **Content:** every entity with attributes, primary and foreign keys, cardinalities (1:1, 1:N, M:N resolved by associative entities), optionality, normalised to 3NF (or a dimensional logical model for marts), business rules. **Still independent of technology.**
    - **Example:** Claim(claim_id PK, dealer_id FK, engine_id FK, submitted_at, claim_amount, status); ClaimPart(claim_id FK, part_id FK, qty) resolves Claim M:N Part.
    - **Purpose:** precise definition of data and rules; the blueprint you can implement on any platform.

    ## Physical model
    - **Audience:** engineers, DBAs, platform team.
    - **Content:** real table names and schemas, data types and precision (DECIMAL(12,2), TIMESTAMP in UTC), nullability, constraints (enforced or informational), partitioning, clustering/sort keys, indexes, file format and table format, storage location, retention, access controls, denormalisation decisions for performance.
    - **Example:** «silver.claims» Delta table, partitioned by «submitted_month», clustered by «dealer_id», «claim_amount DECIMAL(12,2) NOT NULL», 7-year retention, PII columns masked for non-privileged roles.
    - **Purpose:** performance, cost, operability on the chosen platform.

    ## Side by side
    | | Conceptual | Logical | Physical |
    |---|---|---|---|
    | Entities | Yes | Yes | As tables |
    | Attributes | Few/none | All | All, as columns |
    | Keys | No | PK/FK | PK/FK + surrogate keys, enforced or tested |
    | Types | No | Generic (number, text, date) | Platform-specific |
    | Technology | None | None | Specific (Delta on ADLS, Snowflake…) |
    | Performance choices | No | No | Partitions, clustering, indexes, denormalisation |
    | Audience | Business | Data team | Engineers/DBAs |

    ## How they flow in a project
    «««flow
    Workshops with business (conceptual) -> Detailed requirements and rules (logical) -> Platform design and DDL (physical) -> Build, test, document -> Feed back changes upward
    »»»
    Traceability matters (the posting mentions **requirements traceability**): each physical column should trace back to a logical attribute and a business requirement, so impact analysis of a change is possible.

    ## Edge cases and what goes wrong
    - **Skipping conceptual:** engineers build the wrong grain ("claim" meant "repair visit" to the business).
    - **Skipping logical:** physical tables encode accidental decisions; moving platforms means reverse-engineering intent.
    - **Physical drift:** the model diagram says one thing, the tables another. Generate docs from the code/catalog where possible.
    - **Logical M:N left unresolved:** physical tables store lists in a column, breaking 1NF and joins.
    - **Physical choices that contradict logic:** making a NOT NULL attribute nullable "to make the load pass".

    ## How interviewers test this
    - "Explain conceptual, logical and physical models with an example." Use the claims example at each level.
    - "What decisions belong only in the physical model?" Types, partitioning, clustering, indexes, file/table formats, denormalisation for performance, security.
  `, {
    check: [
      mcq('Where is the decision "partition the claims table by submitted month" made?', ['Conceptual model', 'Logical model', 'Physical model', 'Nowhere'], 2, 'Partitioning is a platform-specific performance decision.'),
      mcq('"A claim can cover many parts and a part can appear in many claims." How does the logical model represent this?', ['A comma-separated parts column', 'An associative entity ClaimPart(claim_id, part_id, qty) resolving the M:N', 'Duplicate claims', 'A JSON column'], 1, 'M:N relationships are resolved by an associative (bridge) entity.'),
      tf('The conceptual model is mainly for agreeing scope and vocabulary with business stakeholders.', true, 'Entities and relationships in business language.'),
      order('Order the models from most abstract to most concrete.', ['Conceptual', 'Logical', 'Physical'], 'What → exactly what → how.'),
    ],
  }),

  // ================================================================== ERD
  erd: T(`
    > **In one line:** an **entity relationship diagram (ERD)** draws entities as boxes and relationships as lines, with symbols showing **cardinality** (one or many) and **optionality** (must or may). It is how a team sees and agrees on a data model at a glance.

    ## The notation (crow's foot, the most common)
    - **Entity:** a box with its name and (in logical/physical ERDs) attributes, PK and FK marked.
    - **Relationship line** with symbols at each end:
      - «|» = one, «<» (crow's foot) = many,
      - «o» = zero (optional), «|» = one (mandatory).
    - Read each end from the far entity: "a Dealer submits **zero or many** Claims; a Claim is submitted by **exactly one** Dealer".

    ## Cardinalities with examples
    | Relationship | Example | Physical implementation |
    |---|---|---|
    | **1:1** | Engine ↔ Engine warranty certificate | FK with UNIQUE, or same table |
    | **1:N** | Dealer → Claims | FK on the "many" side (claims.dealer_id) |
    | **M:N** | Claims ↔ Parts | Associative table claim_parts(claim_id, part_id, qty) |
    | **Recursive** | Employee → manager (Employee) | FK to the same table (manager_id) |
    | **Optional** | A claim *may* have a credit note | Nullable FK, or a credit note table with claim_id |

    ## Reading an ERD for a pipeline (why a DE cares)
    - **Join paths:** which keys connect which tables.
    - **Fan-out risk:** joining along a 1:N relationship from the "one" side multiplies rows. Summing a measure from the "one" side after that join double-counts.
    - **Optionality:** an optional relationship means an **inner join drops rows** (claims without credit notes vanish). Use left joins.
    - **Grain of each table:** the PK tells you.
    - **Integrity tests to write:** every FK in the diagram becomes a relationship test in the pipeline.

    ## Dimensional ERDs
    In a star schema the ERD is a fact in the middle with N:1 lines to each dimension (many fact rows per dimension member). Bridge tables appear for M:N dimension relationships (a claim with several failure codes).

    ## Edge cases and what goes wrong
    - **Hidden M:N:** a relationship assumed 1:N is really M:N in the data (an engine moved between customers); joins silently fan out. **Profile the data** to confirm cardinality, do not trust the diagram.
    - **Optional modelled as mandatory:** inner joins drop real data.
    - **Out-of-date diagrams:** generated diagrams from the catalog/dbt are more trustworthy than hand-drawn ones.

    ## How interviewers test this
    - "Draw an ERD for claims, dealers, engines and parts." Show 1:N and the M:N bridge, PKs and FKs.
    - "How do you check a relationship really is 1:N in the data?" Group by the FK on the supposed "one" side and check counts; uniqueness tests.
  `, {
    check: [
      mcq('The ERD says a claim **may** have a credit note (optional). You inner join claims to credit_notes to report claim totals. What happens?', ['Correct totals', 'Claims without a credit note disappear, under-counting totals', 'Totals double', 'Error'], 1, 'Optional relationships need left joins.'),
      mcq('How is a many-to-many relationship implemented physically?', ['An array column on both sides', 'An associative (bridge) table with both foreign keys', 'A self-join', 'It cannot be'], 1, 'For example claim_parts(claim_id, part_id, qty).'),
      tf('You can trust an ERD\'s cardinality without checking the data.', false, 'Profile the data: hidden M:N relationships cause silent fan-out.'),
    ],
    hands: [
      sql({ q: '**Check a cardinality assumption** with data. The model assumes each «engine_id» belongs to exactly one customer in «engines» (N:1 engine → customer, one row per engine). Verify there is **no engine_id appearing more than once**: return «engine_id, rows» for violations. An empty result confirms the assumption.', tables: ['engines'], level: 1, allowEmpty: true,
        solution: `SELECT engine_id, COUNT(*) AS rows
FROM engines
GROUP BY engine_id
HAVING COUNT(*) > 1;`,
        hint: 'GROUP BY engine_id HAVING COUNT(*) > 1.' }),
    ],
  }),

  // ================================================================== Grain
  grain: T(`
    > **In one line:** the **grain** is the precise answer to "**what does one row of this table represent?**": one row per claim, per claim per part, per engine per minute. Declaring it first, and never mixing grains in one table, prevents most analytics errors.

    ## Why it is the most important modelling decision
    Every number in every report is a sum, count or average over rows. If people misunderstand what a row is, every number is wrong, and nothing errors. Kimball's four-step method puts grain at step 2: (1) choose the business process, (2) **declare the grain**, (3) identify dimensions, (4) identify facts.

    ## Examples of grain statements
    | Table | Grain |
    |---|---|
    | fact_claim | One row per warranty claim |
    | fact_claim_line | One row per part per claim |
    | fact_sensor_minute | One row per engine per minute |
    | fact_inventory_snapshot | One row per part per warehouse per day |
    | fact_claim_status_change | One row per status transition of a claim |
    | dim_dealer (SCD2) | One row per dealer per version of its attributes |

    ## Atomic vs aggregated grain
    - **Atomic (lowest) grain:** the most detailed level the source provides (each claim line, each sensor reading). Maximum flexibility: you can always aggregate up, never drill down below the grain.
    - **Aggregated grain:** daily totals per dealer. Faster and smaller, but questions below that level are impossible.
    - Rule: **store facts at the atomic grain** in silver/gold core; build aggregates on top for performance.

    ## How grain errors happen
    1. **Mixing grains in one table:** header rows and line rows together; or monthly totals stored next to daily rows. Any SUM double-counts.
    2. **Joining across grains:** joining fact_claim (per claim) to fact_claim_line (per part) and summing claim_amount multiplies it by the number of parts.
    3. **Changing grain silently:** an upstream change makes a table one row per claim *version* instead of per claim.
    4. **Measures that do not belong at the grain:** storing the claim total on every line row (then summing lines gives N × total). Either allocate it to lines or keep it on the header table.
    5. **Snapshots vs transactions confused:** summing a daily inventory snapshot over a month gives 30× the stock. Snapshot measures are **semi-additive** (sum across warehouses, not across days; use the last or average value over time).

    ## Additivity of measures (tied to grain)
    | Type | Can sum across | Example |
    |---|---|---|
    | **Additive** | All dimensions | claim_amount, qty |
    | **Semi-additive** | Some dimensions, not time | stock on hand, account balance |
    | **Non-additive** | None (recompute from parts) | ratios, percentages, unit prices, distinct counts |
    Approval rate must be recomputed as SUM(approved)/SUM(claims) at the reporting level, not averaged from daily rates.

    ## How to protect grain in pipelines
    - Write it in the table description: "Grain: one row per claim_id".
    - Test it: uniqueness test on the grain columns (claim_id; or engine_id + minute).
    - Name tables by grain: «fact_claim_line», not «claims_details».
    - Before every join, ask: **is this N:1 to my grain?** If it is 1:N, aggregate the other side first.

    ## How interviewers test this
    - "What is grain and why does it matter?" Define, give an example, name a double-counting failure.
    - "Your dashboard total doubled after a join. Why?" Fan-out from joining a finer grain.
    - "Why can't you average daily approval rates to get the monthly rate?" Non-additive; weight by volume.
  `, {
    check: [
      mcq('Daily inventory snapshot: one row per part per warehouse per day. What does SUM(stock_on_hand) over a 30-day month give?', ['Month-end stock', 'About 30× the actual stock: the measure is semi-additive across time', 'Average stock', 'Correct total'], 1, 'Sum across warehouses, not across days; use end-of-period or average over time.'),
      mcq('Monthly approval rate from daily rates: which is correct?', ['Average the 30 daily rates', 'SUM(approved claims) / SUM(claims) over the month', 'Take the last day\'s rate', 'Sum the daily rates'], 1, 'Ratios are non-additive; recompute from additive parts so busy days weigh more.'),
      tf('Storing facts at the atomic grain lets you aggregate to any higher level later.', true, 'You can roll up but never drill below the stored grain.'),
      mcq('«fact_claim_line» stores «claim_total» on every line. Summing claim_total across lines gives…', ['The correct total', 'Each claim\'s total multiplied by its number of lines', 'Zero', 'An error'], 1, 'A header-level measure at a line grain double-counts. Allocate it or keep it on the header table.'),
    ],
    hands: [
      sql({ q: '**Grain check before a join.** The model assumes each claim has **at most one** credit note. Verify which claims would **fan out** when joined to «credit_notes»: return «claim_id, credit_notes» for claims with **more than one** credit note. If rows come back, joining claims to credit notes and summing «claim_amount» would double-count.', tables: ['credit_notes'], level: 2, allowEmpty: true,
        solution: `SELECT claim_id, COUNT(*) AS credit_notes
FROM credit_notes
GROUP BY claim_id
HAVING COUNT(*) > 1
ORDER BY claim_id;`,
        hint: 'GROUP BY claim_id in credit_notes, HAVING COUNT(*) > 1.' }),
    ],
  }),

  // ================================================================== OLTP vs analytical models
  oltpmodel: T(`
    > **In one line:** **OLTP models** are normalised so many small writes stay consistent; **analytical models** are dimensional (facts and dimensions) so large reads are fast, simple and consistent. Converting one into the other is a core data engineering job.

    ## Side by side
    | | OLTP model | Analytical model |
    |---|---|---|
    | Goal | Correct, fast transactions | Fast, understandable analysis |
    | Shape | 3NF, many tables | Star schema: facts + dimensions |
    | Duplication | Avoided | Accepted in dimensions |
    | History | Current state, overwritten | History kept (snapshots, SCD2) |
    | Keys | Natural/system keys | Surrogate keys in dimensions |
    | Joins per question | Many | Few (fact → dimensions) |
    | Who writes | Applications, row by row | Pipelines, in batches |
    | Names | System names («SRV_REQ_STAT_CD») | Business names («service_request_status») |
    | Codes | Raw codes | Decoded labels («A» → «Approved») |

    ## The transformation, step by step (claims example)
    OLTP tables: «claim», «claim_line», «dealer», «dealer_address», «region», «engine», «engine_model», «status_code».
    1. **Pick the process and grain:** warranty claims, one row per claim.
    2. **Build dimensions** by flattening: «dim_dealer» = dealer + address + region in one row (denormalised), with a surrogate key and SCD2 on region. «dim_engine» = engine + model + plant.
    3. **Decode codes** into labels: status code tables become attributes.
    4. **Build the fact:** one row per claim with foreign keys to dim_date, dim_dealer, dim_engine, dim_status and measures (claim_amount, approved_amount, days_to_decision).
    5. **Look up surrogate keys** as of the event date (point-in-time join for SCD2).
    6. **Handle missing references:** unknown members.
    7. **Add audit columns:** load time, source, batch id.

    ## Why not query the OLTP model directly?
    - Questions need 6-10 joins; each analyst writes them differently.
    - History is missing (overwritten).
    - Codes and system names are unreadable to business users.
    - Performance on large data is poor; BI tools work best with stars.

    ## Edge cases
    - **Status as dimension vs fact:** a claim moves through statuses; the current status belongs on fact_claim (or a current-status dimension), but analysing cycle times needs a **transaction fact of status changes** or an **accumulating snapshot** (one row per claim with a date column per milestone).
    - **Soft-deleted source rows:** decide whether they disappear from facts, are flagged, or kept for audit.
    - **Multi-source entities:** a dealer exists in CRM and ERP; the dimension conforms both through a crosswalk.

    ## How interviewers test this
    - "How would you convert a normalised OLTP schema into a star schema?" The steps above.
    - "Why keep history in the analytical model when the source does not?" Reporting as-it-was, audits, ML features, trend analysis.
  `, {
    check: [
      mcq('Which belongs in an analytical model but usually not in the OLTP model?', ['Normalised address tables', 'History of how a dealer\'s region changed (SCD2)', 'Row-level locking', 'Raw status codes only'], 1, 'Analytical models keep history the source overwrites.'),
      mcq('To analyse how long claims take between each status, which fact design fits?', ['Only a current-status column on fact_claim', 'A fact of status changes (one row per transition) or an accumulating snapshot with a date per milestone', 'A dimension of statuses', 'A daily snapshot of the dealer table'], 1, 'Cycle times need event history or milestone dates.'),
      tf('Dimensions in a star schema are usually denormalised: a dealer row carries its region and country directly.', true, 'Flattened dimensions keep queries to one join per dimension.'),
    ],
  }),
};
