// Step 2: one upload area (button + drag-and-drop), multiple files at once, up to 10 per case, 15MB each.
// Each file is listed as it's read: name, state, detected type, a "Belongs to: Nominee N" dropdown
// (manual for now - automatic grouping is a later slice), and Remove. The document itself is never shown.
import { h, clear } from '../util.js';
import { api } from '../api.js';
import { wizardHeader } from './wizard.js';

const DOC_TYPE_LABELS = {
  aadhaar_full: 'Aadhaar (full)', aadhaar_front: 'Aadhaar front', aadhaar_back: 'Aadhaar back',
  pan: 'PAN card', passport: 'Passport', driving_licence: 'Driving licence', unrecognized: 'Not recognised',
};

export async function renderUploadDocs(root, caseId, focusNominee) {
  let data = await api.upload.status(caseId);
  const errorBox = h('div.small');
  const listEl = h('div.doclist');
  const continueBtn = h('button.btn.primary', 'Continue →');
  const dropZone = h('div.dropzone');
  const input = h('input', {
    type: 'file', accept: '.pdf,.jpg,.jpeg,.png', multiple: true, hidden: true,
    onchange: () => { if (input.files.length) handleFiles([...input.files]); input.value = ''; },
  });

  const canContinue = () => data.documents.some((d) => d.status === 'done');
  const updateContinue = () => { continueBtn.disabled = !canContinue(); };

  async function refreshStatus() { data = await api.upload.status(caseId); renderList(); updateContinue(); }

  async function pollUntilSettled(docId) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      data = await api.upload.status(caseId);
      const doc = data.documents.find((d) => d.id === docId);
      if (!doc || doc.status !== 'processing') break;
      renderList();
    }
    renderList();
    updateContinue();
  }

  async function handleFiles(files) {
    clear(errorBox, '');
    if (files.length > 10) {
      clear(errorBox, h('div.warn-t', 'Select at most 10 files at a time.'));
      files = files.slice(0, 10);
    }
    let res;
    try {
      res = await api.upload.uploadDocuments(caseId, files);
    } catch (err) {
      clear(errorBox, h('div.warn-t', String(err.message || err)));
      return;
    }
    const rejected = res.results.filter((r) => !r.accepted);
    if (rejected.length) {
      clear(errorBox, ...rejected.map((r) => h('div.warn-t', `${r.filename}: ${r.reason}`)));
    }
    data = await api.upload.status(caseId);
    renderList();
    for (const r of res.results.filter((x) => x.accepted)) pollUntilSettled(r.docId);
  }

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) handleFiles(files);
  });
  clear(dropZone, h('p', 'Drag files here, or'), h('button.btn', { onclick: () => input.click() }, 'Select files'),
    h('p.small.dim', 'PDF, JPG, or PNG. Up to 10 files, 15MB each.'), input);

  async function removeDoc(docId) {
    await api.upload.removeDocument(caseId, docId);
    await refreshStatus();
  }

  async function assignDoc(docId, nominee) {
    await api.upload.assignDocument(caseId, docId, Number(nominee));
    await refreshStatus();
  }

  function statusLabel(doc) {
    if (doc.status === 'processing') return h('span.fstat', 'Reading…');
    if (doc.status === 'done') return h('span.fstat.ok-t', 'Read');
    if (doc.status === 'unrecognized') return h('span.fstat.warn-t', doc.message || 'Not recognised');
    return h('span.fstat.warn-t', doc.message || 'Problem reading this file');
  }

  function renderList() {
    const rows = data.documents.map((doc) => {
      const row = h('div.fcard', { id: `doc-${doc.id}` });
      const select = h('select.nominee-select', {
        onchange: (e) => assignDoc(doc.id, e.target.value),
      }, [1, 2, 3].map((n) => h('option', { value: String(n), selected: n === doc.assignedNominee }, `Belongs to: Nominee ${n}`)));
      clear(row,
        h('div.fname', doc.originalName),
        h('div.fright',
          statusLabel(doc),
          h('span.small.dim', doc.docType ? DOC_TYPE_LABELS[doc.docType] : '—'),
          // A QR in a phone photo is usually too small to decode - only mention it when it actually was read.
          doc.qrFound ? h('span.small.dim', 'QR code read') : null),
        h('div.fread', doc.status === 'done'
          ? (doc.read && doc.read.length
            ? [h('span.small.dim', 'Found: '), ...doc.read.map((r) => h('span.rchip', r))]
            : h('span.small.warn-t', 'Nothing readable found - try a sharper, closer photo'))
          : null,
        doc.assignedBy ? h('div.small.dim', `Auto-assigned: ${doc.assignedBy}`) : null),
        h('div.fassign', select),
        h('button.btn.slim', { onclick: () => removeDoc(doc.id) }, 'Remove'));
      return row;
    });
    clear(listEl, rows.length ? rows : h('div.empty', 'No documents uploaded yet.'));
  }

  continueBtn.addEventListener('click', async () => {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Preparing review…';
    try {
      await api.upload.run(caseId);
      location.hash = `#/upload/${caseId}/review`;
    } catch (err) {
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue →';
      clear(errorBox, h('div.warn-t', String(err.message || err)));
    }
  });

  clear(root, h('div.page', h('div.wrap',
    wizardHeader(2, caseId),
    h('h1', 'Upload documents'),
    h('p.lede.dim', 'Drop every document you have - Aadhaar (front and back), PAN card, passport, driving licence - for each nominee. Each one is read, matched to a nominee by name, and used to fill the form. The documents themselves are never shown.'),
    dropZone, errorBox, listEl,
    h('div.toolbar', { style: { marginTop: '22px' } }, continueBtn),
  )));
  renderList();
  updateContinue();

  if (focusNominee) {
    const match = data.documents.find((d) => String(d.assignedNominee) === String(focusNominee));
    if (match) document.getElementById(`doc-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
