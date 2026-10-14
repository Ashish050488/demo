// Step 4: "Save to Excel" - gathers each field's effective value (a correction if one was recorded, else the
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
  const rows = data.fields.filter((f) => f.status !== 'not_applicable' && effectiveValue(f) != null);
  const resultBox = h('div');
  const saveBtn = h('button.btn.primary', 'Save to Excel');

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const fields = {};
      for (const f of rows) fields[f.field] = String(effectiveValue(f));
      await api.upload.confirm(caseId, fields);
      clear(resultBox,
        h('div.recorded', h('b', 'Saved.'), ' Your uploaded scans have been deleted.'),
        h('div.toolbar', { style: { marginTop: '14px' } },
          h('a.btn', { href: api.downloadUrl(caseId, 'original'), target: '_blank' }, '⬇ Download filled PDF'),
          h('a.btn.primary', { href: '#/upload' }, 'Start a new form'),
          h('a.btn', { href: '#/records' }, 'View saved records')));
      saveBtn.remove();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save to Excel';
      clear(resultBox, h('div.warn-t', String(err.message || err)));
    }
  });

  clear(root, h('div.page', h('div.wrap',
    wizardHeader(4),
    h('h1', 'Confirm'),
    h('p.lede.dim', `${rows.length} field${rows.length === 1 ? '' : 's'} will be saved. Aadhaar fields are stored as the last 4 digits only; PAN fields are not stored yet.`),
    h('div.flist', rows.map((f) => h('div.fcard.runcard', h('div.fname', humanizeLite(f.field))))),
    resultBox,
    h('div.toolbar', { style: { marginTop: '20px' } }, saveBtn),
  )));
}
