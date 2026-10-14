// Fill the CAMS nomination form for both cases (360 ONE, HDFC): same mapping and same two real nominees,
// differing only in fund_name/folio_no/investor_name (the "excel"-sourced account-level fields). Text fields
// come from mappings/cams-nomination.json + the matching CAMS row of demo_data.xlsx + an Aadhaar OCR per
// nominee (data/nominee_scan_config.json). The field-writing core (multiline fit/shrink/truncate, per-line
// box capture) is shared with fill_crn.js and the regenerate path - see src/fillengine.js.
//
// The relationship checkbox is ticked by matching relationship_n1/_n2 (from the Excel row) against the
// option labels printed on the blank form - never by copying the sample's mark. If a value matched no option,
// the rule is: tick "Others" only if the form has a field for it (it does - a blank line next to "Others
// (please specify)"); otherwise leave blank and report it. Neither case needed the fallback here since both
// nominees' relationship ("Daughter") matched a direct option.
//
// output/<case>-results.json carries the full audit record per field and tick box, including `lines`: one
// box per actually-drawn line, for the review UI to highlight instead of drawing one loose rectangle over
// multi-line text - gitignored.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import XLSX from "xlsx";

import { CAMS_FORM } from "../src/mapping_config.js";
import { createEnglishWorker, ocrScan, drawCheckmark } from "../src/fillkit.js";
import { fillTextFields } from "../src/fillengine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA = path.join(HERE, "..", "tessdata");
const MAPPING_PATH = path.join(HERE, "..", "mappings", "cams-nomination.json");
const SCAN_CONFIG_PATH = "data/nominee_scan_config.json";
const EXCEL_PATH = "data/demo_data.xlsx";
const OUT_DIR = "output";

const AADHAAR_KEY = { name: "name", dob: "dob", address: "address", id_details: "aadhaarLast4" };

// The blank form's own structure: "Others (please specify)" has a blank line next to it on every nominee
// column (confirmed in the blank form's text items - "(please specify)" + "__________________"), so the
// fallback rule's "tick Others only if the form has a field for it" is satisfiable.
const FORM_HAS_OTHERS_FIELD = true;

const CASES = [
  { id: "cams-360one", label: "CAMS 360 ONE", row: "CAMS 360 ONE", outPdf: "output/cams-360one-prefilled.pdf", outResults: "output/cams-360one-results.json" },
  { id: "cams-hdfc", label: "CAMS HDFC", row: "CAMS HDFC", outPdf: "output/cams-hdfc-prefilled.pdf", outResults: "output/cams-hdfc-results.json" },
];

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fillOne(caseDef, { mapping, scanConfig, ocrByNominee, rows, tickbox }) {
  const row = rows.find((r) => r.case === caseDef.row);
  if (!row) throw new Error(`no demo_data.xlsx row for "${caseDef.row}"`);

  const getValue = async (field) => {
    if (field.nominee === 3) return { skipReason: "nominee 3 not filled (Excel column empty by design)", notApplicable: true };
    if (field.source === "UNSURE" || field.x == null) {
      return { skipReason: field.source === "UNSURE" ? "source UNSURE" : "no mapped position" };
    }
    if (field.source === "aadhaar") {
      const ocr = field.nominee != null ? ocrByNominee[field.nominee] : null;
      if (!ocr) return { skipReason: "no Aadhaar scan assigned to this nominee" };
      const sub = AADHAAR_KEY[field.key];
      const got = sub ? ocr[sub] : null;
      if (!got) return { skipReason: "OCR found nothing for this field" };
      return { value: got.value, confidence: got.confidence, sourceFile: scanConfig[`nominee${field.nominee}`] };
    }
    if (field.source === "excel") {
      const col = field.nominee != null ? `${field.key}_n${field.nominee}` : field.key;
      const cell = row?.[col];
      if (!cell) return { skipReason: "empty cell in demo_data.xlsx", notApplicable: true };
      return { value: String(cell), sourceFile: EXCEL_PATH };
    }
    return { skipReason: `unhandled source "${field.source}"` };
  };

  const { pdfDoc, pages, results } = await fillTextFields(CAMS_FORM, mapping, getValue);
  const relationshipByCol = {}; // nominee col -> matched option | "Others" | null, for compare_cams.js

  // ---- relationship tick marks, from the Excel value, matched against the printed option labels ----
  for (const col of [1, 2]) {
    const field = `relationship_option_n${col}`;
    const value = row[`relationship_n${col}`];
    if (!value) {
      results.push({
        field, page: tickbox.page, bbox: null, lines: null, value: null, source: "rule", source_file: null, ocr_confidence: null,
        option_chosen: null, rule: "tick the option whose label matches relationship_n* from Excel",
        status: "not_applicable", reason: "empty relationship cell in demo_data.xlsx",
      });
      continue;
    }
    const matchedOption = tickbox.options.find((opt) => opt !== "Others" && norm(opt) === norm(value));
    const optionToTick = matchedOption || (FORM_HAS_OTHERS_FIELD ? "Others" : null);
    const rule = matchedOption
      ? "tick the option whose label matches relationship_n* from Excel"
      : "value matched no option; tick Others (form has a field for it)";
    if (!optionToTick) {
      results.push({
        field, page: tickbox.page, bbox: null, lines: null, value: null, source: "rule", source_file: null, ocr_confidence: null,
        option_chosen: null, rule: "value matched no option and the form has no Others field",
        status: "needs_review", reason: "value matched no printed option and the form has no Others field",
      });
      continue;
    }
    const x = tickbox.optionXByColumn[col - 1];
    const y = tickbox.optionY[optionToTick];
    drawCheckmark(pages[tickbox.page - 1], { x, y, w: tickbox.w, h: tickbox.h });
    relationshipByCol[col] = optionToTick;
    const box = { x, y, width: tickbox.w, height: tickbox.h };
    results.push({
      field, page: tickbox.page, bbox: box, lines: [box], value: optionToTick,
      source: "rule", source_file: EXCEL_PATH, ocr_confidence: null,
      option_chosen: optionToTick, rule, status: "ok", reason: null,
    });
  }
  results.push({
    field: "relationship_option_n3", page: tickbox.page, bbox: null, lines: null, value: null, source: "rule", source_file: null,
    ocr_confidence: null, option_chosen: null, rule: "tick the option whose label matches relationship_n* from Excel",
    status: "not_applicable", reason: "nominee 3 not filled (Excel column empty by design)",
  });
  results.push({
    field: "id_type", page: null, bbox: null, lines: null, value: null, source: "rule", source_file: null, ocr_confidence: null,
    option_chosen: null, rule: "none given this step",
    status: "needs_review", reason: "no fill rule given for this box this step; position was never located either",
  });

  const outBytes = await pdfDoc.save();
  await writeFile(caseDef.outPdf, outBytes);
  await writeFile(caseDef.outResults, JSON.stringify(results, null, 2));

  return { results, relationshipByCol };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const mapping = JSON.parse(await readFile(MAPPING_PATH, "utf-8"));
  const scanConfig = JSON.parse(await readFile(SCAN_CONFIG_PATH, "utf-8"));
  const tickbox = CAMS_FORM.tickboxes.find((t) => t.key === "relationship_option");

  const book = XLSX.readFile(EXCEL_PATH);
  const rows = XLSX.utils.sheet_to_json(book.Sheets["demo_data"], { defval: "" });

  const worker = await createEnglishWorker(TESSDATA);
  const ocrByNominee = {};
  for (const n of [1, 2, 3]) {
    const scan = scanConfig[`nominee${n}`];
    ocrByNominee[n] = scan ? await ocrScan(worker, scan) : null;
  }
  await worker.terminate();

  for (const caseDef of CASES) {
    const { results, relationshipByCol } = await fillOne(caseDef, { mapping, scanConfig, ocrByNominee, rows, tickbox });
    await writeFile(`${caseDef.outPdf}.ticks.json`, JSON.stringify({ relationshipByCol }, null, 2));
    const counts = {};
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
    console.log(`\n=== ${caseDef.label} -> ${caseDef.outPdf} / ${caseDef.outResults} ===`);
    console.log(`field | source | status`);
    for (const r of results) console.log(`${r.field} | ${r.source} | ${r.status}`);
    console.log(`\nstatus counts:`, counts);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
