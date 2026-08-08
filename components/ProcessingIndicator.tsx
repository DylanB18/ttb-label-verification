"use client";

import { useEffect, useState } from "react";

const SINGLE_STAGES = ["Reading the label image…", "Comparing to the application data…", "Double-checking the warning statement…", "Almost done…"];
const BATCH_STAGES = ["Reading each label image…", "Comparing every label to its application data…", "Checking warning statements…", "Wrapping up the batch…"];

/**
 * Cycles through stage text for as long as it's mounted — deliberately not a
 * countdown/timer, just a progress signal. Mount this conditionally (e.g.
 * `{loading && <ProcessingIndicator />}`) rather than passing an `active`
 * flag, so each run starts cleanly from the first stage.
 */
export default function ProcessingIndicator({ variant = "single" }: { variant?: "single" | "batch" }) {
  const stages = variant === "batch" ? BATCH_STAGES : SINGLE_STAGES;
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, stages.length - 1));
    }, 1100);
    return () => clearInterval(interval);
  }, [stages.length]);

  return (
    <div className="flex items-center gap-3 rounded-lg border-2 border-neutral-300 bg-neutral-50 p-4" role="status" aria-live="polite">
      <span className="h-6 w-6 flex-shrink-0 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" aria-hidden="true" />
      <span className="text-base font-medium text-neutral-700">{stages[stageIndex]}</span>
    </div>
  );
}
