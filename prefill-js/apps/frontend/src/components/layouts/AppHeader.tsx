import Link from "next/link";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-sm text-white">P</span>
          Form Prefill
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/" className="hover:text-ink">Home</Link>
          <Link href="/cases/new" className="hover:text-ink">New case</Link>
          <Link href="/forms" className="hover:text-ink">Form setup</Link>
        </nav>
      </div>
    </header>
  );
}
