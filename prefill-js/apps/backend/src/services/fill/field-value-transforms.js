// Small reshapes of one value so a form box gets exactly the part it asks for: "document.name|surname" puts only
// the surname in a "Family name" box. Written in field-sources.json after a "|"; no form names in code.

const nameWords = (fullName) => String(fullName).trim().split(/\s+/).filter(Boolean);

/** dd/mm/yyyy (how every reader and the sheet give dates) -> mm/dd/yyyy, as US forms ask. */
function toMonthFirstDate(value) {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(value).trim());
  return match ? `${match[2].padStart(2, "0")}/${match[1].padStart(2, "0")}/${match[3]}` : value;
}

function withoutPincode(address) {
  return String(address).replace(/[\s,-]*\b\d{6}\b[\s,]*$/, "").replace(/\b\d{6}\b/, "").replace(/\s{2,}/g, " ").replace(/[\s,]+$/, "").trim();
}

/** Splits an address into two lines at a word boundary near the middle, so each fits one printed line. */
function addressHalf(address, wantSecondHalf) {
  const words = withoutPincode(address).split(/\s+/);
  let splitIndex = words.length;
  let firstLength = 0;
  const totalLength = words.join(" ").length;
  for (let index = 0; index < words.length; index += 1) {
    firstLength += words[index].length + 1;
    if (firstLength >= totalLength / 2) { splitIndex = index + 1; break; }
  }
  const firstLine = words.slice(0, splitIndex).join(" ").replace(/,$/, "");
  const secondLine = words.slice(splitIndex).join(" ");
  return wantSecondHalf ? secondLine : firstLine;
}

/** Aadhaar addresses start with the care-of line ("S/O: RAKESH KUMAR,"): not part of a postal address on other forms. */
function withoutCareOf(address) {
  return String(address).replace(/^\s*(?:S|D|W|C)\s*\/\s*O\s*[:.-]?\s*[^,]*,\s*/i, "").replace(/\s*,(?:\s*,)+/g, ",").replace(/,(?=\S)/g, ", ").trim();
}

const TRANSFORMS = {
  withoutCareOf,
  surname: (value) => { const words = nameWords(value); return words.length > 1 ? words[words.length - 1] : words[0]; },
  givenName: (value) => nameWords(value)[0],
  middleNames: (value) => { const words = nameWords(value); return words.length > 2 ? words.slice(1, -1).join(" ") : null; },
  monthFirst: toMonthFirstDate,
  withoutPincode,
  addressLine1: (value) => addressHalf(value, false),
  addressLine2: (value) => addressHalf(value, true),
  upper: (value) => String(value).toUpperCase(),
};

/** Safe on a value typed for the box itself (they only tidy it). */
export const SHEET_SAFE_TRANSFORMS = new Set(["upper", "withoutCareOf", "withoutPincode"]);

/** "document.name|surname|upper" -> { baseSource: "document.name", transformNames: ["surname", "upper"] } */
export function splitFieldSource(fieldSource) {
  const [baseSource, ...transformNames] = String(fieldSource || "").split("|");
  return { baseSource: baseSource || null, transformNames };
}

/** Applies the transforms in order; an empty result becomes null (nothing to write). */
export function applyValueTransforms(value, transformNames) {
  let transformed = value;
  for (const transformName of transformNames) {
    if (transformed == null || transformed === "") return null;
    const transform = TRANSFORMS[transformName];
    if (!transform) throw new Error(`unknown value transform "${transformName}"`);
    transformed = transform(transformed);
  }
  return transformed == null || transformed === "" ? null : String(transformed);
}
