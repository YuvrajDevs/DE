const { learn, mcq, tf, multi, match, order, scenario, bug, viz, world, lesson } = require('./_h.cjs');

module.exports = world('cloud', 'Cloud, DevOps and Agile', 'named in posting',
  'Cloud data services across AWS, Azure and GCP, moving large files, security basics, Git, CI/CD, Docker, infrastructure as code, and how data teams work in Agile.',
  [
    lesson('c1', 'Cloud data services map', 18, [
      learn('Same ideas, three vendors', `
        Ask the team which cloud they use. Cummins runs a mix of Microsoft and other platforms, so knowing the **mapping** matters more than one vendor.

        | Capability | AWS | Azure | GCP |
        |---|---|---|---|
        | Object storage (lake) | S3 | ADLS Gen2 / Blob | Cloud Storage |
        | Managed Spark | EMR, Glue | Databricks, Synapse Spark, Fabric | Dataproc |
        | Warehouse | Redshift | Synapse SQL, Fabric Warehouse | BigQuery |
        | Serverless SQL on files | Athena | Synapse serverless | BigQuery external |
        | Orchestration / ETL | Glue workflows, MWAA (Airflow), Step Functions | Data Factory, Fabric pipelines | Cloud Composer, Dataflow |
        | Streaming | Kinesis, MSK | Event Hubs, Stream Analytics | Pub/Sub, Dataflow |
        | Catalog / governance | Glue Catalog, Lake Formation | Purview, Unity Catalog | Dataplex |
        | NoSQL | DynamoDB | Cosmos DB | Bigtable, Firestore |
        | Secrets | Secrets Manager | Key Vault | Secret Manager |
        | Identity | IAM roles | Entra ID, managed identities | IAM, service accounts |

        **Databricks** and **Snowflake** run on all three clouds and are common in enterprises.

        Core cloud ideas: separate **storage and compute** (scale each independently), pay-per-use (turn clusters off: auto-termination), managed services over self-hosted, regions and availability zones for resilience, IAM roles instead of keys.
      `),
      match('Match the AWS service to its Azure counterpart.', [['S3', 'ADLS Gen2'], ['Glue / EMR Spark', 'Databricks / Synapse Spark'], ['Redshift', 'Synapse SQL / Fabric Warehouse'], ['Kinesis / MSK', 'Event Hubs']]),
      mcq('Why does "separation of storage and compute" matter?', ['It makes data private', 'You can keep petabytes cheaply in object storage and spin compute up and down independently as needed', 'It removes the need for SQL', 'It is required by Kafka'], 1),
      mcq('A Spark cluster sits idle 20 hours a day at full price. First fix?', ['Bigger cluster', 'Auto-termination / job clusters that exist only during runs, plus autoscaling', 'Move to on-prem', 'Delete the data'], 1),
      tf('Long-lived access keys hard-coded in a notebook are an acceptable way to read from S3.', false, 'Use IAM roles / managed identities / instance profiles. Keys leak through Git, logs and screenshots.'),
    ]),
    lesson('c2', 'Moving large files', 15, [
      learn('Large file movement, the cloud way', `
        The posting asks for *"familiarity developing applications requiring large file movement for a cloud-based environment"*.

        - **Parallelise**: split into chunks and upload concurrently. **Multipart upload** (S3), block blobs (Azure), parallel composite uploads (GCS). Retry failed parts only.
        - **Compress and convert**: CSV → Parquet (often 5-10× smaller). Compress before the WAN transfer.
        - **Integrity**: checksums (MD5/CRC) per part and per file; compare counts after landing; write a «_SUCCESS» marker last.
        - **Atomic landing**: write to a temp/staging prefix, then rename/move once complete, so readers never see half files.
        - **Resumable and idempotent**: track what was transferred (manifest); re-runs skip completed files.
        - **Tools**: AzCopy, AWS CLI «s3 cp/sync» (multipart built-in), DataSync, Data Factory copy activity, «distcp» for HDFS → cloud, and physical transfer appliances (AWS Snowball, Azure Data Box) for hundreds of TB.
        - **Network**: private endpoints / VPC endpoints (traffic stays off the public internet), bandwidth throttling during business hours.
        - **Event-driven**: object-created events (S3 events, Event Grid) trigger the next pipeline step instead of polling.
      `),
      multi('Good practices for moving 2 TB of plant historian exports to the lake every night:', ['Parallel multipart uploads with per-part retries', 'Convert to compressed Parquet before or right after landing', 'Write directly to the final path so readers see data sooner', 'Checksums and row-count reconciliation', 'A manifest so reruns skip finished files'], [0, 1, 3, 4], 'Writing straight to the final path exposes partial files to readers. Land in staging, then move atomically.'),
      scenario('Nightly 800 GB transfer keeps failing at 90%', `A legacy job uploads one 800 GB CSV from a plant server to cloud storage with a single HTTP stream. It fails most nights around 90% because of a VPN reset, then restarts from zero.`, [
        ['Best first improvement?', [
          ['Switch to a multipart/chunked parallel upload (e.g. AzCopy or aws s3 cp) that retries only failed parts', true, 'Resumable, parallel transfers turn one fragile stream into many small retryable pieces.'],
          ['Increase the VPN timeout', false, 'Treats a symptom. Any blip still restarts 800 GB.'],
          ['Email the file', false, 'No.'],
        ]],
        ['What else cuts the transfer size?', [
          ['Export as compressed, splittable files (Parquet/ZSTD, or several gzipped CSV parts)', true, 'Smaller and parallel-friendly. One giant gzip would not be splittable downstream.'],
          ['Convert to JSON', false, 'JSON is larger than CSV.'],
        ]],
        ['How do downstream jobs know the data is complete?', [
          ['Upload to a staging prefix, verify checksums/counts, then move to the final path and write a _SUCCESS marker (or emit an event)', true, 'Atomic publish plus an explicit completion signal.'],
          ['Wait a fixed 2 hours and hope', false, 'Time-based guesses break the night it runs slow.'],
        ]],
      ]),
    ]),
    lesson('c3', 'Git, CI/CD, Docker, IaC', 18, [
      learn('Engineering hygiene for data', `
        **Git workflow**: «main» is always deployable. Work on a feature branch → commit small logical changes → push → **pull request** with review → CI runs tests → merge → CD deploys to test, then prod.
        «««bash
        git checkout -b feat/claims-scd2
        git add models/dim_customer.sql tests/test_scd2.py
        git commit -m "Track customer region with SCD2"
        git push -u origin feat/claims-scd2
        »»»
        **CI for data**: lint SQL/Python, unit tests, dbt build + tests on a sample/dev environment, check data diffs (row counts, schema) before merge.

        **CD**: promote the same artifact (wheel, dbt project, Databricks asset bundle) through dev → test → prod with environment-specific config. Never edit prod notebooks by hand.

        **Docker**: package code with its exact dependencies into an image, so it runs the same on a laptop, in CI and on Kubernetes/Airflow workers. Image (template) vs container (running instance). Volumes for persistent data.

        **Infrastructure as Code (Terraform, Bicep, CloudFormation)**: storage accounts, clusters, permissions and Kafka topics declared in versioned files and reviewed like code. Reproducible environments, no click-ops drift.
      `),
      order('Order a safe change to a production pipeline.', ['Create a feature branch', 'Change code and add/adjust tests', 'Open a pull request for review', 'CI runs unit and data tests', 'Merge to main', 'CD deploys to test, then production', 'Monitor the first production runs']),
      mcq('What is the difference between a Docker image and a container?', ['None', 'An image is the packaged template; a container is a running instance of it', 'Containers are bigger', 'Images run, containers are stored'], 1),
      mcq('Why manage cloud resources with Terraform instead of the portal UI?', ['Prettier', 'Versioned, reviewable, reproducible infrastructure across environments, with no undocumented manual drift', 'It is required by Spark', 'It is cheaper per hour'], 1),
      bug('This CI step lets broken SQL reach production. Which line is the problem?', `steps:
  - run: pip install -r requirements.txt
  - run: sqlfluff lint models/ || true
  - run: dbt build --target ci
  - run: ./deploy.sh prod`, 3, '«|| true» swallows lint failures, so the step always passes. CI must fail loudly. Also deploy to prod only from main after tests pass.', 'bash'),
    ]),
    lesson('c4', 'Agile, SDLC, testing and documentation', 15, [
      learn('How data teams deliver', `
        **Scrum**: fixed sprints (often 2 weeks); ceremonies: planning, daily stand-up, review/demo, retrospective; roles: product owner (priorities), scrum master, team. Work lives in a **backlog** of user stories:
        > *As a warranty analyst, I want claims by dealer region refreshed by 06:00, so that I can review overnight approvals.*
        > **Acceptance criteria:** freshness by 06:00 IST on 95% of days; totals reconcile with Salesforce within 0.1%; documented in the catalog.

        **Kanban**: continuous flow, WIP limits, good for ops/support work.

        **SDLC for data products**: requirements → design (model, SLAs) → build → test (unit, data, UAT with business) → deploy → operate → improve. The posting's competencies map here: *System Requirements Engineering* (verifiable requirements, acceptance criteria, traceability), *Solution Validation Testing*, *Solution Documentation*, *Quality Assurance Metrics*.

        **Documentation that people use**: README per pipeline (purpose, inputs/outputs, schedule, owner, runbook for failures), model docs in the catalog, architecture diagram, decision records ("why we chose SCD2 here").

        You already do this: weekly progress updates, reviews and sign-offs with Cummins teams = stakeholder management and UAT.
      `),
      mcq('Which is a well-written acceptance criterion for a data story?', ['Make the dashboard better', 'Data must be correct', 'fct_claims loads by 06:00 IST on ≥95% of days and its totals match Salesforce within 0.1%', 'Use Spark'], 2, 'Verifiable and measurable: exactly what "System Requirements Engineering" in the posting means.'),
      match('Match the Scrum event to its purpose.', [['Sprint planning', 'Commit to the backlog items for the sprint'], ['Daily stand-up', 'Sync progress and blockers'], ['Sprint review', 'Demo the increment to stakeholders'], ['Retrospective', 'Improve how the team works']]),
      tf('Writing a runbook for what to do when a pipeline fails is part of solution documentation.', true),
    ]),
    lesson('c5', 'Automating deployment of distributed systems', 18, [
      learn('From code to running jobs, automatically', `
        The posting: *"Implements and **automates deployment** of our distributed system for ingesting and transforming data"* and *"uses DevOps … for data-driven applications."*

        **Environments:** dev (experiment), test/staging (integration, real-ish data), prod (only via pipeline). Same code, different config.

        **What gets deployed:** job definitions (schedules, clusters, parameters), code packages (Python wheels, notebooks), SQL/dbt models, infrastructure (storage, Kafka topics, permissions).

        **Tools**
        | Layer | Tooling |
        |---|---|
        | Infrastructure | Terraform / Bicep / CloudFormation |
        | Databricks jobs & code | **Databricks Asset Bundles** («databricks bundle deploy -t prod») |
        | Data Factory | ARM templates published from Git integration |
        | Airflow | DAG files synced from Git to the Airflow environment |
        | Containers | Docker images → registry → Kubernetes |
        | Pipeline | GitHub Actions / Azure DevOps Pipelines |

        «««yaml
        # .github/workflows/deploy.yml (simplified)
        on: { push: { branches: [main] } }
        jobs:
          deploy:
            steps:
              - uses: actions/checkout@v4
              - run: pip install -r requirements.txt && pytest -q
              - run: databricks bundle validate -t prod
              - run: databricks bundle deploy -t prod     # auth: service principal via OIDC secrets
        »»»
        **Safe releases:** deploy to test first, run data diffs, then prod; keep releases small; roll back by redeploying the previous version; for big table changes, write to a new table and swap.
      `),
      viz('terminal', 'Deploy a job bundle', '', {
        missions: [
          { task: 'Validate the bundle config for the «test» target.', accept: '^databricks\\s+bundle\\s+validate(\\s+-t\\s+test)?$', out: 'Name: warranty-pipeline\nTarget: test\nValidation OK!', hint: 'databricks bundle validate -t test' },
          { task: 'Deploy it to «test».', accept: '^databricks\\s+bundle\\s+deploy\\s+-t\\s+test$', out: 'Uploading bundle files...\nDeploying resources...\nDeployment complete!', hint: 'databricks bundle deploy -t test' },
          { task: 'Run the «claims_daily» job in test.', accept: '^databricks\\s+bundle\\s+run\\s+(-t\\s+test\\s+)?claims_daily', out: 'Run URL: https://adb-123.azuredatabricks.net/#job/88/run/9123\n2026-11-25 10:42:13 "claims_daily" TERMINATED SUCCESS', why: 'In real life, CI runs these commands after tests pass; you rarely deploy prod by hand.', hint: 'databricks bundle run -t test claims_daily' },
        ],
      }),
      mcq('Why deploy through CI/CD instead of editing jobs in the production UI?', ['It looks more professional', 'Every change is reviewed, tested, versioned and reproducible, and can be rolled back', 'The UI is read-only', 'It is faster to click'], 1),
      order('Order a release.', ['Merge the reviewed PR to main', 'CI runs tests and validation', 'Deploy to test and run the job', 'Compare test outputs with expectations (data diff)', 'Deploy to production', 'Monitor the first production runs']),
    ]),
  ]);
