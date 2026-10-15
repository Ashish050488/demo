// A proposed mapping for a new form, held in memory until a person checks it and creates the form. Only the BLANK
// form is written to disk (for page previews); a filled sample - it holds a real client's data - is read once and
// dropped, and its values live only in this in-memory draft until it expires.
import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { OUTPUT_DIRECTORY } from "../../../config/paths-config.js";
import { findFormBoxes } from "./find-form-boxes-service.js";
import { findPrintedLabel, findSectionHeading, proposeFieldName } from "./name-form-boxes-helpers.js";

const DRAFT_LIFETIME_MILLISECONDS = 2 * 60 * 60 * 1000;
const drafts = new Map(); // draftId -> draft
const DRAFTS_DIRECTORY = path.join(OUTPUT_DIRECTORY, "form-drafts");

export const getDraftBlankPath = (draftId) => path.join(DRAFTS_DIRECTORY, `${draftId}.pdf`);

// Drafts live in memory, so after a restart their blank copies belong to nobody.
await rm(DRAFTS_DIRECTORY, { recursive: true, force: true });

function forgetExpiredDrafts() {
  for (const [draftId, draft] of drafts) {
    if (Date.now() - draft.createdAt > DRAFT_LIFETIME_MILLISECONDS) { drafts.delete(draftId); rm(getDraftBlankPath(draftId), { force: true }).catch(() => {}); }
  }
}

/** Boxes in one row that share a printed label (the "1st / 2nd / 3rd Nominee" columns): numbered left to right. */
function numberColumnBoxes(namedBoxes) {
  const groups = new Map();
  for (const namedBox of namedBoxes) {
    const rowKey = `${namedBox.page}|${namedBox.label}`;
    if (!namedBox.label) continue;
    const group = groups.get(rowKey) || [];
    group.push(namedBox);
    groups.set(rowKey, group);
  }
  let columnCount = 1;
  for (const group of groups.values()) {
    // The same label can print on several rows (City for each nominee and again for the guardian): row by row.
    for (const rowBox of group) {
      if (rowBox.nominee != null) continue;
      const sameRow = group.filter((namedBox) => namedBox.nominee == null && Math.abs(namedBox.y - rowBox.y) <= 6);
      if (sameRow.length < 2 || sameRow.length > 3) continue;
      sameRow.sort((first, second) => first.x - second.x).forEach((namedBox, index) => { namedBox.nominee = index + 1; });
      columnCount = Math.max(columnCount, sameRow.length);
    }
  }
  return columnCount;
}

/** One value printed in several places (the client's name by every signature) -> one field: on another page it is
 * printed again there (alsoAt); twice on one page the second copies the first. */
function mergeRepeatedValues(fields) {
  const firstByValue = new Map();
  const mergedFields = [];
  for (const field of fields) {
    const repeatKey = field.nominee == null && field.sampleValue && !field.sampleValue.includes("\n") ? field.sampleValue.trim().toUpperCase() : null;
    const firstField = repeatKey ? firstByValue.get(repeatKey) : null;
    if (firstField && firstField.page !== field.page && !firstField.alsoAt.some((repeat) => repeat.page === field.page)) {
      firstField.alsoAt.push({ page: field.page, x: field.x, y: field.y, fontSize: field.fontSize, maxWidth: field.maxWidth });
      continue;
    }
    if (firstField) { mergedFields.push({ ...field, source: `copy.${firstField.key}`, matchedBy: "same value" }); continue; }
    if (repeatKey) firstByValue.set(repeatKey, field);
    mergedFields.push(field);
  }
  return mergedFields;
}

/** Room to the right before the next printed text on that row (or the page margin). */
function measureMaxWidth(box, blankItems, pageWidth) {
  const nextOnRow = blankItems.filter((blankItem) => blankItem.page === box.page && Math.abs(blankItem.y - box.y) <= 4 && blankItem.x > box.x + 10)
    .reduce((nearest, blankItem) => Math.min(nearest, blankItem.x), pageWidth - 30);
  return Math.round(Math.max(40, nextOnRow - box.x - 4));
}

/** A value may not run into the next box on its row (nominee 1's column ends where nominee 2's starts). */
function fitWidthsBetweenBoxes(fields) {
  return fields.map((field) => {
    const nextBoxX = fields.filter((other) => other !== field && other.page === field.page && Math.abs(other.y - field.y) <= 8 && other.x > field.x + 10)
      .reduce((nearest, other) => Math.min(nearest, other.x), Infinity);
    return nextBoxX === Infinity ? field : { ...field, maxWidth: Math.max(30, Math.min(field.maxWidth, Math.round(nextBoxX - field.x - 6))) };
  });
}

export async function createFormDraft({ blankBytes, blankFileName, filledBytes = null }) {
  forgetExpiredDrafts();
  const { method, boxes, blankItems, pageCount, pageSizes } = await findFormBoxes({ blankBytes, filledBytes });
  const namedBoxes = boxes.map((box) => ({
    ...box, label: box.pdfFieldTooltip || findPrintedLabel(box, blankItems) || box.pdfFieldName || "", nominee: null, sectionHeading: findSectionHeading(box, blankItems),
  }));
  const columnCount = numberColumnBoxes(namedBoxes);
  const usedKeys = new Map(); // key -> label it was given for
  const keyByColumnLabel = new Map(); // "page|label" of a nominee row -> its key
  const buildField = (box, proposal, key) => ({
    id: crypto.randomUUID(), key, label: box.label, source: proposal.source, matchedBy: proposal.matchedBy, page: box.page,
    x: Math.round(box.x * 100) / 100, y: Math.round(box.y * 100) / 100, fontSize: Math.round(box.fontSize * 2) / 2,
    type: box.lines.length > 1 ? "multiline" : "text", maxWidth: measureMaxWidth(box, blankItems, pageSizes[box.page - 1].width),
    maxY: box.lines.length > 1 ? Math.round(box.y + box.height + box.fontSize) : undefined, nominee: box.nominee,
    sampleValue: box.sampleValue, alsoAt: [], isRequired: !box.nominee || box.nominee === 1,
  });
  const fields = namedBoxes.map((box) => {
    const proposal = proposeFieldName(box.label, box.sampleValue, box);
    let key = box.nominee && proposal.key === "subscriber_name" ? "name" : proposal.key;
    // Nominee columns of one row share one key (email_n1, email_n2 ...).
    const columnKey = box.nominee ? `${box.page}|${box.label}` : null;
    if (columnKey && keyByColumnLabel.has(columnKey)) {
      return buildField(box, proposal, keyByColumnLabel.get(columnKey));
    }
    // Two different labels can map to one key ("Address" of the client and of the guardian): keep both apart.
    const takenBy = usedKeys.get(key);
    if (takenBy != null && (takenBy !== box.label || box.nominee == null)) {
      let suffix = 2;
      while (usedKeys.has(`${key}_${suffix}`)) suffix += 1;
      key = `${key}_${suffix}`;
    }
    usedKeys.set(key, box.label);
    if (columnKey) keyByColumnLabel.set(columnKey, key);
    return buildField(box, proposal, key);
  });
  const draftId = crypto.randomUUID();
  await mkdir(DRAFTS_DIRECTORY, { recursive: true });
  await writeFile(getDraftBlankPath(draftId), blankBytes);
  const draft = {
    draftId, blankFileName, method, pageCount, pageSizes, nomineeCount: columnCount, createdAt: Date.now(),
    fields: mergeRepeatedValues(fitWidthsBetweenBoxes(fields)),
    firstPageText: blankItems.filter((blankItem) => blankItem.page === 1).map((blankItem) => blankItem.text.trim()).filter((text) => text.length >= 12),
  };
  drafts.set(draftId, draft);
  return draft;
}

export function getFormDraft(draftId) {
  forgetExpiredDrafts();
  return drafts.get(draftId) || null;
}

export async function deleteFormDraft(draftId) {
  drafts.delete(draftId);
  await rm(getDraftBlankPath(draftId), { force: true });
}
