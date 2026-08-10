import { NextRequest, NextResponse } from "next/server";
import { verifyLabel } from "@/lib/verifyPipeline";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { MAX_IMAGE_BYTES, VERIFY_RATE_LIMIT } from "@/lib/limits";
import type { BeverageType, ExpectedFields } from "@/lib/types";

const BEVERAGE_TYPES: BeverageType[] = ["beer", "wine", "spirits"];

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`verify:${ip}`, VERIFY_RATE_LIMIT.limit, VERIFY_RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
  }

  const form = await req.formData();
  const image = form.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: `Image is too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB).` }, { status: 400 });
  }

  const beverageType = String(form.get("beverageType") ?? "").trim() as BeverageType;
  if (!BEVERAGE_TYPES.includes(beverageType)) {
    return NextResponse.json({ error: "Beverage type must be one of beer, wine, or spirits." }, { status: 400 });
  }

  const isImport = String(form.get("isImport") ?? "") === "true";

  const expected: ExpectedFields = {
    beverageType,
    brandName: String(form.get("brandName") ?? "").trim(),
    classType: String(form.get("classType") ?? "").trim(),
    alcoholContent: String(form.get("alcoholContent") ?? "").trim(),
    netContents: String(form.get("netContents") ?? "").trim(),
    nameAddress: String(form.get("nameAddress") ?? "").trim(),
    isImport,
    countryOfOrigin: String(form.get("countryOfOrigin") ?? "").trim(),
  };

  if (!expected.brandName || !expected.classType || !expected.alcoholContent || !expected.netContents || !expected.nameAddress) {
    return NextResponse.json(
      { error: "Brand name, class/type, alcohol content, net contents, and name & address are all required." },
      { status: 400 },
    );
  }

  if (expected.isImport && !expected.countryOfOrigin) {
    return NextResponse.json({ error: "Country of origin is required when the product is marked as an import." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const result = await verifyLabel(buffer, image.type, expected);
    return NextResponse.json(result);
  } catch (err) {
    console.error("verify route failed:", err);
    return NextResponse.json(
      { error: "We couldn't read this label. Try a clearer, well-lit photo, or a different image format (JPEG/PNG)." },
      { status: 500 },
    );
  }
}
