// Live preview while typing: re-fills the whole form with one field overridden by what is being typed (plus
// every saved correction), then renders just that field's page. Written to a per-case scratch PDF; nothing is
// saved as a decision.
import { readFile, writeFile } from "node:fs/promises";
import { drawSignatures } from "../pdf/draw-signatures-service.js";
import { fillTextFields } from "../pdf/fill-pdf-service.js";
import { renderPage } from "../pdf/render-page-service.js";
import { drawTickOption, getTickboxPage } from "../forms/tickbox-rules-service.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions } from "../forms/form-files-service.js";
import { fetchLatestDecisionsByField } from "../storage/decision-log-service.js";
import { getFillResultsPath, getPreviewPdfPath } from "../storage/case-store-service.js";
import { createBaselineValueReader, getEffectiveTickOption } from "./baseline-value-reader.js";

const PREVIEW_IMAGE_WIDTH_PIXELS = 1400;
const A4_WIDTH_POINTS = 595.28;

/** PNG bytes of `requestedPageNumber` (any page the reviewer browses to), else of the page holding `editedField`.
 * The edited field (if any) is drawn with its typed value either way. Null when there is nothing to show. */
export async function renderCasePreviewPage(caseEntry, editedField, editedValue, requestedPageNumber = null) {
  const { formConfiguration } = getFormDefinition(caseEntry.formId);
  const baselineRecords = JSON.parse(await readFile(getFillResultsPath(caseEntry.id), "utf-8"));
  const editedRecord = editedField ? baselineRecords.find((baselineRecord) => baselineRecord.field === editedField) : null;
  const isTickboxEdit = Boolean(editedRecord && "option_chosen" in editedRecord);
  const previewPageNumber = requestedPageNumber
    ?? editedRecord?.page ?? (isTickboxEdit ? getTickboxPage(formConfiguration, editedField) : null);
  if (previewPageNumber == null) return null;

  const latestDecisions = await fetchLatestDecisionsByField(caseEntry.id);
  const textEdit = isTickboxEdit || !editedRecord ? {} : { editedField, editedValue };
  const { pdfDoc, pages } = await fillTextFields(formConfiguration, await fetchFieldPositions(caseEntry.formId),
    createBaselineValueReader(baselineRecords, latestDecisions, textEdit));
  if (previewPageNumber > pages.length) return null; // a page this form doesn't have
  for (const baselineRecord of baselineRecords) {
    if (!("option_chosen" in baselineRecord)) continue;
    const chosenOption = getEffectiveTickOption(baselineRecord, latestDecisions, { editedField, editedValue });
    const pageNumber = baselineRecord.page ?? getTickboxPage(formConfiguration, baselineRecord.field);
    if (chosenOption) drawTickOption(pages, formConfiguration, baselineRecord.field, chosenOption, pageNumber);
  }
  await drawSignatures(pdfDoc, pages, formConfiguration, caseEntry.id);
  await writeFile(getPreviewPdfPath(caseEntry.id), await pdfDoc.save());
  const { png } = await renderPage(getPreviewPdfPath(caseEntry.id), previewPageNumber, { scale: PREVIEW_IMAGE_WIDTH_PIXELS / A4_WIDTH_POINTS });
  return png;
}
