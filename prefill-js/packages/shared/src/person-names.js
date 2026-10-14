// One rule, used by the backend (grouping documents by person) and the UI: are two names the same person?
// Words are compared fuzzily (Jaro-Winkler), so OCR slips like "ASHlSH" / "Ashsih" still match, order and case
// are ignored, and an initial ("A. Ranjan") matches a full word. A shared surname alone is never enough -
// family members are often nominees together.

const STRONG_WORD_SIMILARITY = 0.93;

/** Letters OCR mixes up, folded to one form before comparing (both names get the same folding). */
const foldOcrLookalikes = (word) => word.replace(/rn/g, "m").replace(/l/g, "i");

export function normalizeNameWords(personName) {
  return (personName || "").toLowerCase().replace(/[1|!]/g, "i").replace(/0/g, "o").replace(/5/g, "s").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean)
    .filter((word) => !["mr", "mrs", "ms", "miss", "dr", "shri", "smt", "kumari"].includes(word));
}

/** Jaro-Winkler similarity, 0..1 (1 = identical). Good for short strings like names; forgives transposed letters. */
export function getJaroWinklerSimilarity(firstText, secondText) {
  if (firstText === secondText) return 1;
  const firstLength = firstText.length;
  const secondLength = secondText.length;
  if (!firstLength || !secondLength) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(firstLength, secondLength) / 2) - 1);
  const firstMatched = new Array(firstLength).fill(false);
  const secondMatched = new Array(secondLength).fill(false);
  let matchCount = 0;
  for (let firstIndex = 0; firstIndex < firstLength; firstIndex += 1) {
    const windowStart = Math.max(0, firstIndex - matchWindow);
    const windowEnd = Math.min(firstIndex + matchWindow + 1, secondLength);
    for (let secondIndex = windowStart; secondIndex < windowEnd; secondIndex += 1) {
      if (secondMatched[secondIndex] || firstText[firstIndex] !== secondText[secondIndex]) continue;
      firstMatched[firstIndex] = true;
      secondMatched[secondIndex] = true;
      matchCount += 1;
      break;
    }
  }
  if (!matchCount) return 0;
  let transpositionCount = 0;
  let secondIndex = 0;
  for (let firstIndex = 0; firstIndex < firstLength; firstIndex += 1) {
    if (!firstMatched[firstIndex]) continue;
    while (!secondMatched[secondIndex]) secondIndex += 1;
    if (firstText[firstIndex] !== secondText[secondIndex]) transpositionCount += 1;
    secondIndex += 1;
  }
  const jaroSimilarity = (matchCount / firstLength + matchCount / secondLength + (matchCount - transpositionCount / 2) / matchCount) / 3;
  let sharedPrefixLength = 0;
  while (sharedPrefixLength < 4 && firstText[sharedPrefixLength] === secondText[sharedPrefixLength]) sharedPrefixLength += 1;
  return jaroSimilarity + sharedPrefixLength * 0.1 * (1 - jaroSimilarity);
}

/** How well two names line up: words matched fully (strong), and initials ("A.") matched to a full word on either side. */
function compareNameWords(firstName, secondName) {
  const firstWords = normalizeNameWords(firstName);
  const secondWords = normalizeNameWords(secondName);
  const firstUsed = new Set();
  const secondUsed = new Set();
  let strongMatchCount = 0;
  let initialMatchCount = 0;
  firstWords.forEach((firstWord, firstIndex) => {
    if (firstWord.length < 2) return;
    const secondIndex = secondWords.findIndex((secondWord, index) => !secondUsed.has(index) && secondWord.length > 1
      && getJaroWinklerSimilarity(foldOcrLookalikes(firstWord), foldOcrLookalikes(secondWord)) >= STRONG_WORD_SIMILARITY);
    if (secondIndex >= 0) { firstUsed.add(firstIndex); secondUsed.add(secondIndex); strongMatchCount += 1; }
  });
  const matchInitials = (initialWords, initialUsed, fullWords, fullUsed) => initialWords.forEach((initialWord, initialIndex) => {
    if (initialWord.length !== 1 || initialUsed.has(initialIndex)) return;
    const fullIndex = fullWords.findIndex((fullWord, index) => !fullUsed.has(index) && fullWord.length > 1 && fullWord[0] === initialWord);
    if (fullIndex >= 0) { initialUsed.add(initialIndex); fullUsed.add(fullIndex); initialMatchCount += 1; }
  });
  matchInitials(firstWords, firstUsed, secondWords, secondUsed);
  matchInitials(secondWords, secondUsed, firstWords, firstUsed);
  return { strongMatchCount, initialMatchCount, shorterWordCount: Math.min(firstWords.length, secondWords.length) };
}

export function isSamePersonName(firstName, secondName) {
  const { strongMatchCount, initialMatchCount, shorterWordCount } = compareNameWords(firstName, secondName);
  if (!shorterWordCount || !strongMatchCount) return false;
  // Every word of the shorter name must line up ("Ashish Ranjan" = "Ranjan Ashish Kumar"), and one shared word is
  // only enough when that is the whole name ("Ashish" alone).
  return strongMatchCount + initialMatchCount >= shorterWordCount && (shorterWordCount === 1 || strongMatchCount + initialMatchCount >= 2);
}
