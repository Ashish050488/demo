// Refuses any request not addressed to an allowed host (loopback by default), even though the server also
// binds to 127.0.0.1 - guards against DNS-rebinding tricks reaching a local server from a browser tab.
import { ALLOWED_HOSTNAMES } from "../config/environment-config.js";
import { sendError, ERROR_CODES } from "../helpers/api-response-helpers.js";

export function requireAllowedHostMiddleware(request, response, next) {
  const hostname = (request.headers.host || "").split(":")[0];
  if (!ALLOWED_HOSTNAMES.includes(hostname)) return sendError(response, 403, ERROR_CODES.FORBIDDEN_HOST, "forbidden host");
  next();
}
