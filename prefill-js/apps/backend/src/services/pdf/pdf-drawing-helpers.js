// Drawing helpers for writing onto a PDF page: wrap/shrink text to fit a box, draw a vector checkmark, and the
// audit status recorded for every filled field. No form-specific knowledge here.
import { rgb } from "pdf-lib";

export const MIN_FONT_SIZE = 6;
export const LINE_HEIGHT_FACTOR = 1.1;

export function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink fontSize (down to MIN_FONT_SIZE) until the wrapped text fits availableHeight; if even the floor
 * size doesn't fit, truncate to however many lines do fit rather than let any line cross the row boundary. */
export function fitMultiline(value, font, maxFontSize, maxWidth, availableHeight) {
  for (let fs = Math.round(maxFontSize); fs >= MIN_FONT_SIZE; fs--) {
    const lines = wrapText(value, font, fs, maxWidth);
    if (lines.length * fs * LINE_HEIGHT_FACTOR <= availableHeight) {
      return { fontSize: fs, lines, truncated: false };
    }
  }
  const fs = MIN_FONT_SIZE;
  const lines = wrapText(value, font, fs, maxWidth);
  const maxLines = Math.max(1, Math.floor(availableHeight / (fs * LINE_HEIGHT_FACTOR)));
  return { fontSize: fs, lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

export const LOW_CONFIDENCE_THRESHOLD = 85;

/** The audit status for one field's result record. `skipReason` is whatever explanation the fill loop already
 * has for why value is null (no document assigned, OCR found nothing, not typed yet, ...) - never dropped, so
 * a null value is always explained. `notProvided` = a typed field nobody has typed yet; `notApplicable` = the
 * field doesn't apply to this case (e.g. an ID row for an ID type that isn't ticked). */
export function statusFor({ value, truncated, confidence, skipReason, notApplicable, notProvided }) {
  if (value == null) {
    if (notApplicable) return { status: "not_applicable", reason: skipReason || "not applicable" };
    if (notProvided) return { status: "not_provided", reason: skipReason || "not provided" };
    return { status: "needs_review", reason: skipReason || "value null" };
  }
  if (truncated) return { status: "needs_review", reason: "text truncated" };
  if (confidence != null && confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { status: "low_confidence", reason: `OCR confidence ${confidence.toFixed(0)} below ${LOW_CONFIDENCE_THRESHOLD}` };
  }
  return { status: "ok", reason: null };
}

/** A checkmark ✓ drawn as two vector line segments inside a glyph's bounding box (x,y,w,h - our top-down
 * point convention; converted to pdf-lib's bottom-up page space here). */
export function drawCheckmark(page, { x, y, w, h }) {
  const pageHeight = page.getHeight();
  const bottom = pageHeight - y - h * 0.15;
  const top = bottom + h * 0.85;
  const left = x + w * 0.1;
  const right = x + w * 0.9;
  const midX = left + (right - left) * 0.38;
  const midY = bottom + (top - bottom) * 0.15;
  const color = rgb(0, 0, 0);
  const thickness = Math.max(0.8, h * 0.09);
  page.drawLine({ start: { x: left, y: top * 0.55 + bottom * 0.45 }, end: { x: midX, y: midY }, thickness, color });
  page.drawLine({ start: { x: midX, y: midY }, end: { x: right, y: top }, thickness, color });
}
