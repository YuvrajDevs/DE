/* DE Arcade - simulations part 2: platform map, UI tour, terminal simulator, napkin-math estimator. */
(() => {
'use strict';
const V = window.DEVIZ;
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
const goal = (h, t) => h('div', { class: 'goal' }, h('span', { class: 'goal-k' }, 'GOAL'), h('span', null, t));
const mdi = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

// ------------------------------------------------------------------ PLATFORM MAP
const NODES = {
  sf: { x: 80, y: 70, col: 'Sources', name: 'Salesforce', sub: 'CRM: cases, claims', what: 'Operational system (OLTP) where service and warranty data is created. You already query it with SOQL.', access: 'Web UI (Lightning) for users · REST/Bulk API for pipelines · SOQL in Developer Console', login: 'Your SSO login for the UI. Pipelines use a **connected app** (OAuth client id + secret, or JWT certificate) stored in Key Vault.', connect: 'HTTPS REST/Bulk API 2.0, or Change Data Capture events. Watch API limits.', code: 'GET /services/data/v60.0/query?q=SELECT Id, Status FROM Case WHERE SystemModstamp > 2026-11-24T00:00:00Z' },
  sap: { x: 80, y: 170, col: 'Sources', name: 'SAP / ERP', sub: 'POs, inventory, finance', what: 'Enterprise resource planning: purchase orders, goods receipts, stock, finance postings.', access: 'SAP GUI / Fiori for business users. Data teams get extracts or CDC via connectors (SAP ODP, SLT) or a replicated database.', login: 'Corporate SSO for people. A technical user / service principal for integration.', connect: 'JDBC/ODBC to a replica, SAP connectors in Data Factory, or CDC into Kafka.', code: 'jdbc:sap://erp-replica.internal:30015/?databaseName=PRD' },
  iot: { x: 80, y: 270, col: 'Sources', name: 'Engine sensors', sub: 'telemetry every few sec', what: 'Engine control modules send readings through telematics gateways.', access: 'No UI for you. Devices publish messages; you see them in Kafka/Event Hubs and the lake.', login: 'Devices authenticate with certificates/SAS tokens managed by the IoT team.', connect: 'MQTT/HTTPS → IoT Hub → Kafka / Event Hubs topic (key = engine_id).', code: '{"engine_id": 7, "ts": "2026-11-25T08:50:00Z", "temperature_c": 101.4, "oil_kpa": 212}' },
  files: { x: 80, y: 370, col: 'Sources', name: 'Files / SharePoint', sub: 'CSV, Excel, PDFs', what: 'Spreadsheets from plants, supplier files, manuals and reports.', access: 'SharePoint/OneDrive UI; SFTP servers; email drops (avoid).', login: 'SSO for people. Graph API app registration for automated pulls.', connect: 'Microsoft Graph API, SFTP, or AzCopy into the landing zone.', code: 'azcopy copy "plant_exports/*.csv" "https://lake.dfs.core.windows.net/landing/plants/" --recursive' },
  orch: { x: 290, y: 120, col: 'Ingest & orchestrate', name: 'Orchestrator', sub: 'Airflow / ADF / Workflows', what: 'Schedules and runs pipeline steps in order, retries failures, shows run history. Think of it as the conductor.', access: '**Web UI** with a graph of each pipeline (green/red boxes), run logs, a backfill button. Pipelines are defined in **code** (Airflow Python DAGs) or a **drag-and-drop canvas** (Data Factory).', login: 'SSO into the UI. Its tasks run as a service principal.', connect: 'Calls APIs, triggers Databricks jobs, runs SQL; reads connection details from Key Vault.', code: 'extract >> load_bronze >> quality_checks >> build_silver >> build_gold >> refresh_bi' },
  kafka: { x: 290, y: 270, col: 'Ingest & orchestrate', name: 'Kafka / Event Hubs', sub: 'event streaming', what: 'A durable log of events. Producers write, consumer groups read at their own pace.', access: 'A **UI** for topics, partitions and consumer lag (Confluent Control Center, Kafka UI, Azure portal for Event Hubs) plus a **CLI** (kafka-topics, kafka-console-consumer).', login: 'SSO for the UI. Apps use SASL credentials / certificates.', connect: 'Kafka protocol on port 9092/9093 (TLS). Spark reads with format("kafka").', code: 'kafka-console-consumer --bootstrap-server broker:9093 --topic engine-telemetry --from-beginning' },
  lake: { x: 500, y: 200, col: 'Store', name: 'Data lake', sub: 'ADLS/S3 · bronze→gold', what: 'Cheap cloud storage holding files (Parquet/Delta) in folders by layer and partition.', access: 'Cloud portal file browser / Storage Explorer to browse folders. Normally you read it as **tables** from Spark/SQL.', login: 'SSO for browsing. Jobs use managed identities or service principals with RBAC on containers.', connect: 'abfss:// (Azure) or s3:// paths over HTTPS; permissions via IAM/RBAC and the catalog.', code: 'abfss://lake@cumminsdata.dfs.core.windows.net/silver/claims/claim_month=2026-11/' },
  spark: { x: 700, y: 120, col: 'Process', name: 'Spark platform', sub: 'Databricks / Synapse', what: 'Clusters that run your PySpark/SQL. Notebooks for development, Jobs for scheduled runs.', access: '**Web UI**: workspace, notebooks (cells of code + output), job runs, cluster config and the **Spark UI** per run. Also VS Code + CLI for code in Git.', login: 'SSO into the workspace. Jobs run as a service principal.', connect: 'Reads the lake through the catalog; JDBC to databases; Kafka connector for streams.', code: 'spark.table("silver.claims").groupBy("dealer_id").agg(F.sum("claim_amount"))' },
  dbt: { x: 700, y: 270, col: 'Process', name: 'SQL / dbt', sub: 'warehouse transformations', what: 'SQL models that build silver/gold tables inside the warehouse, with tests and docs.', access: 'Code in Git + terminal («dbt build»), or dbt Cloud web IDE. Results visible in the warehouse UI.', login: 'Warehouse credentials from a profile / service principal.', connect: 'Connects to the SQL warehouse (Databricks SQL, Snowflake, Synapse) over JDBC/ODBC.', code: 'dbt build --select fct_claims+ --target prod' },
  cat: { x: 700, y: 380, col: 'Govern', name: 'Catalog & lineage', sub: 'Unity Catalog / Purview', what: 'The registry of every table: schema, owner, description, tags, permissions, quality and **lineage graph**.', access: '**Web UI**: search a table, read docs, click Lineage to see upstream/downstream boxes. SQL GRANTs for permissions.', login: 'SSO. What you see depends on your permissions.', connect: 'Spark and SQL engines check permissions here on every query; lineage is captured automatically.', code: 'GRANT SELECT ON TABLE gold.fct_claims TO `warranty-analysts`;' },
  wh: { x: 900, y: 120, col: 'Serve', name: 'SQL warehouse', sub: 'gold tables for queries', what: 'Fast SQL endpoint over gold data products for BI, analysts and apps.', access: '**Web UI** SQL editor (worksheet) with results grid; JDBC/ODBC from tools.', login: 'SSO for people; tokens/service principals for tools.', connect: 'JDBC/ODBC on port 443 with OAuth.', code: 'SELECT region, SUM(approved_amount) FROM gold.fct_claims JOIN gold.dim_dealer USING (dealer_key) GROUP BY region;' },
  bi: { x: 900, y: 230, col: 'Serve', name: 'Power BI / dashboards', sub: 'what the business sees', what: 'Dashboards and semantic models on top of gold tables. The modern version of your CRM Analytics dashboards.', access: 'Web UI (Power BI service) and Power BI Desktop for building.', login: 'SSO. Row-level security decides which rows each user sees.', connect: 'Connects to the SQL warehouse (DirectQuery or import refresh).', code: 'Approval rate = DIVIDE([Approved claims], [All claims])' },
  ai: { x: 900, y: 340, col: 'Serve', name: 'GenAI / ML apps', sub: 'assistants, predictions', what: 'Apps that use AI-ready gold data, feature tables and vector indexes.', access: 'Notebooks / ML UI for data scientists; the assistant UI for users.', login: 'SSO; the app uses a service principal with read access.', connect: 'Reads feature tables / vector index; LLM API over HTTPS.', code: 'retriever.search("X15 fuel leak", filters={"engine_model": "X15"})' },
  git: { x: 500, y: 62, col: 'Ops', name: 'GitHub + CI/CD', sub: 'code, reviews, deploys', what: 'Where all pipeline code lives. Pull requests get reviewed and tested, then deployed automatically.', access: '**Web UI** for repos, PRs, reviews and Actions runs; **terminal** git for daily work; VS Code integration.', login: 'Company GitHub Enterprise SSO (like github.com, but the company\'s).', connect: 'CI deploys jobs to Databricks/ADF using a service principal.', code: 'git push origin feat/claims-scd2   # then open a Pull Request in the GitHub UI' },
  kv: { x: 500, y: 380, col: 'Ops', name: 'Key Vault', sub: 'secrets & keys', what: 'Safe storage for passwords, API keys and certificates. Code fetches them at runtime.', access: 'Portal UI for admins; code reads via SDK / secret scopes.', login: 'SSO + RBAC; jobs use managed identity.', connect: 'HTTPS; Databricks secret scopes link to it.', code: 'dbutils.secrets.get(scope="kv-data", key="salesforce-client-secret")' },
  mon: { x: 290, y: 400, col: 'Ops', name: 'Monitoring & alerts', sub: 'logs, metrics, on-call', what: 'Job failures, durations, data quality results, freshness and cost, with alerts to Teams/email/PagerDuty.', access: 'Dashboards (Azure Monitor, Datadog, Grafana), the orchestrator UI, alert channels.', login: 'SSO.', connect: 'Jobs emit logs/metrics; checks write results; alert rules fire on thresholds.', code: 'ALERT if fct_claims.max(loaded_at) < now() - 6h OR dq_failures > 0' },
};
const EDGES = [
  ['sf', 'orch', 'batch'], ['sap', 'orch', 'batch'], ['files', 'orch', 'batch'], ['iot', 'kafka', 'stream'],
  ['orch', 'lake', 'batch'], ['kafka', 'lake', 'stream'], ['lake', 'spark', 'both'], ['lake', 'dbt', 'batch'],
  ['spark', 'wh', 'both'], ['dbt', 'wh', 'batch'], ['wh', 'bi', 'both'], ['wh', 'ai', 'batch'], ['spark', 'ai', 'stream'],
  ['spark', 'cat', 'meta'], ['dbt', 'cat', 'meta'], ['git', 'orch', 'ops'], ['git', 'spark', 'ops'], ['kv', 'orch', 'ops'], ['kv', 'spark', 'ops'], ['orch', 'mon', 'ops'],
];
V.platform = function (root, p, { h, done }) {
  const W = 1000, H = 450;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pm-svg', role: 'img', 'aria-label': 'End-to-end data platform map' });
  const cols = [['Sources', 80], ['Ingest & orchestrate', 290], ['Store', 500], ['Process & govern', 700], ['Serve', 900]];
  cols.forEach(([t, x]) => { const tx = svgEl('text', { x, y: 14, 'text-anchor': 'middle', class: 'pm-col' }); tx.textContent = t.toUpperCase(); svg.append(tx); });
  const paths = {};
  EDGES.forEach(([a, b, kind]) => {
    const A = NODES[a], B = NODES[b];
    const mx = (A.x + B.x) / 2;
    const d = `M${A.x} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${B.x} ${B.y}`;
    const pth = svgEl('path', { d, class: 'pm-edge ' + kind });
    svg.append(pth); paths[a + '>' + b] = { el: pth, kind, a, b };
  });
  const dotLayer = svgEl('g'); svg.append(dotLayer);
  const seen = new Set();
  const panel = h('div', { class: 'pm-panel' }, h('div', { class: 'muted' }, 'Click any box to see what it is, how you access it, how you log in and how it connects.'));
  const nodeEls = {};
  Object.entries(NODES).forEach(([id, n]) => {
    const g = svgEl('g', { class: 'pm-node', tabindex: '0', role: 'button', 'aria-label': n.name });
    const w = 164, hgt = 46;
    g.append(svgEl('rect', { x: n.x - w / 2, y: n.y - hgt / 2, width: w, height: hgt, rx: 9 }));
    const t1 = svgEl('text', { x: n.x, y: n.y - 3, 'text-anchor': 'middle', class: 'pm-t' }); t1.textContent = n.name;
    const t2 = svgEl('text', { x: n.x, y: n.y + 13, 'text-anchor': 'middle', class: 'pm-s' }); t2.textContent = n.sub;
    g.append(t1, t2);
    const open = () => {
      seen.add(id);
      Object.values(nodeEls).forEach(e => e.classList.remove('on')); g.classList.add('on');
      panel.innerHTML = `<h3>${mdi(n.name)} <span class="tagline">${mdi(n.col)}</span></h3>
        <dl class="pm-dl"><dt>What it is</dt><dd>${mdi(n.what)}</dd><dt>How you use it</dt><dd>${mdi(n.access)}</dd>
        <dt>Login</dt><dd>${mdi(n.login)}</dd><dt>How it connects</dt><dd>${mdi(n.connect)}</dd><dt>What you'd actually type</dt><dd><pre class="viz-sql">${mdi(n.code)}</pre></dd></dl>
        <div class="muted small">${seen.size}/${Object.keys(NODES).length} components explored</div>`;
      check();
    };
    g.addEventListener('click', open); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    svg.append(g); nodeEls[id] = g;
  });
  const ran = new Set();
  const animate = (kinds, label) => {
    ran.add(label);
    dotLayer.replaceChildren();
    Object.values(paths).forEach(p2 => p2.el.classList.toggle('lit', kinds.includes(p2.kind)));
    const list = Object.values(paths).filter(p2 => kinds.includes(p2.kind));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.forEach((p2, i) => {
      const dot = svgEl('circle', { r: 5, class: 'pm-dot ' + p2.kind }); dotLayer.append(dot);
      const len = p2.el.getTotalLength(); const t0 = performance.now() + i * 90; const dur = 1400;
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - t0) / dur));
        const pt = p2.el.getPointAtLength((reduce ? 1 : t) * len); dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
        if (t < 1 && !reduce) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    check();
  };
  const traceLineage = () => {
    ran.add('lineage');
    dotLayer.replaceChildren();
    const up = new Set(['bi']); let changed = true;
    while (changed) { changed = false; EDGES.forEach(([a, b, k]) => { if (k !== 'ops' && k !== 'meta' && up.has(b) && !up.has(a)) { up.add(a); changed = true; } }); }
    Object.values(paths).forEach(p2 => p2.el.classList.toggle('lit', up.has(p2.a) && up.has(p2.b) && p2.kind !== 'ops' && p2.kind !== 'meta'));
    Object.entries(nodeEls).forEach(([id, e]) => e.classList.toggle('trace', up.has(id)));
    panel.innerHTML = `<h3>Lineage of the dashboard KPI</h3><p>Everything highlighted feeds the Power BI dashboard. If a number is wrong, these are your suspects, walking backwards: dashboard → warehouse → Spark/dbt → lake → ingestion → sources. The catalog draws this graph for you automatically.</p>`;
    check();
  };
  const check = () => { if (seen.size >= 8 && ran.size >= 3) done('You have traced batch, streaming and lineage paths across the platform.'); };
  root.append(goal(h, p.task || 'Run the nightly batch, the live stream and the lineage trace, and open at least 8 components.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => animate(['batch', 'both'], 'batch') }, '▶ Run nightly batch'),
      h('button', { class: 'btn small primary', onclick: () => animate(['stream', 'both'], 'stream') }, '▶ Stream live events'),
      h('button', { class: 'btn small', onclick: traceLineage }, '⟲ Trace KPI lineage'),
      h('button', { class: 'btn small ghost', onclick: () => animate(['ops', 'meta'], 'ops') }, 'Show ops & governance links')),
    h('div', { class: 'pm-wrap' }, svg),
    h('div', { class: 'legend' }, h('span', { class: 'lg batch' }, 'batch'), h('span', { class: 'lg stream' }, 'streaming'), h('span', { class: 'lg ops' }, 'code / secrets / monitoring'), h('span', { class: 'lg meta' }, 'metadata & lineage')),
    panel);
};

// ------------------------------------------------------------------ UI TOUR (illustrative mock screens)
V.uitour = function (root, p, { h, done }) {
  const screens = {
    orch: ['Orchestrator', 'Airflow / Data Factory / Databricks Workflows', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'claims_daily · Graph', h('span', { class: 'mk-pill ok' }, 'schedule 02:00')),
      h('div', { class: 'mk-dag' }, [['extract', 'ok'], ['load_bronze', 'ok'], ['quality_checks', 'ok'], ['build_silver', 'fail'], ['build_gold', 'wait'], ['refresh_bi', 'wait']].map(([t, s], i) => [i ? h('span', { class: 'mk-arrow' }, '→') : null, h('span', { class: 'mk-task ' + s }, t)])),
      h('div', { class: 'mk-grid' }, h('span', null, 'Last 7 runs'), ...Array.from({ length: 7 }, (_, i) => h('i', { class: i === 6 ? 'fail' : 'ok' })))),
      ['Every pipeline is a graph of tasks. Green = succeeded, red = failed, grey = waiting.', 'Click a red task → **Logs** shows the Python/Spark error.', 'Buttons: **Clear / Retry** a task, **Trigger** a run, **Backfill** a date range.', 'You log in with company SSO. The tasks themselves run as a service account.']],
    nb: ['Notebook', 'Databricks / Jupyter / Synapse', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'explore_claims.py · cluster: dev-small (running)'),
      h('pre', { class: 'mk-cell' }, 'claims = spark.table("silver.claims")\nclaims.groupBy("status").count().show()'),
      h('pre', { class: 'mk-out' }, '+------------------+-----+\n|            status|count|\n+------------------+-----+\n|          Approved|   41|\n|          Rejected|   22|\n+------------------+-----+'),
      h('pre', { class: 'mk-cell' }, '%sql\nSELECT dealer_id, SUM(claim_amount) FROM silver.claims GROUP BY 1')),
      ['A notebook = cells of code with output right below. This is where you explore and prototype.', 'You pick a **cluster** (compute) at the top; it starts in a few minutes and auto-stops when idle.', 'Production code moves from notebooks into **Git** and runs as scheduled **Jobs**.', 'Same PySpark you practise here, unchanged.']],
    sparkui: ['Spark UI', 'built into every Spark platform', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'Job 14 · Stages'),
      h('table', { class: 'vt' }, h('thead', null, h('tr', null, ['Stage', 'Tasks', 'Shuffle read', 'Max task', 'Median'].map(c => h('th', null, c)))),
        h('tbody', null, [['0 scan claims', '64', '-', '8 s', '6 s'], ['1 join dealers', '200', '41 GB', '38 min', '12 s'], ['2 aggregate', '200', '2 GB', '9 s', '7 s']].map(r => h('tr', { class: r[3] === '38 min' ? 'dup' : '' }, r.map(c => h('td', null, c))))))),
      ['Open it from a job run. It shows **stages, tasks, shuffle sizes and the SQL plan**.', 'Spot skew: max task 38 min vs median 12 s on the join stage.', 'Spot spills, huge shuffles and too many tiny tasks here.', 'No login of its own: it opens from the Spark platform you are already in.']],
    sql: ['SQL warehouse', 'Databricks SQL / Snowflake / Synapse', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'Worksheet · warehouse: analytics-xs'),
      h('pre', { class: 'mk-cell' }, 'SELECT d.region, COUNT(*) AS claims\nFROM gold.fct_claims f JOIN gold.dim_dealer d USING (dealer_key)\nGROUP BY d.region;'),
      h('table', { class: 'vt' }, h('thead', null, h('tr', null, h('th', null, 'region'), h('th', null, 'claims'))), h('tbody', null, [['West', 31], ['South', 27], ['North', 22], ['East', 17]].map(r => h('tr', null, r.map(c => h('td', null, c))))))),
      ['A browser SQL editor plus a results grid, like SOQL in the Developer Console but for the warehouse.', 'A schema browser on the left lists catalogs → schemas → tables.', 'Query history and profiles show what ran and how long it took.', 'BI tools connect to the same warehouse over JDBC/ODBC.']],
    cat: ['Catalog & lineage', 'Unity Catalog / Microsoft Purview', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'gold.fct_claims', h('span', { class: 'mk-pill ok' }, 'certified'), h('span', { class: 'mk-pill' }, 'owner: warranty-data')),
      h('div', { class: 'mk-dag' }, ['salesforce.claim', 'bronze.claims_raw', 'silver.claims', 'gold.fct_claims', 'Dealer payout dashboard'].map((t, i) => [i ? h('span', { class: 'mk-arrow' }, '→') : null, h('span', { class: 'mk-task ' + (i === 3 ? 'ok' : 'wait') }, t)])),
      h('div', { class: 'muted small' }, 'Columns · claim_key BIGINT · claim_amount DECIMAL(12,2) "Claimed amount in INR" · status STRING (tag: governed-values)')),
      ['Search for any dataset by name or meaning, then read its description, owner, tags and sample data.', '**Lineage tab** draws upstream and downstream boxes automatically from the SQL/Spark that ran.', 'Permissions (GRANTs), PII tags and certification live here.', 'This is the "metadata, lineage, discoverable" part of the job posting.']],
    kafka: ['Kafka UI', 'Confluent / Kafka UI / Event Hubs in the portal', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'Topic engine-telemetry · 6 partitions · RF 3 · retention 7d'),
      h('table', { class: 'vt' }, h('thead', null, h('tr', null, ['Consumer group', 'Members', 'Lag', 'State'].map(c => h('th', null, c)))),
        h('tbody', null, [['lake-loader', '6', '120', 'Stable'], ['overheat-alerts', '3', '0', 'Stable'], ['ml-features', '0', '1.2M', 'Empty']].map(r => h('tr', { class: r[3] === 'Empty' ? 'dup' : '' }, r.map(c => h('td', null, c))))))),
      ['Topics, partitions, message browser and **consumer lag** per group.', 'Here: ml-features has no running consumers and 1.2M messages of lag. Someone should look.', 'Admins create topics here or with the CLI / Terraform.', 'SSO for the UI; applications authenticate with their own credentials.']],
    portal: ['Cloud portal', 'Azure portal / AWS console', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'Resource group: rg-data-platform-prod'),
      h('table', { class: 'vt' }, h('thead', null, h('tr', null, ['Name', 'Type', 'Region'].map(c => h('th', null, c)))),
        h('tbody', null, [['cumminsdata', 'Storage account (ADLS Gen2)', 'Central India'], ['dbw-data-prod', 'Databricks workspace', 'Central India'], ['adf-ingest-prod', 'Data Factory', 'Central India'], ['kv-data-prod', 'Key Vault', 'Central India'], ['evh-telemetry', 'Event Hubs namespace', 'Central India']].map(r => h('tr', null, r.map(c => h('td', null, c))))))),
      ['Where cloud **resources** live: storage, workspaces, vaults, event hubs.', 'As a DE1 you mostly **browse** here (find a storage path, check access). The platform team creates resources, usually with Terraform.', 'Access control (IAM / RBAC) decides what you can see.', 'SSO login with your company account.']],
    gh: ['GitHub pull request', 'GitHub Enterprise', () => h('div', { class: 'mk' },
      h('div', { class: 'mk-bar' }, 'feat: track customer region with SCD2 #482', h('span', { class: 'mk-pill ok' }, 'checks passed')),
      h('pre', { class: 'mk-cell' }, '- SELECT customer_id, region FROM silver.customers\n+ SELECT customer_id, region, valid_from, valid_to, is_current\n+ FROM silver.customers_scd2'),
      h('div', { class: 'mk-dag' }, [['lint', 'ok'], ['unit tests', 'ok'], ['dbt build (ci)', 'ok'], ['deploy to test', 'ok']].map(([t, s], i) => [i ? h('span', { class: 'mk-arrow' }, '→') : null, h('span', { class: 'mk-task ' + s }, t)]))),
      ['Code changes are proposed as **pull requests**: a diff, reviewer comments, automated checks.', 'Merging to main triggers CI/CD, which deploys jobs to the test, then prod workspace.', 'Same idea as github.com, with your company login.', 'Day-to-day you use git in the terminal or VS Code; reviews happen in this UI.']],
    term: ['Terminal', 'your laptop or a cloud shell', () => h('div', { class: 'mk mk-term' }, h('pre', null, '$ git clone git@github.com:cummins/warranty-pipelines.git\n$ cd warranty-pipelines && python -m venv .venv && source .venv/bin/activate\n$ pip install -r requirements.txt\n$ pytest -q\n.........                                   [100%] 9 passed\n$ databricks bundle deploy -t dev\nDeployment complete!')),
      ['Used for setup, running tests, git, and deploy commands.', 'Not where you watch pipelines: that\'s the orchestrator UI.', 'Most commands are one-liners you learn once and reuse.', 'Try the terminal simulator lesson to practise these.']],
  };
  const keys = Object.keys(screens); const seen = new Set(); let cur = keys[0];
  const tabs = h('div', { class: 'seg' }); const stage = h('div', { class: 'tour' });
  const draw = () => {
    seen.add(cur);
    tabs.replaceChildren(...keys.map(k => h('button', { class: k === cur ? 'on' : '', onclick: () => { cur = k; draw(); } }, (seen.has(k) && k !== cur ? '✓ ' : '') + screens[k][0])));
    const [t, sub, mk, notes] = screens[cur];
    stage.replaceChildren(h('div', { class: 'tour-screen' }, h('div', { class: 'tour-chrome' }, h('i'), h('i'), h('i'), h('span', null, `${t} · ${sub} (illustrative mock)`)), mk()),
      h('ul', { class: 'tour-notes' }, notes.map(n => h('li', { html: mdi(n) }))));
    if (seen.size === keys.length) done('You have seen every screen a data engineer works in. Most of the day is spent in the notebook/IDE, orchestrator, SQL editor and pull requests.');
  };
  root.append(goal(h, p.task || 'Open every screen. These are simplified mock-ups of the real tools.'), tabs, stage);
  draw();
};

// ------------------------------------------------------------------ TERMINAL SIMULATOR
V.terminal = function (root, p, { h, done }) {
  const missions = p.missions || [];
  let i = 0;
  const screen = h('pre', { class: 'term', 'aria-live': 'polite' });
  const task = h('div', { class: 'goal' });
  const inp = h('input', { class: 'term-in mono', id: 'term-' + Math.random().toString(36).slice(2, 7), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Type a command' });
  const print = (s, cls) => { const sp = h('span', { class: cls || '' }, s + '\n'); screen.append(sp); screen.scrollTop = screen.scrollHeight; };
  const showTask = () => {
    if (i >= missions.length) { task.replaceChildren(h('span', { class: 'goal-k' }, 'DONE'), h('span', null, 'All steps complete.')); inp.disabled = true; done(p.doneMsg || 'Environment ready.'); return; }
    const m = missions[i];
    task.replaceChildren(h('span', { class: 'goal-k' }, `STEP ${i + 1}/${missions.length}`), h('span', { html: mdi(m.task) }));
  };
  const hintBtn = h('button', { class: 'btn small ghost', onclick: () => { if (missions[i]) print('hint: ' + missions[i].hint, 'term-hint'); } }, 'Hint');
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const cmd = inp.value.trim(); inp.value = '';
    if (!cmd) return;
    print((p.prompt || '$') + ' ' + cmd, 'term-cmd');
    if (cmd === 'clear') { screen.replaceChildren(); return; }
    const m = missions[i];
    if (m && new RegExp(m.accept, 'i').test(cmd)) { if (m.out) print(m.out); if (m.why) print('# ' + m.why, 'term-why'); i++; showTask(); }
    else if (m) print(m.miss || `command not recognised for this step. Type "Hint" for help.`, 'term-err');
  });
  print(p.banner || 'Practice terminal. Type the command for each step and press Enter.', 'term-why');
  root.append(task, h('div', { class: 'term-wrap' }, screen, h('div', { class: 'term-line' }, h('span', { class: 'mono' }, p.prompt || '$'), inp, hintBtn)));
  showTask();
};

// ------------------------------------------------------------------ NAPKIN MATH (estimate with tolerance)
V.napkin = function (root, p, { h, done }) {
  const qs = p.questions || []; const ok = new Set();
  const fmt = n => n >= 1e12 ? (n / 1e12).toFixed(2) + ' T' : n >= 1e9 ? (n / 1e9).toFixed(2) + ' B' : n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(2) + ' K' : String(Math.round(n * 100) / 100);
  const calc = h('input', { class: 'input mono', id: 'calc-' + Math.random().toString(36).slice(2, 7), placeholder: 'scratch calculator: e.g. 100e6 * 2e3 / 1e9', autocomplete: 'off' });
  const calcOut = h('span', { class: 'mono tabnum' });
  calc.addEventListener('input', () => { const s = calc.value.replace(/[^0-9eE+\-*/(). ]/g, ''); try { const v = Function('"use strict";return (' + (s || '0') + ')')(); calcOut.textContent = isFinite(v) ? '= ' + v.toLocaleString(undefined, { maximumFractionDigits: 3 }) + '  (' + fmt(v) + ')' : ''; } catch (e) { calcOut.textContent = ''; } });
  const box = h('div', { class: 'napkin' });
  qs.forEach((q, k) => {
    const id = 'nap-' + k + '-' + Math.random().toString(36).slice(2, 6);
    const inp = h('input', { class: 'input mono', id, inputmode: 'decimal', placeholder: q.unit, autocomplete: 'off' });
    const fb = h('div', { class: 'small' });
    const check = () => {
      const v = parseFloat(inp.value.replace(/,/g, ''));
      if (!isFinite(v)) return;
      const within = Math.abs(v - q.answer) <= Math.abs(q.answer) * (q.tol ?? 0.25);
      fb.innerHTML = within ? `<b class="ok-t">✓ Close enough.</b> ${mdi(q.why)}` : `<b class="bad-t">Not quite.</b> ${v < q.answer ? 'Too low.' : 'Too high.'} Hint: ${mdi(q.hint || 'break it into steps.')}`;
      if (within) { ok.add(k); inp.disabled = true; if (ok.size === qs.length) done(p.doneMsg || 'Estimates done. Say these numbers out loud in interviews.'); }
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    box.append(h('div', { class: 'napkin-q' }, h('label', { for: id, html: `<b>${k + 1}.</b> ${mdi(q.q)}` }), h('div', { class: 'row' }, inp, h('button', { class: 'btn small primary', onclick: check }, 'Check')), fb));
  });
  root.append(goal(h, p.task || 'Estimate each number (within ±25% counts).'), p.facts ? h('div', { class: 'vnote', html: mdi(p.facts) }) : null, box, h('div', { class: 'row' }, calc, calcOut));
};
})();
