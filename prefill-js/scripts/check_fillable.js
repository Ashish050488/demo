// Step 3: do either blank form have real fillable AcroForm fields? pdf-lib's getForm().getFields() is the
// authoritative check - if it returns none, any "typed" text in a filled sample was placed by overlaying text
// at fixed coordinates with some other tool, not by filling form fields, which is exactly what the mapping
// (build_mapping.js) assumes.
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

const FORMS = [
  { label: "CRN Broking & Demat (blank)", path: "data/Blank Forms/Modification in Nomination in CRN Broking Demat.pdf" },
  { label: "CAMS nomination (blank)", path: "data/Blank Forms/Nomination_Form - cams.pdf" },
];

for (const { label, path } of FORMS) {
  console.log(`\n=== ${label} ===`);
  const bytes = await readFile(path);
  const doc = await PDFDocument.load(bytes);
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch (err) {
    console.log("getForm() threw:", err.message);
    continue;
  }
  console.log(`${fields.length} field(s)` + (fields.length === 0 ? " - no AcroForm fields to fill" : ""));
  for (const f of fields) console.log(" -", f.getName(), "|", f.constructor.name);
}
