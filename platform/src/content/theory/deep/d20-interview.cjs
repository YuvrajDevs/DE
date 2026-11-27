// Hard interview bank, attached to the topics they test. Cards with area:'project' show under
// "Your projects"; tag 'hr' shows under "Behavioural and competencies".
const { talk } = require('../_t.cjs');
const P = (q, a) => Object.assign(talk(q, a, 'design'), { area: 'project' });
const HR = (q, a) => talk(q, a, 'hr');

module.exports = {
  // ---------------------------------------------------------------- resume grilling: Turbofan
  semantics: { interview: [
    P('Turbofan: you say 54,787 of 54,787 events with 0 lost and 0 duplicated. How exactly did you compute "expected", and why should I trust that number?', `
      - **Expected** comes from a **producer manifest**, not from Kafka: every event the producer intended to send has a unique (engine_id, cycle) / event id; chaos duplicates, late copies and malformed records are recorded separately. Valid unique expected = all intended valid events (54,787).
      - **Observed** is silver after the run: count, distinct event ids, ids missing vs the manifest, ids not in the manifest.
      - **Why trust it:** the check is independent of the pipeline's own logic (set comparison against the manifest), it ran **after a kill -9 mid-stream and a restart**, and duplicates (2,227) and late events (1,386) were injected on purpose. The malformed 438 are accounted for in the dead-letter table with reason codes, so in = silver + DLQ.
      - **Limits I would admit:** one machine, one crash point per run, Kafka itself not killed; production would add broker failures, repeated crash points and longer runs.`),
    P('Why did your silver layer need deduplication at all if Spark + Delta is exactly-once?', `
      - Exactly-once in Structured Streaming covers **Kafka → Spark → Delta replays**: a micro-batch re-run after a crash is not committed twice.
      - It does **not** cover duplicates that are already **in Kafka**: producer retries before idempotence, device resends after timeouts, upstream replays. My chaos producer injected 2,227 such duplicates.
      - So silver deduplicates on the event id **within a watermark** (bounded state). Events duplicated outside the watermark would need a batch dedupe/MERGE as a safety net.`),
  ] },
  sizing: { interview: [
    P('Turbofan sustained 3,000 events/s on 4 cores. If Cummins has 500,000 connected engines reporting every 10 seconds, what does your design need?', `
      - **Load:** 500,000 / 10 = 50,000 events/s average; assume ~5× peak → 250,000 events/s. That is ~17× my measured sustained rate on 4 cores at average, ~80× at peak.
      - **Linear-ish scaling estimate:** stateless bronze/silver scale with partitions and cores; at ~750 events/s/core end to end that is ~65 cores average, ~330 at peak, before optimisation. The **stateful gold step** was my bottleneck (found via Delta commit history), so it gets redesigned first: larger trigger intervals, RocksDB state store, MERGE pruned by partition/cluster, or moving per-engine state into a dedicated stateful operator instead of MERGE each batch.
      - **Kafka/Event Hubs:** partitions sized for consumer parallelism (e.g. 64-128), keyed by engine_id.
      - **Honest caveat:** extrapolation from a laptop is a hypothesis; I would load-test at 2-3 target points and find the knee.`),
  ] },
  sss: { interview: [
    P('In Turbofan the gold layer uses foreachBatch + MERGE. Why not just write an aggregation stream to Delta?', `
      - Gold holds **per-engine state** (latest health score, alert levels already raised) that must be **updated in place**, not appended; and alerts must be raised **once per engine × level**.
      - A streaming aggregation in append mode only emits finalised windows; complete mode rewrites everything each batch (does not scale); update mode needs an upsert sink anyway.
      - foreachBatch gives a normal DataFrame per micro-batch, so I can compute the new state and **MERGE on engine_id** (idempotent by key) and insert alerts with **MERGE on (engine_id, level)**, which made the 425 alerts exactly 425 distinct.
      - **Trade-off:** foreachBatch is at-least-once by itself; correctness comes from the MERGE keys. And MERGE per batch was the throughput bottleneck at high rates.`),
    P('What happens in Turbofan if you change the silver watermark from 30 seconds to 10 minutes and restart from the same checkpoint?', `
      - Watermark delay is query configuration, not state schema, so the query restarts; the new delay applies from the next batch (the watermark never moves backwards).
      - **Effect:** dedupe state keeps ~10 minutes of event ids instead of 30 s: more state memory, more late events accepted (fewer drops), outputs of later operators delayed accordingly.
      - **Riskier changes** would be changing dedupe keys or adding a stateful operator: those can be incompatible with the checkpoint, requiring a new checkpoint plus backfill from bronze.`),
  ] },
  predmaint: { interview: [
    P('Your first health index missed 44% of FD003 engines. How did you find it, and how do you know your fix is not overfitted?', `
      - **Found it** by evaluating **per fleet / per fault mode** instead of one global number: FD001 looked perfect, FD003 detection was 56%. Investigating missed engines showed fan faults move four sensors in the **opposite** direction to compressor faults, so their contributions cancelled in one combined score.
      - **Fix:** score both fault patterns separately, take the worse, label each alert HPC or FAN.
      - **Overfitting guard:** thresholds tuned on a subset of engines and **validated on held-out engines**; I reported lead time (median 44 cycles, p10 25) and false-alarm counts, not just detection rate; and the result moved from 56% to 100% **with no extra false alarms**.
      - **Caveat:** C-MAPSS is simulated; real engines need validation against maintenance records and operating regimes.`),
  ] },
  rag: { interview: [
    P('Strata: you report 100% Hit@5 vs 52% for keyword search on 25 questions. What would a sceptical interviewer say, and how do you answer?', `
      - **Sceptic:** 25 questions is a tiny eval set; you may have written questions that suit your retrieval; Hit@5 ignores answer quality.
      - **Answer:** agreed it is small; the point was a **controlled comparison** on the same set (hybrid RRF vs keyword) to choose an approach. Next steps I would take: a larger, independently written question set, stratified by question type; report MRR/recall@k with confidence intervals; evaluate generation (groundedness, correctness) separately; track retrieval metrics as a regression test whenever chunking or embeddings change.
      - **Why hybrid won:** exact terms (company names, form types) favour keyword; paraphrased questions favour embeddings; reciprocal rank fusion combines both without score normalisation.`),
  ] },
  ingestion: { interview: [
    P('Strata ingests YC and SEC Form D data "through Kafka with idempotent upserts". Why Kafka for a few hundred companies? Isn\'t that over-engineering?', `
      - Honest answer: at 465 companies Kafka is not needed for **volume**; a scheduled batch job would work.
      - I used it deliberately to practise an **event-driven design**: decoupled producers (one per source) and consumers (enrichment, indexing), replay when I changed parsing, and idempotent upserts keyed by company/filing id so replays are harmless.
      - In a real team I would choose by requirements: low volume + daily freshness → batch; multiple consumers, replay and near-real-time → a log like Kafka/Event Hubs. Knowing when **not** to use a tool is part of the answer.`),
    HR('Your resume says Software Engineer at Dealermatix; you describe yourself as a data analyst working for Cummins as a supplier. Which is it, and what exactly do you do?', `
      - Be precise and consistent: "My title is Software Engineer at Dealermatix Technologies; my work is data analytics and Salesforce data pipelines. Dealermatix delivers work to Cummins as a supplier, so my day-to-day data comes from Cummins-related Salesforce processes."
      - Then concrete DE-flavoured work: extracting Salesforce objects (SOQL/API), cleaning and standardising inconsistent client records, validation rules, building analysis-ready datasets and dashboards, reconciling metrics with business users.
      - Be careful with **confidentiality**: describe the shape of the work (objects, volumes, problems, fixes), not client-confidential data.
      - Close with why it matters for this role: "I already know the warranty/service data flows and the people who use them; I want to own the pipelines and platform, not only the reports."`),
  ] },
  oltpmodel: { interview: [
    P('You build Salesforce pipelines today. How would you incrementally extract Case and WorkOrder objects into a lakehouse, including deleted records, within API limits?', `
      - **Incremental key:** «SystemModstamp» (changes on any system update, indexed) rather than LastModifiedDate; overlap window + dedupe by Id and SystemModstamp.
      - **Deletes:** «queryAll» / «IsDeleted = true» for soft-deleted (recycle bin) records within its retention, or the getDeleted API; periodic full Id reconciliation to catch hard deletes after the recycle bin is emptied.
      - **Volume and limits:** Bulk API 2.0 for large extracts (asynchronous jobs, PK chunking for big objects); REST for small deltas; monitor daily API limit consumption; or Change Data Capture / Platform Events streamed into Kafka/Event Hubs for near-real-time.
      - **Landing:** raw JSON in bronze with extract metadata; silver typed with picklist mapping, record types, and relationship Ids resolved to surrogate keys; SCD2 where history matters (Case status history comes from CaseHistory/field history, not the Case row).`),
  ] },

  // ---------------------------------------------------------------- rapid "why" chains
  sparkarch: { interview: [
    talk('Rapid fire: Why is Spark lazy? Why does that make "count then write" slow? What is the fix? When is caching wrong?', `
      - **Lazy** so the optimiser sees the whole plan (pushdown, pruning, join choice) before running anything.
      - **Count then write** = two actions = the lineage runs twice (two full reads and computations).
      - **Fix:** take counts from the write's metrics (Delta operation metrics, «DESCRIBE HISTORY»), or cache if the DataFrame is reused several times, or count the written table (cheap with stats).
      - **Caching is wrong** when the data is used once, is bigger than memory (spills and evicts other work), or the source is a fast columnar table with disk cache.`),
    talk('Rapid fire: Narrow vs wide? Which of these shuffles: filter, union, distinct, join with a 5 MB table, repartition(10), coalesce(10), orderBy, window with PARTITION BY?', `
      - filter: no. union: no. distinct: **yes**. join with 5 MB table: **no** (broadcast). repartition(10): **yes**. coalesce(10): no (merges partitions; can collapse upstream parallelism). orderBy: **yes** (range partitioning + sampling job). window with PARTITION BY: **yes** (shuffle by partition key + sort), unless already partitioned that way.`),
  ] },
  joinstrat: { interview: [
    talk('A 3 TB fact must join a 2 GB dimension. Broadcast or not? Walk through the trade-off.', `
      - 2 GB is far above the default 10 MB threshold and risky to broadcast: it is collected to the driver, then sent to every executor, and must fit in each executor's memory alongside the work (×N executors of network traffic).
      - **Options:** (1) shrink the dimension first: select only needed columns, filter to relevant keys (often ≪ 2 GB), then broadcast; (2) sort-merge join with good partitioning; (3) bucket/cluster both by the key if the join repeats daily; (4) let AQE decide after filters.
      - **Decide by measuring:** the post-filter size of the dimension, executor memory, and runtime of both plans.`),
  ] },
  partsize: { interview: [
    talk('Explain the small files problem to a manager in one sentence, then to an engineer in detail with numbers.', `
      - **Manager:** "We stored the data as millions of tiny pieces, and the computer now spends most of its time opening pieces instead of reading data, so reports are slow and storage calls cost more."
      - **Engineer:** each file costs a LIST/GET/footer read (~tens of ms on object storage) and a metadata entry; 4 million 200 KB files ≈ 800 GB but planning lists 4M objects and opening them dominates runtime; the same 800 GB as 1 GB files is 800 files. Causes: tiny micro-batches × many partition values; over-partitioned shuffles before writes. Fixes: coarse partitioning, repartition by partition column before write, optimized writes/auto compaction, OPTIMIZE/liquid clustering, longer triggers.`),
  ] },
  delta: { interview: [
    talk('Two jobs write to the same Delta table: a streaming job appending to today\'s partition and a nightly job that deletes rows older than 2 years. Will they conflict? When would they?', `
      - Appends do not conflict with each other; a DELETE conflicts with a concurrent writer only if they touch the **same files** (or the append adds data matching the DELETE's predicate under serializable checks).
      - Here the DELETE's predicate is on old dates and the stream appends today's data. With the table **partitioned by date** (or the predicate allowing file pruning by stats), Delta sees disjoint files: **no conflict** under WriteSerializable.
      - **Conflicts would appear** if the DELETE scanned the whole table without a partition predicate (ConcurrentAppendException, since it "read" the partitions the stream appended to), or if both rewrote the same files (e.g. an OPTIMIZE and a MERGE on overlapping files: Databricks row-level concurrency reduces this).
      - Mitigation: partition predicates in conditions, schedule maintenance when streams are light, retries with backoff.`),
  ] },
  statefulstream: { interview: [
    talk('Explain watermarks to me as if I were a plant manager, then the edge cases as if I were a senior engineer.', `
      - **Manager:** "We wait a short time for readings that arrive late before we finalise each 5-minute summary. Readings that come later than that are counted separately, so the summary is both timely and almost complete."
      - **Engineer:** watermark = max event time seen − delay, per micro-batch (min across inputs). Windows end-before-watermark are finalised and state dropped; rows older than the watermark are dropped (monitor numRowsDroppedByWatermark). Edge cases: a device with a future clock jumps the watermark (clamp/validate timestamps); multiple inputs default to the min watermark (one idle source holds back output; «withWatermark» per input and idle source handling); stream-stream joins need time bounds; changing delay is safe but changing stateful keys is not; output only appears after watermark advances, so with no new data nothing is emitted (idle streams).`),
  ] },
  kafkawhat: { interview: [
    talk('Rapid fire on Kafka: What is a partition? Why is ordering only per partition? What does acks=all guarantee? What is an ISR? What happens if a consumer group has more consumers than partitions? Does Kafka 4 still need ZooKeeper?', `
      - **Partition:** an ordered, append-only log; the unit of parallelism, ordering and replication.
      - **Ordering per partition:** different partitions are written and read independently (different brokers, consumers), so no global order is maintained.
      - **acks=all:** the leader acknowledges only after all **in-sync** replicas have the record; with min.insync.replicas=2 and RF=3, one broker can fail without losing acknowledged data.
      - **ISR:** replicas caught up with the leader within replica.lag.time.max.ms.
      - **More consumers than partitions:** extra consumers idle (classic groups). Kafka 4.2 share groups are the exception for queue-style consumption.
      - **ZooKeeper:** no. Kafka 4.0 removed it; metadata is managed by KRaft controllers.`),
  ] },
  pyconc: { interview: [
    talk('You need to enrich 2 million claim records by calling an internal REST API that allows 50 requests/second. Design the Python job.', `
      - **Throughput math:** 2,000,000 / 50 ≈ 40,000 s ≈ 11 hours at the limit. First ask: is there a **bulk endpoint** or a database/CDC feed instead? That changes everything.
      - If not: a bounded concurrent client (asyncio + semaphore or a thread pool) with a **client-side rate limiter** (token bucket at ~45 req/s), timeouts, retries with exponential backoff + jitter on 429/5xx honouring Retry-After, no retries on 4xx data errors.
      - **Resumability:** process in chunks; persist results and a checkpoint (last processed id / set of done ids) after each chunk; on restart skip done ids. Results written idempotently (MERGE by claim id).
      - **Incremental thereafter:** only new/changed claims daily.
      - **Observability:** progress, error rates by status code, ETA; DLQ for permanently failing ids.`),
  ] },
  pyerrors: { interview: [
    talk('Code review: a teammate wraps the whole daily load in «try: … except Exception as e: print(e)». What do you say?', `
      - **Problem:** every failure, including bugs and partial writes, is swallowed: the task exits 0, the orchestrator marks success, downstream reads incomplete data, nobody is alerted. «print» also bypasses logging/alerting.
      - **Better:** catch only expected, recoverable errors where they happen (retry transient I/O; quarantine bad records with reasons); log with context using «logging» (or «log.exception»); **re-raise** unexpected exceptions so the task fails visibly; make the write atomic/idempotent so a failed run leaves no partial state.
      - Say it constructively: propose the change, explain the incident it prevents.`),
  ] },
  isolation: { interview: [
    talk('A nightly extract from a production SQL Server table takes 2 hours under READ COMMITTED while the application keeps updating rows. What inconsistencies can your extract contain, and how do you avoid them?', `
      - Under read committed each statement (or each page read, depending on the engine) sees data committed at that moment: rows updated during the 2-hour scan may appear in the **old or new** state; a row moved by an update (e.g. index key change) can be read **twice or missed**; related tables extracted at different times do not match each other (an order without its new lines).
      - **Avoid:** snapshot isolation (RCSI/SNAPSHOT) or a database snapshot so the whole extract sees one point in time; extract from a replica/backup at a known point; or switch to CDC with a consistent initial snapshot; extract related tables in one snapshot.
      - **Validate:** reconcile counts/totals against the source as of the snapshot time.`),
  ] },
  dml: { interview: [
    talk('Partition overwrite vs MERGE for a daily fact load where late records can update the last 7 days. Which and why?', `
      - **Partition overwrite of the last 7 days** (replaceWhere date >= today-7): recompute those 7 partitions fully from silver each run. Simple, idempotent, handles inserts, updates and deletes inside the window (deleted source rows disappear on recompute), cost = 7 days of data per run.
      - **MERGE:** processes only changed rows; better when the window is long (90 days) or partitions are huge and changes tiny; but needs a correct change set, unique keys, delete handling, and pruning conditions to avoid rewriting many files.
      - **My default:** overwrite the window if 7 days of recompute is cheap; MERGE when it is not. Either way, changes older than 7 days go through a restatement process.`),
  ] },
  pii: { interview: [
    talk('Dealers should see only their own claims in a Power BI report built on Databricks, and customer phone numbers must be hidden from everyone except the warranty team. Implement it.', `
      - **Row level:** a Unity Catalog **row filter** function on the claims table: return true when the user is in the warranty-admin group, or when dealer_id is in the set mapped to the user's dealer groups (a mapping table of group → dealer_ids). Power BI connects with **per-user identity** (SSO / OAuth passthrough to the SQL warehouse) so the filter applies per user; with a shared service account the filter cannot distinguish users (then use Power BI RLS as well, knowing it only protects that report).
      - **Column level:** a **column mask** on phone: show the value if «is_account_group_member('warranty-team')», else a masked string.
      - **Verify:** test as users from different groups; audit logs; document in the data product.`),
  ] },
  databricks: { interview: [
    talk('Rapid fire on Databricks: job cluster vs all-purpose? What is Photon? What does Unity Catalog govern? What does Auto Loader store in its checkpoint? What replaced Delta Live Tables\' name?', `
      - **Job cluster:** created per run, cheaper, isolated; **all-purpose:** interactive, shared, billed while up.
      - **Photon:** vectorised native engine for SQL/DataFrame operations; no help for Python UDFs.
      - **Unity Catalog:** tables, views, volumes, functions, models, external locations/storage credentials, with grants, row filters/column masks, lineage, audit.
      - **Auto Loader checkpoint:** which files were discovered and processed (RocksDB), plus stream offsets; schema location holds inferred/evolved schemas.
      - **DLT** is now **Lakeflow Spark Declarative Pipelines** (open-source core: Apache Spark Declarative Pipelines in Spark 4.1); AUTO CDC replaced APPLY CHANGES INTO.`),
  ] },
  hbase: { interview: [
    talk('The posting lists HBase, Accumulo, Cassandra, MongoDB and DynamoDB. Give me one sentence on when you would pick each, and what they have in common for a data engineer.', `
      - **HBase:** consistent, random read/write on huge sparse tables inside a Hadoop/HDFS estate.
      - **Accumulo:** like HBase but with **cell-level security labels**, for environments where each cell's visibility is controlled.
      - **Cassandra:** very high write throughput, multi-datacentre, always-on, queries known in advance (telemetry by device and day).
      - **MongoDB:** document model for nested, evolving entities with flexible queries and secondary indexes.
      - **DynamoDB:** fully managed key-value/document store on AWS with predictable single-digit-ms lookups at any scale.
      - **In common for a DE:** they are **sources or serving stores, not analytics engines**: you extract via CDC/streams/connectors into the lakehouse, design keys for access patterns, and never run analytical scans on them in production.`),
  ] },
  scalajava: { interview: [
    talk('You know Python. The posting says Scala/Java. How would you get productive on a Scala Spark codebase in two weeks?', `
      - **Week 1:** read the code before writing: case classes as schemas, Dataset vs DataFrame, implicits for encoders, Option/pattern matching, sbt/Maven builds and how jobs are packaged (fat jars) and submitted. Map each Scala job to the equivalent PySpark mentally; the Spark API is nearly identical.
      - **Week 2:** make small changes with tests (ScalaTest), run locally, read stack traces; pair with a teammate for review.
      - **Why it is realistic:** Spark concepts (plans, shuffles, partitions, Delta) are language-independent and are where most of the difficulty lives; syntax is the smaller part.`),
  ] },
  agile: { interview: [
    HR('Competency, customer focus: a plant quality manager wants "all sensor data in Excel every morning". What do you do?', `
      - **Understand the need behind the request:** which decisions, which engines/plants, which signals, what time window. "All sensor data" is likely millions of rows, beyond Excel's 1,048,576-row limit and not useful.
      - **Propose options:** a Power BI/Databricks dashboard with the KPIs they review each morning; an exception report (engines outside limits); a curated extract with only needed columns/aggregates if Excel is truly required.
      - **Agree acceptance criteria** (which metrics, freshness by 07:00, how to verify) and deliver a thin version fast, then iterate.
      - **Close the loop:** check usage after two weeks.`),
    HR('Competency, values differences: you are a supplier-side engineer joining a Cummins team. How do you handle being new, from a different company culture, with teammates in the US and India?', `
      - **Learn context first:** team norms, decision makers, how work is planned; ask questions early rather than guess.
      - **Communication across time zones:** written updates with decisions and open questions, overlap hours used for discussions, clear handovers.
      - **Value different approaches:** e.g. a US teammate prefers detailed design docs, an India teammate prefers prototypes; combine: a short design note plus a spike.
      - **Supplier experience helps:** I already know the business processes and data from the outside; I will bring that perspective while respecting internal standards.`),
    HR('Tell me about a time you had to deliver with incomplete requirements. (Decision quality)', `
      - Use STAR with a real Dealermatix example: a client wanted a dashboard metric whose definition was ambiguous (e.g. "resolved cases").
      - **Situation/Task:** deadline fixed, definition unclear, two plausible interpretations giving different numbers.
      - **Action:** documented both definitions with sample numbers, chose the one matching the client's existing process for the first release, flagged the assumption visibly on the dashboard, scheduled a review with the business owner.
      - **Result:** delivered on time, the owner confirmed (or changed) the definition with a one-line change because the logic was isolated.
      - **Learning:** make assumptions explicit and cheap to reverse.`),
  ] },
  requirements: { interview: [
    HR('Competency, system requirements engineering: what does "traceability" mean to you for a data pipeline, concretely?', `
      - Every requirement (e.g. "claims approval rate by dealer, daily by 07:00, matches finance report within 0.5%") has an ID that links to: the design element (gold table/metric definition), the code (PR/commits), the tests (data tests and reconciliation against the finance report), and the validation evidence (test run, sign-off).
      - When a requirement changes, traceability shows **impact**: which tables, dashboards, tests and consumers change (lineage helps).
      - Tools: tickets linked to PRs, test results in CI, metric definitions in the semantic layer, catalog documentation.`),
  ] },
  rca: { interview: [
    HR('Walk me through a real incident from your work or projects using a blameless RCA format.', `
      - **Use Turbofan or Dealermatix.** Example structure (Turbofan FD003 miss): **Impact:** 44% of fan-fault engines would not have been warned. **Detection:** per-fleet evaluation. **Timeline:** model v1 → per-fleet calibration → missed engines inspected. **Root cause:** two fault modes move sensors in opposite directions; one combined score cancelled them. **Contributing factor:** evaluation only on the aggregate. **Fix:** fault-mode-aware scoring, held-out validation. **Prevention:** per-segment metrics as a standing test; documented in an ADR.
      - Keep it specific: numbers, the evidence you looked at, what you changed in the process, not just the code.`),
  ] },
  whatde: { interview: [
    HR('You have about five months of professional experience. Why should we hire you for a role that prefers experienced candidates?', `
      - Do not apologise; show evidence: "My titles are short, but I have built the things this role needs end to end."
      - **Evidence:** Turbofan (Kafka → Spark Structured Streaming → Delta, exactly-once verified under crash, load-tested, documented failures), Strata (event-driven ingestion, idempotent upserts, RAG evaluation), daily Salesforce pipeline and data quality work that already touches Cummins processes.
      - **Depth:** offer to go as deep as they want on any concept in the posting (Spark internals, CDC, SCD2, Delta concurrency).
      - **Fit:** I know the business data from the supplier side, which shortens onboarding.
      - Close: "I will be the person who checks the numbers and writes the test before someone else finds the bug."`),
  ] },
};
