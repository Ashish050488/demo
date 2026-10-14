// Case lifecycle: create, read, fill, review (decisions + live preview), regenerate, download, delete.
import { existsSync } from "node:fs";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import {
  createCase, listCases, updateCase, deleteCase, getFillResultsPath, getFilledPdfPath, getRegeneratedPdfPath, getRegeneratedResultsPath,
} from "../../services/storage/case-store-service.js";
import { recordDecision, DECISION_KINDS } from "../../services/storage/decision-log-service.js";
import { deleteIdentityRecord } from "../../services/documents/identity-number-memory-service.js";
import { fillCase } from "../../services/fill/fill-case-service.js";
import { regenerateCasePdf } from "../../services/fill/regenerate-case-pdf-service.js";
import { renderCasePreviewPage } from "../../services/fill/preview-case-page-service.js";
import { buildCaseFieldsView } from "../../services/fill/case-fields-view-service.js";
import { toCaseSummary } from "./case-summary-helpers.js";

export async function handleCreateCase(request, response) {
  const formId = request.body?.formId;
  if (!getFormDefinition(formId)) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Unknown formId");
  sendData(response, toCaseSummary(await createCase(formId)), 201);
}

export async function handleListCases(request, response) {
  const cases = (await listCases()).filter((caseEntry) => !caseEntry.batchId);
  cases.sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
  sendData(response, { cases: cases.map(toCaseSummary) });
}

export async function handleGetCase(request, response) {
  sendData(response, toCaseSummary(request.caseEntry));
}

export async function handleFillCase(request, response) {
  const { results } = await fillCase(request.caseEntry);
  await updateCase(request.caseEntry.id, { isFilled: true });
  const statusCounts = {};
  for (const fieldResult of results) statusCounts[fieldResult.status] = (statusCounts[fieldResult.status] || 0) + 1;
  sendData(response, { caseId: request.caseEntry.id, statusCounts });
}

export async function handleGetCaseFields(request, response) {
  const caseId = request.caseEntry.id;
  if (!existsSync(getFillResultsPath(caseId))) throw new ApiError(409, ERROR_CODES.INVALID_REQUEST, "This case has not been filled yet");
  sendData(response, await buildCaseFieldsView(request.caseEntry, { resultsPath: getFillResultsPath(caseId), pdfPath: getFilledPdfPath(caseId) }));
}

/** Body: {field, kind: "corrected" | "skipped", value?}. */
export async function handleRecordDecision(request, response) {
  const { field, kind, value } = request.body || {};
  if (!field || !Object.values(DECISION_KINDS).includes(kind)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Need field and kind (corrected or skipped)");
  }
  const decisionRow = await recordDecision({ caseId: request.caseEntry.id, field, decision: kind, value, who: "reviewer" });
  sendData(response, { kind: decisionRow.decision, value: decisionRow.value, decidedAt: decisionRow.timestamp });
}

/** Body: {field, value} -> PNG of that field's page with the value drawn in. Saves nothing. */
export async function handlePreviewPage(request, response) {
  const { field, value } = request.body || {};
  if (!field) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Need field");
  const startedAtMilliseconds = Date.now();
  const png = await renderCasePreviewPage(request.caseEntry, field, value);
  if (!png) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "This field has no position to preview");
  response.set("Content-Type", "image/png").set("Cache-Control", "no-store")
    .set("X-Preview-Milliseconds", String(Date.now() - startedAtMilliseconds)).send(png);
}

export async function handleRegenerateCase(request, response) {
  const caseId = request.caseEntry.id;
  await regenerateCasePdf(request.caseEntry);
  sendData(response, await buildCaseFieldsView(request.caseEntry, { resultsPath: getRegeneratedResultsPath(caseId), pdfPath: getRegeneratedPdfPath(caseId) }));
}

export async function handleDownloadPdf(request, response) {
  const pdfPath = getRegeneratedPdfPath(request.caseEntry.id);
  if (!existsSync(pdfPath)) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "Regenerate the PDF first");
  response.download(pdfPath, `filled-form-${request.caseEntry.id.slice(0, 8)}.pdf`);
}

export async function handleDeleteCase(request, response) {
  for (const caseDocument of request.caseEntry.documents) deleteIdentityRecord(caseDocument.id);
  await deleteCase(request.caseEntry.id);
  sendData(response, { caseId: request.caseEntry.id });
}
