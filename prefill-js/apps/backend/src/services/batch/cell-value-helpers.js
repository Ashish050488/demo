// Turns one spreadsheet cell (whatever Excel stored: number, date, rich text, formula, hyperlink...) into the
// plain text a form field expects - without the usual Excel damage (lost leading zeros, 9.87E+09 mobiles,
// dates turned into serial numbers, 50% stored as 0.5).
const EXCEL_ERROR_PATTERN = /^#(REF|VALUE|N\/A|NAME\?|DIV\/0|NUM|NULL)!?$/i;
const MAXIMUM_CELL_TEXT_LENGTH = 300;

export const CELL_WARNINGS = {
  FORMULA_ERROR: "formula error in the cell - left empty",
  TOO_LONG: `longer than ${MAXIMUM_CELL_TEXT_LENGTH} characters - cut`,
};

function formatDayMonthYear(date) {
  // exceljs gives dates as UTC midnight; read UTC parts so the day never shifts by time zone.
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

/** 2004-03-17, 17-03-2004, 17.03.2004, 17/3/2004 -> 17/03/2004. Anything else is returned unchanged. */
export function normalizeDateText(text) {
  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) return `${isoMatch[3].padStart(2, "0")}/${isoMatch[2].padStart(2, "0")}/${isoMatch[1]}`;
  const dayFirstMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dayFirstMatch) return `${dayFirstMatch[1].padStart(2, "0")}/${dayFirstMatch[2].padStart(2, "0")}/${dayFirstMatch[3]}`;
  return text;
}

function numberToPlainText(numericValue, numberFormat) {
  if (numberFormat && numberFormat.includes("%")) return String(Math.round(numericValue * 10000) / 100); // 0.5 shown as 50%
  if (Number.isInteger(numericValue)) return BigInt(numericValue).toString(); // never 9.87654321E+09
  return String(numericValue);
}

/** {text, warning} for one exceljs cell. Empty cells give text "". */
export function readCellText(cell) {
  let rawValue = cell?.value;
  if (rawValue == null) return { text: "", warning: null };
  if (typeof rawValue === "object" && !(rawValue instanceof Date)) {
    if ("error" in rawValue) return { text: "", warning: CELL_WARNINGS.FORMULA_ERROR };
    if ("result" in rawValue) rawValue = rawValue.result; // formula: use its computed result
    else if ("richText" in rawValue) rawValue = rawValue.richText.map((textRun) => textRun.text).join("");
    else if ("text" in rawValue) rawValue = rawValue.text; // hyperlink
  }
  if (rawValue == null) return { text: "", warning: null };
  if (rawValue instanceof Date) return { text: formatDayMonthYear(rawValue), warning: null };
  if (typeof rawValue === "number") return { text: numberToPlainText(rawValue, cell.numFmt), warning: null };
  if (typeof rawValue === "boolean") return { text: rawValue ? "Yes" : "No", warning: null };
  let text = String(rawValue).replace(/^﻿/, "").replace(/^'/, "").replace(/\s+/g, " ").trim();
  if (EXCEL_ERROR_PATTERN.test(text)) return { text: "", warning: CELL_WARNINGS.FORMULA_ERROR };
  let warning = null;
  if (text.length > MAXIMUM_CELL_TEXT_LENGTH) { text = text.slice(0, MAXIMUM_CELL_TEXT_LENGTH); warning = CELL_WARNINGS.TOO_LONG; }
  return { text, warning };
}
