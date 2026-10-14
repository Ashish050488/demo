/** A grey placeholder block shown while content loads; size it with className (h-*, w-*). */
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-line/70 ${className}`} />;
}

/** Label + input shaped placeholders, matching the field grid. */
export function FieldSkeletonGrid({ fieldCount = 6 }: { fieldCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4" role="status" aria-label="Loading">
      {Array.from({ length: fieldCount }, (_unused, index) => (
        <div key={index} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-full" /></div>
      ))}
    </div>
  );
}
