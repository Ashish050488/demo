// The fill run for one case. Every nominee field comes from that nominee's profile (built from whatever
// documents they uploaded); "typed" fields come from the case's typed values (a batch sheet row) - reviewer
// corrections are layered on top at preview/regenerate time. The form only knows profile keys, never document
// types, and only knows its ID-type rules through form-rules.json.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { validatorFor, validateIdNumberFor } from "@prefill/shared";
import { fillTextFields } from "../pdf/fill-pdf-service.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions, fetchFieldSources, fetchFormRules } from "../forms/form-files-service.js";
import { getFilledPdfPath, getFillResultsPath } from "../storage/case-store-service.js";
import { fetchCorrectedValues } from "../storage/decision-log-service.js";
import { buildNomineeProfile, IDENTITY_KIND_PRIORITY } from "../profile/build-nominee-profile-service.js";
import { rereadMissingIdentityDocuments } from "../documents/read-identity-document-service.js";
import { getTypedPanValues } from "../documents/identity-number-memory-service.js";
import { createFieldValueReader } from "./field-value-reader.js";

export function formatTodayDate() {
  const today = new Date();
  return `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
}

/** Which profile key each "document.X" field reads (idNumber is resolved per ID type instead). */
function buildProfileKeyByField(fieldSources) {
  const profileKeyByField = {};
  for (const [fieldKey, fieldSource] of Object.entries(fieldSources)) {
    const match = /^document\.(\w+)$/.exec(fieldSource);
    if (match && match[1] !== "idNumber") profileKeyByField[fieldKey] = match[1];
  }
  return profileKeyByField;
}

export async function fillCase(caseEntry) {
  const formDefinition = getFormDefinition(caseEntry.formId);
  if (!formDefinition) throw new Error(`unsupported form "${caseEntry.formId}"`);
  const [fieldPositions, fieldSources, formRules] = await Promise.all([
    fetchFieldPositions(caseEntry.formId), fetchFieldSources(caseEntry.formId), fetchFormRules(caseEntry.formId)]);
  const overrides = { ...(caseEntry.typedValues || {}), ...getTypedPanValues(caseEntry.id), ...(await fetchCorrectedValues(caseEntry.id)) };

  await rereadMissingIdentityDocuments(caseEntry);
  const nomineeNumbers = Array.from({ length: formRules.supportedNomineeCount }, (_unused, index) => index + 1);
  const documentsOfNominee = (nomineeNumber) => caseEntry.documents.filter((caseDocument) => caseDocument.assignedNominee === nomineeNumber);
  const profiles = Object.fromEntries(nomineeNumbers.map((nomineeNumber) => [nomineeNumber, buildNomineeProfile(documentsOfNominee(nomineeNumber))]));

  const { scope, tickboxField, optionByIdentityKind } = formRules.identityType;
  const identityKindByOption = Object.fromEntries(Object.entries(optionByIdentityKind).map(([kind, option]) => [option, kind]));
  // The reviewer's (or sheet's) pick, else the first ID whose number was actually read.
  const getIdentityKind = (nomineeNumber) => {
    const pickedOption = overrides[scope === "shared" ? tickboxField : `${tickboxField}_n${nomineeNumber}`];
    if (pickedOption && identityKindByOption[pickedOption]) return identityKindByOption[pickedOption];
    const kindFromDocuments = IDENTITY_KIND_PRIORITY.find((kind) => profiles[nomineeNumber]?.[kind]);
    if (kindFromDocuments) return kindFromDocuments;
    // No ID document: follow whichever ID number row the sheet filled for this nominee.
    const { numberFieldByIdentityKind } = formRules.identityType;
    return IDENTITY_KIND_PRIORITY.find((kind) => numberFieldByIdentityKind[kind] && overrides[`${numberFieldByIdentityKind[kind]}_n${nomineeNumber}`]) || null;
  };
  const idTypes = {};
  for (const nomineeNumber of nomineeNumbers) {
    const identityKind = getIdentityKind(nomineeNumber);
    if (identityKind) idTypes[nomineeNumber] = optionByIdentityKind[identityKind];
  }

  const profileKeyByField = buildProfileKeyByField(fieldSources);
  const flaggedReasons = {};
  const readFieldValue = createFieldValueReader({
    caseEntry, formRules, fieldSources, profiles, profileKeyByField, getIdentityKind, documentsOfNominee,
    formatTodayDate, onFlagged: (fieldLabel, reason) => { flaggedReasons[fieldLabel] = reason; },
    checkValue: (fieldKey, nomineeNumber, value) => (fieldKey === formRules.identityType.numberField
      ? validateIdNumberFor(optionByIdentityKind[getIdentityKind(nomineeNumber)], value)
      : validatorFor(fieldKey)?.(value)),
  });

  const { pdfDoc, pages, results } = await fillTextFields(formDefinition.formConfiguration, fieldPositions, readFieldValue);
  for (const fieldResult of results) {
    if (flaggedReasons[fieldResult.field] && fieldResult.value != null) {
      fieldResult.status = "invalid";
      fieldResult.reason = `Read from the document, but: ${flaggedReasons[fieldResult.field]} - please correct it`;
    }
    attachSourceDocument(fieldResult, { profiles, profileKeyByField, getIdentityKind, numberField: formRules.identityType.numberField });
  }

  const anyNomineeAadhaarLast4 = nomineeNumbers.some((nomineeNumber) => profiles[nomineeNumber]?.aadhaarLast4);
  results.push(...formDefinition.applyTickboxes(pages, formDefinition.formConfiguration, { anyNomineeAadhaarLast4, idTypes, overrides }));

  await mkdir(path.dirname(getFilledPdfPath(caseEntry.id)), { recursive: true });
  await writeFile(getFilledPdfPath(caseEntry.id), await pdfDoc.save());
  await writeFile(getFillResultsPath(caseEntry.id), JSON.stringify(results, null, 2));
  return { results };
}

/** Which document a value came from, for the review screen's "from Aadhaar · view" chip. */
function attachSourceDocument(fieldResult, { profiles, profileKeyByField, getIdentityKind, numberField }) {
  const match = fieldResult.field.match(/^(.*)_n(\d)$/);
  if (!match || fieldResult.value == null || fieldResult.source_file) return;
  const nomineeNumber = Number(match[2]);
  const profileKey = match[1] === numberField ? getIdentityKind(nomineeNumber) : profileKeyByField[match[1]];
  const profile = profiles[nomineeNumber] || {};
  const profileEntry = profileKey && (profile[profileKey] || (profileKey === "street" ? profile.address : null));
  if (profileEntry?.from) fieldResult.source_file = profileEntry.from;
  if (profileEntry?.docId) fieldResult.source_doc = profileEntry.docId;
}
