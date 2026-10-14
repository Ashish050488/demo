// PaddleOCR (PP-OCRv4 models) via @gutenye/ocr-node, running on onnxruntime-node - fully local, no network
// calls once installed (its models are a separate npm package, @gutenye/ocr-models, already on disk in
// node_modules after `npm install`). Verified directly against a real problem photo (not a benchmark claim):
// 92-99.5% line confidence vs. Tesseract's 33-49% on the same image, because its text DETECTOR isolates real
// text regions instead of reading background clutter as words.
//
// detectLines() returns the SAME shape src/layout.js's groupIntoLines() produces from Tesseract, so
// src/aadhaar.js/src/pan.js's extraction functions work completely unchanged regardless of which engine
// supplied the lines - no column-gutter splitting is needed here, since PaddleOCR's detector already isolates
// one clean line per text region (not a naive y-coordinate clustering the way Tesseract's word-level output
// needs).
import Ocr from "@gutenye/ocr-node";

let ocrPromise = null;
function getOcr() {
  if (!ocrPromise) ocrPromise = Ocr.create();
  return ocrPromise;
}

/** Loads the ONNX models on first call (a few seconds); every call after that reuses the same instance. */
export async function detectLines(imagePath) {
  const ocr = await getOcr();
  const result = await ocr.detect(imagePath);
  const lines = (result.texts || []).map((t) => {
    const confidence = (t.mean ?? 0) * 100; // PaddleOCR reports 0..1 - our convention everywhere else is 0..100
    const xs = (t.box || []).map((p) => p[0]);
    const ys = (t.box || []).map((p) => p[1]);
    const x0 = xs.length ? Math.min(...xs) : 0;
    const x1 = xs.length ? Math.max(...xs) : 0;
    const y0 = ys.length ? Math.min(...ys) : 0;
    const y1 = ys.length ? Math.max(...ys) : 0;
    const word = { text: t.text, confidence, bbox: { x0, y0, x1, y1 } };
    return { words: [word], text: t.text, y0, y1, x0, confidence, center: (y0 + y1) / 2 };
  });
  lines.sort((a, b) => a.center - b.center || a.x0 - b.x0);
  return lines;
}

/** Plain concatenated text, for src/docClassify.js's label matching (same role as Tesseract's data.text). */
export async function detectRawText(imagePath) {
  const lines = await detectLines(imagePath);
  return lines.map((l) => l.text).join("\n");
}
