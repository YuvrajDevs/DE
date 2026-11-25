const { learn, mcq, tf, multi, fill, match, order, sql, py, viz, bug, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('quality', 'Data Quality, Governance and Data Products', 'this team\'s focus',
  'The heart of the team-specific requirements: quality dimensions and tests, data contracts, observability, metadata, catalogs, lineage, access and retention, and Data-as-a-Product.',
  [
    lesson('q1', 'Data quality dimensions and checks', 20, [
      learn('Six dimensions of quality', `
        | Dimension | Question | Example check on claims |
        |---|---|---|
        | **Completeness** | Is anything missing? | «dealer_id IS NOT NULL»; row count vs source |
        | **Uniqueness** | Any duplicates? | «claim_id» unique |
        | **Validity** | Does it follow the rules/format? | status in an allowed list; amount ≥ 0 |
        | **Consistency** | Does it agree with itself and other systems? | approved_amount ≤ claim_amount; totals match Salesforce |
        | **Accuracy** | Does it reflect reality? | sample audit against source documents |
        | **Timeliness / freshness** | Is it recent enough? | max(submitted_at) within the last 24 h |

        Your SOQL cross-checks of dashboard numbers are **consistency/reconciliation** checks. In DE you automate them and run them on **every load**.

        **What to do when a check fails:** decide severity in advance.
        - *Block* (error): stop the pipeline and don't publish bad data (duplicate primary keys, schema break).
        - *Warn*: publish, but alert and flag (a small % of NULL optional fields).
        - *Quarantine*: route bad rows to an error table with the reason and publish the rest.
      `),
      match('Match each check to its quality dimension.', [
        ['claim_id appears twice', 'Uniqueness'],
        ['status = "APPRVD"', 'Validity'],
        ['approved_amount > claim_amount', 'Consistency'],
        ['No claims loaded since yesterday morning', 'Timeliness'],
        ['30% of dealer_id values are NULL', 'Completeness'],
      ]),
      sql({ q: `Write a **data quality report** as one row: number of claims with NULL «approved_amount» but status «'Approved'», number with «approved_amount > claim_amount», and number of claims whose «dealer_id» doesn't exist in «dealers». Three columns.`, tables: ['claims', 'dealers'], solution: `SELECT
  SUM(CASE WHEN status = 'Approved' AND approved_amount IS NULL THEN 1 ELSE 0 END) AS approved_without_amount,
  SUM(CASE WHEN approved_amount > claim_amount THEN 1 ELSE 0 END) AS approved_over_claimed,
  SUM(CASE WHEN dealer_id NOT IN (SELECT dealer_id FROM dealers) THEN 1 ELSE 0 END) AS orphan_dealer
FROM claims;`, level: 2 }),
      sql({ q: `Sensor completeness: per engine, the count of readings and the count with NULL «temperature_c». Return only engines with at least one missing temperature: «engine_id, readings, missing».`, tables: ['sensor_readings'], solution: `SELECT engine_id, COUNT(*) AS readings, SUM(CASE WHEN temperature_c IS NULL THEN 1 ELSE 0 END) AS missing
FROM sensor_readings GROUP BY engine_id HAVING SUM(CASE WHEN temperature_c IS NULL THEN 1 ELSE 0 END) > 0;` }),
      py({ q: 'Build a tiny quality framework: «run_checks(rows, checks)». «checks» is a list of «(name, severity, predicate)» where «predicate(row)» returns True for a **good** row. Return a dict «{`passed`: bool, `failures`: {name: count}}». «passed» is False only if an **`error`** severity check has failures (warnings don\'t block).', starter: 'def run_checks(rows, checks):\n    pass\n', tests: `rows = [{'id': 1, 'amt': 10}, {'id': 2, 'amt': -5}, {'id': 3, 'amt': None}]
checks = [('amt_not_null', 'error', lambda r: r['amt'] is not None), ('amt_non_negative', 'warn', lambda r: r['amt'] is None or r['amt'] >= 0)]
res = run_checks(rows, checks)
assert res['failures'] == {'amt_not_null': 1, 'amt_non_negative': 1}, res
assert res['passed'] is False
res2 = run_checks(rows[:2], checks)
assert res2['passed'] is True and res2['failures'] == {'amt_not_null': 0, 'amt_non_negative': 1}, res2`, solution: `def run_checks(rows, checks):
    failures = {}
    passed = True
    for name, severity, pred in checks:
        bad = sum(1 for r in rows if not pred(r))
        failures[name] = bad
        if bad and severity == 'error':
            passed = False
    return {'passed': passed, 'failures': failures}` }),
      mcq('A nightly load finds 2% of claim rows with an unknown dealer_id. The dashboard is used for dealer payouts. Best handling?', ['Drop them silently', 'Publish everything and hope', 'Quarantine those rows with a reason, publish the rest, alert the owner, and reprocess once the dealer master catches up', 'Stop the entire company pipeline for a week'], 2),
    ]),
    lesson('q2', 'Testing, contracts and observability', 18, [
      learn('Shift quality left, watch it in production', `
        **Testing layers for data pipelines**
        - *Unit tests*: transformation functions on tiny inputs (pytest, Spark local).
        - *Data tests*: assertions on real outputs every run (dbt tests, Great Expectations, Soda, Deequ, Delta constraints).
        - *Integration / end-to-end*: a sample flows source → gold in a test environment.
        - *Reconciliation*: counts and sums match the source system.

        **Data contracts**: an explicit, versioned agreement between producer and consumer: schema (names, types, nullability), semantics, SLAs (freshness by 06:00), quality rules and an owner. Breaking changes require a new version and notice. They prevent "someone renamed a column upstream and 14 dashboards broke".

        **Data observability** (Monte Carlo, Databricks Lakehouse Monitoring, custom): monitor **freshness, volume, schema, distribution, lineage** automatically, with anomaly detection: "today's claims volume is 40% below the 4-week same-weekday average".

        Measure what matters: **SLAs** (promise to consumers), **SLOs** (internal target, e.g. 99% of days published by 06:00), **SLIs** (the metric you track).
      `),
      multi('Which belong in a data contract for the «fct_claims» data product?', ['Column names, types, nullability', 'Freshness SLA (e.g. loaded by 06:00 IST)', 'Owner and support channel', 'The producer team\'s lunch schedule', 'Quality rules (claim_id unique, amount ≥ 0)'], [0, 1, 2, 4]),
      mcq('Volume monitoring flags that today\'s sensor rows are 60% lower than usual, yet every pipeline task succeeded. Most likely meaning?', ['All good, the tasks succeeded', 'An upstream source/partition went missing: success ≠ correctness', 'Spark is faster today', 'The dashboard is cached'], 1, 'Silent data failures are the dangerous ones. Volume and freshness monitors catch what task status can\'t.'),
      scenario('A column disappeared upstream', `Monday 07:10. The **Quality** team reports their defect-rate dashboard shows 0% for all plants since Saturday. Pipelines show green.`, [
        ['First move?', [
          ['Check lineage for the dashboard\'s gold table and look at recent schema/volume changes in its upstream sources', true, 'Lineage turns "where do I even start?" into a short list of suspects.'],
          ['Restart all pipelines', false, 'Green pipelines re-running won\'t fix a logic or schema problem.'],
          ['Tell Quality the dashboard is fine', false, 'Never dismiss a consumer report without checking.'],
        ]],
        ['You find the MES source renamed «defect_flag» to «is_defective» on Saturday. Your silver job read the missing column as NULL and the rate became 0. Fix now?', [
          ['Map the new column, backfill Saturday to Monday, verify against the source, and tell consumers what happened and what was restated', true, 'Fix, backfill, verify, communicate: the full incident loop.'],
          ['Hard-code the rate to last week\'s value', false, 'Fabricating data destroys trust.'],
        ]],
        ['Prevention?', [
          ['A data contract with the MES team plus a schema check that fails the load when a required column is missing', true, 'A missing required column should be an error, never a NULL default.'],
          ['Ask the MES team to never change anything', false, 'Unrealistic. Make changes explicit and detectable instead.'],
        ]],
      ]),
      tf('If every task in the DAG succeeded, the data is correct.', false, 'Task success only means the code didn\'t crash. Data tests and monitors tell you whether the output is right.'),
    ]),
    lesson('q3', 'Metadata, catalogs and lineage', 15, [
      learn('Make data findable and traceable', `
        **Metadata** = data about data:
        - *Technical*: schema, types, partitions, file locations, row counts.
        - *Business*: definitions ("approved claim = claim with status Approved or Partially Approved"), owner, domain, glossary terms, certification status.
        - *Operational*: last refresh, run duration, quality results, usage (who queries it).

        A **data catalog** (Unity Catalog, Microsoft Purview, Collibra, Alation, DataHub, AWS Glue Catalog) makes datasets **discoverable**: search "warranty claims" and find the certified table, its owner, definition, quality score and sample rows.

        **Lineage** = the graph of where data comes from and what depends on it, ideally down to the column level.
        - *Impact analysis*: "if I change «stg_claims.status», which 12 dashboards and ML features break?"
        - *Root-cause analysis*: "this KPI is wrong, so which upstream step changed?"
        - *Compliance*: "where does this PII field flow?"
        Lineage is captured automatically from SQL/Spark (Unity Catalog, OpenLineage, dbt docs) rather than drawn by hand.
      `),
      match('Classify the metadata.', [
        ['claim_amount is DECIMAL(12,2)', 'Technical'],
        ['"Approved claim" business definition', 'Business'],
        ['Last refreshed 05:42, took 7 min', 'Operational'],
        ['Owner: Warranty Data Product team', 'Business'],
      ]),
      mcq('A product manager wants to rename a column in a silver table. What do you check first?', ['Downstream lineage: which models, dashboards and consumers use it', 'The color of the dashboard', 'Spark version', 'Nothing, renames are harmless'], 0),
      order('Order the lineage of the dealer payout KPI from source to consumer.', ['Salesforce Claim object (source)', 'bronze.claims_raw', 'silver.claims (typed, deduped)', 'gold.fct_claims + dim_dealer', 'Dealer payout dashboard']),
    ]),
    lesson('q4', 'Governance: access, privacy, retention', 15, [
      learn('Who may see what, for how long', `
        **Access control**
        - **RBAC**: grant on roles, not people («GRANT SELECT ON gold.fct_claims TO role_warranty_analysts»). Principle of **least privilege**.
        - **Row-level security**: dealers see only their own rows. **Column masking**: show «customer_phone» as «******1234» unless the user is in the PII group.
        - **ABAC / tags**: tag columns «pii=true» and apply policies by tag across all tables.

        **Privacy**: identify PII (names, phone, email, Aadhaar, precise location), minimise it, mask/tokenise/hash it, and document lawful purpose (India's DPDP Act, GDPR for EU data). Pseudonymise before analytics where possible.

        **Retention**: keep data as long as needed by policy and law, then archive/delete automatically (lifecycle rules on storage, «VACUUM» old Delta versions, TTLs). Raw PII often has the shortest retention.

        **Export controls**: the posting mentions licensing for export controls. Some engineering data (designs, technical specs) is regulated, and access depends on nationality and jurisdiction. Classification tags + access policies enforce this.

        **Audit**: log who accessed what, when. Catalogs like Unity Catalog and Purview provide audit trails.
      `),
      mcq('Dealers should query the claims table but only see their own claims. Which control?', ['Column masking', 'Row-level security', 'Encryption at rest', 'A separate copy of the table per dealer'], 1, 'Row filters keyed to the user\'s dealer attribute. Copies per dealer multiply storage, cost and drift.'),
      mcq('Analysts need to count distinct customers across systems but must not see their phone numbers. Best approach?', ['Give full access and trust them', 'Hash/tokenise the identifier consistently so joins and counts still work', 'Delete the column everywhere', 'Store phones in a CSV on SharePoint'], 1),
      tf('Least privilege means giving every engineer admin rights so they are never blocked.', false),
      multi('Which are good governance practices?', ['Grant access to roles/groups, not individuals', 'Tag PII columns and apply masking policies by tag', 'Share service-account passwords in Teams chat', 'Automate retention and deletion', 'Keep an audit log of data access'], [0, 1, 3, 4]),
    ]),
    lesson('q5', 'Data-as-a-Product and data mesh', 15, [
      learn('Treat datasets like products', `
        **Data-as-a-Product** (from data mesh thinking): a dataset is built and run like a product, with **consumers, an owner, quality guarantees and a roadmap**, rather than being a by-product of a pipeline.

        A good data product is:
        | Property | Means |
        |---|---|
        | **Discoverable** | in the catalog, searchable, with clear name and description |
        | **Addressable** | stable location / interface (table name, API) |
        | **Trustworthy** | tested, with published quality metrics and SLAs, **certified** |
        | **Self-describing** | schema, semantics, business glossary, sample queries, lineage |
        | **Interoperable** | conformed keys and dimensions shared across domains |
        | **Secure** | governed access, PII handled |
        | **Reusable** | serves many consumers: BI, analytics, automation, ML/GenAI |

        **Data mesh**: domains (Supply Chain, Quality, Finance, Product Lifecycle) own their data products end to end, on a shared self-serve platform, under **federated governance** (common standards, local ownership).

        **Certified data product**: passed review: documented, owned, tested, meets SLA. Consumers can trust it for decisions.

        This is literally the job description: *"Apply Data-as-a-Product principles to create reusable, discoverable, and governed data assets with appropriate metadata, lineage, and quality controls."*
      `),
      multi('Which properties make «gold.warranty_claims» a real data product rather than "just a table"?', ['A named owner and support channel', 'Documented schema and business definitions in the catalog', 'Published freshness SLA and quality test results', 'It lives in someone\'s personal schema', 'Conformed dealer and date keys reused by other domains'], [0, 1, 2, 4]),
      mcq('In a data mesh, who owns the Quality domain\'s defect data product?', ['A central data team that owns all data', 'The Quality domain team, using the shared platform and governance standards', 'Whoever queries it most', 'Nobody'], 1),
      talk('Interview: *"How would you turn the warranty claims data into a certified data product?"*', `
        Structure your answer as a lifecycle:
        1. **Consumers & use cases**: who uses it (Warranty ops, Finance accruals, Quality root-cause, GenAI assistant), what decisions, required freshness and grain.
        2. **Model**: grain = one row per claim; conformed dims (dealer, engine, date, failure); clear definitions (approved, claim cycle time).
        3. **Build**: incremental, idempotent ELT from Salesforce/portal → bronze → silver → gold, versioned code, CI.
        4. **Quality**: tests (unique claim_id, FK integrity, approved ≤ claimed, freshness by 06:00), quarantine, reconciliation against Salesforce totals.
        5. **Metadata & lineage**: catalog entry, glossary terms, column docs, owner, lineage auto-captured.
        6. **Governance**: RBAC, row-level security for dealers, PII masking, retention.
        7. **Operate**: SLA monitoring, alerts, incident process, versioning/deprecation policy, usage metrics. Then **certify** it.
        8. **AI-ready**: clean text fields (failure descriptions), stable IDs, semantic descriptions so GenAI and ML can use it.

        Tie it to your experience: *"Today I already reconcile CRM Analytics KPIs against SOQL and model the CRF-to-credit-note process. This formalises that into a product."*
      `, 'design'),
    ]),
  ]);
