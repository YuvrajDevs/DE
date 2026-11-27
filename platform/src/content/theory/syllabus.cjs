// Theory track: the full syllabus. Topics with written content live in s*.cjs files
// (exported as { topicId: topic }); build.mjs attaches them here by id.
// A topic listed here without content shows as "coming next".
const S = (id, n, title, blurb, topics) => ({ id, n, title, blurb, topics: topics.map(([tid, t]) => ({ id: tid, title: t })) });

module.exports = {
  intro: 'Concepts only, no tools yet. Each topic answers the same questions: what it is, why it exists, how it works, when you choose it, what the alternatives are, the trade-offs, and where it sits in a real company pipeline. Then you check yourself, practise on real situations and do one hands-on task. Nothing is locked: open any topic, any tab, in any order.',
  six: ['What is it?', 'Why does it exist? What problem does it solve?', 'How does it work inside?', 'When do you choose it, and when not?', 'What are the alternatives, and why pick this one?', 'Where does it sit in a real company pipeline?'],
  sections: [
    S('foundations', 1, 'Data engineering foundations', 'The mental model everything else hangs on: what the job is, what kinds of data exist, how data moves from the systems that run a business to the people who analyse it.', [
      ['whatde', 'What is data engineering?'],
      ['roles', 'Data engineer vs data analyst vs data scientist'],
      ['lifecycle', 'The data lifecycle'],
      ['datatypes', 'Structured, semi-structured and unstructured data'],
      ['oltpolap', 'OLTP vs OLAP'],
      ['storage', 'Database vs warehouse vs lake vs lakehouse'],
      ['pipelines', 'Data pipelines and their architecture'],
      ['etlelt', 'ETL vs ELT'],
      ['batchstream', 'Batch vs stream processing'],
      ['realtime', 'Real-time vs near-real-time'],
      ['ingestion', 'Data ingestion and data integration'],
      ['srcdst', 'Source systems vs destination systems'],
      ['consumers', 'Data consumers and downstream systems'],
    ]),
    S('databases', 2, 'Database concepts', 'How databases store, protect and find data, and why the design choices matter at scale.', [
      ['relational', 'Relational databases'], ['nosql', 'NoSQL databases'], ['sqlvsnosql', 'SQL vs NoSQL'],
      ['rowcol', 'Row-oriented vs column-oriented storage'], ['keys', 'Primary keys, foreign keys and unique constraints'],
      ['indexing', 'Indexing and why it matters'], ['normal', 'Normalisation vs denormalisation'],
      ['transactions', 'Transactions and ACID'], ['replication', 'Replication'], ['dbpartition', 'Partitioning'],
      ['scaling', 'Horizontal vs vertical scaling'], ['schema', 'Schema and schema evolution'],
      ['fileformats', 'File formats: CSV, JSON, Avro, Parquet, ORC'], ['compression', 'Compression and encoding'],
    ]),
    S('modelling', 3, 'Data modelling', 'How to shape data so it is correct, easy to query and stays correct as the business changes.', [
      ['whatmodel', 'What is data modelling?'], ['cll', 'Conceptual, logical and physical models'], ['erd', 'Entity relationship diagrams'],
      ['facts', 'Fact tables'], ['dims', 'Dimension tables'], ['star', 'Star schema vs snowflake schema'],
      ['scd', 'Slowly changing dimensions'], ['oltpmodel', 'OLTP models vs analytical models'], ['grain', 'Grain'], ['surrogate', 'Surrogate keys vs natural keys'],
    ]),
    S('pipelineeng', 4, 'Pipeline engineering', 'What makes a pipeline trustworthy: correct when re-run, honest when it fails, and visible when something drifts.', [
      ['fullincr', 'Full load vs incremental load'], ['cdc', 'Change data capture'], ['idempotency', 'Idempotency'], ['dedupe', 'Deduplication'],
      ['recon', 'Reconciliation'], ['schemaval', 'Schema validation'], ['contracts', 'Data contracts'], ['dqdims', 'Data quality dimensions'],
      ['errors', 'Error handling'], ['retries', 'Retries'], ['dlq', 'Dead-letter queues'], ['deps', 'Pipeline dependencies'],
      ['orch', 'Orchestration'], ['airflow', 'Airflow in depth'], ['dbt', 'dbt and transformation in the warehouse'], ['backfill', 'Backfills and reprocessing'], ['late', 'Late-arriving and out-of-order data'], ['observ', 'Observability'], ['lineage', 'Lineage'], ['sla', 'Data SLAs'], ['reliab', 'Reliability and fault tolerance'],
    ]),
    S('distributed', 5, 'Distributed systems and big data', 'Why one computer is not enough, and the new problems you get when you use many.', [
      ['bigdata', 'What is big data? The 5 Vs'], ['distcomp', 'Distributed computing'], ['diststore', 'Distributed storage'], ['cluster', 'Cluster architecture: nodes, drivers, workers'],
      ['parallel', 'Parallel processing and partitioning'], ['shuffle', 'Shuffling'], ['skew', 'Data skew'], ['faulttol', 'Fault tolerance and replication'],
      ['tputlat', 'Throughput vs latency'], ['eventual', 'Eventual consistency'], ['cap', 'CAP theorem'], ['semantics', 'At-most-once, at-least-once, exactly-once'],
      ['sizing', 'Back-of-envelope sizing'], ['sysdesign', 'Designing a data pipeline end to end'],
    ]),
    S('kafka', 6, 'Apache Kafka (concepts)', 'The log that sits in the middle of event-driven companies.', [
      ['kafkawhat', 'What Kafka is and event-driven architecture'], ['brokers', 'Brokers, topics and partitions'], ['prodcons', 'Producers, consumers and consumer groups'],
      ['offsets', 'Offsets'], ['kreplication', 'Replication, leaders and followers'], ['retention', 'Retention and compaction'], ['ordering', 'Ordering guarantees'],
      ['kvsmq', 'Kafka vs traditional message queues'], ['ksemantics', 'Kafka delivery semantics'],
    ]),
    S('spark', 7, 'Apache Spark (concepts)', 'How one program runs over hundreds of machines, and why some code is fast and some is slow.', [
      ['sparkwhat', 'What Spark is and why'], ['sparkarch', 'Driver and executors'], ['rdddf', 'RDDs vs DataFrames'], ['lazy', 'Transformations, actions and lazy evaluation'],
      ['dag', 'DAG execution, jobs, stages, tasks'], ['narrowwide', 'Narrow vs wide transformations'], ['cache', 'Caching and persistence'],
      ['sparkft', 'Fault tolerance in Spark'], ['sparksql', 'Spark SQL and the optimiser'], ['sss', 'Structured Streaming'],
    ]),
    S('hadoop', 8, 'Hadoop, NoSQL and the JVM', 'The first big-data platform and the NoSQL stores in the posting. Mostly replaced or specialised, still asked, and their ideas live on everywhere.', [
      ['hadoopwhat', 'What Hadoop is'], ['hdfs', 'HDFS: NameNode, DataNodes, blocks, replication'], ['mapreduce', 'MapReduce: mapper, shuffle, reducer'],
      ['hive', 'Hive and the metastore'], ['hivepart', 'Hive partitions and buckets'], ['hbase', 'HBase and Accumulo'], ['hadoopspark', 'Hadoop vs Spark'],
      ['cassandra', 'Cassandra'], ['dynamodb', 'DynamoDB'], ['mongodb', 'MongoDB'], ['scalajava', 'Scala and Java for data engineers'],
    ]),
    S('cloud', 9, 'Cloud and storage architecture', 'Renting computers and storage by the minute, and what that changes about how data platforms are built.', [
      ['cloudwhat', 'What cloud computing is'], ['iaas', 'IaaS vs PaaS vs SaaS'], ['cloudtypes', 'Public, private and hybrid cloud'], ['objstore', 'Object storage'],
      ['lakearch', 'Data lake architecture'], ['tableformats', 'Open table formats: Delta, Iceberg, Hudi'], ['filemove', 'Moving large files to the cloud'], ['clouddw', 'Cloud data warehouses'], ['clusters', 'Cloud clusters, scalability and elasticity'],
      ['cloudsec', 'Cloud security fundamentals'], ['clouds', 'Azure vs AWS vs GCP'], ['azure', 'The Azure data stack and Databricks'], ['cost', 'Cloud cost'],
    ]),
    S('governance', 10, 'Governance and data products', 'Making data findable, trusted, safe and reusable across a whole company.', [
      ['govwhat', 'What data governance is'], ['metadata', 'Metadata: technical vs business'], ['catalog', 'Data catalogues and discoverability'],
      ['ownership', 'Ownership and stewardship'], ['access', 'Access control'], ['retentionpol', 'Retention and privacy'], ['dqframe', 'Data quality frameworks'],
      ['dataproduct', 'Data as a product and certified datasets'], ['semantic', 'Semantic models and self-service'], ['aiready', 'AI-ready datasets'],
    ]),
    S('aiiot', 11, 'AI, ML and IoT', 'What the data team must deliver so machine learning, GenAI and connected machines actually work.', [
      ['ml', 'Machine learning: supervised, unsupervised, training, inference'], ['features', 'Features, labels and feature engineering'],
      ['genai', 'GenAI basics'], ['rag', 'RAG, embeddings and vector databases'], ['iot', 'IoT, telemetry and time-series data'],
      ['predmaint', 'Predictive maintenance'], ['iotingest', 'Real-time IoT ingestion'],
    ]),
    S('swe', 12, 'Software engineering and delivery', 'How data work is planned, built, tested, shipped and supported in a team.', [
      ['sdlc', 'SDLC'], ['agile', 'Agile, Scrum and Kanban'], ['devops', 'DevOps and CI/CD'], ['git', 'Version control'],
      ['testing', 'Unit, integration and regression testing'], ['rca', 'Root cause analysis'], ['monitoring', 'Monitoring and alerting'],
      ['requirements', 'Requirements engineering: acceptance criteria, traceability, change impact'], ['docs', 'Solution documentation and validation testing'], ['qametrics', 'Quality assurance metrics and KPIs'],
    ]),
  ],
};
