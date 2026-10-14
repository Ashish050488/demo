export type ValidationResult = { valid: true } | { valid: false; reason: string };
export type FieldValidator = (value: unknown) => ValidationResult;

export type IdentityKind = "pan" | "aadhaarLast4" | "passport" | "dl";

export interface FormRules {
  formId: string;
  label: string;
  shortLabel: string;
  sheetTabName: string;
  detectionPhrases: string[];
  supportedNomineeCount: number;
  requiredFields: string[];
  /** How the review screen splits the form: base field keys per section, in printed order. */
  reviewSections: { key: string; label: string; fields: string[] }[];
  nomineeFieldKeys: string[];
  identityType: {
    scope: "shared" | "perNominee";
    tickboxField: string;
    numberField: string | null;
    optionByIdentityKind: Partial<Record<IdentityKind, string>>;
    numberFieldByIdentityKind: Partial<Record<IdentityKind, string>>;
  };
}

export interface FormCheckResult {
  missing: string[];
  invalid: { field: string; reason: string }[];
}

export function validateName(value: unknown): ValidationResult;
export function validateDob(value: unknown): ValidationResult;
export function validateLast4(value: unknown): ValidationResult;
export function validatePincode(value: unknown): ValidationResult;
export function validatePan(value: unknown): ValidationResult;
export function validatePassport(value: unknown): ValidationResult;
export function validateDl(value: unknown): ValidationResult;
export function validateMobile(value: unknown): ValidationResult;
export function validateEmail(value: unknown): ValidationResult;
export function validateSharePct(value: unknown): ValidationResult;
export function validateIdNumberFor(idType: string | null | undefined, value: unknown): ValidationResult;
export function validatorFor(baseKey: string): FieldValidator | null;
export function validatorForField(fieldKey: string): FieldValidator | null;
export const RULE_TEXT: Record<string, string>;

export function getChosenIdType(formRules: FormRules, values: Record<string, string>, nomineeNumber: number): string | undefined;
export function checkForm(formRules: FormRules, values: Record<string, string>): FormCheckResult;

export const FIELD_LABELS: Record<string, string>;
export function formatFieldLabel(fieldKey: string): string;
export function getNomineeNumber(fieldKey: string): number | null;
export function isSamePersonName(firstName: string | null | undefined, secondName: string | null | undefined): boolean;
