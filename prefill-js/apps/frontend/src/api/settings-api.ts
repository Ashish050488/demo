import { requestJson, sendJson } from "./http-client";

export interface SheetSettings {
  isConnected: boolean;
  url: string;
}

export const fetchSheetSettings = () => requestJson<SheetSettings>("/settings/google-sheet");
export const updateSheetSettings = (url: string, secret: string) => sendJson<SheetSettings>("/settings/google-sheet", "PUT", { url, secret });
