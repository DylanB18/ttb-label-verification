"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import ResultChecklist from "@/components/ResultChecklist";
import ProcessingIndicator from "@/components/ProcessingIndicator";
import { SAMPLE_LABELS, type SampleLabel } from "@/lib/sampleLabels";
import { MAX_IMAGE_BYTES } from "@/lib/limits";
import type { VerificationResult } from "@/lib/types";

export default function SingleLabelPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState("");
  const [classType, setClassType] = useState("");
  const [alcoholContent, setAlcoholContent] = useState("");
  const [netContents, setNetContents] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);

  function onImageChange(file: File | null) {
    setResult(null);
    setActiveSample(null);
    setError(null);

    if (file && file.size > MAX_IMAGE_BYTES) {
      setError(`That image is too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB). Please choose a smaller file.`);
      setImageFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }

    setImageFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function loadSample(sample: SampleLabel) {
    setError(null);
    setResult(null);
    const res = await fetch(sample.imagePath);
    const blob = await res.blob();
    const file = new File([blob], sample.fileName, { type: blob.type });

    setImageFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setBrandName(sample.expected.brandName);
    setClassType(sample.expected.classType);
    setAlcoholContent(sample.expected.alcoholContent);
    setNetContents(sample.expected.netContents);
    setActiveSample(sample.fileName);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!imageFile) {
      setError("Please choose a label image.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.set("image", imageFile);
      form.set("brandName", brandName);
      form.set("classType", classType);
      form.set("alcoholContent", alcoholContent);
      form.set("netContents", netContents);

      const res = await fetch("/api/verify", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again with a clear, well-lit photo of the label.");
        return;
      }
      setResult(data as VerificationResult);
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <Link href="/" className="text-navy underline decoration-brass decoration-2 underline-offset-2">
        ← Back
      </Link>
      <h1 className="font-serif text-3xl font-semibold text-navy">Check One Label</h1>

      <div className="rounded-sm border-2 border-brass/50 bg-brass/[0.06] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-brass">No label handy? Try a sample</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_LABELS.map((sample) => (
            <button
              key={sample.fileName}
              type="button"
              onClick={() => loadSample(sample)}
              className={`rounded-sm border-2 px-3 py-2 text-sm font-semibold transition-colors ${
                activeSample === sample.fileName ? "border-navy bg-navy text-paper" : "border-navy bg-paper text-navy hover:bg-navy/[0.06]"
              }`}
            >
              {sample.description}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-ink/60" htmlFor="image">
            1 — Label image
          </label>
          <input
            id="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => onImageChange(e.target.files?.[0] ?? null)}
            className="block w-full rounded-sm border-2 border-navy/40 bg-paper p-3 text-base"
          />
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Label preview" className="mt-3 max-h-72 rounded-sm border border-navy/30" />
          )}
        </div>

        <fieldset className="space-y-4 rounded-sm border-2 border-navy/40 p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">2 — What the application says</legend>

          <Field id="brandName" label="Brand Name" value={brandName} onChange={setBrandName} placeholder="e.g. Old Tom Distillery" />
          <Field id="classType" label="Class / Type" value={classType} onChange={setClassType} placeholder="e.g. Kentucky Straight Bourbon Whiskey" />
          <Field id="alcoholContent" label="Alcohol Content" value={alcoholContent} onChange={setAlcoholContent} placeholder="e.g. 45%" />
          <Field id="netContents" label="Net Contents" value={netContents} onChange={setNetContents} placeholder="e.g. 750 mL" />
          <p className="text-sm text-ink/60">
            The government warning statement is checked automatically against the required federal wording — no need to enter it.
          </p>
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-sm bg-navy py-4 text-xl font-semibold text-paper transition-colors hover:bg-navy-dark disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check Label"}
        </button>
      </form>

      {loading && <ProcessingIndicator />}

      {error && <p className="rounded-sm border-2 border-stamp-fail/40 bg-stamp-fail/[0.06] p-4 font-semibold text-stamp-fail">{error}</p>}
      {result && <ResultChecklist result={result} />}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold mb-1 text-ink">
        {label}
      </label>
      <input
        id={id}
        type="text"
        required
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-sm border-2 border-navy/40 bg-paper p-3 font-mono text-base"
      />
    </div>
  );
}
