import type { VerificationResult } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export default function ResultChecklist({ result }: { result: VerificationResult }) {
  const seconds = (result.elapsedMs / 1000).toFixed(1);
  const withinTarget = result.elapsedMs <= 5000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-neutral-900 p-5">
        <StatusBadge status={result.overallStatus} size="lg" />
        <div className="text-right text-sm text-neutral-600">
          <div>
            Result in <span className={withinTarget ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>{seconds}s</span>
            {!withinTarget && " (over the 5s target)"}
          </div>
          <div>
            Extraction: {result.extractionSource === "ocr" ? "OCR only" : "OCR + AI vision fallback"} (OCR confidence {Math.round(result.ocrConfidence)}%)
          </div>
        </div>
      </div>

      <ul className="space-y-3">
        {result.fields.map((field) => (
          <li key={field.field} className="rounded-lg border border-neutral-300 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-bold">{field.label}</span>
              <StatusBadge status={field.status} />
            </div>
            <dl className="mt-2 grid gap-1 text-sm text-neutral-700 sm:grid-cols-2">
              <div>
                <dt className="inline font-semibold">Application says: </dt>
                <dd className="inline">{field.expected || "—"}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Label says: </dt>
                <dd className="inline">{field.extracted || "(not found)"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-neutral-600">{field.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
