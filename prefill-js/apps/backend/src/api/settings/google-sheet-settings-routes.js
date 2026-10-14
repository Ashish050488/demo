// /api/settings/google-sheet - connect the Google Sheet once (Apps Script web-app URL + shared secret).
import express from "express";
import { sendData, ApiError, ERROR_CODES } from "../../helpers/api-response-helpers.js";
import { fetchSheetSettings, saveSheetSettings, testSheetConnection } from "../../services/sheets/google-sheet-service.js";

const APPS_SCRIPT_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

async function handleGetSheetSettings(request, response) {
  const settings = await fetchSheetSettings();
  sendData(response, { isConnected: Boolean(settings?.url), url: settings?.url || "" });
}

/** Body: {url, secret} - tested against the sheet before it is saved. */
async function handleUpdateSheetSettings(request, response) {
  const { url, secret } = request.body || {};
  if (!APPS_SCRIPT_URL_PATTERN.test(url || "")) {
    throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "That doesn't look like an Apps Script web-app URL (it should end in /exec)");
  }
  if (!secret) throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, "Enter the SECRET you set in the script");
  try {
    await testSheetConnection({ url, secret });
  } catch (error) {
    throw new ApiError(502, error.code || ERROR_CODES.INTERNAL_ERROR, error.message);
  }
  await saveSheetSettings({ url, secret });
  sendData(response, { isConnected: true, url });
}

const googleSheetSettingsRouter = express.Router();
googleSheetSettingsRouter.get("/", handleGetSheetSettings);
googleSheetSettingsRouter.put("/", handleUpdateSheetSettings);

export default googleSheetSettingsRouter;
