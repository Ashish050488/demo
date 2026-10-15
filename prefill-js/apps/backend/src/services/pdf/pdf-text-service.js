// Every text item on every page of a PDF, with its position and font size, via pdfjs-dist's text content API
// (no rendering/canvas needed for this - just the content stream's text operators).
import { readFile } from "node:fs/promises";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** transform is pdf.js's 6-number matrix [a,b,c,d,e,f]; (e,f) is the item's origin in PDF user-space points
 * (bottom-left, y up). Font size for unrotated text is the matrix's vertical scale, |d|; we don't handle
 * rotated text specially since none of these forms use it. */
function fontSizeOf(transform) {
  return Math.hypot(transform[2], transform[3]) || Math.hypot(transform[0], transform[1]);
}

export async function extractTextItems(pdfPath) {
  return extractTextItemsFromBytes(await readFile(pdfPath));
}

/** Same, for a PDF held in memory only (an uploaded filled sample is never written to disk). */
export async function extractTextItemsFromBytes(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const [, , , , e, f] = item.transform;
        pages.push({
          page: p,
          text: item.str,
          x: round(e),
          y: round(viewport.height - f), // flip to top-left origin, y down - easier to reason about on a page
          width: round(item.width),
          height: round(item.height || fontSizeOf(item.transform)),
          fontSize: round(fontSizeOf(item.transform)),
          pageHeight: round(viewport.height),
          pageWidth: round(viewport.width),
        });
      }
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
