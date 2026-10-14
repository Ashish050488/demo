// Per-field validation: a value that fails is never shown or written as if it were real data - the field is
// treated as Missing instead. Shared by the OCR-extraction stage (server/uploadFill.js), the live-editing
// screen's as-you-type check (ui/views/uploadReviewLive.js), and the confirm-time server-side safety net
// (server/uploadRoutes.js) - three different callers, one set of rules, so none of them can disagree.
const MIN_WORD_LEN = 2;

export function validateName(value) {
  const words = (value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { valid: false, reason: "Name is empty" };
  if (words.some((w) => w.replace(/[^A-Za-z]/g, "").length < MIN_WORD_LEN)) {
    return { valid: false, reason: "Each word needs at least 2 letters" };
  }
  return { valid: true };
}

export function validateDob(value) {
  const v = (value || "").trim();
  const m = v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return { valid: false, reason: "Date of birth must be DD/MM/YYYY" };
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return { valid: false, reason: "Not a real date" };
  }
  if (date.getTime() > Date.now()) return { valid: false, reason: "Date of birth is in the future" };
  return { valid: true };
}

export function validateLast4(value) {
  if (!/^\d{4}$/.test((value || "").trim())) return { valid: false, reason: "Must be exactly 4 digits" };
  return { valid: true };
}

export function validatePincode(value) {
  if (!/^\d{6}$/.test((value || "").trim())) return { valid: false, reason: "Must be exactly 6 digits" };
  return { valid: true };
}

export function validatePan(value) {
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test((value || "").trim().toUpperCase())) {
    return { valid: false, reason: "PAN must be 5 letters, 4 digits, 1 letter" };
  }
  return { valid: true };
}

// Keyed by the field's base key (mapping_config.js, without the _n<nominee> suffix). Fields with no entry
// here (most excel/account fields) have no specific shape to check and are accepted as free text.
const VALIDATORS = {
  name: validateName,
  id_aadhaar_last4: validateLast4,
  id_details: validateLast4,
  dob: validateDob,
  id_pan: validatePan,
  pincode: validatePincode,
};

export function validatorFor(baseKey) {
  return VALIDATORS[baseKey] || null;
}

/** validatorFor(), but from a full field key like "name_n1" - strips the _n<nominee> suffix first. */
export function validatorForField(fieldKey) {
  return validatorFor((fieldKey || "").replace(/_n\d+$/, ""));
}
