// Plain-language label for every form field key, shared by the review screen and the Google Sheet headings.
export const FIELD_LABELS = {
  name: "Name", share_pct: "Share %", relationship: "Relationship", relationship_option: "Relationship",
  relationship_other: "Relationship (if Others)", address: "Address", city: "City", state: "State", pincode: "Pincode",
  country: "Country", state_country: "State & Country", mobile: "Mobile", email: "Email", dob: "Date of birth",
  id_type: "ID type", nominee_id_type: "Nominee ID type", id_number: "ID number",
  id_details: "Aadhaar (last 4)", id_aadhaar_last4: "Aadhaar (last 4)", id_pan: "PAN", id_passport: "Passport no.",
  id_dl: "Driving licence no.", guardian_name: "Guardian name", guardian_address: "Guardian address",
  guardian_city: "Guardian city", guardian_state: "Guardian state", guardian_pincode: "Guardian pincode",
  guardian_country: "Guardian country", guardian_mobile: "Guardian mobile", guardian_email: "Guardian email",
  guardian_pan: "Guardian PAN", guardian_id_type: "Guardian ID type", applicant_name: "Applicant name",
  broking_code: "Broking code", dp_id: "DP ID", client_id: "Client ID", crn: "CRN", fund_name: "Fund name",
  folio_no: "Folio number", investor_name: "Investor name", wish_to_nominate: "Wish to nominate", form_date: "Form date",
};

/** "name_n2" -> "Name"; unknown keys fall back to their words. */
export function formatFieldLabel(fieldKey) {
  const baseKey = fieldKey.replace(/_n\d+$/, "");
  return FIELD_LABELS[baseKey] || baseKey.replace(/_/g, " ");
}

/** "name_n2" -> 2, "dp_id" -> null. */
export function getNomineeNumber(fieldKey) {
  const match = fieldKey.match(/_n(\d)$/);
  return match ? Number(match[1]) : null;
}
