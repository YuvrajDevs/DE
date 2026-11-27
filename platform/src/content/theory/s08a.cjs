const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Hadoop
  hadoopwhat: T(`
    > **In one line:** Apache Hadoop is the open-source platform that made big data practical (2006+): **HDFS** stores huge files across many cheap machines, **YARN** shares the cluster's resources, and **MapReduce** processes data in parallel. Its ideas live on everywhere, even though Spark and cloud object storage replaced most of it.

    ## The problem it solved
    In the mid-2000s, storing and processing terabytes needed expensive specialised hardware. Google published how it did it on commodity machines (GFS 2003, MapReduce 2004). Hadoop re-implemented those ideas openly: **assume machines fail, replicate data, move computation to the data, scale by adding nodes.**

    ## The core components
    | Component | Role | Modern equivalent |
    |---|---|---|
    | **HDFS** | Distributed file system: blocks replicated across DataNodes, metadata on the NameNode | Cloud object storage (S3, ADLS, GCS) |
    | **YARN** | Resource manager: allocates CPU/memory containers to applications | Kubernetes, managed cluster services |
    | **MapReduce** | Batch processing model: map → shuffle → reduce | Spark |
    | **Hadoop Common** | Shared libraries | — |

    ## The ecosystem around it
    | Tool | Purpose |
    |---|---|
    | **Hive** | SQL on Hadoop; the **metastore** (table definitions) is still widely used |
    | **HBase** | Low-latency NoSQL (wide-column) on HDFS |
    | **Pig** | Scripting language for data flows (legacy) |
    | **Sqoop** | Bulk transfer between relational databases and HDFS (retired) |
    | **Flume** | Log ingestion (legacy; Kafka replaced it) |
    | **Oozie** | Workflow scheduler (legacy; Airflow replaced it) |
    | **ZooKeeper** | Coordination service (leader election, configuration) |
    | **Spark, Kafka, Impala, Presto/Trino** | Ran on or next to Hadoop clusters |
    Distributions: Cloudera (CDH/CDP), Hortonworks (merged into Cloudera), MapR. Cloud versions: AWS EMR, Azure HDInsight, Google Dataproc.

    ## Why it declined
    - Coupled storage and compute: you paid for a cluster 24/7 and scaled both together.
    - Operational complexity (NameNode HA, tuning, upgrades, Kerberos security).
    - MapReduce was slow and verbose; Spark replaced it.
    - Cloud object storage made HDFS unnecessary for most companies.

    ## Why it still matters for you
    - The posting lists **Hadoop, MapReduce, Hive, HBase**: enterprises still run Hadoop clusters, and migrations from Hadoop to cloud lakehouses are common projects.
    - The concepts (blocks, replication, data locality, map/shuffle/reduce, metastore, partitions) explain how Spark, Delta and cloud warehouses work.

    ## How interviewers test this
    - "What are the components of Hadoop?" HDFS, YARN, MapReduce, plus ecosystem.
    - "Why did companies move from Hadoop to cloud lakehouses?" Decoupled storage/compute, elasticity, less ops, Spark/Delta.
    - "What would you do in a Hadoop-to-cloud migration?" Move data (DistCp/ADF to object storage), convert Hive tables to Delta/Iceberg, port jobs to Spark, migrate the metastore/catalog and security, validate with reconciliation.
  `, {
    check: [
      match('Match the Hadoop component to its modern equivalent.', [['HDFS', 'Cloud object storage'], ['YARN', 'Kubernetes / managed cluster resource management'], ['MapReduce', 'Spark'], ['Oozie', 'Airflow']], 'The ideas survived; the tools changed.'),
      mcq('What was the main architectural drawback of classic Hadoop clusters compared with cloud lakehouses?', ['No SQL at all', 'Storage and compute were coupled: scaling or paying for one meant the other too', 'No replication', 'Single-machine only'], 1, 'Decoupling storage and compute is the key cloud shift.'),
      tf('Hive\'s metastore concept (a catalog of table definitions over files) is still used by modern engines.', true, 'Spark, Trino and many catalogs use or extend the Hive metastore model.'),
    ],
  }),

  // ================================================================== HDFS
  hdfs: T(`
    > **In one line:** **HDFS** splits files into large **blocks** (128 MB), stores each block on several **DataNodes** (replication factor 3, rack-aware), and keeps all metadata (directory tree, file → blocks → locations) in the **NameNode**'s memory. It is built for **huge files read sequentially**, not for small files or random updates.

    ## Architecture
    | Part | Role |
    |---|---|
    | **NameNode** | Master: namespace (directories, files, permissions) and block map, in memory; persists changes to an **edit log** and periodic **fsimage** |
    | **DataNodes** | Store blocks on local disks; send **heartbeats** and **block reports** to the NameNode |
    | **Standby NameNode + JournalNodes** | High availability: shared edit log; automatic failover with ZooKeeper |
    | **Secondary NameNode** (non-HA setups) | Merges edit log into fsimage (checkpointing) — **not** a backup NameNode |

    ## How a write works
    1. Client asks the NameNode to create a file; the NameNode chooses DataNodes for the first block.
    2. Client streams data to the first DataNode, which **pipelines** it to the second, which forwards to the third.
    3. Acknowledgements flow back; next block; on close the NameNode records the file.
    **Rack awareness:** typically one replica on the writer's rack and two on another rack, so a whole rack can fail.

    ## How a read works
    Client asks the NameNode for block locations, then reads each block directly from the closest DataNode. Compute frameworks schedule tasks **on the nodes holding the blocks** (data locality).

    ## Failure handling
    - DataNode stops heartbeating → NameNode marks it dead and **re-replicates** its blocks from remaining copies.
    - Corrupt block (checksum mismatch) → read another replica, re-replicate.
    - NameNode failure → HA failover to the standby.

    ## Design choices and their consequences
    | Choice | Why | Consequence |
    |---|---|---|
    | Large blocks (128-256 MB) | Fewer blocks to track, long sequential reads | Small files waste NameNode memory |
    | Write-once, append-only | Simple consistency | No in-place updates (table formats handle updates by rewriting files) |
    | Metadata in NameNode memory | Fast lookups | Limits total number of files/blocks (~150 bytes per object) |
    | 3× replication | Durability + read parallelism | 3× storage cost (erasure coding in Hadoop 3 cuts this to ~1.5× for cold data) |

    ## The small files problem
    Millions of small files (e.g. one per streaming micro-batch) each cost NameNode memory and a task each when processed. Fixes: compaction jobs, larger batches, container formats (SequenceFiles, Parquet), HAR files.

    ## How interviewers test this
    - "Explain HDFS architecture." NameNode, DataNodes, blocks, replication, rack awareness, HA.
    - "What happens when a DataNode fails?"
    - "Why is HDFS bad with small files?"
    - "Is the Secondary NameNode a backup?" No: it checkpoints metadata.
  `, {
    check: [
      mcq('What does the HDFS NameNode store?', ['The data blocks', 'Metadata: the namespace and which DataNodes hold each block', 'Only logs', 'User passwords'], 1, 'DataNodes store blocks; the NameNode stores metadata in memory.'),
      mcq('A 1 GB file with 128 MB blocks and replication factor 3 uses how many block replicas?', ['8', '24', '3', '128'], 1, '8 blocks × 3 replicas = 24.'),
      tf('The Secondary NameNode automatically takes over when the NameNode fails.', false, 'It only checkpoints metadata. HA uses a Standby NameNode.'),
      mcq('Why are millions of small files a problem in HDFS?', ['They are slower to write', 'Each file/block consumes NameNode memory and creates a task when processed', 'They cannot be replicated', 'They are not allowed'], 1, 'Compact small files into larger ones.'),
    ],
  }),

  // ================================================================== MapReduce
  mapreduce: T(`
    > **In one line:** **MapReduce** processes data in three phases: **map** (turn each input record into key-value pairs), **shuffle & sort** (bring all values for the same key together), and **reduce** (combine the values per key). It parallelises naturally and tolerates failures, but writes to disk between phases, which made it slow.

    ## The classic example: word count
    Input lines → **map** emits «(word, 1)» for every word → **shuffle** groups by word → **reduce** sums the 1s → «(word, count)».

    ## The phases in detail
    1. **Input splits:** the input (HDFS files) is divided into splits (≈ blocks); one **map task** per split, scheduled near the data.
    2. **Map:** user function «map(key, value) → list of (k2, v2)». Output buffered in memory, **partitioned** by reducer («hash(k2) % R»), **sorted** by key, spilled to local disk.
    3. **Combiner (optional):** a mini-reduce on each mapper's output (e.g. sum the 1s locally) to shrink the shuffle. Only valid for associative and commutative operations (sum, count, max), not average directly (use sum and count).
    4. **Shuffle & sort:** each reducer fetches its partition from every mapper and merge-sorts them by key.
    5. **Reduce:** «reduce(k2, list of v2) → output», written to HDFS.
    6. **Fault tolerance:** failed tasks re-run elsewhere; map outputs on local disk can be re-fetched or recomputed; slow tasks get speculative copies.

    ## Thinking in MapReduce: common patterns
    | Problem | Map emits | Reduce does |
    |---|---|---|
    | Count claims per dealer | (dealer_id, 1) | Sum |
    | Total claim amount per region | (region, amount) | Sum |
    | Max temperature per engine | (engine_id, temp) | Max |
    | Average per key | (key, (sum, count)) | Sum pairs, divide at the end |
    | Distinct values | (value, null) | Emit key once |
    | Reduce-side join | (join_key, (table_tag, record)) from both tables | Combine records from both tags per key |
    | Inverted index | (word, doc_id) | Collect doc list |

    ## Why Spark replaced it
    - Each MapReduce job writes its output to HDFS; a 5-step pipeline = 5 jobs = 5 full disk writes and reads. Spark keeps intermediate data in memory and plans multi-step DAGs.
    - Verbose Java code vs concise DataFrame/SQL.
    - No interactive use; slow iterative algorithms.
    Spark's groupBy/join still do map-shuffle-reduce internally: **the model lives on**.

    ## How interviewers test this
    - "Explain MapReduce with word count." Map, shuffle/sort, reduce, combiner.
    - "When can you use a combiner?" Associative + commutative operations.
    - "How would you compute an average in MapReduce?" Emit (sum, count); reduce sums both; divide.
    - "MapReduce vs Spark?"
  `, {
    check: [
      order('Order the MapReduce phases.', ['Input splits assigned to map tasks', 'Map emits key-value pairs', 'Combiner pre-aggregates locally (optional)', 'Shuffle and sort by key', 'Reduce combines values per key', 'Output written to HDFS'], 'Map → shuffle/sort → reduce.'),
      mcq('Can you use the reducer "average of values" directly as a combiner?', ['Yes, always', 'No: an average of averages is wrong; emit (sum, count) and divide at the end', 'Only with integers', 'Only with one reducer'], 1, 'Combiners need associative, commutative operations.'),
      tf('Spark\'s groupBy and join still follow the map-shuffle-reduce pattern internally.', true, 'Spark improved execution (memory, DAGs), not the core idea.'),
    ],
    hands: [
      py({ q: 'Implement **MapReduce** in plain Python for "average claim amount per region". Write «mapper(record)» returning a list of «(region, (amount, 1))» pairs (skip records with a None amount); «combine(pairs)» that pre-aggregates pairs by key **locally** into «{key: (sum, count)}»; and «reducer(partials)» that merges a list of such dicts and returns «{key: average rounded to 2 dp}». This is exactly why combiners emit (sum, count), not averages.', starter: 'def mapper(record):\n    pass\n\ndef combine(pairs):\n    pass\n\ndef reducer(partials):\n    pass\n',
        tests: `split1 = [{'region': 'West', 'amount': 100.0}, {'region': 'West', 'amount': 300.0}, {'region': 'North', 'amount': 50.0}]
split2 = [{'region': 'West', 'amount': 200.0}, {'region': 'North', 'amount': None}, {'region': 'North', 'amount': 150.0}]
p1 = combine([kv for r in split1 for kv in mapper(r)])
p2 = combine([kv for r in split2 for kv in mapper(r)])
assert p1 == {'West': (400.0, 2), 'North': (50.0, 1)}, p1
assert reducer([p1, p2]) == {'West': 200.0, 'North': 100.0}, reducer([p1, p2])
assert reducer([]) == {}`,
        solution: `def mapper(record):
    if record.get('amount') is None:
        return []
    return [(record['region'], (record['amount'], 1))]

def combine(pairs):
    out = {}
    for k, (s, c) in pairs:
        ps, pc = out.get(k, (0.0, 0))
        out[k] = (ps + s, pc + c)
    return out

def reducer(partials):
    tot = {}
    for part in partials:
        for k, (s, c) in part.items():
            ps, pc = tot.get(k, (0.0, 0))
            tot[k] = (ps + s, pc + c)
    return {k: round(s / c, 2) for k, (s, c) in tot.items()}` }),
    ],
  }),

  // ================================================================== Hive
  hive: T(`
    > **In one line:** **Apache Hive** put **SQL on top of files in HDFS**: you define tables (schema, location, format) in the **Hive metastore**, query them with HiveQL, and Hive compiles queries into distributed jobs (originally MapReduce, later Tez/Spark). Its metastore became the standard **catalog** idea for data lakes.

    ## The problem it solved
    Analysts knew SQL, not Java MapReduce. Hive (Facebook, 2008) let them query petabytes in HDFS with SQL.

    ## How it works
    - **Metastore:** a relational database (MySQL/PostgreSQL) holding **table metadata**: database, table name, columns and types, storage location (HDFS/S3 path), file format and SerDe, partitions and their locations, statistics.
    - **Schema-on-read:** files are not validated on load; the schema is applied when reading via a **SerDe** (serializer/deserializer) for the format (CSV, JSON, Parquet, ORC, Avro).
    - **Query engine:** HiveQL → logical plan → jobs on MapReduce, **Tez** (DAG engine, much faster) or Spark. **LLAP** added caching for interactive queries.
    - **HiveServer2:** JDBC/ODBC endpoint for clients and BI tools.

    ## Managed vs external tables
    | | Managed (internal) | External |
    |---|---|---|
    | Who owns the files | Hive (in the warehouse directory) | You (any path) |
    | DROP TABLE | Deletes metadata **and data** | Deletes metadata only; files stay |
    | Use | Data fully controlled by Hive | Data shared with other tools or landed by pipelines |
    Classic mistake: dropping a managed table that other jobs depended on, deleting the data.

    ## Hive today
    - The **metastore** is everywhere: Spark uses it («spark.sql.catalogImplementation=hive»), AWS Glue Data Catalog is Hive-metastore-compatible, Databricks had a Hive metastore before Unity Catalog, Trino/Presto query Hive tables.
    - Hive's limits (no ACID on plain tables, slow metadata for many partitions, directory-based tables) led to **Iceberg, Delta and Hudi**, which keep table state in their own metadata instead of directory listings.
    - Hive ACID tables (ORC-based) exist but are mostly a Hadoop-era solution.

    ## How interviewers test this
    - "What is the Hive metastore?" Catalog of table metadata (schema, location, format, partitions) used by many engines.
    - "Managed vs external table?" Drop behaviour and ownership.
    - "Schema-on-read in Hive?"
    - "Why did table formats like Iceberg replace Hive tables?" ACID, schema evolution, hidden partitioning, fast metadata without listing directories.
  `, {
    check: [
      mcq('You DROP an **external** Hive table. What happens to its files?', ['Deleted', 'They stay; only the metadata is removed', 'Moved to trash', 'Converted to Parquet'], 1, 'External = you own the data. Dropping a managed table deletes data too.'),
      mcq('What does the Hive metastore hold?', ['The data files', 'Table metadata: columns, types, location, format/SerDe, partitions, statistics', 'Query results', 'Kafka offsets'], 1, 'It is a catalog over files.'),
      tf('Spark and AWS Glue can use a Hive-compatible metastore as their table catalog.', true, 'The metastore idea outlived Hive\'s query engine.'),
    ],
  }),

  // ================================================================== Hive partitions and buckets
  hivepart: T(`
    > **In one line:** Hive **partitions** split a table into **directories by column value** («/claims/submitted_date=2026-11-26/») so queries filtering on that column read only matching folders. **Buckets** split data **within** a table or partition into a **fixed number of files by hash** of a column, enabling efficient joins and sampling.

    ## Partitions
    - Declared with «PARTITIONED BY (submitted_date STRING)»; the partition column is **not stored in the files**, it is encoded in the directory path.
    - **Static partitioning:** you name the partition in the INSERT («PARTITION (submitted_date='2026-11-26')»).
    - **Dynamic partitioning:** Hive/Spark derives partitions from the data («PARTITION (submitted_date)» with the column last in the SELECT).
    - **Partition pruning:** «WHERE submitted_date = '2026-11-26'» reads one directory.
    - Partitions must be registered in the metastore: files written directly to a new folder are invisible until «MSCK REPAIR TABLE» or «ALTER TABLE … ADD PARTITION».

    ## Buckets
    - «CLUSTERED BY (engine_id) INTO 64 BUCKETS»: each partition has 64 files; a row goes to file «hash(engine_id) % 64».
    - **Bucketed joins:** two tables bucketed on the same key with compatible bucket counts can be joined bucket-to-bucket without a full shuffle (bucket map join / sort-merge bucket join). Spark supports its own bucketing too.
    - **Sampling:** read one bucket for a consistent sample.
    - Useful for high-cardinality columns where partitioning would create too many directories.

    ## Partitioning vs bucketing
    | | Partitioning | Bucketing |
    |---|---|---|
    | Physical form | Directories per value | Fixed number of files per partition by hash |
    | Best for | Low/moderate cardinality filter columns (dates) | High-cardinality join keys (engine_id, customer_id) |
    | Benefit | Pruning on filters | Shuffle-free joins, even file distribution, sampling |
    | Risk | Too many partitions / small files | Wrong bucket count; must be maintained on every write |

    ## Edge cases and what goes wrong
    - **Over-partitioning** (by date and engine) → millions of directories, metastore slow, small files.
    - **Partitions not registered** after writing files directly → queries silently miss data.
    - **Filtering on an expression** of the partition column (e.g. «year(submitted_date)») may not prune.
    - **Bucketing not respected** by a writer (different engine or settings) breaks the bucket guarantees.
    - In modern lakehouses, prefer **Iceberg hidden partitioning** or **Delta liquid clustering / Z-order** over Hive-style buckets.

    ## How interviewers test this
    - "Partitioning vs bucketing in Hive?"
    - "Static vs dynamic partitions?"
    - "I wrote files into a new partition folder but queries do not see them. Why?" Metastore not updated: MSCK REPAIR / ADD PARTITION.
  `, {
    check: [
      mcq('Which suits a high-cardinality join key like engine_id better?', ['Partitioning by engine_id', 'Bucketing by engine_id', 'Neither', 'Partitioning by engine_id and date'], 1, 'Partitioning by it would create too many directories.'),
      mcq('You copied Parquet files into «/claims/submitted_date=2026-11-27/» but Hive queries do not return them. Why?', ['Parquet is unsupported', 'The partition is not registered in the metastore; run MSCK REPAIR TABLE or ADD PARTITION', 'Files need a .txt extension', 'Hive caches results forever'], 1, 'Hive-style tables rely on the metastore\'s partition list.'),
      tf('In Hive-style partitioning, the partition column value is stored in the directory path, not inside the data files.', true, 'That is why partition columns are "virtual" in files.'),
    ],
  }),
};
