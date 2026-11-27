const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== ML basics
  ml: T(`
    > **In one line:** machine learning builds **models that learn patterns from data** to make predictions or find structure. **Supervised** learning learns from labelled examples (predict failure: yes/no); **unsupervised** finds structure without labels (cluster engines by behaviour, detect anomalies). **Training** builds the model from historical data; **inference** applies it to new data.

    ## The main types
    | Type | Learns from | Examples at an engine maker |
    |---|---|---|
    | **Supervised: classification** | Labelled categories | Will this engine fail in 30 days? Is this claim likely fraudulent? |
    | **Supervised: regression** | Labelled numbers | Remaining useful life (days), expected repair cost |
    | **Unsupervised: clustering** | No labels | Group engines by duty cycle |
    | **Unsupervised: anomaly detection** | Mostly normal data | Unusual vibration patterns |
    | **Time-series forecasting** | Past values | Parts demand next quarter |
    | **Reinforcement learning** | Rewards from actions | Rare in data engineering contexts |
    | **Deep learning / foundation models** | Large data, neural networks | Image defect detection, LLMs |

    ## The ML lifecycle (and where data engineers fit)
    «««flow
    Business problem -> Data collection and labelling -> Feature engineering -> Train/validate/test split -> Training -> Evaluation -> Deployment (batch or real-time inference) -> Monitoring (drift, performance) -> Retraining
    »»»
    Data engineers own most of the **data** steps: reliable sources, labels, feature pipelines, point-in-time correct training sets, scoring pipelines (batch inference writes predictions to tables), and monitoring data drift. **MLOps** is the discipline of running this reliably (MLflow, feature stores, model registry, CI/CD for models).

    ## Training vs inference
    | | Training | Inference |
    |---|---|---|
    | When | Periodically (weekly, on drift) | Every prediction: batch nightly or real-time |
    | Data | Large historical, labelled | New, unlabelled |
    | Compute | Heavy, offline | Light per prediction; latency matters in real time |
    | DE concern | Reproducible, leakage-free training sets | Same feature logic, fresh features, scalable scoring |

    ## Evaluation basics you should be able to say
    - Split data into **train / validation / test**; for time-series, split **by time** (train on past, test on future), never randomly.
    - Classification metrics: **precision** (of predicted failures, how many were real), **recall** (of real failures, how many we caught), F1, ROC-AUC. With rare failures, accuracy is misleading (99% accuracy by always predicting "no failure").
    - Regression: MAE, RMSE.
    - **Overfitting:** great on training data, poor on new data.

    ## Edge cases and what goes wrong
    - **Leakage** (future data in features, labels derived from features).
    - **Training-serving skew** (different feature logic).
    - **Data drift** (sensor firmware change shifts readings) and **concept drift** (new engine models fail differently).
    - **Label quality** (warranty claims as a proxy for failure miss failures that were not claimed).

    ## How interviewers test this
    - "Supervised vs unsupervised with examples?"
    - "Training vs inference: what does the data engineer provide for each?"
    - "Why split time-series data by time?"
  `, {
    check: [
      match('Match the problem to the ML type.', [['Predict if an engine fails within 30 days', 'Supervised classification'], ['Predict remaining useful life in days', 'Supervised regression'], ['Group engines by usage pattern without labels', 'Unsupervised clustering'], ['Flag unusual vibration', 'Anomaly detection']], 'Know the families.'),
      mcq('Failures are 1% of engine-days. A model that always predicts "no failure" has 99% accuracy. Which metric reveals it is useless?', ['Accuracy', 'Recall on failures (it catches 0%)', 'Training time', 'Number of features'], 1, 'With imbalanced classes, look at precision and recall.'),
      tf('For time-series data, a random train/test split is the best choice.', false, 'Split by time so the model is tested on the future, like in production.'),
    ],
  }),

  // ================================================================== Features
  features: T(`
    > **In one line:** **features** are the input variables a model learns from (engine age, average oil pressure last 7 days); the **label** is what it predicts (failed within 30 days). **Feature engineering** turns raw data into informative, correctly-timed features. For data engineers, it is mostly **SQL/Spark pipelines with strict point-in-time logic**.

    ## Typical feature types
    | Type | Examples |
    |---|---|
    | Static attributes | Engine model, plant, horsepower, build month |
    | Aggregates over windows | Avg/max temperature last 24 h, 7 d, 30 d; count of fault codes last 7 d |
    | Trends and changes | Slope of oil pressure over 14 days; delta vs previous week |
    | Ratios | Hours at high load / total hours |
    | Recency | Days since last service; days since last fault |
    | Counts from other domains | Previous claims on this engine; claims for this part across the fleet |
    | Encoded categories | One-hot or target encoding of model/region |
    | Text/embeddings | Embedding of technician notes |

    ## Building a training set (the as-of pattern)
    1. Define the **prediction time** for each example (e.g. each engine at each day 00:00).
    2. Compute features using **only data with timestamps < prediction time** (window functions over past rows; SCD2 lookups as of that date).
    3. Compute the **label** from data **after** prediction time (failure in the next 30 days).
    4. Store as a feature table keyed by (entity, timestamp); version it.
    5. For serving, compute the same features with the same code on current data.

    ## Feature stores
    Systems (Databricks Feature Engineering in Unity Catalog, Feast, SageMaker Feature Store, Vertex) that store feature tables, provide **point-in-time joins** for training, **online stores** for low-latency serving, lineage from features to models, and reuse across teams.

    ## Edge cases and what goes wrong
    - **Leakage:** using a window that includes the prediction day's later readings, or a status updated after the failure.
    - **Late data:** features computed before late readings arrived differ from the backfilled training set.
    - **Missing values:** sensors offline: fill with sentinel, impute, or add "missing" indicators; never silently zero.
    - **High-cardinality categories** (engine_id as a feature) cause overfitting.
    - **Expensive features** that cannot be computed in time for real-time inference.

    ## How interviewers test this
    - "How do you build a training dataset without leakage?" As-of pattern.
    - "What is a feature store and why use one?"
  `, {
    check: [
      mcq('For a prediction made at 2026-11-01 00:00, which feature is leakage?', ['Average temperature 2026-10-25 to 2026-10-31', 'Count of fault codes on 2026-11-05', 'Engine horsepower', 'Days since last service as of 2026-10-31'], 1, 'Anything after the prediction time is future information.'),
      tf('A feature store helps reuse features and gives point-in-time correct training sets and online serving.', true, 'It reduces skew and duplicated work.'),
      mcq('Sensors were offline for 2 days. Best way to represent that in features?', ['Fill with 0 silently', 'Use an explicit missing indicator and a documented imputation strategy', 'Drop the engine forever', 'Copy another engine\'s data'], 1, 'Missingness can itself be informative.'),
    ],
    hands: [
      sql({ q: '**Point-in-time features.** For each engine, compute features **as of 2026-11-20 00:00** from «sensor_readings» using only readings **before** that moment and within the **previous 7 days**: «readings», «avg_temp» (1 dp), «max_temp». Return «engine_id, readings, avg_temp, max_temp» sorted by «engine_id». Engines with no readings in the window should not appear.', tables: ['sensor_readings'], level: 2, allowEmpty: true,
        solution: `SELECT engine_id, COUNT(*) AS readings, ROUND(AVG(temperature_c), 1) AS avg_temp, MAX(temperature_c) AS max_temp
FROM sensor_readings
WHERE ts >= '2026-11-13 00:00:00' AND ts < '2026-11-20 00:00:00'
GROUP BY engine_id
ORDER BY engine_id;`,
        hint: 'Filter ts >= 7 days before AND ts < the as-of time (strictly before), then aggregate per engine.' }),
    ],
  }),

  // ================================================================== GenAI basics
  genai: T(`
    > **In one line:** **generative AI** models (large language models, LLMs) generate text, code or images from prompts. They are trained on huge corpora, know nothing about your company unless you **give them your data** at question time, can be **wrong confidently** (hallucinate), and their usefulness in an enterprise depends mostly on **data quality, retrieval and governance**: data engineering work.

    ## Key concepts
    | Concept | Meaning |
    |---|---|
    | **LLM** | A neural network trained to predict the next token; foundation of chat assistants |
    | **Token** | A chunk of text (~¾ of a word); models have a **context window** (max tokens per request) and pricing per token |
    | **Prompt** | Instructions + context + question sent to the model |
    | **Hallucination** | Plausible but false output |
    | **Grounding** | Supplying trusted data (documents, query results) so answers are based on it |
    | **RAG** | Retrieval-augmented generation: retrieve relevant chunks, put them in the prompt (next topic) |
    | **Fine-tuning** | Further training on your examples to change style/behaviour; not the usual way to add knowledge |
    | **Embeddings** | Vectors representing meaning, used for semantic search |
    | **Agents / tool use** | LLMs that call tools (SQL, APIs) in steps to complete tasks |
    | **Text-to-SQL** | LLM writes SQL over your schema; quality depends on metadata/semantic models |
    | **Guardrails** | Filters and policies for safety, PII, allowed topics |
    | **Evaluation** | Test sets and metrics to measure answer quality, faithfulness and retrieval accuracy |

    ## Where data engineers fit in GenAI
    - Prepare **knowledge assets**: clean, chunked, enriched, permission-aware documents (manuals, service bulletins, past repair notes).
    - Build **ingestion and refresh pipelines** for vector indexes.
    - Provide **semantic models and rich metadata** for text-to-SQL and analytics assistants.
    - **Govern:** PII scrubbing, access control, audit logs of prompts/answers, export-control restrictions.
    - **Evaluate and monitor:** datasets of questions/answers, quality metrics, cost per query.
    - Use LLMs **inside pipelines**: classification of free-text claims, extraction of fields from PDFs, summarisation, with validation and confidence thresholds.

    ## Risks and limits
    Hallucinations, outdated knowledge, prompt injection (malicious text in documents instructing the model), data leakage through prompts, cost at scale, non-determinism, bias.

    ## How interviewers test this
    - "How can GenAI use our company data without training a new model?" RAG / grounding with governed data.
    - "What does a data engineer contribute to a GenAI use case?" Knowledge asset pipelines, metadata, governance, evaluation.
    - "What is a hallucination and how do you reduce it?" Grounding, retrieval quality, citations, evaluation, guardrails.
  `, {
    check: [
      mcq('The usual way to let an LLM answer questions about your service manuals is…', ['Retrain the model from scratch', 'Retrieval-augmented generation: retrieve relevant manual chunks and include them in the prompt', 'Fine-tune on one manual', 'Ask it without context'], 1, 'RAG grounds answers in your data without retraining.'),
      tf('An LLM\'s answer quality on enterprise questions depends heavily on the quality and governance of the data it is given.', true, 'Garbage in, confident garbage out.'),
      mcq('What is prompt injection?', ['A faster prompt', 'Malicious or untrusted text (e.g. inside a document) that tries to make the model ignore its instructions', 'A token limit', 'A fine-tuning method'], 1, 'Treat retrieved content as data, not instructions.'),
    ],
  }),

  // ================================================================== RAG, embeddings, vector DBs
  rag: T(`
    > **In one line:** **RAG** retrieves the most relevant pieces of your own content for a question and gives them to an LLM to answer from. Retrieval uses **embeddings** (vectors that capture meaning) stored in a **vector database/index** that finds the nearest vectors fast. The pipeline that keeps that index clean, fresh and permission-aware is data engineering.

    ## The two pipelines
    **Ingestion (offline, data engineering):**
    «««flow
    Documents (PDF, HTML, tickets) -> Extract text (+OCR) -> Clean and split into chunks -> Enrich with metadata and permissions -> Embed each chunk -> Store vectors + text + metadata in a vector index
    »»»
    **Query (online):**
    «««flow
    User question -> Embed question -> Vector search (top-k similar chunks, filtered by metadata/permissions) -> Optional re-ranking -> Prompt = instructions + chunks + question -> LLM answer with citations
    »»»

    ## Embeddings
    - A model turns text into a vector (e.g. 768 or 1,536 numbers); texts with similar meaning have vectors close together (cosine similarity).
    - "Coolant leak at pump" and "water pump seal failure" end up near each other even without shared words.
    - **Same embedding model** must be used for documents and queries; changing the model means **re-embedding everything**.

    ## Vector search
    - Exact nearest neighbour over millions of vectors is slow; **approximate nearest neighbour (ANN)** indexes (HNSW graphs, IVF) trade a little accuracy for speed.
    - Stores: Databricks Vector Search, Azure AI Search, pgvector (PostgreSQL), Pinecone, Weaviate, Milvus, Elasticsearch/OpenSearch, MongoDB Atlas Vector Search.
    - **Hybrid search** (keyword BM25 + vector) and **re-ranking** improve precision, especially for part numbers and codes that embeddings handle poorly.

    ## Chunking decisions
    | Choice | Trade-off |
    |---|---|
    | Chunk size (e.g. 300-800 tokens) | Small: precise but loses context; large: more context but noisier and costlier |
    | Overlap (10-20%) | Avoids cutting answers across boundaries |
    | Structure-aware splitting | Split on headings/sections/tables instead of fixed lengths |
    | Metadata per chunk | Source, section, engine model, date, version, security labels for filtering and citations |

    ## Keeping it correct and safe
    - **Incremental refresh:** detect changed/deleted documents (hash of content), re-embed only those, delete stale chunks.
    - **Permissions:** filter retrieval by the user's access (document ACLs propagated to chunks).
    - **PII and sensitive data:** scrub or exclude; export-controlled documents restricted.
    - **Evaluation:** a test set of questions with expected source documents and answers; measure retrieval hit rate (e.g. Hit@5), answer faithfulness and relevance; regression-test changes to chunking or models. (Your Strata project's Hit@5 evaluation is exactly this.)
    - **Monitoring:** unanswered questions, low-similarity retrievals, user feedback, cost per query.

    ## Edge cases and what goes wrong
    - Duplicate or outdated document versions retrieved instead of the current one: include version/date metadata and filter.
    - Tables and diagrams lost in PDF extraction.
    - Codes and part numbers missed by pure vector search: use hybrid search.
    - Prompt injection hidden in documents.
    - Re-embedding cost after switching models.

    ## How interviewers test this
    - "Explain RAG end to end." Two pipelines above.
    - "How do you keep a vector index up to date and secure?"
    - "How do you evaluate a RAG system?" Retrieval metrics (Hit@k, MRR) and answer quality with a labelled question set.
  `, {
    check: [
      order('Order the RAG ingestion pipeline.', ['Extract text from documents', 'Clean and split into chunks', 'Enrich chunks with metadata and permissions', 'Embed each chunk', 'Store in a vector index'], 'Then the query pipeline retrieves and generates.'),
      mcq('You switch to a new embedding model. What must happen?', ['Nothing', 'Re-embed all documents, because query and document vectors must come from the same model', 'Only new documents use it', 'Delete the LLM'], 1, 'Vectors from different models are not comparable.'),
      mcq('Users search for part number «P-77-1043» and get irrelevant results. What helps?', ['Bigger chunks', 'Hybrid search (keyword + vector) and re-ranking', 'A larger LLM', 'Removing metadata'], 1, 'Embeddings struggle with exact codes.'),
      tf('Retrieval should be filtered by the user\'s permissions so they never see chunks from documents they cannot access.', true, 'Security must survive chunking.'),
    ],
    hands: [
      py({ q: 'Write the two core RAG building blocks in plain Python. «chunk(text, size, overlap)» splits a list of words (use «text.split()») into chunks of «size» words where each chunk starts «size - overlap» words after the previous one; return chunks as strings joined by spaces; the last chunk may be shorter; return «[]» for empty text; raise «ValueError» if «overlap >= size». «top_k(query_vec, items, k)»: «items» is a list of «(id, vector)»; return the ids of the «k» items with the highest **cosine similarity** to «query_vec», best first (ties: smaller id first).', starter: 'import math\n\ndef chunk(text, size, overlap):\n    pass\n\ndef top_k(query_vec, items, k):\n    pass\n',
        tests: `t = 'a b c d e f g'
assert chunk(t, 3, 1) == ['a b c', 'c d e', 'e f g'], chunk(t, 3, 1)
assert chunk('a b c d', 3, 0) == ['a b c', 'd']
assert chunk('', 3, 1) == []
try:
    chunk('a b', 2, 2); raise AssertionError('must raise')
except ValueError:
    pass
items = [('x', [1, 0]), ('y', [0, 1]), ('z', [1, 1]), ('w', [2, 0])]
assert top_k([1, 0.1], items, 2) == ['w', 'x'], top_k([1, 0.1], items, 2)
assert top_k([0, 1], items, 1) == ['y']`,
        solution: `import math

def chunk(text, size, overlap):
    if overlap >= size:
        raise ValueError('overlap must be smaller than size')
    words = text.split()
    out, step, i = [], size - overlap, 0
    while i < len(words):
        out.append(' '.join(words[i:i + size]))
        if i + size >= len(words):
            break
        i += step
    return out

def _cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0

def top_k(query_vec, items, k):
    scored = sorted(items, key=lambda it: (-_cos(query_vec, it[1]), it[0]))
    return [i for i, _ in scored[:k]]` }),
    ],
  }),
};
