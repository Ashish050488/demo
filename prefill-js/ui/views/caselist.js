import { h, clear } from '../util.js';
import { api } from '../api.js';

export async function renderCaseList(root) {
  const { cases } = await api.cases();
  clear(root, h('div.page', h('div.wrap',
    h('h1', 'Pick a case'),
    h('p.lede.dim', 'Each case is one prefilled nomination form, already run through the fill engine. Review its fields, approve or correct them, then regenerate.'),
    h('div.batches', cases.map((c) => h('a.batch', { href: `#/case/${c.id}` }, h('b', c.label)))),
    h('div.toolbar', { style: { marginTop: '22px' } },
      h('a.btn.primary', { href: '#/upload' }, 'Upload a new form →'),
      h('a.btn', { href: '#/records' }, 'Saved records')),
  )));
}
