const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== SDLC
  sdlc: T(`
    > **In one line:** the **software development life cycle (SDLC)** is the sequence of stages that takes a need from idea to running, supported software: **requirements → design → build → test → deploy → operate/maintain**, repeated. Data pipelines follow the same cycle, with data-specific testing and operations.

    ## The stages, for a data pipeline
    | Stage | What happens | Data-engineering specifics |
    |---|---|---|
    | **Requirements** | Understand the need, write verifiable requirements and acceptance criteria | Consumers, grain, metrics definitions, freshness SLA, volumes, sensitivity |
    | **Design** | Architecture and data model | Sources, ingestion pattern, layers, model (facts/dims), quality rules, security |
    | **Build** | Code and configuration | Pipelines, transformations, tests, IaC, docs |
    | **Test** | Verify it works | Unit tests, data tests, integration on realistic data, reconciliation, performance, UAT with users |
    | **Deploy** | Release to production | CI/CD, environment promotion, backfills, cut-over |
    | **Operate & maintain** | Run, monitor, fix, evolve | SLAs, alerts, incidents, cost, schema changes, deprecations |

    ## Models
    - **Waterfall:** each stage completed before the next. Predictable, but slow to adapt; late discovery of misunderstandings.
    - **Iterative/Agile:** short cycles delivering working increments, adapting with feedback (next topic).
    - **V-model:** each development stage has a matching test stage (requirements ↔ acceptance tests). Common in regulated/engineering companies; maps well to "solution validation testing".
    - **DevOps/continuous delivery:** automation makes build-test-deploy continuous.

    ## Why it matters in interviews
    The posting lists SDLC, QA metrics, solution documentation, validation testing and requirements engineering. They want someone who **does not just write code**: who clarifies requirements, documents, tests, releases safely and supports what they build.

    ## How interviewers test this
    - "Walk me through how you deliver a data pipeline from request to production."
    - "Which SDLC model have you worked with?" Connect to real experience (sprints, releases, UAT).
  `, {
    check: [
      order('Order the SDLC stages.', ['Requirements', 'Design', 'Build', 'Test', 'Deploy', 'Operate and maintain'], 'Repeated in iterations.'),
      mcq('In the V-model, what does each development stage pair with?', ['A deployment', 'A corresponding test level (e.g. requirements ↔ acceptance testing)', 'A sprint', 'A code review'], 1, 'Verification and validation planned from the start.'),
      tf('For data pipelines, testing includes checking the data (reconciliation, quality rules), not just the code.', true, 'Data can be wrong even when code is right.'),
    ],
  }),

  // ================================================================== Agile, Scrum, Kanban
  agile: T(`
    > **In one line:** **Agile** delivers in small, frequent increments with continuous feedback. **Scrum** organises that into fixed-length **sprints** with defined roles and ceremonies; **Kanban** manages a **continuous flow** of work with visual boards and **work-in-progress limits**. Data teams often use Scrum for projects and Kanban for operational/support work.

    ## Agile principles that matter for data teams
    - Deliver value early (a first useful table/dashboard in weeks, not a big-bang platform in a year).
    - Collaborate with business stakeholders continuously.
    - Welcome changing requirements, but manage them (backlog, priorities).
    - Working software (and data) as the measure of progress.
    - Reflect and improve regularly.

    ## Scrum
    | Element | What |
    |---|---|
    | **Product owner** | Owns the backlog and priorities; represents business value |
    | **Scrum master** | Facilitates, removes blockers, protects the process |
    | **Developers** | Cross-functional team doing the work |
    | **Sprint** | Fixed 1-4 week iteration with a goal |
    | **Product backlog** | Ordered list of work (user stories, tasks, bugs) |
    | **Sprint planning** | Choose and plan the sprint's work |
    | **Daily stand-up** | 15 minutes: progress, plan, blockers |
    | **Sprint review** | Demo working increment to stakeholders |
    | **Retrospective** | How to improve the way the team works |
    | **Definition of done** | Shared checklist (for data: tested, documented, catalogued, monitored, deployed) |
    | **Estimation** | Story points, velocity |

    ## Kanban
    - Visual board: «Backlog → Ready → In progress → Review → Done».
    - **WIP limits** per column to prevent overload and expose bottlenecks.
    - Pull work when capacity frees up; no fixed sprints.
    - Metrics: **lead time** (request → done), **cycle time** (start → done), **throughput**, cumulative flow diagrams.
    - Fits support, incident and request-driven work (data requests, pipeline fixes).

    ## User stories for data work
    "As a **warranty manager**, I want **claims approval rate by dealer and month refreshed daily by 07:00**, so that **I can follow up with low-approval dealers**." + acceptance criteria (definitions, grain, freshness, access, reconciliation with the CRM).

    ## Edge cases and what goes wrong
    - Sprints full of unplanned support work: use a Kanban lane or capacity reservation.
    - Vague stories ("build data model") with no acceptance criteria.
    - Data work that cannot be demoed: demo the table, the checks, the dashboard, the lineage.
    - Agile as an excuse for no documentation or design.

    ## How interviewers test this
    - "Scrum vs Kanban, and when would you use each?"
    - "What is your definition of done for a data pipeline story?"
    - "Tell me about working in sprints." Use your real experience: ceremonies, how you handled changing requirements.
  `, {
    check: [
      match('Match the Scrum element.', [['Product owner', 'Prioritises the backlog for business value'], ['Retrospective', 'Improves how the team works'], ['Sprint review', 'Demonstrates the working increment to stakeholders'], ['Daily stand-up', 'Short sync on progress and blockers']], 'Roles and ceremonies.'),
      mcq('Which practice is central to Kanban?', ['Fixed-length sprints', 'Work-in-progress limits on a visual flow board', 'Story points', 'Annual planning'], 1, 'WIP limits expose bottlenecks and improve flow.'),
      multi('What belongs in a definition of done for a data pipeline story?', ['Tests (unit and data) pass', 'Documented and registered in the catalog', 'Monitoring and alerts in place', 'Merged to a personal branch only'], [0, 1, 2], 'Done means production-ready, not just coded.'),
    ],
    interview: [
      talk('How do you handle requirements that keep changing during a sprint?', `
        - Clarify the underlying goal; often the change refines a vague original requirement.
        - Protect the sprint: if the change is large, add it to the backlog for the product owner to prioritise next sprint; small clarifications are absorbed.
        - Write acceptance criteria down (definitions, grain, filters, freshness) and confirm them with the stakeholder.
        - Deliver a small working version early (a prototype table or dashboard) so feedback comes sooner.
        - Version changes to definitions so existing consumers are not broken.
        - Example from your experience with dashboards where users refined KPIs after seeing data.`, 'hr'),
    ],
  }),

  // ================================================================== DevOps and CI/CD
  devops: T(`
    > **In one line:** **DevOps** joins development and operations so software is built, tested, released and run **quickly and safely** through automation and shared ownership. **CI** (continuous integration) automatically builds and tests every change; **CD** (continuous delivery/deployment) automatically promotes tested changes through environments. **DataOps** applies the same ideas to data pipelines and data quality.

    ## A CI/CD pipeline for data engineering
    «««flow
    Developer branch -> Pull request (code review) -> CI: lint, unit tests, data tests on sample data, build artefacts, validate DAGs/bundles -> Merge to main -> CD: deploy to dev/test -> integration tests on realistic data -> approval -> deploy to prod -> smoke checks and monitoring
    »»»

    ## What CI checks for data projects
    - Code style and static analysis (ruff/flake8, sqlfluff).
    - **Unit tests** of transformation functions (pytest) with small fixtures (duplicates, NULLs, late records).
    - **dbt build** or Spark jobs on a small sample/test schema; data tests.
    - **Schema/contract compatibility** checks.
    - **DAG integrity:** Airflow DAGs import without errors, no cycles.
    - Validate **infrastructure as code** (terraform plan) and job definitions (Databricks Asset Bundles validate).
    - Security scans (secrets in code, dependency vulnerabilities).
    - **Slim CI:** only build/test changed models and their dependents.

    ## What CD does
    - Deploys code, jobs, workflows and infrastructure to each environment from the same artefact, with environment-specific configuration (not code edits).
    - Runs migrations/backfills when needed, with approvals for production.
    - Supports **rollback** (redeploy previous version; table time travel/restore for data).
    - Uses **blue-green / write-audit-publish** patterns for data so consumers switch only after validation.

    ## Tooling
    GitHub Actions, Azure DevOps Pipelines, GitLab CI, Jenkins; Terraform/Bicep for infrastructure; Databricks Asset Bundles / dbt Cloud jobs / Airflow deployments; container registries; secrets from Key Vault.

    ## Environments
    | Environment | Data | Purpose |
    |---|---|---|
    | Dev | Small, synthetic or masked samples | Build and experiment |
    | Test/QA/UAT | Realistic, masked production-like data | Integration, performance, user acceptance |
    | Prod | Real data | Business use; changes only through CD |
    Production data should not flow to lower environments unmasked.

    ## DevOps practices beyond CI/CD
    Infrastructure as code, monitoring and alerting, on-call and incident management, blameless post-mortems, small frequent changes, trunk-based development or short-lived branches, feature flags, measuring **DORA metrics** (deployment frequency, lead time for changes, change failure rate, time to restore).

    ## How interviewers test this
    - "What would your CI/CD pipeline for a data project do?"
    - "How do you test data pipelines in CI without production data?"
    - "How do you deploy a distributed data system automatically?" (The posting's wording.) IaC + CI/CD + environment promotion + automated tests + monitoring.
  `, {
    check: [
      multi('Which belong in CI for a data project?', ['Unit tests of transformation functions', 'dbt/Spark runs with data tests on a small sample', 'Airflow DAG import checks', 'Manually editing production tables'], [0, 1, 2], 'Production changes only through CD.'),
      mcq('How should dev, test and prod deployments differ?', ['Different code edited per environment', 'Same code/artefact, different configuration per environment', 'Prod gets untested code', 'They should not differ in data'], 1, 'Promote the same tested artefact.'),
      match('Match the DORA metric.', [['Deployment frequency', 'How often changes reach production'], ['Lead time for changes', 'Commit to production time'], ['Change failure rate', 'Share of deployments causing incidents'], ['Time to restore', 'How fast service recovers after failure']], 'Delivery performance measures.'),
    ],
  }),

  // ================================================================== Version control
  git: T(`
    > **In one line:** **version control** (Git) records every change to code and configuration, who made it and why, lets people work in parallel on **branches**, review changes through **pull requests**, and roll back. For data teams, **everything** (pipelines, SQL, DAGs, infrastructure, docs) belongs in Git.

    ## Core Git concepts
    | Concept | Meaning |
    |---|---|
    | Repository | Project history |
    | Commit | A snapshot with a message and author |
    | Branch | A parallel line of work |
    | Merge / rebase | Combine branches (merge keeps history; rebase rewrites onto a new base) |
    | Pull request (PR) | Proposal to merge, with review, CI checks and discussion |
    | Conflict | Same lines changed differently on two branches; resolved manually |
    | Tag / release | Named version for deployment |
    | .gitignore | Files never committed (secrets, data, build outputs) |

    ## Workflows
    - **Feature branching / GitHub flow:** short-lived branch per change → PR → review + CI → merge to main → deploy.
    - **Trunk-based development:** very short-lived branches, frequent merges to main, feature flags.
    - **Gitflow:** develop/release/hotfix branches; heavier, for scheduled releases.

    ## Good practices
    - Small, focused commits with clear messages ("Add SCD2 merge for dim_dealer").
    - Every change through a PR with review and passing CI.
    - **Never commit secrets** (keys, passwords, tokens) or data; use secret managers; scan for leaks; if leaked, rotate immediately (removing from history is not enough).
    - Protect main (required reviews and checks).
    - Notebooks in Git (Databricks Git folders/Repos), with outputs cleared.
    - Version configuration and infrastructure alongside code.

    ## Edge cases and what goes wrong
    - Large data files committed (repository bloat): use storage, not Git.
    - Long-lived branches with painful merges.
    - "Fix in prod directly" bypassing Git: next deployment overwrites it.
    - Force-pushing shared branches destroys others' work.

    ## How interviewers test this
    - "Explain your Git workflow."
    - "Merge vs rebase?"
    - "You accidentally committed a password. What do you do?" Rotate the secret immediately, remove it from the code and history, add scanning and use a secret manager.
  `, {
    check: [
      mcq('You accidentally pushed a storage account key to a shared repository. First action?', ['Delete the commit and move on', 'Rotate (invalidate) the key immediately, then remove it from the code/history and move it to a secret manager', 'Make the repo private', 'Nothing'], 1, 'Assume it is compromised the moment it was pushed.'),
      tf('Merging via pull requests with required reviews and passing CI is a standard way to protect the main branch.', true, 'Branch protection rules enforce it.'),
      mcq('What is the main difference between merge and rebase?', ['None', 'Merge combines histories with a merge commit; rebase replays your commits onto a new base, rewriting them for a linear history', 'Rebase deletes branches', 'Merge only works on main'], 1, 'Do not rebase shared branches others are using.'),
    ],
  }),

  // ================================================================== Testing
  testing: T(`
    > **In one line:** data pipelines need several kinds of tests: **unit tests** (one function/transformation with small inputs), **integration tests** (components together on realistic data), **regression tests** (outputs did not change unexpectedly after a change), **data tests** (the data itself meets rules), plus **performance** and **user acceptance** tests.

    ## The testing pyramid for data
    | Level | What | Example | Tools |
    |---|---|---|---|
    | **Unit** | Pure transformation logic with tiny hand-made inputs, including edge cases | «dedupe_latest()» keeps the newest row and handles ties and NULL keys | pytest, chispa (Spark), dbt unit tests |
    | **Data tests** | Rules on actual data each run | claim_id unique; dealer exists; amount ≥ 0; freshness | dbt tests, Great Expectations, Soda, DLT expectations |
    | **Integration** | Pipeline end to end on realistic (masked) data in a test environment | Bronze → silver → gold for a sample day; counts reconcile | CI/CD jobs, test workspaces |
    | **Regression** | Compare outputs before/after a change | Gold totals for last month identical except where intended | Table diffs (EXCEPT, data-diff), snapshot comparisons |
    | **Performance/load** | Runtime and cost at expected and peak volume | 10× data still finishes in SLA | Load tests (your Turbofan load test) |
    | **UAT / validation** | Users confirm it meets the need | Warranty team validates numbers against known cases | Sign-off |

    ## Writing good unit tests for transformations
    - Keep transformations as **pure functions** (input DataFrame → output DataFrame), separate from I/O, so they are testable.
    - Cover **edge cases**: empty input, duplicates, NULLs in keys and values, late/out-of-order records, timezone boundaries, schema variations, extreme values.
    - Make tests **fast** (small data, local Spark session) and **deterministic**.
    - Test **behaviour**, not implementation details.

    ## Regression testing for data
    After changing logic, compare the new output with the old for the same input:
    «««sql
    (SELECT * FROM gold_new EXCEPT SELECT * FROM gold_old)
    UNION ALL
    (SELECT * FROM gold_old EXCEPT SELECT * FROM gold_new)
    »»»
    Empty result = no unintended change. Investigate every difference.

    ## How interviewers test this
    - "How do you test a data pipeline?" The pyramid with examples.
    - "Unit vs integration vs regression testing?"
    - "What edge cases would you test for a deduplication function?"
  `, {
    check: [
      match('Match the test type to the example.', [['Unit test', 'dedupe_latest() on 5 hand-made rows with a tie'], ['Data test', 'claim_id is unique in today\'s load'], ['Integration test', 'Run bronze → gold for a sample day in the test environment'], ['Regression test', 'Diff last month\'s gold output before and after a code change']], 'Different levels catch different problems.'),
      mcq('Why separate transformations from reading/writing?', ['Style', 'Pure functions can be unit-tested quickly with small inputs, without real storage', 'It is faster in production', 'Spark requires it'], 1, 'Testability.'),
      tf('An empty result from (new EXCEPT old) UNION ALL (old EXCEPT new) means the two outputs are identical as sets.', true, 'A simple regression diff (watch for duplicates: EXCEPT removes them).'),
    ],
    hands: [
      sql({ q: '**Regression diff.** Pretend «orders_current» is the old output of a pipeline and the latest status per order from «raw_orders_feed» is the new output. Return rows that exist in **new but not old** with a column «side = \'new_only\'», unioned with rows in **old but not new** («side = \'old_only\'»), comparing «order_id, status, amount». Sort by «order_id», «side».', tables: ['raw_orders_feed', 'orders_current'], level: 3,
        solution: `WITH new AS (
  SELECT order_id, status, amount
  FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn FROM raw_orders_feed)
  WHERE rn = 1
), old AS (
  SELECT order_id, status, amount FROM orders_current
)
SELECT order_id, status, amount, 'new_only' AS side FROM (SELECT * FROM new EXCEPT SELECT * FROM old)
UNION ALL
SELECT order_id, status, amount, 'old_only' AS side FROM (SELECT * FROM old EXCEPT SELECT * FROM new)
ORDER BY order_id, side;`,
        hint: 'Build new (latest per order) and old as CTEs, then (new EXCEPT old) and (old EXCEPT new), each labelled, UNION ALL.' }),
    ],
  }),
};
