// The Google Sheet columns for one form, in the order the form prints them: header fields, then each nominee's
// fields and ticks, then the guardian's.
import { formatFieldLabel } from "@prefill/shared";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions, fetchFormRules } from "../forms/form-files-service.js";

const isGuardianKey = (fieldKey) => /^guardian/.test(fieldKey);

/** [{key, label}] for the form's sheet tab. */
export async function buildSheetColumns(formId) {
  const { formConfiguration } = getFormDefinition(formId);
  const { fields } = await fetchFieldPositions(formId);
  const { supportedNomineeCount } = await fetchFormRules(formId);
  const columns = [{ key: "case_id", label: "Case ID" }, { key: "saved_at", label: "Saved at" }];
  const seenKeys = new Set(columns.map((column) => column.key));
  const addColumn = (key, label) => { if (!seenKeys.has(key)) { seenKeys.add(key); columns.push({ key, label }); } };

  for (const field of fields) if (field.nominee == null && !isGuardianKey(field.key)) addColumn(field.key, formatFieldLabel(field.key));
  for (const tickbox of formConfiguration.tickboxes) if (!tickbox.perNominee && !isGuardianKey(tickbox.key)) addColumn(tickbox.key, formatFieldLabel(tickbox.key));
  for (let nomineeNumber = 1; nomineeNumber <= supportedNomineeCount; nomineeNumber += 1) {
    for (const field of fields.filter((candidate) => candidate.nominee === nomineeNumber)) {
      addColumn(`${field.key}_n${nomineeNumber}`, `Nominee ${nomineeNumber} – ${formatFieldLabel(field.key)}`);
    }
    for (const tickbox of formConfiguration.tickboxes.filter((candidate) => candidate.perNominee)) {
      addColumn(`${tickbox.key}_n${nomineeNumber}`, `Nominee ${nomineeNumber} – ${formatFieldLabel(tickbox.key)}`);
    }
  }
  for (const field of fields) if (field.nominee == null && isGuardianKey(field.key)) addColumn(field.key, formatFieldLabel(field.key));
  for (const tickbox of formConfiguration.tickboxes) if (isGuardianKey(tickbox.key)) addColumn(tickbox.key, formatFieldLabel(tickbox.key));
  return columns;
}
