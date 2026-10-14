// The review server: 127.0.0.1 only. Serves one case's results + rendered page images of the PREFILLED PDF,
// accepts corrections (append-only, never into results.json/demo_data.xlsx/any sample file), and regenerates
// a PDF substituting corrections for raw values. No upload, no live OCR (slice 1).
//
// Never serves: raw Aadhaar scans (data/Proofs/*), demo_data.xlsx, the blank/sample forms. Only the prefilled
// and regenerated PDFs this project already produced, and their page images.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

import { CASES } from "./cases.js";
import { record, latestByField } from "./decisions.js";
import { regenerate } from "./regenerate.js";
import { renderPage, pageCount } from "../src/rasterize.js";
import { resolveCaseDef } from "./caseResolve.js";
import { fillTextFields } from "../src/fillengine.js";
import { drawCheckmark } from "../src/fillkit.js";
import { tickOptionBbox, tickboxPage } from "../src/tickboxRules.js";
import uploadRoutes from "./uploadRoutes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const UI_DIR = path.join(ROOT, "ui");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4500;

const app = express();
app.use(express.json());

// Refuse anything not addressed to the loopback host, even though we also bind only to 127.0.0.1 - belt and
// braces against DNS-rebinding style tricks reaching a loopback-bound server from a browser tab.
app.use((req, res, next) => {
  const host = (req.headers.host || "").split(":")[0];
  if (host !== "127.0.0.1" && host !== "localhost") return res.status(403).send("forbidden host");
  next();
});

function maskField(f) {
  // Aadhaar numbers never exist in full anywhere in this project (OCR/mapping only ever keep the last 4 -
  // see src/aadhaar.js) - this is the display convention, applied once here so the UI never has to think
  // about it.
  if (f.value != null && /^(id_aadhaar_last4|id_details|id_number)/.test(f.field) && /^\d{4}$/.test(f.value)) {
    return { ...f, value: `XXXX XXXX ${f.value}` };
  }
  return f;
}

const pageSizeCache = new Map(); // pdfPath -> [{width,height}, ...] (1-indexed via array index+1... stored 0-indexed)

async function pageSizes(pdfPath) {
  if (pageSizeCache.has(pdfPath)) return pageSizeCache.get(pdfPath);
  const bytes = await readFile(pdfPath);
  const doc = await PDFDocument.load(bytes);
  const sizes = doc.getPages().map((p) => ({ width: p.getWidth(), height: p.getHeight() }));
  pageSizeCache.set(pdfPath, sizes);
  return sizes;
}

// decisions.jsonl stores {decision, who, value, note, timestamp}; decide.js (copied from the kit, unmodified)
// expects a decision object shaped {kind, who, value, note, ts} - translate once, here.
function toDecideShape(row) {
  return row ? { kind: row.decision, who: row.who, value: row.value, note: row.note, ts: row.timestamp } : null;
}

/** A point-space rect -> [x0,y0,x1,y1] in 0..1 page fractions, for the UI to draw a highlight over. */
function toFractionBox(rect, size) {
  if (!rect || !size) return null;
  return [rect.x / size.width, rect.y / size.height,
          (rect.x + (rect.width || 0)) / size.width, (rect.y + (rect.height || 0)) / size.height];
}

/** One fraction box per line actually drawn (r.lines) - what the review screen highlights, instead of one
 * loose rectangle spanning a whole multi-line block including the gaps between lines. Falls back to the
 * single aggregate bbox for old records that predate per-line capture. */
function fieldBoxes(r, size) {
  const rects = r.lines && r.lines.length ? r.lines : r.bbox ? [r.bbox] : [];
  return rects.map((rect) => toFractionBox(rect, size)).filter(Boolean);
}

// Resolves either a fixed demo case or a dynamic upload case (server/caseResolve.js) - so every route below
// works unmodified for both.
async function caseOr404(req, res) {
  const c = await resolveCaseDef(req.params.case);
  if (!c) { res.status(404).json({ error: `no such case "${req.params.case}"` }); return null; }
  return c;
}

app.get("/api/cases", (req, res) => {
  res.json({ cases: Object.values(CASES).map((c) => ({ id: c.id, label: c.label })) });
});

app.get("/api/cases/:case", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const results = JSON.parse(await readFile(c.resultsPath, "utf-8"));
    const decisions = await latestByField(c.id);
    const sizes = await pageSizes(c.originalPdfPath);
    const n = await pageCount(c.originalPdfPath);

    const fields = results.map((r) => {
      const size = r.page ? sizes[r.page - 1] : null;
      const box = toFractionBox(r.bbox, size);
      const boxes = fieldBoxes(r, size);
      const group = "option_chosen" in r ? "tickbox" : r.source === "aadhaar" ? "aadhaar" : r.source === "excel" ? "excel" : "other";
      return maskField({ ...r, box, boxes, group, decision: toDecideShape(decisions[r.field]) });
    });

    res.json({ id: c.id, label: c.label, pageCount: n, fields });
  } catch (err) { next(err); }
});

app.get("/api/cases/:case/page/:n", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const src = req.query.src === "regenerated" ? c.regeneratedPdfPath : c.originalPdfPath;
    const n = Number(req.params.n);
    const w = Number(req.query.w) || 1200;
    const bytes = await readFile(src).catch(() => null);
    if (!bytes) return res.status(404).json({ error: `no ${req.query.src === "regenerated" ? "regenerated" : "original"} PDF for this case yet` });
    const scale = w / 595.28; // A4 width in points; good enough for a review-screen render
    const { png } = await renderPage(src, n, { scale });
    res.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
  } catch (err) { next(err); }
});

app.post("/api/cases/:case/decide", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const { item, kind, value, note, who } = req.body || {};
    if (!item || !kind) return res.status(400).json({ error: "need item and kind" });
    const row = await record({ caseId: c.id, field: item, decision: kind, value, note, who });
    res.json({ decision: { ...row, kind: row.decision, ts: row.timestamp } });
  } catch (err) { next(err); }
});

// Live preview for inline editing (upload review's typing-with-debounce flow): re-fills the WHOLE form
// (reusing the same fillTextFields() core as /regenerate, not a new code path) with one field's value
// overridden by whatever is currently typed, then renders just that field's page. Writes to a dedicated
// per-case scratch file (never the real regenerated PDF) and is never persisted beyond that - nothing here
// reaches decisions.jsonl or demo_store.xlsx. Timed; see the report for what that measured.
app.post("/api/cases/:case/preview", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const { field: editField, value: editValue } = req.body || {};
    if (!editField) return res.status(400).json({ error: "need field" });

    const start = Date.now();
    const mapping = JSON.parse(await readFile(c.mappingPath, "utf-8"));
    const baseline = JSON.parse(await readFile(c.resultsPath, "utf-8"));
    const decisions = await latestByField(c.id);
    const baselineByField = {};
    for (const r of baseline) baselineByField[r.field] = r;
    const affected = baselineByField[editField];
    const isTickboxEdit = affected && "option_chosen" in affected;
    // A tickbox's own baseline record can have page:null (never drawn, e.g. id_type) - fall back to its
    // form-config definition's page so a still-undrawn tickbox can still be located for a preview attempt.
    const previewPage = affected?.page ?? (isTickboxEdit ? tickboxPage(c.formConfig, editField) : null);
    if (!affected || previewPage == null) return res.status(400).json({ error: "this field has no position to preview" });

    const getValue = async (field, label) => {
      if (label === editField && !isTickboxEdit) return { value: editValue, confidence: null, sourceFile: null, skipReason: null, notApplicable: false };
      const base = baselineByField[label];
      const decision = decisions[label];
      if (decision && decision.decision === "corrected" && decision.value != null && decision.value !== "") {
        return { value: decision.value, confidence: null, sourceFile: null, skipReason: null, notApplicable: false };
      }
      return {
        value: base?.value ?? null, confidence: base?.ocr_confidence ?? null, sourceFile: base?.source_file ?? null,
        skipReason: base?.status !== "ok" ? base?.reason : null,
        notApplicable: base?.status === "not_applicable", notProvided: base?.status === "not_provided",
      };
    };

    const { pdfDoc, pages } = await fillTextFields(c.formConfig, mapping, getValue);
    // Redraw every tick box too (fillTextFields only ever writes text) - each at its current choice (the
    // live edit if this is the field being previewed, else any prior correction, else the original), so a
    // tickbox edit shows up live and a text edit doesn't momentarily lose every tick on the page.
    for (const r of baseline) {
      if (!("option_chosen" in r)) continue;
      const optionValue = r.field === editField ? editValue : (decisions[r.field]?.decision === "corrected" ? decisions[r.field].value : r.option_chosen);
      const bbox = tickOptionBbox(c.formConfig, r.field, optionValue);
      const page = r.page ?? tickboxPage(c.formConfig, r.field);
      if (bbox && page) drawCheckmark(pages[page - 1], { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height });
    }
    const bytes = await pdfDoc.save();
    const previewPath = path.join(ROOT, "output", `preview-${c.id}.pdf`);
    await writeFile(previewPath, bytes);
    const scale = 1400 / 595.28;
    const { png } = await renderPage(previewPath, previewPage, { scale });
    const ms = Date.now() - start;
    console.log(`preview render: case ${c.id} field ${editField}: ${ms}ms`);
    res.set("Content-Type", "image/png").set("Cache-Control", "no-store").set("X-Preview-Ms", String(ms)).send(png);
  } catch (err) { next(err); }
});

app.post("/api/cases/:case/regenerate", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const { results } = await regenerate(c);
    const decisions = await latestByField(c.id);
    const sizes = await pageSizes(c.regeneratedPdfPath);
    const n = await pageCount(c.regeneratedPdfPath);
    const fields = results.map((r) => {
      const size = r.page ? sizes[r.page - 1] : null;
      const box = toFractionBox(r.bbox, size);
      const boxes = fieldBoxes(r, size);
      const group = "option_chosen" in r ? "tickbox" : r.source === "aadhaar" ? "aadhaar" : r.source === "excel" ? "excel" : "other";
      return maskField({ ...r, box, boxes, group, decision: toDecideShape(decisions[r.field]) });
    });
    res.json({ id: c.id, label: c.label, pageCount: n, fields });
  } catch (err) { next(err); }
});

app.get("/api/cases/:case/download/:which", async (req, res, next) => {
  try {
    const c = await caseOr404(req, res); if (!c) return;
    const which = req.params.which;
    const src = which === "regenerated" ? c.regeneratedPdfPath : which === "original" ? c.originalPdfPath : null;
    if (!src) return res.status(400).json({ error: "which must be 'original' or 'regenerated'" });
    res.download(src, `${c.id}-${which}.pdf`);
  } catch (err) { next(err); }
});

app.use("/api/upload", uploadRoutes);

app.use(express.static(UI_DIR));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`review server: http://${HOST}:${PORT}/  (demo data only - 127.0.0.1 only)`);
});
