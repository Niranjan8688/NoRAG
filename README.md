# Document Q&A Beyond RAG

Runnable Node.js repo for **multi-document Q&A without embedding-based vector search**.

Corpus: PDFs in `data/` (Defence Procurement Manual, Navy regulations, financial delegation rules).  
Retrieval: **two-stage BM25** (lexical, not dense vectors).  
Generation: one LLM call on a small set of retrieved excerpts.

---

## Quick start

```powershell
npm install
copy .env.example .env
# set GOOGLE_API_KEY in .env (Google AI Studio key)

npm run corpus:prepare
npm run query -- "When is Integrity Pact required in procurement?"
npm run eval
npm run eval -- --llm   # full eval with LLM answers (requires API key)
```

| Step | Command | What it does |
|------|---------|--------------|
| **Prepare / index** | `npm run corpus:prepare` | Extract PDFs → structure-aware chunks → BM25 index (`index/corpus-index.json`) |
| **Query** | `npm run query -- "..."` | Route docs → retrieve chunks → LLM answer with citations |
| **Evaluate** | `npm run eval` | Run `data/eval-questions.csv`, write metrics to `index/eval-results/` |

Aliases: `npm run ingest` = `corpus:prepare`, `npm run ask` = `query`.

---

## How the approach works

```
PDF corpus
    │
    ▼  prepare (once, local CPU)
structure-aware chunks + BM25 inverted index
    │
    ▼  query (per question)
Stage 1: BM25 over document summaries  →  top ~20 docs
Stage 2: BM25 over chunks in those docs →  top ~12 excerpts
    │
    ▼
Single LLM call (gpt-4o-mini) with excerpts only
```

**Stage 1 (document routing)** scores filename, section titles, and a document preview — critical when the corpus grows to hundreds of PDFs.

**Stage 2 (chunk retrieval)** runs BM25 only inside the shortlisted documents, keeping retrieval fast and the LLM context small.

Chunking uses **headings and paragraph boundaries**, not fixed token windows, which preserves section context for regulatory documents.

---

## Why this instead of standard RAG?

| | Vector RAG | This approach (lexical BM25) |
|--|------------|------------------------------|
| Core retrieval | chunk → embed → vector DB ANN search | BM25 inverted index (keyword + TF-IDF style scoring) |
| Index build cost | API cost to embed every chunk | Local CPU only (PDF parse + index) |
| Query retrieval cost | 1 query embedding + vector lookup | BM25 lookup (milliseconds, no API) |
| LLM context | top-k chunks | same top-k chunks |
| Strengths | paraphrase, semantic similarity | exact terms, entities, numbers, acronyms, legal/regulatory language |
| Weaknesses | embedding cost, approximate neighbours | keyword overlap false positives |

We chose BM25 because:

1. It satisfies the **no vector embedding retrieval** requirement.
2. It matches **RAG-shaped query cost** (cheap retrieval + bounded LLM input).
3. It performs well on **factual document Q&A** where questions share vocabulary with the source text (procurement rules, military regulations).
4. Index preparation is **cheaper than embedding the full corpus**.

This is not “no retrieval” — it replaces dense retrieval with **sparse lexical retrieval**, which is a well-established alternative to vector RAG.

---

## Keeping per-query cost comparable to RAG

A standard RAG query costs:

1. **One cheap retrieval step** (query embed + ANN)
2. **One LLM call** on ~k chunks (~12k characters here)

We mirror that shape:

| Cost component | Vector RAG | This repo |
|----------------|------------|-----------|
| Query retrieval | ~$0.0000002 (query embed) | **$0** (local BM25) |
| LLM input | ~3.6k tokens (12 chunks + prompt) | **same** (~3.6k tokens) |
| LLM output | ~400 tokens | **same** |
| **Estimated query total** | **~$0.00059** | **~$0.00059** |

We do **not** send the full corpus to the LLM. With 7 documents / 4,915 chunks indexed, each query touches at most **20 docs → 12 chunks**.

We do **not** run the LLM over every document per question.

See `EVALUATION.md` for measured retrieval latency and cost estimates on the bundled eval set.

**Index-time cost:** embedding 4,915 chunks with `text-embedding-3-small` ≈ **$0.025 once**. Our prepare step costs **$0** in API fees (local only).

---

## Handling unanswerable questions

Unanswerable cases are handled in **two layers**:

### 1. Retrieval layer (hard stop)

If BM25 finds **no chunks above zero score**, the pipeline returns immediately:

> *"No relevant document excerpts were found using lexical retrieval."*

No LLM call is made — **zero answer-generation cost**.

### 2. Generation layer (soft stop)

When chunks are retrieved but do not actually answer the question (e.g. “Apple iPhone revenue” matching the word “revenue” in DPM), the LLM system prompt requires:

- answer **only** from provided excerpts
- **refuse** if information is insufficient
- **cite** source filenames for every claim

This catches **false-positive lexical matches** that vector RAG would also suffer from when irrelevant chunks score highly.

**Trade-off:** lexical retrieval can surface plausible-but-wrong excerpts for out-of-domain questions. The LLM refusal prompt is essential; retrieval alone is not enough for unanswerable detection.

---

## Trade-offs

| Benefit | Cost |
|---------|------|
| No embedding API at index or query time | Weaker on paraphrased questions with no lexical overlap |
| Fast BM25 (~69 ms avg on eval set) | False positives when questions share common words with unrelated sections |
| Same LLM budget as RAG | Requires good chunk boundaries for long regulatory PDFs |
| Transparent, inspectable scores | No cross-lingual semantic matching |
| Cheaper corpus indexing than vector RAG | Two-stage tuning (`TOP_DOCS`, `TOP_CHUNKS`) needed at scale |

---

## Configuration

Copy `.env.example` → `.env`:

```
GOOGLE_API_KEY=...          # from https://aistudio.google.com/apikey
GOOGLE_MODEL=gemini-2.0-flash-lite   # cheapest 2.x model; use gemini-2.0-flash for higher quality
LLM_PROVIDER=google         # optional; auto-detects from key

# Or use OpenAI instead:
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
# LLM_PROVIDER=openai

TOP_DOCS=20
TOP_CHUNKS=12
```

---

## Project layout

```
data/                  PDF corpus + eval-questions.csv
index/                 Generated corpus-index.json + eval-results/
src/
  ingest/              PDF extraction, chunking, index build
  retrieve/            BM25 + two-stage lexical retrieval
  answer/              LLM synthesis with citations
  eval/                Metrics, cost model, evaluation runner
  cli.js               prepare | query | eval
README.md              This file
EVALUATION.md          Metrics, results, cost comparison
```

---

## Evaluation

Bundled eval set: `data/eval-questions.csv` (10 answerable + 5 unanswerable).

```powershell
npm run eval              # retrieval metrics + cost estimates (no API key)
npm run eval -- --llm     # adds LLM answers + keyword coverage
```

Full write-up: **`EVALUATION.md`**.
