const { learn, mcq, tf, multi, match, order, viz, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('tools', 'Toolbox: how it is all set up and connected', 'absolute basics',
  'From zero: what computers, networks and APIs are, the terminal, setting up a project, Git, logins and connections, a tour of every UI you will use, and a clickable end-to-end platform map.',
  [
    lesson('t1', 'Computers, data and networks from zero', 15, [
      learn('The building blocks', `
        **Data sizes** (you will say these in every design interview):
        | Unit | Size | Feels like |
        |---|---|---|
        | 1 KB | 1,000 bytes | one claim record as JSON |
        | 1 MB | 1,000 KB | a photo, ~5,000 claim rows as CSV |
        | 1 GB | 1,000 MB | a few million rows |
        | 1 TB | 1,000 GB | billions of rows: needs distributed processing |
        | 1 PB | 1,000 TB | a large enterprise lake |

        **A computer has four resources:** CPU (does calculations, several **cores** working in parallel), RAM (fast, temporary working memory), disk/SSD (slow, permanent storage) and network (talks to other machines). Big data problems are about one of these running out: data too big for RAM, work too slow for one CPU, files too slow to move over the network.

        **Files vs tables vs databases:** a *file* is bytes on disk (CSV, Parquet). A *table* is rows and columns with a schema. A *database* is software that stores tables and answers queries (Postgres, Salesforce's database, Snowflake).

        **Client and server:** your laptop (client) sends a request to a server program listening on a **host** (address) and **port** (door number). Postgres listens on 5432, HTTPS on 443, Kafka on 9092.

        **API:** a defined way for programs to talk. A REST API is "send an HTTPS request to a URL, get JSON back". Salesforce's REST API is how a pipeline extracts records without a human clicking anything.
      `),
      match('Match each term to what it is.', [
        ['Host + port', 'Where a server program is listening (e.g. db.internal:5432)'],
        ['API', 'A defined interface programs use to talk to each other'],
        ['RAM', 'Fast temporary working memory'],
        ['Disk / object storage', 'Slow but permanent, cheap storage'],
      ]),
      mcq('A CSV of 400 million rows is ~80 GB. Your laptop has 16 GB of RAM. What happens if you load it all with pandas?', ['It loads fine', 'It runs out of memory: process it in chunks or use a distributed engine like Spark', 'It loads but only the first 16 GB', 'pandas compresses it automatically'], 1),
      order('Order from smallest to largest.', ['1 KB', '1 MB', '1 GB', '1 TB', '1 PB']),
      tf('An API call from a pipeline usually needs some form of authentication, like a token.', true, 'Pipelines identify themselves with tokens, OAuth client credentials or certificates, never with a person\'s password.'),
    ]),
    lesson('t2', 'Terminal survival kit', 15, [
      learn('The terminal is just typing commands', `
        The **terminal** (command line, shell) is a text way to tell the computer what to do. On Mac/Linux it is "Terminal" (bash/zsh); on Windows use **PowerShell** or **WSL** (Linux inside Windows, recommended for data work).

        | Command | Does |
        |---|---|
        | «pwd» | print the folder you are in |
        | «ls» (Windows: «dir») | list files |
        | «cd folder», «cd ..» | move into / out of a folder |
        | «mkdir name» | make a folder |
        | «cat file», «head -n 5 file» | print a file / its first lines |
        | «grep "Approved" claims.csv» | find lines containing text |
        | «wc -l file» | count lines |
        | «cmd1 | cmd2» | pipe: output of one into the next |
        | «python script.py» | run a Python file |
        | «export NAME=value» | set an environment variable |

        You don't need to master the shell. Around 15 commands cover 90% of daily data engineering use.
      `),
      viz('terminal', 'Practise in a safe terminal', 'Nothing here touches a real machine. Type each command and press Enter.', {
        missions: [
          { task: 'Show which folder you are in.', accept: '^pwd$', out: '/home/you', hint: 'pwd' },
          { task: 'Create a folder called «warranty-pipeline».', accept: '^mkdir\\s+warranty-pipeline$', out: '', hint: 'mkdir warranty-pipeline' },
          { task: 'Move into it.', accept: '^cd\\s+warranty-pipeline/?$', out: '', hint: 'cd warranty-pipeline' },
          { task: 'List the files (there is a «claims.csv» already).', accept: '^(ls|ls -l|ls -la|dir)$', out: 'claims.csv  README.md', hint: 'ls' },
          { task: 'Print the first 3 lines of «claims.csv».', accept: '^head\\s+(-n\\s*)?-?3\\s+claims\\.csv$', out: 'claim_id,dealer_id,claim_amount,status\n1,4,124500.00,Approved\n2,7,88000.50,Rejected', hint: 'head -n 3 claims.csv' },
          { task: 'Count how many lines it has.', accept: '^wc\\s+-l\\s+claims\\.csv$', out: '98 claims.csv', hint: 'wc -l claims.csv' },
          { task: 'Find the lines containing «Approved» and count them using a pipe.', accept: '^grep\\s+["\']?Approved["\']?\\s+claims\\.csv\\s*\\|\\s*wc\\s+-l$', out: '41', why: 'The pipe | feeds grep\'s output into wc. Small tools combined.', hint: 'grep "Approved" claims.csv | wc -l' },
        ],
      }, 'You just used the shell the way data engineers do: navigate, inspect a file, filter and count.'),
      mcq('You want to peek at the header of a 30 GB CSV without opening it in Excel. Command?', ['cat bigfile.csv', 'head -n 5 bigfile.csv', 'rm bigfile.csv', 'open bigfile.csv'], 1, '«cat» would print all 30 GB. «head» reads only the start.'),
      tf('Data engineering work is done only in the terminal.', false, 'The terminal is for setup, git, running tests and deploying. Most of the day is spent in an IDE/notebook, SQL editors and web UIs.'),
    ]),
    lesson('t3', 'Set up a data engineering project from zero', 18, [
      learn('What "setting up" actually means', `
        A project is a **folder of code in Git** plus an **environment** with the right tools installed. Typical local setup (one-time, ~30 minutes):

        1. Install **Python** (3.11+), **Git**, **VS Code**, and for Spark a **Java** runtime (JDK 17). Docker Desktop if you want Kafka/Postgres locally.
        2. «git clone» the repo (or «git init» a new one).
        3. Create a **virtual environment**, an isolated set of Python packages for this project: «python -m venv .venv», then activate it.
        4. «pip install -r requirements.txt» installs the libraries (pyspark, pandas, pytest, requests…).
        5. Put secrets in a «.env» file (never committed) or use your company's vault.
        6. Run tests («pytest») and the pipeline locally on sample data.

        «««flow
        Install tools -> Clone repo -> Create venv -> pip install -> Configure .env -> Run tests -> Run pipeline
        »»»

        A typical repo layout:
        «««text
        warranty-pipeline/
          README.md              <- what it is, how to run it
          requirements.txt       <- python packages
          src/ingest.py          <- extract from API -> bronze
          src/transform.py       <- PySpark bronze -> silver -> gold
          dags/claims_daily.py   <- Airflow DAG
          tests/test_transform.py
          .github/workflows/ci.yml
          .env.example           <- names of settings, no real secrets
        »»»
        **At work** the heavy parts (clusters, storage, Kafka, permissions) already exist. You clone the team repo, set up a venv, and log into Databricks/Azure with SSO.
      `),
      viz('terminal', 'Set up a PySpark project', 'Real commands, simulated output.', {
        missions: [
          { task: 'Clone the team repo «git@github.com:acme/warranty-pipeline.git».', accept: '^git\\s+clone\\s+\\S+warranty-pipeline(\\.git)?$', out: "Cloning into 'warranty-pipeline'...\nReceiving objects: 100% (214/214), done.", hint: 'git clone git@github.com:acme/warranty-pipeline.git' },
          { task: 'Go into the project folder.', accept: '^cd\\s+warranty-pipeline/?$', out: '', hint: 'cd warranty-pipeline' },
          { task: 'Create a virtual environment called «.venv».', accept: '^python3?\\s+-m\\s+venv\\s+\\.venv$', out: '', why: 'An isolated Python just for this project.', hint: 'python -m venv .venv' },
          { task: 'Activate it (Mac/Linux).', accept: '^(source|\\.)\\s+\\.venv/bin/activate$', out: '(.venv) $', hint: 'source .venv/bin/activate' },
          { task: 'Install the dependencies listed in «requirements.txt».', accept: '^pip3?\\s+install\\s+-r\\s+requirements\\.txt$', out: 'Successfully installed pyspark-3.5.1 pytest-8.2.0 requests-2.32.3 delta-spark-3.2.0', hint: 'pip install -r requirements.txt' },
          { task: 'Run the unit tests.', accept: '^(python\\s+-m\\s+)?pytest(\\s+-q)?$', out: '......                                   [100%]\n6 passed in 14.2s', hint: 'pytest' },
          { task: 'Run the transform job locally with spark-submit: «src/transform.py».', accept: '^spark-submit\\s+(--master\\s+local\\[\\*\\]\\s+)?src/transform\\.py', out: 'INFO SparkContext: Running Spark version 3.5.1\nINFO DAGScheduler: Job 0 finished: 3 stages\nWrote 97 rows to data/gold/fct_claims', why: 'local[*] = Spark on your laptop using all cores. Same code later runs on a cluster.', hint: 'spark-submit --master local[*] src/transform.py' },
        ],
      }, 'That is genuinely the whole local setup. On a team, the README lists these exact steps.'),
      order('Order the setup steps for a new project.', ['Install Python, Git, Java and VS Code', 'Clone the repository', 'Create and activate a virtual environment', 'pip install -r requirements.txt', 'Add settings to a local .env (not committed)', 'Run the tests', 'Run the pipeline on sample data']),
      mcq('Why use a virtual environment per project?', ['It makes Python faster', 'Each project gets its own package versions, so projects don\'t break each other', 'It is required by GitHub', 'It encrypts code'], 1),
      tf('«pip install pyspark» is enough to run real Spark locally, as long as Java is installed.', true, 'PySpark ships Spark itself. local[*] mode runs driver and executors inside one machine. Perfect for learning and tests.'),
    ]),
    lesson('t4', 'Git and GitHub hands-on', 15, [
      learn('Git in one picture', `
        **Git** tracks versions of your code on your machine. **GitHub** hosts repositories online with a web UI for browsing code, **pull requests** (proposed changes + review), issues and **Actions** (automated CI/CD). Companies use GitHub Enterprise / Azure DevOps / GitLab with SSO.

        «««flow
        Edit files -> git add (stage) -> git commit (save a version locally) -> git push (upload branch) -> Pull Request in the UI -> Review + CI checks -> Merge to main -> Deploy
        »»»
        | Command | Meaning |
        |---|---|
        | «git status» | what changed |
        | «git checkout -b feat/x» | create and switch to a branch |
        | «git add file» | stage a change |
        | «git commit -m "msg"» | save a snapshot |
        | «git pull» | get others' changes |
        | «git push -u origin feat/x» | upload your branch |
        | «git log --oneline» | history |

        Branch rule: never work directly on «main». One branch per change, merged via PR.
      `),
      viz('terminal', 'Ship a change the team way', '', {
        missions: [
          { task: 'Check what changed.', accept: '^git\\s+status$', out: 'On branch main\nmodified:   src/transform.py', hint: 'git status' },
          { task: 'Create a branch «feat/scd2-customer».', accept: '^git\\s+(checkout\\s+-b|switch\\s+-c)\\s+feat/scd2-customer$', out: "Switched to a new branch 'feat/scd2-customer'", hint: 'git checkout -b feat/scd2-customer' },
          { task: 'Stage «src/transform.py».', accept: '^git\\s+add\\s+(src/transform\\.py|\\.|-A)$', out: '', hint: 'git add src/transform.py' },
          { task: 'Commit with a message.', accept: '^git\\s+commit\\s+-m\\s+["\'].+["\']$', out: '[feat/scd2-customer 3f2a91c] Track customer region with SCD2\n 1 file changed, 24 insertions(+), 3 deletions(-)', hint: 'git commit -m "Track customer region with SCD2"' },
          { task: 'Push the branch to GitHub.', accept: '^git\\s+push\\s+(-u\\s+)?origin\\s+feat/scd2-customer$', out: 'remote: Create a pull request for \'feat/scd2-customer\' on GitHub by visiting:\nremote:   https://github.com/acme/warranty-pipeline/pull/new/feat/scd2-customer', why: 'Now you open the Pull Request in the GitHub web UI, reviewers comment, CI runs, then it is merged.', hint: 'git push -u origin feat/scd2-customer' },
        ],
      }),
      mcq('Where do code reviews happen?', ['In the terminal', 'In the pull request page of the GitHub (or Azure DevOps) web UI', 'Over email', 'In Spark UI'], 1),
      match('Match the git action.', [['commit', 'Save a snapshot locally'], ['push', 'Upload your branch to the remote'], ['pull request', 'Ask to merge your branch, with review'], ['merge', 'Bring approved changes into main']]),
    ]),
    lesson('t5', 'Logins, connections and secrets', 18, [
      learn('Who logs in where, and how systems connect', `
        | Tool | Install? | Web UI? | How you log in | How code/pipelines access it |
        |---|---|---|---|---|
        | Python, PySpark, dbt, Airflow (local) | yes, pip | Airflow has one | none locally | — |
        | GitHub (Enterprise) | git client | yes | company SSO | SSH key or token from your machine; CI uses a service principal |
        | Azure/AWS portal | no | yes | company SSO + MFA | service principal / managed identity |
        | Databricks / Synapse | no (browser) | yes | SSO | personal token for CLI; service principal for jobs |
        | Snowflake / SQL warehouse | no | yes (worksheets) | SSO | JDBC/ODBC with OAuth or key pair |
        | Kafka / Event Hubs | CLI optional | yes (management UI) | SSO | SASL/TLS credentials per app |
        | Airflow / Data Factory | no (managed) | yes | SSO | its own service identity |
        | Power BI | Desktop app optional | yes | SSO | service principal for refresh |
        | Salesforce (as a source) | no | yes | SSO | connected app (OAuth) for pipelines |

        **Key ideas**
        - **SSO (single sign-on)**: one company identity (Microsoft Entra ID / Okta) opens every tool. No separate passwords.
        - **Service principal / service account**: a non-human identity for pipelines, with only the permissions it needs.
        - **Secrets** (passwords, API keys, client secrets) live in **Key Vault / Secrets Manager / Databricks secret scopes**. Code fetches them at runtime. Never in Git.
        - **Connection** = where (host/URL, port), how (protocol, e.g. JDBC/HTTPS/Kafka), who (credentials), plus **network access** (VPN, private endpoint, firewall rule) and **permission** (a GRANT or RBAC role).

        A JDBC connection string decoded:
        «««text
        jdbc:postgresql://claims-db.internal.acme.com:5432/warranty?sslmode=require
        └ driver ──┘ └──────── host ────────────┘ └port┘ └─ db ─┘ └─ options ─┘
        user/password -> fetched from Key Vault, passed separately
        »»»
      `),
      match('Match the error to its most likely cause.', [
        ['Connection timed out', 'Network: firewall, VPN or private endpoint missing'],
        ['Unknown host / DNS failure', 'Wrong hostname or private DNS not resolvable'],
        ['401 Unauthorized / login failed', 'Wrong or expired credentials'],
        ['403 Forbidden / permission denied', 'Authenticated, but missing a role or GRANT'],
      ], 'Reading these four correctly saves hours. Each points to a different team: network, DNS, identity or data owner.'),
      scenario('Your new job can\'t read the source database', `You deploy a Databricks job that reads «claims» from a Postgres database. It works from your laptop, but the scheduled job fails.`, [
        ['The error is «Connection timed out after 30000 ms». Most likely?', [
          ['The job\'s cluster can\'t reach the database over the network (firewall / private endpoint / VNet peering)', true, 'Timeouts mean packets never got an answer, which is a network path issue. Your laptop is on VPN; the cluster is in a different network.'],
          ['The password is wrong', false, 'That would be an authentication error, returned quickly.'],
          ['The table is empty', false, 'An empty table isn\'t an error.'],
        ]],
        ['Network fixed. Now: «password authentication failed for user svc_claims». Fix?', [
          ['Check the secret in Key Vault/secret scope for svc_claims is current and the job reads the right secret name', true, 'Credentials come from the vault at runtime, and a rotated password or wrong scope is typical.'],
          ['Hard-code your own password in the notebook', false, 'Never. And jobs shouldn\'t run as you.'],
        ]],
        ['Now: «permission denied for table claims». Fix?', [
          ['Ask the data owner to GRANT SELECT on claims to the service principal\'s role', true, 'It authenticated fine; it lacks authorization. Least privilege: SELECT on what it needs.'],
          ['Give the service principal admin', false, 'Violates least privilege.'],
        ]],
      ]),
      mcq('Where should a pipeline\'s Salesforce client secret live?', ['In the Python file', 'In a key vault / secret scope, read at runtime by the job\'s identity', 'In a shared Excel file', 'In the README'], 1),
      tf('With SSO, you use the same company login for Databricks, Azure portal and GitHub Enterprise.', true),
    ]),
    lesson('t6', 'A tour of the UIs you will use', 15, [
      viz('uitour', 'Click through each tool\'s screen', 'Simplified mock-ups of the real interfaces, so you know what each one looks like and what you do there.'),
      match('Where would you go to…', [
        ['See which task of last night\'s pipeline failed and read its logs', 'Orchestrator UI (Airflow / Data Factory / Workflows)'],
        ['Find why one Spark stage took 40 minutes', 'Spark UI'],
        ['Check who owns a table and what feeds it', 'Catalog lineage page'],
        ['Review a teammate\'s code change', 'GitHub pull request'],
      ]),
      mcq('Where do you write and test a new PySpark transformation interactively before putting it in the repo?', ['Spark UI', 'A notebook (Databricks/Jupyter) or VS Code connected to a cluster', 'The cloud portal', 'Power BI'], 1),
      mcq('Consumer lag on a topic is growing. Which screen shows it?', ['Kafka / Event Hubs management UI (or monitoring dashboards)', 'GitHub', 'SQL worksheet', 'Notebook'], 0),
    ]),
    lesson('t7', 'The whole platform, end to end', 20, [
      viz('platform', 'Clickable platform map', 'A realistic enterprise data platform like the ones large manufacturers run. Click each box. Run the flows.'),
      learn('A day in the life of a DE1', `
        - **09:00** Check the orchestrator UI: did last night's runs succeed? Any data quality alerts in Teams?
        - **09:30** Stand-up (Scrum): yesterday, today, blockers.
        - **10:00** Pick a story: *"Add supplier lead time to the supply chain data product."* Explore source data in a **notebook** (SQL/PySpark).
        - **12:00** Move the logic into the **repo** in VS Code, write a unit test, run it locally.
        - **14:00** Push a branch, open a **pull request**, CI runs tests, teammate reviews.
        - **15:30** Merge, CD deploys the job to the test workspace, verify output tables in the **SQL editor**, check **lineage** in the catalog.
        - **16:30** Update the table description and data contract, demo to the product owner.
        - On rotation: investigate a failed run using the **Spark UI** and logs.

        Notice: mostly **UIs and code**, some terminal, many people.
      `),
      order('Order how a claim moves through the platform map.', ['Created in Salesforce', 'Extracted by the orchestrator\'s nightly run', 'Landed in the lake\'s bronze layer', 'Cleaned and modelled by Spark/dbt into silver and gold', 'Registered in the catalog with lineage', 'Queried by the SQL warehouse behind Power BI']),
      talk('Explain the platform map to an interviewer in 90 seconds, as if you had built it.', `
        - "Sources are operational systems: Salesforce for service and warranty, SAP for supply chain, engine telemetry and files."
        - "Batch sources are pulled by an orchestrator (Data Factory or Airflow) on a schedule. Telemetry flows continuously through Kafka/Event Hubs."
        - "Everything lands in a lake in layers: bronze raw, silver clean and conformed, gold data products, as Delta tables."
        - "Spark (Databricks) and dbt do the transformations; the catalog (Unity Catalog/Purview) holds schemas, owners, permissions and automatic lineage."
        - "Gold tables are served through a SQL warehouse to Power BI, and to ML/GenAI apps as feature tables and vector indexes."
        - "Around it: code in GitHub with CI/CD, secrets in Key Vault, monitoring and alerts on failures, freshness, quality and cost."
      `),
    ]),
    lesson('t8', 'Running real Spark, Kafka and Airflow yourself', 15, [
      learn('What this arcade simulates, and how to run the real thing', `
        **In this arcade**
        - SQL runs on **SQLite** compiled to WebAssembly, a real database engine inside your browser.
        - Python runs on **Pyodide**: real CPython in the browser.
        - PySpark runs on a **teaching implementation of the PySpark API** written in Python. Your code is identical to real PySpark; the engine underneath is single-machine. Real Spark needs a Java runtime and runs as many processes, which a browser can't host.

        **The real thing on your laptop (free):**
        | Tool | How |
        |---|---|
        | Spark | Install Java 17, «pip install pyspark», run «pyspark» or «spark-submit». Spark UI at «http://localhost:4040» while a job runs |
        | Delta Lake | «pip install delta-spark» |
        | Kafka | Docker Desktop + a «docker-compose.yml» with a Kafka image → «docker compose up -d»; CLI tools inside the container |
        | Airflow | «pip install apache-airflow» then «airflow standalone» → web UI at «http://localhost:8080» |
        | Postgres | Docker: «docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres» |
        | Cloud | **Databricks Free Edition** (browser, no install), Azure/AWS free tiers |

        Docker in one line: it runs prepackaged software (an **image**) as an isolated **container**, so "install Kafka" becomes one command instead of an afternoon.
      `),
      viz('terminal', 'Stand up Kafka and stream a message', '', {
        missions: [
          { task: 'Start the services defined in «docker-compose.yml» in the background.', accept: '^docker\\s+compose\\s+up\\s+-d$|^docker-compose\\s+up\\s+-d$', out: '[+] Running 2/2\n ✔ Container kafka   Started\n ✔ Container kafka-ui Started', hint: 'docker compose up -d' },
          { task: 'Create a topic «engine-telemetry» with 3 partitions (inside the container you can run «kafka-topics»).', accept: '^kafka-topics(\\.sh)?\\s+.*--create.*--topic\\s+engine-telemetry.*--partitions\\s+3|^kafka-topics(\\.sh)?\\s+.*--partitions\\s+3.*--topic\\s+engine-telemetry.*--create', out: 'Created topic engine-telemetry.', hint: 'kafka-topics --bootstrap-server localhost:9092 --create --topic engine-telemetry --partitions 3' },
          { task: 'Read the topic from the beginning with the console consumer.', accept: '^kafka-console-consumer(\\.sh)?\\s+.*--topic\\s+engine-telemetry.*--from-beginning|^kafka-console-consumer(\\.sh)?\\s+.*--from-beginning.*--topic\\s+engine-telemetry', out: '{"engine_id": 7, "temperature_c": 101.4}\n{"engine_id": 12, "temperature_c": 84.0}', hint: 'kafka-console-consumer --bootstrap-server localhost:9092 --topic engine-telemetry --from-beginning' },
          { task: 'Start Airflow locally with its web UI.', accept: '^airflow\\s+standalone$', out: 'standalone | Airflow is ready\nstandalone | Login with username: admin  password: ********\nWebserver at http://localhost:8080', why: 'Then open the browser: your DAGs appear as graphs you can trigger and watch.', hint: 'airflow standalone' },
        ],
      }),
      mcq('While a local Spark job runs, where is its Spark UI?', ['https://spark.apache.org', 'http://localhost:4040', 'In GitHub', 'There is none locally'], 1),
      tf('Code written against the PySpark DataFrame API in this arcade runs unchanged on Databricks.', true, 'Same API. Only the engine underneath differs (and «spark.table» names would point at real catalog tables).'),
    ]),
  ]);
