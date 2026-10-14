// Passport and Driving Licence: recognise the document and pull out its number, name, DOB and address.
// Same contract as src/pan.js - every finder returns {value, confidence} or null, never a guess.
//
// Passport: the machine-readable zone (MRZ, the two "<<<" lines at the bottom of the photo page) is the most
// reliable source - fixed-width, check-digit protected, and printed in an OCR-friendly font. The printed
// "Passport No." label is a fallback when the MRZ is cropped out. The back page (address page) has no MRZ;
// it's recognised by its "File No." / "Name of Father" labels and contributes the address.
// Driving Licence: Indian DL numbers are SS-RR-YYYY-NNNNNNN (state code, RTO code, year issued, serial),
// printed with or without spaces/dashes; older cards drop the year. Read only next to a DL label, or when the
// shape alone is unambiguous.

const DATE_RE = /\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/;
const NAME_CANDIDATE_RE = /^[A-Za-z][A-Za-z.]{1,}(?:\s+[A-Za-z][A-Za-z.]{1,}){0,4}$/;

const avg = (words) => (words.length ? words.reduce((s, w) => s + w.confidence, 0) / words.length : null);
const conf = (line) => line.confidence ?? avg(line.words || []) ?? 0;
const fmtDate = (m) => `${m[1]}/${m[2]}/${m[3]}`;

// ---------- classification ----------
const PASSPORT_RE = /\bPASSPORT\b|REPUBLIC\s+OF\s+INDIA|P<IND|\bFile\s*No\b|Name\s+of\s+Father/i;
const DL_RE = /DRIVING\s+LICEN[CS]E|\bDL\s*No\b|Licen[cs]e\s*No|Transport\s+Department|\bCOV\b|Class\s+of\s+Vehicle|Valid\s+Till|\bUNION\s+OF\s+INDIA\b/i;

export function looksLikePassport(rawText) {
  const t = rawText || "";
  return /P<IND/.test(t.replace(/\s/g, "")) || (PASSPORT_RE.test(t) && /PASSPORT|File\s*No/i.test(t));
}
export function looksLikeDrivingLicence(rawText) {
  const t = rawText || "";
  return /DRIVING\s+LICEN[CS]E/i.test(t) || (DL_RE.test(t) && Boolean(findDlNumberInText(t)));
}

// ---------- passport ----------
function mrzLines(lines) {
  return lines
    .map((l) => ({ line: l, t: l.text.replace(/\s/g, "").toUpperCase().replace(/[«‹]/g, "<") }))
    .filter((x) => x.t.length >= 30 && (x.t.match(/</g) || []).length >= 3);
}

function mrzDate(yymmdd, pivotFuture) {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const nowYY = new Date().getFullYear() % 100;
  const century = pivotFuture ? 2000 : (yy > nowYY ? 1900 : 2000);
  return `${yymmdd.slice(4, 6)}/${yymmdd.slice(2, 4)}/${century + yy}`;
}

export function extractPassportFields(lines) {
  const out = { passportNumber: null, name: null, dob: null, address: null };
  const mrz = mrzLines(lines);
  const l1 = mrz.find((x) => x.t.startsWith("P<") || x.t.startsWith("P0") || /^P.IND/.test(x.t));
  const l2 = mrz.find((x) => x !== l1 && /^[A-Z0-9<]{9}\d[A-Z<]{3}\d{6}/.test(x.t));
  if (l1) {
    const names = l1.t.slice(5).split("<<").filter(Boolean);
    const surname = (names[0] || "").replace(/</g, " ").trim();
    const given = (names[1] || "").replace(/</g, " ").trim();
    const full = [given, surname].filter(Boolean).join(" ");
    if (NAME_CANDIDATE_RE.test(full)) out.name = { value: titleCase(full), confidence: conf(l1.line) };
  }
  if (l2) {
    const num = l2.t.slice(0, 9).replace(/</g, "");
    if (/^[A-Z]\d{7}$/.test(num)) out.passportNumber = { value: num, confidence: conf(l2.line) };
    const dob = mrzDate(l2.t.slice(13, 19), false);
    if (dob) out.dob = { value: dob, confidence: conf(l2.line) };
  }
  // Printed fallbacks (MRZ cropped or unreadable)
  if (!out.passportNumber) {
    for (const line of lines) {
      const m = line.text.toUpperCase().match(/\b([A-Z])\s?(\d{7})\b/);
      if (m && !/FILE/i.test(line.text)) { out.passportNumber = { value: m[1] + m[2], confidence: conf(line) }; break; }
    }
  }
  if (!out.dob) out.dob = labelledDate(lines, /Date\s+of\s+Birth|\bDOB\b/i);
  if (!out.name) {
    const surname = labelledText(lines, /^Surname\b|\/\s*Surname/i);
    const given = labelledText(lines, /Given\s+Name/i);
    if (surname || given) {
      const v = [given?.value, surname?.value].filter(Boolean).join(" ");
      out.name = { value: v, confidence: Math.min(surname?.confidence ?? 100, given?.confidence ?? 100) };
    }
  }
  out.address = labelledBlock(lines, /^Address\b|\/\s*Address/i, /File\s*No|Old\s+Passport|Name\s+of/i);
  return out;
}

// ---------- driving licence ----------
const DL_SHAPE_RE = /\b([A-Z]{2})[\s-]?(\d{2})[\s-]?((?:19|20)\d{2})[\s-]?(\d{7})\b/;
const DL_OLD_SHAPE_RE = /\b([A-Z]{2})[\s-]?(\d{2})[\s-]?(\d{6,11})\b/;

function findDlNumberInText(text) {
  const t = (text || "").toUpperCase();
  const m = t.match(DL_SHAPE_RE);
  if (m) return `${m[1]}${m[2]}${m[3]}${m[4]}`;
  return null;
}

export function extractDlFields(lines) {
  const out = { dlNumber: null, name: null, dob: null, address: null };
  for (const line of lines) {
    const t = line.text.toUpperCase();
    const m = t.match(DL_SHAPE_RE);
    if (m) { out.dlNumber = { value: `${m[1]}${m[2]}${m[3]}${m[4]}`, confidence: conf(line) }; break; }
  }
  if (!out.dlNumber) {
    for (let i = 0; i < lines.length; i++) {
      if (!/\bDL\s*No|Licen[cs]e\s*No/i.test(lines[i].text)) continue;
      for (const line of [lines[i], lines[i + 1]].filter(Boolean)) {
        const m = line.text.toUpperCase().replace(/^.*?(?:NO\.?|NUMBER)\s*:?\s*/, "").match(DL_OLD_SHAPE_RE);
        if (m) { out.dlNumber = { value: `${m[1]}${m[2]}${m[3]}`, confidence: conf(line) }; break; }
      }
      if (out.dlNumber) break;
    }
  }
  out.name = labelledText(lines, /^Name\b/i, /Father|Son|Daughter|Wife|S\/O|D\/O|W\/O|Holder.s\s+Sign/i);
  out.dob = labelledDate(lines, /Date\s+of\s+Birth|\bDOB\b/i);
  out.address = labelledBlock(lines, /^Address\b|Add\s*:|Permanent\s+Address|Present\s+Address/i, /Valid|Issue|Blood|Sign|Organ|Emergency|COV|Class/i);
  return out;
}

// ---------- shared label helpers ----------
function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Value on the label's own line (after the label/colon) or on one of the next 2 lines. */
function labelledText(lines, labelRe, excludeRe) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!labelRe.test(line.text) || (excludeRe && excludeRe.test(line.text))) continue;
    const after = line.text.replace(/^.*?(?:Name|Surname|Given\s+Name\(s\)|Given\s+Names?)\s*[:/-]?\s*/i, "").trim();
    if (after && NAME_CANDIDATE_RE.test(after) && !labelRe.test(after)) return { value: titleCase(after), confidence: conf(line) };
    for (let k = 1; k <= 2; k++) {
      const next = lines[i + k];
      if (!next) break;
      const t = next.text.trim();
      if (NAME_CANDIDATE_RE.test(t) && !/name|date|birth|sex|nationality|place/i.test(t)) return { value: titleCase(t), confidence: conf(next) };
    }
  }
  return null;
}

function labelledDate(lines, labelRe) {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i].text)) continue;
    for (const line of [lines[i], lines[i + 1], lines[i + 2]].filter(Boolean)) {
      const m = line.text.match(DATE_RE);
      if (m) return { value: fmtDate(m), confidence: conf(line) };
    }
  }
  return null;
}

/** Address block: lines after an Address label until a stop label, max 5 lines; never keeps a long digit run
 * (so a printed ID number can't leak into the address). */
function labelledBlock(lines, labelRe, stopRe) {
  const i = lines.findIndex((l) => labelRe.test(l.text));
  if (i === -1) return null;
  const parts = [];
  const used = [];
  const first = lines[i].text.replace(/^.*?(?:Address|Add)\s*:?\s*/i, "").trim();
  if (first) { parts.push(first); used.push(lines[i]); }
  for (let k = i + 1; k < lines.length && parts.length < 5; k++) {
    const t = lines[k].text.trim();
    if (stopRe.test(t)) break;
    if (t.replace(/\D/g, "").length >= 8 && !/\b\d{6}\b/.test(t)) continue;
    if (t) { parts.push(t); used.push(lines[k]); }
  }
  if (!parts.length) return null;
  return { value: parts.join(", "), confidence: avg(used.map((l) => ({ confidence: conf(l) }))) };
}
