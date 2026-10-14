// What never leaves this machine: any PAN number (by field name OR by value shape - an ID-number box can hold
// a PAN), and Aadhaar is only ever the last 4 digits (a display prefix "XXXX XXXX " is stripped back off).
const PAN_FIELD_PATTERN = /pan/i;
const PAN_VALUE_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const AADHAAR_FIELD_PATTERN = /^(id_aadhaar_last4|id_details|id_number)/;
const AADHAAR_MASK_PREFIX_PATTERN = /^XXXX XXXX /;

export function isPanValue(fieldValue) {
  return typeof fieldValue === "string" && PAN_VALUE_PATTERN.test(fieldValue.trim().toUpperCase());
}

/** {fieldKey: value} with every never-stored field dropped. */
export function removeNeverStoredFields(fieldValues) {
  const storableValues = {};
  for (const [fieldKey, fieldValue] of Object.entries(fieldValues || {})) {
    if (PAN_FIELD_PATTERN.test(fieldKey) || isPanValue(fieldValue)) continue;
    storableValues[fieldKey] = AADHAAR_FIELD_PATTERN.test(fieldKey) && typeof fieldValue === "string"
      ? fieldValue.replace(AADHAAR_MASK_PREFIX_PATTERN, "") : fieldValue;
  }
  return storableValues;
}
