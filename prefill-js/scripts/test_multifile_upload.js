// Slice 1 test: multi-file upload in one request. Uses REAL data where available (the two real Aadhaar scan
// PDFs - full-page, not phone photos) plus synthetic stand-ins CLEARLY LABELED as such for cases where no
// real sample exists (a blank image for "not recognised", a wrong-type .txt, an oversized file). No real
// phone photos of a front/back/PAN card were available for this run - see the report. Prints only
// detected type / QR found / field names filled - never a value.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createCanvas } from "canvas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4560;
const BASE = `http://127.0.0.1:${PORT}`;
const UPLOADS_DIR = path.join(ROOT, "data", "uploads");

const results = [];
function check(name, ok) {
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/upload/supported-forms`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

const MIME_BY_EXT = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".txt": "text/plain" };

async function makeTestFiles() {
  const dir = path.join(ROOT, "data", "_test_input");
  await mkdir(dir, { recursive: true });

  const blankPath = path.join(dir, "synthetic_blank_not_a_document.jpg");
  const canvas = createCanvas(600, 400);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 600, 400);
  await writeFile(blankPath, canvas.toBuffer("image/jpeg"));

  const wrongTypePath = path.join(dir, "synthetic_wrong_type.txt");
  await writeFile(wrongTypePath, "not a document");

  const oversizedPath = path.join(dir, "synthetic_oversized.jpg");
  await writeFile(oversizedPath, Buffer.alloc(16 * 1024 * 1024, 1)); // > 15MB cap

  return { blankPath, wrongTypePath, oversizedPath, dir };
}

async function uploadBatch(caseId, filePaths) {
  const form = new FormData();
  for (const p of filePaths) {
    const buf = await readFile(p);
    const type = MIME_BY_EXT[path.extname(p).toLowerCase()] || "application/octet-stream";
    form.append("files", new Blob([buf], { type }), path.basename(p));
  }
  const r = await fetch(`${BASE}/api/upload/${caseId}/documents`, { method: "POST", body: form });
  return { status: r.status, body: await r.json() };
}

async function waitSettled(caseId, docId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    const doc = status.documents.find((d) => d.id === docId);
    if (doc && doc.status !== "processing") return doc;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("document never left 'processing'");
}

async function main() {
  await rm(path.join(ROOT, "data", "demo_store.xlsx"), { force: true });
  await rm(UPLOADS_DIR, { recursive: true, force: true });
  const { blankPath, wrongTypePath, oversizedPath, dir } = await makeTestFiles();

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    // ---- create a CRN case to upload into ----
    const form = new FormData();
    const blankFormBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
    form.append("file", new Blob([blankFormBuf], { type: "application/pdf" }), "blank.pdf");
    const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
    const { caseId } = await detectR.json();
    check("case created for the batch test", detectR.ok && Boolean(caseId));

    // ---- one batch, 5 files: 2 real full Aadhaar scans (PDF), 1 synthetic "not recognised" image,
    //      1 wrong file type, 1 oversized file - resilience: bad files rejected, good ones still go through ----
    const files = [
      path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"),
      path.join(ROOT, "data", "Proofs", "Aadhaar Neha new.pdf"),
      blankPath,
      wrongTypePath,
      oversizedPath,
    ];
    const batch = await uploadBatch(caseId, files);
    check("batch upload request succeeds", batch.status === 200);
    const byName = Object.fromEntries(batch.body.results.map((r) => [r.filename, r]));

    check("real scan 1 (PDF) accepted", byName["Aadhaar deshna.pdf"]?.accepted === true);
    check("real scan 2 (PDF) accepted", byName["Aadhaar Neha new.pdf"]?.accepted === true);
    check("synthetic blank image accepted (classification happens after, not at upload)", byName["synthetic_blank_not_a_document.jpg"]?.accepted === true);
    check("wrong file type (.txt) rejected on its own", byName["synthetic_wrong_type.txt"]?.accepted === false);
    check("oversized file (>15MB) rejected on its own", byName["synthetic_oversized.jpg"]?.accepted === false);
    check("the 3 good files in the batch still went through despite 2 bad ones", Object.values(byName).filter((r) => r.accepted).length === 3);

    // ---- per-file results after OCR/classification settles ----
    const accepted = batch.body.results.filter((r) => r.accepted);
    const settled = {};
    for (const r of accepted) settled[r.filename] = await waitSettled(caseId, r.docId);

    console.log("\n-- per-file results (no values) --");
    for (const [name, doc] of Object.entries(settled)) {
      console.log(`${name}: status=${doc.status} type=${doc.docType} qrFound=${doc.qrFound}`);
    }
    check("real full scan 1 classified as aadhaar_full or aadhaar_front/back (has real Aadhaar content)", ["aadhaar_full", "aadhaar_front", "aadhaar_back"].includes(settled["Aadhaar deshna.pdf"].docType));
    check("real full scan 2 classified similarly", ["aadhaar_full", "aadhaar_front", "aadhaar_back"].includes(settled["Aadhaar Neha new.pdf"].docType));
    check("synthetic blank image classified as unrecognized (no real content)", settled["synthetic_blank_not_a_document.jpg"].docType === "unrecognized");

    // ---- manual nominee assignment (dropdown), defaults to 1 ----
    const deshnaDoc = accepted.find((r) => r.filename === "Aadhaar deshna.pdf");
    check("new documents default to Nominee 1", settled["Aadhaar deshna.pdf"] && (await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json()).documents.find((d) => d.id === deshnaDoc.docId)?.assignedNominee === 1);
    const assignR = await fetch(`${BASE}/api/upload/${caseId}/documents/${deshnaDoc.docId}/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nominee: 2 }),
    });
    check("manual assignment to a different nominee succeeds", assignR.status === 200);

    // ---- remove a document ----
    const nehaDoc = accepted.find((r) => r.filename === "Aadhaar Neha new.pdf");
    const removeR = await fetch(`${BASE}/api/upload/${caseId}/documents/${nehaDoc.docId}`, { method: "DELETE" });
    check("remove-document request succeeds", removeR.status === 200);
    const afterRemove = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    check("removed document is gone from status", !afterRemove.documents.some((d) => d.id === nehaDoc.docId));

    // ---- fill run: which fields got filled (field names only) ----
    const runR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("fill run succeeds after multi-file upload + assignment", runR.status === 200);
    const resultsJsonPath = path.join(ROOT, "output", `upload-${caseId}-results.json`);
    const fillResults = JSON.parse(await readFile(resultsJsonPath, "utf-8"));
    const filled = fillResults.filter((r) => r.value != null).map((r) => r.field);
    console.log("\n-- fields filled after this batch (names only) --");
    console.log(filled.join(", ") || "(none)");

    await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
  } finally {
    server.kill();
    await rm(path.join(ROOT, "data", "_test_input"), { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("test script crashed:", err);
  process.exit(1);
});
