// Structural knowledge read off this BLANK form's own text layer: which printed label sits where, whether a
// label repeats once per nominee column, and where each tick box is. Regexes match the start of a label's
// first text run on the blank form.
import path from "node:path";
import { BLANK_FORMS_DIRECTORY } from "../../config/paths-config.js";

export const CRN_BROKING_DEMAT_FORM_CONFIGURATION = {
  id: "crn-broking-demat",
  title: "CRN Broking & Demat — Nomination",
  blankFormPath: path.join(BLANK_FORMS_DIRECTORY, "Modification in Nomination in CRN Broking Demat.pdf"),
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
