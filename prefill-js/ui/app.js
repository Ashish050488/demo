// Hash router:
//   #/                               case picker (fixed demo cases)
//   #/case/<id>                      review screen (fixed case)
//   #/upload                         upload wizard step 1 (upload blank form)
//   #/upload/<caseId>/documents[/n]  step 2 (optionally scrolled to nominee n's slot)
//   #/upload/<caseId>/review         step 3
//   #/upload/<caseId>/confirm        step 4
//   #/records                        step 5 (saved records, not case-specific)
//   #/mapping/<crn|cams>             form mapping viewer (blank form + every mapped box)
import { h, clear } from './util.js';
import { renderCaseList } from './views/caselist.js';
import { renderReview } from './views/review.js';
import { renderUploadForm } from './views/uploadForm.js';
import { renderUploadDocs } from './views/uploadDocs.js';
import { renderUploadReviewLive } from './views/uploadReviewLive.js';
import { renderUploadConfirm } from './views/uploadConfirm.js';
import { renderRecords } from './views/records.js';
import { renderMapping } from './views/mapping.js';

const app = document.getElementById('app');

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  return raw.split('/').filter(Boolean).map(decodeURIComponent);
}

function setCrumbs(...items) {
  clear(document.getElementById('crumbs'),
    items.map((it, i) => [i ? h('span.sep', '/') : null, it.href ? h('a', { href: it.href }, it.text) : h('span', it.text)]));
}

async function route() {
  const parts = parseHash();
  document.body.classList.add('desk');
  const view = h('div.view');
  clear(app, view);
  try {
    if (parts[0] === 'mapping') {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Form mapping' });
      await renderMapping(view, parts[1] === 'cams' ? 'cams' : 'crn');
    } else if (parts[0] === 'case' && parts[1]) {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: parts[1] });
      await renderReview(view, parts[1]);
    } else if (parts[0] === 'upload' && !parts[1]) {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Upload a form' });
      await renderUploadForm(view);
    } else if (parts[0] === 'upload' && parts[2] === 'documents') {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Upload documents' });
      await renderUploadDocs(view, parts[1], parts[3]);
    } else if (parts[0] === 'upload' && parts[2] === 'review') {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Review' });
      await renderUploadReviewLive(view, parts[1]);
    } else if (parts[0] === 'upload' && parts[2] === 'confirm') {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Confirm' });
      await renderUploadConfirm(view, parts[1]);
    } else if (parts[0] === 'records') {
      setCrumbs({ text: 'Cases', href: '#/' }, { text: 'Saved records' });
      await renderRecords(view);
    } else {
      setCrumbs({ text: 'Cases' });
      await renderCaseList(view);
    }
  } catch (err) {
    clear(view, h('div.error', String(err.stack || err)));
  }
}

window.addEventListener('hashchange', route);
route();
