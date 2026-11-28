const { T } = require('../_t.cjs');

module.exports = {
  govwhat: T(`
    > **In one line:** data governance = the **roles, policies, processes and tools** that make data **known, trusted, secure, compliant and well used**: who owns it, what it means, who may access it, how good it must be, how long it's kept.

    **Without it:** nobody knows which "revenue" table is right, sensitive data is copied everywhere, people recreate data they can't find, regulators' questions go unanswered, AI trains on untrusted data. Governance turns data from a liability into an asset.

    | Pillar | Question | Mechanisms |
    |---|---|---|
    | Ownership & stewardship | Who's accountable? | Owners, stewards, custodians, RACI |
    | Metadata & catalog | What exists, what does it mean? | Catalog, glossary, docs |
    | Quality | Fit for use? | DQ rules, SLAs, certification, issue management |
    | Access & security | Who can do what? | RBAC/ABAC, masking, row/column security, approvals |
    | Privacy & compliance | Are we allowed? | PII classification, consent, GDPR/DPDP, export control, audit |
    | Lifecycle & retention | How long? | Schedules, archival, deletion, legal hold |
    | Lineage | From where, to where? | Automated lineage |
    | Standards | How do we name, model, document? | Conventions, templates, reviews |

    **Operating models:** **centralised** (consistent, slow, bottleneck); **federated** (common today, mesh-aligned: a central team sets standards and runs the platform/catalog, domains own data products and stewardship); **governance as code** (policies, permissions, quality rules and tags in code, enforced by the platform, not spreadsheets). **Governance that works is automated and embedded**: committees without automation produce documents, not trust.

    **A DE's concrete work** (the posting: "implements data governance: metadata, access and retention for internal and external users"): register every table with owner, description, grain, tags; tag PII and apply masks/row filters; build quality checks and publish results; capture lineage; implement retention (partition drops, VACUUM, lifecycle rules); grant access through groups and approved processes.

    **Critical data elements (CDEs):** the few fields driving finance, safety and regulatory reporting (claim amounts, failure codes, engine serials) get the strictest governance.

    **Regulations to name:** India **DPDP Act 2023** (rules notified 2025), **GDPR** for EU data, US **export controls (EAR/ITAR)** for engineering data (the posting mentions them), **SOX** for financial reporting controls.

    **Interview:** what governance is and the DE's role; governing a new dataset end to end (owner, catalog entry, classification and tags, access policies, quality rules and SLA, lineage, retention, certification).
  `),

  metadata: T(`
    > **In one line:** metadata is **data about data**: **technical** (structure and operation), **business** (meaning), **operational** (what happened). Operational metadata powers observability.

    | Type | Examples for «silver.claims» |
    |---|---|
    | Technical | Columns/types, Delta location, partitioning, file count/size, version, constraints |
    | Business | "One row per warranty claim submitted by a dealer"; owner Warranty Ops; «claim_amount» = requested amount excl. tax, INR; glossary term "Claim" |
    | Operational | Last updated 05:42, 1,203 rows added, 14/14 checks passed, run ID, cost |
    | Governance/security | Confidential; no PII columns; retention 7 years; access group |
    | Lineage | Built from «bronze.crm_claim_events» by job «claims_silver» v3.2 |
    | Usage | 23 users/week; 4 dashboards, 1 model |

    **Why it matters:** discovery (find instead of recreate); consistent understanding; trust (freshness and quality beside the data); **metadata-driven pipelines** (a config table of sources, keys, load types and schedules drives one generic ingestion framework); compliance (classification and retention tags drive masking and deletion); **AI** (assistants and semantic layers need rich metadata to answer correctly).

    **Active metadata** triggers actions: a PII tag automatically applies a mask; a freshness breach marks downstream products degraded.

    **Managing it:** capture technical/operational metadata **automatically** (crawlers, table formats, orchestrator/engine integrations); business metadata needs **people** (owners/stewards write definitions; make it part of "definition of done"); **keep it with code** (column descriptions and tags in dbt YAML, DDL comments, bundles, deployed by CI) so the catalog is never a stale wiki.

    **Interview:** technical vs business (vs operational); metadata-driven pipeline (generic code driven by config tables).
  `),

  catalog: T(`
    > **In one line:** a **data catalog** is the searchable inventory of data assets with **metadata, owners, definitions, quality, lineage and access**: how people **discover** data and decide whether to **trust** it.

    **Per asset, show:** name, description; owner and steward; grain; columns with definitions and tags (PII); classification; freshness and quality status; certification badge; lineage up/down; usage stats; permission-aware preview; how to request access; linked glossary terms.

    | Tool | Notes |
    |---|---|
    | **Unity Catalog** | Governs Databricks assets (tables, volumes, models) with **enforcement** (grants, masks) and automatic lineage |
    | **Microsoft Purview** | Enterprise-wide catalog and classification across Azure, on-prem, SaaS (scanning, glossary, policies) |
    | AWS Glue Data Catalog / Lake Formation | Technical catalog + permissions on AWS |
    | Google Dataplex | GCP catalog and governance |
    | Collibra, Alation, Atlan, DataHub, OpenMetadata | Enterprise/OSS catalogs with glossary and stewardship workflows |
    Two kinds usually coexist: the **technical/governance catalog that enforces access** (UC, Glue) and the **enterprise discovery catalog** for business users (Purview, Collibra). Many Azure enterprises run both, with UC metadata surfaced in Purview.

    **Discoverability needs curation:** automatic registration with a required template (owner, description, grain) before production; certified/endorsed assets ranked first, deprecated ones flagged; glossary links; usage signals ("most queried"), sample queries; integration where people work (BI, notebooks, SQL editors). 20,000 uncurated tables aren't discoverable.

    **What goes wrong:** auto-filled but no descriptions/owners (a directory of unknowns); stale entries for deleted tables, or unregistered shadow data; catalog says "restricted" but storage is open (permissions not enforced through it).

    **Interview:** what a catalog is and why; making data discoverable and trusted (registration, docs, certification, visible quality/freshness, glossary, usage).
  `),

  ownership: T(`
    > **In one line:** every important dataset needs a **data owner** (accountable business leader: meaning and who may use it), a **data steward** (day-to-day definitions and quality) and **custodians** (engineers who build and run it). Clear ownership is what gets quality issues fixed.

    | Role | Responsibilities | Claims example |
    |---|---|---|
    | Owner (Accountable) | Approves definitions, access, quality targets, retention; budget, priority | Head of Warranty Operations |
    | Steward | Definitions/glossary, monitors quality, triages issues, answers questions, approves access for the owner | Warranty data analyst |
    | Custodian / engineer | Builds and runs pipelines/storage, implements controls, fixes technical issues | Data engineering |
    | Producer | Correctness at entry | CRM platform team, dealers |
    | Consumer | Uses within policy, reports issues | Analysts, data scientists |
    | Platform team | Shared infrastructure, catalog, standards | Central data platform |

    **Why it matters:** quality questions are business decisions ("is a claim with amount 0 valid?" → owner/steward decide, engineers implement); access requests need an approver who understands sensitivity; definitions need authority (or three teams define "active dealer" three ways); incidents need a contact when the source is wrong.

    **Making it work:** ownership in the catalog for every certified asset (named per data product); RACI for quality incidents and changes; owners review access and quality KPIs periodically; data products make ownership explicit by design. **Gaps** show as orphaned tables, unanswered quality alerts and "who can approve access?" delays → route access requests to owners automatically; review unused/unowned assets quarterly.

    **Interview:** owner vs steward vs custodian; who decides a quality rule is right (owner/steward; engineers implement).
  `),

  access: T(`
    > **In one line:** access control decides **who can see or change which data**: coarse (catalog, schema, table) and fine-grained (**row-level security, column masking**), granted to **groups** by **roles (RBAC)** or **attributes/tags (ABAC)**, with **least privilege**, requests, approvals, reviews and audit.

    | Model | How | Example |
    |---|---|---|
    | RBAC (default) | Permissions to roles/groups | «claims_readers» has SELECT on «gold.claims» |
    | ABAC | Policies on user/data attributes (tags) | "Mask columns tagged PII unless in privacy_approved" (Unity Catalog ABAC policies) |
    | ACLs | Permissions on objects/paths | ADLS folder ACLs |
    | Row-level security | Filter rows by user attributes (dealer, region, plant) | Dealer sees only their dealer_id rows |
    | Column security / masking | Hide or mask | Email shown «a***@x.com» |
    | Dynamic / secure views | CASE/filters on current_user/group | The old way: one view per audience |
    **Table-level row filters and column masks** beat views: they apply wherever the table is queried, including notebooks.

    ## Principles
    - **Least privilege, need to know:** read access by default to curated gold, not raw bronze.
    - **Groups, not individuals** (synced from the identity provider; people move teams).
    - **Separation of duties:** approvers aren't requesters; prod write only for pipelines' service principals, **scoped per pipeline**.
    - **Just-in-time/time-bound** elevated access; **quarterly access reviews**; **audit logs**.
    - **External users** (partners, dealers): separate shares (Delta Sharing, secure views), only their data, contractual controls.

    **Unity Catalog:** «GRANT SELECT ON TABLE gold.claims TO claims_readers»; row filters and column masks as SQL functions on tables; column tags drive ABAC; lineage and audit built in.

    **What goes wrong:** storage-level access (keys/SAS) bypassing the catalog's fine-grained rules; "temporary" admin never removed; masked columns leaking via joins/aggregations or copies into less-governed places; humans using service accounts with broad write access.

    **Interview:** dealers see only their claims (row-level security on the shared table/semantic model); RBAC vs ABAC; external partner access.
  `),

  retentionpol: T(`
    > **In one line:** **retention policies** set how long each kind of data is kept and what happens next (archive, anonymise, delete); **privacy** rules govern how personal data is collected, used, shared and erased. DEs implement both in storage layout, pipelines and access.

    **Laws/rules to name:**
    - **India DPDP Act 2023:** consent, purpose limitation, minimisation, rights to correction and erasure, breach notification, duties of "data fiduciaries".
    - **GDPR:** lawful basis, minimisation, storage limitation, right to erasure, right of access, protection by design, cross-border transfer rules.
    - **Sector:** financial record retention (years), product safety/warranty records, **export control** (who may access certain technical data and where it's stored).
    - **Company:** classification levels (public, internal, confidential, restricted) and retention schedules.

    **Implementing retention:** **partition by date** so expiry = drop partitions older than N; table formats: DELETE then **VACUUM** after the time-travel window; object-storage **lifecycle rules** (cool/archive, then delete); **Kafka retention** per topic. It must cover **every copy**: tables, Delta history (VACUUM, log retention), topics, DLQs, backups, exports, ML training snapshots, notebook outputs. **Legal hold** overrides automated deletion for data under litigation/audit (the platform needs an exemption mechanism). **Log** what was deleted, when, under which policy.

    ## Privacy by design
    - **Minimise:** don't ingest personal fields you don't need.
    - **Classify and tag** PII at ingestion.
    - **Pseudonymise early** (keyed hash/HMAC or token vault), mapping in one tightly controlled table: deleting a mapping entry effectively anonymises downstream data.
    - **Mask** in consumption layers; **aggregate** where individuals aren't needed.
    - **Separate** personal data into its own tables/columns so erasure touches few places.
    - **Purpose-based access** (data scientists get pseudonymised data unless approved).
    - **Anonymised** = can't be linked back (outside most privacy law); **pseudonymised** = can (still personal data).

    **Erasure request:** find all copies (lineage + tags) → delete/anonymise in each, including history (VACUUM, snapshots, backups by policy) → ensure rebuilds don't reintroduce it (deleted at source too, or a suppression list) → log completion.

    **Interview:** 2-year retention on a 10 TB table (date partitions, scheduled DELETE/partition drop + VACUUM, lifecycle rules, audit log); pseudonymisation vs anonymisation; pipelines that make deletion easy.
  `),

  dqframe: T(`
    > **In one line:** a data quality **framework** turns ad-hoc checks into a **system**: consistent rules in code, run automatically at the right points, results stored and visible, failures routed to owners by severity, quality measured as KPIs.

    ## Components
    1. **Rule library:** not null, unique, accepted values, ranges, referential integrity, freshness, volume, distribution, custom SQL, parameterised per dataset.
    2. **Rules as code**, versioned and reviewed beside the pipeline.
    3. **Execution points:** ingestion (validate), after transform (integrity), before publish (gate), continuous (monitors).
    4. **Actions by severity:** fail/block, quarantine rows, warn.
    5. **Results store:** every run (dataset, rule, passed, failing count, sample keys, run ID, time) in **one quality metrics table, whatever the tool**.
    6. **Visibility:** dashboards, catalog badges with quality scores, trends.
    7. **Ownership/workflow:** alerts to owners, issue tracking, root cause and prevention.
    8. **KPIs:** % of critical datasets with checks; pass rate; incidents/month; time to detect/resolve; data downtime.

    | Tool | Style / fit |
    |---|---|
    | dbt tests | YAML generic + SQL tests in-model: SQL transformations |
    | Great Expectations (GX) | Python expectation suites, data docs |
    | Soda | SodaCL YAML checks, monitoring |
    | Lakeflow Declarative Pipelines (formerly DLT) expectations | «EXPECT (claim_amount >= 0) ON VIOLATION DROP ROW / FAIL UPDATE», in-pipeline with metrics: Spark pipelines |
    | Deequ / PyDeequ | Spark-native metrics and constraints |
    | Lakehouse Monitoring / Monte Carlo | Profiling, drift, anomaly detection: cross-system observability |
    **Pick by where the logic lives.**

    **Designing rules well:** start from **consumer impact** (what breaks if wrong?); few strong rules over hundreds of noisy ones (avoids alert fatigue); test that rules **fail on known-bad data**; combine rule-based and anomaly-based monitors; revisit thresholds as data evolves.

    **Interview:** building a DQ framework (components, tools, severities, ownership, KPIs); avoiding alert fatigue.
  `),

  dataproduct: T(`
    > **In one line:** **data as a product** = treating curated datasets like software products: built for **consumers**, with a named **owner**, a **contract** (schema, grain, semantics), **quality and SLA** guarantees, **docs and discoverability**, governed **access**, **versioning** and support. A **certified** product is one the organisation officially trusts. Central to the posting.

    | Property | Meaning |
    |---|---|
    | Discoverable | In the catalog, searchable, well described |
    | Addressable | Stable name/location/API («gold.quality.engine_failure_daily_v1») |
    | Understandable | Grain, definitions, examples, lineage documented |
    | Trustworthy | Quality checks, SLA, certification, observability |
    | Natively accessible | SQL, BI, notebooks, APIs as needed |
    | Interoperable | Conformed keys and dimensions, standard formats |
    | Valuable on its own | Answers real business needs |
    | Secure/governed | Access, classification, retention |

    **Anatomy:** **output ports** (tables/views/APIs/files/feature tables/semantic models; consumers depend on the interface, not internals); **input ports** (sources with contracts); **code** (pipelines, tests, IaC); **metadata** (catalog entry, docs, owner, SLA, contract version); **observability** (freshness, quality, usage, cost); **policies** (access, retention, privacy).

    ## Example: Engine Field Quality (Quality domain)
    - **Purpose:** failure rates by engine model, part, plant, build month for quality engineers, supplier scorecards and a predictive model.
    - **Outputs:** «gold.quality.failure_rates_monthly» (model/part/plant/month), «gold.quality.claim_failure_events» (one per failure event), an ML feature table.
    - **Inputs:** claims (CRM, contract v2), engine builds (MES), parts master (ERP), telemetry aggregates.
    - **Guarantees:** by 07:00 IST on 99% of days; reconciles with CRM claims ±0%; no duplicate failure events; documented definitions of "failure" and "exposure".
    - **People:** product owner, quality analyst steward, data team engineering.
    - **Access:** internal quality/engineering groups; suppliers via a filtered share of their own parts.
    - **Versioning:** breaking change → «_v2» in parallel for a quarter.

    **Certified means:** accountable owner and support channel; documented purpose and grain; versioned schema contract; **SLOs** (freshness, completeness, quality pass rate) measured, published and passing; lineage; security/PII review; usage metrics; agreed change/deprecation policy. Certified products rank first in the catalog; uncertified copies are discouraged or deprecated. "Reusable and discoverable" (the posting): one certified "engine warranty claims" product for finance, quality and ML beats five disagreeing extracts.

    **Data mesh** = domain ownership + data as a product + self-serve platform + federated computational governance; many adopt the product idea without full mesh.

    **What goes wrong:** every table called a "product" without owners/SLAs; products without consumers; duplicated products with different definitions; no versioning.

    **Interview:** what a product is (anatomy + example); what makes it certified; product vs table (owner, contract, guarantees, docs, discoverability, support).
  `),

  semantic: T(`
    > **In one line:** a **semantic model/layer** sits between tables and consumers and defines **business entities, relationships and metrics once** in business language ("approval rate = approved ÷ submitted claims"), so every dashboard, analyst and AI assistant uses the same definitions. It makes **self-service** safe.

    **Problem:** ten Power BI reports compute "approval rate" ten slightly different ways; executives see different numbers and lose trust in all of them.

    **Contents:** tables and relationships (star schema, cardinality, filter direction); **measures** with exact formulas, filters and grain; hierarchies (country → region → dealer; year → quarter → month); friendly names, descriptions, formats, **synonyms**; **row-level security roles**; calculation rules (YTD, prior period, currency conversion).

    | Tool | Semantic layer |
    |---|---|
    | Power BI | **Semantic model** (formerly dataset): Import, DirectQuery or **Direct Lake**; DAX measures |
    | dbt | Semantic Layer / MetricFlow |
    | Looker | LookML |
    | Databricks | **Metric views** in Unity Catalog; Genie spaces for natural-language questions |
    | AtScale, Cube | Universal semantic layers |
    **Metric definitions as code**; semantic layers push queries to the warehouse, with pre-aggregations/materialised views keeping dashboards fast.

    **Self-service done right:** certified semantic models on certified gold; users build reports from governed measures (no copying data out); engineers own tables, BI/analytics engineers own the model, business users own reports.

    **And AI:** natural-language/GenAI questions ("approval rate in the West last quarter?") are answered reliably only when metrics, synonyms and relationships are defined. The semantic model is the **knowledge asset** that grounds them (the posting's "semantic models, knowledge assets").

    **What goes wrong:** measures defined in individual reports; ambiguous relationships (many-to-many, bidirectional filters) → wrong totals; Import refresh times not matching the gold SLA; RLS in the model bypassed by querying tables directly.

    **Interview:** what and why; making self-service safe; how it helps GenAI.
  `),

  aiready: T(`
    > **In one line:** an **AI-ready dataset** is prepared so ML and GenAI use it **correctly and safely**: clean, consistent, documented, with history and **point-in-time correctness** for ML; **chunked, enriched, permission-aware** content for GenAI; governed for privacy, bias and lineage.

    ## For ML (structured)
    - **Grain and labels:** one row per engine per day, label "failed within next 30 days", with a documented label definition (what counts as "failure").
    - **Point-in-time correctness:** features only from data available at prediction time (as-of joins, SCD2 dimensions), else **leakage** (features using information unavailable at prediction time).
    - **History** long enough for patterns and seasonality.
    - **Training/serving consistency:** same feature logic offline and online (feature store/tables).
    - **Quality:** missing values handled and documented, outliers understood, units consistent.
    - **Representative:** know class imbalance (failures are rare) and coverage gaps; **stratify evaluation by segment** (Turbofan's per-fleet evaluation found the missed fault mode).
    - **Versioned:** reproduce the exact training set (Delta time travel, dataset versions).

    ## For GenAI/RAG (unstructured)
    - **Clean extraction** from PDFs, manuals, service reports (check OCR quality); deduplicate.
    - **Chunk** with sensible boundaries and overlap.
    - **Enrich metadata:** doc type, engine model/product line, date, source, language, access level (enables retrieval filtering).
    - **Embeddings** in a vector index, **refreshed incrementally** when documents change.
    - **Permission-aware retrieval:** users must not retrieve chunks from documents they can't read.
    - **Scrub/mask PII**; restrict export-controlled content.
    - **Lineage/freshness:** which document version made each chunk.
    - **Evaluation sets:** questions with expected answers to measure retrieval and answers.

    **Governance for AI:** datasheets/model cards, consent and purpose checks, bias assessment, audit of what data trained which model, drift monitoring.

    **Semantic context:** table/column descriptions, metric definitions and relationships make text-to-SQL and assistants (Databricks Genie, Copilot) accurate. **Good metadata is now an AI input**, not just documentation.

    **Interview:** what makes data AI-ready (both lists; leakage and permissions stand out); what leakage is; preparing service manuals for RAG (extract, clean, chunk, enrich, embed, index with permissions, evaluate, refresh incrementally).
  `),

  pii: T(`
    > **In one line:** personal data (customer names, phones, dealer contacts, technician IDs, VINs linked to owners, location traces) must be **classified, minimised, protected** (masking, tokenisation, encryption, access control) and **deletable**. On immutable files with time travel, "delete" is an engineering problem; **DPDP 2023** and **GDPR** make it a legal one.

    **Classify and minimise:** tag at ingestion (UC tags, Purview classifications): PII, sensitive PII, confidential business, export-controlled technical. **Don't ingest what you don't need** (cheapest protection). Keep PII in few tables (a customer dimension) referenced by surrogate keys elsewhere.

    | Technique | What | Reversible? | Use |
    |---|---|---|---|
    | Access control | Grants, row filters | n/a | Baseline |
    | Dynamic masking | «XXXX-1234» unless authorised (column masks) | Data unchanged | Analysts see what they need |
    | Static masking | Replace values in non-prod copies | No | Dev/test |
    | Tokenisation | Token; secure vault maps back | Yes, for authorised services | Join across systems without exposing values |
    | Keyed hash (HMAC/secret salt) | Deterministic, joinable pseudonym | No, but **unsalted hashes of phone numbers are trivially brute-forced** | Pseudonymous analytics |
    | Encryption at rest/in transit | Storage, TLS | With keys | Default |
    | Column-level encryption | Per-subject or per-domain keys | With keys | High-sensitivity fields |
    | Aggregation / k-anonymity | Only groups ≥ k | No | Reports, external sharing |
    **Pseudonymised data is still personal data** if re-linkable (so a SHA-256 of a phone number isn't anonymous); only truly anonymised data is out of scope.

    ## Right to erasure in a lakehouse
    1. Find every location (lineage, catalog tags, a subject → key index).
    2. DELETE/MERGE in each Delta table (new version without the rows).
    3. Old versions keep the data until **VACUUM** removes files; purge deletion vectors first with «REORG TABLE … APPLY (PURGE)». Set retention so erasure completes within the legal deadline.
    4. Downstream copies, extracts, ML training sets, Kafka (retention or compaction + tombstones), backups.
    5. **Crypto-shredding:** encrypt each subject's PII with a per-subject key; deleting the key makes all copies (backups, old versions) unreadable. Strong for immutable storage.
    6. Log request and completion.

    **Retention conflicts** (claims kept 10 years for legal reasons vs a customer's erasure request) are settled by **legal policy**, then implemented (keep claim facts, erase personal identifiers). Automate deletion by date partition; document retention per dataset.

    **Interview:** deleting a customer with 30 days of time travel (steps above); is a hashed phone anonymous (no); analysts working safely with PII (masks, pseudonyms, purpose-based access).
  `),

  mesh: T(`
    > **In one line:** **data mesh** is an organisational approach: **domains own data as products**, a **self-serve platform** makes building them easy, and **federated computational governance** sets rules everyone automates. It answers the bottleneck of one central team serving a big company; it's not a technology and not right for every organisation.

    1. **Domain ownership:** warranty owns warranty data products, manufacturing owns production data; those who understand the data are accountable.
    2. **Data as a product:** owner, consumers, docs, SLAs, quality checks, versioning, support (the posting's "Data-as-a-Product").
    3. **Self-serve platform:** a platform team provides ingestion, storage, compute, catalog, CI/CD templates, monitoring so domains don't reinvent them.
    4. **Federated computational governance:** global standards (naming, PII rules, interoperability keys like engine serial number, quality metrics) agreed jointly and **enforced by the platform automatically** (policies as code), not review boards.

    | | Central team | Data mesh |
    |---|---|---|
    | Speed across many domains | Bottleneck | Parallel |
    | Consistency | High | Needs strong standards |
    | Maturity needed | Lower | High (domains need DE skills) |
    | Risk | Backlog, lost context | Duplication, inconsistent definitions, "silos with extra steps" |
    Most large companies sit between: a central platform team + domain-aligned product teams + central governance, often on one lakehouse (Unity Catalog catalogs per domain).

    **A DE 1's role:** build and maintain a domain's data products (well-modelled, documented, tested, with contracts and SLAs, in the catalog, reusing platform templates) and understand consumers (analytics, ML, GenAI).

    **Interview:** what mesh is and whether it suits us; what makes a data product; ten domains defining "active engine" ten ways (shared semantic layer/metric definitions, governance standards, certified products).
  `),
};
