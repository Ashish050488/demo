// Field extraction over a PAN card's OCR'd lines (same groupIntoLines/rowsOf as src/aadhaar.js). Every
// function returns {value, confidence} or null; nothing here guesses when the evidence isn't there.
// The PAN NUMBER itself is never logged or written to disk by this module - callers (server/uploadRoutes.js)
// hold it in memory only; see that file's own note on exactly where and when it's cleared.
import { rowsOf } from "./layout.js";

const PAN_PATTERN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const NAME_LABEL_RE = /\bName\b/i;
const FATHER_LABEL_RE = /Father.?s\s*Name/i;
const DOB_LABEL_RE = /\b(DOB|Date\s+of\s+Birth)\b/i;
const DATE_RE = /\b(\d{2}[\/-]\d{2}[\/-]\d{4})\b/;
const NAME_CANDIDATE_RE = /^[A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){0,3}$/;

function avgConf(words) {
  return words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : null;
}

// PAN's format is rigid - positions 0-4 are always letters, 5-8 always digits, 9 always a letter - so a
// 10-character candidate can be corrected for the classic OCR digit/letter confusions (0/O, 1/I, 5/S, 8/B)
// using ONLY what the position already requires, never a free guess at an unrelated character.
const LETTER_FOR_DIGIT = { 0: "O", 1: "I", 5: "S", 8: "B" };
const DIGIT_FOR_LETTER = { O: "0", I: "1", S: "5", B: "8", Z: "2" };
function normalizePanCandidate(raw) {
  if (raw.length !== 10) return null;
  const chars = [...raw];
  for (let i = 0; i < chars.length; i++) {
    const wantLetter = i < 5 || i === 9;
    const c = chars[i];
    if (wantLetter && /\d/.test(c)) chars[i] = LETTER_FOR_DIGIT[c] || c;
    else if (!wantLetter && /[A-Z]/.test(c)) chars[i] = DIGIT_FOR_LETTER[c] || c;
  }
  const candidate = chars.join("");
  return PAN_PATTERN_RE.test(candidate) ? candidate : null;
}

/** Scans every word (not whole lines - the PAN number usually sits alone on its own line, but being
 * word-level means a little OCR noise around it doesn't block the match) for the PAN pattern, with the
 * confusion-correction above as a fallback before giving up on a 10-character candidate. */
export function findPanNumber(lines) {
  for (const line of lines) {
    for (const w of line.words) {
      const clean = w.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (PAN_PATTERN_RE.test(clean)) return { value: clean, confidence: w.confidence };
      const corrected = normalizePanCandidate(clean);
      if (corrected) return { value: corrected, confidence: w.confidence };
    }
  }
  return null;
}

/** Up to 3 rows after a label row (not just the next one - a bilingual label like "नाम / Name" can OCR into
 * several noisy rows before the real value, confirmed against a real card), the first that looks like a real
 * name (>=2 letters per word - same floor as src/aadhaar.js's name check). `excludeRe` skips a label row that
 * would otherwise also match `labelRe` - "Father's Name" contains the word "Name", so without this a missing
 * "Name" row could be mistaken for one. */
function findLabelledValue(rows, labelRe, excludeRe) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i][0]; // PAN cards are single-column - no leftSegment needed
    if (excludeRe && excludeRe.test(row.text)) continue;
    if (!labelRe.test(row.text)) continue;
    for (let ahead = 1; ahead <= 3; ahead++) {
      const next = rows[i + ahead] && rows[i + ahead][0];
      if (!next) break;
      const text = next.text.trim();
      if (!NAME_CANDIDATE_RE.test(text)) continue;
      return { value: text, confidence: avgConf(next.words) };
    }
    return null; // found the label but nothing nearby looked like a real value - don't keep scanning further labels
  }
  return null;
}

export function findPanName(lines) {
  return findLabelledValue(rowsOf(lines), NAME_LABEL_RE, FATHER_LABEL_RE);
}

export function findPanFatherName(lines) {
  return findLabelledValue(rowsOf(lines), FATHER_LABEL_RE);
}

export function findPanDob(lines) {
  const rows = rowsOf(lines);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i][0];
    if (!DOB_LABEL_RE.test(row.text)) continue;
    const here = row.text.match(DATE_RE);
    if (here) return { value: here[1], confidence: avgConf(row.words) };
    const next = rows[i + 1] && rows[i + 1][0];
    if (next) {
      const there = next.text.match(DATE_RE);
      if (there) return { value: there[1], confidence: avgConf(next.words) };
    }
  }
  return null;
}

export function extractPanFields(lines) {
  return {
    panNumber: findPanNumber(lines),
    name: findPanName(lines),
    fatherName: findPanFatherName(lines),
    dob: findPanDob(lines),
  };
}

/** First 2 + last 1 characters visible, the rest masked - the only form a PAN number is ever allowed to reach
 * the browser or a log line in. */
export function maskPan(panNumber) {
  if (!panNumber || panNumber.length < 4) return null;
  return panNumber.slice(0, 2) + "*".repeat(panNumber.length - 3) + panNumber.slice(-1);
}
