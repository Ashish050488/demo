// Fill step 1: which Aadhaar scan belongs to nominee 1, 2, 3 on the CRN form - written to a small gitignored
// config in data/, computed by the same method build_mapping.js used (OCR each scan, compare its name against
// the CRN sample's typed nominee name per column). No person's name is written into this script; only the
// resulting nominee-index -> scan-file-path assignment is written to the (gitignored) config file.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { createWorker, PSM } from "tesseract.js";

import { CRN_FORM } from "../src/mapping_config.js";
import { extractTextItems } from "../src/pdftext.js";
import { onlyInFilled } from "../src/difftext.js";
import { resolveLabels, columnBoundaries, columnOf } from "../src/mapbuilder.js";
import { rasterizeFirstPage } from "../src/rasterize.js";
import { groupIntoLines } from "../src/layout.js";
import { extractFields as extractAadhaarFields } from "../src/aadhaar.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TESSDATA = path.join(HERE, "..", "tessdata");
const OUT = "data/nominee_scan_config.json";

// Every Aadhaar scan we have, as candidates - not an assumption about which nominee each is.
const SCANS = ["data/Proofs/Aadhaar deshna.pdf", "data/Proofs/Aadhaar Neha new.pdf"];

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function fuzzyEqual(a, b) {
  const na = norm(a), nb = norm(b);
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

async function toTempPng(png) {
  const os = await import("node:os");
  const { writeFile: wf, mkdtemp } = await import("node:fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "scan-cfg-"));
  const file = path.join(dir, "p.png");
  await wf(file, png);
  return file;
}

async function ocrName(worker, scanPath) {
  const { png } = await rasterizeFirstPage(scanPath, { scale: 3.0 });
  let best = null;
  for (const psm of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(await toTempPng(png));
    const fields = extractAadhaarFields(groupIntoLines(data.words));
    if (fields.name && (!best || fields.name.confidence > best.confidence)) best = fields.name;
  }
  return best; // {value, confidence} | null
}

async function main() {
  const worker = await createWorker(["eng"], 1, { langPath: TESSDATA, gzip: true, cacheMethod: "none" });
  const scanNames = [];
  for (const scan of SCANS) scanNames.push({ scan, name: await ocrName(worker, scan) });
  await worker.terminate();

  const blankItems = await extractTextItems(CRN_FORM.blank);
  const labels = resolveLabels(blankItems, CRN_FORM.labels);
  const nameLabel = labels.find((l) => l.key === "name");
  const boundaries = columnBoundaries(blankItems, CRN_FORM.nomineeHeaderRe);

  const filledItems = await extractTextItems(CRN_FORM.filledSamples[0].path);
  const typed = onlyInFilled(blankItems, filledItems);
  const nameItems = typed.filter((it) => it.page === nameLabel.page && it.y >= nameLabel.y - 6 && it.y < nameLabel.y + 40);
  const byCol = { 1: [], 2: [], 3: [] };
  for (const it of nameItems) byCol[columnOf(it.x, boundaries)].push(it);

  const assignment = { nominee1: null, nominee2: null, nominee3: null };
  for (const col of [1, 2, 3]) {
    const text = byCol[col].sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").trim();
    if (!text) continue;
    const match = scanNames.find((s) => s.name && fuzzyEqual(s.name.value, text));
    if (match) assignment[`nominee${col}`] = match.scan;
  }

  await writeFile(OUT, JSON.stringify(assignment, null, 2));
  console.log(`wrote ${OUT}`);
  for (const col of [1, 2, 3]) {
    console.log(`  nominee${col}: ${assignment[`nominee${col}`] ? "assigned" : "unassigned"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
