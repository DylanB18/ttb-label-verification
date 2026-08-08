/**
 * Generates synthetic alcohol label images for local testing/demo, since we
 * don't have real label photos. Covers a clean pass, a brand-name case
 * variant (needs_review), a wrong ABV, two warning-statement failure modes,
 * and a missing warning — plus a small batch set with a matching CSV
 * manifest. Real photos can simply replace/augment these later; nothing
 * downstream depends on how the images were produced.
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { CANONICAL_GOVERNMENT_WARNING } from "../lib/types";

const OUT_DIR = path.join(__dirname, "..", "test-labels");
const WIDTH = 900;
const HEIGHT = 1200;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface LabelSpec {
  brandName: string;
  classType: string;
  abvLine: string;
  netLine: string;
  warningLines: string[];
}

function buildSvg(spec: LabelSpec): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`);
  parts.push(`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="white" />`);
  // Note: deliberately no decorative border rectangle — testing showed Tesseract's
  // layout analysis can drop large bold text near a full-bleed frame border.

  let y = 140;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="bold" text-anchor="middle">${escapeXml(spec.brandName)}</text>`,
  );
  y += 70;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="30" text-anchor="middle">${escapeXml(spec.classType)}</text>`,
  );
  y += 90;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="middle">${escapeXml(spec.abvLine)}</text>`,
  );
  y += 50;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="middle">${escapeXml(spec.netLine)}</text>`,
  );

  y += 90;
  for (const line of spec.warningLines) {
    parts.push(
      `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="20" text-anchor="middle">${escapeXml(line)}</text>`,
    );
    y += 30;
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

async function renderLabel(fileName: string, spec: LabelSpec) {
  const svg = buildSvg(spec);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(OUT_DIR, fileName), png);
  console.log(`wrote ${fileName}`);
}

const CANONICAL_WARNING_LINES = wrapText(CANONICAL_GOVERNMENT_WARNING, 60);
const TITLE_CASE_WARNING_LINES = wrapText(
  CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:"),
  60,
);
const REWORDED_WARNING_LINES = wrapText(
  "GOVERNMENT WARNING: Pregnant women should avoid alcohol. Drinking may impair your ability to drive.",
  60,
);

const singleLabels: Record<string, LabelSpec> = {
  "clean-match-bourbon.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "brand-case-variant.png": {
    brandName: "STONE'S THROW",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "wrong-abv.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "40% Alc./Vol. (80 Proof)",
    netLine: "750 mL",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "brand-typo-needs-review.png": {
    brandName: "OLD TAM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "warning-title-case.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: TITLE_CASE_WARNING_LINES,
  },
  "warning-reworded.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: REWORDED_WARNING_LINES,
  },
  "missing-warning.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    warningLines: [],
  },
};

interface BatchManifestEntry {
  fileName: string;
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
}

const batchLabels: Array<{ fileName: string; spec: LabelSpec; manifest: BatchManifestEntry }> = [
  {
    fileName: "batch-01-pass.png",
    spec: {
      brandName: "HARBORVIEW VODKA",
      classType: "Vodka",
      abvLine: "40% Alc./Vol. (80 Proof)",
      netLine: "1 L",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: { fileName: "batch-01-pass.png", brandName: "Harborview Vodka", classType: "Vodka", alcoholContent: "40", netContents: "1 L" },
  },
  {
    fileName: "batch-02-needs-review.png",
    spec: {
      brandName: "REDWOOD RIDGE",
      classType: "American Single Malt Whiskey",
      abvLine: "43% Alc./Vol. (86 Proof)",
      netLine: "750 mL",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-02-needs-review.png",
      brandName: "Redwood Ridge",
      classType: "American Single-Malt Whiskey",
      alcoholContent: "43",
      netContents: "750 mL",
    },
  },
  {
    fileName: "batch-03-fail-abv.png",
    spec: {
      brandName: "BLUE HERON GIN",
      classType: "Gin",
      abvLine: "47% Alc./Vol. (94 Proof)",
      netLine: "750 mL",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: { fileName: "batch-03-fail-abv.png", brandName: "Blue Heron Gin", classType: "Gin", alcoholContent: "40", netContents: "750 mL" },
  },
  {
    fileName: "batch-04-fail-warning.png",
    spec: {
      brandName: "SUNSET RANCH TEQUILA",
      classType: "Tequila",
      abvLine: "40% Alc./Vol. (80 Proof)",
      netLine: "750 mL",
      warningLines: TITLE_CASE_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-04-fail-warning.png",
      brandName: "Sunset Ranch Tequila",
      classType: "Tequila",
      alcoholContent: "40",
      netContents: "750 mL",
    },
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [fileName, spec] of Object.entries(singleLabels)) {
    await renderLabel(fileName, spec);
  }

  for (const { fileName, spec } of batchLabels) {
    await renderLabel(fileName, spec);
  }

  const csvHeader = "fileName,brandName,classType,alcoholContent,netContents";
  const csvRows = batchLabels.map(({ manifest }) => [manifest.fileName, manifest.brandName, manifest.classType, manifest.alcoholContent, manifest.netContents].join(","));
  await writeFile(path.join(OUT_DIR, "batch-manifest.csv"), [csvHeader, ...csvRows].join("\n") + "\n");
  console.log("wrote batch-manifest.csv");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
