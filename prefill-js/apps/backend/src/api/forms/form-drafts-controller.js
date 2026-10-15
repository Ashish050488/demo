// "Add a form": upload a blank (and, best, a filled sample) -> a proposed mapping to check -> create the form.
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { createFormDraft, deleteFormDraft, getDraftBlankPath, getFormDraft } from "../../services/forms/auto-map/form-draft-service.js";
import { checkDraftFields, createFormFromDraft } from "../../services/forms/auto-map/create-form-from-draft-service.js";
import { renderPage } from "../../services/pdf/render-page-service.js";

const PAGE_IMAGE_WIDTH_PIXELS = 1400;

function requireDraft(request) {
  const draft = getFormDraft(request.params.draftId);
  if (!draft) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "This proposal has expired - upload the form again");
  return draft;
}

export async function handleCreateFormDraft(request, response) {
  const blankFile = request.files?.blank?.[0];
  if (!blankFile) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Upload the blank form (PDF)");
  let draft;
  try {
    draft = await createFormDraft({ blankBytes: blankFile.buffer, blankFileName: blankFile.originalname, filledBytes: request.files?.filled?.[0]?.buffer || null });
  } catch (error) {
    throw new ApiError(422, ERROR_CODES.INVALID_REQUEST, `This PDF could not be read (${error.message})`);
  }
  if (!draft.fields.length) {
    await deleteFormDraft(draft.draftId);
    throw new ApiError(422, ERROR_CODES.FORM_HAS_PROBLEMS, "No boxes to fill were found. Add a filled sample of the same form - the app finds every value it has.");
  }
  sendData(response, draft, 201);
}

export async function handleGetFormDraft(request, response) {
  sendData(response, requireDraft(request));
}

export async function handleGetDraftPageImage(request, response) {
  const draft = requireDraft(request);
  const pageNumber = Number(request.params.pageNumber);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > draft.pageCount) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Bad page number");
  const pageWidth = draft.pageSizes[pageNumber - 1].width;
  const { png } = await renderPage(getDraftBlankPath(draft.draftId), pageNumber, { scale: PAGE_IMAGE_WIDTH_PIXELS / pageWidth });
  response.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
}

export async function handleCreateFormFromDraft(request, response) {
  const draft = requireDraft(request);
  const { label, shortLabel, purpose, personLabel, fields } = request.body || {};
  if (!label || typeof label !== "string" || !label.trim()) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Give the form a name");
  if (!Array.isArray(fields) || !fields.length) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Keep at least one field");
  const problems = checkDraftFields(fields);
  if (problems.length) throw new ApiError(422, ERROR_CODES.FORM_HAS_PROBLEMS, problems.slice(0, 5).join("; "));
  sendData(response, await createFormFromDraft(draft, { label: label.trim(), shortLabel, purpose, personLabel, fields }), 201);
}

export async function handleDeleteFormDraft(request, response) {
  await deleteFormDraft(request.params.draftId);
  sendData(response, { deleted: true });
}
