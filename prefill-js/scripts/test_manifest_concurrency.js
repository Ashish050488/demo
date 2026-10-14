// Regression test for the manifest-corruption bug: uploading several files in one batch kicks off that many
// concurrent background OCR jobs, each writing to data/uploads/manifest.json. Before the fix, concurrent
// writeFile calls to the same path could interleave and corrupt the JSON (reproduced and confirmed from a
// real user session). This test uploads a real multi-file batch and checks the manifest stays valid JSON
// throughout, and that every document's status is still readable afterward. Pass/fail only, no values.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4563;
const BASE = `http://127.0.0.1:${PORT}`;
const MANIFEST_PATH = path.join(ROOT, "data", "uploads", "manifest.json");

const results = [];
function check(name, ok) { results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); }

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/upload/supported-forms`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

async function manifestIsValidJson() {
  try {
    JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await rm(path.join(ROOT, "data", "uploads"), { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    const form = new FormData();
    const blankFormBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
    form.append("file", new Blob([blankFormBuf], { type: "application/pdf" }), "blank.pdf");
    const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
    const { caseId } = await detectR.json();

    // Upload the same 2 real scans 3x each (6 files, one batch) to maximize concurrent background jobs
    // racing to write the manifest at once - this is what triggered the corruption originally.
    const batchForm = new FormData();
    const deshnaBuf = await readFile(path.join(ROOT, "data", "Proofs", "Aadhaar deshna.pdf"));
    const nehaBuf = await readFile(path.join(ROOT, "data", "Proofs", "Aadhaar Neha new.pdf"));
    for (let i = 0; i < 3; i++) {
      batchForm.append("files", new Blob([deshnaBuf], { type: "application/pdf" }), `deshna_${i}.pdf`);
      batchForm.append("files", new Blob([nehaBuf], { type: "application/pdf" }), `neha_${i}.pdf`);
    }
    const batchR = await fetch(`${BASE}/api/upload/${caseId}/documents`, { method: "POST", body: batchForm });
    const batchBody = await batchR.json();
    check("batch of 6 files accepted", batchR.ok && batchBody.results.filter((r) => r.accepted).length === 6);
    const docIds = batchBody.results.filter((r) => r.accepted).map((r) => r.docId);

    // Poll /status repeatedly WHILE the 6 background jobs are still racing - every single poll must get a
    // valid 200+JSON response, never a 500/corrupted-JSON like the bug report.
    let allSettled = false;
    let pollFailures = 0;
    for (let i = 0; i < 90 && !allSettled; i++) {
      const r = await fetch(`${BASE}/api/upload/${caseId}/status`);
      if (!r.ok) { pollFailures++; continue; }
      let body;
      try { body = await r.json(); } catch { pollFailures++; continue; }
      allSettled = body.documents.every((d) => d.status !== "processing");
      await new Promise((res) => setTimeout(res, 500));
    }
    check("every status poll during concurrent OCR returned valid JSON (no 500s, no parse errors)", pollFailures === 0);
    check("all 6 documents eventually settled", allSettled);
    check("manifest.json is still valid JSON after the race", await manifestIsValidJson());

    const finalStatus = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    check("all 6 documents are present in the final manifest (none lost to a lost write)", finalStatus.documents.length === 6);
    check("all 6 documents classified successfully (done, not error)", finalStatus.documents.every((d) => d.status === "done"));

    await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    check("manifest still valid JSON after delete", await manifestIsValidJson());
  } finally {
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error("test script crashed:", err); process.exit(1); });
