// Step 3, "live preview" + "correction as first-class" combined: three columns - editable fields (left),
// form page with the edited field boxed (middle), and a detail panel for whichever field is focused (right -
// source tag, validation message, and a Restore button once a field has been corrected). Replaces the old
// approve/correct/skip decision-panel flow (review.js/decide.js) for upload cases only - those files are
// untouched and still serve the three fixed demo cases exactly as before.
//
// Edits are kept in a local Map and only reach the server as a "corrected" decision when a field is
// committed (on blur, or when leaving this screen via "Continue to confirm") - never on every keystroke, and
// never when the typed value fails its field's validation (src/fieldValidate.js's rules, mirrored here for
// instant feedback). The frequent debounced calls go to POST /api/cases/:case/preview instead, which never
// persists anything.
import { h, clear } from '../util.js';
import { api } from '../api.js';
import { wizardHeader } from './wizard.js';
import { validatorFor, validateIdNumberFor, checkForm } from '/shared/fieldValidate.js';

const DEBOUNCE_MS = 400;


export const FIELD_WORDS = {
  name: 'Name', share_pct: 'Share %', relationship: 'Relationship', address: 'Address',
  mobile: 'Mobile', email: 'Email', id_aadhaar_last4: 'Aadhaar (last 4)', id_details: 'Aadhaar (last 4 digits)',
  dob: 'Date of birth', guardian_name: 'Guardian name', guardian_address: 'Guardian address',
  guardian_mobile: 'Guardian mobile', guardian_email: 'Guardian email', guardian_pan: 'Guardian PAN',
  applicant_name: 'Applicant name', broking_code: 'Broking code', dp_id: 'DP ID', client_id: 'Client ID',
  crn: 'CRN', fund_name: 'Fund name', folio_no: 'Folio number', investor_name: 'Investor name',
  wish_to_nominate: 'Wish to nominate', nominee_id_type: 'Nominee ID type', guardian_id_type: 'Guardian ID type',
  relationship_option: 'Relationship', id_type: 'ID type',
  id_pan: 'PAN', id_passport: 'Passport no.', id_dl: 'Driving licence no.', relationship_other: 'Relationship (if Others)',
  pincode: 'Pincode', city: 'City', state: 'State', country: 'Country', state_country: 'State & Country',
  id_number: 'ID number (for the ticked ID type)', form_date: 'Date', guardian_city: 'Guardian city',
  guardian_state: 'Guardian state', guardian_pincode: 'Guardian pincode', guardian_country: 'Guardian country',
};
// Form order (top to bottom as printed), so the list reads like the paper form.
const ORDER = ['form_date', 'fund_name', 'folio_no', 'investor_name', 'applicant_name', 'crn', 'dp_id', 'client_id', 'broking_code',
  'wish_to_nominate', 'name', 'share_pct', 'dob', 'relationship_option', 'relationship', 'relationship_other',
  'id_type', 'nominee_id_type', 'id_pan', 'id_details', 'id_aadhaar_last4', 'id_passport', 'id_dl',
  'id_number', 'address', 'city', 'state', 'state_country', 'pincode', 'country', 'mobile', 'email', 'guardian_name', 'guardian_id_type', 'guardian_pan', 'guardian_address',
  'guardian_city', 'guardian_state', 'guardian_pincode', 'guardian_country', 'guardian_mobile', 'guardian_email'];
const orderOf = (k) => { const i = ORDER.indexOf(k.replace(/_n\d+$/, '')); return i === -1 ? 999 : i; };

function humanize(fieldKey) {
  const m = fieldKey.match(/^(.*)_n(\d)$/);
  const base = m ? m[1] : fieldKey;
  const label = FIELD_WORDS[base] || base.replace(/_/g, ' ');
  return label;
}
function nomineeOf(fieldKey) {
  const m = fieldKey.match(/_n(\d)$/);
  return m ? m[1] : null;
}
const AADHAAR_4_DIGIT_KEYS = new Set(['id_aadhaar_last4', 'id_details']);
const isAadhaar4Digit = (fieldKey) => AADHAAR_4_DIGIT_KEYS.has(fieldKey.replace(/_n\d+$/, ''));
// Only this tickbox has a confirmed printed position per nominee column (mapping_config.js) - id_type/
// nominee_id_type/guardian_id_type were never visually located, so a choice there is recorded (saved,
// shown on the review screen) but can't be drawn as a tick yet. Said plainly in that row rather than faked.
const POSITIONED_TICKBOX_KEYS = new Set(['relationship_option', 'id_type']);

function flagRank(f) {
  if (f.status === 'needs_review' || f.status === 'not_provided') return 0;
  if (f.status === 'low_confidence') return 1;
  return 2;
}

const GROUP_DEFS = [
  { key: 'aadhaar', label: 'Aadhaar-sourced' },
  { key: 'excel', label: 'Account / demo-data fields' },
  { key: 'tickbox', label: 'Tick boxes' },
];

export async function renderUploadReviewLive(root, caseId) {
  await api.upload.run(caseId);
  let data = await api.case(caseId);
  let status = await api.upload.status(caseId);

  const edits = new Map(); // field -> value typed this session, not yet necessarily sent as a decision
  const committed = new Set(); // fields whose edit has been POSTed as a "corrected" decision
  const invalid = new Map(); // field -> reason, while the typed value fails validation
  let selected = null;
  let previewTimer = null;
  let previewToken = 0;

  let filter = 'all';
  let currentPage = null;
  const listEl = h('div.lr-list');
  const toolbar = h('div.ct-actions');
  const titleEl = h('h2');
  const progressEl = h('span.small.dim');
  const img = h('img.pv-img');
  const boxEl = h('div.box.focus', { hidden: true });
  const stage = h('div.pv-stage', img, boxEl);
  const scroller = h('div.pv-scroll', stage);
  const noPageMsg = h('div.empty', 'No page cited');
  const updatingBadge = h('span.chip.muted', { hidden: true }, 'Updating…');
  const previewErrorBadge = h('span.small.warn-t', { hidden: true }, 'Update failed');
  const timingNote = h('span.small.dim');
  const pageTabs = h('span.pgtabs');
  // "Check against the document": a small popup next to the clicked label, the whole card fitted inside it.
  const docImg = h('img.dp-img', { title: 'Click to open full size in a new tab' });
  const docTitle = h('div.dp-title');
  const docPop = h('div.docpop', { hidden: true },
    h('div.dp-head', docTitle, h('button.dp-x', { title: 'Close (Esc)', onclick: () => closeDoc() }, '×')),
    docImg,
    h('div.small.dim', 'Click the image to open it full size.'));
  docImg.addEventListener('click', () => window.open(docImg.src, '_blank'));
  document.body.append(docPop);
  function openDoc(f, anchor) {
    const doc = (status.documents || []).find((d) => d.id === f.source_doc);
    docTitle.textContent = `${humanize(f.field)} — ${doc ? `${doc.docTypeLabel || 'document'} (${doc.originalName})` : 'uploaded document'}`;
    docImg.src = `api/upload/${caseId}/documents/${f.source_doc}/view`;
    docPop.hidden = false;
    const r = (anchor || document.body).getBoundingClientRect();
    const w = 380, hgt = Math.min(560, window.innerHeight - 40);
    docPop.style.left = `${Math.min(window.innerWidth - w - 16, r.right + 12)}px`;
    docPop.style.top = `${Math.max(16, Math.min(window.innerHeight - hgt - 16, r.top - 40))}px`;
  }
  // "Add a document" without leaving the review screen: pick files, read them, attach to this nominee, refill.
  const addInput = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png', multiple: true, hidden: true });
  const addBody = h('div.ad-body');
  const addTitle = h('div.dp-title');
  const addPop = h('div.modal-back', { hidden: true, onclick: (e) => { if (e.target === addPop && !addBusy) addPop.hidden = true; } },
    h('div.addpop', h('div.dp-head', addTitle, h('button.dp-x', { onclick: () => { if (!addBusy) addPop.hidden = true; } }, '×')), addBody));
  document.body.append(addPop, addInput);
  window.addEventListener('hashchange', () => { addPop.remove(); addInput.remove(); }, { once: true });
  let addNominee = 1;
  let addBusy = false;
  function openAddDoc(nominee) {
    addNominee = nominee;
    addTitle.textContent = `Add a document for Nominee ${nominee}`;
    clear(addBody,
      h('p.small.dim', 'Aadhaar (front/back), PAN card, passport or driving licence. It is read here and the fields fill in automatically.'),
      h('button.btn.primary', { onclick: () => addInput.click() }, 'Choose files'));
    addPop.hidden = false;
  }
  addInput.addEventListener('change', async () => {
    const files = [...addInput.files];
    addInput.value = '';
    if (!files.length) return;
    addBusy = true;
    const rows = new Map(files.map((f) => [f.name, h('div.small', `${f.name} — uploading…`)]));
    clear(addBody, [...rows.values()]);
    try {
      const res = await api.upload.uploadDocuments(caseId, files);
      const accepted = res.results.filter((r) => r.accepted);
      for (const r of res.results.filter((x) => !x.accepted)) rows.get(r.filename).textContent = `${r.filename} — ${r.reason}`;
      for (const r of accepted) rows.get(r.filename).textContent = `${r.filename} — reading…`;
      for (const r of accepted) await api.upload.assignDocument(caseId, r.docId, addNominee);
      for (let i = 0; i < 120; i++) {
        status = await api.upload.status(caseId);
        const docs = accepted.map((r) => status.documents.find((d) => d.id === r.docId)).filter(Boolean);
        for (const [i2, d] of docs.entries()) {
          const name = accepted[i2].filename;
          rows.get(name).textContent = d.status === 'processing' ? `${name} — reading…`
            : d.status === 'done' ? `${name} — ${d.docTypeLabel}: found ${(d.read || []).join(', ') || 'nothing readable'}`
              : `${name} — ${d.message || 'could not be read'}`;
        }
        if (docs.every((d) => d.status !== 'processing')) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await api.upload.run(caseId);
      data = await api.case(caseId);
      edits.clear(); committed.clear();
      renderAll(false);
      addBody.append(h('div.toolbar', { style: { marginTop: '10px' } }, h('button.btn.primary', { onclick: () => { addPop.hidden = true; } }, 'Done — fields updated')));
    } catch (err) {
      addBody.append(h('div.warn-t', String(err.message || err)));
    } finally {
      addBusy = false;
    }
  });

  function closeDoc() { docPop.hidden = true; docImg.removeAttribute('src'); }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDoc(); });
  document.addEventListener('mousedown', (e) => { if (!docPop.hidden && !docPop.contains(e.target) && !e.target.closest('.srclink, .dp-open')) closeDoc(); });
  window.addEventListener('hashchange', () => docPop.remove(), { once: true });
  const filterBar = h('div.lr-filter');
  const detailPanel = h('div'); // kept for renderDetail(); its content is moved inline under the selected row

  // ---- "Field mapping": every mapped box of this form as a table + the raw mapping JSON ----
  let mapData = null;
  const mapPane = h('div.mappane', { hidden: true });
  const viewBtn = (key, text) => h('button', { 'data-view': key, onclick: () => setView(key) }, text);
  const viewTabs = h('span.viewtabs', viewBtn('form', 'Filled form'), viewBtn('map', 'Field mapping (JSON)'));
  function setView(key) {
    for (const b of viewTabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.view === key);
    const map = key === 'map';
    mapPane.hidden = !map; scroller.hidden = map; pageTabs.hidden = map;
    if (map) renderMapPane();
  }
  let sources = null;
  async function loadMapping() {
    if (!mapData) {
      [mapData, sources] = await Promise.all([
        fetch(`api/mapping/${status.formType}`).then((r) => r.json()),
        fetch('api/field-sources').then((r) => r.json()),
      ]);
    }
    return mapData;
  }
  const mapItemFor = (field) => mapData && mapData.items.find((it) => it.id === field || it.id.startsWith(`${field} = `));
  const SRC_TEXT = { typed: 'Typed on this screen (or sample data)', today: "Today's date", tick: 'Tick box - by rule or by you' };
  // "document.name" -> what it means + which documents it's read from
  function explain(src) {
    const m = /^document\.(\w+)$/.exec(src || '');
    if (!m) return { kind: src || 'typed', text: SRC_TEXT[src] || src };
    const d = sources.document_data[m[1]] || {};
    return { kind: 'document', key: m[1], text: d.means || m[1], docs: d.read_from || [] };
  }
  async function renderMapPane() {
    await loadMapping();
    const form = sources[status.formType] || {};
    const q = h('input.lval-input', { placeholder: 'Filter fields…', oninput: () => draw() });
    const list = h('div.srclist');
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      const rows = Object.entries(form).filter(([k, v]) => !t || `${k} ${v} ${FIELD_WORDS[k] || ''}`.toLowerCase().includes(t));
      clear(list, rows.map(([key, src]) => {
        const ex = explain(src);
        const nomineeField = data.fields.find((x) => x.field === `${key}_n1`) || data.fields.find((x) => x.field === key);
        return h('div.srcrow', { onclick: () => { if (nomineeField) { setView('form'); showPageFor(nomineeField); listEl.querySelector(`[data-field="${nomineeField.field}"]`)?.scrollIntoView({ block: 'center' }); } } },
          h('div.sr-json', h('span.jk', `"${key}"`), h('span.jp', ': '), h(`span.jv.${ex.kind}`, `"${src}"`)),
          h('div.sr-human', h('b', FIELD_WORDS[key] || key.replace(/_/g, ' ')), ' ← ', ex.text,
            ex.docs && ex.docs.length ? h('span.sr-docs', ex.docs.map((d) => h('span.rchip', d))) : null));
      }));
    };
    draw();
    clear(mapPane,
      h('div.mp-top', h('div', h('b', `${mapData.label}: form field → where its value comes from`),
        h('div.small.dim', 'Left: the mapping as it is in mappings/field-sources.json (the fill step reads this file). Right: what it means. Click a row to see that field.')),
        h('a.btn.slim', { href: `#/mapping/${status.formType}`, target: '_blank' }, 'See positions on the form ↗')),
      q, list,
      h('details.mp-json', h('summary', 'View the whole JSON file'), h('pre', JSON.stringify({ document_data: sources.document_data, [status.formType]: form }, null, 2))));
  }
  setView('form');
  loadMapping().catch(() => {});

  clear(root, h('div.lr',
    h('div.lr-top', titleEl, progressEl, wizardHeader(3, caseId).querySelector('nav'), h('span.grow'), toolbar),
    h('div.lr-body',
      h('div.lr-fields', filterBar, listEl),
      h('div.lr-preview',
        h('div.pv-head', viewTabs, pageTabs, h('span.spacer'), previewErrorBadge, updatingBadge, timingNote),
        scroller, mapPane))));

  function effectiveValue(f) {
    if (edits.has(f.field)) return edits.get(f.field);
    // No local edit this session (e.g. right after a reload) - fall back to a correction already recorded
    // server-side (api.case()'s f.decision), not just the raw original f.value, or a reload looked like the
    // correction had been silently lost even though it was safely committed.
    if (f.decision && f.decision.kind === 'corrected' && f.decision.value != null && f.decision.value !== '') return f.decision.value;
    return f.group === 'tickbox' ? f.option_chosen : f.value;
  }

  function sourceLabel(f) {
    if (edits.has(f.field)) return f.decision && f.decision.kind === 'corrected' ? 'Corrected by you' : 'Typed by you';
    if (f.decision && f.decision.kind === 'corrected') return 'Corrected by you';
    if (f.group === 'tickbox') return 'Rule';
    if (f.status === 'not_provided') return '—';
    if (f.value == null) return '—';
    if (['Aadhaar', 'PAN card', 'Passport', 'Driving licence'].includes(f.source_file)) return `from ${f.source_file}`;
    if (f.source_file === "today's date") return 'Today';
    if (f.group === 'aadhaar') return 'Aadhaar OCR';
    if (f.source === 'pan') return 'PAN card OCR';
    if (f.source_file === 'demo data (sample)') return 'Demo data (sample)';
    return f.source || '—';
  }

  function showPageFor(f) {
    const prev = selected;
    selected = f;
    if (prev !== f) {
      for (const el of listEl.querySelectorAll('.fr.on')) el.classList.remove('on');
      const row = listEl.querySelector(`[data-field="${f.field}"]`);
      if (row) row.classList.add('on');
    }
    renderDetail(f);
    if (f.page) { currentPage = f.page; renderPageTabs(); }
    if (!f.page) {
      clear(stage, noPageMsg);
      return;
    }
    // Goes through /preview (not the plain page-image URL) even when nothing is being typed right now - that
    // endpoint's getValue() already re-applies every previously-committed correction for every field (not
    // just the one named), so switching focus to a different field still shows every earlier edit. The plain
    // page URL only ever reflects the original first-pass fill, which is exactly why the preview used to
    // "sometimes show the correction, sometimes not": it reset to that pristine original on every focus
    // change, discarding edits that hadn't been baked into a new file yet.
    runPreview(f, effectiveValue(f) ?? '');
  }

  function positionBox(f) {
    const box = f.boxes && f.boxes.length ? f.boxes[0] : f.box;
    if (!box) { boxEl.hidden = true; return; }
    const [x0, y0, x1, y1] = box;
    boxEl.hidden = false;
    Object.assign(boxEl.style, { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` });
    // Bring the field into view in the preview - no manual scrolling to find what you're editing.
    const target = stage.offsetTop + y0 * stage.offsetHeight - scroller.clientHeight / 3;
    scroller.scrollTo({ top: Math.max(0, target) });
  }

  async function runPreview(f, value) {
    const token = ++previewToken;
    updatingBadge.hidden = false;
    previewErrorBadge.hidden = true;
    const start = performance.now();
    try {
      const res = await api.preview(caseId, f.field, value);
      if (token !== previewToken) return; // a later edit superseded this one - the latest edit always wins
      if (!res.ok) { previewErrorBadge.hidden = false; return; }
      const blob = await res.blob();
      const ms = Math.round(performance.now() - start);
      timingNote.textContent = `last update: ${ms}ms`;
      console.log(`preview update for ${f.field}: ${ms}ms (server-reported: ${res.headers.get('X-Preview-Ms')}ms)`);
      if (!stage.contains(img)) clear(stage, img, boxEl);
      const url = URL.createObjectURL(blob);
      const prevSrc = img.dataset.blobUrl;
      img.onload = () => { if (prevSrc) URL.revokeObjectURL(prevSrc); };
      img.dataset.blobUrl = url;
      img.src = url;
      positionBox(f);
    } catch {
      if (token === previewToken) previewErrorBadge.hidden = false;
    } finally {
      if (token === previewToken) updatingBadge.hidden = true;
    }
  }

  function scheduleEdit(f, value) {
    const check = typedCheck(f, value);
    if (!check.valid) {
      invalid.set(f.field, check.reason);
      edits.delete(f.field); // never a value that fails validation, even in memory as "the edit"
      committed.delete(f.field);
      clearTimeout(previewTimer);
      if (selected === f) renderDetail(f);
      return;
    }
    invalid.delete(f.field);
    edits.set(f.field, value);
    committed.delete(f.field);
    clearTimeout(previewTimer);
    if (f.page) previewTimer = setTimeout(() => runPreview(f, value), DEBOUNCE_MS);
    if (selected === f) renderDetail(f);
  }

  async function commitField(f) {
    if (!edits.has(f.field) || committed.has(f.field)) return;
    committed.add(f.field);
    try {
      const res = await api.decide(caseId, { item: f.field, kind: 'corrected', value: edits.get(f.field), who: 'reviewer' });
      f.decision = res.decision;
    } catch {
      committed.delete(f.field); // let a later blur/continue retry
    }
  }

  function restoreField(f) {
    edits.delete(f.field);
    invalid.delete(f.field);
    committed.delete(f.field);
    f.decision = { kind: 'skipped' }; // locally first, so the re-render below doesn't show the old correction
    api.decide(caseId, { item: f.field, kind: 'skipped', who: 'reviewer' }).then((res) => { f.decision = res.decision; }).catch(() => {});
    renderAll();
    showPageFor(f);
  }

  async function doFillSampleData(variant) {
    const btn = toolbar.querySelector('.fill-sample-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      await api.upload.fillSampleData(caseId, variant);
      await api.upload.run(caseId);
      data = await api.case(caseId);
      status = await api.upload.status(caseId);
      renderAll();
    } catch (err) {
      if (err.message === 'needs_variant') {
        renderToolbar(true);
        return;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Fill with sample demo data'; }
    }
  }

  async function downloadPdf(e) {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      for (const f of data.fields) if (edits.has(f.field)) await commitField(f);
      await api.regenerate(caseId);
      const a = h('a', { href: api.downloadUrl(caseId, 'regenerated'), download: '' });
      document.body.append(a); a.click(); a.remove();
    } finally {
      btn.disabled = false; btn.textContent = 'Download PDF';
    }
  }

  async function goToConfirm() {
    // Flush every edit still pending (e.g. the user clicked straight from a focused input, so it never
    // blurred) before leaving - commitField() is a no-op for anything already committed or invalid.
    for (const f of data.fields) if (edits.has(f.field)) await commitField(f);
    recheck();
    const todo = data.fields.filter((f) => !/_n3$/.test(f.field) && mustFix(f));
    if (todo.length) { showBlocked(todo); return; }
    location.hash = `#/upload/${caseId}/confirm`;
  }

  function showBlocked(todo) {
    const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
      h('div.addpop',
        h('div.dp-head', h('div.dp-title', `${todo.length} field${todo.length === 1 ? '' : 's'} must be fixed before confirming`), h('button.dp-x', { onclick: () => back.remove() }, '×')),
        h('div.blocklist', todo.map((f) => h('button.blockrow', { onclick: () => {
          back.remove(); filter = 'fix'; renderAll(false);
          const row = listEl.querySelector(`[data-field="${f.field}"]`);
          if (row) { row.scrollIntoView({ block: 'center' }); row.querySelector('input, textarea, select')?.focus(); }
        } }, h('b', `${sectionOf(f)} – ${humanize(f.field)}`), h('span.small', check.invalid.get(f.field) || 'Required - empty'))))));
    document.body.append(back);
  }

  function renderPageTabs() {
    const n = data.pageCount || 1;
    const pages = [];
    for (let i = 1; i <= n; i++) {
      const first = data.fields.find((x) => x.page === i && !/_n3$/.test(x.field));
      pages.push(h('button', { class: i === currentPage ? 'on' : null, disabled: !first, onclick: () => first && showPageFor(first) }, `Page ${i}`));
    }
    clear(pageTabs, pages);
  }

  function renderToolbar(askVariant = false) {
    const shown = data.fields.filter((f) => !/_n3$/.test(f.field));
    const filled = shown.filter((f) => !isEmpty(f) && f.status !== 'not_applicable').length;
    titleEl.textContent = data.label;
    progressEl.textContent = `${filled} of ${shown.length} filled`;
    const actions = [];
    if (askVariant) {
      actions.push(
        h('span.small', 'Which fund house?'),
        h('button.btn.slim', { onclick: () => doFillSampleData('360one') }, '360 ONE'),
        h('button.btn.slim', { onclick: () => doFillSampleData('hdfc') }, 'HDFC'));
    } else if (!status.useSampleData) {
      actions.push(h('button.btn.fill-sample-btn', { onclick: () => doFillSampleData() }, 'Fill with sample demo data'));
    } else {
      actions.push(h('span.small.dim', 'Sample data loaded'));
    }
    actions.push(h('button.btn', { onclick: downloadPdf }, 'Download PDF'));
    actions.push(h('button.btn.primary', { onclick: goToConfirm }, 'Continue to confirm →'));
    clear(toolbar, actions);
  }

  // Details for the selected field are shown inline, right under its input (no separate side panel).
  function renderDetail(f) {
    for (const el of listEl.querySelectorAll('.fr-more')) clear(el);
    const row = listEl.querySelector(`[data-field="${f.field}"]`);
    const more = row && row.querySelector('.fr-more');
    if (!more) return;
    const err = invalid.get(f.field);
    const hasEdit = edits.has(f.field) || (f.decision && f.decision.kind === 'corrected');
    const original = f.group === 'tickbox' ? f.option_chosen : f.value;
    clear(more,
      f.source_doc ? h('button.btn.slim.dp-open', { onclick: (e) => { e.stopPropagation(); openDoc(f, e.currentTarget); } }, `Check against the ${(f.source_file || 'document').toLowerCase()}`) : null,
      f.ocr_confidence != null ? h('span', `OCR confidence ${f.ocr_confidence.toFixed(0)}%${f.ocr_confidence < 85 ? ' — check it' : ''}`) : null,
      !err && original == null && f.reason && !hasEdit ? h('span', f.reason) : null,
      hasEdit && original != null ? h('span', 'Was: ', h('s', String(original)), ' ', h('button.btn.slim', { onclick: (e) => { e.stopPropagation(); restoreField(f); } }, 'Restore')) : null,
      f.group !== 'tickbox' && f.source !== 'excel' && original == null && /document/.test(f.reason || '')
        ? h('button.btn.slim', { onclick: (e) => { e.stopPropagation(); openAddDoc(Number(nomineeOf(f.field)) || 1); } }, 'Add a document')
        : null);
  }

  function typedCheck(f, value) {
    if (value == null || String(value).trim() === '') return { valid: true };
    const base = f.field.replace(/_n\d+$/, '');
    if (base === 'id_number') {
      const typeField = status.formType === 'crn' ? 'nominee_id_type' : `id_type_${f.field.split('_').pop()}`;
      const tf = data.fields.find((x) => x.field === typeField);
      return validateIdNumberFor(tf ? effectiveValue(tf) : null, value);
    }
    const fn = validatorFor(base);
    return fn ? fn(value) : { valid: true };
  }

  // One check of the whole form (the same function the server runs before saving).
  let check = { missing: new Set(), invalid: new Map() };
  function recheck() {
    const values = {};
    for (const f of data.fields) {
      if (/_n3$/.test(f.field)) continue;
      const v = effectiveValue(f);
      if (v != null && v !== '') values[f.field] = v;
    }
    const r = checkForm(status.formType, values);
    check = { missing: new Set(r.missing), invalid: new Map(r.invalid.map((x) => [x.field, x.reason])) };
    for (const [k, why] of invalid) check.invalid.set(k, why); // typed but not accepted yet
  }
  const mustFix = (f) => check.missing.has(f.field) || check.invalid.has(f.field);

  function stateOf(f) {
    const val = effectiveValue(f);
    if (check.invalid.has(f.field)) return 'bad';
    if (check.missing.has(f.field)) return 'req';
    if ((val == null || val === '') && f.status === 'not_applicable') return 'na';
    if (val == null || val === '') return 'blank';
    if (f.status === 'low_confidence' && !edits.has(f.field)) return 'warn';
    return 'ok';
  }

  // Update every row's colour/flag in place after an edit (no full re-render, so typing isn't interrupted).
  function refreshStates() {
    recheck();
    for (const f of data.fields) {
      const row = listEl.querySelector(`[data-field="${f.field}"]`);
      if (!row) continue;
      const st = stateOf(f);
      row.classList.toggle('bad', st === 'bad');
      row.classList.toggle('reqmiss', st === 'req');
      const dot = row.querySelector('.dot');
      if (dot) dot.className = `dot ${st}`;
      const flag = row.querySelector('.fr-flag');
      if (flag) flag.textContent = st === 'bad' ? check.invalid.get(f.field) : st === 'req' ? 'Required - fill this before confirming' : '';
    }
    renderFilter();
    renderToolbar();
  }

  function fieldRow(f) {
    const val = effectiveValue(f);
    const isTick = f.group === 'tickbox';
    const err = invalid.get(f.field);
    let row;
    const refreshDot = () => refreshStates();
    let control;
    if (isTick && f.options) {
      control = h('select.lval-input', {
        onfocus: () => showPageFor(f),
        onchange: async (e) => {
          scheduleEdit(f, e.target.value); await commitField(f); refreshDot(); renderToolbar();
          // The ID type decides which number goes on the form - refill so the number rows follow the tick.
          if (/^(id_type|nominee_id_type)/.test(f.field)) {
            await api.upload.run(caseId);
            data = await api.case(caseId);
            edits.clear(); committed.clear();
            const again = data.fields.find((x) => x.field === f.field);
            renderAll(false);
            if (again) showPageFor(again);
          }
        },
      }, [h('option', { value: '', selected: val == null }, '— not ticked —'),
        ...f.options.map((opt) => h('option', { value: opt, selected: opt === val }, opt))]);
    } else {
      const multiline = /^(address|fund_name)/.test(f.field);
      control = h(multiline ? 'textarea.lval-input' : 'input.lval-input', {
        rows: multiline ? 3 : null,
        placeholder: 'Type it here',
        maxlength: isAadhaar4Digit(f.field) ? 4 : null,
        inputmode: isAadhaar4Digit(f.field) ? 'numeric' : null,
        class: err ? 'invalid' : null,
        onfocus: () => showPageFor(f),
        oninput: (e) => { scheduleEdit(f, e.target.value); refreshDot(); },
        onblur: () => { commitField(f); renderToolbar(); },
      });
      control.value = val ?? '';
    }
    const st = stateOf(f);
    row = h('div.fr', { 'data-field': f.field, class: [selected === f ? 'on' : null, st === 'bad' ? 'bad' : null, st === 'req' ? 'reqmiss' : null].filter(Boolean).join(' ') || null, onclick: () => { if (selected !== f) control.focus(); } },
      h('div.fr-head', h(`span.dot.${st}`), h('span.fr-label', humanize(f.field), isRequired(f) ? h('span.req', { title: 'Required by the form' }, ' *') : null), f.source_doc
        ? h('button.src.srclink', { title: 'Show the uploaded document this was read from', onclick: (e) => { e.stopPropagation(); openDoc(f, e.currentTarget); } }, `${sourceLabel(f)} · view`)
        : sourceLabel(f) && sourceLabel(f) !== '—' ? h('span.src', sourceLabel(f)) : null),
      control,
      h('div.fr-flag', st === 'bad' ? check.invalid.get(f.field) : st === 'req' ? 'Required - fill this before confirming' : ''),
      h('div.fr-more'));
    return row;
  }

  function sectionOf(f) {
    const n = nomineeOf(f.field);
    return n ? `Nominee ${n}` : (/^guardian/.test(f.field) ? 'Guardian' : 'Account & form');
  }

  const isEmpty = (f) => { const v = effectiveValue(f); return (v == null || v === '') && f.status !== 'not_applicable'; };
  // Required = the form marks it mandatory (shared REQUIRED list via checkForm): a missing one, or a filled one
  // that would be missing if emptied.
  function isRequired(f) {
    if (check.missing.has(f.field)) return true;
    const values = {};
    for (const x of data.fields) { const v = effectiveValue(x); if (v != null && v !== '' && x !== f) values[x.field] = v; }
    return checkForm(status.formType, values).missing.includes(f.field);
  }

  function renderFilter() {
    const shown = data.fields.filter((f) => !/_n3$/.test(f.field));
    const empty = shown.filter(isEmpty).length;
    const fix = shown.filter(mustFix).length;
    const btn = (key, text, title) => { const m = text.match(/^(.*) ((d+))$/); return h('button', { title, class: filter === key ? 'on' : null, onclick: () => { filter = key; renderAll(false); } }, m ? m[1] : text, m ? h('span.cnt', m[2]) : null); };
    clear(filterBar,
      btn('all', `All (${shown.length})`, 'Every field on the form'),
      btn('filled', `Filled (${shown.filter((f) => !isEmpty(f) && f.status !== 'not_applicable').length})`, 'Everything already filled in - read from documents, typed, or automatic'),
      btn('empty', `Not filled yet (${empty})`, 'Fields with no value yet'),
      btn('fix', `Must fix (${fix})`, 'Required fields still empty, and values that break a rule (wrong length, wrong ID type...) - the form can\'t be confirmed until these are fixed'));
  }

  function renderAll(selectFirst = true) {
    recheck();
    let visible = data.fields.filter((f) => !/_n3$/.test(f.field));
    if (filter === 'filled') visible = visible.filter((f) => (!isEmpty(f) && f.status !== 'not_applicable'));
    if (filter === 'empty') visible = visible.filter((f) => isEmpty(f));
    if (filter === 'fix') visible = visible.filter((f) => mustFix(f));
    const SECTIONS = ['Account & form', 'Nominee 1', 'Nominee 2', 'Guardian'];
    const rows = [];
    for (const sec of SECTIONS) {
      const items = visible.filter((f) => sectionOf(f) === sec).sort((a, b) => orderOf(a.field) - orderOf(b.field));
      if (!items.length) continue;
      const done = items.filter((f) => !mustFix(f)).length;
      rows.push(h('div.lr-sec', h('span', sec), h('span', `${done}/${items.length}`)));
      for (const f of items) rows.push(fieldRow(f));
    }
    clear(listEl, rows.length ? rows : [h('div.empty', 'Nothing needs attention')]);
    renderToolbar();
    renderFilter();
    if (selectFirst || !selected || !visible.includes(selected)) {
      const first = visible.find((f) => f.page) || data.fields.find((f) => f.page);
      if (first) showPageFor(first); else clear(stage, noPageMsg);
    } else {
      renderDetail(selected);
    }
  }

  renderAll();
}
