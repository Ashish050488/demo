"use client";
import { useEffect, useState } from "react";
import { fetchForms, getBatchTemplateUrl } from "@/api/forms-api";
import FormCard from "@/components/forms/FormCard";
import { ButtonLink } from "@/components/ui/Button";
import PageContainer from "@/components/ui/PageContainer";
import type { FormSummary } from "@/types/forms";

export default function FormsPage() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  useEffect(() => { fetchForms().then(setForms).catch(() => setForms([])); }, []);
  return (
    <PageContainer title="Form setup" description="See where every field is written on each form, and choose which fields must be filled before a case can be saved."
      actions={<ButtonLink href="/forms/new" variant="primary">+ Add a form</ButtonLink>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {forms.map((form) => (
          <FormCard key={form.formId} form={form} actions={<>
            <ButtonLink href={`/forms/${form.formId}`} size="small" variant="primary">Fields & required</ButtonLink>
            <ButtonLink href={getBatchTemplateUrl(form.formId)} size="small" isExternal>Excel template</ButtonLink>
          </>} />
        ))}
      </div>
    </PageContainer>
  );
}
