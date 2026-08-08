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
    <div className="flex items-center gap-4 rounded-sm border-2 border-navy/30 bg-paper p-4" role="status" aria-live="polite">
      <span className="flex flex-shrink-0 gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brass [animation-delay:-0.3s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brass [animation-delay:-0.15s]" />
        <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-brass" />
      </span>
      <span className="font-mono text-sm text-ink/80">{stages[stageIndex]}</span>
    </div>
  );
}
