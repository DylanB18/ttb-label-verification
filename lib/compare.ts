import { CANONICAL_GOVERNMENT_WARNING, type BeverageType, type ExpectedFields, type FieldResult, type FieldStatus, type LabelFields, type WarningFormatCheck } from "./types";

/** Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 1.0 = identical, 0.0 = completely different. */
function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Lowercase, strip punctuation, collapse whitespace — for fuzzy text comparison. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse whitespace/newlines only — preserves case for exact comparisons. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const TEXT_MATCH_THRESHOLD = 0.85;

// Words common in legal/business names or connective text that shouldn't by
// themselves block an abbreviation match (e.g. "Dolin" vs "MAISON DOLIN & CIE").
const ABBREVIATION_STOPWORDS = new Set(["the", "a", "an", "of", "de", "la", "le", "and", "co", "inc", "llc", "ltd", "company", "cie"]);

function significantWords(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((w) => w.length > 0 && !ABBREVIATION_STOPWORDS.has(w));
}

/**
 * True if one value's significant words are a subset of the other's — e.g.
 * "Vermouth" vs "Vermouth de Chambéry", or "Dolin" vs "Maison Dolin & Cie".
 * Name/class fields may legitimately be shortened on the label vs. the
 * application, so these are treated as matches (flagged, not failed). This
 * also covers the opposite shape — label text *longer* than the application
 * value because it carries an explanatory phrase the application doesn't
 * (e.g. name/address "BOTTLED BY Old Tom Distillery..." vs application "Old
 * Tom Distillery...", or country of origin "PRODUCT OF FRANCE" vs "France")
 * — since the check only requires the shorter side's words to all appear in
 * the longer side, regardless of which one is the label.
 */
function isAbbreviationMatch(a: string, b: string): boolean {
  const wordsA = significantWords(a);
  const wordsB = significantWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const longerSet = new Set(longer);
  return shorter.every((w) => longerSet.has(w));
}

type TextMatchKind = "exact" | "subset" | "fuzzy" | "none";

function matchText(expected: string, extracted: string): { kind: TextMatchKind; similarity: number } {
  const normExpected = normalizeText(expected);
  const normExtracted = normalizeText(extracted);

  if (normExpected === normExtracted) return { kind: "exact", similarity: 1 };
  if (isAbbreviationMatch(normExpected, normExtracted)) return { kind: "subset", similarity: 1 };

  const similarity = similarityRatio(normExpected, normExtracted);
  if (similarity >= TEXT_MATCH_THRESHOLD) return { kind: "fuzzy", similarity };
  return { kind: "none", similarity };
}

function compareTextField(
  field: FieldResult["field"],
  label: string,
  expected: string,
  extracted: string | null,
): FieldResult {
  if (!extracted) {
    return { field, label, expected, extracted, status: "fail", reason: `${label} was not found on the label.` };
  }

  const { kind, similarity } = matchText(expected, extracted);

  if (kind === "exact") {
    return { field, label, expected, extracted, status: "pass", reason: "Matches application exactly (case/punctuation-insensitive)." };
  }

  if (kind === "subset") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "pass",
      reason: "Shortened/abbreviated form of the application value (e.g. dropped a qualifier or legal suffix) — not meaningfully different. Flagged for awareness, but passed.",
    };
  }

  if (kind === "fuzzy") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: `Close match (${Math.round(similarity * 100)}% similar) but not identical — likely a minor variant (capitalization, punctuation). Flagged for agent judgment.`,
    };
  }

  return {
    field,
    label,
    expected,
    extracted,
    status: "fail",
    reason: `Label text does not match the application (only ${Math.round(similarity * 100)}% similar).`,
  };
}

/**
 * Bottler/producer/importer name & address (27 CFR 25.141 malt beverages,
 * 4.35 wine, 5.36 spirits) — mandatory on every beverage type, unlike the
 * other new fields below which are conditional. The label text almost
 * always carries a preceding explanatory phrase the application value
 * won't ("BOTTLED BY ...", "IMPORTED BY ...") — `matchText`'s subset check
 * handles that for free since it only requires the application's words to
 * all appear somewhere in the label's, regardless of extra words around them.
 */
function compareNameAddress(expected: string, extracted: string | null): FieldResult {
  const field = "nameAddress" as const;
  const label = "Name & Address";

  if (!extracted) {
    return { field, label, expected, extracted, status: "fail", reason: "A bottler/producer/importer name & address statement was not found on the label." };
  }

  const { kind, similarity } = matchText(expected, extracted);

  if (kind === "exact") {
    return { field, label, expected, extracted, status: "pass", reason: "Matches application exactly (case/punctuation-insensitive)." };
  }
  if (kind === "subset") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "pass",
      reason: "Label includes the expected name and address, typically alongside a preceding explanatory phrase (e.g. \"BOTTLED BY\", \"IMPORTED BY\") the application value doesn't carry — not a meaningful difference.",
    };
  }
  if (kind === "fuzzy") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: `Close match (${Math.round(similarity * 100)}% similar) but not identical — flagged for agent judgment.`,
    };
  }
  return {
    field,
    label,
    expected,
    extracted,
    status: "fail",
    reason: `Label's name/address statement does not match the application (only ${Math.round(similarity * 100)}% similar).`,
  };
}

/**
 * Country of origin (19 CFR 134.11 / TTB's mandatory-label chapters) is only
 * required for imports — applicants declare import status explicitly
 * (`ExpectedFields.isImport`) since a photo alone can't reliably tell
 * domestic from imported. Domestic products skip the check entirely rather
 * than being penalized for the label correctly omitting it.
 */
function compareCountryOfOrigin(isImport: boolean, expected: string, extracted: string | null): FieldResult {
  const field = "countryOfOrigin" as const;
  const label = "Country of Origin";

  if (!isImport) {
    return {
      field,
      label,
      expected: "(not required — domestic)",
      extracted,
      status: "pass",
      reason: "Not required — product marked as domestic on the application.",
    };
  }

  if (!expected) {
    return {
      field,
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: "Application marked this product as an import but didn't supply an expected country of origin — please verify manually.",
    };
  }

  if (!extracted) {
    return { field, label, expected, extracted, status: "fail", reason: "Product is marked as an import, but no country-of-origin statement was found on the label." };
  }

  const { kind, similarity } = matchText(expected, extracted);

  if (kind === "exact" || kind === "subset") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "pass",
      reason: kind === "exact" ? "Matches application exactly." : "Label states the expected country, typically alongside a phrase like \"PRODUCT OF\" — matches.",
    };
  }
  if (kind === "fuzzy") {
    return {
      field,
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: `Close match (${Math.round(similarity * 100)}% similar) but not identical — flagged for agent judgment.`,
    };
  }
  return { field, label, expected, extracted, status: "fail", reason: "Label's country-of-origin statement does not match the application." };
}

function parseAbvPercent(text: string): number | null {
  const withPercent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (withPercent) return parseFloat(withPercent[1]);

  // Application data entered as a bare number (e.g. "45" instead of "45%") — this
  // field only ever represents a percentage, so treat a lone number the same way.
  const bareNumber = text.trim().match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber) return parseFloat(bareNumber[1]);

  return null;
}

/**
 * ABV tolerance is not a single federal number — it varies by beverage type
 * and, for spirits, by container size:
 * - Beer: ±0.3 percentage points (27 CFR 25.71 area). The regs also impose
 *   an asymmetric one-directional bound for beverages labeled "low
 *   alcohol"/"reduced alcohol"/"non-alcoholic" (actual content may not
 *   exceed a hard ceiling regardless of the stated tolerance) — not modeled
 *   here; this only applies the general symmetric tolerance.
 * - Wine: ±1 point above 14% ABV, ±1.5 points at or below 14% (27 CFR 4.36).
 *   Labels may alternatively state a range (e.g. "9%-12%"); range parsing
 *   isn't implemented — `parseAbvPercent` will only pick up the first
 *   number in that case, a known simplification.
 * - Spirits: ±0.25 points for 50mL/100mL containers (or high-solids
 *   products, which aren't detectable from a photo and so aren't modeled),
 *   else ±0.15 points (27 CFR 5.37 area).
 */
function computeAbvTolerance(beverageType: BeverageType, expectedPct: number, extractedNetContents: string | null): number {
  if (beverageType === "beer") return 0.3;
  if (beverageType === "wine") return expectedPct > 14 ? 1 : 1.5;

  const vol = extractedNetContents ? parseNetContents(extractedNetContents) : null;
  const isMiniBottle = vol !== null && (Math.abs(vol.valueMl - 50) <= VOLUME_TOLERANCE_ML || Math.abs(vol.valueMl - 100) <= VOLUME_TOLERANCE_ML);
  return isMiniBottle ? 0.25 : 0.15;
}

const WINE_ABV_EXEMPTION_CEILING = 14;

function compareAbv(
  beverageType: BeverageType,
  expected: string,
  extracted: string | null,
  extractedClassType: string | null,
  extractedNetContents: string | null,
): FieldResult {
  const field = "alcoholContent" as const;
  const label = "Alcohol Content";
  const expectedPct = parseAbvPercent(expected);

  if (!extracted) {
    if (beverageType === "beer") {
      return {
        field,
        label,
        expected,
        extracted,
        status: "pass",
        reason: "Alcohol content disclosure is optional for malt beverages under federal law (27 CFR 25.71) unless required by state law, which isn't evaluated here.",
      };
    }

    if (beverageType === "wine" && expectedPct !== null && expectedPct <= WINE_ABV_EXEMPTION_CEILING) {
      const normClassType = normalizeText(extractedClassType ?? "");
      if (normClassType.includes("table wine") || normClassType.includes("light wine")) {
        return {
          field,
          label,
          expected,
          extracted,
          status: "pass",
          reason: `Numeric alcohol content is optional for wine at or below ${WINE_ABV_EXEMPTION_CEILING}% ABV when the class/type reads "Table Wine" or "Light Wine" (27 CFR 4.36) — application ABV (${expectedPct}%) qualifies, and the label's class/type ("${extractedClassType}") uses the exempting designation.`,
        };
      }
      return {
        field,
        label,
        expected,
        extracted,
        status: "needs_review",
        reason: `Alcohol content was not found on the label. Wine at or below ${WINE_ABV_EXEMPTION_CEILING}% ABV may omit it only when the class/type designation reads "Table Wine" or "Light Wine" — the extracted class/type ("${extractedClassType ?? "not found"}") doesn't clearly show that, so please verify manually.`,
      };
    }

    return { field, label, expected, extracted, status: "fail", reason: "Alcohol content was not found on the label." };
  }

  const extractedPct = parseAbvPercent(extracted);

  if (expectedPct === null || extractedPct === null) {
    return {
      field,
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: "Could not parse a numeric ABV percentage from one of the values — please check manually.",
    };
  }

  const tolerance = computeAbvTolerance(beverageType, expectedPct, extractedNetContents);

  if (Math.abs(expectedPct - extractedPct) <= tolerance) {
    return {
      field,
      label,
      expected,
      extracted,
      status: "pass",
      reason: `Label ABV (${extractedPct}%) matches application (${expectedPct}%) within the ${tolerance} percentage-point tolerance for ${beverageType}.`,
    };
  }

  return {
    field,
    label,
    expected,
    extracted,
    status: "fail",
    reason: `Label ABV (${extractedPct}%) does not match application (${expectedPct}%) — outside the ${tolerance} percentage-point tolerance for ${beverageType}.`,
  };
}

interface ParsedVolume {
  valueMl: number;
  raw: string;
}

function parseNetContents(text: string): ParsedVolume | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(m ?l|milliliters?|l(?:iters?)?\b|fl\.?\s?oz\.?|oz\.?)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");

  let valueMl: number;
  if (unit.startsWith("ml") || unit.startsWith("milliliter")) {
    valueMl = value;
  } else if (unit.startsWith("l")) {
    valueMl = value * 1000;
  } else if (unit.startsWith("floz") || unit.startsWith("oz")) {
    valueMl = value * 29.5735;
  } else {
    return null;
  }
  return { valueMl, raw: text };
}

const VOLUME_TOLERANCE_ML = 1;

function compareNetContents(expected: string, extracted: string | null): FieldResult {
  const label = "Net Contents";
  if (!extracted) {
    return { field: "netContents", label, expected, extracted, status: "fail", reason: "Net contents was not found on the label." };
  }

  const expectedVol = parseNetContents(expected);
  const extractedVol = parseNetContents(extracted);

  if (!expectedVol || !extractedVol) {
    return {
      field: "netContents",
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: "Could not parse a volume + unit from one of the values — please check manually.",
    };
  }

  if (Math.abs(expectedVol.valueMl - extractedVol.valueMl) <= VOLUME_TOLERANCE_ML) {
    return { field: "netContents", label, expected, extracted, status: "pass", reason: "Label net contents matches application." };
  }

  return {
    field: "netContents",
    label,
    expected,
    extracted,
    status: "fail",
    reason: `Label net contents (${extractedVol.valueMl}mL) does not match application (${expectedVol.valueMl}mL).`,
  };
}

// Current federal metric standards of fill (mL). Beer has none. Wine's list
// covers containers up to 3L (27 CFR 4.72); 500mL was authorized for
// spirits only until June 30, 1989 and is handled as a separate legacy case
// below rather than folded into the "current" list.
const WINE_STANDARD_FILL_ML = [50, 100, 187, 375, 500, 750, 1000, 1500, 3000];
const SPIRITS_STANDARD_FILL_ML = [50, 100, 200, 355, 375, 750, 1000, 1750];
const SPIRITS_LEGACY_FILL_ML = 500;
const WINE_BULK_CONTAINER_MIN_ML = 4000;
const WINE_UNRESTRICTED_CONTAINER_MIN_ML = 18000;

/**
 * Legal container size ("standard of fill") is a pass/fail check
 * independent of what the applicant declared — it flags an illegal bottle
 * size even if the label and application agree with each other. Beer has no
 * federal standard of fill (any size is permitted); wine and spirits are
 * each restricted to a fixed list of metric sizes, with wine additionally
 * requiring whole-liter fills for 4-17L bulk containers and having no
 * restriction at all at 18L+. Doesn't model headspace/fill-level physical
 * requirements (27 CFR 4.71) — not recoverable from a photo.
 */
function compareStandardOfFill(beverageType: BeverageType, extractedNetContents: string | null): FieldResult {
  const field = "standardOfFill" as const;
  const label = "Standard of Fill";

  if (beverageType === "beer") {
    return {
      field,
      label,
      expected: "No federal standard of fill for malt beverages",
      extracted: extractedNetContents,
      status: "pass",
      reason: "Malt beverages may be bottled or packed in any size container under federal law — no standard of fill applies.",
    };
  }

  const parsed = extractedNetContents ? parseNetContents(extractedNetContents) : null;
  const expectedDescription =
    beverageType === "wine"
      ? "One of the metric wine standards of fill (27 CFR 4.72): 50, 100, 187, 375, 500, 750, 1000, 1500, or 3000 mL (or a whole-liter size for 4-17L containers)"
      : "One of the metric distilled spirits standards of fill: 50, 100, 200, 375, 750, 1000, or 1750 mL";

  if (!parsed) {
    return {
      field,
      label,
      expected: expectedDescription,
      extracted: extractedNetContents,
      status: "needs_review",
      reason: "Could not parse a container size from the label's net contents to check it against the legal standards of fill.",
    };
  }

  if (beverageType === "spirits") {
    const isStandard = SPIRITS_STANDARD_FILL_ML.some((ml) => Math.abs(ml - parsed.valueMl) <= VOLUME_TOLERANCE_ML);
    if (isStandard) {
      return { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "pass", reason: "Container size matches a current metric standard of fill for distilled spirits." };
    }
    if (Math.abs(parsed.valueMl - SPIRITS_LEGACY_FILL_ML) <= VOLUME_TOLERANCE_ML) {
      return {
        field,
        label,
        expected: expectedDescription,
        extracted: extractedNetContents,
        status: "needs_review",
        reason: "500 mL was only an authorized standard of fill for spirits until June 30, 1989. Confirm this is pre-1989 stock with supporting bottling documentation — otherwise it's not a current legal size.",
      };
    }
    return { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "fail", reason: `Container size (${parsed.valueMl}mL) does not match a current metric standard of fill for distilled spirits.` };
  }

  // wine
  if (parsed.valueMl < WINE_BULK_CONTAINER_MIN_ML) {
    const isStandard = WINE_STANDARD_FILL_ML.some((ml) => Math.abs(ml - parsed.valueMl) <= VOLUME_TOLERANCE_ML);
    return isStandard
      ? { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "pass", reason: "Container size matches a current metric standard of fill for wine." }
      : { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "fail", reason: `Container size (${parsed.valueMl}mL) does not match a current metric standard of fill for wine.` };
  }
  if (parsed.valueMl < WINE_UNRESTRICTED_CONTAINER_MIN_ML) {
    const isWholeLiter = Math.abs(parsed.valueMl % 1000) <= VOLUME_TOLERANCE_ML;
    return isWholeLiter
      ? { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "pass", reason: "Wine packed in a 4-17L container is expressed in whole liters, as required." }
      : { field, label, expected: expectedDescription, extracted: extractedNetContents, status: "fail", reason: "Wine packed in containers of 4-17 liters must be filled and expressed in even liters (e.g. 4, 5, 6 liters)." };
  }
  return {
    field,
    label,
    expected: expectedDescription,
    extracted: extractedNetContents,
    status: "pass",
    reason: "Wine packed in containers of 18 liters or more has no metric standard-of-fill restriction.",
  };
}

function compareGovernmentWarning(extracted: string | null): FieldResult {
  const label = "Government Warning";
  const expected = CANONICAL_GOVERNMENT_WARNING;

  if (!extracted) {
    return {
      field: "governmentWarning",
      label,
      expected,
      extracted,
      status: "fail",
      reason: "Government warning statement was not found on the label.",
    };
  }

  const normExtracted = normalizeWhitespace(extracted);

  if (normExtracted === expected) {
    return { field: "governmentWarning", label, expected, extracted, status: "pass", reason: "Warning statement matches the required federal text exactly." };
  }

  // Same wording, wrong case somewhere (most commonly the "GOVERNMENT WARNING:" lead-in not in all caps).
  if (normExtracted.toLowerCase() === expected.toLowerCase()) {
    const leadInOk = normExtracted.startsWith("GOVERNMENT WARNING:");
    return {
      field: "governmentWarning",
      label,
      expected,
      extracted,
      status: "fail",
      reason: leadInOk
        ? "Warning wording is correct, but capitalization elsewhere doesn't match the required text."
        : "\"GOVERNMENT WARNING:\" must appear in all caps — label does not match required capitalization.",
    };
  }

  return {
    field: "governmentWarning",
    label,
    expected,
    extracted,
    status: "fail",
    reason: "Warning statement text does not match the required federal wording word-for-word.",
  };
}

const WARNING_FORMAT_EXPECTED = '"GOVERNMENT WARNING:" in bold, rest of the statement not bold, visually set off from other label text';

/**
 * Bold lead-in / non-bold body / visual separation can't be read from OCR
 * text — this is a judgment call about the image itself, so `check` always
 * comes from a vision model call (see lib/visionExtract.ts). `check` is
 * null when that call wasn't made or failed, which is flagged for manual
 * review rather than silently skipped.
 */
function compareWarningFormatting(check: WarningFormatCheck | null): FieldResult {
  const field = "governmentWarningFormat" as const;
  const label = "Warning Formatting";

  if (!check) {
    return {
      field,
      label,
      expected: WARNING_FORMAT_EXPECTED,
      extracted: null,
      status: "needs_review",
      reason: "Formatting could not be checked automatically — please confirm visually that \"GOVERNMENT WARNING:\" is bold and the statement is set off from other label text.",
    };
  }

  const { boldLeadIn, restNotBold, visuallySeparated, notes } = check;

  if (boldLeadIn === null || restNotBold === null || visuallySeparated === null) {
    return {
      field,
      label,
      expected: WARNING_FORMAT_EXPECTED,
      extracted: notes,
      status: "fail",
      reason: "The government warning wasn't visible clearly enough on the label to assess its formatting.",
    };
  }

  if (boldLeadIn && restNotBold && visuallySeparated) {
    return {
      field,
      label,
      expected: WARNING_FORMAT_EXPECTED,
      extracted: notes ?? "Bold lead-in, rest not bold, visually set off from other text.",
      status: "pass",
      reason: "Warning lead-in is bold, the rest of the statement is not, and it's visually set off from other label text.",
    };
  }

  const problems: string[] = [];
  if (!boldLeadIn) problems.push('"GOVERNMENT WARNING:" is not in bold type');
  if (!restNotBold) problems.push("the rest of the statement also appears bold (only the lead-in should be)");
  if (!visuallySeparated) problems.push("the statement is not visually set off from other label text");

  return {
    field,
    label,
    expected: WARNING_FORMAT_EXPECTED,
    extracted: notes,
    status: "fail",
    reason: `Formatting does not meet TTB requirements: ${problems.join("; ")}.`,
  };
}

function overallStatus(fields: FieldResult[]): FieldStatus {
  if (fields.some((f) => f.status === "fail")) return "fail";
  if (fields.some((f) => f.status === "needs_review")) return "needs_review";
  return "pass";
}

export function buildVerdict(
  extracted: LabelFields,
  expected: ExpectedFields,
  warningFormat: WarningFormatCheck | null = null,
): { fields: FieldResult[]; overallStatus: FieldStatus } {
  const fields: FieldResult[] = [
    compareTextField("brandName", "Brand Name", expected.brandName, extracted.brandName),
    compareTextField("classType", "Class/Type", expected.classType, extracted.classType),
    compareAbv(expected.beverageType, expected.alcoholContent, extracted.alcoholContent, extracted.classType, extracted.netContents),
    compareNetContents(expected.netContents, extracted.netContents),
    compareStandardOfFill(expected.beverageType, extracted.netContents),
    compareNameAddress(expected.nameAddress, extracted.nameAddress),
    compareCountryOfOrigin(expected.isImport, expected.countryOfOrigin, extracted.countryOfOrigin),
    compareGovernmentWarning(extracted.governmentWarning),
    compareWarningFormatting(warningFormat),
  ];

  return { fields, overallStatus: overallStatus(fields) };
}
