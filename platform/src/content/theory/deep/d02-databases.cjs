const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('../_t.cjs');

module.exports = {
  relational: T(`
    ## Senior depth: inside a relational engine
    - **Storage:** rows in fixed-size **pages** (8 KB in Postgres/SQL Server); tables as heaps (Postgres) or clustered on the primary key (SQL Server, MySQL InnoDB). A clustered key decides physical order: range scans on it are cheap, random inserts into the middle split pages.
    - **Write-ahead log (WAL):** every change is logged before data pages are written; commits are durable once the log is flushed. The WAL is also the source for replication and **log-based CDC** (logical decoding), which is why CDC is cheap and complete.
    - **Buffer pool:** hot pages cached in memory; analytical scans on an OLTP primary evict the working set and slow the application, another reason to extract from replicas/CDC.
    - **Planner:** cost-based with statistics; see the Query plans topic.
  `),
  nosql: T(`
    ## Senior depth
    - **LSM trees** (Cassandra, HBase, RocksDB, ScyllaDB): writes go to an in-memory memtable + commit log, flushed to immutable sorted files (SSTables) and merged by **compaction**. Very fast writes; reads may check several files (bloom filters help); compaction causes write amplification and latency spikes. B-trees (most RDBMS) favour reads and in-place updates.
    - **Pick by access pattern:** key-value (Redis/DynamoDB) for lookups by key; wide-column (Cassandra) for high write rates with known queries; document (MongoDB) for nested, evolving entities; graph (Neo4j) for relationship traversal; time-series (InfluxDB, TimescaleDB, ADX) for telemetry; search (Elasticsearch/OpenSearch) for text and log search.
  `),
  sqlvsnosql: T(`
    ## Senior depth
    - **The real axes:** query flexibility (ad hoc joins vs known access patterns), consistency needs (transactions across entities), scale pattern (write throughput, global distribution), schema volatility, operational skills.
    - **Polyglot persistence** is normal: Postgres for transactions, Redis for caching, Cassandra/ADX for telemetry, a lakehouse for analytics. The DE's job is moving data between them correctly (CDC, exports, contracts).
    - **Modern blur:** Postgres handles JSONB, time series (Timescale) and vectors (pgvector); MongoDB has transactions and SQL-ish aggregation; distributed SQL (CockroachDB, Spanner, YugabyteDB) scales relational horizontally.
  `),
  rowcol: T(`
    ## Senior depth
    - **Why columnar wins for analytics:** reads only needed columns; same-type values compress well (dictionary, run-length, bit-packing, delta); vectorised execution processes column batches with SIMD; min/max stats per chunk enable skipping.
    - **Why it loses for OLTP:** inserting/updating one row touches every column file; point lookups reassemble a row from many places. Hence row stores for transactions, column stores for analytics, and **HTAP** systems (or CDC into a lakehouse) to bridge.
    - **Parquet layout:** file → row groups (e.g. 128 MB) → column chunks → pages, with footer metadata (schema, stats). Sorting/clustering data before writing tightens stats and boosts compression.
  `),
  keys: T(`
    ## Senior depth
    - **Lakehouse constraints are often informational:** Databricks/Snowflake accept PRIMARY KEY/FOREIGN KEY declarations but **do not enforce** them (Delta enforces NOT NULL and CHECK only). Uniqueness must be enforced by your pipeline (dedupe + MERGE) and verified by tests. Declared keys still help optimisers and BI tools.
    - **Composite natural keys** from sources («dealer_code + claim_number») must be normalised consistently (trim, case) before hashing or joining.
    - **Foreign key violations in sources** (orphans) are common in exports without constraints; decide: quarantine, inferred member, or keep with an Unknown key.
  `),
  indexing: T(`
    ## Senior depth
    - **Index types:** B-tree (default), hash (equality only), GIN (arrays, JSONB, full text), GiST/BRIN (Postgres: BRIN is tiny and great for naturally ordered huge tables like append-only telemetry by time), bitmap (warehouses), columnstore indexes (SQL Server analytics).
    - **Costs:** every index slows writes and takes space; bulk loads are faster with indexes dropped and rebuilt.
    - **Lakehouse equivalents:** partition pruning, data skipping stats, Z-order/liquid clustering, bloom filter indexes on high-cardinality lookup columns.
    - **Selectivity rule of thumb:** an index helps when a query returns a small fraction of rows (a few percent or less); otherwise a scan is cheaper.
  `),
  normal: T(`
    ## Senior depth
    - **Normal forms in one line each:** 1NF atomic values, no repeating groups; 2NF no partial dependency on part of a composite key; 3NF no transitive dependency (non-key → non-key); BCNF every determinant is a candidate key.
    - **Update anomalies** are what normalisation prevents: changing a dealer's region in 40,000 claim rows (and missing some).
    - **Analytics denormalises on purpose,** but in controlled layers: dimensions carry attributes once; wide marts are rebuilt from the normalised/star layer, never edited directly.
  `),
  transactions: T(`
    ## Senior depth
    - **Distributed transactions** (two-phase commit) across systems (DB + Kafka) are slow and fragile; data platforms prefer the **outbox pattern**, idempotent consumers and sagas.
    - **Long transactions** hold locks/MVCC snapshots: bloat in Postgres, blocked DDL, replication lag. Extracts should not keep a transaction open for hours on a primary.
    - **Lakehouse ACID is per table:** a Delta commit is atomic for one table; updating a fact and its aggregate in two tables is two commits. Readers can see one without the other unless you design publication (e.g. views switched after both, or multi-table transactions where the platform supports them).
  `),
  replication: T(`
    ## Senior depth
    - **Synchronous vs asynchronous:** sync replicas guarantee no loss on failover but add write latency; async replicas lag (seconds to minutes under load). Reading from an async replica gives stale data: fine for extracts if you record the replica's position/time.
    - **Logical vs physical replication:** physical copies pages (same engine/version); logical streams row changes (cross-version, selective tables, CDC). Debezium uses logical decoding.
    - **Failover hazards for CDC:** after a primary failover, the replication slot/log position may not exist on the new primary; connectors need re-snapshot or slot failover support.
  `),
  dbpartition: T(`
    ## Senior depth
    - **Partitioning vs sharding:** partitioning splits a table within one database (pruning, maintenance: drop old partitions); sharding splits data across servers (scale-out). Shard key choice is permanent-ish and decides hot spots and cross-shard queries.
    - **Time partitioning for retention:** dropping a month partition is instant and avoids huge DELETEs.
    - **Too many partitions** hurt planners and metadata in OLTP and lakehouses alike; partition coarsely, index or cluster finely.
  `),
  scaling: T(`
    ## Senior depth
    - **Read scaling** (replicas, caches) is easy; **write scaling** needs sharding or a distributed database; **analytical scaling** is solved by moving analytics off the OLTP system entirely.
    - **Vertical first** is often right for databases (bigger machine, more memory) until a limit; horizontal adds operational complexity (rebalancing, cross-shard queries, distributed transactions).
    - **Connection limits** are a real scaling bottleneck for Postgres (each connection is a process): use poolers (PgBouncer), and cap Spark JDBC parallelism.
  `),
  schema: T(`
    ## Senior depth
    - **Expand/contract migrations:** add the new column (expand), backfill, switch readers and writers, then remove the old column (contract) in a later release. Never rename/drop in one step on tables others read.
    - **Schema evolution across layers:** bronze tolerant (store raw), silver evolves deliberately (contract-governed), gold changes only through versioned releases.
    - **Delta column mapping** enables renames/drops without rewriting files; type widening allows safe promotions. Readers on older protocol versions may not read upgraded tables: check consumers before enabling table features.
  `),
  fileformats: T(`
    ## Senior depth
    - **Avro** for row-oriented records in motion (Kafka, landing files): schema embedded/registered, good evolution, splittable. **Parquet/ORC** for analytics at rest. **JSON** for interchange and APIs; **CSV** only at the edges.
    - **Parquet details that matter:** nested types (struct/list/map) are fine and efficient; INT96 timestamps are legacy (prefer INT64 micros with zone semantics); dictionary encoding helps low-cardinality strings; very wide schemas (thousands of columns) slow footers and planning.
    - **VARIANT** (Spark 4/Databricks, Iceberg v3) stores semi-structured JSON in an efficient binary form with shredding of common paths: an alternative to strings or rigid structs for evolving payloads.
  `),
  compression: T(`
    ## Senior depth
    - **Codec choice:** snappy (fast, moderate ratio, long-time Spark default), **zstd** (better ratio at similar speed, increasingly the default), gzip (good ratio, slow, not splittable as whole-file compression), lz4 (very fast, Kafka favourite).
    - **Encoding before compression:** columnar encodings (dictionary, RLE, delta, bit-packing) do most of the work; sorting data by low-cardinality columns first makes runs longer and files much smaller.
    - **Trade-off:** compressed size vs CPU to decompress; for I/O-bound scans on cloud storage, better compression usually wins.
  `),
};
