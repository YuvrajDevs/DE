// Practice banks: basics, cloud, governance, ai, bigdata.
const { mcq, tf, multi, order, match, sql, py, scenario, talk, bug } = require('../_h.cjs');

module.exports = {
  // ================================================================== BASICS
  basics: [
    mcq('A report query runs directly on the production order database at 10 am and the order app slows down for customers. What\'s the design mistake?', ['The query is wrong', 'Heavy analytics ran on an OLTP system; copy data to an analytical store and query there', 'The app needs more users', 'Nothing'], 1),
    mcq('"Connection refused" when connecting to a database usually means:', ['Wrong password', 'Nothing is listening on that host/port (service down, wrong port) or a firewall rejected it', 'The table is empty', 'The query is slow'], 1),
    mcq('"Permission denied for table claims" means:', ['The network is down', 'You logged in fine but your user/role lacks access to that table', 'The table doesn\'t exist', 'Wrong port'], 1),
    tf('A data lake stores files of any type cheaply; a warehouse stores structured tables optimised for SQL.', true),
    tf('Streaming is always better than batch.', false, 'Batch is simpler and cheaper; stream only when freshness really matters.'),
    match('Match the error to the likely cause.', [['Connection timed out', 'Network path blocked (firewall/VPN)'], ['Authentication failed', 'Wrong or expired credentials'], ['Unknown host', 'Wrong hostname / DNS'], ['Permission denied', 'Missing access rights']]),
    multi('What should never be committed to a repository?', ['Passwords', 'API keys', 'README', '.env files with secrets', 'requirements.txt'], [0, 1, 3]),
    order('Put the path of a sale from app to dashboard in order.', ['Sale recorded in the operational database', 'Pipeline extracts it', 'Raw copy lands in the lake (bronze)', 'Cleaned and modelled (silver/gold)', 'Dashboard reads the gold table']),
    mcq('What is a virtual environment for?', ['Faster Python', 'Keeping each project\'s library versions separate', 'Running Python in the cloud', 'Encrypting code'], 1),
    scenario('Works on my laptop, fails on the server', 'Your pipeline runs locally but fails on the company server with ModuleNotFoundError: No module named \'requests\'.', [
      ['Why?', [
        ['The server\'s environment doesn\'t have the libraries your laptop has', true, 'Different environments.'],
        ['The code is wrong', false, 'It works locally.'],
      ]],
      ['Lasting fix?', [
        ['Pin dependencies in requirements.txt (or a container image) and install them in every environment', true, 'Reproducible environments.'],
        ['Copy your laptop\'s site-packages folder to the server', false, 'Fragile and platform-specific.'],
      ]],
    ]),
    talk('*"Explain your role to someone non-technical."*', `
      - I make sure the business gets correct data on time, automatically.
      - I copy data out of the systems where it\'s created, clean and combine it, and deliver it to dashboards and tools.
      - I add checks so if something breaks or looks wrong, we know before anyone makes a decision on bad numbers.
    `),
  ],

  // ================================================================== CLOUD
  cloud: [
    match('Match the Azure service to its role.', [['ADLS Gen2', 'Data lake storage'], ['Azure Data Factory', 'Ingestion and orchestration'], ['Azure Databricks', 'Spark compute / lakehouse'], ['Synapse / Fabric warehouse', 'SQL analytics warehouse'], ['Event Hubs', 'Kafka-compatible event ingestion']]),
    match('Match the equivalent services across clouds.', [['Azure Blob / ADLS', 'AWS S3 / GCS'], ['Azure Data Factory', 'AWS Glue / GCP Data Fusion'], ['Event Hubs', 'AWS Kinesis / GCP Pub/Sub'], ['Synapse', 'Redshift / BigQuery']]),
    mcq('You must copy 5 TB from an on-prem server to cloud storage over a slow link. Best approach?', ['One single-threaded upload', 'Parallel, chunked, resumable transfers (e.g. AzCopy) with checksums, or an offline transfer appliance if the link is too slow', 'Email it', 'Convert to CSV first'], 1),
    mcq('A large upload fails at 80%. What design avoids starting over?', ['Bigger timeout', 'Chunked/multipart uploads that resume from the last completed chunk', 'Compress with zip', 'Retry from zero'], 1),
    tf('Keeping compute in the same region as the data reduces both latency and data-transfer cost.', true),
    tf('A managed service removes the need to monitor your pipelines.', false, 'It removes server management, not monitoring of your data and jobs.'),
    multi('How do you verify a large file arrived intact?', ['Compare checksums (e.g. MD5/SHA-256) before and after', 'Compare byte size and row count', 'Open it in Notepad', 'Check the file name'], [0, 1]),
    mcq('Which access setup is best for a pipeline reading from cloud storage?', ['A shared admin password in the code', 'A managed identity / service principal with read access to that container only', 'Public container', 'Your personal login'], 1),
    scenario('The cloud bill spiked', 'This month\'s data platform bill is 3× last month\'s.', [
      ['First step?', [
        ['Break down cost by service, cluster and job tag to find the top contributors', true, 'Find where the money goes before cutting.'],
        ['Turn everything off', false, 'Breaks the business.'],
      ]],
      ['A dev cluster has been running 24/7 with 40 nodes. Fix?', [
        ['Auto-termination after idle time, smaller node limits for dev, and budget alerts', true, 'Stop paying for idle compute.'],
        ['Delete the dev environment', false, 'People need it.'],
      ]],
    ]),
    scenario('Nightly file transfer keeps failing', 'A 200 GB nightly copy from a plant server to ADLS fails 2 nights out of 7 with network errors.', [
      ['Design fix?', [
        ['Use a tool with chunked, parallel, resumable transfer and retries, verify checksums, and alert on failure', true, 'Resumable + verified + monitored.'],
        ['Run it twice every night', false, 'Wastes bandwidth and may duplicate.'],
      ]],
      ['Downstream jobs sometimes read a half-copied file. Fix?', [
        ['Write to a temp name/folder and atomically rename (or drop a _SUCCESS marker) when complete; consumers wait for the marker', true, 'Never let readers see partial files.'],
        ['Tell consumers to start later', false, 'Fragile.'],
      ]],
    ]),
    talk('*"How would you build this pipeline on Azure?"*', `
      - Sources → ADF (or Event Hubs for streams) → ADLS Gen2 raw zone.
      - Databricks (Spark + Delta) for bronze → silver → gold; Unity Catalog for governance.
      - Orchestrate with ADF/Databricks Workflows (or Airflow); secrets in Key Vault; managed identities.
      - Serve gold to Power BI / Synapse; monitor with Azure Monitor + data-quality checks.
      - Mention cost controls: job clusters, autoscaling, auto-termination.
    `),
  ],

  // ================================================================== GOVERNANCE
  governance: [
    mcq('A new analyst needs sales data but not customer phone numbers. Best approach?', ['Give full table access and trust them', 'Grant a role on a view/columns that excludes or masks PII', 'Email them a CSV', 'Deny access'], 1),
    mcq('"Least privilege" means:', ['Everyone gets admin', 'Each user/service gets only the access it needs, nothing more', 'Nobody gets access', 'Only managers get access'], 1),
    mcq('What is data lineage used for?', ['Making queries faster', 'Knowing where data came from and what depends on it, for impact analysis and debugging', 'Encryption', 'Backups'], 1),
    tf('A retention policy can require deleting data after a period, even if it might be useful later.', true, 'Laws and policies (e.g. privacy) can require deletion.'),
    tf('Masking a column in the dashboard is enough to protect PII.', false, 'The underlying table/exports still expose it; control access at the data layer.'),
    match('Match the concept.', [['Who can read which table/column', 'Access control'], ['Description, owner, definitions of a table', 'Metadata / catalog'], ['How long data is kept', 'Retention'], ['Where a column\'s values came from', 'Lineage']]),
    multi('What makes a dataset a good "data product"?', ['A named owner', 'Documentation and definitions', 'Quality checks and SLAs', 'A guarantee it never changes', 'Discoverable in a catalog'], [0, 1, 2, 4]),
    order('Put onboarding a new dataset into governance in order.', ['Classify sensitivity (PII? confidential?)', 'Assign an owner and document it in the catalog', 'Set access roles (least privilege) and masking', 'Set retention and quality checks', 'Publish and monitor usage']),
    scenario('PII in the wrong place', 'You discover customer phone numbers in a widely shared analytics table.', [
      ['Immediate step?', [
        ['Restrict access to the table (or mask the column) right away and inform the data owner / privacy team', true, 'Contain first.'],
        ['Wait for the next sprint', false, 'Exposure continues.'],
      ]],
      ['Root-cause fix?', [
        ['Find the pipeline step that copied the column, remove or hash it there, tag PII in the catalog, and add a check that blocks PII columns in that layer', true, 'Fix at source, prevent recurrence.'],
        ['Delete the table', false, 'Users still need the non-PII data.'],
      ]],
    ]),
    scenario('A column change breaks other teams', 'You renamed a column in a gold table; three dashboards owned by other teams broke.', [
      ['What would have prevented this?', [
        ['Lineage to see downstream consumers before the change, a contract/version for the table, and a deprecation period', true, 'Impact analysis + communication.'],
        ['Never changing anything', false, 'Not realistic.'],
      ]],
    ]),
    talk('*"How would you govern a new data product?"*', `
      - Owner, description and definitions in the catalog; lineage captured.
      - Classify sensitivity; least-privilege roles; mask/hash PII; audit access.
      - Retention per policy; quality checks with SLAs and alerts.
      - Version changes with a contract and give consumers notice.
    `),
  ],

  // ================================================================== AI-READY DATA
  ai: [
    mcq('Before feeding support tickets to an LLM search tool, what is essential?', ['Nothing', 'Remove or mask personal data, deduplicate, attach metadata, and control who can retrieve what', 'Translate to English', 'Convert to PDF'], 1),
    mcq('In a RAG system, what is "chunking"?', ['Compressing files', 'Splitting documents into passages small enough to embed and retrieve precisely', 'Deleting old data', 'Encrypting documents'], 1),
    mcq('What is an embedding?', ['A database index', 'A list of numbers representing the meaning of a text, so similar texts are close together', 'A file format', 'A password'], 1),
    tf('Hybrid search (keyword + vector) often beats pure vector search for exact names and codes.', true),
    tf('If the model sounds confident, the answer is grounded in your data.', false, 'Check citations against sources; evaluate retrieval with labelled questions.'),
    multi('What makes data "AI-ready"?', ['Clean and deduplicated', 'Documented with clear definitions', 'Governed (PII handled, access controlled)', 'Fresh and versioned', 'As large as possible, no matter what'], [0, 1, 2, 3]),
    order('Put a RAG ingestion pipeline in order.', ['Collect documents and metadata', 'Clean, dedupe and scrub PII', 'Chunk into passages', 'Embed and store in a vector index (with metadata)', 'Evaluate retrieval on labelled questions; re-index on changes']),
    match('Match the metric to what it measures.', [['Hit@5', 'Right document in the top 5 results'], ['Precision', 'Share of retrieved items that are relevant'], ['Recall', 'Share of relevant items that were retrieved'], ['Groundedness', 'Answer claims supported by the cited sources']]),
    py({ q: 'Write «chunk_text(text, size, overlap)» that splits text into chunks of «size» characters, each starting «size - overlap» characters after the previous one. «chunk_text("abcdefghij", 4, 1)» → «["abcd", "defg", "ghij"]».', starter: 'def chunk_text(text, size, overlap):\n    pass\n', tests: `assert chunk_text('abcdefghij', 4, 1) == ['abcd', 'defg', 'ghij'], chunk_text('abcdefghij', 4, 1)
assert chunk_text('', 4, 1) == []
assert chunk_text('abc', 5, 1) == ['abc']`, solution: `def chunk_text(text, size, overlap):
    if not text:
        return []
    step = size - overlap
    out = []
    i = 0
    while True:
        out.append(text[i:i + size])
        if i + size >= len(text):
            break
        i += step
    return out` }),
    scenario('The AI assistant leaks salaries', 'An internal RAG chatbot answers "what is Rohan\'s salary?" correctly from an HR document.', [
      ['What went wrong?', [
        ['Sensitive documents were indexed without access control, so retrieval ignores who is asking', true, 'Retrieval must respect permissions.'],
        ['The model is too smart', false, 'It only used what it was given.'],
      ]],
      ['Fix?', [
        ['Remove sensitive docs from the general index (or filter retrieval by the user\'s permissions), classify documents before indexing, and audit', true, 'Governance applies to AI too.'],
        ['Tell the model not to answer salary questions', false, 'Prompt rules are easily bypassed.'],
      ]],
    ]),
    talk('*"How would you prepare our data for AI use?"*', `
      - Start from use cases; pick sources; agree definitions (semantic layer / metrics).
      - Clean, dedupe and document; scrub PII; keep lineage and versions.
      - For text: chunk, embed, store with metadata; respect access permissions at retrieval.
      - Evaluate with labelled questions (e.g. Hit@5), monitor freshness and quality, re-index on changes.
    `),
  ],

  // ================================================================== BIG DATA ECOSYSTEM
  bigdata: [
    mcq('Why did Spark largely replace MapReduce?', ['It uses less disk', 'It keeps intermediate data in memory and plans whole jobs, instead of writing to disk between every map and reduce step', 'It only works in the cloud', 'MapReduce was removed from Hadoop'], 1),
    mcq('HDFS stores each block on 3 machines by default. Why?', ['Speed only', 'Fault tolerance: losing a machine doesn\'t lose data', 'Compression', 'Security'], 1),
    mcq('What does YARN do?', ['Stores files', 'Allocates cluster resources (CPU/memory containers) to applications', 'Runs SQL', 'Streams events'], 1),
    mcq('What is the Hive metastore?', ['A file system', 'A catalog of table definitions (schema, location, partitions) on top of files', 'A message queue', 'A BI tool'], 1),
    mcq('An app needs to fetch one customer\'s latest profile in milliseconds, millions of times a day. Best fit?', ['Hive', 'A NoSQL key-value/wide-column store (HBase, Cassandra, DynamoDB) keyed by customer_id', 'A daily CSV', 'MapReduce'], 1),
    mcq('Why is HBase a poor choice for "total sales by region last year"?', ['It can\'t store numbers', 'It\'s built for fast key lookups, not large scans and aggregations; use a warehouse/lakehouse', 'It\'s too small', 'It has no API'], 1),
    tf('In HBase/Cassandra, you design the row key around how the data will be queried.', true),
    tf('A row key that starts with a timestamp spreads writes evenly across servers.', false, 'Monotonic keys hot-spot one region; salt or hash the prefix.'),
    match('Match the tool to its job.', [['HDFS', 'Distributed file storage'], ['YARN', 'Cluster resource manager'], ['MapReduce', 'Batch processing: map, shuffle, reduce'], ['Hive', 'SQL over files with a metastore'], ['HBase', 'Low-latency key lookups on Hadoop']]),
    order('Put the phases of a MapReduce word count in order.', ['Split input into blocks', 'Map: emit (word, 1) for each word', 'Shuffle and sort: group pairs by word', 'Reduce: sum counts per word', 'Write results to HDFS']),
    multi('Which are true about Hive partitions?', ['Each partition is a folder (e.g. dt=2026-01-01)', 'Filtering on the partition column skips other folders', 'Partitioning by a column with millions of values is ideal', 'New partitions may need to be registered in the metastore'], [0, 1, 3]),
    scenario('Hive query scans the whole table', 'A Hive query with «WHERE dt = \'2026-11-01\'» on a table partitioned by dt still reads every folder.', [
      ['Likely causes?', [
        ['The new partition folders exist on disk but aren\'t registered in the metastore, or the filter type/format doesn\'t match', true, 'Check SHOW PARTITIONS and the filter.'],
        ['Hive can\'t use partitions', false, 'It can.'],
      ]],
      ['Fix?', [
        ['Register partitions (MSCK REPAIR / ADD PARTITION) and filter with the exact partition value format', true, 'Then pruning works.'],
        ['Copy the table to MySQL', false, 'No.'],
      ]],
    ]),
    scenario('Hot-spotting in HBase', 'Writes to an HBase table are slow; one region server is at 100% while others are idle. Row key = timestamp + device_id.', [
      ['Why?', [
        ['All new writes have increasing keys and land in the same region', true, 'Monotonic row keys create a hot region.'],
        ['HBase is slow in general', false, 'It\'s the key design.'],
      ]],
      ['Fix?', [
        ['Put a hashed/salted prefix or device_id first in the row key so writes spread across regions', true, 'Design keys for even distribution and your read pattern.'],
        ['Add one more server', false, 'The hot region still lives on one server.'],
      ]],
    ]),
    talk('*"Explain Hadoop in two minutes."*', `
      - **HDFS** splits big files into blocks and stores replicated copies across many machines.
      - **YARN** manages cluster resources and runs applications in containers.
      - **MapReduce** processes data in parallel: map → shuffle/sort → reduce, writing to disk between steps.
      - **Hive** adds SQL tables on top of files; **HBase** adds fast key lookups.
      - Today Spark replaced MapReduce for most processing, and cloud object storage often replaces HDFS, but the ideas (blocks, partitions, shuffle, data locality) are the same.
    `),
    talk('*"When would you use a NoSQL database instead of a warehouse?"*', `
      - NoSQL (HBase, Cassandra, DynamoDB, MongoDB): known access patterns, fast reads/writes by key, huge write throughput, flexible schemas: e.g. serving a device\'s latest state to an app.
      - Warehouse/lakehouse: ad-hoc analytics, joins, aggregations over large history.
      - Many systems use both: NoSQL for serving, lakehouse for analytics.
    `),
  ],
};
