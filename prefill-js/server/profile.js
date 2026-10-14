// One profile per nominee, merged from every document assigned to them - the bridge between "whatever the
// person uploaded" (varies) and "the form's fixed boxes" (never changes). Forms map their field keys to
// profile keys (PROFILE_KEY_FOR_FIELD); documents only ever feed this profile. Adding a new document type
// means teaching it to fill these keys - no form needs to change.
import { getPan } from "./panMemory.js";
import { validateName, validateDob, validatePan, validatePincode } from "../src/fieldValidate.js";

const STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Orissa", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "NCT of Delhi", "Jammu and Kashmir", "Jammu & Kashmir", "Ladakh",
  "Puducherry", "Pondicherry", "Chandigarh", "Andaman and Nicobar Islands", "Lakshadweep",
  "Dadra and Nagar Haveli and Daman and Diu", "Dadra and Nagar Haveli", "Daman and Diu"];

/** "S/O: X, Street, Village, District, State - 800001" -> {street, city, state, pincode, country}. City is
 * the part just before the state (Aadhaar/DL/passport all print district/city there). */
export function parseAddress(address) {
  if (!address) return {};
  const pin = address.match(/\b(\d{6})\b/);
  const state = STATES.find((s) => new RegExp(`\\b${s.replace(/ /g, "\\s*")}\\b`, "i").test(address)) || null;
  let rest = address;
  if (pin) rest = rest.replace(pin[0], "");
  if (state) rest = rest.replace(new RegExp(`\\b${state.replace(/ /g, "\\s*")}\\b`, "i"), "");
  const parts = rest.split(/[,\n]/).map((p) => p.replace(/[\s-]+$/, "").replace(/^[\s-]+/, "").trim()).filter(Boolean);
  const city = state && parts.length ? parts[parts.length - 1] : null;
  const street = (city ? parts.slice(0, -1) : parts).join(", ");
  return {
    street: street || null,
    city,
    state: state ? state.replace("Orissa", "Odisha") : null,
    pincode: pin ? pin[1] : null,
    country: state || pin ? "India" : null,
  };
}

const ok = (validator, v) => v != null && v !== "" && (!validator || validator(v).valid);

/** docs: the nominee's documents from the manifest (status 'done'). Returns {key: {value, confidence, from}}. */
export function buildProfile(docs) {
  const candidates = {}; // key -> [{value, confidence, from}]
  const add = (key, value, confidence, from, validator) => {
    if (!ok(validator, value)) return;
    (candidates[key] ||= []).push({ value, confidence: confidence ?? 0, from });
  };
  for (const d of docs) {
    if (d.status !== "done") continue;
    const mem = getPan(d.id) || {};
    const label = { pan: "PAN card", passport: "Passport", driving_licence: "Driving licence" }[d.docType] || "Aadhaar";
    if (/^aadhaar/.test(d.docType || "")) {
      add("name", d.foundName, d.foundNameConfidence, label, validateName);
      add("dob", d.foundDob, d.foundDobConfidence, label, validateDob);
      // Aadhaar is the address-of-record: small bonus so it wins over a DL/passport address of similar quality.
      add("address", d.foundAddress, (d.foundAddressConfidence ?? 0) + 5, label);
      add("aadhaarLast4", d.foundLast4, d.foundLast4Confidence, label, (v) => ({ valid: /^\d{4}$/.test(v) }));
    } else {
      add("name", mem.name, mem.nameConfidence, label, validateName);
      add("dob", mem.dob, mem.dobConfidence, label, validateDob);
      add("address", mem.address, mem.addressConfidence, label);
    }
    if (d.docType === "pan") add("pan", mem.panNumber, 100, label, validatePan);
    if (d.docType === "passport") add("passport", mem.passportNumber, 100, label, (v) => ({ valid: /^[A-Z]\d{7}$/.test(v) }));
    if (d.docType === "driving_licence") add("dl", mem.dlNumber, 100, label);
  }
  const profile = {};
  for (const [k, list] of Object.entries(candidates)) {
    profile[k] = list.sort((a, b) => b.confidence - a.confidence)[0];
  }
  if (profile.address) {
    const parsed = parseAddress(profile.address.value);
    const base = { confidence: profile.address.confidence, from: profile.address.from };
    for (const k of ["city", "state", "pincode", "country"]) {
      if (parsed[k] && (k !== "pincode" || validatePincode(parsed[k]).valid)) profile[k] = { value: parsed[k], ...base };
    }
    if (parsed.street) profile.street = { value: parsed.street, ...base };
    if (parsed.state) profile.stateCountry = { value: `${parsed.state}, India`, ...base };
  }
  return profile;
}

// Priority when several ID numbers are known and the reviewer hasn't picked one.
export const ID_TYPE_PRIORITY = ["pan", "aadhaarLast4", "passport", "dl"];
