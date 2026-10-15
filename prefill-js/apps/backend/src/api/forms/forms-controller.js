// Forms: which forms exist, recognising an uploaded blank form, each form's rules (incl. editable required
// fields), field sources, mapping overlay and blank page images.
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { listForms, fetchFormRules, fetchFieldSources, fetchDocumentDataDictionary, saveRequiredFields, fetchFieldPositions } from "../../services/forms/form-files-service.js";
import { detectFormId } from "../../services/forms/detect-form-service.js";
import { buildFormMappingOverlay } from "../../services/forms/form-mapping-overlay-service.js";
import { buildSheetColumns } from "../../services/sheets/sheet-columns-helpers.js";
import { renderPage } from "../../services/pdf/render-page-service.js";
import { buildBatchTemplate, buildCombinedBatchTemplate } from "../../services/batch/batch-template-service.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { buildBatchColumns } from "../../services/batch/batch-columns-helpers.js";

const PAGE_IMAGE_WIDTH_PIXELS = 1400;
const A4_WIDTH_POINTS = 595.28;

export async function handleListForms(request, response) {
  sendData(response, { forms: await listForms() });
}

export async function handleDetectForm(request, response) {
  if (!request.file) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "No file uploaded");
  const formId = await detectFormId(request.file.buffer);
  if (!formId) throw new ApiError(422, ERROR_CODES.FORM_NOT_RECOGNISED, "This doesn't look like a form we support yet");
  sendData(response, { formId });
}

export async function handleGetFormRules(request, response) {
  sendData(response, await fetchFormRules(request.formDefinition.formId));
}

/** Body: {requiredFields: [baseKey]} - every key must be a field or tick box of this form. */
export async function handleUpdateRequiredFields(request, response) {
  const { formId, formConfiguration } = request.formDefinition;
  const requestedFields = request.body?.requiredFields;
  if (!Array.isArray(requestedFields)) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "requiredFields must be a list");
  const { fields } = await fetchFieldPositions(formId);
  const knownKeys = new Set([...fields.map((field) => field.key), ...formConfiguration.tickboxes.map((tickbox) => tickbox.key)]);
  const unknownKeys = requestedFields.filter((fieldKey) => !knownKeys.has(fieldKey));
  if (unknownKeys.length) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, `Unknown fields: ${unknownKeys.join(", ")}`);
  sendData(response, { requiredFields: await saveRequiredFields(formId, requestedFields) });
}

export async function handleGetFieldSources(request, response) {
  const formId = request.formDefinition.formId;
  sendData(response, { fieldSources: await fetchFieldSources(formId), documentData: await fetchDocumentDataDictionary() });
}

export async function handleGetFormMapping(request, response) {
  sendData(response, await buildFormMappingOverlay(request.formDefinition));
}

export async function handleGetSheetColumns(request, response) {
  sendData(response, { columns: await buildSheetColumns(request.formDefinition.formId) });
}

export async function handleGetBlankPageImage(request, response) {
  const pageNumber = Number(request.params.pageNumber);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Bad page number");
  const { png } = await renderPage(request.formDefinition.formConfiguration.blankFormPath, pageNumber, { scale: PAGE_IMAGE_WIDTH_PIXELS / A4_WIDTH_POINTS });
  response.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
}

/** The Excel a client fills with one row per client, for this form. */
export async function handleDownloadBatchTemplate(request, response) {
  const { fileBytes, fileName } = await buildBatchTemplate(request.formDefinition.formId);
  response.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set("Content-Disposition", `attachment; filename="${fileName}"`).send(fileBytes);
}

/** ?formIds=a,b -> one Excel template for several forms (each shared value asked once). */
export async function handleDownloadCombinedBatchTemplate(request, response) {
  const formIds = [...new Set(String(request.query.formIds || "").split(",").map((formId) => formId.trim()).filter(Boolean))];
  if (!formIds.length || formIds.some((formId) => !getFormDefinition(formId))) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Unknown formId");
  const { fileBytes, fileName } = formIds.length === 1 ? await buildBatchTemplate(formIds[0]) : await buildCombinedBatchTemplate(formIds);
  response.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .set("Content-Disposition", `attachment; filename="${fileName}"`).send(fileBytes);
}

export async function handleGetBatchColumns(request, response) {
  sendData(response, { columns: await buildBatchColumns(request.formDefinition.formId) });
}
