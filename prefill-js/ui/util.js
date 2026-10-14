// Small DOM helpers shared by the views. From the CMIE desk (ui/util.js), trimmed to what the desk uses.

// h('div.cls#id', {attrs, onclick}, ...children)
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const t of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1);
  }
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs); attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el, ...kids) { el.replaceChildren(); append(el, kids); return el; }

// Figures are set in monospace so their digits line up; words (a verdict, a name) are not.
export const isFigure = (v) => v != null && /^[\s\d.,()%+\-−₹$€£]+$/.test(String(v)) && /\d/.test(String(v));

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// A band's classes: b-<band> (the kit's own three have colours) plus, for a band a domain invented, its tone.
export const bandClass = (mode, band) =>
  [`b-${band}`, mode.band_tones && mode.band_tones[band] && `tone-${mode.band_tones[band]}`].filter(Boolean).join(' ');
