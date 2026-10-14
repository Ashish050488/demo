import Link from "next/link";
import PageContainer from "@/components/ui/PageContainer";
import RecentCasesList from "@/components/cases/RecentCasesList";
import RecentBatchesList from "@/components/batches/RecentBatchesList";

function ChoiceCard({ href, title, description, badge }: { href?: string; title: string; description: string; badge?: string }) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {badge ? <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs text-muted">{badge}</span> : null}
      </div>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {href ? <span className="mt-4 inline-block text-sm font-medium text-brand-600">Start →</span> : null}
    </>
  );
  const baseClasses = "block rounded-xl border border-line bg-white p-5 transition";
  if (!href) return <div className={`${baseClasses} opacity-60`}>{content}</div>;
  return <Link href={href} className={`${baseClasses} hover:border-brand-500 hover:shadow-sm`}>{content}</Link>;
}

export default function HomePage() {
  return (
    <PageContainer title="What do you want to fill?"
      description="Documents are read on this machine. Confirmed cases are saved to your Google Sheet (Aadhaar last 4 only, never PAN).">
      <div className="grid h-full gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-4">
          <ChoiceCard href="/cases/new" title="Single case"
            description="Upload one person's documents (Aadhaar, PAN, passport, driving licence). Fields are read and filled; you review and save." />
          <ChoiceCard href="/batches/new" title="Batch"
            description="Upload one Excel with up to 50 clients plus a folder of their documents. Each row becomes a filled form, shown live as soon as it is ready." />
          <RecentBatchesList />
        </div>
        <RecentCasesList />
      </div>
    </PageContainer>
  );
}
