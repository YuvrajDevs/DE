const { learn, mcq, tf, multi, match, order, viz, world, lesson, talk } = require('./_h.cjs');

module.exports = world('orient', 'Start here', 'start here',
  'What a data engineer does, in plain words. How the job you are applying for is shaped. How the Salesforce work you already do is data engineering too.',
  [
    lesson('o1', 'What a data engineer actually does', 12, [
      learn('The job in one sentence', `
        A data engineer **moves data from where it is created to where people use it**, and makes sure it arrives **correct, on time, and safe**.

        Think of a water company:
        - Water comes from rivers and wells (**sources**: apps like Salesforce, machines, files).
        - Pipes carry it to a treatment plant (**ingestion**: copying the data out).
        - The plant cleans it (**transformation**: fixing, joining, tidying the data).
        - Clean water reaches homes (**serving**: dashboards, reports, AI tools).
        - Sensors watch for leaks (**monitoring**: alerts when something breaks).

        «««flow
        Where data is created -> Copy it out -> Store it -> Clean and combine it -> Give it to people -> Watch it every day
        »»»

        A **data analyst** asks: *"What does the data say?"*
        A **data engineer** asks: *"How does good data get here every day, by itself, without anyone doing it by hand?"*
      `),
      learn('You already do some of this', `
        Your work at Dealermatix uses different names for the same ideas:

        | What you do now | What data engineers call it |
        |---|---|
        | A Data Prep recipe that joins Salesforce objects | a **transformation** (combining data) |
        | Removing duplicate records | **data cleaning** / **data quality** |
        | Calculated fields like ageing buckets | **derived columns** (new columns worked out from others) |
        | Checking dashboard numbers with SOQL | **reconciliation** (proving two numbers match) |
        | Tracking CRF → SR → PIR → Claim → Credit Note | a **process model** (following one thing through its steps) |
        | Making a slow dashboard faster | **performance tuning** |

        The new part for you: doing this with **SQL, Python and PySpark** on open tools, so it runs **automatically**, **is tested**, and **is watched** for problems.
      `),
      match('Match what you do today with its data engineering name.', [
        ['Recipe joining Account and Case', 'Transformation'],
        ['SOQL query to double-check a KPI', 'Reconciliation'],
        ['Ageing bucket calculated field', 'Derived column'],
        ['Following a CRF until its credit note', 'Process model'],
      ], 'In interviews, use the names on the right. It is the same work, described the way data engineers describe it.'),
      learn('What the Cummins job asks for', `
        The job post has two parts.

        **Part 1, written for this team (most important):**
        - Build **data products**: well-organised, trusted datasets that many people can use, for Supply Chain, Quality, Finance and Product Lifecycle.
        - Make them easy to **find**, **understand** and **trust** (with descriptions, owners and quality checks).
        - Make data ready for **AI** tools.
        - Must-have skills: moving and cleaning data (ETL/ELT), SQL, designing tables, data quality, working with business people.

        **Part 2, the same on every Cummins data job:**
        - "Nice to know" tools: Spark, Kafka, Hadoop, Hive, cloud, IoT (sensor data).

        > In a junior interview you will mostly be asked about **SQL**, **Python and PySpark basics**, **designing tables**, **how data moves**, and **how you keep data correct**. The 21-day plan follows the same order.
      `),
      multi('Which of these are in the part of the job post written for this team?', [
        'Building reusable data products', 'Descriptions, owners and quality checks for data', 'Preparing data for AI tools', 'A Scala certificate', 'Five years of Kafka experience',
      ], [0, 1, 2], 'The team builds trusted data products, including data ready for AI. Scala and Kafka are only "nice to know".'),
      mcq('An interviewer asks: *"What is the difference between a data analyst and a data engineer?"* Best answer?', [
        'Analysts use SQL, engineers use Python',
        'Analysts use data to answer business questions; engineers build the systems that deliver good data automatically',
        'Engineers make dashboards, analysts build pipelines',
        'There is no difference for junior roles',
      ], 1, 'Both use SQL and Python. The difference is what they produce: answers vs. reliable data systems.'),
      tf('A data engineer\'s job is done once a pipeline (a data-moving job) works the first time.', false, 'It has to keep working every day. Fixing failures, late data and changes is a big part of the job.'),
      talk('In 60 seconds: describe your current job using data engineering words.', `
        A good answer, in your own words:

        - *"I'm an analytics engineer at Dealermatix, working on Cummins' Salesforce reporting."*
        - *"I build the steps that **combine and clean** Salesforce data: joining objects like service orders and claims, removing duplicates, and adding fields like ageing buckets."*
        - *"I turn the **whole warranty process**, from customer request to credit note, into numbers the business signs off on."*
        - *"I **check every number** against Salesforce with SOQL and fix mistakes."*
        - *"Next I want to build this kind of thing with SQL, Python and Spark, on any platform. That's why this role fits."*

        Keep it under a minute. Add real numbers if you can (dashboards built, problems fixed).
      `, 'hr'),
    ]),
    lesson('o2', 'The main kinds of data systems', 15, [
      learn('Systems that run the business vs systems that study it', `
        There are two kinds of databases:

        **1. Systems that run the business.** Salesforce, SAP, a dealer website. Every second, many tiny changes happen: *"update this one case"*. They must be fast for one record at a time.
        Data people call these **OLTP** systems (Online *Transaction* Processing).

        **2. Systems that study the business.** A data warehouse. Few questions, but each one reads millions of rows: *"total claim amount per region per month"*.
        Data people call these **OLAP** systems (Online *Analytical* Processing).

        | | Runs the business (OLTP) | Studies the business (OLAP) |
        |---|---|---|
        | Typical question | change one case | add up millions of claims |
        | Rows touched | a few | millions |
        | Who uses it | apps and staff | analysts, dashboards, AI |

        **Why it matters:** you never run heavy reports on Salesforce itself, because it would slow down the people using it. You **copy the data out** first, into a system built for studying it.
      `),
      learn('All at once, or bit by bit as it happens', `
        **Batch** = collect data, then process it all together on a schedule. *"Every night at 2 am, load yesterday's claims."* Simple and cheap. Data is a few hours old.

        **Streaming** = process each piece of data the moment it arrives. *"Warn me within seconds if an engine overheats."* More complex. Data is seconds old.

        Rule of thumb: **use batch unless being seconds-fresh really matters.** Most reports are fine with batch.
      `),
      learn('Where data is kept', `
        - **Data warehouse** (examples: Snowflake, Synapse, BigQuery): neat tables you query with SQL. Tidy and easy to trust.
        - **Data lake** (examples: Azure Data Lake, Amazon S3): cheap online storage that holds **files** of any kind (CSV, JSON, images…). Flexible, but it gets messy without rules.
        - **Lakehouse** (examples: Databricks with Delta Lake): a data lake **plus** a layer that makes its files behave like reliable tables.

        Big companies like Cummins usually use a mix of these.
      `),
      match('Match each system to its job.', [
        ['Salesforce Service Cloud', 'Runs the business (OLTP)'],
        ['Snowflake / Synapse', 'Warehouse: neat tables for SQL reports'],
        ['Azure Data Lake full of files', 'Data lake: cheap storage for any files'],
        ['Databricks with Delta Lake', 'Lakehouse: files that behave like reliable tables'],
      ]),
      mcq('The service team wants yesterday\'s approved claims on a dashboard every morning. Which style fits?', ['Streaming, updated every second', 'Batch, once every night', 'Run the report directly on Salesforce each time', 'Export a CSV by hand'], 1, 'Once a day is enough, so batch is simpler and cheaper.'),
      learn('Why reports like "column" storage', `
        A normal table is stored **row by row**: all of claim 1, then all of claim 2…

        Reporting tools usually store it **column by column**: all the amounts together, all the dates together…

        Why? A report like *"total amount"* only needs the **amount** column. Column storage reads just that column instead of every column of every row. It also shrinks well, because similar values sit next to each other.
      `),
      mcq('Why do reports prefer column-by-column storage?', ['It is easier to change one record', 'A report can read only the columns it needs, and the data shrinks better', 'It is required for Salesforce', 'It stores everything as text'], 1),
      order('Put the journey of one claim in order, from creation to dashboard.', ['Created in Salesforce', 'Copied out into raw storage', 'Cleaned and duplicates removed', 'Organised into report-friendly tables', 'Shown on the dashboard']),
      tf('ELT means: copy the raw data in first, then clean it inside the warehouse.', true, 'E = extract (copy out), L = load (put it in), T = transform (clean). ELT does the cleaning last, inside the warehouse. ETL cleans before loading.'),
      viz('medallion', 'Follow one record through three layers', 'Most companies keep data in three layers: **bronze** (raw, exactly as received), **silver** (cleaned), **gold** (ready for reports). Step through them.', {}, 'Bronze keeps the original, silver makes it trustworthy, gold makes it useful.'),
    ]),
  ]);
