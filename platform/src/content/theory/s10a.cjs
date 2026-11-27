const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Data governance
  govwhat: T(`
    > **In one line:** data governance is the set of **roles, policies, processes and tools** that make sure data is **known, trusted, secure, compliant and used well** across a company: who owns it, what it means, who may access it, how good it must be, how long it is kept.

    ## Why it exists
    Without it: nobody knows which "revenue" table is right, sensitive data is copied everywhere, people cannot find data so they recreate it, regulators ask questions nobody can answer, and AI projects train on data nobody trusts. Governance turns data from a liability into an asset.

    ## The pillars
    | Pillar | Question | Mechanisms |
    |---|---|---|
    | **Ownership & stewardship** | Who is accountable? | Data owners, stewards, custodians, RACI |
    | **Metadata & catalog** | What exists and what does it mean? | Catalog, business glossary, documentation |
    | **Quality** | Is it fit for use? | DQ rules, SLAs, certification, issue management |
    | **Access & security** | Who can see/do what? | RBAC/ABAC, masking, row/column security, approvals |
    | **Privacy & compliance** | Are we allowed to do this? | PII classification, consent, GDPR/DPDP, export control, audit |
    | **Lifecycle & retention** | How long do we keep it? | Retention schedules, archival, deletion, legal hold |
    | **Lineage** | Where did it come from, where does it go? | Automated lineage |
    | **Standards** | How do we name, model, document? | Conventions, templates, reviews |

    ## Operating models
    - **Centralised:** one team defines and enforces everything. Consistent, slow, bottleneck.
    - **Federated (common today, data-mesh aligned):** central team sets standards and runs the platform/catalog; domains (supply chain, quality, finance) own their data products and stewardship.
    - **Governance as code:** policies, permissions, quality rules and tags defined in code and enforced automatically in the platform, not in spreadsheets.

    ## For a data engineer, governance is concrete work
    - Register every table in the catalog with owner, description, grain, tags.
    - Tag PII and sensitive columns; apply masks/row filters.
    - Build quality checks and publish results.
    - Capture lineage (use tools that emit it).
    - Implement retention (partition drops, vacuum, lifecycle rules).
    - Grant access through groups and approved processes.
    The posting: "Implements data governance: metadata, access and retention for internal and external users".

    ## How interviewers test this
    - "What is data governance and what is the data engineer's role in it?"
    - "How would you govern a new dataset end to end?" Owner, catalog entry, classification and tags, access policies, quality rules and SLA, lineage, retention, certification.
  `, {
    check: [
      multi('Which are data governance pillars?', ['Ownership and stewardship', 'Access control and privacy', 'Retention and lifecycle', 'Choosing the dashboard font'], [0, 1, 2], 'Plus metadata, quality, lineage and standards.'),
      mcq('In a federated governance model…', ['One central team owns all data', 'A central team sets standards and runs the platform; domains own and steward their data products', 'Nobody owns data', 'Each engineer makes their own rules'], 1, 'Balances consistency and domain knowledge.'),
      tf('"Governance as code" means policies, permissions and quality rules are defined in code and enforced automatically.', true, 'Reviewed, versioned, consistent.'),
    ],
    scenarios: [
      scenario('Governing a new dataset end to end', `
        Your team will publish «gold.engine_health_daily» (one row per engine per day with health score, fault counts, customer and dealer IDs). It will be used by service managers, dealers and a predictive maintenance model.`, [
        ['What comes first?', [
          ['Agree an owner, the grain and definitions, and register the table in the catalog with description and tags', true, 'Ownership and meaning before anything else.'],
          ['Give everyone read access so adoption is quick', false, 'Access without classification risks exposure.'],
          ['Build the dashboard', false, 'Consumption comes after the product is defined and governed.'],
        ]],
        ['Dealers should only see their own engines. How?', [
          ['A row-level security filter in the catalog/semantic model based on the dealer\'s identity or group', true, 'One table, filtered per user.'],
          ['One copy of the table per dealer', false, 'Copies multiply cost and risk.'],
          ['Trust dealers not to filter others', false, 'Not a control.'],
        ]],
        ['What makes it "certified" for the model and the business?', [
          ['Documented quality rules and SLA with monitored results, lineage, version/change policy, and owner sign-off', true, 'Certification is a promise backed by evidence.'],
          ['It is in the gold schema', false, 'Location is not certification.'],
          ['It has many users', false, 'Popularity is not trust.'],
        ]],
      ], 'Governance is a sequence of concrete steps the data engineer implements.'),
    ],
  }),

  // ================================================================== Metadata
  metadata: T(`
    > **In one line:** metadata is **data about data**. **Technical metadata** describes structure and operation (schemas, types, locations, partitions, row counts, run history, lineage); **business metadata** describes meaning (definitions, owners, glossary terms, sensitivity, quality expectations); **operational metadata** describes what happened (load times, freshness, quality results).

    ## Types with examples
    | Type | Examples for «silver.claims» |
    |---|---|
    | **Technical** | Columns and types, Delta location, partitioning, file count/size, table version, constraints |
    | **Business** | "One row per warranty claim submitted by a dealer"; owner: Warranty Ops; «claim_amount» = amount requested excl. tax, INR; glossary term "Claim" |
    | **Operational** | Last updated 05:42, 1,203 rows added, quality checks 14/14 passed, load run ID |
    | **Governance/security** | Classification: Confidential; PII columns: none; retention 7 years; access group |
    | **Lineage** | Built from «bronze.crm_claim_events» by job «claims_silver» v3.2 |
    | **Usage** | Queried by 23 users/week; used by 4 dashboards and 1 model |

    ## Why it matters
    - **Discovery:** people find the right data instead of recreating it.
    - **Understanding:** consistent interpretation of columns and metrics.
    - **Trust:** freshness and quality visible next to the data.
    - **Automation:** pipelines can be **metadata-driven** (a config table listing sources, keys, schedules drives one generic ingestion framework).
    - **Compliance:** classification and retention tags drive masking and deletion.
    - **AI:** LLM assistants and semantic layers need rich metadata to answer questions correctly.

    ## Managing it
    - Capture technical/operational metadata **automatically** (catalog crawlers, table formats, orchestrator and engine integrations).
    - Business metadata needs **people**: owners and stewards write definitions; make it part of the definition of done for any new table.
    - Keep docs **next to the code** (dbt YAML, table comments) so they are versioned and deployed.

    ## How interviewers test this
    - "Technical vs business metadata?"
    - "What is a metadata-driven pipeline?" Generic code driven by configuration tables listing sources, keys, load types, schedules.
  `, {
    check: [
      match('Match the metadata type.', [['Column data types and partitioning', 'Technical'], ['Definition of "active dealer" and the owner', 'Business'], ['Last load time and rows added', 'Operational'], ['PII classification and retention period', 'Governance/security']], 'Different metadata serves different needs.'),
      mcq('What is a metadata-driven ingestion framework?', ['A pipeline per table written by hand', 'One generic pipeline whose behaviour (sources, keys, load type, schedule) is driven by configuration tables', 'A catalog UI', 'A BI tool'], 1, 'Scales to hundreds of tables with consistent behaviour.'),
      tf('Business metadata can be fully generated automatically by crawlers.', false, 'Meaning and ownership need people (stewards and owners).'),
    ],
  }),

  // ================================================================== Catalog
  catalog: T(`
    > **In one line:** a **data catalog** is the searchable inventory of an organisation's data assets with their **metadata, owners, definitions, quality, lineage and access**. It is how people **discover** data and decide whether to **trust** it.

    ## What a good catalog shows for each asset
    Name and description; owner and steward; grain; columns with definitions and tags (PII); classification; freshness and quality status; certification badge; lineage (upstream/downstream); usage statistics; sample/preview (permission-aware); how to request access; related glossary terms.

    ## Tools
    | Tool | Notes |
    |---|---|
    | **Databricks Unity Catalog** | Technical catalog + governance (permissions, lineage, tags, row/column controls) for the lakehouse |
    | **Microsoft Purview** | Enterprise catalog, scanning across Azure/on-prem/multi-cloud, glossary, classification, lineage |
    | **AWS Glue Data Catalog / Lake Formation** | Technical catalog and permissions on AWS |
    | **Google Dataplex** | GCP catalog and governance |
    | **Collibra, Alation, Atlan, DataHub, OpenMetadata** | Enterprise/OSS catalogs with glossary and stewardship workflows |
    Two kinds of catalogs often coexist: the **technical/governance catalog** that enforces access (Unity Catalog, Glue) and the **enterprise discovery catalog** for business users (Purview, Collibra).

    ## Discoverability: making the catalog actually used
    - Every new table registered automatically with a template (owner, description, grain) required before production.
    - Certified assets ranked first in search; deprecated assets marked clearly.
    - Business glossary terms linked to tables and columns.
    - Usage signals (most-used, recently updated) help people choose.
    - Integration with tools where people work (BI, notebooks, SQL editors).

    ## Edge cases and what goes wrong
    - Catalog filled automatically but **no descriptions or owners**: a directory of unknown tables.
    - **Stale entries** for deleted tables; or tables nobody registered (shadow data).
    - **Permissions not enforced** through the catalog: the catalog says "restricted" but storage is open.

    ## How interviewers test this
    - "What is a data catalog and why does it matter?"
    - "How do you make data discoverable and trusted?" Registration, documentation, certification, quality/freshness visible, glossary, usage.
  `, {
    check: [
      mcq('What is the most common reason catalogs fail to help?', ['Too many features', 'Entries without owners, descriptions or certification, so people still cannot tell what to trust', 'They are too fast', 'They use SQL'], 1, 'Metadata quality and ownership make catalogs useful.'),
      tf('Unity Catalog both documents tables and enforces access permissions on them.', true, 'It is a governance catalog, not only a directory.'),
      mcq('Which helps users pick the right table among many similar ones?', ['Alphabetical order', 'Certification badges, owners, quality/freshness status and usage signals', 'File size', 'Creation date only'], 1, 'Trust signals guide choice.'),
    ],
  }),

  // ================================================================== Ownership and stewardship
  ownership: T(`
    > **In one line:** every important dataset needs a **data owner** (accountable business leader who decides what the data means and who may use it), a **data steward** (day-to-day guardian of definitions and quality), and **technical custodians** (engineers who build and run it). Clear ownership is what makes quality issues get fixed.

    ## Roles
    | Role | Responsibilities | Example (claims data) |
    |---|---|---|
    | **Data owner** | Accountable; approves definitions, access, quality targets, retention; budget and priority | Head of Warranty Operations |
    | **Data steward** | Maintains definitions/glossary, monitors quality, triages issues, answers questions, approves access requests on owner's behalf | Warranty data analyst |
    | **Data custodian / engineer** | Builds and operates pipelines and storage, implements controls, fixes technical issues | Data engineering team |
    | **Data producer** | Creates the data at source; responsible for correctness at entry | CRM platform team, dealers |
    | **Data consumer** | Uses data responsibly within policy; reports issues | Analysts, data scientists |
    | **Platform team** | Runs shared infrastructure, catalog, standards | Central data platform |

    ## Why ownership matters
    - **Quality issues need a decision-maker:** "is a claim with amount 0 valid?" is a business question.
    - **Access requests need an approver** who understands the data's sensitivity.
    - **Definitions need authority:** without an owner, three teams define "active dealer" three ways.
    - **Incidents need a contact:** who do we call when the source is wrong?

    ## Making it work
    - Ownership recorded in the catalog for every certified asset.
    - RACI for quality incidents and changes.
    - Owners review access and quality KPIs periodically.
    - Data products (next topics) make ownership explicit by design.

    ## How interviewers test this
    - "Data owner vs steward vs custodian?"
    - "Who decides whether a data quality rule is right?" The owner/steward (business), implemented by engineers.
  `, {
    check: [
      match('Match the role.', [['Data owner', 'Accountable: approves definitions, access and retention'], ['Data steward', 'Maintains definitions and monitors quality day to day'], ['Data engineer (custodian)', 'Builds and runs the pipelines and controls'], ['Data producer', 'Creates data at the source']], 'Clear roles make issues get fixed.'),
      mcq('"Is a warranty claim with amount 0 valid?" Who should decide?', ['The data engineer alone', 'The data owner/steward (business), with engineers implementing the rule', 'Whoever writes the test first', 'Nobody'], 1, 'Business meaning is a business decision.'),
      tf('Recording an owner for each certified table in the catalog is good practice.', true, 'Every important asset needs an accountable contact.'),
    ],
  }),

  // ================================================================== Access control
  access: T(`
    > **In one line:** access control decides **who can see or change which data**: coarse-grained (catalog, schema, table), fine-grained (**row-level security, column masking**), granted to **groups** via **roles (RBAC)** or **attributes/tags (ABAC)**, following **least privilege**, with requests, approvals, reviews and audit.

    ## Models
    | Model | How | Example |
    |---|---|---|
    | **RBAC** (role-based) | Permissions granted to roles/groups; users join groups | Group «claims_readers» has SELECT on «gold.claims» |
    | **ABAC** (attribute-based) | Policies on attributes of users and data (tags) | "Columns tagged PII are masked unless the user is in group privacy_approved" |
    | **ACLs** | Permissions on specific objects/paths | ADLS folder ACLs |
    | **Row-level security (RLS)** | Filter rows by the user's attributes | Dealer sees only rows where dealer_id is theirs |
    | **Column-level security / masking** | Hide or mask columns | Email shown as «a***@x.com» for most users |
    | **Dynamic views** | Views with CASE/filters based on current_user/group | Classic way before native RLS features |

    ## Principles
    - **Least privilege** and **need to know**.
    - **Groups, not individuals:** grant to groups synced from the identity provider; people move teams.
    - **Separate duties:** those who approve access are not the ones who request it; prod write access limited to pipelines (service principals).
    - **Just-in-time / time-bound access** for elevated rights.
    - **Regular access reviews** (quarterly): remove stale permissions.
    - **Audit logs** of who accessed what.
    - **External users** (partners, dealers): separate shares (Delta Sharing, secure views), only their data, contractual controls.

    ## In Unity Catalog terms
    «GRANT SELECT ON TABLE gold.claims TO claims_readers»; row filters and column masks as SQL functions attached to tables; tags on columns drive ABAC policies; lineage and audit logs built in.

    ## Edge cases and what goes wrong
    - Access granted at storage level (keys/SAS) bypassing the catalog's fine-grained rules.
    - "Temporary" admin access never removed.
    - Masked columns leaking via joins/aggregations or via copies into less-governed places.
    - Service accounts with broad write access used by humans.

    ## How interviewers test this
    - "How would you let dealers query claims but only their own?" Row-level security on the shared table/semantic model.
    - "RBAC vs ABAC?"
    - "How do you handle access for external partners?"
  `, {
    check: [
      mcq('Dealers must see only their own claims in a shared gold table. What fits best?', ['A separate copy per dealer', 'Row-level security filtering rows by the user\'s dealer attribute/group', 'Trusting the BI filter set by the dealer', 'Column masking'], 1, 'One governed table, filtered per user.'),
      mcq('ABAC policies typically rely on…', ['User names only', 'Attributes/tags of users and data (e.g. column tagged PII + user group)', 'IP addresses only', 'File names'], 1, 'Tag once, enforce everywhere.'),
      tf('Granting permissions to groups rather than individuals makes access easier to manage and review.', true, 'People change roles; groups stay.'),
    ],
  }),
};
