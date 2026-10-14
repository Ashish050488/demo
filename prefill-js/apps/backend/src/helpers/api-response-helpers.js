// One response shape everywhere: {data} on success, {error: {code, message, details}} on failure.
export class ApiError extends Error {
  constructor(httpStatus, code, message, details = undefined) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  FORM_NOT_RECOGNISED: "FORM_NOT_RECOGNISED",
  FORM_HAS_PROBLEMS: "FORM_HAS_PROBLEMS",
  DOCUMENT_DELETED: "DOCUMENT_DELETED",
  FORBIDDEN_HOST: "FORBIDDEN_HOST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

export function sendData(response, responseData, httpStatus = 200) {
  response.status(httpStatus).json({ data: responseData });
}

export function sendError(response, httpStatus, code, message, details = undefined) {
  response.status(httpStatus).json({ error: { code, message, ...(details ? { details } : {}) } });
}
