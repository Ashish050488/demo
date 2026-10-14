// Read whether a printed checkbox/option glyph carries a mark, by sampling how much ink sits over its
// bounding box in a rendered page - used only to check the REAL sample's tick marks for comparison (our own
// output's marks are already known programmatically, from what the fill script drew).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "pdfjs-dist", "standard_fonts",
) + path.sep;

export async function renderPageImageData(pdfPath, pageNum, scale = 4) {
  const bytes = await readFile(pdfPath);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const cf = doc.canvasFactory;
  const { canvas, context } = cf.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  await doc.destroy();
  return { imageData, width: canvas.width, height: canvas.height, scale };
}

/** Average "ink" (0 = white, 1 = solid black) over a glyph's bounding box. `y` is the glyph's reported
 * baseline (our top-down point convention, same as everywhere else in this project) - the glyph itself sits
 * mostly ABOVE that baseline, not below it (confirmed against drawCheckmark's own y-flip math), so the actual
 * sample window is shifted up from a naive [y, y+h]. */
export function inkScore({ imageData, width, scale }, { x, y, w, h }) {
  const top = y - h * 0.85;
  const bottom = y + h * 0.15;
  const px0 = Math.max(0, Math.round(x * scale));
  const py0 = Math.max(0, Math.round(top * scale));
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round((bottom - top) * scale));
  let sum = 0, n = 0;
  for (let row = 0; row < ph; row++) {
    const py = py0 + row;
    if (py >= imageData.height) break;
    for (let col = 0; col < pw; col++) {
      const px = px0 + col;
      if (px >= width) break;
      const i = (py * width + px) * 4;
      const gray = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
      sum += 255 - gray;
      n++;
    }
  }
  return n ? sum / n / 255 : 0;
}

/** Which option (if any) is ticked, among a set of {option: bbox} candidates: the one with clearly the most
 * ink, well above the others (a checkmark roughly doubles+ a plain "o" glyph's own ink). null if none stands
 * out - an honest "can't tell" rather than a guess. */
export function detectTickedOption(page, optionBoxes, { marginFactor = 1.6 } = {}) {
  const scores = Object.entries(optionBoxes).map(([option, box]) => [option, inkScore(page, box)]);
  scores.sort((a, b) => b[1] - a[1]);
  const [topOption, topScore] = scores[0];
  const rest = scores.slice(1).map(([, s]) => s);
  const restAvg = rest.reduce((s, v) => s + v, 0) / (rest.length || 1);
  if (topScore > restAvg * marginFactor && topScore > 0.05) return topOption;
  return null;
}
