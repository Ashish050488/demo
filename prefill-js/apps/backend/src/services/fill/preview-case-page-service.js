// Live preview while typing: re-fills the whole form with one field overridden by what is being typed (plus
// every saved correction), then renders just that field's page. Written to a per-case scratch PDF; nothing is
// saved as a decision.
import { readFile, writeFile } from "node:fs/promises";
import { fillTextFields } from "../pdf/fill-pdf-service.js";
import { drawCheckmark } from "../pdf/pdf-drawing-helpers.js";
import { renderPage } from "../pdf/render-page-service.js";
import { getTickOptionBox, getTickboxPage } from "../forms/tickbox-rules-service.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions } from "../forms/form-files-service.js";
import { fetchLatestDecisionsByField } from "../storage/decision-log-service.js";
import { getFillResultsPath, getPreviewPdfPath } from "../storage/case-store-service.js";
import { createBaselineValueReader, getEffectiveTickOption } from "./baseline-value-reader.js";

const PREVIEW_IMAGE_WIDTH_PIXELS = 1400;
const A4_WIDTH_POINTS = 595.28;

/** PNG bytes of the page holding `editedField`, or null when that field has no position to preview. */
export async function renderCasePreviewPage(caseEntry, editedField, editedValue) {
  const { formConfiguration } = getFormDefinition(caseEntry.formId);
  const baselineRecords = JSON.parse(await readFile(getFillResultsPath(caseEntry.id), "utf-8"));
  const editedRecord = baselineRecords.find((baselineRecord) => baselineRecord.field === editedField);
  const isTickboxEdit = editedRecord && "option_chosen" in editedRecord;
  const previewPageNumber = editedRecord?.page ?? (isTickboxEdit ? getTickboxPage(formConfiguration, editedField) : null);
  if (!editedRecord || previewPageNumber == null) return null;

  const latestDecisions = await fetchLatestDecisionsByField(caseEntry.id);
  const textEdit = isTickboxEdit ? {} : { editedField, editedValue };
  const { pdfDoc, pages } = await fillTextFields(formConfiguration, await fetchFieldPositions(caseEntry.formId),
    createBaselineValueReader(baselineRecords, latestDecisions, textEdit));
  for (const baselineRecord of baselineRecords) {
    if (!("option_chosen" in baselineRecord)) continue;
    const chosenOption = getEffectiveTickOption(baselineRecord, latestDecisions, { editedField, editedValue });
    const box = getTickOptionBox(formConfiguration, baselineRecord.field, chosenOption);
    const pageNumber = baselineRecord.page ?? getTickboxPage(formConfiguration, baselineRecord.field);
    if (box && pageNumber) drawCheckmark(pages[pageNumber - 1], { x: box.x, y: box.y, w: box.width, h: box.height });
  }
  await writeFile(getPreviewPdfPath(caseEntry.id), await pdfDoc.save());
  const { png } = await renderPage(getPreviewPdfPath(caseEntry.id), previewPageNumber, { scale: PREVIEW_IMAGE_WIDTH_PIXELS / A4_WIDTH_POINTS });
  return png;
}
