import type { FieldStatus } from "@/lib/types";

const STYLES: Record<FieldStatus, { bg: string; text: string; icon: string; label: string }> = {
  pass: { bg: "bg-green-100", text: "text-green-900", icon: "✅", label: "PASS" },
  needs_review: { bg: "bg-amber-100", text: "text-amber-900", icon: "⚠️", label: "NEEDS REVIEW" },
  fail: { bg: "bg-red-100", text: "text-red-900", icon: "❌", label: "FAIL" },
};

export default function StatusBadge({ status, size = "md" }: { status: FieldStatus; size?: "md" | "lg" }) {
  const s = STYLES[status];
  const sizeClasses = size === "lg" ? "text-2xl px-5 py-3" : "text-base px-3 py-1";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-bold ${s.bg} ${s.text} ${sizeClasses}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}
