const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('../_t.cjs');

module.exports = {
  whatmodel: T(`
    ## Senior depth: modelling choices that decide years of cost
    - **Model for the questions, not the source.** A source-shaped model ("one table per Salesforce object") pushes join logic into every report. A consumer-shaped model (facts at a declared grain, conformed dimensions) puts it in one tested place.
    - **Data Vault 2.0** (hubs = business keys, links = relationships, satellites = attributes over time) is built for **auditability and many changing sources**: every load is insert-only, history is complete, parallel loading is easy. Cost: many joins to query; you still build a dimensional layer on top for consumers. Mention it when sources are many and volatile and lineage/audit matters (regulated, many acquisitions).
    - **One Big Table (OBT)** / wide denormalised tables: fastest for BI tools and columnar engines (no joins, columns pruned), but every dimension change means rebuilding wide history, and attributes duplicate across billions of rows. Common pattern: star schema as the governed model, OBTs as published marts for specific dashboards or ML features.
    - **Activity schema / event-centric models** (one long table of entity-activity-time) suit product analytics and customer journeys.
    - In a **lakehouse**, columnar storage and cheap compute make denormalisation cheaper than in 2005; the reasons to keep stars are **conformance, history (SCD), reuse and governance**, not just storage.
    - **Model evolution** is the real problem: new attributes, changed grain, merged sources. Design for additive change (nullable new columns, new facts at new grains) rather than rewrites.
  `, {
    interview: [
      talk('Kimball star schema, Data Vault, or one big table: how do you choose for a new warranty analytics platform?', `
        - **Questions and consumers first:** many BI users slicing claims by dealer, engine model, failure code, time → a **star schema** gives clear grain, conformed dimensions shared with other domains (engine, dealer, date), and SCD history.
        - **Sources:** if warranty data arrives from many systems that change often and audit is critical, a **Data Vault** raw layer absorbs change and keeps full history; the star is built on top.
        - **Serving:** for a couple of heavy dashboards, publish **OBT marts** derived from the star for speed and simplicity.
        - **Decision factors:** number and volatility of sources, audit requirements, team skills, BI tool behaviour, cost. Usually a layered combination, not one choice.`),
    ],
  }),
  cll: T(`
    ## Senior depth
    - **Physical design in a lakehouse** means: table format (Delta), partitioning (date, rarely more), clustering keys (liquid clustering / Z-order on frequent filters and join keys), data types (DECIMAL for money, TIMESTAMP with zone semantics), constraints (NOT NULL, CHECK), generated columns, retention/VACUUM, column stats configuration, table properties (CDF on for tables consumed incrementally).
    - **Logical ≠ physical in distributed engines:** a logical many-to-many is a bridge table; physically you may pre-join for performance, or store arrays/structs (nested data) when the child set is small and always read with the parent (e.g. sensor readings array per engine-minute).
    - **Traceability:** each physical column should trace back to a logical attribute and a business definition (catalog descriptions, tags). Auditors and the posting's "traceability" requirement expect it.
    - **Review checkpoints:** conceptual (with business: are these the right entities and rules?), logical (with architects: keys, cardinalities, history), physical (with platform: performance, cost, security).
  `),
  erd: T(`
    ## Senior depth: cardinality traps that become data bugs
    - **Optional vs mandatory** (the inner circle vs bar on crow's foot) decides **inner vs outer joins**: a claim *may* have a credit note → LEFT JOIN, or you lose unpaid claims.
    - **Many-to-many** needs a bridge (engine ↔ part via a bill of materials with quantity; claim ↔ failure codes). Facts joined through a bridge fan out unless you allocate (weighting factor) or aggregate.
    - **Recursive relationships** (employee → manager, assembly → sub-assembly) need recursive queries or a flattened closure table (ancestor, descendant, depth) for fast hierarchy queries.
    - **Time-dependent relationships:** an engine belongs to a customer **during a period** (resales). Modelling it as a simple FK loses history; model as an effective-dated relationship.
    - **Reverse-engineering an ERD** from a source database: inspect FK constraints (often missing in ERP/CRM sources), then verify with data (orphan counts, uniqueness) before trusting it.
  `),
  facts: T(`
    ## Senior depth
    - **Factless facts:** events with no measures (an engine was inspected, a dealer attended training) or coverage facts (which promotions/warranty plans were active). Count rows; anti-join to find "what did not happen".
    - **Accumulating snapshot** for pipelines with milestones (CRF → SR → PIR → claim → credit note): one row per claim, a date/key per milestone, **updated in place** as milestones happen, with lag measures (days CRF→claim). Perfect for funnel and cycle-time reporting; requires MERGE and careful late-milestone handling.
    - **Periodic snapshots** (inventory per plant per day) are semi-additive; they grow as entities × periods even if nothing changes, so consider compressing unchanged rows or monthly grain for history.
    - **Late-arriving facts:** a claim for March arrives in June; look up the dimension version valid **in March** (SCD2 as-of), and re-run affected aggregates.
    - **Fact table size at scale:** billions of rows are normal; keep facts narrow (keys + measures + degenerate dims), push descriptive text to dimensions, choose clustering on the most common filter (date, then engine/dealer).
    - **Measures stored vs derived:** store additive components (claim_amount, approved_amount), derive ratios at query time.
    - **Reversals and corrections:** finance prefers **reversal rows** (negative amounts) to updates, preserving what was reported when. Know both patterns.
  `),
  dims: T(`
    ## Senior depth
    - **Junk dimensions** group low-cardinality flags (is_goodwill, is_recall, channel) into one small dimension instead of many columns or tiny dimensions.
    - **Role-playing dimensions:** one date dimension used as submitted_date, approved_date, paid_date via views/aliases.
    - **Mini-dimensions** split rapidly changing attributes (engine health band, mileage band) out of a large SCD2 dimension so it does not explode in versions.
    - **Outrigger** (a dimension referencing another) and **bridge** tables for multi-valued attributes (an engine with several applications).
    - **Unknown / not applicable members** (keys -1, -2) so facts never drop out of joins and reports show "Unknown" explicitly.
    - **Dimension size:** most are small (broadcastable); customer/engine dimensions can be tens of millions of rows. SCD2 on such dimensions plus daily changes is where storage and join cost hide.
    - **Conformance is organisational:** a conformed engine dimension needs one owner and agreed keys (engine serial number) across manufacturing, service and warranty. Without it, "engines" in two marts never reconcile.
  `),
  star: T(`
    ## Senior depth
    - **Why stars perform:** facts are filtered through small dimensions (broadcast joins, star-join optimisation, dynamic partition pruning: Spark uses a filter on a dimension to prune fact partitions at runtime).
    - **Snowflaking** saves little storage in columnar formats and adds joins; acceptable for large hierarchies reused across dimensions or when a source already normalises them.
    - **Galaxy / fact constellation:** several fact tables sharing conformed dimensions; drill-across requires aggregating each fact to a common grain before combining (never join two facts row-to-row: chasm trap).
    - **Star in a semantic layer:** BI tools (Power BI) are optimised for star schemas: single-direction relationships from dimension to fact; many-to-many and bidirectional filters cause ambiguous results and slow models.
    - **When not to star:** high-volume raw telemetry for ML (wide/long time-series tables), operational lookups (key-value), document search.
  `),
  scd: T(`
    ## Senior depth: SCD2 edge cases you must handle
    - **Several changes for the same key in one batch:** order them (by source timestamp / sequence) and create a chain of versions, not one; otherwise intermediate states are lost or MERGE fails with multiple matches.
    - **Out-of-order / late changes:** a change effective in March arrives after a June change. Simple "close current, insert new" corrupts history. Either reprocess the key's full history (rebuild versions from all change events, which is easiest and correct), or insert the late version and adjust neighbours' validity intervals.
    - **Same-value updates:** source sends a row with no tracked change; compare a **hash of tracked attributes** to avoid useless versions.
    - **Deletes:** close the current version and mark is_deleted (or add a deleted version); never physically delete history.
    - **Boundaries:** use half-open intervals [valid_from, valid_to) with valid_to = '9999-12-31' or NULL for current; pick one convention and enforce it with a test that versions per key do not overlap and have no gaps.
    - **Fact lookup:** facts store the **surrogate key of the version valid at the event time**, resolved at load. If dimensions arrive late, use an inferred member and update later (type 1 on the inferred row).
    - **Type 1 + 2 hybrid** per attribute; **Type 6** (current value columns on every historical row) for "report history with current names".
    - **At scale:** SCD2 MERGE on tens of millions of keys daily: compare only changed keys (CDC/hash), cluster by business key, consider a full rebuild from CDC history when logic changes.
  `, {
    hands: [
      sql({ q: '**SCD2 integrity tests.** Build a tiny dimension inline and find problems: for each «key», report versions that **overlap** the next version (next valid_from < this valid_to) and keys with **more than one current row** (valid_to IS NULL). Return «key, problem» rows (problem = «"overlap"» or «"multiple_current"»), distinct, sorted by key then problem. Use the CTE provided in the starter.', level: 3, tables: [],
        starter: `WITH dim(key, attr, valid_from, valid_to) AS (VALUES
  (1, 'West',  '2026-01-01', '2026-03-01'),
  (1, 'South', '2026-03-01', NULL),
  (2, 'North', '2026-01-01', '2026-05-01'),
  (2, 'East',  '2026-04-01', NULL),
  (3, 'West',  '2026-01-01', NULL),
  (3, 'North', '2026-02-01', NULL)
)
SELECT 1;`,
        solution: `WITH dim(key, attr, valid_from, valid_to) AS (VALUES
  (1, 'West',  '2026-01-01', '2026-03-01'),
  (1, 'South', '2026-03-01', NULL),
  (2, 'North', '2026-01-01', '2026-05-01'),
  (2, 'East',  '2026-04-01', NULL),
  (3, 'West',  '2026-01-01', NULL),
  (3, 'North', '2026-02-01', NULL)
), seq AS (
  SELECT key, valid_from, valid_to,
         LEAD(valid_from) OVER (PARTITION BY key ORDER BY valid_from) AS next_from
  FROM dim
)
SELECT DISTINCT key, 'overlap' AS problem FROM seq
WHERE next_from IS NOT NULL AND (valid_to IS NULL OR next_from < valid_to)
UNION
SELECT key, 'multiple_current' FROM dim WHERE valid_to IS NULL GROUP BY key HAVING COUNT(*) > 1
ORDER BY key, problem` }),
    ],
    interview: [
      talk('A dealer region change effective 1 March arrives on 15 June, after a later change effective 1 May was already applied. How does your SCD2 handle it?', `
        - The naive "close current, insert new" would make the March change current and break the May version.
        - **Correct approach:** treat the dimension as derived from the full ordered change history per key. Insert the late change into the history and **rebuild that key's versions** ordered by effective date: Jan→Mar (old), Mar→May (late change), May→∞ (existing May change).
        - **Facts:** claims between 1 March and 1 May were loaded with the old version's surrogate key; re-resolve their keys for that key and interval (or, if facts store natural key + event date and resolve at query time, nothing to update).
        - **Tests:** no overlaps, no gaps, one current row per key; reconcile counts of affected facts before/after.`),
    ],
  }),
  oltpmodel: T(`
    ## Senior depth
    - **Status-history extraction:** OLTP tables usually hold only the **current** status. Analytics needs the history (time in each status). Get it from CDC, audit/history tables, or snapshot diffs; otherwise it is gone.
    - **Soft vs hard deletes** in the source decide whether your incremental load can see deletions at all.
    - **Polymorphic and EAV tables** (entity-attribute-value, common in Salesforce/ERP custom fields) must be pivoted into typed columns with care: types are strings, attributes appear and disappear.
    - **Multi-tenant sources** (dealer portals) need tenant keys in every analytical key to avoid collisions.
    - **Salesforce specifics** (your current work): object relationships via Id fields (lookup vs master-detail), record types, picklists that change, API limits for extraction, SystemModstamp vs LastModifiedDate for incremental pulls, deleted records via queryAll / isDeleted. Mapping that to dimensional models is exactly the OLTP → analytical move.
  `),
  grain: T(`
    ## Senior depth
    - **Write the grain as a uniqueness test.** "One row per claim per day" becomes «unique(claim_id, snapshot_date)» in dbt/DLT and fails the build if violated.
    - **Mixed grain** (daily rows and monthly adjustment rows in one table) is the most common silent error: sums double-count. Separate tables per grain, or a grain column with documented filters.
    - **Grain changes are breaking changes:** moving from per-claim to per-claim-line multiplies rows; every consumer's SUM changes. Version the table or publish a new one.
    - **Finer grain costs storage but preserves options;** you can aggregate up, never down. Keep atomic grain in silver/gold-base, aggregates as derived marts.
    - **Telemetry grain decisions:** raw per-reading (billions/day), per engine-minute aggregates (for dashboards), per engine-cycle (for degradation models). Each has a different consumer and retention.
  `),
  surrogate: T(`
    ## Senior depth
    - **Generation in distributed systems:** sequences are a bottleneck; «monotonically_increasing_id()» is unique but not consecutive and **not stable across re-runs** (it depends on partitioning), so it breaks idempotency. Delta **identity columns** («GENERATED ALWAYS AS IDENTITY») are unique but also not deterministic across rebuilds and can limit concurrent writes.
    - **Hash keys** («sha2(concat_ws('||', source_system, natural_key), 256)» or xxhash64): deterministic, parallel, stable across rebuilds and environments; the Data Vault standard. Costs: wider keys (or collision risk with 64-bit), and you must normalise inputs (trim/case/NULL handling) or the same entity gets two keys.
    - **Source system in the key:** the same customer number in two ERPs is two different customers until a master-data process says otherwise.
    - **Key mapping tables** (natural key → surrogate key) let you keep integer surrogates while staying idempotent: lookup first, generate only for new keys.
    - **Rebuild safety:** if a dimension is rebuilt and surrogates change, every fact referencing them must be rebuilt too. Deterministic keys avoid that coupling.
  `, {
    check: [
      mcq('Why is «monotonically_increasing_id()» a poor surrogate key for an idempotent pipeline?', ['It is not unique', 'Its values depend on partitioning, so a re-run assigns different IDs to the same rows', 'It is too slow', 'It only works on the driver'], 1, 'Use deterministic hash keys or a key-mapping table.'),
    ],
  }),
};
