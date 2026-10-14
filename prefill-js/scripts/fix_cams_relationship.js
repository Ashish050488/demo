// FIX A: CAMS's relationship field has no text position (it's checkbox-only - see mapping_config.js's note on
// CAMS_FORM.tickboxes.relationship_option), so build_demo_excel.js left relationship_n1/_n2 empty for both
// CAMS rows. The CRN row's relationship_n1/_n2 came from CRN's free-text relationship field and describes the
// same two nominees (same people, same forms, same case), so we copy those two cells across - by script,
// reading the existing workbook, never typing a value here.
import XLSX from "xlsx";

const FILE = "data/demo_data.xlsx";
const SHEET = "demo_data";

const book = XLSX.readFile(FILE);
const sheet = book.Sheets[SHEET];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const crnRow = rows.find((r) => r.case === "CRN Broking & Demat");
if (!crnRow) throw new Error("CRN row not found");

let updated = 0;
for (const row of rows) {
  if (!row.case.startsWith("CAMS")) continue;
  for (const col of ["relationship_n1", "relationship_n2"]) {
    if (!row[col] && crnRow[col]) {
      row[col] = crnRow[col];
      updated++;
    }
  }
}

const headers = Object.keys(rows[0]);
const newSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
book.Sheets[SHEET] = newSheet;
XLSX.writeFile(book, FILE);

console.log(`updated ${updated} cell(s) across the CAMS rows (relationship_n1/_n2, copied from the CRN row)`);
