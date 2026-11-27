const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== File formats
  fileformats: T(`
    > **In one line:** the file format decides how data is **laid out in bytes**: text or binary, row or column, with or without a schema, splittable or not, compressible or not. The right format can make the same query 10-100× cheaper. Rule of thumb: **CSV/JSON to exchange, Avro to stream, Parquet (inside Delta/Iceberg) to analyse.**

    ## The formats
    ### CSV
    - Plain text, one row per line, comma (or other) separated, optional header.
    - **Pros:** human-readable, universal.
    - **Cons:** no types (everything is text), no schema, quoting/escaping/newline-in-field problems, delimiter collisions, encodings, no compression by default, must parse every byte, slow and large.
    - **Use:** exchange with partners, small exports, landing raw files you receive.

    ### JSON / JSON Lines
    - Text, self-describing, nested objects and arrays. **JSON Lines** (NDJSON) = one JSON object per line, which makes files splittable and streamable.
    - **Pros:** flexible, nested, readable, every API speaks it.
    - **Cons:** repeats field names in every record (large), no enforced types, slow to parse, type drift.
    - **Use:** API payloads, events, raw landing.

    ### Avro
    - **Binary, row-oriented, with a schema** (JSON-defined) stored in the file header or in a schema registry.
    - **Pros:** compact, fast to write and read whole records, **strong schema evolution** rules (defaults, aliases), splittable.
    - **Cons:** not human-readable; row layout is poor for analytical scans.
    - **Use:** Kafka messages, streaming ingestion, data exchange between services, write-heavy landing.

    ### Parquet
    - **Binary, columnar**, schema in the footer, organised in **row groups** → **column chunks** → **pages**, with **min/max statistics** and encodings (dictionary, RLE, delta) plus compression (Snappy/ZSTD/GZIP).
    - **Pros:** read only needed columns, excellent compression, predicate pushdown, splittable by row group, nested types supported, universal in big data.
    - **Cons:** expensive to write row by row; files are immutable (updates mean rewrites); needs a table format for ACID.
    - **Use:** analytics at rest; the storage under Delta Lake and Iceberg.

    ### ORC
    - Columnar, similar to Parquet, from the Hive world (stripes, indexes, Bloom filters). Strong in Hive/Presto; Parquet is more widespread elsewhere.

    ### Table formats on top: Delta Lake, Iceberg, Hudi
    Not file formats but **metadata layers over Parquet files**: transaction log, schema, snapshots, statistics. "We store data in Delta" means "Parquet files plus a Delta log". (Covered in the cloud section.)

    ## Comparison
    | | CSV | JSON | Avro | Parquet | ORC |
    |---|---|---|---|---|---|
    | Layout | Row text | Row text | Row binary | Columnar | Columnar |
    | Schema | None | Implicit | Explicit, evolvable | Explicit (footer) | Explicit |
    | Types | No | Weak | Yes | Yes | Yes |
    | Nested data | No | Yes | Yes | Yes | Yes |
    | Compression | Poor (external) | Poor (external) | Good | Excellent | Excellent |
    | Splittable | Yes (uncompressed or bzip2) | JSON Lines only | Yes | Yes | Yes |
    | Best at | Exchange | APIs, events | Streaming, writes | Analytics reads | Analytics in Hive |

    ## "Splittable" and why it matters
    Distributed engines read big files in parallel by giving each worker a byte range. That only works if a worker can start reading in the middle:
    - Uncompressed CSV/JSON Lines: yes (find the next newline).
    - **GZIP-compressed CSV: not splittable**: one 50 GB «.csv.gz» is read by **one** task. Classic performance killer. Split the file, or use bzip2 (splittable but slow), or convert to Parquet.
    - Parquet/Avro/ORC: splittable by design (row groups, sync markers, stripes), whatever the codec.
    - One giant JSON array file: not splittable.

    ## Choosing in a pipeline
    «««flow
    Source export (CSV/JSON) -> Land raw as received (bronze) -> Convert to Parquet/Delta with enforced schema (silver) -> Gold Delta tables -> Exports in whatever the consumer needs
    »»»
    Kafka in the middle uses Avro (or Protobuf/JSON with a registry) on the wire.

    ## Edge cases and what goes wrong
    - **CSV parsing:** commas inside quoted fields, newlines inside fields, «"» escaping, a trailing delimiter, mixed line endings, a BOM at the start, non-UTF-8 encodings, thousands separators («1,250.00»), and dates like 03/04/2026 (March or April?). Always specify delimiter, quote, escape, encoding, header, date format and a **schema**; never rely on inference for production.
    - **Schema inference** reads a sample and guesses types; a column that is numeric in the sample and has text later fails or nulls out.
    - **Parquet type mismatch across files:** one file has «amount» as INT, another as DOUBLE; reading them together fails or needs merging.
    - **Timestamps in Parquet:** INT96 vs INT64 timestamps, time zones (UTC-normalised or local), precision (millis vs micros) differ between writers.
    - **Many small Parquet files:** footer and metadata overhead dominates. Compact.
    - **Decimal precision:** Parquet decimals with different precision across files.

    ## How interviewers test this
    - "Why Parquet for analytics?" Columnar, compression, statistics, pushdown, splittable.
    - "Parquet vs Avro?" Columnar for reads vs row for writes/streaming with strong schema evolution.
    - "A Spark job reading a single 40 GB .csv.gz runs on one core. Why?" GZIP is not splittable.
  `, {
    check: [
      mcq('A Spark job reading one 40 GB «.csv.gz» file uses only one task. Why?', ['Spark limits CSV reading', 'GZIP is not splittable, so one task must decompress the whole file', 'The cluster is too small', 'CSV has no schema'], 1, 'Split the file, use a splittable format, or convert to Parquet once.'),
      match('Match the format to its best use.', [['CSV', 'Exchanging small files with partners'], ['Avro', 'Kafka messages with schema evolution'], ['Parquet', 'Analytical tables at rest'], ['JSON Lines', 'Streamable, splittable API/event dumps']], 'Exchange, stream, analyse.'),
      tf('Delta Lake is a file format that replaces Parquet.', false, 'Delta is a table format: Parquet data files plus a transaction log.'),
      multi('Which CSV settings should you set explicitly in a production read?', ['Schema (column names and types)', 'Delimiter, quote and escape characters', 'Encoding', 'Date/timestamp format'], [0, 1, 2, 3], 'Inference and defaults break on real-world files.'),
    ],
    hands: [
      py({ q: 'Real CSV is messy. Write «parse_amount(s)» that turns text amounts into a **float** or **None**: strip spaces; remove a leading currency symbol «₹», «$» or «€»; remove thousands separators (commas); treat «""», «"NA"», «"null"» and «"-"» (any case) as **None**; values in parentheses like «"(120.50)"» are **negative** (accounting style). Anything still not a number → raise «ValueError» (so it gets quarantined, not silently zeroed).', starter: 'def parse_amount(s):\n    pass\n',
        tests: `assert parse_amount('1,250.00') == 1250.0
assert parse_amount(' ₹ 980 ') == 980.0
assert parse_amount('$12') == 12.0
assert parse_amount('(120.50)') == -120.5
assert parse_amount('') is None and parse_amount('NA') is None and parse_amount('null') is None and parse_amount('-') is None
assert parse_amount('-5') == -5.0
try:
    parse_amount('12abc'); raise AssertionError('must raise')
except ValueError:
    pass`,
        solution: `def parse_amount(s):
    t = s.strip()
    if t.lower() in ('', 'na', 'null', '-'):
        return None
    neg = t.startswith('(') and t.endswith(')')
    if neg:
        t = t[1:-1].strip()
    if t[:1] in ('₹', '$', '€'):
        t = t[1:].strip()
    t = t.replace(',', '')
    v = float(t)
    return -v if neg else v` }),
    ],
  }),

  // ================================================================== Compression
  compression: T(`
    > **In one line:** compression makes data smaller so it costs less to **store** and, more importantly, less to **read and move**. You trade CPU time for fewer bytes. Columnar formats compress in two layers: **encodings** that exploit column patterns, then a **codec** (Snappy, ZSTD, GZIP) on top.

    ## Why it matters more than people think
    In big data, the slowest parts are reading from storage and sending over the network. Reading 100 GB that compresses to 15 GB means 85% less I/O. CPUs decompress faster than disks and networks deliver, so compression usually makes queries **faster**, not just cheaper. In pay-per-scan engines (BigQuery), it directly cuts the bill.

    ## Layer 1: encodings (structure-aware)
    | Encoding | How | Best for |
    |---|---|---|
    | **Dictionary** | Store each distinct value once; data becomes small integer codes | Low/medium cardinality: status, region, model |
    | **Run-length (RLE)** | «value × count» | Long runs of repeats, especially after sorting |
    | **Delta** | Store differences between consecutive values | Timestamps, increasing IDs |
    | **Bit-packing** | Use only the bits needed (values 0-7 need 3 bits) | Small integers, dictionary codes |
    Parquet applies these automatically per column chunk. **Sorting** data by low-cardinality columns before writing makes RLE and dictionary dramatically better.

    ## Layer 2: codecs (general-purpose)
    | Codec | Ratio | Speed | Splittable alone? | Typical use |
    |---|---|---|---|---|
    | **Snappy** | Moderate | Very fast | No (but fine inside Parquet/Avro) | Default for Parquet in Spark; hot data |
    | **ZSTD** | High | Fast (tunable levels) | No (fine inside containers) | Modern default choice; good balance |
    | **LZ4** | Moderate | Fastest | No | Kafka, real-time paths |
    | **GZIP** | High | Slow | **No** | Text files, archives, web |
    | **bzip2** | High | Very slow | Yes | Rare; archival text |
    Inside Parquet/ORC/Avro the codec is applied per block/page, so the **file stays splittable** whatever the codec. The splittability problem only bites on **whole-file** compression of text (one big «.csv.gz»).

    ## How to choose
    - Hot, frequently queried data: Snappy or ZSTD (low level).
    - Cold/archive data: ZSTD high level or GZIP; CPU cost paid once, storage saved forever.
    - Streaming (Kafka): LZ4 or ZSTD at the producer with batching (compression works on batches of messages; bigger batches compress better).
    - Text exchange files: GZIP is universal, but split large files into many parts (e.g. 256 MB each) so they can be read in parallel.

    ## Trade-offs
    - **CPU vs I/O:** stronger compression costs CPU on write (and some on read). Usually worth it for data read many times.
    - **Write once, read many:** spend CPU at write time for smaller, faster reads.
    - **Already-compressed data** (images, video, encrypted data) does not compress further; do not waste CPU.

    ## Edge cases and what goes wrong
    - **Unsplittable giant gzip file** reduces a 100-core cluster to one core.
    - **Compressing tiny files:** codec overhead and metadata dominate; compression ratio is poor. Fix file sizes first.
    - **Encryption before compression:** encrypted bytes look random and do not compress. Compress first, then encrypt (formats like Parquet handle this with modular encryption).
    - **High-cardinality random strings** (UUIDs, hashes) compress badly; consider storing them as binary or questioning whether you need them.
    - **Memory explosion:** a 1 GB compressed file can be 10 GB in memory. Size executors for decompressed data.

    ## How interviewers test this
    - "Snappy vs GZIP vs ZSTD?" Speed vs ratio; ZSTD as balanced modern default; GZIP for text exchange.
    - "Why is compression faster, not just smaller?" I/O and network are the bottleneck; CPUs decompress quickly.
    - "Is Snappy-compressed Parquet splittable?" Yes: compression is per page/row group inside the file.
  `, {
    check: [
      mcq('Is a Snappy-compressed Parquet file splittable across Spark tasks?', ['No, Snappy is never splittable', 'Yes: compression is applied per page inside row groups, so the file is still split by row group', 'Only if under 128 MB', 'Only with GZIP'], 1, 'Container formats keep splittability; whole-file text compression does not.'),
      mcq('Which change usually improves Parquet compression of a «region» column the most?', ['Shuffling rows randomly', 'Sorting or clustering data by region before writing, so dictionary and RLE encodings get long runs', 'Using CSV', 'Adding more columns'], 1, 'Order creates runs; runs compress extremely well.'),
      tf('Compressing data usually makes analytical queries slower because of decompression CPU cost.', false, 'Usually faster: I/O and network dominate, and decompression is cheap relative to reading more bytes.'),
      mcq('Should you compress before or after encrypting?', ['After', 'Before: encrypted data looks random and does not compress', 'It does not matter', 'Never compress sensitive data'], 1, 'Compress, then encrypt.'),
    ],
  }),
};
