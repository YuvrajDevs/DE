const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== HBase and Accumulo
  hbase: T(`
    > **In one line:** **HBase** is a distributed, **wide-column NoSQL** database on top of HDFS (modelled on Google Bigtable) that gives **low-latency random reads and writes by row key** over billions of rows. **Accumulo** is a Bigtable-style sibling known for **cell-level security labels**. Both are about fast key access, not SQL analytics.

    ## The data model
    - **Table** → rows identified by a **row key** (bytes), **sorted lexicographically**.
    - **Column families** (defined up front, few) → **column qualifiers** (any number, per row) → **cells** with **timestamps/versions**.
    - Sparse: rows can have different columns; empty cells cost nothing.
    - Example row key for telemetry: «engine_id#reverse_timestamp» → columns «m:temp», «m:rpm», «m:oil».

    ## Architecture
    | Part | Role |
    |---|---|
    | **Regions** | Contiguous row-key ranges of a table; split as they grow |
    | **RegionServers** | Serve regions: reads and writes |
    | **HMaster** | Assigns regions, handles schema changes and failover |
    | **ZooKeeper** | Coordination, finding the meta table |
    | **Write path** | Write-ahead log (WAL) on HDFS → **MemStore** (memory) → flushed to immutable **HFiles** on HDFS |
    | **Read path** | MemStore + block cache + HFiles (Bloom filters skip files) |
    | **Compactions** | Merge HFiles (minor/major), remove deleted/expired cells |
    This is the **LSM-tree** design (also used by Cassandra, RocksDB): fast sequential writes, background merging.

    ## Row key design: everything depends on it
    - Rows are sorted by key, and regions are key ranges, so **sequential keys** (timestamps, increasing IDs) send all writes to one region: a **hotspot**.
    - Fixes: **salting** (prefix with hash % N), **hashing** the key, **reversing** (reverse domain names), putting a well-distributed ID first (engine_id before timestamp).
    - Design keys for your **scans**: "all readings for engine 77 in the last hour" → key «77#<reverse ts>» makes it one short range scan, newest first.

    ## When to use HBase
    - Massive datasets with random, low-latency reads/writes by key (user profiles, time-series per device, messaging), strong consistency per row.
    - Not for: ad-hoc SQL analytics, joins, secondary-index-heavy queries (Phoenix adds SQL and indexes on top).

    ## Accumulo
    - Same Bigtable model; each key has a **visibility label** («(ENGINEERING&EU)|ADMIN») evaluated against the reader's authorisations: **cell-level security**. Popular in government and security-sensitive environments.
    - Server-side programmable **iterators** for filtering/aggregating close to the data.
    - Relevant to the posting because of data with mixed sensitivity (e.g. export-controlled engineering data).

    ## How interviewers test this
    - "When would you use HBase rather than Hive?" Random low-latency key access vs batch SQL scans.
    - "How do you avoid hotspots in HBase?" Row key design: salting/hashing, ID before timestamp.
    - "What is special about Accumulo?" Cell-level visibility labels.
  `, {
    check: [
      mcq('HBase row key «yyyyMMddHHmmss#engine_id» for telemetry causes…', ['Even writes', 'A write hotspot: all current writes go to the region holding the latest timestamps', 'Faster scans per engine', 'Nothing'], 1, 'Put a well-distributed component (engine_id or a salt) first.'),
      mcq('What makes Accumulo distinctive among Bigtable-style stores?', ['SQL support', 'Cell-level security visibility labels', 'In-memory only', 'No HDFS'], 1, 'Each cell can carry its own access expression.'),
      tf('HBase is a good choice for ad-hoc analytical SQL with many joins.', false, 'It is built for fast key-based access; use a warehouse/lakehouse for analytics.'),
      match('Match the HBase write/read component.', [['WAL', 'Durability before the write is acknowledged'], ['MemStore', 'In-memory buffer of recent writes'], ['HFile', 'Immutable sorted file on HDFS'], ['Compaction', 'Merges files and removes deleted cells']], 'The LSM-tree design.'),
    ],
  }),

  // ================================================================== Hadoop vs Spark
  hadoopspark: T(`
    > **In one line:** **Hadoop** is a platform (storage HDFS + resources YARN + processing MapReduce); **Spark** is a processing engine. Spark replaced **MapReduce**, not necessarily HDFS/YARN: Spark often ran **on** Hadoop. Today both HDFS and YARN are largely replaced by cloud object storage and Kubernetes/managed services.

    ## Comparison (MapReduce vs Spark)
    | | MapReduce | Spark |
    |---|---|---|
    | Intermediate data | Written to disk (HDFS/local) after every map and reduce | Kept in memory where possible; spills to disk |
    | Multi-step jobs | Chain of separate jobs | One optimised DAG |
    | Speed | Slow for iterative/multi-stage | Often 10-100× faster for those |
    | APIs | Java map/reduce functions | SQL, DataFrames (Python/Scala/Java/R), streaming, ML |
    | Streaming | No (batch only) | Structured Streaming |
    | Interactive | No | Notebooks, shells |
    | Fault tolerance | Re-run tasks; data on disk | Lineage recomputation, checkpoints |
    | Memory needs | Low | Higher |
    | Maturity for huge batch on cheap disks | Very stable | Very stable now |

    ## When MapReduce still appears
    Legacy jobs on existing Hadoop clusters; extremely large batch jobs on memory-poor clusters where disk-based processing is acceptable. In interviews, the value is understanding the model, and explaining migrations.

    ## Migrating Hadoop workloads to a cloud lakehouse (a common enterprise project)
    1. **Inventory:** HDFS data, Hive tables (managed/external), jobs (MapReduce, Hive SQL, Spark, Pig, Oozie workflows), security (Kerberos, Ranger/Sentry policies), consumers.
    2. **Data:** copy HDFS to object storage (DistCp, Azure Data Factory, Data Box for very large volumes), validate counts/checksums.
    3. **Tables:** convert Hive tables to Delta/Iceberg; migrate metastore to Unity Catalog/Glue; preserve partitions.
    4. **Jobs:** port MapReduce/Pig to Spark; Hive SQL to Spark SQL/dbt; Oozie to Airflow/Workflows.
    5. **Security:** map Ranger policies to cloud IAM + catalog permissions.
    6. **Validate:** run old and new in parallel; reconcile outputs.
    7. **Cut over and decommission.**

    ## How interviewers test this
    - "Hadoop vs Spark?" Platform vs engine; MapReduce vs Spark differences.
    - "Can Spark run without Hadoop?" Yes: standalone, Kubernetes, cloud storage.
    - "How would you migrate a Hadoop cluster to the cloud?"
  `, {
    check: [
      tf('Spark requires Hadoop to run.', false, 'It can run standalone or on Kubernetes, reading from cloud storage; it can also run on YARN/HDFS.'),
      mcq('What did Spark replace in the Hadoop stack?', ['HDFS', 'MapReduce (the processing engine)', 'ZooKeeper', 'The metastore'], 1, 'HDFS and YARN were replaced later by cloud storage and Kubernetes/managed services.'),
      order('Order a Hadoop-to-cloud migration.', ['Inventory data, tables, jobs, security and consumers', 'Copy data to object storage and validate', 'Convert Hive tables to Delta/Iceberg and migrate the catalog', 'Port jobs to Spark/dbt and workflows to Airflow', 'Run in parallel and reconcile', 'Cut over and decommission'], 'Validate at every step.'),
    ],
  }),

  // ================================================================== Cassandra
  cassandra: T(`
    > **In one line:** **Apache Cassandra** is a **leaderless, wide-column** NoSQL database built for **massive write throughput, linear scalability and multi-datacenter availability**. You design tables around queries: a **partition key** decides which nodes store a row; **clustering columns** sort rows inside the partition.

    ## Architecture
    - **Peer-to-peer ring:** every node is equal (no master); data distributed by **consistent hashing** of the partition key onto token ranges; **virtual nodes** spread ranges.
    - **Replication factor** per keyspace (and per datacenter with NetworkTopologyStrategy).
    - **Tunable consistency** per query: ONE, QUORUM, LOCAL_QUORUM, ALL. With RF=3, QUORUM writes + QUORUM reads (2+2>3) give read-your-writes.
    - **Write path:** commit log → memtable → SSTables (LSM tree); writes are very fast.
    - **Repairs:** hinted handoff (store writes for a down node), read repair, anti-entropy repair (must be run regularly).
    - **Gossip** protocol for cluster membership.

    ## Data modelling (CQL)
    «««sql
    CREATE TABLE telemetry_by_engine_day (
      engine_id   int,
      day         date,
      ts          timestamp,
      temperature_c double,
      rpm         int,
      PRIMARY KEY ((engine_id, day), ts)
    ) WITH CLUSTERING ORDER BY (ts DESC) AND default_time_to_live = 7776000;
    »»»
    - «(engine_id, day)» = **partition key** (composite: bounds partition size and spreads writes).
    - «ts» = **clustering column** (rows sorted newest first inside the partition).
    - Query: «SELECT … WHERE engine_id = 77 AND day = '2026-11-26' AND ts > …» hits one partition: fast.
    - **One table per query pattern**, data duplicated across tables if needed. No joins; limited secondary indexes; filtering on non-key columns requires «ALLOW FILTERING» (a warning sign).

    ## Strengths and weaknesses
    | Strengths | Weaknesses |
    |---|---|
    | Very high write throughput | No joins, limited ad-hoc queries |
    | Linear horizontal scaling | Query-driven modelling, duplication |
    | No single point of failure, multi-DC | Eventual consistency by default |
    | TTL for automatic expiry | Tombstones from deletes slow reads |
    | Good for time-series and IoT | Operations: repairs, compaction tuning |

    ## Edge cases and what goes wrong
    - **Large partitions** (one engine forever) → slow reads, compaction pain. Time-bucket the key.
    - **Tombstones** from many deletes or TTL expiries pile up; reads scanning them time out.
    - **Hot partitions** from skewed keys.
    - **Using Cassandra for analytics**: full scans are slow and hurt latency; export to the lakehouse (Spark Cassandra connector, CDC).
    - **Lightweight transactions** (IF NOT EXISTS) use Paxos and are expensive; avoid in hot paths.

    ## How interviewers test this
    - "Partition key vs clustering column?"
    - "How do you model sensor data in Cassandra?" Query-first, (device, time bucket) partition, ts clustering, TTL.
    - "What consistency level gives read-your-writes?" QUORUM/QUORUM with RF=3.
  `, {
    check: [
      mcq('In «PRIMARY KEY ((engine_id, day), ts)», what is «(engine_id, day)»?', ['Clustering columns', 'The composite partition key that decides which nodes store the rows', 'A secondary index', 'The TTL'], 1, 'ts is the clustering column that orders rows inside the partition.'),
      mcq('Why add «day» to the partition key for telemetry?', ['For SQL compatibility', 'To keep partitions bounded in size and spread writes over time', 'To enable joins', 'It is required'], 1, 'Unbounded partitions become slow and hard to compact.'),
      tf('A query that needs «ALLOW FILTERING» in Cassandra is usually a sign the table is not modelled for that query.', true, 'Model a table per query pattern.'),
    ],
  }),

  // ================================================================== DynamoDB
  dynamodb: T(`
    > **In one line:** **Amazon DynamoDB** is a fully managed, serverless **key-value and document** database with single-digit-millisecond latency at any scale. Tables are accessed by a **partition key** (and optional **sort key**); you pay per request or provisioned capacity; and you design around access patterns.

    ## The model
    - **Table** of **items** (JSON-like documents, up to 400 KB each).
    - **Primary key:** partition key (hash) alone, or partition key + **sort key** (range) for one-to-many access: «PK = ENGINE#77, SK = READING#2026-11-26T10:00:00».
    - **Secondary indexes:** GSI (global, different partition/sort key, eventually consistent) and LSI (local, same partition key, different sort key).
    - **Single-table design:** several entity types in one table using generic PK/SK patterns to serve many access patterns with few requests (advanced, query-first modelling).

    ## Key features
    - **Capacity modes:** on-demand (pay per request) or provisioned (RCUs/WCUs) with auto scaling.
    - **Consistency:** eventually consistent reads by default; strongly consistent reads optional (within a region).
    - **Transactions:** ACID across up to 100 items.
    - **TTL:** automatic expiry of items.
    - **DynamoDB Streams:** ordered change log per item (CDC) → Lambda, Kinesis, or pipelines into the lake.
    - **Global tables:** multi-region active-active replication (last-writer-wins).
    - **Export to S3** (point-in-time, no impact on capacity) for analytics.

    ## For a data engineer
    - **As a source:** use DynamoDB Streams or export to S3; expect nested, varying item shapes; single-table designs need decoding by entity type.
    - **As a sink/serving store:** write precomputed results (latest engine health score) for apps that need millisecond lookups.
    - **Not** for analytics: scans are expensive and slow; analyse exports in the lakehouse.

    ## Edge cases and what goes wrong
    - **Hot partitions** from a skewed partition key (adaptive capacity helps but has limits).
    - **Scans** on large tables burn capacity and money.
    - **GSI back-pressure:** an under-provisioned GSI throttles writes to the base table.
    - **Item size limit** (400 KB): store large payloads in S3 with a pointer.
    - **Eventually consistent GSIs** surprise read-after-write logic.

    ## How interviewers test this
    - "Partition key vs sort key? GSI vs LSI?"
    - "How do you get DynamoDB data into a lakehouse?" Streams (CDC) or S3 export, then Spark/Glue to Delta/Iceberg.
    - "When would you choose DynamoDB over PostgreSQL?" Massive scale key access, serverless ops, predictable latency; not for ad-hoc queries.
  `, {
    check: [
      mcq('How do you bring DynamoDB data into the lakehouse with low impact on the table?', ['Run Scan every hour', 'Use DynamoDB Streams (CDC) or the export-to-S3 feature, then process with Spark', 'Query each item by key', 'Copy the AWS console view'], 1, 'Streams and exports avoid consuming table capacity heavily.'),
      tf('A DynamoDB global secondary index is always strongly consistent with the base table.', false, 'GSIs are eventually consistent.'),
      mcq('Which design lets you read "all readings of engine 77 between two times" efficiently?', ['Partition key = timestamp', 'Partition key = engine, sort key = timestamp, then a range query on the sort key', 'Scan with a filter', 'One table per reading'], 1, 'Sort keys enable range queries within a partition.'),
    ],
  }),

  // ================================================================== MongoDB
  mongodb: T(`
    > **In one line:** **MongoDB** is a **document database**: records are JSON-like **BSON documents** in **collections**, with flexible schemas, rich queries and secondary indexes, an **aggregation pipeline**, replica sets for availability and **sharding** for scale.

    ## The model
    - Document = nested object with arrays: a claim with its dealer info and parts list embedded.
    - **Embed vs reference:** embed data that is read together and bounded (claim + its parts); reference data that is shared or unbounded (dealer referenced by ID from many claims). Avoid **unbounded arrays** (an engine document embedding every reading forever: 16 MB document limit and slow updates).
    - **Schema flexibility** with optional **JSON Schema validation** on collections.

    ## Querying
    - Find by fields, ranges, array contents; projections; sorting.
    - **Aggregation pipeline:** stages like «$match», «$group», «$lookup» (join), «$unwind» (explode arrays), «$project», «$sort» — conceptually like SQL, step by step.
    - **Indexes:** single, compound (leftmost-prefix rule), multikey (arrays), text, geospatial, TTL.

    ## Scale and availability
    - **Replica set:** primary + secondaries; automatic failover; read preference (primary vs secondary: consistency trade-off); write concern («w: "majority"») for durability.
    - **Sharding:** collections split by a **shard key** across shards; the shard key choice determines balance (hashed vs ranged) and query routing.
    - **Change streams:** subscribe to inserts/updates/deletes (CDC) for pipelines.
    - Multi-document ACID transactions supported (with performance cost).

    ## For a data engineer
    - **As a source:** ingest via change streams (or Debezium MongoDB connector / Kafka connector) or periodic exports; handle schema variety (fields missing, types differing between documents), nested arrays (explode carefully), ObjectIds and BSON types (Decimal128, dates).
    - **Flatten** into silver tables at clear grains (claim header vs claim parts).
    - Analytics belong in the lakehouse; MongoDB serves applications.

    ## Edge cases and what goes wrong
    - **Type drift across documents** («amount» string in old docs, number in new).
    - **Unbounded arrays** and huge documents.
    - **Poor shard key** (monotonic like timestamps → hot shard; low cardinality → jumbo chunks).
    - **Reading from secondaries** returns stale data.
    - **$lookup-heavy** designs on huge collections are slow: a sign of relational data in a document store.

    ## How interviewers test this
    - "Embed vs reference?"
    - "How would you ingest MongoDB into a lakehouse?" Change streams/Debezium, raw JSON to bronze, flatten to silver at defined grains, handle type drift.
    - "What is a shard key and how do you choose it?"
  `, {
    check: [
      mcq('An engine document embeds every sensor reading in an array forever. What goes wrong?', ['Nothing', 'The array grows without bound: documents approach the 16 MB limit and updates get slow', 'Reads get faster', 'Indexes stop working'], 1, 'Avoid unbounded arrays; store readings as separate documents or in a time-series collection.'),
      mcq('Which MongoDB feature provides CDC for pipelines?', ['Aggregation pipeline', 'Change streams', 'TTL indexes', 'GridFS'], 1, 'Change streams emit inserts, updates and deletes.'),
      tf('Embedding works well for data that is read together and bounded, like a claim and its parts.', true, 'Reference data that is shared or unbounded.'),
    ],
  }),

  // ================================================================== Scala and Java
  scalajava: T(`
    > **In one line:** Spark, Kafka, Hadoop and Flink are written in **Scala and Java** (JVM). Data engineers mostly use **PySpark and SQL**, but you should **read and lightly modify** Scala/Java Spark code, understand **JVM basics** (memory, GC, JARs, dependencies), and know when Scala/Java is the better choice.

    ## Why the JVM matters to a Python data engineer
    - Spark executors are JVMs: memory settings, garbage collection pauses, «OutOfMemoryError», serialisation and JAR dependencies are JVM concepts.
    - Many enterprise codebases (especially Hadoop-era) have Scala/Java Spark jobs you will maintain or migrate.
    - Kafka clients, connectors and Flink jobs are often Java.
    - Typed Datasets, custom data sources, performance-critical UDFs are written in Scala/Java.

    ## Reading Scala Spark: a side-by-side
    «««python
    # PySpark
    result = (claims.filter(F.col("status") == "Approved")
              .groupBy("dealer_id")
              .agg(F.sum("claim_amount").alias("approved")))
    »»»
    «««text
    // Scala
    val result = claims.filter($"status" === "Approved")
      .groupBy("dealer_id")
      .agg(sum("claim_amount").as("approved"))
    »»»
    Things to recognise:
    - «val» (immutable) vs «var»; type inference; «===» for column equality (because «==» compares objects); «$"col"» column syntax; «.as» for alias.
    - **case classes** for typed Datasets: «case class Claim(claimId: Long, dealerId: Int, amount: Double)» then «spark.read.parquet(p).as[Claim]».
    - **Option** instead of null; pattern matching («match { case … }»); higher-order functions («map», «filter», «flatMap») on collections.
    - Build tools: **sbt** (Scala) or **Maven/Gradle** (Java); jobs packaged as JARs (fat/assembly JARs) and submitted with «spark-submit --class …».

    ## Java basics worth knowing
    - Classes, interfaces, static typing, exceptions (checked vs unchecked), collections (List, Map), streams API.
    - The JVM heap and GC: big heaps → long GC pauses; executor sizing advice (4-5 cores, moderate heap) comes from this.
    - Dependency conflicts ("jar hell"): two libraries needing different versions; shading/relocation solves it.

    ## When to choose Scala/Java over Python
    | Situation | Choice |
    |---|---|
    | Standard ETL with DataFrames/SQL | PySpark or SQL (same performance) |
    | Heavy custom per-row logic that cannot use built-in functions | Scala UDF (no Python serialisation) or pandas UDF |
    | Type-safe, large shared codebases | Scala Datasets |
    | Kafka Streams apps, Flink jobs, custom connectors | Java/Scala |
    | ML and data science integration | Python |

    ## How interviewers test this
    - "Can you read this Scala Spark snippet?" Translate it to PySpark aloud.
    - "Why might a Scala UDF be faster than a Python UDF?" No JVM↔Python serialisation.
    - "What is a fat JAR / why do dependency conflicts happen?"
    Honest positioning: "I work mainly in PySpark and SQL, I can read and modify Scala Spark jobs, and I understand JVM tuning for executors."
  `, {
    check: [
      mcq('In Scala Spark, why is column equality written «===» instead of «==»?', ['Style only', '«==» compares the Column objects themselves; «===» builds an equality expression', 'Scala has no ==', 'It is faster'], 1, 'Like F.col("a") == x in Python building an expression.'),
      mcq('Which is usually faster for custom row-level logic that has no built-in function?', ['Plain Python UDF', 'Scala/Java UDF (or a vectorised pandas UDF)', 'collect() and loop on the driver', 'They are the same'], 1, 'Python UDFs pay per-row serialisation between JVM and Python.'),
      tf('A DataFrame aggregation using built-in functions runs at essentially the same speed in PySpark and Scala.', true, 'Both compile to the same JVM plan.'),
    ],
  }),
};
