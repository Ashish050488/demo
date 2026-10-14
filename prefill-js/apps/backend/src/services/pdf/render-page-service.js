// PDF page -> a grayscale, thresholded PNG buffer, ready for OCR. pdfjs-dist renders through its own
// Node canvas factory (backed by the `canvas` package) - a hand-rolled canvas factory breaks pdf.js's
// image-painting code.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createCanvas, loadImage } from "canvas";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
// pdf-lib's own output (and some real-world PDFs) reference the 14 standard fonts by name rather than
// embedding them; without this, pdfjs silently drops every glyph from those fonts when rendering in Node.
const STANDARD_FONT_DATA_URL = path.join(path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json"))), "standard_fonts") + path.sep;

/** Otsu's method: the grayscale cut point that best separates two populations of pixels (ink vs. paper). */
function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > bestVar) {
      bestVar = variance;
      best = t;
    }
  }
  return best;
}

/** Grayscale + binarize a canvas in place, using an Otsu threshold computed from its own histogram. */
function binarize(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const gray = new Uint8ClampedArray(width * height);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    gray[p] = g;
    hist[g]++;
  }
  const t = otsuThreshold(hist, width * height);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = gray[p] >= t ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return t;
}

/**
 * Render a PDF's first page to a PNG buffer: `scale`x resolution, grayscale, Otsu-thresholded. For OCR input,
 * not for display - the threshold tends to look harsh for a human reader. Returns { png, threshold } so
 * callers can report what cut point was used.
 */
export async function rasterizeFirstPage(pdfPath, { scale = 3.0 } = {}) {
  const { doc, page, viewport, canvas, context } = await renderRaw(pdfPath, 1, scale);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    const threshold = binarize(canvas);
    return { png: canvas.toBuffer("image/png"), threshold };
  } finally {
    await doc.destroy();
  }
}

/** Any page, any scale, as a plain (non-thresholded) PNG - for display in the review UI, not OCR. Also
 * returns the page's point size (unscaled), so a caller can convert a point-space bbox to 0..1 fractions. */
export async function renderPage(pdfPath, pageNumber, { scale = 1.6 } = {}) {
  const { doc, page, viewport, canvas, context } = await renderRaw(pdfPath, pageNumber, scale);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
    const unscaled = page.getViewport({ scale: 1 });
    return { png: canvas.toBuffer("image/png"), pageWidth: unscaled.width, pageHeight: unscaled.height };
  } finally {
    await doc.destroy();
  }
}

/**
 * A directly-uploaded image (JPG/PNG - a phone photo of an Aadhaar card, not a PDF) -> the same grayscale,
 * Otsu-thresholded PNG buffer the PDF path produces, for OCR input. Scaled so the longer side lands near
 * 2400px (comparable to what a PDF renders at scale 3) - upscaled if the photo is small, downscaled if huge,
 * so OCR quality doesn't depend on whatever resolution a phone happened to produce.
 */
export async function rasterizeImageFile(imagePath, { targetLongSide = 2400 } = {}) {
  const img = await loadImage(imagePath);
  const longSide = Math.max(img.width, img.height);
  const scale = targetLongSide / longSide;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const threshold = binarize(canvas);
  return { png: canvas.toBuffer("image/png"), threshold };
}

export async function pageCount(pdfPath) {
  const bytes = await readFile(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

async function renderRaw(pdfPath, pageNumber, scale) {
  const bytes = await readFile(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvasFactory = doc.canvasFactory;
  const { canvas, context } = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  return { doc, page, viewport, canvas, context };
}
