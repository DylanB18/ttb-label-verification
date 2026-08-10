import type { LabelFields } from "./types";

const ABV_LINE = /\d+(?:\.\d+)?\s*%/;
const VOLUME_LINE = /\d+(?:\.\d+)?\s*(m\s?l|milliliters?|l(?:iters?)?\b|fl\.?\s?oz\.?|oz\.?)/i;
const WARNING_START = /government\s+warning/i;
// Explanatory phrases that precede the mandatory bottler/producer/importer
// name & address statement (27 CFR 25.141 / 4.35 / 5.36), e.g. "BOTTLED BY
// Old Tom Distillery, Louisville, KY".
const NAME_ADDRESS_START = /^(bottled|packed|filled|distilled|blended|brewed|produced|made|prepared|manufactured|imported)\b.*\bby\b/i;
// Country-of-origin phrasing required only on imports, e.g. "PRODUCT OF
// FRANCE" or "PRODUCED AND BOTTLED IN SCOTLAND".
const COUNTRY_OF_ORIGIN_START = /^(product|produce)\s+of\b|^(produced|brewed|distilled)\s+(in|and)\b/i;

/**
 * Heuristic line-based extraction from raw OCR text. Assumes a typical
 * top-to-bottom label layout: brand name, then class/type, then ABV,
 * net-contents, name/address and country-of-origin lines (in any order
 * amongst themselves), then the warning block last. This is intentionally
 * simple — see README limitations. Low-confidence or missing-field results
 * fall back to the vision extractor. Because everything after the warning
 * starts is swallowed into the warning text, name/address and
 * country-of-origin lines are only recognized if they appear *before* the
 * warning on the label — a known layout assumption, not a general parser.
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
  let nameAddress: string | null = null;
  let countryOfOrigin: string | null = null;
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

    if (!nameAddress && NAME_ADDRESS_START.test(line)) {
      nameAddress = line;
      continue;
    }

    if (!countryOfOrigin && COUNTRY_OF_ORIGIN_START.test(line)) {
      countryOfOrigin = line;
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
    nameAddress,
    countryOfOrigin,
    governmentWarning: warningLines.length > 0 ? warningLines.join(" ") : null,
  };
}

/** Returns true if the OCR pass found every mandatory field and should skip the vision fallback. Country of origin is excluded — it's only mandatory for imports, so a legitimately domestic label will always leave it null. */
export function isExtractionComplete(fields: LabelFields): boolean {
  return Boolean(fields.brandName && fields.classType && fields.alcoholContent && fields.netContents && fields.nameAddress && fields.governmentWarning);
}
