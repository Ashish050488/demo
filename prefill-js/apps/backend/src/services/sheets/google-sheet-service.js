// Saves a confirmed case into the Google Sheet through the Apps Script web app in
// tools/google-apps-script/Code.gs - one tab per form, one row per case (re-saving updates the row). The
// web-app URL and shared secret live in data/google-sheet-settings.json (gitignored).
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { DATA_DIRECTORY } from "../../config/paths-config.js";
import { fetchFormRules } from "../forms/form-files-service.js";
import { buildSheetColumns } from "./sheet-columns-helpers.js";

const SETTINGS_PATH = path.join(DATA_DIRECTORY, "google-sheet-settings.json");
export const SHEET_ERROR_CODES = { NOT_CONNECTED: "GOOGLE_SHEET_NOT_CONNECTED", REFUSED: "GOOGLE_SHEET_REFUSED" };

export async function fetchSheetSettings() {
  try { return JSON.parse(await readFile(SETTINGS_PATH, "utf-8")); } catch { return null; }
}

export async function saveSheetSettings({ url, secret }) {
  await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify({ url, secret }, null, 2));
}

async function postToSheet(settings, requestBody) {
  const response = await fetch(settings.url, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script needs a "simple" request
    body: JSON.stringify({ ...requestBody, secret: settings.secret }), redirect: "follow",
  });
  const responseText = await response.text();
  let sheetReply;
  try { sheetReply = JSON.parse(responseText); } catch {
    throw Object.assign(new Error(`Google Sheet didn't answer as expected (HTTP ${response.status}) - check the web-app URL and that it's deployed with access "Anyone"`), { code: SHEET_ERROR_CODES.REFUSED });
  }
  if (!sheetReply.ok) throw Object.assign(new Error(`Google Sheet refused the save: ${sheetReply.error}`), { code: SHEET_ERROR_CODES.REFUSED });
  return sheetReply;
}

export function testSheetConnection(settings) {
  return postToSheet(settings, { ping: true });
}

/** fieldValues must already be privacy-filtered. Returns {tabName, rowNumber}. */
export async function saveCaseToSheet({ caseId, formId, fieldValues }) {
  const settings = await fetchSheetSettings();
  if (!settings?.url) throw Object.assign(new Error("Google Sheet not connected yet - connect it above the Save button"), { code: SHEET_ERROR_CODES.NOT_CONNECTED });
  const { sheetTabName } = await fetchFormRules(formId);
  const headers = await buildSheetColumns(formId);
  const sheetRow = { case_id: caseId, saved_at: new Date().toLocaleString("en-IN"), ...fieldValues };
  const sheetReply = await postToSheet(settings, { tab: sheetTabName, headers, row: sheetRow });
  return { tabName: sheetReply.tab, rowNumber: sheetReply.row };
}
