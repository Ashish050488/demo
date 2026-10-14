// Resolves :caseId through the case store before anything else touches it (see case-store-service.js).
import { getCase } from "../services/storage/case-store-service.js";
import { ApiError, ERROR_CODES } from "../helpers/api-response-helpers.js";

export async function requireCaseMiddleware(request, response, next) {
  const caseEntry = await getCase(request.params.caseId);
  if (!caseEntry) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "No such case");
  request.caseEntry = caseEntry;
  next();
}
