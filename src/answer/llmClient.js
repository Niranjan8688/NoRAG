import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config, requireLlmApiKey } from "../config.js";

const SYSTEM_PROMPT = `You answer questions using ONLY the provided document excerpts.
Rules:
- If the excerpts do not contain enough information, say you cannot find it in the provided documents.
- Cite source filenames for every factual claim.
- Be concise but complete.
- Do not invent numbers, dates, or facts not present in the excerpts.`;

async function generateWithOpenAI(userPrompt) {
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  return {
    answer: response.choices[0]?.message?.content?.trim() ?? "",
    model: config.openaiModel,
    provider: "openai",
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null,
  };
}

async function generateWithGoogle(userPrompt) {
  const genAI = new GoogleGenerativeAI(config.googleApiKey);
  const model = genAI.getGenerativeModel({
    model: config.googleModel,
    systemInstruction: SYSTEM_PROMPT,
  });

  const response = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0 },
  });

  const usage = response.response.usageMetadata;

  return {
    answer: response.response.text()?.trim() ?? "",
    model: config.googleModel,
    provider: "google",
    usage: usage
      ? {
          prompt_tokens: usage.promptTokenCount ?? 0,
          completion_tokens: usage.candidatesTokenCount ?? 0,
          total_tokens: usage.totalTokenCount ?? 0,
        }
      : null,
  };
}

export async function generateAnswerFromContext(question, chunks) {
  requireLlmApiKey();

  const context = chunks
    .map(
      (chunk, index) =>
        `[Excerpt ${index + 1}] Source: ${chunk.fileName} | Section: ${chunk.section}\n${chunk.text}`
    )
    .join("\n\n---\n\n");

  const userPrompt = `Question:\n${question}\n\nDocument excerpts:\n${context}`;

  if (config.llmProvider === "google") {
    return generateWithGoogle(userPrompt);
  }

  if (config.llmProvider === "openai") {
    return generateWithOpenAI(userPrompt);
  }

  throw new Error("No LLM provider configured.");
}
