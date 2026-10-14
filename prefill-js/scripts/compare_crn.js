// Fill step 4: compare our output/crn-prefilled.pdf against the real hand-filled CRN sample, field by field.
// Per field: MATCH, MISMATCH (with why: wrong text / shifted position / wrapped differently), or MISSING
// (one side has it, the other doesn't). Only field names and statuses are printed - never the text itself.
import { CRN_FORM } from "../src/mapping_config.js";
import { extractTextItems } from "../src/pdftext.js";
import { onlyInFilled } from "../src/difftext.js";
import { resolveLabels, columnBoundaries, columnOf, labelFor } from "../src/mapbuilder.js";

const OUR_OUTPUT = "output/crn-prefilled.pdf";
const REAL_SAMPLE = CRN_FORM.filledSamples[0].path;

const POS_TOL = 3; // points - close enough to call "the same position"

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** {fieldKey_nominee -> {text, x, y, lines}} for one filled PDF, diffed against the blank. */
async function fieldsOf(blankItems, labels, boundaries, filledPath) {
  const filledItems = await extractTextItems(filledPath);
  const typed = onlyInFilled(blankItems, filledItems);
  const buckets = {};
  for (const item of typed) {
    const label = labelFor(item, labels);
    if (!label) continue;
    const col = label.perNominee ? columnOf(item.x, boundaries) : null;
    const key = `${label.key}${col != null ? `_n${col}` : ""}`;
    buckets[key] ??= [];
    buckets[key].push(item);
  }
  const out = {};
  for (const [key, items] of Object.entries(buckets)) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const ys = [...new Set(sorted.map((i) => Math.round(i.y / 2) * 2))]; // 2pt buckets for line counting
    out[key] = {
      text: norm(sorted.map((i) => i.text).join(" ")),
      x: Math.min(...sorted.map((i) => i.x)),
      y: Math.min(...sorted.map((i) => i.y)),
      lines: ys.length,
    };
  }
  return out;
}

async function main() {
  const blankItems = await extractTextItems(CRN_FORM.blank);
  const labels = resolveLabels(blankItems, CRN_FORM.labels);
  const boundaries = columnBoundaries(blankItems, CRN_FORM.nomineeHeaderRe);

  const ours = await fieldsOf(blankItems, labels, boundaries, OUR_OUTPUT);
  const theirs = await fieldsOf(blankItems, labels, boundaries, REAL_SAMPLE);

  const allKeys = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])].sort();

  const results = [];
  for (const key of allKeys) {
    const o = ours[key], t = theirs[key];
    if (!o && !t) continue;
    if (!o) { results.push({ key, status: "MISSING", why: "we have nothing, sample has a value" }); continue; }
    if (!t) { results.push({ key, status: "MISSING", why: "we wrote a value, sample has nothing there" }); continue; }

    const reasons = [];
    if (o.text !== t.text) reasons.push("wrong text");
    if (Math.abs(o.x - t.x) > POS_TOL || Math.abs(o.y - t.y) > POS_TOL) reasons.push("shifted position");
    if (o.lines !== t.lines) reasons.push("wrapped differently");

    if (!reasons.length) results.push({ key, status: "MATCH" });
    else results.push({ key, status: "MISMATCH", why: reasons.join(", ") });
  }

  const counts = { MATCH: 0, MISMATCH: 0, MISSING: 0 };
  for (const r of results) {
    counts[r.status]++;
    console.log(`${r.key}: ${r.status}${r.why ? ` (${r.why})` : ""}`);
  }
  console.log(`\n${counts.MATCH} match, ${counts.MISMATCH} mismatch, ${counts.MISSING} missing`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
