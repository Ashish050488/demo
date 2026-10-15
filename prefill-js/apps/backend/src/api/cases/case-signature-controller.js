// A case's signature image: upload, view, remove - plus the form's signature places, so the review screen can say
// where it goes (or where to sign by hand). Changing it rebuilds the filled PDF straight away.
import { existsSync } from "node:fs";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { deleteSignature, findSignature, findTypedSignature, saveSignature, saveTypedSignature, SIGNATURE_MIME_TYPES } from "../../services/documents/signature-store-service.js";
import { listSignaturePlaces, SUBSCRIBER_SIGNER } from "../../services/pdf/draw-signatures-service.js";
import { cleanSignatureImage } from "../../services/documents/clean-signature-image-service.js";
import { regenerateCasePdf } from "../../services/fill/regenerate-case-pdf-service.js";
import { getFillResultsPath } from "../../services/storage/case-store-service.js";

async function rebuildFilledPdf(caseEntry) {
  if (existsSync(getFillResultsPath(caseEntry.id))) await regenerateCasePdf(caseEntry);
}

export async function handleGetSignaturePlaces(request, response) {
  const places = listSignaturePlaces(getFormDefinition(request.caseEntry.formId).formConfiguration);
  sendData(response, {
    hasSignature: Boolean(findSignature(request.caseEntry.id)),
    typedName: findTypedSignature(request.caseEntry.id),
    places: places.map((place) => ({ ...place, isSignedWithImage: place.signer === SUBSCRIBER_SIGNER })),
  });
}

export async function handleUploadSignature(request, response) {
  if (!request.file) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "No image uploaded");
  if (!SIGNATURE_MIME_TYPES.includes(request.file.mimetype)) throw new ApiError(415, ERROR_CODES.UNSUPPORTED_FILE_TYPE, "Upload the signature as a PNG or JPG image");
  // Paper removed, ink made black, margins cropped - saved as a transparent PNG.
  let cleanedBytes;
  try {
    cleanedBytes = await cleanSignatureImage(request.file.buffer);
  } catch (error) {
    throw new ApiError(422, ERROR_CODES.INVALID_REQUEST, error.message);
  }
  await saveSignature(request.caseEntry.id, cleanedBytes, "image/png");
  await rebuildFilledPdf(request.caseEntry);
  sendData(response, { hasSignature: true }, 201);
}

export async function handleGetSignatureImage(request, response) {
  const signature = findSignature(request.caseEntry.id);
  if (!signature) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No signature for this case");
  response.set("Cache-Control", "no-store").type(signature.mimeType).sendFile(signature.path);
}

export async function handleDeleteSignature(request, response) {
  await deleteSignature(request.caseEntry.id);
  await rebuildFilledPdf(request.caseEntry);
  sendData(response, { hasSignature: false });
}

/** The "digital" signature: a typed name, printed in a signature font on every subscriber signature place. */
export async function handleSaveTypedSignature(request, response) {
  const name = String(request.body?.name || "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 80) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Type the name to sign with (up to 80 characters)");
  await saveTypedSignature(request.caseEntry.id, name);
  await rebuildFilledPdf(request.caseEntry);
  sendData(response, { typedName: name }, 201);
}
