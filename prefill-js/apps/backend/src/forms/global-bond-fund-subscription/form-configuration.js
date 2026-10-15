// 360 ONE Global Bond Fund - Series II subscription form (65 pages). The blank was made from the client's own
// filled sample by removing its flattened value layer, so every position here is where their sample wrote it.
// Tick boxes are the blank's own ☐ glyphs (x, y = glyph baseline, top-left origin; w/h = glyph box). No label
// lookup: field positions are fixed (field-positions.json).
// Every tick box is its own question with NO assumed answer: the answer comes from the client's Excel row or the
// reviewer; an unanswered one stays empty and is listed to fix.
import path from "node:path";
import { BLANK_FORMS_DIRECTORY } from "../../config/paths-config.js";

const BOX = { w: 8.58, h: 9.96 };
const YES_X = 474.82;
const NO_X = 525.0;

// Annex 7 (pages 62-63): each question is answered on its own row.
const TAX_OFFENCE_QUESTIONS = [
  ["tax_offence_1a", 62, 548.71], ["tax_offence_1b", 62, 586.15], ["tax_offence_1c", 62, 612.46], ["tax_offence_1d", 62, 649.9],
  ["tax_offence_1e", 62, 711.7], ["tax_offence_1f", 63, 120.26], ["tax_offence_1g", 63, 169.82], ["tax_offence_2a", 63, 244.7],
  ["tax_offence_2b", 63, 282.17], ["tax_offence_2c", 63, 319.49], ["tax_offence_2d", 63, 356.93], ["tax_offence_2e", 63, 406.61],
  ["tax_offence_3", 63, 492.79],
  // Part II: only for non-individual applicants (their sample leaves it empty for an individual).
  ["tax_offence_part2", 63, 657.7],
];
// Part II is answered only by a non-individual applicant.
const OPTIONAL_TAX_OFFENCE_KEYS = new Set(["tax_offence_part2"]);

export const TAX_OFFENCE_KEYS = TAX_OFFENCE_QUESTIONS.map(([key]) => key);

// Pages 32-36: FATCA / CRS self-certification for an ENTITY investor - each box is its own optional tick
// ("Ticked" or left empty). An individual's form (the client's sample) leaves all of them empty.
const ENTITY_BOXES = [
  ["entity_specified_us_person", 32, 108.02, 144.62], ["entity_us_person_not_specified", 32, 108.02, 180.14],
  ["entity_fi_singapore_or_iga", 32, 108.02, 336.65], ["entity_fi_registered_deemed_compliant", 32, 108.02, 349.97],
  ["entity_fi_participating", 32, 108.02, 363.29], ["entity_fi_sponsored", 32, 108.02, 460.87],
  ["entity_fi_trustee_documented_trust", 32, 108.02, 544.39], ["entity_fi_certified_deemed_compliant", 32, 108.02, 601.87],
  ["entity_fi_non_participating", 33, 108.02, 120.86], ["entity_exempt_beneficial_owner", 33, 90.02, 172.58],
  ["entity_active_nffe", 33, 90.02, 211.1], ["entity_passive_nffe", 33, 90.02, 350.69],
  ["entity_active_nfe_crs", 35, 108.02, 424.61], ["entity_active_nfe_regularly_traded", 35, 126.02, 469.15],
  ["entity_active_nfe_governmental", 35, 125.9, 574.75], ["entity_active_nfe_other", 35, 125.9, 603.79],
  ["entity_passive_nfe_crs", 36, 108.02, 82.44],
];
// Pages 34-35: CRS classification. These boxes are DRAWN squares (not ☐ characters), found from the page's own
// drawing instructions: x = left edge, y = top edge + 0.85 x size, so the tick sits inside the square.
const SQUARE = { w: 9.96, h: 9.96 };
const squareY = (topEdge) => Math.round((topEdge + 0.85 * 9.96) * 100) / 100;
const CRS_SINGLE_BOXES = [
  ["crs_entity_is_fi", 34, 109.1, 395.93], ["crs_reporting_fi", 34, 127.1, 443.93], ["crs_non_reporting_fi", 34, 127.1, 470.23],
  ["crs_fi_non_participating_jurisdiction", 35, 127.1, 113.78],
];
const CRS_NON_REPORTING_TYPES = [
  ["Governmental Entity", 509.83], ["International Organization", 523.15], ["Central Bank", 536.47], ["Broad Participation Retirement Fund", 549.79],
  ["Narrow Participation Retirement Fund", 563.11], ["Pension Fund of a Governmental Entity / Intl. Org. / Central Bank", 576.31],
  ["Exempt Collective Investment Vehicle", 602.71], ["Trust whose trustee reports all required information", 615.91],
  ["Qualified Credit Card Issuer", 642.32], ["Other Entity defined under domestic law", 655.42],
];
const CRS_NPJ_TYPES = [
  ["(a) Investment Entity managed by another FI", 152.3], ["(b) Other Investment Entity", 363.53], ["(c) Other Financial Institution", 376.73],
];

// Pages 58-59: Singapore tax questionnaire, Part 3 - a beneficial owner that is NOT an individual.
const SINGAPORE_ENTITY_QUESTIONS = [
  ["sg_entity_q1_tax_resident", 58, 577.51], ["sg_entity_q2", 58, 690.7], ["sg_entity_q3", 59, 168.5],
  ["sg_entity_q4", 59, 281.69], ["sg_entity_q5", 59, 356.21],
];
const SINGAPORE_YES_X = 89.42;
const SINGAPORE_NO_X = 195.77;

export const GLOBAL_BOND_FUND_SUBSCRIPTION_FORM_CONFIGURATION = {
  id: "global-bond-fund-subscription",
  title: "360 ONE Global Bond Fund - Series II - Subscription",
  blankFormPath: path.join(BLANK_FORMS_DIRECTORY, "360 ONE Global Bond Fund - Series II.pdf"),
  nomineeHeaderRe: /(?!)/,
  labels: [],
  // Where a signature goes: x, y = top-left of the space, w/h its size (points). Measured on the blank: the box
  // drawn on page 2 and 64, otherwise the space just above the printed signature line.
  signatureBoxes: [
    { page: 2, x: 330, y: 610, w: 185, h: 31, signer: "subscriber", label: "Subscriber's signature" },
    { page: 16, x: 110, y: 610, w: 130, h: 26, signer: "subscriber", label: "Signed by the subscriber" },
    { page: 17, x: 74, y: 692, w: 130, h: 26, signer: "subscriber", label: "Bank instruction signed" },
    { page: 28, x: 175, y: 578, w: 180, h: 26, signer: "subscriber", label: "Tax self-certification" },
    { page: 37, x: 168, y: 181, w: 55, h: 20, signer: "entity", label: "Entity authorised signatory 1" },
    { page: 37, x: 424, y: 181, w: 65, h: 20, signer: "entity", label: "Entity authorised signatory 2" },
    { page: 41, x: 165, y: 309, w: 190, h: 26, signer: "controlling_person", label: "Controlling person" },
    { page: 54, x: 104, y: 646, w: 140, h: 30, signer: "subscriber", label: "Accredited investor consent" },
    { page: 64, x: 62, y: 400, w: 210, h: 62, signer: "subscriber", label: "Tax offences questionnaire" },
    { page: 65, x: 56, y: 680, w: 180, h: 26, signer: "subscriber", label: "PEP self-certification" },
  ],
  tickboxes: [
    {
      key: "series", page: 2, w: 8.87, h: 9.96, options: ["Series A", "Series B"],
      boxesByOption: { "Series A": [{ x: 275.81, y: 437.33 }], "Series B": [{ x: 275.81, y: 455.57 }] },
    },
    {
      key: "us_tax_status", page: 27, ...BOX,
      options: ["U.S. citizen or resident", "Born in the U.S., citizenship given up", "Not a U.S. citizen or resident"],
      boxesByOption: {
        "U.S. citizen or resident": [{ x: 108.02, y: 551.83 }],
        "Born in the U.S., citizenship given up": [{ x: 108.02, y: 616.27 }],
        "Not a U.S. citizen or resident": [{ x: 108.02, y: 648.82 }],
      },
    },
    {
      key: "beneficial_owner", page: 57, w: 8.16, h: 9.48, options: ["Yes", "No"],
      boxesByOption: { Yes: [{ x: 82.34, y: 346.13 }], No: [{ x: 82.34, y: 362.93 }] },
    },
    {
      key: "singapore_tax_status", page: 57, w: 7.75, h: 9,
      options: ["Not tax resident in Singapore and not a citizen", "Tax resident in Singapore and/or a citizen"],
      boxesByOption: {
        "Not tax resident in Singapore and not a citizen": [{ x: 54.02, y: 600.79 }],
        "Tax resident in Singapore and/or a citizen": [{ x: 54.02, y: 672.94 }],
      },
    },
    ...TAX_OFFENCE_QUESTIONS.map(([key, page, y]) => ({
      key, page, ...BOX, isOptional: OPTIONAL_TAX_OFFENCE_KEYS.has(key), options: ["Yes", "No"], boxesByOption: { Yes: [{ x: YES_X, y }], No: [{ x: NO_X, y }] },
    })),
    // Entity / non-individual pages: optional - empty unless the Excel or reviewer answers them.
    ...ENTITY_BOXES.map(([key, page, x, y]) => ({ key, page, ...BOX, isOptional: true, options: ["Ticked"], boxesByOption: { Ticked: [{ x, y }] } })),
    ...CRS_SINGLE_BOXES.map(([key, page, x, top]) => ({ key, page, ...SQUARE, isOptional: true, options: ["Ticked"], boxesByOption: { Ticked: [{ x, y: squareY(top) }] } })),
    {
      key: "crs_non_reporting_fi_type", page: 34, ...SQUARE, isOptional: true, options: CRS_NON_REPORTING_TYPES.map(([option]) => option),
      boxesByOption: Object.fromEntries(CRS_NON_REPORTING_TYPES.map(([option, top]) => [option, [{ x: 163.1, y: squareY(top) }]])),
    },
    {
      key: "crs_npj_fi_type", page: 35, ...SQUARE, isOptional: true, options: CRS_NPJ_TYPES.map(([option]) => option),
      boxesByOption: Object.fromEntries(CRS_NPJ_TYPES.map(([option, top]) => [option, [{ x: 181.1, y: squareY(top) }]])),
    },
    {
      key: "controlling_person_us_status", page: 39, ...BOX, isOptional: true,
      options: ["U.S. citizen or resident", "Born in the U.S., citizenship given up", "Not a U.S. citizen or resident"],
      boxesByOption: {
        "U.S. citizen or resident": [{ x: 108.02, y: 140.18 }],
        "Born in the U.S., citizenship given up": [{ x: 108.02, y: 204.62 }],
        "Not a U.S. citizen or resident": [{ x: 108.02, y: 237.14 }],
      },
    },
    {
      key: "sg_entity_category", page: 58, w: 7.75, h: 9, isOptional: true,
      options: ["(a) Not tax resident in Singapore", "(b) Approved person - Section 13O / 13OA", "(c) Approved person - Section 13U",
        "(d) Approved trust - Section 13D", "(e) Designated person", "(f) None of these"],
      boxesByOption: {
        "(a) Not tax resident in Singapore": [{ x: 54.02, y: 139.34 }], "(b) Approved person - Section 13O / 13OA": [{ x: 54.02, y: 302.33 }],
        "(c) Approved person - Section 13U": [{ x: 54.02, y: 351.77 }], "(d) Approved trust - Section 13D": [{ x: 54.02, y: 401.09 }],
        "(e) Designated person": [{ x: 54.02, y: 450.55 }], "(f) None of these": [{ x: 54.02, y: 476.59 }],
      },
    },
    ...SINGAPORE_ENTITY_QUESTIONS.map(([key, page, y]) => ({
      key, page, ...BOX, isOptional: true, options: ["Yes", "No"], boxesByOption: { Yes: [{ x: SINGAPORE_YES_X, y }], No: [{ x: SINGAPORE_NO_X, y }] },
    })),
    {
      key: "pep_status", page: 65, w: 6.02, h: 9.96, options: ["Yes", "No"],
      boxesByOption: { Yes: [{ x: 54.02, y: 465.07 }], No: [{ x: 54.02, y: 489.31 }] },
    },
  ],
};
