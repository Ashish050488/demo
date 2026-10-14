// The step indicator shared by every upload-flow screen ("Step 2 of 5"), plus its row of step names.
import { h } from '../util.js';

export const STEP_LABELS = ['Upload form', 'Upload documents', 'Review', 'Confirm', 'Saved records'];

export function wizardHeader(current) {
  return h('div.wizard-head',
    h('div.small.dim', `Step ${current} of ${STEP_LABELS.length}: ${STEP_LABELS[current - 1]}`),
    h('nav.wizard-steps', STEP_LABELS.map((label, i) => {
      const n = i + 1;
      const cls = ['step', n === current ? 'on' : null, n > current ? 'locked' : null].filter(Boolean).join('.');
      return h(`span.${cls}`, h('span.stepn', String(n)), ` ${label}`);
    })),
  );
}
