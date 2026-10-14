// Hash-route helpers shared by app.js and the views. Hash routing keeps every URL the page loads relative, so the
// desk works unchanged under a path on the shared host (demo.livoassistant.com/<app>/).
export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
}

export function href(parts, query) {
  const q = query && new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  return '#/' + parts.map(encodeURIComponent).join('/') + (q ? `?${q}` : '');
}

// Update the current route's query without re-rendering (deep links for selections). push: true leaves a history
// entry, so Back walks back through selections; pushState fires no hashchange, but Back does and app.js re-renders.
export function setQuery(patch, { push = false } = {}) {
  const { parts, query } = parseHash();
  for (const [k, v] of Object.entries(patch)) (v == null || v === '') ? query.delete(k) : query.set(k, v);
  const url = href(parts, Object.fromEntries(query));
  if (url === location.hash) return;
  (push ? history.pushState : history.replaceState).call(history, null, '', url);
}
