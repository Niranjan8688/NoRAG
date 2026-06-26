# Evaluation Notes

Evaluation on the bundled corpus (7 PDFs, 4,915 chunks) and `data/eval-questions.csv` (15 questions: 10 answerable, 5 unanswerable).

Run:

```powershell
npm run corpus:prepare
npm run eval              # retrieval + cost (no API key required)
npm run eval -- --llm     # full pipeline (requires GOOGLE_API_KEY or OPENAI_API_KEY)
```

Latest automated run (retrieval-only): `index/eval-results/summary-2026-06-26T06-16-57-748Z.json`

---

## 1. Metrics we would use in a production eval

| Metric | Purpose |
|--------|---------|
| **Answer correctness** | Human review or LLM-as-judge against gold answers |
| **Citation accuracy** | Retrieved source matches ground-truth document |
| **Doc recall@K** | Correct document appears in top-K routed docs |
| **Chunk recall@K** | Gold passage overlaps retrieved chunks |
| **Unanswerable precision** | Out-of-corpus questions receive a refusal, not a hallucination |
| **Unanswerable recall** | In-corpus questions are not incorrectly refused |
| **Latency (retrieval / total)** | p50 / p95 query time |
| **Cost per query** | LLM tokens + retrieval infra |
| **Index cost** | One-time prepare cost vs embedding entire corpus |

For multi-doc regulatory Q&A, **doc recall@K** and **unanswerable precision** are especially important — wrong document routing or hallucinated answers on missing topics are high-severity failures.

---

## 2. Metrics implemented in this repo

| Metric | Implemented | Notes |
|--------|-------------|-------|
| Doc recall@20 | Yes | Parses `Source Docs` column (e.g. `*DPM*`) |
| Retrieval hit rate | Yes | % of questions with ≥1 retrieved chunk |
| Avg retrieval latency | Yes | BM25 only, milliseconds |
| Keyword coverage | Yes (with `--llm`) | Fraction of `Expected Keywords` found in LLM answer |
| Unanswerable refusal rate | Yes | Pattern match on refusal phrases + zero-chunk short-circuit |
| Cost estimate (lexical vs vector RAG) | Yes | Token heuristics + published API pricing |
| Index cost estimate | Yes | Embedding all chunks vs $0 lexical index |
| LLM correctness judge | No | Would need gold answers + API budget |
| Human eval UI | No | Out of scope for this deliverable |

Implementation: `src/eval/metrics.js`, `src/eval/costModel.js`, `src/eval/runEval.js`

---

## 3. Results (implemented metrics)

### Corpus

| Stat | Value |
|------|-------|
| Documents | 7 |
| Chunks | 4,915 |
| Index file | `index/corpus-index.json` (~9.8 MB) |

### Retrieval (15-question eval, no LLM)

| Metric | Result |
|--------|--------|
| **Retrieval hit rate** | **93.3%** (14/15 questions got ≥1 chunk) |
| **Doc recall@20** | **100%** (11/11 answerable questions with annotated source docs) |
| **Avg retrieval latency** | **68.9 ms** |

Doc recall@20 = 100% means that for every answerable question with a `Source Docs` hint, the correct document family (e.g. DPM, RegsNavy) appeared in the top 20 routed documents.

The one retrieval miss (**FIFA World Cup 2022**) correctly returned **zero chunks** — no lexical overlap with the corpus.

### Unanswerable questions (5)

| Question | Retrieval hit | Expected behaviour |
|----------|---------------|-------------------|
| Apple iPhone revenue Q3 2023 | Yes (false positive: “revenue” in DPM) | LLM should refuse |
| Capital of France | Yes (false positive: “capital” in DPM) | LLM should refuse |
| NVIDIA stock price 2020 | Yes | LLM should refuse |
| FIFA World Cup 2022 | **No** | Retrieval short-circuit refusal |
| Lunar base procurement in DPM | Yes (false positive: “procurement” in DPM) | LLM should refuse |

**Retrieval-only refusal rate: 20%** (1/5) — only the FIFA question had zero chunks.

This demonstrates a key finding: **lexical retrieval alone cannot reliably detect unanswerable questions** when questions share common words with the corpus. The **LLM refusal layer** (see `src/answer/answer.js` system prompt) is required for the other four cases.

Run `npm run eval -- --llm` with `GOOGLE_API_KEY` (or `OPENAI_API_KEY`) set to measure **LLM-level unanswerable precision** and **keyword coverage** on answerable questions.

### Answer quality (requires `--llm`)

Not run in the bundled automated report (no API key in CI/local default). With `--llm`, the eval reports:

- **Keyword coverage** — automated proxy for answer correctness
- **Refusal rate** on unanswerable rows using phrase detection

Recommended manual check after `--llm` eval: inspect `index/eval-results/results-*.jsonl`.

---

## 4. Cost comparison

Pricing assumptions (OpenAI, approximate):

- `gpt-4o-mini`: $0.15 / 1M input tokens, $0.60 / 1M output tokens
- `text-embedding-3-small`: $0.02 / 1M tokens

Token estimation: `ceil(characters / 4)` (same heuristic for both approaches).

### Index / prepare (one time)

| Approach | Estimated cost (4,915 chunks) |
|----------|-------------------------------|
| Vector RAG (embed all chunks) | **~$0.025** |
| **This repo (BM25 index)** | **$0.00** |

Prepare time on eval hardware: ~20 s for 7 PDFs (local `pdf-parse` + JSON index).

### Per query (12 chunks to LLM)

| Cost component | Vector RAG | Lexical BM25 (this repo) |
|----------------|------------|---------------------------|
| Query retrieval | ~$0.0000002 (query embedding) | **$0** |
| LLM input (~3.6k tokens) | ~$0.00054 | ~$0.00054 |
| LLM output (~400 tokens) | ~$0.00024 | ~$0.00024 |
| **Total per query** | **~$0.000594** | **~$0.000594** |

**Delta: ~$0.0000002/query** (~0.03% cheaper retrieval; effectively identical LLM cost).

At 1,000 queries:

| | Vector RAG | This repo |
|--|------------|-----------|
| Query cost | ~$0.59 | ~$0.59 |
| Index cost | ~$0.025 | $0 |
| **Total** | **~$0.62** | **~$0.59** |

The cost profile matches RAG because **both approaches send the same number of chunks to the LLM**. The savings are at **index time** (no embedding bill) and **retrieval** (no query embedding).

Unanswerable questions with **zero retrieval hits** cost **$0 LLM** (short-circuited before generation).

---

## 5. Interpretation and limitations

**What worked well**

- 100% doc recall@20 on annotated answerable questions — two-stage routing finds the right document family.
- Sub-100 ms retrieval — suitable for interactive Q&A at RAG-scale cost.
- Zero API spend at prepare time.

**What to watch**

- Lexical false positives on unanswerable questions sharing common terms (`revenue`, `capital`, `procurement`).
- Keyword coverage is a weak proxy for correctness on long, nuanced regulatory answers.
- No paraphrase tolerance — questions with no term overlap may miss relevant passages.

**Next steps for a production eval**

1. Run `npm run eval -- --llm` and review refusal quality on unanswerable rows.
2. Add human scoring on a 20–50 question gold set.
3. Compare against a vector RAG baseline on the **same chunk count** for fair cost comparison.
4. At hundreds of documents, tune `TOP_DOCS` and measure doc recall@K vs latency.

---

## 6. Reproducing results

```powershell
cd "c:\Users\Admin\Desktop\non RAG approach"
npm install
npm run corpus:prepare
npm run eval
```

Outputs:

- `index/eval-results/results-<timestamp>.jsonl` — per-question rows
- `index/eval-results/summary-<timestamp>.json` — aggregate metrics

Example query after prepare:

```powershell
npm run query -- "What is the procedure for registration of suppliers under DPM?"
```
