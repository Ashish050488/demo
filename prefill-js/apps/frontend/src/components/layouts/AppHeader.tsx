"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAVIGATION_LINKS = [
  { href: "/", label: "Home" },
  { href: "/cases/new", label: "New case" },
  { href: "/forms", label: "Form setup" },
];

export default function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="shrink-0 bg-ink text-white">
      <div className="flex h-11 items-center gap-8 px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight">360 <span className="text-brand-500">ONE</span></span>
          <span className="text-xs text-white/60">Form Prefill</span>
        </Link>
        <nav className="flex items-center gap-5 text-[13px]">
          {NAVIGATION_LINKS.map((navigationLink) => {
            const isActive = navigationLink.href === "/" ? pathname === "/" : pathname.startsWith(navigationLink.href);
            return (
              <Link key={navigationLink.href} href={navigationLink.href}
                className={isActive ? "text-white" : "text-white/60 hover:text-white"}>{navigationLink.label}</Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
