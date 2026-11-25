const { learn, mcq, tf, multi, talk, world, lesson } = require('./_h.cjs');

module.exports = world('interview', 'Interview Room', 'final stage',
  'Your story, the competencies listed in the posting turned into STAR answers, questions to ask them, and rapid-fire technical revision.',
  [
    lesson('v1', 'Your story', 20, [
      learn('Position: analytics professional moving into engineering', `
        Don't pitch yourself as a fresher. Pitch yourself as **someone already doing data work in the Cummins environment who is moving into the engineering side**.

        **STAR** for every story: **S**ituation (context), **T**ask (your responsibility), **A**ction (what *you* did, technically specific), **R**esult (numbers, impact, what you learned).

        Prepare 5 stories from Dealermatix:
        1. Building the warranty process view (CRF → SR → PIR → Claim → Credit Note): **requirements → model → metrics**.
        2. A number that didn't match, and how you validated with SOQL and fixed the logic: **data quality / problem solving**.
        3. A slow dashboard you fixed: **performance**.
        4. Changing requirements from stakeholders mid-way: **customer focus / communication**.
        5. Something you learned fast to deliver: **learning agility** (plus the projects you're building now).

        Have numbers ready: dashboards shipped, objects joined, records processed, issues fixed, time saved.
      `),
      talk('**"Tell me about yourself."** (90 seconds)', `
        Structure: **present → past → why this role → why now**.
        - *Present*: "I'm an analytics engineer at Dealermatix, working on Cummins' Salesforce CRM Analytics. I build the data prep pipelines and dashboards for service orders, claims, process adoption and contract visibility, used by Cummins service teams."
        - *Detail that signals engineering*: "My recipes join several Salesforce objects, deduplicate, and derive process stages and ageing. I model the whole CRF-to-credit-note flow, and I validate every KPI against source with SOQL."
        - *Past*: B.Tech in Computer Science from VIT, plus projects in data and AI tooling (mention the most relevant).
        - *Why this role*: "I want to own the pipelines end to end: ingestion, modelling, quality and governance at enterprise scale, in SQL, Python and Spark. The data-product and AI-ready focus of this team matches where I want to grow."
        - *Why now*: "I've been building that toolkit deliberately: [your two projects], and I already understand Cummins' warranty and service data."
      `, 'hr'),
      talk('**"Walk me through a data pipeline you built."**', `
        Use your CRM Analytics work, described as a pipeline:
        - **Sources**: Salesforce objects (Case/CRF, Service Request, PIR, Claim, Credit Note), with their relationships and volumes.
        - **Ingestion / sync**: how the data reaches CRM Analytics (data sync / connected objects), refresh schedule.
        - **Transformations**: the Data Prep recipe: joins (and their cardinality), filters, dedup logic, calculated fields (ageing buckets, stage, status mapping).
        - **Output**: datasets feeding dashboards, KPIs, SAQL for complex metrics.
        - **Quality**: SOQL reconciliation, the bug you found (a fan-out join? a status mapping?), how you fixed and prevented it.
        - **Ops**: refresh failures, performance fixes, stakeholder sign-off.
        - Then: *"If I rebuilt this on a lakehouse I'd do bronze/silver/gold in PySpark, MERGE incrementally, and add automated tests and lineage."* This shows you can transfer the skills.
      `, 'hr'),
      talk('**"Why are you moving from analytics to data engineering?"**', `
        - Genuine motivation: you enjoy the **building** part most (pipelines, modelling, fixing data at the source) more than presenting insights.
        - Evidence it's not a whim: you already do ETL-style work, you've been learning SQL/Python/PySpark systematically, and you are building engineering projects.
        - Fit: the team's focus on governed data products and AI-ready data needs people who understand both the business data and the engineering.
        - Avoid: complaining about your current job, salary as the main reason.
      `, 'hr'),
      talk('**"What do you know about Cummins, and why this team?"**', `
        - Cummins: global power technology company (engines, power generation, components, and new power: electrification, hydrogen) with a large engineering and IT presence in Pune.
        - This team: enterprise data products across Supply Chain, Quality, Finance and Product Lifecycle, with Data-as-a-Product, governance and GenAI-ready data.
        - Your angle: you already work with Cummins' service and warranty data and its stakeholders, so you understand how data quality affects warranty cost and customer support, and you'd ramp up faster than an outsider.
        - Do your homework: read Cummins' latest annual report highlights and the Destination Zero strategy before the interview.
      `, 'hr'),
    ]),
    lesson('v2', 'Competencies from the posting', 25, [
      learn('Map every competency to a story', `
        The posting lists competencies. Expect behavioural questions on each:

        | Competency | Likely question |
        |---|---|
        | System Requirements Engineering | "How do you turn a vague request into clear requirements?" |
        | Collaborates | "Tell me about working with a difficult stakeholder." |
        | Communicates effectively | "Explain a technical issue to a non-technical audience." |
        | Customer focus | "When did you go beyond the ask for a user?" |
        | Decision quality | "A decision you made with incomplete information." |
        | Data Quality | "How did you find and fix a data quality issue?" |
        | Problem Solving | "Walk me through debugging a tricky issue." |
        | Solution Documentation | "How do you document your work so others can maintain it?" |
        | Values differences | "Working with a team from a different background or region." |
      `),
      talk('**System Requirements Engineering**: "A business user says *we need a dashboard for claims*. What do you do?"', `
        - Ask **what decision** it supports and **who** uses it, how often, and what action they'll take.
        - Define metrics precisely (approved = which statuses? date basis? time zone?) and write **acceptance criteria** that can be verified ("matches Salesforce report X within 0.1%", "refreshed by 9 AM").
        - Identify sources, grain, filters, security (dealer-level access?).
        - Prototype, review with the user, iterate. Track requirement changes and their impact on scope and timeline.
        - Example from your work: how you turned review-meeting feedback into the CRF → Credit Note process view.
      `, 'hr'),
      talk('**Data Quality / Problem Solving**: "Tell me about a time numbers didn\'t match."', `
        STAR outline:
        - **S**: a KPI card disagreed with a Salesforce report the client trusted.
        - **T**: find the root cause before the review/sign-off.
        - **A**: reproduced both numbers, aligned definitions, wrote SOQL to list record IDs on each side, found the cause (e.g. duplicates from a join, wrong status mapping, a date field mismatch), fixed the recipe logic, re-validated, documented the definition.
        - **R**: numbers reconciled, client signed off, and you added a standard validation step so it didn't recur.
        - Close with the DE lesson: *"In a pipeline I'd automate that check as a data test."*
      `, 'hr'),
      talk('**Communicates effectively**: "Explain to a service manager why their dashboard was wrong yesterday."', `
        - Lead with impact and status: "Yesterday's approved-claims figure was overstated by 37 claims; it's corrected now."
        - Plain cause: "Some claims were loaded twice when the system retried a delayed transfer."
        - What you did: "We removed the duplicates and added an automatic check that stops publishing if any claim appears twice."
        - What they need to do: "Nothing, unless you exported numbers yesterday; here's the corrected file."
        - No jargon (no "idempotent MERGE"), no blame, short.
      `, 'hr'),
      talk('**Decision quality**: "Tell me about a decision you made with incomplete information."', `
        - Pick a real trade-off (shipping a dashboard version with a known limitation vs waiting; choosing between two metric definitions).
        - Show how you **framed options**, gathered the information you could quickly, set a reversible path, and **communicated the risk**.
        - Result plus what you'd do differently.
      `, 'hr'),
      talk('**Collaborates / Values differences**: "Describe working with a global or cross-functional team."', `
        - Cummins teams span India, the US and the UK: time zones, communication styles, priorities differ.
        - Example: working with Cummins stakeholders and your Dealermatix team. Weekly updates, clear written summaries, async-friendly documentation, confirming understanding.
        - Show respect for different perspectives changing the outcome for the better (a user's workflow insight that changed your design).
      `, 'hr'),
      talk('**Questions you ask them** at the end. Prepare 3.', `
        Good options:
        1. "Which cloud and tools does the team use today: Databricks, Snowflake, Azure, AWS? And what does a typical pipeline look like?"
        2. "How are data products certified here? Who owns quality and the catalog?"
        3. "What would success look like for a DE1 in the first 6 months?"
        4. "Which domain would I start in: Supply Chain, Quality, Finance or Product Lifecycle?"
        5. "How is the team using GenAI with these data products?"
        Avoid asking about salary or leave in technical rounds.
      `, 'hr'),
    ]),
    lesson('v3', 'Rapid-fire technical revision', 15, [
      mcq('Difference between «DELETE», «TRUNCATE» and «DROP»?', ['They are identical', 'DELETE removes chosen rows (logged, can filter); TRUNCATE removes all rows fast; DROP removes the table itself', 'DROP removes rows only', 'TRUNCATE can take a WHERE clause'], 1),
      mcq('Which is a **wide** transformation in Spark?', ['filter', 'select', 'groupBy', 'withColumn'], 2),
      mcq('Best way to find the latest record per key in SQL or Spark?', ['GROUP BY key with MAX on every column', 'ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC) = 1', 'DISTINCT', 'ORDER BY ts LIMIT 1'], 1, 'MAX per column can mix values from different rows.'),
      mcq('What is idempotency in a pipeline?', ['Running fast', 'Re-running with the same input produces the same result, with no duplicates or drift', 'Running in parallel', 'Running only once'], 1),
      mcq('Star schema: where do «claim_amount» and «dealer_region» go?', ['Both in the fact', 'claim_amount in the fact, dealer_region in the dealer dimension', 'Both in a dimension', 'claim_amount in the dimension'], 1),
      mcq('Kafka guarantees ordering…', ['Across the whole topic', 'Within a partition', 'Never', 'Across consumer groups'], 1),
      mcq('Parquet is preferred for analytics because…', ['It is human-readable', 'Columnar storage with compression, column pruning and predicate pushdown', 'It is row-based', 'It has no schema'], 1),
      mcq('SCD Type 2 handles a changing attribute by…', ['Overwriting it', 'Adding a new row version with validity dates and a new surrogate key', 'Adding a previous_value column', 'Ignoring the change'], 1),
      mcq('A Spark job has one task running far longer than the rest. First suspect?', ['Data skew', 'Too much memory', 'Wrong file format', 'Too many columns'], 0),
      mcq('Which is NOT a data quality dimension?', ['Completeness', 'Uniqueness', 'Timeliness', 'Verbosity'], 3),
      mcq('ETL vs ELT: in ELT the transformation happens…', ['Before loading, on a separate server', 'Inside the target warehouse/lakehouse after loading raw data', 'In the BI tool', 'Never'], 1),
      mcq('«coalesce(5)» vs «repartition(5)»?', ['Identical', 'coalesce reduces partitions without a full shuffle; repartition does a full shuffle and balances data', 'repartition can only increase', 'coalesce shuffles twice'], 1),
      mcq('«COUNT(*)» vs «COUNT(col)»?', ['Same', 'COUNT(*) counts rows; COUNT(col) counts non-null values of col', 'COUNT(col) counts distinct values', 'COUNT(*) skips NULL rows'], 1),
      mcq('What does a watermark do in Structured Streaming?', ['Encrypts events', 'Bounds how late events may arrive, so old window state can be finalised and dropped', 'Sorts the stream', 'Adds timestamps'], 1),
      mcq('Data lineage is mainly used for…', ['Encrypting data', 'Impact analysis and root-cause analysis across upstream/downstream dependencies', 'Compressing files', 'Scheduling'], 1),
      tf('UNION ALL is generally faster than UNION.', true, 'No deduplication step.'),
      tf('A LEFT JOIN can return more rows than the left table has.', true, 'If a left row matches several right rows, it is repeated: fan-out.'),
      tf('Broadcasting a 20 GB table is a good way to avoid shuffles.', false, 'Broadcast sides must fit in each executor\'s memory. Use it for small dimensions.'),
    ]),
  ]);
