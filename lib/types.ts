export type FieldStatus = "pass" | "needs_review" | "fail";

/** Fields as extracted from a label image (OCR and/or vision fallback). */
export interface LabelFields {
  brandName: string | null;
  classType: string | null;
  alcoholContent: string | null;
  netContents: string | null;
  governmentWarning: string | null;
}

/** Fields as entered on the application (manual form or batch manifest). */
export interface ExpectedFields {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
}

export interface FieldResult {
  field: "brandName" | "classType" | "alcoholContent" | "netContents" | "governmentWarning";
  label: string;
  expected: string;
  extracted: string | null;
  status: FieldStatus;
  reason: string;
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
