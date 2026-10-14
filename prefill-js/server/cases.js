// The three cases the review server knows about - each backed by an existing results.json + prefilled PDF
// from the fill step. No upload, no live OCR here (slice 1): everything is read from what's already on disk.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const OUTPUT = path.join(ROOT, "output");
const MAPPINGS = path.join(ROOT, "mappings");

export const CASES = {
  "crn": {
    id: "crn", label: "CRN Broking & Demat", formConfig: CRN_FORM,
    mappingPath: path.join(MAPPINGS, "crn-broking-demat.json"),
    resultsPath: path.join(OUTPUT, "crn-results.json"),
    originalPdfPath: path.join(OUTPUT, "crn-prefilled.pdf"),
    regeneratedPdfPath: path.join(OUTPUT, "crn-regenerated.pdf"),
    regeneratedResultsPath: path.join(OUTPUT, "crn-regenerated-results.json"),
  },
  "cams-360one": {
    id: "cams-360one", label: "CAMS 360 ONE", formConfig: CAMS_FORM,
    mappingPath: path.join(MAPPINGS, "cams-nomination.json"),
    resultsPath: path.join(OUTPUT, "cams-360one-results.json"),
    originalPdfPath: path.join(OUTPUT, "cams-360one-prefilled.pdf"),
    regeneratedPdfPath: path.join(OUTPUT, "cams-360one-regenerated.pdf"),
    regeneratedResultsPath: path.join(OUTPUT, "cams-360one-regenerated-results.json"),
  },
  "cams-hdfc": {
    id: "cams-hdfc", label: "CAMS HDFC", formConfig: CAMS_FORM,
    mappingPath: path.join(MAPPINGS, "cams-nomination.json"),
    resultsPath: path.join(OUTPUT, "cams-hdfc-results.json"),
    originalPdfPath: path.join(OUTPUT, "cams-hdfc-prefilled.pdf"),
    regeneratedPdfPath: path.join(OUTPUT, "cams-hdfc-regenerated.pdf"),
    regeneratedResultsPath: path.join(OUTPUT, "cams-hdfc-regenerated-results.json"),
  },
};

export const DECISIONS_LOG = path.join(ROOT, "data", "decisions.jsonl");
