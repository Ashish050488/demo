// One spreadsheet row -> the values a case gets, plus a report of everything that needed attention.
// Privacy rules applied here, before anything is stored: a full Aadhaar number is cut to its last 4 digits,
// and PAN values are split out (they are kept in memory only, never in the case store on disk).
import { validatorFor } from "@prefill/shared";
import { normalizeDateText } from "./cell-value-helpers.js";
import { normalizeHeadingText } from "./column-matching-helpers.js";
import { CLIENT_REFERENCE_COLUMN_KEY } from "./batch-columns-helpers.js";

const DATE_BASE_KEYS = new Set(["dob", "form_date"]);
const AADHAAR_BASE_KEYS = new Set(["id_details", "id_aadhaar_last4"]);
const PAN_BASE_KEYS = new Set(["id_pan", "guardian_pan"]);
const PAN_VALUE_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const DISPLAY_NAME_KEYS = ["name_n1", "investor_name", "applicant_name"];

// Everyday words for a printed option: "wife" is the form's "Spouse", "dl" its "Driving License".
const OPTION_SYNONYMS = {
  wife: "spouse", husband: "spouse", partner: "spouse", dad: "father", papa: "father", mom: "mother", mum: "mother", mummy: "mother",
  dl: "drivinglicense", drivinglicence: "drivinglicense", licence: "drivinglicense", license: "drivinglicense",
};

/** "Aadhaar" / "aadhar card" / "PAN card" / "wife" -> the form's own option text, or null. */
export function matchOptionText(typedText, options) {
  const normalizedText = normalizeHeadingText(typedText).replace(/card$/, "").replace(/aadhar/, "aadhaar");
  const typedKey = OPTION_SYNONYMS[normalizedText] || normalizedText;
  if (!typedKey) return null;
  return options.find((option) => normalizeHeadingText(option) === typedKey)
    || options.find((option) => normalizeHeadingText(option).startsWith(typedKey) || typedKey.startsWith(normalizeHeadingText(option).replace(/last4.*$/, "")))
    || null;
}

/** Data rows that have anything in them: [{rowNumber, clientReference, displayName, filledCount}]. */
export function listSheetRows(rows, columnMatch) {
  const sheetRows = [];
  for (let rowIndex = columnMatch.firstDataRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const valueByKey = {};
    for (const [columnIndex, fieldKey] of columnMatch.columnKeyByIndex) {
      const cellText = rows[rowIndex]?.[columnIndex]?.text;
      if (cellText) valueByKey[fieldKey] = cellText;
    }
    const filledCount = Object.keys(valueByKey).filter((fieldKey) => fieldKey !== CLIENT_REFERENCE_COLUMN_KEY).length;
    if (!filledCount && !valueByKey[CLIENT_REFERENCE_COLUMN_KEY]) continue; // blank row
    sheetRows.push({
      rowNumber: rowIndex + 1, clientReference: valueByKey[CLIENT_REFERENCE_COLUMN_KEY] || null, filledCount,
      displayName: DISPLAY_NAME_KEYS.map((fieldKey) => valueByKey[fieldKey]).find(Boolean) || null,
    });
  }
  return sheetRows;
}

/** {typedValues, panValues, clientReference, report} for one sheet row (rowNumber is the sheet's own number). */
export function buildRowValues(rows, rowNumber, columnMatch, batchColumns) {
  const columnByKey = new Map(batchColumns.map((batchColumn) => [batchColumn.key, batchColumn]));
  const typedValues = {};
  const panValues = {};
  const report = { invalidValues: [], unmatchedOptions: [], mappedToOthers: [], aadhaarCutToLast4: [], cellWarnings: [] };
  const otherTextByKey = {};
  let clientReference = null;

  for (const [columnIndex, fieldKey] of columnMatch.columnKeyByIndex) {
    const cell = rows[rowNumber - 1]?.[columnIndex];
    if (cell?.warning) report.cellWarnings.push({ field: fieldKey, warning: cell.warning });
    let cellText = cell?.text || "";
    if (!cellText) continue;
    if (fieldKey === CLIENT_REFERENCE_COLUMN_KEY) { clientReference = cellText; continue; }
    const batchColumn = columnByKey.get(fieldKey);
    const baseKey = batchColumn.baseKey;

    if (batchColumn.options) {
      const matchedOption = matchOptionText(cellText, batchColumn.options);
      // A form with "Others" + an "if Others" line (CAMS relationship): tick Others and write the word there.
      const othersKey = fieldKey.replace(/_option(_n\d+)?$/, "_other$1");
      if (!matchedOption && batchColumn.options.includes("Others") && othersKey !== fieldKey && columnByKey.has(othersKey)) {
        report.mappedToOthers.push({ field: fieldKey, value: cellText });
        otherTextByKey[othersKey] = cellText;
        cellText = "Others";
      } else if (!matchedOption) {
        report.unmatchedOptions.push({ field: fieldKey, value: cellText, allowed: batchColumn.options });
        continue;
      } else {
        cellText = matchedOption;
      }
    }
    if (DATE_BASE_KEYS.has(baseKey)) cellText = normalizeDateText(cellText);
    if (baseKey === "share_pct") cellText = cellText.replace(/\s*%$/, "");
    const digitsOnly = cellText.replace(/[\s-]/g, "");
    if (AADHAAR_BASE_KEYS.has(baseKey) || (baseKey === "id_number" && /^\d{12}$/.test(digitsOnly))) {
      const lastFourDigits = digitsOnly.replace(/\D/g, "").slice(-4);
      if (digitsOnly.replace(/\D/g, "").length > 4) report.aadhaarCutToLast4.push(fieldKey); // never keep a full Aadhaar
      cellText = lastFourDigits || cellText;
    }
    const upperCaseText = cellText.toUpperCase().replace(/\s/g, "");
    if (PAN_BASE_KEYS.has(baseKey) || PAN_VALUE_PATTERN.test(upperCaseText)) {
      panValues[fieldKey] = upperCaseText;
    } else {
      typedValues[fieldKey] = cellText;
    }
    const check = validatorFor(baseKey)?.(PAN_BASE_KEYS.has(baseKey) ? upperCaseText : cellText);
    if (check && !check.valid) report.invalidValues.push({ field: fieldKey, value: PAN_BASE_KEYS.has(baseKey) ? "PAN (hidden)" : cellText, reason: check.reason });
  }
  // The "if Others" line gets the original word - unless the sheet filled that column itself.
  for (const [othersKey, otherText] of Object.entries(otherTextByKey)) if (!typedValues[othersKey]) typedValues[othersKey] = otherText;
  return { typedValues, panValues, clientReference, report };
}
