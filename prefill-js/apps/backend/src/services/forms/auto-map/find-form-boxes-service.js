// Finds where a new form wants its values, best evidence first:
//   1. A filled sample next to the blank: every text the sample has and the blank doesn't is a value, at its exact
//      place, size and line count (how 360 ONE's own filled forms look).
//   2. Fill-in boxes built into the PDF (AcroForm fields): their rectangles.
//   3. Blank only: "____" runs and "Label:" with empty space after it.
// Boxes are in the app's usual units: page, x / y of the text baseline in PDF points from the top-left.
import { PDFDocument, PDFName } from "pdf-lib";
import { extractTextItemsFromBytes } from "../../pdf/pdf-text-service.js";

export const BOX_FINDING_METHODS = { FILLED_SAMPLE: "filled-sample", PDF_FIELDS: "pdf-fields", PRINTED_BLANKS: "printed-blanks" };
const SAME_POSITION_TOLERANCE = 1.5;
const MINIMUM_UNDERSCORE_RUN = 4;

const positionKey = (textItem) => `${textItem.page}|${textItem.text.trim()}|${Math.round(textItem.x)}|${Math.round(textItem.y)}`;

/** Lines printed under each other at the same x (an address over 3 lines) become one box with several lines. */
function joinLinesIntoBoxes(valueItems) {
  const sortedItems = [...valueItems].sort((first, second) => first.page - second.page || first.x - second.x || first.y - second.y);
  const boxes = [];
  for (const valueItem of sortedItems) {
    const previousBox = boxes[boxes.length - 1];
    const lineGap = previousBox ? valueItem.y - previousBox.lastLineY : null;
    const isNextLine = previousBox && previousBox.page === valueItem.page && Math.abs(previousBox.x - valueItem.x) <= SAME_POSITION_TOLERANCE * 2
      // Wrapped lines sit about one font size apart; table rows (bank name / SWIFT / account) are further apart.
      && lineGap > valueItem.fontSize * 0.5 && lineGap <= Math.max(previousBox.fontSize, valueItem.fontSize) * 1.3;
    if (isNextLine) {
      previousBox.lines.push(valueItem.text.trim());
      previousBox.lastLineY = valueItem.y;
      previousBox.width = Math.max(previousBox.width, valueItem.width);
    } else {
      boxes.push({ page: valueItem.page, x: valueItem.x, y: valueItem.y, fontSize: valueItem.fontSize, width: valueItem.width, lines: [valueItem.text.trim()], lastLineY: valueItem.y });
    }
  }
  return boxes.map(({ lastLineY, ...box }) => ({ ...box, height: lastLineY - box.y + box.fontSize, sampleValue: box.lines.join("\n") }));
}

function findBoxesFromFilledSample(blankItems, filledItems) {
  const blankKeys = new Set(blankItems.map(positionKey));
  const valueItems = filledItems.filter((filledItem) => !blankKeys.has(positionKey(filledItem)) && filledItem.text.trim());
  return joinLinesIntoBoxes(valueItems);
}

/** The page each AcroForm widget sits on, from the pages' own annotation lists. */
async function findBoxesFromPdfFields(blankBytes) {
  const pdfDocument = await PDFDocument.load(blankBytes, { ignoreEncryption: true });
  const fields = pdfDocument.getForm().getFields();
  if (!fields.length) return [];
  const pageNumberByWidgetRef = new Map();
  pdfDocument.getPages().forEach((page, pageIndex) => {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), Object) ?? null;
    for (const annotationRef of annotations?.asArray?.() || []) pageNumberByWidgetRef.set(String(annotationRef), pageIndex + 1);
  });
  const boxes = [];
  for (const field of fields) {
    const isText = field.constructor.name === "PDFTextField";
    for (const widget of field.acroField.getWidgets()) {
      const widgetRef = pdfDocument.context.getObjectRef(widget.dict);
      const pageNumber = pageNumberByWidgetRef.get(String(widgetRef)) || 1;
      const pageHeight = pdfDocument.getPage(pageNumber - 1).getHeight();
      const rectangle = widget.getRectangle();
      if (!isText || rectangle.width < 10) continue; // tick boxes are mapped by hand for now
      const fontSize = Math.min(10, Math.max(7, rectangle.height - 4));
      boxes.push({
        page: pageNumber, x: rectangle.x + 2, y: pageHeight - rectangle.y - Math.max(2, (rectangle.height - fontSize) / 2) - 1, fontSize,
        width: rectangle.width - 4, height: rectangle.height, lines: [], sampleValue: field.getText?.() || "",
        pdfFieldName: field.acroField.getPartialName?.() || field.getName(), pdfFieldTooltip: field.acroField.dict.lookup(PDFName.of("TU"))?.decodeText?.() || null,
      });
    }
  }
  return boxes;
}

/** "Name: ________" and "Date:" followed by nothing: the value goes where the blank line starts. */
function findBoxesFromPrintedBlanks(blankItems) {
  const boxes = [];
  const underscoreRun = new RegExp(`_{${MINIMUM_UNDERSCORE_RUN},}`);
  for (const blankItem of blankItems) {
    const runMatch = underscoreRun.exec(blankItem.text);
    if (runMatch) {
      const characterWidth = blankItem.width / Math.max(1, blankItem.text.length);
      boxes.push({ page: blankItem.page, x: blankItem.x + runMatch.index * characterWidth + 2, y: blankItem.y - 1, fontSize: Math.min(11, blankItem.fontSize),
        width: runMatch[0].length * characterWidth, height: blankItem.fontSize, lines: [], sampleValue: "" });
      continue;
    }
    if (!/:\s*$/.test(blankItem.text)) continue;
    const rightEdge = blankItem.x + blankItem.width;
    const hasTextAfter = blankItems.some((otherItem) => otherItem.page === blankItem.page && Math.abs(otherItem.y - blankItem.y) < 4 && otherItem.x > rightEdge && otherItem.x < rightEdge + 120);
    if (!hasTextAfter) {
      boxes.push({ page: blankItem.page, x: rightEdge + 6, y: blankItem.y, fontSize: Math.min(11, blankItem.fontSize), width: 150, height: blankItem.fontSize, lines: [], sampleValue: "" });
    }
  }
  return boxes;
}

/** {method, boxes, blankItems, pageCount, pageSizes}. The filled sample's bytes are only read here, never stored. */
export async function findFormBoxes({ blankBytes, filledBytes = null }) {
  const blankItems = await extractTextItemsFromBytes(blankBytes);
  const blankDocument = await PDFDocument.load(blankBytes, { ignoreEncryption: true });
  const pageSizes = blankDocument.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() }));
  const result = (method, boxes) => ({ method, boxes, blankItems, pageCount: pageSizes.length, pageSizes });
  if (filledBytes) {
    const filledItems = await extractTextItemsFromBytes(filledBytes);
    const sampleBoxes = findBoxesFromFilledSample(blankItems, filledItems);
    if (sampleBoxes.length) return result(BOX_FINDING_METHODS.FILLED_SAMPLE, sampleBoxes);
  }
  const fieldBoxes = await findBoxesFromPdfFields(blankBytes).catch(() => []);
  if (fieldBoxes.length) return result(BOX_FINDING_METHODS.PDF_FIELDS, fieldBoxes);
  return result(BOX_FINDING_METHODS.PRINTED_BLANKS, findBoxesFromPrintedBlanks(blankItems));
}
