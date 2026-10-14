// Which of our two supported blank forms (if either) an uploaded PDF is - by its printed title text, checked
// against TWO corroborating phrases per form (a single word like "Nomination" proves nothing; both forms use
// it). Works directly off the uploaded bytes, never writes them to disk - the uploaded blank form is only
// ever used for this identification, never as the template we actually draw on (see fillengine.js: we always
// fill onto our OWN verified blank template, whose field positions were measured against that exact file).
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const SIGNATURES = [
  { formType: "crn", phrases: ["FORM FOR NOMINATION", "Broking Code"] },
  { formType: "cams", phrases: ["Nomination Form", "Applicable for Individual Unitholders"] },
];

export const SUPPORTED_FORMS = [
  { formType: "crn", label: "CRN Broking & Demat — Nomination" },
  { formType: "cams", label: "CAMS Mutual Fund — Nomination (360 ONE / HDFC)" },
];

/** The first page's text, concatenated - just enough to check for our known title phrases. */
async function firstPageText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((i) => i.str).join(" ");
  } finally {
    await doc.destroy();
  }
}

/** {formType: "crn"|"cams"|null, needsVariant: bool} - null formType means neither matched confidently. */
export async function detectForm(bytes) {
  let text;
  try {
    text = await firstPageText(bytes);
  } catch {
    return { formType: null, needsVariant: false }; // not a readable PDF at all
  }
  for (const sig of SIGNATURES) {
    if (sig.phrases.every((p) => text.includes(p))) {
      return { formType: sig.formType, needsVariant: sig.formType === "cams" };
    }
  }
  return { formType: null, needsVariant: false };
}
