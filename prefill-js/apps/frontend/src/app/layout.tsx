import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppHeader from "@/components/layouts/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Form Prefill",
  description: "Fill nomination forms from identity documents or a batch sheet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
