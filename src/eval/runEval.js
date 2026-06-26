import fs from "fs/promises";
import path from "path";
import { config, hasLlmApiKey, getActiveModel } from "../config.js";
import { loadIndex } from "../ingest/indexer.js";
import { createRetriever } from "../retrieve/lexicalRetriever.js";
import { answerQuestion } from "../answer/answer.js";
import {
  docRecallAtK,
  isRefusal,
  keywordCoverage,
  summarizeEvalResults,
} from "./metrics.js";
import { estimateIndexCosts, estimateQueryCosts } from "./costModel.js";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function columnIndex(header, name) {
  return header.findIndex((col) => col.toLowerCase() === name.toLowerCase());
}

export async function loadEvalQuestions(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines[0]);

  const questionIdx = columnIndex(header, "question");
  const sourceIdx = columnIndex(header, "source docs");
  const answerableIdx = columnIndex(header, "answerable");
  const keywordsIdx = columnIndex(header, "expected keywords");
  const answerIdx = columnIndex(header, "answer");

  if (questionIdx === -1) {
    throw new Error(`CSV must include a Question column: ${filePath}`);
  }

  return lines.slice(1).map((line, index) => {
    const cols = parseCsvLine(line);
    return {
      row: index + 2,
      question: cols[questionIdx] ?? "",
      sourceDocs: sourceIdx >= 0 ? cols[sourceIdx] ?? "" : "",
      answerable: answerableIdx >= 0 ? cols[answerableIdx] ?? "yes" : "yes",
      expectedKeywords:
        keywordsIdx >= 0 ? cols[keywordsIdx] ?? "" : "",
      expectedAnswer: answerIdx >= 0 ? cols[answerIdx] ?? "" : "",
    };
  });
}

export async function runEvaluation(options = {}) {
  const csvPath =
    options.csvPath ?? path.join(config.dataDir, "eval-questions.csv");
  const useLlm = options.useLlm ?? hasLlmApiKey();
  const indexData = await loadIndex(options.indexDir ?? config.indexDir);
  const retriever = await createRetriever(indexData);
  const questions = await loadEvalQuestions(csvPath);

  const outputDir = path.join(config.indexDir, "eval-results");
  await fs.mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultsPath = path.join(outputDir, `results-${timestamp}.jsonl`);
  const summaryPath = path.join(outputDir, `summary-${timestamp}.json`);

  const records = [];

  for (const item of questions) {
    if (!item.question) continue;

    const started = performance.now();
    const retrieval = retriever.retrieve(item.question, {
      topDocs: config.topDocs,
      topChunks: config.topChunks,
    });
    const retrievalMs = performance.now() - started;

    let answer = "";
    let usage = null;
    let llmUsed = false;

    if (useLlm) {
      const result = await answerQuestion(item.question, retriever);
      answer = result.answer;
      usage = result.usage;
      llmUsed = true;
    } else if (!retrieval.chunks.length) {
      answer = "No relevant document excerpts were found using lexical retrieval.";
    } else {
      answer = "[retrieval-only mode: LLM answer skipped]";
    }

    const refused = isRefusal(answer);
    const record = {
      row: item.row,
      question: item.question,
      sourceDocs: item.sourceDocs,
      answerable: item.answerable,
      expectedKeywords: item.expectedKeywords,
      answer,
      refused,
      retrievalHit: retrieval.chunks.length > 0,
      retrievalMs,
      docRecallAt20: docRecallAtK(retrieval.documents, item.sourceDocs, 20),
      keywordCoverage: useLlm
        ? keywordCoverage(answer, item.expectedKeywords)
        : null,
      retrievedDocs: retrieval.documents.slice(0, 5),
      retrievedChunks: retrieval.chunks.map((chunk) => ({
        fileName: chunk.fileName,
        section: chunk.section,
        score: chunk.score,
      })),
      costEstimate: estimateQueryCosts(item.question, retrieval.chunks),
      usage,
      llmUsed,
    };

    records.push(record);
    await fs.appendFile(resultsPath, `${JSON.stringify(record)}\n`, "utf8");
  }

  const indexStats = {
    ...indexData.stats,
    costEstimate: estimateIndexCosts(indexData.stats),
  };
  const summary = summarizeEvalResults(records, indexStats);
  summary.meta = {
    csvPath,
    resultsPath,
    useLlm,
    model: getActiveModel(),
    provider: config.llmProvider,
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  return {
    records,
    summary,
    resultsPath,
    summaryPath,
  };
}
