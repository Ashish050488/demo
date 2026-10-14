// Step: build a field-position mapping for the two blank forms, by diffing each against its filled sample(s).
// Positions come from pdfjs-dist text extraction + diffing (src/pdftext.js, src/difftext.js, src/mapbuilder.js).
// "source" is decided by cross-checking each field's sample value (read transiently, never stored) against
// what our own Aadhaar OCR (step 2, src/aadhaar.js) independently read off Deshna's and Neha's Aadhaar scans -
// not by hardcoding either person's real data into this script.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { createWorker, PSM } from "tesseract.js";

import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";
import { buildMapping, resolveLabels, columnBoundaries, columnOf } from "../src/mapbuilder.js";
import { extractTextItems } from "../src/pdftext.js";
import { onlyInFilled } from "../src/difftext.js";
import { rasterizeFirstPage } from "../src/rasterize.js";
import { groupIntoLines } from "../src/layout.js";
import { extractFields as extractAadhaarFields } from "../src/aadhaar.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA = path.join(HERE, "..", "tessdata");
const AADHAAR_SCANS = [
  { file: "data/Proofs/Aadhaar deshna.pdf" },
  { file: "data/Proofs/Aadhaar Neha new.pdf" },
];

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fuzzyEqual(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Re-OCR both Aadhaar scans (same method as step 2) so we have an independent reference to check form
 * values against - without ever typing Deshna's/Neha's actual data into this script. */
async function ocrAadhaarReferences() {
  const worker = await createWorker(["eng"], 1, { langPath: TESSDATA, gzip: true, cacheMethod: "none" });
  const people = [];
  for (const { file } of AADHAAR_SCANS) {
    const { png } = await rasterizeFirstPage(file, { scale: 3.0 });
    let best = null;
    for (const psm of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
      await worker.setParameters({ tessedit_pageseg_mode: psm });
      const { data } = await worker.recognize(await toTempPng(png));
      const fields = extractAadhaarFields(groupIntoLines(data.words));
      if (!best || (fields.name && !best.name)) best = fields;
      if (fields.name && fields.dob && fields.address && fields.aadhaarLast4) best = fields;
    }
    people.push(best || {});
  }
  await worker.terminate();
  return people; // [deshnaFields, nehaFields]
}

async function toTempPng(png) {
  const os = await import("node:os");
  const { writeFile: wf, mkdtemp } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "map-ocr-"));
  const file = path.join(dir, "p.png");
  await wf(file, png);
  return file;
}

/** Which real person (by their OCR'd Aadhaar fields) sits in each nominee column of this form, decided by
 * comparing the "name" field's actual typed value (read here, not stored) against each person's OCR'd name. */
async function personByColumn(formConfig, aadhaarPeople) {
  const blankItems = await extractTextItems(formConfig.blank);
  const labels = resolveLabels(blankItems, formConfig.labels);
  const nameLabel = labels.find((l) => l.key === "name");
  const boundaries = columnBoundaries(blankItems, formConfig.nomineeHeaderRe);
  const byCol = { 1: null, 2: null, 3: null };
  if (!nameLabel || !nameLabel.found) return byCol;

  for (const sample of formConfig.filledSamples) {
    const filledItems = await extractTextItems(sample.path);
    const typed = onlyInFilled(blankItems, filledItems);
    const nameItems = typed.filter((it) => it.page === nameLabel.page && it.y >= nameLabel.y - 6 && it.y < nameLabel.y + 40);
    const byColItems = { 1: [], 2: [], 3: [] };
    for (const it of nameItems) byColItems[columnOf(it.x, boundaries)].push(it);
    for (const col of [1, 2, 3]) {
      const text = byColItems[col].sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").trim();
      if (!text) continue;
      const match = aadhaarPeople.findIndex((p) => p.name && fuzzyEqual(p.name.value, text));
      if (match !== -1 && !byCol[col]) byCol[col] = match; // 0 = first scan, 1 = second scan
    }
  }
  return byCol;
}

const ACCOUNT_LEVEL = new Set(["broking_code", "dp_id", "client_id", "crn", "fund_name", "folio_no", "investor_name", "applicant_name"]);
const STRUCTURALLY_NON_AADHAAR = new Set(["share_pct", "relationship", "mobile", "email"]);
const GUARDIAN_FIELDS = new Set(["guardian_name", "guardian_address", "guardian_mobile", "guardian_email", "guardian_pan"]);
const IDENTITY_FIELDS = new Set(["name", "dob", "address", "id_aadhaar_last4", "id_details"]);

function makeGetSource(personByCol, aadhaarPeople) {
  return (key, col, sampleValues) => {
    if (ACCOUNT_LEVEL.has(key)) return "excel";
    // POC override: we have no guardian ID scan to cross-check against (so this isn't really verified the
    // way "aadhaar" fields are), but for the demo_data.xlsx step these need a source other than UNSURE to be
    // included as spreadsheet columns. Treating them as "excel" - the only other source this project has.
    if (GUARDIAN_FIELDS.has(key)) return "excel";
    if (STRUCTURALLY_NON_AADHAAR.has(key)) return "excel";
    if (IDENTITY_FIELDS.has(key)) {
      const personIdx = personByCol[col];
      if (personIdx == null) return "UNSURE";
      const person = aadhaarPeople[personIdx];
      const anyValue = Object.values(sampleValues)[0];
      if (key === "id_aadhaar_last4" || key === "id_details") {
        return person.aadhaarLast4 && anyValue && anyValue.includes(person.aadhaarLast4.value) ? "aadhaar" : "UNSURE";
      }
      if (key === "dob") return person.dob && fuzzyEqual(person.dob.value, anyValue) ? "aadhaar" : "UNSURE";
      if (key === "name") return "aadhaar"; // this is how we identified the column in the first place
      if (key === "address") return person.address ? "aadhaar" : "UNSURE"; // address text differs a lot by OCR noise; trust presence
      return "UNSURE";
    }
    return "UNSURE";
  };
}

function printTable(title, fields) {
  console.log(`\n=== ${title} ===`);
  const header = ["field", "nominee", "page", "x", "y", "fontSize", "type", "source"];
  console.log(header.join(" | "));
  for (const f of fields) {
    const type = f.extrapolated ? `${f.type} (extrapolated)` : f.type;
    console.log([f.key, f.nominee ?? "-", f.page, f.x ?? "-", f.y ?? "-", f.fontSize ?? "-", type, f.source].join(" | "));
  }
}

async function main() {
  console.log("OCR'ing both Aadhaar scans as the reference to check form values against...");
  const aadhaarPeople = await ocrAadhaarReferences();

  await mkdir("mappings", { recursive: true });

  for (const formConfig of [CRN_FORM, CAMS_FORM]) {
    const personByCol = await personByColumn(formConfig, aadhaarPeople);
    const getSource = makeGetSource(personByCol, aadhaarPeople);
    const { fields } = await buildMapping(formConfig, getSource);
    printTable(formConfig.title, fields);

    const out = {
      form: formConfig.id,
      title: formConfig.title,
      blank: formConfig.blank,
      fields,
      tickboxes: formConfig.tickboxes,
    };
    const outPath = path.join("mappings", `${formConfig.id}.json`);
    await writeFile(outPath, JSON.stringify(out, null, 2));
    console.log(`\nwrote ${outPath}`);

    console.log("\ntickboxes (see notes for how each was determined):");
    for (const t of formConfig.tickboxes) console.log(` - ${t.key}: ${t.note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
