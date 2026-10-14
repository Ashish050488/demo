"use client";
import { useState } from "react";
import { updateSheetSettings, type SheetSettings } from "@/api/settings-api";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

interface SheetConnectionBoxProps {
  sheetSettings: SheetSettings;
  onSettingsChange: (sheetSettings: SheetSettings) => void;
}

/** Connect the Google Sheet once: paste the Apps Script web-app URL and the shared SECRET. */
export default function SheetConnectionBox({ sheetSettings, onSettingsChange }: SheetConnectionBoxProps) {
  const [isEditing, setIsEditing] = useState(!sheetSettings.isConnected);
  const [webAppUrl, setWebAppUrl] = useState(sheetSettings.url);
  const [secret, setSecret] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleConnect() {
    setStatusMessage("Testing the connection…");
    try {
      const savedSettings = await updateSheetSettings(webAppUrl.trim(), secret);
      onSettingsChange(savedSettings);
      setIsEditing(false);
      setStatusMessage(null);
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  if (!isEditing) {
    return (
      <Card className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="h-2 w-2 rounded-full bg-brand-500" /> Google Sheet connected
        <Button size="small" variant="ghost" className="ml-auto" onClick={() => setIsEditing(true)}>Change</Button>
      </Card>
    );
  }
  return (
    <Card className="p-4 text-sm">
      <div className="font-semibold">Connect your Google Sheet (one time)</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
        <li>Open the Google Sheet, then Extensions → Apps Script.</li>
        <li>Paste the code from <code>tools/google-apps-script/Code.gs</code>, set SECRET to any long text, and Save.</li>
        <li>Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.</li>
        <li>Paste the Web app URL and your SECRET below.</li>
      </ol>
      <div className="mt-3 grid gap-2">
        <input value={webAppUrl} onChange={(event) => setWebAppUrl(event.target.value)} placeholder="https://script.google.com/macros/s/…/exec"
          className="h-9 rounded-lg border border-line px-3 outline-none focus:border-brand-500" />
        <input value={secret} onChange={(event) => setSecret(event.target.value)} type="password" placeholder="The SECRET from the script"
          className="h-9 rounded-lg border border-line px-3 outline-none focus:border-brand-500" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" size="small" onClick={handleConnect}>Test & connect</Button>
        {statusMessage ? <span className="text-xs text-muted">{statusMessage}</span> : null}
      </div>
    </Card>
  );
}
