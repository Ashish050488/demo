// The append-only decision log: one JSON line per decision, under data/ (gitignored). Never edits the
// original results.json or demo_data.xlsx - a correction lives only here until "Regenerate PDF" reads it.
import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DECISIONS_LOG } from "./cases.js";

export async function record({ caseId, field, decision, value, note, who }) {
  const row = {
    case: caseId, field, decision, value: value ?? null,
    note: note || null, who: who || null, timestamp: new Date().toISOString(),
  };
  await mkdir(path.dirname(DECISIONS_LOG), { recursive: true });
  await appendFile(DECISIONS_LOG, JSON.stringify(row) + "\n", "utf-8");
  return row;
}

export async function readAll() {
  try {
    const text = await readFile(DECISIONS_LOG, "utf-8");
    return text.split("\n").filter((l) => l.trim()).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/** {field -> latest decision row} for one case. */
export async function latestByField(caseId) {
  const rows = await readAll();
  const out = {};
  for (const r of rows) if (r.case === caseId) out[r.field] = r;
  return out;
}
