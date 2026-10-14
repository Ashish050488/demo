// Structural knowledge read off the two BLANK forms' own text layer: which printed label sits where, and
// whether a label repeats once per nominee column. None of this is a sample VALUE - it's the forms' own
// fixed template text (confirmed against the blank PDFs' text items), which is exactly what step 2 asks us to
// locate. Regexes match the start of a label's first text run on the blank form.

export const CRN_FORM = {
  id: "crn-broking-demat",
  title: "CRN Broking & Demat — Nomination",
  blank: "data/Blank Forms/Modification in Nomination in CRN Broking Demat.pdf",
  filledSamples: [
    { id: "caliber-demat", path: "data/Caliber & Demat/Modification in Nomination in CRN Broking and Demat.pdf" },
  ],
  nomineeHeaderRe: /^(1st|2nd|3rd) Nominee$/,
  labels: [
    { key: "broking_code", re: /^Broking Code/, perNominee: false, page: 1 },
    { key: "dp_id", re: /^DP ID/, perNominee: false, page: 1 },
    { key: "client_id", re: /^Client ID/, perNominee: false, page: 1 },
    { key: "crn", re: /^CRN\s*:/, perNominee: false, page: 1 },
    { key: "name", re: /^Name of the nominee/, perNominee: true, page: 1 },
    { key: "share_pct", re: /^Share of each Nominee/, perNominee: true, page: 1 },
    { key: "relationship", re: /^Relationship with Applicant/, perNominee: true, page: 1 },
    { key: "address", re: /^Address of Nominee/, perNominee: true, page: 1 },
    { key: "mobile", re: /^Mobile \/ Tel\. No\. of nominee/, perNominee: true, page: 1 },
    { key: "email", re: /^Email ID of nominee/, perNominee: true, page: 1 },
    { key: "id_aadhaar_last4", re: /^Nominee Identification details/, perNominee: true, page: 1 },
    { key: "dob", re: /^Date of Birth of nominee/, perNominee: true, page: 1 },
    { key: "guardian_name", re: /^Name of Guardian/, perNominee: false, page: 1 },
    { key: "guardian_address", re: /^10\. Address of Guardian/, perNominee: false, page: 1 },
    { key: "guardian_mobile", re: /^11\. Mobile/, perNominee: false, page: 1 },
    { key: "guardian_email", re: /^12\. Email ID of Guardian/, perNominee: false, page: 1 },
    { key: "guardian_pan", re: /^13\. Guardian/, perNominee: false, page: 1 },
    // "Sole / First Holder (Mr./Ms.)" row, page 2: the applicant's own printed name, next to where their
    // signature goes. Its value sits well below its row label (room is left for the signature above it,
    // unlike every other field on this form), hence the larger yTol.
    { key: "applicant_name", re: /^Sole \/ First Holder/, perNominee: false, page: 2, yTol: 20 },
  ],
  tickboxes: [
    {
      // w/h are the blank form's own □ glyph bounding box (extractTextItems), used to size the drawn checkmark.
      key: "wish_to_nominate", page: 1, x: 27.77, y: 139.22, w: 7.25, h: 12, perNominee: false,
      note: "single checkbox (□ glyph on the blank form); the filled sample shows a vector checkmark "
        + "drawn over it. Confirmed visually by rendering and cropping the region - the mark is NOT a text "
        + "character, so pdfjs-dist's text diff cannot see it.",
    },
    {
      // Corrected: this is ONE shared checkbox row for the whole "7. Nominee Identification details" field
      // (in the left label column, x 42-240), not repeated per nominee column - confirmed by rendering the
      // full width of that row on the filled sample: one checkmark (Aadhaar (last 4)) applies to every
      // nominee's id_aadhaar_last4 value, not three separate checkbox sets. The original position recorded
      // here previously was wrong (it had accidentally copied the guardian's row, item 13, not item 7).
      key: "nominee_id_type", page: 1, perNominee: false, w: 7.25, h: 12,
      options: ["PAN", "Passport", "Driving License", "Aadhaar (last 4)"],
      y: 508.85, optionX: { "PAN": 42.15, "Passport": 71.61, "Driving License": 114.77, "Aadhaar (last 4)": 179.5 },
      note: "vector-checkmark mechanism, confirmed visually (rendered and cropped the full row on the filled "
        + "sample): a checkmark sits over 'Aadhaar (last 4)', not over any other option.",
    },
    {
      key: "guardian_id_type", page: 1, perNominee: false, w: 7.25, h: 12,
      options: ["PAN", "Passport", "Driving License", "Aadhaar (last 4)"],
      y: 792.28, optionX: { "PAN": 42.16, "Passport": 71.62, "Driving License": 114.77, "Aadhaar (last 4)": 179.5 },
      note: "same mechanism as nominee_id_type; which option is actually marked in the sample was never "
        + "visually confirmed (unlike nominee_id_type and wish_to_nominate), and the fill step has no stated "
        + "rule for it (task step 2 only covers wish_to_nominate and the nominee ID-type), so it is left "
        + "unticked and reported as skipped, not guessed.",
    },
  ],
};

export const CAMS_FORM = {
  id: "cams-nomination",
  title: "CAMS Mutual Fund — Nomination (360 ONE / HDFC)",
  blank: "data/Blank Forms/Nomination_Form - cams.pdf",
  filledSamples: [
    { id: "360one", path: "data/Investment/MF/Nomination_Form - cams-360 ONE.pdf" },
    { id: "hdfc", path: "data/Investment/MF/Nomination_Form - cams-HDFC.pdf" },
  ],
  nomineeHeaderRe: /^Details of (1st|2nd|3rd) Nominee$/,
  labels: [
    { key: "fund_name", re: /^Name of the$/, cont: /^Fund$/, perNominee: false, page: 1 },
    { key: "folio_no", re: /^Folio No/, perNominee: false, page: 1 },
    { key: "investor_name", re: /^Investor Name/, perNominee: false, page: 1 },
    // "Name of the" also occurs as "Name of the" + "Fund" above the nominee grid; `cont` picks the right one.
    { key: "name", re: /^Name of the$/, cont: /^nominee\(s\)$/, perNominee: true, page: 1 },
    { key: "share_pct", re: /^Share of each$/, perNominee: true, page: 1 },
    { key: "dob", re: /^Date of Birth$/, perNominee: true, page: 1 },
    // "relationship" (item 4) has NO text position in either filled sample - it is only ever marked with the
    // checkbox vector-overlay described in tickboxes.relationship_option, never typed as text. Deliberately
    // left out of this text-field list; see the tickboxes entry instead.
    { key: "id_details", re: /^Nominee\/$/, perNominee: true, page: 1 },
    { key: "address", re: /^Address of$/, perNominee: true, page: 1 },
    { key: "mobile", re: /^Mobile$/, perNominee: true, page: 2 },
    { key: "email", re: /^Email ID of$/, perNominee: true, page: 2 },
    { key: "guardian_name", re: /^Nominee$/, perNominee: false, page: 2 },
  ],
  tickboxes: [
    {
      key: "relationship_option", page: 1, perNominee: true, w: 6.62, h: 11.04, // the "o" glyph's own bbox
      options: ["Spouse", "Father", "Mother", "Daughter", "Son", "Others"],
      optionY: { Spouse: 476.83, Father: 490.27, Mother: 503.71, Daughter: 517.15, Son: 530.59, Others: 544.03 },
      optionXByColumn: [177.02, 304.49, 431.95], // column 1/2/3's "o" glyph x
      note: "confirmed visually: rendered and cropped nominee 1's relationship block on the 360 ONE filled "
        + "sample - the printed 'o' glyph in front of \"Daughter\" has a hand-drawn-style checkmark vector "
        + "overlaid on it, identical text-wise (\"o\") to the unmarked options and to the blank form. The "
        + "text diff found NO difference here at all; only rendering the page as an image showed the mark. "
        + "This means positions are known (the 'o' glyph's x,y per option per column) but which option is "
        + "selected cannot be read from text alone - a future filler would need to draw the same kind of "
        + "mark, not write text.",
    },
    {
      key: "id_type", page: 1, perNominee: true, w: 8.87, h: 9.96, // the empty checkbox glyph's own bbox
      options: ["PAN", "Aadhaar (masked last 4 digits)", "Passport", "Driving License"],
      optionY: { "PAN": 585.22, "Aadhaar (masked last 4 digits)": 609.58, "Passport": 646.18, "Driving License": 670.66 },
      optionXByColumn: [177.02, 304.49, 431.95],
      note: "same checkbox pattern as relationship_option (an empty-string glyph item precedes each option "
        + "in the text layer - see labels dump). Not individually re-rendered/confirmed; marked UNSURE for "
        + "which option is ticked, by the same reasoning as CRN's guardian_id_type.",
    },
  ],
};
