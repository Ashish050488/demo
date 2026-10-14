// Hash router for the desk.
//   #/                                   the run pinned with --run, else the runs to choose from
//   #/review/<run>                       the run's documents, worst first (views/documents.js)
//   #/review/<run>/<doc>?item=&sort=     one document under review (views/review.js)
//
// Nothing here knows the domain: names, decision kinds and band meanings come from api/mode.
import { api } from './api.js';
import { h, clear, cap } from './util.js';
import { parseHash, href } from './router.js';
import { renderDocuments } from './views/documents.js';
import { renderReview } from './views/review.js';
import { reviewer } from './views/decide.js';

const app = document.getElementById('app');

let token = 0;
async function route() {
  const my = ++token;
  const { parts, query } = parseHash();
  const view = h('div.view');
  clear(app, view);
  try {
    const mode = await api.mode();
    if (my !== token) return;
    drawChrome(mode, parts);
    if (parts[0] === 'review' && parts[1] && parts[2]) await renderReview(view, mode, parts[1], parts[2], query);
    else if (parts[0] === 'review' && parts[1]) await renderDocuments(view, mode, parts[1]);
    else if (mode.run) location.replace(href(['review', mode.run]));
    else renderRuns(view, mode, (await api.runs()).runs);
  } catch (e) {
    if (my === token) clear(view, h('div.page', h('div.error', String(e.message || e))));
  }
}

// The top bar: the product, the steps (Documents -> Review; Review returns to the last document opened in this
// tab), and who decisions are recorded against.
function drawChrome(mode, parts) {
  document.title = `${mode.product} · Livo`;
  clear(document.getElementById('product'), mode.product);
  const run = parts[0] === 'review' && parts[1] ? parts[1] : mode.run;
  let last = null;
  try { last = sessionStorage.getItem('desk.last'); } catch { /* private window: fine */ }
  if (parts[0] === 'review' && parts[2]) {
    last = parts[2];
    try { sessionStorage.setItem('desk.last', last); } catch { /* fine */ }
  }
  const active = parts[2] ? 1 : 0;
  const steps = [[cap(mode.nouns.documents), run ? href(['review', run]) : '#/'],
    ['Review', run && last ? href(['review', run, last]) : null]];
  clear(document.getElementById('steps'), steps.map(([label, to], i) => h('a.step', {
    class: [i === active && 'on', !to && 'locked'].filter(Boolean).join(' '), href: to,
  }, h('span.stepn', i + 1), label)));
  const who = document.getElementById('who');
  if (mode.read_only) { clear(who, h('span.chip.muted', 'read-only preview')); return; }
  clear(who, h('span.dim', 'Reviewer '), h('b', {
    contenteditable: 'true', spellcheck: false, title: 'Click to change who decisions are recorded against',
    onblur: (e) => reviewer.set(e.target.textContent.trim()),
  }, reviewer.get(mode)));
}

function renderRuns(view, mode, runs) {
  if (!runs.length) return clear(view, h('div.page', h('div.empty', 'This server has no runs to show.')));
  clear(view, h('div.page', h('div.wrap',
    h('h1', 'Choose a run'),
    h('p.dim.lede', `Each run is one batch of ${mode.nouns.documents} the system processed.`),
    h('div.flist', runs.map((r) => h('a.fcard.runcard', { href: href(['review', r.id]) },
      h('div', h('div.fname', r.title), h('div.fstat.mono', r.id), r.subtitle ? h('div.fstat', r.subtitle) : null)))))));
}

window.addEventListener('hashchange', route);
route();
