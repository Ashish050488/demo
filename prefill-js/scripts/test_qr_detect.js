// Step 0 test only (no code for the real pipeline yet): can we find and decode a UIDAI Secure QR locally, on
// our two real Aadhaar scans? jsQR first; if it fails, zxing-wasm (a local WASM build of ZXing-C++, no
// network). Prints only yes/no and structural facts - never a decoded value.
import jsQR from "jsqr";
import { readBarcodesFromImageData, setZXingModuleOverrides } from "zxing-wasm/reader";
import zlib from "node:zlib";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";
import { renderPage } from "../src/rasterize.js";

setZXingModuleOverrides({ wasmBinary: readFileSync(new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))) });

const SCALES = [3, 4];
const DELIMITER = 0xff;

async function pageImageData(pdfPath, scale) {
  const { png } = await renderPage(pdfPath, 1, { scale });
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function decimalStringToBytes(decStr) {
  let n = BigInt(decStr);
  const bytes = [];
  while (n > 0n) { bytes.push(Number(n % 256n)); n /= 256n; }
  return bytes.reverse();
}

async function tryJsQR(imageData) {
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result ? result.data : null;
}

async function tryZXing(imageData) {
  const results = await readBarcodesFromImageData(imageData, { formats: ["QRCode"], tryHarder: true, maxNumberOfSymbols: 1 });
  return results.length ? results[0].text : null;
}

async function testScan(pdfPath, label) {
  console.log(`\n=== ${label} ===`);
  let payload = null;
  let reader = null;
  let scaleUsed = null;

  for (const scale of SCALES) {
    const imageData = await pageImageData(pdfPath, scale);
    const viaJsQR = await tryJsQR(imageData);
    if (viaJsQR) { payload = viaJsQR; reader = "jsQR"; scaleUsed = scale; break; }
    const viaZXing = await tryZXing(imageData);
    if (viaZXing) { payload = viaZXing; reader = "zxing-wasm"; scaleUsed = scale; break; }
  }

  console.log("found:", Boolean(payload));
  if (!payload) { console.log("reader that worked: none (tried jsQR, zxing-wasm at scales " + SCALES.join(", ") + ")"); return; }
  console.log("reader that worked:", reader, "at scale", scaleUsed);

  const isNumeric = /^\d+$/.test(payload);
  console.log("payload is a decimal-digit string (expected for Secure QR numeric encoding):", isNumeric);

  if (!isNumeric) {
    console.log("not numeric -> looks like an older plain-text/XML QR, not the Secure QR binary format");
    console.log("looks like XML:", /^\s*<[A-Za-z?]/.test(payload));
    return;
  }

  const bytes = Buffer.from(decimalStringToBytes(payload));
  console.log("decoded:", true, "(digits -> bytes via BigInt)");
  const firstBytesHex = bytes.subarray(0, 2).toString("hex");
  console.log("first 2 bytes (hex):", firstBytesHex);

  let text;
  if (firstBytesHex === "1f8b") {
    text = zlib.gunzipSync(bytes);
    console.log("compression: gzip (1f 8b magic) -> gunzipSync");
  } else {
    console.log("compression: NOT gzip - first bytes were", firstBytesHex, "(not decompressing further; reporting raw byte length only)");
    console.log("raw byte length:", bytes.length);
    return;
  }

  // Split on 0xFF. The photo (JPEG) and signature are themselves binary and contain incidental 0xFF bytes, so
  // only the delimiters BEFORE that binary tail are real field separators.
  const fields = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === DELIMITER) { fields.push(text.subarray(start, i)); start = i + 1; }
  }
  fields.push(text.subarray(start));
  console.log("total 0xFF-delimited segments (includes the binary photo/signature tail):", fields.length);

  // Identify fields from the DECODED STRUCTURE (regex shape only - never printing a segment's own content),
  // instead of assuming a fixed position order. INDIAN_STATES is a closed list, so an exact match there is
  // real evidence, not a guess.
  const INDIAN_STATES = new Set([
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana",
    "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur",
    "meghalaya", "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana",
    "tripura", "uttar pradesh", "uttarakhand", "west bengal", "andaman and nicobar islands", "chandigarh",
    "dadra and nagar haveli and daman and diu", "delhi", "jammu and kashmir", "ladakh", "lakshadweep",
    "puducherry",
  ]);
  const classifiers = [
    ["gender (M/F/T, exactly 1 byte)", (s) => /^[MFT]$/.test(s)],
    ["dob (DD-MM-YYYY, exactly 10 bytes)", (s) => /^\d{2}-\d{2}-\d{4}$/.test(s)],
    ["pincode (6 digits)", (s) => /^\d{6}$/.test(s)],
    ["email_mobile_status (single digit 0-3)", (s) => /^[0-3]$/.test(s)],
    ["state (exact match against the closed list of Indian states/UTs)", (s) => INDIAN_STATES.has(s.trim().toLowerCase())],
  ];
  const confirmed = [];
  for (let i = 0; i < fields.length - 1; i++) { // last segment is the binary photo+signature tail, never inspected
    const s = fields[i].toString("latin1");
    for (const [name, test] of classifiers) {
      if (test(s)) confirmed.push({ index: i, name });
    }
  }
  console.log("fields confirmed by shape from the decoded structure (index: what matched - no content printed):");
  for (const c of confirmed) console.log(`  [${c.index}] ${c.name}`);
  console.log("pin code present:", confirmed.some((c) => c.name.startsWith("pincode")));
  console.log("state present:", confirmed.some((c) => c.name.startsWith("state")));
  console.log(`unconfirmed segments (shape didn't match any known field pattern; NOT naming these positionally): ${fields.length - 1 - confirmed.length} of ${fields.length - 1} text segments`);
}

async function main() {
  await testScan("data/Proofs/Aadhaar deshna.pdf", "Aadhaar deshna.pdf");
  await testScan("data/Proofs/Aadhaar Neha new.pdf", "Aadhaar Neha new.pdf");
}

main().catch((err) => { console.error("CRASHED:", err.message); process.exit(1); });
