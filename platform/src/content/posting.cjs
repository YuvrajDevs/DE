// Every line of the Cummins Data Engineer 1 posting (ReqID 2435232) mapped to lessons and practice gyms.
const I = (text, lessons, practice = [], note) => ({ text, lessons, practice, note });
module.exports = [
  { section: 'Job summary', items: [
    I('Supports, develops and maintains a data and analytics platform', ['o1', 't7', 'e1', 'e7'], ['scenarios']),
    I('Effectively and efficiently process, store and make data available to analysts and other consumers', ['o2', 'm5', 'e6', 'x5'], ['concepts-pipes']),
    I('Works with Business and IT teams to understand requirements and enable agile data delivery at scale', ['c4', 'v2', 'q6'], ['interview']),
  ] },
  { section: 'Key responsibilities', items: [
    I('Implements and **automates deployment** of a distributed system for ingesting and transforming data', ['c3', 'c5', 't3', 't4'], ['bugs']),
    I('Ingests from **relational, event-based and unstructured** sources', ['e2', 'p5', 'r1', 'r4', 'i2', 't5'], ['python', 'concepts-stream']),
    I('Continuously **monitors and troubleshoots data quality and integrity** issues', ['q1', 'q2', 'e7', 'd3'], ['scenarios', 'sql']),
    I('Implements **data governance**: metadata, access and **retention** for internal and external users', ['q3', 'q4', 'q5'], ['concepts-quality']),
    I('Develops reliable, efficient, scalable pipelines **with monitoring and alert mechanisms** using ETL/ELT tools or scripting', ['e1', 'e3', 'e4', 'e7', 'x6'], ['pyspark', 'scale']),
    I('Develops **physical data models** and implements storage architectures per design guidelines', ['m1', 'm5', 'e6', 'b4'], ['concepts-model']),
    I('Contributes to **conceptual, logical and physical** models; analyses data elements, flows, dependencies', ['m1', 'm2', 'm3', 'm4', 'q3'], ['sql']),
    I('Participates in **testing and troubleshooting** of pipelines', ['p6', 'q2', 'e7', 'd3'], ['bugs', 'scenarios']),
    I('Large-scale storage/processing on distributed and cloud platforms: **Data Lakes, Hadoop, HBase, Cassandra, MongoDB, Accumulo, DynamoDB**', ['b1', 'b10', 'b2', 'b7', 'b3', 'b8', 'b4', 'c1'], ['concepts-bigdata'], 'Hands-on labs: HDFS/YARN commands, Hive DDL, HBase/Cassandra/DynamoDB/MongoDB/Accumulo key design.'),
    I('Uses **DevOps, Scrum, Kanban** and continuous improvement', ['c3', 'c4', 'c5'], ['concepts-cloud']),
  ] },
  { section: 'Competencies', items: [
    I('**System Requirements Engineering**: verifiable requirements, acceptance criteria, traceability, change impact', ['c4', 'v2', 'd1'], ['interview']),
    I('**Collaborates** · **Communicates effectively** · **Customer focus** · **Decision quality** · **Values differences**', ['v1', 'v2'], ['interview']),
    I('**Data Extraction**: ETL from a variety of sources for downstream consumers', ['e1', 'e2', 'p3', 'p5', 'k3'], ['python', 'pyspark']),
    I('**Programming**: code, tests, build scripts, version control, automation', ['p1', 'p2', 'p6', 't4', 'c3'], ['python', 'bugs']),
    I('**Quality Assurance Metrics** (SDLC, KPIs)', ['q2', 'c4', 'e7'], ['concepts-quality']),
    I('**Solution Documentation** and **Solution Validation Testing**', ['c4', 'q3', 'q2'], ['concepts-cloud']),
    I('**Data Quality**: identify and correct flaws', ['q1', 'q2', 'a4'], ['sql', 'scenarios']),
    I('**Problem Solving**: root cause, prevent recurrence', ['d3', 'e7', 'k7', 'a7'], ['scenarios', 'bugs']),
  ] },
  { section: 'Education, licences, experience', items: [
    I('Degree in a relevant technical discipline; may require licensing for **export controls**', ['q4', 'v1'], ['concepts-quality'], 'Your B.Tech CS (VIT) fits. Export controls are covered under governance.'),
    I('Relevant experience: internships, co-ops, team activities', ['v1', 'o1'], ['interview'], 'Your Dealermatix work on Cummins data counts. Frame it with the DE vocabulary.'),
  ] },
  { section: 'Knowledge highly preferred', items: [
    I('Exposure to **Big Data open source**', ['b1', 'b2', 'b3', 'k1'], ['concepts-bigdata']),
    I('**Spark, Scala/Java, MapReduce, Hive, HBase, Kafka**', ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'b5', 'b9', 'b1', 'b6', 'b2', 'b7', 'b3', 'b8', 'r1', 'r5'], ['pyspark', 'python', 'concepts-spark']),
    I('**SQL** query language', ['s1', 's2', 's3', 's4', 's5', 's6', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'], ['sql']),
    I('**Clustered compute cloud-based** implementation', ['c1', 'k6', 'k7', 't8'], ['scale']),
    I('**Large file movement** for a cloud environment', ['c2', 'e6'], ['concepts-cloud']),
    I('Exposure to **Agile** development', ['c4'], ['interview']),
    I('Exposure to building **analytical solutions**', ['q6', 'm2', 'x5'], ['sql']),
    I('Exposure to **IoT** technology', ['r4', 'x3', 'r3'], ['concepts-stream', 'scale']),
  ] },
  { section: 'Core responsibilities unique to this role', items: [
    I('Build **enterprise data products** (pipelines, transformations, curated datasets) for Supply Chain, Quality, Finance, Product Lifecycle, incl. GenAI use cases', ['q5', 'd2', 'm2', 'i1'], ['interview', 'sql']),
    I('Apply **Data-as-a-Product**: reusable, discoverable, governed assets with metadata, lineage and quality controls', ['q5', 'q3', 'q1'], ['concepts-quality']),
    I('Deliver **AI-ready data products** with product managers, data scientists and solution engineers', ['i1', 'i2', 'd2'], ['concepts-ai']),
  ] },
  { section: 'Required skills', items: [
    I('Data integration, ETL/ELT, pipelines and transformations on **modern data platforms and cloud**', ['e1', 'e2', 'e4', 'e5', 'k3', 'c1'], ['pyspark', 'sql']),
    I('**Data modelling, SQL, data quality, metadata management, governance**', ['m2', 'm4', 'a4', 'q1', 'q3', 'q4'], ['sql', 'concepts-model']),
    I('Translate business requirements into scalable, performant, maintainable, reusable solutions', ['d1', 'd2', 'x2', 'v2'], ['scale', 'interview']),
    I('Agile, cross-functional collaboration', ['c4', 'v2'], ['interview']),
  ] },
  { section: 'Preferred', items: [
    I('Data-as-a-Product operating model: **data catalogs, lineage, quality frameworks, certified data products**', ['q5', 'q3', 'q2'], ['concepts-quality']),
    I('**AI/ML or GenAI**: AI-ready datasets, **semantic models, knowledge assets**', ['i1', 'i2', 'q6'], ['concepts-ai']),
  ] },
];
