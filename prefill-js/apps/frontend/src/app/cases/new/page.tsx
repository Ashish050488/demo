"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createCase } from "@/api/cases-api";
import { detectForm, fetchForms } from "@/api/forms-api";
import CaseStepper from "@/components/cases/CaseStepper";
import FormCard from "@/components/forms/FormCard";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import PageContainer from "@/components/ui/PageContainer";
import type { FormSummary } from "@/types/forms";

export default function NewCasePage() {
  const router = useRouter();
  const blankFormInput = useRef<HTMLInputElement>(null);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => { fetchForms().then(setForms).catch((error: Error) => setErrorMessage(error.message)); }, []);

  async function startCase(formId: string) {
    setIsWorking(true);
    setErrorMessage(null);
    try {
      const createdCase = await createCase(formId);
      router.push(`/cases/${createdCase.id}/documents`);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setIsWorking(false);
    }
  }

  async function handleBlankFormChosen(blankFormFile: File | undefined) {
    if (!blankFormFile) return;
    setIsWorking(true);
    setErrorMessage(null);
    try {
      const { formId } = await detectForm(blankFormFile);
      await startCase(formId);
    } catch (error) {
      setErrorMessage((error as Error).message);
      setIsWorking(false);
    }
  }

  return (
    <PageContainer title="Which form?" description="Pick the form, or upload its blank PDF and we recognise it." actions={<CaseStepper currentStep="form" />}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {forms.map((form) => <FormCard key={form.formId} form={form} isDisabled={isWorking} onSelect={() => startCase(form.formId)} />)}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button disabled={isWorking} onClick={() => blankFormInput.current?.click()}>Upload blank form (PDF)</Button>
        <span className="text-xs text-muted">Only its printed title is read; the file is not saved.</span>
        <input ref={blankFormInput} type="file" accept="application/pdf" hidden
          onChange={(event) => { handleBlankFormChosen(event.target.files?.[0]); event.target.value = ""; }} />
      </div>
      {errorMessage ? <div className="mt-4"><Notice tone="error">{errorMessage}</Notice></div> : null}
    </PageContainer>
  );
}
