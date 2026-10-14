// The per-form tick-box rules, factored out of fill_crn.js/fill_cams.js so the upload-fill path (server/
// uploadFill.js) doesn't need a third copy. Each function draws the ticks onto the already-built pdfDoc/pages
// and returns the result records for them (same shape as a text-field record, plus option_chosen/rule).
import { CRN_FORM, CAMS_FORM } from "./mapping_config.js";
import { drawCheckmark } from "./fillkit.js";

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Where a tick box's checkmark goes for a given option, on a specific (possibly per-nominee-column) field -
 * shared by the live preview (server/index.js) and the final fill's correction pass (server/uploadFill.js),
 * so a tick is only ever drawn where both agree it belongs. Returns null if this tickbox's printed position
 * was never confirmed (e.g. CAMS's id_type - see this file's own note on it), never a guessed position. */
export function tickOptionBbox(formConfig, fieldKey, optionValue) {
  const tbKey = fieldKey.replace(/_n\d+$/, "");
  const tickbox = formConfig.tickboxes.find((t) => t.key === tbKey);
  if (!tickbox || optionValue == null) return null;
  const col = Number((fieldKey.match(/_n(\d)$/) || [])[1]);
  if (tickbox.optionXByColumn && col && tickbox.optionY) {
    const y = tickbox.optionY[optionValue];
    return y == null ? null : { x: tickbox.optionXByColumn[col - 1], y, width: tickbox.w, height: tickbox.h };
  }
  if (tickbox.optionX) {
    const x = tickbox.optionX[optionValue];
    return x == null ? null : { x, y: tickbox.y, width: tickbox.w, height: tickbox.h };
  }
  if (tickbox.x != null && tickbox.y != null) return { x: tickbox.x, y: tickbox.y, width: tickbox.w, height: tickbox.h };
  return null;
}

/** A tickbox's confirmed page, from its form-config definition - works even for one whose baseline record
 * has page:null because it was never drawn (e.g. id_type). */
export function tickboxPage(formConfig, fieldKey) {
  return formConfig.tickboxes.find((t) => t.key === fieldKey.replace(/_n\d+$/, ""))?.page ?? null;
}

/** CRN: "wish_to_nominate" always ticked; "nominee_id_type" ticks "Aadhaar (last 4)" when at least one
 * nominee's id_aadhaar_last4 value actually came from an Aadhaar scan this run (a single shared checkbox for
 * the whole form, not per-nominee); "guardian_id_type" has no rule, left unticked and flagged. */
export function applyCrnTickboxes(pages, { anyNomineeAadhaarLast4, idType, overrides = {} } = {}) {
  const results = [];
  const tick = (tb, field, option, meta) => {
    const x = option == null ? tb.x : tb.optionX[option];
    const box = { x, y: tb.y, width: tb.w, height: tb.h };
    drawCheckmark(pages[tb.page - 1], { x, y: tb.y, w: tb.w, h: tb.h });
    results.push({ field, page: tb.page, bbox: box, lines: [box], options: tb.options, value: option ?? "ticked",
      source: "rule", source_file: null, ocr_confidence: null, option_chosen: option ?? "ticked", status: "ok", reason: null, ...meta });
  };
  const untick = (tb, field, meta) => results.push({ field, page: tb.page, bbox: null, lines: null, value: null, options: tb.options,
    source: "rule", source_file: null, ocr_confidence: null, option_chosen: null, status: "needs_review", ...meta });

  tick(CRN_FORM.tickboxes.find((t) => t.key === "wish_to_nominate"), "wish_to_nominate", null, { rule: "always ticked" });

  // One shared ID-type row for all nominees: the reviewer's choice, else the type whose number was filled.
  const nomineeIdType = CRN_FORM.tickboxes.find((t) => t.key === "nominee_id_type");
  const chosen = (overrides.nominee_id_type && nomineeIdType.optionX[overrides.nominee_id_type] != null && overrides.nominee_id_type)
    || idType || (anyNomineeAadhaarLast4 ? "Aadhaar (last 4)" : null);
  if (chosen) tick(nomineeIdType, "nominee_id_type", chosen, { rule: overrides.nominee_id_type ? "chosen on the review screen" : "ticked for the ID document whose number was filled" });
  else untick(nomineeIdType, "nominee_id_type", { rule: "ticked for the ID document whose number was filled", reason: "no ID number read for nominee 1 - pick one" });

  const guardianIdType = CRN_FORM.tickboxes.find((t) => t.key === "guardian_id_type");
  if (overrides.guardian_id_type && guardianIdType.optionX[overrides.guardian_id_type] != null) {
    tick(guardianIdType, "guardian_id_type", overrides.guardian_id_type, { rule: "chosen on the review screen" });
  } else {
    untick(guardianIdType, "guardian_id_type", { rule: "only for a minor nominee", reason: "only needed for a minor nominee - pick one if so", status: "not_provided" });
  }
  return results;
}

/** CAMS: relationship_option ticked per nominee by matching the Excel relationship_n* value against the
 * printed option labels (Others as a fallback, since the form has a field for it); id_type has no rule.
 * `useSampleData` gates whether the Excel value is read at all - an upload case that hasn't pressed "Fill
 * with sample demo data" gets status "not_provided" here instead of a tick, same as the text fields. */
export function applyCamsTickboxes(pages, row, { useSampleData = true, idTypes = {}, overrides = {} } = {}) {
  const results = [];
  const draw = (tickbox, field, col, option, meta) => {
    const x = tickbox.optionXByColumn[col - 1];
    const y = tickbox.optionY[option];
    drawCheckmark(pages[tickbox.page - 1], { x, y, w: tickbox.w, h: tickbox.h });
    const box = { x, y, width: tickbox.w, height: tickbox.h };
    results.push({
      field, page: tickbox.page, bbox: box, lines: [box], value: option, options: tickbox.options,
      source: "rule", ocr_confidence: null, option_chosen: option, status: "ok", reason: null, ...meta,
    });
  };
  const empty = (tickbox, field, meta) => results.push({
    field, page: tickbox.page, bbox: null, lines: null, value: null, options: tickbox.options, source: "rule",
    source_file: null, ocr_confidence: null, option_chosen: null, ...meta,
  });

  const rel = CAMS_FORM.tickboxes.find((t) => t.key === "relationship_option");
  const idType = CAMS_FORM.tickboxes.find((t) => t.key === "id_type");
  for (const col of [1, 2]) {
    const field = `relationship_option_n${col}`;
    if (overrides[field] && rel.optionY[overrides[field]] != null) {
      draw(rel, field, col, overrides[field], { source_file: "reviewer", rule: "chosen on the review screen" });
    } else {
      const value = useSampleData ? row[`relationship_n${col}`] : null;
      if (!value) {
        empty(rel, field, {
          rule: "pick the relationship on the review screen",
          status: useSampleData ? "not_applicable" : "needs_review",
          reason: useSampleData ? "empty relationship cell in demo_data.xlsx" : "Not on any ID document - pick one",
        });
      } else {
        const matched = rel.options.find((opt) => opt !== "Others" && norm(opt) === norm(value));
        draw(rel, field, col, matched || "Others", {
          source_file: "demo data (sample)",
          rule: matched ? "tick the option whose label matches relationship_n* from Excel" : "value matched no option; tick Others",
        });
      }
    }

    const idField = `id_type_n${col}`;
    const chosen = overrides[idField] && idType.optionY[overrides[idField]] != null ? overrides[idField] : idTypes[col];
    if (chosen) {
      draw(idType, idField, col, chosen, {
        source_file: overrides[idField] ? "reviewer" : "uploaded ID document",
        rule: overrides[idField] ? "chosen on the review screen" : "ticked for the ID document whose number was filled",
      });
    } else {
      empty(idType, idField, { rule: "ticked for the ID document whose number was filled", status: "needs_review", reason: "no ID number read for this nominee - pick one" });
    }
  }
  return results;
}
