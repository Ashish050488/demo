// The per-field value lookup used by one fill run: where each mapped field's value comes from (today's date,
// the nominee's document profile, or the case's typed values) and, when there is none, the plain reason why.
import { getTypedPanValues } from "../documents/identity-number-memory-service.js";

const IDENTITY_KIND_WORDS = { pan: "PAN card", aadhaarLast4: "Aadhaar", passport: "passport", dl: "driving licence" };
const NOT_TYPED_REASON = "Not provided - type it here, or include it in the batch sheet";

export function createFieldValueReader({
  caseEntry, formRules, fieldSources, profiles, profileKeyByField, getIdentityKind, documentsOfNominee,
  formatTodayDate, onFlagged, checkValue,
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

  const readDocumentField = (field, nomineeNumber) => {
    const missingReason = documentsOfNominee(nomineeNumber).length
      ? "not found on this nominee's documents - type it, or add a document that shows it"
      : "no document assigned to this nominee yet";
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

  return async function readFieldValue(field, fieldLabel) {
    if (field.nominee != null && field.nominee > formRules.supportedNomineeCount) {
      return { skipReason: `nominee ${field.nominee} not supported yet`, notApplicable: true };
    }
    if (field.x == null) return { skipReason: "no mapped position" };
    const fieldSource = fieldSources[field.key];
    if (fieldSource === "today") return { value: formatTodayDate(), sourceFile: "today's date" };
    const sheetValue = typedValues[fieldLabel] ? { value: String(typedValues[fieldLabel]), sourceFile: "batch sheet" } : null;
    if (fieldSource && fieldSource.startsWith("document.") && field.nominee != null) {
      // A value read from the person's own document wins; the sheet only fills what documents did not show.
      const documentValue = readDocumentField(field, field.nominee);
      if (documentValue.value != null) {
        const check = checkValue(field.key, field.nominee, documentValue.value);
        if (check && !check.valid) onFlagged(fieldLabel, check.reason);
        return documentValue;
      }
      if (sheetValue && !documentValue.notApplicable) return sheetValue;
      return documentValue;
    }
    if (sheetValue) return sheetValue;
    if (!fieldSource) return { skipReason: "not mapped to a source yet" };
    return { skipReason: NOT_TYPED_REASON, notProvided: true };
  };
}
