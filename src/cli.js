import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";
import { ingestCorpus, indexExists, loadIndex } from "./ingest/indexer.js";
import { createRetriever } from "./retrieve/lexicalRetriever.js";
import { answerQuestion } from "./answer/answer.js";
import { runEvaluation } from "./eval/runEval.js";

function printUsage() {
  console.log(`
Document Q&A Beyond RAG

Prepare (index corpus):
  npm run corpus:prepare

Query:
  npm run query -- "Your question here"

Evaluate:
  npm run eval
  npm run eval -- --llm
  npm run eval -- data/eval-questions.csv

Legacy aliases:
  npm run ingest
  npm run ask -- "..."

Environment:
  Copy .env.example to .env and set GOOGLE_API_KEY (or OPENAI_API_KEY)
`);
}

async function ensureIndex() {
  if (!(await indexExists())) {
    console.log("Index not found. Running prepare first...\n");
    const result = await ingestCorpus();
    console.log(
      `Indexed ${result.documentCount} documents, ${result.chunkCount} chunks.\n`
    );
  }
}

async function runPrepare() {
  const result = await ingestCorpus();
  console.log("Prepare complete.");
  console.log(`Documents: ${result.documentCount}`);
  console.log(`Chunks:    ${result.chunkCount}`);
  console.log(`Index:     ${result.indexPath}`);
}

async function runQuery(questionParts) {
  const question = questionParts.join(" ").trim();
  if (!question) {
    throw new Error('Provide a question: npm run query -- "What is ...?"');
  }

  await ensureIndex();
  const indexData = await loadIndex();
  const retriever = await createRetriever(indexData);
  const result = await answerQuestion(question, retriever);

  console.log("\nQuestion:");
  console.log(result.question);
  console.log("\nRetrieved documents:");
  for (const doc of result.retrieval.documents.slice(0, 5)) {
    console.log(`  - ${doc.fileName} (score ${doc.score.toFixed(3)})`);
  }
  console.log("\nRetrieved chunks:");
  for (const chunk of result.retrieval.chunks) {
    console.log(
      `  - ${chunk.fileName} | ${chunk.section} (score ${chunk.score.toFixed(3)})`
    );
  }
  console.log("\nAnswer:\n");
  console.log(result.answer);

  if (result.usage) {
    console.log("\nToken usage:");
    console.log(`  prompt: ${result.usage.prompt_tokens}`);
    console.log(`  completion: ${result.usage.completion_tokens}`);
  }
}

async function runEval(args) {
  const useLlm = args.includes("--llm");
  const fileArg = args.find((arg) => !arg.startsWith("--"));
  const csvPath = fileArg ?? path.join(config.dataDir, "eval-questions.csv");

  await ensureIndex();

  console.log(`Evaluating ${csvPath}`);
  console.log(`Mode: ${useLlm ? "retrieval + LLM" : "retrieval-only"}\n`);

  const { summary, summaryPath, resultsPath } = await runEvaluation({
    csvPath,
    useLlm,
  });

  console.log("Evaluation summary");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nDetailed rows: ${resultsPath}`);
  console.log(`Summary JSON:  ${summaryPath}`);
}

async function main() {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "prepare":
      case "ingest":
        await runPrepare();
        break;
      case "query":
      case "ask":
        await runQuery(args);
        break;
      case "eval":
        await runEval(args);
        break;
      default:
        printUsage();
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
