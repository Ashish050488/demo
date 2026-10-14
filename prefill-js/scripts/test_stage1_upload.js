// Stage 1 backend test: exercises /api/upload/* end to end against the two real Aadhaar scans, three bad
// inputs, the confirm/correction/delete flow, and a concurrent-write check on demo_store.xlsx. Prints only
// pass/fail per test - never a field value.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createCanvas } from "canvas";
import XLSX from "xlsx";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4556;
const BASE = `http://127.0.0.1:${PORT}`;
const STORE_PATH = path.join(ROOT, "data", "demo_store.xlsx");
const UPLOADS_DIR = path.join(ROOT, "data", "uploads");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/upload/supported-forms`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

async function waitForScanStatus(caseId, nominee, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(`${BASE}/api/upload/${caseId}/status`);
    const body = await r.json();
    const scan = body.scans?.[String(nominee)];
    if (scan && scan.status !== "processing") return scan;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("OCR status never left 'processing'");
}

const MIME_BY_EXT = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".txt": "text/plain" };

async function uploadFile(url, filePath, fieldName = "file") {
  const buf = await readFile(filePath);
  const type = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const form = new FormData();
  form.append(fieldName, new Blob([buf], { type }), path.basename(filePath));
  return fetch(url, { method: "POST", body: form });
}

async function makeBlankJpeg() {
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 600, 400);
  const p = path.join(ROOT, "data", "uploads", "_test_blank.jpg");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, canvas.toBuffer("image/jpeg"));
  return p;
}

async function makeWrongTypeFile() {
  const p = path.join(ROOT, "data", "uploads", "_test_wrong_type.txt");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, "not a real document");
  return p;
}

async function readXlsxRows(sheetName) {
  const book = XLSX.readFile(STORE_PATH);
  const sheet = book.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "" }) : [];
}

async function main() {
  await rm(STORE_PATH, { force: true });
  await rm(UPLOADS_DIR, { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  try {
    await waitForServer();

    // ---- test 1: unsupported form (an Aadhaar scan PDF submitted as a "blank form") ----
    {
      const r = await uploadFile(`${BASE}/api/upload/detect-form`, path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"));
      check("unsupported form is rejected (422, no case created)", r.status === 422);
    }

    // ---- test 2: wrong file type on detect-form ----
    {
      const wrongType = await makeWrongTypeFile();
      const r = await uploadFile(`${BASE}/api/upload/detect-form`, wrongType);
      check("wrong file type is rejected (415)", r.status === 415);
    }

    // ---- create the real CRN case for the rest of the tests ----
    const detectR = await uploadFile(`${BASE}/api/upload/detect-form`, path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
    const detectBody = await detectR.json();
    check("blank CRN form is detected", detectR.status === 200 && detectBody.formType === "crn");
    const caseId = detectBody.caseId;

    // ---- test: upload + OCR for the two real scans ----
    const scan1R = await uploadFile(`${BASE}/api/upload/${caseId}/scan/1`, path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"));
    check("scan upload for nominee 1 accepted", scan1R.status === 200);
    const scan1 = await waitForScanStatus(caseId, 1);
    check("OCR on real scan 1 recognizes it as an Aadhaar card", scan1.status === "done");

    const scan2R = await uploadFile(`${BASE}/api/upload/${caseId}/scan/2`, path.join(ROOT, "data", "Proofs", "Aadhaar Neha new.pdf"));
    check("scan upload for nominee 2 accepted", scan2R.status === 200);
    const scan2 = await waitForScanStatus(caseId, 2);
    check("OCR on real scan 2 recognizes it as an Aadhaar card", scan2.status === "done");

    // ---- test: non-Aadhaar image ----
    const blankJpeg = await makeBlankJpeg();
    const scan3R = await uploadFile(`${BASE}/api/upload/${caseId}/scan/3`, blankJpeg);
    check("non-Aadhaar image upload accepted", scan3R.status === 200);
    const scan3 = await waitForScanStatus(caseId, 3);
    check('non-Aadhaar image is flagged "doesn\'t look like an Aadhaar card"', scan3.status === "not_aadhaar");

    // ---- fill run ----
    const runR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("fill run succeeds", runR.status === 200);

    // ---- confirm writes one row to Cases ----
    const confirmR = await fetch(`${BASE}/api/upload/${caseId}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { name_n1: "x", name_n2: "y" } }),
    });
    const confirmBody = await confirmR.json();
    check("confirm succeeds and reports scans deleted", confirmR.status === 200 && confirmBody.scansDeleted === true);
    let casesRows = await readXlsxRows("Cases");
    check("confirm wrote exactly one row to Cases", casesRows.filter((r) => r.case_id === caseId).length === 1);
    const scansDirGone = await readFile(path.join(UPLOADS_DIR, caseId, "nominee1.pdf")).then(() => false).catch(() => true);
    check("confirm auto-deleted the case's uploaded scans", scansDirGone);

    // ---- correction adds a row to Corrections ----
    const correctR = await fetch(`${BASE}/api/upload/${caseId}/correct`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "name_n1", oldValue: "x", newValue: "z" }),
    });
    check("correction request succeeds", correctR.status === 200);
    const corrections = await readXlsxRows("Corrections");
    check("correction added a row to Corrections", corrections.some((r) => r.case_id === caseId && r.field === "name_n1"));
    casesRows = await readXlsxRows("Cases");
    check("correction updated the Cases row's field", casesRows.find((r) => r.case_id === caseId)?.name_n1 === "z");

    // ---- delete removes the case's rows and files ----
    const deleteR = await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    check("delete request succeeds", deleteR.status === 200);
    const statusAfterDelete = await fetch(`${BASE}/api/upload/${caseId}/status`);
    check("case is gone from the manifest after delete", statusAfterDelete.status === 404);
    casesRows = await readXlsxRows("Cases");
    check("delete removed the case's Cases row", !casesRows.some((r) => r.case_id === caseId));
    const correctionsAfterDelete = await readXlsxRows("Corrections");
    check("delete removed the case's Corrections rows", !correctionsAfterDelete.some((r) => r.case_id === caseId));

    // ---- two simultaneous confirms don't corrupt the file ----
    const d2 = await uploadFile(`${BASE}/api/upload/detect-form`, path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
    const case2Id = (await d2.json()).caseId;
    const [c1, c2] = await Promise.all([
      fetch(`${BASE}/api/upload/${case2Id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { name_n1: "a" } }) }),
      fetch(`${BASE}/api/upload/${case2Id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: { name_n1: "b" } }) }),
    ]);
    check("both concurrent confirm requests completed", c1.status === 200 && c2.status === 200);
    let parseOk = true;
    let concurrentRows = [];
    try {
      concurrentRows = await readXlsxRows("Cases");
    } catch {
      parseOk = false;
    }
    check("demo_store.xlsx is still a valid, readable workbook after concurrent writes", parseOk);
    check("concurrent confirms produced exactly one Cases row for that case (no duplication/corruption)",
      concurrentRows.filter((r) => r.case_id === case2Id).length === 1);

    await fetch(`${BASE}/api/upload/${case2Id}`, { method: "DELETE" });
  } finally {
    server.kill();
    await rm(path.join(ROOT, "data", "uploads", "_test_blank.jpg"), { force: true });
    await rm(path.join(ROOT, "data", "uploads", "_test_wrong_type.txt"), { force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("test script crashed:", err);
  process.exit(1);
});
