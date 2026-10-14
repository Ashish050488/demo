// Resolves :formId against the form registry.
import { getFormDefinition } from "../forms/form-registry.js";
import { ApiError, ERROR_CODES } from "../helpers/api-response-helpers.js";

export function requireFormMiddleware(request, response, next) {
  const formDefinition = getFormDefinition(request.params.formId);
  if (!formDefinition) throw new ApiError(404, ERROR_CODES.NOT_FOUND, "Unknown form");
  request.formDefinition = formDefinition;
  next();
}
