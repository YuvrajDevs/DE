const { learn, mcq, tf, multi, match, order, viz, world, lesson, talk } = require('./_h.cjs');

module.exports = world('orient', 'Orientation', 'start here',
  'What a data engineer does all day, how the Cummins DE1 role is shaped, and how your Salesforce CRM Analytics work already maps onto data engineering.',
  [
    lesson('o1', 'What a data engineer actually does', 12, [
      learn('The job in one picture', `
        A data engineer builds and runs the **systems that move data** from where it is created to where it is used, and makes sure it arrives **correct, on time, documented and secure**.

        «««flow
        Sources -> Ingest -> Store (raw) -> Transform -> Serve (data products) -> Consumers
        »»»

        | Stage | Typical work | Tools you will meet |
        |---|---|---|
        | Sources | Salesforce, ERP, sensors, APIs, files | SOQL, REST, CDC |
        | Ingest | batch pulls, event streams | Python, Kafka, ADF/Glue |
        | Store | data lake, warehouse | S3/ADLS, Parquet, Delta |
        | Transform | clean, join, model, aggregate | SQL, PySpark, dbt |
        | Serve | curated tables, marts, APIs | Snowflake/Databricks, BI |
        | Run it | schedule, monitor, fix, govern | Airflow, alerts, catalog |

        Analysts ask *"what does the data say?"*. Data engineers ask *"how does trustworthy data get here every day, at scale, without a human?"*
      `),
      learn('Your Salesforce work is already data engineering', `
        You don't start from zero. Here is how your Dealermatix work maps to DE vocabulary:

        | What you do in CRM Analytics | The data engineering name |
        |---|---|
        | Data Prep recipe joining Salesforce objects | **ETL transformation / join** |
        | Dedup records in a recipe | **Deduplication, data quality** |
        | Calculated fields: ageing buckets, stages | **Derived columns, business logic layer** |
        | SOQL to cross-check dashboard numbers | **Reconciliation / validation testing** |
        | CRF → SR → PIR → Claim → Credit Note tracking | **Process / funnel modelling, accumulating snapshot fact** |
        | Fixing widget performance | **Query optimisation** |
        | Weekly updates, sign-offs | **Stakeholder management, Agile delivery** |

        What changes in DE1: you write it in **SQL, Python and PySpark** on open platforms, for many consumers, with **automation, tests and monitoring** instead of manual checks.
      `),
      match('Match your current task to its data engineering name.', [
        ['Data Prep recipe joining Account and Case', 'ETL transformation'],
        ['SOQL query to verify a KPI card', 'Reconciliation test'],
        ['Ageing bucket calculated field', 'Derived column'],
        ['Tracking CRF → Credit Note conversion', 'Funnel / process model'],
      ], 'In interviews, describe your work with the right-hand vocabulary. It is the same work, framed for a DE audience.'),
      learn('Decoding the Cummins DE1 posting', `
        The posting has two halves. The **generic** half is the same for every Cummins DE role. The **team-specific** half tells you what this team actually builds.

        **Team-specific (prioritise this):**
        - Enterprise **data products** for Supply Chain, Quality, Finance, Product Lifecycle
        - **Data-as-a-Product**: reusable, discoverable, governed datasets with **metadata, lineage and quality controls**
        - **AI-ready / GenAI-ready** datasets for data scientists
        - Required: ETL/ELT, data modelling, SQL, data quality, metadata, governance, Agile, translating business requirements

        **Generic (know it, be able to discuss it):**
        - Distributed ingestion from relational, event-based and unstructured sources
        - Spark, Scala/Java, MapReduce, Hive, HBase, Kafka; cloud; large file movement; IoT

        > Interviewers for a DE1 will mostly test **SQL**, **Python/PySpark basics**, **modelling**, **pipeline concepts** and how you **think about data quality**. This arcade weights its 21-day plan the same way.
      `),
      multi('Which of these appear in the **team-specific** part of the Cummins DE1 posting?', [
        'Data-as-a-Product principles', 'Metadata, lineage and quality controls', 'AI-ready datasets for GenAI use cases', 'Mandatory Scala certification', 'Five years of Kafka administration',
      ], [0, 1, 2], 'The team builds governed enterprise data products, including GenAI-ready data. Scala and Kafka appear only as "knowledge preferred" in the generic part.'),
      mcq('An interviewer asks: *"What is the difference between a data analyst and a data engineer?"* Best answer?', [
        'Analysts use SQL, engineers use Python',
        'Analysts answer business questions with data; engineers build and operate the reliable, scalable systems that deliver that data',
        'Engineers make dashboards, analysts build pipelines',
        'There is no difference at entry level',
      ], 1, 'Both use SQL and Python. The difference is the product: insights vs. trustworthy, automated data infrastructure.'),
      tf('A data engineer\'s job is finished once a pipeline runs successfully for the first time.', false, 'Pipelines must run every day: monitoring, alerting, handling schema changes, late data, backfills and failures is a large part of the job ("day 2 operations").'),
      talk('In 60 seconds: describe your current role in data engineering terms.', `
        A strong answer, in your own words:

        - *"I'm an analytics engineer at Dealermatix, a partner working on Cummins' Salesforce CRM Analytics."*
        - *"I build the **data preparation pipelines**: recipes that join Salesforce objects such as service orders, claims and contracts, deduplicate records and derive business fields like ageing buckets and process stages."*
        - *"I model the **end-to-end warranty process** (CRF → SR → PIR → Claim → Credit Note) into KPIs the business signs off on."*
        - *"I **validate** every number against source with SOQL and fix logic and performance issues."*
        - *"I want to move from building on one platform to building **platform-independent pipelines** in SQL, Python and Spark, and that's why DE1 is the natural next step."*

        Keep it under a minute, use numbers where you can (dashboards shipped, objects joined, issues fixed).
      `, 'hr'),
    ]),
    lesson('o2', 'The data systems map', 15, [
      learn('OLTP vs OLAP', `
        **OLTP** (online transaction processing) systems *run the business*: Salesforce, SAP, a dealer portal. Many small reads/writes, row at a time, normalized tables, must be fast and consistent.

        **OLAP** (online analytical processing) systems *analyse the business*: warehouses and lakehouses. Few huge reads scanning millions of rows, columnar storage, denormalized models.

        | | OLTP | OLAP |
        |---|---|---|
        | Query | «UPDATE case SET status=…» | «SUM(amount) GROUP BY region, month» |
        | Rows touched | a few | millions |
        | Storage | row-oriented | column-oriented (Parquet, warehouse) |
        | Model | normalized (3NF) | dimensional (star) |
        | Users | apps, operators | analysts, BI, ML |

        You **never** run heavy analytics on the OLTP system: you copy data out (ingest) so analytics can't slow down operations.
      `),
      learn('Batch vs streaming', `
        **Batch**: process a bounded chunk on a schedule ("every night load yesterday's claims"). Simple, cheap, minutes-to-hours latency.

        **Streaming**: process an unbounded flow continuously ("alert when an engine overheats"). Seconds latency, more moving parts (state, late data, exactly-once).

        Rule of thumb: **use batch unless the business value depends on low latency.** Many "real-time" requests are satisfied by a 15-minute micro-batch.
      `),
      learn('Warehouse, lake, lakehouse', `
        - **Data warehouse** (Snowflake, Redshift, Synapse, BigQuery): structured tables, SQL, strong governance, managed storage.
        - **Data lake** (S3, ADLS, HDFS): cheap object storage holding files of any type (CSV, JSON, Parquet, images). Flexible, but without discipline it becomes a "data swamp".
        - **Lakehouse** (Databricks/Delta Lake, Iceberg): open table formats on the lake add **ACID transactions, schema enforcement and time travel**, so the lake behaves like a warehouse.

        Most modern enterprises, Cummins included, run a mix: lake/lakehouse for raw and large data, warehouse-style serving for curated data products.
      `),
      match('Match the system to its job.', [
        ['Salesforce Service Cloud', 'OLTP: runs operations'],
        ['Snowflake / Synapse', 'Warehouse: curated SQL analytics'],
        ['S3 / ADLS full of Parquet files', 'Data lake: cheap raw storage'],
        ['Delta Lake / Iceberg tables', 'Lakehouse: ACID tables on the lake'],
      ]),
      mcq('The service team wants a dashboard of yesterday\'s claim approvals, refreshed every morning. Best processing style?', ['Kafka streaming with exactly-once', 'Nightly batch', 'Run the query directly on Salesforce every time someone opens the dashboard', 'Manual CSV export'], 1, 'Daily freshness → batch. Streaming adds cost and complexity with no business benefit here.'),
      mcq('Why do analytics queries prefer **columnar** storage?', ['Columns compress better and a query reads only the columns it needs', 'It is easier to update a single row', 'It is required for foreign keys', 'It stores data as JSON'], 0, '«SUM(claim_amount)» on a 50-column table reads 1 column instead of 50, and similar values in a column compress very well.'),
      order('Order the stages a claim record passes through on its way to a dashboard.', ['Created in Salesforce (OLTP)', 'Ingested into the raw zone of the lake', 'Cleaned, typed and deduplicated', 'Modelled into a fact table with dimensions', 'Queried by the BI dashboard']),
      tf('ELT means transforming data inside the warehouse/lakehouse after loading it raw.', true, 'Extract → Load raw → Transform with the warehouse\'s compute (often with dbt). ETL transforms before loading. Cheap cloud compute made ELT the default.'),
      viz('medallion', 'One record\'s journey', 'Step through bronze, silver and gold, the layering pattern you will see everywhere (Databricks calls it "medallion architecture").', {}, 'Each layer has a contract: bronze = complete and replayable, silver = clean and conformed, gold = business-ready.'),
    ]),
  ]);
