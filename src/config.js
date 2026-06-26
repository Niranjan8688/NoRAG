import dotenv from "dotenv";

dotenv.config();

function pickProvider() {
  const explicit = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  if (explicit === "google" || explicit === "gemini") return "google";
  if (explicit === "openai") return "openai";

  const googleKey =
    process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";

  if (googleKey) return "google";
  if (openaiKey) return "openai";
  return "none";
}

export const config = {
  dataDir: process.env.DATA_DIR ?? "data",
  indexDir: process.env.INDEX_DIR ?? "index",
  llmProvider: pickProvider(),
  googleApiKey:
    process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY ?? "",
  googleModel: process.env.GOOGLE_MODEL ?? "gemini-2.0-flash-lite",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  topDocs: Number(process.env.TOP_DOCS ?? 20),
  topChunks: Number(process.env.TOP_CHUNKS ?? 12),
  maxChunkChars: Number(process.env.MAX_CHUNK_CHARS ?? 1200),
  minChunkChars: Number(process.env.MIN_CHUNK_CHARS ?? 200),
};

export function getActiveModel() {
  return config.llmProvider === "google"
    ? config.googleModel
    : config.openaiModel;
}

export function hasLlmApiKey() {
  return config.llmProvider !== "none";
}

export function requireLlmApiKey() {
  if (config.llmProvider === "google" && config.googleApiKey) return;
  if (config.llmProvider === "openai" && config.openaiApiKey) return;

  throw new Error(
    "No LLM API key found. Set GOOGLE_API_KEY (or GEMINI_API_KEY) in .env, " +
      "or OPENAI_API_KEY for OpenAI. Copy .env.example to .env first."
  );
}

// Backward-compatible alias
export function requireApiKey() {
  requireLlmApiKey();
}
