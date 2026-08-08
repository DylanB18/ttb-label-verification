import type { ReactElement } from "react";
import type { FieldStatus } from "@/lib/types";

const STYLES: Record<FieldStatus, { ink: string; label: string; Icon: (props: { className?: string }) => ReactElement }> = {
  pass: { ink: "var(--stamp-pass)", label: "PASS", Icon: CheckIcon },
  needs_review: { ink: "var(--stamp-review)", label: "NEEDS REVIEW", Icon: FlagIcon },
  fail: { ink: "var(--stamp-fail)", label: "FAIL", Icon: CrossIcon },
};

/**
 * The signature element: the overall verdict renders as a solid, high-contrast
 * status chip — the same status-communication device used across the app,
 * scaled up. `lg` is the filled version used once per result; `md` is an
 * outlined version for the repeated per-field rows so the boldness stays
 * concentrated in one place per result.
 */
export default function StatusBadge({ status, size = "md" }: { status: FieldStatus; size?: "md" | "lg" }) {
  const s = STYLES[status];

  if (size === "lg") {
    return (
      <span
        className="stamp-mark inline-flex items-center gap-2.5 rounded-md px-5 py-2.5 font-sans text-lg font-semibold uppercase tracking-[0.08em] text-paper"
        style={{ backgroundColor: s.ink }}
      >
        <s.Icon className="h-5 w-5" />
        {s.label}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 font-sans text-sm font-semibold uppercase tracking-[0.04em]"
      style={{ color: s.ink, borderColor: s.ink }}
    >
      <s.Icon className="h-3.5 w-3.5" />
      {s.label}
    </span>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 3v14M5 4h9l-2.5 3L14 10H5" />
    </svg>
  );
}
