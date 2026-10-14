// Thin fetch wrapper. pageview.js (copied from the kit) calls api.pageUrl(run, doc, source, page, w) - we
// have no "doc" level (one case = one document), so that argument is simply unused; which PDF ("original" or
// the freshly regenerated one) is picked by setActiveSrc(), set by the review screen.
let activeSrc = "original";
export function setActiveSrc(src) { activeSrc = src; }

async function json(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

async function postFile(url, file) {
  const form = new FormData();
  form.append("file", file);
  return json(url, { method: "POST", body: form });
}

async function postFiles(url, files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return json(url, { method: "POST", body: form });
}

export const api = {
  cases: () => json("api/cases"),
  case: (id) => json(`api/cases/${id}`),
  regenerate: (id) => json(`api/cases/${id}/regenerate`, { method: "POST" }),
  decide: (caseId, body) => json(`api/cases/${caseId}/decide`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }),
  pageUrl: (caseId, _doc, _source, page, w) => `api/cases/${caseId}/page/${page}?w=${w}&src=${activeSrc}`,
  locate: async () => null, // every field already carries its own box; pageview.js only falls back to this
  downloadUrl: (caseId, which) => `api/cases/${caseId}/download/${which}`,
  // Raw fetch, not json() - the success response is a PNG, not JSON; caller reads res.ok/blob() itself.
  preview: (caseId, field, value) => fetch(`api/cases/${caseId}/preview`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ field, value }),
  }),

  upload: {
    supportedForms: () => json("api/upload/supported-forms"),
    detectForm: (file) => postFile("api/upload/detect-form", file),
    setVariant: (caseId, variant) => json(`api/upload/${caseId}/variant`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant }),
    }),
    fillSampleData: (caseId, variant) => json(`api/upload/${caseId}/sample-data`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant }),
    }),
    uploadDocuments: (caseId, files) => postFiles(`api/upload/${caseId}/documents`, files),
    assignDocument: (caseId, docId, nominee) => json(`api/upload/${caseId}/documents/${docId}/assign`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nominee }),
    }),
    removeDocument: (caseId, docId) => json(`api/upload/${caseId}/documents/${docId}`, { method: "DELETE" }),
    status: (caseId) => json(`api/upload/${caseId}/status`),
    run: (caseId) => json(`api/upload/${caseId}/run`, { method: "POST" }),
    confirm: (caseId, fields) => json(`api/upload/${caseId}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }),
    }),
    records: () => json("api/upload/records"),
    remove: (caseId) => json(`api/upload/${caseId}`, { method: "DELETE" }),
  },
};
