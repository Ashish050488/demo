// Field extraction over an Aadhaar card's OCR'd lines (already grouped by position and split at column
// gutters - see layout.js). Every function returns {value, confidence} or null; nothing here guesses when the
// evidence isn't there.
import { stripLeadingIndexDigit, rowsOf, leftSegment } from "./layout.js";

const DOB_LABEL_RE = /\b(DOB|Date\s+of\s+Birth)\b/i;
const DATE_RE = /\b(\d{2}[\/-]\d{2}[\/-]\d{4})\b/;
const NOISE_WORDS = /^(government|india|male|female|unique|identification|authority|of|dob|address|mobile)$/i;
// Each word needs >=2 letters - this is what should have rejected a single stray misread character (e.g.
// "E") being accepted as a name; confirmed against a real card where that happened (OCR found nothing on the
// true name row in one pass, and the only other candidate nearby was a single garbled letter with 0
// confidence, which the old {0,} regex happily accepted as a one-word name).
const NAME_CANDIDATE_RE = /^[A-Za-z]{2,}(?:\s+[A-Za-z]{2,}){0,3}$/;

function wordsMatching(line, re) {
  return line.words.filter((w) => re.test(w.text));
}

function avgConf(words) {
  return words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : null;
}

/** The personal-info column's rows, left segment only - drops a benefits paragraph that happens to run at the
 * same page height in a column further right (see layout.js's rowsOf/leftSegment). */
function personalInfoRows(lines) {
  return rowsOf(lines).map(leftSegment);
}

export function findDob(lines) {
  const rows = personalInfoRows(lines);
  for (let i = 0; i < rows.length; i++) {
    if (!DOB_LABEL_RE.test(rows[i].text)) continue;
    const here = rows[i].text.match(DATE_RE);
    if (here) {
      const w = wordsMatching(rows[i], DATE_RE);
      return { value: here[1], confidence: avgConf(w) ?? rows[i].confidence, row: i };
    }
    const next = rows[i + 1];
    if (next) {
      const there = next.text.match(DATE_RE);
      if (there) {
        const w = wordsMatching(next, DATE_RE);
        return { value: there[1], confidence: avgConf(w) ?? next.confidence, row: i + 1 };
      }
    }
  }
  return null;
}

export function findName(lines, dobRowIndex) {
  const rows = personalInfoRows(lines);
  if (dobRowIndex == null) return null;
  // Up to 4 rows above DOB, not 2 - "the text block between the photo/heading and the DOB line" can have a
  // blank/garbled OCR row in between on a real phone photo; each candidate is independently validated by
  // NAME_CANDIDATE_RE (>=2 letters/word) before being accepted, so widening this doesn't widen what's accepted.
  for (let back = 1; back <= 4; back++) {
    const idx = dobRowIndex - back;
    if (idx < 0) break;
    const row = stripLeadingIndexDigit(rows[idx]);
    const text = row.text.trim();
    if (!text || !NAME_CANDIDATE_RE.test(text)) continue;
    if (NOISE_WORDS.test(text)) continue;
    if (text.split(/\s+/).some((w) => NOISE_WORDS.test(w))) continue;
    return { value: text, confidence: avgConf(row.words) };
  }
  return null;
}

const AADHAAR_LABEL_RE = /Aadhaar\s*No/i;
const TWELVE_DIGIT_RE = /\b(\d{4})\s(\d{4})\s(\d{4})\b/;
const MASKED_LAST4_RE = /X{3,4}\s+X{3,4}\s+(\d{4})\b/i;

function last4From(line) {
  const m = line.text.match(TWELVE_DIGIT_RE);
  if (!m) return null;
  const digitWord = [...line.words].reverse().find((w) => /^\d{4}$/.test(w.text));
  return { value: m[3], confidence: digitWord?.confidence ?? line.confidence };
}

// Current e-Aadhaar/PVC cards print the number pre-masked, "XXXX XXXX 1234" - trust that literal pattern
// first. Matched against the whole line's text, not per-word: Tesseract tokenizes "XXXX"/"XXXX"/"1234" as
// separate words (joined with spaces into the same line.text anyway), but PaddleOCR's detector returns one
// combined string per line with no separate word tokens, so a per-word check would silently never match it.
// A line that still prints the full 12 digits unmasked is only ever read when it sits on (or right after) a
// line explicitly labelled "Aadhaar No", and never on a line labelled "VID" (a different, 16-digit number
// printed on the same card). Either way we only ever keep the last 4 digits - the other 8 are never captured
// into a variable we might print or log.
export function findAadhaarLast4(lines) {
  for (const line of lines) {
    if (/VID/i.test(line.text)) continue;
    const m = line.text.match(MASKED_LAST4_RE);
    if (!m) continue;
    const digitWord = [...line.words].reverse().find((w) => /^\d{4}$/.test(w.text));
    return { value: m[1], confidence: digitWord?.confidence ?? line.confidence, source: "masked on card" };
  }
  for (let i = 0; i < lines.length; i++) {
    if (!AADHAAR_LABEL_RE.test(lines[i].text) || /VID/i.test(lines[i].text)) continue;
    const here = last4From(lines[i]);
    if (here) return { ...here, source: "unmasked, read from the labelled line" };
    const next = lines[i + 1];
    if (next && !/VID/i.test(next.text)) {
      const there = last4From(next);
      if (there) return { ...there, source: "unmasked, read from the line under the label" };
    }
  }
  return null;
}

// "C/O" alone missed real cards that print "S/O"/"D/O" instead, or that print an "Address:" heading with
// the care-of line following it rather than starting on it - confirmed against a real Aadhaar back photo
// whose address block (several lines, printed clearly) was entirely missed because it starts "S/O:", not
// "C/O". "Address" itself is the most universal anchor (every Aadhaar back/full card prints it), tried first;
// C/O or S/O (without a preceding "Address" line already matched) is the fallback for a crop that excludes
// the heading.
const ADDRESS_START_RE = /^Address\s*:?$|^Address\s*:/i;
const CARE_OF_START_RE = /^[CS]\s*\/\s*O\b/i;

export function findAddress(lines) {
  const rows = personalInfoRows(lines);
  let start = rows.findIndex((r) => ADDRESS_START_RE.test(r.text.trim()));
  if (start !== -1) {
    // "Address:" is a heading, not itself part of the value - the real text starts on the next row unless
    // this row has more after the label (e.g. "Address: 12 Example St").
    const afterLabel = rows[start].text.trim().replace(ADDRESS_START_RE, "").trim();
    if (!afterLabel) start += 1;
  } else {
    start = rows.findIndex((r) => CARE_OF_START_RE.test(r.text.trim()));
  }
  if (start === -1 || start >= rows.length) return null;
  // The address block must never run on into whatever comes after it on the card - confirmed against a real
  // back photo where, with no "Mobile" label to stop at, it ran all the way into the card's own printed
  // Aadhaar number (a SEPARATE, often-unmasked line elsewhere on the back - sometimes split across two OCR
  // lines rather than one, so stripping to digits-only and counting is more robust than matching an exact
  // "dddd dddd dddd" grouping) and tagline text. Both are explicit stop points now, not just a row-count cap
  // - this field has no masking of its own (unlike id_aadhaar_last4/id_details), so a full Aadhaar number
  // must never be able to reach it at all.
  const hasLongDigitRun = (text) => text.replace(/\D/g, "").length >= 8;
  const stopPatterns = [/^Mobile\b/i, /MERA\s+AADHAAR/i, /\bAADHAAR\b.{0,3}\bMERI\b/i];
  let end = rows.findIndex((r, i) => {
    if (i <= start) return false;
    const text = r.text.trim();
    return hasLongDigitRun(text) || stopPatterns.some((re) => re.test(text));
  });
  if (end === -1) end = Math.min(rows.length, start + 8);
  // Defense in depth: also drop any individual row within the block that itself looks like a long number or
  // the tagline, in case one slipped in before the stop point above (e.g. two separate rows of the same
  // number, only the second of which triggered the stop).
  const block = rows.slice(start, end).filter((r) => {
    const text = r.text.trim();
    return !hasLongDigitRun(text) && !stopPatterns.some((re) => re.test(text));
  });
  const value = block.map((r) => r.text.trim()).filter(Boolean).join(", ");
  if (!value) return null;
  return { value, confidence: avgConf(block.flatMap((r) => r.words)) };
}

// Cheap, label-based: the printed "MALE"/"FEMALE"/"TRANSGENDER" word, wherever it sits on the card. Checked
// as a whole word so "MALE" doesn't also match inside "FEMALE" from a different branch of the regex.
const GENDER_RE = /\b(FEMALE|TRANSGENDER|MALE)\b/i;
export function findGender(lines) {
  for (const line of lines) {
    const m = line.text.match(GENDER_RE);
    if (!m) continue;
    const word = line.words.find((w) => GENDER_RE.test(w.text));
    const upper = m[1].toUpperCase();
    const value = upper === "FEMALE" ? "F" : upper === "MALE" ? "M" : "T";
    return { value, confidence: word?.confidence ?? line.confidence };
  }
  return null;
}

export function extractFields(lines) {
  const dob = findDob(lines);
  const name = findName(lines, dob ? dob.row : null);
  const aadhaarLast4 = findAadhaarLast4(lines);
  const address = findAddress(lines);
  const gender = findGender(lines);
  return {
    name: name ? { value: name.value, confidence: name.confidence } : null,
    dob: dob ? { value: dob.value, confidence: dob.confidence } : null,
    address,
    aadhaarLast4,
    gender,
  };
}
