import { config, getActiveModel } from "../config.js";
import { generateAnswerFromContext } from "./llmClient.js";

export async function generateAnswer(question, retrievalResult) {
  return generateAnswerFromContext(question, retrievalResult.chunks);
}

export async function answerQuestion(question, retriever, options = {}) {
  const retrieval = retriever.retrieve(question, {
    topDocs: options.topDocs ?? config.topDocs,
    topChunks: options.topChunks ?? config.topChunks,
  });

  if (!retrieval.chunks.length) {
    return {
      question,
      answer:
        "No relevant document excerpts were found using lexical retrieval.",
      retrieval,
      usage: null,
      model: getActiveModel(),
      provider: config.llmProvider,
    };
  }

  const llmResult = await generateAnswer(question, retrieval);

  return {
    question,
    answer: llmResult.answer,
    retrieval,
    usage: llmResult.usage,
    model: llmResult.model,
    provider: llmResult.provider,
  };
}
