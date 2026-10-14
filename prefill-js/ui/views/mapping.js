// "Form mapping": the blank form with every mapped box drawn on it - what fills it and where the value comes
// from - so anyone can check the mapping visually instead of reading mappings/*.json. Read-only.
import { h, clear } from '../util.js';
import { FIELD_WORDS } from './uploadReviewLive.js';

const SOURCE_CLASS = {
  'Uploaded documents': 'm-doc', 'PAN card': 'm-doc', 'Typed / sample data': 'm-typed',
  "Today's date": 'm-auto', 'Tick box (rule / reviewer)': 'm-tick',
};

function label(item) {
  const base = FIELD_WORDS[item.key] || item.key.replace(/_/g, ' ');
  return item.option ? `${base}: ${item.option}` : base;
}
function section(item) {
  if (item.nominee) return `Nominee ${item.nominee}`;
  return /^guardian/.test(item.key) ? 'Guardian' : 'Account & form';
}

export async function renderMapping(root, form = 'crn') {
  const res = await fetch(`api/mapping/${form}`);
  const data = await res.json();
  let page = 1;
  let selected = null;

  const img = h('img.pv-img');
  const overlay = h('div.m-overlay');
  const stage = h('div.pv-stage', img, overlay);
  const scroller = h('div.pv-scroll', stage);
  const listEl = h('div.lr-list');
  const pageTabs = h('span.pgtabs');
  const info = h('div.m-info.small');
  const formTabs = h('span.pgtabs', ['crn', 'cams'].map((k) =>
    h('button', { class: k === form ? 'on' : null, onclick: () => { location.hash = `#/mapping/${k}`; } }, k === 'crn' ? 'CRN Broking & Demat' : 'CAMS Mutual Fund')));

  const legend = h('div.m-legend.small',
    h('span', h('i.m-sw.m-doc'), 'From uploaded documents'),
    h('span', h('i.m-sw.m-typed'), 'Typed / sample data'),
    h('span', h('i.m-sw.m-auto'), 'Automatic (date)'),
    h('span', h('i.m-sw.m-tick'), 'Tick box option'));

  clear(root, h('div.lr',
    h('div.lr-top', h('h2', 'Form mapping'), formTabs, h('span.grow'), legend),
    h('div.lr-body',
      h('div.lr-fields', h('div.lr-filter', h('span.small.dim', `${data.items.length} mapped boxes - click one to find it on the form`)), listEl, info),
      h('div.lr-preview', h('div.pv-head', h('b', data.label), pageTabs), scroller))));

  function showPage(n) {
    page = n;
    img.src = `api/mapping/${form}/page/${n}`;
    clear(pageTabs, Array.from({ length: data.pageCount }, (_, i) => i + 1)
      .filter((p) => data.items.some((it) => it.page === p))
      .map((p) => h('button', { class: p === page ? 'on' : null, onclick: () => showPage(p) }, `Page ${p}`)));
    drawBoxes();
  }

  function drawBoxes() {
    clear(overlay, data.items.filter((it) => it.page === page).map((it) => {
      const [x0, y0, x1, y1] = it.box;
      return h(`div.m-box.${SOURCE_CLASS[it.source] || 'm-typed'}`, {
        class: selected === it ? 'on' : null,
        title: `${label(it)}${it.nominee ? ` (Nominee ${it.nominee})` : ''} - ${it.source}`,
        style: { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` },
        onclick: () => select(it, true),
      }, it.kind === 'text' ? h('span.m-tag', label(it)) : null);
    }));
  }

  function select(it, fromForm) {
    selected = it;
    if (it.page !== page) showPage(it.page); else drawBoxes();
    for (const el of listEl.querySelectorAll('.fr.on')) el.classList.remove('on');
    const row = listEl.querySelector(`[data-id="${CSS.escape(it.id)}"]`);
    if (row) { row.classList.add('on'); if (fromForm) row.scrollIntoView({ block: 'center' }); }
    clear(info,
      h('b', label(it)), it.nominee ? ` — Nominee ${it.nominee}` : '', h('br'),
      `Filled from: ${it.source}`, h('br'),
      h('span', { class: it.required ? 'req' : 'dim' }, it.required ? 'Required by the form' : 'Optional'), ` · Rule: ${it.rule}`, h('br'),
      it.kind === 'text' ? `Page ${it.page}, position x ${it.point.x.toFixed(1)} / y ${it.point.y.toFixed(1)} pt, font ${it.fontSize}${it.type === 'multiline' ? ', wraps over several lines' : ''}` : `Page ${it.page}, tick box`);
    if (!fromForm) {
      const [, y0] = it.box;
      requestAnimationFrame(() => scroller.scrollTo({ top: Math.max(0, stage.offsetTop + y0 * stage.offsetHeight - scroller.clientHeight / 3), behavior: 'smooth' }));
    }
  }

  const SECTIONS = ['Account & form', 'Nominee 1', 'Nominee 2', 'Guardian'];
  const rows = [];
  for (const sec of SECTIONS) {
    const items = data.items.filter((it) => section(it) === sec);
    if (!items.length) continue;
    rows.push(h('div.lr-sec', h('span', sec), h('span', String(items.length))));
    for (const it of items) {
      rows.push(h('div.fr', { 'data-id': it.id, onclick: () => select(it, false) },
        h('div.fr-head', h(`i.m-sw.${SOURCE_CLASS[it.source] || 'm-typed'}`),
          h('span.fr-label', label(it), it.required ? h('span.req', { title: 'Required by the form' }, ' *') : null), h('span.src', it.source)),
        h('div.small.dim', it.rule)));
    }
  }
  clear(listEl, rows);
  showPage(1);
}
