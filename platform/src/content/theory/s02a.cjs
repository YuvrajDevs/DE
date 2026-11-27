const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Relational databases
  relational: T(`
    > **In one line:** a relational database stores data in **tables** (relations) of rows and typed columns, links tables through **keys**, enforces rules with **constraints**, and lets you ask any question with **SQL**, while guaranteeing safe concurrent changes with **transactions**.

    ## The problem it solves
    Before relational databases (1970s), programs stored data in files or hierarchical structures whose layout was baked into the code. Asking a new question meant writing a new program that walked the structure. Edgar Codd's relational model separated **what data means** (tables and relationships) from **how it is stored**, and gave a declarative language: you say *what* you want; the database figures out *how* to get it.

    ## How it works
    ### The model
    - **Table:** a set of rows with the same columns. «claims(claim_id, dealer_id, claim_amount, status, submitted_at)».
    - **Row:** one fact (one claim). **Column:** one attribute with a **type** (INTEGER, DECIMAL, VARCHAR, DATE, TIMESTAMP, BOOLEAN).
    - **Keys:** a **primary key** identifies each row uniquely; a **foreign key** points to a primary key in another table («claims.dealer_id → dealers.dealer_id»).
    - **Constraints:** NOT NULL, UNIQUE, CHECK («claim_amount >= 0»), FOREIGN KEY. The database rejects data that breaks them.

    ### The engine (what happens when you run a query)
    «««flow
    SQL text -> Parser -> Optimiser (chooses a plan using statistics) -> Executor (scans, index lookups, joins) -> Storage engine (pages, buffer cache) -> Result
    »»»
    - **Storage:** rows live in fixed-size **pages** (e.g. 8 KB) on disk; hot pages are cached in memory (buffer pool).
    - **Indexes:** B-tree structures that find rows by key without scanning the whole table.
    - **Optimiser:** estimates cost of alternative plans (which index, which join order, hash join vs nested loop) from table statistics. Bad statistics → bad plans.
    - **Write-ahead log (WAL):** every change is written to a sequential log *before* data pages are updated. After a crash, the log is replayed to restore committed changes and undo uncommitted ones. The same log feeds **replication** and **CDC**.
    - **Concurrency control:** locks and/or MVCC (multi-version concurrency control: readers see a consistent snapshot while writers create new row versions).

    ## Why it has lasted 50 years
    - **Integrity:** constraints and transactions keep data correct even with thousands of concurrent users.
    - **Flexibility of questions:** any join or filter, without changing storage.
    - **Standard language:** SQL works (mostly) the same across PostgreSQL, MySQL, SQL Server, Oracle, and analytical engines.
    - **Mature tooling:** backups, replication, monitoring, security, decades of operational knowledge.

    ## When to choose it, and when not
    - **Choose** for structured data with relationships, where correctness matters (orders, invoices, claims, inventory), many concurrent small transactions, and flexible querying.
    - **Think twice** when: the data shape varies wildly per record; you need to scale writes beyond one machine with very simple access patterns (huge key-value workloads); you store massive append-only time-series or unstructured content; or the workload is analytical over billions of rows (use columnar OLAP).

    ## Alternatives
    | Alternative | Pick it when |
    |---|---|
    | Document DB (MongoDB) | Records are naturally nested documents, schema varies, access is by document |
    | Key-value (Redis, DynamoDB) | Ultra-fast lookups by key at huge scale; simple access patterns |
    | Wide-column (Cassandra, HBase) | Massive write throughput, time-series, known query patterns, multi-region |
    | Columnar OLAP (Snowflake, BigQuery) | Analytics over large data |
    | Distributed SQL (CockroachDB, Spanner, YugabyteDB) | You need relational + ACID **and** horizontal scale across regions |

    ## Trade-offs
    | Strength | Cost |
    |---|---|
    | Strong consistency, ACID | Harder to scale writes across many machines |
    | Constraints catch bad data | Schema changes need migrations and coordination |
    | Joins answer any question | Joins on huge tables can be slow; denormalisation for reads |
    | Mature, standard SQL | Vendor-specific extensions still differ |

    ## In a real company pipeline
    Relational databases are the most common **source**: CRM, ERP and plant systems sit on them. The data engineer's concerns at that boundary:
    - Extract without harming them (CDC from the WAL, replicas, indexed incremental queries).
    - Respect their constraints when you **write back** (reverse ETL) or when you load a relational **serving** database.
    - Use their keys as **natural keys** for MERGE and deduplication downstream.
    Relational thinking (keys, constraints, normal forms) also shapes how you model lakehouse tables, even though lakehouses do not enforce most constraints.

    ## Edge cases and what goes wrong
    - **NULL is not a value:** «NULL = NULL» is unknown, not true; «NOT IN (subquery with a NULL)» returns no rows. Many "missing data" bugs are NULL logic.
    - **Implicit type conversion:** comparing a VARCHAR column to a number can disable the index and silently mis-compare ('10' < '9' as text).
    - **Floating point for money:** «FLOAT» rounding errors; use DECIMAL/NUMERIC.
    - **Timestamps without time zone** mixed across regions; store UTC (TIMESTAMPTZ) and convert for display.
    - **Long transactions** block vacuum/cleanup (PostgreSQL bloat) and hold locks; reporting queries inside a transaction can hurt OLTP.
    - **Stale statistics** after a big load make the optimiser choose terrible plans; run ANALYZE.
    - **Constraints not enforced in analytics engines:** Delta, Snowflake and BigQuery mostly do not enforce primary/foreign keys (they are informational). Your pipeline must test uniqueness and integrity itself.

    ## At scale
    A single relational server scales **up** (bigger machine) well into terabytes and thousands of transactions per second. Beyond that: read replicas for read load, partitioning for large tables, then **sharding** (splitting rows across servers by key), which makes cross-shard joins and transactions hard. Distributed SQL databases automate sharding with consensus protocols at the cost of latency and complexity.

    ## How interviewers test this
    - "What happens when you run a SQL query?" Parse → optimise with statistics → execute → storage/buffer cache; mention indexes and the plan.
    - "Why use DECIMAL not FLOAT for money?" Binary floating point cannot represent most decimals exactly.
    - "Does Snowflake/Delta enforce primary keys?" Not generally; you test uniqueness in the pipeline.
    - "What is the WAL and why does a data engineer care?" Crash recovery, replication and the source of log-based CDC.
  `, {
    check: [
      mcq('«SELECT * FROM dealers WHERE dealer_id NOT IN (SELECT dealer_id FROM claims)» returns zero rows, but you know some dealers have no claims. Why?', ['The query is correct; every dealer has claims', 'The subquery contains a NULL dealer_id, and NOT IN with a NULL evaluates to unknown for every row', 'NOT IN only works on text', 'Indexes are missing'], 1, 'Use NOT EXISTS, or filter NULLs out of the subquery. A favourite interview trap.'),
      mcq('Why does a relational database write changes to the write-ahead log before updating data pages?', ['To make queries faster', 'So that after a crash, committed changes can be replayed and uncommitted ones undone (durability and atomicity)', 'To compress data', 'For indexing'], 1, 'The WAL also powers replication and log-based CDC.'),
      tf('Delta Lake, Snowflake and BigQuery enforce primary key uniqueness the way PostgreSQL does.', false, 'Their key constraints are mostly informational. Pipelines must test uniqueness and referential integrity themselves.'),
      mcq('Which type should store invoice amounts?', ['FLOAT', 'DOUBLE', 'DECIMAL(12,2)', 'VARCHAR'], 2, 'Binary floating point causes rounding errors on money; DECIMAL is exact.'),
    ],
    interview: [
      talk('Walk me through what happens inside a relational database when you run a query.', `
        - **Parse** the SQL into a tree and check names and permissions.
        - **Optimise:** generate candidate plans (index scan vs full scan, join orders, hash/merge/nested-loop joins) and estimate costs from statistics (row counts, value distributions). Pick the cheapest.
        - **Execute:** operators pull rows from storage: pages read from the buffer pool or disk, filters applied, joins and aggregations performed, results streamed back.
        - **Concurrency:** MVCC gives the query a consistent snapshot so writers do not block it.
        - **Writes** go to the WAL first, then pages; commit is durable once the log is flushed.
        - Why I care as a DE: stale statistics cause bad plans after bulk loads; EXPLAIN shows the plan; the WAL is how CDC works.`),
    ],
    hands: [
      sql({ q: 'Referential integrity check (the kind you write because analytics engines do not enforce foreign keys): return every claim whose «dealer_id» has **no matching dealer** in «dealers». Use «NOT EXISTS» (not NOT IN). Return «claim_id, dealer_id». An empty result means integrity holds.', tables: ['claims', 'dealers'], level: 2, allowEmpty: true,
        solution: `SELECT c.claim_id, c.dealer_id
FROM claims c
WHERE NOT EXISTS (SELECT 1 FROM dealers d WHERE d.dealer_id = c.dealer_id)
ORDER BY c.claim_id;`,
        hint: 'WHERE NOT EXISTS (SELECT 1 FROM dealers d WHERE d.dealer_id = c.dealer_id)' }),
    ],
  }),

  // ================================================================== NoSQL
  nosql: T(`
    > **In one line:** **NoSQL** ("not only SQL") is a family of databases that drop parts of the relational model, usually fixed schemas, joins or cross-row transactions, to gain **horizontal scale, flexible data shapes or very low latency** for specific access patterns. There are four main types: **key-value, document, wide-column and graph**.

    ## The problem it solves
    In the 2000s web companies hit limits of a single relational server: hundreds of thousands of writes per second, data across continents, schemas changing weekly. Sharding relational databases by hand was painful. Amazon's Dynamo and Google's Bigtable papers showed a different approach: design the database around **known access patterns** and **partition data across many cheap machines** from the start. NoSQL databases grew from those ideas.

    ## The four families
    ### Key-value
    - **Model:** a giant dictionary: key → value (the value is opaque to the database).
    - **Access:** get/put/delete by key. Nothing else (or very little).
    - **Examples:** Redis (in-memory), DynamoDB (managed, key-value + document), Memcached.
    - **Use:** caching, sessions, feature serving for ML, rate limiting, leaderboards.

    ### Document
    - **Model:** each record is a JSON-like document; documents in a collection can have different fields; nested objects and arrays.
    - **Access:** by ID, plus secondary indexes and queries on fields.
    - **Examples:** MongoDB, Couchbase, Azure Cosmos DB, Firestore.
    - **Use:** product catalogues, content, user profiles, app data that maps naturally to objects.

    ### Wide-column (column-family)
    - **Model:** rows identified by a **partition key**, each holding many columns, sorted by a **clustering key** within the partition. Rows can have different columns. Designed for massive write throughput.
    - **Access:** by partition key, with range scans on the clustering key inside a partition.
    - **Examples:** Apache Cassandra, Apache HBase, Google Bigtable, Apache Accumulo (cell-level security).
    - **Use:** time-series (sensor readings per engine), event logs, messaging, IoT at huge scale.
    - **Do not confuse** with columnar analytical storage (Parquet, Snowflake). "Wide-column" is a data model for operational access; "columnar" is a storage layout for scans.

    ### Graph
    - **Model:** nodes and relationships (edges) with properties.
    - **Access:** traversals: "parts used in engines that failed, supplied by suppliers who also supply plant 3".
    - **Examples:** Neo4j, Amazon Neptune.
    - **Use:** supply-chain networks, fraud rings, recommendations, knowledge graphs.

    ## How they scale: partitioning and replication
    - **Partitioning (sharding):** the key is hashed to decide which node owns the record. Adding nodes spreads data and load. Good keys spread evenly; bad keys create **hot partitions**.
    - **Replication:** each record is stored on several nodes (e.g. 3). Writes and reads can require 1, a majority (quorum) or all replicas to answer, trading **consistency vs latency vs availability** (tunable consistency in Cassandra and DynamoDB).
    - **Consistency:** many default to **eventual consistency**: replicas converge, but a read right after a write may see old data. Most offer stronger options at extra cost.

    ## The core design rule: model for your queries
    Relational: model the data, then write any query. NoSQL: **list your queries first**, then design tables so each query hits one partition. That often means **duplicating data** into several tables shaped for different queries (denormalisation by design), and accepting that new queries may need new tables.

    ## When to choose NoSQL, and when not
    | Choose it when | Avoid it when |
    |---|---|
    | Huge scale of simple reads/writes by key | You need ad-hoc queries and joins |
    | Flexible or nested schemas | Strong multi-record transactions are central |
    | Low-latency serving at global scale | Access patterns are unknown or change often |
    | Time-series or event data at massive write rates | The data is relational and moderate in size (just use PostgreSQL) |

    ## In a real company pipeline
    The posting lists **HBase, Cassandra, MongoDB, Accumulo, DynamoDB**. For a data engineer they appear as:
    - **Sources:** app data in MongoDB or DynamoDB to ingest (via change streams / DynamoDB Streams, exports, connectors). Expect nested documents and schema variety.
    - **Sinks / serving stores:** low-latency lookups for applications, e.g. "latest health score per engine" written to Cassandra or DynamoDB for an app; ML features served from Redis.
    - **Time-series stores:** raw telemetry in Cassandra/HBase, with analytical copies in the lakehouse.
    You do **analytics** in the lakehouse/warehouse, not in the NoSQL store: scanning a whole Cassandra table for a report is the wrong tool and hurts its latency.

    ## Edge cases and what goes wrong
    - **Hot partitions:** keying sensor data by «date» puts all of today's writes on one node. Key by «engine_id» (plus a time bucket) instead.
    - **Unbounded partitions:** one partition per engine forever grows to gigabytes; reads slow down. Add a time bucket to the key: «(engine_id, month)».
    - **Reading your own write** fails under eventual consistency; a user saves and refreshes and sees old data. Use stronger read consistency where it matters.
    - **Schema-less ≠ no schema:** the schema lives in application code. Without validation, ten versions of a document shape accumulate; ingestion must cope.
    - **Scans and filters** that are not on the key are slow or forbidden (Cassandra's «ALLOW FILTERING» warning).
    - **Deletes as tombstones** (Cassandra): deleted data leaves markers that slow reads until compaction.

    ## How interviewers test this
    - "Name NoSQL types and a use case for each." Key-value (cache/serving), document (catalogue/profiles), wide-column (time-series/IoT), graph (relationships).
    - "Why is NoSQL faster/more scalable?" Partitioned by key across many nodes, limited operations (no cross-partition joins/transactions), tunable consistency.
    - "How would you store per-engine sensor readings in Cassandra?" Partition key «(engine_id, day)», clustering key «ts», queries by engine and time range.
  `, {
    check: [
      match('Match the NoSQL type to its best use.', [['Key-value', 'Cache and ultra-fast lookups by key'], ['Document', 'Nested, varying records like product catalogues'], ['Wide-column', 'Massive time-series writes per device'], ['Graph', 'Traversing supplier-part-engine relationships']], 'Each family trades generality for strength at one access pattern.'),
      mcq('Sensor readings are stored in Cassandra with partition key «reading_date». What happens?', ['Perfect balance', 'All of today\'s writes go to the same partition and nodes: a hot partition', 'Reads become faster', 'Data is lost'], 1, 'Key by engine plus a time bucket so writes spread across the cluster.'),
      tf('"Wide-column" databases like Cassandra are the same thing as columnar analytical storage like Parquet.', false, 'Wide-column is an operational data model keyed by partition; columnar is a storage layout for analytical scans.'),
      mcq('What is the core data-modelling rule in most NoSQL databases?', ['Normalise to third normal form', 'List the queries first, then design tables so each query reads one partition, duplicating data if needed', 'Avoid keys', 'Use one table for everything'], 1, 'Query-driven design is the opposite of relational modelling.'),
    ],
    interview: [
      talk('How would you design a Cassandra (or DynamoDB) table for engine sensor readings, and what could go wrong?', `
        - **Queries first:** "latest readings for engine X", "readings for engine X between two times".
        - **Key:** partition key «(engine_id, day)» (time bucket to keep partitions bounded and spread writes), clustering key «ts DESC» so the newest readings come first.
        - **Writes** spread across nodes because many engines write at once; replication factor 3; write/read consistency chosen per need (e.g. LOCAL_QUORUM).
        - **TTL** to expire raw readings after the retention period.
        - **Risks:** hot partitions from bad keys, unbounded partitions without a time bucket, tombstones from deletes, queries not on the key, eventual consistency surprises.
        - **Analytics** happen on a copy in the lakehouse, not by scanning Cassandra.`),
    ],
  }),

  // ================================================================== SQL vs NoSQL
  sqlvsnosql: T(`
    > **In one line:** **SQL (relational)** databases give you a fixed schema, joins, flexible queries and strong transactions, and scale mostly up. **NoSQL** databases give you flexible schemas and horizontal scale for **known access patterns**, often with weaker consistency and no joins. The choice is about **workload, consistency needs and query patterns**, not fashion.

    ## The decision, made properly
    Ask these questions in order:
    1. **What are the access patterns?** Ad-hoc, changing, many joins → SQL. A few known patterns by key → NoSQL fits.
    2. **How strong must consistency be?** Money moving between accounts, inventory reservations → strong ACID (SQL, or NoSQL with transactions). Social likes, telemetry, caches → eventual is fine.
    3. **What scale?** Up to many terabytes and tens of thousands of transactions per second, a well-run relational database is fine. Beyond that, or global multi-region writes → NoSQL or distributed SQL.
    4. **How variable is the data shape?** Stable → SQL. Highly variable/nested → document store (or JSON columns in SQL).
    5. **Team and operations:** what do people know, what does the company run and support?

    ## Side by side
    | | SQL (relational) | NoSQL |
    |---|---|---|
    | Schema | Defined up front (schema-on-write) | Flexible; lives in the application |
    | Query | Any query, joins, aggregates | By key / index; limited joins |
    | Transactions | Multi-row, multi-table ACID | Often single-record; some support multi-item transactions with limits |
    | Consistency | Strong by default | Often eventual, tunable |
    | Scaling | Vertical first; replicas; sharding is hard | Horizontal by design |
    | Modelling | Normalise the data | Denormalise for the queries |
    | Best for | Business records, finance, flexible analysis | Massive key access, flexible documents, time-series, caching |

    ## The CAP and PACELC lens (preview)
    In a distributed database, when the network partitions you must choose between **consistency** (refuse some requests) and **availability** (answer, maybe with stale data). Many NoSQL systems choose availability; relational systems on one node avoid the question. PACELC adds: even without partitions you trade **latency vs consistency**. Covered in depth in the distributed systems section.

    ## The modern blur
    - PostgreSQL has JSONB with indexes: document-style data inside SQL.
    - MongoDB supports multi-document ACID transactions and a rich query language.
    - DynamoDB supports transactions over up to 100 items.
    - **Distributed SQL** (Spanner, CockroachDB, YugabyteDB) gives relational + ACID + horizontal scale.
    - Many systems offer SQL interfaces over NoSQL storage (Cassandra's CQL looks like SQL but has NoSQL rules).
    So the senior answer is not "SQL vs NoSQL" but "which **guarantees** and **access patterns** does this workload need, and which product delivers them with acceptable cost and operations?"

    ## Polyglot persistence
    Real systems use several: PostgreSQL for orders, Redis for sessions and caching, Elasticsearch for search, Cassandra for telemetry, a lakehouse for analytics. The data engineer moves and reconciles data among them, which is why ingesting from NoSQL sources and writing to NoSQL sinks are both part of the job.

    ## Edge cases and what goes wrong
    - **Choosing NoSQL for "scale" at small size**, then needing joins and reporting: the team rebuilds joins in application code and suffers.
    - **Choosing SQL, then hitting a write wall** with telemetry at 500k events/s: move telemetry to a stream + wide-column or lakehouse.
    - **Assuming NoSQL means no schema work:** ingestion from a document store must handle every historical document shape.
    - **Assuming eventual consistency is "a few ms":** under failures or cross-region replication it can be much longer.

    ## How interviewers test this
    - "When would you choose NoSQL over SQL?" Access patterns + scale + consistency + schema variability, with a concrete example each way.
    - "Can NoSQL do transactions?" Some can, with limits; know DynamoDB's and MongoDB's.
    - "Which would you use for engine telemetry, and for warranty claims?" Telemetry: stream + wide-column or lakehouse (append-heavy, key-by-engine). Claims: relational (transactions, relationships, ad-hoc queries).
  `, {
    check: [
      mcq('Warranty claims link dealers, engines, parts and approvals; finance needs exact totals and ad-hoc questions. Best primary store?', ['Key-value store', 'Relational database', 'Graph database', 'In-memory cache'], 1, 'Relationships, strong consistency and flexible queries point to relational.'),
      mcq('1 million connected engines send readings every second; queries are "readings for engine X in a time range". Best operational store?', ['Single PostgreSQL server', 'Wide-column store (Cassandra/HBase/Bigtable) or a time-series store, keyed by engine and time bucket', 'Graph database', 'Spreadsheet'], 1, 'Massive writes with a known key-and-range access pattern is the wide-column sweet spot.'),
      tf('Polyglot persistence means a system uses several kinds of databases, each for the workload it fits.', true, 'And data engineers move and reconcile data between them.'),
      multi('Which are true today?', ['PostgreSQL can store and index JSON documents', 'Some NoSQL databases support multi-item ACID transactions with limits', 'Distributed SQL databases offer relational queries with horizontal scale', 'NoSQL databases never have any schema'], [0, 1, 2], 'The schema still exists, in the application. The lines between categories have blurred.'),
    ],
    interview: [
      talk('SQL or NoSQL for a new system? How do you decide?', `
        - Start from **access patterns**: known and key-based → NoSQL fits; ad-hoc with joins → SQL.
        - **Consistency**: money, inventory, approvals → strong ACID. Telemetry, caches, feeds → eventual is fine.
        - **Scale**: a single relational node handles a lot; go distributed only when needed (write throughput, global regions).
        - **Shape**: variable/nested → document or JSON columns.
        - **Operations and skills**, cost, managed options.
        - Example: claims in PostgreSQL; telemetry in Kafka → Cassandra (serving) + lakehouse (analytics); engine health score cached in Redis for the app.`),
    ],
  }),

  // ================================================================== Row vs column storage
  rowcol: T(`
    > **In one line:** **row-oriented** storage keeps all the values of one row together, ideal for reading or writing whole records. **Column-oriented** storage keeps all the values of one column together, ideal for scanning a few columns across many rows. It is the single biggest reason analytical engines are fast.

    ## How each lays out bytes
    Table «claims» with columns «(id, dealer, amount, status)»:
    - **Row layout:** «1,14,500,A | 2,9,700,R | 3,14,300,A …»: each record's fields sit next to each other on the page.
    - **Column layout:** «1,2,3… | 14,9,14… | 500,700,300… | A,R,A…»: each column stored as its own contiguous block (per row group / file segment).

    ## Why columnar wins for analytics
    1. **Read only what you need.** «SUM(amount) GROUP BY status» touches 2 of 40 columns: about 5% of the bytes.
    2. **Compression.** Values in one column are similar (same type, often repeated), so encodings shrink them dramatically:
       - **Dictionary encoding:** «status» with 4 distinct values stored as tiny integers.
       - **Run-length encoding (RLE):** «West, West, West…» stored as «West × 10,000» when sorted.
       - **Delta encoding:** timestamps stored as small differences.
       - Then a general codec (Snappy, ZSTD) on top. 5-10× smaller is common.
    3. **Vectorised execution.** CPUs process arrays of same-typed values in tight loops (SIMD), far faster than walking rows.
    4. **Skipping.** Each column chunk stores **min/max statistics**; a filter «amount > 100000» skips chunks whose max is below it. Sorted/clustered data skips even more.

    ## Why row storage wins for transactions
    - Inserting one claim writes one place, not 40 column blocks.
    - Updating a row rewrites one small area; in columnar files, an update often means rewriting a whole file (that is why lakehouse updates rewrite Parquet files, or use delete vectors).
    - Fetching one complete record by key is one page read, not 40 column reads plus reassembly.

    ## Formats you will meet
    | Format | Layout | Typical use |
    |---|---|---|
    | CSV, JSON lines | Row (text) | Exchange, raw landing |
    | Avro | Row (binary, schema) | Kafka messages, streaming ingestion, write-heavy |
    | Parquet | Columnar (row groups → column chunks → pages) | Lakehouse tables (Delta, Iceberg), analytics |
    | ORC | Columnar (stripes) | Hive ecosystem |
    | PostgreSQL / MySQL tables | Row (heap pages) | OLTP |
    | Snowflake, BigQuery, Redshift | Columnar (proprietary micro-partitions) | Warehouse |
    Parquet is a **hybrid** internally: rows are grouped into **row groups** (e.g. 128 MB), and inside each row group data is stored column by column. That lets engines split files across workers by row group and still read columns selectively.

    ## Choosing
    - Write-heavy, record-at-a-time, low latency → row (Avro for streams, row databases for OLTP).
    - Read-heavy, scan-and-aggregate → columnar (Parquet/Delta, warehouses).
    - The common pipeline: **Avro/JSON on the wire → Parquet/Delta at rest for analytics.**

    ## Edge cases and what goes wrong
    - **«SELECT *» on a wide columnar table** throws away the advantage: it reads every column. Select only needed columns.
    - **Tiny files** destroy columnar benefits: each file has metadata overhead and too few rows to compress well.
    - **Unsorted data** makes min/max statistics useless (every chunk spans the full range). Cluster or Z-order on common filter columns.
    - **Wide rows with many nullable columns:** cheap in columnar (NULLs compress to almost nothing), wasteful in some row formats.
    - **Frequent single-row updates on Parquet tables** cause write amplification (rewriting large files). Batch updates; use merge-on-read features (delete vectors) where available.

    ## At scale
    On a 10 TB table, columnar reading of 3 columns with good pruning might scan 50 GB instead of 10 TB. That difference is the gap between a 10-second query and a 30-minute one, and between a cheap and an expensive bill in pay-per-scan engines like BigQuery.

    ## How interviewers test this
    - "Why is Parquet good for analytics?" Columnar: read selected columns, high compression via encodings, statistics for skipping, splittable row groups, schema included.
    - "Why not use Parquet for Kafka messages?" Messages are small individual records; a columnar file needs many rows to be efficient. Avro (row, schema, evolution) fits.
    - "What is predicate pushdown?" Passing the filter down to the storage reader so it skips row groups/files using statistics before loading data.
  `, {
    check: [
      mcq('Which encoding makes a sorted «region» column with long runs of the same value tiny?', ['Delta encoding', 'Run-length encoding', 'Hashing', 'Base64'], 1, 'RLE stores "value × count". Sorting creates the runs.'),
      mcq('Why are min/max statistics in Parquet less useful when data is not sorted or clustered?', ['They are not stored', 'Every chunk then spans almost the full value range, so filters cannot skip any', 'They slow down writes', 'They only work for strings'], 1, 'Clustering/Z-ordering on filter columns makes skipping effective.'),
      tf('Avro is a good fit for individual Kafka messages, and Parquet for analytical tables at rest.', true, 'Row format with schema on the wire; columnar at rest.'),
      multi('What makes columnar storage fast for aggregates?', ['Reading only the referenced columns', 'Better compression of similar values', 'Vectorised processing of same-typed arrays', 'Faster single-row inserts'], [0, 1, 2], 'Single-row inserts are a row-store strength.'),
    ],
    interview: [
      talk('Explain row vs columnar storage and how Parquet is organised.', `
        - Row: whole records stored together; great for inserts, updates, point lookups (OLTP, Avro messages).
        - Columnar: each column stored together; read only needed columns, compress well (dictionary, RLE, delta, then Snappy/ZSTD), vectorised execution, min/max skipping.
        - Parquet: file → row groups (~128 MB of rows) → one column chunk per column → pages; footer with schema and statistics. Engines split by row group and prune by statistics (predicate pushdown) and by column (projection pushdown).
        - Practical rules: avoid SELECT *, avoid tiny files, cluster on filter columns, batch updates.`),
    ],
  }),
};
