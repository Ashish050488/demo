/** A numbered step title on the New batch screen; the number turns into a tick once the step is done. */
export default function StepHeading({ number, title, isDone }: { number: number; title: string; isDone: boolean }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${isDone ? "bg-brand-500 text-white" : "bg-ink text-white"}`}>{isDone ? "✓" : number}</span>
      {title}
    </div>
  );
}
