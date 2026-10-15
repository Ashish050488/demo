// Every form the app can fill. Adding a form = a new folder next to this file (form-configuration.js,
// field-positions.json, field-sources.json, form-rules.json, required-fields.json) plus one entry here - or, for a
// form made on the "Add a form" screen, a folder with form-configuration.json instead, found on its own.
import path from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BLANK_FORMS_DIRECTORY, FORMS_DIRECTORY } from "../config/paths-config.js";
import { CRN_BROKING_DEMAT_FORM_CONFIGURATION } from "./crn-broking-demat/form-configuration.js";
import { CAMS_NOMINATION_FORM_CONFIGURATION } from "./cams-nomination/form-configuration.js";
import { GLOBAL_BOND_FUND_SUBSCRIPTION_FORM_CONFIGURATION } from "./global-bond-fund-subscription/form-configuration.js";
import { W8BEN_FORM_CONFIGURATION } from "./w8ben/form-configuration.js";
import { applyCrnBrokingDematTickboxes, applyCamsNominationTickboxes, applyOptionTickboxes } from "../services/forms/tickbox-rules-service.js";

export const FORM_IDS = {
  CRN_BROKING_DEMAT: "crn-broking-demat", CAMS_NOMINATION: "cams-nomination",
  GLOBAL_BOND_FUND_SUBSCRIPTION: "global-bond-fund-subscription", W8BEN: "w8ben",
};
const applyUsualAnswerTickboxes = (pages, formConfiguration, tickboxContext) => applyOptionTickboxes(pages, formConfiguration, { overrides: tickboxContext.overrides });

const FORM_DEFINITIONS = {
  [FORM_IDS.CRN_BROKING_DEMAT]: {
    formConfiguration: CRN_BROKING_DEMAT_FORM_CONFIGURATION,
    applyTickboxes: (pages, formConfiguration, tickboxContext) => applyCrnBrokingDematTickboxes(pages, formConfiguration, {
      anyNomineeAadhaarLast4: tickboxContext.anyNomineeAadhaarLast4, idType: tickboxContext.idTypes[1], overrides: tickboxContext.overrides,
    }),
  },
  [FORM_IDS.GLOBAL_BOND_FUND_SUBSCRIPTION]: { formConfiguration: GLOBAL_BOND_FUND_SUBSCRIPTION_FORM_CONFIGURATION, applyTickboxes: applyUsualAnswerTickboxes },
  [FORM_IDS.W8BEN]: { formConfiguration: W8BEN_FORM_CONFIGURATION, applyTickboxes: applyUsualAnswerTickboxes },
  [FORM_IDS.CAMS_NOMINATION]: {
    formConfiguration: CAMS_NOMINATION_FORM_CONFIGURATION,
    applyTickboxes: (pages, formConfiguration, tickboxContext) => applyCamsNominationTickboxes(pages, formConfiguration, {
      idTypes: tickboxContext.idTypes, overrides: tickboxContext.overrides,
    }),
  },
};

/** A form made on the "Add a form" screen: its configuration is JSON (no code), its ticks use the usual-answer rule. */
function readGeneratedFormDefinition(formId) {
  const configurationPath = path.join(FORMS_DIRECTORY, formId, "form-configuration.json");
  if (!existsSync(configurationPath)) return null;
  const { blankFileName, ...configuration } = JSON.parse(readFileSync(configurationPath, "utf-8"));
  return {
    formConfiguration: { ...configuration, blankFormPath: path.join(BLANK_FORMS_DIRECTORY, blankFileName), nomineeHeaderRe: /(?!)/, labels: [] },
    applyTickboxes: applyUsualAnswerTickboxes,
  };
}

/** Adds (or reloads) a generated form so it is usable at once, without a restart. */
export function registerGeneratedForm(formId) {
  const definition = readGeneratedFormDefinition(formId);
  if (!definition) throw new Error(`no generated form "${formId}"`);
  FORM_DEFINITIONS[formId] = definition;
}

for (const directoryEntry of readdirSync(FORMS_DIRECTORY, { withFileTypes: true })) {
  if (directoryEntry.isDirectory() && !FORM_DEFINITIONS[directoryEntry.name]) {
    const definition = readGeneratedFormDefinition(directoryEntry.name);
    if (definition) FORM_DEFINITIONS[directoryEntry.name] = definition;
  }
}

export function listFormIds() {
  return Object.keys(FORM_DEFINITIONS);
}

/** null for an unknown id - callers answer 404. */
export function getFormDefinition(formId) {
  const definition = FORM_DEFINITIONS[formId];
  if (!definition) return null;
  return { formId, directory: path.join(FORMS_DIRECTORY, formId), ...definition };
}
