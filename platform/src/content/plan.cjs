// 21-day plan, 2-3 hours/day: lessons first, then a practice session, then review or a project block.
const L = id => ({ lesson: id });
const review = { title: 'Spaced review', href: '#review', note: 'Clear everything due (10-15 min)' };
const speed = { title: 'Lightning round', href: '#speed', note: '90 seconds, beat your best' };
const gym = (k, t) => ({ title: t, href: `#practice-${k}`, note: 'One practice set (15-20 min)' });
const proj = (n, note) => ({ title: `Project block: ${n}`, href: '#projects', note });
const mock = (k, t) => ({ title: t, href: `#interview-${k}`, note: 'Timed, no hints' });

module.exports = [
  { day: 1, title: 'Orientation + toolbox basics', focus: 'What DEs do, how your Salesforce work maps to it, computers/networks/APIs from zero and the terminal.', items: [L('o1'), L('o2'), L('t1'), L('t2'), L('t6')] },
  { day: 2, title: 'How it all connects + SQL basics', focus: 'Project setup, Git, logins and connections, the end-to-end platform map, then SELECT and NULLs.', items: [L('t3'), L('t4'), L('t5'), L('t7'), L('s1'), L('s2')] },
  { day: 3, title: 'Aggregates and joins', focus: 'GROUP BY, HAVING, every join type, fan-out bugs, query order.', items: [L('s3'), L('s4'), L('s5'), gym('sql', 'Query Gym set'), review] },
  { day: 4, title: 'Dates, CTEs, ranking windows', focus: 'Readable multi-step SQL and top-N per group.', items: [L('s6'), L('a1'), L('a2'), gym('sql', 'Query Gym set'), proj('set up', 'Create the Project 1 repo, venv and README skeleton')] },
  { day: 5, title: 'Windows II and classic patterns', focus: 'Running totals, LAG/LEAD, dedup, gaps & islands, funnels, pivots.', items: [L('a3'), L('a4'), gym('sql', 'Query Gym set'), review, speed] },
  { day: 6, title: 'Recursion, MERGE, performance + Python core', focus: 'UPSERT/MERGE, why queries are slow, then Python collections and grouping.', items: [L('a5'), L('a6'), L('a7'), L('p1'), L('p2'), review] },
  { day: 7, title: 'Python for pipelines', focus: 'Parsing, generators, APIs with retries, production code, pandas. Then a mock.', items: [L('p3'), L('p4'), L('p5'), L('p6'), L('p7'), gym('python', 'Python Gym set'), mock('technical', 'Mock: technical screen')] },
  { day: 8, title: 'Data modelling', focus: 'Normalization, star schema, grain, fact types, SCD2.', items: [L('m1'), L('m2'), L('m3'), L('m4'), gym('concepts-model', 'Modelling drills'), proj('ingest', 'Project 1: Python ingestion → bronze')] },
  { day: 9, title: 'Lakehouse + ETL/ELT + incremental', focus: 'Medallion layers, ETL vs ELT, watermarks, CDC, idempotency.', items: [L('m5'), L('e1'), L('e2'), L('e3'), review, speed] },
  { day: 10, title: 'Orchestration, dbt, formats, monitoring', focus: 'Airflow DAGs, dbt, Parquet and partitioning, alerts and troubleshooting.', items: [L('e4'), L('e5'), L('e6'), L('e7'), gym('bugs', 'Bug Hunt set'), proj('model', 'Project 1: star schema design in the README')] },
  { day: 11, title: 'Data quality and governance', focus: 'The team-specific core: quality dimensions, contracts, observability, metadata, lineage, access, retention.', items: [L('q1'), L('q2'), L('q3'), L('q4'), gym('scenarios', 'Scenario Room set'), review] },
  { day: 12, title: 'Data products and analytical solutions', focus: 'Data-as-a-Product, certification, semantic models, BI. Then Spark begins.', items: [L('q5'), L('q6'), L('k1'), L('k2'), gym('concepts-quality', 'Governance drills'), proj('silver/gold', 'Project 1: PySpark silver + gold with MERGE')] },
  { day: 13, title: 'PySpark hands-on', focus: 'The DataFrame API, aggregations, joins and windows: the code you will be asked to write.', items: [L('k3'), L('k4'), L('k5'), gym('pyspark', 'PySpark Gym set'), review] },
  { day: 14, title: 'Spark performance + mock', focus: 'Partitions, shuffles, broadcast, skew, caching, AQE, writes.', items: [L('k6'), L('k7'), L('k8'), gym('pyspark', 'PySpark Gym set'), mock('technical', 'Mock: technical screen #2')] },
  { day: 15, title: 'Big data I: Hadoop, MapReduce, Hive', focus: 'HDFS/YARN hands-on, write MapReduce jobs, Hive DDL and partitions.', items: [L('b1'), L('b10'), L('b6'), L('b2'), L('b7'), gym('concepts-bigdata', 'Big data drills')] },
  { day: 16, title: 'Big data II + streaming', focus: 'NoSQL key design (HBase/Cassandra/DynamoDB/MongoDB/Accumulo), Delta/Iceberg, Scala→PySpark, then Kafka and Structured Streaming.', items: [L('b3'), L('b8'), L('b4'), L('b5'), L('b9'), L('r1'), L('r2'), L('r3'), L('r4'), L('r5'), L('t8')] },
  { day: 17, title: 'Scale Lab I', focus: 'Sizing numbers, 100M requests/day, 1B events/day.', items: [L('x1'), L('x2'), L('x3'), gym('scale', 'Scale Lab set'), L('j1'), L('j2')] },
  { day: 18, title: 'Scale Lab II + cloud', focus: 'Huge joins, dedup, backfills, serving, reliability; cloud services and moving large files.', items: [L('x4'), L('x5'), L('x6'), L('c1'), L('c2'), L('j3'), L('j4')] },
  { day: 19, title: 'DevOps, Agile and design', focus: 'CI/CD, deployment automation, Scrum; the design framework and drills.', items: [L('c3'), L('c4'), L('c5'), L('d1'), L('d2'), mock('design', 'Mock: design + scenarios'), L('j5'), L('j6'), L('j7')] },
  { day: 20, title: 'Incidents, AI-ready data, your story', focus: 'Incident room, cost trade-offs, GenAI data products, telling your story.', items: [L('d3'), L('d4'), L('i1'), L('i2'), L('v1'), L('j8'), L('j9')] },
  { day: 21, title: 'Interview day rehearsal', focus: 'Competency stories, rapid-fire revision, weak spots, then the full loop.', items: [L('v2'), L('v3'), L('j10'), L('j11'), L('j12'), mock('full', 'Mock: full loop'), mock('hr', 'Mock: behavioural')] },
];
