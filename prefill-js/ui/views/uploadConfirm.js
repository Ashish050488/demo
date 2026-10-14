// Step 4: "Save to Google Sheet" - gathers each field's effective value (a correction if one was recorded, else the
// original extraction/demo-data value), posts it to the confirm route, and shows the result. Confirming also
// deletes that case's uploaded scans server-side - this screen just reports that back.
import { h, clear } from '../util.js';
import { api } from '../api.js';
import { wizardHeader } from './wizard.js';

function effectiveValue(f) {
  if (f.decision && f.decision.kind === 'corrected' && f.decision.value != null && f.decision.value !== '') return f.decision.value;
  return f.group === 'tickbox' ? f.option_chosen : f.value;
}

function humanizeLite(key) {
  const m = key.match(/^(.*)_n(\d)$/);
  return m ? `Nominee ${m[2]} — ${m[1].replace(/_/g, ' ')}` : key.replace(/_/g, ' ');
}

export async function renderUploadConfirm(root, caseId) {
  const data = await api.case(caseId);
  const rows = data.fields.filter((f) => f.status !== 'not_applicable' && effectiveValue(f) != null && effectiveValue(f) !== '');
  const isPan = (f) => /pan/i.test(f.field) || /^[A-Z]{5}\d{4}[A-Z]$/.test(String(effectiveValue(f)).toUpperCase());
  const empty = data.fields.filter((f) => !/_n3$/.test(f.field) && f.status !== 'not_applicable' && (effectiveValue(f) == null || effectiveValue(f) === ''));
  const resultBox = h('div');
  const saveBtn = h('button.btn.primary', 'Save to Google Sheet');
  const sheetBox = h('div.sheetbox');
  let sheet = await fetch('api/upload/sheets/settings').then((r) => r.json());
  const status = await api.upload.status(caseId);
  const cols = (await fetch(`api/upload/sheets/columns/${status.formType}`).then((r) => r.json())).columns || [];
  const colLabel = Object.fromEntries(cols.map((c) => [c.key, c.label]));

  function renderSheetBox() {
    saveBtn.disabled = !sheet.connected;
    if (sheet.connected) {
      clear(sheetBox, h('div', h('span.ok-t', '✓ Google Sheet connected '),
        h('button.btn.slim', { onclick: () => { sheet = { connected: false, url: sheet.url }; renderSheetBox(); } }, 'Change')));
      return;
    }
    const url = h('input.lval-input', { placeholder: 'https://script.google.com/macros/s/.../exec', value: sheet.url || '' });
    const secret = h('input.lval-input', { placeholder: 'The SECRET text from the script', type: 'password' });
    const msg = h('div.small');
    clear(sheetBox,
      h('b', 'Connect your Google Sheet (one time)'),
      h('ol.small',
        h('li', 'Open the Google Sheet, then Extensions > Apps Script.'),
        h('li', 'Replace everything with the code in prefill-js/apps-script/Code.gs, change SECRET to any long text, and Save.'),
        h('li', 'Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy, and allow access.'),
        h('li', 'Paste the Web app URL and your SECRET here.')),
      url, secret,
      h('button.btn.primary', { onclick: async () => {
        clear(msg, 'Testing...');
        const r = await fetch('api/upload/sheets/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.value.trim(), secret: secret.value }) });
        const j = await r.json();
        if (!r.ok) { clear(msg, h('span.warn-t', j.error)); return; }
        sheet = { connected: true, url: url.value.trim() };
        renderSheetBox();
      } }, 'Test & connect'), msg);
  }
  renderSheetBox();

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const fields = {};
      for (const f of rows) fields[f.field] = String(effectiveValue(f));
      await api.regenerate(caseId).catch(() => {}); // PDF with every edit, before the scans go
      const res = await api.upload.confirm(caseId, fields);
      clear(resultBox,
        h('div.recorded', h('b', `Saved ${res.savedFields} fields`), ' to ', h('code', res.file), '. Your uploaded scans have been deleted.'),
        res.notStored && res.notStored.length
          ? h('div.small.dim', `Not stored (privacy rule - PAN numbers are never sent to the sheet): ${res.notStored.map(humanizeLite).join(', ')}`) : null,
        res.rejected && res.rejected.length
          ? h('div.warn-t', `Not saved because the value looked wrong: ${res.rejected.map((x) => `${humanizeLite(x.field)} (${x.reason})`).join(', ')}`) : null,
        h('div.toolbar', { style: { marginTop: '14px' } },
          h('a.btn', { href: api.downloadUrl(caseId, 'regenerated'), target: '_blank' }, '⬇ Download filled PDF'),
          h('a.btn.primary', { href: '#/upload' }, 'Start a new form'),
          h('a.btn', { href: '#/records' }, 'View saved records')));
      saveBtn.remove();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Google Sheet';
      clear(resultBox, h('div.warn-t', String(err.message || err)));
    }
  });

  clear(root, h('div.page', h('div.wrap',
    wizardHeader(4, caseId),
    h('h1', 'Confirm'),
    h('p.lede.dim', `${rows.filter((f) => !isPan(f)).length} fields will be saved to the Google Sheet - one tab per form, one row per case, each value in its own column (below: column → value). Aadhaar is stored as the last 4 digits only.`),
    sheetBox,
    h('div.flist', rows.map((f) => h('div.fcard.runcard', h('div.fname', colLabel[f.field] || humanizeLite(f.field)),
      isPan(f) ? h('span.small.dim', 'PAN - not stored') : h('span.small', String(effectiveValue(f)).slice(0, 60))))),
    empty.length ? h('p.small.dim', `Empty, so not saved: ${empty.map((f) => humanizeLite(f.field)).join(', ')}`) : null,
    resultBox,
    h('div.toolbar', { style: { marginTop: '20px' } },
      h('a.btn', { href: `#/upload/${caseId}/review` }, '← Back to review'), saveBtn),
  )));
}
