// Turns a checked draft into a real form: the same five files a hand-made form has (configuration as JSON), the
// blank copied next to the other blanks, and the form registered so it works at once - New case, Batch, templates.
import path from "node:path";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { BLANK_FORMS_DIRECTORY, FORMS_DIRECTORY } from "../../../config/paths-config.js";
import { listFormIds, registerGeneratedForm } from "../../../forms/form-registry.js";
import { deleteFormDraft, getDraftBlankPath } from "./form-draft-service.js";

const FIELD_SOURCE_PATTERN = /^(typed|today(\|\w+)*|document\.\w+(\|\w+)*|copy\.\w+|default\..+)$/;
const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

const writeJson = (filePath, value) => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

function makeFormId(label) {
  const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "new-form";
  let formId = baseId;
  for (let suffix = 2; listFormIds().includes(formId) || existsSync(path.join(FORMS_DIRECTORY, formId)); suffix += 1) formId = `${baseId}-${suffix}`;
  return formId;
}

/** Plain-language problems with the checked fields, or [] when they can be saved. */
export function checkDraftFields(fields) {
  const problems = [];
  const seenLabels = new Set();
  for (const field of fields) {
    const fieldLabel = `${field.key}${field.nominee ? `_n${field.nominee}` : ""}`;
    if (!FIELD_KEY_PATTERN.test(field.key)) problems.push(`"${field.key}": use lower-case letters, digits and _ only`);
    if (!FIELD_SOURCE_PATTERN.test(field.source)) problems.push(`"${field.key}": unknown source "${field.source}"`);
    if (seenLabels.has(fieldLabel)) problems.push(`"${fieldLabel}" is used twice - rename one`);
    seenLabels.add(fieldLabel);
  }
  return problems;
}

export async function createFormFromDraft(draft, { label, shortLabel, purpose, personLabel, fields: checkedFields }) {
  // Reading order (page, then top to bottom, then left to right): the review screen and the Excel follow it.
  const fields = [...checkedFields].sort((first, second) => first.page - second.page || Math.round(first.y / 6) - Math.round(second.y / 6) || first.x - second.x);
  const formId = makeFormId(label);
  const formDirectory = path.join(FORMS_DIRECTORY, formId);
  let blankFileName = `${label.replace(/[\\/:*?"<>|]+/g, " ").trim()}.pdf`;
  if (existsSync(path.join(BLANK_FORMS_DIRECTORY, blankFileName))) blankFileName = `${formId}.pdf`;
  const nomineeCount = Math.max(1, ...fields.map((field) => field.nominee || 1));
  const isOnePersonForm = nomineeCount === 1;
  const positionFields = fields.map(({ key, nominee, page, x, y, fontSize, type, maxWidth, maxY, alsoAt }) => ({
    key, nominee: nominee || null, page, x, y, fontSize, type, ...(maxWidth ? { maxWidth } : {}), ...(maxY ? { maxY } : {}), ...(alsoAt?.length ? { alsoAt } : {}),
  }));
  const fieldSources = Object.fromEntries(fields.map((field) => [field.key, field.source]));
  const pages = [...new Set(fields.map((field) => field.page))].sort((first, second) => first - second);
  const reviewSections = pages.map((pageNumber) => ({
    key: `page-${pageNumber}`, label: `Page ${pageNumber}`,
    fields: [...new Set(fields.filter((field) => field.page === pageNumber).map((field) => field.key))],
  }));
  const firstLines = draft.firstPageText.slice(0, 2);

  await mkdir(formDirectory, { recursive: true });
  await mkdir(BLANK_FORMS_DIRECTORY, { recursive: true });
  await copyFile(getDraftBlankPath(draft.draftId), path.join(BLANK_FORMS_DIRECTORY, blankFileName));
  await writeJson(path.join(formDirectory, "form-configuration.json"), { id: formId, title: label, blankFileName, tickboxes: [] });
  await writeJson(path.join(formDirectory, "field-positions.json"), {
    _about: `Made on the Add a form screen (${draft.method}) and checked by a person. Positions: x/y baseline in PDF points from the top-left.`,
    formId, title: label, fields: positionFields,
  });
  await writeJson(path.join(formDirectory, "field-sources.json"), { _about: "Same conventions as the other forms' field-sources.json.", fieldSources });
  await writeJson(path.join(formDirectory, "form-rules.json"), {
    _about: "Form-level rules, made on the Add a form screen.", formId, label, shortLabel: shortLabel || label,
    purpose: purpose || "Added on the Add a form screen", blankFileName,
    keyFields: [...new Set(fields.map((field) => field.label).filter(Boolean))].slice(0, 3),
    sheetTabName: (shortLabel || label).slice(0, 31), detectionPhrases: firstLines.length ? firstLines : [label],
    supportedNomineeCount: nomineeCount, ...(isOnePersonForm ? { personLabel: personLabel || "Client" } : {}),
    identityType: { scope: "shared", tickboxField: null, numberField: null, optionByIdentityKind: {}, numberFieldByIdentityKind: {} },
    reviewSections,
  });
  await writeJson(path.join(formDirectory, "required-fields.json"), {
    _about: "Fields that must be filled before a case can be confirmed. Changed from the Form setup screen.",
    requiredFields: [...new Set(fields.filter((field) => field.isRequired).map((field) => field.key))],
  });
  registerGeneratedForm(formId);
  await deleteFormDraft(draft.draftId);
  return { formId };
}
