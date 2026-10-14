// Text items present in a filled PDF but not in its blank template - the typed values an operator (or our
// future code) added, and exactly where on the page they sit. Matching is by (page, text, position-within-
// tolerance) rather than by array order, because a filled form can have the same shared boilerplate land at a
// very slightly different index if the overlay tool split/merged runs differently than the blank's own layout.
const POS_TOL = 1.5; // points; typed text landing within this of a blank item at the same text is "the same"

function sameItem(a, b) {
  return a.page === b.page && a.text === b.text && Math.abs(a.x - b.x) <= POS_TOL && Math.abs(a.y - b.y) <= POS_TOL;
}

/** Items in `filled` with no matching item in `blank` - candidates for "this was typed in". */
export function onlyInFilled(blank, filled) {
  const used = new Set();
  const out = [];
  for (const f of filled) {
    const idx = blank.findIndex((b, i) => !used.has(i) && sameItem(b, f));
    if (idx === -1) out.push(f);
    else used.add(idx);
  }
  return out;
}

/** Group nearby items on the same page/line into one field: a multi-line address becomes one group, a single
 * word stays its own group. Two items join a group when they're on the same page, their vertical bands
 * overlap or sit within one line-height of each other, and they're not absurdly far apart horizontally. */
export function groupIntoFields(items, { lineGap = 3, maxColGap = 220 } = {}) {
  const sorted = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const groups = [];
  for (const it of sorted) {
    const home = groups.find((g) => {
      if (g.page !== it.page) return false;
      const last = g.items[g.items.length - 1];
      const sameLine = Math.abs(last.y - it.y) <= Math.max(last.height, it.height) * 0.6;
      const nextLine = it.y - last.y > 0 && it.y - last.y <= (last.height || it.height) + lineGap
        && Math.abs(last.x - g.items[0].x) < 40; // a wrapped line starts near the group's left edge
      if (sameLine) return it.x - last.x < maxColGap;
      return nextLine;
    });
    if (home) home.items.push(it);
    else groups.push({ page: it.page, items: [it] });
  }
  return groups.map((g) => ({
    page: g.page,
    text: g.items.map((i) => i.text).join(" ").trim(),
    x: Math.min(...g.items.map((i) => i.x)),
    y: Math.min(...g.items.map((i) => i.y)),
    width: Math.max(...g.items.map((i) => i.x + i.width)) - Math.min(...g.items.map((i) => i.x)),
    fontSize: g.items[0].fontSize,
    multiline: g.items.length > 1 && new Set(g.items.map((i) => i.y)).size > 1,
    itemCount: g.items.length,
  }));
}
