// Verifies this message's items 1-3: no variant question up front + no demo data until the button, the
// /preview endpoint (measuring real latency, the thing explicitly asked for), and bank-statement
// classification that never leaks fields. Prints pass/fail and timings only, no values.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createCanvas } from "canvas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const PORT = 4562;
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

async function main() {
  await rm(path.join(ROOT, "data", "demo_store.xlsx"), { force: true });
  await rm(path.join(ROOT, "data", "uploads"), { recursive: true, force: true });

  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "ignore"],
  });

  try {
    await waitForServer();

    // ---- item 1: detect-form no longer returns needsVariant as something the UI must act on; /run works
    //      with no variant chosen, and nothing from demo_data.xlsx appears until the button ----
    const form = new FormData();
    const blankFormBuf = await readFile(path.join(ROOT, "data", "Blank Forms", "Nomination_Form - cams.pdf"));
    form.append("file", new Blob([blankFormBuf], { type: "application/pdf" }), "blank.pdf");
    const detectR = await fetch(`${BASE}/api/upload/detect-form`, { method: "POST", body: form });
    const { caseId } = await detectR.json();

    const runNoVariantR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("item1: /run succeeds for a CAMS case with no variant chosen", runNoVariantR.status === 200);

    let caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    const excelFields = caseData.fields.filter((f) => f.group === "excel");
    check("item1: no demo_data.xlsx value anywhere before the button is pressed", excelFields.every((f) => f.value == null));

    const sampleNoVariantR = await fetch(`${BASE}/api/upload/${caseId}/sample-data`, { method: "POST" });
    const sampleNoVariantBody = await sampleNoVariantR.json();
    check("item1: pressing 'fill sample data' on CAMS with no variant asks for one (needs_variant), doesn't guess",
      sampleNoVariantR.status === 409 && sampleNoVariantBody.error === "needs_variant");

    const sampleWithVariantR = await fetch(`${BASE}/api/upload/${caseId}/sample-data`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: "hdfc" }),
    });
    check("item1: providing the variant at that point succeeds", sampleWithVariantR.status === 200);
    await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    caseData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    check("item1: demo data now appears, labelled as sample data",
      caseData.fields.some((f) => f.group === "excel" && f.value != null && f.source_file === "demo data (sample)"));

    // ---- item 2: /preview endpoint, measured ----
    const editable = caseData.fields.find((f) => f.group === "excel" && f.page != null);
    check("item2: an editable, positioned field exists to preview against", Boolean(editable));
    if (editable) {
      const timings = [];
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        const previewR = await fetch(`${BASE}/api/cases/${caseId}/preview`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: editable.field, value: `test value ${i}` }),
        });
        const ok = previewR.ok;
        const buf = await previewR.arrayBuffer();
        const ms = Date.now() - start;
        timings.push(ms);
        check(`item2: preview request ${i + 1} succeeds and returns image bytes`, ok && buf.byteLength > 0 && (previewR.headers.get("content-type") || "").includes("png"));
      }
      console.log(`\npreview round-trip timings (server + network, this machine): ${timings.join("ms, ")}ms`);
      console.log(`mean: ${Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)}ms`);
      check("item2: preview stays under 1.5s", Math.max(...timings) < 1500);
    }

    // ---- item 3: bank statement classification ----
    const canvas = createCanvas(900, 1200);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = "#000000"; ctx.font = "28px sans-serif";
    ctx.fillText("Statement of Account", 40, 60);
    ctx.fillText("IFSC Code: HDFC0001234", 40, 110);
    ctx.fillText("Account Number: 123456789012", 40, 160);
    const bankStatementPath = path.join(ROOT, "data", "_test_bank_statement.jpg");
    await mkdir(path.dirname(bankStatementPath), { recursive: true });
    await writeFile(bankStatementPath, canvas.toBuffer("image/jpeg"));

    const batchForm = new FormData();
    const buf = await readFile(bankStatementPath);
    batchForm.append("files", new Blob([buf], { type: "image/jpeg" }), "statement.jpg");
    const batchR = await fetch(`${BASE}/api/upload/${caseId}/documents`, { method: "POST", body: batchForm });
    const batchBody = await batchR.json();
    const docId = batchBody.results[0]?.docId;
    check("item3: bank statement upload accepted", batchR.ok && Boolean(docId));

    let settled = null;
    for (let i = 0; i < 60 && (!settled || settled.status === "processing"); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const st = await (await fetch(`${BASE}/api/upload/${caseId}/status`)).json();
      settled = st.documents.find((d) => d.id === docId);
    }
    check("item3: classified as bank_statement", settled?.docType === "bank_statement");
    check("item3: message explains no supported form has a field for it, and explicitly says not read",
      /field for/i.test(settled?.message || "") && /not read/i.test(settled?.message || ""));

    // the key privacy check: nothing from this document's incidental OCR should ever be usable as an
    // Aadhaar-sourced field - confirmed by re-running the fill and checking no aadhaar field used this doc.
    await fetch(`${BASE}/api/upload/${caseId}/documents/${docId}/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nominee: 1 }),
    });
    const runAfterBankR = await fetch(`${BASE}/api/upload/${caseId}/run`, { method: "POST" });
    check("item3: fill run still succeeds with a bank statement assigned to a nominee", runAfterBankR.status === 200);
    const afterBankData = await (await fetch(`${BASE}/api/cases/${caseId}`)).json();
    const nominee1Aadhaar = afterBankData.fields.filter((f) => f.group === "aadhaar" && f.field.endsWith("_n1"));
    check("item3: a bank statement never supplies an Aadhaar-sourced field (none have a value from it)",
      nominee1Aadhaar.every((f) => f.value == null));

    await fetch(`${BASE}/api/upload/${caseId}`, { method: "DELETE" });
  } finally {
    server.kill();
    await rm(path.join(ROOT, "data", "_test_bank_statement.jpg"), { force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error("test script crashed:", err); process.exit(1); });
