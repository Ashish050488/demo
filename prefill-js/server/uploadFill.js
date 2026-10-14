// The fill run for an upload-driven case. Every nominee field comes from that nominee's profile
// (server/profile.js), built from whatever documents they uploaded (Aadhaar, PAN, passport, driving licence) -
// the form only knows profile keys, never document types. Fields no document can supply (share %, mobile,
// email, fund/folio, guardian...) come from demo_data.xlsx once "Fill with sample demo data" is pressed, or
// are typed on the review screen. Tick boxes use the shared src/tickboxRules.js.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import XLSX from "xlsx";

import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";
import { fillTextFields } from "../src/fillengine.js";
import { applyCrnTickboxes, applyCamsTickboxes } from "../src/tickboxRules.js";
import { validatorFor, validateIdNumberFor } from "../src/fieldValidate.js";
import { uploadPdfPath, uploadResultsPath } from "./uploads.js";
import { latestByField } from "./decisions.js";
import { buildProfile, ID_TYPE_PRIORITY } from "./profile.js";
import { rereadMissingIdDocs } from "./idRead.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const EXCEL_PATH = path.join(ROOT, "data", "demo_data.xlsx");

const FORM_DEFS = {
  crn: { formConfig: CRN_FORM, mappingPath: path.join(ROOT, "mappings", "crn-broking-demat.json") },
  cams: { formConfig: CAMS_FORM, mappingPath: path.join(ROOT, "mappings", "cams-nomination.json") },
};

function excelRowFor(formType, camsVariant, rows) {
  const caseLabel = formType === "crn" ? "CRN Broking & Demat" : camsVariant === "hdfc" ? "CAMS HDFC" : "CAMS 360 ONE";
  return rows.find((r) => r.case === caseLabel) || null;
}

export async function runUploadFill(entry) {
  const def = FORM_DEFS[entry.formType];
  if (!def) throw new Error(`unsupported form type "${entry.formType}"`);
  // The variant only matters for picking a demo_data.xlsx row, so it's only required once sample data is
  // actually requested - without that, excelRowFor() would otherwise silently default to 360 ONE.
  if (entry.formType === "cams" && entry.useSampleData && !entry.camsVariant) throw new Error("CAMS variant not chosen yet");

  const mapping = JSON.parse(await readFile(def.mappingPath, "utf-8"));
  const book = XLSX.readFile(EXCEL_PATH);
  const rows = XLSX.utils.sheet_to_json(book.Sheets["demo_data"], { defval: "" });
  const row = excelRowFor(entry.formType, entry.camsVariant, rows);
  if (!row) throw new Error("no matching demo_data.xlsx row for this form/variant");

  let anyNomineeAadhaarLast4 = false;

  const decisions = await latestByField(entry.id);
  const overrides = {};
  for (const [k, d] of Object.entries(decisions)) if (d.decision === "corrected" && d.value) overrides[k] = d.value;

  // One profile per nominee from whatever they uploaded (server/profile.js) - the form below only ever asks
  // the profile, never a specific document type.
  await rereadMissingIdDocs(entry);
  const profiles = {};
  const docsOf = (n) => entry.documents.filter((d) => d.assignedNominee === n);
  for (const n of [1, 2]) profiles[n] = buildProfile(docsOf(n));

  const ID_OPTION = entry.formType === "crn"
    ? { pan: "PAN", passport: "Passport", dl: "Driving License", aadhaarLast4: "Aadhaar (last 4)" }
    : { pan: "PAN", aadhaarLast4: "Aadhaar (masked last 4 digits)", passport: "Passport", dl: "Driving License" };
  const ID_KIND = Object.fromEntries(Object.entries(ID_OPTION).map(([k, v]) => [v, k]));
  const ID_LABEL = { pan: "PAN card", aadhaarLast4: "Aadhaar", passport: "passport", dl: "driving licence" };
  // Which ID this nominee's form uses: the reviewer's pick, else the first ID whose number we actually read.
  const idKindFor = (n) => {
    const pick = entry.formType === "crn" ? overrides.nominee_id_type : overrides[`id_type_n${n}`];
    if (pick && ID_KIND[pick]) return ID_KIND[pick];
    return ID_TYPE_PRIORITY.find((k) => profiles[n]?.[k]) || null;
  };
  const idTypes = {};
  for (const n of [1, 2]) { const k = idKindFor(n); if (k) idTypes[n] = ID_OPTION[k]; }
  anyNomineeAadhaarLast4 = Boolean(profiles[1]?.aadhaarLast4 || profiles[2]?.aadhaarLast4);

  // form field key -> profile key
  // form field -> document data key, from mappings/field-sources.json (the same file the UI shows)
  const sources = JSON.parse(await readFile(path.join(ROOT, "mappings", "field-sources.json"), "utf-8"))[entry.formType] || {};
  const PROFILE_KEY = {};
  for (const [field, src] of Object.entries(sources)) {
    const m = /^document\.(\w+)$/.exec(src);
    if (m && m[1] !== "idNumber") PROFILE_KEY[field] = m[1];
  }
  const ID_ROW_KIND = { id_pan: "pan", id_passport: "passport", id_dl: "dl", id_details: "aadhaarLast4" };
  const fromProfile = (n, key) => {
    const p = profiles[n] || {};
    const got = p[key] || (key === "street" ? p.address : null);
    return got ? { value: got.value, confidence: got.confidence, sourceFile: null, from: got.from } : null;
  };

  const flagged = {}; // field -> reason
  const getValue = async (field) => {
    if (field.nominee === 3) return { skipReason: "nominee 3 not supported in this demo", notApplicable: true };
    if (field.source === "UNSURE" || field.x == null) {
      return { skipReason: field.source === "UNSURE" ? "source UNSURE" : "no mapped position" };
    }
    if (field.source === "today") {
      const d = new Date();
      return { value: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`, sourceFile: "today's date" };
    }
    const n = field.nominee;
    if (n != null && (PROFILE_KEY[field.key] || field.key === "id_number")) {
      const hasDocs = docsOf(n).length > 0;
      const missing = hasDocs
        ? "not found on this nominee's documents - type it, or add a document that shows it"
        : "no document assigned to this nominee yet";
      let got;
      if (field.key === "id_number") {
        const kind = idKindFor(n);
        got = kind ? fromProfile(n, kind) : null;
        if (!got) return { skipReason: kind ? `ID type is ${ID_OPTION[kind]}, but no ${ID_LABEL[kind]} number was read` : missing };
      } else {
        got = fromProfile(n, PROFILE_KEY[field.key]);
        // Form says "tick one ID and give only that number" - other ID rows stay blank but say what was read.
        const rowKind = ID_ROW_KIND[field.key];
        if (rowKind && idKindFor(n) !== rowKind) {
          return got
            ? { skipReason: `Read from ${ID_LABEL[rowKind]} - change ID type to ${ID_OPTION[rowKind]} to use it`, notApplicable: true }
            : { skipReason: `Only needed if ID type is ${ID_OPTION[rowKind]}`, notApplicable: true };
        }
      }
      if (got) {
        // Keep the value but flag it - a wrong value read from a document is shown in red with the reason,
        // never silently hidden (e.g. a pincode misread as 5 digits).
        const check = field.key === "id_number" ? validateIdNumberFor(ID_OPTION[idKindFor(n)], got.value) : validatorFor(field.key)?.(got.value);
        if (check && !check.valid) flagged[`${field.key}_n${n}`] = check.reason;
        return got;
      }
      if (field.source !== "excel" || !entry.useSampleData) return { skipReason: missing };
    }
    if (field.source === "excel" || field.source === "aadhaar" || field.source === "profile" || field.source === "pan") {
      if (!entry.useSampleData) {
        return { skipReason: 'Not provided - type it, or press "Fill with sample demo data" to load an example', notProvided: true };
      }
      const col = n != null ? `${field.key}_n${n}` : field.key;
      const cell = row?.[col];
      if (!cell) return { skipReason: "empty cell in demo_data.xlsx", notApplicable: true };
      return { value: String(cell), sourceFile: "demo data (sample)" };
    }
    return { skipReason: `unhandled source "${field.source}"` };
  };

  const { pdfDoc, pages, results } = await fillTextFields(def.formConfig, mapping, getValue);
  for (const r of results) {
    if (flagged[r.field] && r.value != null) { r.status = "invalid"; r.reason = `Read from the document, but: ${flagged[r.field]} - please correct it`; }
  }
  // which document each value came from, for the review screen's source chip
  for (const r of results) {
    const m = r.field.match(/^(.*)_n(\d)$/);
    if (!m || r.value == null || r.source_file) continue;
    const key = m[1] === "id_number" ? idKindFor(Number(m[2])) : PROFILE_KEY[m[1]];
    const src = key && (profiles[Number(m[2])]?.[key] || (key === "street" ? profiles[Number(m[2])]?.address : null));
    if (src?.from) r.source_file = src.from;
    if (src?.docId) r.source_doc = src.docId;
  }


  // A reviewer's tick choice REPLACES the rule's choice (never a second tick next to it).
  if (entry.formType === "crn") {
    results.push(...applyCrnTickboxes(pages, { anyNomineeAadhaarLast4, idType: idTypes[1], overrides }));
  } else {
    results.push(...applyCamsTickboxes(pages, row, { useSampleData: entry.useSampleData, idTypes, overrides }));
  }

  const outBytes = await pdfDoc.save();
  await mkdir(path.dirname(uploadPdfPath(entry.id)), { recursive: true });
  await writeFile(uploadPdfPath(entry.id), outBytes);
  await writeFile(uploadResultsPath(entry.id), JSON.stringify(results, null, 2));

  return { results };
}
