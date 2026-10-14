// Saves a confirmed case into the Google Sheet through the Apps Script web app in apps-script/Code.gs.
// One tab per form; columns follow the form's own mapping order (mappings/*.json), with readable headings.
// Settings (web-app URL + shared secret) live in data/sheets.json - data/ is gitignored, never committed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { CRN_FORM, CAMS_FORM } from "../src/mapping_config.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS_PATH = path.join(ROOT, "data", "sheets.json");

const FORMS = {
  crn: { tab: "CRN Broking & Demat", formConfig: CRN_FORM, mappingPath: path.join(ROOT, "mappings", "crn-broking-demat.json") },
  cams: { tab: "CAMS Mutual Fund", formConfig: CAMS_FORM, mappingPath: path.join(ROOT, "mappings", "cams-nomination.json") },
};

const WORDS = {
  name: "Name", share_pct: "Share %", relationship: "Relationship", relationship_option: "Relationship",
  relationship_other: "Relationship (if Others)", address: "Address", city: "City", state: "State", pincode: "Pincode",
  country: "Country", state_country: "State & Country", mobile: "Mobile", email: "Email", dob: "Date of birth",
  id_type: "ID type", nominee_id_type: "ID type", id_number: "ID number", id_details: "Aadhaar (last 4)",
  id_aadhaar_last4: "Aadhaar (last 4)", id_pan: "PAN", id_passport: "Passport no.", id_dl: "Driving licence no.",
  guardian_name: "Guardian name", guardian_address: "Guardian address", guardian_city: "Guardian city",
  guardian_state: "Guardian state", guardian_pincode: "Guardian pincode", guardian_country: "Guardian country",
  guardian_mobile: "Guardian mobile", guardian_email: "Guardian email", guardian_pan: "Guardian PAN",
  guardian_id_type: "Guardian ID type", applicant_name: "Applicant name", broking_code: "Broking code", dp_id: "DP ID",
  client_id: "Client ID", crn: "CRN", fund_name: "Fund name", folio_no: "Folio no.", investor_name: "Investor name",
  wish_to_nominate: "Wish to nominate", form_date: "Form date",
};
const word = (k) => WORDS[k] || k.replace(/_/g, " ");

export async function getSettings() {
  try { return JSON.parse(await readFile(SETTINGS_PATH, "utf-8")); } catch { return null; }
}

export async function saveSettings({ url, secret }) {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify({ url, secret }, null, 2));
}

/** [{key, label}] in the order the form prints them (nominee 1, nominee 2; nominee 3 not used in this demo). */
export async function columnsFor(formType) {
  const def = FORMS[formType];
  const mapping = JSON.parse(await readFile(def.mappingPath, "utf-8"));
  const cols = [{ key: "case_id", label: "Case ID" }, { key: "saved_at", label: "Saved at" }];
  const seen = new Set(cols.map((c) => c.key));
  const push = (key, label) => { if (!seen.has(key)) { seen.add(key); cols.push({ key, label }); } };
  const header = mapping.fields.filter((f) => f.nominee == null && !/^guardian/.test(f.key));
  for (const f of header) push(f.key, word(f.key));
  for (const t of def.formConfig.tickboxes) if (!t.perNominee && !/^guardian/.test(t.key)) push(t.key, word(t.key));
  for (const n of [1, 2]) {
    for (const f of mapping.fields.filter((g) => g.nominee === n)) push(`${f.key}_n${n}`, `Nominee ${n} – ${word(f.key)}`);
    for (const t of def.formConfig.tickboxes) if (t.perNominee) push(`${t.key}_n${n}`, `Nominee ${n} – ${word(t.key)}`);
  }
  for (const f of mapping.fields.filter((g) => g.nominee == null && /^guardian/.test(g.key))) push(f.key, word(f.key));
  for (const t of def.formConfig.tickboxes) if (/^guardian/.test(t.key)) push(t.key, word(t.key));
  return cols;
}

async function post(settings, body) {
  const res = await fetch(settings.url, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script needs a "simple" request
    body: JSON.stringify({ ...body, secret: settings.secret }), redirect: "follow",
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Google Sheet didn't answer as expected (HTTP ${res.status}) - check the web-app URL and that it's deployed with access "Anyone"`); }
  if (!json.ok) throw new Error(`Google Sheet refused the save: ${json.error}`);
  return json;
}

export async function testConnection(settings) {
  return post(settings, { ping: true });
}

/** fields: {fieldKey: value}. Returns {tab, row, saved, columns}. */
export async function saveToSheet({ caseId, formType, fields }) {
  const settings = await getSettings();
  if (!settings?.url) throw Object.assign(new Error("Google Sheet not connected yet - connect it in the box above the Save button"), { code: "NO_SHEET" });
  const headers = await columnsFor(formType);
  const row = { case_id: caseId, saved_at: new Date().toLocaleString("en-IN"), ...fields };
  const res = await post(settings, { tab: FORMS[formType].tab, headers, row });
  return { tab: res.tab, row: res.row, saved: Object.keys(fields).length, columns: headers.length };
}
