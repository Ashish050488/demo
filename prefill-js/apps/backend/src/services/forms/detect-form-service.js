// Which known blank form (if any) an uploaded PDF is - by its printed title text, checked against every phrase
// in that form's form-rules.json (one shared word like "Nomination" proves nothing). Works on the uploaded bytes
// only; they are never written to disk, and we always fill onto our OWN verified blank template.
import { listFormIds } from "../../forms/form-registry.js";
import { fetchFormRules } from "./form-files-service.js";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function readFirstPageText(pdfBytes) {
  const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), isEvalSupported: false }).promise;
  try {
    const firstPage = await pdfDocument.getPage(1);
    const textContent = await firstPage.getTextContent();
    return textContent.items.map((textItem) => textItem.str).join(" ");
  } finally {
    await pdfDocument.destroy();
  }
}

/** The matching form id, or null when no form matched confidently (or the file isn't a readable PDF). */
export async function detectFormId(pdfBytes) {
  let firstPageText;
  try {
    firstPageText = await readFirstPageText(pdfBytes);
  } catch {
    return null;
  }
  for (const formId of listFormIds()) {
    const { detectionPhrases } = await fetchFormRules(formId);
    if (detectionPhrases.every((phrase) => firstPageText.includes(phrase))) return formId;
  }
  return null;
}
