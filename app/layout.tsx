import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "TTB Label Verification",
  description: "Prototype tool for verifying alcohol beverage labels against application data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <div className="bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-2 text-sm text-ink/70">
            <FlagIcon className="h-4 w-4 flex-shrink-0 text-navy" />
            <span>A prototype for the U.S. Department of the Treasury</span>
          </div>
        </div>
        <header className="border-b border-ink/10 bg-navy">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brass-light">Alcohol &amp; Tobacco Tax and Trade Bureau — Prototype</p>
            <Link href="/" className="mt-1 block font-serif text-3xl font-semibold no-underline text-paper">
              Label Verification
            </Link>
            <p className="mt-1 text-base text-paper/75">Checks a label image against the application record</p>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-8">{children}</main>
        <footer className="border-t border-ink/10 py-6 text-center text-sm text-ink/60">
          Standalone prototype. Not connected to COLA.
        </footer>
      </body>
    </html>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 2v16" />
      <path d="M4 3h11l-2.2 3L15 9H4" />
    </svg>
  );
}
