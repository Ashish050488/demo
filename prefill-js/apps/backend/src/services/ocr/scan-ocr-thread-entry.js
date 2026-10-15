// Runs inside an OCR worker thread (see scan-ocr-pool-service.js): reads one scan at a time with Tesseract +
// PaddleOCR. All the CPU-heavy work (rendering, thresholding, both OCR engines) happens here, so the API thread
// stays free to answer the screens while a batch is being read.
import { parentPort } from "node:worker_threads";
import { createEnglishOcrWorker, readScanText } from "./scan-ocr-service.js";
import { warmUp as warmUpPaddleOcr } from "./paddle-ocr-service.js";
import { hasDecodableQr } from "./qr-detect-service.js";
import { TESSDATA_DIRECTORY } from "../../config/paths-config.js";

const tesseractWorkerPromise = createEnglishOcrWorker(TESSDATA_DIRECTORY);
warmUpPaddleOcr();

parentPort.on("message", async ({ requestId, scanPath }) => {
  try {
    const result = await readScanText(await tesseractWorkerPromise, scanPath);
    // The QR check is CPU-heavy too (1-3 s a scan, measured) - done here, not on the API thread.
    result.hasQrCode = await hasDecodableQr(scanPath).catch(() => false);
    parentPort.postMessage({ requestId, result });
  } catch (error) {
    parentPort.postMessage({ requestId, errorName: error?.name, errorMessage: error?.message || String(error) });
  }
});
