// Resolves a case id for every /api/cases/* route - either one of the three fixed demo cases (server/cases.js)
// or a dynamic upload-driven case (server/uploads.js), so the existing review screen (built for the fixed
// cases) works unmodified against an upload case too. An id that is neither returns null; callers 404.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.js";
import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";
import {
  getUploadCase, uploadResultsPath, uploadPdfPath, uploadRegeneratedPdfPath, uploadRegeneratedResultsPath,
} from "./uploads.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS = path.join(HERE, "..", "mappings");

const FORM_DEFS = {
  crn: { formConfig: CRN_FORM, mappingPath: path.join(MAPPINGS, "crn-broking-demat.json"), label: "CRN Broking & Demat (uploaded)" },
  cams: { formConfig: CAMS_FORM, mappingPath: path.join(MAPPINGS, "cams-nomination.json") },
};

export async function resolveCaseDef(id) {
  if (CASES[id]) return CASES[id];

  const entry = await getUploadCase(id);
  if (!entry) return null;
  const def = FORM_DEFS[entry.formType];
  if (!def) return null;
  const label = entry.formType === "cams"
    ? `CAMS ${entry.camsVariant === "hdfc" ? "HDFC" : "360 ONE"} (uploaded)`
    : def.label;

  return {
    id: entry.id, label, formConfig: def.formConfig, mappingPath: def.mappingPath,
    resultsPath: uploadResultsPath(entry.id), originalPdfPath: uploadPdfPath(entry.id),
    regeneratedPdfPath: uploadRegeneratedPdfPath(entry.id), regeneratedResultsPath: uploadRegeneratedResultsPath(entry.id),
  };
}
