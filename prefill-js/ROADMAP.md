# Roadmap — 360 ONE Form Prefill

How to read this file: each item has a **headline** (what it is, in one line) and a **detail block** (what
exactly to build, how it should behave, and where it goes in the code). Items are ordered **easiest first**.
Tick `[x]` when done. A new chat can pick up any item from its detail block alone.

The next-phase items come from the demo call with the 360 ONE team (client side: Jyoti, Bobby, Kangana, Karan;
our side: Ashish, Tushar). Their words are quoted where they matter.

---

## What the client asked for (summary of the call)

1. **Bulk filling.** "Your team member is working on 50 forms per day." Each client has a folder of KYC
   documents (on OneDrive / SharePoint), plus **one master Excel with one row per client**. The app fills every
   form in one go.
2. **Next demo:** two form types and **15–20 client records** in one Excel, all filled together.
3. **Excel for the fields documents can't fill.** Fields OCR can't read (folio, fund name, share %, mobile, …)
   come from an Excel instead of being typed: "the 31 fields then become your input sheet".
4. **Long "global" forms:** 15–20 pages; some are 60–65 pages, of which only 6–7 need filling. They will send blanks.
5. **Read a filled, signed form back** into their system: "this filled form, if I get signed back from the
   client, your system can fill it back into the system if I give you an API access".
6. **Client master integration:** pull existing client data from their systems (Caliber, Salesforce) instead of
   asking for it again.
7. Their team can **set mandatory fields themselves**. Already built: Form setup.
8. When documents for **two different people** are uploaded, assign them to Nominee 1 / Nominee 2 automatically.
   Already built (name matching); make it clearer on screen (item 3).
9. A **short demo on Friday** for their global / onboarding team.

---

## Done (demo 1)

- [x] **Single case flow:** pick or upload the form → upload documents → review → save.
- [x] **Local OCR** of Aadhaar (front/back), PAN, passport and driving licence. No document is sent to a cloud
      service for reading.
- [x] **Auto-assign documents to nominees by name**, with a manual "Belongs to Nominee N" override.
- [x] **One profile per nominee**, merged from all their documents; the same profile fills any form.
- [x] **Review screen**:
      - section sidebar, one section at a time, nominee tabs
      - Focus / Whole page preview; trackpad pinch-zoom on the preview only
      - "view the document" a value came from; edit with live preview
- [x] **Validation:** PAN, Aadhaar last 4, passport, DL, mobile, email, pincode, DOB, share % (total 100), and
      the ID number against the ticked ID type. Saving is blocked until everything is fixed.
- [x] **Required fields panel:** every mandatory field, filled or not, and fillable right in the panel.
- [x] **Form setup:** mapped boxes drawn on the blank form, plus a Required switch per field (the client can do
      this themselves).
- [x] **Save to Google Sheet** (one tab per form). Aadhaar saved as last 4 only, PAN never sent, scans deleted
      after save.
- [x] **Nominee 3**, 360 ONE branding (Hanken Grotesk, black / orange `#fd7740`), one-screen layout.
- [x] **Monorepo:** `apps/backend` (Express), `apps/frontend` (Next.js), `packages/shared` (validation, labels).

---

## Next demo — EASY

### [x] 1. Excel template download per form
**Headline:** a button that downloads an `.xlsx` with one column for each field documents can't fill.
**Detail:**
- Backend: `GET /api/forms/:formId/batch-template` builds the xlsx from `field-sources.json`, using every field
  whose source is `typed`, plus `tick` fields as text columns that list the allowed options.
  - Uses the `xlsx` package, which needs re-adding to the backend.
  - Per-nominee fields become `name_n1, name_n2, …`, up to `supportedNomineeCount`.
- Layout:
  - Row 1: readable headings, from `packages/shared/src/field-labels.js`.
  - Row 2: field keys, so import is exact.
  - Column A: `client_reference` (their client code / folder name).
- A second sheet, "How to fill", gives the rule for each column (`RULE_TEXT` in shared validation).
- Frontend: a download button on Form setup and on the Batch screen.
- **Built:**
  - `services/batch/batch-columns-helpers.js` (column list, reused by the import) and
    `services/batch/batch-template-service.js` (workbook, using `exceljs` instead of `xlsx`, which has open
    security issues).
  - Routes: `GET /api/forms/:formId/batch-template` and `/batch-columns`.
  - Buttons on Form setup (list and detail).
  - Required columns are black, typed columns orange, and document-readable columns grey ("optional when a
    document is attached").
  - Tick-box columns have Excel dropdowns. Every column is formatted as text, so dates and pincodes stay as typed.
  - "Wish to nominate" and other rule-only ticks are left out.
  - CRN and CAMS: 53 columns each (3 nominees each, plus Client reference).

### [x] 2. Upload an Excel for ONE case (fills the fields documents can't)
**Headline:** a "Fill from Excel" button on the review screen loads this case's typed fields from a sheet row.
**Detail:**
- Uses the template from item 1. Upload an xlsx/csv and pick the row (or use the only row).
- Values go into the case's `typedValues` with source "batch sheet". `case-store-service.js` and
  `field-value-reader.js` already support this.
- Matching columns to fields (the client asked whether headings must match the form exactly):
  - First by field key.
  - Then by a forgiving label match: lowercase, no spaces or punctuation, plus a synonyms list
    (e.g. "Name of the fund" = `fund_name`).
- Every imported value goes through the same validation; bad values show red like any other field.
- Refill the case after import (`POST /api/cases/:caseId/fill`).
- **Privacy:** `typedValues` is saved to `manifest.json` on disk. PAN columns (`id_pan_n*`, `guardian_pan`,
  or any value shaped like a PAN) must be kept **in memory only** (`identity-number-memory-service.js`), the same
  as PAN read from a card. Never write them to disk.
- **Built:**
  - A "Fill from Excel" button in the review sidebar opens a dialog: choose file → pick the row if there are
    several clients → report.
  - Backend: `POST /api/cases/:caseId/sheet-import` (multipart `file` + optional `rowNumber`).
  - Services in `services/batch/`: `read-sheet-file-service.js`, `cell-value-helpers.js`,
    `column-matching-helpers.js`, `sheet-row-values-service.js`, `import-case-sheet-service.js`. Item 5 reuses them.
- **Edge cases handled (all checked against a throwaway case):**
  - Files: `.xls`, password-protected, damaged, fake extension, PDF, over 5 MB, more than 1000 rows, headings
    with no rows; CSV with `;` separators, a BOM, or a separator inside quotes; hidden sheets (uses the
    "Clients" sheet, else the first visible sheet with data).
  - Headings: our row-2 keys, or the client's own headings (synonyms, "Nominee 2 - Name", "2nd nominee mobile",
    "mobile_n2"). Unknown and duplicate columns are reported. The other form's template is rejected.
  - Values:
    - Numbers become full digit strings (no 9.87E+09, no lost digits).
    - Excel dates and 2004-03-17 / 17-3-2004 become DD/MM/YYYY.
    - 50% stored as 0.5 becomes 50.
    - Formula errors, rich text and hyperlinks are cleaned; extra spaces are trimmed.
    - Option text is matched ("pan card" → PAN, "aadhar" → Aadhaar (last 4), "wife"/"husband" → Spouse, "dl" →
      Driving License); no match → reported, left unticked.
    - When the form prints "Others" plus an "if Others" line (CAMS relationship), an unlisted word ("Brother")
      ticks Others and is written on that line, and the report says so.
  - A sheet made for the other form is refused with the form's name, e.g. a CRN sheet on a CAMS case: "This looks
    like the template for a different form (it has broking_code, dp_id, client_id…)".
  - Privacy: a full 12-digit Aadhaar is cut to the last 4 before storing. PAN stays in memory only (checked: not
    in manifest.json) and is wiped on save and on delete.
  - Conflicts: a document's value wins over the sheet (the difference is listed); the reviewer's corrections win
    (listed). A new import replaces the previous sheet values, so nothing stale is left.
  - If the sheet gives an ID number but no ID type, the ID type follows that number.
  - A case that is already saved (sent to the Google Sheet, scans deleted) refuses an import (409 CASE_ALREADY_SAVED),
    so the case and its Sheet row can't silently disagree.
  - Wrong values are still filled but shown red, with the reason.
- **Two older bugs found and fixed while testing:**
  - `check-form.js` had lost the backslashes in three regexes during the restructure, so wrong values in
    nominee fields were never flagged and the share-total check never ran.
  - The masked Aadhaar display ("XXXX XXXX 1234") failed its own check, so a case using Aadhaar as its ID could
    never be saved.
- **Not tested yet:** "document wins" and "kept corrections" with real uploaded documents. The logic is in place;
  it needs a case that has both documents and a sheet.

### [x] 3. Show auto-assignment clearly on the documents screen
**Headline:** group uploaded documents by person, e.g. "Ashish Ranjan — 3 documents → Nominee 1".
**Detail:**
- The matching already exists (`assign-document-service.js`).
- Show the cards grouped by nominee, with the detected name as each group's title.
- Add a one-click "Swap Nominee 1 ↔ 2".
- This answers Jyoti's question: "I want to make Japhia nominee one and Tushar nominee two".

### [x] 4. Map page-2 holder / witness fields
**Headline:** fill the remaining unmapped boxes on the CRN/CAMS forms (holder names, witness).
**Detail:**
- Add positions to `forms/<form-id>/field-positions.json`, sources to `field-sources.json`, and sections to
  `form-rules.json`.
- Check on Form setup that every box sits on its printed line.

---

## Next demo — MEDIUM

### [x] 5. Batch upload: one Excel, many clients (THE main ask)
**Headline:** upload a master Excel (15–50 rows) plus each client's documents → one filled form per row.
**Detail:**
- New "Batch" entry on Home (the card is already there, marked "Next step").
- Steps:
  1. Choose the form (or several forms; see item 7).
  2. Upload the master Excel (template from item 1).
  3. Attach documents: a ZIP with one folder per `client_reference`, or drag in several folders.
- Backend: add `batches` to the case store.
  - `POST /api/batches` creates a batch.
  - Each row creates a case with `batchId`, `typedValues` = that row, and documents = that client's folder.
  - Limit about 50 rows; the client agreed to restrict it for accuracy.
- Process cases in the background, 2–3 at a time (OCR is CPU-heavy).
- Validate rows before filling. A row with problems is still filled, but marked "Needs fixing".

### [x] 6. Batch progress screen (live, as each form finishes)
**Headline:** one card per client: Waiting → Reading documents → Filling → Done / Needs fixing.
**Detail:**
- Server-Sent Events (`GET /api/batches/:batchId/events`) push each case's status as it changes; no reload.
- Each card shows the client name, form, filled count and problem count.
- Clicking a card opens the normal review screen for that case; the back button returns to the batch.
- Filters: All / Done / Needs fixing.
- Bulk actions: "Download all PDFs (ZIP)" and "Save all valid to Sheet".

### [x] 7. Two forms from one Excel
**Headline:** one client row fills both the CRN Broking & Demat and CAMS forms.
**Detail:**
- The batch picks several forms, and each row creates one case per form.
- Columns both forms share (name, address, nominee details) are entered once: the template from item 1 merges
  field keys across forms.
- This is the "two different set of forms with 15 or 20 client records" the client wants to see next.

### [ ] 8. Read documents from a OneDrive / SharePoint folder
**Headline:** point the batch at a shared folder instead of uploading files.
**Detail:**
- Uses the Microsoft Graph API: an app registration on their tenant, with read-only `Files.Read.All` on one
  site or folder.
- Folder layout to agree with them: `<root>/<client_reference>/*.pdf|jpg` plus `<root>/client-master.xlsx`.
- Needs their IT approval; ask early.
- Files are copied locally for OCR and deleted after save, like uploads.

### [ ] 9. Handle documents that disagree
**Headline:** when Aadhaar and passport show a different address or name, show both and let the reviewer pick.
**Detail:**
- `build-nominee-profile-service.js` keeps all candidates per key; today it keeps only the best.
- Expose the candidates in the fields view.
- The review cell shows a small "2 values found" chooser.

### [ ] 10. Tune passport / driving licence reading on real photos
**Headline:** test and fix extraction using real sample photos.
**Detail:**
- `passport-and-licence-extract-service.js` has only been tested on synthetic text.
- Ask the client for 2–3 real samples of each (masked is fine).

---

## Next demo — HARD

### [ ] 11. Long global forms (15–20 pages; some 60–65 pages with 6–7 to fill)
**Headline:** support the client's real multi-page forms.
**Detail:**
- They will send the blank forms. Only pages that need filling get mapped; other pages pass through untouched.
- Review sections per page group go in `form-rules.json` (`reviewSections`). The review screen already scales:
  one section at a time, with counts in the sidebar.
- Preview: the page switcher follows the selected field (already page-aware).
- Show it in a 15–20 minute call with their global / onboarding team (Friday, per the call).

### [ ] 12. Automatic form mapping (a new form in minutes, not days)
**Headline:** upload a blank form → the app proposes every box and its data source → a person checks it once.
**Detail:**
- If the PDF has fillable (AcroForm) fields, read their names and positions directly.
- Otherwise:
  1. Read the printed labels from the PDF text layer (`pdf-text-service.js`, `form-layout-helpers.js`).
  2. Find the blank space next to each label.
  3. Match the label to a profile key using a synonyms list ("Name of the nominee", "Nominee name" → `name`).
- The output is the same JSON files a hand-made form uses. Review it on Form setup: drag a box, change its
  source, flip Required.
- This is what the client heard as "the system realised it from the form".

### [ ] 13. Read a filled, signed form back (the reverse direction)
**Headline:** scan of a completed, signed form → extract every field → send it to their system.
**Detail:**
- We already know every box position per form (`field-positions.json`).
- Align the scan to the blank form first (detect page corners or printed labels, then warp), then OCR each
  box's region.
- Tick boxes: check the ink density inside each option box.
- Output: JSON per form, delivered via their API (item 14).
- Flag low-confidence boxes for review on the same review screen.

### [ ] 14. Client master integration (Caliber / Salesforce)
**Headline:** pull existing client data by client code instead of asking for it again.
**Detail:**
- Backend connector per system, in `services/integrations/<system>-service.js`, with
  `fetchClientByCode(clientCode)` returning `typedValues`.
- Needs their API access and a field mapping.
- The same connector can push results back (item 13).

### [ ] 15. Auto-crop cards in phone photos + highlight where each value was read
**Headline:** better OCR on phone photos, and show the exact spot on the document each value came from.
**Detail:**
- Detect the card rectangle (edge / contour detection on the canvas image), then crop and deskew before OCR.
- Keep the OCR line box of each extracted value, and draw it on the "view document" popup.

---

## Open decisions / waiting on the client

- [ ] **Blank global forms** (15–20 pages): Karan / Jyoti to send.
- [ ] **Sample client master Excel** with 15–20 records (masked) for the batch demo.
- [ ] **Where client data lives** (OneDrive / SharePoint path, Caliber / Salesforce API) and who approves access.
- [ ] **PAN in the Sheet:** today PAN is never saved; confirm whether it may be.
- [ ] **New Apps Script SECRET** (the old one is in git history).
- [ ] **Friday call** with their global / onboarding team (15–20 minutes).
