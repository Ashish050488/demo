// /api/batches - each client's documents are uploaded through the normal /api/cases/:caseId/documents route.
import express from "express";
import multer from "multer";
import { MAXIMUM_SHEET_FILE_SIZE_BYTES } from "../../services/batch/read-sheet-file-service.js";
import * as batchesController from "./batches-controller.js";

// The Excel is only read, never written to disk.
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAXIMUM_SHEET_FILE_SIZE_BYTES, files: 1 } });
const requireBatch = batchesController.requireBatchMiddleware;

const batchesRouter = express.Router();
batchesRouter.get("/", batchesController.handleListBatches);
batchesRouter.post("/", sheetUpload.single("file"), batchesController.handleCreateBatch);
batchesRouter.get("/:batchId", requireBatch, batchesController.handleGetBatch);
batchesRouter.post("/:batchId/start", requireBatch, batchesController.handleStartBatch);
batchesRouter.get("/:batchId/events", requireBatch, batchesController.handleBatchEvents);
batchesRouter.get("/:batchId/pdfs", requireBatch, batchesController.handleDownloadBatchZip);
batchesRouter.delete("/:batchId", requireBatch, batchesController.handleDeleteBatch);

export default batchesRouter;
