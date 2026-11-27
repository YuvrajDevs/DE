const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Data types
  datatypes: T(`
    > **In one line:** data comes in three shapes: **structured** (fixed rows and columns), **semi-structured** (self-describing, flexible, often nested, like JSON) and **unstructured** (no tabular shape: images, PDFs, audio, free text). The shape decides how you ingest, store, validate and query it.

    ## The problem it solves
    Apex Engines has a claim row (claim_id, dealer_id, amount), a JSON event from the dealer app with a nested list of parts, and a photo of a cracked cylinder head. All three describe the same warranty case. You cannot store, validate and query them the same way. Classifying data by shape tells you which tools fit.

    ## The three shapes, properly
    ### Structured
    - **What:** every record has the same fields with fixed types, defined **before** data is written (a schema).
    - **How it works:** the database enforces the schema on write: «amount» must be a number, «claim_id» must be unique. Bad data is rejected at the door.
    - **Lives in:** relational databases, ERP and CRM objects, warehouse tables, Parquet files.
    - **Strength:** easy to query with SQL, join, aggregate and validate.
    - **Weakness:** changing the schema needs coordination; awkward for data whose fields vary.

    ### Semi-structured
    - **What:** data that carries its own structure (keys, tags) but does not force every record into the same fixed layout. Records can have extra fields, missing fields, nested objects and arrays.
    «««json
    {"claim_id": 9001, "dealer": {"id": 14, "region": "West"},
     "parts": [{"sku": "P-77", "qty": 2}, {"sku": "P-12", "qty": 1}],
     "notes": null}
    »»»
    - **How it works:** the reader interprets the structure when it reads (**schema-on-read**). Different records may differ.
    - **Formats:** JSON (APIs, events), XML (older enterprise integrations), Avro (events with a schema), YAML (config), log lines with key=value pairs.
    - **Strength:** flexible; producers can add fields without breaking a table; natural for APIs and events.
    - **Weakness:** consumers must handle missing fields, type drift ("qty": "2" one day, 2 the next) and nesting before analysis.

    ### Unstructured
    - **What:** content with no tabular shape: images, video, audio, PDFs, emails, free-text comments, CAD drawings.
    - **How it works:** store the file in object storage, store **metadata about it** in a table (file path, claim_id, uploaded_at, size, content type). Extract structure later with OCR, speech-to-text, image models or LLMs.
    - **Strength:** carries information nothing else captures (the photo shows the crack).
    - **Weakness:** cannot be queried directly; extraction is costly and imperfect; large and often sensitive.

    ## A nuance interviewers like
    - **Shape is about the data, not the file extension.** A CSV is usually structured, but a CSV with a free-text "comments" column contains unstructured content inside a structured file.
    - **Parquet and Avro are not "semi-structured" just because they are modern.** Both carry a strict schema. Parquet is a structured columnar format; Avro is a structured row format that supports schema evolution.
    - **JSON can be perfectly regular.** Semi-structured means it *may* vary, not that it always does.
    - **Shape changes through the pipeline.** JSON event (semi) → flattened silver table (structured) → aggregated gold (structured). A PDF (unstructured) → OCR text (unstructured text) → extracted fields (structured) → embeddings for AI search.

    ## How each shape moves through a pipeline
    | Step | Structured | Semi-structured | Unstructured |
    |---|---|---|---|
    | Ingest | CDC or query extract | API pull, Kafka events | File upload, object copy |
    | Raw store | Parquet/Delta | Raw JSON as received (or a string column) | Files in object storage + metadata table |
    | Validate | Types, keys, ranges | Schema check, required fields, type drift | File type, size, virus scan, readable? |
    | Transform | Joins, aggregates | Flatten, explode arrays, cast types | OCR, transcription, classification, embeddings |
    | Serve | Tables, BI | Flattened tables | Search index, vector store, links in reports |

    ## Flattening nested data: the step everyone gets wrong
    An event with an array of 2 parts becomes **2 rows** when you explode the array. Three traps:
    1. **Grain change:** after exploding, the table is one row per *part line*, not per claim. Summing claim-level fields (claim amount) now double-counts.
    2. **Empty arrays disappear:** a claim with «parts: []» produces zero rows after a normal explode, so the claim vanishes. Use an "outer" explode (Spark «explode_outer») when the parent must survive.
    3. **NULL vs missing vs empty:** «"notes": null», no «notes» key, and «"notes": ""» can mean different things. Decide and document.

    ## When to choose which storage
    - Structured, transactional, needs constraints → relational database.
    - Structured, analytical, large → columnar warehouse or lakehouse tables.
    - Semi-structured events at volume → land raw in the lake, flatten into tables; or use warehouse VARIANT/JSON columns for light use.
    - Unstructured → object storage plus a metadata table; specialised processing on top.

    ## Edge cases and what goes wrong
    - **Type drift:** a producer sends «"amount": "1,200.50"» (string with a comma). A strict cast turns it into NULL silently. Validate, quarantine, alert.
    - **New fields appear:** usually harmless; your pipeline should ignore or capture them (rescued-data column), not crash.
    - **Deeply nested JSON** (5 levels) can make tables explode in size. Flatten only what consumers need; keep the raw.
    - **Huge documents:** one 200 MB JSON file cannot be split for parallel reading. Prefer newline-delimited JSON (one record per line).
    - **Encoding:** non-UTF-8 text, byte-order marks and odd line endings break parsers. Normalise on ingest.
    - **Unstructured files are sensitive:** photos and PDFs can contain faces, names, signatures. Govern them like personal data.

    ## At scale
    Semi-structured data is the most expensive to query at scale because the engine must parse text on every read. That is why lakes convert raw JSON to **columnar Parquet/Delta** early (silver): parse once, read fast forever. For unstructured data the cost is in **processing** (OCR, models), so you process each file once and store the extracted output.

    ## How interviewers test this
    - "Is JSON structured?" Strong answer: semi-structured: it has structure, but it is self-describing and flexible, records can vary. Then mention flattening and type drift.
    - "How would you ingest dealer-uploaded PDFs so analysts can use them?" Strong answer: store files in object storage, metadata table keyed to claim_id, extraction job (OCR/LLM) writing structured fields with a confidence score, quality checks on extraction, keep the original.
  `, {
    check: [
      mcq('Which classification is most accurate for a Parquet file?', ['Unstructured', 'Semi-structured, because it is a modern format', 'Structured: it carries a strict schema with typed columns', 'It depends on the file size'], 2, 'Parquet is a schema-based columnar format. Being modern does not make it semi-structured.'),
      mcq('You explode the «parts» array of claim events. A claim with an empty «parts» array…', ['Becomes one row with NULL part', 'Disappears from the result with a normal explode; use an outer explode if it must survive', 'Causes an error', 'Is duplicated'], 1, 'A normal explode emits one row per element, so zero elements means zero rows. explode_outer keeps the parent with NULLs.'),
      tf('After exploding claims into one row per part line, summing the claim amount column gives the correct total claimed.', false, 'The grain changed. A claim with 3 parts now appears 3 times, so its amount is counted 3 times.'),
      multi('Which are good practices for unstructured files like inspection photos?', ['Store the file in object storage and a metadata row (path, claim_id, uploaded_at) in a table', 'Keep the original even after extracting text', 'Paste the image bytes into a VARCHAR column of the claims table', 'Treat them as potentially personal data'], [0, 1, 3], 'Tables hold metadata and links; object storage holds the bytes.'),
    ],
    scenarios: [
      scenario('The amount that became NULL', `
        The dealer app team released a new version. Since then, 8% of claim events in silver have «claim_amount = NULL». Bronze shows values like «"1,250.00"» and «"₹ 980"» where it used to have «1250.0».`, [
        ['What happened?', [
          ['Type drift: the producer now sends amounts as formatted strings, and the cast to a number fails silently to NULL', true, 'Right. Many engines return NULL on a failed cast instead of erroring.'],
          ['Dealers stopped entering amounts', false, 'Bronze shows the amounts are there, just formatted.'],
          ['The warehouse lost data', false, 'The raw data is intact; the transformation is the problem.'],
        ]],
        ['What do you do right now?', [
          ['Fix parsing for the known formats, reprocess the affected days from bronze, and quarantine values that still fail', true, 'Yes. Bronze lets you repair history; quarantine keeps unknown formats visible.'],
          ['Replace NULL amounts with 0', false, 'That turns missing into wrong, and 0 claims would distort every average.'],
          ['Delete the NULL rows', false, 'You would lose 8% of real claims.'],
        ]],
        ['What prevents it next time?', [
          ['A data contract with the app team (amount is a decimal, no formatting) plus a check that alerts when the NULL rate on a required field jumps', true, 'Contracts prevent it; monitoring catches it if prevention fails.'],
          ['Ask the app team to email before releases', false, 'Helpful but not enforceable or testable.'],
          ['Turn off validation so the pipeline never fails', false, 'That guarantees silent bad data.'],
        ]],
      ], 'Silent casts are one of the most common causes of wrong data. Validate types on ingest and watch NULL rates on required fields.'),
    ],
    interview: [
      talk('A source sends nested JSON events with a variable list of items. How do you model them for analytics?', `
        - Land the raw events unchanged in bronze (string or VARIANT), with load metadata. This lets you reprocess.
        - In silver, build **two tables at two grains**: one row per event/order (header fields), and one row per item (exploded array, carrying the order key). Do not mix grains in one table.
        - Use an outer explode where the parent must survive with zero items; decide how NULL, missing and empty differ.
        - Enforce types with a schema; route records that fail to a quarantine table with the reason; alert on the failure rate.
        - Handle evolution: new fields are captured (rescued column) rather than crashing the job; breaking changes go through a contract.
        - Gold aggregates are built from the right grain: order totals from the header table, part counts from the item table.`),
    ],
    hands: [
      py({ q: 'Write «flatten_claim(event)» that turns one nested claim event into **one row per part**. Each row is a dict with «claim_id», «dealer_id» (from «event["dealer"]["id"]»), «sku» and «qty» (as an **int**, even if it arrives as a string like «"2"»). If «parts» is **missing or empty**, return **one row** with «sku» and «qty» set to «None» so the claim does not disappear.', starter: 'def flatten_claim(event):\n    pass\n',
        tests: `e = {'claim_id': 9001, 'dealer': {'id': 14}, 'parts': [{'sku': 'P-77', 'qty': '2'}, {'sku': 'P-12', 'qty': 1}]}
rows = flatten_claim(e)
assert rows == [{'claim_id': 9001, 'dealer_id': 14, 'sku': 'P-77', 'qty': 2}, {'claim_id': 9001, 'dealer_id': 14, 'sku': 'P-12', 'qty': 1}], rows
assert flatten_claim({'claim_id': 1, 'dealer': {'id': 2}, 'parts': []}) == [{'claim_id': 1, 'dealer_id': 2, 'sku': None, 'qty': None}]
assert flatten_claim({'claim_id': 3, 'dealer': {'id': 4}}) == [{'claim_id': 3, 'dealer_id': 4, 'sku': None, 'qty': None}]`,
        solution: `def flatten_claim(event):
    base = {'claim_id': event['claim_id'], 'dealer_id': event['dealer']['id']}
    parts = event.get('parts') or []
    if not parts:
        return [{**base, 'sku': None, 'qty': None}]
    return [{**base, 'sku': p['sku'], 'qty': int(p['qty'])} for p in parts]` }),
    ],
  }),

  // ================================================================== OLTP vs OLAP
  oltpolap: T(`
    > **In one line:** **OLTP** (online transaction processing) systems *run* the business: many small, fast, safe reads and writes of individual records. **OLAP** (online analytical processing) systems *understand* the business: few, large queries that scan and aggregate millions of rows. They are built differently because the workloads are opposite.

    ## The problem it solves
    The dealer portal must save a claim in 50 milliseconds while 500 dealers work at once, and it must never lose or half-save one. Meanwhile management wants "average claim amount by region by month for 5 years". That query reads millions of rows. Run it on the portal's database during the day and every dealer's screen slows down. Two opposite workloads need two kinds of system.

    ## OLTP: how it works
    - **Workload:** insert, update, delete and look up *individual* records by key. "Get claim 9001", "set status to Approved".
    - **Design:**
      - **Row-oriented storage:** all columns of a row are stored together, so reading or writing one whole record is one quick operation.
      - **Indexes** on keys so a lookup touches a few pages, not the whole table.
      - **Normalised** schema (customers, dealers and claims in separate tables linked by keys) so each fact is stored once and updates are safe.
      - **ACID transactions:** Atomic (all or nothing), Consistent (constraints hold), Isolated (concurrent users don't corrupt each other), Durable (once committed, it survives a crash).
      - **Concurrency control:** locks or multi-version concurrency (MVCC) so readers and writers don't block each other badly.
    - **Data:** mostly *current* state. Old versions are often overwritten.
    - **Examples:** PostgreSQL, MySQL, Oracle, SQL Server; the databases behind CRM and ERP systems.

    ## OLAP: how it works
    - **Workload:** read-heavy queries that scan many rows, few columns, and aggregate: «SUM», «AVG», «COUNT» grouped by date, region, product.
    - **Design:**
      - **Column-oriented storage:** each column stored together. A query using 3 of 40 columns reads only those 3. Similar values sit together, so they compress 5-10× better.
      - **Massively parallel processing:** the scan is split across many cores or machines.
      - **Denormalised, dimensional models** (star schema: facts and dimensions) so queries need few joins.
      - **Partitioning and pruning:** skip whole files or blocks that cannot match (dates outside the filter).
      - Batch-oriented writes: data arrives in loads, not one row at a time.
    - **Data:** *history*, integrated from many sources.
    - **Examples:** Snowflake, BigQuery, Redshift, Synapse, Databricks SQL, ClickHouse.

    ## Why row vs column storage matters so much
    Table with 1 billion claims, 40 columns. Query: total amount by region.
    - **Row store:** must read every row in full (all 40 columns) to pick out 2. Roughly 40 units of I/O per row.
    - **Column store:** reads only «region» and «amount». Roughly 2 units per row, and those compress well. That is often 20× less data read.
    - Reverse case: "fetch claim 9001 with all 40 fields". Row store: one read. Column store: 40 separate column reads to reassemble one row. Slow for this workload.

    ## Side by side
    | | OLTP | OLAP |
    |---|---|---|
    | Purpose | Run the business | Analyse the business |
    | Typical query | One record by key | Aggregate over millions |
    | Writes | Constant, small | Bulk loads |
    | Rows touched per query | A few | Millions to billions |
    | Storage | Row-oriented | Column-oriented |
    | Model | Normalised | Dimensional, denormalised |
    | History | Current state | Years of history |
    | Users | Applications, thousands of concurrent users | Analysts, dashboards, data scientists |
    | Key metric | Latency per transaction, throughput | Query time over large scans |

    ## Why not one system for both?
    - **Resource contention:** a 5-minute analytical scan uses CPU, memory and disk I/O the transactions need.
    - **Locking and isolation:** long reads can hold resources or create pressure on MVCC versions.
    - **Wrong storage layout** for each other's workload.
    - **Integration:** analysis needs CRM + ERP + factory data; the CRM database only has CRM data.
    - **History:** OLTP overwrites; analysis needs what the value *was* last year.

    ## Alternatives to full separation
    | Option | How | Good for | Limits |
    |---|---|---|---|
    | Read replica | Copy of the OLTP database for reporting | Simple operational reports | Same row layout, single source, replication lag |
    | Operational data store (ODS) | Near-real-time integrated copy of current data | Cross-system operational reporting | Little history |
    | HTAP database | One engine with both row and column formats | Fresh analytics on live data | Cost, complexity, not all workloads |
    | Warehouse / lakehouse (separate) | Pipelines copy data out | Enterprise analytics, history, integration | Latency, data movement, more to run |

    Most enterprises use **separation**: OLTP systems feed a warehouse or lakehouse through pipelines. Data engineering *is* the bridge.

    ## In a real company pipeline
    «««flow
    CRM + ERP + MES (OLTP) -> CDC / extracts -> Lakehouse bronze -> silver -> gold star schema (OLAP) -> Dashboards, ML
    »»»
    The engineer's job at the boundary:
    - **Extract without hurting the source:** use change data capture from the transaction log, or query a replica, or extract off-peak with indexed "updated_at" filters. Never full-scan a production table every 5 minutes.
    - **Capture history** the source overwrites (slowly changing dimensions, snapshots).
    - **Reshape** from normalised to dimensional.

    ## Edge cases and what goes wrong
    - **"Just a quick report" on production** grows into a daily query that locks a hot table at month-end close.
    - **Replication lag:** the replica is 20 minutes behind; a dashboard built on it shows wrong "current" numbers at peak times.
    - **Hard deletes in OLTP:** a deleted row simply vanishes; an incremental extract on «updated_at» never sees it. You need CDC or soft deletes.
    - **Timezones:** OLTP stores local time; the warehouse mixes plants in different zones. Store UTC plus the original zone.
    - **Overwritten history:** a dealer moves from region West to North; the OLTP row is updated. Unless you capture the change, last year's West sales now show as North.

    ## At scale
    OLTP scales with indexing, partitioning, read replicas and eventually sharding (splitting rows across servers). OLAP scales with more parallel compute and smart data layout (partitioning, clustering, file sizing). Cloud warehouses **separate storage from compute**, so you can add compute for heavy hours and remove it after.

    ## How interviewers test this
    - "Why can't we run reports on the production database?" Mention contention, row layout, integration and history. Offer the replica as a short-term step and say why it is not a warehouse.
    - "Why is a column store faster for aggregates?" Reads only needed columns, compresses better, enables vectorised processing.
    - "How do you get data out of OLTP without hurting it?" CDC from the log, replicas, incremental extracts on an indexed column, off-peak windows, rate limits.
  `, {
    check: [
      mcq('A query reads 3 columns of a 50-column, 2-billion-row table and sums one of them. Which storage layout reads far less data?', ['Row-oriented', 'Column-oriented', 'Both read the same', 'Key-value'], 1, 'A column store reads only the 3 columns needed, and they compress well.'),
      mcq('An incremental extract filters «WHERE updated_at > last_run». Which change in the OLTP source will it never see?', ['A new row', 'An updated row', 'A hard-deleted row', 'A row updated twice'], 2, 'A deleted row has no updated_at to filter on. You need CDC from the transaction log, soft deletes, or periodic full comparisons.'),
      multi('Why are analytical queries usually kept off the OLTP database?', ['They compete for CPU, memory and I/O with transactions', 'Row layout is inefficient for large scans', 'They need data from other systems and history the OLTP system overwrote', 'SQL does not work on OLTP databases'], [0, 1, 2], 'OLTP databases speak SQL perfectly well. The reasons are contention, layout, integration and history.'),
      tf('A read replica of the CRM database is a data warehouse.', false, 'It isolates load, but it is single-source, row-oriented, keeps no history and may lag. Useful step, not a warehouse.'),
    ],
    scenarios: [
      scenario('The month-end slowdown', `
        Every month on the last working day, the dealer portal becomes slow between 10:00 and 12:00 and some claim submissions time out. The DBA sees a long-running query from a reporting service account reading the whole «claims» table with several joins.`, [
        ['What is the root cause?', [
          ['An analytical (OLAP) query running on the OLTP database competes with transactions at the busiest time', true, 'Right. The workloads collide.'],
          ['Dealers submit too many claims', false, 'Volume is predictable; the system copes on other days.'],
          ['The network is slow', false, 'The DBA already found the query responsible.'],
        ]],
        ['Fastest safe short-term fix?', [
          ['Point the report at a read replica (or reschedule it off-peak) and tell the report owner', true, 'Isolates the load today with minimal change.'],
          ['Kill the query every time it runs', false, 'Treats the symptom and breaks the report.'],
          ['Add more indexes to the claims table', false, 'Indexes help lookups, not full-table aggregates, and slow down writes.'],
        ]],
        ['Long-term fix?', [
          ['Build the report on the warehouse/lakehouse fed by CDC, with a proper dimensional model', true, 'Separating workloads is the durable answer, and it adds history and integration.'],
          ['Buy a bigger database server', false, 'Expensive and the contention returns as data grows.'],
          ['Ban reports at month-end', false, 'Month-end is exactly when finance needs them.'],
        ]],
      ], 'This is the classic reason analytics moves off OLTP.'),
    ],
    interview: [
      talk('Explain OLTP vs OLAP to a non-technical manager, then to a senior engineer.', `
        **Manager version:** "The systems that run the business, like the dealer portal, are built to save one claim very quickly and safely while hundreds of people use them. Analysis needs to read millions of claims at once. If we do that on the same system, the portal slows down. So we copy data into an analytics platform built for big reads, and that also lets us combine it with finance and factory data and keep years of history."

        **Engineer version:** OLTP: row store, normalised, indexed point lookups, ACID with MVCC, many concurrent short transactions, current state. OLAP: columnar, compressed, vectorised MPP scans, partition pruning, dimensional models, bulk loads, history. Separation avoids contention, fits the layout to the workload and allows integration. Getting data across: log-based CDC to avoid load on the source, SCD for history the source overwrites. HTAP blurs the line but costs more and suits specific near-real-time cases.`),
    ],
    hands: [
      sql({ q: 'An **OLAP-style** question on the practice warehouse: for each dealer **region**, return «region», «claims» (count), «total_claimed» (sum of «claim_amount», rounded to 2 dp) and «approval_rate_pct»: the percent of claims with status «Approved» (rounded to 1 dp). Sort by «total_claimed» descending. Notice it scans every claim and touches only a few columns.', tables: ['claims', 'dealers'], level: 2,
        solution: `SELECT d.region,
       COUNT(*) AS claims,
       ROUND(SUM(c.claim_amount), 2) AS total_claimed,
       ROUND(100.0 * SUM(CASE WHEN c.status = 'Approved' THEN 1 ELSE 0 END) / COUNT(*), 1) AS approval_rate_pct
FROM claims c
JOIN dealers d ON d.dealer_id = c.dealer_id
GROUP BY d.region
ORDER BY total_claimed DESC;`,
        hint: 'Join claims to dealers, GROUP BY region, and use SUM(CASE WHEN … THEN 1 ELSE 0 END) for the approved count. Multiply by 100.0 to avoid integer division.' }),
    ],
  }),
};
