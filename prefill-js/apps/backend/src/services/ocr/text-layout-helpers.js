// Group tesseract.js's flat word list into lines by vertical position, ourselves — not relying on tesseract's
// own line/paragraph grouping, which under sparse-text PSM treats most words as their own line. A line is a run
// of words whose vertical centers overlap; within a line, words are left-to-right by x0.

function center(word) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function height(word) {
  return word.bbox.y1 - word.bbox.y0;
}

/** Split one y-cluster's words (already sorted by x0) at any gap wide enough to be a column break, not word
 * spacing. These Aadhaar scans print an English column right beside a Tamil one at the same page height, so a
 * same-row grouping that ignores horizontal distance merges two unrelated fields into one "line". Normal word
 * spacing is well under 1 word-height; a column gutter is several times that. */
function splitAtColumnGaps(words) {
  const segments = [];
  let current = [words[0]];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const w = words[i];
    const gap = w.bbox.x0 - prev.bbox.x1;
    const threshold = 4 * Math.max(height(prev), height(w), 1);
    if (gap > threshold) {
      segments.push(current);
      current = [];
    }
    current.push(w);
  }
  segments.push(current);
  return segments;
}

function finishLine(words) {
  return {
    words,
    text: words.map((w) => w.text).join(" "),
    y0: Math.min(...words.map((w) => w.bbox.y0)),
    y1: Math.max(...words.map((w) => w.bbox.y1)),
    x0: Math.min(...words.map((w) => w.bbox.x0)),
    confidence: words.reduce((s, w) => s + w.confidence, 0) / words.length,
  };
}

/** words: tesseract.js's data.words. Returns lines sorted top-to-bottom then left-to-right, each one a single
 * column's worth of text at that row (see splitAtColumnGaps). */
export function groupIntoLines(words) {
  const sorted = [...words].sort((a, b) => center(a) - center(b));
  const clusters = [];
  for (const w of sorted) {
    const c = center(w);
    const h = height(w) || 10;
    const home = clusters.find((cl) => Math.abs(cl.center - c) <= Math.max(h, cl.height) * 0.5);
    if (home) {
      home.words.push(w);
      home.center = (home.center * (home.words.length - 1) + c) / home.words.length;
      home.height = Math.max(home.height, h);
    } else {
      clusters.push({ center: c, height: h, words: [w] });
    }
  }
  const lines = [];
  for (const cl of clusters) {
    cl.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    for (const segment of splitAtColumnGaps(cl.words)) lines.push({ ...finishLine(segment), center: cl.center });
  }
  lines.sort((a, b) => a.center - b.center || a.x0 - b.x0);
  return lines;
}

/** Reconstruct rows from groupIntoLines' output: consecutive segments sharing the same row center, left to
 * right. A row only has one segment when there was no column gap on it. */
export function rowsOf(lines) {
  const rows = [];
  for (const l of lines) {
    const row = rows.length && rows[rows.length - 1][0].center === l.center ? rows[rows.length - 1] : null;
    if (row) row.push(l);
    else rows.push([l]);
  }
  return rows;
}

/** The left-most column segment of a row - the English personal-info column on these cards, as opposed to an
 * unrelated paragraph running in a column further right at the same page height. */
export function leftSegment(row) {
  return row[0];
}

/** Drop a leading token that is a single digit with no punctuation (a stray table/column index OCR picked up
 * next to a name, e.g. "3 Neha" or "1 Deshna Srinivasan" — never part of the printed field itself). */
export function stripLeadingIndexDigit(line) {
  if (line.words.length > 1 && /^\d$/.test(line.words[0].text.trim())) {
    return { ...line, words: line.words.slice(1), text: line.words.slice(1).map((w) => w.text).join(" ") };
  }
  return line;
}

/** One field's value from several OCR passes. Readings with the same letters and digits count as one answer;
 * the answer most passes agree on wins (confidence only breaks a tie) - verified on a PAN where PaddleOCR read
 * "MPEPJ8821K" at 95% while both Tesseract passes read the true "MPFPJ8821K". Within the winning answer the
 * reading that kept word spaces is used (PaddleOCR often glues words: "RAHULMEHTA" vs "RAHUL MEHTA"). */
export function pickBestReading(readings) {
  const found = readings.filter((reading) => reading?.value);
  if (!found.length) return null;
  // Grouping key only (never the value kept): letters and digits, with the classic look-alikes folded together, so
  // "S/O: SURESH" and "S/0: SURESH" count as the same answer. A real letter difference (PAN "F" vs "E") stays apart.
  const LOOK_ALIKES = { 0: "O", 1: "I", 5: "S", $: "S", 8: "B" };
  const lettersAndDigits = (value) => String(value).toUpperCase().replace(/[0158$]/g, (character) => LOOK_ALIKES[character]).replace(/[^A-Z0-9]/g, "");
  const spaceCount = (value) => (String(value).match(/\s/g) || []).length;
  const groups = new Map();
  for (const reading of found) {
    const key = lettersAndDigits(reading.value);
    groups.set(key, [...(groups.get(key) || []), reading]);
  }
  const topConfidence = (group) => Math.max(...group.map((reading) => reading.confidence ?? 0));
  // No two passes agree exactly: the reading closest to all the others (consensus), confidence breaking a tie -
  // verified on a side-by-side e-Aadhaar where PaddleOCR merged both cards at 96% and two Tesseract passes
  // each differed from the truth by one character.
  const consensus = (group) => [...groups.keys()].reduce((sum, key) => sum + similarity(key, lettersAndDigits(group[0].value)), 0);
  const winningGroup = [...groups.values()].reduce((winner, group) => {
    if (group.length !== winner.length) return group.length > winner.length ? group : winner;
    const consensusDifference = consensus(group) - consensus(winner);
    return consensusDifference > 0.01 || (Math.abs(consensusDifference) <= 0.01 && topConfidence(group) > topConfidence(winner)) ? group : winner;
  });
  // Same letters, but one reading may carry OCR specks ("Bihar - 801301, ?"): fewest specks first, then most spaces.
  // Ordinary punctuation ("MAHARASHTRA - 400006", "S/O") is not a speck.
  const strayCount = (value) => String(value).split(/[\s,]+/).filter((token) => token && !/[A-Za-z0-9]/.test(token) && /[^-/&.:]/.test(token)).length;
  const spaced = winningGroup.reduce((most, reading) => {
    const strayDifference = strayCount(reading.value) - strayCount(most.value);
    return strayDifference < 0 || (strayDifference === 0 && spaceCount(reading.value) > spaceCount(most.value)) ? reading : most;
  });
  return { ...spaced, confidence: topConfidence(winningGroup) };
}

/** 1 for equal strings, 0 for nothing in common (1 - edit distance / longer length). */
function similarity(first, second) {
  if (first === second) return 1;
  const longer = Math.max(first.length, second.length);
  if (!longer) return 1;
  let previous = Array.from({ length: second.length + 1 }, (_unused, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const current = [row];
    for (let column = 1; column <= second.length; column++) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[second.length] / longer;
}
