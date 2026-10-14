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

const DEBOUNCE_MS = 400;

// Mirrors src/fieldValidate.js's rules exactly (server-side is the real gate - this is purely for instant
// as-you-type feedback, not served to the browser since it lives under src/, outside the static ui/ root).
function validateTyped(baseKey, value) {
  const v = (value || '').trim();
  if (baseKey === 'name') {
    const words = v.split(/\s+/).filter(Boolean);
    if (!words.length) return { valid: false, reason: 'Name is empty' };
    if (words.some((w) => w.replace(/[^A-Za-z]/g, '').length < 2)) return { valid: false, reason: 'Each word needs at least 2 letters' };
    return { valid: true };
  }
  if (baseKey === 'dob') {
    const m = v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (!m) return { valid: false, reason: 'Use DD/MM/YYYY' };
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (d.getFullYear() != yyyy || d.getMonth() != mm - 1 || d.getDate() != dd) return { valid: false, reason: 'Not a real date' };
    if (d.getTime() > Date.now()) return { valid: false, reason: 'Date of birth is in the future' };
    return { valid: true };
  }
  if (baseKey === 'id_pan' && v) {
    return /^[A-Z]{5}\d{4}[A-Z]$/.test(v.toUpperCase()) ? { valid: true } : { valid: false, reason: 'PAN is 5 letters, 4 digits, 1 letter' };
  }
  if (baseKey === 'pincode' && v) {
    return /^\d{6}$/.test(v) ? { valid: true } : { valid: false, reason: 'Pincode is 6 digits' };
  }
  if (baseKey === 'id_aadhaar_last4' || baseKey === 'id_details') {
    return /^\d{4}$/.test(v) ? { valid: true } : { valid: false, reason: 'Must be exactly 4 digits' };
  }
  return { valid: true };
}
const validatorBaseKey = (fieldKey) => (fieldKey || '').replace(/_n\d+$/, '');

const FIELD_WORDS = {
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
  const filterBar = h('div.lr-filter');
  const detailPanel = h('div'); // kept for renderDetail(); its content is moved inline under the selected row

  clear(root, h('div.lr',
    h('div.lr-top', titleEl, progressEl, wizardHeader(3).querySelector('nav'), h('span.grow'), toolbar),
    h('div.lr-body',
      h('div.lr-fields', filterBar, listEl),
      h('div.lr-preview',
        h('div.pv-head', h('b', 'Form preview'), pageTabs, h('span.spacer'), previewErrorBadge, updatingBadge, timingNote),
        scroller))));

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
    const check = validateTyped(validatorBaseKey(f.field), value);
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
    location.hash = `#/upload/${caseId}/confirm`;
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
    const filled = shown.filter((f) => stateOf(f) !== 'miss').length;
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
      err ? h('span.warn-t', err) : null,
      f.ocr_confidence != null ? h('span', `OCR confidence ${f.ocr_confidence.toFixed(0)}%${f.ocr_confidence < 85 ? ' — check it' : ''}`) : null,
      !err && original == null && f.reason && !hasEdit ? h('span', f.reason) : null,
      hasEdit && original != null ? h('span', 'Was: ', h('s', String(original)), ' ', h('button.btn.slim', { onclick: (e) => { e.stopPropagation(); restoreField(f); } }, 'Restore')) : null,
      f.group !== 'tickbox' && f.source !== 'excel' && original == null && /document/.test(f.reason || '')
        ? h('button.btn.slim', { onclick: (e) => { e.stopPropagation(); location.hash = `#/upload/${caseId}/documents/${nomineeOf(f.field)}`; } }, 'Add a document')
        : null);
  }

  function stateOf(f) {
    const val = effectiveValue(f);
    if (invalid.has(f.field)) return 'miss';
    if ((val == null || val === '') && f.status === 'not_applicable') return 'na';
    if (val == null || val === '') return 'miss';
    if (f.status === 'low_confidence' && !edits.has(f.field)) return 'warn';
    return 'ok';
  }

  function fieldRow(f) {
    const val = effectiveValue(f);
    const isTick = f.group === 'tickbox';
    const err = invalid.get(f.field);
    let row;
    const refreshDot = () => { const d = row.querySelector('.dot'); if (d) d.className = `dot ${stateOf(f)}`; };
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
    row = h('div.fr', { 'data-field': f.field, class: selected === f ? 'on' : null, onclick: () => { if (selected !== f) control.focus(); } },
      h('div.fr-head', h(`span.dot.${stateOf(f)}`), h('span.fr-label', humanize(f.field)), h('span.src', sourceLabel(f))),
      control,
      h('div.fr-more'));
    return row;
  }

  function sectionOf(f) {
    const n = nomineeOf(f.field);
    return n ? `Nominee ${n}` : (/^guardian/.test(f.field) ? 'Guardian' : 'Account & form');
  }

  function renderFilter() {
    const shown = data.fields.filter((f) => !/_n3$/.test(f.field));
    const todo = shown.filter((f) => stateOf(f) === 'miss' || stateOf(f) === 'warn').length;
    const btn = (key, text) => h('button', { class: filter === key ? 'on' : null, onclick: () => { filter = key; renderAll(false); } }, text);
    clear(filterBar, btn('all', `All (${shown.length})`), btn('todo', `Needs attention (${todo})`));
  }

  function renderAll(selectFirst = true) {
    let visible = data.fields.filter((f) => !/_n3$/.test(f.field));
    if (filter === 'todo') visible = visible.filter((f) => stateOf(f) === 'miss' || stateOf(f) === 'warn' || f === selected);
    const SECTIONS = ['Account & form', 'Nominee 1', 'Nominee 2', 'Guardian'];
    const rows = [];
    for (const sec of SECTIONS) {
      const items = visible.filter((f) => sectionOf(f) === sec).sort((a, b) => orderOf(a.field) - orderOf(b.field));
      if (!items.length) continue;
      const done = items.filter((f) => stateOf(f) === 'ok' || stateOf(f) === 'na').length;
      rows.push(h('div.lr-sec', h('span', sec), h('span', `${done}/${items.length}`)));
      for (const f of items) rows.push(fieldRow(f));
    }
    clear(listEl, rows.length ? rows : [h('div.empty', 'Nothing needs attention')]);
    renderToolbar();
    renderFilter();
    if (selectFirst || !selected) {
      const first = visible.find((f) => f.page) || data.fields.find((f) => f.page);
      if (first) showPageFor(first); else clear(stage, noPageMsg);
    } else {
      renderDetail(selected);
    }
  }

  renderAll();
}
