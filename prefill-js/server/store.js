// The demo data store for upload-driven cases: data/demo_store.xlsx (gitignored - data/ is ignored wholesale).
// Replaces, for uploaded cases only, the role demo_data.xlsx + nominee_scan_config.json play for the three
// fixed demo cases (which are untouched - see server/cases.js). Two sheets:
//   Cases       - one row per case_id, written only once the user confirms on the review screen (never on
//                  upload or on the background fill run); wide columns, one per confirmed field.
//   Corrections - append-only: one row per field correction made *after* confirmation, {old_value, new_value}.
//
// All writes are serialized through one in-process queue and go to disk via temp-file-then-rename (atomic on
// the same volume), so two concurrent confirms/corrections can't interleave and corrupt the workbook.
//
// PAN-pattern fields (key matching /pan/i, e.g. guardian_pan) are never written here - the user has not yet
// confirmed a retention policy for them. They stay masked on screen and in logs and are only ever typed in
// directly on the review screen; dropping them here, not upstream, means every caller gets this for free.
import XLSX from "xlsx";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { writeFile, rename, mkdir } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
export const STORE_PATH = path.join(ROOT, "data", "demo_store.xlsx");

const CASES_SHEET = "Cases";
const CORRECTIONS_SHEET = "Corrections";
const PAN_FIELD_RE = /pan/i;
// id_aadhaar_last4/id_details can hold EITHER an Aadhaar last-4 or a PAN number, depending on which document
// supplied it (server/uploadFill.js) - the field NAME alone can't tell them apart, so every value heading
// into the store is also checked by its own shape. A real PAN number must never reach this file regardless
// of which field key it arrived under.
const PAN_VALUE_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
// Same pattern as server/index.js's maskField() - the /api/cases/:case GET the review screen reads from
// already prepends "XXXX XXXX " to these fields for display. Strip it back off before persisting, so the
// store always holds the bare last 4 digits, never a value that's already display-formatted.
const AADHAAR_FIELD_RE = /^(id_aadhaar_last4|id_details|id_number)/;
const MASK_PREFIX_RE = /^XXXX XXXX /;

let queue = Promise.resolve();
/** Chains `fn` after every write/read already queued, so none of them ever overlap on the same file. */
function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {}); // keep the chain alive even if `fn` rejected
  return run;
}

function readWorkbook() {
  try {
    return XLSX.readFile(STORE_PATH);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), CASES_SHEET);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), CORRECTIONS_SHEET);
    return wb;
  }
}

function sheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
}

function setSheet(wb, name, rows) {
  wb.Sheets[name] = XLSX.utils.json_to_sheet(rows);
  if (!wb.SheetNames.includes(name)) wb.SheetNames.push(name);
}

async function writeWorkbook(wb) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const tmp = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, buffer);
  await rename(tmp, STORE_PATH); // atomic swap - a reader never sees a half-written file
}

function cleanFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (PAN_FIELD_RE.test(k)) continue;
    if (typeof v === "string" && PAN_VALUE_RE.test(v.trim().toUpperCase())) continue;
    out[k] = AADHAAR_FIELD_RE.test(k) && typeof v === "string" ? v.replace(MASK_PREFIX_RE, "") : v;
  }
  return out;
}

/** Upserts (by case_id) one row into Cases. Only ever called from the confirm route, after the user has
 * reviewed every field. Returns the row actually written (PAN fields silently dropped). */
export function confirmCase({ caseId, formType, camsVariant, fields }) {
  return serialize(async () => {
    const wb = readWorkbook();
    const rows = sheetRows(wb, CASES_SHEET);
    const row = {
      case_id: caseId, form_type: formType, cams_variant: camsVariant || "",
      confirmed_at: new Date().toISOString(), ...cleanFields(fields),
    };
    const idx = rows.findIndex((r) => r.case_id === caseId);
    if (idx === -1) rows.push(row); else rows[idx] = { ...rows[idx], ...row };
    setSheet(wb, CASES_SHEET, rows);
    await writeWorkbook(wb);
    return row;
  });
}

/** A post-confirmation edit: appends to Corrections and updates the field in the existing Cases row. PAN
 * fields are refused here too (same reason as confirmCase). */
export function recordCorrection({ caseId, field, oldValue, newValue }) {
  return serialize(async () => {
    const looksLikePan = (v) => typeof v === "string" && PAN_VALUE_RE.test(v.trim().toUpperCase());
    if (PAN_FIELD_RE.test(field) || looksLikePan(oldValue) || looksLikePan(newValue)) {
      return { ok: false, skipped: true, reason: "PAN values are never stored" };
    }
    const clean = (v) => (AADHAAR_FIELD_RE.test(field) && typeof v === "string" ? v.replace(MASK_PREFIX_RE, "") : v);
    const wb = readWorkbook();
    const corrections = sheetRows(wb, CORRECTIONS_SHEET);
    corrections.push({
      case_id: caseId, field, old_value: clean(oldValue) ?? "", new_value: clean(newValue) ?? "",
      corrected_at: new Date().toISOString(),
    });
    setSheet(wb, CORRECTIONS_SHEET, corrections);

    const cases = sheetRows(wb, CASES_SHEET);
    const idx = cases.findIndex((r) => r.case_id === caseId);
    if (idx !== -1) {
      cases[idx] = { ...cases[idx], [field]: clean(newValue) ?? "" };
      setSheet(wb, CASES_SHEET, cases);
    }
    await writeWorkbook(wb);
    return { ok: true };
  });
}

/** Removes every row (Cases + Corrections) for one case_id - the Excel-side half of "Delete my uploads". */
export function deleteCaseRows(caseId) {
  return serialize(async () => {
    const wb = readWorkbook();
    setSheet(wb, CASES_SHEET, sheetRows(wb, CASES_SHEET).filter((r) => r.case_id !== caseId));
    setSheet(wb, CORRECTIONS_SHEET, sheetRows(wb, CORRECTIONS_SHEET).filter((r) => r.case_id !== caseId));
    await writeWorkbook(wb);
  });
}

/** Every confirmed case row, for the "Saved records" screen - never the xlsx file itself. */
export function listCases() {
  return serialize(async () => sheetRows(readWorkbook(), CASES_SHEET));
}

export function getCaseRow(caseId) {
  return serialize(async () => sheetRows(readWorkbook(), CASES_SHEET).find((r) => r.case_id === caseId) || null);
}

export function getCorrectionsFor(caseId) {
  return serialize(async () => sheetRows(readWorkbook(), CORRECTIONS_SHEET).filter((r) => r.case_id === caseId));
}
