// Structural knowledge read off this BLANK form's own text layer: which printed label sits where, whether a
// label repeats once per nominee column, and where each tick box is. Regexes match the start of a label's
// first text run on the blank form.
import path from "node:path";
import { BLANK_FORMS_DIRECTORY } from "../../config/paths-config.js";

export const CAMS_NOMINATION_FORM_CONFIGURATION = {
  id: "cams-nomination",
  title: "CAMS Mutual Fund — Nomination (360 ONE / HDFC)",
  blankFormPath: path.join(BLANK_FORMS_DIRECTORY, "Nomination_Form - cams.pdf"),
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
    { key: "guardian_name", re: /^Nominee$/, perNominee: true, page: 2 }, // one column per nominee, like mobile/email
    { key: "first_holder_name", re: /^Sole \/ First Holder/, perNominee: false, page: 2 },
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
