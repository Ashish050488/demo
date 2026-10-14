// The review screen: a case-wide toolbar (title, progress, regenerate/download) | field list (left) | source
// page with the selected field boxed (middle, pageview.js) | evidence + decision panel (right, decide.js).
// pageview.js and decide.js are copied from the kit, unmodified (bar one call-site in pageview.js adapted to
// our simpler data model); this file is new, wiring them together.
import { h, clear } from '../util.js';
import { api, setActiveSrc } from '../api.js';
import { createPageView } from './pageview.js';
import { drawDecision } from './decide.js';
import { wizardHeader } from './wizard.js';

const MODE = {
  read_only: false, who: 'reviewer',
  kinds: [
    { kind: 'approved', label: 'Right as captured', hint: 'Value is correct', needs: null },
    { kind: 'corrected', label: 'Wrong — correct it', hint: 'Give the right value', needs: 'value' },
    { kind: 'skipped', label: 'Leave it', hint: 'For someone else', needs: null },
  ],
};

const GROUP_DEFS = [
  { key: 'aadhaar', label: 'Aadhaar-sourced — needs explicit approval' },
  { key: 'excel', label: 'Excel-sourced' },
  { key: 'tickbox', label: 'Tick boxes' },
];

// Readable names for the field-key vocabulary this project uses throughout (mapping_config.js). A field key
// like "address_n1" becomes "Address — Nominee 1" - the raw key is still shown in the evidence panel (it's
// what the decision log and results.json use), just not as the primary label a reviewer scans.
const FIELD_WORDS = {
  name: 'Name', share_pct: 'Share %', relationship: 'Relationship', address: 'Address',
  mobile: 'Mobile', email: 'Email', id_aadhaar_last4: 'Aadhaar (last 4)', id_details: 'ID details',
  dob: 'Date of birth', guardian_name: 'Guardian name', guardian_address: 'Guardian address',
  guardian_mobile: 'Guardian mobile', guardian_email: 'Guardian email', guardian_pan: 'Guardian PAN',
  applicant_name: 'Applicant name', broking_code: 'Broking code', dp_id: 'DP ID', client_id: 'Client ID',
  crn: 'CRN', fund_name: 'Fund name', folio_no: 'Folio number', investor_name: 'Investor name',
  wish_to_nominate: 'Wish to nominate', nominee_id_type: 'Nominee ID type', guardian_id_type: 'Guardian ID type',
  relationship_option: 'Relationship', id_type: 'ID type',
};

function humanize(fieldKey) {
  const m = fieldKey.match(/^(.*)_n(\d)$/);
  const base = m ? m[1] : fieldKey;
  const label = FIELD_WORDS[base] || base.replace(/_/g, ' ');
  return m ? `Nominee ${m[2]} — ${label}` : label;
}

function nomineeOf(fieldKey) {
  const m = fieldKey.match(/_n(\d)$/);
  return m ? m[1] : null;
}

const AADHAAR_4_DIGIT_KEYS = new Set(['id_aadhaar_last4', 'id_details']);
function isAadhaar4Digit(fieldKey) {
  return AADHAAR_4_DIGIT_KEYS.has(fieldKey.replace(/_n\d+$/, ''));
}

function flagRank(f) {
  if (f.status === 'needs_review') return 0;
  if (f.status === 'low_confidence') return 1;
  return 2;
}

function groupFields(fields, showNA) {
  const visible = fields.filter((f) => showNA || f.status !== 'not_applicable');
  const groups = GROUP_DEFS.map((g) => ({
    ...g,
    items: visible.filter((f) => f.group === g.key).sort((a, b) => flagRank(a) - flagRank(b)),
  })).filter((g) => g.items.length);
  if (showNA) {
    const na = fields.filter((f) => f.status === 'not_applicable');
    if (na.length) groups.push({ key: 'na', label: 'Not applicable', items: na });
  }
  return groups;
}

// The thing that actually matters for a reviewer: has a HUMAN decided this field, not whether the original
// extraction looked clean. A field can show "ok" (the fill engine had no complaint) and still need a person
// to look at it - that's the whole point of the Aadhaar-sourced group.
function decisionPill(f) {
  if (f.decision) {
    const label = { approved: 'Approved', corrected: 'Corrected', skipped: 'Skipped' }[f.decision.kind] || f.decision.kind;
    return h(`span.decision-pill.decision-${f.decision.kind}`, label);
  }
  if (f.status === 'not_applicable') return null;
  if (f.status === 'not_provided') return h('span.decision-pill.decision-not-provided', 'Not provided');
  if (f.value == null && f.group === 'aadhaar') return h('span.decision-pill.decision-missing', 'Missing');
  const required = f.group === 'aadhaar';
  return h(`span.decision-pill.decision-pending-${required ? 'required' : 'optional'}`, required ? 'Needs your approval' : 'Not reviewed');
}

function flagChip(f) {
  // not_applicable/not_provided already say so via the decision pill - no need for a second chip repeating it.
  if (f.status === 'ok' || f.status === 'not_applicable' || f.status === 'not_provided') return null;
  return h(`span.flag-chip.flag-${f.status}`, f.status.replace('_', ' '));
}

export async function renderReview(root, caseId, opts = {}) {
  let data = await api.case(caseId);
  let showNA = false;
  let selected = null;
  let src = 'original';
  let hasRegenerated = false;

  const toolbar = h('div.case-toolbar');
  const vlist = h('ul.vlist');
  const naToggle = h('button.toggle-na');
  const pagePane = h('div.col-page');
  const evidence = h('div.ev-scroll');
  const decidePanel = h('div.decide');

  clear(root,
    opts.wizardStep ? h('div.review-head', wizardHeader(opts.wizardStep)) : null,
    opts.demoDataNote ? h('div.demo-banner', 'Non-Aadhaar fields (fund/folio/share %/relationship/mobile/email/guardian details) start empty - use "Fill with sample demo data" below to load an example from demo_data.xlsx.') : null,
    toolbar,
    h('div.desk-review',
      h('div.col.col-list', vlist, naToggle),
      pagePane,
      h('div.col.col-ev', evidence, decidePanel),
    ));

  const pv = createPageView(pagePane, caseId, '', []);

  function requiredDecided() {
    const required = data.fields.filter((f) => f.group === 'aadhaar');
    const done = required.filter((f) => f.decision && f.decision.kind !== 'skipped');
    return { done: done.length, total: required.length };
  }

  // The reading a person actually wants: of everything worth reviewing, how much has a human looked at, and
  // how much of what's left is flagged - not just "ok" extraction quality, which isn't the same thing.
  function reviewStats() {
    const reviewable = data.fields.filter((f) => f.status !== 'not_applicable');
    const reviewed = reviewable.filter((f) => f.decision);
    const needCheck = reviewable.filter((f) => !f.decision && (f.status === 'needs_review' || f.status === 'low_confidence'));
    return { reviewedCount: reviewed.length, total: reviewable.length, needCheck: needCheck.length };
  }

  function renderToolbar() {
    const { reviewedCount, total, needCheck } = reviewStats();
    const pct = total ? (reviewedCount / total) * 100 : 100;
    const { done: aadhaarDone, total: aadhaarTotal } = requiredDecided();
    clear(toolbar,
      h('div.ct-title',
        h('h2', data.label),
        h('div.ct-progress',
          `${reviewedCount} of ${total} reviewed${needCheck ? `, ${needCheck} need a check` : ''}`,
          h('div.pbar', h('i', { class: pct >= 100 ? 'full' : null, style: { width: `${pct}%` } })),
        )),
      opts.onContinue
        ? h('div.ct-actions',
          opts.onFillSampleData && !opts.sampleDataLoaded
            ? h('button.btn', { onclick: doFillSampleData }, 'Fill with sample demo data')
            : opts.onFillSampleData ? h('span.small.dim', 'Sample demo data loaded') : null,
          h('button.btn.primary', {
            disabled: aadhaarDone < aadhaarTotal,
            title: aadhaarDone < aadhaarTotal ? 'Every Aadhaar-sourced field needs approval or a correction first' : '',
            onclick: () => opts.onContinue(),
          }, 'Continue to confirm →'))
        : h('div.ct-actions',
          h('div.segs',
            h('button', { 'aria-pressed': String(src === 'original'), onclick: () => switchSrc('original') }, 'Original'),
            h('button', { 'aria-pressed': String(src === 'regenerated'), onclick: () => switchSrc('regenerated'), disabled: !hasRegenerated, title: hasRegenerated ? '' : 'Regenerate first' }, 'Regenerated')),
          h('a.btn.slim', { href: api.downloadUrl(caseId, 'original'), target: '_blank' }, '⬇ Original PDF'),
          hasRegenerated ? h('a.btn.slim', { href: api.downloadUrl(caseId, 'regenerated'), target: '_blank' }, '⬇ Regenerated PDF') : null,
          h('button.btn.primary', { onclick: doRegenerate }, 'Regenerate PDF'),
        ));
  }

  function renderList() {
    const groups = groupFields(data.fields, showNA);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    naToggle.textContent = showNA ? 'Hide not-applicable fields' : `Show not-applicable fields (${data.fields.filter((f) => f.status === 'not_applicable').length})`;
    naToggle.onclick = () => { showNA = !showNA; renderList(); };

    const rows = [];
    for (const g of groups) {
      rows.push(h('li.vsec-head', h('span.vsec-name', g.label), h('span.vsec-count', String(g.items.length))));
      for (const f of g.items) {
        rows.push(h('li', h('button.vrow', {
          class: [selected && selected.field === f.field ? 'on' : null, (f.status === 'needs_review' || f.status === 'low_confidence') ? 'flagged' : null].filter(Boolean).join(' '),
          onclick: () => selectField(f),
        },
          h('span.vname', humanize(f.field)),
          h('span.vval', { title: f.value == null ? '' : String(f.group === 'tickbox' ? f.option_chosen : f.value) },
            f.value != null ? (f.group === 'tickbox' ? f.option_chosen : String(f.value)) : f.status === 'not_provided' ? 'Not provided' : '—'),
          h('span.vsub', decisionPill(f), flagChip(f)),
        )));
      }
    }
    clear(vlist, rows);
    renderToolbar();
    if (!selected && total) selectField(groups[0].items[0]);
  }

  function visibleList() {
    return groupFields(data.fields, showNA).flatMap((g) => g.items);
  }

  async function selectField(f) {
    selected = f;
    renderList();
    if (f.page && f.boxes && f.boxes.length) {
      // One highlight per actually-drawn line, not one rectangle spanning the whole multi-line block
      // (including the gaps between lines) - a loose box never lines up cleanly with wrapped text.
      const places = f.boxes.map((box, i) => ({
        source: '', page: f.page, box, tag: i === 0 ? 'read here' : undefined, label: humanize(f.field),
      }));
      await pv.show(places[0], places, [{ source: '', page: f.page }]);
    } else {
      await pv.show(null);
    }
    clear(evidence, h('div.ev',
      h('div.eyebrow', f.group === 'aadhaar' ? 'Aadhaar-sourced — needs your approval' : f.group === 'excel' ? 'Excel-sourced' : 'Tick box'),
      h('div.fieldname', humanize(f.field)),
      h('div.fieldcode.mono', `${f.field} · page ${f.page ?? '—'}${f.source_file ? ` · ${f.source_file.split(/[\\/]/).pop()}` : ''}`),
      h('div.vbig', h('b', f.value != null ? (f.group === 'tickbox' ? f.option_chosen ?? '(not ticked)' : String(f.value)) : f.status === 'not_provided' ? 'Not provided' : '(no value)')),
      f.ocr_confidence != null ? h('div.small.dim', `OCR confidence: ${f.ocr_confidence.toFixed(0)}${f.ocr_confidence < 85 ? ' (below 85 - worth a careful look)' : ''}`) : null,
      f.reason ? h(`div.why.w-${f.status === 'needs_review' ? 'low' : 'medium'}`, h('p', f.reason)) : null,
      f.rule ? h('div.small.dim', `Rule: ${f.rule}`) : null,
      f.value == null && f.group === 'aadhaar' && opts.onMissingDocument
        ? h('div.why.w-low',
          h('div.eyebrow', 'Missing'),
          h('p', 'No value was read for this field.'),
          h('button.btn', { onclick: () => opts.onMissingDocument(nomineeOf(f.field)) }, 'Upload another document'))
        : null,
    ));
    const list = visibleList();
    const index = list.findIndex((x) => x.field === f.field);
    clear(decidePanel, '');
    drawDecision(decidePanel, {
      mode: MODE,
      item: {
        id: f.field, decision: f.decision,
        originalValue: f.group === 'tickbox' ? f.option_chosen : f.value,
        valueKind: isAadhaar4Digit(f.field) ? 'aadhaar4' : null,
      },
      index, total: list.length,
      onGo: (delta) => { const i = index + delta; if (list[i]) selectField(list[i]); },
      onRecord: async (body) => {
        const res = await api.decide(caseId, body);
        f.decision = res.decision;
        renderList(); // refresh this row's decision pill + the toolbar's approved count
        return res;
      },
    });
  }

  function switchSrc(s) {
    src = s;
    setActiveSrc(s);
    renderToolbar();
    if (selected) selectField(selected);
  }

  async function doFillSampleData() {
    const btn = [...toolbar.querySelectorAll('button.btn')].find((b) => b.textContent === 'Fill with sample demo data');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      await opts.onFillSampleData();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Fill with sample demo data'; }
      clear(evidence, h('div.warn-t', String(err.message || err)));
    }
  }

  async function doRegenerate() {
    const btn = toolbar.querySelector('button.primary');
    btn.disabled = true;
    btn.textContent = 'Regenerating…';
    try {
      data = await api.regenerate(caseId);
      hasRegenerated = true;
      switchSrc('regenerated');
      renderList();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Regenerate PDF';
    }
  }

  renderList();
}
