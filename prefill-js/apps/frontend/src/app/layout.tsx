import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import AppHeader from "@/components/layouts/AppHeader";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: "360 ONE · Form Prefill",
  description: "Fill nomination forms from identity documents or a batch sheet.",
};

// App shell: exactly one screen tall. The page itself never scrolls - only panels inside it do.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={hankenGrotesk.variable}>
      <body className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        <main className="min-h-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
