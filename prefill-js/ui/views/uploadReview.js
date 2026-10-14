// Step 3: reuses the existing review screen as-is, re-running the fill first so slot changes from step 2
// (replace/remove/add a document) are reflected, then wiring in the wizard chrome, the demo-data note, the
// "missing field -> back to that nominee's slot" action, the "Fill with sample demo data" button, and the
// "continue to confirm" gate.
import { renderReview } from './review.js';
import { api } from '../api.js';

export async function renderUploadReview(root, caseId) {
  await api.upload.run(caseId);
  const status = await api.upload.status(caseId);
  await renderReview(root, caseId, {
    wizardStep: 3,
    demoDataNote: true,
    sampleDataLoaded: Boolean(status.useSampleData),
    onMissingDocument: (nominee) => { location.hash = `#/upload/${caseId}/documents/${nominee}`; },
    onContinue: () => { location.hash = `#/upload/${caseId}/confirm`; },
    onFillSampleData: async () => {
      await api.upload.fillSampleData(caseId);
      await renderUploadReview(root, caseId); // re-run the fill and redraw the whole screen with it applied
    },
  });
}
