// The right column: why the system says what it says about one item, from the generic evidence shape
// (references/contract.md). Plain language first - the band and the reasons it is in front of you - then the
// steps that produced it, each citing what it used, then the checks it passed or failed. Every step that cites a
// page is a link that shows that page in the middle column.
import { h, cap, isFigure, bandClass } from '../util.js';
import { href } from '../router.js';
import { pageName } from './pageview.js';

const MARK = { ok: '✓', warn: '!', fail: '✕', info: '•' };
const CHECK = { pass: ['passes', 'b-high'], fail: ['fails', 'b-low'], skip: ['not run', 'muted'], info: ['note', 'muted'] };

export function renderTrace(e, { mode, run, doc, onPlace }) {
  // the kit's own three bands read "High confidence"; a band a domain defines reads as it labels it; an item
  // may word its own band (e.band_label)
  const bandLabel = e.band_label || (['low', 'medium', 'high'].includes(e.band) ? `${cap(e.band)} confidence`
    : e.band && e.band !== 'none' ? (mode.band_labels?.[e.band] || e.band) : 'Not banded');
  return h('div.ev',
    h('div.crumbs2', h('a', { href: href(['review', run]) }, cap(mode.nouns.documents)), ' / ', h('b', doc.title),
      doc.subtitle ? h('span.dim', ` · ${doc.subtitle}`) : null),
    e.subtitle ? h('div.eyebrow', e.subtitle) : null,
    h('h1.ititle', e.title),
    e.ref ? h('div.iref.mono', e.ref) : null,
    h('div.vbig', e.value != null && e.value !== '' ? h('b', { class: isFigure(e.value) ? 'mono' : null }, e.value) : null, e.unit ? h('span.dim', e.unit) : null,
      h('span.chip', { class: bandClass(mode, e.band) }, bandLabel)),
    whyBox(e, mode),
    e.summary ? h('p.summary', e.summary) : null,
    e.steps.length ? section('How this was produced', h('ul.chain', e.steps.map((s) => step(s, onPlace)))) : null,
    e.checks.length ? section('Checks on this ' + mode.nouns.item, checks(e.checks)) : null,
    (e.context || []).length ? section('Background', e.context.map((c) => h('div.ctx', h('b', c.title), h('div.small', c.text)))) : null);
}

function whyBox(e, mode) {
  const meaning = e.band_meaning || mode.bands[e.band];
  return h('div.why', { class: `w-${e.band}${mode.band_tones?.[e.band] ? ` tone-${mode.band_tones[e.band]}` : ''}` },
    h('div.eyebrow', 'Why this is in front of you'),
    e.why.length ? h('ul.whylist', e.why.map((r) => h('li', r))) : h('p', meaning || 'Nothing flagged this one.'),
    e.why.length && meaning ? h('p.small.dim', meaning) : null);
}

const section = (title, body) => h('div.vsec', h('h3', title), body);

function step(s, onPlace) {
  const status = MARK[s.status] ? s.status : 'info';
  return h('li', h('span.mark', { class: status }, MARK[status]),
    h('div',
      h('div.stept', s.title),
      s.text ? h('div.steptext', s.text) : null,
      s.quote ? h('pre.quote', s.quote) : null,
      s.at ? h('button.pagelink', { onclick: () => onPlace(s.at) },
        s.at.tab != null ? (s.at.label || 'Show in the source') : `Show ${pageName(s.at)}`) : null));
}

function checks(rows) {
  return h('ul.checks', rows.map((c) => {
    const [word, cls] = CHECK[c.status] || CHECK.info;
    return h('li', { class: c.status }, h('span.chip', { class: cls }, word),
      h('div', h('div.cn', c.name), c.detail ? h('div.small.dim', c.detail) : null));
  }));
}
