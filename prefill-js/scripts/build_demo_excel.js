// Build data/demo_data.xlsx: one row per case (CAMS 360 ONE, CAMS HDFC, CRN Broking & Demat), one column per
// field whose mapping source is "excel" (account/nominee/guardian fields - the ones NOT read off an Aadhaar
// scan). Values are read from the filled sample PDFs at runtime via the same diff machinery the mapping step
// used (src/mapbuilder.js's extractFieldValues) and go straight into the workbook - nothing is typed into
// this script or printed to the console.
import path from "node:path";
import { readFile } from "node:fs/promises";
import XLSX from "xlsx";

import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";
import { extractFieldValues } from "../src/mapbuilder.js";

const OUT = "data/demo_data.xlsx";

const CASES = [
  { case: "CAMS 360 ONE", form: CAMS_FORM, sample: "data/Investment/MF/Nomination_Form - cams-360 ONE.pdf" },
  { case: "CAMS HDFC", form: CAMS_FORM, sample: "data/Investment/MF/Nomination_Form - cams-HDFC.pdf" },
  { case: "CRN Broking & Demat", form: CRN_FORM, sample: "data/Caliber & Demat/Modification in Nomination in CRN Broking and Demat.pdf" },
];

async function loadMapping(form) {
  const p = path.join("mappings", `${form.id}.json`);
  return JSON.parse(await readFile(p, "utf-8"));
}

function columnName(field) {
  return field.nominee != null ? `${field.key}_n${field.nominee}` : field.key;
}

/** Column headers, in a stable order: every field that is "excel"-sourced for at least one nominee column,
 * de-duplicated across both mappings. A nominee-level field always gets all three _n1/_n2/_n3 columns, even
 * though nominee 3's own mapping entry is source "UNSURE" (position extrapolated, never actually filled in
 * any sample) - that's exactly the one the task wants left empty, not omitted. */
async function buildColumns() {
  const columns = [];
  const seen = new Set();
  for (const form of [CRN_FORM, CAMS_FORM]) {
    const mapping = await loadMapping(form);
    for (const field of mapping.fields) {
      if (field.source !== "excel") continue;
      if (field.nominee != null) {
        for (const n of [1, 2, 3]) {
          const name = `${field.key}_n${n}`;
          if (seen.has(name)) continue;
          seen.add(name);
          columns.push({ name, key: field.key, nominee: n });
        }
      } else {
        const name = field.key;
        if (seen.has(name)) continue;
        seen.add(name);
        columns.push({ name, key: field.key, nominee: null });
      }
    }
  }
  return columns;
}

async function buildRow(columns, { form, sample }) {
  const values = await extractFieldValues(form, sample);
  const row = {};
  for (const col of columns) {
    const colKey = col.nominee != null ? String(col.nominee) : "_";
    row[col.name] = values[col.key]?.[colKey] ?? "";
  }
  return row;
}

async function main() {
  const columns = await buildColumns();
  const headers = ["case", ...columns.map((c) => c.name)];

  const rows = [];
  for (const c of CASES) {
    const row = await buildRow(columns, c);
    rows.push({ case: c.case, ...row });
  }

  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "demo_data");
  XLSX.writeFile(book, OUT);

  console.log(`columns (${headers.length}): ${headers.join(", ")}`);
  for (let i = 0; i < CASES.length; i++) {
    const row = rows[i];
    let filled = 0, empty = 0;
    for (const h of headers) {
      if (h === "case") continue;
      if (String(row[h] ?? "").trim()) filled++;
      else empty++;
    }
    console.log(`${CASES[i].case}: ${filled} filled, ${empty} empty`);
  }
  console.log(`\nwrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
