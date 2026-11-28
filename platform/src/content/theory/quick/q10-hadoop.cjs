const { T } = require('../_t.cjs');

module.exports = {
  hadoopwhat: T(`
    > **In one line:** Apache Hadoop made big data practical (2006+): **HDFS** stores huge files across cheap machines, **YARN** shares cluster resources, **MapReduce** processes in parallel. Spark and object storage replaced most of it; its ideas live on everywhere.

    **Why it existed:** terabytes needed expensive hardware until Google published GFS (2003) and MapReduce (2004). Hadoop re-implemented them openly: **assume machines fail, replicate data, move computation to data, scale by adding nodes.**

    | Component | Role | Modern equivalent |
    |---|---|---|
    | HDFS | Blocks replicated on DataNodes, metadata on NameNode | S3, ADLS, GCS |
    | YARN | Allocates CPU/memory containers | Kubernetes, managed clusters |
    | MapReduce | map → shuffle → reduce batch | Spark |
    | Common | Shared libraries | — |

    **Ecosystem:** **Hive** (SQL on Hadoop; its **metastore** is still everywhere), **HBase** (low-latency wide-column NoSQL), Pig (legacy scripting), Sqoop (DB ↔ HDFS, retired), Flume (logs, replaced by Kafka), Oozie (workflows, replaced by Airflow), **ZooKeeper** (coordination), plus Spark, Kafka, Impala, Presto/Trino alongside. Distributions: Cloudera (CDH/CDP; Hortonworks merged in), MapR; cloud: EMR, HDInsight, Dataproc.

    **Why it declined:** storage and compute coupled (pay 24/7, scale both together); heavy ops (NameNode HA, tuning, upgrades, Kerberos); slow verbose MapReduce; object storage made HDFS unnecessary for most.

    **Why it still matters:** the posting lists **Hadoop, MapReduce, Hive, HBase**. It lives on in on-prem clusters in manufacturing, telecom and banks (Cloudera CDP), regulated/air-gapped sites, and as the **API layer** (the Hadoop FileSystem API, «s3a://», «abfss://», is how Spark talks to cloud storage; Parquet/ORC came from it; the Hive metastore model became Glue/Unity Catalog). Its concepts (blocks, replication, locality, map/shuffle/reduce, metastore, partitions) explain Spark, Delta and warehouses.

    **Hadoop → cloud migration** (common DE work): inventory jobs and Hive tables; copy data (DistCp/ADF) to object storage; convert tables to Delta/Iceberg; rewrite MapReduce/Hive/Pig as Spark SQL/PySpark; Oozie → Airflow/Lakeflow Jobs; Ranger/Sentry → Unity Catalog; validate with counts and checksums; run in parallel before cutover (details in Hadoop vs Spark).

    **Interview:** components; why companies moved to cloud lakehouses (decoupled storage/compute, elasticity, less ops, Spark/Delta); migration steps.
  `),

  hdfs: T(`
    > **In one line:** **HDFS** splits files into large **blocks** (128 MB), stores each on several **DataNodes** (replication 3, rack-aware), and keeps all metadata (tree, file → blocks → locations) in the **NameNode**'s memory. Built for **huge files read sequentially**, not small files or random updates.

    | Part | Role |
    |---|---|
    | NameNode | Namespace + block map in memory; persists to an **edit log** and periodic **fsimage** |
    | DataNodes | Store blocks; send **heartbeats** and **block reports** |
    | Standby NameNode + JournalNodes | HA: quorum shared edit log, automatic failover via ZooKeeper failover controllers (HDFS still uses ZooKeeper; Kafka doesn't) |
    | Secondary NameNode (non-HA) | Merges edit log into fsimage (checkpointing): **not a backup** |

    **Write:** client asks the NameNode, which picks DataNodes; client streams to DN1, which **pipelines** to DN2 → DN3; acks flow back; next block; on close the NameNode records the file. **Rack awareness:** one replica on the writer's rack, two on another, so a rack can fail. **Read:** get block locations, read each from the closest DataNode; frameworks schedule tasks **where the blocks are** (data locality).

    **Failures:** DataNode stops heartbeating → marked dead, its blocks **re-replicated**; corrupt block (checksum mismatch) → read another replica, re-replicate; NameNode fails → HA failover.

    | Choice | Why | Consequence |
    |---|---|---|
    | 128-256 MB blocks | Fewer blocks, long sequential reads | Small files waste NameNode memory |
    | Write-once, append-only | Simple consistency | No in-place updates (table formats rewrite files) |
    | Metadata in NameNode heap | Fast lookups | ~150 bytes per file/dir/block: 100 M small files ≈ tens of GB heap: the hard limit behind the small-files problem; Federation / router-based federation split namespaces |
    | 3× replication | Durability + read parallelism | 3× storage; Hadoop 3 **erasure coding** ≈ 1.5× for cold data (more CPU, slower reconstruction) |

    **Small files** (e.g. one per micro-batch) cost NameNode memory and a task each → compaction jobs, larger batches, container formats (SequenceFiles, Parquet), HAR files.

    **Interview:** architecture (NameNode, DataNodes, blocks, replication, rack awareness, HA); DataNode failure; why small files hurt; Secondary NameNode isn't a backup.
  `),

  mapreduce: T(`
    > **In one line:** **MapReduce** = **map** (record → key-value pairs), **shuffle & sort** (bring each key's values together), **reduce** (combine per key). It parallelises and tolerates failure naturally, but writes to disk between phases, which made it slow.

    **Word count:** lines → map emits «(word, 1)» → shuffle groups by word → reduce sums → «(word, count)».

    1. **Input splits** (≈ blocks), one **map task** each, scheduled near the data.
    2. **Map:** «map(k, v) → [(k2, v2)]»; output buffered, **partitioned** by reducer («hash(k2) % R»), **sorted**, spilled to local disk.
    3. **Combiner** (optional): mini-reduce on each mapper's output to shrink the shuffle; only for **associative and commutative** ops (sum, count, max), not average directly. The ancestor of Spark's partial aggregation.
    4. **Shuffle & sort:** each reducer fetches its partition from every mapper and merge-sorts.
    5. **Reduce:** «reduce(k2, [v2]) → output» written to HDFS.
    6. **Fault tolerance:** failed tasks re-run elsewhere; map outputs re-fetched or recomputed; speculative copies for slow tasks.
    **Custom partitioners** choose a key's reducer; **secondary sort** (composite key + grouping comparator) delivers a key's values in order (time-ordered processing per key).

    | Problem | Map emits | Reduce |
    |---|---|---|
    | Claims per dealer | (dealer_id, 1) | Sum |
    | Amount per region | (region, amount) | Sum |
    | Max temp per engine | (engine_id, temp) | Max |
    | Average per key | (key, (sum, count)) | Sum pairs, divide at the end |
    | Distinct | (value, null) | Emit key once |
    | Reduce-side join | (join_key, (table_tag, record)) from both | Combine both tags per key |
    | Inverted index | (word, doc_id) | Collect doc list |

    **Why Spark replaced it:** each job wrote output to HDFS (replicated) and the next read it back, so a 5-step pipeline paid 5 full disk writes, reads and job start-ups; Spark keeps intermediates in memory/local disk in one app and plans the whole DAG. Also verbose Java, no interactive use, slow iteration. **The model lives on:** every Spark groupBy/join is map → shuffle → reduce, and explaining that is the transferable interview value.

    **Interview:** word count with combiner; when a combiner is allowed; average in MapReduce; MapReduce vs Spark.
  `),

  hive: T(`
    > **In one line:** **Apache Hive** put **SQL on files in HDFS**: tables (schema, location, format) live in the **Hive metastore**, HiveQL compiles into distributed jobs (MapReduce, then Tez/Spark). Its metastore became the standard lake **catalog** idea.

    **Why:** analysts knew SQL, not Java MapReduce; Hive (Facebook, 2008) let them query petabytes.

    - **Metastore:** a relational DB (MySQL/PostgreSQL) of table metadata: database, columns/types, location (HDFS/S3 path), format and SerDe, partitions + locations, statistics. The long-lived part, shared by Spark, Trino, Impala; hundreds of thousands of partitions make its calls slow.
    - **Schema-on-read:** files aren't validated on load; a **SerDe** applies the schema at read (CSV, JSON, Parquet, ORC, Avro). **Pitfall:** CSV/JSON external tables return **NULLs for mismatched values without errors**.
    - **Engines:** MapReduce (legacy), **Tez** (DAG engine, default on HDP/CDP), Spark; **LLAP** long-lived daemons with caching for interactive queries.
    - **HiveServer2:** JDBC/ODBC for clients and BI.

    | | Managed (internal) | External |
    |---|---|---|
    | Files owned by | Hive (warehouse dir) | You (any path) |
    | DROP TABLE | Deletes metadata **and data** | Metadata only |
    | Use | Hive fully controls data | Shared with other tools / landed by pipelines |
    Classic mistake: dropping a managed table other jobs depended on, deleting the data.

    **Today:** Spark uses the metastore («spark.sql.catalogImplementation=hive»); AWS Glue Data Catalog is Hive-metastore-compatible; Databricks had one before Unity Catalog; Trino/Presto query Hive tables. Hive's limits (no ACID on plain tables, slow metadata for many partitions, directory-listing tables) led to **Iceberg, Delta and Hudi**, which keep file lists and stats in their own metadata. **Hive ACID tables** (ORC, «transactional=true») support UPDATE/DELETE/MERGE with delta files and minor/major compactions: the same copy-on-write/merge-on-read trade-off, earlier and heavier.

    **Interview:** what the metastore is; managed vs external; schema-on-read; why table formats replaced Hive tables (ACID, schema evolution, hidden partitioning, metadata without directory listing).
  `),

  hivepart: T(`
    > **In one line:** Hive **partitions** split a table into **directories by column value** («/claims/submitted_date=2026-11-26/») so filtered queries read only matching folders. **Buckets** split data **within** a table/partition into a **fixed number of files by hash**, for efficient joins and sampling.

    ## Partitions
    - «PARTITIONED BY (submitted_date STRING)»; the column **isn't stored in files**, it's in the path.
    - **Static:** name it in the INSERT («PARTITION (submitted_date='2026-11-26')»). **Dynamic:** derived from data («PARTITION (submitted_date)», column last in the SELECT); needs «hive.exec.dynamic.partition.mode=nonstrict» and limits («max.dynamic.partitions») that protect the metastore from accidental million-partition writes.
    - **Pruning:** «WHERE submitted_date = '2026-11-26'» reads one directory; filtering on an expression («year(submitted_date)») may not prune.
    - **Must be registered:** files written straight to a new folder are invisible until «MSCK REPAIR TABLE» or «ALTER TABLE … ADD PARTITION» (queries silently miss data). Table formats remove this bug class.

    ## Buckets
    - «CLUSTERED BY (engine_id) INTO 64 BUCKETS»: row → file «hash(engine_id) % 64».
    - **Bucketed joins:** same key + compatible bucket counts join bucket-to-bucket without a full shuffle (bucket map join / sort-merge bucket join). **Spark and Hive hash buckets differently**, so Hive-bucketed tables don't give Spark shuffle-free joins (and vice versa).
    - **Sampling:** read one bucket. Good for high-cardinality columns where partitions would explode.

    | | Partitioning | Bucketing |
    |---|---|---|
    | Form | Directory per value | Fixed files per partition by hash |
    | Best for | Low/moderate-cardinality filters (dates) | High-cardinality join keys (engine_id) |
    | Benefit | Pruning | Shuffle-free joins, even files, sampling |
    | Risk | Too many partitions/small files | Wrong count; every writer must respect it |

    **What goes wrong:** over-partitioning (date × engine) → millions of directories, slow metastore, small files; writers (other engine/settings) ignoring bucketing. **Modern alternative:** **Iceberg hidden partitioning** (partition by «days(ts)» without a separate column; partition evolution) fixes users forgetting the partition filter and changing schemes; or **Delta liquid clustering / Z-order**.

    **Interview:** partitioning vs bucketing; static vs dynamic; "new partition folder not visible" (metastore not updated → MSCK REPAIR / ADD PARTITION).
  `),

  hbase: T(`
    > **In one line:** **HBase** is a distributed **wide-column NoSQL** database on HDFS (modelled on Bigtable) for **low-latency random reads/writes by row key** over billions of rows. **Accumulo** is a Bigtable sibling known for **cell-level security labels**. Both are about fast key access, not SQL analytics.

    **Model:** table → rows by **row key** (bytes, **sorted lexicographically**) → **column families** (few, defined up front) → **qualifiers** (any number per row) → **cells** with **timestamps/versions**; sparse (empty cells free). Telemetry: key «engine_id#reverse_timestamp», columns «m:temp», «m:rpm», «m:oil».

    | Part | Role |
    |---|---|
    | Regions | Contiguous key ranges; split as they grow |
    | RegionServers | Serve regions |
    | HMaster | Assigns regions, schema changes, failover |
    | ZooKeeper | Coordination, locating the meta table |
    | Write path | WAL on HDFS → **MemStore** → flushed to immutable **HFiles** |
    | Read path | MemStore + block cache + HFiles (Bloom filters skip files) |
    | Compactions | Minor/major merges; drop deleted/expired cells |
    This is the **LSM-tree** design (also Cassandra, RocksDB): fast sequential writes, background merging. Splits and compactions cause latency spikes → **pre-split** tables for known key ranges.

    **Row key design is everything:** sorted keys + range regions mean **sequential keys** (timestamps, increasing IDs) send all writes to one region (**hotspot**). Fixes: **salting** (hash % N prefix), hashing, reversing, or leading with a well-distributed ID (engine_id before timestamp). Design for your **scans**: «77#<reverse ts>» makes "engine 77's last hour" one short newest-first range scan. **Get by key and range Scan are fast; anything else is a full scan**; secondary indexes need Phoenix (also adds SQL) or a self-maintained index table.

    **Use for:** massive random low-latency key access (profiles, per-device time series, messaging) with per-row strong consistency. **Not for:** ad-hoc SQL, joins, index-heavy queries.

    **Accumulo:** same model; each key has a **visibility label** («(ENGINEERING&EU)|ADMIN») checked against the reader's authorisations: **cell-level security**, popular in government/defence; server-side programmable **iterators** filter/aggregate near the data. Relevant to the posting for mixed-sensitivity data (export-controlled engineering data).

    **Interview:** HBase vs Hive (key access vs batch SQL scans); avoiding hotspots (row key salting/hashing, ID before timestamp); what's special about Accumulo (cell-level labels).
  `),

  hadoopspark: T(`
    > **In one line:** **Hadoop** is a platform (HDFS storage + YARN resources + MapReduce processing); **Spark** is an engine. Spark replaced **MapReduce**, not necessarily HDFS/YARN (it often ran **on** Hadoop: Spark on YARN was the bridge). Today both are largely replaced by object storage and Kubernetes/managed services.

    | | MapReduce | Spark |
    |---|---|---|
    | Intermediate data | Disk after every map and reduce | Memory where possible, spills |
    | Multi-step | Chain of jobs | One optimised DAG |
    | Speed | Slow for iterative/multi-stage | Often 10-100× faster there |
    | APIs | Java map/reduce | SQL, DataFrames (Python/Scala/Java/R), streaming, ML |
    | Streaming / interactive | No / no | Structured Streaming / notebooks, shells |
    | Fault tolerance | Re-run tasks; data on disk | Lineage recompute, checkpoints |
    | Memory needs | Low | Higher |
    | Huge batch on cheap disks | Very stable | Very stable now |
    MapReduce still appears in legacy jobs and huge batch on memory-poor clusters. Spark runs without Hadoop (standalone, Kubernetes, cloud storage).

    ## Migrating Hadoop to a cloud lakehouse
    1. **Inventory:** HDFS data, Hive tables (managed/external), jobs (MapReduce, Hive SQL, Spark, Pig, Oozie), security (Kerberos, Ranger/Sentry), consumers.
    2. **Data:** DistCp, Azure Data Factory, or Data Box for very large volumes; validate counts/checksums.
    3. **Tables:** Hive → Delta/Iceberg; metastore → Unity Catalog/Glue; keep partitions.
    4. **Jobs:** MapReduce/Pig → Spark; Hive SQL → Spark SQL/dbt; Oozie → Airflow/Workflows.
    5. **Security:** Ranger policies → cloud IAM + catalog permissions.
    6. **Validate:** parallel runs for a few cycles; row counts, per-partition column aggregates/checksums, sample record diffs. Usual differences: **NULL handling, timestamp time zones, decimal precision, string collation** between Hive and Spark.
    7. **Cut over, decommission.**

    **Interview:** Hadoop vs Spark (platform vs engine); can Spark run without Hadoop (yes); migrating a cluster to the cloud.
  `),

  cassandra: T(`
    > **In one line:** **Apache Cassandra** is a **leaderless wide-column** NoSQL database for **massive write throughput, linear scaling and multi-datacenter availability**. Design tables around queries: the **partition key** picks the nodes; **clustering columns** sort rows within the partition.

    **Architecture:** peer-to-peer ring (no master); **consistent hashing** of the partition key onto token ranges with virtual nodes; replication factor per keyspace (per DC with NetworkTopologyStrategy); **tunable consistency** per query (ONE, QUORUM, LOCAL_QUORUM, ALL; RF 3 with QUORUM writes + QUORUM reads, 2 + 2 > 3, gives read-your-writes); write path commit log → memtable → SSTables (LSM: very fast writes); repairs via hinted handoff, read repair and regular anti-entropy repair; gossip for membership.

    «««sql
    CREATE TABLE telemetry_by_engine_day (
      engine_id int, day date, ts timestamp, temperature_c double, rpm int,
      PRIMARY KEY ((engine_id, day), ts)
    ) WITH CLUSTERING ORDER BY (ts DESC) AND default_time_to_live = 7776000;
    »»»
    - «(engine_id, day)» = composite **partition key**: spreads writes and **bounds partition size** (engine_id alone grows forever: the wide-partition problem; aim < ~100 MB per partition).
    - «ts» = **clustering column**, newest first.
    - «WHERE engine_id = 77 AND day = '2026-11-26' AND ts > …» hits one partition: fast.
    - **One table per query pattern**, duplicated as needed; no joins, limited secondary indexes; «ALLOW FILTERING» is a warning sign.

    | Strengths | Weaknesses |
    |---|---|
    | Very high write throughput, linear scaling | No joins, limited ad-hoc queries |
    | No single point of failure, multi-DC | Query-driven modelling, duplication |
    | TTL expiry; great for time series/IoT | Eventual consistency by default |
    | | Tombstones, repairs, compaction tuning |

    ## What goes wrong
    - Large/unbounded partitions → slow reads, compaction pain → time-bucket the key.
    - **Tombstones:** deletes/TTL write markers that live until «gc_grace_seconds» (10 days); scanning many slows or fails queries; TTL-heavy and "delete then insert" designs cause tombstone storms.
    - Hot partitions from skewed keys.
    - **Lightweight transactions** («IF NOT EXISTS», Paxos) are slow: avoid in hot paths.
    - **Analytics on Cassandra** hurts latency → extract with the **Spark Cassandra connector** (token-range parallelism), not «SELECT *» through one coordinator; prefer CDC for change feeds.

    **Interview:** partition key vs clustering column; modelling sensor data ((device, time bucket) partition, ts clustering, TTL); read-your-writes (QUORUM/QUORUM with RF 3).
  `),

  dynamodb: T(`
    > **In one line:** **Amazon DynamoDB** is a fully managed, serverless **key-value/document** database with single-digit-millisecond latency at any scale. Access by **partition key** (+ optional **sort key**), pay per request or provisioned capacity, design around access patterns.

    **Model:** table of **items** (JSON-like, ≤ 400 KB). Primary key = partition key alone, or + **sort key** for one-to-many («PK = ENGINE#77, SK = READING#2026-11-26T10:00:00»). **GSI** (global: different keys, **eventually consistent**, own capacity) vs **LSI** (same partition key, different sort key). **Single-table design:** several entity types in one table with overloaded PK/SK patterns, serving many access patterns in few requests: efficient but hard to analyse.

    **Features:** on-demand or provisioned capacity (RCUs/WCUs, autoscaling); eventually consistent reads by default, strongly consistent optional (in-region); ACID transactions up to 100 items; TTL; **Streams** (ordered per-item change log, 24 h retention: CDC → Lambda, Kinesis, the lake); **global tables** (multi-region active-active, last-writer-wins); **export to S3** (point-in-time, no capacity cost).

    **For a DE:** as a **source**, use Streams or S3 export (never analytical scans on the live table); expect nested, varying shapes and decode single-table designs by entity type. As a **serving sink**, write precomputed results (latest engine health) for millisecond app lookups. Not for analytics.

    ## What goes wrong
    - **Hot partition keys** throttle even when total capacity is fine (adaptive capacity has limits) → write sharding (key + suffix).
    - Scans burn capacity and money.
    - **Under-provisioned GSI back-pressures writes** to the base table.
    - 400 KB limit → payload in S3 with a pointer.
    - Eventually consistent GSIs surprise read-after-write logic.

    **Interview:** partition vs sort key, GSI vs LSI; getting data into a lakehouse (Streams/S3 export → Spark/Glue → Delta/Iceberg); DynamoDB vs PostgreSQL (massive key access, serverless, predictable latency vs ad-hoc queries).
  `),

  mongodb: T(`
    > **In one line:** **MongoDB** is a **document database**: JSON-like **BSON documents** in **collections**, flexible schema, rich queries and secondary indexes, an **aggregation pipeline**, replica sets for availability and **sharding** for scale.

    **Embed vs reference:** embed what's read together and **bounded** (a claim with its few parts); reference what's shared or **unbounded** (dealer by ID; sensor readings → time-series collections or a separate collection). The **16 MB document limit** punishes unbounded arrays (an engine embedding every reading forever: huge and slow to update). Optional **JSON Schema validation** per collection.

    **Querying:** find by fields, ranges, array contents, projections, sorting. **Aggregation pipeline:** «$match», «$group», «$lookup» (join), «$unwind» (explode arrays), «$project», «$sort»: SQL-like, step by step. **Indexes:** single, compound (leftmost prefix; order fields by **ESR: Equality, Sort, Range**), multikey (arrays), text, geospatial, TTL. Missing indexes = collection scans.

    **Scale:** **replica set** (primary + secondaries, automatic failover; read preference trades consistency: **secondaries can be stale**; write concern «w: "majority"» for durability). **Sharding** by **shard key** (hashed vs ranged) decides balance and routing nearly forever (resharding since 5.0, expensive); monotonic keys → hot shard, low cardinality → jumbo chunks. **Change streams** (on the oplog) = CDC. Multi-document ACID transactions exist but cost latency; good designs avoid needing them by embedding.

    **For a DE:** ingest via change streams, Debezium/Kafka MongoDB connector, Spark connector or exports; raw JSON to bronze; **flatten deliberately** into silver at clear grains (claim header vs claim parts); handle **type drift** («amount» string in old docs, number in new), missing fields, nested arrays (explode carefully), ObjectIds and BSON types (Decimal128, dates). Analytics belong in the lakehouse. **Atlas Vector Search** (your Strata project) stores embeddings beside documents for RAG over operational data.

    **What goes wrong:** type drift, unbounded arrays, poor shard keys, stale secondary reads, «$lookup»-heavy designs on huge collections (relational data in a document store).

    **Interview:** embed vs reference; ingesting MongoDB to a lakehouse; choosing a shard key.
  `),

  scalajava: T(`
    > **In one line:** Spark, Kafka, Hadoop and Flink are **Scala/Java (JVM)**. DEs mostly write **PySpark and SQL**, but should **read and lightly modify** Scala/Java Spark code, understand **JVM basics** (memory, GC, JARs, dependencies), and know when Scala/Java fits better.

    **Why the JVM shows up in Python work:** executors are JVMs (memory settings, GC pauses, «OutOfMemoryError», serialisation, JAR dependencies); Hadoop-era codebases have Scala/Java jobs to maintain or migrate; Kafka clients, connectors and Flink jobs are often Java; JDBC drivers and Kafka/Delta connector jars; **Java stack traces in PySpark errors** (read the "Caused by" at the bottom).

    «««python
    result = (claims.filter(F.col("status") == "Approved")
              .groupBy("dealer_id").agg(F.sum("claim_amount").alias("approved")))
    »»»
    «««text
    val result = claims.filter($"status" === "Approved")
      .groupBy("dealer_id").agg(sum("claim_amount").as("approved"))
    »»»
    **Recognise:** «val» (immutable) vs «var»; type inference; «===» for column equality («==» compares objects); «$"col"»; «.as» alias; **case classes** as typed schemas («case class Claim(claimId: Long, dealerId: Int, amount: Double)» → «spark.read.parquet(p).as[Claim]», «Dataset[T]», implicits for encoders); «Option» instead of null; pattern matching; map/filter/flatMap. Builds: **sbt** or Maven/Gradle; fat/assembly JARs submitted with «spark-submit --class …».

    **Java basics:** classes, interfaces, static typing, checked vs unchecked exceptions, collections, streams API; big heaps → long GC (why executors use 4-5 cores and moderate heaps); **"jar hell"** (two libraries need different versions) solved by shading/relocation.

    | Situation | Choice |
    |---|---|
    | Standard DataFrame/SQL ETL | PySpark or SQL (same performance) |
    | Heavy custom per-row logic without built-ins | Scala UDF (no Python serialisation) or pandas UDF |
    | Large type-safe shared codebases | Scala Datasets |
    | Kafka Streams, Flink, custom connectors | Java/Scala |
    | ML / data science | Python |

    **Upgrades:** **Spark 4 is Scala 2.13 only**, on Java 17/21 (Databricks Runtime 18 defaults to JDK 21); jars built for Scala 2.12 won't load: a common upgrade breakage.

    **Interview:** translate a Scala snippet to PySpark aloud; why a Scala UDF beats a Python UDF (no JVM ↔ Python serialisation); fat JARs and dependency conflicts. Honest positioning: "I work mainly in PySpark and SQL, can read and modify Scala Spark jobs, and understand JVM tuning for executors."
  `),
};
