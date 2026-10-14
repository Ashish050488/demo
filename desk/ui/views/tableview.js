// The middle column for a domain whose source is rows - a register, a spreadsheet, a log - not pages
// (adapter.source_kind = "table"). Takes the place of pageview.js: instead of the page with the spot boxed, the rows an
// item cites, with the columns that matter highlighted.
//
// The server's payload (api/source) is a list of tabs; each tab is a table: columns, the keys to highlight, and rows.
// A row may be a reference (cited as evidence, not the finding itself), carry a small tag, or be marked (the tier that
// was used). A trace step's place {tab, focus: [row ids]} switches to that tab and outlines those rows. Cell values
// arrive formatted: the adapter knows what is money and what is a date, the page does not guess.
import { h, clear } from '../util.js';

export function createTableView(root) {
  const state = { data: null, tab: null, focus: [] };
  const tabs = h('div.tv-tabs');
  const hint = h('div.tv-hint');
  const body = h('div.tv-body');
  clear(root, h('div.tv-head', h('b', 'Source'), tabs), hint, body);

  const tabOf = (id) => (state.data?.tabs || []).find((t) => t.id === id);

  function draw() {
    const data = state.data;
    if (!data) return;
    const all = data.tabs;
    clear(tabs, all.map((t) => h('button.tv-tab', {
      class: t.id === state.tab ? 'on' : null, onclick: () => { state.tab = t.id; state.focus = []; draw(); },
    }, t.label || t.id)));
    const tab = tabOf(state.tab);
    if (!tab) { hint.hidden = true; return clear(body, h('div.empty', 'Nothing to show for this item.')); }
    const note = tab.note || data.hint;
    hint.hidden = !note;
    clear(hint, note || null);
    const hl = new Set(tab.highlight || []);
    // the first column names the row, so it stays first; the columns this item turns on come next
    const [lead, ...rest] = tab.columns;
    const cols = lead ? [lead, ...rest.filter((c) => hl.has(c.key)), ...rest.filter((c) => !hl.has(c.key))] : [];
    const focus = new Set(state.focus.map(String));
    const cell = (c, v) => h('td', { class: [c.align === 'right' && 'num', hl.has(c.key) && 'hl'].filter(Boolean).join(' ') || null },
      v == null || v === '' ? '' : String(v));
    clear(body,
      tab.title ? h('div.tv-lane', h('b', tab.title), tab.subtitle ? h('span.dim', ` · ${tab.subtitle}`) : null) : null,
      tab.rows.length ? h('table.reg',
        h('thead', h('tr', cols.map((c) => h('th', { class: [c.align === 'right' && 'num', hl.has(c.key) && 'hl'].filter(Boolean).join(' ') || null }, c.label)))),
        h('tbody', tab.rows.map((r) => h('tr', {
          class: [r.role === 'reference' && 'ref', r.mark && 'mark', focus.has(String(r.id)) && 'focus'].filter(Boolean).join(' ') || null,
          'data-row': r.id,
        }, cols.map((c, i) => {
          const td = cell(c, r.cells[c.key]);
          if (i === 0 && r.tag) td.append(h('span.rowtag', r.tag));
          return td;
        }))))) : h('div.empty', 'No rows.'));
    body.querySelector('tr.focus')?.scrollIntoView({ block: 'nearest' });
  }

  return {
    // a new item: its tabs, opening on the tab its evidence names (default: the first)
    show(data, at) {
      state.data = data;
      state.tab = at && tabOf(at.tab) ? at.tab : (data.tabs[0] || {}).id;
      state.focus = (at && at.focus) || [];
      draw();
    },
    // from a trace step: bring its rows (or tab) into view
    focus(at) {
      if (at.tab != null && tabOf(at.tab)) state.tab = at.tab;
      state.focus = at.focus || [];
      draw();
    },
  };
}
