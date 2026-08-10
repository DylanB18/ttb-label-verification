import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { verifyLabel } from "@/lib/verifyPipeline";
import { OcrPool } from "@/lib/ocr";
import { mapWithConcurrency } from "@/lib/concurrency";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { BATCH_RATE_LIMIT, MAX_BATCH_IMAGES, MAX_IMAGE_BYTES } from "@/lib/limits";
import type { BatchManifestRow, BatchResultRow, BeverageType, ExpectedFields } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 4;
const BEVERAGE_TYPES: BeverageType[] = ["beer", "wine", "spirits"];

function parseManifest(text: string): BatchManifestRow[] {
  const trimmed = text.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return parsed.map((row: Record<string, string>) => normalizeRow(row));
  }

  const parsed = Papa.parse<Record<string, string>>(trimmed, { header: true, skipEmptyLines: true });
  return parsed.data.map((row) => normalizeRow(row));
}

function normalizeRow(row: Record<string, string>): BatchManifestRow {
  const rawBeverageType = (row.beverageType ?? "spirits").trim().toLowerCase();
  const beverageType: BeverageType = BEVERAGE_TYPES.includes(rawBeverageType as BeverageType) ? (rawBeverageType as BeverageType) : "spirits";

  return {
    fileName: (row.fileName ?? row.filename ?? row.FileName ?? "").trim(),
    beverageType,
    brandName: (row.brandName ?? "").trim(),
    classType: (row.classType ?? "").trim(),
    alcoholContent: (row.alcoholContent ?? "").trim(),
    netContents: (row.netContents ?? "").trim(),
    nameAddress: (row.nameAddress ?? "").trim(),
    isImport: (row.isImport ?? "").trim().toLowerCase() === "true",
    countryOfOrigin: (row.countryOfOrigin ?? "").trim(),
  };
}

function errorRow(fileName: string, error: string): BatchResultRow {
  return {
    fileName,
    overallStatus: "fail",
    fields: [],
    extractionSource: "ocr",
    ocrConfidence: 0,
    elapsedMs: 0,
    rawOcrText: "",
    error,
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`batch:${ip}`, BATCH_RATE_LIMIT.limit, BATCH_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: "Too many batch requests. Please wait a few minutes and try again." }, { status: 429 });
  }

  const form = await req.formData();
  const manifestRaw = form.get("manifest");
  const images = form.getAll("images").filter((v): v is File => v instanceof File);

  if (typeof manifestRaw !== "string" || !manifestRaw.trim()) {
    return NextResponse.json({ error: "Missing manifest (CSV or JSON) describing expected fields per file." }, { status: 400 });
  }
  if (images.length === 0) {
    return NextResponse.json({ error: "No images uploaded." }, { status: 400 });
  }
  if (images.length > MAX_BATCH_IMAGES) {
    return NextResponse.json({ error: `Batches are limited to ${MAX_BATCH_IMAGES} images at a time in this prototype.` }, { status: 400 });
  }
  const oversized = images.find((img) => img.size > MAX_IMAGE_BYTES);
  if (oversized) {
    return NextResponse.json({ error: `"${oversized.name}" is too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB per image).` }, { status: 400 });
  }

  let manifest: BatchManifestRow[];
  try {
    manifest = parseManifest(manifestRaw);
  } catch {
    return NextResponse.json({ error: "Could not parse the manifest as JSON or CSV." }, { status: 400 });
  }

  const manifestByName = new Map(manifest.map((row) => [row.fileName, row]));
  const pool = new OcrPool(Math.min(CONCURRENCY, images.length));

  try {
    const results = await mapWithConcurrency(images, CONCURRENCY, async (image): Promise<BatchResultRow> => {
      const row = manifestByName.get(image.name);
      if (!row) {
        return errorRow(image.name, `No manifest row found for "${image.name}".`);
      }

      const expected: ExpectedFields = {
        beverageType: row.beverageType,
        brandName: row.brandName,
        classType: row.classType,
        alcoholContent: row.alcoholContent,
        netContents: row.netContents,
        nameAddress: row.nameAddress,
        isImport: row.isImport,
        countryOfOrigin: row.countryOfOrigin,
      };

      try {
        const buffer = Buffer.from(await image.arrayBuffer());
        const result = await verifyLabel(buffer, image.type, expected, { recognize: (buf) => pool.recognize(buf) });
        return { ...result, fileName: image.name };
      } catch (err) {
        console.error(`batch route failed for ${image.name}:`, err);
        return errorRow(image.name, "Couldn't read this label — try a clearer photo or a different image format.");
      }
    });

    return NextResponse.json({ results });
  } finally {
    await pool.terminate();
  }
}
