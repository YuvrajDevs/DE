const { T } = require('../_t.cjs');

module.exports = {
  sdlc: T(`
    > **In one line:** the **SDLC** takes a need from idea to running, supported software: **requirements → design → build → test → deploy → operate/maintain**, repeated. Pipelines follow it with data-specific testing and operations.

    | Stage | Data-engineering specifics |
    |---|---|
    | Requirements | Consumers, grain, metric definitions, freshness SLA, volumes, sensitivity; **profile the source** before designing |
    | Design | Sources, ingestion pattern, layers, facts/dims, quality rules, security; **data contracts** agreed with producers |
    | Build | Pipelines, transformations, tests, IaC, docs |
    | Test | Unit, data tests, integration on realistic data (**synthetic/masked test data strategy**), reconciliation, performance, UAT against business-reconciled numbers |
    | Deploy | CI/CD, environment promotion, **backfill and cut-over plans** |
    | Operate | SLAs, alerts, incidents, cost, schema changes, deprecations; **hypercare** after go-live with daily reconciliation |

    **Models:** **waterfall** (stage by stage: predictable, slow to adapt, late discovery of misunderstandings); **iterative/Agile** (short cycles, working increments, feedback); **V-model** (each build stage paired with a test stage, requirements ↔ acceptance tests: common in regulated/engineering firms, maps to "solution validation testing"); **DevOps/continuous delivery** (automated build-test-deploy).

    **Definition of done for a pipeline:** reviewed and tested code, data tests, monitoring and alerts, runbook, catalog docs, owner assigned, backfill done and reconciled, consumers signed off.

    **Why interviewers ask:** the posting lists SDLC, QA metrics, documentation, validation testing and requirements engineering. They want someone who clarifies requirements, documents, tests, releases safely and supports what they build, not just writes code.

    **Interview:** request → production walk-through; which SDLC model you've used (tie to real sprints, releases, UAT).
  `),

  agile: T(`
    > **In one line:** **Agile** delivers in small, frequent increments with continuous feedback. **Scrum** uses fixed **sprints** with roles and ceremonies; **Kanban** manages **continuous flow** with visual boards and **WIP limits**. Data teams often use Scrum for build work and Kanban for operations; many run both.

    **Principles for data teams:** deliver value early (a useful table/dashboard in weeks, not a big-bang platform in a year); work with stakeholders continuously; welcome but manage changing requirements (backlog, priorities); working software and data measure progress; reflect and improve.

    | Scrum element | What |
    |---|---|
    | Product owner | Owns backlog and priorities; business value |
    | Scrum master | Facilitates, removes blockers |
    | Developers | Cross-functional team |
    | Sprint | 1-4 weeks with a goal |
    | Backlog + refinement | Ordered stories, tasks, bugs |
    | Planning / daily stand-up (15 min) / review (demo) / retrospective | Ceremonies |
    | Definition of done | For data: tested, documented, catalogued, monitored, deployed |
    | Estimation | Story points, velocity |

    **Kanban:** board «Backlog → Ready → In progress → Review → Done»; **WIP limits** per column prevent overload and expose bottlenecks; pull work as capacity frees; no sprints; metrics **lead time** (request → done), **cycle time** (start → done), throughput, cumulative flow. Fits incidents, access requests, small changes.

    **Data work in sprints:** **discovery spikes** (profile the source before estimating); **thin vertical slices** (one source to one gold metric end to end, then widen); explicit acceptance criteria with reconciled numbers.

    **User story:** "As a **warranty manager**, I want **claims approval rate by dealer and month refreshed daily by 07:00**, so that **I can follow up with low-approval dealers**" + acceptance criteria (definitions, grain, freshness, access, reconciliation with CRM).

    **What goes wrong:** sprints swamped by unplanned support (Kanban lane or reserved capacity); vague stories without criteria; "can't demo data work" (demo the table, checks, dashboard, lineage); Agile as an excuse for no design or docs.

    **Interview:** Scrum vs Kanban and when; your definition of done; working in sprints (real ceremonies, handling changing requirements).
  `),

  devops: T(`
    > **In one line:** **DevOps** joins development and operations so software is built, tested, released and run **quickly and safely** through automation and shared ownership. **CI** builds and tests every change; **CD** promotes tested changes through environments. **DataOps** applies this to pipelines and data quality.

    «««flow
    Branch -> PR (review) -> CI: lint, unit tests, data tests on samples, build artefacts, validate DAGs/bundles -> Merge -> CD: deploy dev/test -> integration tests on realistic data -> approval -> prod -> smoke checks + monitoring
    »»»

    **CI on every PR:** lint/format/static analysis (ruff, sqlfluff); **pytest** unit tests with small fixtures (duplicates, NULLs, late records); dbt compile + build or Spark on a CI schema/sample with data tests (**slim CI**: changed models and dependents only); **data diff** vs production for changed models; schema/contract compatibility; **DAG integrity** (Airflow DAGs import, no cycles); IaC «terraform plan» and «databricks bundle validate»; security scans (secrets, vulnerable dependencies).

    **CD:** deploy code, jobs, workflows, infrastructure to each environment **from the same artefact** with environment config (not code edits); approvals for prod; **versioned, backward-compatible migrations** (add column → backfill → switch readers → drop old later); **rollback** (redeploy previous version; time travel/RESTORE for data); **blue/green or write-audit-publish for tables** (build alongside, validate, swap pointers/views, keep the old for rollback).

    **Tooling:** GitHub Actions, Azure DevOps, GitLab CI, Jenkins; Terraform/Bicep; Databricks Asset Bundles, dbt Cloud jobs, Airflow deployments; container registries; Key Vault secrets.

    | Environment | Data | Purpose |
    |---|---|---|
    | Dev | Small synthetic/masked samples | Build, experiment |
    | Test/QA/UAT | Realistic masked prod-like data | Integration, performance, acceptance |
    | Prod | Real | Business; changes only via CD |
    Never let unmasked prod data flow to lower environments.

    **Beyond CI/CD:** IaC, monitoring and alerting, on-call and incidents, blameless post-mortems, small frequent changes, trunk-based development or short-lived branches, feature flags, **DORA metrics** (deployment frequency, lead time for changes, change failure rate, time to restore), which apply to data teams too.

    **Interview:** your data CI/CD; testing in CI without prod data (synthetic/masked fixtures, sample schemas); "automate deployment of a distributed data system" (IaC + CI/CD + promotion + automated tests + monitoring).
  `),

  git: T(`
    > **In one line:** **Git** records every change to code and config (who, why), enables parallel **branches**, review via **pull requests**, and rollback. For data teams **everything** (pipelines, SQL, DAGs/bundles, infrastructure, tests, docs) belongs in Git.

    | Concept | Meaning |
    |---|---|
    | Commit | Snapshot with message and author |
    | Branch | Parallel line of work |
    | Merge / rebase | Combine branches; merge keeps history, rebase rewrites onto a new base |
    | Pull request | Proposed merge with review, CI, discussion |
    | Conflict | Same lines changed differently; resolve manually |
    | Tag/release | Named deployable version |
    | .gitignore | Never committed: secrets, data, build outputs |

    **Workflows:** **GitHub flow / feature branches** (short-lived branch → PR → review + CI → merge → deploy); **trunk-based** (very short branches, frequent merges, feature flags): the norm; **Gitflow** (develop/release/hotfix: heavier, long-lived branches create merge pain for pipelines).

    ## Practices
    - Small focused commits with clear messages ("Add SCD2 merge for dim_dealer").
    - Every change through a PR with review and green CI; protect main.
    - **Never commit secrets or data**; use secret managers and leak scanning. If a secret leaks, **rotate immediately** (removing it from history isn't enough), then remove from code/history.
    - Notebooks in Git (Databricks Git folders) with **outputs stripped**; review them as source files («.py» with cell markers) for readable diffs.
    - Config and infrastructure versioned with the code.
    - **Recovering:** «git revert» on shared history; never force-push shared branches (destroys others' work); «git bisect» finds the commit that broke a transformation.

    **What goes wrong:** large data files committed (repo bloat; use storage); long-lived branches; "fix in prod directly" (overwritten by the next deploy).

    **Interview:** your Git workflow; merge vs rebase; committed a password (rotate first, remove, add scanning, use a secret manager).
  `),

  testing: T(`
    > **In one line:** pipelines need **unit tests** (one transformation, tiny inputs), **integration tests** (components together on realistic data), **regression tests** (outputs didn't change unexpectedly), **data tests** (the data meets rules each run), plus **performance** and **user acceptance** tests.

    | Level | What | Example | Tools |
    |---|---|---|---|
    | Unit (many, fast) | Pure logic, hand-made edge-case inputs | «dedupe_latest()» keeps the newest row, handles ties and NULL keys | pytest, chispa, dbt unit tests |
    | Data tests (every prod run) | Rules on real data | claim_id unique; dealer exists; amount ≥ 0; freshness | dbt tests, Great Expectations, Soda, DLT expectations |
    | Integration (fewer) | End to end on realistic masked data in a test environment | Bronze → silver → gold for a sample day; counts reconcile | CI/CD jobs, test workspaces |
    | Regression | Old vs new output | Last month's gold identical except where intended | Table diffs (EXCEPT, data-diff), snapshots |
    | Performance/load | Runtime and cost at expected/peak volume | 10× data within SLA | Load tests (Turbofan's) |
    | UAT/validation | Users confirm the need is met | Warranty team checks known cases | Sign-off |

    **Good unit tests:** transformations as **pure functions** (DataFrame in → DataFrame out) separate from I/O; fast (small data, local Spark) and deterministic; test behaviour, not implementation. **Test the unhappy paths:** empty input, duplicates, NULLs in keys and values, late/out-of-order records, timezone boundaries, schema variations/changes, extreme values, **re-runs (idempotency)**, crashes mid-write.

    **Regression with data diffs:** run old and new code on the **same input snapshot** and compare per key:
    «««sql
    (SELECT * FROM gold_new EXCEPT SELECT * FROM gold_old)
    UNION ALL
    (SELECT * FROM gold_old EXCEPT SELECT * FROM gold_new)
    »»»
    Empty = no unintended change; every difference must be explained by the change. The strongest safeguard for refactors and migrations.

    **Interview:** testing a pipeline (the pyramid with examples); unit vs integration vs regression; edge cases for a dedupe function.
  `),

  rca: T(`
    > **In one line:** **root cause analysis** finds the **underlying reason** a problem happened, not just the symptom, so you fix it and **prevent recurrence** (the posting's "Problem Solving").

    **Levels, with a fix at each:**
    - **Symptom:** "dashboard shows double revenue for Tuesday" → delete duplicates.
    - **Immediate cause:** "Tuesday's partition has every invoice twice" → make the load idempotent.
    - **Root cause:** "the load appends; a retry after a timeout re-inserted the day; nothing checks uniqueness" → add a uniqueness check and alert (detection).
    - **Systemic:** review other pipelines for append-on-retry.
    Also separate **trigger, root cause and contributing factors**: a NULL flood (trigger) from a firmware change (root cause) went unnoticed because no null-rate check existed (contributing factor).

    ## Techniques
    - **5 Whys** (3-5 levels to a process/design cause, with evidence at each step).
    - **Fishbone (Ishikawa):** causes by category (data/source, code, infrastructure, process, people, environment).
    - **Timeline:** what changed when (deploys, source releases, upstream schema, config, volume): most incidents follow a change.
    - **Layer by layer:** source → bronze → silver → gold → semantic model → report; find the first wrong layer.
    - **Compare good vs bad** (good day vs bad day; good dealer vs bad).
    - **Reproduce** on the same input in test.
    - **Bisect:** data versions via time travel, code via «git bisect».

    ## Incident process
    1. **Detect** (ideally your monitoring).
    2. **Triage and contain:** severity, notify consumers, stop spread (pause downstream, mark data incorrect).
    3. **Mitigate:** restore correct data fast (re-run, time-travel rollback).
    4. **Root cause.**
    5. **CAPA** (corrective and preventive actions): fix + tests/checks/alerts + process changes.
    6. **Blameless post-mortem:** timeline, impact (which data, consumers, how long), causes, actions with owners and dates; share learnings.

    **5 Whys example:** claims missing from yesterday's report → silver has fewer claims than CRM → extraction skipped records → watermark moved past late-committed records → watermark set to job start time, no overlap → design assumed monotonic timestamps, no reconciliation. **Fix:** overlap + MERGE, daily reconciliation, backfill.

    **Interview:** a problem you solved (STAR + 5 Whys + prevention; a real one from your work lands best); investigating a wrong dashboard number (layer by layer, change timeline, compare with source).
  `),

  monitoring: T(`
    > **In one line:** monitoring continuously measures system and data health; alerting tells the **right person** when **action** is needed. Cover **infrastructure, pipelines and data**; make alerts **actionable, routed, prioritised and rare enough to be trusted**.

    | Layer | Metrics |
    |---|---|
    | Infrastructure | Cluster utilisation, memory, disk, autoscaling events, failed nodes, quotas |
    | Pipelines | Success/failure, duration vs history, retries, queue time, SLA misses, cost per run |
    | Streaming | Input vs processing rate, consumer lag (offsets and time), batch duration vs trigger, state size, watermark delay, late/dropped rows |
    | Data | Freshness, volume, NULL rates, duplicates, distribution drift, schema changes, rule results, reconciliation breaks |
    | Consumption | Dashboard refresh status, query latency, usage, errors |
    | Cost | Spend per job/team, anomalies |
    **Golden signals for pipelines:** freshness (source → served lag), volume vs expected, quality pass rates, duration, errors, cost.

    ## Alerting principles
    - **Alert on symptoms needing action** (SLA at risk, data wrong); the rest goes to dashboards.
    - **Severity tiers:** page only for business-critical breaches; otherwise ticket/chat.
    - **Route** to the owner/on-call with escalation.
    - **Context:** what, where, since when, impact, recent changes, links to logs/runbook/dashboard.
    - **Deduplicate, group, suppress** during maintenance; cooldowns.
    - **Baseline thresholds** (seasonality, weekdays); anomaly detection where rules are hard.
    - **Runbooks** per common alert.
    - **Review regularly:** remove noisy alerts, add missing ones after incidents. Track MTTD and MTTR.

    **Signals:** **logs** (structured JSON with run_id, task, dataset); **metrics** (rows, duration, lag time series); **traces/lineage** (a run's path across components: lineage + run IDs).

    **Tools:** Azure Monitor + Log Analytics, Databricks job/system tables and alerts, Airflow callbacks and SLAs, Prometheus/Grafana, Datadog, PagerDuty/Opsgenie, data observability tools.

    **Interview:** what to monitor for daily batch vs streaming; preventing alert fatigue; what makes an alert actionable.
  `),

  requirements: T(`
    > **In one line:** requirements engineering turns needs into **clear, verifiable requirements with acceptance criteria**, keeps **traceability** from requirement to design, code and tests, and assesses **change impact** (the posting's "System Requirements Engineering").

    | Property | Bad | Good |
    |---|---|---|
    | Specific | "Show claims data" | "Daily table, one row per claim, with dealer region and approval status" |
    | Verifiable | "Fast dashboard" | "Loads in < 5 s for 95% of views" |
    | Unambiguous | "Active dealers" | "Dealers with ≥ 1 submitted claim in the last 90 days" |
    | Feasible | "Real-time everything" | "Fault alerts within 60 s p95; other data hourly" |
    | Prioritised | All "must have" | MoSCoW (must, should, could, won't) |
    | Traceable | Lost in email | ID, source, owner, linked to stories/tests |

    **Functional** = what (datasets, fields, calculations, filters, outputs). **Non-functional** = how well (freshness, latency, availability, scalability, security, privacy, retention, cost, auditability). Data projects fail more on **unwritten non-functional requirements**.

    **Acceptance criteria (Given/When/Then):** "**Given** claims submitted on 2026-11-25 in the CRM, **when** the daily pipeline completes, **then** «gold.claims_daily» has one row per claim for that date, counts match the CRM exactly, and it's available by 07:00 IST."

    **Traceability matrix:** requirement → story → design element (table/column) → code → tests → validation evidence → release (or tickets linked to PRs and tests). Proves every requirement is implemented and tested; enables **change impact analysis** (R12 changes → which tables, jobs, tests, reports? combine with lineage; estimate effort/risk; communicate before changing); supports audit in engineering-heavy companies.

    **Questions to ask (data checklist):** who uses it, for which decision? Grain? Definitions (with examples) and their owners? Dimensions, history (SCD), freshness, latency? Filters/drill-downs? Volume and growth? Accuracy tolerance? Sensitivity/PII and access? Retention? Source of truth and its owner? Acceptance tests (reconcile to a known report)? What if it's late or wrong?

    **Interview:** gathering requirements for a dataset; acceptance criteria for a daily KPI table; a definition changes after go-live (impact via traceability + lineage, versioning, communication, re-test).
  `),

  docs: T(`
    > **In one line:** **solution documentation** explains what a solution does, how it works and how to run it, for users, maintainers and auditors; **validation testing** proves it meets the agreed requirements with real data and users, before and after go-live.

    | Document | Audience | Contents |
    |---|---|---|
    | README / overview (per pipeline) | Everyone | Purpose, inputs, outputs, schedule, architecture diagram, how to run and backfill, owners |
    | Data dictionary / catalog | Consumers | Tables, grain, definitions, metric formulas, freshness, caveats (generated from code where possible) |
    | Design doc + **ADRs** | Engineers, architects | Sources, patterns, layers, model; decisions as context → decision → consequences (Turbofan has ADRs) |
    | Runbook (per alert) | On-call | Schedules, dependencies, common failures and fixes, rerun/backfill steps, contacts |
    | Contracts/SLAs | Producers, consumers | Schema, semantics, guarantees, change process |
    | Test plan + results | QA, owners, auditors | What, how, evidence |
    | Release notes | Consumers | Changes, impact, migration |
    Keep docs **close to code** (repo Markdown, dbt docs, catalog descriptions) and generate what can be (lineage, schemas).

    **Verification** = "did we build it right?" (meets the spec); **validation** = "did we build the right thing?" (meets the real need).

    ## Validation testing
    - **Reconcile** with source systems and previously trusted reports.
    - **Known-answer tests** (a specific claim's approval journey).
    - **UAT:** stakeholders check numbers and behaviour on real data.
    - **Edge scenarios:** late data, corrections, deletes, month-end, timezone boundaries.
    - **Non-functional:** load/performance at peak, security (access rules work), recovery (backfill/rerun).
    - **Parallel run** when replacing a system.
    - **Sign-off with evidence**: test plans tied to acceptance criteria, reconciled results, business-owner approval, **stored with the change**, not in someone's inbox.
    QA mindset: criteria up front, test against them, keep evidence, keep validating after go-live via monitoring.

    **Interview:** what you document; validating before go-live (reconciliation, known answers, UAT, edge cases, parallel run, sign-off); verification vs validation.
  `),

  qametrics: T(`
    > **In one line:** QA metrics/KPIs measure how well a data team delivers and how trustworthy its data is: **delivery** (lead time, deployment frequency, change failure rate), **reliability** (SLA attainment, incidents, time to detect/restore, data downtime), **data quality** (pass rates, defects, coverage) and **value** (adoption, usage, cost).

    | Area | KPI | Meaning |
    |---|---|---|
    | Data quality | % critical datasets with automated checks | Control coverage |
    | | Pass rate; failing-rows trend | Health over time |
    | | **Defect escape rate** (found in prod vs before) | How well testing catches issues |
    | Reliability | SLA/SLO attainment (% days on time, freshness, quality) | Promise kept |
    | | Incident count and severity | Stability |
    | | **MTTD / MTTR** | Detection and response |
    | | **Data downtime** (hours missing/wrong/stale × datasets) | Consumer impact |
    | Delivery (DORA) | Deployment frequency, lead time, change failure rate, time to restore | Engineering performance |
    | Testing | Test coverage of critical logic; % PRs with tests | Discipline |
    | Value | Active users/queries of certified products; duplicate datasets retired; requests fulfilled; support tickets | Adoption and reuse |
    | Cost | Per pipeline/table/query; per TB processed | Efficiency |

    **Using them:** few KPIs with owners and targets, reviewed monthly as trends; mix **leading** (coverage, pass rate) and **lagging** (incidents, SLA misses) indicators; don't game them (100 trivial tests for coverage); tie to the SDLC (CI/CD quality gates, post-mortem actions tracked to done); **steer, don't punish** (targets agreed with the team).

    **Improving MTTD/MTTR:** better monitoring and alerts (detect); runbooks, idempotent reruns, time travel (restore).

    **Interview:** measuring pipeline quality; MTTD/MTTR and improving them.
  `),
};
