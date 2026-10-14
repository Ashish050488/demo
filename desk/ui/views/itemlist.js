// The left column: the auditor's to-do list for one document, with how much of it is done.
//
// Three orders. Document order (the default) follows the source top to bottom, under the adapter's group headings;
// lowest and highest confidence first are for hunting mistakes across the whole document. Switching the order goes
// to the top and selects the first item - following the open item instead would carry the list to wherever that
// item now sits, so asking for "highest first" would show a low one.
import { h, clear, cap, isFigure, bandClass } from '../util.js';

// The orders on offer come from the adapter (mode.sorts): "doc", "low" (the first band in band_order first), "high"
// (the reverse) and "amount" (largest absolute amount first, items without one last).
export const DEFAULT_SORTS = [{ id: 'doc', label: 'Document order' }, { id: 'low', label: 'Lowest first' },
  { id: 'high', label: 'Highest first' }];
const DEFAULT_BANDS = ['low', 'medium', 'high'];

export function orderItems(items, sort, bandOrder = DEFAULT_BANDS) {
  const byDoc = (a, b) => a.group_order - b.group_order || a.order - b.order;
  if (sort === 'amount') {
    const size = (c) => (c.amount == null ? -1 : Math.abs(c.amount));
    return [...items].sort((a, b) => size(b) - size(a) || byDoc(a, b));
  }
  if (sort !== 'low' && sort !== 'high') return [...items].sort(byDoc);
  // urgent bands first; an unbanded item sits just before the calmest band, as it always has
  const r = (c) => (c.band === 'none' ? bandOrder.length - 1.5 : bandOrder.indexOf(c.band));
  return [...items].sort((a, b) => (sort === 'high' ? r(b) - r(a) : r(a) - r(b)) || byDoc(a, b));
}

export function createItemList(root, { mode, doc, items, nouns, bandLabels, sort, onPick, onSort }) {
  const SORTS = mode.sorts && mode.sorts.length ? mode.sorts : DEFAULT_SORTS;
  const bandOrder = mode.band_order || DEFAULT_BANDS;
  const state = { sort: SORTS.some((s) => s.id === sort) ? sort : 'doc', item: null };
  const listEl = h('ul.vlist');
  const progress = h('div.progress');
  const segs = h('div.segs', SORTS.map(({ id: s, label }) => h('button', {
    'aria-pressed': String(state.sort === s),
    'data-sort': s,
    onclick: () => {
      if (state.sort === s) return;
      state.sort = s;
      segs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === s)));
      draw(false);
      listEl.scrollTop = 0;
      onSort(s, order()[0]);
    },
  }, label)));
  clear(root,
    h('div.vlist-head',
      h('div.vtitle', h('b', doc.title), doc.subtitle ? h('span.dim', ` · ${doc.subtitle}`) : null),
      progress,
      h('div.vcontrols', h('h3', `${cap(nouns.items)} · ${items.length}`), segs)),
    listEl);

  const order = () => orderItems(items, state.sort, bandOrder);

  // The review load, visible and shrinking. Flagged is what the auditor is here for (the adapter's call).
  function drawProgress() {
    const flagged = items.filter((c) => c.flagged);
    const done = flagged.filter((c) => c.decision).length;
    const others = items.filter((c) => c.decision && !c.flagged).length;
    const pct = flagged.length ? (done / flagged.length) * 100 : 100;
    clear(progress,
      h('div.ptext', flagged.length ? [h('b', `Reviewed ${done} of ${flagged.length}`), ' flagged'] : h('b', 'Nothing flagged here'),
        others ? h('span.dim', ` · ${others} more checked`) : null),
      h('div.pbar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': flagged.length, 'aria-valuenow': done },
        h('i', { class: flagged.length && done === flagged.length ? 'full' : null, style: { width: `${pct}%` } })));
  }

  function row(c) {
    return h('li', h('button.vrow', {
      class: [c.id === state.item && 'on', c.decision && 'settled'].filter(Boolean).join(' '),
      'data-id': c.id,
      onclick: () => onPick(c.id),
    },
      h('span.vname', { title: c.title }, c.title),
      h('span.vsub', c.subtitle || ''),
      h('span.vval', { class: isFigure(c.value) ? 'mono' : null }, c.value ?? ''),
      c.decision ? h('span.chip.done', c.decision.kind)
        : h('span.chip', { class: bandClass(mode, c.band) }, c.band === 'none' ? '—' : (c.band_label || bandLabels?.[c.band] || c.band))));
  }

  function draw(follow = true) {
    drawProgress();
    const rows = order();
    const grouped = state.sort === 'doc' && rows.some((c) => c.group);
    if (!grouped) clear(listEl, rows.map(row));
    else {
      const out = [];
      let key = null;
      for (const c of rows) {
        if (c.group !== key) {
          key = c.group;
          const members = rows.filter((x) => x.group === key);
          const need = members.filter((x) => x.flagged);
          const done = need.filter((x) => x.decision).length;
          out.push(h('li.vsec-head', { class: need.length && done === need.length ? 'done' : null },
            h('span.vsec-name', key || 'Other'),
            h('span.vsec-count', need.length ? `${done}/${need.length} flagged` : `${members.length} ${members.length === 1 ? nouns.item : nouns.items}`)));
        }
        out.push(row(c));
      }
      clear(listEl, out);
    }
    if (follow) listEl.querySelector('.vrow.on')?.scrollIntoView({ block: 'nearest' });
  }

  function mark(id) {
    state.item = id;
    listEl.querySelectorAll('.vrow').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    listEl.querySelector('.vrow.on')?.scrollIntoView({ block: 'nearest' });
  }

  draw();
  return { draw, mark, order, get sort() { return state.sort; } };
}
