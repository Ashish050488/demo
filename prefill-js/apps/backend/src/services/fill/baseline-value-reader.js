// Re-fill from a case's first fill results (the baseline, never modified) with reviewer corrections on top -
// shared by "regenerate PDF" and the live preview. A preview can also override one field with what is being
// typed right now, without saving anything.
import { DECISION_KINDS } from "../storage/decision-log-service.js";

export function getEffectiveTickOption(baselineRecord, latestDecisions, { editedField, editedValue } = {}) {
  if (baselineRecord.field === editedField) return editedValue;
  const decisionRow = latestDecisions[baselineRecord.field];
  return decisionRow?.decision === DECISION_KINDS.CORRECTED && decisionRow.value ? decisionRow.value : baselineRecord.option_chosen;
}

export function createBaselineValueReader(baselineRecords, latestDecisions, { editedField, editedValue } = {}) {
  const baselineByField = Object.fromEntries(baselineRecords.map((baselineRecord) => [baselineRecord.field, baselineRecord]));
  return async function readBaselineValue(_field, fieldLabel) {
    if (fieldLabel === editedField) return { value: editedValue };
    const decisionRow = latestDecisions[fieldLabel];
    if (decisionRow?.decision === DECISION_KINDS.CORRECTED && decisionRow.value != null && decisionRow.value !== "") {
      return { value: decisionRow.value, sourceFile: "reviewer" };
    }
    const baselineRecord = baselineByField[fieldLabel];
    return {
      value: baselineRecord?.value ?? null, confidence: baselineRecord?.ocr_confidence ?? null, sourceFile: baselineRecord?.source_file ?? null,
      skipReason: baselineRecord?.status !== "ok" ? baselineRecord?.reason : null,
      notApplicable: baselineRecord?.status === "not_applicable", notProvided: baselineRecord?.status === "not_provided",
    };
  };
}
