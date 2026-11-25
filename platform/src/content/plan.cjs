// 21-day plan, 2-3 hours/day. Lessons first (~60-90 min), then review, then a project block.
const L = id => ({ lesson: id });
const review = { title: 'Spaced review', href: '#review', note: 'Clear everything due (10-15 min)' };
const speed = { title: 'Lightning round', href: '#speed', note: '90 seconds, beat your best' };
const proj = (n, note) => ({ title: `Project block: ${n}`, href: '#projects', note });
const mock = (k, t) => ({ title: t, href: `#interview-${k}`, note: 'Timed, no hints' });

module.exports = [
  { day: 1, title: 'Orientation + SQL basics', focus: 'Map your Salesforce work to DE vocabulary, then get fluent with SELECT, WHERE and NULLs.', items: [L('o1'), L('o2'), L('s1'), L('s2'), proj('set up', 'Create the GitHub repo + README skeleton for Project 1')] },
  { day: 2, title: 'Aggregates and joins', focus: 'GROUP BY, HAVING, every join type, anti joins and fan-out bugs.', items: [L('s3'), L('s4'), L('s5'), review] },
  { day: 3, title: 'Dates, CTEs, ranking windows', focus: 'Readable multi-step SQL and the top-N-per-group pattern.', items: [L('s6'), L('a1'), L('a2'), review, speed] },
  { day: 4, title: 'Windows II and classic patterns', focus: 'Running totals, LAG/LEAD, dedup, gaps & islands, funnels, pivots.', items: [L('a3'), L('a4'), review, proj('ingest', 'Project 1: write the Python ingestion script (API/CSV → bronze)')] },
  { day: 5, title: 'Recursion, MERGE, performance', focus: 'Hierarchies, UPSERT/MERGE for incremental loads, and why queries get slow.', items: [L('a5'), L('a6'), L('a7'), review] },
  { day: 6, title: 'Python core', focus: 'Collections, grouping, parsing JSON/CSV, handling bad records.', items: [L('p1'), L('p2'), L('p3'), review, speed] },
  { day: 7, title: 'Python for pipelines', focus: 'Generators, API pagination/retries, production-grade code, pandas. Then your first mock.', items: [L('p4'), L('p5'), L('p6'), L('p7'), mock('technical', 'Mock: technical screen')] },
  { day: 8, title: 'Data modelling I', focus: 'Normalization, star schemas, grain, fact types.', items: [L('m1'), L('m2'), L('m3'), review, proj('model', 'Project 1: design the star schema + write it in the README')] },
  { day: 9, title: 'SCD, lakehouse, ETL vs ELT', focus: 'History tracking and the medallion layers.', items: [L('m4'), L('m5'), L('e1'), review] },
  { day: 10, title: 'Incremental, idempotent, orchestrated', focus: 'Watermarks, CDC, backfills, late data, Airflow DAGs.', items: [L('e2'), L('e3'), L('e4'), review, speed] },
  { day: 11, title: 'dbt, formats, data quality', focus: 'Parquet/partitioning, dbt models + tests, quality dimensions.', items: [L('e5'), L('e6'), L('q1'), review, proj('silver/gold', 'Project 1: PySpark silver + gold with MERGE and partitions')] },
  { day: 12, title: 'Governance and data products', focus: 'The team-specific core: contracts, observability, metadata, lineage, access, Data-as-a-Product.', items: [L('q2'), L('q3'), L('q4'), L('q5'), review] },
  { day: 13, title: 'Spark foundations', focus: 'Architecture, lazy evaluation, stages, the DataFrame API.', items: [L('k1'), L('k2'), L('k3'), review, proj('quality', 'Project 1: add data quality checks + Airflow DAG')] },
  { day: 14, title: 'PySpark aggregations, joins, windows', focus: 'The PySpark you will be asked to write. Finish with a mock.', items: [L('k4'), L('k5'), review, mock('technical', 'Mock: technical screen #2')] },
  { day: 15, title: 'Spark performance', focus: 'Partitions, shuffles, broadcast, skew, caching, AQE, writes.', items: [L('k6'), L('k7'), L('k8'), review, proj('ship P1', 'Project 1: finish README, architecture diagram, screenshots → push')] },
  { day: 16, title: 'Big data ecosystem', focus: 'Hadoop, Hive, NoSQL stores, CAP, Delta/Iceberg, reading Scala.', items: [L('b1'), L('b2'), L('b3'), L('b4'), L('b5'), speed] },
  { day: 17, title: 'Streaming and IoT', focus: 'Kafka, delivery semantics, Structured Streaming, watermarks, telemetry design.', items: [L('r1'), L('r2'), L('r3'), L('r4'), review, proj('stream', 'Project 2: Kafka producer + Structured Streaming job')] },
  { day: 18, title: 'Cloud, DevOps, Agile', focus: 'Service mapping, large file movement, CI/CD, Docker, IaC, Scrum.', items: [L('c1'), L('c2'), L('c3'), L('c4'), review] },
  { day: 19, title: 'System design and incidents', focus: 'The design framework, four drills, four incidents.', items: [L('d1'), L('d2'), L('d3'), mock('design', 'Mock: design + scenarios'), proj('stream', 'Project 2: anomaly rules, watermark, Delta sink, README')] },
  { day: 20, title: 'Scale, AI-ready data, your story', focus: 'Trade-offs, GenAI data products, and telling your story well.', items: [L('d4'), L('i1'), L('i2'), L('v1'), review] },
  { day: 21, title: 'Interview day rehearsal', focus: 'Competency stories, rapid-fire revision, then the full loop.', items: [L('v2'), L('v3'), mock('full', 'Mock: full loop'), mock('hr', 'Mock: behavioural')] },
];
