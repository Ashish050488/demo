// The whole-form check run before a case can be confirmed - by the review screen as you type and by the
// backend before saving, so it can't be bypassed. Driven entirely by the form's rules (no form names in code).
import { validatorFor, validateIdNumberFor } from "./field-validation.js";

/** The ID type chosen for one nominee: the shared tick box (one row for all nominees) or that nominee's own. */
export function getChosenIdType(formRules, values, nomineeNumber) {
  const { scope, tickboxField } = formRules.identityType;
  return scope === "shared" ? values[tickboxField] : values[`${tickboxField}_n${nomineeNumber}`];
}

/** Check a whole form's values: {fieldKey: value} -> {missing: [fieldKey], invalid: [{field, reason}]}.
 * A nominee after the first only counts once something of theirs is filled. When the form has one number row
 * per ID type, the row matching the ticked type is required too. Shares must total 100 with several nominees. */
export function checkForm(formRules, values) {
  const hasValue = (fieldKey) => values[fieldKey] != null && String(values[fieldKey]).trim() !== "";
  const nomineeNumbers = Array.from({ length: formRules.supportedNomineeCount }, (_unused, index) => index + 1);
  const { tickboxField, numberField, optionByIdentityKind, numberFieldByIdentityKind } = formRules.identityType;
  const tickOnlyKeys = new Set([tickboxField, "relationship_option"]);
  const isNomineeInUse = (nomineeNumber) => nomineeNumber === 1 || Object.keys(values).some((fieldKey) =>
    fieldKey.endsWith(`_n${nomineeNumber}`) && hasValue(fieldKey) && !tickOnlyKeys.has(fieldKey.replace(/_nd+$/, "")));
  const nomineeFieldKeys = new Set(formRules.nomineeFieldKeys);
  const missing = [];
  const invalid = [];

  for (const baseKey of formRules.requiredFields) {
    if (nomineeFieldKeys.has(baseKey)) {
      for (const nomineeNumber of nomineeNumbers) {
        if (isNomineeInUse(nomineeNumber) && !hasValue(`${baseKey}_n${nomineeNumber}`)) missing.push(`${baseKey}_n${nomineeNumber}`);
      }
    } else if (!hasValue(baseKey)) missing.push(baseKey);
  }
  const identityKindByOption = Object.fromEntries(Object.entries(optionByIdentityKind).map(([kind, option]) => [option, kind]));
  for (const nomineeNumber of nomineeNumbers) {
    const numberRow = numberFieldByIdentityKind[identityKindByOption[getChosenIdType(formRules, values, nomineeNumber)]];
    const rowKey = `${numberRow}_n${nomineeNumber}`;
    if (numberRow && isNomineeInUse(nomineeNumber) && !hasValue(rowKey) && !missing.includes(rowKey)) missing.push(rowKey);
  }

  for (const [fieldKey, fieldValue] of Object.entries(values)) {
    if (!hasValue(fieldKey)) continue;
    const baseKey = fieldKey.replace(/_nd+$/, "");
    const nomineeNumber = Number((fieldKey.match(/_n(d)$/) || [])[1]) || 1;
    const check = baseKey === numberField
      ? validateIdNumberFor(getChosenIdType(formRules, values, nomineeNumber), fieldValue)
      : validatorFor(baseKey)?.(fieldValue);
    if (check && !check.valid) invalid.push({ field: fieldKey, reason: check.reason });
  }

  const shares = nomineeNumbers.filter((nomineeNumber) => isNomineeInUse(nomineeNumber) && hasValue(`share_pct_n${nomineeNumber}`))
    .map((nomineeNumber) => Number(String(values[`share_pct_n${nomineeNumber}`]).replace(/%$/, "")));
  const shareTotal = shares.reduce((total, share) => total + share, 0);
  if (shares.length > 1 && shares.every((share) => !Number.isNaN(share)) && Math.round(shareTotal) !== 100) {
    invalid.push({ field: "share_pct_n1", reason: `Shares add up to ${shareTotal}% - they must total 100%` });
  }
  return { missing, invalid };
}
