// Page sizes of a PDF, cached per path - used to turn point-space boxes into 0..1 page fractions for the UI.
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

const pageSizesByPath = new Map();

/** [{width, height}] per page, index 0 = page 1. */
export async function fetchPageSizes(pdfPath) {
  if (!pageSizesByPath.has(pdfPath)) {
    const pdfDocument = await PDFDocument.load(await readFile(pdfPath));
    pageSizesByPath.set(pdfPath, pdfDocument.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() })));
  }
  return pageSizesByPath.get(pdfPath);
}

/** A point-space rect -> [x0, y0, x1, y1] as page fractions. */
export function toPageFractionBox(rect, pageSize) {
  if (!rect || !pageSize) return null;
  return [rect.x / pageSize.width, rect.y / pageSize.height,
    (rect.x + (rect.width || 0)) / pageSize.width, (rect.y + (rect.height || 0)) / pageSize.height];
}
