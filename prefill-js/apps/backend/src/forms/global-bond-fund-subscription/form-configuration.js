// 360 ONE Global Bond Fund - Series II subscription form (65 pages). The blank was made from the client's own
// filled sample by removing its flattened value layer, so every position here is where their sample wrote it.
// Tick boxes are the blank's own ☐ glyphs (x, y = glyph baseline, top-left origin; w/h = glyph box). No label
// lookup: field positions are fixed (field-positions.json).
import path from "node:path";
import { BLANK_FORMS_DIRECTORY } from "../../config/paths-config.js";

const BOX = { w: 8.58, h: 9.96 };
const TAX_OFFENCE_ROWS = [
  [62, 548.71], [62, 586.15], [62, 612.46], [62, 649.9], [62, 711.7],
  [63, 120.26], [63, 169.82], [63, 244.7], [63, 282.17], [63, 319.49], [63, 356.93], [63, 406.61], [63, 492.79],
];

export const GLOBAL_BOND_FUND_SUBSCRIPTION_FORM_CONFIGURATION = {
  id: "global-bond-fund-subscription",
  title: "360 ONE Global Bond Fund - Series II - Subscription",
  blankFormPath: path.join(BLANK_FORMS_DIRECTORY, "360 ONE Global Bond Fund - Series II.pdf"),
  nomineeHeaderRe: /(?!)/,
  labels: [],
  // defaultOption: what most clients answer; the Excel or the reviewer can pick another option.
  tickboxes: [
    {
      key: "series", page: 2, w: 8.87, h: 9.96, options: ["Series A", "Series B"], defaultOption: "Series A",
      boxesByOption: { "Series A": [{ x: 275.81, y: 437.33 }], "Series B": [{ x: 275.81, y: 455.57 }] },
    },
    {
      key: "us_tax_status", page: 27, ...BOX, defaultOption: "Not a U.S. citizen or resident",
      options: ["U.S. citizen or resident", "Born in the U.S., citizenship given up", "Not a U.S. citizen or resident"],
      boxesByOption: {
        "U.S. citizen or resident": [{ x: 108.02, y: 551.83 }],
        "Born in the U.S., citizenship given up": [{ x: 108.02, y: 616.27 }],
        "Not a U.S. citizen or resident": [{ x: 108.02, y: 648.82 }],
      },
    },
    {
      key: "beneficial_owner", page: 57, w: 8.16, h: 9.48, options: ["Yes", "No"], defaultOption: "Yes",
      boxesByOption: { Yes: [{ x: 82.34, y: 346.13 }], No: [{ x: 82.34, y: 362.93 }] },
    },
    {
      key: "singapore_tax_status", page: 57, w: 7.75, h: 9, defaultOption: "Not tax resident in Singapore and not a citizen",
      options: ["Not tax resident in Singapore and not a citizen", "Tax resident in Singapore and/or a citizen"],
      boxesByOption: {
        "Not tax resident in Singapore and not a citizen": [{ x: 54.02, y: 600.79 }],
        "Tax resident in Singapore and/or a citizen": [{ x: 54.02, y: 672.94 }],
      },
    },
    {
      // Annex 7, Part I: one answer ticked on all 13 questions (a "Yes" needs details on a separate sheet anyway).
      key: "tax_offences", page: 62, ...BOX, options: ["No", "Yes"], defaultOption: "No",
      boxesByOption: {
        No: TAX_OFFENCE_ROWS.map(([page, y]) => ({ page, x: 525.0, y })),
        Yes: TAX_OFFENCE_ROWS.map(([page, y]) => ({ page, x: 474.82, y })),
      },
    },
    {
      key: "pep_status", page: 65, w: 6.02, h: 9.96, options: ["No", "Yes"], defaultOption: "No",
      boxesByOption: { Yes: [{ x: 54.02, y: 465.07 }], No: [{ x: 54.02, y: 489.31 }] },
    },
  ],
};
