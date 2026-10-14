// "Regenerate PDF": re-run the fill engine for one case, substituting any corrected value from the decision
// log in place of the original results.json value. No OCR, no Excel re-read - the original results.json
// (never modified) is the baseline; a "corrected" decision overrides one field's value, "approved"/"skipped"
// leave it exactly as it was. Writes to a NEW path (<case>-regenerated.pdf / -regenerated-results.json);
// the original prefilled PDF and results.json are never touched.
import { readFile, writeFile } from "node:fs/promises";
import { fillTextFields, drawTick } from "../src/fillengine.js";
import { latestByField } from "./decisions.js";
import { tickOptionBbox } from "../src/tickboxRules.js";

export async function regenerate(caseDef) {
  const mapping = JSON.parse(await readFile(caseDef.mappingPath, "utf-8"));
  const baseline = JSON.parse(await readFile(caseDef.resultsPath, "utf-8"));
  const decisions = await latestByField(caseDef.id);

  const baselineByField = {};
  for (const r of baseline) baselineByField[r.field] = r;

  const getValue = async (field, label) => {
    const base = baselineByField[label];
    const decision = decisions[label];
    if (decision && decision.decision === "corrected" && decision.value != null && decision.value !== "") {
      return {
        value: decision.value, confidence: null, sourceFile: "data/decisions.jsonl",
        skipReason: null, notApplicable: false,
      };
    }
    // approved, skipped, or never reviewed: keep the original value untouched.
    return {
      value: base?.value ?? null, confidence: base?.ocr_confidence ?? null, sourceFile: base?.source_file ?? null,
      skipReason: base?.status === "not_applicable" || base?.status === "needs_review" ? base.reason : null,
      notApplicable: base?.status === "not_applicable",
    };
  };

  const { pdfDoc, pages, results } = await fillTextFields(caseDef.formConfig, mapping, getValue);

  // ---- tick boxes: replay from baseline (option_chosen + bbox), unless corrected ----
  const tickResults = [];
  for (const base of baseline) {
    if (!("option_chosen" in base)) continue; // a text field, already handled above
    const decision = decisions[base.field];
    let record = base;
    if (decision && decision.decision === "corrected" && decision.value) {
      const bbox = tickOptionBbox(caseDef.formConfig, base.field, decision.value) || base.bbox;
      record = { ...base, value: decision.value, option_chosen: decision.value, bbox, lines: bbox ? [bbox] : null, status: "ok", reason: null };
    }
    if (record.bbox) drawTick(pdfDoc, pages, record);
    tickResults.push(record);
  }

  const allResults = [...results, ...tickResults];
  const pdfBytes = await pdfDoc.save();
  await writeFile(caseDef.regeneratedPdfPath, pdfBytes);
  await writeFile(caseDef.regeneratedResultsPath, JSON.stringify(allResults, null, 2));

  return { results: allResults, pdfPath: caseDef.regeneratedPdfPath };
}
