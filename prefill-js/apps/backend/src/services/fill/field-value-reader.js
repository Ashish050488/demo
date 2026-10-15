// The per-field value lookup used by one fill run: where each mapped field's value comes from (today's date,
// the nominee's document profile, or the case's typed values) and, when there is none, the plain reason why.
import { getTypedPanValues } from "../documents/identity-number-memory-service.js";
import { splitFieldSource, applyValueTransforms, SHEET_SAFE_TRANSFORMS } from "./field-value-transforms.js";

const IDENTITY_KIND_WORDS = { pan: "PAN card", aadhaarLast4: "Aadhaar", passport: "passport", dl: "driving licence" };
const NOT_TYPED_REASON = "Not provided - type it here, or include it in the batch sheet";

export function createFieldValueReader({
  caseEntry, formRules, fieldSources, profiles, profileKeyByField, getIdentityKind, documentsOfNominee,
  formatTodayDate, onFlagged, checkValue, effectiveValues = {},
}) {
  // Sheet values, with PAN values from memory (never stored on disk) on top.
  const typedValues = { ...(caseEntry.typedValues || {}), ...getTypedPanValues(caseEntry.id) };
  const { numberField, optionByIdentityKind, numberFieldByIdentityKind } = formRules.identityType;
  const identityKindByNumberRow = Object.fromEntries(Object.entries(numberFieldByIdentityKind).map(([kind, row]) => [row, kind]));

  const readFromProfile = (nomineeNumber, profileKey) => {
    const profile = profiles[nomineeNumber] || {};
    const profileEntry = profile[profileKey] || (profileKey === "street" ? profile.address : null);
    return profileEntry ? { value: profileEntry.value, confidence: profileEntry.confidence, sourceFile: null } : null;
  };

  const personWord = (formRules.personLabel || "nominee").toLowerCase();
  const readDocumentField = (field, nomineeNumber) => {
    const missingReason = documentsOfNominee(nomineeNumber).length
      ? `not found on this ${personWord}'s documents - type it, or add a document that shows it`
      : `no document for this ${personWord} yet - add one, or fill it in the Excel`;
    const identityKind = getIdentityKind(nomineeNumber);
    if (field.key === numberField) {
      const readValue = identityKind ? readFromProfile(nomineeNumber, identityKind) : null;
      if (!readValue) return { skipReason: identityKind ? `ID type is ${optionByIdentityKind[identityKind]}, but no ${IDENTITY_KIND_WORDS[identityKind]} number was read` : missingReason };
      return readValue;
    }
    const readValue = readFromProfile(nomineeNumber, profileKeyByField[field.key]);
    // "Tick one ID and give only that number": other ID rows stay blank but say what was read.
    const rowKind = identityKindByNumberRow[field.key];
    if (rowKind && identityKind !== rowKind) {
      return readValue
        ? { skipReason: `Read from ${IDENTITY_KIND_WORDS[rowKind]} - change ID type to ${optionByIdentityKind[rowKind]} to use it`, notApplicable: true }
        : { skipReason: `Only needed if ID type is ${optionByIdentityKind[rowKind]}`, notApplicable: true };
    }
    return readValue || { skipReason: missingReason };
  };

  // Values this run already produced, so "copy.X" also copies a value read from a document (not only typed ones).
  const valuesReadThisRun = {};
  return async function readFieldValue(field, fieldLabel) {
    const { baseSource, transformNames } = splitFieldSource(fieldSources[field.key]);
    const readValue = readUntransformedValue(field, fieldLabel, baseSource);
    // A value typed for this very box is taken as written (only tidied: upper case etc.); anything else is reshaped.
    const appliedTransforms = readValue.sourceFile === "batch sheet" ? transformNames.filter((name) => SHEET_SAFE_TRANSFORMS.has(name)) : transformNames;
    if (readValue.value == null || !appliedTransforms.length) {
      if (readValue.value != null) valuesReadThisRun[fieldLabel] = readValue.value;
      return readValue;
    }
    const transformedValue = applyValueTransforms(readValue.value, appliedTransforms);
    // e.g. no middle name in "ASHISH RANJAN": nothing to write, and nothing to fix.
    if (transformedValue == null) return { skipReason: "Not in this person's details (e.g. no middle name)", notApplicable: true };
    valuesReadThisRun[fieldLabel] = transformedValue;
    return { ...readValue, value: transformedValue };
  };

  function readTypedSibling(field, fieldSource) {
    const suffix = field.nominee != null ? `_n${field.nominee}` : "";
    for (const [otherKey, otherSource] of Object.entries(fieldSources)) {
      if (otherKey === field.key || splitFieldSource(otherSource).baseSource !== fieldSource) continue;
      const typedValue = typedValues[`${otherKey}${suffix}`];
      if (typedValue) return { value: String(typedValue), sourceFile: "batch sheet (from another column)" };
    }
    return null;
  }

  function readUntransformedValue(field, fieldLabel, fieldSource) {
    if (field.nominee != null && field.nominee > formRules.supportedNomineeCount) {
      return { skipReason: `nominee ${field.nominee} not supported yet`, notApplicable: true };
    }
    if (field.x == null) return { skipReason: "no mapped position" };
    if (fieldSource === "today") return { value: formatTodayDate(), sourceFile: "today's date" };
    const sheetValue = typedValues[fieldLabel] ? { value: String(typedValues[fieldLabel]), sourceFile: "batch sheet" } : null;
    if (fieldSource && fieldSource.startsWith("document.")) {
      // A value read from the person's own document wins; the sheet only fills what documents did not show.
      // A one-person form's fields carry no nominee number: they read that person's (slot 1) documents.
      const personNumber = field.nominee ?? 1;
      const documentValue = readDocumentField(field, personNumber);
      if (documentValue.value != null) {
        const check = checkValue(field.key, personNumber, documentValue.value);
        if (check && !check.valid) onFlagged(fieldLabel, check.reason);
        return documentValue;
      }
      if (sheetValue && !documentValue.notApplicable) return sheetValue;
      // No document: another box that reads the same document value may have it typed in the Excel (address
      // lines 1/2 split from the typed full address).
      const siblingValue = readTypedSibling(field, fieldSource);
      return siblingValue && !documentValue.notApplicable ? siblingValue : documentValue;
    }
    if (fieldSource?.startsWith("copy.")) {
      // "Same as another field" (e.g. page 2's first holder = investor name) unless this one was typed itself.
      const copiedFrom = fieldSource.slice("copy.".length);
      if (sheetValue) return { ...sheetValue, copiedFrom };
      const copiedValue = effectiveValues[copiedFrom] ?? valuesReadThisRun[copiedFrom];
      return copiedValue ? { value: String(copiedValue), sourceFile: "copied", copiedFrom } : { skipReason: NOT_TYPED_REASON, notProvided: true, copiedFrom };
    }
    if (sheetValue) return sheetValue;
    // "default.Yes": a fixed answer most clients give, unless the sheet or reviewer gives another.
    if (fieldSource?.startsWith("default.")) return { value: fieldSource.slice("default.".length), sourceFile: "default answer" };
    if (!fieldSource) return { skipReason: "not mapped to a source yet" };
    return { skipReason: NOT_TYPED_REASON, notProvided: true };
  }
}
