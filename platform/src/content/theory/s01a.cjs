const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== What is data engineering?
  whatde: T(`
    > **In one line:** data engineering is the work of moving data from the places it is created to the places it is used, and making sure it arrives **correct, on time, understandable and safe**, every day, without a human babysitting it.

    ## The problem it solves
    Picture Apex Engines, a company that builds engines (it is the fictional company behind all the practice data on this platform). Every day it creates data in many places:

    - Dealers create service requests and warranty claims in a CRM.
    - Finance posts invoices and credit notes in an ERP.
    - Factories record each engine built in a manufacturing system.
    - Engines in the field send temperature, oil pressure and RPM every few seconds.
    - Technicians upload photos and PDF inspection reports.

    Now the business asks simple-sounding questions:
    - "Which dealers have the highest claim rejection rate this quarter?"
    - "Do engines built in plant 3 fail earlier than plant 1?"
    - "Warn us before an engine overheats."

    None of these can be answered from one system. The answers need data from **several systems, joined correctly, cleaned, kept over years and refreshed on a schedule**. If one person does this by hand with spreadsheet exports, it works once. It breaks the second time: the export changes, someone forgets a filter, two people get two different numbers, and nobody can say which is right.

    Data engineering exists to turn that one-off, manual, fragile work into a **system**: automated, repeatable, tested and monitored.

    ## What it is
    A data engineer builds and runs the **data platform** and the **pipelines** on it. Concretely, the job is:

    1. **Ingest:** pull or receive data from source systems (databases, APIs, files, event streams, devices).
    2. **Store:** land it somewhere cheap, durable and queryable (a lake, warehouse or lakehouse), keeping history.
    3. **Transform:** clean it, remove duplicates, fix types, join it, apply business rules, model it into tables people understand.
    4. **Serve:** make it available to the people and systems that use it: dashboards, analysts, data scientists, ML models, other applications.
    5. **Operate:** schedule it, monitor it, alert on failures, test data quality, control who sees what, document it, and fix it when it breaks.

    The last point is what separates engineering from scripting. Anyone can write a script that works today. A data engineer builds something that **still works next month when the source adds a column, sends a duplicate, arrives late, or doubles in size**.

    ## How it works (the shape of every data platform)
    «««flow
    Sources -> Ingestion -> Raw storage -> Transform (clean, join, model) -> Serving tables -> Consumers
    »»»
    Around that line sit the things that keep it trustworthy:
    - **Orchestration** (for example Airflow): runs each step in the right order, on schedule, with retries.
    - **Quality checks:** "no NULL claim_id", "row count within 10% of yesterday", "every claim has a dealer".
    - **Monitoring and alerting:** did it run, how long, how many rows, how fresh is the data?
    - **Governance:** who owns this table, what does each column mean, who may see personal data, how long do we keep it?
    - **Version control and CI/CD:** pipeline code is software, so it is reviewed, tested and deployed like software.

    ## What a data engineer is judged on
    Not on how clever the code is. On these five properties of the data they deliver:

    | Property | Question the business asks | What breaks it |
    |---|---|---|
    | **Correct** | Can I trust this number? | Duplicates, wrong joins, timezone bugs, silent NULLs |
    | **Timely** | Is it fresh enough to act on? | Late jobs, failed runs nobody noticed |
    | **Complete** | Is anything missing? | Partial loads, dropped late records |
    | **Understandable** | What does this column mean? | No documentation, cryptic names |
    | **Safe** | Who can see it? Are we allowed to keep it? | Personal data exposed, no retention rules |

    A good mental test: **if the pipeline runs twice, does the data double?** If a day is skipped, does anyone know? If a source sends garbage, does it stop or spread? Senior engineers think about these before writing the first line.

    ## When do you need data engineering (and when not)?
    - **You need it** when data comes from more than one system, is used repeatedly, must be refreshed regularly, is large, or feeds decisions that matter.
    - **You may not** for a one-time analysis of a single small export. Building a pipeline for a question asked once is over-engineering. The skill is knowing the difference.

    ## Alternatives, and why companies still hire data engineers
    | Alternative | Why it falls short at company scale |
    |---|---|
    | Analysts export to Excel by hand | Not repeatable, error-prone, no history, every analyst gets a different number |
    | Reports run directly on the production database | Slows the systems that run the business; cannot join across systems |
    | Buy a no-code tool for everything | Great for simple feeds; struggles with complex logic, scale, testing and cost control |
    | Let each team build its own pipelines | Duplicated work, conflicting definitions of "revenue", no governance |

    Modern tools (managed connectors, dbt, cloud warehouses) remove much of the plumbing, but someone still has to design the flow, decide the grain, guarantee correctness and own failures. That is the job.

    ## In a real company pipeline
    One day of a warranty-claims pipeline at Apex Engines:
    1. 01:00: Airflow starts the run for yesterday's date.
    2. Ingestion pulls new and changed claims from the CRM API since the last watermark, and the day's invoice file from the ERP's SFTP drop.
    3. Both land unchanged in the **bronze** (raw) layer with load metadata (file name, load time).
    4. Transformation deduplicates claims, casts amounts to decimals, standardises dealer codes, joins claims to dealers and engines, and writes **silver** tables.
    5. Quality checks run. One fails: 3% of claims have an unknown dealer code. The pipeline quarantines those rows, loads the rest and alerts the owner.
    6. **Gold** tables (claims per dealer per month, approval rate) refresh. The dashboard shows "data as of 01:42".
    7. A data scientist's failure-prediction model reads the same silver tables for training.

    Every step is something you will learn in depth in this track.

    ## Edge cases and what goes wrong
    - **The source changes without telling you.** A column is renamed; your job "succeeds" but writes NULLs. Defence: schema checks and data contracts.
    - **Re-runs double the data.** A failed job is retried after it half-wrote. Defence: idempotent writes (overwrite a partition, or MERGE by key).
    - **Late data.** A dealer submits yesterday's claims tomorrow. Defence: reprocess a window, or design incremental loads on "updated at", not "created at".
    - **Silent success.** The job ran green but loaded 0 rows because the API returned an empty page. Defence: volume checks and freshness alerts.
    - **Two definitions of the same metric.** Finance and service compute "approval rate" differently. Defence: one certified gold table, documented.

    ## At scale
    The concepts do not change from 10 thousand to 10 billion rows; the **cost of mistakes** does. At scale you add distributed processing (Spark), partitioning, incremental processing instead of full reloads, streaming where minutes matter, cost monitoring, and much stronger automation, because nobody can eyeball a billion rows.

    ## How interviewers test this
    - "What does a data engineer do?" Weak answer: "builds ETL pipelines". Strong answer: names the flow (ingest, store, transform, serve), then the **guarantees** (correct, timely, complete, understandable, safe), then one example of how you made a pipeline safe to re-run or monitored it.
    - "How is your work different from an analyst's?" (next topic).
    - Follow-up trap: "If your job succeeded, is the data correct?" The answer is **no, not necessarily**: success means the code ran, not that the data is right. That is why you test data, not just code.
  `, {
    check: [
      mcq('Your nightly job finishes green, but the dashboard shows zero claims for yesterday. Which statement is most accurate?', ['The pipeline is fine; the dealers submitted nothing', 'A successful run proves the code ran, not that the data is right: a volume or freshness check should have caught this', 'Restart the job; green runs never load bad data', 'The dashboard is caching old data, so ignore it'], 1, 'A run that "succeeds" with zero rows is a classic silent failure (empty API page, wrong date filter, expired credentials returning an empty result). Data checks such as "row count within an expected range" are what catch it.'),
      multi('Which of these are part of a data engineer\'s responsibility, not just "nice to have"?', ['Making a pipeline safe to re-run without duplicating data', 'Alerting when data is late or incomplete', 'Documenting what tables and columns mean', 'Choosing the colour scheme of the executive dashboard'], [0, 1, 2], 'Reliability, observability and understandability are core. Dashboard design belongs to analysts and BI developers.'),
      tf('For a one-time question answered from a single small export, building a scheduled, monitored pipeline is the right call.', false, 'That is over-engineering. Pipelines pay off when data is reused, refreshed or combined from several systems. Knowing when not to build is part of senior judgement.'),
      mcq('Which property is broken when Finance and Service report different "approval rates" for the same month?', ['Timeliness', 'Completeness', 'One agreed, documented definition (understandable and correct)', 'Security'], 2, 'The data may be fresh and complete, but two definitions of one metric destroy trust. The fix is one certified, documented gold table.'),
    ],
    scenarios: [
      scenario('The pipeline that doubled revenue', `
        A daily job loads yesterday's invoices into «fact_invoice». Last night it failed half-way at 02:10. The on-call engineer re-ran it at 06:00 and it succeeded. At 09:00 the CFO asks why yesterday's revenue is almost twice the normal value.`, [
        ['What most likely happened?', [
          ['The re-run inserted the whole day again on top of the rows the failed run had already written', true, 'Right. The job appends instead of replacing, so a retry after a partial write duplicates rows. This is the most common data incident there is.'],
          ['Sales really did double yesterday', false, 'Possible in theory, but the timing with a failed run plus a re-run makes duplication far more likely. Check before you believe.'],
          ['The dashboard is double-counting because of a caching bug', false, 'Always check the data first: count rows per invoice_id in the table.'],
        ]],
        ['How do you confirm it in one query?', [
          ['Count rows per invoice_id for yesterday and look for counts above 1', true, 'Yes. Duplicated business keys prove a double load.'],
          ['Re-run the job a third time to see if the number changes', false, 'That would make it worse if the job appends.'],
          ['Ask the sales team if they sold more', false, 'Data questions are answered with data first.'],
        ]],
        ['What is the permanent fix?', [
          ['Make the load idempotent: delete-and-reload yesterday\'s partition, or MERGE on invoice_id', true, 'Right. An idempotent job gives the same result no matter how many times it runs, so retries become safe.'],
          ['Tell on-call engineers never to re-run failed jobs', false, 'Retries are normal and orchestrators do them automatically. The job must be safe to retry.'],
          ['Add a note to the dashboard', false, 'That hides the problem instead of fixing it.'],
        ]],
      ], 'Lesson: every pipeline will be re-run one day. Design so that re-running is harmless (idempotency), and add a uniqueness check on the business key so duplicates fail loudly.'),
    ],
    interview: [
      talk('What does a data engineer do, and what makes a pipeline "good"?', `
        **Shape of a strong answer (60-90 seconds):**
        - A data engineer moves data from where it is created (operational databases, APIs, files, event streams, devices) to where it is used (warehouse or lakehouse tables, dashboards, ML), and owns its **reliability**.
        - The flow: ingest → store raw → transform (clean, deduplicate, join, model) → serve → operate (schedule, monitor, alert, govern).
        - A good pipeline is: **correct** (tested data, no duplicates), **idempotent** (safe to re-run), **incremental** where volume demands it, **observable** (row counts, freshness, alerts), **documented** and **secure**.
        - Close with something real: "In my Turbofan project I proved exactly-once by killing the stream mid-run and showing no duplicates after restart."

        **What makes it senior:** talking about failure modes (re-runs, late data, schema changes, silent zero-row loads) rather than just tools.`),
      talk('A job succeeded but the data is wrong. How is that possible, and how do you prevent it?', `
        - A green run means the code executed without an exception. It says nothing about the **data**.
        - Ways it happens: the source returned an empty page, a column was renamed so a select returns NULLs, a join key changed format so an inner join silently drops rows, a timezone shift moved records into the wrong day, a re-run appended duplicates.
        - Prevention: **data tests** after each step (row-count range, NOT NULL on keys, uniqueness of business keys, referential integrity, freshness), **schema checks** on ingest, **reconciliation** against the source (counts and sums), and alerts that fire on these, not just on crashes.
        - Bonus: "a test that has never failed may not be testing anything. I check new tests fail on bad data first."`),
    ],
    hands: [
      sql({ q: 'The raw orders feed is what a pipeline receives: every status change is an event, and some events arrived **twice**. In one query, return «events» (total rows), «orders» (distinct «order_id») and «duplicate_events»: rows that repeat an earlier row with the same «order_id», «status» and «updated_at». This is the first thing a data engineer measures in a new feed.', tables: ['raw_orders_feed'], level: 2,
        solution: `SELECT COUNT(*) AS events,
       COUNT(DISTINCT order_id) AS orders,
       COUNT(*) - (SELECT COUNT(*) FROM (SELECT DISTINCT order_id, status, updated_at FROM raw_orders_feed)) AS duplicate_events
FROM raw_orders_feed;`,
        hint: 'duplicate_events = total rows minus the number of distinct (order_id, status, updated_at) combinations.' }),
    ],
  }),

  // ================================================================== Roles
  roles: T(`
    > **In one line:** the data engineer makes data **available and trustworthy**; the analyst turns it into **answers for the business**; the data scientist turns it into **predictions and models**. Same data, different questions, different outputs.

    ## Why several roles exist
    A single "data person" who extracts, cleans, models, analyses, builds ML models and maintains infrastructure exists in small companies, and they are always overloaded. As data grows, the work splits because each part needs different depth:
    - Building a reliable pipeline that processes 50 million rows a day needs **software and distributed-systems skill**.
    - Explaining why claim approvals dropped in the South region needs **business context and statistics**.
    - Predicting which engines will fail next month needs **machine learning and experimental rigour**.

    ## The roles side by side
    | | Data engineer | Data analyst | Data scientist |
    |---|---|---|---|
    | Main question | How do we get the right data to the right place, reliably? | What happened and why? | What will happen, and what should we do? |
    | Output | Pipelines, tables, data platform, data products | Dashboards, reports, analyses, recommendations | Models, forecasts, experiments |
    | Main tools | SQL, Python, Spark, Kafka, Airflow, cloud, Git | SQL, Excel, Power BI or Tableau, some Python | Python, statistics, ML libraries, notebooks |
    | Cares most about | Correctness, reliability, scale, cost | Business meaning, clarity, insight | Accuracy, bias, generalisation |
    | "Done" means | It runs every day without anyone touching it | The stakeholder understood and acted | The model works on new data |
    | Typical failure | Duplicates, late data, broken loads | Wrong metric definition, misleading chart | Overfitting, data leakage |

    ## The neighbouring roles you will hear about
    - **Analytics engineer:** sits between engineer and analyst. Owns the transformation layer inside the warehouse (often with dbt): clean, tested, documented models that analysts use. Many "DE 1" roles include this work.
    - **ML engineer:** puts data scientists' models into production: feature pipelines, model serving, monitoring for drift.
    - **BI developer:** builds the semantic layer and dashboards.
    - **Data architect:** designs the overall platform and standards across teams.
    - **Platform / DataOps engineer:** runs the infrastructure itself: clusters, CI/CD, permissions, cost.

    ## How the work actually flows (and where it goes wrong)
    «««flow
    Business question -> Analyst defines metric -> Engineer builds reliable tables -> Analyst builds dashboard -> Scientist reuses tables for models
    »»»
    The hand-offs are where problems live:
    - **Unclear requirements:** the analyst asks for "active dealers". Active means what? Any claim in 90 days? Any sale this year? An engineer who builds without asking will rebuild it twice. Good engineers turn vague asks into **written, testable definitions**.
    - **Grain confusion:** the analyst wants one row per claim; the engineer delivered one row per claim line. Totals double.
    - **Data scientists training on raw data:** they build their own cleaning in a notebook; it differs from the production pipeline, so the model sees different data in training than in production (training-serving skew). Shared, governed silver tables prevent this.

    ## Why this matters for a DE 1 interview
    The posting says the role works "with Business and IT teams to understand requirements" and delivers data "to analysts and other consumers". So they will test whether you understand **the consumer's view**:
    - Do you ask what decision the data supports before you build?
    - Do you know the analyst will hit your table with filters by date and region, so you partition and model for that?
    - Do you know a data scientist needs history and stable definitions, not just today's snapshot?

    If you have analyst experience (dashboards, reporting), that is an **advantage**: you know what consumers suffer from. Say so.

    ## Edge cases
    - **"Can't the analyst just write the pipeline in the BI tool?"** For small, single-source data, yes, and it is often the fastest route. It stops being OK when the logic is reused by many reports, needs history, needs testing, or the refresh takes hours.
    - **Who owns data quality?** Shared: the source system owns correctness at entry; the data engineer owns that the pipeline does not damage data and that checks catch problems; the data owner (business) decides what "correct" means.

    ## How interviewers test this
    - "How would you work with an analyst who keeps changing requirements?" They want: write the definition down, agree acceptance criteria, deliver a small version early, version the change.
    - "You come from analytics. Why data engineering?" Strong answer: you saw the consumer's pain (late, inconsistent, untrusted data) and want to fix it at the root by building the reliable layer.
  `, {
    check: [
      mcq('An analyst asks for a table of "active dealers". What should a good data engineer do first?', ['Build it using any claim in the last 30 days', 'Ask what decision it supports and agree a written, testable definition of "active"', 'Return all dealers and let the analyst filter', 'Wait until the analyst writes the SQL'], 1, 'Vague terms like "active" cause rebuilds. Agree a definition and acceptance criteria first.'),
      match('Match each role to its main output.', [['Data engineer', 'Reliable pipelines and tables'], ['Data analyst', 'Dashboards and explanations'], ['Data scientist', 'Predictive models'], ['Analytics engineer', 'Tested transformation models in the warehouse']], 'The roles overlap, but their primary output differs.'),
      tf('Training-serving skew happens when a model is trained on data cleaned one way and used in production on data cleaned another way.', true, 'Shared, governed tables used by both the training and the production pipeline prevent it.'),
      mcq('A dashboard total is exactly double the expected value after you delivered a new table. What is the most likely hand-off mistake?', ['The analyst used the wrong chart', 'Grain mismatch: you delivered one row per line item, they assumed one row per claim', 'The warehouse is slow', 'The table has too many columns'], 1, 'Always state the grain of a table in its documentation: "one row per …".'),
    ],
    interview: [
      talk('You have been a data analyst. Why do you want to be a data engineer, and how does your background help?', `
        - **Why:** "As an analyst I spent a lot of time on the symptoms: data that was late, numbers that didn't match between reports, manual exports. I want to fix the root cause by building the reliable layer everyone depends on."
        - **How it helps:** you understand consumers: what grain they need, how they filter, what "trusted" means to a business user, why metric definitions matter.
        - **Proof:** "I've already built pipelines: my Turbofan project streams engine telemetry through Kafka into Delta tables with exactly-once guarantees and monitoring."
        - Avoid: sounding like you are escaping analysis. Frame it as moving upstream to have more impact.`, 'hr'),
      talk('An analyst and a data scientist both need claims data, but they want it cleaned differently. What do you do?', `
        - Find what is **shared**: deduplication, type fixes, standard codes, joins to dealers and engines. Build that once as a governed **silver** table both use. This stops two versions of the truth and prevents training-serving skew.
        - Put the **use-specific** logic on top: the analyst gets a gold aggregate (claims per dealer per month); the scientist gets a feature table (claims history per engine as of a date).
        - Document the grain and definitions, and add tests on the shared layer.
        - Principle: clean once, consume many times.`),
    ],
  }),

  // ================================================================== Data lifecycle
  lifecycle: T(`
    > **In one line:** every piece of data goes through the same life: it is **created, collected, stored, processed, used, shared, archived and finally deleted**. Data engineering designs what happens at every stage, especially the last ones people forget.

    ## Why think in a lifecycle at all?
    Beginners think about one moment: "load the data". Problems appear at the other moments:
    - Nobody decided how long to keep sensor data, so storage costs grow forever.
    - A customer asks to be deleted (privacy law), and their data is in 14 copies nobody tracked.
    - A three-year-old report must be reproduced for an audit, but the raw data was overwritten.

    Thinking in a lifecycle forces you to decide, up front, what happens to data at each stage.

    ## The stages
    | Stage | What happens | Key decisions | Apex Engines example |
    |---|---|---|---|
    | 1. Create | A system or person produces data | Is it captured with good keys and timestamps? | Dealer submits a warranty claim |
    | 2. Collect (ingest) | Data is copied out of the source | Batch or stream? Full or incremental? | Hourly API pull of changed claims |
    | 3. Store | Data lands somewhere durable | Format, partitioning, raw copy kept? | Raw JSON to bronze, Parquet/Delta to silver |
    | 4. Process | Cleaned, joined, modelled | Where does logic live? How is it tested? | Dedupe, standardise dealer codes, join to engines |
    | 5. Use | Analysed, reported, fed to models | Who consumes, at what freshness? | Approval-rate dashboard, failure model |
    | 6. Share | Given to other teams or partners | Access rules, masking, contracts | Supplier gets defect rates for its parts only |
    | 7. Archive | Moved to cheaper, slower storage | When does hot become cold? | Claims older than 2 years to archive tier |
    | 8. Delete | Removed for good | Retention law, privacy requests, legal hold | Personal data deleted after 7 years |

    ## How it works in practice: hot, warm, cold
    Data is used most when it is new. So storage is tiered:
    - **Hot:** last days or weeks; fast storage; queried constantly.
    - **Warm:** last months; standard storage; queried sometimes.
    - **Cold / archive:** years old; very cheap storage that is slow or costs money to read back; kept for audit or rare analysis.

    Cloud object stores do this automatically with **lifecycle rules** ("move objects older than 90 days to the cool tier, older than 2 years to archive, delete after 7 years").

    ## Retention: the stage that becomes a legal problem
    **Retention** is how long you keep data and why. It is driven by:
    - **Law and regulation:** finance records often must be kept for years; personal data must not be kept longer than needed (privacy laws such as GDPR and India's DPDP Act).
    - **Business need:** models need history; dashboards need two years for year-over-year comparison.
    - **Cost:** keeping everything forever is expensive and risky.
    - **Legal hold:** if there is a lawsuit, relevant data must not be deleted, even if retention says so.

    The hard part is **deletion across copies**. If raw, silver, gold, backups, extracts and an ML training set all contain a customer's email, a deletion request means finding all of them. That is why governance (catalog, lineage, tagging personal-data columns) matters: lineage tells you where the data went.

    ## Edge cases and what goes wrong
    - **Overwriting raw data.** If you only keep the cleaned version, a bug in cleaning is permanent. Keep an immutable raw copy (with its own retention).
    - **Deleting from a table but not its history.** Table formats like Delta keep old versions for time travel. A "deleted" row still exists in old files until those versions are vacuumed.
    - **Backups outlive retention.** Retention rules must include backups and exports.
    - **Archived data you cannot read.** Data archived in a format or schema nobody remembers is useless. Archive with its schema and documentation.
    - **Retention too short for the model.** You delete sensor data after 30 days, then the data science team needs a year of history to predict failures.

    ## At scale
    Sensor data is where the lifecycle matters most. 10,000 engines × 1 reading per second × 86,400 seconds = **864 million readings a day**. Keeping every raw reading forever is rarely justified. A common design is: keep raw readings hot for 30-90 days, keep **downsampled** aggregates (per-minute or per-hour min/max/avg) for years, archive raw readings cheaply if regulation or modelling needs them.

    ## How interviewers test this
    - "How would you handle a request to delete a customer's data?" Strong answer: find every copy via lineage and tags, delete or anonymise in each (including history: vacuum old versions), handle backups by policy, confirm and log it, and design new pipelines so personal data is isolated or pseudonymised to make this easier.
    - "How long would you keep raw sensor data?" Strong answer: "It depends on regulation and use. I'd ask; my default is raw hot for a short window, aggregates long-term, raw archived cheaply if needed for retraining."
  `, {
    check: [
      order('Put the data lifecycle stages in order.', ['Create', 'Collect (ingest)', 'Store', 'Process', 'Use and share', 'Archive', 'Delete'], 'Archive and delete are the stages most often forgotten, and the ones with legal consequences.'),
      mcq('You delete a customer\'s rows from a Delta table. Are they gone?', ['Yes, deleted means deleted', 'Not fully: older table versions still reference files containing them until those versions are vacuumed', 'Only if the table is partitioned', 'Only after a restart'], 1, 'Time travel keeps old data files. Privacy deletion needs DELETE plus VACUUM after the retention window, and a check of backups and copies.'),
      tf('A legal hold can override a retention rule that says data should be deleted.', true, 'If data is relevant to litigation it must be preserved, even past its normal retention.'),
      mcq('Why keep an immutable raw copy of ingested data?', ['It is required by Spark', 'So a bug in cleaning or business logic can be fixed by reprocessing from raw instead of re-extracting or losing data', 'Raw data is faster to query', 'To save storage'], 1, 'Raw (bronze) is your safety net for reprocessing and audit.'),
    ],
    scenarios: [
      scenario('A deletion request', `
        A customer asks Apex Engines to delete their personal data. Their email and phone appear in the CRM, in the bronze JSON files, in the silver «customers» table, in a gold marketing extract, and in a CSV a data scientist downloaded to train a churn model.`, [
        ['Where do you start?', [
          ['Use the catalog and lineage to list every dataset that contains this customer\'s personal-data columns', true, 'Right. You cannot delete what you cannot find. Lineage plus PII tags give you the list.'],
          ['Delete the row from the CRM; the pipelines will remove it everywhere', false, 'Pipelines that append history, raw files and downloaded copies will not "un-load" it.'],
          ['Delete the whole bronze layer to be safe', false, 'Destroying everyone\'s raw data to delete one person is not acceptable.'],
        ]],
        ['How do you handle the Delta silver table?', [
          ['DELETE the rows, then VACUUM after the retention window so old files are removed, and log it', true, 'Correct. DELETE alone leaves the data in older versions.'],
          ['UPDATE the email to NULL and stop', false, 'Old versions still contain the email until vacuumed.'],
          ['Do nothing because silver is internal', false, 'Privacy law applies to internal copies too.'],
        ]],
        ['What change prevents this pain next time?', [
          ['Pseudonymise personal data early (store a token, keep the mapping in one protected table) and ban uncontrolled downloads of PII', true, 'Yes. Then deletion means deleting one mapping row, and copies only hold meaningless tokens.'],
          ['Stop collecting emails', false, 'The business may genuinely need them; the issue is uncontrolled copies.'],
          ['Ask customers not to make requests', false, 'Not an option legally.'],
        ]],
      ], 'Deletion is a design problem, not a cleanup task. Isolate personal data, tag it, track lineage, and remember history versions, backups and downloads.'),
    ],
    interview: [
      talk('Design a retention policy for engine sensor data (10,000 engines, one reading per second).', `
        - **Size it first:** 10,000 × 86,400 ≈ 864M readings/day. At ~50 bytes compressed, roughly 40 GB/day, 15 TB/year.
        - **Ask the requirements:** regulation, what the failure model needs (how much history), what dashboards need.
        - **Tiers:** raw readings in hot storage for 30-90 days (debugging, recent analysis); per-minute and per-hour aggregates (min, max, avg, count) kept for years; raw archived to a cold tier if model retraining or audit needs it, otherwise deleted after N months.
        - **Mechanics:** date-partitioned tables so expiry is "drop old partitions"; object-store lifecycle rules for tiering; vacuum old versions in Delta.
        - **Governance:** document the policy in the catalog, owner signs off, legal hold process exists.`),
    ],
    hands: [
      py({ q: 'Write «storage_tier(age_days, legal_hold=False)» for a retention policy: age < 30 → «"hot"», 30-364 → «"warm"», 365-2554 (under 7 years) → «"archive"», 2555 or more → «"delete"». A **legal hold** means the data is never deleted: return «"archive"» instead of «"delete"». Negative ages are a bug upstream: raise «ValueError».', starter: 'def storage_tier(age_days, legal_hold=False):\n    pass\n',
        tests: `assert storage_tier(0) == 'hot'
assert storage_tier(29) == 'hot'
assert storage_tier(30) == 'warm'
assert storage_tier(364) == 'warm'
assert storage_tier(365) == 'archive'
assert storage_tier(2554) == 'archive'
assert storage_tier(2555) == 'delete'
assert storage_tier(5000, legal_hold=True) == 'archive'
assert storage_tier(10, legal_hold=True) == 'hot'
try:
    storage_tier(-1); raise AssertionError('negative age must raise ValueError')
except ValueError:
    pass`,
        solution: `def storage_tier(age_days, legal_hold=False):
    if age_days < 0:
        raise ValueError('age cannot be negative')
    if age_days < 30:
        return 'hot'
    if age_days < 365:
        return 'warm'
    if age_days < 2555 or legal_hold:
        return 'archive'
    return 'delete'` }),
    ],
  }),
};
