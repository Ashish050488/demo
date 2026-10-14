// A minimal, boolean-only QR check for document classification/status reporting - NOT the full Secure QR
// extractor (not built yet). jsQR first, zxing-wasm (local WASM, no network) as fallback. Never returns field content, only whether a QR code was found at all.
import jsQR from "jsqr";
import { readBarcodesFromImageData, setZXingModuleOverrides } from "zxing-wasm/reader";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";
import path from "node:path";
import { renderPage, rasterizeImageFile } from "../pdf/render-page-service.js";

let zxingReady = false;
function ensureZXing() {
  if (zxingReady) return;
  setZXingModuleOverrides({ wasmBinary: readFileSync(new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))) });
  zxingReady = true;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

async function toImageData(buf) {
  const img = await loadImage(buf);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function tryDecode(png) {
  const imageData = await toImageData(png);
  if (jsQR(imageData.data, imageData.width, imageData.height)) return true;
  const result = await readBarcodesFromImageData(imageData, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
  return result.length > 0;
}

/** Does this file (PDF or image) carry a QR code jsQR or zxing-wasm can find? PDFs are tried at 3x/4x render
 *; an uploaded image is rasterized once at its own high-res
 * default (render-page-service.js's rasterizeImageFile). */
export async function hasDecodableQr(filePath) {
  ensureZXing();
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    const { png } = await rasterizeImageFile(filePath);
    return tryDecode(png);
  }
  for (const scale of [3, 4]) {
    const { png } = await renderPage(filePath, 1, { scale });
    if (await tryDecode(png)) return true;
  }
  return false;
}
