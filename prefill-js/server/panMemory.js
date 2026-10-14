// The ONLY place a full PAN number ever exists in this server - a plain in-process Map, never written to the
// manifest, demo_store.xlsx, a log line, or any file under data/debug. Cleared per-document on remove, and
// per-case on confirm and on delete, so nothing outlives the review session it was read for.
const store = new Map(); // docId -> { panNumber, name, fatherName, dob }

export function setPan(docId, fields) {
  store.set(docId, fields);
}

export function getPan(docId) {
  return store.get(docId) || null;
}

export function clearPan(docId) {
  store.delete(docId);
}
