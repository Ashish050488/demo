# Roadmap

Progress tracker. Tick a box when it's done. Items are ordered easy → hard within each section.

## Done (shown in demo 1)

- [x] Home screen: Single case / Batch
- [x] Pick the form from a list, or upload its blank PDF and it is recognised
- [x] Multi-file document upload (Aadhaar front/back, PAN, passport, driving licence), drag and drop
- [x] Local OCR (PaddleOCR + Tesseract) - no document leaves the machine
- [x] Document type detection + "Found: name, DOB, address, ID number"
- [x] Auto-assign documents to Nominee 1/2 by name (manual override)
- [x] One merged profile per nominee - same data fills any form
- [x] Auto fill: name, DOB, address split (street/city/state/pincode/country), ID number, tick boxes, today's date
- [x] Review screen: fields + filled form side by side, selected field boxed
- [x] Live preview while typing
- [x] Filters: All / Filled / Not filled yet / Must fix
- [x] Validation: PAN, Aadhaar last 4, passport, DL, mobile, email, pincode, DOB, share % (total 100), ID number vs ticked ID type
- [x] Wrong values from documents flagged in red with the reason
- [x] "View" the source document of a value
- [x] Add a document from the review screen
- [x] Corrections saved, with "Was … / Restore"
- [x] Save blocked until required fields are fixed (jump-to-field list)
- [x] Download filled PDF
- [x] Field mapping (JSON) view
- [x] Save to Google Sheet (one tab per form, one row per case)
- [x] Privacy: Aadhaar last 4 only, PAN never sent to the sheet, scans deleted after save
- [x] Form setup screen: mapped boxes on the blank form + manual **Required** switch per field
- [x] pnpm monorepo (Node/Express backend, Next.js frontend, shared package), naming conventions, one folder per form

## Next demo - easy

- [x] Reword the remaining "nothing leaves this machine" wording (data now goes to Google Sheet)
- [x] Full-width, one-screen layout: no page scrolling, only panels scroll; actions in the top bar
- [ ] Map page-2 holder / witness fields
- [x] Nominee 3 support (all 3 nominee columns; empty nominees hidden behind "+ Add nominee")
- [x] Review screen redesign: nominees side by side, compact equal-height rows, details bar above preview
- [ ] Downloadable batch template (.xlsx) generated from each form's fields

## Next demo - medium

- [ ] Batch upload: Excel / CSV / Google Sheet link, one row per user (limit ~50), rows checked before filling
- [ ] Batch progress screen: one card per user (Waiting → Filling → Done / Needs fixing), streamed as each finishes
- [ ] Batch results: open any row in the review screen, download all PDFs as ZIP, save all valid rows to the Sheet
- [ ] Disagreeing documents (e.g. different addresses): show both and let the user pick
- [ ] Tune passport / driving licence reading with real photos

## Next demo - hard

- [ ] Map the client's real 15-20 page forms
- [ ] Automatic form mapping: read fillable PDF fields, or detect printed labels and match them to profile data; check once in Form setup
- [ ] Auto-crop the card from phone photos for better OCR
- [ ] Highlight the exact spot on the document where each value was read

## Waiting on the client / decision

- [ ] Decide whether PAN numbers may be saved to the Sheet (currently never)
- [ ] Get 1-2 real blank forms (15-20 pages) from the client
- [ ] Set a new Apps Script SECRET (old one is in git history)
