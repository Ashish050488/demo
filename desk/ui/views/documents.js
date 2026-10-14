// Step 1: every document in the run, the one carrying the most doubt first. The server orders them
// (auditdesk/queue.py); this draws each with its band mix and how much of what was flagged is still open.
import { api } from '../api.js';
import { h, clear, plural, cap } from '../util.js';
import { href } from '../router.js';

export async function renderDocuments(view, mode, run) {
  const [{ documents }, runs] = await Promise.all([api.documents(run), api.runs()]);
  const title = (runs.runs.find((r) => r.id === run) || {}).title || run;
  const n = mode.nouns;
  const state = { q: '' };
  const listEl = h('div.flist');
  const items = documents.reduce((a, d) => a + d.tally.items, 0);
  const open = documents.reduce((a, d) => a + d.tally.open, 0);
  const search = h('input.search', { id: 'doc-search', type: 'search', placeholder: `Search ${n.documents}`,
    oninput: (e) => { state.q = e.target.value.toLowerCase(); draw(); } });

  clear(view, h('div.page', h('div.wrap',
    h('h1', title),
    h('p.dim.lede', `${plural(documents.length, n.document, n.documents)} · ${plural(items, n.item, n.items)} · `
      + `${open} flagged and still open. Ordered by how much doubt each carries, so the one worth your time comes first.`),
    h('div.toolbar', h('span.spacer'), search),
    listEl)));

  function row(d) {
    const t = d.tally;
    const all = Math.max(t.items, 1);
    const SHORT = { low: 'l', medium: 'm', high: 'h' };        // the kit's own three keep their colours
    const seg = (b) => (t[b] ? h('i', { class: SHORT[b] || (mode.band_tones?.[b] ? `tone-${mode.band_tones[b]}` : 'n'),
      style: { width: `${(t[b] / all) * 100}%` } }) : null);
    const order = mode.band_order || ['low', 'medium', 'high'];
    const word = (b) => mode.band_labels?.[b] || b;
    // the kit's own three bands always show all three counts; a band set a domain invented shows only those present
    const custom = order.join() !== 'low,medium,high';
    const mix = order.filter((b) => !custom || t[b]).map((b) => `${t[b] || 0} ${word(b)}`).join(' · ');
    return h('a.fcard', { href: href(['review', run, d.id]) },
      h('div.fmain',
        h('div.fname', d.title),
        h('div.fstat', d.subtitle || '', d.reasons.length ? h('span.warn-t', ` · ${d.reasons[0]}`) : null)),
      h('div.fdoubt',
        h('div.doubtbar', { title: mix }, order.map(seg), seg('none')),
        h('div.small.dim', `${mix}${t.none ? ` · ${t.none} unbanded` : ''}`)),
      h('div.fright',
        t.open ? h('div', h('b', t.open), ' to review') : h('div.ok-t', t.flagged ? 'All flagged reviewed' : 'Nothing flagged'),
        h('div.small.dim', `${t.settled} of ${plural(t.items, n.item, n.items)} decided`)));
  }

  function draw() {
    const shown = documents.filter((d) => !state.q || `${d.title} ${d.subtitle || ''} ${d.id}`.toLowerCase().includes(state.q));
    clear(listEl, shown.map(row), shown.length ? null : h('div.empty', `No ${n.document} matches.`));
  }
  draw();
  if (!documents.length) clear(listEl, h('div.empty', `${cap(n.documents)}: none in this run.`));
}
