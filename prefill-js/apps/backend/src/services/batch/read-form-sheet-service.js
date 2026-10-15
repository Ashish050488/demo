// Reads an Excel/CSV for one form and checks it really is for that form - shared by "Fill from Excel" (one case)
// and the batch upload (one case per row).
import { fetchFormRules } from "../forms/form-files-service.js";
import { buildBatchColumns } from "./batch-columns-helpers.js";
import { readSheetFile, SheetFileError } from "./read-sheet-file-service.js";
import { matchSheetColumns } from "./column-matching-helpers.js";
import { listSheetRows } from "./sheet-row-values-service.js";

const MINIMUM_MATCHED_FIELD_COUNT = 2;
const MAXIMUM_FOREIGN_KEY_SHARE = 0.25;

/** {rows, sheetName, batchColumns, columnMatch, sheetRows}; throws SheetFileError with a plain reason. */
export async function readFormSheet(formId, fileBytes, fileName, { isCombinedSheet = false } = {}) {
  const { rows, sheetName } = await readSheetFile(fileBytes, fileName);
  const batchColumns = await buildBatchColumns(formId);
  const columnMatch = matchSheetColumns(rows, batchColumns);
  const { label: formLabel } = await fetchFormRules(formId);

  const keyRowCellCount = columnMatch.matchedFieldCount + columnMatch.unknownHeadings.length;
  // A combined sheet (several forms) carries the other forms' columns too - those are expected, not foreign.
  if (!isCombinedSheet && columnMatch.isOurTemplate && columnMatch.unknownHeadings.length > keyRowCellCount * MAXIMUM_FOREIGN_KEY_SHARE) {
    throw new SheetFileError(`This looks like the template for a different form (it has ${columnMatch.unknownHeadings.slice(0, 3).join(", ")}…). Download the template for ${formLabel}.`);
  }
  if (columnMatch.matchedFieldCount < MINIMUM_MATCHED_FIELD_COUNT) {
    throw new SheetFileError(`None of the column headings match ${formLabel}. Use the Excel template from Form setup, or name the columns like the form's fields.`);
  }
  const sheetRows = listSheetRows(rows, columnMatch);
  if (!sheetRows.length) throw new SheetFileError("The sheet has headings but no client rows.");
  return { rows, sheetName, batchColumns, columnMatch, sheetRows };
}
