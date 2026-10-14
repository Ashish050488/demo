// /api/cases
import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { requireCaseMiddleware } from "../../middleware/require-case-middleware.js";
import { getCaseUploadDirectory } from "../../services/storage/case-store-service.js";
import * as casesController from "./cases-controller.js";
import * as caseDocumentsController from "./case-documents-controller.js";
import { handleConfirmCase } from "./case-confirm-controller.js";
import { handleImportCaseSheet } from "./case-sheet-import-controller.js";
import { MAXIMUM_SHEET_FILE_SIZE_BYTES } from "../../services/batch/read-sheet-file-service.js";

const MAXIMUM_FILES_PER_REQUEST = 15;
// Well above the 15MB per-file limit: multer aborts the WHOLE request on its own limit, so the real per-file
// check happens after saving (case-documents-controller.js) and only rejects that one file.
const MULTER_CEILING_BYTES = 40 * 1024 * 1024;

const documentsUpload = multer({
  storage: multer.diskStorage({
    // The case folder is deleted on confirm - recreate it if documents are added afterwards.
    destination: (request, file, callback) => {
      const caseDirectory = getCaseUploadDirectory(request.caseEntry.id);
      mkdir(caseDirectory, { recursive: true }).then(() => callback(null, caseDirectory), callback);
    },
    filename: (request, file, callback) => callback(null, `doc-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MULTER_CEILING_BYTES, files: MAXIMUM_FILES_PER_REQUEST },
});

// An import sheet is only read, never written to disk.
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAXIMUM_SHEET_FILE_SIZE_BYTES, files: 1 } });

const casesRouter = express.Router();
casesRouter.get("/", casesController.handleListCases);
casesRouter.post("/", casesController.handleCreateCase);
casesRouter.get("/:caseId", requireCaseMiddleware, casesController.handleGetCase);
casesRouter.delete("/:caseId", requireCaseMiddleware, casesController.handleDeleteCase);
casesRouter.post("/:caseId/documents", requireCaseMiddleware, documentsUpload.array("files", MAXIMUM_FILES_PER_REQUEST), caseDocumentsController.handleUploadDocuments);
casesRouter.post("/:caseId/documents/:documentId/assign", requireCaseMiddleware, caseDocumentsController.handleAssignDocument);
casesRouter.post("/:caseId/nominees/swap", requireCaseMiddleware, caseDocumentsController.handleSwapNominees);
casesRouter.get("/:caseId/documents/:documentId/view", requireCaseMiddleware, caseDocumentsController.handleViewDocument);
casesRouter.delete("/:caseId/documents/:documentId", requireCaseMiddleware, caseDocumentsController.handleRemoveDocument);
casesRouter.post("/:caseId/fill", requireCaseMiddleware, casesController.handleFillCase);
casesRouter.get("/:caseId/fields", requireCaseMiddleware, casesController.handleGetCaseFields);
casesRouter.post("/:caseId/decisions", requireCaseMiddleware, casesController.handleRecordDecision);
casesRouter.post("/:caseId/preview", requireCaseMiddleware, casesController.handlePreviewPage);
casesRouter.post("/:caseId/regenerate", requireCaseMiddleware, casesController.handleRegenerateCase);
casesRouter.get("/:caseId/pdf", requireCaseMiddleware, casesController.handleDownloadPdf);
casesRouter.post("/:caseId/confirm", requireCaseMiddleware, handleConfirmCase);
casesRouter.post("/:caseId/sheet-import", requireCaseMiddleware, sheetUpload.single("file"), handleImportCaseSheet);

export default casesRouter;
