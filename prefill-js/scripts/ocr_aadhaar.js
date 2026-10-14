// Read the two Aadhaar scans in data/Proofs/ with tesseract.js and print name, date of birth, address and the
// last 4 digits of the Aadhaar number — never the full number. Fully offline: langPath points at tessdata/
// (fetch-tessdata.js downloads it once); no network call happens here.
//
// Nothing about Deshna's or Neha's actual field values is hardcoded anywhere in this file or in src/*.js —
// only the two filenames and labels below name *which* PDF is whose, for printing. Every value printed comes
// from OCR.
import { createWorker, PSM } from "tesseract.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

import { rasterizeFirstPage } from "../src/rasterize.js";
import { groupIntoLines } from "../src/layout.js";
import { extractFields } from "../src/aadhaar.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const TESSDATA = path.join(ROOT, "tessdata");
const PROOFS = path.join(ROOT, "data", "Proofs");

const SCANS = [
  { file: "Aadhaar deshna.pdf", label: "Deshna" },
  { file: "Aadhaar Neha new.pdf", label: "Neha" },
];

const PSM_MODES = [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]; // "6 and 11"

async function withTempPng(png, fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prefill-ocr-"));
  try {
    const file = path.join(dir, "page.png");
    await writeFile(file, png);
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function recognizeAt(worker, png, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  return withTempPng(png, (file) => worker.recognize(file));
}

/** Run every PSM mode for one worker/image, extract fields from each, keep the higher-confidence non-null
 * result per field ("try modes 6 and 11 and keep the better result per field"). */
async function bestOfPsm(worker, png) {
  const results = [];
  for (const psm of PSM_MODES) {
    const { data } = await recognizeAt(worker, png, psm);
    const lines = groupIntoLines(data.words);
    results.push(extractFields(lines));
  }
  const merged = {};
  for (const field of ["name", "dob", "address", "aadhaarLast4"]) {
    const candidates = results.map((r) => r[field]).filter(Boolean);
    merged[field] = candidates.length
      ? candidates.reduce((best, c) => (c.confidence > best.confidence ? c : best))
      : null;
  }
  return merged;
}

function fmt(field, { mask } = {}) {
  if (!field || field.value == null) return "null (not found)";
  const v = mask ? `XXXX XXXX ${field.value}` : field.value;
  const src = field.source ? `, ${field.source}` : "";
  return `${v}  [confidence ${field.confidence?.toFixed(0) ?? "?"}${src}]`;
}

async function main() {
  const engWorker = await createWorker(["eng"], 1, { langPath: TESSDATA, gzip: true, cacheMethod: "none" });
  const bilingualWorker = await createWorker(["eng", "tam"], 1, {
    langPath: TESSDATA, gzip: true, cacheMethod: "none",
  });

  for (const { file, label } of SCANS) {
    const full = path.join(PROOFS, file);
    console.log(`\n=== ${label}: ${file} ===`);
    const { png, threshold } = await rasterizeFirstPage(full, { scale: 3.0 });
    console.log(`(rendered at 3x, Otsu threshold ${threshold})`);

    // English-only pass for name / DOB / Aadhaar number (rule: these are English fields, don't let the
    // Tamil model's layout analysis drag English words into the wrong line).
    const eng = await bestOfPsm(engWorker, png);

    // Address: try the English-only result first; only fall back to the bilingual pass if English found
    // nothing (the address block is itself printed in English, but sits next to a Tamil column tesseract's
    // layout analysis can sometimes merge it with).
    let address = eng.address;
    if (!address) {
      const bilingual = await bestOfPsm(bilingualWorker, png);
      address = bilingual.address;
    }

    console.log("Name:   ", fmt(eng.name));
    console.log("DOB:    ", fmt(eng.dob));
    console.log("Address:", fmt(address));
    console.log("Aadhaar:", fmt(eng.aadhaarLast4, { mask: true }));
  }

  await engWorker.terminate();
  await bilingualWorker.terminate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
