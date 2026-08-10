export type FieldStatus = "pass" | "needs_review" | "fail";

/**
 * The three beverage categories TTB regulates under separate CFR parts (27
 * CFR Part 25 malt beverages, Part 4 wine, Part 5 distilled spirits). Chosen
 * explicitly by the applicant rather than inferred, since it determines
 * which rule set applies (e.g. wine's ABV-disclosure exemption, beer's
 * optional ABV statement, spirits' standards of fill) and getting it wrong
 * silently would apply the wrong regulation.
 */
export type BeverageType = "beer" | "wine" | "spirits";

/** Fields as extracted from a label image (OCR and/or vision fallback). */
export interface LabelFields {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
  nameAddress: string | null;
  countryOfOrigin: string | null;
  governmentWarning: string | null;
}

/** Fields as entered on the application (manual form or batch manifest). */
export interface ExpectedFields {
  beverageType: BeverageType;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  /** Bottler/producer/importer name & address, e.g. "Old Tom Distillery, Louisville, KY". */
  nameAddress: string;
  /** Whether the applicant has declared this product as imported — gates the country-of-origin check. */
  isImport: boolean;
  /** Required only when isImport is true; ignored (and not checked) otherwise. */
  countryOfOrigin: string;
}

export interface FieldResult {
  field:
    | "brandName"
    | "classType"
    | "alcoholContent"
    | "netContents"
    | "standardOfFill"
    | "nameAddress"
    | "countryOfOrigin"
    | "governmentWarning"
    | "governmentWarningFormat";
  label: string;
  expected: string;
  extracted: string | null;
  status: FieldStatus;
  reason: string;
}

/**
 * Visual assessment of the Government Warning statement's formatting —
 * whether "GOVERNMENT WARNING:" is bold and the rest isn't, and whether the
 * statement is set off from other label text. This can't be derived from
 * OCR text (no font-weight/layout signal), so it always requires a vision
 * model call, unlike the other fields which OCR can often handle alone.
 * Each field is null if the vision call couldn't locate the warning at all.
 */
export interface WarningFormatCheck {
  boldLeadIn: boolean | null;
  restNotBold: boolean | null;
  visuallySeparated: boolean | null;
  notes: string | null;
}

export interface VerificationResult {
  overallStatus: FieldStatus;
  fields: FieldResult[];
  extractionSource: "ocr" | "ocr+vision";
  ocrConfidence: number;
  elapsedMs: number;
  rawOcrText: string;
}

export interface BatchManifestRow extends ExpectedFields {
  fileName: string;
}

export interface BatchResultRow extends VerificationResult {
  fileName: string;
  error?: string;
}

/**
 * Canonical TTB Government Warning statement. Must match label text
 * verbatim (word-for-word, with "GOVERNMENT WARNING:" in all caps) per
 * 27 CFR 16.21. This is fixed federal text, not something the applicant
 * supplies on the application, so it's checked against this constant
 * rather than an expected-fields input.
 */
export const CANONICAL_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";
