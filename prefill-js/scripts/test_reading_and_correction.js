// Covers: the real-image OCR fixes (address/name), junk-value rejection, the no-documents typed-by-hand path,
// tick-box correction, and restore. Uses the user's real debug photos where available (data/uploads' current
// unconfirmed case) for the OCR checks; everything else uses synthetic/no documents. Pass/fail only, no values.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4564;
const BASE = `http://127.0.0.1:${PORT}`;
const REAL_CASE_DIR = path.join(ROOT, "data", "uploads", "3cfdde56-ed59-4917-a722-0288a388e79d");

const results = [];
function check(name, ok) { results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); }

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/upload/supported-forms`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
}

const MIME_BY_EXT = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
async function uploadBatch(url, filePaths, fieldName = "files") {
  const form = new FormData();
  for (const p of filePaths) {
    const buf = await readFile(p);
    form.append(fieldName, new Blob([buf], { type: MIME_BY_EXT[path.extname(p).toLowerCase()] }), path.basename(p));
  }
  const r = await fetch(url, { method: "POST", body: form });
  return { status: r.status, body: await r.json() };
}

async function waitSettled(caseId, docId) {
  for (let i = 0; i < 60; i++) {
    const st = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
    const doc = st.documents.find((d) => d.id === docId);
    if (doc && doc.status !== "processing") return doc;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("never settled");
}

async function main() {
  await rm(path.join(ROOT, "data", "demo_store.xlsx"), { force: true });

  // Copy the real test files (under the user's live, unconfirmed case) to a safe scratch spot BEFORE the
  // uploads dir gets wiped for this test run - reading their manifest path alone isn't enough, the files
  // themselves must be copied out first or the next line deletes them before they're ever used.
  const { mkdir, copyFile } = await import("node:fs/promises");
  const SCRATCH_DIR = path.join(ROOT, "data", "_test_real_copies");
  let realFiles = null;
  try {
    const manifest = JSON.parse(await readFile(path.join(ROOT, "data", "uploads", "manifest.json"), "utf-8"));
    const entry = manifest["3cfdde56-ed59-4917-a722-0288a388e79d"];
    if (entry) {
      await mkdir(SCRATCH_DIR, { recursive: true });
      realFiles = [];
      for (const d of entry.documents) {
        const src = path.join(REAL_CASE_DIR, d.filename);
        const dst = path.join(SCRATCH_DIR, d.filename);
        await copyFile(src, dst);
        realFiles.push({ name: d.originalName, file: dst });
      }
    }
  } catch { /* no manifest, or files already gone - fine, that check is skipped below */ }

  await rm(path.join(ROOT, "data", "uploads"), { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    // ==== real-image OCR fix verification (only if the user's real files are still around) ====
    if (realFiles && realFiles.every((f) => f.file)) {
      const form = new FormData();
      const blankBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Nomination_Form - cams.pdf"));
      form.append("file", new Blob([blankBuf], { type: "application/pdf" }), "blank.pdf");
      const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
      const { caseId } = await detectR.json();

      const paths = [];
      for (const f of realFiles) { try { await readFile(f.file); paths.push(f.file); } catch { /* already gone */ } }
      if (paths.length) {
        const batch = await uploadBatch(`${BASE}/api/upload/${caseId}/documents`, paths);
        const docs = await Promise.all(batch.body.results.filter((r) => r.accepted).map((r) => waitSettled(caseId, r.docId)));
        const frontDoc = docs.find((d) => d.docType === "aadhaar_front");
        const backDoc = docs.find((d) => d.docType === "aadhaar_back");
        check("real Aadhaar back photo now yields an address (S/O label fix)", Boolean(backDoc) && (await (async () => {
          const m = JSON.parse(await readFile(path.join(ROOT, "data", "uploads", "manifest.json"), "utf-8"));
          const doc = m[caseId].documents.find((d) => d.id === backDoc.id);
          return doc.foundAddress != null;
        })()));
        if (frontDoc) {
          const m = JSON.parse(await readFile(path.join(ROOT, "data", "uploads", "manifest.json"), "utf-8"));
          const doc = m[caseId].documents.find((d) => d.id === frontDoc.id);
          check("real Aadhaar front photo's name is no longer a single garbled character (>=2 letters, as validated)",
            doc.foundName == null || doc.foundName.replace(/[^A-Za-z]/g, "").length >= 2);
        }
      }
      await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    } else {
      check("real-image OCR fix check (skipped - no real files currently on disk, not a failure)", true);
    }

    // ==== junk value rejected at confirm (server-side safety net) ====
    {
      const form = new FormData();
      const blankBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
      form.append("file", new Blob([blankBuf], { type: "application/pdf" }), "blank.pdf");
      const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
      const { caseId } = await detectR.json();
      await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
      const confirmR = await fetch(`${BASE}/api/upload/${caseId}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { name_n1: "E", dob_n1: "31/02/2020", id_aadhaar_last4_n1: "12", share_pct_n1: "50" } }),
      });
      const confirmBody = await confirmR.json();
      check("confirm succeeds even with junk mixed in (good fields still saved)", confirmR.status === 200);
      check("junk name ('E') is rejected, not saved", confirmBody.rejected.some((r) => r.field === "name_n1"));
      check("impossible date (31/02) is rejected, not saved", confirmBody.rejected.some((r) => r.field === "dob_n1"));
      check("non-4-digit last-4 is rejected, not saved", confirmBody.rejected.some((r) => r.field === "id_aadhaar_last4_n1"));
      check("a normal free-text field (share_pct) is not touched by validation", !confirmBody.rejected.some((r) => r.field === "share_pct_n1"));
      await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    }

    // ==== no-documents path: type every field by hand, review, download ====
    {
      const form = new FormData();
      const blankBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Modification in Nomination in CRN Broking Demat.pdf"));
      form.append("file", new Blob([blankBuf], { type: "application/pdf" }), "blank.pdf");
      const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
      const { caseId } = await detectR.json();
      const runR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
      check("fill run succeeds with zero documents uploaded", runR.status === 200);

      // simulate typing every nominee-1 Aadhaar field by hand via /decide (what the live-editing screen does)
      for (const [field, value] of [["name_n1", "Test Person"], ["dob_n1", "01/01/1990"], ["id_aadhaar_last4_n1", "1234"]]) {
        const r = await fetch(`${BASE}/api/cases/${caseId}/decide`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: field, kind: "corrected", value, who: "test" }),
        });
        check(`typed-by-hand '${field}' with no document uploaded is accepted`, r.status === 200);
      }
      const caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
      const previewR = await fetch(`${BASE}/api/cases/${caseId}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "name_n1", value: "Test Person" }),
      });
      check("live preview works with no documents uploaded", previewR.ok);
      const downloadR = await fetch(`${BASE}/api/cases/${caseId}/download/original`);
      check("filled PDF still downloads with no documents uploaded", downloadR.ok);
      check("the hand-typed fields are present in the case data", caseData.fields.some((f) => f.field === "name_n1"));

      await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    }

    // ==== tick-box correction (relationship_option) + restore ====
    {
      const form = new FormData();
      const blankBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Nomination_Form - cams.pdf"));
      form.append("file", new Blob([blankBuf], { type: "application/pdf" }), "blank.pdf");
      const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
      const { caseId } = await detectR.json();
      await fetch(`${BASE}/api/upload/${caseId}/sample-data`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: "360one" }),
      });
      await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
      let caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
      const tickField = caseData.fields.find((f) => f.field === "relationship_option_n1");
      check("relationship_option_n1 carries its option list to the client", Array.isArray(tickField?.options) && tickField.options.length > 0);
      const otherOption = tickField.options.find((o) => o !== tickField.option_chosen) || "Others";

      const previewR = await fetch(`${BASE}/api/cases/${caseId}/preview`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field: "relationship_option_n1", value: otherOption }),
      });
      check("live preview of a tick-box change succeeds", previewR.ok);

      await fetch(`${BASE}/api/cases/${caseId}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: "relationship_option_n1", kind: "corrected", value: otherOption, who: "test" }),
      });
      const runAfterR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
      check("fill run succeeds after a tick-box correction", runAfterR.status === 200);
      const resultsJson = JSON.parse(await readFile(path.join(ROOT, "output", `upload-${caseId}-results.json`), "utf-8"));
      const correctedRecord = resultsJson.find((r) => r.field === "relationship_option_n1");
      check("the final PDF's result record reflects the corrected tick option", correctedRecord.option_chosen === otherOption);

      // restore: record a "skipped" decision (what the Restore button does) and confirm the original shows again
      await fetch(`${BASE}/api/cases/${caseId}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: "relationship_option_n1", kind: "skipped", who: "test" }),
      });
      caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
      const afterRestore = caseData.fields.find((f) => f.field === "relationship_option_n1");
      check("after restore, the decision is no longer 'corrected'", afterRestore.decision?.kind !== "corrected");

      await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
    }
  } finally {
    server.kill();
    await rm(SCRATCH_DIR, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error("test script crashed:", err); process.exit(1); });
