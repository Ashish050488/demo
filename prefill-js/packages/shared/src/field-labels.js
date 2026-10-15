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
  guardian_pan: "Guardian PAN", guardian_id_type: "Guardian ID type", applicant_name: "Applicant name", first_holder_name: "First holder name", second_holder_name: "Second holder name", third_holder_name: "Third holder name",
  broking_code: "Broking code", dp_id: "DP ID", client_id: "Client ID", crn: "CRN", fund_name: "Fund name",
  folio_no: "Folio number", investor_name: "Investor name", wish_to_nominate: "Wish to nominate", form_date: "Form date",
  // Subscription / tax forms (one person: the subscriber)
  subscriber_name: "Subscriber name", subscriber_address: "Residential address", fax: "Fax", place: "Place",
  subscription_amount: "Subscription amount (US$)", series: "Series", initial_sales_charge: "Initial sales charge %",
  bank_name: "Bank name", bank_address: "Bank address", swift_code: "SWIFT code", account_name: "Account name",
  account_number: "Account number", further_credit: "For further credit", correspondent_bank_name: "Correspondent bank",
  correspondent_bank_address: "Correspondent bank address", correspondent_swift_code: "Correspondent SWIFT code",
  correspondent_account_number: "Correspondent account no.", title: "Title (Mr./Ms.)", surname: "Family name",
  given_name: "First name", middle_name: "Middle name(s)", residence_address_line1: "Address line 1",
  residence_address_line2: "Address line 2", residence_country: "Country of residence", us_tax_status: "U.S. tax status",
  tax_residence_country: "Tax residence country", tax_reference_type: "Tax reference type", tax_reference_number: "Tax reference no. (PAN)",
  beneficial_owner: "Beneficial owner?", singapore_tax_status: "Singapore tax status", tax_offences: "Tax offences answer",
  pep_status: "Politically exposed person?", citizenship_country: "Country of citizenship", permanent_address: "Permanent address",
  city_postal_code: "City / postal code", date_of_birth_us: "Date of birth (MM/DD/YYYY)", treaty_country: "Treaty country",
  treaty_article: "Treaty article", certify_capacity: "Capacity to sign",
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
