const { T } = require('../_t.cjs');

module.exports = {
  relational: T(`
    > **In one line:** a relational database stores **tables** of rows and typed columns, links them with **keys**, enforces rules with **constraints**, answers any question with **SQL**, and keeps concurrent changes safe with **transactions**.

    **Why it exists:** before the 1970s, data layouts were baked into programs, so every new question needed new code. Codd's relational model separated **what data means** (tables, relationships) from **how it's stored**, with a declarative language: say *what* you want, the database decides *how*.

    ## The model
    - **Table** = rows with the same columns, e.g. «claims(claim_id, dealer_id, claim_amount, status, submitted_at)». **Row** = one fact; **column** = one typed attribute (INTEGER, DECIMAL, VARCHAR, DATE, TIMESTAMP, BOOLEAN).
    - **Primary key** identifies each row; **foreign key** points to another table's key («claims.dealer_id → dealers.dealer_id»).
    - **Constraints** (NOT NULL, UNIQUE, CHECK «claim_amount >= 0», FOREIGN KEY) make the DB reject bad data.

    ## Inside the engine
    «««flow
    SQL -> Parser -> Optimiser (plan from statistics) -> Executor (scans, index lookups, joins) -> Storage (pages, buffer cache) -> Result
    »»»
    - Rows live in fixed-size **pages** (8 KB in Postgres/SQL Server). Tables are heaps (Postgres) or **clustered** on the primary key (SQL Server, MySQL InnoDB): range scans on that key are cheap; random inserts in the middle split pages.
    - **Buffer pool** caches hot pages in memory. Analytical scans on an OLTP primary evict them and slow the app (another reason to extract from replicas/CDC).
    - **Indexes** (B-trees) find rows without full scans.
    - **Optimiser** picks index, join order and join type (hash vs nested loop) by cost from **statistics**: stale stats → bad plans.
    - **Write-ahead log (WAL):** every change is logged *before* pages change; a commit is durable once the log is flushed; after a crash the log replays committed work and undoes the rest. The same log feeds **replication and log-based CDC**, which is why CDC is cheap and complete.
    - **Concurrency:** locks and/or **MVCC** (readers see a snapshot while writers create new versions).

    **Why it has lasted 50 years:** integrity under thousands of users, any question without changing storage, standard SQL across Postgres/MySQL/SQL Server/Oracle and analytics engines, mature tooling (backup, replication, security).

    ## Choose it or not
    **Choose** for structured, related data where correctness matters (orders, invoices, claims, inventory), many small concurrent transactions, flexible queries. **Think twice** if record shapes vary wildly, writes must scale beyond one machine with simple key access, data is massive append-only time-series or unstructured, or the workload is analytics over billions of rows.
    | Alternative | When |
    |---|---|
    | Document (MongoDB) | Nested documents, varying schema, access by document |
    | Key-value (Redis, DynamoDB) | Ultra-fast lookups by key at huge scale |
    | Wide-column (Cassandra, HBase) | Massive writes, time-series, known queries, multi-region |
    | Columnar OLAP (Snowflake, BigQuery) | Large analytics |
    | Distributed SQL (CockroachDB, Spanner, YugabyteDB) | Relational + ACID **and** horizontal scale |
    **Trade-offs:** ACID consistency ↔ harder write scaling; constraints catch bad data ↔ schema changes need migrations; joins answer anything ↔ slow on huge tables; standard SQL ↔ vendor extensions still differ.

    **In pipelines:** the most common **source** (CRM, ERP, plant systems). Extract without harming it (CDC, replicas, indexed incremental queries); respect constraints when writing back (reverse ETL); use its keys as **natural keys** for MERGE and dedupe. Relational thinking shapes lakehouse models even though lakehouses enforce few constraints.

    ## What goes wrong
    - **NULL logic:** «NULL = NULL» is unknown; «NOT IN» a list containing NULL returns no rows.
    - **Implicit casts:** VARCHAR vs number disables indexes and compares as text ('10' < '9').
    - **FLOAT for money** → rounding errors; use DECIMAL.
    - **Timestamps without zone** across regions → store UTC (TIMESTAMPTZ).
    - **Long transactions** hold locks and block cleanup (Postgres bloat).
    - **Stale statistics** after big loads → run ANALYZE.
    - **Analytics engines don't enforce PK/FK** (Delta, Snowflake, BigQuery): your pipeline must test uniqueness and integrity.

    **At scale:** scale up into terabytes and thousands of TPS; then read replicas, partitioning, then **sharding** (cross-shard joins/transactions become hard); distributed SQL automates sharding with consensus at a latency cost.

    **Interview:** query lifecycle (parse → optimise with stats → execute → storage); DECIMAL vs FLOAT; PKs not enforced in Snowflake/Delta; the WAL = crash recovery, replication and CDC source.
  `),

  nosql: T(`
    > **In one line:** **NoSQL** databases drop parts of the relational model (fixed schema, joins or cross-row transactions) to gain **horizontal scale, flexible shapes or very low latency** for specific access patterns. Four families: **key-value, document, wide-column, graph**.

    **Why:** 2000s web companies needed hundreds of thousands of writes/s across continents with weekly schema changes; hand-sharding relational DBs hurt. Amazon's Dynamo and Google's Bigtable designed around **known access patterns** and **partitioning across many cheap machines** from the start.

    | Family | Model and access | Examples | Use |
    |---|---|---|---|
    | **Key-value** | key → opaque value; get/put/delete | Redis, DynamoDB, Memcached | Cache, sessions, ML feature serving, rate limits, leaderboards |
    | **Document** | JSON-like documents, fields vary, nested; by ID + secondary indexes | MongoDB, Couchbase, Cosmos DB, Firestore | Catalogues, profiles, app objects |
    | **Wide-column** | Rows by **partition key**, many columns sorted by **clustering key**; range scans inside a partition | Cassandra, HBase, Bigtable, Accumulo (cell-level security) | Time-series, event logs, IoT at huge scale |
    | **Graph** | Nodes + edges with properties; traversals | Neo4j, Neptune | Supply-chain networks, fraud rings, recommendations |
    Don't confuse **wide-column** (an operational data model) with **columnar** storage (Parquet, Snowflake: a scan layout).

    ## How they scale
    - **Partitioning:** the key's hash picks the owning node; adding nodes spreads load. Bad keys create **hot partitions**.
    - **Replication:** each record on e.g. 3 nodes; reads/writes need 1, a quorum or all replicas → tunable **consistency vs latency vs availability** (Cassandra, DynamoDB).
    - Often **eventually consistent** by default: a read right after a write may be stale; stronger options cost more.
    - **LSM trees** (Cassandra, HBase, RocksDB): writes go to an in-memory memtable + commit log, flushed to immutable sorted files (SSTables) merged by **compaction**. Very fast writes; reads may check several files (bloom filters help); compaction adds write amplification and latency spikes. B-trees (most RDBMS) favour reads and in-place updates.

    **Core rule: model for your queries.** List queries first, design tables so each hits one partition, **duplicate data** into query-shaped tables; new queries may need new tables.

    | Choose when | Avoid when |
    |---|---|
    | Huge scale of simple key access | Ad-hoc queries and joins |
    | Flexible/nested schemas | Multi-record transactions are central |
    | Low-latency global serving | Access patterns unknown or changing |
    | Massive time-series writes | Data is relational and moderate (use Postgres) |
    Also: time-series DBs (InfluxDB, TimescaleDB, ADX) for telemetry; search engines (Elasticsearch/OpenSearch) for text and logs.

    **In pipelines** (posting lists HBase, Cassandra, MongoDB, Accumulo, DynamoDB): **sources** (ingest via change streams/DynamoDB Streams, exports; expect nested, varied documents), **serving sinks** ("latest health score per engine" for an app; ML features in Redis), **telemetry stores** with analytical copies in the lakehouse. Do **analytics in the lakehouse**, never by scanning a Cassandra table.

    ## What goes wrong
    - **Hot partitions:** keying by «date» sends all of today's writes to one node → key by «engine_id» (+ time bucket).
    - **Unbounded partitions:** one per engine forever grows to GBs → key «(engine_id, month)».
    - **Read-your-write fails** under eventual consistency → stronger reads where it matters.
    - **Schema-less ≠ no schema:** it lives in app code; ten document shapes accumulate, so ingestion must cope.
    - Non-key filters are slow or forbidden (Cassandra «ALLOW FILTERING»).
    - **Tombstones** from deletes slow reads until compaction.

    **Interview:** name the families with a use each; why scalable (key partitioning, limited operations, tunable consistency); engine readings in Cassandra → partition «(engine_id, day)», cluster by «ts».
  `),

  sqlvsnosql: T(`
    > **In one line:** **SQL** gives fixed schemas, joins, flexible queries and strong transactions, scaling mostly up; **NoSQL** gives flexible schemas and horizontal scale for **known access patterns**, often with weaker consistency and no joins. Decide by workload, consistency and query patterns, not fashion.

    ## Decide in this order
    1. **Access patterns:** ad-hoc, changing, many joins → SQL; a few known key patterns → NoSQL.
    2. **Consistency:** money, inventory reservations → strong ACID; likes, telemetry, caches → eventual is fine.
    3. **Scale:** a well-run relational DB handles many TB and tens of thousands of TPS; beyond that or global multi-region writes → NoSQL or distributed SQL.
    4. **Shape variability:** stable → SQL; highly variable/nested → document store (or JSON columns in SQL).
    5. **Team and operations:** what people know and the company supports.

    | | SQL | NoSQL |
    |---|---|---|
    | Schema | Up front (on write) | Flexible, in the app |
    | Queries | Anything, joins | By key/index, limited joins |
    | Transactions | Multi-row, multi-table ACID | Often single-record; some multi-item with limits |
    | Consistency | Strong | Often eventual, tunable |
    | Scaling | Vertical; replicas; sharding hard | Horizontal by design |
    | Modelling | Normalise data | Denormalise for queries |
    | Best for | Business records, finance, flexible analysis | Massive key access, documents, time-series, caching |

    **CAP/PACELC preview:** during a network partition a distributed DB chooses **consistency** (refuse some requests) or **availability** (answer, maybe stale); many NoSQL systems choose availability. PACELC: even without partitions you trade **latency vs consistency**.

    **The modern blur:** Postgres has indexed JSONB, time series (Timescale), vectors (pgvector); MongoDB has multi-document ACID and rich queries; DynamoDB transactions cover up to 100 items; Cassandra's CQL looks like SQL with NoSQL rules; distributed SQL (Spanner, CockroachDB, YugabyteDB) = relational + ACID + horizontal scale. Senior framing: **which guarantees and access patterns does the workload need, at acceptable cost and operations?**

    **Polyglot persistence** is normal: Postgres for orders, Redis for sessions/cache, Elasticsearch for search, Cassandra for telemetry, a lakehouse for analytics. The DE moves and reconciles data among them (CDC, exports, contracts).

    ## What goes wrong
    NoSQL chosen "for scale" at small size, then joins/reporting rebuilt painfully in app code. SQL chosen, then telemetry at 500k events/s hits a write wall → stream + wide-column or lakehouse. "No schema work" myth: ingestion must handle every historical document shape. "Eventual = a few ms" myth: under failures or cross-region it can be much longer.

    **Interview:** when NoSQL (patterns + scale + consistency + variability, with an example each way); can NoSQL do transactions (some, with limits: DynamoDB, MongoDB); telemetry → stream + wide-column/lakehouse, claims → relational.
  `),

  rowcol: T(`
    > **In one line:** **row storage** keeps a record's values together (great for reading/writing whole records); **column storage** keeps each column's values together (great for scanning few columns across many rows). It's the main reason analytical engines are fast.

    **Layout** for «claims(id, dealer, amount, status)»: row = «1,14,500,A | 2,9,700,R | …»; column = «1,2,3… | 14,9,14… | 500,700,300… | A,R,A…» (per row group/segment).

    ## Why columnar wins for analytics
    1. **Read only needed columns:** «SUM(amount) GROUP BY status» touches 2 of 40 columns (~5% of bytes).
    2. **Compression:** similar values per column → **dictionary** (status as tiny integers), **run-length** («West × 10,000» when sorted), **delta** (timestamps as small differences), **bit-packing**, then a codec (Snappy, ZSTD). 5-10× smaller is common.
    3. **Vectorised execution:** CPUs process same-typed arrays in tight SIMD loops.
    4. **Skipping:** min/max stats per column chunk; «amount > 100000» skips chunks whose max is lower. Sorted/clustered data skips more.

    ## Why row storage wins for transactions
    One insert writes one place, not 40 column blocks; an update rewrites a small area (in columnar files it often rewrites a whole file, which is why lakehouse updates rewrite Parquet or use delete vectors); fetching one record by key is one page read, not 40 reads plus reassembly. Bridges: **HTAP** systems or CDC into a lakehouse.

    | Format | Layout | Use |
    |---|---|---|
    | CSV, JSON Lines | Row text | Exchange, raw landing |
    | Avro | Row binary + schema | Kafka, streaming, write-heavy |
    | Parquet | Columnar | Lakehouse (Delta, Iceberg), analytics |
    | ORC | Columnar | Hive |
    | Postgres/MySQL tables | Row pages | OLTP |
    | Snowflake/BigQuery/Redshift | Columnar (proprietary) | Warehouse |
    **Parquet is hybrid:** file → **row groups** (e.g. 128 MB) → column chunks → pages, with a footer of schema and stats. Row groups let workers split files; column chunks let them read selectively. Sorting/clustering before writing tightens stats and compression.

    **Choose:** write-heavy, record-at-a-time → row (Avro, OLTP DBs); read-heavy scans → columnar. Common pipeline: **Avro/JSON on the wire → Parquet/Delta at rest.**

    ## What goes wrong
    «SELECT *» on a wide columnar table reads every column. Tiny files waste metadata and compress poorly. Unsorted data makes min/max useless → cluster/Z-order on common filters. Many nullable columns are cheap in columnar (NULLs compress away). Frequent single-row updates on Parquet cause write amplification → batch updates, use delete vectors.

    **At scale:** a 10 TB table, 3 columns, good pruning → maybe 50 GB scanned instead of 10 TB: 10 seconds vs 30 minutes, and a much smaller bill in pay-per-scan engines.

    **Interview:** why Parquet (selected columns, encodings, stats, splittable row groups, embedded schema); why not Parquet for Kafka messages (small individual records; Avro fits); **predicate pushdown** = passing filters to the reader so it skips row groups/files by stats before loading.
  `),

  keys: T(`
    > **In one line:** keys answer **"which one"**: a **primary key** uniquely identifies a row, a **foreign key** points to another table's row, a **unique constraint** forbids duplicates. They drive joins, dedupe, MERGE and data quality.

    | Key | Meaning | Example |
    |---|---|---|
    | Primary (PK) | Unique, not NULL, one per table | «claims.claim_id» |
    | Candidate | Any column set that could be the PK | engine_id and serial_no |
    | Natural (business) | Has business meaning | Serial number, invoice no., VIN |
    | Surrogate | Meaningless generated ID (sequence, hash) | «dealer_sk = 1042» |
    | Composite | Several columns together | «(order_id, line_no)» |
    | Foreign (FK) | References another key | «claims.dealer_id → dealers» |
    | Unique constraint | No duplicates (NULLs usually allowed) | «dealers.dealer_code» |

    **Why:** identity (otherwise updates/deletes are ambiguous), integrity (no orphan claims), performance (usually indexed), and pipelines: **dedupe** (one row per claim_id), **MERGE** (update if key exists, else insert), **CDC apply**, **reconciliation** (which keys are missing).

    **Enforcement:** PK/UNIQUE checked by a unique index on every write; FK requires the parent to exist, and on parent delete applies RESTRICT, CASCADE or SET NULL. **Analytical engines (Delta, Snowflake, BigQuery, Redshift) mostly don't enforce PK/FK** (too slow on bulk loads; Delta enforces NOT NULL and CHECK only). Declarations still help optimisers and BI tools, but **your pipeline must enforce uniqueness (dedupe + MERGE) and test it**.

    | | Natural key | Surrogate key |
    |---|---|---|
    | Stability | Can change (dealer re-coded) | Never changes |
    | Across sources | Each system has its own | One key for the conformed entity |
    | SCD2 history | Repeats across versions | One per version |
    | Join speed | Possibly long strings | Compact integers |
    Typical design: keep the natural key as an attribute, use a surrogate as the dimension PK, look it up when loading facts.

    **Good keys:** unique, always present, stable, simple; never built from changeable attributes (names, emails, phones). State the **grain** of composite keys («(engine_id, reading_ts)» = one row per engine per timestamp). **Hash keys** (SHA-256 of business columns) give deterministic IDs across runs; handle NULLs and column order consistently. Normalise composite natural keys (trim, case) before hashing or joining.

    ## What goes wrong
    - "Unique" source key isn't (claim numbers reused across countries) → composite «(country, claim_no)»; **test**, don't trust docs.
    - **NULL keys** drop out of joins and group together in dedupe → reject/quarantine.
    - Case/whitespace («D-014» vs «d-014 ») → normalise.
    - **Leading zeros:** «00123» as integer collides with «123» → keep IDs as strings.
    - Source re-assigns a code → history points wrong; surrogates + crosswalk protect it.
    - **Orphan facts** (unknown dimension key) → map to «-1 Unknown» (or inferred member), quarantine and alert, never drop silently.
    - Duplicate PKs after a non-idempotent load in a non-enforcing engine silently inflate totals.

    **Interview:** natural vs surrogate (stability, multi-source, SCD2, speed); guaranteeing uniqueness without enforcement (ROW_NUMBER dedupe, MERGE, dbt «unique» tests, alerts); missing dimension keys (unknown member, quarantine, late-arriving dimension handling).
  `),

  indexing: T(`
    > **In one line:** an index is a separate sorted structure that finds rows **without reading the whole table**, like a book index. Reads on indexed columns get fast; every write gets a bit slower and the database bigger.

    **Example:** «WHERE claim_id = 9001» on 200M rows: no index = full scan (seconds-minutes); B-tree = ~4 levels, a handful of pages (milliseconds).

    **B-tree:** a balanced tree of pages; internal pages hold sorted keys and child pointers, leaves point to rows (or hold them, if clustered). Lookup is **O(log n)**; hundreds of keys per page means 4 levels cover billions of rows. Sorted keys also serve **ranges**, «ORDER BY» and MIN/MAX.

    | Index | Good for |
    |---|---|
    | B-tree (default) | Equality, ranges, sorting |
    | Hash | Equality only |
    | Clustered (rows stored in key order; one per table) | Range scans on that key (SQL Server, InnoDB PK) |
    | Secondary / non-clustered | Extra lookup paths |
    | Composite | Filters on the leading columns |
    | Covering (has all needed columns) | Answer from the index alone |
    | Bitmap | Low-cardinality analytics columns |
    | Inverted / full-text (GIN) | Text search, arrays, JSONB |
    | Partial / filtered | "Only open claims" |
    | BRIN (Postgres) | Tiny index for naturally ordered huge tables (append-only telemetry by time) |

    **Leftmost-prefix rule:** «(dealer_id, submitted_at)» helps «dealer_id = 14» and «dealer_id = 14 AND submitted_at > …», **not** «submitted_at > …» alone. Equality column first, range column after.

    **Costs:** every write updates every index (10 indexes ≈ 10 extra writes); indexes can be as big as the table; bulk loads are faster with indexes dropped and rebuilt; fragmentation/bloat; stats must be fresh.
    **Rule of thumb:** an index helps when a query returns a small fraction of rows (a few percent or less); otherwise a scan is cheaper.

    ## When an index isn't used
    Function on the column («DATE(submitted_at) = …», «UPPER(code)») → rewrite as a range or add a function index. Implicit type conversion. Leading wildcard «LIKE '%pump'». Low selectivity (status matching 60%). OR across columns or wrong composite order. Stale statistics.

    **Analytics equivalent:** warehouses/lakehouses mostly skip **data** instead: partition pruning, min/max stats per file/row group (zone maps), clustering / Z-order / liquid clustering for multi-column skipping, **bloom filters** for high-cardinality equality, Snowflake micro-partition pruning, BigQuery clustering, Delta data skipping. "Add an index" in OLTP becomes **"fix the data layout"** in OLAP.

    **In pipelines:** incremental extracts on «updated_at» need an index on it (or every extract full-scans production; ask the DBA or use CDC); MERGE into a serving DB needs an indexed key; in the lakehouse, partition by date, cluster by common filters, compact small files.

    **Interview:** how indexes speed queries and what they cost; why an index isn't used; how warehouses filter fast without indexes.
  `),

  normal: T(`
    > **In one line:** **normalisation** stores each fact **once** across tables (safe updates, for OLTP); **denormalisation** repeats data in fewer, wider tables (fewer joins, for analytics). Each is right for its workload.

    **What normalisation prevents (anomalies)** in one wide «claims(claim_id, dealer_id, dealer_name, dealer_region, amount)» table:
    - **Update:** dealer 14 moves North; you update 4,998 of 5,000 rows → two regions.
    - **Insert:** can't record a dealer before its first claim.
    - **Delete:** deleting the only claim deletes everything known about the dealer.
    Fix: a «dealers» table referenced by key.

    | Form | Rule | Violation | Fix |
    |---|---|---|---|
    | 1NF | Atomic values, no repeating groups | «parts = "P-77,P-12"» | Child table, one row per part |
    | 2NF | Non-key columns depend on the **whole** composite key | customer_name in «order_lines(order_id, line_no)» depends on order_id only | Move to «orders» |
    | 3NF | No non-key → non-key dependency | dealer_region depends on dealer_id in claims | Move to «dealers» |
    | BCNF | Every determinant is a candidate key | Rare overlapping-key cases | Further split |
    Mnemonic: depends on **the key, the whole key, nothing but the key**. 3NF is the OLTP target.

    **Why analytics denormalises:** a 6-join query on billions of rows (with distributed shuffles) is expensive; analytics reads far more than it writes and loads in controlled batches, so the pipeline can handle anomalies. Forms: **star schema** (fact + wide flat dimensions), **one big table** for a heavy dashboard, **nested columns** (arrays/structs) instead of child tables.

    | | Normalised | Denormalised |
    |---|---|---|
    | Duplication | Minimal | Intentional |
    | Writes | Simple, safe | Pipeline updates copies |
    | Reads | Many joins | Few joins |
    | Storage | Smaller | Larger (columnar compression helps) |
    | Integrity | By structure | By pipeline logic and tests |
    | Home | OLTP sources (and often silver entities) | Gold, marts, serving, features |
    Dimensional modelling is "normalised enough" (facts reference dimensions) and "denormalised enough" (flat dimensions).

    «««flow
    OLTP 3NF -> Silver conformed entities -> Gold star schema -> OBT for one heavy dashboard
    »»»
    The pipeline makes it safe: a region change updates (or SCD2-versions) the dimension in one controlled step, then gold is rebuilt. Wide marts are rebuilt from the star layer, never edited directly.

    ## What goes wrong
    Stale denormalised copies (nightly OBT shows yesterday's region) → document cadence, rebuild dependents together. **Fan-out joins** (claims joined to several contacts per dealer multiplies rows and inflates sums) → know every join's cardinality. Over-normalised analytics (analysts hand-write 9-join queries that drift) → modelled gold. **Current vs as-of:** putting the current region on historical facts moves last year's sales → decide (SCD2). Nested arrays confuse BI tools → flatten at consumption.

    **Interview:** 1NF/2NF/3NF with the claims example; why denormalise in a warehouse (read-heavy, batch loads, costly joins, cheap compressed duplication); **fan-out** = join with multiple matches per key that multiplies rows.
  `),

  transactions: T(`
    > **In one line:** a **transaction** makes several operations **all happen or none**; **ACID** (Atomicity, Consistency, Isolation, Durability) keeps that safe under concurrency and crashes.

    **Example:** approving a claim = set Approved + insert credit note + reduce dealer balance. A crash after step 1 leaves an approval with no credit note; two clerks at once create two credit notes. Transactions prevent both.

    | Letter | Guarantee | Mechanism |
    |---|---|---|
    | Atomicity | All or nothing | WAL + rollback |
    | Consistency | Valid state; constraints hold | Constraints, checks at commit |
    | Isolation | No one sees half-done work | Locks / MVCC |
    | Durability | Committed survives crashes | Log flushed before "commit OK" |
    ACID "consistency" (constraints) ≠ CAP "consistency" (replicas return the latest write). Interviewers love this.

    ## Isolation anomalies and levels
    | Anomaly | Meaning |
    |---|---|
    | Dirty read | Read uncommitted data that is then rolled back |
    | Non-repeatable read | Same row, different value on re-read |
    | Phantom | Same query returns new rows |
    | Lost update | Two read-modify-writes; one overwrites the other |
    | Write skew | Each checks a condition and writes different rows; together they break a rule (both on-call engineers go off duty) |
    | Level | Prevents | Still allows |
    |---|---|---|
    | Read uncommitted | Almost nothing | Dirty reads |
    | **Read committed** (default: Postgres, SQL Server, Oracle) | Dirty reads | Non-repeatable, phantoms, lost updates |
    | Repeatable read / snapshot | + non-repeatable (and phantoms in snapshot) | Write skew |
    | Serializable | All (as if one at a time) | Costs throughput; aborts for retry |

    **MVCC:** writes create new row versions tagged with the transaction ID; readers see versions committed when their snapshot began, so **readers don't block writers**; old versions are cleaned later (Postgres VACUUM). Lakehouse formats do the same with files: each commit = a new table version, readers use snapshots.

    ## In data engineering
    - **Relational target:** wrap "delete partition + insert partition" in one transaction so readers never see an empty day.
    - **Lakehouse:** each write is an atomic log commit, snapshot isolation for readers, **optimistic concurrency** for writers (conflicts fail and retry). Atomicity is **per table**: updating a fact and its aggregate = two commits; readers may see one without the other unless you publish after both (view swap) or the platform has multi-table transactions.
    - **Streaming exactly-once:** commit output and progress (offsets) atomically, or write idempotently.
    - **Across systems** (DB + Kafka + API): two-phase commit is slow and fragile; prefer the **outbox pattern** (event row written in the same DB transaction, then published via CDC), idempotent consumers and **sagas** (local transactions with compensations).

    ## What goes wrong
    Read-modify-write races (two jobs read the same watermark and both process) → «SELECT … FOR UPDATE», version checks, single scheduler. **Long transactions** hold locks, bloat MVCC, block DDL, lag replication (never keep a 2-hour extract transaction open on a primary). Autocommit leaves partial changes when statement 3 of 5 fails. Assuming multi-table atomicity in a lakehouse. **Retrying after a timeout** may duplicate (the commit may have succeeded) → idempotency keys.

    **Interview:** ACID with the claim example; default isolation and its remaining anomalies (read committed: lost updates, non-repeatable reads); how Delta gives ACID (atomic log commits, snapshots, optimistic concurrency); DB write + Kafka publish → outbox + CDC or idempotent consumers.
  `),

  replication: T(`
    > **In one line:** replication keeps **copies on several machines** for availability, durability and read scale. The hard part: keeping copies in agreement and knowing how far behind each is.

    **Leader-follower** (most common): all writes go to the leader, which ships its log (WAL/binlog) to followers that apply it in order; followers serve reads; if the leader dies, a follower is **promoted** (failover).

    | | Synchronous | Asynchronous |
    |---|---|---|
    | Commit returns after | Followers confirm | Leader writes locally |
    | Loss on leader crash | None (confirmed followers) | Last unshipped changes |
    | Write latency | Higher | Lower |
    | Slow follower | Slows/blocks writes | No effect |
    Compromise: **semi-synchronous** (wait for one follower).

    - **Multi-leader:** several nodes accept writes (e.g. per region); low local latency but **conflicts** need rules (last-write-wins, merge).
    - **Leaderless** (Cassandra, DynamoDB): write to several replicas, read several, take the newest. **Quorum:** N replicas, write W, read R; **W + R > N** guarantees a read overlaps the latest write (N=3, W=2, R=2).
    - **Consensus** (Raft/Paxos: etcd, CockroachDB, Kafka KRaft, Spanner): majority agrees per write; strong consistency with automatic failover.
    - **Physical** replication copies pages (same engine/version); **logical** streams row changes (cross-version, selected tables, **CDC**, as Debezium uses).

    **Lag anomalies:** read-your-own-write fails (save then read a stale replica); non-monotonic reads (data appears to go back in time across replicas); stale "current" dashboards on a lagging replica. Measure lag and decide which reads may use replicas; extracts from async replicas are fine if you **record the replica's position/time**.

    | System | Replication |
    |---|---|
    | Postgres/MySQL | Leader-follower via WAL/binlog; logical replication feeds CDC |
    | HDFS | Each block on 3 DataNodes, rack-aware |
    | Kafka | Partition leader + followers; **ISR**; «acks=all» + «min.insync.replicas=2» |
    | Cassandra/DynamoDB | Leaderless, tunable per request |
    | Object storage | Within-region automatic; cross-region optional |

    **Replication is not backup:** a «DELETE» without WHERE replicates everywhere in milliseconds. Backups and time travel protect against logical errors; replication against hardware failure.

    ## What goes wrong
    **Split brain** (two leaders after a network partition; data diverges) → consensus/quorum and fencing. Async failover loses the last seconds of writes (IDs may be reused). CDC from a lagging replica lags; an unconsumed Postgres **replication slot** retains WAL until the disk fills. After failover the CDC slot/position may not exist on the new primary → re-snapshot or slot failover. Kafka «acks=1» loses messages if the leader dies before followers copy. Cross-region replication surprises bills and latency.

    **Interview:** sync vs async (durability vs latency vs availability); lag effects on replica extracts (stale data, watermark gaps); replication ≠ backup; W + R > N.
  `),

  dbpartition: T(`
    > **In one line:** partitioning **splits a large table into pieces** by a rule (date, region, key hash) so queries **skip pieces**, maintenance works **piece by piece**, and data can **spread across machines**. The partition key is a high-stakes design choice.

    **Three meanings of "partition":** (1) splitting within one system for pruning and management (a month-partitioned table, «/event_date=2026-11-26/» folders); (2) splitting across machines = **sharding** (Cassandra, Kafka topics, distributed SQL); (3) in Spark, a chunk of data processed by one task. Say which you mean.

    | Strategy | Rule | Good for | Risk |
    |---|---|---|---|
    | Range | Value ranges (dates, IDs) | Time queries, dropping old data | Hot latest partition |
    | List | Explicit values (region) | Known categories | Uneven sizes |
    | Hash | hash(key) mod N | Even spread | Ranges hit all partitions; changing N reshuffles (use consistent hashing) |
    | Composite | Range then hash | Time queries + spread | Complexity |

    **Benefits:** **pruning** («event_date = …» reads 1 of 1,000); **instant retention** (drop a partition instead of a huge DELETE); **idempotent loads** (overwrite exactly one partition per run: insert overwrite / replaceWhere); parallelism; per-partition maintenance.

    ## Choosing a key
    1. Columns queries **filter on** (usually date).
    2. **Low-moderate cardinality** for folder-style partitions (date yes; 100,000 engine_ids no).
    3. Partitions of roughly **1 GB+** in lakehouses (files ~128 MB-1 GB); thousands of tiny partitions are worse than none.
    4. **Stable values** (not status, which would force rows to move).
    5. Match the **load pattern** (daily loads → daily partitions).
    6. For **sharding**: high cardinality, even spread, related data together (engine_id). Shard keys are near-permanent.

    **Lakehouse:** Hive-style folders prune by path; for other filter columns use **clustering / Z-order / liquid clustering** instead of more partition columns. **Iceberg hidden partitioning** stores a transform (day(ts)) so filters on «ts» still prune, and schemes can evolve without rewrites. Databricks advises not partitioning tables under ~1 TB; cluster instead.

    ## What goes wrong
    **Over-partitioning** (date × engine_id → millions of tiny-file folders; planning slower than reading). Filtering on a function («year(event_ts) = 2026») when the partition column is «event_date» → no pruning; filter the column itself. **Skewed** partitions (one region 70%). Late data writes into old partitions → daily overwrite needs a **lookback**. Local vs UTC partition dates split days differently → be consistent. Time-range sharding sends all of today's writes to one shard.

    **Interview:** partition a 5 TB events table → daily by event date, cluster by the common filter key, right-sized files, compaction, no high-cardinality partition columns. Pruning = skipping partitions at planning time. Range vs hash = locality vs even spread.
  `),

  scaling: T(`
    > **In one line:** **vertical (scale up)** = a bigger machine; **horizontal (scale out)** = more machines. Up is simple but has a ceiling and one failure domain; out is nearly unlimited but brings distributed-systems problems.

    | | Vertical | Horizontal |
    |---|---|---|
    | How | Bigger instance (8 → 64 cores, 32 → 512 GB) | Shard data, distribute work (Spark), stateless services behind load balancers, Kafka consumer groups |
    | Pros | No code changes, easy consistency, one machine to run | Near-linear growth, commodity hardware, fault tolerance, cloud elasticity |
    | Cons | Top-end prices rise steeply, hard ceiling, resize downtime, single point of failure | Network/shuffle bottlenecks, coordination and consistency, partial failures, harder ops, not everything parallelises |
    | Typical | OLTP databases, DuckDB/pandas, most pipelines that aren't huge | Big data processing, streaming, large serving systems |

    ## The laws
    - **Amdahl:** if 10% is sequential, no cluster makes it more than 10× faster. Remove sequential parts (driver work, one final sort, one giant key).
    - **Coordination cost:** more nodes = more communication; adding nodes to a shuffle-heavy job can slow it.
    - **Stateless scales easily, stateful doesn't** (adding DB nodes means moving data).
    - **Read scaling** (replicas, caches) is easy; **write scaling** needs sharding or distributed DBs; **analytical scaling** = move analytics off OLTP.

    | Bottleneck | Scale up | Scale out |
    |---|---|---|
    | Query CPU | Bigger warehouse | More clusters/nodes |
    | Dashboard concurrency | Bigger box | Multi-cluster warehouses, replicas, caching |
    | Stream throughput | Faster consumer | More Kafka partitions + consumers |
    | Spark job | Bigger executors | More executors/partitions |
    | OLTP writes | Bigger primary | Sharding, distributed SQL |
    Vertical first is often right for databases; Postgres also hits **connection limits** (a process each) → poolers (PgBouncer), cap Spark JDBC parallelism.

    **Elasticity:** cloud scales out for the nightly batch and back in afterwards (autoscaling, serverless, auto-suspend); limits are start-up time, minimums, quotas, and bad queries triggering costly scale-out.

    **Before scaling, do less work:** read less (pruning, column projection, early filters), process less (incremental), move less (broadcast small tables, avoid needless repartitions), fix skew. **Profile first, then scale.**

    ## What goes wrong
    Scaling out a **skewed** job (199 tasks done in 1 minute, 1 takes 40). **Driver bottleneck** (collect to driver, single-threaded Python). Too many tiny partitions (overhead > work). **Shared bottleneck** (50 workers vs one rate-limited API or DB). Hot keys in sharded stores.

    **Interview:** pros/cons of each; slow Spark job → check skew, shuffles, small files, sequential parts and data read before adding nodes; Kafka consumer scaling is capped by partitions (one consumer per partition per group).
  `),

  schema: T(`
    > **In one line:** a **schema** is the agreed structure (names, types, nullability, keys, meaning); **schema evolution** changes it **without breaking** producers or consumers. Most pipeline outages trace back to an unmanaged schema change.

    **Schema-on-write** (relational, Delta enforcement, Avro + registry): bad data rejected early; safer, less flexible. **Schema-on-read** (raw JSON in a lake): flexible, but every reader copes with every variation and errors appear late. Practice: **on-read for bronze, on-write from silver**.

    | Change | Risk |
    |---|---|
    | Add optional column | Usually safe |
    | Add required column | Breaks old producers |
    | Remove column | Breaks consumers reading it |
    | Rename | Breaks everyone (= remove + add) |
    | Widen type (INT→BIGINT, FLOAT→DOUBLE) | Usually safe |
    | Narrow/change type | Fails or truncates |
    | Change meaning (amount now excludes tax) | **Silent**: numbers shift |
    | Change grain (claim → claim line) | **Silent** double counting |
    | Change nullability | Breaks NOT NULL assumptions |

    ## Registry compatibility (Avro/Protobuf/JSON Schema in Kafka)
    - **Backward:** new-schema consumers read old data (add field **with a default**) → **upgrade consumers first**.
    - **Forward:** old-schema consumers read new data (add fields old readers ignore; remove optional fields) → **upgrade producers first**.
    - **Full:** both. **Transitive:** against all previous versions, not just the last.
    The registry rejects incompatible producers, turning an outage into a failed deploy.

    **Lakehouse:** Delta **enforces** by default; «mergeSchema» adds columns, «overwriteSchema» replaces; **column mapping** allows rename/drop without rewriting files; **type widening** allows safe promotions; enabling table features can lock out readers on older protocol versions (check consumers). Iceberg tracks columns by **ID**, so add/drop/rename/reorder are metadata-only, plus partition evolution. Auto Loader's **«_rescued_data»** column keeps unexpected fields and type mismatches instead of failing or losing them.

    ## Safe change process
    1. Classify: additive, breaking or semantic.
    2. Additive: deploy, document.
    3. Breaking: **expand → migrate → contract**: add the new alongside the old, backfill, move consumers (found via lineage), remove the old after a deprecation date. Never rename/drop in one step on shared tables.
    4. Semantic: treat as breaking (new name/version, announce).
    5. Automate: producer contract tests in CI, ingestion schema checks, drift alerts.
    Layers: bronze tolerant, silver evolves deliberately under contracts, gold changes only through versioned releases.

    ## What goes wrong
    Renamed source column read by name returns NULL in permissive readers (green job). JSON type drift: inference picks a type per file, files disagree. Inference on a sample misses a rare field for everyone. «INSERT … SELECT *» maps by **position**, so reordered columns land in wrong places → map by name. CSV headers change while code uses positions. Years of Parquet with differing schemas need merging or a table format. BI extracts with fixed schemas break.

    **Interview:** what happens and what should happen when a source adds/renames a column; backward vs forward (who reads what, who upgrades first); rolling out breaking changes (expand-migrate-contract, versioning, lineage, communication).
  `),

  fileformats: T(`
    > **In one line:** the file format decides byte layout (text/binary, row/column, schema or not, splittable or not, compressible or not), which can make the same query **10-100× cheaper**. **CSV/JSON to exchange, Avro to stream, Parquet (in Delta/Iceberg) to analyse.**

    | | CSV | JSON (Lines) | Avro | Parquet | ORC |
    |---|---|---|---|---|---|
    | Layout | Row text | Row text | Row binary | Columnar | Columnar (stripes) |
    | Schema/types | None | Implicit, weak | Explicit, evolvable | Explicit (footer) | Explicit |
    | Nested | No | Yes | Yes | Yes | Yes |
    | Compression | Poor | Poor | Good | Excellent | Excellent |
    | Splittable | Uncompressed or bzip2 | JSON Lines only | Yes | Yes | Yes |
    | Best at | Partner exchange, small exports | APIs, events, raw landing | Kafka, streaming, write-heavy | Analytics at rest | Hive ecosystems |
    - **CSV:** readable, universal; but no types, quoting/escaping/embedded-newline issues, delimiter collisions, encodings, large and slow.
    - **JSON:** flexible and nested; repeats field names (large), slow parsing, type drift. **JSON Lines** (one object per line) is splittable and streamable.
    - **Avro:** compact binary rows with a schema (header or registry), strong evolution (defaults, aliases); not readable, poor for scans.
    - **Parquet:** row groups → column chunks → pages, min/max stats, encodings + codec; column pruning, pushdown, nested types; costly to write row by row, immutable (updates = rewrites), needs a table format for ACID. Use INT64 timestamps (INT96 is legacy); very wide schemas (thousands of columns) slow footers and planning.
    - **ORC:** Parquet-like with indexes and bloom filters; strong in Hive/Presto.
    - **Table formats** (Delta, Iceberg, Hudi) aren't file formats: they're a metadata layer (log, schema, snapshots, stats) over Parquet.
    - **VARIANT** (Spark 4/Databricks, Iceberg v3): efficient binary semi-structured JSON with common paths shredded; an alternative to strings or rigid structs for evolving payloads.

    **Splittable matters:** parallel engines give each worker a byte range. Uncompressed CSV/JSON Lines can start mid-file; **a GZIP CSV cannot**, so one 50 GB «.csv.gz» is read by **one task** (split it, use bzip2, or convert to Parquet). Parquet/Avro/ORC are splittable with any codec. One giant JSON array isn't.

    «««flow
    Source export (CSV/JSON) -> Raw as received (bronze) -> Parquet/Delta with enforced schema (silver) -> Gold Delta -> Exports in the consumer's format
    »»»
    Kafka carries Avro (or Protobuf/JSON with a registry).

    ## What goes wrong
    **CSV parsing:** quoted commas, newlines in fields, escaping, trailing delimiters, mixed line endings, BOMs, non-UTF-8, thousands separators («1,250.00»), ambiguous dates (03/04 = March or April?) → always set delimiter, quote, escape, encoding, header, date format and an explicit **schema**; no inference in production. Inference on a sample breaks when later rows differ. Parquet files disagreeing on a type (INT vs DOUBLE) or decimal precision. Timestamp differences (INT96 vs INT64, UTC vs local, ms vs µs). Many small Parquet files → compact.

    **Interview:** why Parquet; Parquet vs Avro (columnar reads vs row writes/streaming with evolution); one 40 GB «.csv.gz» on one core → GZIP isn't splittable.
  `),

  compression: T(`
    > **In one line:** compression cuts the bytes you **store, read and move**, trading CPU for less I/O. Columnar formats use two layers: **encodings** that exploit column patterns, then a **codec** (Snappy, ZSTD, GZIP).

    **Why it speeds things up:** storage reads and network are the bottleneck; CPUs decompress faster than disks/networks deliver. 100 GB compressed to 15 GB = 85% less I/O, and a smaller bill in pay-per-scan engines (BigQuery).

    | Encoding | How | Best for |
    |---|---|---|
    | Dictionary | Each distinct value once; data becomes small codes | Status, region, model |
    | Run-length (RLE) | value × count | Long repeated runs (after sorting) |
    | Delta | Differences between consecutive values | Timestamps, increasing IDs |
    | Bit-packing | Only the bits needed | Small integers, dictionary codes |
    Parquet applies these automatically per column chunk; **sorting by low-cardinality columns before writing** makes them far more effective. Encodings do most of the work.

    | Codec | Ratio | Speed | Typical use |
    |---|---|---|---|
    | Snappy | Moderate | Very fast | Long-time Spark Parquet default, hot data |
    | **ZSTD** | High | Fast (tunable) | Modern balanced default |
    | LZ4 | Moderate | Fastest | Kafka, real-time |
    | GZIP | High | Slow | Text files, archives (whole-file: **not splittable**) |
    | bzip2 | High | Very slow | Rare archival text (splittable) |
    Inside Parquet/ORC/Avro the codec works per page/block, so files **stay splittable** with any codec; the problem is only whole-file compressed text (one big «.csv.gz»).

    **Choose:** hot data → Snappy or low-level ZSTD; cold/archive → high ZSTD or GZIP (pay CPU once, save forever); Kafka → LZ4/ZSTD with batching (bigger batches compress better); text exchange → GZIP split into ~256 MB parts.
    **Trade-offs:** CPU on write vs smaller faster reads (worth it for data read many times); already-compressed data (images, video, encrypted) won't shrink further.

    ## What goes wrong
    One giant gzip file reduces a 100-core cluster to one core. Tiny files compress poorly (fix sizes first). **Encrypting before compressing** makes data incompressible: compress first (Parquet modular encryption handles this). Random high-cardinality strings (UUIDs, hashes) compress badly: store as binary or question the need. A 1 GB compressed file may be 10 GB in memory: size executors for decompressed data.

    **Interview:** Snappy vs GZIP vs ZSTD (speed vs ratio; ZSTD balanced; GZIP for text); why compression is faster (I/O-bound); is Snappy Parquet splittable? Yes (per page/row group).
  `),
};
