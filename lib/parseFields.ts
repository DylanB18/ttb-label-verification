import type { LabelFields } from "./types";

const ABV_LINE = /\d+(?:\.\d+)?\s*%/;
const VOLUME_LINE = /\d+(?:\.\d+)?\s*(m\s?l|milliliters?|l(?:iters?)?\b|fl\.?\s?oz\.?|oz\.?)/i;
const WARNING_START = /government\s+warning/i;

/**
 * Heuristic line-based extraction from raw OCR text. Assumes a typical
 * top-to-bottom label layout: brand name, then class/type, then ABV and
 * net-contents lines (in either order), then the warning block last. This
 * is intentionally simple — see README limitations. Low-confidence or
 * missing-field results fall back to the vision extractor.
 */
export function parseFieldsFromOcrText(rawText: string): LabelFields {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let brandName: string | null = null;
  let classType: string | null = null;
  let alcoholContent: string | null = null;
  let netContents: string | null = null;
  const warningLines: string[] = [];
  let inWarning = false;

  for (const line of lines) {
    if (inWarning) {
      warningLines.push(line);
      continue;
    }

    if (WARNING_START.test(line)) {
      inWarning = true;
      warningLines.push(line);
      continue;
    }

    if (ABV_LINE.test(line)) {
      alcoholContent = line;
      continue;
    }

    if (VOLUME_LINE.test(line)) {
      netContents = line;
      continue;
    }

    if (!brandName) {
      brandName = line;
    } else if (!classType) {
      classType = line;
    }
  }

  return {
    brandName,
    classType,
    alcoholContent,
    netContents,
    governmentWarning: warningLines.length > 0 ? warningLines.join(" ") : null,
  };
}

/** Returns true if the OCR pass found every field and should skip the vision fallback. */
export function isExtractionComplete(fields: LabelFields): boolean {
  return Boolean(fields.brandName && fields.classType && fields.alcoholContent && fields.netContents && fields.governmentWarning);
}
