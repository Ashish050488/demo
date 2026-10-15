// /api/forms
import express from "express";
import multer from "multer";
import { requireFormMiddleware } from "../../middleware/require-form-middleware.js";
import { ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import * as formsController from "./forms-controller.js";
import * as formDraftsController from "./form-drafts-controller.js";

const MAXIMUM_BLANK_FORM_SIZE_BYTES = 15 * 1024 * 1024;

// The uploaded blank form is only read to recognise it - its bytes never touch disk.
const blankFormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMUM_BLANK_FORM_SIZE_BYTES },
  fileFilter: (request, file, callback) => {
    const isPdf = file.mimetype === "application/pdf" && /\.pdf$/i.test(file.originalname);
    callback(isPdf ? null : new ApiError(415, ERROR_CODES.UNSUPPORTED_FILE_TYPE, "Please upload the blank form as a PDF file"), isPdf);
  },
});

const formsRouter = express.Router();
formsRouter.get("/", formsController.handleListForms);
// Add a form: the blank is kept (for previews); a filled sample is read in memory and never written to disk.
formsRouter.post("/drafts", blankFormUpload.fields([{ name: "blank", maxCount: 1 }, { name: "filled", maxCount: 1 }]), formDraftsController.handleCreateFormDraft);
formsRouter.get("/drafts/:draftId", formDraftsController.handleGetFormDraft);
formsRouter.get("/drafts/:draftId/pages/:pageNumber", formDraftsController.handleGetDraftPageImage);
formsRouter.post("/drafts/:draftId/create", express.json({ limit: "2mb" }), formDraftsController.handleCreateFormFromDraft);
formsRouter.delete("/drafts/:draftId", formDraftsController.handleDeleteFormDraft);
formsRouter.post("/detect", blankFormUpload.single("file"), formsController.handleDetectForm);
formsRouter.get("/combined-batch-template", formsController.handleDownloadCombinedBatchTemplate);
formsRouter.get("/:formId/rules", requireFormMiddleware, formsController.handleGetFormRules);
formsRouter.put("/:formId/required-fields", requireFormMiddleware, formsController.handleUpdateRequiredFields);
formsRouter.get("/:formId/field-sources", requireFormMiddleware, formsController.handleGetFieldSources);
formsRouter.get("/:formId/mapping", requireFormMiddleware, formsController.handleGetFormMapping);
formsRouter.get("/:formId/sheet-columns", requireFormMiddleware, formsController.handleGetSheetColumns);
formsRouter.get("/:formId/batch-template", requireFormMiddleware, formsController.handleDownloadBatchTemplate);
formsRouter.get("/:formId/batch-columns", requireFormMiddleware, formsController.handleGetBatchColumns);
formsRouter.get("/:formId/pages/:pageNumber", requireFormMiddleware, formsController.handleGetBlankPageImage);

export default formsRouter;
