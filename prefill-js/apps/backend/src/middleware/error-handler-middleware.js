// Turns every thrown error into the standard error envelope. Unexpected errors are logged, not leaked.
import { ApiError, sendError, ERROR_CODES } from "../helpers/api-response-helpers.js";

const MULTER_ERROR_RESPONSES = {
  LIMIT_FILE_SIZE: [413, ERROR_CODES.FILE_TOO_LARGE, "File too large"],
  LIMIT_FILE_COUNT: [400, ERROR_CODES.INVALID_REQUEST, "Too many files at once"],
};

export function handleErrorMiddleware(error, request, response, _next) {
  if (error instanceof ApiError) return sendError(response, error.httpStatus, error.code, error.message, error.details);
  if (MULTER_ERROR_RESPONSES[error?.code]) return sendError(response, ...MULTER_ERROR_RESPONSES[error.code]);
  console.error(error);
  return sendError(response, 500, ERROR_CODES.INTERNAL_ERROR, "Something went wrong on the server");
}
