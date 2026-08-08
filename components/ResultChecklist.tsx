import type { VerificationResult } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export default function ResultChecklist({ result }: { result: VerificationResult }) {
  const seconds = (result.elapsedMs / 1000).toFixed(1);
  const withinTarget = result.elapsedMs <= 5000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border-2 border-navy bg-paper p-6">
        <StatusBadge status={result.overallStatus} size="lg" />
        <div className="text-right font-mono text-xs text-ink/70">
          <div>
            RESULT IN <span className={withinTarget ? "font-semibold text-stamp-pass" : "font-semibold text-stamp-fail"}>{seconds}s</span>
            {!withinTarget && " (over 5s target)"}
          </div>
          <div>
            {result.extractionSource === "ocr" ? "OCR ONLY" : "OCR + AI VISION"} · CONFIDENCE {Math.round(result.ocrConfidence)}%
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {result.fields.map((field) => (
          <li key={field.field} className="rounded-sm border border-navy/25 bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-serif text-lg font-semibold text-navy">{field.label}</span>
              <StatusBadge status={field.status} />
            </div>
            <dl className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-ink/50">Application says</dt>
                <dd className="text-ink">{field.expected || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-ink/50">Label says</dt>
                <dd className="text-ink">{field.extracted || "(not found)"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-ink/70">{field.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
