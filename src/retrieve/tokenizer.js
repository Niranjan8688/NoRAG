const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
  "will", "with", "what", "when", "where", "which", "who", "whom", "why",
  "how", "do", "does", "did", "have", "had", "this", "these", "those", "they",
  "them", "their", "there", "been", "being", "or", "not", "but", "if", "than",
  "then", "so", "such", "into", "over", "under", "between", "during", "before",
  "after", "above", "below", "up", "down", "out", "about", "against", "can",
  "could", "should", "would", "may", "might", "must", "shall", "also", "any",
  "all", "each", "few", "more", "most", "other", "some", "no", "nor", "only",
  "own", "same", "too", "very", "just", "our", "your", "his", "her", "she",
  "him", "we", "you", "me", "my", "i",
]);

export function tokenize(text) {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s$%.-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function uniqueTokens(text) {
  return [...new Set(tokenize(text))];
}

export function expandQueryTokens(tokens) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) continue;

    if (token.endsWith("ies") && token.length > 4) {
      expanded.add(token.slice(0, -3) + "y");
    } else if (token.endsWith("s") && token.length > 3) {
      expanded.add(token.slice(0, -1));
    }

    if (token.endsWith("ing") && token.length > 5) {
      expanded.add(token.slice(0, -3));
    }
  }

  return [...expanded];
}
