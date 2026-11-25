const { learn, mcq, tf, multi, match, order, viz, world, lesson, talk } = require('./_h.cjs');

module.exports = world('bigdata', 'Big Data Ecosystem and Storage', 'named in posting',
  'Hadoop, HDFS, YARN, MapReduce, Hive, HBase, Cassandra, MongoDB, DynamoDB, the CAP theorem, open table formats, and enough Scala/Java to read Spark code. The posting lists all of these.',
  [
    lesson('b1', 'Hadoop: HDFS, YARN, MapReduce', 15, [
      learn('The original big data stack', `
        **HDFS** (Hadoop Distributed File System) splits files into **blocks** (128 MB default) and stores each block **3 times** (replication factor 3) on different machines.
        - **NameNode**: metadata (which blocks make which file, where they live). Single point of truth, so it runs in HA pairs.
        - **DataNodes**: store the blocks, send heartbeats.
        - Write-once, append-only. Optimised for big sequential reads, terrible for millions of small files (NameNode memory).

        **YARN** = resource manager: allocates CPU/memory containers to applications (MapReduce, Spark, Hive on Tez).

        **MapReduce** = programming model: **map** (emit key/value per record, runs where data lives = **data locality**) → **shuffle & sort** (group by key across the network) → **reduce** (aggregate per key). Every step writes to disk, which is reliable but slow. Spark replaced it for most workloads.

        Today: on-premise Hadoop clusters are being migrated to cloud object storage (S3/ADLS) + Spark/Databricks, but the concepts (blocks, replication, locality, shuffle) carry straight over.
      `),
      match('Match the Hadoop component to its job.', [
        ['NameNode', 'Keeps the file → block → location metadata'],
        ['DataNode', 'Stores the actual blocks'],
        ['YARN', 'Allocates cluster resources to applications'],
        ['MapReduce', 'Map → shuffle → reduce processing model'],
      ]),
      mcq('A 1 GB file on HDFS with 128 MB blocks and replication factor 3 occupies roughly how much raw disk?', ['1 GB', '3 GB', '128 MB', '384 MB'], 1, '8 blocks × 3 replicas = 24 block copies ≈ 3 GB.'),
      mcq('Why is "data locality" important in Hadoop/Spark?', ['It encrypts data', 'Moving computation to the node holding the data avoids network transfer of huge blocks', 'It sorts the data', 'It reduces replication'], 1),
      tf('HDFS is well suited to storing 50 million tiny 2 KB files.', false, 'Every file and block is an object in NameNode memory. Small files exhaust it. Pack them into bigger files (Parquet, SequenceFiles) or compact.'),
    ]),
    lesson('b2', 'Hive and the metastore', 12, [
      learn('SQL on files', `
        **Hive** put SQL (HiveQL) on top of files in HDFS. Its most lasting contribution is the **Hive Metastore**: a database of table definitions (columns, types, file location, format, partitions). Spark, Presto/Trino, Impala and Databricks (before Unity Catalog) all use a metastore so tables look like tables.

        «««sql
        CREATE EXTERNAL TABLE claims (claim_id INT, dealer_id INT, amount DOUBLE)
        PARTITIONED BY (claim_month STRING)
        STORED AS PARQUET
        LOCATION 's3://lake/silver/claims/';
        MSCK REPAIR TABLE claims;          -- discover partition folders added outside Hive
        »»»
        - **Managed** table: Hive owns data and metadata. DROP TABLE deletes the files.
        - **External** table: Hive owns only the metadata. DROP keeps the files. Use for data shared by several engines.
        - **Partitioning**: folder per value («claim_month=2026-11/»). **Bucketing**: hash into N files by a column to speed joins on that key.
        - **Schema-on-read**: the schema is applied when you query, not when files are written.
      `),
      mcq('You DROP an **external** Hive table. What happens to the Parquet files?', ['Deleted', 'Kept, only metadata is removed', 'Moved to trash for 30 days', 'Converted to CSV'], 1),
      mcq('New partition folders were written directly to S3 by a Spark job, but Hive queries don\'t see them. What do you run?', ['DROP TABLE', 'MSCK REPAIR TABLE (or ALTER TABLE ADD PARTITION)', 'VACUUM', 'OPTIMIZE'], 1),
    ]),
    lesson('b3', 'NoSQL: HBase, Cassandra, MongoDB, DynamoDB', 18, [
      learn('Four NoSQL families', `
        | Store | Model | Strength | Typical use |
        |---|---|---|---|
        | **HBase** (on HDFS) | wide-column, sorted by row key | random read/write on huge tables, strong consistency per row | latest state per engine, time series keyed by «engine_id#ts» |
        | **Cassandra** | wide-column, partition key + clustering key | massive write throughput, multi-datacenter, tunable consistency | IoT telemetry ingestion |
        | **MongoDB** | documents (JSON/BSON) | flexible nested schema, rich queries, secondary indexes | product catalog, dealer profiles, app backends |
        | **DynamoDB** (AWS) | key-value / document, serverless | single-digit ms at any scale, pay per request | session/state stores, device registry |
        | **Accumulo** | wide-column (like HBase) | cell-level security labels | sensitive/government data |

        **Design rule for NoSQL: model for your queries.** No joins, so you denormalise and choose the partition/row key from the access pattern ("get last 24 h of readings for engine 7" → key «engine_id», clustering «ts DESC»). A bad key creates **hot partitions**.

        **CAP theorem**: during a network **P**artition, a distributed store must choose **C**onsistency (refuse or delay some requests) or **A**vailability (answer, possibly with stale data). HBase leans CP; Cassandra and DynamoDB default to AP with tunable/strong-read options.
      `),
      match('Match the store to the use case.', [
        ['Cassandra', 'Millions of sensor writes per second across regions'],
        ['MongoDB', 'Dealer profiles with varying nested attributes'],
        ['HBase', 'Random reads of the latest state by row key on Hadoop'],
        ['DynamoDB', 'Serverless key-value lookups with millisecond latency'],
      ]),
      mcq('In Cassandra, a telemetry table uses «PRIMARY KEY (plant_id, ts)». Plant 1 produces 90% of the readings. What happens?', ['Perfect distribution', 'A hot partition: one node takes most writes and the partition grows unbounded', 'Cassandra rejects the schema', 'Reads get faster'], 1, 'Use a better partition key, e.g. «((engine_id, day), ts)», bucketing by time to bound partition size.'),
      mcq('During a network partition, a system keeps answering requests even if some replicas might be stale. In CAP terms it chose…', ['Consistency', 'Availability', 'Partition intolerance', 'Atomicity'], 1),
      tf('NoSQL databases are always better than relational ones for analytics.', false, 'NoSQL stores are optimised for operational access patterns by key. Analytics (scans, joins, aggregates) belongs in a warehouse/lakehouse.'),
    ]),
    lesson('b4', 'Open table formats: Delta, Iceberg, Hudi', 15, [
      learn('ACID on the data lake', `
        Plain Parquet folders have problems: a failed job leaves half-written files, concurrent writers corrupt each other, no UPDATE/DELETE/MERGE, schema drift goes unnoticed.

        **Table formats** add a **transaction log** (metadata) over Parquet files:
        - **ACID transactions**: a write is fully visible or not at all. Readers never see partial data.
        - **MERGE / UPDATE / DELETE**: upserts, SCD2, GDPR deletes on the lake.
        - **Schema enforcement and evolution**: reject bad writes, add columns safely.
        - **Time travel**: «SELECT * FROM claims VERSION AS OF 42» or «TIMESTAMP AS OF '2026-11-20'». Audit, reproduce, roll back.
        - **Performance**: file statistics for data skipping, «OPTIMIZE» compaction, «Z-ORDER»/clustering, «VACUUM» removes unreferenced old files.

        | | Delta Lake | Apache Iceberg | Apache Hudi |
        |---|---|---|---|
        | Origin | Databricks | Netflix | Uber |
        | Strength | Spark/Databricks native, simple | engine-neutral (Spark, Trino, Snowflake, Flink), hidden partitioning | upsert-heavy, incremental pulls |
      `),
      multi('What does Delta Lake / Iceberg add over plain Parquet folders?', ['ACID commits', 'MERGE / UPDATE / DELETE', 'Time travel to older versions', 'Row-oriented storage', 'Schema enforcement'], [0, 1, 2, 4]),
      mcq('A bad deploy overwrote yesterday\'s gold table with wrong numbers. Fastest safe recovery on Delta?', ['Rebuild everything from bronze', 'RESTORE TABLE to the previous version (time travel), then fix the code', 'Delete the table', 'Email consumers to ignore it'], 1),
      tf('«VACUUM» with a short retention can break time travel to older versions.', true, 'VACUUM deletes files no longer referenced by recent versions. Older versions become unreadable.'),
    ]),
    lesson('b5', 'Scala and Java for Spark readers', 12, [
      learn('Read Scala Spark without panic', `
        Spark itself is written in Scala on the JVM. You won't need to write Scala for DE1, but you should **read** it, because some teams and Stack Overflow answers use it.

        «««scala
        import org.apache.spark.sql.functions._
        val claims = spark.table("claims")
        val result = claims
          .filter($"status" === "Approved")                 // === for equality, $"col" = column
          .groupBy("dealer_id")
          .agg(count("*").as("n"), sum("claim_amount").as("total"))
        result.show()

        case class Claim(claimId: Int, dealerId: Int, amount: Double)   // typed Dataset[Claim]
        val ds = claims.as[Claim]
        »»»
        | PySpark | Scala |
        |---|---|
        | «F.col("x") == 1» | «col("x") === 1» or «$"x" === 1» |
        | «.alias("n")» | «.as("n")» |
        | «lambda r: …» | «r => …» |
        | DataFrame only | DataFrame + typed **Dataset[T]** (compile-time types) |

        Java: same API with more ceremony («Dataset<Row>»). Both compile to the same plan as PySpark. Speed differences only appear with UDFs.
      `),
      mcq('In Scala Spark, what is «$"status" === "Approved"»?', ['A string comparison done on the driver', 'A Column equality expression (PySpark: F.col("status") == "Approved")', 'An assignment', 'A Dataset type'], 1),
      tf('A DataFrame job written in PySpark is usually much slower than the same job in Scala.', false, 'DataFrame operations compile to the same JVM plan. The gap appears only with Python UDFs (row serialisation).'),
    ]),
  ]);
