"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { checkForm, type FormRules } from "@prefill/shared";
import { fetchCase, fetchCaseFields, fillCase, recordDecision } from "@/api/cases-api";
import { fetchFormRules } from "@/api/forms-api";
import type { CaseField, CaseFieldsView, CaseSummary } from "@/types/cases";
import { collectEffectiveValues, isShownField, validateTypedValue } from "@/utils/review-field-helpers";

/** Everything the review screen edits. Typed values stay local until committed (on blur / leaving the
 * screen) as a "corrected" decision - and a value that fails its rule is never committed. */
export function useReviewSession(caseId: string) {
  const [fieldsView, setFieldsView] = useState<CaseFieldsView | null>(null);
  const [caseSummary, setCaseSummary] = useState<CaseSummary | null>(null);
  const [formRules, setFormRules] = useState<FormRules | null>(null);
  const [editedValues, setEditedValues] = useState<Map<string, string>>(new Map());
  const [typedProblems, setTypedProblems] = useState<Map<string, string>>(new Map());
  const [committedFields, setCommittedFields] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);

  /** shouldRefill "ifNotFilled": a case the batch already filled just opens - no second fill while others are
   * still being read. */
  const reloadFields = useCallback(async (shouldRefill: boolean | "ifNotFilled") => {
    setLoadError(null);
    try {
      const needsFill = shouldRefill === "ifNotFilled" ? !(await fetchCase(caseId)).isFilled : shouldRefill;
      if (needsFill) await fillCase(caseId);
      const [loadedFieldsView, loadedCase] = await Promise.all([fetchCaseFields(caseId), fetchCase(caseId)]);
      setFieldsView(loadedFieldsView);
      setCaseSummary(loadedCase);
      setFormRules(await fetchFormRules(loadedFieldsView.formId));
      setEditedValues(new Map());
      setTypedProblems(new Map());
      setCommittedFields(new Set());
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, [caseId]);

  useEffect(() => { reloadFields("ifNotFilled"); }, [reloadFields]);

  const shownFields = useMemo(() => (fieldsView && formRules ? fieldsView.fields.filter((caseField) => isShownField(caseField, formRules)) : []), [fieldsView, formRules]);
  const effectiveValues = useMemo(() => collectEffectiveValues(shownFields, editedValues), [shownFields, editedValues]);
  const formCheck = useMemo(() => {
    if (!formRules) return { missing: [], invalid: [] };
    const checkResult = checkForm(formRules, effectiveValues);
    const typedInvalid = [...typedProblems].map(([field, reason]) => ({ field, reason }));
    return { missing: checkResult.missing, invalid: [...checkResult.invalid.filter((problem) => !typedProblems.has(problem.field)), ...typedInvalid] };
  }, [formRules, effectiveValues, typedProblems]);

  const updateTypedValue = useCallback((caseField: CaseField, typedValue: string) => {
    if (!formRules) return;
    const typedCheck = validateTypedValue(caseField.field, typedValue, formRules, effectiveValues);
    setTypedProblems((current) => {
      const next = new Map(current);
      if (typedCheck.valid) next.delete(caseField.field); else next.set(caseField.field, typedCheck.reason);
      return next;
    });
    setEditedValues((current) => new Map(current).set(caseField.field, typedValue));
    setCommittedFields((current) => { const next = new Set(current); next.delete(caseField.field); return next; });
  }, [formRules, effectiveValues]);

  const commitField = useCallback(async (caseField: CaseField) => {
    const typedValue = editedValues.get(caseField.field);
    if (typedValue === undefined || committedFields.has(caseField.field) || typedProblems.has(caseField.field)) return;
    setCommittedFields((current) => new Set(current).add(caseField.field));
    const savedDecision = await recordDecision(caseId, caseField.field, "corrected", typedValue);
    caseField.decision = savedDecision;
  }, [caseId, editedValues, committedFields, typedProblems]);

  const commitAllFields = useCallback(async () => {
    for (const caseField of shownFields) if (editedValues.has(caseField.field)) await commitField(caseField);
  }, [shownFields, editedValues, commitField]);

  const restoreField = useCallback(async (caseField: CaseField) => {
    await recordDecision(caseId, caseField.field, "skipped");
    caseField.decision = { kind: "skipped", value: null };
    setEditedValues((current) => { const next = new Map(current); next.delete(caseField.field); return next; });
    setTypedProblems((current) => { const next = new Map(current); next.delete(caseField.field); return next; });
  }, [caseId]);

  return {
    fieldsView, caseSummary, formRules, shownFields, editedValues, effectiveValues, formCheck, loadError,
    updateTypedValue, commitField, commitAllFields, restoreField, reloadFields,
  };
}

export type ReviewSession = ReturnType<typeof useReviewSession>;
