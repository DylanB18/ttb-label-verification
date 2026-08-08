import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTB Label Verification",
  description: "Prototype tool for verifying alcohol beverage labels against application data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        <header className="border-b-4 border-neutral-900 bg-white">
          <div className="mx-auto max-w-4xl px-6 py-5">
            <Link href="/" className="text-2xl font-bold no-underline text-neutral-900">
              TTB Label Verification
            </Link>
            <p className="mt-1 text-base text-neutral-600">Prototype — checks a label image against the application data</p>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-500">
          Standalone prototype. Not connected to COLA.
        </footer>
      </body>
    </html>
  );
}
