// The explaining parts of a batch Excel: an example per column, where each value comes from in plain words, and a
// page-by-page map of the whole form (including what is never typed: today's date, ticks with a usual answer).
import { formatFieldLabel } from "@prefill/shared";
import { getFormDefinition } from "../../forms/form-registry.js";
import { fetchFieldPositions, fetchFieldSources } from "../forms/form-files-service.js";

const EXAMPLES = {
  client_reference: "C-001", subscription_amount: "100,000", series: "Series A", initial_sales_charge: "Nil", place: "MUMBAI",
  subscriber_name: "ASHISH RANJAN", subscriber_address: "12 MG ROAD, FORT, MUMBAI, MAHARASHTRA 400001", email: "client@example.com",
  mobile: "+91 9876543210", fax: "(leave empty if none)", bank_name: "HDFC BANK LTD", bank_address: "FORT BRANCH, MUMBAI 400001",
  swift_code: "HDFCINBBXXX", account_name: "(empty = subscriber name)", account_number: "50100123456789", further_credit: "(optional)",
  correspondent_bank_name: "CITIBANK N.A. NEW YORK", correspondent_bank_address: "388 GREENWICH ST, NEW YORK", correspondent_swift_code: "CITIUS33XXX",
  correspondent_account_number: "36012345", title: "MR. / MS. / MRS.", surname: "RANJAN", given_name: "ASHISH", middle_name: "KUMAR",
  residence_address_line1: "12 MG ROAD, FORT", residence_address_line2: "MUMBAI, MAHARASHTRA", residence_country: "INDIA", pincode: "400001",
  dob: "17/03/1990", date_of_birth_us: "03/17/1990", tax_residence_country: "INDIA", tax_reference_type: "PAN", tax_reference_number: "ABCDE1234F",
  citizenship_country: "INDIA", permanent_address: "12 MG ROAD, FORT, MUMBAI, MAHARASHTRA", city_postal_code: "400001", treaty_country: "INDIA",
  treaty_article: "NA", us_tax_status: "Not a U.S. citizen or resident", beneficial_owner: "Yes", pep_status: "No",
};

/** "From the KYC documents", "Fill in", "Usually Nil - change only if different", ... for one source. */
export function describeComesFrom(fieldSource) {
  if (!fieldSource) return "Fill in";
  if (fieldSource.startsWith("today")) return "Today's date (automatic)";
  if (fieldSource === "tick") return "Pick one (dropdown)";
  if (fieldSource.startsWith("document.")) return "KYC documents (Aadhaar / PAN / passport) - fill only if the client has none";
  if (fieldSource.startsWith("copy.")) return `Same as "${formatFieldLabel(fieldSource.slice(5))}" unless filled`;
  if (fieldSource.startsWith("default.")) return `Usually "${fieldSource.slice(8)}" - fill only if different`;
  return "Fill in";
}

export const getExample = (baseKey, options) => EXAMPLES[baseKey] ?? (/^tax_offence/.test(baseKey) ? "No" : options?.length === 1 ? "Yes (= tick it)" : options ? options[0] : "");

/** [{page, field, comesFrom, isExcelColumn}] for every value the form prints, page by page. */
export async function buildPageMapRows(formId) {
  const { formConfiguration } = getFormDefinition(formId);
  const [{ fields }, fieldSources] = await Promise.all([fetchFieldPositions(formId), fetchFieldSources(formId)]);
  const rows = [];
  const addRow = (page, fieldKey, comesFrom, note = "") => rows.push({ page, field: formatFieldLabel(fieldKey) + note, comesFrom });
  for (const field of fields) {
    const label = field.nominee ? `${field.key}_n${field.nominee}` : field.key;
    addRow(field.page, label, describeComesFrom(fieldSources[field.key]), field.nominee ? ` (nominee ${field.nominee})` : "");
    for (const repeat of field.alsoAt || []) addRow(repeat.page, label, "Printed again here", "");
  }
  for (const tickbox of formConfiguration.tickboxes) {
    const comesFrom = tickbox.isAlwaysTicked ? "Always ticked" : tickbox.defaultOption ? `Tick - usually "${tickbox.defaultOption}"` : "Tick - pick one";
    const pages = new Set([tickbox.page, ...Object.values(tickbox.boxesByOption || {}).flat().map((box) => box.page).filter(Boolean)]);
    for (const page of pages) addRow(page, tickbox.key, comesFrom, tickbox.perNominee ? " (each nominee)" : "");
  }
  const seen = new Set();
  return rows.filter((row) => { const rowKey = `${row.page}|${row.field}|${row.comesFrom}`; if (seen.has(rowKey)) return false; seen.add(rowKey); return true; })
    .sort((first, second) => first.page - second.page);
}
