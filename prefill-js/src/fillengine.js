// The field-writing core shared between the original fill scripts' logic and the server's "regenerate PDF
// from decisions" step. `getValue(field, label)` is the only thing that differs between the two: the original
// fill reads from OCR/Excel, regeneration reads from a prior results.json + any corrections on top of it.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";

import { extractTextItems } from "./pdftext.js";
import { columnBoundaries, rowBoundaryY, resolveLabels } from "./mapbuilder.js";
import { fitMultiline, drawCheckmark, LINE_HEIGHT_FACTOR, statusFor } from "./fillkit.js";

const ROW_BOTTOM_MARGIN = 2;

function round(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

// field.x/field.y (and the y we pass to page.drawText) is the text BASELINE, not the top of the glyphs -
// glyphs sit mostly ABOVE the baseline (ascenders ~0.85em up) with a little below it (descenders ~0.15em
// down). A box built as [baselineY, baselineY + fontSize] - the naive reading - lands almost entirely in the
// blank gap below the text, not on the text itself (confirmed by zooming into the rendered highlight: it sat
// on the line *below* the actual words). Same 0.85/0.15 split already used for glyph boxes in
// src/tickread.js and drawCheckmark - keep it consistent.
function glyphBox(x, baselineY, width, fontSize) {
  return { x, y: round(baselineY - fontSize * 0.85), width: round(width), height: round(fontSize * 1.0) };
}

/**
 * Write every mapping.fields entry onto a fresh copy of formConfig.blank, calling
 * `getValue(field, label) -> {value, confidence, sourceFile, skipReason, notApplicable}` for each one.
 * Returns { pdfDoc, results } - the caller saves the PDF and the results JSON itself.
 */
export async function fillTextFields(formConfig, mapping, getValue) {
  const blankItems = await extractTextItems(formConfig.blank);
  const boundaries = columnBoundaries(blankItems, formConfig.nomineeHeaderRe);
  const fallbackColWidth = (boundaries ? boundaries[1] - boundaries[0] : 100) - 10;
  const allLabels = resolveLabels(blankItems, formConfig.labels);
  const labelByKey = {};
  for (const l of allLabels) if (l.found) labelByKey[l.key] = l;
  const byKey = {};
  for (const f of mapping.fields) {
    if (f.nominee == null || f.x == null) continue;
    byKey[f.key] ??= {};
    byKey[f.key][f.nominee] = f.x;
  }
  function maxWidthFor(key) {
    const xs = byKey[key];
    if (xs && xs[1] != null && xs[2] != null) return xs[2] - xs[1] - 16;
    return fallbackColWidth;
  }

  const pdfBytes = await readFile(formConfig.blank);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  const results = [];
  for (const field of mapping.fields) {
    const label = `${field.key}${field.nominee != null ? `_n${field.nominee}` : ""}`;
    const got = (await getValue(field, label)) || {};
    const { value = null, confidence = null, sourceFile = null, skipReason = null, notApplicable = false, notProvided = false } = got;

    let bbox = field.x != null ? { x: field.x, y: field.y, width: null, height: null } : null;
    let lines = null; // one box per actual drawn line - what the UI highlights, instead of one loose rectangle
    let truncated = false;

    if (value != null && field.x != null) {
      const page = pages[field.page - 1];
      const pageHeight = page.getHeight();
      const baseY = pageHeight - field.y;

      if (field.type === "multiline") {
        const resolvedLabel = labelByKey[field.key];
        const nextY = resolvedLabel ? rowBoundaryY(blankItems, resolvedLabel, allLabels) : null;
        let availableHeight = (nextY != null ? nextY - field.y : field.fontSize * 6) - ROW_BOTTOM_MARGIN;
        if (field.maxY != null) availableHeight = Math.min(availableHeight, field.maxY - field.y);
        const fit = fitMultiline(value, font, field.fontSize || 10, maxWidthFor(field.key), availableHeight);
        const lineHeight = fit.fontSize * LINE_HEIGHT_FACTOR;
        lines = fit.lines.map((line, i) => {
          const lineBaseline = field.y + i * lineHeight;
          page.drawText(line, { x: field.x, y: baseY - i * lineHeight, size: fit.fontSize, font });
          return glyphBox(field.x, lineBaseline, font.widthOfTextAtSize(line, fit.fontSize), fit.fontSize);
        });
        truncated = fit.truncated;
        const maxLineWidth = Math.max(...fit.lines.map((l) => font.widthOfTextAtSize(l, fit.fontSize)));
        // the aggregate summary box (evidence panel only) still spans baseline-to-baseline across all lines
        bbox = { x: field.x, y: field.y, width: round(maxLineWidth), height: round(fit.lines.length * lineHeight) };
      } else {
        const fontSize = field.fontSize || 10;
        // A printed grey hint (e.g. "dd-mmm-yyyy") under the value is blanked first so the two don't overlap.
        if (field.cover) page.drawRectangle({ x: field.x + (field.cover.dx || 0), y: baseY - (field.cover.below || 3), width: field.cover.width, height: field.cover.height, color: rgb(1, 1, 1) });
        page.drawText(value, { x: field.x, y: baseY, size: fontSize, font });
        bbox = glyphBox(field.x, field.y, font.widthOfTextAtSize(value, fontSize), fontSize);
        lines = [bbox];
      }
    }

    const { status, reason } = statusFor({ value, truncated, confidence, skipReason, notApplicable, notProvided });
    results.push({
      field: label, page: field.page, bbox, lines, value, source: field.source,
      source_file: sourceFile, ocr_confidence: confidence, status, reason,
    });
  }

  return { pdfDoc, pages, results };
}

/** Redraw one tick-box mark (from a prior results.json record or a fresh decision) at its stored bbox. */
export function drawTick(pdfDoc, pages, record) {
  if (!record.bbox) return;
  const page = pages[record.page - 1];
  drawCheckmark(page, { x: record.bbox.x, y: record.bbox.y, w: record.bbox.width, h: record.bbox.height });
}
