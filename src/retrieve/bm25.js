import { tokenize } from "./tokenizer.js";

const K1 = 1.5;
const B = 0.75;

function termFrequency(tokens, term) {
  return tokens.filter((t) => t === term).length;
}

export class BM25Index {
  constructor(documents = []) {
    this.documents = documents;
    this.avgDocLength = 0;
    this.docFreq = new Map();
    this.docTokens = [];
    this.rebuild();
  }

  rebuild() {
    this.docTokens = this.documents.map((doc) => tokenize(doc.text));
    const totalLength = this.docTokens.reduce((sum, tokens) => sum + tokens.length, 0);
    this.avgDocLength = this.docTokens.length
      ? totalLength / this.docTokens.length
      : 0;

    this.docFreq = new Map();
    for (const tokens of this.docTokens) {
      for (const term of new Set(tokens)) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      }
    }
  }

  idf(term) {
    const df = this.docFreq.get(term) ?? 0;
    if (df === 0) return 0;
    return Math.log(1 + (this.documents.length - df + 0.5) / (df + 0.5));
  }

  scoreDocument(docIndex, queryTerms) {
    const tokens = this.docTokens[docIndex];
    if (!tokens.length) return 0;

    const docLength = tokens.length;
    let score = 0;

    for (const term of queryTerms) {
      const tf = termFrequency(tokens, term);
      if (tf === 0) continue;

      const numerator = tf * (K1 + 1);
      const denominator =
        tf + K1 * (1 - B + (B * docLength) / (this.avgDocLength || 1));
      score += this.idf(term) * (numerator / denominator);
    }

    return score;
  }

  search(query, topK = 10, queryTerms = null) {
    const terms = queryTerms ?? [...new Set(tokenize(query))];
    if (!terms.length || !this.documents.length) return [];

    const scored = this.documents.map((doc, index) => ({
      doc,
      index,
      score: this.scoreDocument(index, terms),
    }));

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  toJSON() {
    return {
      documents: this.documents,
    };
  }

  static fromJSON(data) {
    return new BM25Index(data.documents ?? []);
  }
}
