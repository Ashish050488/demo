// Lets the frontend (a different port) call the API. Only the configured frontend origin is echoed back.
import { FRONTEND_ORIGIN } from "../config/environment-config.js";

export function allowFrontendOriginMiddleware(request, response, next) {
  if (request.headers.origin === FRONTEND_ORIGIN) {
    response.set("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Expose-Headers", "X-Preview-Milliseconds, Content-Disposition");
  }
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
}
