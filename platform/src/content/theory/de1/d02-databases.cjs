const { T } = require('../_t.cjs');
const C = md => ({ ...T(md), level: 'core' });
const A = md => ({ ...T(md), level: 'aware' });

module.exports = {
  relational: C(`
    > **In one line:** a relational database (also called a SQL database) stores data in **tables** that are linked to each other by **keys**. You ask it questions in **SQL**, it checks your data against **rules**, and it keeps data correct even when many people use it at the same time. MySQL, PostgreSQL, SQL Server and Oracle are all relational databases.

    ## What it looks like

    A relational database is a set of tables, a bit like sheets in an Excel file. Each table holds one kind of thing.

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

    - A **row** is one record. In the claims table, one row is one claim.
    - A **column** is one piece of information about the record. Each column has a fixed **type**: amount is a number with two decimals (DECIMAL), status is text (VARCHAR), and a submitted_at column would be a date and time (TIMESTAMP).
    - The **primary key** is the column that identifies each row uniquely: claim_id in claims, dealer_id in dealers.
    - A **foreign key** is a column that points to a row in another table. The dealer_id inside the claims table points to the dealers table. That link between tables is the "relation" in "relational".

    ## Rules the database enforces (constraints)

    You can tell the database to refuse bad data. These rules are called **constraints**:
    - **NOT NULL:** the value must be filled in.
    - **UNIQUE:** no two rows may have the same value.
    - **CHECK:** a condition must hold, for example CHECK (amount >= 0) refuses negative amounts.
    - **FOREIGN KEY:** a claim can't point to a dealer that doesn't exist.

    **Why this matters:** bad data is stopped at the door, instead of being discovered weeks later in a wrong report.

    ## Why relational databases exist

    Before the 1970s, the way data was stored on disk was built into each program, so every new question needed new code. The relational model separated **what the data means** (tables and how they relate) from **how it's physically stored**. You describe *what* you want in SQL, and the database works out *how* to fetch it. That is why one SQL query can answer a question nobody thought of when the database was designed.

    ## What happens when you run a query (simple version)

    «««flow
    Your SQL -> Database checks the SQL -> Optimiser picks the fastest way -> Data is read -> Result
    »»»

    - The **optimiser** is the part that decides *how* to run your query, for example whether to use an index or which table to join first. It decides using **statistics**, which are summaries of the data such as how many rows each table has.
    - **Why statistics matter:** after a big data load, old statistics make the optimiser guess wrong and pick a slow plan. Running ANALYZE refreshes them.

    ## How it stays safe when many people use it at once

    Two important ideas:
    - **Transactions:** several changes can be grouped so they all happen or none do (covered in the Transactions topic).
    - **The write-ahead log (WAL):** before changing any data, the database writes a note of the change into a log file on disk. If the server crashes, it uses the log to recover. **Why a data engineer cares:** CDC (change data capture) tools read this same log to stream every insert, update and delete into your pipeline, without re-reading whole tables.

    ## When to use a relational database

    Use it for **structured, connected data where correctness matters**: orders, invoices, warranty claims, inventory. It's also the right choice when many small changes happen at once and people need to ask flexible questions.

    Consider something else when:
    - record shapes vary a lot from record to record (a document database like MongoDB fits better);
    - you need huge numbers of simple lookups spread across many machines (a key-value store or Cassandra);
    - you're analysing billions of rows (a warehouse or lakehouse like Snowflake or Databricks).

    ## Where a data engineer meets relational databases

    They are the most common **source** of data. A company's CRM, ERP and plant systems usually run on them. Your job is to copy data out **without slowing down the live system**:
    - copy only new or changed rows, using an indexed column such as updated_at;
    - read from a read-only copy (a **replica**) instead of the main database;
    - or use **CDC** to stream changes from the log.

    **Why not just run big queries on the live database?** Because the database keeps its busiest data in memory. A heavy report pushes that data out of memory, and the app the business depends on slows down.

    ## Common mistakes

    - **NULL means "unknown", not "empty".** NULL = NULL is not true, it's unknown. That's why you write IS NULL instead of = NULL.
    - **Using FLOAT for money.** FLOAT stores approximate values, so 0.1 + 0.2 isn't exactly 0.3, and totals drift. Use DECIMAL for money.
    - **Mixing time zones.** Times saved without a time zone from different countries get mixed up. Store times in UTC.
    - **Assuming the lakehouse enforces keys.** Delta, Snowflake and BigQuery let you declare primary keys but **don't stop duplicates**, so your pipeline must check for them.

    ## Interview answers

    - **"What is a relational database?"** "It stores data in tables with typed columns, links them with primary and foreign keys, enforces rules like NOT NULL and UNIQUE, and is queried with SQL. Postgres and SQL Server are examples."
    - **"Why DECIMAL and not FLOAT for money?"** "FLOAT is approximate, so sums drift by tiny amounts. DECIMAL stores exact digits."
    - **"How would you extract data from a production database?"** "Without hurting it: incremental queries on an indexed updated_at column, reading from a replica, or CDC from the transaction log."
  `),

  nosql: C(`
    > **In one line:** NoSQL databases are databases that **aren't** organised as SQL tables. They give up some SQL features, such as joins or fixed columns, to gain **spreading easily across many machines**, **flexible data shapes**, or **very fast lookups**. There are four families: key-value, document, wide-column and graph. The job description names several (HBase, Cassandra, MongoDB, DynamoDB, Accumulo), so know what each is for.

    ## Why NoSQL exists

    A relational database mostly runs on one big machine, and one machine has limits. Around 2005, companies like Amazon and Google needed to handle huge numbers of writes from users all over the world, and their data shapes changed often. So they built databases designed from the start to **spread data across many cheap machines** and to answer a small number of **known questions** very fast. Today's NoSQL databases grew from those designs.

    ## The four families

    **1. Key-value: a giant dictionary.** You give a key and get back a value. The only operations are get, put and delete.
    - Examples: Redis, DynamoDB.
    - Used for: caches, login sessions, "latest health score for engine 77".

    **2. Document: each record is a JSON document.** Documents can contain nested data, and two documents can have different fields.
    - Examples: MongoDB, Cosmos DB.
    - Used for: product catalogues, user profiles, app data. For example, one claim document can contain its list of parts inside it.

    **3. Wide-column: one "drawer" per key, rows sorted inside.** Data is grouped by a **partition key** (for example engine_id), and inside each group rows are kept sorted, usually by time. Reading "engine 77's readings from 10:00 to 10:05" means opening one drawer and reading one sorted chunk, which is very fast.
    - Examples: Cassandra, HBase. Accumulo is similar, with security controls on individual cells.
    - Used for: huge streams of sensor readings, logs, IoT data.

    **4. Graph: dots connected by lines.** Data is stored as nodes (things) and edges (relationships). It's good at "who is connected to whom, several steps away".
    - Examples: Neo4j.
    - Used for: supply-chain networks, fraud rings, recommendations.

    **Don't mix up "wide-column" and "columnar".** Wide-column (Cassandra) is a type of operational database. Columnar (Parquet, Snowflake) is a way of storing data on disk for fast analytics. They're unrelated.

    ## How NoSQL databases handle huge scale

    **1. They split data across machines by key.** The database scrambles each record's key into a number (called **hashing**) and uses that number to choose a machine. Engine 77 always goes to the same machine. To grow, you add machines.

    *Why the key matters:* if you choose a bad key, too much data lands on one machine. For example, keying sensor data by date sends all of today's data to one machine. That overloaded machine is called a **hot partition**.

    **2. They keep copies.** Each record is usually stored on 3 machines, so one machine failing loses nothing.

    **3. Reads may be briefly out of date.** A new write may reach one copy before the others. If you read another copy immediately, you might see the old value for a moment. All copies agree soon after. This is called **eventual consistency**. *Why accept it?* Because waiting for every copy to confirm every write would make the database much slower.

    ## The golden rule: design for your questions

    In SQL you store data neatly and can ask any question later. In NoSQL you **decide your questions first** and design one table per question, so that each question reads from one place. You often store the same data more than once, shaped for different questions. *Why?* Because NoSQL can't do joins efficiently, so the answer must already be stored in the shape you'll read it.

    ## When to use NoSQL, and when not

    | Use NoSQL when | Use SQL instead when |
    |---|---|
    | You have huge volumes of simple lookups by key | You need flexible questions and joins |
    | Data shapes vary or are nested | Several records must change together safely (e.g. payments) |
    | You need very fast responses at large scale | You don't know your questions yet |
    | You store massive sensor or log streams | The data is relational and of normal size |

    ## Where a data engineer meets NoSQL

    - **As a source:** you copy data from MongoDB or DynamoDB into the lakehouse, using their change feeds or exports. Expect messy, nested documents whose shapes vary.
    - **As a destination:** you write results into one so an app can read them in milliseconds, for example the latest health score per engine.
    - **Never run analytics directly on it.** Scanning a whole Cassandra table is slow and slows the live app. Copy the data to the lakehouse and analyse it there.

    ## Common mistakes

    - **A bad partition key** creates a hot partition. Key sensor data by engine_id, not by date.
    - **A partition that grows forever.** If one engine's readings all go into one partition for years, it gets huge. Use (engine_id, month) instead.
    - **Believing "schema-less" means no structure.** The structure still exists in the app code, and old records keep old shapes. Your pipeline must handle all of them.

    ## Interview answers

    - **"What types of NoSQL databases are there?"** "Key-value like Redis for caching, document like MongoDB for flexible records, wide-column like Cassandra or HBase for huge time-series data, and graph like Neo4j for connected data."
    - **"Why do they scale well?"** "They split data across many machines by key, keep copies, and support simple operations that each touch one place."
    - **"How would you store engine readings in Cassandra?"** "Partition by engine and day, sorted by timestamp. Then 'engine X today' is one fast read, and no partition grows forever."
  `),

  sqlvsnosql: C(`
    > **In one line:** SQL databases give fixed tables, joins, flexible questions and strong correctness, and grow mainly by using a bigger machine. NoSQL databases give flexible data shapes and spread across many machines, but only answer questions you planned for, often with briefly stale reads. Choose based on what the data and its users need.

    ## How to decide

    Ask these questions in order:
    1. **What questions will be asked?** Unpredictable questions or joins point to SQL. A few known lookups by key point to NoSQL.
    2. **Must the data be exactly correct at every moment?** Money and stock levels must be, so use SQL. Likes, sensor readings and caches can be a moment out of date, so NoSQL is fine.
    3. **How big is it?** A well-run SQL database handles terabytes. Much beyond that, especially with huge write rates, NoSQL (or a lakehouse) fits better.
    4. **How varied is the data shape?** Stable shapes suit SQL. Very varied or nested shapes suit a document database.
    5. **What can the team run?** A database nobody knows how to operate is a risk.

    | | SQL | NoSQL |
    |---|---|---|
    | Structure | Defined up front and checked on every write | Flexible; lives in the app code |
    | Questions | Anything, including joins | Lookups by key; few or no joins |
    | Changing several records together | Safe (transactions) | Often one record at a time |
    | Reads | Always the latest value | Often "eventually" the latest |
    | Growing | Bigger machine; harder to split | Spreads across machines by design |
    | Best for | Business records, finance | Huge key lookups, documents, sensor data, caches |

    ## The CAP idea, simply

    Databases that keep copies on several machines face one hard choice. Sometimes the network between the machines breaks (a **network partition**). A machine that can't reach the others then has two options:
    - **Refuse to answer**, so it never returns old data. This prefers **consistency**. Banking-style systems choose this.
    - **Answer with what it has**, even if it might be old. This prefers **availability**. Many NoSQL systems, like Cassandra, choose this.

    It can't do both while the network is broken. That's the **CAP theorem**.

    **One level deeper:** even when the network is fine, keeping every copy in sync means waiting for the other machines, which is slower. So systems also choose between faster and always-up-to-date in normal operation. (This extension is called PACELC.)

    ## Today the line is blurry

    - PostgreSQL can store and search JSON documents, like a document database.
    - MongoDB can now change several documents safely together, like SQL.
    - Some new databases (Google Spanner, CockroachDB) are SQL and also spread across many machines.

    So in an interview don't say "NoSQL because it scales". Say: "It depends on how the data is queried, how correct it must be, and how big it is."

    ## Big companies use several databases at once

    Each job gets the database that suits it best. This is called **polyglot persistence**:

    | Job | Database |
    |---|---|
    | Orders and payments | PostgreSQL |
    | Login sessions, caching | Redis |
    | Website search | Elasticsearch |
    | Engine sensor readings | Cassandra |
    | Reports and analysis | Lakehouse / warehouse |

    **The data engineer moves data between these systems** and checks that the copies agree.

    ## Common mistakes

    - **Choosing NoSQL "for scale" when the data is small.** Later the business needs reports and joins, and they're painful to build.
    - **Choosing SQL for a huge sensor stream.** Hundreds of thousands of writes per second overwhelm a single SQL database. Use streaming plus Cassandra or a lakehouse.
    - **Thinking NoSQL means no structure work.** Your pipeline must handle every shape old records ever had.

    ## Interview answers

    - **"When would you use NoSQL over SQL?"** "When the volume is huge, the questions are known key lookups, shapes vary, and slightly stale reads are fine, like engine sensor readings. Warranty claims need joins and exact correctness, so they belong in a SQL database."
    - **"Explain CAP simply."** "If the network between database copies breaks, a database must either refuse requests to stay correct, or answer with possibly old data to stay available. It can't do both."
  `),

  rowcol: C(`
    > **In one line:** **row storage** saves all the values of one record together on disk, which suits apps that read and write whole records. **Column storage** saves all the values of one column together, which suits analytics that read a few columns across millions of rows. Column storage is the main reason analytics engines and Parquet are fast.

    ## Two ways to save the same table

    Take a claims table (imagine it has 40 columns):

    | claim_id | dealer | status | amount |
    |---|---|---|---|
    | 1 | Apex | Approved | 500 |
    | 2 | Zen | Rejected | 300 |
    | 3 | Apex | Approved | 700 |

    The disk stores data as one long line, so the order must be chosen.

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

    Same data, different order. That order changes the speed a lot.

    ## Why column storage is better for analytics

    Analytics questions look like "total amount per status", which needs only 2 of the 40 columns.

    **1. It reads only the columns it needs.** It reads status and amount and skips the other 38, about 5% of the data. Row storage must read every full row just to get those two values.

    **2. It compresses much better.** A column holds similar values, which shrink well:
    - Repeated words are replaced with small numbers (Approved = 0, Rejected = 1). This is **dictionary encoding**.
    - A long run of the same value is stored once with a count ("West × 10,000"). This is **run-length encoding**, and it only works when equal values sit next to each other, so **sorting the data before writing helps**.
    - Files often end up 5 to 10 times smaller, and smaller files are faster to read.

    **3. It can skip chunks.** Each chunk of a column records its smallest and largest value. For a filter like amount > 100000, any chunk whose largest amount is 5,000 is skipped without being read. *Why sorting helps here too:* in sorted data each chunk covers a narrow range, so more chunks can be skipped.

    ## Why row storage is better for apps

    Apps do things like "save this new claim" or "show me claim 2":
    - **Saving one record:** row storage writes it in one place. Column storage has to write into 40 separate column areas.
    - **Reading one record:** row storage reads it in one go. Column storage has to collect 40 pieces and stitch them back together.
    - **Updating one record:** row storage changes a small area. Column files usually have to be **rewritten** to change one row. That's why updates in a lakehouse are more expensive than in an app database.

    **Simple rule:** apps (many small reads and writes) use row storage; analytics (big scans of a few columns) use column storage.

    ## Which formats use which layout

    | Format | Layout | Used for |
    |---|---|---|
    | CSV, JSON | Rows, plain text | Exchanging files, raw data |
    | Avro | Rows, compact binary | Kafka messages and streaming |
    | **Parquet** | Columns | **Data lakes and analytics (Delta tables use Parquet)** |
    | ORC | Columns | Older Hadoop/Hive systems |
    | PostgreSQL, MySQL | Rows | Apps |
    | Snowflake, BigQuery | Columns (their own format) | Data warehouses |

    A typical pipeline: data **travels** as JSON or Avro (one record at a time) and is **stored** as Parquet/Delta for analysis.

    ## Common mistakes

    - **SELECT \\* on a columnar table** reads every column and throws away the main benefit. Select only the columns you need.
    - **Thousands of tiny files** are slow and compress badly. Fewer, larger files (roughly 128 MB to 1 GB) are better.
    - **Unsorted data** makes chunk skipping almost useless.

    ## Interview answers

    - **"Row vs column storage?"** "Row storage keeps each record together, which is ideal for apps that read and write whole records. Column storage keeps each column together, so analytics reads only the columns it needs, compresses better and skips chunks using min/max values."
    - **"Why is columnar faster for analytics?"** "Less data is read because only the needed columns are scanned, similar values compress very well, and chunks that can't match a filter are skipped."
    - **"Why not use Parquet for Kafka messages?"** "Kafka sends one small record at a time, and columnar only pays off for big batches. A row format like Avro fits better."
  `),

  keys: C(`
    > **In one line:** a key is a column (or a few columns together) whose value identifies one specific row, like a roll number in a class. A **primary key** identifies each row in its own table, and a **foreign key** points to a row in another table. Keys are what make joins, removing duplicates and merging changes possible.

    ## The main kinds of keys

    - **Primary key:** uniquely identifies each row in a table. It can't be empty and can't repeat. Example: claim_id in the claims table.
    - **Foreign key:** a column that points to another table's primary key. Example: dealer_id in the claims table points to the dealers table, telling you which dealer the claim belongs to.
    - **Natural key (business key):** an ID with real-world meaning, coming from the business or the source system. Examples: a dealer code like D-014, an engine serial number, an invoice number.
    - **Surrogate key:** an ID with no business meaning, generated by the system, usually a simple running number (1, 2, 3 …).
    - **Composite key:** several columns that are unique only together. Example: (order_id, line_no), because one order has many lines.
    - **Unique constraint:** a rule that a column can't contain the same value twice, even though it isn't the primary key. Example: dealer_code.

    ## Why keys matter

    - **To identify the right row.** Updating "claim 9001" needs a unique key, or you might change the wrong rows.
    - **To prevent broken links.** A foreign key stops a claim from pointing to a dealer that doesn't exist. A row whose parent is missing is called an **orphan**.
    - **For speed.** Databases build an index on the primary key, so finding a row by key is very fast.
    - **For pipelines.** Almost everything a data engineer does uses keys:
      - **removing duplicates:** keep one row per claim_id;
      - **MERGE (upsert):** if the key exists, update the row; if not, insert it;
      - **applying changes from CDC:** the key says which row changed;
      - **reconciliation:** comparing keys between source and target shows exactly which records are missing.

    ## Who enforces key rules?

    **App databases** (PostgreSQL, SQL Server, MySQL) enforce them: a duplicate primary key or a claim for a missing dealer is refused.

    **Analytics platforms mostly don't.** Delta Lake, Snowflake and BigQuery let you declare primary keys, but they **don't stop duplicates**. *Why?* Checking every row while loading millions of rows at once would be far too slow. So in a lakehouse, **your pipeline must guarantee uniqueness**:
    - remove duplicates before loading;
    - write with MERGE instead of blindly appending;
    - run a test that alerts you if a key ever appears twice.

    ## Natural key vs surrogate key

    *Why invent a surrogate key when the business already has an ID?*

    - **Natural keys can change.** The business may re-code dealer D-014 as D-114. A surrogate key never changes.
    - **Different systems use different IDs.** The CRM may call a dealer D-014 while the ERP calls the same dealer 5521. One surrogate key can represent that dealer, with both codes mapped to it.
    - **Keeping history.** If you keep a new row every time a dealer's details change (called SCD Type 2, see Data modelling), the natural key D-014 appears on several rows and is no longer unique. Each version gets its own surrogate key.
    - **Speed.** Joining on small numbers is faster than joining on long text.

    **The usual design:** keep the natural key as a normal column, so people can still search "D-014", and use the surrogate key as the main key in dimension tables.

    ## What makes a good key

    A good key is **unique**, **always filled in**, **never changes**, and is **simple**. Never use things that can change, such as names, email addresses or phone numbers.

    ## Common mistakes

    - **The "unique" source key isn't unique.** India and Brazil might both have claim number 1001. Use (country, claim_no), and always **test** uniqueness rather than trusting documentation.
    - **Empty (NULL) keys** silently fail to match in joins. Reject or set aside rows with empty keys.
    - **Spaces and capital letters:** "D-014" and "d-014 " don't match. Clean values before joining.
    - **Leading zeros:** "00123" stored as a number becomes 123 and may clash with another record. Store IDs as text.
    - **A claim arrives for a dealer you don't have yet.** Don't drop it. Link it to a special "Unknown" dealer row (often key -1), or create a placeholder dealer row to fill in later, and alert someone.

    ## Interview answers

    - **"Primary vs foreign key?"** "A primary key uniquely identifies each row in its table. A foreign key is a column that points to another table's primary key, like dealer_id on a claim."
    - **"Natural vs surrogate key?"** "A natural key comes from the business, like a dealer code. A surrogate key is a generated number. I use surrogates for dimensions because they never change, they unify the same entity across systems, they support keeping history, and they make joins fast."
    - **"Your lakehouse doesn't enforce primary keys. How do you keep data unique?"** "Deduplicate before loading, write with MERGE, and run a uniqueness test that alerts on any repeated key."
  `),

  indexing: C(`
    > **In one line:** an index is an extra sorted structure that lets the database **find rows without reading the whole table**, like the index at the back of a book. Lookups become very fast, but every insert or update gets a little slower and the database takes more space.

    ## The idea

    Suppose the claims table has 200 million rows and you run:
    «««sql
    SELECT * FROM claims WHERE claim_id = 9001;
    »»»
    - **Without an index**, the database reads every row and checks each one. This is a **full table scan**, and it takes seconds to minutes.
    - **With an index on claim_id**, the database looks up 9001 in the sorted index, which points straight to the row. It answers in milliseconds.

    ## How a normal index works (B-tree), simply

    Most indexes are a **B-tree**, which works like the levels of a phone book:
    - the top level says which range of IDs lives down which branch;
    - each level below narrows the range;
    - the bottom level points to the actual rows.

    Each level holds hundreds of entries, so **about 4 levels are enough for billions of rows**. *That's why a lookup is fast even on huge tables:* it only reads a handful of small pieces.

    Because the index is **sorted**, it also speeds up ranges (BETWEEN, >, <) and sorting (ORDER BY).

    ## Indexes on several columns: order matters

    An index on (dealer_id, submitted_at) is sorted by dealer first, then by date within each dealer, like a phone book sorted by surname, then first name.
    - It **helps** WHERE dealer_id = 14.
    - It **helps** WHERE dealer_id = 14 AND submitted_at > '2026-01-01'.
    - It **doesn't help** WHERE submitted_at > '2026-01-01' alone. That's like looking someone up in a phone book by first name only.

    ## What indexes cost

    - **Every write updates every index.** A table with 10 indexes does about 10 extra writes per inserted row. *That's why you don't index every column.*
    - **They take disk space.**
    - **Big loads are faster without them.** A common trick is to drop the indexes, load the data, and rebuild them.

    **When is an index worth it?** When a query returns a **small fraction** of the table. If a query needs half the rows, reading the whole table straight through is actually cheaper than jumping around through the index.

    ## Why the database sometimes ignores your index

    - **A function is wrapped around the column.** WHERE DATE(submitted_at) = '2026-11-26' can't use an index on submitted_at. Rewrite it as a range: submitted_at >= '2026-11-26' AND submitted_at < '2026-11-27'.
    - **A wildcard at the start.** LIKE '%pump' can't use the sorted order (LIKE 'pump%' can).
    - **The filter matches most rows,** so a scan is cheaper.
    - **Out-of-date statistics** make the database misjudge the cost.

    ## How analytics systems do it instead

    Warehouses and lakehouses (Snowflake, BigQuery, Databricks) mostly **don't use these indexes**. Instead they **skip data**:
    - **Partition pruning:** data is split into folders, for example by date, and only the matching folders are read.
    - **Min/max skipping:** each file records the min and max of each column, so files that can't match are skipped.
    - **Clustering (Z-order, liquid clustering):** similar values are stored together, so more files can be skipped.

    So for a slow query, the fix in an app database is often "add an index", while in a lakehouse it is "organise the data better".

    ## Where a data engineer meets indexes

    When you pull "rows changed since last time" from a source database with WHERE updated_at > …, that column **needs an index**. Without one, every pull scans the whole production table and slows down the business app. Ask the database team for the index, or use CDC.

    ## Interview answers

    - **"What is an index and what does it cost?"** "A sorted structure, usually a B-tree, that finds rows in a few steps instead of scanning the table. It costs slower writes, because every index must be updated, plus extra storage."
    - **"Why might a query not use an index?"** "A function on the column, a leading wildcard, a filter matching most rows, or stale statistics."
    - **"How do warehouses filter fast without indexes?"** "They skip data with partitions, min/max statistics per file, and clustering."
  `),

  normal: C(`
    > **In one line:** **normalisation** stores each fact **once**, split across linked tables, so updates are safe. It is used in app databases. **Denormalisation** deliberately repeats data in fewer, wider tables, so queries need fewer joins. It is used in analytics. Each is right for its own job.

    ## The problem normalisation solves

    Imagine one table that repeats dealer details on every claim:

    | claim_id | dealer_id | dealer_name | dealer_region | amount |
    |---|---|---|---|---|
    | 9001 | 14 | Apex Motors | West | 500 |
    | 9002 | 14 | Apex Motors | West | 700 |
    | 9003 | 22 | Zen Auto | North | 300 |

    Repeating data causes three problems, called **anomalies**:
    - **Update problem:** dealer 14 moves to North. You must update all 5,000 of its claims. Miss two, and the data now says the dealer is in two regions.
    - **Insert problem:** you can't record a new dealer until they make a claim, because dealer details only exist on claim rows.
    - **Delete problem:** delete a dealer's only claim and you lose everything about that dealer.

    **The fix:** move dealer details into their own dealers table, stored once. Each claim just stores dealer_id. Changing a region now means changing one row.

    ## The normal forms (the rules)

    **First normal form (1NF): one value per cell.** No lists inside a cell. A parts column containing "P-77, P-12" breaks this. Fix: a separate table with one row per part.

    **Second normal form (2NF): depend on the whole key.** This applies when the key has several columns. In an order_lines table keyed by (order_id, line_no), a customer_name column depends only on order_id, so it repeats on every line. Fix: move it to an orders table.

    **Third normal form (3NF): depend only on the key.** A column must not depend on another non-key column. In the claims table above, dealer_region depends on dealer_id, not on the claim. Fix: move it to the dealers table.

    **Memory aid:** every column should depend on "the key, the whole key, and nothing but the key". 3NF is the usual goal for app databases.

    ## Why analytics does the opposite (denormalises)

    - **Joins are expensive at scale.** Joining 6 tables over billions of rows, spread across many machines, takes a lot of time and money.
    - **Analytics data is read far more than it's written.**
    - **A pipeline loads it in controlled batches,** so the pipeline can keep repeated copies correct.

    So analytics stores data in fewer, wider tables. The common shapes are:
    - **Star schema:** a central fact table (for example claims) surrounded by flat dimension tables (dealer, date, engine). This is the standard (see Data modelling).
    - **One big table:** everything pre-joined into one wide table for a heavy dashboard.

    | | Normalised | Denormalised |
    |---|---|---|
    | Repetition | Minimal | Deliberate |
    | Writing data | Simple and safe | The pipeline must keep copies in step |
    | Reading data | Many joins | Few joins |
    | Where it's used | App databases | Analytics, dashboards, gold tables |

    ## How it fits in a data platform

    «««flow
    App database (normalised) -> Cleaned silver tables -> Gold star schema (denormalised) -> Dashboards
    »»»
    When a dealer changes region, the pipeline updates the dealer table in one controlled step and then rebuilds the gold tables from it.

    ## Common mistakes

    - **Fan-out joins.** If each dealer has 3 contacts and you join claims to contacts, every claim appears 3 times, and summed amounts are tripled. *Always know whether a join can match more than one row.*
    - **Stale copies.** A wide table rebuilt nightly still shows yesterday's values today. Say how often it refreshes.
    - **Using the current value for old history.** If you put a dealer's current region on last year's claims, last year's regional totals change when the dealer moves. Decide deliberately (see SCD in Data modelling).

    ## Interview answers

    - **"Explain 1NF, 2NF and 3NF."** "1NF: one value per cell. 2NF: every column depends on the whole key. 3NF: no column depends on another non-key column, for example a dealer's region belongs in the dealers table, not on every claim."
    - **"Why denormalise in a warehouse?"** "Warehouses are read far more than written and loaded in controlled batches, and joins are expensive at scale, so fewer, wider tables make queries simpler and faster."
    - **"What is a fan-out join?"** "A join where one row matches several rows, which multiplies rows and inflates totals."
  `),
};
