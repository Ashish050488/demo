// Puts the client's signature image on every place the form marks for the subscriber's signature: scaled to fit the
// box (never stretched), sitting on its bottom line. Places for someone else (an entity's signatory, a controlling
// person) are never signed with the subscriber's image.
import { readFile } from "node:fs/promises";
import { StandardFonts, rgb } from "pdf-lib";
import { findSignature, findTypedSignature } from "../documents/signature-store-service.js";

export const SUBSCRIBER_SIGNER = "subscriber";

/** Every signature place of the form: [{page, signer, label}] - for the review screen's "sign here" list. */
export function listSignaturePlaces(formConfiguration) {
  return (formConfiguration.signatureBoxes || []).map(({ page, signer, label }) => ({ page, signer, label }));
}

/** A typed signature: the name in black italic signature-style font, as large as the box allows, on its bottom line. */
function drawTypedSignature(pdfDoc, pages, boxes, typedName, font) {
  for (const box of boxes) {
    const page = pages[box.page - 1];
    if (!page) continue;
    const fontSize = Math.min(box.h * 0.75, 20, (box.w / Math.max(1, font.widthOfTextAtSize(typedName, 10))) * 10);
    page.drawText(typedName, { x: box.x + 2, y: page.getHeight() - box.y - box.h + box.h * 0.22, size: fontSize, font, color: rgb(0, 0, 0) });
  }
}

/** Draws the case's signature (if any) onto the pages; returns the pages it was put on. */
export async function drawSignatures(pdfDoc, pages, formConfiguration, caseId) {
  const signature = findSignature(caseId);
  const boxes = (formConfiguration.signatureBoxes || []).filter((box) => box.signer === SUBSCRIBER_SIGNER);
  if (!boxes.length) return [];
  if (!signature) {
    const typedName = findTypedSignature(caseId);
    if (typedName) drawTypedSignature(pdfDoc, pages, boxes, typedName, await pdfDoc.embedFont(StandardFonts.TimesRomanItalic));
    return typedName ? [...new Set(boxes.map((box) => box.page))] : [];
  }
  const imageBytes = await readFile(signature.path);
  const image = signature.mimeType === "image/png" ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
  for (const box of boxes) {
    const page = pages[box.page - 1];
    if (!page) continue;
    const scale = Math.min(box.w / image.width, box.h / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    // box.y is the top of the box (top-left page units); pdf-lib draws from the bottom-left.
    page.drawImage(image, { x: box.x, y: page.getHeight() - box.y - box.h, width, height });
  }
  return [...new Set(boxes.map((box) => box.page))];
}
