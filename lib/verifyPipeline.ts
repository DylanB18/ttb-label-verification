import { runOcr, type OcrResult } from "./ocr";
import { parseFieldsFromOcrText, isExtractionComplete } from "./parseFields";
import { extractFieldsWithVision, mediaTypeFromMime } from "./visionExtract";
import { buildVerdict } from "./compare";
import type { ExpectedFields, LabelFields, VerificationResult } from "./types";

const OCR_CONFIDENCE_THRESHOLD = 70;

interface Recognizer {
  recognize: (buf: Buffer) => Promise<OcrResult>;
}

const defaultRecognizer: Recognizer = { recognize: runOcr };

/**
 * Runs the full extraction + comparison pipeline for one label image:
 * OCR first, then Claude Haiku vision only if OCR confidence is low or a
 * required field is missing (keeps the common case fast and cheap).
 */
export async function verifyLabel(
  imageBuffer: Buffer,
  mime: string,
  expected: ExpectedFields,
  recognizer: Recognizer = defaultRecognizer,
): Promise<VerificationResult> {
  const start = Date.now();

  const ocrResult = await recognizer.recognize(imageBuffer);
  let fields = parseFieldsFromOcrText(ocrResult.text);
  let extractionSource: "ocr" | "ocr+vision" = "ocr";

  const needsVision = ocrResult.confidence < OCR_CONFIDENCE_THRESHOLD || !isExtractionComplete(fields);
  if (needsVision) {
    try {
      const visionFields = await extractFieldsWithVision(imageBuffer, mediaTypeFromMime(mime));
      fields = mergeFields(fields, visionFields);
      extractionSource = "ocr+vision";
    } catch (err) {
      console.error("Vision fallback failed, proceeding with OCR-only result:", err);
    }
  }

  const { fields: fieldResults, overallStatus } = buildVerdict(fields, expected);

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
    governmentWarning: visionFields.governmentWarning ?? ocrFields.governmentWarning,
  };
}
