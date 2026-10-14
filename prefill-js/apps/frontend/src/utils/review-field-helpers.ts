// Pure helpers for the review screen: field order and sections, the value currently in effect, and the
// colour state each field row shows.
import { getNomineeNumber, validateIdNumberFor, validatorFor, getChosenIdType, type FormCheckResult, type FormRules } from "@prefill/shared";
import type { CaseField } from "@/types/cases";

// Top to bottom as printed, so the list reads like the paper form.
const PRINTED_FIELD_ORDER = ["form_date", "fund_name", "folio_no", "investor_name", "applicant_name", "crn", "dp_id", "client_id",
  "broking_code", "wish_to_nominate", "name", "share_pct", "dob", "relationship_option", "relationship", "relationship_other",
  "id_type", "nominee_id_type", "id_pan", "id_details", "id_aadhaar_last4", "id_passport", "id_dl", "id_number", "address",
  "city", "state", "state_country", "pincode", "country", "mobile", "email", "guardian_name", "guardian_id_type",
  "guardian_pan", "guardian_address", "guardian_city", "guardian_state", "guardian_pincode", "guardian_country",
  "guardian_mobile", "guardian_email"];

export const REVIEW_SECTIONS = ["Account & form", "Nominee 1", "Nominee 2", "Guardian"] as const;
export type ReviewSection = (typeof REVIEW_SECTIONS)[number];
export type FieldState = "invalid" | "required" | "notApplicable" | "blank" | "lowConfidence" | "ok";
export type FieldFilter = "all" | "filled" | "empty" | "mustFix";

export function getPrintedOrder(fieldKey: string): number {
  const orderIndex = PRINTED_FIELD_ORDER.indexOf(fieldKey.replace(/_n\d+$/, ""));
  return orderIndex === -1 ? 999 : orderIndex;
}

export function getReviewSection(fieldKey: string): ReviewSection {
  const nomineeNumber = getNomineeNumber(fieldKey);
  if (nomineeNumber) return `Nominee ${nomineeNumber}` as ReviewSection;
  return /^guardian/.test(fieldKey) ? "Guardian" : "Account & form";
}

/** Fields for nominees the form supports (form-rules.json supportedNomineeCount). */
export function isShownField(caseField: CaseField, formRules: FormRules): boolean {
  const nomineeNumber = getNomineeNumber(caseField.field);
  return !nomineeNumber || nomineeNumber <= formRules.supportedNomineeCount;
}

/** Typed this session > a saved correction > what the fill produced. */
export function getEffectiveValue(caseField: CaseField, editedValues: Map<string, string>): string | null {
  if (editedValues.has(caseField.field)) return editedValues.get(caseField.field) ?? null;
  if (caseField.decision?.kind === "corrected" && caseField.decision.value) return caseField.decision.value;
  return (caseField.isTickbox ? caseField.option_chosen : caseField.value) ?? null;
}

export function collectEffectiveValues(caseFields: CaseField[], editedValues: Map<string, string>): Record<string, string> {
  const effectiveValues: Record<string, string> = {};
  for (const caseField of caseFields) {
    const effectiveValue = getEffectiveValue(caseField, editedValues);
    if (effectiveValue != null && effectiveValue !== "") effectiveValues[caseField.field] = effectiveValue;
  }
  return effectiveValues;
}

/** The instant check while typing (the whole-form check also runs on every change). */
export function validateTypedValue(fieldKey: string, typedValue: string, formRules: FormRules, effectiveValues: Record<string, string>) {
  if (!typedValue.trim()) return { valid: true as const };
  const baseKey = fieldKey.replace(/_n\d+$/, "");
  if (baseKey === formRules.identityType.numberField) {
    return validateIdNumberFor(getChosenIdType(formRules, effectiveValues, getNomineeNumber(fieldKey) || 1), typedValue);
  }
  return validatorFor(baseKey)?.(typedValue) ?? { valid: true as const };
}

export function getFieldState(caseField: CaseField, effectiveValue: string | null, formCheck: FormCheckResult, isEdited: boolean): FieldState {
  if (formCheck.invalid.some((problem) => problem.field === caseField.field)) return "invalid";
  if (formCheck.missing.includes(caseField.field)) return "required";
  const isEmpty = effectiveValue == null || effectiveValue === "";
  if (isEmpty && caseField.status === "not_applicable") return "notApplicable";
  if (isEmpty) return "blank";
  if (caseField.status === "low_confidence" && !isEdited) return "lowConfidence";
  return "ok";
}

export function isFieldFilled(fieldState: FieldState) {
  return fieldState === "ok" || fieldState === "lowConfidence" || fieldState === "invalid";
}

export function matchesFilter(fieldState: FieldState, fieldFilter: FieldFilter): boolean {
  if (fieldFilter === "filled") return isFieldFilled(fieldState);
  if (fieldFilter === "empty") return fieldState === "blank" || fieldState === "required";
  if (fieldFilter === "mustFix") return fieldState === "invalid" || fieldState === "required";
  return true;
}

/** Where the value came from, in a few words. */
export function describeValueSource(caseField: CaseField, isEdited: boolean): string | null {
  if (isEdited || caseField.decision?.kind === "corrected") return "Corrected by you";
  if (caseField.isTickbox) return caseField.option_chosen ? "Rule" : null;
  if (caseField.value == null) return null;
  if (caseField.source_file === "today's date") return "Today";
  if (caseField.source_file === "batch sheet") return "Batch sheet";
  return caseField.source_file ? `from ${caseField.source_file}` : null;
}
