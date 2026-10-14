// The middle column: the real source page, with the spot the item came from boxed. A place is
// {source, page, box?, find?: {label, value}, tag?, label?}: a box the trace already has is drawn as it is; a `find` is
// looked up in the page's text layer (api/locate). If it cannot be pinned, the page says so rather than box a guess.
import { api } from '../api.js';
import { h, clear } from '../util.js';

const key = (p) => `${p.source || ''}|${p.page}`;
export const pageName = (p) => (p.source ? `${p.source} p${p.page}` : `page ${p.page}`);
export const pageLabel = (p) => p.label || (p.source ? pageName(p) : `Page ${p.page}`);

export function createPageView(root, run, doc, docPages) {
  const state = { at: null, places: [], tabs: [], zoom: 1 };
  const title = h('div.pv-title');
  const nav = h('div.pv-nav');
  const hint = h('div.pv-hint');
  const stage = h('div.pv-stage');
  const scroller = h('div.pv-scroll', stage);
  const zoom = h('div.pv-zoom',
    h('button.icon', { title: 'zoom out', onclick: () => setZoom(state.zoom / 1.25) }, '−'),
    h('button.icon', { title: 'fit width', onclick: () => setZoom(1) }, 'fit'),
    h('button.icon', { title: 'zoom in', onclick: () => setZoom(state.zoom * 1.25) }, '+'));
  clear(root, h('div.pv-head', title, h('span.spacer'), nav, zoom), hint, scroller);

  function setZoom(z) { state.zoom = Math.max(0.6, Math.min(3, z)); stage.style.width = `${state.zoom * 100}%`; focus(); }

  // at: the page to show (and, if it carries a box or find, the spot); places: every place the item cites, boxed
  // when on this page; tabs: the pages worth offering (the item's, else the document's).
  async function show(at, places = state.places, tabs = state.tabs) {
    if (!at) { clear(title, h('span.dim', 'No page cited')); clear(stage); hint.hidden = true; return; }
    const changed = !state.at || key(state.at) !== key(at);
    Object.assign(state, { at, places, tabs });
    const all = [...tabs];
    if (!all.some((p) => key(p) === key(at))) all.push({ source: at.source, page: at.page });
    clear(title, h('b', pageLabel(all.find((p) => key(p) === key(at)) || at)));
    clear(nav, all.length > 1 ? all.map((p) => h('button.pgbtn', {
      class: key(p) === key(at) ? 'on' : null, title: pageLabel(p),
      onclick: () => show({ source: p.source, page: p.page }, state.places, state.tabs),
    }, p.source ? pageLabel(p) : p.page)) : null);

    let img = stage.querySelector('img');
    if (!img || changed) {
      img = h('img.pv-img', { src: api.pageUrl(run, doc, at.source, at.page, 1400), alt: pageLabel(at), draggable: false });
      img.addEventListener('load', focus);
      clear(stage, img);
    }
    stage.querySelectorAll('.box').forEach((b) => b.remove());
    const here = places.filter((p) => key(p) === key(at) && (p.box || p.find));
    const lead = here.find((p) => p === at || (at.box && p.box === at.box)) || here[0];
    const first = lead || at;
    hint.hidden = false;
    const more = here.length > 1 ? h('span.dim', ` · ${here.length} cited spots on this page`) : null;
    clear(hint, first.find
      ? [h('span.dim', 'Read from '), first.find.label ? h('b', `“${first.find.label}”`) : null, h('span.dim', ' printed '), h('b.mono', first.find.value), more]
      : first.label ? [h('span.dim', `${first.tag ? first.tag.charAt(0).toUpperCase() + first.tag.slice(1) : 'Cited'}: `), h('b', first.label), more]
        : h('span.dim', here.length ? `${here.length} cited spot${here.length === 1 ? '' : 's'} on this page` : 'Nothing on this page is cited by this item'));
    const boxes = await Promise.all(here.map((p) => (p.box ? Promise.resolve({ box: p.box })
      : api.locate(run, doc, p).catch(() => null))));
    if (key(state.at) !== key(at)) return;                // the auditor moved on while we looked
    let drawn = 0;
    boxes.forEach((r, i) => {
      if (!r || !r.box) return;
      drawn += 1;
      const [x0, y0, x1, y1] = r.box;
      const isLead = here[i] === lead;
      stage.append(h('div.box', {
        class: isLead ? 'focus' : 'cited',
        style: { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` },
      }, h('span.boxtag', here[i].tag || (isLead ? 'read here' : 'cited'))));
    });
    if (here.length && !drawn) {
      const scanned = boxes.some((r) => r && r.scanned);
      hint.append(h('span.chip.muted', { style: { marginLeft: '8px' } },
        scanned ? 'scanned page — no text layer to place the row' : 'row not pinned on the page'));
    }
    focus();
  }

  function focus() {
    const el = stage.querySelector('.box.focus') || stage.querySelector('.box');
    if (!el) return;
    scroller.scrollTo({ top: Math.max(0, el.offsetTop - scroller.clientHeight * 0.35), behavior: 'smooth' });
  }

  return { show, docPages };
}
