// The columns of a form's batch Excel: one per field a person (or their client master) supplies, in form order.
// Shared by the template download and, later, by the Excel import - so a file we hand out is always readable.
import { formatFieldLabel, RULE_TEXT } from "@prefill/shared";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions, fetchFieldSources, fetchFormRules } from "../forms/form-files-service.js";

export const CLIENT_REFERENCE_COLUMN_KEY = "client_reference";
export const COLUMN_SOURCES = { TYPED: "typed", TICK: "tick", DOCUMENT: "document" };
const SOURCE_DESCRIPTIONS = {
  [COLUMN_SOURCES.TYPED]: "Fill in the Excel",
  [COLUMN_SOURCES.TICK]: "Pick one of the allowed values",
  [COLUMN_SOURCES.DOCUMENT]: "Optional - read from the client's documents when they are attached",
};

function toColumnSource(fieldSource) {
  if (fieldSource === "tick") return COLUMN_SOURCES.TICK;
  if (fieldSource?.startsWith("document.")) return COLUMN_SOURCES.DOCUMENT;
  return fieldSource === "typed" ? COLUMN_SOURCES.TYPED : null; // "today" and unmapped fields are not columns
}

/** [{key, label, baseKey, nomineeNumber, source, sourceDescription, isRequired, rule, options}] in form order. */
export async function buildBatchColumns(formId) {
  const { formConfiguration } = getFormDefinition(formId);
  const [{ fields }, fieldSources, formRules] = await Promise.all([fetchFieldPositions(formId), fetchFieldSources(formId), fetchFormRules(formId)]);
  const requiredBaseKeys = new Set(formRules.requiredFields);
  const nomineeBaseKeys = new Set(formRules.nomineeFieldKeys);
  const optionsByBaseKey = Object.fromEntries(formConfiguration.tickboxes.filter((tickbox) => tickbox.options).map((tickbox) => [tickbox.key, tickbox.options]));
  const presentBaseKeys = new Set([...fields.map((field) => field.key), ...formConfiguration.tickboxes.map((tickbox) => tickbox.key)]);

  // Base keys in review-section order, then anything a section list doesn't mention.
  const sectionOrder = formRules.reviewSections.flatMap((section) => section.fields);
  const orderedBaseKeys = [...new Set([...sectionOrder, ...presentBaseKeys])]
    .filter((baseKey) => presentBaseKeys.has(baseKey) && toColumnSource(fieldSources[baseKey]))
    // A tick box with no options (e.g. "wish to nominate") is always ticked by rule - nothing to fill.
    .filter((baseKey) => fieldSources[baseKey] !== "tick" || optionsByBaseKey[baseKey]);

  const toColumn = (baseKey, nomineeNumber) => {
    const source = toColumnSource(fieldSources[baseKey]);
    const label = nomineeNumber ? `Nominee ${nomineeNumber} - ${formatFieldLabel(baseKey)}` : formatFieldLabel(baseKey);
    return {
      key: nomineeNumber ? `${baseKey}_n${nomineeNumber}` : baseKey, label, baseKey, nomineeNumber, source,
      sourceDescription: SOURCE_DESCRIPTIONS[source],
      isRequired: requiredBaseKeys.has(baseKey) && (nomineeNumber ?? 1) === 1,
      isRequiredWhenNomineeUsed: requiredBaseKeys.has(baseKey) && (nomineeNumber ?? 1) > 1,
      rule: optionsByBaseKey[baseKey] ? `One of: ${optionsByBaseKey[baseKey].join(" / ")}` : RULE_TEXT[baseKey] || "Free text",
      options: optionsByBaseKey[baseKey] || null,
    };
  };

  const formLevelKeys = orderedBaseKeys.filter((baseKey) => !nomineeBaseKeys.has(baseKey));
  const guardianKeys = formLevelKeys.filter((baseKey) => /^guardian/.test(baseKey));
  const headerKeys = formLevelKeys.filter((baseKey) => !/^guardian/.test(baseKey));
  const nomineeKeys = orderedBaseKeys.filter((baseKey) => nomineeBaseKeys.has(baseKey));
  const nomineeColumns = Array.from({ length: formRules.supportedNomineeCount }, (_unused, index) => index + 1)
    .flatMap((nomineeNumber) => nomineeKeys.map((baseKey) => toColumn(baseKey, nomineeNumber)));

  return [
    { key: CLIENT_REFERENCE_COLUMN_KEY, label: "Client reference", baseKey: CLIENT_REFERENCE_COLUMN_KEY, nomineeNumber: null, source: COLUMN_SOURCES.TYPED,
      sourceDescription: "Your client code - the name of the client's documents folder", isRequired: true, isRequiredWhenNomineeUsed: false,
      rule: "Unique per row", options: null },
    ...headerKeys.map((baseKey) => toColumn(baseKey, null)),
    ...nomineeColumns,
    ...guardianKeys.map((baseKey) => toColumn(baseKey, null)),
  ];
}
