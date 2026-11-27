const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Keys and constraints
  keys: T(`
    > **In one line:** keys are how data says **"which one"**. A **primary key** uniquely identifies each row, a **foreign key** points to a row in another table, a **unique constraint** forbids duplicates in other columns. Keys are the backbone of joins, deduplication, MERGE and data quality.

    ## The kinds of keys
    | Key | What it is | Example |
    |---|---|---|
    | **Primary key (PK)** | Column(s) that uniquely identify a row; not NULL; one per table | «claims.claim_id» |
    | **Candidate key** | Any column set that *could* be the PK | «engines.serial_no» and «engines.engine_id» |
    | **Natural (business) key** | A key with business meaning from the source | Serial number, invoice number, VIN |
    | **Surrogate key** | A meaningless generated ID (sequence, hash) | «dealer_sk = 1042» in a dimension |
    | **Composite key** | Uniqueness from several columns together | «(order_id, line_no)» |
    | **Foreign key (FK)** | Column referencing another table's key | «claims.dealer_id → dealers.dealer_id» |
    | **Unique constraint** | Forbids duplicate values (NULLs usually allowed) | «dealers.dealer_code» |

    ## Why they exist
    - **Identity:** without a key, two identical-looking rows cannot be told apart; updates and deletes become ambiguous.
    - **Integrity:** an FK stops a claim from referencing a dealer that does not exist (orphans).
    - **Performance:** PKs and FKs are usually indexed, so lookups and joins are fast.
    - **Pipelines:** keys drive **deduplication** ("one row per claim_id"), **MERGE/upsert** ("update if the key exists, insert if not"), **CDC application** and **reconciliation** (which keys are missing?).

    ## How the database enforces them
    - PK/UNIQUE: a unique index is checked on every insert/update; a duplicate fails the statement.
    - FK: on insert into the child, the parent must exist; on delete of a parent, the rule decides: «RESTRICT» (forbid), «CASCADE» (delete children), «SET NULL».
    - In **analytical engines** (Delta, Snowflake, BigQuery, Redshift) PK/FK are mostly **not enforced**: declared for documentation and optimiser hints. Enforcing them on billions of rows during bulk loads would be too slow. So **the pipeline must test them**.

    ## Natural vs surrogate keys (a classic design choice)
    | | Natural key | Surrogate key |
    |---|---|---|
    | Meaning | Business meaning | None |
    | Stability | Can change (dealer re-coded, serial format changes) | Never changes |
    | Across sources | Different systems use different natural keys | One key for the conformed entity |
    | History (SCD2) | Same natural key appears in many versions | Each version gets its own surrogate key |
    | Join speed | Can be long strings | Compact integers |
    Typical design: keep the natural key as an attribute, use a surrogate key as the dimension's PK, and look it up when loading facts. Covered fully in Data modelling.

    ## Choosing a good key
    - **Unique, always present, stable, simple.**
    - Avoid keys built from changeable attributes (names, emails, phone numbers).
    - For composite keys, be explicit about the **grain**: «(engine_id, reading_ts)» means one row per engine per timestamp.
    - Hash keys (e.g. SHA-256 of business key columns) are useful in lakehouses for deterministic IDs across runs; watch for NULL handling and column order in the hash.

    ## Edge cases and what goes wrong
    - **The "unique" source key is not unique.** The CRM reuses claim numbers across countries. Your MERGE matches the wrong row. Fix: composite key «(country, claim_no)». Always **test** uniqueness, do not trust documentation.
    - **NULLs in keys:** a NULL key makes joins drop the row silently (NULL never equals NULL) and dedup group all NULLs together. Reject or quarantine NULL keys.
    - **Case and whitespace:** «D-014» vs «d-014 » are different strings. Normalise before using as keys.
    - **Leading zeros:** «00123» read as an integer becomes «123», colliding with a real «123». Keep identifiers as strings.
    - **Key changes at source:** a dealer code is re-assigned; history now points to the wrong dealer. Surrogate keys plus a crosswalk protect history.
    - **Orphans in analytics:** facts with an unknown dimension key. Common practice: map to a special «-1 / Unknown» member rather than dropping the fact, and alert.
    - **Duplicate PKs after a non-idempotent load** in an engine that does not enforce them: totals inflate silently.

    ## How interviewers test this
    - "Natural vs surrogate key?" Stability, multi-source, SCD2 history, performance.
    - "Snowflake doesn't enforce primary keys. How do you guarantee uniqueness?" Dedup on load (ROW_NUMBER, MERGE), uniqueness tests (dbt «unique»), alerts.
    - "What happens to facts whose dimension key is missing?" Unknown member, quarantine, or late-arriving dimension handling, never silent drops.
  `, {
    check: [
      mcq('In a lakehouse table where primary keys are not enforced, how do you guarantee one row per «claim_id»?', ['Declare a PRIMARY KEY and trust it', 'Deduplicate on load (ROW_NUMBER or MERGE by key) and run a uniqueness test that fails the pipeline on duplicates', 'Use a bigger cluster', 'Sort the table'], 1, 'Informational constraints document intent; tests enforce it.'),
      mcq('An ID column with values like «00123» is read as an integer. What can go wrong?', ['Nothing', 'Leading zeros are lost, so «00123» and «123» collide', 'It becomes faster', 'It becomes NULL'], 1, 'Keep identifiers as strings; they are labels, not numbers.'),
      tf('A join on a key column silently drops rows whose key is NULL.', true, 'NULL never equals anything, including NULL. Quarantine or flag NULL keys.'),
      mcq('Facts arrive with a dealer code that is not in the dealer dimension. Common good practice?', ['Drop those facts', 'Map them to an "Unknown" dimension member (key -1), keep the fact, alert, and fix when the dimension arrives', 'Stop the whole pipeline forever', 'Invent a dealer'], 1, 'Dropping loses money from totals; Unknown keeps totals right and the issue visible.'),
    ],
    hands: [
      sql({ q: '**Key uniqueness test.** In the raw feed, the intended unique key of an event is «(order_id, status, updated_at)». Return each key combination that appears **more than once**, with «copies» (how many times). Sort by «order_id», then «updated_at». In a pipeline, a non-empty result after deduplication would fail the build.', tables: ['raw_orders_feed'], level: 1,
        solution: `SELECT order_id, status, updated_at, COUNT(*) AS copies
FROM raw_orders_feed
GROUP BY order_id, status, updated_at
HAVING COUNT(*) > 1
ORDER BY order_id, updated_at;`,
        hint: 'GROUP BY the three key columns and keep groups with HAVING COUNT(*) > 1.' }),
    ],
  }),

  // ================================================================== Indexing
  indexing: T(`
    > **In one line:** an index is a separate, sorted data structure that lets a database **find rows without reading the whole table**, like a book's index. It makes reads by the indexed columns fast, and makes every write a little slower and the database a little bigger.

    ## The problem it solves
    «SELECT * FROM claims WHERE claim_id = 9001» on 200 million rows without an index means reading every page: a **full table scan**, seconds to minutes. With a B-tree index on «claim_id», the database walks a tree of maybe 4 levels and reads a handful of pages: milliseconds.

    ## How a B-tree index works
    - A balanced tree of pages. Each internal page holds sorted keys and pointers to child pages; leaf pages hold keys and pointers to the rows (or the rows themselves in a clustered index).
    - Lookup: start at the root, follow the pointer whose key range contains your value, down to a leaf: **O(log n)**. With hundreds of keys per page, 4 levels cover billions of rows.
    - Because keys are **sorted**, it also serves **range queries** («submitted_at BETWEEN …»), «ORDER BY» and «MIN/MAX» cheaply.

    ## Kinds of indexes
    | Index | What it is | Good for |
    |---|---|---|
    | **B-tree** | Sorted tree (the default) | Equality, ranges, sorting |
    | **Hash** | Hash of key → location | Equality only |
    | **Clustered** | Table rows physically stored in index order (one per table) | Range scans on that key (SQL Server, MySQL InnoDB PK) |
    | **Non-clustered / secondary** | Separate structure pointing to rows | Additional lookup paths |
    | **Composite** | Several columns, in order | Queries filtering on the leading column(s) |
    | **Covering** | Includes all columns the query needs | Answer from the index alone, no table visit |
    | **Bitmap** | Bit array per value | Low-cardinality columns in analytics (status, flag) |
    | **Inverted / full-text** | Word → documents | Text search (Elasticsearch, PostgreSQL GIN) |
    | **Partial / filtered** | Only rows matching a condition | "Index only open claims" |

    ## The leftmost-prefix rule (composite indexes)
    An index on «(dealer_id, submitted_at)» is sorted by dealer, then date within dealer. It helps:
    - «WHERE dealer_id = 14»
    - «WHERE dealer_id = 14 AND submitted_at > '2026-01-01'»
    It does **not** help «WHERE submitted_at > '2026-01-01'» alone (the dates are scattered across dealers). Column order matters: put the equality column first, the range column after.

    ## The costs
    - **Writes:** every insert/update/delete must also update every index on the table. 10 indexes ≈ 10 extra writes.
    - **Storage:** indexes can be as big as the table.
    - **Bulk loads:** often faster to drop indexes, load, then rebuild.
    - **Maintenance:** fragmentation and bloat; statistics must be current for the optimiser to use indexes well.

    ## When an index is not used (classic traps)
    - **Function on the column:** «WHERE DATE(submitted_at) = '2026-11-26'» or «WHERE UPPER(code) = 'X'» cannot use a plain index. Rewrite as a range («submitted_at >= '2026-11-26' AND submitted_at < '2026-11-27'») or create a function-based index.
    - **Implicit type conversion:** comparing a VARCHAR column to a number.
    - **Leading wildcard:** «LIKE '%pump'».
    - **Low selectivity:** «WHERE status = 'Approved'» matching 60% of rows; scanning is cheaper and the optimiser rightly ignores the index.
    - **OR across different columns**, or the wrong column order in a composite index.
    - **Stale statistics** after a large load.

    ## Indexing in the analytics world
    Columnar warehouses and lakehouses mostly do **not** use B-tree indexes. They get the same effect by **skipping data**:
    - **Partitioning:** files separated by date; a filter on date opens only matching folders.
    - **Min/max statistics** per file and row group (zone maps).
    - **Clustering / Z-ordering / liquid clustering:** co-locate similar values so skipping works on several columns.
    - **Bloom filters:** quick "definitely not in this file" checks for high-cardinality equality lookups.
    - Snowflake's micro-partition pruning, BigQuery clustering, Delta data skipping.
    So "add an index" in OLTP becomes "fix the data layout" in OLAP.

    ## In a real company pipeline
    - **Extracting from OLTP:** incremental queries on «updated_at» need an index on «updated_at», or every extraction full-scans the production table. Ask the DBA, or use CDC.
    - **MERGE into a serving database:** the target's key must be indexed or each merge scans.
    - **Lakehouse:** partition by date, cluster by the most common filter (engine_id, dealer_id), compact small files.

    ## How interviewers test this
    - "How does an index speed up a query? What are the downsides?"
    - "Why isn't my index being used?" Functions on columns, type mismatch, leading wildcard, low selectivity, column order, stats.
    - "How do warehouses speed up filters without indexes?" Partition pruning, file statistics, clustering, Bloom filters.
  `, {
    check: [
      mcq('An index exists on «submitted_at». Which filter can use it?', ['«WHERE DATE(submitted_at) = \'2026-11-26\'»', '«WHERE submitted_at >= \'2026-11-26\' AND submitted_at < \'2026-11-27\'»', '«WHERE CAST(submitted_at AS TEXT) LIKE \'2026-11-26%\'»', 'None of them'], 1, 'Wrapping the column in a function hides it from a plain index. Rewrite as a range.'),
      mcq('Composite index on «(dealer_id, submitted_at)». Which query benefits least?', ['WHERE dealer_id = 14', 'WHERE dealer_id = 14 AND submitted_at > X', 'WHERE submitted_at > X', 'WHERE dealer_id IN (14, 15)'], 2, 'Leftmost-prefix rule: without the leading column, the dates are scattered.'),
      tf('Adding more indexes always makes a database faster.', false, 'Reads by those columns get faster; every write gets slower and storage grows.'),
      mcq('In a lakehouse, what plays the role indexes play in OLTP?', ['Nothing, scans are always full', 'Partitioning, file statistics (min/max), clustering/Z-order and Bloom filters that let engines skip files', 'Foreign keys', 'Views'], 1, 'Analytics speed comes from data skipping and layout.'),
    ],
    hands: [
      py({ q: 'Build a tiny **secondary index**. Write «build_index(rows, col)» returning a dict from each value of «col» to the **sorted list of row positions** (0-based) having that value, and «lookup(index, value)» returning that list (or «[]» if absent). Rows with «None» in «col» are **not indexed** (like most databases).', starter: 'def build_index(rows, col):\n    pass\n\ndef lookup(index, value):\n    pass\n',
        tests: `rows = [{'dealer': 14}, {'dealer': 9}, {'dealer': 14}, {'dealer': None}, {'dealer': 3}]
ix = build_index(rows, 'dealer')
assert lookup(ix, 14) == [0, 2]
assert lookup(ix, 9) == [1]
assert lookup(ix, 99) == []
assert None not in ix
assert build_index([], 'x') == {}`,
        solution: `def build_index(rows, col):
    ix = {}
    for i, r in enumerate(rows):
        v = r.get(col)
        if v is None:
            continue
        ix.setdefault(v, []).append(i)
    return ix

def lookup(index, value):
    return list(index.get(value, []))` }),
    ],
  }),

  // ================================================================== Normalisation vs denormalisation
  normal: T(`
    > **In one line:** **normalisation** splits data into tables so that each fact is stored **once**, which keeps updates safe (good for OLTP). **Denormalisation** deliberately repeats data in fewer, wider tables so that reads need **fewer joins** (good for analytics). Each is right for its workload.

    ## The problem normalisation solves: update anomalies
    Imagine one big table: «claims(claim_id, dealer_id, dealer_name, dealer_region, amount)». Dealer 14's region is stored on every one of its 5,000 claims.
    - **Update anomaly:** dealer 14 moves to North; you update 4,998 rows and miss 2. Now dealer 14 is in two regions.
    - **Insert anomaly:** you cannot record a new dealer until it has a claim.
    - **Delete anomaly:** deleting a dealer's only claim deletes everything you knew about the dealer.
    Normalisation removes these by storing dealer facts in a «dealers» table and referencing it by key.

    ## The normal forms (what each one means in plain words)
    | Form | Rule | Violation example | Fix |
    |---|---|---|---|
    | **1NF** | Each cell holds one atomic value; no repeating groups | «parts = "P-77,P-12"» in one cell | One row per part in a child table |
    | **2NF** | 1NF + every non-key column depends on the **whole** composite key | In «order_lines(order_id, line_no, customer_name)», customer_name depends only on order_id | Move customer_name to «orders» |
    | **3NF** | 2NF + no non-key column depends on **another non-key column** | «claims(claim_id, dealer_id, dealer_region)»: region depends on dealer_id, not claim_id | Move region to «dealers» |
    | **BCNF** | Every determinant is a candidate key (stricter 3NF) | Rare edge cases with overlapping candidate keys | Further split |
    The mnemonic: every non-key column depends on **the key, the whole key, and nothing but the key**. 3NF is the practical target for OLTP.

    ## The problem denormalisation solves: read cost
    A normalised schema for "claims by region and engine model and month" might need 6 joins. On billions of rows, joins (especially shuffles in distributed engines) dominate cost. Analytics reads far more than it writes, and data is loaded in controlled batches, so update anomalies can be handled by the pipeline. So analytics denormalises:
    - **Star schema:** a fact table plus a few wide dimension tables (dealer with region, country, segment all in one).
    - **One big table (OBT):** pre-joined, flattened table for a specific dashboard.
    - **Nested columns:** arrays/structs inside a row (lakehouse, BigQuery) to avoid a separate child table.

    ## Side by side
    | | Normalised | Denormalised |
    |---|---|---|
    | Duplication | Minimal | Intentional |
    | Writes | Simple, safe | Must update many copies (pipeline handles it) |
    | Reads | Many joins | Few joins, faster |
    | Storage | Smaller | Larger (columnar compression reduces the pain) |
    | Integrity | Enforced by structure | Enforced by pipeline logic and tests |
    | Typical home | OLTP sources | Warehouses, marts, serving tables |

    ## When to choose which
    - **Normalise** where data is written by applications and must stay consistent: source systems, and **silver** entity tables in many designs.
    - **Denormalise** for **consumption**: gold star schemas, OBTs for heavy dashboards, feature tables.
    - In-between: dimensional modelling is "normalised enough" (facts reference dimensions) and "denormalised enough" (dimensions are flat).

    ## In a real company pipeline
    «««flow
    OLTP (3NF: claims, dealers, regions, engines) -> Silver (conformed entities) -> Gold star schema (fact_claims + flat dim_dealer, dim_engine, dim_date) -> OBT for one heavy dashboard
    »»»
    The pipeline is what makes denormalisation safe: when a dealer changes region, the dimension is updated (or versioned with SCD2) in one controlled step, and gold is rebuilt.

    ## Edge cases and what goes wrong
    - **Denormalised copy goes stale:** an OBT built nightly shows yesterday's dealer region while the dimension already changed. Document refresh cadence; rebuild dependents together.
    - **Fan-out when denormalising:** joining claims to a table with *several* rows per dealer (e.g. dealer contacts) multiplies claim rows and inflates sums. Know the cardinality of every join.
    - **Over-normalised analytics:** analysts hand-write 9-join queries, each slightly different; metrics drift. Provide modelled gold tables.
    - **"Which region?":** if you denormalise the dealer's *current* region onto historical facts, last year's sales move regions. Decide: current or as-of (SCD2).
    - **Nested arrays** are efficient but awkward for BI tools; flatten at the consumption layer when needed.

    ## How interviewers test this
    - "Explain 1NF, 2NF, 3NF with an example." Use the claims/dealers example.
    - "Why denormalise in a warehouse when normalisation avoids anomalies?" Read-heavy, controlled batch loads, joins are expensive at scale, columnar compression makes duplication cheap.
    - "What is a fan-out join?" A join to a table with multiple matches per key that multiplies rows and inflates aggregates.
  `, {
    check: [
      mcq('«claims(claim_id PK, dealer_id, dealer_region)». Which normal form does it violate?', ['1NF', '2NF', '3NF: dealer_region depends on dealer_id, a non-key column', 'None'], 2, 'A transitive dependency: claim_id → dealer_id → dealer_region.'),
      mcq('A cell contains «"P-77,P-12,P-03"». Which normal form is broken?', ['1NF', '2NF', '3NF', 'BCNF'], 0, 'Not atomic: a repeating group in one cell.'),
      tf('Warehouses denormalise because joins are expensive at scale and loads are controlled by pipelines, which can keep copies consistent.', true, 'Read-heavy analytics trades storage and pipeline logic for fewer joins.'),
      mcq('You join «claims» to «dealer_contacts» (several contacts per dealer) and sum claim_amount. What happens?', ['Correct totals', 'Totals inflate: each claim repeats once per contact (fan-out)', 'Totals shrink', 'Error'], 1, 'Always know the cardinality of each join before aggregating.'),
    ],
    scenarios: [
      scenario('The dealer who lives in two regions', `
        An analytics table «claims_wide» stores «dealer_region» on every claim row. After a re-organisation, the West region report shows 40 claims for dealer 14 this month, and the North report shows 12 for the same dealer and month.`, [
        ['What went wrong?', [
          ['An update anomaly: the denormalised region was updated on some rows but not others', true, 'Duplicated facts drift unless one controlled step updates them all.'],
          ['Dealer 14 really operates in two regions', false, 'The source says it moved; the table disagrees with itself.'],
          ['The report has a filter bug', false, 'The table itself contains both values for the same dealer.'],
        ]],
        ['What is the right fix?', [
          ['Keep region only in «dim_dealer» (current or SCD2), rebuild «claims_wide» from it, and test "one region per dealer per date"', true, 'One source for each fact, derived copies rebuilt, and a test to catch drift.'],
          ['Manually update the remaining rows', false, 'Fixes today, fails next time.'],
          ['Remove region from all reports', false, 'The business needs region.'],
        ]],
        ['Management asks: should last year\'s claims show the dealer\'s old region or new region?', [
          ['It is a business decision; support both with SCD2 (as-of region) and a current-region attribute, and document which each report uses', true, 'Both views are legitimate; make the choice explicit.'],
          ['Always the new region', false, 'That rewrites history; past regional targets would be judged on today\'s map.'],
          ['Always the old region', false, 'Some reports need the current structure.'],
        ]],
      ], 'Denormalised data must be derived from one source of truth by the pipeline, and history choices must be explicit.'),
    ],
    hands: [
      sql({ q: '**Denormalise for consumption**: build a flat, analyst-friendly view of claims. Return «claim_id, submitted_at, claim_amount, status, dealer_name, region» by joining «claims» to «dealers». Keep claims even if the dealer is unknown (they should show NULL dealer fields, not vanish). Sort by «claim_id».', tables: ['claims', 'dealers'], level: 1,
        solution: `SELECT c.claim_id, c.submitted_at, c.claim_amount, c.status, d.dealer_name, d.region
FROM claims c
LEFT JOIN dealers d ON d.dealer_id = c.dealer_id
ORDER BY c.claim_id;`,
        hint: 'LEFT JOIN keeps every claim even without a matching dealer.' }),
    ],
  }),

  // ================================================================== Transactions and ACID
  transactions: T(`
    > **In one line:** a **transaction** groups several operations into one unit that either **fully happens or not at all**. **ACID** (Atomicity, Consistency, Isolation, Durability) are the four guarantees that make that safe when many users write at once and machines crash.

    ## The problem it solves
    Approving a claim at Apex Engines needs three writes: set the claim to Approved, insert a credit note, reduce the dealer's open balance. If the server crashes after the first write, the claim is approved with no credit note. If two clerks approve the same claim at the same moment, two credit notes appear. Transactions prevent both.

    ## ACID, in plain words
    | Letter | Guarantee | How databases do it |
    |---|---|---|
    | **Atomicity** | All operations in the transaction happen, or none | Write-ahead log; on failure, roll back using undo information |
    | **Consistency** | The transaction moves the database from one valid state to another; constraints hold | Constraints, triggers, checks at commit |
    | **Isolation** | Concurrent transactions do not see each other's half-done work | Locks and/or MVCC snapshots |
    | **Durability** | Once committed, the change survives crashes | Log flushed to durable storage before "commit OK" |
    Note: "consistency" in ACID (valid state per constraints) is **not** the same as "consistency" in CAP (all replicas return the latest write). Interviewers love this distinction.

    ## Isolation levels: the subtle part
    Full isolation (serialisable) is expensive, so databases offer weaker levels that allow some anomalies:
    | Anomaly | What happens |
    |---|---|
    | **Dirty read** | You read another transaction's uncommitted change, which is then rolled back |
    | **Non-repeatable read** | You read a row twice and get different values because someone committed in between |
    | **Phantom read** | You run the same query twice and new rows appear |
    | **Lost update** | Two transactions read, modify and write the same row; one overwrites the other |
    | **Write skew** | Two transactions each check a condition and write different rows, together breaking a rule (e.g. both on-call engineers go off duty) |

    | Level | Prevents | Allows |
    |---|---|---|
    | Read uncommitted | (almost nothing) | Dirty reads |
    | **Read committed** (common default: PostgreSQL, SQL Server, Oracle) | Dirty reads | Non-repeatable, phantoms, lost updates |
    | Repeatable read / snapshot | + non-repeatable reads (and phantoms in snapshot implementations) | Write skew |
    | **Serializable** | Everything: behaves as if transactions ran one at a time | Costs throughput; may abort transactions to retry |

    ## How MVCC works (why readers do not block writers)
    Instead of overwriting a row in place, a write creates a **new version** tagged with the transaction ID. A reader sees the versions that were committed when its snapshot started. Old versions are cleaned up later (PostgreSQL's VACUUM). Lakehouse table formats use the same idea at the file level: each commit creates a new table version; readers use a snapshot.

    ## Transactions in data engineering
    - **Loading into a relational target:** wrap "delete partition + insert partition" in one transaction so readers never see an empty day.
    - **Lakehouse tables (Delta/Iceberg/Hudi):** each write is an atomic commit to the transaction log, with snapshot isolation for readers and **optimistic concurrency** for writers (conflicting writers fail and retry). Transactions are usually **per table**; there is no "commit these three tables together" in most engines. Multi-table consistency needs design: write tables in dependency order, publish via a final pointer/view swap, or use engines offering multi-table transactions.
    - **Streaming exactly-once** relies on atomically committing output **and** progress (offsets) together, or on idempotent writes.
    - **Distributed transactions** across different systems (database + Kafka + API) need two-phase commit or patterns such as the **outbox** (write the event to an outbox table in the same DB transaction, then publish it) and **sagas** (a series of local transactions with compensating actions).

    ## Edge cases and what goes wrong
    - **Read-modify-write without locking:** two jobs read a watermark, both process, both write: duplicate processing. Use «SELECT … FOR UPDATE», optimistic version checks, or a single scheduler.
    - **Long-running transactions:** hold locks, bloat MVCC history, block DDL; never wrap a 2-hour batch in one OLTP transaction.
    - **Autocommit surprises:** each statement commits separately; a failure in statement 3 of 5 leaves partial changes.
    - **Assuming the lakehouse has multi-table atomicity:** silver updated, gold failed; readers see a mismatch.
    - **Retrying after a timeout:** the commit may have succeeded and only the reply was lost. A blind retry duplicates. Use idempotency keys.

    ## How interviewers test this
    - "Explain ACID with an example." Use the claim approval.
    - "What isolation level does your database use by default and what anomaly can still happen?" Read committed; lost updates and non-repeatable reads.
    - "How does Delta Lake provide ACID on object storage?" Atomic log commits, snapshot isolation, optimistic concurrency.
    - "How do you keep a database write and a Kafka publish consistent?" Outbox pattern + CDC, or idempotent consumers.
  `, {
    check: [
      match('Match each ACID property to its meaning.', [['Atomicity', 'All or nothing'], ['Consistency', 'Constraints hold after the transaction'], ['Isolation', 'Concurrent transactions do not see each other\'s partial work'], ['Durability', 'Committed changes survive crashes']], 'ACID consistency is about constraints, not replicas.'),
      mcq('Two jobs read «last_loaded_at», both process the same new rows and both write. Which anomaly is this?', ['Dirty read', 'Lost update / race on read-modify-write', 'Phantom read', 'Deadlock'], 1, 'Use row locks (SELECT … FOR UPDATE), optimistic version checks, or make sure one scheduler runs the job.'),
      tf('Delta Lake can atomically commit changes to three different tables in one transaction.', false, 'Commits are per table. Multi-table consistency needs ordering, publication swaps, or engine features designed for it.'),
      mcq('Your client times out while committing a payment insert. Safest retry approach?', ['Retry immediately; duplicates are impossible', 'Retry with an idempotency key (or check whether the commit happened) because the commit may have succeeded and only the reply was lost', 'Never retry', 'Restart the database'], 1, 'Timeouts are ambiguous. Idempotency makes retries safe.'),
    ],
    interview: [
      talk('How would you keep a database update and an event to Kafka consistent?', `
        - The problem: two systems, no shared transaction. Writing to the DB then publishing can lose the event if the process crashes between; publishing first can announce something that never committed.
        - **Transactional outbox:** in the same DB transaction, update the business table **and** insert an event row into an «outbox» table. A separate relay (or CDC on the outbox via Debezium) publishes outbox rows to Kafka and marks them sent. Delivery is at-least-once, so consumers must be **idempotent** (dedupe by event ID).
        - Alternatives: CDC directly on the business table; two-phase commit (rarely used: slow and fragile); sagas for multi-step business processes with compensating actions.`),
    ],
    hands: [
      py({ q: 'Implement an **atomic batch**. «apply_transfers(balances, transfers)» takes a dict of account balances and a list of «(from, to, amount)». Apply them **in order**; if **any** transfer would make a balance negative, or names an unknown account, apply **none** of them (return the original balances unchanged, as a new dict) and the string «"rolled back"». Otherwise return the new balances and «"committed"». Never mutate the input dict.', starter: 'def apply_transfers(balances, transfers):\n    pass\n',
        tests: `b = {'A': 100, 'B': 50}
nb, status = apply_transfers(b, [('A', 'B', 30), ('B', 'A', 10)])
assert status == 'committed' and nb == {'A': 80, 'B': 70}, (nb, status)
assert b == {'A': 100, 'B': 50}, 'input must not change'
nb, status = apply_transfers(b, [('A', 'B', 30), ('B', 'A', 200)])
assert status == 'rolled back' and nb == {'A': 100, 'B': 50}, (nb, status)
nb, status = apply_transfers(b, [('A', 'Z', 1)])
assert status == 'rolled back' and nb == b
assert apply_transfers({}, []) == ({}, 'committed')`,
        solution: `def apply_transfers(balances, transfers):
    work = dict(balances)
    for src, dst, amt in transfers:
        if src not in work or dst not in work or work[src] - amt < 0:
            return dict(balances), 'rolled back'
        work[src] -= amt
        work[dst] += amt
    return work, 'committed'` }),
    ],
  }),
};
