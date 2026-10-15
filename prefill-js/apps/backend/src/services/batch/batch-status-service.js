// What the batch screen shows for each client: its stage (Waiting -> Reading documents -> Filling -> Done or
// Needs fixing, or Failed / Saved), how many documents are read, and how many fields are filled or need fixing.
import { readFile, stat } from "node:fs/promises";
import { checkForm } from "@prefill/shared";
import { getCase, getFillResultsPath } from "../storage/case-store-service.js";
import { fetchFormRules } from "../forms/form-files-service.js";
import { DOCUMENT_STATUSES } from "../documents/process-document-service.js";
import { BATCH_STAGES } from "./batch-runner-service.js";

export const CLIENT_STAGES = { WAITING: "waiting", READING: "reading", FILLING: "filling", DONE: "done", NEEDS_FIXING: "needs_fixing", FAILED: "failed", SAVED: "saved" };

const fillSummaryCache = new Map(); // caseId -> {modifiedAt, summary}: results are only reread when they change

/** {filledCount, fieldCount, problemCount, problemFields} from a case's fill results, checked like Continue does. */
async function summarizeFill(caseId, formRules) {
  const resultsPath = getFillResultsPath(caseId);
  const modifiedAt = (await stat(resultsPath).catch(() => null))?.mtimeMs;
  if (!modifiedAt) return null;
  const cached = fillSummaryCache.get(caseId);
  if (cached?.modifiedAt === modifiedAt) return cached.summary;
  const fillResults = JSON.parse(await readFile(resultsPath, "utf-8"));
  const fieldValues = Object.fromEntries(fillResults.map((fillResult) => [fillResult.field, fillResult.value ?? fillResult.option_chosen ?? null]));
  const { missing, invalid } = checkForm(formRules, fieldValues);
  const problemFields = new Set([...missing, ...invalid.map((invalidField) => invalidField.field),
    ...fillResults.filter((fillResult) => fillResult.status === "invalid").map((fillResult) => fillResult.field)]);
  const shownResults = fillResults.filter((fillResult) => fillResult.status !== "not_applicable");
  const summary = {
    filledCount: shownResults.filter((fillResult) => fillResult.value != null || fillResult.option_chosen != null).length,
    fieldCount: shownResults.length, problemCount: problemFields.size,
  };
  fillSummaryCache.set(caseId, { modifiedAt, summary });
  return summary;
}

function getClientStage(caseEntry, fillSummary) {
  if (caseEntry.confirmedAt) return CLIENT_STAGES.SAVED;
  if (caseEntry.batchStage === BATCH_STAGES.FAILED) return CLIENT_STAGES.FAILED;
  if (caseEntry.batchStage === BATCH_STAGES.DONE && fillSummary) return fillSummary.problemCount ? CLIENT_STAGES.NEEDS_FIXING : CLIENT_STAGES.DONE;
  if (caseEntry.batchStage === BATCH_STAGES.FILLING) return CLIENT_STAGES.FILLING;
  if (caseEntry.documents.some((caseDocument) => caseDocument.status === DOCUMENT_STATUSES.PROCESSING)) return CLIENT_STAGES.READING;
  return CLIENT_STAGES.WAITING;
}

export async function buildBatchStatus(batchEntry) {
  const formIds = batchEntry.formIds || [batchEntry.formId];
  const rulesByFormId = Object.fromEntries(await Promise.all(formIds.map(async (formId) => [formId, await fetchFormRules(formId)])));
  const formRules = rulesByFormId[formIds[0]];
  const clients = [];
  for (const batchRow of batchEntry.rows) {
    const caseEntry = await getCase(batchRow.caseId);
    if (!caseEntry) continue; // deleted on its own
    const rowFormRules = rulesByFormId[caseEntry.formId] || formRules;
    // A form still waiting for its first form's documents shows those documents' progress.
    const documentSource = caseEntry.documentsFromCaseId && !caseEntry.documentsSharedAt ? (await getCase(caseEntry.documentsFromCaseId)) || caseEntry : caseEntry;
    const fillSummary = caseEntry.batchStage === BATCH_STAGES.DONE || caseEntry.confirmedAt ? await summarizeFill(caseEntry.id, rowFormRules) : null;
    clients.push({
      caseId: caseEntry.id, formId: caseEntry.formId, formLabel: rowFormRules.label, formShortLabel: rowFormRules.shortLabel || rowFormRules.label,
      documentsFromCaseId: caseEntry.documentsFromCaseId || null, rowNumber: batchRow.rowNumber, clientReference: batchRow.clientReference, displayName: batchRow.displayName,
      stage: getClientStage({ ...caseEntry, documents: documentSource.documents }, fillSummary), error: caseEntry.batchError || null, rowProblemCount: batchRow.rowProblemCount || 0,
      documentCount: documentSource.documents.length,
      readDocumentCount: documentSource.documents.filter((caseDocument) => caseDocument.status !== DOCUMENT_STATUSES.PROCESSING).length,
      filledCount: fillSummary?.filledCount ?? null, fieldCount: fillSummary?.fieldCount ?? null, problemCount: fillSummary?.problemCount ?? null,
    });
  }
  const stageCounts = Object.fromEntries(Object.values(CLIENT_STAGES).map((stage) => [stage, clients.filter((client) => client.stage === stage).length]));
  return {
    id: batchEntry.id, formId: batchEntry.formId, formIds, formLabel: formIds.map((formId) => rulesByFormId[formId].label).join(" + "),
    forms: formIds.map((formId) => ({ formId, label: rulesByFormId[formId].label, shortLabel: rulesByFormId[formId].shortLabel || rulesByFormId[formId].label })), sheetFileName: batchEntry.sheetFileName,
    createdAt: batchEntry.createdAt, startedAt: batchEntry.startedAt, warnings: batchEntry.warnings || [], clients, stageCounts,
  };
}
