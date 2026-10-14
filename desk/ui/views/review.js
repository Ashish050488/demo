// Step 2: one document under review. Three columns: its items (the auditor's to-do list, with progress), the
// source page with the spot boxed, and the item's trace with the decision pinned beneath. Wires the pieces
// (itemlist, pageview, trace, decide) and owns the selection; draws nothing itself.
import { api } from '../api.js';
import { h, clear } from '../util.js';
import { setQuery } from '../router.js';
import { createItemList } from './itemlist.js';
import { createPageView } from './pageview.js';
import { createTableView } from './tableview.js';
import { renderTrace } from './trace.js';
import { drawDecision } from './decide.js';

export async function renderReview(view, mode, run, doc, query) {
  const data = await api.items(run, doc);
  const colList = h('section.col.col-list');
  const colPage = h('section.col.col-page');
  const evScroll = h('div.ev-scroll');
  const panel = h('div.decide');
  clear(view, h('div.desk-review', colList, colPage, h('section.col.col-ev', evScroll, panel)));

  // a domain whose source is pages shows the page; one whose source is rows (a register, a log) shows the rows
  const asRows = mode.source_kind === 'table';
  const page = asRows ? createTableView(colPage) : createPageView(colPage, run, doc, data.pages);
  const state = { item: null };
  const list = createItemList(colList, {
    mode, doc: data.document, items: data.items, nouns: mode.nouns, bandLabels: mode.band_labels, sort: query.get('sort'),
    onPick: (id) => select(id, true),
    onSort: (sort, head) => {
      setQuery({ sort: sort === 'doc' ? null : sort });
      if (head) select(head.id, true);
    },
  });

  async function select(id, push) {
    state.item = id;
    if (push) setQuery({ item: id }, { push: true });
    list.mark(id);
    clear(evScroll, h('div.loading', 'loading…'));
    const [e, src] = await Promise.all([api.evidence(run, doc, id), asRows ? api.table(run, doc, id) : null]);
    if (state.item !== id) return;                       // the auditor picked another while this loaded
    if (asRows) {
      clear(evScroll, renderTrace(e, { mode, run, doc: data.document, onPlace: (p) => page.focus(p) }));
      evScroll.scrollTop = 0;
      drawPanel(id);
      page.show(src, e.at);
      return;
    }
    const seen = new Set();
    const places = [e.at, ...e.steps.map((s) => s.at)].filter((p) => {
      const k = p && JSON.stringify([p.source || '', p.page, p.box, p.find]);
      if (!p || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const at = e.at || places[0];
    clear(evScroll, renderTrace(e, { mode, run, doc: data.document, onPlace: (p) => page.show(p, places) }));
    evScroll.scrollTop = 0;
    drawPanel(id);
    page.show(at, places, e.pages && e.pages.length ? e.pages : data.pages);
  }

  function drawPanel(id) {
    const rows = list.order();
    const i = rows.findIndex((c) => c.id === id);
    drawDecision(panel, {
      mode, item: rows[i], index: i, total: rows.length,
      onGo: (d) => { const c = rows[i + d]; if (c) select(c.id, true); },
      onRecord: async (body) => {
        const out = await api.decide(run, doc, body);
        rows[i].decision = out.decision;
        list.draw();
        // on to the next undecided item in the current order, after this one, else from the top
        const order = list.order();
        const next = order.slice(i + 1).find((c) => !c.decision) || order.find((c) => !c.decision);
        if (next) select(next.id, true); else drawPanel(id);
        return out;
      },
    });
  }

  const first = data.items.some((c) => c.id === query.get('item')) ? query.get('item') : (list.order()[0] || {}).id;
  if (first) await select(first, false);
  else { clear(evScroll, h('div.empty', `No ${mode.nouns.items} in this ${mode.nouns.document}.`)); panel.hidden = true; }
}
