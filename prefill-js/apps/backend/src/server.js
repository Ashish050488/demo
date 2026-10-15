// The backend API. Binds to 127.0.0.1 by default and only answers requests addressed to an allowed host.
import express from "express";
import { APPLICATION_HOST, APPLICATION_PORT } from "./config/environment-config.js";
import { requireAllowedHostMiddleware } from "./middleware/loopback-host-middleware.js";
import { allowFrontendOriginMiddleware } from "./middleware/cors-middleware.js";
import { handleErrorMiddleware } from "./middleware/error-handler-middleware.js";
import { sendError, ERROR_CODES } from "./helpers/api-response-helpers.js";
import formsRouter from "./api/forms/forms-routes.js";
import casesRouter from "./api/cases/cases-routes.js";
import batchesRouter from "./api/batches/batches-routes.js";
import { startBatchRunner } from "./services/batch/batch-runner-service.js";
import googleSheetSettingsRouter from "./api/settings/google-sheet-settings-routes.js";
import { startScanOcrThreads } from "./services/ocr/scan-ocr-pool-service.js";

// The OCR engine (opencv, loaded with PaddleOCR) installs "any stray error -> abort the process" handlers, so one
// failed write once took the whole server down mid-batch. Replace them: log it, keep serving every other client.
function keepServerRunningOnStrayErrors() {
  for (const eventName of ["uncaughtException", "unhandledRejection"]) process.removeAllListeners(eventName);
  process.on("unhandledRejection", (reason) => console.error("unhandled rejection (server kept running):", reason?.stack || reason));
  process.on("uncaughtException", (error) => console.error("uncaught error (server kept running):", error?.stack || error));
}
keepServerRunningOnStrayErrors();

const application = express();
application.use(requireAllowedHostMiddleware);
application.use(allowFrontendOriginMiddleware);
application.use(express.json({ limit: "2mb" }));

application.get("/api/health", (request, response) => response.json({ data: { isHealthy: true } }));
application.use("/api/forms", formsRouter);
application.use("/api/cases", casesRouter);
application.use("/api/batches", batchesRouter);
application.use("/api/settings/google-sheet", googleSheetSettingsRouter);
application.use("/api", (request, response) => sendError(response, 404, ERROR_CODES.NOT_FOUND, "No such API route"));
application.use(handleErrorMiddleware);

application.listen(APPLICATION_PORT, APPLICATION_HOST, () => {
  startScanOcrThreads(); // OCR runs on its own threads, so the screens stay quick while a batch is read
  startBatchRunner();
  console.log(`backend API: http://${APPLICATION_HOST}:${APPLICATION_PORT}/api`);
});
