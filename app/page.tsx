import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">Select a review type</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/single"
          className="group block rounded-sm border-2 border-navy bg-paper p-8 text-center no-underline text-ink transition-colors hover:border-brass hover:bg-navy/[0.03]"
        >
          <DocumentIcon className="mx-auto h-10 w-10 text-navy group-hover:text-brass" />
          <div className="mt-4 font-serif text-2xl font-semibold text-navy">Check One Label</div>
          <p className="mt-2 text-base text-ink/70">Upload a single label image and enter the application details.</p>
        </Link>

        <Link
          href="/batch"
          className="group block rounded-sm border-2 border-navy bg-paper p-8 text-center no-underline text-ink transition-colors hover:border-brass hover:bg-navy/[0.03]"
        >
          <StackIcon className="mx-auto h-10 w-10 text-navy group-hover:text-brass" />
          <div className="mt-4 font-serif text-2xl font-semibold text-navy">Check a Batch of Labels</div>
          <p className="mt-2 text-base text-ink/70">Upload many label images at once, with a spreadsheet of application details.</p>
        </Link>
      </div>
    </div>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 4h14l6 6v26a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M24 4v6h6" strokeLinecap="round" />
      <path d="M13 20h14M13 25h14M13 30h9" strokeLinecap="round" />
    </svg>
  );
}

function StackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 9h16l5 5v18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z" />
      <path d="M25 9v5h5" strokeLinecap="round" />
      <path d="M13 22h12M13 27h12" strokeLinecap="round" />
      <path d="M14 5h13l5 5" strokeLinecap="round" />
    </svg>
  );
}
