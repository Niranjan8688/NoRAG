const GPT4O_MINI_INPUT_PER_1M = 0.15;
const GPT4O_MINI_OUTPUT_PER_1M = 0.6;
const EMBEDDING_SMALL_PER_1M = 0.02;

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateLlmCost(inputTokens, outputTokens = 400) {
  const inputCost = (inputTokens / 1_000_000) * GPT4O_MINI_INPUT_PER_1M;
  const outputCost = (outputTokens / 1_000_000) * GPT4O_MINI_OUTPUT_PER_1M;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputUsd: inputCost,
    outputUsd: outputCost,
    totalUsd: inputCost + outputCost,
  };
}

export function estimateQueryCosts(question, chunks, options = {}) {
  const systemPromptTokens = options.systemPromptTokens ?? 120;
  const outputTokens = options.outputTokens ?? 400;
  const questionTokens = estimateTokens(question);
  const contextTokens = chunks.reduce(
    (sum, chunk) => sum + estimateTokens(chunk.text ?? chunk.body ?? ""),
    0
  );
  const llmInputTokens = systemPromptTokens + questionTokens + contextTokens + 40;

  const lexical = estimateLlmCost(llmInputTokens, outputTokens);
  const queryEmbeddingTokens = questionTokens;
  const embeddingUsd =
    (queryEmbeddingTokens / 1_000_000) * EMBEDDING_SMALL_PER_1M;

  const vectorRag = {
    ...estimateLlmCost(llmInputTokens, outputTokens),
    embeddingTokens: queryEmbeddingTokens,
    embeddingUsd,
    totalUsd: lexical.totalUsd + embeddingUsd,
  };

  return {
    model: options.model ?? "gpt-4o-mini",
    chunkCount: chunks.length,
    lexical,
    vectorRag,
    deltaUsd: vectorRag.totalUsd - lexical.totalUsd,
  };
}

export function estimateIndexCosts(stats) {
  const avgChunkChars = 1000;
  const chunkTokens = stats.chunkCount * Math.ceil(avgChunkChars / 4);
  const embeddingUsd = (chunkTokens / 1_000_000) * EMBEDDING_SMALL_PER_1M;

  return {
    chunkCount: stats.chunkCount,
    documentCount: stats.documentCount,
    vectorRagIndexUsd: embeddingUsd,
    lexicalIndexUsd: 0,
    note:
      "Lexical index build is local CPU only. Vector RAG index cost assumes text-embedding-3-small over all chunks once.",
  };
}
