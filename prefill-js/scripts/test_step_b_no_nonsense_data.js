// Step B verification: demo_data.xlsx fields must start empty ("not_provided") for an upload case, and only
// appear after POST /sample-data. Prints pass/fail only, no values.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4561;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok) { results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); }

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/upload/supported-forms`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

const EXCEL_FIELD_NAMES = ["fund_name", "folio_no", "investor_name", "share_pct_n1", "mobile_n1", "email_n1", "guardian_name", "relationship_option_n1"];

async function main() {
  await rm(path.join(ROOT, "data", "demo_store.xlsx"), { force: true });
  await rm(path.join(ROOT, "data", "uploads"), { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    const form = new FormData();
    const blankFormBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Nomination_Form - cams.pdf"));
    form.append("file", new Blob([blankFormBuf], { type: "application/pdf" }), "blank.pdf");
    const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
    const { caseId } = await detectR.json();
    await fetch(`${BASE}/api/upload/${caseId}/variant`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: "360one" }),
    });

    // ---- before pressing the button ----
    const runR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("fill run succeeds with no sample data loaded", runR.status === 200);
    let caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    const excelFields = caseData.fields.filter((f) => EXCEL_FIELD_NAMES.includes(f.field));
    check("every excel-sourced field has no value before the button is pressed", excelFields.every((f) => f.value == null));
    check('every excel-sourced field is status "not_provided" before the button is pressed', excelFields.every((f) => f.status === "not_provided"));

    const statusBefore = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    check("useSampleData starts false", statusBefore.useSampleData === false);

    // ---- press "Fill with sample demo data" ----
    const sampleR = await fetch(`${BASE}/api/upload/${caseId}/sample-data`, { method: "POST" });
    check("sample-data endpoint succeeds", sampleR.status === 200 && (await sampleR.json()).useSampleData === true);
    await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    const excelFieldsAfter = caseData.fields.filter((f) => EXCEL_FIELD_NAMES.includes(f.field));
    check("excel-sourced fields with real demo data have a value after the button is pressed", excelFieldsAfter.some((f) => f.value != null));
    check('fields filled this way are labelled "demo data (sample)" as their source', excelFieldsAfter.filter((f) => f.value != null).every((f) => f.source_file === "demo data (sample)"));

    // ---- Aadhaar-sourced fields are unaffected by the sample-data gate ----
    const aadhaarFields = caseData.fields.filter((f) => f.group === "aadhaar");
    check("Aadhaar-sourced fields are untouched by the sample-data flag (still their own needs_review/missing status, not not_provided)",
      aadhaarFields.every((f) => f.status !== "not_provided"));

    await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
  } finally {
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error("test script crashed:", err); process.exit(1); });
