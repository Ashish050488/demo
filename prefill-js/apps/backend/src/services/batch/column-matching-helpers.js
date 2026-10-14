// Works out which spreadsheet column is which form field. Our own template carries exact field keys in row 2;
// a client's own sheet only has readable headings, so those are matched forgivingly: case, spaces and
// punctuation ignored, common synonyms known ("Name of the fund" = fund_name), nominee number read from text
// like "Nominee 2 Mobile", "2nd nominee - mobile" or "mobile_n2". A heading without a nominee number is nominee 1.
import { FIELD_LABELS } from "@prefill/shared";

const HEADER_SEARCH_ROW_COUNT = 5;
const MINIMUM_KEY_MATCH_SHARE = 0.3;
const SYNONYMS = {
  client_reference: ["client reference", "reference", "client ref", "client code", "folder", "folder name"],
  name: ["name of nominee", "name of the nominee", "nominee name", "full name"],
  dob: ["date of birth", "birth date", "dob"],
  share_pct: ["share", "share percentage", "percentage", "share percent", "allocation"],
  relationship: ["relation", "relationship with applicant"],
  relationship_option: ["relation", "relationship", "relationship with applicant"],
  address: ["address line", "street", "nominee address", "residential address"],
  pincode: ["pin", "pin code", "postal code", "zip", "zip code"],
  mobile: ["mobile number", "mobile no", "phone", "phone number", "contact number", "tel no", "telephone"],
  email: ["email id", "e mail", "mail", "email address"],
  fund_name: ["name of the fund", "scheme name", "fund", "amc name"],
  folio_no: ["folio", "folio number"],
  investor_name: ["investor", "name of investor", "unit holder", "holder name"],
  dp_id: ["depository participant id"],
  client_id: ["beneficiary id", "bo id", "demat client id"],
  id_type: ["id type", "identity type", "proof type", "id proof"],
  nominee_id_type: ["id type", "identity type", "proof type", "nominee id type"],
  id_pan: ["pan", "pan number", "pan no"],
  id_details: ["aadhaar", "aadhaar last 4", "aadhar", "aadhar last 4"],
  id_passport: ["passport", "passport number", "passport no"],
  id_dl: ["driving licence", "driving license", "dl number", "licence number", "license number"],
  id_number: ["id number", "identity number", "proof number"],
  state_country: ["state and country"],
};

export const normalizeHeadingText = (text) => String(text || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** "Nominee 2 - Mobile" -> {nomineeNumber: 2, rest: "mobile"}; "mobile_n3" -> {3, "mobile"}. */
function splitNomineeNumber(headingText) {
  const patterns = [/_n(\d)\s*$/i, /\bnominee\s*[-#:]?\s*(\d)\b/i, /\b(\d)\s*(?:st|nd|rd|th)?\s*nominee\b/i, /\(\s*(\d)\s*\)\s*$/];
  for (const pattern of patterns) {
    const match = headingText.match(pattern);
    if (match) return { nomineeNumber: Number(match[1]), rest: headingText.replace(match[0], " ") };
  }
  return { nomineeNumber: null, rest: headingText };
}

function buildLabelLookup(batchColumns) {
  const lookup = new Map(); // normalized label -> base key (first one wins, so form fields beat synonyms)
  const baseKeys = [...new Set(batchColumns.map((batchColumn) => batchColumn.baseKey))];
  const addLabel = (labelText, baseKey) => { const normalizedLabel = normalizeHeadingText(labelText); if (normalizedLabel && !lookup.has(normalizedLabel)) lookup.set(normalizedLabel, baseKey); };
  for (const baseKey of baseKeys) { addLabel(baseKey, baseKey); addLabel(FIELD_LABELS[baseKey], baseKey); }
  for (const baseKey of baseKeys) for (const synonym of SYNONYMS[baseKey] || []) addLabel(synonym, baseKey);
  return lookup;
}

/** The row holding our exact field keys (template row 2), or -1. */
function findKeyRowIndex(rows, columnKeys) {
  for (let rowIndex = 0; rowIndex < Math.min(HEADER_SEARCH_ROW_COUNT, rows.length); rowIndex += 1) {
    const filledCells = rows[rowIndex].filter((cell) => cell.text);
    const keyMatchCount = filledCells.filter((cell) => columnKeys.has(cell.text)).length;
    if (keyMatchCount >= 3 && keyMatchCount >= filledCells.length * MINIMUM_KEY_MATCH_SHARE) return rowIndex;
  }
  return -1;
}

/** {columnKeyByIndex: Map<columnIndex, fieldKey>, firstDataRowIndex, unknownHeadings, duplicateFields, matchedShare} */
export function matchSheetColumns(rows, batchColumns) {
  const columnKeys = new Set(batchColumns.map((batchColumn) => batchColumn.key));
  const columnKeyByIndex = new Map();
  const unknownHeadings = [];
  const duplicateFields = [];
  const assignColumn = (columnIndex, fieldKey) => {
    if ([...columnKeyByIndex.values()].includes(fieldKey)) { duplicateFields.push(fieldKey); return; }
    columnKeyByIndex.set(columnIndex, fieldKey);
  };

  const keyRowIndex = findKeyRowIndex(rows, columnKeys);
  let headingRowIndex = keyRowIndex;
  if (keyRowIndex >= 0) {
    rows[keyRowIndex].forEach((cell, columnIndex) => { if (columnKeys.has(cell.text)) assignColumn(columnIndex, cell.text); else if (cell.text) unknownHeadings.push(cell.text); });
  } else {
    headingRowIndex = rows.findIndex((row, rowIndex) => rowIndex < HEADER_SEARCH_ROW_COUNT && row.some((cell) => cell.text));
    const labelLookup = buildLabelLookup(batchColumns);
    (rows[headingRowIndex] || []).forEach((cell, columnIndex) => {
      if (!cell.text) return;
      const headingText = cell.text.replace(/\*/g, "");
      const { nomineeNumber, rest } = splitNomineeNumber(headingText);
      const normalizedRest = normalizeHeadingText(rest);
      const isGuardian = normalizedRest.startsWith("guardian");
      const baseKey = labelLookup.get(normalizedRest)
        || (isGuardian ? labelLookup.get(`guardian${normalizedRest.replace(/^guardian/, "")}`) : null);
      const candidateKey = baseKey && (nomineeNumber ? `${baseKey}_n${nomineeNumber}` : columnKeys.has(baseKey) ? baseKey : `${baseKey}_n1`);
      if (candidateKey && columnKeys.has(candidateKey)) assignColumn(columnIndex, candidateKey);
      else unknownHeadings.push(cell.text);
    });
  }
  const formFieldColumnCount = [...columnKeyByIndex.values()].filter((fieldKey) => fieldKey !== "client_reference").length;
  return {
    columnKeyByIndex, firstDataRowIndex: Math.max(keyRowIndex, headingRowIndex) + 1, unknownHeadings, duplicateFields,
    matchedFieldCount: formFieldColumnCount, isOurTemplate: keyRowIndex >= 0,
  };
}
