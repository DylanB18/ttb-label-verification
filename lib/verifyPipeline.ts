import { runOcr, type OcrResult } from "./ocr";
import { parseFieldsFromOcrText, isExtractionComplete } from "./parseFields";
import { runVisionAssessment, mediaTypeFromMime } from "./visionExtract";
import { buildVerdict } from "./compare";
import type { ExpectedFields, LabelFields, VerificationResult, WarningFormatCheck } from "./types";

const OCR_CONFIDENCE_THRESHOLD = 70;

interface Recognizer {
  recognize: (buf: Buffer) => Promise<OcrResult>;
}

const defaultRecognizer: Recognizer = { recognize: runOcr };

/**
 * Runs the full extraction + comparison pipeline for one label image.
 * OCR is authoritative for brand/class/ABV/net-contents/warning-text
 * whenever it's confident and complete — that's the fast, free path.
 * Vision always runs too, because the Government Warning's formatting
 * (bold lead-in, non-bold body, visual separation) is a judgment about the
 * image itself that OCR text has no way to express; vision's field
 * extraction is only *used* to fill gaps when OCR fell short. OCR and
 * vision run concurrently (they don't depend on each other) since vision
 * is now unconditional — running them sequentially would add its full
 * latency on top of OCR's on every request, risking the 5-second target.
 * A failed vision call degrades to a needs_review formatting result
 * rather than failing the whole request.
 */
export async function verifyLabel(
  imageBuffer: Buffer,
  mime: string,
  expected: ExpectedFields,
  recognizer: Recognizer = defaultRecognizer,
): Promise<VerificationResult> {
  const start = Date.now();

  let mediaType: ReturnType<typeof mediaTypeFromMime> | null = null;
  try {
    mediaType = mediaTypeFromMime(mime);
  } catch {
    // Unsupported mime — vision assessment below will be skipped; OCR (and
    // the route's own mime validation) still runs/applies as normal.
  }

  const [ocrSettled, visionSettled] = await Promise.allSettled([
    recognizer.recognize(imageBuffer),
    mediaType ? runVisionAssessment(imageBuffer, mediaType) : Promise.reject(new Error(`Unsupported image type: ${mime}`)),
  ]);

  if (ocrSettled.status === "rejected") throw ocrSettled.reason;
  const ocrResult = ocrSettled.value;

  let fields = parseFieldsFromOcrText(ocrResult.text);
  let extractionSource: "ocr" | "ocr+vision" = "ocr";
  let warningFormat: WarningFormatCheck | null = null;

  const needsVisionForFields = ocrResult.confidence < OCR_CONFIDENCE_THRESHOLD || !isExtractionComplete(fields);
  if (visionSettled.status === "fulfilled") {
    warningFormat = visionSettled.value.warningFormat;
    if (needsVisionForFields) {
      fields = mergeFields(fields, visionSettled.value.fields);
      extractionSource = "ocr+vision";
    }
  } else {
    console.error("Vision assessment failed — warning formatting can't be verified, and OCR-only fields are used:", visionSettled.reason);
  }

  const { fields: fieldResults, overallStatus } = buildVerdict(fields, expected, warningFormat);

  return {
    overallStatus,
    fields: fieldResults,
    extractionSource,
    ocrConfidence: ocrResult.confidence,
    elapsedMs: Date.now() - start,
    rawOcrText: ocrResult.text,
  };
}

/** Vision was called because OCR was uncertain, so prefer its values; fall back to OCR only if vision missed a field. */
function mergeFields(ocrFields: LabelFields, visionFields: LabelFields): LabelFields {
  return {
    brandName: visionFields.brandName ?? ocrFields.brandName,
    classType: visionFields.classType ?? ocrFields.classType,
    alcoholContent: visionFields.alcoholContent ?? ocrFields.alcoholContent,
    netContents: visionFields.netContents ?? ocrFields.netContents,
    nameAddress: visionFields.nameAddress ?? ocrFields.nameAddress,
    countryOfOrigin: visionFields.countryOfOrigin ?? ocrFields.countryOfOrigin,
    governmentWarning: visionFields.governmentWarning ?? ocrFields.governmentWarning,
  };
}
