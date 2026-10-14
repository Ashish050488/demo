// The decision panel, pinned under the trace. Its buttons come from the domain's decision kinds (api/mode):
// extraction (right / correct it / leave it), verdict (agree / disagree with a reason / leave it) or finding
// (valid / not an issue with a reason / ask the client). A kind that
// needs a value shows a value box; one that needs a reason makes the note required. Read-only servers record
// nothing, so the buttons are replaced by one line saying so rather than offered and then refused.
import { h, clear } from '../util.js';

const GOOD = new Set(['approved', 'agreed', 'dismissed']);   // dismissed: "not an issue" is the reassuring answer
const BAD = new Set(['corrected', 'disagreed', 'valid']);

// Who decisions are recorded against: typed in the top bar, kept in this browser. A convenience, not a login.
export const reviewer = {
  get(mode) { try { return localStorage.getItem('desk.reviewer') || mode.who; } catch { return mode.who; } },
  set(name) { try { if (name) localStorage.setItem('desk.reviewer', name); } catch { /* private window */ } },
};

export function drawDecision(panel, { mode, item, index, total, onGo, onRecord }) {
  const navrow = h('div.navrow',
    h('button.btn.slim', { disabled: index <= 0, onclick: () => onGo(-1) }, '← Prev'),
    h('h3', `Review · ${index + 1} of ${total}`),
    h('button.btn.slim', { disabled: index >= total - 1, onclick: () => onGo(1) }, 'Next →'));
  if (mode.read_only) {
    clear(panel, navrow, h('div.small.dim.readonly-note', 'Preview: decisions are not recorded on this desk.'));
    return;
  }
  let choice = null;
  const isAadhaar4 = item.valueKind === 'aadhaar4';
  const val = h('input.val', isAadhaar4
    ? { id: 'decision-value', placeholder: '4 digits', hidden: true, maxlength: 4, inputmode: 'numeric', pattern: '[0-9]{4}', title: 'The last 4 digits of the Aadhaar number' }
    : { id: 'decision-value', placeholder: 'Right value', hidden: true });
  const note = h('textarea.note', { id: 'decision-note', rows: 1, placeholder: 'Note (optional)' });
  const record = h('button.btn.primary', { disabled: true, onclick: () => send() }, 'Record decision');
  const msg = h('div.small');
  const opts = mode.kinds.map((k) => h('button.opt', {
    'data-k': k.kind,
    class: GOOD.has(k.kind) ? 'good' : BAD.has(k.kind) ? 'bad' : null,
    onclick: () => {
      choice = k;
      panel.querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o.dataset.k === k.kind));
      val.hidden = k.needs !== 'value';
      note.placeholder = k.needs === 'reason' ? 'Reason (required): why it is wrong' : 'Note (optional)';
      record.disabled = false;
      (k.needs === 'value' ? val : k.needs === 'reason' ? note : record).focus();
    },
  }, h('b', k.label), h('span', k.hint)));

  async function send() {
    if (choice.needs === 'value' && isAadhaar4 && !/^\d{4}$/.test(val.value)) {
      clear(msg, h('span.warn-t', 'Aadhaar fields only accept the last 4 digits.'));
      return;
    }
    const body = { item: item.id, kind: choice.kind, note: note.value, who: reviewer.get(mode) };
    if (choice.needs === 'value') body.value = val.value;
    record.disabled = true;
    try {
      const { decision } = await onRecord(body);
      clear(msg, h('span.ok-t', `Recorded: ${decision.kind}`));
    } catch (err) {
      record.disabled = false;
      clear(msg, h('span.warn-t', String(err.message || err)));
    }
  }

  const d = item.decision;
  const label = d && (mode.kinds.find((k) => k.kind === d.kind) || {}).label;
  const correctionDisplay = d && d.kind === 'corrected' && d.value != null
    ? h('span', ' → ', h('s', item.originalValue == null ? '(no value)' : String(item.originalValue)), ' ', h('b', d.value))
    : (d && d.value != null ? ` → ${d.value}` : null);
  clear(panel, navrow,
    d ? h('div.recorded', h('b', label || d.kind), ` by ${d.who}`, correctionDisplay,
      d.note ? h('span.dim', ` · ${d.note}`) : null, h('span.dim', ` · ${new Date(d.ts).toLocaleString()}`)) : null,
    h('div.opts', opts),
    h('div.decide-row', val, note, record),
    msg);
}
