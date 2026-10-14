// Shared pieces for a fill-engine script (fill_crn.js, fill_cams.js): OCR an Aadhaar scan, wrap/shrink text to
// fit a row, and draw a vector checkmark over a printed box/glyph. No form-specific knowledge here.
import path from "node:path";
import os from "node:os";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createWorker, PSM } from "tesseract.js";
import { rgb } from "pdf-lib";

import { rasterizeFirstPage, rasterizeImageFile, renderPage } from "./rasterize.js";
import { groupIntoLines } from "./layout.js";
import { extractFields as extractAadhaarFields } from "./aadhaar.js";
import { detectLines as paddleDetectLines } from "./paddleOcr.js";

export const MIN_FONT_SIZE = 6;
export const LINE_HEIGHT_FACTOR = 1.1;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

async function toTempPng(png) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fillkit-"));
  const file = path.join(dir, "p.png");
  await writeFile(file, png);
  return file;
}

/** Like ocrScan, but also returns the raw OCR text (every pass concatenated, for src/docClassify.js's label
 * matching) and each pass's grouped lines (for src/pan.js's PAN-field extraction - a second structured
 * extractor over the same passes, same merge-by-confidence approach as the Aadhaar fields below).
 *
 * Runs PaddleOCR (src/paddleOcr.js) alongside the two Tesseract passes and merges all three by confidence,
 * per field - PaddleOCR reads a real phone photo dramatically better (verified: 92-99.5% vs 33-49% confidence
 * on the same real test image, because its detector isolates real text instead of reading background
 * clutter), so on a typical photo it should win most fields, with Tesseract's result still there as a
 * fallback if PaddleOCR doesn't produce one (or if loading/running it fails - wrapped in try/catch so that
 * never takes the whole OCR job down). PaddleOCR gets the image/PDF-page as close to its original form as
 * possible (not our Otsu-binarized version) - it's trained on natural photos, not pre-thresholded output. */
// In-memory only (raw OCR text holds full ID numbers - never cached to disk). Keyed by file content, so the
// same photo uploaded again - or re-read after its in-memory ID record was lost - skips OCR entirely.
const OCR_CACHE = new Map();
const OCR_CACHE_MAX = 60;

export async function ocrScanDetailed(worker, scanPath) {
  const key = createHash("sha256").update(await readFile(scanPath)).digest("hex");
  const hit = OCR_CACHE.get(key);
  if (hit) return hit;
  const result = await ocrScanUncached(worker, scanPath);
  OCR_CACHE.set(key, result);
  if (OCR_CACHE.size > OCR_CACHE_MAX) OCR_CACHE.delete(OCR_CACHE.keys().next().value);
  return result;
}

async function ocrScanUncached(worker, scanPath) {
  const ext = path.extname(scanPath).toLowerCase();
  const { png } = IMAGE_EXTENSIONS.has(ext)
    ? await rasterizeImageFile(scanPath)
    : await rasterizeFirstPage(scanPath, { scale: 3.0 });
  let best = {};
  let rawText = "";
  const linesByPass = [];
  for (const psm of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(await toTempPng(png));
    rawText += `\n${data.text || ""}`;
    const lines = groupIntoLines(data.words);
    linesByPass.push(lines);
    const fields = extractAadhaarFields(lines);
    for (const k of ["name", "dob", "address", "aadhaarLast4", "gender"]) {
      if (fields[k] && (!best[k] || fields[k].confidence > best[k].confidence)) best[k] = fields[k];
    }
  }

  try {
    const paddleInputPath = IMAGE_EXTENSIONS.has(ext) ? scanPath : await toTempPng((await renderPage(scanPath, 1, { scale: 3.0 })).png);
    const paddleLines = await paddleDetectLines(paddleInputPath);
    linesByPass.push(paddleLines);
    rawText += `\n${paddleLines.map((l) => l.text).join("\n")}`;
    const paddleFields = extractAadhaarFields(paddleLines);
    for (const k of ["name", "dob", "address", "aadhaarLast4", "gender"]) {
      if (paddleFields[k] && (!best[k] || paddleFields[k].confidence > best[k].confidence)) best[k] = paddleFields[k];
    }
  } catch (err) {
    console.error("PaddleOCR pass failed, continuing with Tesseract-only result:", err.message);
  }

  return { fields: best, rawText, linesByPass };
}

/** One Aadhaar scan -> {name, dob, address, aadhaarLast4} (each {value, confidence} | undefined), best of two
 * page-segmentation modes per field (same method as scripts/ocr_aadhaar.js). `scanPath` may be a PDF or a
 * directly-uploaded photo (JPG/PNG) - routed to the matching rasterizer; both end up as the same grayscale,
 * Otsu-thresholded PNG before OCR, so scan quality doesn't depend on which kind was uploaded. */
export async function ocrScan(worker, scanPath) {
  const { fields } = await ocrScanDetailed(worker, scanPath);
  return fields;
}

export async function createEnglishWorker(tessdataDir) {
  return createWorker(["eng"], 1, { langPath: tessdataDir, gzip: true, cacheMethod: "none" });
}

export function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink fontSize (down to MIN_FONT_SIZE) until the wrapped text fits availableHeight; if even the floor
 * size doesn't fit, truncate to however many lines do fit rather than let any line cross the row boundary. */
export function fitMultiline(value, font, maxFontSize, maxWidth, availableHeight) {
  for (let fs = Math.round(maxFontSize); fs >= MIN_FONT_SIZE; fs--) {
    const lines = wrapText(value, font, fs, maxWidth);
    if (lines.length * fs * LINE_HEIGHT_FACTOR <= availableHeight) {
      return { fontSize: fs, lines, truncated: false };
    }
  }
  const fs = MIN_FONT_SIZE;
  const lines = wrapText(value, font, fs, maxWidth);
  const maxLines = Math.max(1, Math.floor(availableHeight / (fs * LINE_HEIGHT_FACTOR)));
  return { fontSize: fs, lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

export const LOW_CONFIDENCE_THRESHOLD = 85;

/** The audit status for one field's result record. `skipReason` is whatever explanation the fill loop already
 * has for why value is null (empty Excel cell, no scan assigned, OCR found nothing, source UNSURE, ...) -
 * never dropped, always carried into the record so a null value is explained, not silent. `notProvided` is
 * distinct from `notApplicable`: it means a value exists (demo data) but is being deliberately withheld until
 * the user asks for it (server/uploadFill.js's "Fill with sample demo data" gate) - only upload cases ever
 * pass this; the three fixed demo cases never do. */
export function statusFor({ value, truncated, confidence, skipReason, notApplicable, notProvided }) {
  if (value == null) {
    if (notApplicable) return { status: "not_applicable", reason: skipReason || "not applicable" };
    if (notProvided) return { status: "not_provided", reason: skipReason || "not provided" };
    return { status: "needs_review", reason: skipReason || "value null" };
  }
  if (truncated) return { status: "needs_review", reason: "text truncated" };
  if (confidence != null && confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { status: "low_confidence", reason: `OCR confidence ${confidence.toFixed(0)} below ${LOW_CONFIDENCE_THRESHOLD}` };
  }
  return { status: "ok", reason: null };
}

/** A checkmark ✓ drawn as two vector line segments inside a glyph's bounding box (x,y,w,h - our top-down
 * point convention; converted to pdf-lib's bottom-up page space here). */
export function drawCheckmark(page, { x, y, w, h }) {
  const pageHeight = page.getHeight();
  const bottom = pageHeight - y - h * 0.15;
  const top = bottom + h * 0.85;
  const left = x + w * 0.1;
  const right = x + w * 0.9;
  const midX = left + (right - left) * 0.38;
  const midY = bottom + (top - bottom) * 0.15;
  const color = rgb(0, 0, 0);
  const thickness = Math.max(0.8, h * 0.09);
  page.drawLine({ start: { x: left, y: top * 0.55 + bottom * 0.45 }, end: { x: midX, y: midY }, thickness, color });
  page.drawLine({ start: { x: midX, y: midY }, end: { x: right, y: top }, thickness, color });
}
