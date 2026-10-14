// The append-only decision log: one JSON line per reviewer decision (data/decisions.jsonl, gitignored). A
// correction lives only here; every fill and regenerate reads the latest decision per field on top.
import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DATA_DIRECTORY } from "../../config/paths-config.js";

const DECISION_LOG_PATH = path.join(DATA_DIRECTORY, "decisions.jsonl");

export const DECISION_KINDS = { CORRECTED: "corrected", SKIPPED: "skipped" };

export async function recordDecision({ caseId, field, decision, value, note, who }) {
  const decisionRow = {
    case: caseId, field, decision, value: value ?? null,
    note: note || null, who: who || null, timestamp: new Date().toISOString(),
  };
  await mkdir(path.dirname(DECISION_LOG_PATH), { recursive: true });
  await appendFile(DECISION_LOG_PATH, JSON.stringify(decisionRow) + "\n", "utf-8");
  return decisionRow;
}

async function readAllDecisions() {
  try {
    const logText = await readFile(DECISION_LOG_PATH, "utf-8");
    return logText.split("\n").filter((line) => line.trim()).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** {field -> latest decision row} for one case. */
export async function fetchLatestDecisionsByField(caseId) {
  const latestByField = {};
  for (const decisionRow of await readAllDecisions()) if (decisionRow.case === caseId) latestByField[decisionRow.field] = decisionRow;
  return latestByField;
}

/** {field -> corrected value} for one case - what the fill uses in place of a read or empty value. */
export async function fetchCorrectedValues(caseId) {
  const correctedValues = {};
  for (const [field, decisionRow] of Object.entries(await fetchLatestDecisionsByField(caseId))) {
    if (decisionRow.decision === DECISION_KINDS.CORRECTED && decisionRow.value) correctedValues[field] = decisionRow.value;
  }
  return correctedValues;
}
