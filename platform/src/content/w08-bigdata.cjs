const { learn, mcq, tf, multi, match, order, viz, fill, bug, py, world, lesson, talk } = require('./_h.cjs');

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
    lesson('b6', 'Lab: write MapReduce jobs in Python', 25, [
      learn('MapReduce as code', `
        Hadoop MapReduce jobs were written in Java, but **Hadoop Streaming** lets any program act as mapper and reducer
        by reading lines from stdin and printing «key\\tvalue». The contract is always the same:

        «««flow
        mapper(line) -> list of (key, value) -> shuffle: group values by key, sorted -> reducer(key, values) -> output
        »»»
        - The **mapper** sees one record at a time, with no memory of other records. It runs in parallel where the data blocks live.
        - The **shuffle** moves every value for a key to the same reducer. It is the expensive network step (the same as a Spark shuffle).
        - The **reducer** sees one key with all its values.
        - A **combiner** is a "mini-reducer" run on each mapper's output **before** the shuffle, to shrink network traffic. It must be safe to apply zero, one or many times (for example sum and max, but *not* a naive average).

        In these challenges a tiny engine runs your functions exactly that way:
        «««python
        def run_mr(mapper, reducer, lines):
            groups = defaultdict(list)
            for line in lines:
                for k, v in mapper(line):
                    groups[k].append(v)          # shuffle
            return [out for k in sorted(groups) for out in reducer(k, groups[k])]
        »»»
      `),
      py({ q: 'Word count over defect notes. Write «mapper(line)» that emits «(word, 1)» for each lowercase word (split on whitespace) and «reducer(word, counts)» that returns «[(word, total)]».', starter: 'def mapper(line):\n    pass\n\ndef reducer(word, counts):\n    pass\n', tests: `from collections import defaultdict
def run_mr(m, r, lines):
    g = defaultdict(list)
    for ln in lines:
        for k, v in m(ln): g[k].append(v)
    return [o for k in sorted(g) for o in r(k, g[k])]
out = run_mr(mapper, reducer, ['Oil leak oil', 'leak noise', 'NOISE noise'])
assert out == [('leak', 2), ('noise', 3), ('oil', 2)], out`, solution: `def mapper(line):
    return [(w, 1) for w in line.lower().split()]

def reducer(word, counts):
    return [(word, sum(counts))]` }),
      py({ q: 'Max temperature per engine. Input lines are «engine_id,cycle,temp_c». Emit «(engine_id, max_temp)»; skip malformed lines (wrong field count or non-numeric temp) in the mapper.', starter: 'def mapper(line):\n    pass\n\ndef reducer(engine, temps):\n    pass\n', tests: `from collections import defaultdict
def run_mr(m, r, lines):
    g = defaultdict(list)
    for ln in lines:
        for k, v in m(ln): g[k].append(v)
    return [o for k in sorted(g) for o in r(k, g[k])]
lines = ['E1,1,80.5', 'E2,1,77.0', 'E1,2,95.2', 'garbage', 'E2,2,abc', 'E2,3,79.1']
assert run_mr(mapper, reducer, lines) == [('E1', 95.2), ('E2', 79.1)]`, solution: `def mapper(line):
    parts = line.split(',')
    if len(parts) != 3:
        return []
    try:
        return [(parts[0], float(parts[2]))]
    except ValueError:
        return []

def reducer(engine, temps):
    return [(engine, max(temps))]` }),
      py({ q: '**Inverted index** (how search engines start). Lines are «doc_id<TAB>text». Output «(word, sorted list of unique doc_ids)» for each lowercase word.', starter: 'def mapper(line):\n    pass\n\ndef reducer(word, doc_ids):\n    pass\n', tests: `from collections import defaultdict
def run_mr(m, r, lines):
    g = defaultdict(list)
    for ln in lines:
        for k, v in m(ln): g[k].append(v)
    return [o for k in sorted(g) for o in r(k, g[k])]
lines = ['d2\\tfuel pump leak', 'd1\\tfuel filter', 'd3\\tleak leak']
assert run_mr(mapper, reducer, lines) == [('filter', ['d1']), ('fuel', ['d1', 'd2']), ('leak', ['d2', 'd3']), ('pump', ['d2'])]`, solution: `def mapper(line):
    doc, text = line.split('\\t', 1)
    return [(w, doc) for w in set(text.lower().split())]

def reducer(word, doc_ids):
    return [(word, sorted(set(doc_ids)))]` }),
      py({ q: '**Reduce-side join**. Two inputs are mixed in one stream: «M|engine_id|model» (engine master) and «R|engine_id|temp» (readings). Join them in MapReduce: output «(engine_id, model, avg_temp rounded to 1)» for engines that have both.', starter: 'def mapper(line):\n    pass\n\ndef reducer(engine, values):\n    pass\n', tests: `from collections import defaultdict
def run_mr(m, r, lines):
    g = defaultdict(list)
    for ln in lines:
        for k, v in m(ln): g[k].append(v)
    return [o for k in sorted(g) for o in r(k, g[k])]
lines = ['R|E1|80', 'M|E1|X15', 'R|E1|90', 'M|E2|L9', 'R|E3|70']
assert run_mr(mapper, reducer, lines) == [('E1', 'X15', 85.0)], run_mr(mapper, reducer, lines)`, solution: `def mapper(line):
    tag, engine, value = line.split('|')
    return [(engine, (tag, value))]

def reducer(engine, values):
    models = [v for t, v in values if t == 'M']
    temps = [float(v) for t, v in values if t == 'R']
    if not models or not temps:
        return []
    return [(engine, models[0], round(sum(temps) / len(temps), 1))]`, hint: 'Tag each value with its source in the mapper; in the reducer separate the tags, then combine.' }),
      py({ q: '**Combiner for an average.** Averages can\'t be combined directly («avg(avg(a), avg(b))» is wrong). Emit «(engine, (sum, count))» from the mapper, write «combiner(engine, pairs)» returning «[(engine, (sum, count))]», and «reducer(engine, pairs)» returning «[(engine, average rounded to 2)]». The test applies the combiner per mapper chunk.', starter: 'def mapper(line):\n    pass\n\ndef combiner(engine, pairs):\n    pass\n\ndef reducer(engine, pairs):\n    pass\n', tests: `from collections import defaultdict
def run_with_combiner(chunks):
    g = defaultdict(list)
    for chunk in chunks:                       # each chunk = one mapper task
        local = defaultdict(list)
        for ln in chunk:
            for k, v in mapper(ln): local[k].append(v)
        for k, vs in local.items():
            for k2, v2 in combiner(k, vs): g[k2].append(v2)
    return [o for k in sorted(g) for o in reducer(k, g[k])]
chunks = [['E1,10', 'E1,20', 'E1,30'], ['E1,40'], ['E2,5']]
assert run_with_combiner(chunks) == [('E1', 25.0), ('E2', 5.0)], run_with_combiner(chunks)`, solution: `def mapper(line):
    engine, temp = line.split(',')
    return [(engine, (float(temp), 1))]

def combiner(engine, pairs):
    return [(engine, (sum(s for s, c in pairs), sum(c for s, c in pairs)))]

def reducer(engine, pairs):
    total = sum(s for s, c in pairs)
    count = sum(c for s, c in pairs)
    return [(engine, round(total / count, 2))]` }),
      mcq('Which reducer function is **safe** to also use as a combiner?', ['Average of values', 'Sum of values', 'Median of values', 'Count of distinct values'], 1, 'Sum is associative and commutative: summing partial sums gives the same result. Average and median are not; distinct counts need the actual sets.'),
      mcq('In Hadoop Streaming, how does a Python mapper receive its input?', ['Through a REST API', 'Lines on stdin, writing key<TAB>value lines to stdout', 'From a Kafka topic', 'As a pandas DataFrame'], 1),
    ]),
    lesson('b10', 'Lab: HDFS and YARN commands', 15, [
      learn('Working on a Hadoop cluster', `
        On a Hadoop cluster you work through an **edge node** (gateway machine) by SSH, a terminal, plus web UIs:
        the **NameNode UI** (port 9870) shows files, blocks and DataNodes, and the **YARN ResourceManager UI** (port 8088) shows running applications.
        Login is usually Kerberos (\`kinit\`) in enterprises.

        | Command | Does |
        |---|---|
        | «hdfs dfs -ls /data» | list a directory |
        | «hdfs dfs -mkdir -p /data/raw» | create directories |
        | «hdfs dfs -put local.csv /data/raw/» | upload a file |
        | «hdfs dfs -cat /data/raw/x.csv | head» | read a file |
        | «hdfs dfs -du -h /data» | space used (before replication) |
        | «hdfs dfs -setrep 2 /data/old» | change replication factor |
        | «hdfs fsck /data -files -blocks» | check blocks and health |
        | «yarn application -list» | running applications |
        | «yarn logs -applicationId <id>» | logs of a finished app |
        | «spark-submit --master yarn --deploy-mode cluster job.py» | run Spark on the cluster |
      `),
      viz('terminal', 'Load a file into HDFS and run a Spark job on YARN', '', {
        prompt: 'edge-node$',
        missions: [
          { task: 'Authenticate with Kerberos as yourself.', accept: '^kinit(\\s+\\S+)?$', out: 'Password for you@CORP.EXAMPLE.COM: ********', hint: 'kinit' },
          { task: 'Create «/data/raw/claims» (with parents).', accept: '^hdfs\\s+dfs\\s+-mkdir\\s+-p\\s+/data/raw/claims/?$', out: '', hint: 'hdfs dfs -mkdir -p /data/raw/claims' },
          { task: 'Upload «claims_2026_11.csv» into it.', accept: '^hdfs\\s+dfs\\s+-(put|copyFromLocal)\\s+claims_2026_11\\.csv\\s+/data/raw/claims/?$', out: '', hint: 'hdfs dfs -put claims_2026_11.csv /data/raw/claims/' },
          { task: 'Show how much space it uses, human readable.', accept: '^hdfs\\s+dfs\\s+-du\\s+-h\\s+/data/raw/claims/?$', out: '1.2 G  3.6 G  /data/raw/claims/claims_2026_11.csv', why: 'Two columns: logical size and disk used across all 3 replicas.', hint: 'hdfs dfs -du -h /data/raw/claims' },
          { task: 'Check its blocks with fsck.', accept: '^hdfs\\s+fsck\\s+/data/raw/claims/?(\\s+-files)?(\\s+-blocks)?(\\s+-locations)?$', out: 'Total blocks (validated): 10 (avg. block size 128 MB)\nDefault replication factor: 3\nStatus: HEALTHY', hint: 'hdfs fsck /data/raw/claims -files -blocks' },
          { task: 'Submit «clean_claims.py» to YARN in cluster mode.', accept: '^spark-submit\\s+.*--master\\s+yarn.*--deploy-mode\\s+cluster.*clean_claims\\.py|^spark-submit\\s+.*--deploy-mode\\s+cluster.*--master\\s+yarn.*clean_claims\\.py', out: 'INFO Client: Submitted application application_1764050000000_0042\nINFO Client: Application report: state RUNNING', why: 'cluster mode: the driver runs inside the cluster, so the job survives your laptop disconnecting.', hint: 'spark-submit --master yarn --deploy-mode cluster clean_claims.py' },
          { task: 'Fetch the logs of application_1764050000000_0042.', accept: '^yarn\\s+logs\\s+-applicationId\\s+application_1764050000000_0042$', out: 'Container: container_..._000001 ...\n26/11/25 INFO clean_claims: wrote 1,204,331 rows to /data/silver/claims', hint: 'yarn logs -applicationId application_1764050000000_0042' },
        ],
      }),
      mcq('«hdfs dfs -du -h» shows «1.2 G  3.6 G». Why two numbers?', ['Compressed vs uncompressed', 'Logical size vs raw disk used across replicas (×3)', 'Two different files', 'Yesterday vs today'], 1),
      mcq('Difference between «--deploy-mode client» and «cluster»?', ['None', 'client runs the driver on the machine you submit from; cluster runs it inside the cluster on YARN', 'cluster uses more executors', 'client is only for Python'], 1),
    ]),
    lesson('b7', 'Lab: Hive tables, partitions and HiveQL', 20, [
      learn('HiveQL you should be able to write', `
        «««sql
        -- External table over Parquet files already in the lake; DROP keeps the files
        CREATE EXTERNAL TABLE IF NOT EXISTS silver.claims (
          claim_id BIGINT, dealer_id INT, claim_amount DECIMAL(12,2), status STRING)
        PARTITIONED BY (claim_month STRING)
        STORED AS PARQUET
        LOCATION 's3a://lake/silver/claims/';

        MSCK REPAIR TABLE silver.claims;                     -- register partition folders written by Spark

        -- Dynamic partition overwrite: rewrite only the months present in the SELECT
        SET hive.exec.dynamic.partition.mode = nonstrict;
        INSERT OVERWRITE TABLE gold.claims_monthly PARTITION (claim_month)
        SELECT dealer_id, SUM(claim_amount) AS total, claim_month
        FROM silver.claims WHERE claim_month >= '2026-10' GROUP BY dealer_id, claim_month;

        -- Arrays: LATERAL VIEW explode = Spark's explode()
        SELECT c.claim_id, p.part FROM claims_with_parts c LATERAL VIEW explode(c.parts) p AS part;

        -- Bucketing: hash rows into N files by a key, which speeds joins/sampling on that key
        CREATE TABLE gold.readings_bucketed (engine_id STRING, ts TIMESTAMP, temp DOUBLE)
        CLUSTERED BY (engine_id) INTO 32 BUCKETS STORED AS ORC;
        »»»
        - **Partition column** goes in «PARTITIONED BY», not in the column list. Its value comes from the folder name «claim_month=2026-11».
        - **ORC** is Hive's columnar format (ACID tables in Hive 3 need ORC). **Parquet** is the cross-engine default.
        - Connect with **Beeline**: «beeline -u jdbc:hive2://hive-server:10000/default» (JDBC). Spark reads the same tables through the metastore.
      `),
      order('Order the steps to expose new Spark output as a Hive partitioned table.', ['Spark writes Parquet into s3a://lake/silver/claims/claim_month=2026-11/', 'CREATE EXTERNAL TABLE … PARTITIONED BY (claim_month) LOCATION …', 'MSCK REPAIR TABLE (or ALTER TABLE ADD PARTITION)', 'Query with WHERE claim_month = \'2026-11\' to get partition pruning']),
      fill('Complete: «INSERT ______ TABLE gold.claims_monthly PARTITION (claim_month) SELECT …» to replace only the partitions produced by the query.', ['OVERWRITE'], 'With dynamic partitioning in nonstrict mode only the partitions present in the result are rewritten. That makes the job idempotent per month.'),
      bug('This DDL fails. Which line?', `CREATE EXTERNAL TABLE silver.readings (
  engine_id STRING,
  temp DOUBLE,
  reading_date STRING
)
PARTITIONED BY (reading_date STRING)
STORED AS PARQUET
LOCATION 's3a://lake/silver/readings/';`, 4, 'A partition column must not also appear in the regular column list. Remove «reading_date» from the column definitions; Hive derives it from the folder name.', 'sql'),
      mcq('Spark wrote 30 new partition folders. Hive queries return nothing for them. Why?', ['Parquet is corrupt', 'The metastore doesn\'t know about the new partitions until MSCK REPAIR / ADD PARTITION', 'Hive can\'t read Parquet', 'The table is managed'], 1),
      mcq('Hive equivalent of PySpark «df.select("claim_id", F.explode("parts"))»?', ['GROUP BY parts', 'LATERAL VIEW explode(parts) p AS part', 'UNNEST JOIN', 'PIVOT'], 1),
      match('Match the Hive concept.', [['Partitioning', 'Folder per value, enables pruning'], ['Bucketing', 'Hash into a fixed number of files by key'], ['Metastore', 'Database of table definitions and locations'], ['Beeline', 'JDBC command-line client for HiveServer2']]),
    ]),
    lesson('b8', 'Lab: NoSQL key design', 25, [
      learn('Design the key from the query', `
        NoSQL stores have no joins and no flexible WHERE. Speed comes from the **key**, so you design the key from the **access pattern**.

        **HBase / Accumulo** (sorted by row key, range scans):
        - Row key «salt|engine_id|reverse_ts». A **salt** prefix (hash % N) spreads writes across regions (avoids a hot region when keys are sequential). **Reverse timestamp** («Long.MAX − ts») makes the newest reading sort first, so "latest 10 readings" is a short prefix scan.
        - Column families group columns stored together (e.g. «m:» metrics, «meta:»). Accumulo adds **cell-level visibility labels**.

        **Cassandra** («PRIMARY KEY ((partition key), clustering columns)»):
        - Partition key decides the node; clustering columns sort rows **inside** the partition.
        - «PRIMARY KEY ((engine_id, day), ts) WITH CLUSTERING ORDER BY (ts DESC)» = one bounded partition per engine per day, newest first.
        - One table **per query**; denormalise freely.

        **DynamoDB** (PK + optional SK, serverless):
        - **Single-table design**: «PK = ENGINE#E7», «SK = READING#2026-11-25T08:50» and «SK = META» in the same table; query by PK + SK prefix.
        - **GSI** (global secondary index) for a second access pattern, e.g. «GSI1PK = STATUS#CRITICAL».

        **MongoDB** (documents): embed what you read together; aggregation pipeline:
        «««javascript
        db.readings.aggregate([
          { $match: { fleet: "FD001", ts: { $gte: ISODate("2026-11-25") } } },
          { $group: { _id: "$engine_id", maxTemp: { $max: "$temp" }, n: { $sum: 1 } } },
          { $sort: { maxTemp: -1 } }, { $limit: 10 } ])
        »»»
      `),
      py({ q: 'HBase row key. Write «row_key(engine_id, ts_ms, buckets=8)» returning «"SS|engine_id|RRRRRRRRRRRRRRRRRRR"»: a 2-digit salt «zlib.crc32(engine_id) % buckets», the engine id, and the reversed timestamp «(2**63 - 1) - ts_ms» zero-padded to 19 digits, so newer readings sort first.', starter: 'import zlib\n\ndef row_key(engine_id, ts_ms, buckets=8):\n    pass\n', tests: `k1 = row_key('E7', 1000)
k2 = row_key('E7', 2000)
assert k1.split('|')[1] == 'E7' and len(k1.split('|')[2]) == 19, k1
assert k2 < k1, 'newer reading must sort first'
assert k1.split('|')[0] == k2.split('|')[0], 'same engine must have the same salt'
assert 0 <= int(k1.split('|')[0]) < 8
import zlib
assert int(row_key('E9', 5).split('|')[0]) == zlib.crc32(b'E9') % 8`, solution: `import zlib

def row_key(engine_id, ts_ms, buckets=8):
    salt = zlib.crc32(engine_id.encode()) % buckets
    rev = (2 ** 63 - 1) - ts_ms
    return f"{salt:02d}|{engine_id}|{rev:019d}"` }),
      py({ q: 'Simulate an HBase **prefix scan**: «scan(keys, prefix, limit)» takes a **sorted** list of row keys and returns up to «limit» keys that start with «prefix», in order. Use «bisect» to jump to the start (don\'t loop over everything).', starter: 'import bisect\n\ndef scan(keys, prefix, limit):\n    pass\n', tests: `keys = sorted(['03|E1|9', '03|E7|1', '03|E7|2', '03|E7|3', '05|E2|1'])
assert scan(keys, '03|E7|', 2) == ['03|E7|1', '03|E7|2']
assert scan(keys, '04|', 5) == []
assert scan(keys, '05|E2|', 10) == ['05|E2|1']`, solution: `import bisect

def scan(keys, prefix, limit):
    out = []
    i = bisect.bisect_left(keys, prefix)
    while i < len(keys) and keys[i].startswith(prefix) and len(out) < limit:
        out.append(keys[i])
        i += 1
    return out` }),
      mcq('Cassandra query: "last 24 hours of readings for one engine, newest first". Best primary key?', ['PRIMARY KEY (ts)', 'PRIMARY KEY ((engine_id, day), ts) WITH CLUSTERING ORDER BY (ts DESC)', 'PRIMARY KEY (fleet, engine_id)', 'PRIMARY KEY ((day), engine_id)'], 1, 'Partition per engine per day keeps partitions bounded; clustering by ts DESC makes "newest first" a sequential read.'),
      mcq('Why salt HBase row keys that start with a timestamp?', ['To encrypt them', 'Sequential keys send all writes to one region server (hotspot); a salt prefix spreads them', 'To compress better', 'It is required by HDFS'], 1),
      mcq('DynamoDB table with «PK = ENGINE#id», «SK = READING#ts». Now you also need "all CRITICAL engines". Best approach?', ['Scan the whole table', 'Add a GSI with partition key = status (e.g. STATUS#CRITICAL)', 'Create a second table by hand and sync it with cron', 'Use a filter expression on Query'], 1),
      order('Order this MongoDB aggregation pipeline for "top 10 engines by max temperature today".', ['$match on fleet and today\'s timestamps', '$group by engine_id with $max temperature', '$sort by maxTemp descending', '$limit 10']),
      match('Match the store to its key concept.', [['HBase', 'Sorted row key + column families'], ['Cassandra', 'Partition key + clustering columns'], ['DynamoDB', 'PK + SK, GSIs for other patterns'], ['Accumulo', 'Cell-level visibility labels']]),
    ]),
    lesson('b9', 'Lab: Scala and Java Spark to PySpark', 15, [
      learn('Translation table', `
        | Scala Spark | PySpark |
        |---|---|
        | «val df = spark.read.parquet(p)» | «df = spark.read.parquet(p)» |
        | «df.filter($"status" === "Approved")» | «df.filter(F.col("status") == "Approved")» |
        | «df.filter($"a" =!= 1)» | «df.filter(F.col("a") != 1)» |
        | «col("x").as("y")» | «F.col("x").alias("y")» |
        | «df.groupBy("d").agg(sum("amt").as("t"))» | «df.groupBy("d").agg(F.sum("amt").alias("t"))» |
        | «when($"a" > 1, "big").otherwise("small")» | «F.when(F.col("a") > 1, "big").otherwise("small")» |
        | «Window.partitionBy("e").orderBy($"ts".desc)» | «Window.partitionBy("e").orderBy(F.col("ts").desc())» |
        | «case class Claim(id: Long, amt: Double)»; «df.as[Claim]» | no typed Datasets in Python |
        | «df.map(r => r.getString(0))» | «df.rdd.map(lambda r: r[0])» (avoid) |
        | «val x = …» (immutable), «var y = …» (mutable) | normal variables |

        Java looks like Scala with more ceremony: «Dataset<Row> df = spark.read().parquet(p); df.filter(col("status").equalTo("Approved"))».
      `),
      mcq('Translate to PySpark: «df.filter($"temp" > 100 && $"fleet" === "FD001")»', ['df.filter(F.col("temp") > 100 and F.col("fleet") == "FD001")', 'df.filter((F.col("temp") > 100) & (F.col("fleet") == "FD001"))', 'df.where("temp > 100 && fleet == FD001")', 'df.filter(F.col("temp") > 100 & F.col("fleet") == "FD001")'], 1, 'Python needs «&» with parentheses. «and» fails on Columns, and without parentheses «&» binds before «>».'),
      mcq('In Scala Spark, what does «===» do?', ['Strict type comparison like JavaScript', 'Builds a Column equality expression (== would compare the Column objects themselves)', 'Assigns a value', 'Checks reference equality'], 1),
      fill('Scala «col("amt").as("total")»: what is the PySpark method name instead of «as»?', ['alias', '.alias', 'alias()'], '«as» is a reserved word in Python, hence «alias».'),
      bug('This Scala job filters nothing out. Which line?', `val claims = spark.table("silver.claims")
val approved = claims.filter($"status" == "Approved")
approved.groupBy("dealer_id").agg(sum("claim_amount").as("total")).show()`, 2, 'In Scala, «==» compares the Column object with a String (always false, and depending on version a Boolean literal or a compile error). Column equality is «===».', 'scala'),
      mcq('Why might a team keep some Spark jobs in Scala?', ['Scala DataFrame code is always 10× faster', 'Typed Datasets catch schema errors at compile time, and custom UDFs avoid Python serialisation', 'PySpark cannot read Parquet', 'Python is not allowed on clusters'], 1),
    ]),
  ]);
