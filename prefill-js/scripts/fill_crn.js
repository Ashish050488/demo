// Fill step 2-3: write every mapped CRN field onto a copy of the blank CRN form, at its mapped position, with
// pdf-lib. Values come from two places, per the mapping's own "source":
//   "aadhaar" -> OCR each nominee's assigned scan (data/nominee_scan_config.json) at fill time
//   "excel"   -> the CRN row of data/demo_data.xlsx
// Nothing here is typed in; every value is read from those two sources at runtime.
//
// The actual field-writing (multiline fit/shrink/truncate, per-line box capture) is shared with the
// regenerate path - see src/fillengine.js. This script only supplies getValue() (OCR/Excel) and the
// CRN-specific tick-box rules.
//
// Tick marks are drawn as pdf-lib vector lines at the printed □ glyph's position (from the blank form's own
// text layer - never copied from the sample): "wish_to_nominate" always, and the nominee identification-type
// checkbox is ticked "Aadhaar (last 4)" when at least one nominee's id_aadhaar_last4 value actually came from
// an Aadhaar scan this run (that field is a single shared checkbox for the whole form, not per-nominee - see
// mapping_config.js's note). guardian_id_type has no stated rule here, so it's left unticked and flagged.
//
// output/crn-results.json carries the full audit record per field and tick box (value, position, source,
// OCR confidence, status, and `lines`: one box per actually-drawn line, for the review UI to highlight
// instead of drawing one loose rectangle over multi-line text) - gitignored, since it holds real values.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import XLSX from "xlsx";

import { CRN_FORM } from "../src/mapping_config.js";
import { createEnglishWorker, ocrScan, drawCheckmark } from "../src/fillkit.js";
import { fillTextFields } from "../src/fillengine.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA = path.join(HERE, "..", "tessdata");
const MAPPING_PATH = path.join(HERE, "..", "mappings", "crn-broking-demat.json");
const SCAN_CONFIG_PATH = "data/nominee_scan_config.json";
const EXCEL_PATH = "data/demo_data.xlsx";
const OUT_DIR = "output";
const OUT_PDF = path.join(OUT_DIR, "crn-prefilled.pdf");
const OUT_RESULTS = path.join(OUT_DIR, "crn-results.json");

const AADHAAR_KEY = { name: "name", dob: "dob", address: "address", id_aadhaar_last4: "aadhaarLast4", id_number: "aadhaarLast4" };

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const mapping = JSON.parse(await readFile(MAPPING_PATH, "utf-8"));
  const scanConfig = JSON.parse(await readFile(SCAN_CONFIG_PATH, "utf-8"));

  const book = XLSX.readFile(EXCEL_PATH);
  const rows = XLSX.utils.sheet_to_json(book.Sheets["demo_data"], { defval: "" });
  const crnRow = rows.find((r) => r.case === "CRN Broking & Demat");

  const worker = await createEnglishWorker(TESSDATA);
  const ocrByNominee = {};
  for (const n of [1, 2, 3]) {
    const scan = scanConfig[`nominee${n}`];
    ocrByNominee[n] = scan ? await ocrScan(worker, scan) : null;
  }
  await worker.terminate();

  let anyNomineeAadhaarLast4 = false;

  const getValue = async (field) => {
    if (field.source === "UNSURE" || field.x == null) {
      return { skipReason: field.source === "UNSURE" ? "source UNSURE" : "no mapped position", notApplicable: field.nominee === 3 };
    }
    if (field.source === "aadhaar") {
      const ocr = field.nominee != null ? ocrByNominee[field.nominee] : null;
      if (!ocr) return { skipReason: "no Aadhaar scan assigned to this nominee" };
      const sub = AADHAAR_KEY[field.key];
      const got = sub ? ocr[sub] : null;
      if (!got) return { skipReason: "OCR found nothing for this field" };
      if (field.key === "id_aadhaar_last4" || field.key === "id_number") anyNomineeAadhaarLast4 = true;
      return { value: got.value, confidence: got.confidence, sourceFile: scanConfig[`nominee${field.nominee}`] };
    }
    if (field.source === "excel") {
      const col = field.nominee != null ? `${field.key}_n${field.nominee}` : field.key;
      const cell = crnRow?.[col];
      if (!cell) return { skipReason: "empty cell in demo_data.xlsx", notApplicable: true };
      return { value: String(cell), sourceFile: EXCEL_PATH };
    }
    return { skipReason: `unhandled source "${field.source}"` };
  };

  const { pdfDoc, pages, results } = await fillTextFields(CRN_FORM, mapping, getValue);

  // ---- tick marks ----
  const wishToNominate = CRN_FORM.tickboxes.find((t) => t.key === "wish_to_nominate");
  drawCheckmark(pages[wishToNominate.page - 1], wishToNominate);
  const wishBox = { x: wishToNominate.x, y: wishToNominate.y, width: wishToNominate.w, height: wishToNominate.h };
  results.push({
    field: "wish_to_nominate", page: wishToNominate.page, bbox: wishBox, lines: [wishBox],
    value: "ticked", source: "rule", source_file: null, ocr_confidence: null,
    option_chosen: "ticked", rule: "always ticked", status: "ok", reason: null,
  });

  const nomineeIdType = CRN_FORM.tickboxes.find((t) => t.key === "nominee_id_type");
  if (anyNomineeAadhaarLast4) {
    const optX = nomineeIdType.optionX["Aadhaar (last 4)"];
    drawCheckmark(pages[nomineeIdType.page - 1], { x: optX, y: nomineeIdType.y, w: nomineeIdType.w, h: nomineeIdType.h });
    const box = { x: optX, y: nomineeIdType.y, width: nomineeIdType.w, height: nomineeIdType.h };
    results.push({
      field: "nominee_id_type", page: nomineeIdType.page, bbox: box, lines: [box],
      value: "Aadhaar (last 4)", source: "rule", source_file: null, ocr_confidence: null,
      option_chosen: "Aadhaar (last 4)", rule: "tick Aadhaar (last 4) when a nominee's last-4 came from an Aadhaar scan this run",
      status: "ok", reason: null,
    });
  } else {
    results.push({
      field: "nominee_id_type", page: nomineeIdType.page, bbox: null, lines: null, value: null, source: "rule", source_file: null,
      ocr_confidence: null, option_chosen: null, rule: "tick Aadhaar (last 4) when a nominee's last-4 came from an Aadhaar scan this run",
      status: "needs_review", reason: "no nominee's id_aadhaar_last4 was Aadhaar-sourced this run",
    });
  }

  const guardianIdType = CRN_FORM.tickboxes.find((t) => t.key === "guardian_id_type");
  results.push({
    field: "guardian_id_type", page: guardianIdType.page, bbox: null, lines: null, value: null, source: "rule", source_file: null,
    ocr_confidence: null, option_chosen: null, rule: "none given this step",
    status: "needs_review", reason: "no fill rule given for this box",
  });

  const outBytes = await pdfDoc.save();
  await writeFile(OUT_PDF, outBytes);
  await writeFile(OUT_RESULTS, JSON.stringify(results, null, 2));

  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

  console.log(`wrote ${OUT_PDF}`);
  console.log(`wrote ${OUT_RESULTS}`);
  console.log(`\nfield | source | status`);
  for (const r of results) console.log(`${r.field} | ${r.source} | ${r.status}`);
  console.log(`\nstatus counts:`, counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
