"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchForms } from "@/api/forms-api";
import PageContainer from "@/components/ui/PageContainer";
import type { FormSummary } from "@/types/forms";

export default function FormsPage() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  useEffect(() => { fetchForms().then(setForms).catch(() => setForms([])); }, []);
  return (
    <PageContainer title="Form setup" description="See where every field is written on each form, and choose which fields must be filled before a case can be saved.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {forms.map((form) => (
          <Link key={form.formId} href={`/forms/${form.formId}`} className="rounded-xl border border-line bg-white p-5 transition hover:border-brand-500">
            <div className="font-semibold">{form.shortLabel}</div>
            <div className="mt-1 text-xs text-muted">{form.label}</div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
