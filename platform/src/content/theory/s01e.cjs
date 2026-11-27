const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Ingestion and integration
  ingestion: T(`
    > **In one line:** **ingestion** is getting data *out of* a source and *into* your platform reliably. **Integration** is making data from *different* sources work *together*: same keys, same codes, same meaning. Ingestion moves data; integration makes it fit.

    ## The problem it solves
    The posting says you will ingest from "relational, event-based and unstructured sources". Each source speaks differently: a database you can query, an API with rate limits and pagination, Kafka events that never stop, SFTP files dropped at random times, photos uploaded by dealers. And once it is all in, dealer «D-014» in the CRM is «14» in the ERP and «DLR0014» in the warranty system. Ingestion solves the first problem, integration the second.

    ## Ingestion: the methods
    | Method | How | Good for | Watch out for |
    |---|---|---|---|
    | **Full extract** | Read the whole table every run | Small tables, sources with no change tracking, periodic reconciliation | Cost grows with size; load on source |
    | **Incremental by watermark** | «WHERE updated_at > last_watermark» | Tables with a reliable, indexed «updated_at» | Misses hard deletes; clock/timezone issues; rows updated without changing «updated_at» |
    | **CDC (change data capture)** | Read the database's transaction log (Debezium, native CDC) | Every insert, update, delete, low latency, low source load | Setup and permissions; schema changes; ordering; initial snapshot |
    | **API pull** | Call REST/GraphQL endpoints with pagination | SaaS apps (CRM) | Rate limits (429), pagination bugs, token expiry, changing payloads |
    | **Webhooks / push** | Source calls you when something changes | Low latency without polling | Missed calls if you are down; need replay; security of the endpoint |
    | **Event streams** | Subscribe to Kafka/Event Hubs topics | Continuous events, IoT, app events | Offsets, duplicates, ordering, schema evolution |
    | **File drops** | Source writes files to SFTP/object storage | Batch exports, partners, legacy systems | Partial files, late/duplicate files, naming, encodings |
    | **Bulk/unstructured** | Copy objects (images, PDFs) plus metadata | Documents, media | Size, integrity checks, sensitive content |

    ## Pull vs push
    - **Pull:** your pipeline asks the source on a schedule. You control timing and load, but add latency and must track what you already read.
    - **Push:** the source sends to you (events, webhooks, file drops). Low latency, but you must be always available, absorb bursts and handle replays.

    ## The ingestion checklist (what makes it reliable)
    1. **Track position:** watermark, offset or list of processed files, stored durably and updated **only after** the data is safely written. Updating it first loses data on a crash.
    2. **Overlap and dedupe:** re-read a small overlap (e.g. watermark minus 10 minutes) to catch records committed late with older timestamps, then deduplicate by key. Safer than an exact boundary.
    3. **Land raw first** with metadata: «_source», «_ingested_at», «_batch_id», «_file_name». You can always reprocess.
    4. **Validate at the door:** schema, required fields, file completeness (row counts in a trailer or a «_SUCCESS» marker, checksums).
    5. **Be polite to sources:** rate limits, backoff with jitter on 429/5xx, read from replicas, off-peak windows, small page sizes.
    6. **Handle deletes:** CDC, soft-delete flags, or periodic full key comparisons.
    7. **Secrets:** credentials from a vault/key store, never in code; least-privilege read accounts.
    8. **Observe:** rows per run, lag behind source, failed pages/files, freshness per source.

    ## Integration: making sources fit together
    After landing, data from different sources must be **conformed**:
    - **Key mapping:** a crosswalk table «dealer_xref(source, source_id, dealer_key)» maps each system's identifier to one master key.
    - **Code standardisation:** "Approved", "APPROVED", "A", "1" → one value.
    - **Units and currencies:** kPa vs psi, INR vs USD with the rate at transaction date.
    - **Time:** convert to UTC, keep original zone; align business calendars (fiscal months).
    - **Entity resolution:** the same customer appears with slightly different names/addresses. Rules or fuzzy matching create a **golden record** (master data management, MDM).
    - **Semantic agreement:** what "active", "revenue", "claim date" mean, documented once.
    Integration is where most business logic and most arguments live.

    ## Ingestion vs integration
    | | Ingestion | Integration |
    |---|---|---|
    | Question | How do we get the data in, reliably? | How do we make it consistent and joinable? |
    | Layer | Source → bronze | Bronze → silver (conformed) |
    | Skills | Connectors, protocols, incremental logic, reliability | Data modelling, business rules, MDM, quality |
    | Failure looks like | Missing or duplicated records | Wrong joins, mismatched totals, double counting |

    ## Edge cases and what goes wrong
    - **Watermark on a non-monotonic column:** a long transaction commits at 10:05 with «updated_at = 09:58»; your 10:00 run already moved the watermark to 10:00, so the row is skipped forever. Fix: overlap window, or CDC.
    - **Timezone mismatch:** source stores local time without zone; daylight-saving shifts create an hour of duplicates or gaps.
    - **Pagination drift:** paging by offset while records are being inserted shifts pages and skips or repeats records. Use cursor/keyset pagination ordered by a stable key.
    - **Partial files:** you pick up a file while the partner is still writing it. Require a completion marker, or a rename-on-complete convention, and validate row counts.
    - **Same file twice:** the partner re-sends yesterday's file with the same name. Track processed file names + checksums; make loads idempotent.
    - **API returns 200 with an error body**, or an empty list on auth failure. Validate payloads, not just status codes.
    - **Schema change at source:** new column, renamed column, type change. Contracts plus schema checks; capture unknown fields instead of crashing.
    - **Initial load vs ongoing:** the first load of 5 years of history needs a different, chunked, throttled approach than the daily delta.

    ## At scale
    - Thousands of tables: **metadata-driven ingestion** (one generic pipeline reading a config table of sources, keys and watermark columns) instead of one hand-written job per table.
    - Managed connectors (Azure Data Factory, Fivetran, Airbyte, Kafka Connect + Debezium) for common sources; custom code only where needed.
    - Large initial loads are parallelised by key ranges or partitions and throttled to protect the source.
    - Large files: split, compress, upload in parallel chunks with retries and checksums (see large file movement).

    ## How interviewers test this
    - "How would you ingest a 500 GB table that changes every day?" One-time chunked snapshot, then CDC or watermark-based increments, MERGE into the target, deletes handled, reconciliation counts.
    - "Watermark vs CDC?" Watermark is simple but misses deletes and late commits; CDC is complete and low-impact but more setup.
    - "Two systems use different dealer IDs. How do you join them?" Crosswalk/master key table, owned and tested; unmatched records reported, not silently dropped.
  `, {
    check: [
      mcq('Your ingestion job writes data, then updates the watermark. What if you reversed the order (update watermark first, then write)?', ['Nothing changes', 'A crash between the two steps would skip that data forever', 'It would be faster and safe', 'It would duplicate data'], 1, 'Advance position only after the data is durably written. If anything, a crash should cause a harmless re-read, not a gap.'),
      mcq('Paging an API with «?offset=100&limit=100» while new records are being created can…', ['Never cause problems', 'Skip or repeat records because pages shift as rows are inserted', 'Only fail on weekends', 'Cause rate limiting'], 1, 'Prefer cursor/keyset pagination on a stable sort key.'),
      tf('Incremental extraction on «updated_at» captures rows that were hard-deleted in the source.', false, 'Deleted rows have no row to read. Use CDC, soft deletes or periodic key comparisons.'),
      match('Match the problem to the integration technique.', [['Dealer has different IDs in CRM and ERP', 'Crosswalk table to a master key'], ['"APPROVED", "A" and "1" mean the same', 'Code standardisation'], ['Same customer spelled two ways', 'Entity resolution / golden record'], ['Pressure in psi and kPa', 'Unit conversion to one standard']], 'Integration conforms data so it can be joined and compared.'),
      multi('Which make file-drop ingestion reliable?', ['A completion marker or rename-on-complete before reading', 'Tracking processed file names and checksums', 'Validating row counts against a trailer', 'Reading files the moment they appear'], [0, 1, 2], 'Reading immediately risks partial files.'),
    ],
    scenarios: [
      scenario('Records that never arrive', `
        Reconciliation shows the silver «claims» table has 0.4% fewer claims than the CRM, always a few per day. Ingestion runs every 15 minutes with «WHERE last_modified > :watermark», and sets the new watermark to the run start time.`, [
        ['What is the most likely cause?', [
          ['Transactions that commit after the run started but carry an earlier «last_modified» fall behind the new watermark and are never read', true, 'Long transactions and clock differences make timestamps non-monotonic at the boundary.'],
          ['The CRM API is losing data', false, 'The records exist in the CRM; your extract misses them.'],
          ['Silver deduplication is too aggressive', false, 'Possible, but the pattern of a few per day at boundaries points to the watermark.'],
        ]],
        ['Which fix is safest?', [
          ['Re-read with an overlap (e.g. watermark minus 30 minutes) and MERGE by «claim_id», so overlap re-reads are harmless', true, 'Overlap + idempotent merge closes the gap at little cost.'],
          ['Run every minute instead', false, 'The boundary problem stays, just at a finer scale.'],
          ['Do a full extract every 15 minutes', false, 'Correct but expensive and hard on the source.'],
        ]],
        ['How do you recover the missing history?', [
          ['A one-time backfill: extract the affected period (or keys missing per reconciliation) and MERGE them in', true, 'Idempotent merge makes the backfill safe.'],
          ['Ignore it: 0.4% is small', false, 'Missing claims mean missing money in finance reports.'],
          ['Ask dealers to resubmit', false, 'The data is in the source; recover it yourself.'],
        ]],
      ], 'Exact watermark boundaries are fragile. Overlap plus idempotent merge, and reconcile counts with the source.'),
    ],
    interview: [
      talk('How would you ingest a large, frequently changing table from a production database?', `
        - **Initial load:** snapshot in chunks by primary-key range or date, from a replica if possible, throttled, off-peak; record row counts per chunk.
        - **Ongoing:** CDC from the transaction log (e.g. Debezium → Kafka, or native CDC) to capture inserts, updates and deletes with little source load; if CDC is unavailable, watermark on an indexed «updated_at» with an overlap window plus periodic delete detection.
        - **Landing:** raw changes to bronze with metadata (operation type, commit time, offset).
        - **Apply:** MERGE into silver by primary key, ordered by commit sequence, deletes applied or flagged; idempotent so replays are safe.
        - **Reliability:** position stored after durable write, retries with backoff, schema-change detection, reconciliation of counts/sums against the source daily, freshness and lag alerts.
        - **Security:** read-only least-privilege account, secrets in a vault.`),
      talk('What is the difference between data ingestion and data integration?', `
        - **Ingestion** gets data from a source into the platform reliably: connectors, incremental logic, positions, retries, raw landing, validation. Failure = missing or duplicate records.
        - **Integration** makes data from different sources consistent and joinable: key crosswalks/master data, code standardisation, units, currencies, time zones, entity resolution, shared definitions. Failure = wrong joins and numbers that do not reconcile.
        - In medallion terms: ingestion is source → bronze; integration is bronze → conformed silver.`),
    ],
    hands: [
      sql({ q: 'Incremental extraction with a **watermark**: the «etl_watermarks» table holds the last loaded time for pipeline «orders». Return the events from «raw_orders_feed» with «ingested_at» **after** that watermark: «event_id, order_id, status, ingested_at», sorted by «ingested_at» then «event_id». Read the watermark with a subquery, do not hard-code it.', tables: ['raw_orders_feed', 'etl_watermarks'], level: 2,
        solution: `SELECT event_id, order_id, status, ingested_at
FROM raw_orders_feed
WHERE ingested_at > (SELECT last_loaded_at FROM etl_watermarks WHERE pipeline = 'orders')
ORDER BY ingested_at, event_id;`,
        hint: 'WHERE ingested_at > (SELECT last_loaded_at FROM etl_watermarks WHERE pipeline = \'orders\')' }),
    ],
  }),

  // ================================================================== Source vs destination
  srcdst: T(`
    > **In one line:** a **source system** is where data is *created and owned* (the system of record). A **destination** (target, sink) is where your pipeline *delivers* it for use. The data engineer is responsible for the journey and for proving that what arrived matches what left.

    ## The problem it solves
    When the numbers in the dashboard do not match the CRM, everyone asks "which one is right?". Without a clear idea of which system **owns** each piece of data, and without checks between source and destination, nobody can answer. Defining sources, destinations and the contract between them is how you make that question answerable.

    ## Source systems
    - **What:** operational systems that create data as a side effect of running the business: CRM (claims, service requests), ERP (orders, invoices, inventory), MES (manufacturing), IoT platforms (telemetry), HR, external partner feeds, SaaS apps.
    - **System of record (source of truth):** for each entity, one system is authoritative. Claims status: CRM. Invoice amount: ERP. If they disagree, the system of record wins and the other is a copy.
    - **What you do not control:** their schema, their release schedule, their uptime, their data quality, their deletes. You **depend** on them.
    - **Constraints they impose:** limited extraction windows, rate limits, no CDC permission, no history (overwrites), vendor APIs that change.

    ## Destination systems
    - **Analytical stores:** lakehouse tables, warehouse schemas, data marts.
    - **Serving stores:** a low-latency database or cache for an application, a search index, a vector store for AI search, a feature store for ML.
    - **Operational targets:** sending curated data **back** into a CRM or ERP (**reverse ETL**), e.g. pushing a "high failure risk" flag onto the customer record so the sales team sees it.
    - **Files and exports:** partner extracts, regulatory submissions.
    - **What you do control:** schema, partitioning, retention, access, documentation, SLAs. You **are accountable** for them.

    ## The contract between them
    A healthy source → destination relationship has written agreements:
    | Item | Example |
    |---|---|
    | Owner on each side | CRM team owns claims source; data team owns silver.claims |
    | Schema and types | claim_id INT not null unique; claim_amount DECIMAL(12,2) ≥ 0 |
    | Semantics | "submitted_at is when the dealer pressed submit, in UTC" |
    | Delivery | Changes available via API, max delay 15 min; deletes exposed as status = 'Deleted' |
    | Change process | Breaking changes announced 30 days ahead, versioned |
    | Quality expectations | < 0.1% null dealer_id |
    | Destination SLA | silver.claims fresh within 1 hour, 99% of days |
    These are **data contracts**, covered in depth later.

    ## Proving source = destination: reconciliation
    "The pipeline ran" is not proof. You reconcile:
    - **Counts:** rows per day/partition in source vs destination.
    - **Sums of key measures:** total claim_amount per day.
    - **Key sets:** which IDs are missing or extra (anti-joins).
    - **Hashes:** row-level hashes of important columns to find silent changes.
    - **Tolerance and timing:** compare the same cut-off time; allow for in-flight records; investigate beyond a threshold.
    Run reconciliation automatically and alert on breaks.

    ## Design choices driven by the source
    | Source characteristic | Design consequence |
    |---|---|
    | No «updated_at», no CDC | Full extracts + snapshot comparison (hash diff) |
    | Overwrites history | Capture changes yourself: SCD2 or daily snapshots |
    | Hard deletes | CDC, or periodic full key comparison |
    | Rate-limited API | Incremental pulls, backoff, off-peak bulk loads |
    | Unreliable uptime | Retries, alerts, "last good data" served with freshness shown |
    | Frequent schema changes | Contracts, schema checks, evolution-tolerant bronze |

    ## Design choices driven by the destination
    | Destination need | Design consequence |
    |---|---|
    | BI dashboards | Dimensional gold models, pre-aggregates, stable column names |
    | Application lookups in ms | Key-value/serving store, not the warehouse |
    | ML training | Point-in-time correct history, stable features |
    | Regulatory export | Exact formats, audit trail, reproducibility |
    | Reverse ETL to CRM | Respect the CRM's API limits, idempotent upserts, never overwrite fields owned by users |

    ## Edge cases and what goes wrong
    - **Two systems claim to be the source of truth** for the same field (dealer address in CRM and ERP). Decide ownership explicitly; otherwise pipelines flip-flop.
    - **Destination becomes a source:** someone edits data directly in the warehouse to "fix" a number. Now the warehouse disagrees with the source forever. Fix upstream, or record overrides in a governed adjustments table.
    - **Reverse ETL loops:** you push a field to the CRM, the CRM's change triggers CDC, your pipeline reprocesses, pushes again… Use change detection to avoid loops.
    - **Reconciliation at different times:** you compare a 01:00 extract to the source at 09:00 and see "differences" that are just new data. Compare like with like.
    - **Source migration:** the CRM is replaced. Your pipelines should depend on a stable silver model, so only the ingestion layer changes, not 200 reports.

    ## How interviewers test this
    - "The dashboard does not match the source. How do you debug?" Same time cut-off, same filters and definitions, reconcile counts and sums per day, find missing/extra keys, walk back layer by layer (gold → silver → bronze → source) to find where they diverge.
    - "What is a system of record?" The authoritative source for an entity; others are copies.
    - "What is reverse ETL?" Sending curated data from the warehouse back into operational tools.
  `, {
    check: [
      mcq('The dashboard shows 1,180 claims for yesterday; the CRM shows 1,203. What is your first step?', ['Change the dashboard to 1,203', 'Make sure both numbers use the same cut-off time and definition, then reconcile counts and missing keys layer by layer', 'Re-run the pipeline', 'Assume the CRM is wrong'], 1, 'Compare like with like first, then find where in the layers the records disappear.'),
      tf('If an analyst corrects a wrong value directly in the gold table, the problem is solved.', false, 'The next run will overwrite it, and the warehouse now disagrees with the source. Fix upstream or record governed adjustments.'),
      mcq('What is reverse ETL?', ['Extracting data in reverse order', 'Sending curated data from the warehouse/lakehouse back into operational systems like a CRM', 'Undoing a failed load', 'Loading raw data before transforming'], 1, 'It closes the loop: insights go back to where people work.'),
      multi('Which reconciliation checks catch different problems?', ['Row counts per day', 'Sums of key measures per day', 'Anti-join on keys to list missing and extra IDs', 'Checking the job finished green'], [0, 1, 2], 'A green job is not a reconciliation.'),
    ],
    interview: [
      talk('How do you guarantee the data in the warehouse matches the source system?', `
        - **Contract** with the source owner: schema, semantics, delivery, deletes, change process.
        - **Ingestion designed for completeness:** CDC or overlapping watermarks, delete handling, idempotent MERGE.
        - **Automated reconciliation** after each load: counts and sums per partition/day, key-set comparison (missing/extra), optional row hashes for silent changes; tolerance for in-flight data; alerts on breaks.
        - **Traceability:** every row carries source, batch and ingest time, so any difference can be traced.
        - **No manual fixes in the destination:** corrections go upstream or into a governed adjustments table.`),
    ],
    hands: [
      sql({ q: '**Reconciliation**: «orders_current» is the destination table; «raw_orders_feed» is what the source sent. How many distinct orders exist in the source feed but are **missing** from the destination, and how many orders in the destination have an **amount that differs** from their latest amount in the feed? Return one row: «missing_in_target, amount_mismatches».', tables: ['raw_orders_feed', 'orders_current'], level: 3,
        solution: `WITH latest AS (
  SELECT order_id, amount
  FROM (SELECT order_id, amount, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn FROM raw_orders_feed)
  WHERE rn = 1
)
SELECT
  (SELECT COUNT(*) FROM latest l WHERE NOT EXISTS (SELECT 1 FROM orders_current o WHERE o.order_id = l.order_id)) AS missing_in_target,
  (SELECT COUNT(*) FROM latest l JOIN orders_current o ON o.order_id = l.order_id WHERE o.amount <> l.amount) AS amount_mismatches;`,
        hint: 'Build "latest amount per order" with ROW_NUMBER in a CTE. Missing = NOT EXISTS in orders_current. Mismatch = join and compare amounts.' }),
    ],
  }),

  // ================================================================== Consumers and downstream systems
  consumers: T(`
    > **In one line:** **consumers** are the people and systems that use the data you deliver: dashboards, analysts, data scientists, ML models, applications, partners and AI assistants. **Downstream** means everything that depends on your table, directly or indirectly. Your design is judged by what happens downstream.

    ## The problem it solves
    A pipeline has no value until someone uses its output. And every change you make, renaming a column, changing a grain, delaying a run, ripples to everyone downstream. Knowing your consumers tells you **what to build**; knowing your downstream dependencies tells you **what you might break**.

    ## Who consumes data, and what each needs
    | Consumer | What they do | What they need from you |
    |---|---|---|
    | **Executives / business users** | Read dashboards | Correct, simple, consistent KPIs; freshness shown; definitions |
    | **Analysts / BI developers** | Explore, build reports | Clean dimensional models, clear grain, documented columns, good performance |
    | **Data scientists** | Train models | Long history, point-in-time correctness (no future leakage), stable features, raw access when needed |
    | **ML systems in production** | Score data | Same feature logic as training, low-latency serving, monitoring for drift |
    | **Applications** | Show data to users, make decisions | Low-latency APIs or serving stores, high availability |
    | **Operational tools (reverse ETL)** | CRM/ERP enriched with insights | Reliable upserts, respect for API limits |
    | **Partners / external** | Receive extracts | Agreed format, security, only their data |
    | **AI assistants / RAG** | Answer questions from company knowledge | Clean, chunked, permission-aware documents and semantic models |
    | **Other pipelines** | Build on your tables | Stable schemas, contracts, change notice |

    ## How data is served to them
    - **Gold tables / data marts:** dimensional models for BI and SQL users.
    - **Semantic layer:** business metrics defined once (revenue, approval rate) on top of tables, so every tool computes them the same way (Power BI semantic models, dbt metrics, LookML).
    - **Feature tables / feature stores:** for ML training and serving.
    - **APIs and serving databases:** for applications needing millisecond lookups.
    - **Files/shares:** extracts, Delta Sharing, secure data sharing for partners.
    - **Vector indexes:** embeddings of documents for semantic search and RAG.

    ## Data as a product: treating consumers as customers
    A **data product** is a dataset built for consumers with the same care as software: an owner, documentation, a defined grain, quality checks, an SLA, versioning, discoverability in a catalog and access rules. The posting stresses "certified data products" and "Data-as-a-Product". Consumer focus is what turns a table into a product.

    ## Downstream impact: the engineer's responsibility
    Before changing anything, ask: **who reads this?** Tools:
    - **Lineage** (catalog or dbt graph): which tables, dashboards and models depend on this column?
    - **Query logs / access history:** who actually queried it in the last 90 days?
    - **Contracts:** what did we promise?
    Change safely:
    - **Additive changes** (new column) are usually safe.
    - **Breaking changes** (rename, remove, type change, grain change, meaning change) need a **versioned** approach: publish «v2» alongside «v1», announce, migrate consumers, deprecate with a date, then remove.
    - **Semantic changes are the most dangerous:** same column name, different meaning ("revenue" now excludes tax). Nothing errors, numbers just shift. Document, announce and version.

    ## Designing for consumers (practical rules)
    1. **Start from the question:** what decision, what grain, what filters, what freshness.
    2. **One row means one thing:** state the grain in the table description.
    3. **Name for humans:** «claim_submitted_date», not «sub_dt».
    4. **Model for the query pattern:** partition by the common filter (date); pre-aggregate heavy dashboards.
    5. **Show freshness:** «data_as_of» in every gold table and dashboard.
    6. **Certify:** mark the official tables; deprecate copies.
    7. **Protect:** row-level security (dealers see only their region), column masking for PII.

    ## Edge cases and what goes wrong
    - **Unknown consumers:** someone built a critical spreadsheet on your silver table; you change it and Finance's close breaks. Lineage and access logs reveal hidden consumers.
    - **Metric drift:** three dashboards compute "approval rate" three ways. A semantic layer or one certified gold table fixes it.
    - **Training leakage:** a data scientist joins today's dealer region to last year's claims; the model learns from information it would not have had at the time. Point-in-time (SCD2 / as-of) joins prevent it.
    - **Serving the warehouse to an app:** an application queries the warehouse per user click; latency and cost explode. Serve from a dedicated store.
    - **Too many gold tables:** every request gets its own table; 400 near-duplicates later nobody knows which is right. Reuse and certify.

    ## At scale
    Thousands of consumers mean self-service: a searchable catalog, certified products, a semantic layer, automated access requests, usage monitoring (unused tables get deprecated) and chargeback/showback of cost to consuming teams.

    ## How interviewers test this
    - "How would you change a column used by many dashboards?" Lineage to find consumers, versioning, communication, migration window, deprecation.
    - "How do you make sure data scientists and dashboards see the same numbers?" Shared certified silver/gold, semantic layer, same feature logic for training and serving.
    - "What is a data product?" Owner, docs, grain, quality checks, SLA, versioning, discoverable, governed access.
  `, {
    check: [
      mcq('You need to rename «sub_dt» to «claim_submitted_date» in a gold table used by 30 dashboards. What is the safest approach?', ['Rename it now; dashboards will adapt', 'Add the new column (or a v2 view) alongside the old, announce, migrate consumers using lineage, then remove the old one after a deprecation date', 'Never rename anything', 'Rename it on Friday evening'], 1, 'Breaking changes need versioning, communication and a migration window.'),
      mcq('Which change is the most dangerous because nothing errors?', ['Adding a column', 'Renaming a column', 'Changing what a column means while keeping its name (e.g. revenue now excludes tax)', 'Adding a partition'], 2, 'Semantic changes silently shift every number downstream.'),
      tf('A model trained by joining last year\'s claims to today\'s dealer regions can leak information it would not have had at the time.', true, 'Point-in-time joins (SCD2 / as-of) give features as they were when the event happened.'),
      multi('What turns a table into a data product?', ['A named owner', 'Documentation of grain and columns', 'Quality checks and an SLA', 'Being in the largest schema'], [0, 1, 2], 'Ownership, documentation, quality, SLA, versioning, discoverability, governed access.'),
    ],
    scenarios: [
      scenario('Who did we break?', `
        You simplified the silver «claims» table last week: removed the rarely-used «legacy_dealer_code» column and changed «claim_amount» to exclude tax. Today Finance reports their month-end reconciliation is off by 18%, and a partner extract job failed overnight.`, [
        ['Why is Finance off by 18% while nothing errored for them?', [
          ['The meaning of «claim_amount» changed (tax removed) but the name stayed, so their numbers shifted silently', true, 'Semantic change: the most dangerous kind.'],
          ['Finance has a formula error', false, 'Their logic did not change; your data did.'],
          ['The partner job failure caused it', false, 'That is a separate break from the removed column.'],
        ]],
        ['What do you do now?', [
          ['Restore the previous meaning for existing consumers (or publish both «claim_amount_incl_tax» and «claim_amount_excl_tax»), restore the removed column, and communicate', true, 'Undo the breaking change first, then migrate properly.'],
          ['Tell Finance to adjust for tax themselves', false, 'You broke a promise; fix it on your side.'],
          ['Delete the partner job', false, 'It is a consumer with a real need.'],
        ]],
        ['What process prevents this?', [
          ['Check lineage and access logs before changes, treat removals and meaning changes as breaking (version, announce, deprecate), and add contract tests for consumers', true, 'Know your downstream, and change safely.'],
          ['Freeze the table forever', false, 'Tables must evolve; they must evolve safely.'],
          ['Only make changes on weekends', false, 'Timing does not fix breaking changes.'],
        ]],
      ], 'Every change has downstream consumers. Find them before you change, and version what breaks.'),
    ],
    interview: [
      talk('How do you design a dataset so that analysts, dashboards and data scientists can all rely on it?', `
        - Start from consumers: decisions, grain, filters, freshness, accuracy.
        - Shared **certified silver** (clean, conformed, one row per business key, history kept with SCD2 where it matters) → **gold** for BI (dimensional, pre-aggregated where heavy) and **feature tables** for ML (point-in-time correct).
        - Metric definitions in **one place** (semantic layer or certified gold), documented.
        - Quality tests, freshness SLA, «data_as_of» exposed.
        - Catalog entry with owner, grain, column docs, lineage; access with row-level security and PII masking.
        - Change management: additive changes freely, breaking or semantic changes versioned and announced.`),
      talk('Tell me about a time you thought about the downstream consumer of your data.', `
        **Use a real story in STAR form:**
        - **Situation:** e.g. dashboards for a service team where users needed claim aging by dealer.
        - **Task:** deliver data they could filter quickly and trust.
        - **Action:** asked what decisions they made with it, defined grain and definitions in writing, modelled one row per claim with clear date columns, added "data as of", validated totals against the source with the users.
        - **Result:** adoption, fewer "which number is right?" questions, time saved.
        Tie it to data engineering: "That's why I now design tables from the consumer's question backwards."`, 'hr'),
    ],
    hands: [
      sql({ q: 'Build a **gold dataset for a dashboard**: current order pipeline status. Using each order\'s **latest** status from «raw_orders_feed», return «status», «orders» (count) and «value» (sum of amount, rounded to 2 dp), sorted in business order: CREATED, CONFIRMED, SHIPPED, DELIVERED.', tables: ['raw_orders_feed'], level: 3,
        solution: `WITH latest AS (
  SELECT order_id, status, amount
  FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn FROM raw_orders_feed)
  WHERE rn = 1
)
SELECT status, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS value
FROM latest
GROUP BY status
ORDER BY CASE status WHEN 'CREATED' THEN 1 WHEN 'CONFIRMED' THEN 2 WHEN 'SHIPPED' THEN 3 WHEN 'DELIVERED' THEN 4 ELSE 5 END;`,
        ordered: true,
        hint: 'Latest status per order with ROW_NUMBER, then GROUP BY status, and ORDER BY a CASE expression that gives each status its business position.' }),
    ],
  }),
};
