// Reads an uploaded .xlsx or .csv into plain rows of cell text. Picks the "Clients" sheet when there is one,
// otherwise the first visible sheet that has data. Never trusts the file: unknown types, old .xls, password-
// protected or broken files all come back as a clear SheetFileError.
import path from "node:path";
import ExcelJS from "exceljs";
import { readCellText } from "./cell-value-helpers.js";

export const MAXIMUM_SHEET_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAXIMUM_SHEET_ROWS = 1000;
const PREFERRED_SHEET_NAME = "clients";
const ZIP_FILE_SIGNATURE = "PK"; // every .xlsx is a zip
const OLD_EXCEL_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // .xls and password-protected .xlsx

export class SheetFileError extends Error {}

/** One CSV line set -> rows of text. Handles quotes, "" escapes and line breaks inside quotes. */
function parseCsvText(csvText) {
  const firstLine = csvText.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let currentRow = [];
  let currentCell = "";
  let isInsideQuotes = false;
  for (let characterIndex = 0; characterIndex < csvText.length; characterIndex += 1) {
    const character = csvText[characterIndex];
    if (isInsideQuotes) {
      if (character === '"' && csvText[characterIndex + 1] === '"') { currentCell += '"'; characterIndex += 1; }
      else if (character === '"') isInsideQuotes = false;
      else currentCell += character;
    } else if (character === '"') isInsideQuotes = true;
    else if (character === delimiter) { currentRow.push(currentCell); currentCell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && csvText[characterIndex + 1] === "\n") characterIndex += 1;
      currentRow.push(currentCell); rows.push(currentRow); currentRow = []; currentCell = "";
    } else currentCell += character;
  }
  if (currentCell || currentRow.length) { currentRow.push(currentCell); rows.push(currentRow); }
  return rows.map((row) => row.map((cellText) => readCellText({ value: cellText })));
}

function pickWorksheet(workbook) {
  const visibleSheets = workbook.worksheets.filter((worksheet) => worksheet.state !== "hidden" && worksheet.state !== "veryHidden");
  return visibleSheets.find((worksheet) => worksheet.name.trim().toLowerCase() === PREFERRED_SHEET_NAME && worksheet.actualRowCount > 0)
    || visibleSheets.find((worksheet) => worksheet.actualRowCount > 0) || null;
}

async function readWorkbookRows(fileBytes) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(fileBytes);
  } catch {
    throw new SheetFileError("This Excel file couldn't be opened - it may be damaged. Open it in Excel and save it again as .xlsx.");
  }
  const worksheet = pickWorksheet(workbook);
  if (!worksheet) throw new SheetFileError("The Excel file has no data in any visible sheet.");
  if (worksheet.actualRowCount > MAXIMUM_SHEET_ROWS) throw new SheetFileError(`Too many rows (${worksheet.actualRowCount}). The limit is ${MAXIMUM_SHEET_ROWS}.`);
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) cells.push(readCellText(row.getCell(columnNumber)));
    rows[rowNumber - 1] = cells;
  });
  return { rows: Array.from(rows, (row) => row || []), sheetName: worksheet.name };
}

/** {rows: [[{text, warning}]], sheetName} - row index 0 is the sheet's first row. */
export async function readSheetFile(fileBytes, originalFileName) {
  if (!fileBytes?.length) throw new SheetFileError("The file is empty.");
  if (fileBytes.length > MAXIMUM_SHEET_FILE_SIZE_BYTES) throw new SheetFileError("The file is larger than 5 MB.");
  const extension = path.extname(originalFileName || "").toLowerCase();
  if (fileBytes.subarray(0, 4).equals(OLD_EXCEL_SIGNATURE)) {
    throw new SheetFileError("This is an old .xls file or a password-protected workbook. Remove the password and save it as .xlsx.");
  }
  if (extension === ".csv") {
    const csvRows = parseCsvText(fileBytes.toString("utf-8").replace(/^﻿/, ""));
    if (csvRows.length > MAXIMUM_SHEET_ROWS) throw new SheetFileError(`Too many rows (${csvRows.length}). The limit is ${MAXIMUM_SHEET_ROWS}.`);
    return { rows: csvRows, sheetName: "CSV" };
  }
  if (extension !== ".xlsx" || fileBytes.subarray(0, 2).toString("latin1") !== ZIP_FILE_SIGNATURE) {
    throw new SheetFileError("Please upload an .xlsx or .csv file.");
  }
  return readWorkbookRows(fileBytes);
}
