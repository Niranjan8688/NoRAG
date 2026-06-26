import path from "path";
import { uniqueTokens } from "../retrieve/tokenizer.js";

const HEADING_PATTERNS = [
  /^item\s+\d+[a-z.]?\s/i,
  /^part\s+[ivx\d]+\s/i,
  /^table of contents$/i,
  /^notes to consolidated/i,
  /^management['’]?s discussion/i,
];

function looksLikeHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (HEADING_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (/^[A-Z0-9][A-Z0-9\s,&/-]{4,}$/.test(trimmed) && trimmed.length < 80) {
    return true;
  }
  if (/^\d+(\.\d+)*\s+[A-Z]/.test(trimmed) && trimmed.length < 100) {
    return true;
  }
  return false;
}

function splitIntoBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let currentHeading = "Document";
  let buffer = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) {
      blocks.push({ heading: currentHeading, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (looksLikeHeading(line)) {
      flush();
      currentHeading = line.trim();
      continue;
    }
    buffer.push(line);
  }

  flush();
  return blocks;
}

function splitLongText(text, maxChars) {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current.trim());

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let start = 0;
    while (start < paragraph.length) {
      chunks.push(paragraph.slice(start, start + maxChars).trim());
      start += maxChars;
    }
    current = "";
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function mergeSmallChunks(parts, minChars, maxChars) {
  const merged = [];
  let pending = "";

  for (const part of parts) {
    const candidate = pending ? `${pending}\n\n${part}` : part;
    if (candidate.length < minChars) {
      pending = candidate;
      continue;
    }

    if (candidate.length <= maxChars) {
      merged.push(candidate);
      pending = "";
      continue;
    }

    if (pending) merged.push(pending);
    pending = part;
  }

  if (pending) {
    if (merged.length && merged[merged.length - 1].length + pending.length <= maxChars) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${pending}`;
    } else {
      merged.push(pending);
    }
  }

  return merged;
}

export function chunkDocument(text, docId, options) {
  const { maxChunkChars, minChunkChars } = options;
  const blocks = splitIntoBlocks(text);
  const chunks = [];
  let chunkIndex = 0;

  for (const block of blocks) {
    const parts = splitLongText(block.body, maxChunkChars);
    const merged = mergeSmallChunks(parts, minChunkChars, maxChunkChars);

    for (const part of merged) {
      chunks.push({
        id: `${docId}::${chunkIndex}`,
        docId,
        chunkIndex,
        section: block.heading,
        text: part,
        preview: part.slice(0, 240),
        tokens: uniqueTokens(`${block.heading} ${part}`),
      });
      chunkIndex += 1;
    }
  }

  if (!chunks.length && text.trim()) {
    chunks.push({
      id: `${docId}::0`,
      docId,
      chunkIndex: 0,
      section: "Document",
      text: text.trim(),
      preview: text.trim().slice(0, 240),
      tokens: uniqueTokens(text),
    });
  }

  return chunks;
}

export function buildDocumentRecord(filePath, text, chunks) {
  const fileName = path.basename(filePath);
  const docId = fileName.replace(/\.pdf$/i, "");
  const sectionTitles = [...new Set(chunks.map((chunk) => chunk.section))];
  const preview = text.slice(0, 3000);

  return {
    docId,
    fileName,
    filePath,
    charCount: text.length,
    chunkCount: chunks.length,
    textForIndex: [
      fileName,
      docId,
      sectionTitles.join(" "),
      preview,
    ].join("\n"),
    sections: sectionTitles,
  };
}
