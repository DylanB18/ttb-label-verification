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
        <header className="border-b-2 border-navy bg-paper">
          <div className="mx-auto max-w-4xl px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">Alcohol &amp; Tobacco Tax and Trade Bureau — Prototype</p>
            <Link href="/" className="mt-1 block font-serif text-3xl font-semibold italic no-underline text-navy">
              Label Verification
            </Link>
            <p className="mt-1 text-base text-ink/70">Checks a label image against the application record</p>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-8">{children}</main>
        <footer className="border-t border-navy/20 py-6 text-center text-sm text-ink/60">
          Standalone prototype. Not connected to COLA.
        </footer>
      </body>
    </html>
  );
}
