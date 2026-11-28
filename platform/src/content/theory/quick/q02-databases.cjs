const { T } = require('../_t.cjs');

module.exports = {
  relational: T(`
    > **In one line:** a relational database (also called a SQL database) stores data in **tables**, links the tables together using **keys**, checks the data with **rules**, lets you ask questions in **SQL**, and keeps changes safe when many people use it at once. MySQL, PostgreSQL, SQL Server and Oracle are all relational databases.

    ## What it looks like

    A relational database is a set of tables, a bit like sheets in Excel. Each table holds one kind of thing.

    **claims table**

    | claim_id | dealer_id | amount | status |
    |---|---|---|---|
    | 9001 | 14 | 500.00 | Approved |
    | 9002 | 22 | 300.00 | Rejected |

    **dealers table**

    | dealer_id | name | region |
    |---|---|---|
    | 14 | Apex Motors | West |
    | 22 | Zen Auto | North |

    - Each **row** is one record. In the claims table, each row is one claim.
    - Each **column** is one piece of information about that record, and it has a fixed **type**. For example, amount is a number with 2 decimals (DECIMAL), status is text (VARCHAR), and submitted_at would be a date and time (TIMESTAMP).
    - The **primary key** is the column that identifies each row uniquely. Here it is claim_id in the claims table and dealer_id in the dealers table.
    - A **foreign key** is a column that points to a row in another table. The dealer_id inside the claims table points to the dealers table. That link is the "relation" in "relational".

    The database can also enforce **constraints**, which are rules it checks on every write. NOT NULL means a value must be present. UNIQUE means no two rows can share the value. CHECK (amount >= 0) means negative amounts are refused. A FOREIGN KEY constraint means a claim cannot point to a dealer that doesn't exist. If data breaks a rule, the database refuses it.

    ## Why it was invented

    Before the 1970s, the way data was laid out on disk was built into each program. Every new question needed new code. In 1970 Edgar Codd proposed the relational model, which separated **what the data means** (tables and how they relate) from **how it is physically stored**. You describe *what* you want in SQL, and the database works out *how* to get it. That idea is why one SQL query can answer questions nobody planned for when the database was designed.

    ## What happens inside when you run a query

    «««flow
    Your SQL -> Parser (checks the SQL is valid) -> Optimiser (picks the fastest plan) -> Executor (reads the data and does the joins) -> Storage on disk -> Result
    »»»

    - **Pages:** the database stores rows in small fixed-size blocks called pages, usually 8 KB each. It reads and writes whole pages, not single rows.
    - **Buffer pool:** the database keeps the most-used pages in memory, so it doesn't have to go to disk every time. If someone runs a huge report on a live app database, the report's pages push the app's pages out of memory and the app slows down. That is one reason data engineers copy data out of app databases instead of running heavy reports on them.
    - **Indexes:** extra sorted structures that let the database find rows without reading the whole table (explained fully in the Indexing topic).
    - **Optimiser:** before running a query, the database estimates the cost of different ways to run it (which index to use, which table to join first) using **statistics**, which are summaries of the data such as row counts. If the statistics are out of date, it can pick a slow plan. Running ANALYZE refreshes them.
    - **Clustered tables:** some databases (SQL Server, MySQL's InnoDB) physically store rows sorted by the primary key. Reading a range of keys is then very cheap, but inserting a row in the middle forces pages to split.
    - **Write-ahead log (WAL):** before the database changes any data, it first writes a note of the change into a log file. A change only counts as saved ("committed") once that note is safely on disk. If the server crashes, the database replays the log on restart to recover committed work and undo unfinished work. The same log is used to copy data to backup servers (replication) and by **CDC** (change data capture) tools that stream every change to a data pipeline. That's why CDC can capture every change without re-reading the whole table.
    - **Concurrency:** many users read and write at the same time. Databases manage this with **locks** (one user waits for another) and/or **MVCC** (multi-version concurrency control): when a row is updated, the database creates a new version of it, so readers keep seeing the old version until the writer finishes. Readers then don't block writers.

    ## Why it has lasted 50 years

    It keeps data correct even with thousands of users at once. It can answer any question without changing how data is stored. SQL is a standard language, so the same skills work on Postgres, MySQL, SQL Server, Oracle and even analytics engines like Spark and Snowflake. And the tooling for backup, replication and security is very mature.

    ## When to use it, and when to consider something else

    Use a relational database for structured, connected data where correctness matters: orders, invoices, warranty claims, inventory. It is also the right choice when there are many small changes happening at once and you need to ask flexible questions.

    Think twice when record shapes vary a lot from one record to the next, when writes must spread across many machines with only simple key lookups, when the data is a massive never-ending stream of time readings, or when the job is analysing billions of rows.

    | Alternative | Use it when |
    |---|---|
    | Document database (MongoDB) | Records are nested JSON-like documents whose fields vary |
    | Key-value store (Redis, DynamoDB) | You need extremely fast lookups by a single key at huge scale |
    | Wide-column database (Cassandra, HBase) | You have massive writes, such as sensor readings, with known queries |
    | Columnar warehouse (Snowflake, BigQuery) | You run large analytics queries |
    | Distributed SQL (CockroachDB, Spanner, YugabyteDB) | You need relational tables and safe transactions, spread across many machines |

    **The trade-offs:**
    - Strong correctness (ACID) makes it harder to spread writes across many machines.
    - Constraints catch bad data, but changing the table structure needs planned migrations.
    - Joins can answer anything, but they get slow on enormous tables.
    - SQL is standard, but each vendor adds its own extras.

    ## Where data engineers meet it

    Relational databases are the most common **source** of data: CRM, ERP and plant systems usually run on them. A data engineer must pull data out **without hurting the live system**, using CDC, a read-only copy (replica), or small incremental queries on an indexed column. When writing results back into an app database (called reverse ETL), you must respect its constraints. The source's primary keys become the **natural keys** you use later to remove duplicates and to merge changes. Even though lakehouses enforce few rules, the habit of thinking in related tables shapes how lakehouse data is modelled.

    ## What goes wrong

    - **NULL logic surprises people.** NULL means "unknown", so NULL = NULL is not true, it is unknown. A NOT IN (...) list that contains a NULL returns no rows at all.
    - **Comparing text with numbers.** If an ID is stored as text and compared to a number, the database may convert every value, which stops it using an index. Text also sorts differently: as text, '10' comes before '9'.
    - **Using FLOAT for money.** FLOAT stores approximate values, so 0.1 + 0.2 isn't exactly 0.3. Use DECIMAL for money.
    - **Timestamps without a time zone** across countries get mixed up. Store times in UTC (TIMESTAMPTZ in Postgres).
    - **Long-running transactions** hold locks and stop the database cleaning up old row versions. In Postgres this causes "bloat": the tables grow with dead data.
    - **Out-of-date statistics** after a big load lead to slow plans. Run ANALYZE after large loads.
    - **Analytics engines don't enforce primary and foreign keys.** Delta, Snowflake and BigQuery let you declare them but don't stop duplicates, so your pipeline has to test uniqueness itself.

    ## Growing bigger

    A single well-run relational database can handle terabytes and thousands of transactions per second just by using a bigger machine. Beyond that, teams add read-only copies (replicas) for reads, then split tables into partitions, and finally split the data across several databases (sharding). Sharding makes joins and transactions across shards hard. Distributed SQL databases do the sharding automatically, at the cost of slightly slower writes.

    ## Interview answers

    - **"What happens when you run a SQL query?"** "The database parses it, the optimiser uses statistics to choose a plan (which indexes and which join order), the executor runs that plan, and the data is read from pages on disk or from memory."
    - **"Why DECIMAL instead of FLOAT for money?"** "FLOAT stores approximate binary values, so sums drift by tiny amounts. DECIMAL stores exact digits, which money requires."
    - **"Are primary keys enforced in Snowflake or Delta?"** "No. They're informational only, so my pipeline removes duplicates and tests uniqueness."
    - **"What is the write-ahead log for?"** "Every change is logged before data pages change. That gives crash recovery, and the same log feeds replication and CDC."
  `),

  nosql: T(`
    > **In one line:** NoSQL databases are databases that are **not** organised as SQL tables. They give up some relational features, such as fixed columns, joins or transactions across many rows, in exchange for **spreading easily across many machines**, **flexible data shapes**, or **very fast lookups**. There are four main families: key-value, document, wide-column and graph.

    ## Why NoSQL exists

    A relational database mostly runs on one big machine. In the 2000s, companies like Amazon and Google needed to handle hundreds of thousands of writes per second from users all over the world, and they changed their data shapes every week. Splitting a relational database across many machines by hand was painful. So Amazon built Dynamo and Google built Bigtable. Both were designed from day one to spread data across many cheap machines and to serve a small number of **known questions** very fast. Today's NoSQL databases grew out of those designs.

    ## The four families

    **1. Key-value.** This works like a giant dictionary: you give a key and get back a value. The database doesn't look inside the value. The only operations are get, put and delete. Examples are Redis, DynamoDB and Memcached. Typical uses are caching, login sessions, serving ML features, rate limits and leaderboards. Example: the key "engine_77_latest" returns the value "health score 82".

    **2. Document.** Each record is a JSON-like document. Documents can contain nested data, and two documents in the same collection can have different fields. You fetch documents by ID or by indexed fields. Examples are MongoDB, Couchbase, Cosmos DB and Firestore. Typical uses are product catalogues, user profiles and app objects. Example: one claim document can contain its list of parts inside it.

    **3. Wide-column.** Data is grouped by a **partition key** (for example engine_id), like one drawer per engine. Inside each drawer, rows are sorted by a **clustering key** (for example time). Reading "engine 77 from 10:00 to 10:05" means opening one drawer and reading one sorted chunk, which is very fast. Examples are Cassandra, HBase, Google Bigtable, and Accumulo (which can lock down individual cells). Typical uses are time-series data, event logs and IoT sensor data at huge scale.

    **4. Graph.** Data is stored as dots (nodes) connected by lines (edges), and both can carry properties. Graph databases are good at following connections ("who is connected to whom, several steps away"). Examples are Neo4j and Amazon Neptune. Typical uses are supply-chain networks, fraud rings and recommendations.

    **Don't mix up two similar names.** *Wide-column* (Cassandra) is a kind of operational database. *Columnar* storage (Parquet, Snowflake) is a way of laying out data on disk for fast analytics. They are completely different things.

    ## How NoSQL databases grow so big

    **Partitioning (splitting by key).** Every record has a key. The database scrambles the key into a number (called hashing) and uses that number to decide which machine stores the record. Engine 77 always lands on the same machine. To add capacity, you add machines and the data spreads out. If you choose a bad key, too much data lands on one machine. That machine is called a **hot partition**.

    **Replication (copies).** Each record is stored on several machines, typically 3, so losing one machine loses nothing. When you read or write, you can choose how many copies must respond: one copy (fastest), a majority (called a **quorum**, which is safer), or all copies (slowest but most certain). This choice is called **tunable consistency**.

    **Eventual consistency.** Because there are several copies, a new write may reach copy 1 before copies 2 and 3. If you read copy 2 immediately, you may briefly see the **old value**. All copies agree after a short time, or "eventually". Many NoSQL databases work this way by default, and stronger guarantees cost speed.

    **Why their writes are so fast.** Cassandra, HBase and RocksDB use a design called an **LSM tree** (log-structured merge tree). It works in three steps:
    1. A new write goes into memory, plus a quick safety log on disk.
    2. When memory fills up, the data is written to disk as a new sorted file. The file is never edited again.
    3. In the background, small files are merged into bigger ones. This is called **compaction**.

    Writing is therefore very fast, like always writing on the next empty line of a notebook. Reading can be slower, because the answer may be spread across a few files (helper structures called bloom filters let the database skip files that can't contain the key). Compaction also uses extra disk work and can cause short slowdowns. Relational databases mostly use a different structure, the B-tree, which updates data in place and favours reads.

    ## The golden rule: design for your questions

    In a relational database you store data neatly first and can ask any question later. In NoSQL you must **list your questions first**, then design one table per question, so that each question reads from a single partition on a single machine. You often **copy the same data into several differently shaped tables**, one for each question. If a new question comes up later, you may need a new table.

    ## When to choose NoSQL, and when not

    | Choose NoSQL when | Avoid NoSQL when |
    |---|---|
    | You have huge volumes of simple lookups by key | You need ad-hoc questions and joins |
    | Data shapes are flexible or nested | Transactions across many records are central (banking) |
    | You need very fast responses worldwide | You don't know your questions yet, or they keep changing |
    | You write massive streams of sensor or log data | The data is relational and of normal size (just use Postgres) |

    There are also specialised databases: **time-series databases** (InfluxDB, TimescaleDB, Azure Data Explorer) for sensor data, and **search engines** (Elasticsearch, OpenSearch) for searching text and logs.

    ## Where data engineers meet NoSQL

    The job posting mentions HBase, Cassandra, MongoDB, Accumulo and DynamoDB. A data engineer meets them in three ways:
    - **As a source.** You pull data out into the lakehouse, using change feeds (MongoDB change streams, DynamoDB Streams) or exports. Expect nested documents whose shape varies from record to record.
    - **As a destination for serving.** You write results into one so an app can read them in milliseconds, for example "latest health score per engine", or ML features in Redis.
    - **As a telemetry store,** with an analytics copy kept in the lakehouse.

    **Never run analytics directly on a NoSQL database.** Scanning a whole Cassandra table is slow and slows down the live app. Copy the data to the lakehouse and analyse it there.

    ## What goes wrong

    - **Hot partitions.** If you key sensor data by date, all of today's writes go to one machine while the others sit idle. Key by engine_id instead (optionally plus a time bucket).
    - **Partitions that grow forever.** If one partition holds all of an engine's readings forever, it grows to gigabytes. Key by (engine_id, month) so each partition stays bounded.
    - **Reading your own write fails.** Under eventual consistency, a user saves something, reads it back, and sees the old value. Use stronger (quorum) reads where it matters.
    - **"Schema-less" doesn't mean "no schema".** The structure still exists, but it lives in the app code instead of the database. Over the years many different document shapes pile up, and your ingestion pipeline must handle all of them.
    - **Filtering on non-key columns** is slow or not allowed. Cassandra makes you add ALLOW FILTERING as a warning sign.
    - **Deletes leave markers.** A delete writes a marker called a **tombstone**. Tombstones slow down reads until compaction removes them.

    ## Interview answers

    - **"What are the types of NoSQL databases?"** "Key-value like Redis for caching, document like MongoDB for flexible records, wide-column like Cassandra for huge time-series data, and graph like Neo4j for connected data."
    - **"Why do NoSQL databases scale well?"** "They split data across machines by key, they support only a limited set of operations so each request touches one place, and they let you trade consistency for speed."
    - **"How would you store engine readings in Cassandra?"** "Partition by (engine_id, day) so each partition stays a manageable size and writes spread out, and sort rows by timestamp inside it. Then 'engine X today' is one fast read."
  `),

  sqlvsnosql: T(`
    > **In one line:** SQL databases give you fixed tables, joins, flexible questions and strong safety guarantees, and they grow mainly by getting a bigger machine. NoSQL databases give you flexible data shapes and the ability to spread across many machines, but only for questions you planned in advance, often with weaker guarantees and no joins. Pick based on the workload, not on what is fashionable.

    ## How to decide, step by step

    1. **What questions will you ask?** If questions are unpredictable, change often or need joins, choose SQL. If there are a few known lookups by key, NoSQL works.
    2. **How correct must the data be at every moment?** Money and stock levels need strict correctness, so choose SQL. Likes, sensor readings and caches can tolerate a briefly out-of-date value, so NoSQL is fine.
    3. **How big?** A well-run SQL database handles many terabytes and tens of thousands of transactions per second. Beyond that, or if you need writes in several countries at once, look at NoSQL or distributed SQL.
    4. **How varied is the data shape?** Stable shapes suit SQL. Highly varied or nested shapes suit a document database (or JSON columns inside a SQL database).
    5. **What does the team know and support?** A database nobody can operate is a risk.

    | | SQL | NoSQL |
    |---|---|---|
    | Structure | Defined up front; the database checks it on every write | Flexible; the structure lives in the app code |
    | Questions | Anything, including joins | Lookups by key or index; few or no joins |
    | Transactions | Safe changes across many rows and tables | Often one record at a time; some support a few items |
    | Freshness of reads | Always the latest value | Often "eventually" the latest; adjustable |
    | Growing | Bigger machine; read copies; splitting is hard | Spreads across machines by design |
    | Modelling | Store each fact once (normalise) | Copy data into query-shaped tables |
    | Best for | Business records, finance, flexible analysis | Massive key lookups, documents, time-series, caches |

    ## CAP and PACELC: the trade-off when data has copies

    Distributed databases keep copies of data on several machines. Sometimes the network between those machines breaks, and they can't talk to each other. This is called a **network partition**. A machine that is cut off and receives a request has two options:
    - **Refuse to answer**, because it can't be sure its copy is up to date. This prefers **consistency** (never return wrong or old data). Banking-type systems choose this.
    - **Answer with what it has**, which might be old. This prefers **availability** (always respond). Many NoSQL systems, such as Cassandra, choose this.

    It can't do both while the network is broken. That is the **CAP theorem**.

    **PACELC** adds that even when the network is fine, keeping all copies in sync means waiting for other machines to confirm, which is slower. So every day you also choose between **faster responses** that might be slightly stale and **always-correct responses** that are slower.

    ## SQL and NoSQL now copy each other

    The old rule ("SQL is strict and safe, NoSQL is flexible and scalable") is now blurry:
    - **PostgreSQL** can store and index JSON documents (JSONB), time-series data (via TimescaleDB) and AI vectors (via pgvector).
    - **MongoDB** now supports safe transactions across several documents, and rich queries.
    - **DynamoDB** supports transactions covering up to 100 items.
    - **Cassandra's** query language (CQL) looks like SQL, but it still follows NoSQL rules (no joins, query by key).
    - **Distributed SQL** databases (Google Spanner, CockroachDB, YugabyteDB) offer SQL tables and safe transactions while spreading across many machines.

    So the mature way to decide is not "SQL or NoSQL?" but: "What guarantees does this workload need, how will it be queried, and what can we afford to run?"

    ## Polyglot persistence: several databases in one company

    "Polyglot" means "many languages". Here it means a company uses a different database for each job:

    | Job | Database |
    |---|---|
    | Orders and payments | PostgreSQL (safe transactions) |
    | Login sessions and caching | Redis (very fast key-value) |
    | Search box on the website | Elasticsearch |
    | Engine sensor readings | Cassandra (wide-column) |
    | Reports and analysis | A lakehouse or warehouse |

    This is normal in large companies. **The data engineer's job is to move data between these systems** (using CDC, exports and agreed data contracts) and to check that the copies agree.

    ## What goes wrong

    - **NoSQL chosen "for scale" when the data is small.** Later the business needs reports and joins, which then have to be painfully rebuilt in application code.
    - **SQL chosen for huge sensor streams.** At 500,000 readings per second a single SQL database can't keep up with the writes. The fix is a streaming system feeding a wide-column database or a lakehouse.
    - **The "no schema work" myth.** Old records keep their old shapes, so ingestion must handle every shape that ever existed.
    - **The "stale for only a few milliseconds" myth.** During failures, or when copies are in different countries, data can stay stale for much longer.

    ## Interview answers

    - **"When would you choose NoSQL?"** "When I have huge volume, a few known lookups, flexible data shapes, and slightly stale reads are acceptable. Engine sensor readings fit Cassandra or a lakehouse. Warranty claims need joins and exact correctness, so they belong in a relational database."
    - **"Can NoSQL databases do transactions?"** "Some can, with limits. MongoDB supports multi-document transactions and DynamoDB supports transactions of up to 100 items, but neither is as general as a relational database."
  `),

  rowcol: T(`
    > **In one line:** **row storage** keeps all the values of one record together on disk, which is good for apps that read and write whole records. **Column storage** keeps all the values of one column together, which is good for analytics that read a few columns across many rows. Column storage is the main reason analytics engines are fast.

    ## Two ways to save the same table

    Take a claims table (imagine it actually has 40 columns):

    | claim_id | dealer | status | amount |
    |---|---|---|---|
    | 1 | Apex | Approved | 500 |
    | 2 | Zen | Rejected | 300 |
    | 3 | Apex | Approved | 700 |

    The disk stores data as one long sequence, so the database must choose an order.

    **Row storage** writes one whole row, then the next:
    «««text
    1, Apex, Approved, 500 | 2, Zen, Rejected, 300 | 3, Apex, Approved, 700
    »»»

    **Column storage** writes one whole column, then the next:
    «««text
    claim_id: 1, 2, 3
    dealer:   Apex, Zen, Apex
    status:   Approved, Rejected, Approved
    amount:   500, 300, 700
    »»»

    The data is identical; only the order on disk differs. That order changes everything about speed.

    ## Why column storage wins for analytics

    Analytics questions look like "total amount per status". That question needs only 2 of the 40 columns.

    **1. It reads only the columns it needs.** Column storage reads just status and amount and skips the other 38, about 5% of the data. Row storage has to read every full row to pick out those 2 values.

    **2. It compresses much better.** A single column holds similar values, which shrink well:
    - **Dictionary encoding:** status contains the same few words over and over, so the file stores Approved = 0 and Rejected = 1 and then just small numbers.
    - **Run-length encoding:** if 10,000 values in a row say "West", the file stores "West × 10,000" once. This only works if equal values sit next to each other, so sorting data before writing helps a lot.
    - **Delta encoding:** timestamps are stored as small differences from the previous value (+1 second, +1 second) instead of full dates.
    - **Bit-packing:** small numbers are stored using only the bits they need.
    - A general compression **codec** (Snappy or ZSTD) then squeezes the result further.

    Files 5 to 10 times smaller are common, and smaller files are faster to read.

    **3. The CPU processes it faster.** A column is a long list of values of one type. Modern CPUs can apply one operation to many such values at once (this is called vectorised or SIMD processing).

    **4. It can skip whole chunks.** Each chunk of a column records its smallest and largest value. For amount > 100000, any chunk whose largest amount is 5,000 is skipped without being read. This works best when the data is sorted, because then each chunk covers a narrow range.

    ## Why row storage wins for apps (transactions)

    Apps do things like "save this new claim" or "show me claim 2".
    - **Saving one record:** row storage writes it in one place. Column storage must write into 40 separate column areas.
    - **Updating one record:** row storage changes a small area. Column files often have to be **rewritten entirely** to change one row. That is why updates in a lakehouse rewrite Parquet files, or use "deletion vectors" (small markers saying "this row is deleted") to avoid full rewrites.
    - **Reading one record by key:** row storage reads it in one go. Column storage must collect the values from 40 columns and stitch the row back together.

    Some systems try to do both at once (called **HTAP**, hybrid transactional/analytical processing). More commonly, companies keep the app on a row database and copy its changes (CDC) into a columnar lakehouse for analytics.

    ## Which formats use which layout

    | Format | Layout | Used for |
    |---|---|---|
    | CSV, JSON Lines | Rows, plain text | Exchanging files, raw landing |
    | Avro | Rows, compact binary with a schema | Kafka messages, streaming, lots of writes |
    | **Parquet** | Columns | **Lakehouse tables (Delta, Iceberg) and analytics** |
    | ORC | Columns | Older Hadoop/Hive systems |
    | PostgreSQL, MySQL tables | Rows | Apps (OLTP) |
    | Snowflake, BigQuery, Redshift | Columns (their own private format) | Data warehouses |

    **Parquet is actually a mix of both.** A Parquet file is split into big blocks of rows called **row groups** (often around 128 MB each). Inside each row group, data is stored column by column, as **column chunks** split into smaller **pages**. At the end of the file, a **footer** records the schema and the min/max statistics. Row groups let many workers read different parts of one file at the same time, and column chunks let each worker read only the columns it needs. Sorting the data before writing makes the statistics tighter and the compression better.

    **Choosing:** if data is written one record at a time and read as whole records, use row storage (Avro, app databases). If it is read in big scans of a few columns, use column storage. A very common pipeline is: **data travels as Avro or JSON, and is stored as Parquet/Delta** for analysis.

    ## What goes wrong

    - **SELECT * on a wide columnar table** reads every column and throws away the main benefit. Ask only for the columns you need.
    - **Thousands of tiny files** waste time on file overhead and compress poorly.
    - **Unsorted data** makes min/max skipping useless, because every chunk contains every range of values. Cluster or Z-order the data on the columns people filter by.
    - **Many empty (NULL) columns** are cheap in columnar storage, because NULLs compress to almost nothing.
    - **Frequent single-row updates on Parquet** keep rewriting whole files (called write amplification). Update in batches, or use deletion vectors.

    ## Why it matters at scale

    Imagine a 10 TB table where a query needs 3 columns and can skip most chunks. It may read only about 50 GB instead of 10 TB, which is roughly 10 seconds instead of 30 minutes. On engines that charge per byte scanned, the bill is far smaller too.

    ## Interview answers

    - **"Why Parquet?"** "It stores data by column, so queries read only the columns they need. It compresses well through encodings, stores min/max statistics so chunks can be skipped, splits into row groups so many workers can read one file in parallel, and keeps its schema inside the file."
    - **"Why not use Parquet for Kafka messages?"** "Kafka sends small individual records, and columnar formats only pay off for large batches. Avro, a row format with a schema, fits better."
    - **"What is predicate pushdown?"** "The filter, such as amount > 100000, is passed down to the file reader, which uses the statistics to skip row groups and files that can't match before loading anything."
  `),

  keys: T(`
    > **In one line:** a key is a column (or a few columns together) whose value identifies one specific row, like a roll number in a class. A **primary key** identifies each row in its own table, a **foreign key** points to a row in another table, and a **unique constraint** forbids duplicate values. Keys are what make joins, de-duplication and merging possible.

    ## The kinds of keys

    Example tables: a claims table with claim_id and dealer_id, and a dealers table with dealer_id and dealer_code.

    - **Primary key (PK):** the column that uniquely identifies each row in its table. It can't be empty, and a table has exactly one. Example: claim_id in the claims table.
    - **Candidate key:** any column (or set of columns) that *could* serve as the primary key because it's also unique. An engine might be identifiable by both engine_id and serial_no, so both are candidates.
    - **Natural key (also called business key):** an identifier that has meaning in the real world or the source system, such as an engine serial number, an invoice number, a car's VIN, or a dealer code like D-014.
    - **Surrogate key:** an identifier with no business meaning, generated by the system, usually a running number (1, 2, 3, …) or a hash. Example: dealer_sk = 1042.
    - **Composite key:** a key made of several columns together, used when no single column is unique. Example: (order_id, line_no) identifies one line on one order.
    - **Foreign key (FK):** a column that refers to the key of another table. Example: dealer_id in the claims table points to the dealers table.
    - **Unique constraint:** a rule that no two rows may have the same value in a column, without making that column the primary key. Example: dealer_code must be unique. (Empty values are usually allowed.)

    ## Why keys matter

    **Identity.** To update or delete "claim 9001", the database needs to know exactly which row that is. Without a unique key you might change several rows, or the wrong one.

    **Integrity.** A foreign key ensures a claim can only point to a dealer that exists. A claim pointing to a non-existent dealer is called an **orphan**.

    **Speed.** Databases build an index on the primary key automatically, so finding a row by its key is very fast.

    **Pipelines depend on keys.** Almost every data engineering task uses them:
    - **Deduplication:** keeping exactly one row per claim_id when the same claim arrives twice.
    - **MERGE (also called upsert):** if a row with this key already exists, update it; otherwise insert it.
    - **CDC apply:** when the source reports "claim 9001 changed", the key tells you which row to change.
    - **Reconciliation:** comparing keys between source and target shows exactly which records are missing.

    ## Who enforces the rules?

    **App databases** (PostgreSQL, SQL Server, MySQL) check keys on every write. A second row with an existing primary key is refused, using a unique index behind the scenes. A claim pointing to a missing dealer is refused. When you delete a dealer that still has claims, the database follows the rule you chose:
    - **RESTRICT** refuses the delete.
    - **CASCADE** deletes the dealer's claims too.
    - **SET NULL** keeps the claims but empties their dealer_id.

    **Analytics engines mostly do not enforce primary and foreign keys.** This applies to Delta Lake, Snowflake, BigQuery and Redshift. Checking every row while bulk-loading millions of rows would be far too slow. You can still declare keys, and optimisers and BI tools use those declarations as hints. But nothing stops duplicates from getting in. (Delta does enforce two simpler rules: NOT NULL and CHECK constraints such as "amount >= 0".) **In a lakehouse, uniqueness is the pipeline's job:** remove duplicates before loading, write with MERGE rather than blind appends, and run a test that alerts if any key appears twice.

    ## Natural key vs surrogate key

    | | Natural key (e.g. D-014) | Surrogate key (e.g. 1042) |
    |---|---|---|
    | Can it change? | Yes, the business might re-code a dealer | No, it never changes once assigned |
    | Several source systems | The CRM calls a dealer D-014 while the ERP calls the same dealer 5521 | One surrogate key represents the dealer, and both source codes map to it |
    | Keeping history (SCD Type 2) | If you keep a new row each time a dealer's details change, D-014 appears on several rows and is no longer unique | Each version of the dealer gets its own surrogate key, so every row stays unique |
    | Join speed | Long text values are slower to compare | Small integers are fast |

    **The usual design:** keep the natural key as an ordinary column, so people can still search for "D-014". Use the surrogate key as the primary key of the dimension table. When loading fact rows (such as claims), look up the dealer's surrogate key and store it on each claim.

    ## What makes a good key

    A good key is **unique**, **always present**, **never changes**, and is **simple**. Never build keys from things that can change, such as names, email addresses or phone numbers.

    - **Composite keys:** say clearly what one row represents. This is called the **grain**. For engine readings, (engine_id, reading_ts) means "one row per engine per timestamp".
    - **Hash keys:** you can generate a key by running business columns through a hash function such as SHA-256. The same input always gives the same output, so every pipeline run produces identical IDs. Clean the values the same way every time before hashing: trim spaces, use consistent capitalisation, keep the columns in a fixed order, and handle empty values consistently. Otherwise identical records get different hashes.

    ## What goes wrong in real life

    - **The "unique" key isn't unique.** The documentation says claim numbers are unique, but India and Brazil both have claim number 1001. Use a composite key (country, claim_no), and always test uniqueness rather than trusting documentation.
    - **Empty (NULL) keys** silently fail to match in joins, and during deduplication all empty keys are treated as one group, so real records vanish. Reject or quarantine rows with empty keys.
    - **Spaces and capitalisation:** "D-014" and "d-014 " look the same to a person but not to a computer. Clean both sides before joining.
    - **Leading zeros:** if the ID "00123" is stored as a number it becomes 123 and can collide with a different record. Store IDs as text.
    - **The source re-uses an old code** for a new dealer, so old history suddenly points to the wrong dealer. Surrogate keys plus a mapping table between old and new codes protect you.
    - **A fact arrives for a dimension row you don't have yet** (for example a claim for a dealer not yet loaded). Never drop it silently. Link it to a special "Unknown" row (usually key -1), or create a placeholder row for that dealer to be filled in later. Then quarantine it and alert someone.
    - **Duplicate keys after a re-run.** A pipeline appends the same day twice. Because the lakehouse doesn't enforce keys, nothing stops it, and totals quietly double.

    ## Interview answers

    - **"Natural vs surrogate key?"** "A natural key comes from the business or the source, like a dealer code. A surrogate key is a meaningless integer generated by the warehouse. I use surrogate keys for dimensions because they never change, they unify the same entity coming from several systems, they let me keep history, and they make joins fast. I keep the natural key as an ordinary column."
    - **"Your lakehouse doesn't enforce primary keys. How do you guarantee uniqueness?"** "I deduplicate with ROW_NUMBER, keeping one row per key, write with MERGE instead of append so re-runs don't duplicate, and run a uniqueness test, such as a dbt unique test, that alerts when a key repeats."
    - **"A claim arrives for a dealer you don't have?"** "I don't drop it. I link it to an Unknown dealer row or a placeholder row for that dealer code, alert on it, and fix the link when the dealer's details arrive."
  `),

  indexing: T(`
    > **In one line:** an index is an extra, sorted structure that lets the database **find rows without reading the whole table**, just like the index at the back of a book lets you jump to a page. Searches on indexed columns become very fast, but every write becomes a little slower and the database takes more space.

    ## The idea, with an example

    Suppose the claims table has 200 million rows and you run:
    «««sql
    SELECT * FROM claims WHERE claim_id = 9001;
    »»»
    - **Without an index**, the database must read every row and check each one. This is called a **full table scan**, and it can take seconds to minutes.
    - **With an index on claim_id**, the database looks up 9001 in the sorted index, which tells it exactly where the row is. It reads a handful of pages and answers in milliseconds.

    ## How the standard index works: the B-tree

    Most indexes are **B-trees**, a balanced tree of pages that works like the levels of a phone book:
    - The **top page** says something like "IDs 1 to 50 million are down this branch, 50 to 100 million down that one".
    - Each **level below** narrows the range further.
    - The **bottom pages** (called leaves) point to the actual rows, or contain the rows themselves in a clustered index.

    Each page holds hundreds of keys, so only about **4 levels are needed to cover billions of rows**. A lookup touches just a few pages. (In computer science terms, the work grows with the logarithm of the table size, written O(log n), so doubling the table barely changes lookup time.)

    Because the keys are kept sorted, a B-tree also helps with **ranges** (claim_id BETWEEN 9000 AND 9100), **sorting** (ORDER BY claim_id), and **MIN/MAX**.

    ## Types of indexes

    | Index type | What it is | Good for |
    |---|---|---|
    | B-tree (the default) | Sorted tree, as described above | Exact matches, ranges, sorting |
    | Hash | Maps each value straight to a location | Exact matches only; can't do ranges |
    | Clustered | The table's rows themselves are stored in key order; a table can have only one | Range scans on that key (SQL Server tables, MySQL InnoDB primary keys) |
    | Secondary (non-clustered) | An extra index pointing back to the rows | Additional ways to look rows up |
    | Composite | An index on several columns together | Filters on the first column(s) of the index |
    | Covering | An index that contains every column the query needs | Answering the query from the index alone, without visiting the table |
    | Bitmap | One bit-map per distinct value | Columns with few distinct values in analytics |
    | Inverted / full-text (e.g. Postgres GIN) | Maps each word or element to the rows containing it | Text search, arrays, JSON fields |
    | Partial (filtered) | Indexes only some rows | For example "only open claims" |
    | BRIN (Postgres) | Stores only the min and max for each block of rows | Huge tables where rows arrive in order, such as telemetry by time; the index is tiny |

    ## The leftmost-prefix rule for composite indexes

    An index on (dealer_id, submitted_at) is sorted by dealer_id first, then by submitted_at within each dealer, like a phone book sorted by surname, then first name.
    - It **helps** WHERE dealer_id = 14, because that's the first column.
    - It **helps** WHERE dealer_id = 14 AND submitted_at > '2026-01-01'.
    - It **does not help** WHERE submitted_at > '2026-01-01' on its own. That is like searching a phone book by first name only.

    When designing one, put the columns you compare with "=" first and the column you filter by range (>, <, BETWEEN) after them.

    ## What indexes cost

    - **Every write must also update every index.** A table with 10 indexes does roughly 10 extra writes for each inserted row.
    - **Indexes take space,** sometimes as much as the table itself.
    - **Bulk loads are faster without indexes.** It's often quicker to drop indexes, load the data, and rebuild them afterwards.
    - **Indexes get messy over time** (called fragmentation or bloat) and need maintenance.
    - **Statistics must stay fresh,** or the optimiser won't know when to use the index.

    **Rule of thumb:** an index helps when a query returns only a small fraction of the table, a few percent or less. If a query needs half the rows, reading the whole table straight through is cheaper than jumping around via the index.

    ## Why the database sometimes ignores your index

    - **A function wraps the column.** WHERE DATE(submitted_at) = '2026-11-26' or WHERE UPPER(code) = 'D-014' can't use a normal index on that column. Rewrite the first as a range (submitted_at >= '2026-11-26' AND submitted_at < '2026-11-27'), or create an index on the function itself.
    - **Hidden type conversion.** Comparing a text column with a number forces the database to convert every value.
    - **A wildcard at the start.** LIKE '%pump' can't use the sorted order, because the beginning of the text is unknown. (LIKE 'pump%' can.)
    - **Low selectivity.** If status = 'Approved' matches 60% of rows, scanning is cheaper, so the optimiser skips the index.
    - **OR across different columns,** or filtering on the second column of a composite index without the first.
    - **Out-of-date statistics** make the optimiser misjudge the cost.

    ## How analytics systems do it instead

    Warehouses and lakehouses (Snowflake, BigQuery, Databricks) mostly **don't use B-tree indexes**. Instead they **skip data**:
    - **Partition pruning:** data is split into folders, for example by date, and only the matching folders are read.
    - **Min/max statistics per file or chunk** (called zone maps): chunks that can't contain matching values are skipped.
    - **Clustering, Z-order or liquid clustering:** related values are stored close together, so the min/max ranges are narrow and more chunks can be skipped, even across several columns.
    - **Bloom filters:** small structures that can say "this value is definitely not in this file". Useful for columns with many distinct values, such as IDs.
    - Snowflake calls this micro-partition pruning, BigQuery calls it clustering, and Delta calls it data skipping.

    So in an app database the fix for a slow query is often "add an index", while in analytics it is "**fix how the data is laid out**".

    ## Where data engineers meet indexes

    - **Incremental extracts** that pull "rows changed since last time" with WHERE updated_at > … need an index on updated_at. Without one, every extract scans the whole production table and slows the app. Ask the database administrator for the index, or use CDC.
    - **MERGE into a serving database** needs an index on the key, or each merge scans the table.
    - **In the lakehouse,** partition by date, cluster by the columns people commonly filter on, and compact small files.

    ## Interview answers

    - **"How does an index speed up a query, and what does it cost?"** "A B-tree index keeps keys sorted in a shallow tree, so the database finds a row in a few page reads instead of scanning the table. The cost is slower writes, because every index must be updated, plus extra storage and maintenance."
    - **"Why might a query not use an index?"** "A function or type conversion on the column, a leading wildcard, low selectivity, filtering on a composite index without its first column, or stale statistics."
    - **"How do warehouses filter fast without indexes?"** "They skip data instead: partition pruning, min/max statistics per file, clustering to keep related values together, and bloom filters."
  `),

  normal: T(`
    > **In one line:** **normalisation** means storing each fact **once**, spread across several linked tables, so that updates are safe. It is used in app databases. **Denormalisation** means deliberately repeating data in fewer, wider tables, so that queries need fewer joins. It is used in analytics. Each is right for its own job.

    ## The problem normalisation solves

    Imagine one wide table that stores dealer details on every claim:

    | claim_id | dealer_id | dealer_name | dealer_region | amount |
    |---|---|---|---|---|
    | 9001 | 14 | Apex Motors | West | 500 |
    | 9002 | 14 | Apex Motors | West | 700 |
    | 9003 | 22 | Zen Auto | North | 300 |

    Repeating the dealer's details causes three problems, called **anomalies**:
    - **Update anomaly:** dealer 14 moves to the North region. You must update all 5,000 of its claims. If you miss 2, the database now says dealer 14 is in two regions at once.
    - **Insert anomaly:** you can't record a new dealer until that dealer has made a claim, because dealer details only exist on claim rows.
    - **Delete anomaly:** if you delete a dealer's only claim, you lose everything you knew about that dealer.

    **The fix** is to move dealer details into their own dealers table, stored once, and have each claim refer to the dealer by dealer_id. Changing a region then means changing one row.

    ## The normal forms

    Normalisation is described in levels called **normal forms**. Each level removes another kind of repetition.

    **First normal form (1NF): one value per cell.** Each cell must hold a single value, with no lists or repeating groups. A parts column containing "P-77,P-12" breaks this rule. The fix is a separate claim_parts table with one row per part.

    **Second normal form (2NF): depend on the whole key.** This matters when the key is made of several columns. In an order_lines table keyed by (order_id, line_no), a customer_name column depends only on order_id, not on the whole key, so it gets repeated on every line of the order. The fix is to move customer_name to an orders table.

    **Third normal form (3NF): depend only on the key.** A non-key column must not depend on another non-key column. In the claims table above, dealer_region depends on dealer_id, which is not the claim's key. The fix is to move it to the dealers table.

    **Boyce-Codd normal form (BCNF)** is a stricter version of 3NF for rare cases with overlapping candidate keys.

    A classic memory aid: every column must depend on **"the key, the whole key, and nothing but the key."** 3NF is the usual target for app databases.

    ## Why analytics does the opposite

    In analytics, a query joining 6 tables across billions of rows is expensive, especially when the data is spread across many machines and must be shuffled between them for each join. Analytics systems are also **read far more often than written**, and they are loaded in controlled batches by a pipeline. So the pipeline can take care of keeping repeated copies correct, and queries get simpler and faster.

    Common denormalised shapes:
    - **Star schema:** one central fact table (for example claims) surrounded by wide, flat dimension tables (dealer, date, engine), each joined with a single key.
    - **One big table (OBT):** everything pre-joined into one very wide table, built for one heavy dashboard.
    - **Nested columns:** instead of a separate child table, a row holds a list (array) or a group of fields (struct), for example the list of parts inside each claim row.

    | | Normalised | Denormalised |
    |---|---|---|
    | Repetition | Minimal | Deliberate |
    | Writing data | Simple and safe | The pipeline must update every copy |
    | Reading data | Many joins | Few joins |
    | Storage | Smaller | Larger (columnar compression reduces this) |
    | What keeps data correct | The table structure itself | Pipeline logic and tests |
    | Where it's used | App databases, often silver-layer entities | Gold layer, marts, serving tables, ML features |

    Dimensional modelling (the star schema) sits in the middle. It is "normalised enough", because facts refer to dimensions by key, and "denormalised enough", because each dimension is flat and wide.

    ## How the layers fit together

    «««flow
    App database (3NF) -> Silver layer (cleaned, conformed entities) -> Gold layer (star schema) -> One big table for a heavy dashboard
    »»»

    The pipeline keeps this safe. When a dealer changes region, the dealer dimension is updated in one controlled step (or a new version of the row is added, which is called SCD Type 2), and then the gold tables are rebuilt from it. Wide tables are always rebuilt from the star layer, never edited by hand.

    ## What goes wrong

    - **Stale copies.** A one-big-table rebuilt nightly still shows yesterday's region today. Document how often each table refreshes, and rebuild dependent tables together.
    - **Fan-out joins.** If each dealer has several contacts and you join claims to contacts, every claim row is repeated once per contact, and summed amounts become inflated. Always know how many matches each join can produce (its **cardinality**).
    - **Over-normalised analytics.** Analysts end up writing 9-join queries by hand, and their results slowly disagree. Provide modelled gold tables instead.
    - **Current vs historical values.** If you attach the dealer's *current* region to last year's claims, last year's regional totals change whenever a dealer moves. Decide deliberately, and use SCD Type 2 when history must be preserved.
    - **Nested arrays confuse BI tools.** Flatten them in the tables people query.

    ## Interview answers

    - **"Explain 1NF, 2NF and 3NF."** "1NF: one value per cell, no lists. 2NF: every non-key column depends on the whole composite key. 3NF: no non-key column depends on another non-key column, for example a dealer's region belongs in the dealers table, not on every claim."
    - **"Why denormalise in a warehouse?"** "Warehouses are read far more than written and loaded in controlled batches, joins are expensive at scale, and repeated values compress well in columnar storage. So fewer, wider tables make queries simpler and faster."
    - **"What is a fan-out join?"** "A join where one row matches several rows on the other side, which multiplies rows and inflates sums."
  `),
};
