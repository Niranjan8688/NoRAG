import { BM25Index } from "./bm25.js";
import { expandQueryTokens, tokenize } from "./tokenizer.js";

function buildDocIndexDocuments(indexData) {
  return indexData.documents.map((doc) => ({
    id: doc.docId,
    docId: doc.docId,
    fileName: doc.fileName,
    text: doc.textForIndex,
  }));
}

function buildChunkIndexDocuments(indexData) {
  return indexData.chunks.map((chunk) => ({
    id: chunk.id,
    docId: chunk.docId,
    fileName: chunk.fileName,
    section: chunk.section,
    chunkIndex: chunk.chunkIndex,
    preview: chunk.preview,
    text: chunk.searchText,
    body: chunk.text,
  }));
}

export class LexicalRetriever {
  constructor(indexData) {
    this.indexData = indexData;
    this.docIndex = new BM25Index(buildDocIndexDocuments(indexData));
    this.chunkIndex = new BM25Index(buildChunkIndexDocuments(indexData));
    this.chunksByDoc = new Map();

    for (const chunk of indexData.chunks) {
      const list = this.chunksByDoc.get(chunk.docId) ?? [];
      list.push(chunk);
      this.chunksByDoc.set(chunk.docId, list);
    }
  }

  retrieve(question, options = {}) {
    const topDocs = options.topDocs ?? 20;
    const topChunks = options.topChunks ?? 12;
    const queryTerms = expandQueryTokens(tokenize(question));

    const rankedDocs = this.docIndex.search(question, topDocs, queryTerms);
    const allowedDocIds = new Set(rankedDocs.map((item) => item.doc.docId));

    const chunkCandidates = this.chunkIndex.documents.filter((chunk) =>
      allowedDocIds.has(chunk.docId)
    );

    const scopedChunkIndex = new BM25Index(chunkCandidates);
    const rankedChunks = scopedChunkIndex.search(
      question,
      topChunks * 2,
      queryTerms
    );

    const deduped = [];
    const seen = new Set();

    for (const item of rankedChunks) {
      if (seen.has(item.doc.id)) continue;
      seen.add(item.doc.id);
      deduped.push({
        id: item.doc.id,
        docId: item.doc.docId,
        fileName: item.doc.fileName,
        section: item.doc.section,
        chunkIndex: item.doc.chunkIndex,
        score: item.score,
        text: item.doc.body,
        preview: item.doc.preview,
      });
      if (deduped.length >= topChunks) break;
    }

    return {
      queryTerms,
      documents: rankedDocs.map((item) => ({
        docId: item.doc.docId,
        fileName: item.doc.fileName,
        score: item.score,
      })),
      chunks: deduped,
    };
  }
}

export async function createRetriever(indexData) {
  return new LexicalRetriever(indexData);
}
