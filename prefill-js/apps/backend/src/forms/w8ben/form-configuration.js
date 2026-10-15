// IRS Form W-8BEN (Rev. October 2021). The blank is the IRS form with its fill-in boxes removed, so values are
// drawn like every other form; positions come from those boxes (field-positions.json).
import path from "node:path";
import { BLANK_FORMS_DIRECTORY } from "../../config/paths-config.js";

export const W8BEN_FORM_CONFIGURATION = {
  id: "w8ben",
  title: "Form W-8BEN",
  blankFormPath: path.join(BLANK_FORMS_DIRECTORY, "Form W-8BEN.pdf"),
  nomineeHeaderRe: /(?!)/,
  labels: [],
  tickboxes: [
    {
      // "I certify that I have the capacity to sign for the person identified on line 1" - always ticked.
      key: "certify_capacity", page: 1, w: 8, h: 8, x: 110, y: 692.8, isAlwaysTicked: true,
    },
  ],
};
