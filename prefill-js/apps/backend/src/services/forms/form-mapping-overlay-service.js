// The Form setup screen's overlay: every mapped text box and tick option, as page-fraction boxes over the
// BLANK form, with where its value comes from and whether it is required.
import { RULE_TEXT } from "@prefill/shared";
import { fetchPageSizes } from "../pdf/page-size-service.js";
import { getTickOptionBox } from "./tickbox-rules-service.js";
import { fetchFieldPositions, fetchFieldSources, fetchFormRules } from "./form-files-service.js";

const SOURCE_WORDS = { typed: "Typed / batch sheet", today: "Today's date", tick: "Tick box (rule / reviewer)" };
const describeSource = (fieldSource) => (fieldSource?.startsWith("document.") ? "Uploaded documents" : SOURCE_WORDS[fieldSource] || "Not mapped");

export async function buildFormMappingOverlay(formDefinition) {
  const { formId, formConfiguration } = formDefinition;
  const [{ fields }, fieldSources, formRules] = await Promise.all([fetchFieldPositions(formId), fetchFieldSources(formId), fetchFormRules(formId)]);
  const pageSizes = await fetchPageSizes(formConfiguration.blankFormPath);
  const requiredFields = new Set(formRules.requiredFields);
  const toFractions = (pageNumber, x, y, width, height) => {
    const pageSize = pageSizes[pageNumber - 1];
    return [x / pageSize.width, y / pageSize.height, (x + width) / pageSize.width, (y + height) / pageSize.height];
  };
  const overlayItems = [];
  for (const field of fields) {
    if (field.x == null || (field.nominee ?? 0) > formRules.supportedNomineeCount) continue;
    const fontSize = field.fontSize || 10;
    const isMultiline = field.type === "multiline";
    const height = isMultiline ? Math.max(fontSize * 1.2, (field.maxY ?? field.y + fontSize * 1.6) - field.y + fontSize * 0.85) : fontSize * 1.15;
    // never wider than this nominee's column, so a box can't spill into the next column
    const nextColumnXs = field.nominee ? fields.filter((other) => other.nominee === field.nominee + 1 && other.page === field.page && other.x != null).map((other) => other.x) : [];
    const width = Math.min(isMultiline ? 120 : 95, (nextColumnXs.length ? Math.min(...nextColumnXs) : Infinity) - field.x - 16);
    overlayItems.push({
      id: `${field.key}${field.nominee != null ? `_n${field.nominee}` : ""}`, key: field.key, nominee: field.nominee, page: field.page,
      kind: "text", source: describeSource(fieldSources[field.key]), isRequired: requiredFields.has(field.key),
      rule: RULE_TEXT[field.key] || "Free text", box: toFractions(field.page, field.x - 1, field.y - fontSize * 0.9, width, height),
    });
  }
  for (const tickbox of formConfiguration.tickboxes) {
    const columnNumbers = tickbox.optionXByColumn ? Array.from({ length: formRules.supportedNomineeCount }, (_unused, index) => index + 1) : [null];
    for (const columnNumber of columnNumbers) {
      for (const option of tickbox.options || [null]) {
        const fieldKey = columnNumber ? `${tickbox.key}_n${columnNumber}` : tickbox.key;
        const box = option == null ? { x: tickbox.x, y: tickbox.y, width: tickbox.w, height: tickbox.h } : getTickOptionBox(formConfiguration, fieldKey, option);
        if (!box || box.x == null || box.y == null) continue;
        overlayItems.push({
          id: `${fieldKey}${option ? ` = ${option}` : ""}`, key: tickbox.key, nominee: columnNumber, page: tickbox.page, kind: "tick", option,
          source: SOURCE_WORDS.tick, isRequired: requiredFields.has(tickbox.key), rule: "Tick exactly one option",
          box: toFractions(tickbox.page, box.x - 1, box.y - (box.height || 10) * 0.85 - 1, (box.width || 8) + 2, (box.height || 10) + 2),
        });
      }
    }
  }
  return { formId, label: formRules.label, pageCount: pageSizes.length, items: overlayItems };
}
