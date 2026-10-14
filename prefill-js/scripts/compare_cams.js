// Fill step 6: compare each CAMS output against its own hand-filled sample, field by field (text, via the
// same diff machinery as compare_crn.js) plus the relationship tick boxes (via ink-based pixel reading for
// the sample - our own marks are already known from what fill_cams.js actually drew, in the .ticks.json
// sidecar it writes). Only field names and statuses are printed - never the text itself.
import { readFile } from "node:fs/promises";
import { CAMS_FORM } from "../src/mapping_config.js";
import { extractTextItems } from "../src/pdftext.js";
import { onlyInFilled } from "../src/difftext.js";
import { resolveLabels, columnBoundaries, columnOf, labelFor } from "../src/mapbuilder.js";
import { renderPageImageData, detectTickedOption } from "../src/tickread.js";

const POS_TOL = 3;

const CASES = [
  { label: "CAMS 360 ONE", ours: "output/cams-360one-prefilled.pdf", sample: "data/Investment/MF/Nomination_Form - cams-360 ONE.pdf" },
  { label: "CAMS HDFC", ours: "output/cams-hdfc-prefilled.pdf", sample: "data/Investment/MF/Nomination_Form - cams-HDFC.pdf" },
];

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

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
    const ys = [...new Set(sorted.map((i) => Math.round(i.y / 2) * 2))];
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
  const blankItems = await extractTextItems(CAMS_FORM.blank);
  const labels = resolveLabels(blankItems, CAMS_FORM.labels);
  const boundaries = columnBoundaries(blankItems, CAMS_FORM.nomineeHeaderRe);
  const tickbox = CAMS_FORM.tickboxes.find((t) => t.key === "relationship_option");

  for (const c of CASES) {
    console.log(`\n=== ${c.label} ===`);
    const ours = await fieldsOf(blankItems, labels, boundaries, c.ours);
    const theirs = await fieldsOf(blankItems, labels, boundaries, c.sample);
    const allKeys = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])].sort();

    const counts = { MATCH: 0, MISMATCH: 0, MISSING: 0 };
    const report = (key, status, why) => {
      counts[status]++;
      console.log(`${key}: ${status}${why ? ` (${why})` : ""}`);
    };

    for (const key of allKeys) {
      const o = ours[key], t = theirs[key];
      if (!o && !t) continue;
      if (!o) { report(key, "MISSING", "we have nothing, sample has a value"); continue; }
      if (!t) { report(key, "MISSING", "we wrote a value, sample has nothing there"); continue; }
      const reasons = [];
      if (o.text !== t.text) reasons.push("wrong text");
      if (Math.abs(o.x - t.x) > POS_TOL || Math.abs(o.y - t.y) > POS_TOL) reasons.push("shifted position");
      if (o.lines !== t.lines) reasons.push("wrapped differently");
      report(key, reasons.length ? "MISMATCH" : "MATCH", reasons.join(", ") || undefined);
    }

    // ---- tick boxes ----
    const ticksSidecar = JSON.parse(await readFile(`${c.ours}.ticks.json`, "utf-8"));
    const samplePage = await renderPageImageData(c.sample, 1, 4);
    for (const col of [1, 2]) {
      const key = `relationship_option_n${col}`;
      const ourOption = ticksSidecar.relationshipByCol[col] ?? null;
      const boxes = {};
      for (const opt of tickbox.options) {
        boxes[opt] = { x: tickbox.optionXByColumn[col - 1], y: tickbox.optionY[opt], w: tickbox.w, h: tickbox.h };
      }
      const sampleOption = detectTickedOption(samplePage, boxes);
      if (!ourOption && !sampleOption) continue;
      if (!ourOption) { report(key, "MISSING", "we ticked nothing, sample has a mark"); continue; }
      if (!sampleOption) { report(key, "MISSING", "we ticked an option, sample has no detectable mark"); continue; }
      report(key, ourOption === sampleOption ? "MATCH" : "MISMATCH", ourOption === sampleOption ? undefined : "different option ticked");
    }
    report("relationship_option_n3", "MISSING", "nominee 3 not filled (by design)");
    report("id_type", "MISSING", "not filled this step (no rule given, no position located)");

    console.log(`\n${counts.MATCH} match, ${counts.MISMATCH} mismatch, ${counts.MISSING} missing`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
