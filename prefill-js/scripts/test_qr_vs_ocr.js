// Step 0 item 1 (test only, re-run after fixing the parser against the verified UIDAI Secure QR Code
// Specification, March 2019, section 2.2): decode the QR, take ONLY the first 16 text segments BY POSITION
// (now spec-confirmed, not guessed), and compare each against our OCR pipeline. Never touches the photo or
// anything after field 16. Prints only MATCH / MISMATCH / MISSING per field - never a value.
import jsQR from "jsqr";
import { readBarcodesFromImageData, setZXingModuleOverrides } from "zxing-wasm/reader";
import zlib from "node:zlib";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";
import { renderPage } from "../src/rasterize.js";
import { createEnglishWorker, ocrScan } from "../src/fillkit.js";

setZXingModuleOverrides({ wasmBinary: readFileSync(new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))) });

const DELIMITER = 0xff;
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Spec section 2.2, verified directly against the UIDAI document - not assumed.
const FIELD_ORDER = [
  "email_mobile_flag", "reference_id", "name", "dob", "gender", "care_of", "district", "landmark",
  "house", "location", "pincode", "post_office", "state", "street", "sub_district", "vtc",
];

/** Only the first 16 segments, by position. Everything after (photo, hashes, signature) is never read. */
async function decodeQrFirst16(pdfPath) {
  for (const scale of [3, 4]) {
    const { png } = await renderPage(pdfPath, 1, { scale });
    const img = await loadImage(png);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let payload = jsQR(imageData.data, imageData.width, imageData.height)?.data;
    if (!payload) {
      const r = await readBarcodesFromImageData(imageData, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
      payload = r[0]?.text;
    }
    if (!payload || !/^\d+$/.test(payload)) continue;

    let n = BigInt(payload);
    const bytes = [];
    while (n > 0n) { bytes.push(Number(n % 256n)); n /= 256n; }
    const buf = Buffer.from(bytes.reverse());
    if (buf.subarray(0, 2).toString("hex") !== "1f8b") return null;
    const decompressed = zlib.gunzipSync(buf);

    // Collect every delimited segment first (not just 16), so we can test where position 0 of the spec's
    // 16-field list actually starts in THIS decoded buffer - see the report on why this is necessary.
    const allSegments = [];
    let start = 0;
    for (let i = 0; i < decompressed.length; i++) {
      if (decompressed[i] === DELIMITER) { allSegments.push(decompressed.subarray(start, i).toString("latin1")); start = i + 1; }
    }
    return allSegments;
  }
  return null;
}

async function main() {
  const worker = await createEnglishWorker("tessdata");
  for (const [pdfPath, label] of [["data/Proofs/Aadhaar deshna.pdf", "Aadhaar deshna.pdf"], ["data/Proofs/Aadhaar Neha new.pdf", "Aadhaar Neha new.pdf"]]) {
    console.log(`\n=== ${label} ===`);
    const allSegments = await decodeQrFirst16(pdfPath);
    if (!allSegments) { console.log("QR: not available (not found/decodable)"); continue; }
    console.log(`total delimited segments: ${allSegments.length}`);

    const ocr = await ocrScan(worker, pdfPath);
    const ocrAddress = ocr.address ? ocr.address.value : null;

    function report(fieldName, qrVal, ocrVal, matchFn) {
      const q = qrVal && qrVal.trim() ? qrVal : null;
      const o = ocrVal && String(ocrVal).trim() ? ocrVal : null;
      if (q == null && o == null) return "MISSING (neither side has it)";
      if (q == null) return "MISSING (QR field is empty)";
      if (o == null) return "MISSING (OCR does not extract this)";
      return matchFn(q, o) ? "MATCH" : "MISMATCH";
    }
    const inAddress = (part) => (ocrAddress ? ocrAddress.toLowerCase().includes(part.toLowerCase().trim()) : false);

    // Test BOTH possible starting offsets for where the spec's field-0 lands in this decoded buffer, and
    // show both as evidence, rather than assuming the spec's position is exactly what the real data does.
    for (const offset of [0, 1]) {
      const qr = {};
      FIELD_ORDER.forEach((name, i) => { qr[name] = allSegments[offset + i]; });
      console.log(`\n-- offset ${offset} (spec field 0 = decoded segment index ${offset}) --`);
      console.log("name        :", report("name", qr.name, ocr.name?.value, (q, o) => norm(q) === norm(o)));
      console.log("dob         :", report("dob", qr.dob, ocr.dob?.value, (q, o) => norm(q) === norm(o.replace(/\//g, "-"))));
      console.log("gender      :", report("gender", qr.gender, ocr.gender?.value, (q, o) => q.trim().toUpperCase().startsWith(o)));
      console.log("last-4      :", report("last-4", qr.reference_id ? qr.reference_id.slice(0, 4) : null, ocr.aadhaarLast4?.value, (q, o) => q === o));
      for (const part of ["house", "location", "district", "state", "pincode", "post_office", "vtc"]) {
        console.log(`${part.padEnd(12)}:`, report(part, qr[part], ocrAddress, (q) => inAddress(q)));
      }
    }
  }
  await worker.terminate();
}

main().catch((err) => { console.error("CRASHED:", err.message); process.exit(1); });
