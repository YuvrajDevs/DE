const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Root cause analysis
  rca: T(`
    > **In one line:** **root cause analysis (RCA)** finds the **underlying reason** a problem happened, not just the symptom, so you can fix it and **prevent recurrence**. The posting asks for exactly this under "Problem Solving".

    ## Symptom vs cause
    - Symptom: "the dashboard shows double revenue for Tuesday."
    - Immediate cause: "Tuesday's partition has every invoice twice."
    - Root cause: "the load appends; a retry after a timeout re-inserted the day; nothing checks uniqueness."
    - Fixes at each level: delete duplicates (symptom), make the load idempotent (cause), add a uniqueness check and alert (detection), review other pipelines for append-on-retry (systemic).

    ## Techniques
    - **5 Whys:** keep asking "why?" until you reach a process or design cause (usually 3-5 levels).
    - **Fishbone (Ishikawa) diagram:** brainstorm causes by category: data/source, code, infrastructure, process, people, environment.
    - **Timeline:** what changed when? Deployments, source releases, config changes, data volume shifts. Most incidents follow a change.
    - **Divide and conquer through the layers:** source → bronze → silver → gold → semantic model → report: find the first layer where data is wrong.
    - **Compare good vs bad:** a good day vs the bad day; a good dealer vs the bad one.
    - **Reproduce:** re-run the step on the same input in a test environment.

    ## The incident process around RCA
    1. **Detect** (ideally your monitoring).
    2. **Triage and contain:** severity, notify consumers, stop bad data spreading (pause downstream, mark data as incorrect).
    3. **Mitigate:** restore correct data quickly (re-run, roll back with time travel).
    4. **Root cause:** techniques above.
    5. **Corrective and preventive actions (CAPA):** fix + tests/checks/alerts + process changes.
    6. **Blameless post-mortem:** document timeline, impact, causes, actions, owners and dates; share learnings.

    ## Example (5 whys)
    Claims missing from yesterday's report. Why? Silver has fewer claims than CRM. Why? Extraction skipped records. Why? Watermark moved past records committed late. Why? Watermark set to job start time, no overlap. Why? Design assumed timestamps are monotonic and there was no reconciliation. → Fix: overlap + MERGE; add daily reconciliation; backfill.

    ## How interviewers test this
    - "Describe a problem you solved: how did you find the root cause and prevent it recurring?" STAR + 5 whys + prevention.
    - "A number on a dashboard is wrong. How do you investigate?" Layer by layer, timeline of changes, compare with source.
  `, {
    check: [
      order('Order the incident steps.', ['Detect', 'Triage and contain', 'Mitigate (restore correct data)', 'Find the root cause', 'Corrective and preventive actions', 'Blameless post-mortem'], 'Contain first, then understand, then prevent.'),
      mcq('Which is a root-cause-level fix for duplicates caused by a retried append load?', ['Delete the duplicate rows', 'Make the load idempotent (overwrite/MERGE) and add a uniqueness check', 'Tell users to ignore Tuesday', 'Restart the cluster'], 1, 'Fix the cause and add detection.'),
      tf('Most data incidents can be traced to a recent change (deploy, source release, configuration or volume).', true, 'Start with a timeline of changes.'),
    ],
    scenarios: [
      scenario('The Monday drop', `
        Every Monday the "claims submitted" KPI is about 15% lower than expected, then catches up by Wednesday. Weekdays are fine. The pipeline runs daily at 02:00 IST and reads claims with «submitted_at» for "yesterday" in UTC.`, [
        ['What is the first thing to check?', [
          ['How the day boundary is defined (IST vs UTC) and when weekend claims actually arrive in the source', true, 'A recurring weekday pattern points to timing and boundaries.'],
          ['Whether the cluster is smaller on Mondays', false, 'Capacity issues would cause failures or delays, not a consistent dip that recovers.'],
          ['Whether dealers stop working on Sundays', false, 'That would not "catch up" by Wednesday.'],
        ]],
        ['You find dealers upload Saturday/Sunday claims in batches on Monday morning with their original submitted_at. Root cause?', [
          ['The daily job only processes "yesterday", so late-arriving weekend claims are never added to their correct days until a later correction', true, 'Late data + no lookback.'],
          ['The CRM loses data', false, 'Data arrives, just late.'],
          ['The KPI formula is wrong', false, 'The formula is fine; inputs are incomplete.'],
        ]],
        ['Preventive fix?', [
          ['Pick records by ingestion time, place them by submitted date, reprocess a 7-day lookback idempotently, and label recent days as provisional on the dashboard', true, 'Handles late data correctly and sets expectations.'],
          ['Run the job on Wednesdays only', false, 'Delays every other day.'],
          ['Ask dealers to upload daily', false, 'Helpful but not under your control; the pipeline must handle late data.'],
        ]],
      ], 'Patterns tied to the calendar usually mean time boundaries or late data. Fix the design, not the symptom.'),
    ],
    interview: [
      talk('Tell me about a problem where you found the root cause and prevented it from recurring.', `
        **STAR with RCA vocabulary:**
        - **Situation/Task:** the symptom and its impact (who was affected, which decision).
        - **Action:** how you contained it, then the investigation: timeline of changes, layer-by-layer comparison, reproduction, 5 whys to the root cause.
        - **Result:** data corrected, time to resolve.
        - **Prevention:** the test/check/alert/design change you added, and what you shared with the team (post-mortem).
        Good sources: the Turbofan alert bug (alerts firing wrongly because …) or the fan-fault diagnosis; a dashboard discrepancy from your analytics work.`, 'hr'),
    ],
  }),

  // ================================================================== Monitoring and alerting
  monitoring: T(`
    > **In one line:** monitoring continuously measures the health of systems and data; alerting notifies the **right person** when something needs **action**. Good monitoring covers **infrastructure, pipelines and data**; good alerting is **actionable, routed, prioritised and rare enough to be trusted**.

    ## What to monitor in a data platform
    | Layer | Metrics |
    |---|---|
    | **Infrastructure** | Cluster utilisation, memory, disk, autoscaling events, failed nodes, quotas |
    | **Pipelines/jobs** | Success/failure, duration vs history, retries, queue/wait time, SLA misses, cost per run |
    | **Streaming** | Input vs processing rate, consumer lag, batch duration, state size, watermark delay, late/dropped records |
    | **Data** | Freshness, volume, NULL rates, duplicates, distribution drift, schema changes, quality-rule results, reconciliation breaks |
    | **Consumption** | Dashboard refresh status, query latency, usage, errors |
    | **Cost** | Spend per job/team, anomalies |

    ## Alerting principles
    - **Alert on symptoms that need action** (SLA at risk, data wrong), not on every fluctuation; send the rest to dashboards.
    - **Severity levels:** page (wake someone) only for business-critical breaches; otherwise ticket/chat.
    - **Routing:** to the owning team/on-call, with escalation.
    - **Context:** what, where, since when, impact, recent changes, links to logs/runbook/dashboard.
    - **Deduplicate and group** related alerts; **suppress** during maintenance; **cooldowns**.
    - **Thresholds from baselines** (seasonality, weekdays), and anomaly detection where rules are hard.
    - **Runbooks** for common alerts: steps to diagnose and fix.
    - **Review alerts regularly:** remove noisy ones, add missing ones after incidents.

    ## Logs, metrics, traces
    - **Logs:** detailed events (structured JSON with run_id, task, dataset).
    - **Metrics:** numeric time-series (rows, duration, lag) for dashboards/alerts.
    - **Traces/lineage:** path of a request/run across components; for data, lineage plus run IDs.

    ## Tools
    Azure Monitor + Log Analytics, Databricks job/system tables and alerts, Airflow callbacks and SLAs, Prometheus/Grafana, Datadog, PagerDuty/Opsgenie for on-call, data observability tools.

    ## How interviewers test this
    - "What would you monitor for a daily batch pipeline? A streaming pipeline?"
    - "How do you prevent alert fatigue?"
    - "What makes an alert actionable?"
  `, {
    check: [
      multi('Which make an alert actionable?', ['Clear description of what failed and its impact', 'Routing to the owning on-call', 'Links to logs and a runbook', 'Sending it to the whole company'], [0, 1, 2], 'Broadcasts are ignored.'),
      mcq('Which streaming metric best shows consumers falling behind?', ['CPU temperature', 'Consumer lag growing over time (input rate > processing rate)', 'Number of columns', 'Cluster name'], 1, 'Lag trends predict SLA breaches.'),
      tf('Every metric deviation should page someone immediately.', false, 'Page only for urgent, actionable issues; dashboards for the rest.'),
    ],
  }),

  // ================================================================== Requirements engineering
  requirements: T(`
    > **In one line:** requirements engineering turns stakeholder needs into **clear, verifiable requirements with acceptance criteria**, keeps **traceability** from each requirement to design, code and tests, and assesses the **impact of changes**. The posting lists it as a competency ("System Requirements Engineering").

    ## Good requirements are…
    | Property | Bad | Good |
    |---|---|---|
    | **Specific** | "Show claims data" | "Daily table of warranty claims, one row per claim, with dealer region and approval status" |
    | **Verifiable / testable** | "Fast dashboard" | "Dashboard loads in < 5 s for 95% of views" |
    | **Unambiguous** | "Active dealers" | "Dealers with ≥ 1 submitted claim in the last 90 days" |
    | **Feasible** | "Real-time everything" | "Fault alerts within 60 s p95; other data hourly" |
    | **Necessary and prioritised** | Everything "must have" | MoSCoW priority (must, should, could, won't) |
    | **Traceable** | Lost in an email | ID, source, owner, linked to stories/tests |

    ## Functional vs non-functional
    - **Functional:** what the data/system must do: datasets, fields, calculations, filters, outputs.
    - **Non-functional:** how well: freshness, latency, availability, scalability, security, privacy, retention, cost, auditability.
    Data projects fail more often on **non-functional** requirements that were never written down.

    ## Acceptance criteria (Given/When/Then)
    "**Given** claims submitted on 2026-11-25 in the CRM, **when** the daily pipeline completes, **then** «gold.claims_daily» contains one row per claim for that date, counts match the CRM within 0, and the table is available by 07:00 IST."

    ## Traceability
    A **traceability matrix** links: requirement → user story → design element (table/column) → code (pipeline/model) → tests → release. Uses:
    - Prove every requirement is implemented and tested (validation).
    - **Change impact analysis:** if requirement R12 changes, which tables, jobs, tests and reports are affected? (Combine with lineage.)
    - Audit and compliance in engineering-heavy companies.

    ## Eliciting requirements for data work: questions to ask
    Who uses it and for what decision? What grain? Which definitions (and who owns them)? What freshness and history? Which filters and drill-downs? What volume? What sensitivity/access rules? What is the source of truth? How will we know it is right (acceptance tests)? What happens if it is late or wrong?

    ## How interviewers test this
    - "How do you gather requirements for a new dataset?"
    - "Write acceptance criteria for a daily KPI table."
    - "A stakeholder changes a definition after go-live. What do you do?" Impact analysis via traceability + lineage, versioning, communication, re-test.
  `, {
    check: [
      mcq('Which requirement is verifiable?', ['"The data should be fresh"', '"gold.claims_daily is updated by 07:00 IST on 99% of business days"', '"The pipeline should be good"', '"Users should like it"'], 1, 'Measurable criteria can be tested and monitored.'),
      match('Match the requirement to its type.', [['One row per claim with dealer region', 'Functional'], ['Available by 07:00 IST', 'Non-functional (freshness)'], ['Dealers see only their rows', 'Non-functional (security)'], ['Keep 7 years', 'Non-functional (retention)']], 'Non-functional requirements are often forgotten.'),
      tf('A traceability matrix helps identify which tables, jobs and tests are affected when a requirement changes.', true, 'Change impact analysis.'),
    ],
    hands: [
      py({ q: 'A tiny **traceability check**. «requirements» is a list of requirement IDs; «links» is a list of «(req_id, kind, item)» where kind is «"story"», «"code"» or «"test"». Write «coverage(requirements, links)» returning a dict: for each requirement, the sorted list of kinds **missing** (requirements fully covered are omitted). Links to unknown requirements are reported under the key «"unknown"» as a sorted list of their req_ids (omit the key if none).', starter: 'def coverage(requirements, links):\n    pass\n',
        tests: `reqs = ['R1', 'R2', 'R3']
links = [('R1', 'story', 'S1'), ('R1', 'code', 'gold.claims'), ('R1', 'test', 't_unique'),
         ('R2', 'story', 'S2'), ('R2', 'code', 'job_x'),
         ('R9', 'test', 't_orphan')]
assert coverage(reqs, links) == {'R2': ['test'], 'R3': ['code', 'story', 'test'], 'unknown': ['R9']}, coverage(reqs, links)
assert coverage(['R1'], [('R1', 'story', 'a'), ('R1', 'code', 'b'), ('R1', 'test', 'c')]) == {}`,
        solution: `def coverage(requirements, links):
    kinds = {'story', 'code', 'test'}
    have = {r: set() for r in requirements}
    unknown = set()
    for req, kind, _ in links:
        if req in have:
            have[req].add(kind)
        else:
            unknown.add(req)
    out = {r: sorted(kinds - k) for r, k in have.items() if kinds - k}
    if unknown:
        out['unknown'] = sorted(unknown)
    return out` }),
    ],
  }),

  // ================================================================== Documentation and validation
  docs: T(`
    > **In one line:** **solution documentation** explains what a data solution does, how it works and how to run it, for users, maintainers and auditors; **solution validation testing** proves the delivered solution meets the agreed requirements with real-world data and users before (and after) go-live.

    ## What to document for a data solution
    | Document | Audience | Contents |
    |---|---|---|
    | **README / overview** | Everyone | Purpose, architecture diagram, how to run, owners |
    | **Data dictionary / catalog entries** | Consumers | Tables, grain, column definitions, metric formulas, freshness, caveats |
    | **Architecture / design doc** | Engineers, architects | Sources, ingestion patterns, layers, model, trade-offs and decisions (ADRs: architecture decision records) |
    | **Runbook** | On-call | Schedules, dependencies, common failures and fixes, backfill/rerun steps, contacts |
    | **Data contracts / SLAs** | Producers and consumers | Schema, semantics, guarantees, change process |
    | **Test plan and results** | QA, owners, auditors | What was tested, how, evidence |
    | **Release notes / changelog** | Consumers | What changed, impact, migration steps |
    Keep docs **close to code** (Markdown in the repo, dbt docs, catalog descriptions) so they stay current; generate what can be generated (lineage, schemas).

    ## Solution validation testing
    Verification asks "did we build it right?" (meets the spec); **validation** asks "did we build the right thing?" (meets the users' real need).
    - **Reconciliation** with source systems and with previously trusted reports.
    - **Known-answer tests:** cases where the correct output is known (a specific claim's approval journey).
    - **Business review/UAT:** stakeholders check numbers and behaviour on real data.
    - **Edge-case scenarios:** late data, corrections, deletes, month-end, timezone boundaries.
    - **Non-functional validation:** load/performance (meets SLA at peak), security (access rules work as intended), recovery (backfill and rerun procedures).
    - **Parallel run** when replacing an old system: run old and new side by side and compare.
    - **Sign-off** recorded with evidence.

    ## Quality assurance mindset
    Define acceptance criteria up front, test against them, keep evidence, and continue validating after go-live with monitoring.

    ## How interviewers test this
    - "What documentation do you write for a pipeline?"
    - "How do you validate that a new data solution is correct before go-live?" Reconciliation, known answers, UAT, edge cases, parallel run, sign-off.
    - "Verification vs validation?"
  `, {
    check: [
      mcq('Verification vs validation:', ['Same thing', 'Verification: built to spec ("built it right"); validation: meets the real user need ("built the right thing")', 'Validation is only for code', 'Verification happens after go-live only'], 1, 'Both are needed.'),
      multi('What belongs in a pipeline runbook?', ['Schedule and dependencies', 'Common failures and how to fix them', 'How to rerun or backfill safely', 'The team\'s holiday photos'], [0, 1, 2], 'Runbooks help on-call act fast.'),
      tf('A parallel run compares an old and a new system on the same inputs before switching over.', true, 'A strong validation technique for replacements.'),
    ],
  }),

  // ================================================================== QA metrics
  qametrics: T(`
    > **In one line:** **quality assurance metrics and KPIs** measure how well a data team delivers and how trustworthy its data is: **delivery** (lead time, deployment frequency, change failure rate), **reliability** (SLA attainment, incidents, time to detect/restore, data downtime), **data quality** (test pass rates, defects, coverage) and **value** (adoption, usage, cost).

    ## Useful KPIs
    | Area | KPI | Meaning |
    |---|---|---|
    | **Data quality** | % critical datasets with automated checks | Coverage of controls |
    | | Check pass rate; failing rows trend | Health over time |
    | | Defects found in production vs before production | How well testing catches issues ("defect escape rate") |
    | **Reliability** | SLA attainment (% of days delivered on time) | Promise kept |
    | | Number/severity of incidents | Stability |
    | | **MTTD / MTTR** (mean time to detect / resolve) | Monitoring and response effectiveness |
    | | **Data downtime** (hours data was missing, wrong or stale × datasets) | Consumer impact |
    | **Delivery (DORA)** | Deployment frequency, lead time for changes, change failure rate, time to restore | Engineering performance |
    | **Testing** | Unit/data test coverage of critical logic; % PRs with tests | Engineering discipline |
    | **Value** | Active users of certified products; # duplicate datasets retired; requests fulfilled | Adoption and reuse |
    | **Cost** | Cost per pipeline/table/query; cost per TB processed | Efficiency |

    ## Using metrics well
    - Few, meaningful KPIs with owners and targets; review trends monthly.
    - Combine leading (coverage, test pass rate) and lagging (incidents, SLA misses) indicators.
    - Do not game metrics (100 trivial tests to raise coverage); focus on impact.
    - Tie to the SDLC: quality gates in CI/CD, post-mortem actions tracked to completion.

    ## How interviewers test this
    - "How would you measure the quality of your data pipelines?"
    - "What are MTTD and MTTR, and how would you improve them?" Better monitoring/alerts (detect), runbooks, idempotent reruns, time travel (restore).
  `, {
    check: [
      match('Match the KPI to what it measures.', [['MTTD', 'How fast problems are detected'], ['MTTR', 'How fast problems are resolved'], ['SLA attainment', 'How often data is delivered on time'], ['Defect escape rate', 'Share of defects found only in production']], 'Measure detection, response, promises and testing.'),
      mcq('Which change most directly reduces MTTR for a failed daily load?', ['More meetings', 'Idempotent reruns, runbooks and time-travel restore so recovery is quick and safe', 'Fewer tests', 'Bigger dashboards'], 1, 'Recovery speed depends on design and preparation.'),
      tf('"Data downtime" counts periods when data was missing, wrong or stale for consumers.', true, 'It captures consumer impact.'),
    ],
  }),
};
