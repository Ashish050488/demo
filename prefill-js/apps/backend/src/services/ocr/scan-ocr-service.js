// OCR of one uploaded scan (PDF or photo): two Tesseract passes plus PaddleOCR, merged per field by confidence.
// Results are cached in memory only (raw text holds full ID numbers - never written to disk).
import path from "node:path";
import os from "node:os";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createWorker, PSM } from "tesseract.js";

import { rasterizeFirstPage, rasterizeImageFile, renderPage } from "../pdf/render-page-service.js";
import { groupIntoLines } from "./text-layout-helpers.js";
import { extractFields as extractAadhaarFields } from "../documents/aadhaar-extract-service.js";
import { detectLines as paddleDetectLines } from "./paddle-ocr-service.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

async function toTempPng(png) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scan-ocr-"));
  const file = path.join(dir, "p.png");
  await writeFile(file, png);
  return file;
}

/** Like ocrScan, but also returns the raw OCR text (every pass concatenated, for classify-document-service.js's label
 * matching) and each pass's grouped lines (for pan-extract-service.js's PAN-field extraction - a second structured
 * extractor over the same passes, same merge-by-confidence approach as the Aadhaar fields below).
 *
 * Runs PaddleOCR (paddle-ocr-service.js) alongside the two Tesseract passes and merges all three by confidence,
 * per field - PaddleOCR reads a real phone photo dramatically better (verified: 92-99.5% vs 33-49% confidence
 * on the same real test image, because its detector isolates real text instead of reading background
 * clutter), so on a typical photo it should win most fields, with Tesseract's result still there as a
 * fallback if PaddleOCR doesn't produce one (or if loading/running it fails - wrapped in try/catch so that
 * never takes the whole OCR job down). PaddleOCR gets the image/PDF-page as close to its original form as
 * possible (not our Otsu-binarized version) - it's trained on natural photos, not pre-thresholded output. */
// In-memory only (raw OCR text holds full ID numbers - never cached to disk). Keyed by file content, so the
// same photo uploaded again - or re-read after its in-memory ID record was lost - skips OCR entirely.
const OCR_CACHE = new Map();
const OCR_CACHE_MAXIMUM_ENTRIES = 60;

export async function readScanText(worker, scanPath) {
  const key = createHash("sha256").update(await readFile(scanPath)).digest("hex");
  const hit = OCR_CACHE.get(key);
  if (hit) return hit;
  const result = await ocrScanUncached(worker, scanPath);
  OCR_CACHE.set(key, result);
  if (OCR_CACHE.size > OCR_CACHE_MAXIMUM_ENTRIES) OCR_CACHE.delete(OCR_CACHE.keys().next().value);
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

export async function createEnglishOcrWorker(tessdataDirectory) {
  return createWorker(["eng"], 1, { langPath: tessdataDirectory, gzip: true, cacheMethod: "none" });
}
