const REFUSAL_PATTERNS = [
  /cannot find/i,
  /can't find/i,
  /do not contain enough/i,
  /does not contain enough/i,
  /not found in the provided/i,
  /no relevant document excerpts/i,
  /insufficient information/i,
  /not present in the excerpts/i,
  /unable to answer/i,
];

export function isRefusal(answer) {
  if (!answer) return true;
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(answer));
}

export function parseSourceDocPatterns(sourceDocs) {
  if (!sourceDocs) return [];

  return sourceDocs
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\*|\*$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

export function docRecallAtK(retrievedDocs, sourceDocs, k = 20) {
  const patterns = parseSourceDocPatterns(sourceDocs);
  if (!patterns.length) return null;

  const topDocs = retrievedDocs.slice(0, k).map((doc) => doc.docId.toLowerCase());
  const hit = patterns.some((pattern) =>
    topDocs.some(
      (docId) => docId.includes(pattern) || pattern.includes(docId)
    )
  );

  return hit ? 1 : 0;
}

export function keywordCoverage(answer, expectedKeywords) {
  if (!expectedKeywords) return null;

  const keywords = expectedKeywords
    .split(/[|;]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  if (!keywords.length) return null;

  const normalizedAnswer = (answer ?? "").toLowerCase();
  const hits = keywords.filter((keyword) => normalizedAnswer.includes(keyword));
  return {
    score: hits.length / keywords.length,
    hits,
    total: keywords.length,
  };
}

export function summarizeEvalResults(records, indexStats) {
  const withDocRecall = records.filter((record) => record.docRecallAt20 !== null);
  const answerable = records.filter(
    (record) => String(record.answerable).toLowerCase() !== "no"
  );
  const unanswerable = records.filter(
    (record) => String(record.answerable).toLowerCase() === "no"
  );
  const withKeywords = records.filter(
    (record) => record.keywordCoverage !== null
  );

  const avg = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return {
    questionCount: records.length,
    corpus: indexStats,
    retrieval: {
      hitRate: avg(records.map((record) => (record.retrievalHit ? 1 : 0))),
      avgRetrievalMs: avg(records.map((record) => record.retrievalMs)),
      docRecallAt20: avg(withDocRecall.map((record) => record.docRecallAt20)),
      docRecallSampleSize: withDocRecall.length,
    },
    answers: {
      llmEvaluated: records.filter((record) => record.llmUsed).length,
      keywordCoverage: avg(
        withKeywords.map((record) => record.keywordCoverage.score)
      ),
      keywordSampleSize: withKeywords.length,
    },
    unanswerable: {
      count: unanswerable.length,
      refusalRate: unanswerable.length
        ? avg(
            unanswerable.map((record) =>
              record.refused || record.retrievalHit === false ? 1 : 0
            )
          )
        : null,
    },
    answerable: {
      count: answerable.length,
      answeredRate: answerable.length
        ? avg(answerable.map((record) => (record.refused ? 0 : 1)))
        : null,
    },
    cost: {
      avgLexicalQueryUsd: avg(
        records.map((record) => record.costEstimate?.lexical?.totalUsd ?? 0)
      ),
      avgVectorRagQueryUsd: avg(
        records.map((record) => record.costEstimate?.vectorRag?.totalUsd ?? 0)
      ),
      index: indexStats?.costEstimate ?? null,
    },
  };
}
