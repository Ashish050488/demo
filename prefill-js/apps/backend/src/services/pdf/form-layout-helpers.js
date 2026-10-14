// Reading a blank form's printed layout from its text layer: where each configured label sits, the nominee
// column boundaries, and the row boundary a multiline value must not cross.

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

function round(n) {
  return Math.round(n * 100) / 100;
}
