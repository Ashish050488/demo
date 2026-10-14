// Reads (and for required fields, writes) each form's JSON files. Small and read often, so cached in memory;
// a write updates the cache too.
import path from "node:path";
import crypto from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { FORMS_DIRECTORY } from "../../config/paths-config.js";
import { getFormDefinition, listFormIds } from "../../forms/form-registry.js";

const fileCache = new Map();

async function readFormJson(formId, filename) {
  const filePath = path.join(FORMS_DIRECTORY, formId, filename);
  if (!fileCache.has(filePath)) fileCache.set(filePath, JSON.parse(await readFile(filePath, "utf-8")));
  return structuredClone(fileCache.get(filePath));
}

export const fetchFieldPositions = (formId) => readFormJson(formId, "field-positions.json");
export const fetchFieldSources = async (formId) => (await readFormJson(formId, "field-sources.json")).fieldSources;
export const fetchDocumentDataDictionary = async () => (await readFormJson("", "document-data-dictionary.json")).documentData;
export const fetchRequiredFields = async (formId) => (await readFormJson(formId, "required-fields.json")).requiredFields;

/** Base keys (no _n<number>) that repeat once per nominee: text fields and tick boxes. */
async function fetchNomineeFieldKeys(formId) {
  const positions = await fetchFieldPositions(formId);
  const { formConfiguration } = getFormDefinition(formId);
  const nomineeFieldKeys = new Set(positions.fields.filter((field) => field.nominee != null).map((field) => field.key));
  for (const tickbox of formConfiguration.tickboxes) if (tickbox.perNominee) nomineeFieldKeys.add(tickbox.key);
  return [...nomineeFieldKeys];
}

/** Everything the shared validation (checkForm) and the UI need to know about a form's rules. */
export async function fetchFormRules(formId) {
  const { _about: _ignoredAbout, ...formRules } = await readFormJson(formId, "form-rules.json");
  return { ...formRules, requiredFields: await fetchRequiredFields(formId), nomineeFieldKeys: await fetchNomineeFieldKeys(formId) };
}

export async function listForms() {
  return Promise.all(listFormIds().map(async (formId) => {
    const { label, shortLabel, purpose, blankFileName, keyFields, supportedNomineeCount } = await readFormJson(formId, "form-rules.json");
    return { formId, label, shortLabel, purpose, blankFileName, keyFields, supportedNomineeCount };
  }));
}

export async function saveRequiredFields(formId, requiredFields) {
  const filePath = path.join(FORMS_DIRECTORY, formId, "required-fields.json");
  const current = await readFormJson(formId, "required-fields.json");
  const updated = { ...current, requiredFields: [...new Set(requiredFields)] };
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(updated, null, 2) + "\n");
  await rename(temporaryPath, filePath);
  fileCache.set(filePath, updated);
  return updated.requiredFields;
}
