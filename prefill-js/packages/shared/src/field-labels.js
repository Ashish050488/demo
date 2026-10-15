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
  // Global Bond Fund - each tick box is its own question (pages 32-65)
  tax_offence_1a: "1(a) Income tax: income left out of a return", tax_offence_1b: "1(b) Income tax: false statement in a return",
  tax_offence_1c: "1(c) Income tax: false answer to a tax authority", tax_offence_1d: "1(d) Income tax: false information (no return due)",
  tax_offence_1e: "1(e) Income tax: did not notify the tax authority", tax_offence_1f: "1(f) Income tax: false books or records",
  tax_offence_1g: "1(g) Income tax: fraud or contrivance", tax_offence_2a: "2(a) Consumption tax: output / input tax misstated",
  tax_offence_2b: "2(b) Consumption tax: false statement or claim", tax_offence_2c: "2(c) Consumption tax: false answer",
  tax_offence_2d: "2(d) Consumption tax: false books or records", tax_offence_2e: "2(e) Consumption tax: fraud, incl. computer misuse",
  tax_offence_3: "3. Consumption tax refund: evasion or default", tax_offence_part2: "Part II: suspicion about the applicant (non-individuals)",
  entity_specified_us_person: "Specified U.S. Person", entity_us_person_not_specified: "U.S. Person, not a Specified U.S. Person",
  entity_fi_singapore_or_iga: "FI: Singapore / IGA partner jurisdiction", entity_fi_registered_deemed_compliant: "FI: registered deemed compliant",
  entity_fi_participating: "FI: participating foreign FI", entity_fi_sponsored: "FI: sponsored, no GIIN yet",
  entity_fi_trustee_documented_trust: "FI: trustee documented trust", entity_fi_certified_deemed_compliant: "FI: certified deemed compliant / non-reporting",
  entity_fi_non_participating: "FI: non-participating foreign FI", entity_exempt_beneficial_owner: "Exempt beneficial owner",
  entity_active_nffe: "Active non-financial foreign entity (FATCA)", entity_passive_nffe: "Passive non-financial foreign entity (FATCA)",
  entity_active_nfe_crs: "Active non-financial entity (CRS)", entity_active_nfe_regularly_traded: "Active NFE: regularly traded corporation",
  entity_active_nfe_governmental: "Active NFE: government / central bank / international org.", entity_active_nfe_other: "Active NFE: other",
  entity_passive_nfe_crs: "Passive non-financial entity (CRS)", controlling_person_us_status: "Controlling person: U.S. tax status",
  sg_entity_category: "Non-individual owner: category (a)-(f)", sg_entity_q1_tax_resident: "Q1 Tax resident in Singapore?",
  sg_entity_q2: "Q2 Genuine business, not tax avoidance?", sg_entity_q3: "Q3 Permanent establishment in Singapore?",
  sg_entity_q4: "Q4 Funds from Singapore operations?", sg_entity_q5: "Q5 Has an associate holding shares?",
  mailing_address_line1: "Mailing address line 1", mailing_address_line2: "Mailing address line 2", mailing_country: "Mailing country",
  mailing_postcode: "Mailing postcode", us_tin: "U.S. TIN", tax_residence_country_2: "Tax country 2", tax_reference_type_2: "Tax reference type 2",
  tax_reference_number_2: "Tax reference no. 2", tax_residence_country_3: "Tax country 3", tax_reference_type_3: "Tax reference type 3",
  tax_reference_number_3: "Tax reference no. 3", tin_unavailable_reason: "Reason no TIN", signing_capacity: "Capacity (if not the holder)",
  entity_legal_name: "Entity legal name", entity_country_of_incorporation: "Country of incorporation", entity_address_street: "Registered address: street",
  entity_address_city: "Registered address: city", entity_address_state: "Registered address: state", entity_address_postcode: "Registered address: post code",
  entity_address_country: "Registered address: country", entity_mailing_street: "Mailing: street", entity_mailing_city: "Mailing: city",
  entity_mailing_state: "Mailing: state", entity_mailing_postcode: "Mailing: post code", entity_mailing_country: "Mailing: country",
  entity_us_tin: "Entity U.S. TIN", entity_us_exemption: "U.S. exemption", entity_giin: "Entity GIIN", sponsoring_entity_name: "Sponsoring entity name",
  sponsoring_entity_giin: "Sponsoring entity GIIN", trustee_name: "Trustee name", trustee_giin: "Trustee GIIN",
  entity_non_reporting_exemption: "Non-reporting exemption", exempt_beneficial_owner_status: "Exempt beneficial owner status",
  direct_reporting_nffe_giin: "Direct reporting NFFE GIIN", nffe_sponsoring_entity_name: "NFFE sponsoring entity name",
  nffe_sponsoring_entity_giin: "NFFE sponsoring entity GIIN", entity_tin_unavailable_reason: "Entity: reason no TIN",
  entity_fi_type: "Non-reporting FI type (text)", entity_other_type: "Other entity type (domestic law)",
  regularly_traded_corporation_name: "Regularly traded corporation", stock_exchange_name: "Stock exchange",
  crs_entity_is_fi: "5.1 Entity is a Financial Institution", crs_reporting_fi: "Reporting FI under CRS", crs_non_reporting_fi: "Non-reporting FI under CRS",
  crs_non_reporting_fi_type: "Non-reporting FI type", crs_fi_non_participating_jurisdiction: "FI in a non-participating jurisdiction",
  crs_npj_fi_type: "Type of that FI (a)/(b)/(c)",
  entity_signatory_1_title: "Signatory 1 position", entity_signatory_2_title: "Signatory 2 position", entity_signatory_1_date: "Signatory 1 date",
  entity_signatory_2_date: "Signatory 2 date", cp_surname: "Controlling person: family name", cp_given_name: "Controlling person: first name",
  cp_middle_name: "Controlling person: middle name", cp_address_line1: "CP address line 1", cp_address_line2: "CP address line 2", cp_country: "CP country",
  cp_postcode: "CP postcode", cp_mailing_line1: "CP mailing line 1", cp_mailing_line2: "CP mailing line 2", cp_mailing_country: "CP mailing country",
  cp_mailing_postcode: "CP mailing postcode", cp_dob: "CP date of birth", cp_entity_name_1: "CP for entity 1", cp_entity_name_2: "CP for entity 2",
  cp_entity_name_3: "CP for entity 3", cp_us_tin: "CP U.S. TIN", cp_tin_unavailable_reason: "CP: reason no TIN", cp_print_name: "CP print name",
  cp_signed_date: "CP signed date", cp_signing_capacity: "CP capacity", authorised_signatory_name_p54: "Authorised signatory (p.54)",
  authorised_signatory_designation_p54: "Signatory designation (p.54)", authorised_signatory_name_p64: "Authorised signatory (p.64)",
  authorised_signatory_designation_p64: "Signatory designation (p.64)", beneficial_owner_name: "Beneficial owner name (if not the applicant)",
  beneficial_owner_address: "Beneficial owner address", associate_name: "Associate's full name", associate_ownership_percent: "Combined ownership %",
  tax_offence_part2_matters: "Part II: which matters", pep_details_1: "PEP details line 1", pep_details_2: "PEP details line 2",
  pep_details_3: "PEP details line 3", pep_details_4: "PEP details line 4",
};
// Numbered rows of the same table ("cp_tax_residence_country_2"): "CP tax country 2" etc.
for (const rowNumber of [1, 2, 3]) {
  FIELD_LABELS[`cp_tax_residence_country_${rowNumber}`] = `CP tax country ${rowNumber}`;
  FIELD_LABELS[`cp_tax_reference_type_${rowNumber}`] = `CP tax reference type ${rowNumber}`;
  FIELD_LABELS[`cp_tax_reference_number_${rowNumber}`] = `CP tax reference no. ${rowNumber}`;
  FIELD_LABELS[`entity_tax_residence_country_${rowNumber}`] = `Entity tax country ${rowNumber}`;
  FIELD_LABELS[`entity_tax_reference_type_${rowNumber}`] = `Entity tax reference type ${rowNumber}`;
  FIELD_LABELS[`entity_tax_reference_number_${rowNumber}`] = `Entity tax reference no. ${rowNumber}`;
  FIELD_LABELS[`passive_nffe_controlling_person_${rowNumber}`] = `Controlling person ${rowNumber} (p.33)`;
  FIELD_LABELS[`npj_controlling_person_${rowNumber}`] = `Controlling person ${rowNumber} (p.35)`;
}

/** "name_n2" -> "Name"; unknown keys fall back to their words. */
export function formatFieldLabel(fieldKey) {
  const baseKey = fieldKey.replace(/_n\d+$/, "");
  // "subscriber_name_p16": the same value printed again on page 16.
  const pageCopy = /^(.*)_p(\d+)$/.exec(baseKey);
  if (pageCopy && FIELD_LABELS[pageCopy[1]]) return `${FIELD_LABELS[pageCopy[1]]} (p.${pageCopy[2]})`;
  const label = FIELD_LABELS[baseKey] || baseKey.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "name_n2" -> 2, "dp_id" -> null. */
export function getNomineeNumber(fieldKey) {
  const match = fieldKey.match(/_n(\d)$/);
  return match ? Number(match[1]) : null;
}
