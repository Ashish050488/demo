// Per-field validation - ONE set of rules shared by the backend (fill + confirm) and the frontend (checks as you
// type with the exact same code). Pure ES module, no Node imports, so it runs in both places.
//
// A value that fails is never silently dropped: it's shown with a red flag and the reason, and the form can't
// be confirmed until it's fixed.
const ok = { valid: true };
const bad = (reason) => ({ valid: false, reason });
const clean = (v) => String(v ?? "").trim();
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

export function validateName(value) {
  const v = clean(value);
  const words = v.split(/\s+/).filter(Boolean);
  if (!words.length) return bad("Name is empty");
  if (/\d/.test(v)) return bad("A name can't contain digits");
  if (words.some((w) => w.replace(/[^A-Za-z]/g, "").length < 2)) return bad("Each word needs at least 2 letters");
  return ok;
}

export function validateDob(value) {
  const m = clean(value).match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (!m) return bad("Date must be DD/MM/YYYY");
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return bad("Not a real date");
  if (date.getTime() > Date.now()) return bad("Date of birth is in the future");
  if (y < 1900) return bad("Year looks wrong");
  return ok;
}

export function validateLast4(value) {
  const v = clean(value).toUpperCase();
  if (PAN_RE.test(v)) return bad("That's a PAN number - this box is for the last 4 digits of Aadhaar");
  if (/^\d{12}$/.test(v.replace(/\s/g, ""))) return bad("Enter only the LAST 4 digits of Aadhaar, never the full number");
  return /^\d{4}$/.test(v) ? ok : bad("Must be exactly 4 digits (last 4 of Aadhaar)");
}

export function validatePincode(value) {
  const v = clean(value);
  if (!/^\d+$/.test(v)) return bad("Pincode must be digits only");
  if (v.length !== 6) return bad(`Pincode must be 6 digits - this has ${v.length}`);
  if (v[0] === "0") return bad("Indian pincodes don't start with 0");
  return ok;
}

export function validatePan(value) {
  const v = clean(value).toUpperCase().replace(/\s/g, "");
  if (/^\d{4}$/.test(v) || /^\d{12}$/.test(v)) return bad("That's an Aadhaar number - this box is for a PAN");
  if (/^[A-Z]\d{7}$/.test(v)) return bad("That looks like a passport number - this box is for a PAN");
  if (v.length !== 10) return bad(`PAN must be 10 characters - this has ${v.length}`);
  return PAN_RE.test(v) ? ok : bad("PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)");
}

export function validatePassport(value) {
  const v = clean(value).toUpperCase().replace(/\s/g, "");
  if (PAN_RE.test(v)) return bad("That's a PAN number - this box is for a passport number");
  return /^[A-Z]\d{7}$/.test(v) ? ok : bad("Indian passport number is 1 letter + 7 digits (e.g. J1234567)");
}

export function validateDl(value) {
  const v = clean(value).toUpperCase().replace(/[\s-]/g, "");
  if (PAN_RE.test(v)) return bad("That's a PAN number - this box is for a driving licence number");
  return /^[A-Z]{2}\d{2}\d{4}\d{7}$/.test(v) || /^[A-Z]{2}\d{8,13}$/.test(v)
    ? ok : bad("Driving licence number looks like SS RR YYYY NNNNNNN (e.g. BR01 2019 0012345)");
}

export function validateMobile(value) {
  const v = clean(value).replace(/[\s-]/g, "").replace(/^\+91|^0091/, "").replace(/^0(?=\d{10}$)/, "");
  if (!/^\d+$/.test(v)) return bad("Mobile must be digits only");
  if (v.length !== 10) return bad(`Mobile must be 10 digits - this has ${v.length}`);
  if (!/^[6-9]/.test(v)) return bad("Indian mobile numbers start with 6, 7, 8 or 9");
  return ok;
}

export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(value)) ? ok : bad("Not a valid email address");
}

export function validateSharePct(value) {
  const v = clean(value).replace(/%$/, "").trim();
  const n = Number(v);
  if (v === "" || Number.isNaN(n)) return bad("Share must be a number");
  if (n <= 0 || n > 100) return bad("Share must be between 1 and 100");
  return ok;
}

/** An ID-number box that holds whichever ID type is ticked (CRN) - checked against THAT type. */
export function validateIdNumberFor(idType, value) {
  const t = String(idType || "");
  if (/^PAN/i.test(t)) return validatePan(value);
  if (/Aadhaar/i.test(t)) return validateLast4(value);
  if (/Passport/i.test(t)) return validatePassport(value);
  if (/Driving/i.test(t)) return validateDl(value);
  return bad("Pick the ID type first - the number is checked against it");
}

// Keyed by the field's base key (without the _n<nominee> suffix). Fields with no entry are free text.
const VALIDATORS = {
  name: validateName, guardian_name: validateName, investor_name: validateName, applicant_name: validateName,
  dob: validateDob,
  id_aadhaar_last4: validateLast4, id_details: validateLast4,
  id_pan: validatePan, guardian_pan: validatePan,
  id_passport: validatePassport, id_dl: validateDl,
  pincode: validatePincode, guardian_pincode: validatePincode,
  mobile: validateMobile, guardian_mobile: validateMobile,
  email: validateEmail, guardian_email: validateEmail,
  share_pct: validateSharePct,
};

/** Plain-language rule per field, for the Form mapping screen. */
export const RULE_TEXT = {
  name: "Letters only, each word 2+ letters", guardian_name: "Letters only, each word 2+ letters",
  investor_name: "Letters only, each word 2+ letters", applicant_name: "Letters only, each word 2+ letters",
  dob: "DD/MM/YYYY, a real past date",
  id_aadhaar_last4: "Exactly 4 digits - never the full Aadhaar", id_details: "Exactly 4 digits - never the full Aadhaar",
  id_pan: "PAN: 5 letters + 4 digits + 1 letter", guardian_pan: "PAN: 5 letters + 4 digits + 1 letter",
  id_passport: "1 letter + 7 digits", id_dl: "SS RR YYYY NNNNNNN",
  pincode: "6 digits, not starting with 0", guardian_pincode: "6 digits, not starting with 0",
  mobile: "10 digits starting 6-9 (+91 allowed)", guardian_mobile: "10 digits starting 6-9 (+91 allowed)",
  email: "Valid email address", guardian_email: "Valid email address",
  share_pct: "Number 1-100; all nominees together must total 100",
  id_number: "Must match the ticked ID type (PAN / Aadhaar last 4 / passport / DL)",
};

export function validatorFor(baseKey) {
  return VALIDATORS[baseKey] || null;
}

/** validatorFor(), but from a full field key like "name_n1" - strips the _n<nominee> suffix first. */
export function validatorForField(fieldKey) {
  return validatorFor((fieldKey || "").replace(/_n\d+$/, ""));
}
