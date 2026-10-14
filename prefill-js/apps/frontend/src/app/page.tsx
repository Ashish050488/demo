import Link from "next/link";
import PageContainer from "@/components/ui/PageContainer";
import RecentCasesList from "@/components/cases/RecentCasesList";

function ChoiceCard({ href, title, description, badge }: { href?: string; title: string; description: string; badge?: string }) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {badge ? <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs text-muted">{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {href ? <span className="mt-6 inline-block text-sm font-medium text-brand-600">Start →</span> : null}
    </>
  );
  const baseClasses = "block rounded-2xl border border-line bg-white p-6 transition";
  if (!href) return <div className={`${baseClasses} opacity-60`}>{content}</div>;
  return <Link href={href} className={`${baseClasses} hover:border-brand-500 hover:shadow-sm`}>{content}</Link>;
}

export default function HomePage() {
  return (
    <PageContainer title="What do you want to fill?" description="Pick one. Everything is read on this machine.">
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceCard href="/cases/new" title="Single case"
          description="Upload one person's documents (Aadhaar, PAN, passport, driving licence). Fields are read and filled; you review and save." />
        <ChoiceCard title="Batch" badge="Next step"
          description="Upload an Excel or Google Sheet with many users. Each row becomes a filled form, shown as soon as it is ready." />
      </div>
      <RecentCasesList />
    </PageContainer>
  );
}
