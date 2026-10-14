// POST /api/cases/:caseId/sheet-import - fill this case's non-document fields from one row of an Excel/CSV.
// Multipart: "file" (.xlsx or .csv) and an optional "rowNumber". With several client rows and no rowNumber, the
// answer lists the rows so the reviewer can pick one; the file is then sent again with the chosen row.
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { groupCaseDocuments } from "../../services/documents/group-documents-service.js";
import { importSheetIntoCase } from "../../services/batch/import-case-sheet-service.js";
import { SheetFileError } from "../../services/batch/read-sheet-file-service.js";

export async function handleImportCaseSheet(request, response) {
  if (!request.file) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "No file uploaded");
  // A saved case already went to the Google Sheet and its scans were deleted - changing it silently from a file
  // would make the sheet and the case disagree.
  if (request.caseEntry.confirmedAt) throw new ApiError(409, "CASE_ALREADY_SAVED", "This case is already saved - start a new case to import a sheet");
  const rawRowNumber = request.body?.rowNumber;
  const requestedRowNumber = rawRowNumber == null || rawRowNumber === "" ? null : Number(rawRowNumber);
  if (requestedRowNumber != null && (!Number.isInteger(requestedRowNumber) || requestedRowNumber < 1)) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "rowNumber must be a sheet row number");
  }
  try {
    const importResult = await importSheetIntoCase(request.caseEntry, request.file.buffer, request.file.originalname, requestedRowNumber);
    // Nominee names from the sheet decide which person's documents are Nominee 1, 2, 3.
    if (!importResult.needsRowChoice) await groupCaseDocuments(request.caseEntry.id);
    sendData(response, importResult);
  } catch (error) {
    if (error instanceof SheetFileError) throw new ApiError(422, "SHEET_NOT_USABLE", error.message);
    throw error;
  }
}
