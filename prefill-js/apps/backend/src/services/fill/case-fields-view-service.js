// The review screen's view of one case: every field with its value, status, page boxes and latest decision.
// Aadhaar is only ever the last 4 digits; it is shown as "XXXX XXXX 1234".
import { readFile } from "node:fs/promises";
import { fetchPageSizes, toPageFractionBox } from "../pdf/page-size-service.js";
import { fetchLatestDecisionsByField } from "../storage/decision-log-service.js";
import { fetchFormRules } from "../forms/form-files-service.js";

const AADHAAR_FIELD_PATTERN = /^(id_aadhaar_last4|id_details|id_number)/;

function maskAadhaarValue(fieldRecord) {
  if (fieldRecord.value != null && AADHAAR_FIELD_PATTERN.test(fieldRecord.field) && /^\d{4}$/.test(fieldRecord.value)) {
    return { ...fieldRecord, value: `XXXX XXXX ${fieldRecord.value}` };
  }
  return fieldRecord;
}

function toDecisionView(decisionRow) {
  return decisionRow ? { kind: decisionRow.decision, who: decisionRow.who, value: decisionRow.value, decidedAt: decisionRow.timestamp } : null;
}

/** resultsPath/pdfPath: the first fill's, or the regenerated ones. */
export async function buildCaseFieldsView(caseEntry, { resultsPath, pdfPath }) {
  const fieldRecords = JSON.parse(await readFile(resultsPath, "utf-8"));
  const latestDecisions = await fetchLatestDecisionsByField(caseEntry.id);
  const pageSizes = await fetchPageSizes(pdfPath);
  const { label } = await fetchFormRules(caseEntry.formId);
  const fields = fieldRecords.map((fieldRecord) => {
    const pageSize = fieldRecord.page ? pageSizes[fieldRecord.page - 1] : null;
    const lineRects = fieldRecord.lines?.length ? fieldRecord.lines : fieldRecord.bbox ? [fieldRecord.bbox] : [];
    return maskAadhaarValue({
      ...fieldRecord,
      isTickbox: "option_chosen" in fieldRecord,
      boxes: lineRects.map((rect) => toPageFractionBox(rect, pageSize)).filter(Boolean),
      decision: toDecisionView(latestDecisions[fieldRecord.field]),
    });
  });
  return { caseId: caseEntry.id, formId: caseEntry.formId, label, pageCount: pageSizes.length, fields };
}
