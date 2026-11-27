const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Retention and privacy
  retentionpol: T(`
    > **In one line:** **retention policies** define how long each kind of data is kept and what happens after (archive, anonymise, delete); **privacy** rules define how personal data may be collected, used, shared and erased. Data engineers implement both in storage layout, pipelines and access controls.

    ## Laws and rules you should name
    - **India DPDP Act 2023:** consent, purpose limitation, data minimisation, rights to correction and erasure, breach notification, obligations for "data fiduciaries".
    - **GDPR (EU):** lawful basis, minimisation, storage limitation, right to erasure ("right to be forgotten"), right of access, data protection by design, cross-border transfer rules.
    - **Sector rules:** financial record retention (years), product safety and warranty records, **export control** (EAR/ITAR-like rules restricting who can access certain technical data and where it can be stored).
    - **Company policies:** classification levels (public, internal, confidential, restricted) and retention schedules.

    ## Implementing retention
    - **Partition by date** so expiry is "drop partitions older than N".
    - **Table formats:** DELETE old rows, then VACUUM to remove files after the time-travel window.
    - **Object storage lifecycle rules** for raw files (move to cool/archive, then delete).
    - **Kafka retention** settings per topic.
    - **Backups and copies** included in the policy.
    - **Legal hold** overrides deletion for relevant data.
    - **Evidence:** log what was deleted when, under which policy.

    ## Privacy by design in pipelines
    - **Data minimisation:** do not ingest personal fields you do not need.
    - **Classify and tag** PII columns at ingestion.
    - **Pseudonymise** early: replace identifiers with tokens (keyed hash/HMAC or a token vault); keep the mapping in one tightly controlled table. Deleting the mapping entry effectively anonymises downstream data.
    - **Mask** in consumption layers; **aggregate** where individuals are not needed.
    - **Separate** personal data into its own tables/columns so erasure touches few places.
    - **Purpose-based access**: data scientists get pseudonymised data unless approved.
    - **Anonymisation** vs pseudonymisation: anonymised data cannot be linked back (out of most privacy law scope); pseudonymised data can (still personal data).

    ## Handling an erasure request
    Find all copies (lineage + tags) → delete or anonymise in each (including history: VACUUM; snapshots; backups by policy) → confirm downstream rebuilds don't reintroduce it (source deleted too, or a suppression list) → log completion.

    ## How interviewers test this
    - "How would you implement a 2-year retention on a 10 TB table?" Date partitions, scheduled DELETE/partition drop + VACUUM, lifecycle rules, audit log.
    - "Pseudonymisation vs anonymisation?"
    - "How do you design pipelines so privacy deletion is easy?"
  `, {
    check: [
      mcq('What is the key difference between pseudonymised and anonymised data?', ['None', 'Pseudonymised data can be re-linked to a person with extra information (still personal data); anonymised data cannot', 'Anonymised data is encrypted', 'Pseudonymised data is deleted'], 1, 'Privacy laws still apply to pseudonymised data.'),
      mcq('Why partition a large table by date when retention is time-based?', ['For prettier folders', 'Expiry becomes dropping old partitions instead of scanning and rewriting the whole table', 'It is required by GDPR', 'To encrypt data'], 1, 'Cheap, reliable retention.'),
      tf('Under privacy-by-design, you should ingest every personal field available "just in case".', false, 'Data minimisation: collect only what is needed for the purpose.'),
    ],
    hands: [
      py({ q: 'Write «pseudonymise(rows, key, fields)» that returns **new** rows where each field in «fields» is replaced by the first 12 hex chars of **HMAC-SHA256** of its value (as a string) with secret «key» (bytes). «None» values stay «None». The same input value must always map to the same token (so joins still work), and the original rows must not be modified.', starter: 'import hmac, hashlib\n\ndef pseudonymise(rows, key, fields):\n    pass\n',
        tests: `import hmac, hashlib
rows = [{'id': 1, 'email': 'a@x.com', 'city': 'Pune'}, {'id': 2, 'email': 'a@x.com', 'city': None}, {'id': 3, 'email': None, 'city': 'Delhi'}]
out = pseudonymise(rows, b'k1', ['email'])
tok = hmac.new(b'k1', b'a@x.com', hashlib.sha256).hexdigest()[:12]
assert out[0]['email'] == tok and out[1]['email'] == tok, out
assert out[2]['email'] is None
assert out[0]['city'] == 'Pune'
assert rows[0]['email'] == 'a@x.com', 'input must not change'
assert pseudonymise(rows, b'k2', ['email'])[0]['email'] != tok, 'different key, different token'`,
        solution: `import hmac, hashlib

def pseudonymise(rows, key, fields):
    out = []
    for r in rows:
        nr = dict(r)
        for f in fields:
            v = nr.get(f)
            if v is not None:
                nr[f] = hmac.new(key, str(v).encode(), hashlib.sha256).hexdigest()[:12]
        out.append(nr)
    return out` }),
    ],
  }),

  // ================================================================== Data quality frameworks
  dqframe: T(`
    > **In one line:** a data quality **framework** turns ad-hoc checks into a **system**: rules defined consistently (in code), run automatically at the right points, results stored and visible, failures routed to owners with severities, and quality measured over time as KPIs.

    ## The components
    1. **Rule library:** standard checks (not null, unique, accepted values, ranges, referential integrity, freshness, volume, distribution, custom SQL) parameterised per dataset.
    2. **Rules as code:** YAML/SQL/Python next to the pipeline code, versioned and reviewed (dbt tests, Great Expectations suites, Soda checks, Delta Live Tables expectations, Databricks Lakehouse Monitoring).
    3. **Execution points:** ingestion (validate), after transform (integrity), before publish (gate), continuous (monitors).
    4. **Actions per severity:** fail/block, quarantine rows, warn.
    5. **Results store:** every check run recorded (dataset, rule, passed, failing count, sample keys, run ID, time).
    6. **Visibility:** dashboards and catalog badges with quality scores; trends.
    7. **Ownership and workflow:** alerts to dataset owners; issue tracking; root-cause and prevention.
    8. **KPIs:** % of critical datasets with checks; pass rate; incidents per month; time to detect/resolve; data downtime.

    ## Tools quickly
    | Tool | Style |
    |---|---|
    | **dbt tests** | YAML generic tests + SQL tests in the transformation project |
    | **Great Expectations** | Python "expectations" suites, data docs |
    | **Soda** | SodaCL YAML checks, monitoring |
    | **Delta Live Tables expectations** | «EXPECT (claim_amount >= 0) ON VIOLATION DROP ROW / FAIL UPDATE» in pipeline definitions |
    | **Lakehouse Monitoring / Monte Carlo** | Profiling, drift and anomaly detection |

    ## Designing rules well
    - Start from **consumer impact**: what breaks if this is wrong?
    - Prefer **few strong rules** over hundreds of noisy ones.
    - Test rules: they must fail on known-bad data.
    - Combine **rule-based** with **anomaly-based** monitors.
    - Review thresholds as data evolves.

    ## How interviewers test this
    - "How would you build a data quality framework?" Components above; tools; severities; ownership; KPIs.
    - "How do you avoid alert fatigue?"
  `, {
    check: [
      order('Order the flow of a quality framework for one pipeline run.', ['Validate incoming data at ingestion (quarantine bad rows)', 'Transform', 'Run integrity and consistency checks', 'Gate: block publish on blocker failures', 'Store results and alert owners', 'Track KPIs over time'], 'Checks at each stage, results visible.'),
      mcq('In Delta Live Tables, what does «EXPECT (claim_amount >= 0) ON VIOLATION DROP ROW» do?', ['Fails the pipeline', 'Drops violating rows and records the violation metrics', 'Ignores the rule', 'Deletes the table'], 1, 'Other options: warn (keep) or FAIL UPDATE.'),
      tf('A data quality rule that has never failed should be tested against known-bad data.', true, 'Otherwise it may not be checking anything.'),
    ],
  }),

  // ================================================================== Data products
  dataproduct: T(`
    > **In one line:** **data as a product** means treating curated datasets like software products: built for **consumers**, with a named **owner**, clear **contract** (schema, grain, semantics), **quality and SLA** guarantees, **documentation and discoverability**, governed **access**, **versioning** and support. A **certified** data product is one the organisation officially trusts. This is central to the posting.

    ## The characteristics (often summarised as DATSIS / "DAUTNIVS")
    | Property | Meaning |
    |---|---|
    | **Discoverable** | In the catalog, searchable, with good descriptions |
    | **Addressable** | Stable name/location/API («gold.quality.engine_failure_daily_v1») |
    | **Understandable / self-describing** | Grain, definitions, examples, lineage documented |
    | **Trustworthy** | Quality checks, SLA, certification, observability |
    | **Natively accessible** | Usable by SQL, BI, notebooks, APIs as needed |
    | **Interoperable** | Conformed keys and dimensions, standard formats |
    | **Valuable on its own** | Answers real business needs |
    | **Secure / governed** | Access policies, classification, retention |

    ## Anatomy of a data product
    - **Output ports:** the tables/views/APIs/files consumers use.
    - **Input ports:** the sources it depends on (with contracts).
    - **Code:** pipelines, transformations, tests, infrastructure as code.
    - **Metadata:** catalog entry, docs, owner, SLA, contract version.
    - **Observability:** freshness, quality, usage, cost.
    - **Policies:** access, retention, privacy.

    ## Example: «Engine Field Quality» data product (Quality domain)
    - **Purpose:** failure rates by engine model, part, plant and build month, for quality engineers, suppliers' scorecards and a predictive model.
    - **Output ports:** «gold.quality.failure_rates_monthly» (one row per model/part/plant/month), «gold.quality.claim_failure_events» (one row per failure event), feature table for ML.
    - **Inputs:** claims (CRM, contract v2), engine builds (MES), parts master (ERP), telemetry aggregates.
    - **Guarantees:** refreshed by 07:00 IST daily (99%), reconciliation with CRM claims ±0%, no duplicate failure events, documented definitions of "failure" and "exposure".
    - **Owner:** Quality Data Product Owner; steward: quality analyst; engineering: data team.
    - **Access:** internal quality and engineering groups; suppliers via a filtered share of their own parts only.
    - **Versioning:** breaking changes → «_v2» in parallel for one quarter.

    ## Certified data products
    Certification is a governance stamp meaning: owner accountable, documentation complete, quality rules and SLA monitored and passing, lineage captured, security reviewed, change policy agreed. Certified products are ranked first in the catalog; uncertified copies are discouraged or deprecated.

    ## Data mesh (context)
    Data mesh = **domain ownership** of data products + **data as a product** + **self-serve data platform** + **federated computational governance**. Many enterprises adopt the "data product" idea without a full mesh.

    ## Edge cases and what goes wrong
    - Calling every table a "product" without owners or SLAs.
    - Products built without consumers (no adoption).
    - Duplicated products across domains with different definitions.
    - No versioning: breaking changes hit consumers.

    ## How interviewers test this
    - "What is a data product? Give an example." Use the anatomy and an example.
    - "What makes a data product certified?"
    - "How is a data product different from a table?" Owner, contract, guarantees, docs, discoverability, support.
  `, {
    check: [
      multi('Which are properties of a data product?', ['A named owner accountable for it', 'Documented grain, schema and definitions', 'Monitored quality and an SLA', 'Being stored in the largest storage account'], [0, 1, 2], 'Plus discoverable, addressable, secure, versioned.'),
      mcq('What does certification of a data product signal?', ['It is popular', 'The organisation trusts it: owner, documentation, monitored quality/SLA, lineage, security review and change policy are in place', 'It is new', 'It is the biggest table'], 1, 'Certification is a promise backed by evidence.'),
      tf('Data mesh combines domain ownership, data as a product, a self-serve platform and federated governance.', true, 'Its four principles.'),
    ],
    interview: [
      talk('What is a data product, and how would you build one for warranty or quality data?', `
        - **Definition:** a curated, reusable dataset (or set of tables/APIs) built for consumers with an owner, a contract (schema, grain, semantics), quality checks and an SLA, documentation in the catalog, governed access, lineage and versioning.
        - **Example:** "Engine Field Quality": failure rates by model/part/plant/month and failure events, for quality engineering, supplier scorecards and predictive maintenance.
        - **Build:** agree consumers and decisions → define grain and metrics (failure, exposure) with the owner → contracts with input sources → medallion pipeline with idempotent MERGE, SCD2 dimensions → tests and reconciliation → SLA monitoring → catalog entry with docs, tags, owner → access policies (suppliers see only their parts) → versioning policy → certification.
        - **Measure success:** adoption, fewer duplicate datasets, quality KPIs, time to answer questions.`),
    ],
  }),

  // ================================================================== Semantic models
  semantic: T(`
    > **In one line:** a **semantic model** (semantic layer) sits between tables and consumers and defines **business entities, relationships and metrics once**, in business language: "Approval rate = approved claims / submitted claims". Every dashboard, analyst and AI assistant then uses the same definitions. It is what makes **self-service** safe.

    ## The problem it solves
    Ten Power BI reports compute "approval rate" with ten slightly different formulas and filters. Executives see different numbers in different meetings. A semantic model centralises the logic.

    ## What it contains
    - **Tables and relationships** (star schema: facts and dimensions, cardinality, filter direction).
    - **Measures/metrics** with exact formulas (DAX in Power BI, metrics in dbt Semantic Layer/MetricFlow, LookML in Looker, metric views in Databricks).
    - **Hierarchies** (country → region → dealer; year → quarter → month).
    - **Business-friendly names**, descriptions, formats, synonyms.
    - **Security:** row-level security roles.
    - **Calculation rules:** time intelligence (YTD, prior period), currency conversion.

    ## Examples by tool
    | Tool | Semantic layer |
    |---|---|
    | Power BI | **Semantic model** (formerly "dataset"): Import, DirectQuery or Direct Lake mode; DAX measures |
    | dbt | Semantic Layer / MetricFlow metrics queried by BI tools |
    | Looker | LookML |
    | Databricks | Metric views / Genie spaces (for natural-language questions) |
    | AtScale, Cube | Universal semantic layers |

    ## Self-service done right
    - Certified semantic models on certified gold tables.
    - Users build their own reports from governed measures (no copying data out).
    - Clear separation: engineers own tables, BI/analytics engineers own the semantic model, business users own reports.

    ## Semantic models and AI
    Natural-language and GenAI assistants ("What was the approval rate in the West last quarter?") answer reliably only when metrics, synonyms and relationships are defined: the semantic model is the **knowledge asset** that grounds them. This is why the posting mentions "semantic models, knowledge assets".

    ## Edge cases and what goes wrong
    - Measures defined in individual reports instead of the shared model.
    - Ambiguous relationships (many-to-many, bidirectional filters) causing wrong totals.
    - Import-mode models with refresh times that do not match the gold table's SLA.
    - RLS defined in the model but bypassed by users querying tables directly.

    ## How interviewers test this
    - "What is a semantic layer and why use one?"
    - "How do you make self-service BI safe?"
    - "How does a semantic model help GenAI on enterprise data?"
  `, {
    check: [
      mcq('Why define "approval rate" in a semantic model instead of in each report?', ['It is faster to type', 'One governed definition used by every report and tool avoids conflicting numbers', 'Reports cannot calculate', 'It saves storage'], 1, 'Define once, use everywhere.'),
      tf('A semantic model with metrics, relationships and synonyms helps natural-language/GenAI assistants answer business questions correctly.', true, 'It grounds AI in agreed definitions.'),
      mcq('In Power BI, the semantic model is…', ['The report page', 'The shared model of tables, relationships, DAX measures and RLS that reports connect to', 'A gateway', 'A dataflow only'], 1, 'Formerly called a dataset.'),
    ],
  }),

  // ================================================================== AI-ready datasets
  aiready: T(`
    > **In one line:** an **AI-ready dataset** is data prepared so machine learning and GenAI can use it **correctly and safely**: clean, consistent, well-documented, with history and **point-in-time correctness** for ML, **chunked, enriched and permission-aware** content for GenAI, and governed for privacy, bias and lineage.

    ## For machine learning (structured data)
    - **Right grain and labels:** e.g. one row per engine per day with a label "failed within next 30 days".
    - **Point-in-time correctness:** features computed only from data available at prediction time (as-of joins, SCD2 dimensions) to avoid **leakage**.
    - **History:** long enough for patterns and seasonality.
    - **Consistency between training and serving:** same feature logic in both (feature store/feature tables).
    - **Quality:** missing values handled deliberately and documented, outliers understood, units consistent.
    - **Balanced and representative:** know class imbalance (failures are rare) and coverage gaps (some regions under-represented).
    - **Versioned:** reproduce the exact training set (Delta time travel, dataset versions).

    ## For GenAI and RAG (unstructured and semi-structured)
    - **Clean text extraction** from PDFs, manuals, service reports (OCR quality checked).
    - **Chunking** into retrievable passages with sensible boundaries and overlap.
    - **Metadata enrichment:** document type, engine model, date, source, language, security labels.
    - **Embeddings** generated and stored in a vector index, refreshed incrementally when documents change.
    - **Permissions propagated:** a user must not retrieve chunks from documents they cannot access.
    - **PII and sensitive data scrubbed or masked**; export-controlled content restricted.
    - **Freshness and lineage:** which document version produced each chunk.
    - **Evaluation sets:** questions with expected answers to measure retrieval and answer quality.

    ## Governance for AI
    Documentation (datasheets/model cards), consent and purpose checks, bias assessment, audit of what data trained which model, monitoring for drift.

    ## How interviewers test this
    - "What makes data AI-ready?" Both lists, with leakage and permissions as standout points.
    - "What is data leakage in ML?" Features using information not available at prediction time.
    - "How would you prepare service manuals for a RAG assistant?" Extract, clean, chunk, enrich metadata, embed, index with permissions, evaluate, refresh incrementally.
  `, {
    check: [
      mcq('A failure-prediction model uses "number of warranty claims in the next 30 days" as a feature. What is wrong?', ['Nothing', 'Leakage: the feature uses future information that is not available at prediction time', 'It is too slow', 'It needs more history'], 1, 'Point-in-time correctness prevents leakage.'),
      multi('Which make documents ready for a RAG assistant?', ['Clean extraction and sensible chunking', 'Metadata such as model, date and security labels on each chunk', 'Propagating document permissions to retrieval', 'Dumping raw PDFs into the prompt'], [0, 1, 2], 'Retrieval quality and security depend on preparation.'),
      tf('Training and serving should compute features with the same logic.', true, 'Otherwise training-serving skew degrades the model.'),
    ],
  }),
};
