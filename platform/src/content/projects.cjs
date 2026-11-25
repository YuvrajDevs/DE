// Two resume projects, built on the side. Each is a checklist the user ticks off in the app.
module.exports = [
  {
    id: 'p1', title: 'Warranty Claims Data Product', tag: 'batch · lakehouse · data quality',
    pitch: 'An end-to-end batch pipeline that turns raw warranty data into a governed, tested, documented gold data product. It mirrors this team\'s Data-as-a-Product work.',
    stack: ['Python', 'PySpark', 'Delta Lake (or Parquet)', 'SQL', 'Airflow (or Databricks Workflows)', 'Great Expectations / custom checks', 'GitHub Actions'],
    resume: 'Built an incremental, idempotent PySpark pipeline (bronze → silver → gold) for warranty claims with SCD2 customer history, MERGE upserts, automated data quality gates and lineage-documented star schema; orchestrated with Airflow and tested in CI.',
    steps: [
      'Generate realistic data: Python script producing CRF → SR → PIR → Claim → Credit Note CSV/JSON with duplicates, late arrivals and bad rows (mirror the arcade\'s warehouse)',
      'Bronze: ingest raw files with _ingested_at and _source_file, append-only, partitioned by load date',
      'Silver: typed, trimmed, deduplicated (ROW_NUMBER latest per key), quarantine table for bad rows',
      'Incremental load with a watermark table + MERGE upsert (prove idempotency by running twice)',
      'SCD Type 2 customer dimension with valid_from / valid_to / is_current',
      'Gold: fact_claims (grain: one row per claim) + dim_dealer, dim_engine, dim_date, dim_customer; plus the accumulating snapshot of the funnel',
      'Data quality: unique claim_id, FK integrity, approved ≤ claimed, freshness. Fail the run on errors',
      'Orchestrate with an Airflow DAG (extract → bronze → checks → silver → gold → publish) using the logical date',
      'Unit tests (pytest + local Spark) and GitHub Actions CI',
      'README: architecture diagram, data model, data contract (schema + SLA + owner), lineage, how to run, sample queries and screenshots',
    ],
  },
  {
    id: 'p2', title: 'Engine Telemetry Streaming Platform', tag: 'streaming · Kafka · IoT',
    pitch: 'A real-time pipeline for engine sensor data: Kafka ingestion, Spark Structured Streaming with watermarks, anomaly alerts and a lakehouse sink. It covers the posting\'s event-based, IoT and Kafka items.',
    stack: ['Python', 'Apache Kafka (Docker)', 'Spark Structured Streaming', 'Delta Lake', 'Docker Compose', 'Streamlit or a BI tool'],
    resume: 'Built a Kafka + Spark Structured Streaming platform processing simulated engine telemetry (event-time windows, watermarks, exactly-once Delta sink, idempotent anomaly alerts, dead-letter handling), containerised with Docker Compose.',
    steps: [
      'Docker Compose with Kafka (KRaft) and a Spark container',
      'Python producer simulating 100 engines: temperature, oil pressure, rpm, keyed by engine_id, with late and duplicate events',
      'Structured Streaming job: parse JSON with an explicit schema, invalid messages → dead-letter topic/table',
      'Bronze stream to Delta with checkpointing',
      'Silver: dedupe on event_id within a watermark, unit normalisation, range checks',
      'Gold: 5-minute tumbling-window aggregates per engine with a watermark',
      'Alerts: rule (e.g. temp > 105°C for 2 consecutive readings) written idempotently to an alerts table/topic',
      'Measure and document: events/sec, end-to-end latency, consumer lag',
      'Small dashboard (Streamlit) reading gold tables',
      'README: architecture, delivery semantics, failure scenarios you tested (kill the job and restart from checkpoint)',
    ],
  },
];
