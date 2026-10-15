// Gives every found box a name and a source: the printed label next to it ("Name of the Subscriber") is matched to
// a field the app already knows (subscriber_name, read from the KYC documents); the sample value's shape helps when
// the label says little (a PAN-shaped value -> the PAN). Unknown labels become their own typed (Excel) field.

// [label pattern, field key, source] - first match wins, so the specific ones come first.
const LABEL_RULES = [
  [/date of birth|birth ?date|\bd\.?o\.?b\b/, "dob", "document.dob"],
  [/surname|family name|last name/, "surname", "document.name|surname|upper"],
  [/first name|given name|forename/, "given_name", "document.name|givenName|upper"],
  [/middle name/, "middle_name", "document.name|middleNames|upper"],
  [/account (holder )?name|name of (the )?account/, "account_name", "copy.subscriber_name"],
  [/correspondent bank.*(swift|bic)/, "correspondent_swift_code", "typed"],
  [/correspondent bank.*(account|a\/c)/, "correspondent_account_number", "typed"],
  [/correspondent bank.*address/, "correspondent_bank_address", "typed"],
  [/correspondent bank/, "correspondent_bank_name", "typed"],
  [/swift|\bbic\b/, "swift_code", "typed"],
  [/ifsc/, "ifsc_code", "typed"],
  [/bank.*address|branch address/, "bank_address", "typed"],
  [/bank name|name of (the )?bank|beneficiary bank$/, "bank_name", "typed"],
  [/(account|a\/c) (number|no)/, "account_number", "typed"],
  [/further credit/, "further_credit", "typed"],
  [/e-?mail/, "email", "typed"],
  [/mobile|contact (number|no)|phone|tel(ephone)?\b/, "mobile", "typed"],
  [/\bfax\b/, "fax", "typed"],
  [/pin ?code|postal code|zip/, "pincode", "document.pincode"],
  [/citizenship/, "citizenship_country", "default.INDIA"],
  [/(tax )?reference number type|type of (tax )?(id|reference)|number type/, "tax_reference_type", "default.PAN"],
  [/\bpan\b|tax (reference|identification|identifying) (number|no)|\btin\b|tax id/, "tax_reference_number", "document.pan"],
  [/countr(y|ies) of tax|tax residen/, "tax_residence_country", "copy.residence_country"],
  [/countr(y|ies)/, "residence_country", "document.country|upper"],
  [/line 1/, "residence_address_line1", "document.address|withoutCareOf|addressLine1|upper"],
  [/line 2/, "residence_address_line2", "document.address|withoutCareOf|addressLine2|upper"],
  [/\bcity\b|\btown\b/, "city", "document.city"],
  [/\bstate\b/, "state", "document.state"],
  [/address/, "subscriber_address", "document.address|withoutCareOf|upper"],
  [/aadhaar|aadhar/, "aadhaar_last4", "document.aadhaarLast4"],
  [/relationship/, "relationship", "typed"],
  [/share|percentage/, "share_pct", "typed"],
  [/guardian/, "guardian_name", "typed"],
  [/\btitle\b|salutation/, "title", "typed"],
  [/place/, "place", "typed"],
  [/amount/, "subscription_amount", "typed"],
  [/sales charge|commission|fee/, "initial_sales_charge", "typed"],
  [/^date\b|\bdate\b(?!.*birth)|dated/, "form_date", "today"],
  [/designation|capacity/, "designation", "typed"],
  [/signatory|authori[sz]ed/, "authorised_signatory", "typed"],
  [/name|^(subscriber|applicant|investor|account holder|beneficial owner)$/, "subscriber_name", "document.name|upper"],
];

// When the label says nothing useful ("1", "Signature"), the sample value's shape decides.
const VALUE_RULES = [
  [/^[A-Z]{5}\d{4}[A-Z]$/, "tax_reference_number", "document.pan"],
  [/^PAN$/i, "tax_reference_type", "default.PAN"],
  [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email", "typed"],
  [/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/, "form_date", "today"],
  [/^\d{6}$/, "pincode", "document.pincode"],
  [/^(\+91[\s-]?)?[6-9]\d{9}$/, "mobile", "typed"],
];

/** "1.1  Name of Account Holder:" -> "Name of Account Holder". */
export function cleanLabelText(labelText) {
  return String(labelText).replace(/\s+/g, " ").replace(/^\(?(\d+(\.\d+)*|[a-z]|[ivx]+)[.)]\s+/i, "").replace(/[:*\s]+$/, "").trim();
}

const hasWords = (text) => (text.match(/[a-z]/gi) || []).length >= 3;

/** The printed text a box belongs to: the label to its left on the same row (whole row, joined), else - for a
 * table cell whose row only says "1" - the column heading above it. */
export function findPrintedLabel(box, blankItems) {
  const pageItems = blankItems.filter((blankItem) => blankItem.page === box.page && !/^_+$/.test(blankItem.text.trim()));
  const rowTolerance = Math.max(18, box.fontSize * 1.5);
  // Text that starts left of the box on its row - cut where the box starts, so "Date ___ Broking Code ___ DP ID"
  // gives each box only the words just before it.
  const leftItems = pageItems.filter((blankItem) => blankItem.x < box.x - 1 && Math.abs(blankItem.y - box.y) <= rowTolerance)
    .map((blankItem) => {
      const characterWidth = blankItem.width / Math.max(1, blankItem.text.length);
      const visibleText = blankItem.x + blankItem.width <= box.x + 2 ? blankItem.text : blankItem.text.slice(0, Math.max(0, Math.floor((box.x - blankItem.x) / characterWidth)));
      return { ...blankItem, text: visibleText };
    })
    .filter((blankItem) => /[a-z0-9]/i.test(blankItem.text)); // keep letter-by-letter fragments; judge the joined row
  if (leftItems.length) {
    // A label level with or just above the value beats one below it (the "(net of ...)" line under a label).
    const distance = (candidate) => Math.abs(candidate.y - box.y) + (candidate.y > box.y + 3 ? 6 : 0);
    const nearest = leftItems.reduce((best, candidate) => (distance(candidate) < distance(best) - 0.5 ? candidate : best));
    const rowItems = leftItems.filter((blankItem) => Math.abs(blankItem.y - nearest.y) <= 2).sort((first, second) => first.x - second.x);
    // Pieces that touch are one word ("Fam" + "i" + "ly"); a real gap is a space.
    const rowText = rowItems.map((blankItem, index) => {
      const previousItem = rowItems[index - 1];
      const isTouching = previousItem && blankItem.x - (previousItem.x + previousItem.width) < blankItem.fontSize * 0.12;
      return `${index === 0 || isTouching ? "" : " "}${blankItem.text}`;
    }).join("");
    const lastSegment = rowText.split(/_{3,}/).map((segment) => segment.trim()).filter(Boolean).pop() || "";
    const label = cleanLabelText(lastSegment);
    if (hasWords(label)) return label;
  }
  const headings = pageItems.filter((blankItem) => blankItem.y < box.y && box.y - blankItem.y <= 90 && blankItem.x < box.x + 60 && blankItem.x + blankItem.width > box.x - 20 && hasWords(blankItem.text));
  if (headings.length) {
    const lowestHeading = headings.reduce((best, candidate) => (candidate.y > best.y ? candidate : best));
    return cleanLabelText(headings.filter((blankItem) => Math.abs(blankItem.y - lowestHeading.y) <= 14 && blankItem.x < box.x + 60).map((blankItem) => blankItem.text).join(" "));
  }
  return "";
}

const toSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";

// Some PDFs print labels letter by letter ("Fam i ly N ame"): each rule is also tried with all spaces removed.
const squash = (text) => text.replace(/\s+/g, "");
const SQUASHED_RULES = LABEL_RULES.map(([pattern, key, source]) => [new RegExp(squash(pattern.source), pattern.flags), key, source]);

function matchLabelRule(lowerLabel) {
  const ruleIndex = LABEL_RULES.findIndex(([pattern]) => pattern.test(lowerLabel));
  if (ruleIndex >= 0) return LABEL_RULES[ruleIndex];
  return SQUASHED_RULES.find(([pattern]) => pattern.test(squash(lowerLabel))) || null;
}

/** The numbered heading a sub-row belongs to: "City" under "10. Address of Guardian ..." is the guardian's city.
 * Read from the label column at or above the box (up to ~130 pt); the nearest heading wins, so it never reaches
 * past another numbered row. */
export function findSectionHeading(box, blankItems) {
  const headingItems = blankItems.filter((blankItem) => blankItem.page === box.page && blankItem.y < box.y + 3 && box.y - blankItem.y <= 130
    && blankItem.x + blankItem.width < box.x - 20 && /^\s*\d{1,2}\s*[.)]\s*\S/.test(blankItem.text));
  const nearest = headingItems.reduce((best, candidate) => (!best || candidate.y > best.y ? candidate : best), null);
  return nearest ? cleanLabelText(blankItems.filter((blankItem) => blankItem.page === box.page && Math.abs(blankItem.y - nearest.y) <= 2 && blankItem.x < box.x - 20)
    .sort((first, second) => first.x - second.x).map((blankItem) => blankItem.text).join(" ")) : "";
}

// "Please tick any one of following and provide only number of same": an ID number whose type the value shows.
const ID_CHOICE_LABEL = /identification|tick any one of (the )?following/;

/** {key, source, matchedBy} for one box from its label, else its sample value, else a typed field named after the label. */
export function proposeFieldName(labelText, sampleValue, { pdfFieldTooltip = null, sectionHeading = "" } = {}) {
  const lowerLabel = [labelText, pdfFieldTooltip].filter(Boolean).join(" ").toLowerCase().trim();
  // A sub-row ("City", "Pin Code") takes "guardian" from its heading; so does an ID row under a guardian heading.
  const isGuardian = /guardian/.test(lowerLabel) || /guardian/i.test(sectionHeading);
  const firstValueLine = String(sampleValue || "").split("\n")[0].trim();
  if (ID_CHOICE_LABEL.test(lowerLabel)) {
    const idRule = /^\d{4}$/.test(firstValueLine) ? ["aadhaar_last4", "document.aadhaarLast4"]
      : /^[A-Z]{5}\d{4}[A-Z]$/.test(firstValueLine) ? ["pan", "document.pan"] : ["id_number", "typed"];
    return isGuardian ? { key: `guardian_${idRule[0]}`, source: "typed", matchedBy: "label" } : { key: idRule[0], source: idRule[1], matchedBy: "value" };
  }
  const labelRule = matchLabelRule(lowerLabel);
  // A guardian's details are typed (the documents are the client's own), under their own keys.
  if (labelRule && isGuardian && labelRule[1] !== "guardian_name") {
    return { key: `guardian_${labelRule[1].replace(/^(subscriber|residence)_/, "")}`, source: "typed", matchedBy: "label" };
  }
  // "Name of Guardian to be provided in case of minor nominee(s)" prints over two lines; the second alone is vague.
  if (!labelRule && isGuardian && /minor/.test(lowerLabel)) return { key: "guardian_name", source: "typed", matchedBy: "label" };
  if (labelRule) return { key: labelRule[1], source: labelRule[2], matchedBy: "label" };
  const firstLine = String(sampleValue || "").split("\n")[0].trim();
  const valueRule = VALUE_RULES.find(([pattern]) => pattern.test(firstLine.replace(/\s/g, firstLine.includes("@") ? "" : " ").trim()));
  if (valueRule) return { key: valueRule[1], source: valueRule[2], matchedBy: "value" };
  return { key: toSlug(labelText || "field"), source: "typed", matchedBy: "new" };
}
