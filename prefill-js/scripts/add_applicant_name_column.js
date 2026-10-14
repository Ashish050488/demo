// Fix 3: add an applicant_name column to the CRN row of demo_data.xlsx, read from the CRN filled sample at
// runtime (extractFieldValues, same diff machinery as every other column) - never typed in.
import XLSX from "xlsx";
import { CRN_FORM } from "../src/mapping_config.js";
import { extractFieldValues } from "../src/mapbuilder.js";

const FILE = "data/demo_data.xlsx";
const SHEET = "demo_data";

const values = await extractFieldValues(CRN_FORM, CRN_FORM.filledSamples[0].path);
const applicantName = values.applicant_name?.["_"] ?? "";

const book = XLSX.readFile(FILE);
const rows = XLSX.utils.sheet_to_json(book.Sheets[SHEET], { defval: "" });

let updated = 0;
for (const row of rows) {
  if (row.case === "CRN Broking & Demat") {
    row.applicant_name = applicantName;
    updated++;
  } else if (!("applicant_name" in row)) {
    row.applicant_name = ""; // keep the sheet rectangular
  }
}

const headers = [...Object.keys(rows[0]).filter((h) => h !== "applicant_name"), "applicant_name"];
const newSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
book.Sheets[SHEET] = newSheet;
XLSX.writeFile(book, FILE);

console.log(`added applicant_name column; set on ${updated} row(s)`);
