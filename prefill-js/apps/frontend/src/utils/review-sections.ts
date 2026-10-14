// Splits a case's fields into the form's review sections (form-rules.json reviewSections). Anything a form
// doesn't list lands in a final "Other fields" section, so nothing can silently disappear.
import type { FormCheckResult, FormRules } from "@prefill/shared";
import type { CaseField } from "@/types/cases";

export interface ReviewSection {
  key: string;
  label: string;
  isNomineeSection: boolean;
  baseKeys: string[];
  fields: CaseField[];
}

const toBaseKey = (fieldKey: string) => fieldKey.replace(/_n\d+$/, "");

export function buildReviewSections(formRules: FormRules, shownFields: CaseField[]): ReviewSection[] {
  const nomineeFieldKeys = new Set(formRules.nomineeFieldKeys);
  const presentBaseKeys = new Set(shownFields.map((caseField) => toBaseKey(caseField.field)));
  const listedBaseKeys = new Set(formRules.reviewSections.flatMap((section) => section.fields));
  const unlistedBaseKeys = [...presentBaseKeys].filter((baseKey) => !listedBaseKeys.has(baseKey));
  const sectionDefinitions = unlistedBaseKeys.length
    ? [...formRules.reviewSections, { key: "other", label: "Other fields", fields: unlistedBaseKeys }]
    : formRules.reviewSections;

  return sectionDefinitions.map((sectionDefinition) => {
    const baseKeys = sectionDefinition.fields.filter((baseKey) => presentBaseKeys.has(baseKey));
    const baseKeySet = new Set(baseKeys);
    return {
      key: sectionDefinition.key, label: sectionDefinition.label, baseKeys,
      isNomineeSection: baseKeys.length > 0 && baseKeys.every((baseKey) => nomineeFieldKeys.has(baseKey)),
      fields: shownFields.filter((caseField) => baseKeySet.has(toBaseKey(caseField.field))),
    };
  }).filter((section) => section.baseKeys.length);
}

export function listProblemFieldKeys(formCheck: FormCheckResult): Set<string> {
  return new Set([...formCheck.missing, ...formCheck.invalid.map((problem) => problem.field)]);
}

