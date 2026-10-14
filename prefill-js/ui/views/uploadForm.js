// Step 1: upload the blank nomination form, detect which one it is, and go straight to Upload documents.
// No fund-house question here any more - CAMS 360 ONE vs. HDFC only matters for demo_data.xlsx, and nothing
// from demo_data.xlsx appears until "Fill with sample demo data" is pressed on the review screen, so it's
// asked there instead, only if it's actually needed.
import { h, clear } from '../util.js';
import { api } from '../api.js';
import { wizardHeader } from './wizard.js';

export async function renderUploadForm(root) {
  const { forms } = await api.upload.supportedForms();
  let caseId = null;

  const status = h('div.small');
  const continueBtn = h('button.btn.primary', { disabled: true, onclick: () => { location.hash = `#/upload/${caseId}/documents`; } }, 'Continue →');
  const picker = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: onPick });
  const pickBtn = h('button.btn', { onclick: () => picker.click() }, 'Choose blank form (PDF)');

  async function onPick() {
    const file = picker.files[0];
    if (!file) return;
    caseId = null;
    continueBtn.disabled = true;
    clear(status, h('span.dim', 'Reading the form…'));
    try {
      const res = await api.upload.detectForm(file);
      caseId = res.caseId;
      const label = res.formType === 'crn' ? 'CRN Broking & Demat — Nomination' : 'CAMS Mutual Fund — Nomination';
      clear(status, h('span.ok-t', `Detected: ${label}`));
      continueBtn.disabled = false;
    } catch (err) {
      if (err.status === 422) {
        clear(status, h('div.warn-t', "This doesn't look like a form we support yet."),
          h('div.small.dim', { style: { marginTop: '4px' } }, 'Supported forms: ', forms.map((f) => f.label).join('; ')));
      } else if (err.status === 415) {
        clear(status, h('div.warn-t', 'Please upload the blank form as a PDF file.'));
      } else {
        clear(status, h('div.warn-t', String(err.message || err)));
      }
    }
  }

  clear(root, h('div.page', h('div.wrap',
    wizardHeader(1),
    h('h1', 'Upload the blank form'),
    h('p.lede.dim', 'Upload the blank nomination form (PDF) so we can detect which one it is. We only read its printed title, never any filled-in values - the file itself is never saved.'),
    h('div.toolbar', pickBtn, picker),
    status,
    h('div.toolbar', { style: { marginTop: '22px' } }, continueBtn),
  )));
}
