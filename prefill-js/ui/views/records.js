// Step 5: "Saved records" - lists demo_store.xlsx's Cases rows (server-masked: Aadhaar already last-4 only,
// PAN never stored). Demonstrates that confirmed data landed in the Excel store - never serves the file itself.
import { h, clear } from '../util.js';
import { api } from '../api.js';
import { wizardHeader } from './wizard.js';

const SKIP_COLS = new Set(['case_id', 'form_type', 'cams_variant', 'confirmed_at']);

function humanizeCol(key) {
  const m = key.match(/^(.*)_n(\d)$/);
  return m ? `Nominee ${m[2]} — ${m[1].replace(/_/g, ' ')}` : key.replace(/_/g, ' ');
}

export async function renderRecords(root) {
  const { rows } = await api.upload.records();

  async function removeRow(caseId, cardEl) {
    await api.upload.remove(caseId);
    cardEl.remove();
  }

  const cards = rows.map((row) => {
    const cols = Object.keys(row).filter((k) => !SKIP_COLS.has(k) && row[k] !== '');
    const card = h('div.fcard.runcard');
    const deleteBtn = h('button.btn.slim', {
      onclick: () => {
        if (deleteBtn.dataset.armed) { removeRow(row.case_id, card); return; }
        deleteBtn.dataset.armed = '1';
        deleteBtn.textContent = 'Click again to confirm';
        setTimeout(() => { deleteBtn.dataset.armed = ''; deleteBtn.textContent = 'Delete'; }, 4000);
      },
    }, 'Delete');
    clear(card,
      h('div.toolbar',
        h('b', row.form_type === 'cams' ? `CAMS ${row.cams_variant === 'hdfc' ? 'HDFC' : '360 ONE'}` : 'CRN Broking & Demat'),
        h('span.small.dim', row.confirmed_at ? new Date(row.confirmed_at).toLocaleString() : ''),
        h('span.spacer'),
        deleteBtn),
      h('div.flist', { style: { marginTop: '8px' } },
        cols.map((k) => h('div.small', h('b', `${humanizeCol(k)}: `), String(row[k])))));
    return card;
  });

  clear(root, h('div.page', h('div.wrap',
    wizardHeader(5),
    h('h1', 'Saved records'),
    h('p.lede.dim', 'Every confirmed upload case, as stored in data/demo_store.xlsx. Aadhaar fields show as last 4 digits only; the Excel file itself is never served.'),
    rows.length ? h('div.flist', cards) : h('div.empty', 'Nothing saved yet.'),
  )));
}
