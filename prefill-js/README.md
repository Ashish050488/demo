# Form Prefill

Fill nomination forms from identity documents (Aadhaar, PAN, passport, driving licence), review them, and save
to Google Sheets. OCR runs locally (PaddleOCR + Tesseract); scans are deleted once a case is saved.

## Run

```
pnpm install
pnpm dev            # backend on http://127.0.0.1:4500/api, frontend on http://127.0.0.1:3000
```

## Layout

```
apps/
  backend/src/
    api/            routes + controllers (forms, cases, settings)
    forms/          one folder per form + form-registry.js
    services/       documents, ocr, pdf, fill, forms, storage, sheets, profile
    middleware/     host check, CORS, case/form lookup, error envelope
    config/         paths and environment
  frontend/src/
    app/            pages (home, cases/new, cases/[caseId]/documents|review|confirm, forms)
    components/     ui, layouts, cases, review, forms
    api/ hooks/ types/ utils/
packages/shared/    field validation, whole-form check, field labels (used by both apps)
tools/google-apps-script/Code.gs   paste into the Google Sheet's Apps Script
data/ output/ tessdata/            local only, gitignored
```

## Adding a form

Create `apps/backend/src/forms/<form-id>/` with `form-configuration.js`, `field-positions.json`,
`field-sources.json`, `form-rules.json` and `required-fields.json`, then add one entry to `forms/form-registry.js`.
Required fields can then be changed from **Form setup** in the app.

Naming rules: see `NAMING-CONVENTIONS.md`.
