import { CANONICAL_GOVERNMENT_WARNING, type ExpectedFields, type FieldResult, type FieldStatus, type LabelFields } from "./types";

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
 * application, so these are treated as matches (flagged, not failed).
 */
function isAbbreviationMatch(a: string, b: string): boolean {
  const wordsA = significantWords(a);
  const wordsB = significantWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const longerSet = new Set(longer);
  return shorter.every((w) => longerSet.has(w));
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

  const normExpected = normalizeText(expected);
  const normExtracted = normalizeText(extracted);

  if (normExpected === normExtracted) {
    return { field, label, expected, extracted, status: "pass", reason: "Matches application exactly (case/punctuation-insensitive)." };
  }

  if (isAbbreviationMatch(normExpected, normExtracted)) {
    return {
      field,
      label,
      expected,
      extracted,
      status: "pass",
      reason: "Shortened/abbreviated form of the application value (e.g. dropped a qualifier or legal suffix) — not meaningfully different. Flagged for awareness, but passed.",
    };
  }

  const similarity = similarityRatio(normExpected, normExtracted);
  if (similarity >= TEXT_MATCH_THRESHOLD) {
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

function parseAbvPercent(text: string): number | null {
  const withPercent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (withPercent) return parseFloat(withPercent[1]);

  // Application data entered as a bare number (e.g. "45" instead of "45%") — this
  // field only ever represents a percentage, so treat a lone number the same way.
  const bareNumber = text.trim().match(/^(\d+(?:\.\d+)?)$/);
  if (bareNumber) return parseFloat(bareNumber[1]);

  return null;
}

const ABV_TOLERANCE = 0.05;

function compareAbv(expected: string, extracted: string | null): FieldResult {
  const label = "Alcohol Content";
  if (!extracted) {
    return { field: "alcoholContent", label, expected, extracted, status: "fail", reason: "Alcohol content was not found on the label." };
  }

  const expectedPct = parseAbvPercent(expected);
  const extractedPct = parseAbvPercent(extracted);

  if (expectedPct === null || extractedPct === null) {
    return {
      field: "alcoholContent",
      label,
      expected,
      extracted,
      status: "needs_review",
      reason: "Could not parse a numeric ABV percentage from one of the values — please check manually.",
    };
  }

  if (Math.abs(expectedPct - extractedPct) <= ABV_TOLERANCE) {
    return { field: "alcoholContent", label, expected, extracted, status: "pass", reason: `Label ABV (${extractedPct}%) matches application (${expectedPct}%).` };
  }

  return {
    field: "alcoholContent",
    label,
    expected,
    extracted,
    status: "fail",
    reason: `Label ABV (${extractedPct}%) does not match application (${expectedPct}%).`,
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

function overallStatus(fields: FieldResult[]): FieldStatus {
  if (fields.some((f) => f.status === "fail")) return "fail";
  if (fields.some((f) => f.status === "needs_review")) return "needs_review";
  return "pass";
}

export function buildVerdict(extracted: LabelFields, expected: ExpectedFields): { fields: FieldResult[]; overallStatus: FieldStatus } {
  const fields: FieldResult[] = [
    compareTextField("brandName", "Brand Name", expected.brandName, extracted.brandName),
    compareTextField("classType", "Class/Type", expected.classType, extracted.classType),
    compareAbv(expected.alcoholContent, extracted.alcoholContent),
    compareNetContents(expected.netContents, extracted.netContents),
    compareGovernmentWarning(extracted.governmentWarning),
  ];

  return { fields, overallStatus: overallStatus(fields) };
}
