import fs from "fs/promises";
import path from "path";
import { config } from "../config.js";
import { extractPdfText, listPdfFiles } from "./pdfExtractor.js";
import { buildDocumentRecord, chunkDocument } from "./chunker.js";

export async function ingestCorpus(options = {}) {
  const dataDir = options.dataDir ?? config.dataDir;
  const indexDir = options.indexDir ?? config.indexDir;
  const pdfFiles = await listPdfFiles(dataDir);

  if (!pdfFiles.length) {
    throw new Error(
      `No PDF files found in ${path.resolve(dataDir)}. Add PDFs and run ingest again.`
    );
  }

  const documents = [];
  const chunks = [];

  for (const filePath of pdfFiles) {
    const text = await extractPdfText(filePath);
    const fileName = path.basename(filePath);
    const docId = fileName.replace(/\.pdf$/i, "");
    const docChunks = chunkDocument(text, docId, {
      maxChunkChars: config.maxChunkChars,
      minChunkChars: config.minChunkChars,
    });
    const docRecord = buildDocumentRecord(filePath, text, docChunks);

    documents.push(docRecord);
    chunks.push(
      ...docChunks.map((chunk) => ({
        ...chunk,
        fileName: docRecord.fileName,
        searchText: `[${docRecord.fileName}] [${chunk.section}] ${chunk.text}`,
      }))
    );
  }

  await fs.mkdir(indexDir, { recursive: true });

  const indexPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    stats: {
      documentCount: documents.length,
      chunkCount: chunks.length,
    },
    documents: documents.map((doc) => ({
      docId: doc.docId,
      fileName: doc.fileName,
      charCount: doc.charCount,
      chunkCount: doc.chunkCount,
      sections: doc.sections,
      textForIndex: doc.textForIndex,
    })),
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      docId: chunk.docId,
      fileName: chunk.fileName,
      chunkIndex: chunk.chunkIndex,
      section: chunk.section,
      preview: chunk.preview,
      searchText: chunk.searchText,
      text: chunk.text,
    })),
  };

  const indexPath = path.join(indexDir, "corpus-index.json");
  await fs.writeFile(indexPath, JSON.stringify(indexPayload, null, 2), "utf8");

  return {
    indexPath,
    documentCount: documents.length,
    chunkCount: chunks.length,
  };
}

export async function loadIndex(indexDir = config.indexDir) {
  const indexPath = path.join(indexDir, "corpus-index.json");
  const raw = await fs.readFile(indexPath, "utf8");
  return JSON.parse(raw);
}

export async function indexExists(indexDir = config.indexDir) {
  try {
    await fs.access(path.join(indexDir, "corpus-index.json"));
    return true;
  } catch {
    return false;
  }
}
