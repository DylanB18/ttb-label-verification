"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import ProcessingIndicator from "@/components/ProcessingIndicator";
import { MAX_BATCH_IMAGES, MAX_IMAGE_BYTES } from "@/lib/limits";
import type { BatchResultRow } from "@/lib/types";

export default function BatchLabelPage() {
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResultRow[] | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manifestFile) {
      setError("Please upload a manifest CSV or JSON file.");
      return;
    }
    if (imageFiles.length === 0) {
      setError("Please choose at least one label image.");
      return;
    }
    if (imageFiles.length > MAX_BATCH_IMAGES) {
      setError(`Batches are limited to ${MAX_BATCH_IMAGES} images at a time in this prototype. You selected ${imageFiles.length}.`);
      return;
    }
    const oversized = imageFiles.find((f) => f.size > MAX_IMAGE_BYTES);
    if (oversized) {
      setError(`"${oversized.name}" is too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB per image).`);
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const manifestText = await manifestFile.text();
      const form = new FormData();
      form.set("manifest", manifestText);
      for (const file of imageFiles) form.append("images", file);

      const res = await fetch("/api/batch", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResults(data.results as BatchResultRow[]);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadResultsCsv() {
    if (!results) return;
    const header = "fileName,overallStatus,field,expected,extracted,fieldStatus,reason";
    const rows: string[] = [];
    for (const row of results) {
      if (row.fields.length === 0) {
        rows.push(csvLine([row.fileName, row.overallStatus, "", "", "", "", row.error ?? ""]));
        continue;
      }
      for (const field of row.fields) {
        rows.push(csvLine([row.fileName, row.overallStatus, field.label, field.expected, field.extracted ?? "", field.status, field.reason]));
      }
    }
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "label-verification-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = results
    ? {
        pass: results.filter((r) => r.overallStatus === "pass").length,
        needsReview: results.filter((r) => r.overallStatus === "needs_review").length,
        fail: results.filter((r) => r.overallStatus === "fail").length,
      }
    : null;

  return (
    <div className="space-y-8">
      <Link href="/" className="text-blue-700 underline">
        ← Back
      </Link>
      <h1 className="text-3xl font-bold">Check a Batch of Labels</h1>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="block text-lg font-semibold mb-2" htmlFor="manifest">
            1. Application details (CSV or JSON)
          </label>
          <p className="text-sm text-neutral-600 mb-2">
            One row per label, with a <code>fileName</code> that matches an uploaded image&apos;s file name.{" "}
            <a href="/batch-template.csv" download className="text-blue-700 underline">
              Download a template CSV
            </a>
            .
          </p>
          <input
            id="manifest"
            type="file"
            accept=".csv,.json,text/csv,application/json"
            required
            onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)}
            className="block w-full rounded-lg border-2 border-neutral-400 p-3 text-base"
          />
        </div>

        <div>
          <label className="block text-lg font-semibold mb-2" htmlFor="images">
            2. Label images
          </label>
          <p className="text-sm text-neutral-600 mb-2">Up to {MAX_BATCH_IMAGES} images per batch in this prototype.</p>
          <input
            id="images"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            required
            onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
            className="block w-full rounded-lg border-2 border-neutral-400 p-3 text-base"
          />
          {imageFiles.length > 0 && <p className="mt-2 text-sm text-neutral-600">{imageFiles.length} image(s) selected.</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-neutral-900 py-4 text-xl font-bold text-white disabled:opacity-50"
        >
          {loading ? "Checking labels… this can take a bit for large batches" : "Check Batch"}
        </button>
      </form>

      {loading && <ProcessingIndicator variant="batch" />}

      {error && <p className="rounded-lg bg-red-100 p-4 text-red-900 font-semibold">{error}</p>}

      {results && summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-neutral-900 p-5">
            <div className="text-lg font-semibold">
              {results.length} labels checked — {summary.pass} pass, {summary.needsReview} need review, {summary.fail} fail
            </div>
            <button onClick={downloadResultsCsv} className="rounded-lg border-2 border-neutral-900 px-4 py-2 font-semibold hover:bg-neutral-100">
              Download results CSV
            </button>
          </div>

          <ul className="space-y-3">
            {results.map((row) => (
              <li key={row.fileName} className="rounded-lg border border-neutral-300 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm">{row.fileName}</span>
                  <StatusBadge status={row.overallStatus} />
                </div>
                {row.error && <p className="mt-2 text-sm text-red-700">{row.error}</p>}
                {row.fields.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-blue-700 underline">Show field details</summary>
                    <ul className="mt-2 space-y-2">
                      {row.fields.map((field) => (
                        <li key={field.field} className="text-sm">
                          <span className="font-semibold">{field.label}:</span> <StatusBadge status={field.status} />
                          <div className="text-neutral-600">
                            Application: {field.expected || "—"} · Label: {field.extracted || "(not found)"} · {field.reason}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function csvLine(values: string[]): string {
  return values.map((v) => `"${(v ?? "").replace(/"/g, '""')}"`).join(",");
}
