// The per-form tick-box rules. Each apply function draws the ticks onto the already-built pages and returns the
// result records for them (same shape as a text-field record, plus option_chosen/rule). A reviewer's (or a
// batch sheet's) choice in `overrides` always REPLACES the rule's choice - never a second tick next to it.
import { drawCheckmark } from "../pdf/pdf-drawing-helpers.js";

function normalizeOptionText(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Where a tick box's checkmark goes for a given option on a (possibly per-nominee-column) field. Returns null
 * when that position was never confirmed - never a guessed position. */
export function getTickOptionBox(formConfiguration, fieldKey, optionValue) {
  const tickboxKey = fieldKey.replace(/_n\d+$/, "");
  const tickbox = formConfiguration.tickboxes.find((candidate) => candidate.key === tickboxKey);
  if (!tickbox || optionValue == null) return null;
  const columnNumber = Number((fieldKey.match(/_n(\d)$/) || [])[1]);
  if (tickbox.optionXByColumn && columnNumber && tickbox.optionY) {
    const optionY = tickbox.optionY[optionValue];
    return optionY == null ? null : { x: tickbox.optionXByColumn[columnNumber - 1], y: optionY, width: tickbox.w, height: tickbox.h };
  }
  if (tickbox.boxesByOption) {
    const [firstBox] = tickbox.boxesByOption[optionValue] || [];
    return firstBox ? { x: firstBox.x, y: firstBox.y, width: tickbox.w, height: tickbox.h } : null;
  }
  if (tickbox.optionX) {
    const optionX = tickbox.optionX[optionValue];
    return optionX == null ? null : { x: optionX, y: tickbox.y, width: tickbox.w, height: tickbox.h };
  }
  if (tickbox.x != null && tickbox.y != null) return { x: tickbox.x, y: tickbox.y, width: tickbox.w, height: tickbox.h };
  return null;
}

/** A tick box's page from its configuration - works even for one never drawn yet. */
export function getTickboxPage(formConfiguration, fieldKey) {
  return formConfiguration.tickboxes.find((tickbox) => tickbox.key === fieldKey.replace(/_n\d+$/, ""))?.page ?? null;
}

function buildTickRecord(tickbox, field, box, option, extra) {
  return {
    field, page: tickbox.page, bbox: box, lines: box ? [box] : null, options: tickbox.options, value: option,
    source: "rule", source_file: null, ocr_confidence: null, option_chosen: option, status: "ok", reason: null, ...extra,
  };
}

/** CRN: wish_to_nominate always ticked; one shared nominee ID-type row (reviewer's choice, else the type whose
 * number was filled); guardian ID type only when chosen. */
export function applyCrnBrokingDematTickboxes(pages, formConfiguration, { anyNomineeAadhaarLast4, idType, overrides = {} } = {}) {
  const tickRecords = [];
  const findTickbox = (key) => formConfiguration.tickboxes.find((tickbox) => tickbox.key === key);
  const tick = (tickbox, field, option, extra) => {
    const optionX = option == null ? tickbox.x : tickbox.optionX[option];
    const box = { x: optionX, y: tickbox.y, width: tickbox.w, height: tickbox.h };
    drawCheckmark(pages[tickbox.page - 1], { x: optionX, y: tickbox.y, w: tickbox.w, h: tickbox.h });
    tickRecords.push(buildTickRecord(tickbox, field, box, option ?? "ticked", extra));
  };
  const leaveEmpty = (tickbox, field, extra) => tickRecords.push(buildTickRecord(tickbox, field, null, null, { status: "needs_review", ...extra }));

  tick(findTickbox("wish_to_nominate"), "wish_to_nominate", null, { rule: "always ticked" });

  const nomineeIdType = findTickbox("nominee_id_type");
  const chosenIdType = (overrides.nominee_id_type && nomineeIdType.optionX[overrides.nominee_id_type] != null && overrides.nominee_id_type)
    || idType || (anyNomineeAadhaarLast4 ? "Aadhaar (last 4)" : null);
  if (chosenIdType) {
    tick(nomineeIdType, "nominee_id_type", chosenIdType, { rule: overrides.nominee_id_type ? "chosen on the review screen" : "ticked for the ID document whose number was filled" });
  } else {
    leaveEmpty(nomineeIdType, "nominee_id_type", { rule: "ticked for the ID document whose number was filled", reason: "no ID number read for nominee 1 - pick one" });
  }

  const guardianIdType = findTickbox("guardian_id_type");
  if (overrides.guardian_id_type && guardianIdType.optionX[overrides.guardian_id_type] != null) {
    tick(guardianIdType, "guardian_id_type", overrides.guardian_id_type, { rule: "chosen on the review screen" });
  } else {
    leaveEmpty(guardianIdType, "guardian_id_type", { rule: "only for a minor nominee", reason: "only needed for a minor nominee - pick one if so", status: "not_provided" });
  }
  return tickRecords;
}

/** CAMS: relationship and ID type ticked per nominee column. The relationship comes only from the reviewer or
 * a batch sheet (no ID document shows it); the ID type from the reviewer, else the ID whose number was filled. */
export function applyCamsNominationTickboxes(pages, formConfiguration, { idTypes = {}, overrides = {} } = {}) {
  const tickRecords = [];
  const draw = (tickbox, field, columnNumber, option, extra) => {
    const box = { x: tickbox.optionXByColumn[columnNumber - 1], y: tickbox.optionY[option], width: tickbox.w, height: tickbox.h };
    drawCheckmark(pages[tickbox.page - 1], { x: box.x, y: box.y, w: box.width, h: box.height });
    tickRecords.push(buildTickRecord(tickbox, field, box, option, extra));
  };
  const leaveEmpty = (tickbox, field, extra) => tickRecords.push(buildTickRecord(tickbox, field, null, null, { status: "needs_review", ...extra }));

  const relationshipTickbox = formConfiguration.tickboxes.find((tickbox) => tickbox.key === "relationship_option");
  const idTypeTickbox = formConfiguration.tickboxes.find((tickbox) => tickbox.key === "id_type");
  for (let columnNumber = 1; columnNumber <= relationshipTickbox.optionXByColumn.length; columnNumber += 1) {
    const relationshipField = `relationship_option_n${columnNumber}`;
    const chosenRelationship = overrides[relationshipField];
    if (chosenRelationship && relationshipTickbox.optionY[chosenRelationship] != null) {
      draw(relationshipTickbox, relationshipField, columnNumber, chosenRelationship, { source_file: "reviewer", rule: "chosen on the review screen" });
    } else if (chosenRelationship) {
      const matchedOption = relationshipTickbox.options.find((option) => option !== "Others" && normalizeOptionText(option) === normalizeOptionText(chosenRelationship));
      draw(relationshipTickbox, relationshipField, columnNumber, matchedOption || "Others", { source_file: "typed", rule: matchedOption ? "matches the typed relationship" : "typed relationship matched no option; Others ticked" });
    } else {
      leaveEmpty(relationshipTickbox, relationshipField, { rule: "pick the relationship on the review screen", reason: "Not on any ID document - pick one" });
    }

    const idTypeField = `id_type_n${columnNumber}`;
    const isReviewerChoice = overrides[idTypeField] && idTypeTickbox.optionY[overrides[idTypeField]] != null;
    const chosenIdType = isReviewerChoice ? overrides[idTypeField] : idTypes[columnNumber];
    if (chosenIdType) {
      draw(idTypeTickbox, idTypeField, columnNumber, chosenIdType, {
        source_file: isReviewerChoice ? "reviewer" : "uploaded ID document",
        rule: isReviewerChoice ? "chosen on the review screen" : "ticked for the ID document whose number was filled",
      });
    } else {
      leaveEmpty(idTypeTickbox, idTypeField, { rule: "ticked for the ID document whose number was filled", reason: "no ID number read for this nominee - pick one" });
    }
  }
  return tickRecords;
}

/** The option a typed answer means: exact, then ignoring case/punctuation, then a short answer ("A", "no") that
 * ends an option ("Series A"). null when nothing matches - never a guess. */
function matchTypedOption(options, typedAnswer) {
  const typedText = normalizeOptionText(typedAnswer);
  if (!typedText) return null;
  return options.find((option) => option === typedAnswer)
    || options.find((option) => normalizeOptionText(option) === typedText)
    || options.find((option) => normalizeOptionText(option).endsWith(typedText)) || null;
}

/** Forms whose tick boxes each have a usual answer (defaultOption) and fixed boxes per option (boxesByOption,
 * one box or several - e.g. one answer ticked on every question of a questionnaire). The Excel's or reviewer's
 * answer replaces the usual one; an answer that matches no option leaves the box empty for review. */
export function applyOptionTickboxes(pages, formConfiguration, { overrides = {} } = {}) {
  const tickRecords = [];
  for (const tickbox of formConfiguration.tickboxes) {
    if (tickbox.isAlwaysTicked) {
      const box = { x: tickbox.x, y: tickbox.y, width: tickbox.w, height: tickbox.h };
      drawCheckmark(pages[tickbox.page - 1], { x: box.x, y: box.y, w: box.width, h: box.height });
      tickRecords.push(buildTickRecord(tickbox, tickbox.key, box, "ticked", { rule: "always ticked" }));
      continue;
    }
    const typedAnswer = overrides[tickbox.key];
    const chosenOption = typedAnswer ? matchTypedOption(tickbox.options, typedAnswer) : tickbox.defaultOption;
    if (!chosenOption) {
      tickRecords.push(buildTickRecord(tickbox, tickbox.key, null, null, {
        status: "needs_review", rule: "pick one", reason: `"${typedAnswer}" is not one of: ${tickbox.options.join(" / ")}` }));
      continue;
    }
    const boxes = tickbox.boxesByOption[chosenOption];
    for (const box of boxes) drawCheckmark(pages[(box.page ?? tickbox.page) - 1], { x: box.x, y: box.y, w: tickbox.w, h: tickbox.h });
    const firstBox = { x: boxes[0].x, y: boxes[0].y, width: tickbox.w, height: tickbox.h };
    tickRecords.push(buildTickRecord(tickbox, tickbox.key, firstBox, chosenOption, {
      source_file: typedAnswer ? "typed" : "usual answer",
      rule: typedAnswer ? "from the Excel / review screen" : `usual answer - change it if this client differs${boxes.length > 1 ? ` (ticks all ${boxes.length} questions)` : ""}`,
    }));
  }
  return tickRecords;
}

/** Draws an option's tick: every box it has (a questionnaire answer can tick several), else its one box. */
export function drawTickOption(pages, formConfiguration, fieldKey, optionValue, pageNumber) {
  const tickbox = formConfiguration.tickboxes.find((candidate) => candidate.key === fieldKey.replace(/_n\d+$/, ""));
  const boxes = tickbox?.boxesByOption?.[optionValue];
  if (boxes) {
    for (const box of boxes) drawCheckmark(pages[(box.page ?? tickbox.page) - 1], { x: box.x, y: box.y, w: tickbox.w, h: tickbox.h });
    return;
  }
  const box = getTickOptionBox(formConfiguration, fieldKey, optionValue);
  if (box && pageNumber) drawCheckmark(pages[pageNumber - 1], { x: box.x, y: box.y, w: box.width, h: box.height });
}
