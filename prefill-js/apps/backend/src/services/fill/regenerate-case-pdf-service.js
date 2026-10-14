// "Regenerate PDF": re-fill one case from its first fill results with every reviewer correction applied. Writes
// to separate -regenerated paths; the first fill's PDF and results are never touched. No OCR here.
import { readFile, writeFile } from "node:fs/promises";
import { fillTextFields } from "../pdf/fill-pdf-service.js";
import { drawCheckmark } from "../pdf/pdf-drawing-helpers.js";
import { getTickOptionBox } from "../forms/tickbox-rules-service.js";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions } from "../forms/form-files-service.js";
import { fetchLatestDecisionsByField } from "../storage/decision-log-service.js";
import { getFillResultsPath, getRegeneratedPdfPath, getRegeneratedResultsPath } from "../storage/case-store-service.js";
import { createBaselineValueReader, getEffectiveTickOption } from "./baseline-value-reader.js";

export async function regenerateCasePdf(caseEntry) {
  const { formConfiguration } = getFormDefinition(caseEntry.formId);
  const fieldPositions = await fetchFieldPositions(caseEntry.formId);
  const baselineRecords = JSON.parse(await readFile(getFillResultsPath(caseEntry.id), "utf-8"));
  const latestDecisions = await fetchLatestDecisionsByField(caseEntry.id);

  const { pdfDoc, pages, results } = await fillTextFields(formConfiguration, fieldPositions, createBaselineValueReader(baselineRecords, latestDecisions));
  const tickRecords = [];
  for (const baselineRecord of baselineRecords) {
    if (!("option_chosen" in baselineRecord)) continue;
    const chosenOption = getEffectiveTickOption(baselineRecord, latestDecisions);
    const box = chosenOption ? getTickOptionBox(formConfiguration, baselineRecord.field, chosenOption) : null;
    const tickRecord = chosenOption && box && chosenOption !== baselineRecord.option_chosen
      ? { ...baselineRecord, value: chosenOption, option_chosen: chosenOption, bbox: box, lines: [box], status: "ok", reason: null }
      : baselineRecord;
    if (tickRecord.bbox) drawCheckmark(pages[tickRecord.page - 1], { x: tickRecord.bbox.x, y: tickRecord.bbox.y, w: tickRecord.bbox.width, h: tickRecord.bbox.height });
    tickRecords.push(tickRecord);
  }

  const allRecords = [...results, ...tickRecords];
  await writeFile(getRegeneratedPdfPath(caseEntry.id), await pdfDoc.save());
  await writeFile(getRegeneratedResultsPath(caseEntry.id), JSON.stringify(allRecords, null, 2));
  return { results: allRecords };
}
