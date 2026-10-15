// One Excel row can fill several forms that name the same thing differently ("Investor name" vs "Applicant name",
// a relationship tick box vs free text, "State, Country" in one box vs two, one ID type per nominee vs one for
// all). These rules translate a row's values for one form into the missing values of another, so the combined
// template asks for each thing once. ID types go through each form's own identityType rules, never form names.

// Same value, different key on different forms (copied both ways).
const NAME_EQUIVALENTS = [["investor_name", "applicant_name"], ["subscriber_address", "permanent_address"], ["pincode", "city_postal_code"]];
// Same date, written day-first on Indian forms and month-first on US ones (dd/mm/yyyy <-> mm/dd/yyyy is one swap).
const DATE_ORDER_EQUIVALENTS = [["dob", "date_of_birth_us"]];
const swapDayAndMonth = (date) => String(date).trim().replace(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/, "$3$2$1$2$4");
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;

/** Base keys a combined template can leave out for `formRules` because another form's columns produce them. */
export function listDerivableBaseKeys(formRules) {
  const { tickboxField, numberField, numberFieldByIdentityKind } = formRules.identityType;
  return new Set([...NAME_EQUIVALENTS.flat(), ...DATE_ORDER_EQUIVALENTS.flat(),"relationship", "relationship_option", "relationship_other", "state", "country", "state_country",
    tickboxField, numberField, ...Object.values(numberFieldByIdentityKind)].filter(Boolean));
}

function splitStateCountry(stateCountry) {
  const lastCommaIndex = String(stateCountry).lastIndexOf(",");
  return lastCommaIndex < 0 ? { state: String(stateCountry).trim(), country: "" }
    : { state: stateCountry.slice(0, lastCommaIndex).trim(), country: stateCountry.slice(lastCommaIndex + 1).trim() };
}

/** The ID kind (pan, passport, …) and number the source form's values give for one nominee. */
function readIdentity(sourceRules, sourceValues, nomineeNumber) {
  const { scope, tickboxField, numberField, optionByIdentityKind, numberFieldByIdentityKind } = sourceRules.identityType;
  const chosenOption = sourceValues[scope === "shared" ? tickboxField : `${tickboxField}_n${nomineeNumber}`];
  const identityKind = Object.entries(optionByIdentityKind).find(([, option]) => option === chosenOption)?.[0]
    || Object.keys(numberFieldByIdentityKind).find((kind) => sourceValues[`${numberFieldByIdentityKind[kind]}_n${nomineeNumber}`]);
  if (!identityKind) return null;
  const numberKey = numberField || numberFieldByIdentityKind[identityKind];
  return { identityKind, idNumber: numberKey ? sourceValues[`${numberKey}_n${nomineeNumber}`] ?? null : null };
}

/** Values for the target form's columns (`targetColumnKeys`) that `sourceValues` (another form's row) can give.
 * Only fills keys the target row doesn't have yet. Returns {typedValues, panValues}: PAN numbers stay in memory. */
export function deriveValuesForForm({ targetRules, targetColumnKeys, targetValues, targetRelationshipOptions = [], sourceRules, sourceValues }) {
  const derived = {};
  const offer = (fieldKey, value) => {
    if (value == null || value === "" || !targetColumnKeys.has(fieldKey) || (targetValues[fieldKey] ?? derived[fieldKey]) != null) return;
    derived[fieldKey] = String(value);
  };
  for (const [firstKey, secondKey] of NAME_EQUIVALENTS) { offer(firstKey, sourceValues[secondKey]); offer(secondKey, sourceValues[firstKey]); }
  for (const [firstKey, secondKey] of DATE_ORDER_EQUIVALENTS) {
    if (sourceValues[secondKey]) offer(firstKey, swapDayAndMonth(sourceValues[secondKey]));
    if (sourceValues[firstKey]) offer(secondKey, swapDayAndMonth(sourceValues[firstKey]));
  }
  // One box on one form, one per nominee on the other (CRN guardian_name vs CAMS guardian_name_n1..3): nominee 1's.
  for (const [fieldKey, value] of Object.entries(sourceValues)) {
    if (fieldKey.endsWith("_n1")) offer(fieldKey.slice(0, -3), value);
    else if (!/_n\d+$/.test(fieldKey)) offer(`${fieldKey}_n1`, value);
  }

  const relationshipOptions = targetRelationshipOptions;
  const notes = [];
  let sharedIdentityKind = null;
  for (let nomineeNumber = 1; nomineeNumber <= targetRules.supportedNomineeCount; nomineeNumber += 1) {
    const suffix = `_n${nomineeNumber}`;
    const chosenRelationship = sourceValues[`relationship_option${suffix}`];
    if (chosenRelationship) offer(`relationship${suffix}`, chosenRelationship === "Others" ? sourceValues[`relationship_other${suffix}`] || "Others" : chosenRelationship);
    const typedRelationship = sourceValues[`relationship${suffix}`];
    if (typedRelationship) {
      const matchingOption = relationshipOptions.find((option) => option.toLowerCase() === typedRelationship.trim().toLowerCase());
      offer(`relationship_option${suffix}`, matchingOption || typedRelationship);
    }
    if (sourceValues[`state_country${suffix}`]) {
      const { state, country } = splitStateCountry(sourceValues[`state_country${suffix}`]);
      offer(`state${suffix}`, state);
      offer(`country${suffix}`, country);
    }
    if (sourceValues[`state${suffix}`] || sourceValues[`country${suffix}`]) {
      offer(`state_country${suffix}`, [sourceValues[`state${suffix}`], sourceValues[`country${suffix}`]].filter(Boolean).join(", "));
    }

    const identity = readIdentity(sourceRules, sourceValues, nomineeNumber);
    if (!identity) continue;
    const { scope, tickboxField, numberField, optionByIdentityKind, numberFieldByIdentityKind } = targetRules.identityType;
    const targetOption = optionByIdentityKind[identity.identityKind];
    // One ID type for every nominee on the target form: a nominee with a different ID can't be copied across.
    if (scope === "shared") {
      if (nomineeNumber === 1) sharedIdentityKind = identity.identityKind;
      else if (identity.identityKind !== sharedIdentityKind) {
        notes.push({ nomineeNumber, idTypeOption: optionByIdentityKind[sharedIdentityKind] || sharedIdentityKind, givenOption: targetOption || identity.identityKind });
        continue;
      }
    }
    // A shared ID type (one tick for every nominee) follows nominee 1.
    if (targetOption && (scope !== "shared" || nomineeNumber === 1)) offer(scope === "shared" ? tickboxField : `${tickboxField}${suffix}`, targetOption);
    const targetNumberKey = numberField || numberFieldByIdentityKind[identity.identityKind];
    if (targetNumberKey) offer(`${targetNumberKey}${suffix}`, identity.idNumber);
  }

  const typedValues = {};
  const panValues = {};
  for (const [fieldKey, value] of Object.entries(derived)) (PAN_PATTERN.test(value.toUpperCase()) ? panValues : typedValues)[fieldKey] = value;
  return { typedValues, panValues, notes };
}
