// Stage 2 integration test: exercises the exact API sequence the new wizard screens drive (ui/views/upload*.js,
// review.js, decide.js), end to end, since the Claude in Chrome browser tool was unavailable this session - see
// the report for what this does and does not cover. Pass/fail only, no values printed.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createCanvas } from "canvas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4558;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(ROOT, "data", "demo_store.xlsx");
const UPLOADS_DIR = path.join(ROOT, "data", "uploads");

const results = [];
function check(name, ok) {
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

async function waitForScanStatus(caseId, nominee, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    const scan = body.scans?.[String(nominee)];
    if (scan && scan.status !== "processing") return scan;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("OCR status never left 'processing'");
}

const MIME_BY_EXT = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".txt": "text/plain" };
async function uploadFile(url, filePath, method = "POST") {
  const buf = await readFile(filePath);
  const type = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), path.basename(filePath));
  return fetch(url, { method, body: form });
}

async function postJson(url, body, method = "POST") {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// Mirrors ui/views/review.js's requiredDecided()/reviewStats() and ui/views/uploadConfirm.js's effectiveValue(),
// so this script exercises the same data shapes the real screens depend on, not a simplified stand-in.
function effectiveValue(f) {
  if (f.decision && f.decision.kind === "corrected" && f.decision.value != null && f.decision.value !== "") return f.decision.value;
  return f.group === "tickbox" ? f.option_chosen : f.value;
}
function requiredDecided(fields) {
  const required = fields.filter((f) => f.group === "aadhaar");
  const done = required.filter((f) => f.decision && f.decision.kind !== "skipped");
  return { done: done.length, total: required.length };
}

async function makeBlankJpeg(name) {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 600, 400);
  const p = path.join(ROOT, "data", "uploads", name);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, canvas.toBuffer("image/jpeg"));
  return p;
}

async function makeWrongTypeFile() {
  const p = path.join(ROOT, "data", "uploads", "_t2_wrong_type.txt");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, "not a real document");
  return p;
}

async function main() {
  await rm(STORE_PATH, { force: true });
  await rm(UPLOADS_DIR, { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    // ---- static UI serving sanity (what the browser would load first) ----
    const indexRes = await fetch(`${BASE}/`);
    const indexHtml = await indexRes.text();
    check("index.html serves and names itself a demo with test data", indexRes.ok && /demo with test data/i.test(indexHtml));
    check("app.js (the router module) serves", (await fetch(`${BASE}/app.js`)).ok);
    check("desk.css serves", (await fetch(`${BASE}/desk.css`)).ok);

    // ---- step 1 bad inputs: unsupported form, wrong file type ----
    const unsupportedR = await uploadFile(`${BASE}/api/upload/detect-form`, path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"));
    check("step 1: unsupported form is rejected (422)", unsupportedR.status === 422);

    const wrongTypeR = await uploadFile(`${BASE}/api/upload/detect-form`, await makeWrongTypeFile());
    check("step 1: wrong file type is rejected (415)", wrongTypeR.status === 415);

    // ---- step 1 happy path: detect the real blank CRN form ----
    const detectR = await uploadFile(`${BASE}/api/upload/detect-form`, path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
    const { caseId, formType, needsVariant } = await detectR.json();
    check("step 1: blank CRN form detected, no variant needed", detectR.ok && formType === "crn" && needsVariant === false);

    // ---- step 2: nominee 1 gets a real scan, nominee 2 is deliberately left empty ("missing nominee"),
    //      nominee 3 gets a non-Aadhaar image ----
    const scan1R = await uploadFile(`${BASE}/api/upload/${caseId}/scan/1`, path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"));
    check("step 2: scan upload for nominee 1 accepted", scan1R.status === 200);
    const scan1 = await waitForScanStatus(caseId, 1);
    check("step 2: real scan 1 reads as an Aadhaar card", scan1.status === "done");

    const blankJpeg = await makeBlankJpeg("_t2_blank.jpg");
    const scan3R = await uploadFile(`${BASE}/api/upload/${caseId}/scan/3`, blankJpeg);
    check("step 2: non-Aadhaar image upload accepted", scan3R.status === 200);
    const scan3 = await waitForScanStatus(caseId, 3);
    check('step 2: non-Aadhaar image flagged "doesn\'t look like an Aadhaar card"', scan3.status === "not_aadhaar");

    // ---- step 2 -> step 3: run the fill (as "Continue" does) ----
    const runR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("step 2->3: fill run succeeds with nominee 2 missing", runR.status === 200);

    // ---- step 3: review screen's data shape + the missing-nominee + gating behaviour ----
    let caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    const fields = caseData.fields;
    check("step 3: fields carry group/box/decision shape the review screen expects",
      fields.every((f) => "group" in f && "decision" in f && "status" in f));

    const missingN2 = fields.filter((f) => f.group === "aadhaar" && f.field.endsWith("_n2") && f.value == null);
    check("step 3: nominee 2's Aadhaar fields show as missing (no scan uploaded)", missingN2.length > 0);

    let { done, total } = requiredDecided(fields);
    check("step 3: continue-to-confirm gate starts closed (not all Aadhaar fields decided)", done < total);

    // approve every Aadhaar field that has a value (nominee 1's real scan)
    for (const f of fields.filter((x) => x.group === "aadhaar" && x.value != null)) {
      await postJson(`${BASE}/api/cases/${caseId}/decide`, { item: f.field, kind: "approved", who: "tester" });
    }
    // correct nominee 2's missing fields by hand, exactly as a reviewer would from the "Missing" state -
    // the Aadhaar last-4 field only accepts 4 digits, matching decide.js's client-side rule.
    for (const f of missingN2) {
      const isLast4 = f.field.startsWith("id_aadhaar_last4");
      await postJson(`${BASE}/api/cases/${caseId}/decide`, { item: f.field, kind: "corrected", value: isLast4 ? "9999" : "test value", who: "tester" });
    }

    caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    ({ done, total } = requiredDecided(caseData.fields));
    check("step 3: continue-to-confirm gate opens once every Aadhaar field is approved or corrected", done === total && total > 0);

    // ---- step 4: confirm, mirroring uploadConfirm.js's field-gathering exactly ----
    const rows = caseData.fields.filter((f) => f.status !== "not_applicable" && effectiveValue(f) != null);
    const hasGuardianPan = rows.some((f) => f.field === "guardian_pan");
    check("step 4: the confirm payload includes guardian_pan from demo data (client sends it)", hasGuardianPan);

    const confirmFields = {};
    for (const f of rows) confirmFields[f.field] = String(effectiveValue(f));
    const confirmR = await postJson(`${BASE}/api/upload/${caseId}/confirm`, { fields: confirmFields });
    const confirmBody = await confirmR.json();
    check("step 4: confirm succeeds and reports scans deleted", confirmR.status === 200 && confirmBody.scansDeleted === true);

    const downloadR = await fetch(`${BASE}/api/cases/${caseId}/download/original`);
    check("step 4: 'Download filled PDF' link serves a PDF", downloadR.ok && (downloadR.headers.get("content-type") || "").includes("pdf"));

    // ---- step 5: saved records, masked, and PAN never persisted (policy #3) ----
    const recordsBody = await (await fetch(`${BASE}/api/upload/records`)).json();
    const savedRow = recordsBody.rows.find((r) => r.case_id === caseId);
    check("step 5: the confirmed case appears in saved records", Boolean(savedRow));
    check("step 5: Aadhaar last-4 is masked in the records view", savedRow && /^XXXX XXXX \d{4}$/.test(savedRow.id_aadhaar_last4_n1 || ""));
    check("step 5: guardian_pan (a PAN field) was never written to the store despite being in the confirm payload",
      savedRow && !("guardian_pan" in savedRow));

    // a page image render for an upload case, through the same route the review screen's page viewer uses
    const pageImgR = await fetch(`${BASE}/api/cases/${caseId}/page/1`);
    check("review screen's page-image route serves an upload case's PDF page", pageImgR.ok && (pageImgR.headers.get("content-type") || "").includes("png"));

    // ---- step 5 delete button ----
    const deleteR = await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    check("step 5: delete request succeeds", deleteR.status === 200);
    const recordsAfterDelete = await (await fetch(`${BASE}/api/upload/records`)).json();
    check("step 5: delete removes the row from saved records", !recordsAfterDelete.rows.some((r) => r.case_id === caseId));
  } finally {
    server.kill();
    await rm(path.join(ROOT, "data", "uploads", "_t2_blank.jpg"), { force: true });
    await rm(path.join(ROOT, "data", "uploads", "_t2_wrong_type.txt"), { force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("test script crashed:", err);
  process.exit(1);
});
