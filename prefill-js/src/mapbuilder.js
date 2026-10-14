// Build one field-position mapping for a blank form, by diffing it against its filled sample(s). Uses only
// the blank form's own label text (structural) and the filled sample's values transiently (to decide type /
// source, per the task's instruction) - no sample value is kept in the returned mapping.
import { extractTextItems } from "./pdftext.js";
import { onlyInFilled } from "./difftext.js";

const LABEL_Y_TOL = 6; // points; label vs. typed-value baselines differ a little by font/size on the same row

export { resolveLabels, columnBoundaries, columnOf, labelFor };

/** The y of the next printed text in the form's left label column, below `afterY` on the same page - the
 * true row boundary a multiline field must not cross, independent of whether that text is one of our
 * configured field labels (e.g. the unlabelled "City"/"State" sub-rows under an address field). */
export function nextPrintedLabelY(blankItems, page, afterY, { leftColumnMaxX = 200 } = {}) {
  const candidates = blankItems.filter((it) => it.page === page && it.x < leftColumnMaxX && it.y > afterY + 0.5);
  if (!candidates.length) return null;
  return Math.min(...candidates.map((it) => it.y));
}

/** Some labels print across several short lines at the same x (CAMS splits almost every field name this way,
 * e.g. "Name of the" / "nominee(s)", or a compound heading like "Address of" / "Nominee(s)/" / "Guardian in"
 * / "case of Minor" / "City / Place:" / "State &" / "Country"). A naive "next printed text below" search
 * mistakes the label's own next line for a different field's boundary. This walks forward through same-x,
 * tightly-spaced lines (the label's own continuation) and returns where that run actually ends. */
function labelOwnRunEndY(blankItems, page, x, y, { xTol = 2, contGap = 16, cap = Infinity } = {}) {
  const sameX = blankItems
    .filter((it) => it.page === page && Math.abs(it.x - x) <= xTol)
    .sort((a, b) => a.y - b.y);
  let endY = y;
  for (const it of sameX) {
    if (it.y <= endY + 0.5) continue;
    if (it.y >= cap) break; // never absorb another configured field's own label line
    if (it.y - endY > contGap) break;
    endY = it.y;
  }
  return endY;
}

/** The true row boundary below a resolved label ({x, y, page, key}): skip the label's own multi-line run
 * (capped so it can never run into the NEXT configured field's label - two labels can sit closer together,
 * e.g. CAMS's account-info block, than a label's own continuation-line gap), then find the next printed text
 * in the left column after that. `allLabels` is every resolved label for this form, used only to find that
 * cap. This is what a multiline field must not cross. */
export function rowBoundaryY(blankItems, label, allLabels = [], opts = {}) {
  const laterLabels = allLabels.filter((l) => l.found && l.page === label.page && l.key !== label.key && l.y > label.y);
  const nextConfiguredY = laterLabels.length ? Math.min(...laterLabels.map((l) => l.y)) : Infinity;
  const runEnd = labelOwnRunEndY(blankItems, label.page, label.x, label.y, { ...opts, cap: nextConfiguredY });
  const raw = nextPrintedLabelY(blankItems, label.page, runEnd, opts);
  const candidates = [nextConfiguredY, raw].filter((v) => v != null && Number.isFinite(v));
  return candidates.length ? Math.min(...candidates) : null;
}

/**
 * The actual typed text per (field key, nominee column) in one filled sample - read at call time, returned to
 * the caller, never written back to disk by this module. Column keys are "1"/"2"/"3" for a per-nominee field,
 * "_" for a document-level one (object keys are always strings in JS, so this keeps lookups unambiguous).
 */
export async function extractFieldValues(formConfig, samplePath) {
  const blankItems = await extractTextItems(formConfig.blank);
  const labels = resolveLabels(blankItems, formConfig.labels);
  const boundaries = columnBoundaries(blankItems, formConfig.nomineeHeaderRe);
  const filledItems = await extractTextItems(samplePath);
  const typed = onlyInFilled(blankItems, filledItems);

  const buckets = {};
  for (const item of typed) {
    const label = labelFor(item, labels);
    if (!label) continue;
    const col = label.perNominee ? String(columnOf(item.x, boundaries)) : "_";
    buckets[label.key] ??= {};
    buckets[label.key][col] ??= [];
    buckets[label.key][col].push(item);
  }

  const values = {};
  for (const [key, byCol] of Object.entries(buckets)) {
    values[key] = {};
    for (const [col, items] of Object.entries(byCol)) {
      const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
      values[key][col] = sorted.map((i) => i.text).join(" ").trim();
    }
  }
  return values;
}

/** The blank form's label items (one per configured label key), each {key, page, x, y, perNominee}. A
 * label's text can legitimately appear more than once on a page (e.g. CAMS splits "Name of the" + "Fund" as
 * two runs, which collides with the nominee label "Name of the" + "nominee(s)"); `cont`, when given, requires
 * the very next text item to match too, to pick the right occurrence. */
function resolveLabels(blankItems, labelsConfig) {
  const resolved = [];
  for (const cfg of labelsConfig) {
    const idx = blankItems.findIndex((it, i) => {
      if (it.page !== cfg.page || !cfg.re.test(it.text)) return false;
      if (!cfg.cont) return true;
      const next = blankItems[i + 1];
      return next && cfg.cont.test(next.text);
    });
    if (idx === -1) {
      resolved.push({ ...cfg, x: null, y: null, found: false });
      continue;
    }
    resolved.push({ ...cfg, x: blankItems[idx].x, y: blankItems[idx].y, found: true });
  }
  return resolved;
}

/** Column boundaries [b12, b23] from the blank form's "1st/2nd/3rd Nominee" headers - the midpoints between
 * consecutive headers' x. Used to bucket a per-nominee item by which column it's printed in. */
function columnBoundaries(blankItems, nomineeHeaderRe) {
  const headers = blankItems
    .filter((it) => nomineeHeaderRe.test(it.text))
    .sort((a, b) => a.x - b.x);
  if (headers.length < 3) return null;
  const xs = headers.slice(0, 3).map((h) => h.x);
  return [(xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2];
}

function columnOf(x, boundaries) {
  if (!boundaries) return 1;
  const [b12, b23] = boundaries;
  if (x < b12) return 1;
  if (x < b23) return 2;
  return 3;
}

/** The label (from `labels`, already resolved with x/y) that this typed item belongs to: the closest label
 * at or above the item's row, and - when several labels share that row (e.g. Broking Code / DP ID / Client
 * ID / CRN all on one line) - the closest one to the left of the item. */
// A label with nothing configured after it on the same page (e.g. CAMS's guardian_name, the last field
// mapped on page 2) has no "next label" to bound how far below it an item can still belong to it. Without a
// cap, an unrelated value much further down the page (the applicant's own printed name, in CAMS's case) gets
// wrongly attributed to it. No real field on these forms wraps across more than this many points.
const MAX_FIELD_SPAN = 100;

function labelFor(item, labels) {
  const onPage = labels.filter((l) => l.found && l.page === item.page && l.y <= item.y + (l.yTol ?? LABEL_Y_TOL));
  if (!onPage.length) return null;
  const maxY = Math.max(...onPage.map((l) => l.y));
  if (item.y - maxY > MAX_FIELD_SPAN) return null;
  const row = onPage.filter((l) => Math.abs(l.y - maxY) < 0.5);
  const leftOf = row.filter((l) => l.x <= item.x + LABEL_Y_TOL).sort((a, b) => b.x - a.x);
  return leftOf[0] || [...row].sort((a, b) => a.x - b.x)[0];
}

/** One (label, nominee-column) bucket's typed items, across every filled sample, merged into a single field
 * position (min x, min y - the top-left corner future code would start writing at) plus whether any sample
 * wrapped it across more than one line. */
function countLines(items) {
  const ys = [...items].map((i) => i.y).sort((a, b) => a - b);
  let lines = ys.length ? 1 : 0;
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 2) lines++;
  return lines;
}

function mergeField(itemsAcrossSamples) {
  const all = itemsAcrossSamples.flat();
  if (!all.length) return null;
  return {
    page: all[0].page,
    x: Math.min(...all.map((i) => i.x)),
    y: Math.min(...all.map((i) => i.y)),
    fontSize: all[0].fontSize,
    multiline: countLines(all) > 1,
  };
}

/**
 * Build the mapping for one form config. `getSource(fieldKey, nomineeCol, sampleValuesByFieldSample)` decides
 * "aadhaar"/"excel"/"UNSURE" - it is handed the actual sample text (never stored) so it can compare against
 * known-good reference values (e.g. OCR'd Aadhaar fields) without the mapping itself retaining anything.
 */
export async function buildMapping(formConfig, getSource) {
  const blankItems = await extractTextItems(formConfig.blank);
  const labels = resolveLabels(blankItems, formConfig.labels);
  const boundaries = columnBoundaries(blankItems, formConfig.nomineeHeaderRe);

  // fieldKey -> nomineeCol (1|2|3|null) -> [{sampleId, items:[...], value}]
  const perSample = {};
  for (const sample of formConfig.filledSamples) {
    const filledItems = await extractTextItems(sample.path);
    const typed = onlyInFilled(blankItems, filledItems);
    for (const item of typed) {
      const label = labelFor(item, labels);
      if (!label) continue;
      const col = label.perNominee ? columnOf(item.x, boundaries) : null;
      perSample[label.key] ??= {};
      perSample[label.key][col] ??= {};
      perSample[label.key][col][sample.id] ??= [];
      perSample[label.key][col][sample.id].push(item);
    }
  }

  const fields = [];
  for (const label of labels) {
    if (!label.found) {
      fields.push({ key: label.key, page: label.page, x: null, y: null, fontSize: null, type: "UNSURE",
        source: "UNSURE", nominee: null, note: "label not found on the blank form - check the regex" });
      continue;
    }
    const byCol = perSample[label.key] || {};
    const cols = label.perNominee ? [1, 2, 3] : [null];
    const built = {};
    for (const col of cols) {
      const bySample = byCol[col] || {};
      const sampleIds = Object.keys(bySample);
      const itemsAcrossSamples = Object.values(bySample);
      const merged = mergeField(itemsAcrossSamples);
      const sampleValues = Object.fromEntries(
        Object.entries(bySample).map(([sid, items]) => [sid, items.map((i) => i.text).join(" ")]),
      );
      const source = sampleIds.length ? getSource(label.key, col, sampleValues) : "UNSURE";
      built[col] = {
        key: label.key,
        nominee: col,
        page: merged ? merged.page : label.page,
        x: merged ? round(merged.x) : null,
        y: merged ? round(merged.y) : null,
        fontSize: merged ? merged.fontSize : null,
        type: !merged ? "UNSURE" : merged.multiline ? "multiline" : "text",
        source,
        filledInSamples: sampleIds,
        extrapolated: false,
      };
    }
    // Nominee 3 is never filled in any sample we have, but its column is evenly spaced from 1 and 2 (the
    // blank form's own "1st/2nd/3rd Nominee" headers confirm roughly equal gaps), so its x position can be
    // extrapolated - the field's TYPE follows (text/multiline is a template property, not a sample value),
    // but its source stays UNSURE: we have no idea who would go in that column or where their data comes from.
    if (label.perNominee && built[3] && built[3].x == null && built[1]?.x != null && built[2]?.x != null) {
      built[3] = {
        ...built[3],
        page: built[1].page,
        x: round(built[1].x + 2 * (built[2].x - built[1].x)),
        y: round((built[1].y + built[2].y) / 2),
        fontSize: built[1].fontSize,
        type: built[1].type,
        source: "UNSURE",
        extrapolated: true,
      };
    }
    for (const col of cols) fields.push(built[col]);
  }
  return { fields, labels, boundaries };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
