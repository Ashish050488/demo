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
  const readCorrectedValue = (fieldLabel) => {
    if (fieldLabel === editedField) return { value: editedValue };
    const decisionRow = latestDecisions[fieldLabel];
    return decisionRow?.decision === DECISION_KINDS.CORRECTED && decisionRow.value != null && decisionRow.value !== ""
      ? { value: decisionRow.value, sourceFile: "reviewer" } : null;
  };
  return async function readBaselineValue(_field, fieldLabel) {
    const correctedValue = readCorrectedValue(fieldLabel);
    if (correctedValue) return correctedValue;
    const baselineRecord = baselineByField[fieldLabel];
    // A copied field ("same as investor name") follows a correction of the field it copies.
    const sourceCorrection = baselineRecord?.copied_from && baselineRecord.source_file !== "batch sheet" ? readCorrectedValue(baselineRecord.copied_from) : null;
    if (sourceCorrection) return { value: sourceCorrection.value, sourceFile: "copied" };
    return {
      value: baselineRecord?.value ?? null, confidence: baselineRecord?.ocr_confidence ?? null, sourceFile: baselineRecord?.source_file ?? null,
      skipReason: baselineRecord?.status !== "ok" ? baselineRecord?.reason : null,
      notApplicable: baselineRecord?.status === "not_applicable", notProvided: baselineRecord?.status === "not_provided",
    };
  };
}
