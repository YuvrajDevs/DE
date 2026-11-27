// Every line of the Cummins Data Engineer 1 posting (ReqID 2435232) mapped to Theory topics.
// Each topic carries its own check questions, scenarios, interview questions and hands-on tasks.
const I = (text, topics, note) => ({ text, topics, note });
module.exports = [
  { section: 'Job summary', items: [
    I('Supports, develops and maintains a data and analytics platform', ['whatde', 'pipelines', 'storage', 'lakearch', 'reliab', 'monitoring']),
    I('Effectively and efficiently process, store and make data available to analysts and other consumers', ['consumers', 'etlelt', 'clouddw', 'semantic', 'dataproduct']),
    I('Works with Business and IT teams to understand requirements and enable agile data delivery at scale', ['requirements', 'agile', 'roles', 'sysdesign']),
  ] },
  { section: 'Key responsibilities', items: [
    I('Implements and **automates deployment** of a distributed system for ingesting and transforming data', ['devops', 'iac', 'databricks', 'pypack', 'git', 'orch']),
    I('Ingests from **relational, event-based and unstructured** sources', ['ingestion', 'cdc', 'connect', 'kafkawhat', 'pydb', 'pyio', 'datatypes', 'genai']),
    I('Continuously **monitors and troubleshoots data quality and integrity** issues', ['dqdims', 'recon', 'schemaval', 'observ', 'dlq', 'rca', 'nulls']),
    I('Implements **data governance**: metadata, access and **retention** for internal and external users', ['govwhat', 'metadata', 'catalog', 'access', 'retentionpol', 'pii', 'ownership']),
    I('Develops reliable, efficient, scalable pipelines **with monitoring and alert mechanisms** using ETL/ELT tools or scripting', ['fullincr', 'idempotency', 'retries', 'errors', 'airflow', 'dbt', 'monitoring', 'sla', 'pyerrors']),
    I('Develops **physical data models** and implements storage architectures per design guidelines', ['cll', 'delta', 'partsize', 'tableformats', 'fileformats', 'objstore']),
    I('Contributes to **conceptual, logical and physical** models; analyses data elements, flows, dependencies', ['whatmodel', 'cll', 'erd', 'grain', 'facts', 'dims', 'star', 'scd', 'deps', 'lineage']),
    I('Participates in **testing and troubleshooting** of pipelines', ['testing', 'pytest', 'sparkui', 'plans', 'rca']),
    I('Large-scale storage/processing on distributed and cloud platforms: **Data Lakes, Hadoop, HBase, Cassandra, MongoDB, Accumulo, DynamoDB**', ['lakearch', 'hadoopwhat', 'hdfs', 'hbase', 'cassandra', 'mongodb', 'dynamodb', 'diststore', 'nosql'], 'Accumulo is covered inside the HBase topic (cell-level security).'),
    I('Uses **DevOps, Scrum, Kanban** and continuous improvement', ['devops', 'agile', 'sdlc', 'qametrics']),
  ] },
  { section: 'Competencies', items: [
    I('**System Requirements Engineering**: verifiable requirements, acceptance criteria, traceability, change impact', ['requirements', 'lineage', 'docs']),
    I('**Collaborates** · **Communicates effectively** · **Customer focus** · **Decision quality** · **Values differences**', ['agile', 'roles', 'consumers', 'rca'], 'Behavioural questions for each competency are in Interview → Behavioural and competencies.'),
    I('**Data Extraction**: ETL from a variety of sources for downstream consumers', ['ingestion', 'fullincr', 'cdc', 'pydb', 'srcdst', 'connect']),
    I('**Programming**: code, tests, build scripts, version control, automation', ['pymodel', 'pyiter', 'pyconc', 'pytest', 'pypack', 'git', 'scalajava']),
    I('**Quality Assurance Metrics** (IT Operating Model, SDLC, KPIs)', ['qametrics', 'sdlc', 'dqframe', 'sla']),
    I('**Solution Documentation** and **Solution Validation Testing**', ['docs', 'testing', 'requirements']),
    I('**Data Quality**: identify and correct flaws', ['dqdims', 'dqframe', 'dedupe', 'recon', 'contracts', 'nulls', 'sqltypes']),
    I('**Problem Solving**: root cause, traceability, prevent recurrence', ['rca', 'sparkui', 'plans', 'observ']),
  ] },
  { section: 'Education, licences, experience', items: [
    I('Degree in a relevant technical discipline; may require licensing for **export controls** or sanctions', ['govwhat', 'cloudsec', 'pii'], 'Your B.Tech CS fits. Export controls appear under governance and cloud security (data residency, access).'),
    I('Relevant experience: internships, co-ops, team activities', ['whatde', 'roles'], 'Your Dealermatix work on Cummins data counts. Interview → Your projects has the grilling questions.'),
  ] },
  { section: 'Knowledge highly preferred', items: [
    I('Exposure to **Big Data open source**', ['bigdata', 'distcomp', 'hadoopwhat', 'sparkwhat', 'kafkawhat']),
    I('**Spark, Scala/Java, MapReduce, Hive, HBase, Kafka**', ['sparkarch', 'dag', 'shuffle', 'joinstrat', 'aqe', 'sparkmem', 'sss', 'scalajava', 'mapreduce', 'hive', 'hivepart', 'hbase', 'brokers', 'prodcons', 'offsets', 'ksemantics']),
    I('**SQL** query language', ['sqlorder', 'nulls', 'joinsdeep', 'aggdeep', 'windows', 'ctes', 'patterns', 'plans', 'isolation', 'dml', 'sqltypes']),
    I('**Clustered compute cloud-based** implementation', ['cluster', 'clusters', 'databricks', 'parallel', 'cost']),
    I('Applications requiring **large file movement** for a cloud environment', ['filemove', 'objstore', 'partsize', 'compression']),
    I('Exposure to **Agile software development**', ['agile', 'sdlc', 'devops']),
    I('Exposure to building **analytical solutions**', ['oltpolap', 'star', 'semantic', 'clouddw']),
    I('Exposure to **IoT technology**', ['iot', 'iotingest', 'predmaint', 'statefulstream', 'lagscale']),
  ] },
  { section: 'Core responsibilities unique to the role', items: [
    I('Develop and maintain **enterprise data products**: pipelines, transformations, curated datasets for reporting, analytics, automation and **GenAI** across Supply Chain, Quality, Finance, Product Lifecycle', ['dataproduct', 'facts', 'dims', 'aiready', 'genai', 'rag']),
    I('Apply **Data-as-a-Product**: reusable, discoverable, governed assets with metadata, lineage and quality controls; **self-service** across business units', ['dataproduct', 'mesh', 'catalog', 'lineage', 'semantic', 'dqframe']),
    I('Collaborate with Product Managers, Data Engineers, Data Scientists and Solution Engineers on **AI-ready data products**', ['aiready', 'ml', 'features', 'rag', 'roles']),
  ] },
  { section: 'Required skills', items: [
    I('Developing and supporting **data integration, ETL/ELT**, pipelines and transformations on modern platforms and cloud', ['etlelt', 'ingestion', 'dbt', 'databricks', 'azure']),
    I('**Data modelling, SQL, data quality, metadata management, governance** for enterprise-scale products', ['whatmodel', 'scd', 'grain', 'sqlorder', 'dqdims', 'metadata', 'govwhat']),
    I('Translate business and product requirements into technical solutions: **scalability, performance, maintainability, reusability**', ['requirements', 'sysdesign', 'sizing', 'partsize', 'pypack']),
    I('**Agile**, cross-functional teams across product, engineering, analytics, business', ['agile', 'roles']),
  ] },
  { section: 'Preferred skills', items: [
    I('Working in a **Data-as-a-Product operating model**: catalogs, lineage, quality frameworks, certified data products', ['dataproduct', 'catalog', 'lineage', 'dqframe', 'mesh']),
    I('**AI/ML or GenAI** initiatives: AI-ready datasets, semantic models, knowledge assets, data structures for intelligent solutions', ['aiready', 'semantic', 'rag', 'genai', 'features', 'ml']),
  ] },
];
