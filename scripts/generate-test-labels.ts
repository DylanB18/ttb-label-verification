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
  /** Omit (empty string) to render a label with no ABV line — used for the wine-exemption and beer-optional-ABV samples. */
  abvLine: string;
  netLine: string;
  /** Bottler/producer/importer line, e.g. "BOTTLED BY OLD TOM DISTILLERY, LOUISVILLE, KY". Must appear before the warning — parseFields.ts stops recognizing anything once the warning block starts. */
  nameAddressLine: string;
  /** Only set for imports, e.g. "PRODUCT OF SCOTLAND". */
  countryOfOriginLine?: string;
  warningLines: string[];
  /** Whether the "GOVERNMENT WARNING:" lead-in (first line, up to the first colon) renders bold. Defaults to true — set false to produce a formatting-fail sample. */
  warningLeadInBold?: boolean;
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

  if (spec.abvLine) {
    y += 90;
    parts.push(
      `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="middle">${escapeXml(spec.abvLine)}</text>`,
    );
  }
  y += 50;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="26" text-anchor="middle">${escapeXml(spec.netLine)}</text>`,
  );

  y += 50;
  parts.push(
    `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="middle">${escapeXml(spec.nameAddressLine)}</text>`,
  );

  if (spec.countryOfOriginLine) {
    y += 30;
    parts.push(
      `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="18" text-anchor="middle">${escapeXml(spec.countryOfOriginLine)}</text>`,
    );
  }

  y += 70;
  const leadInBold = spec.warningLeadInBold !== false;
  spec.warningLines.forEach((line, index) => {
    if (index === 0) {
      // Split the lead-in ("GOVERNMENT WARNING:" or a title-case/reworded
      // variant) into its own tspan so it can render at a different weight
      // than the rest of the statement — TTB requires the lead-in bold and
      // the body not bold.
      const colonIndex = line.indexOf(":");
      const leadIn = colonIndex === -1 ? line : line.slice(0, colonIndex + 1);
      const rest = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
      parts.push(
        `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="20" text-anchor="middle"><tspan font-weight="${leadInBold ? "bold" : "normal"}">${escapeXml(leadIn)}</tspan>${escapeXml(rest)}</text>`,
      );
    } else {
      parts.push(
        `<text x="${WIDTH / 2}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="20" text-anchor="middle">${escapeXml(line)}</text>`,
      );
    }
    y += 30;
  });

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

const OLD_TOM_NAME_ADDRESS = "BOTTLED BY OLD TOM DISTILLERY, LOUISVILLE, KY";

const singleLabels: Record<string, LabelSpec> = {
  "clean-match-bourbon.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
  },
  "brand-case-variant.png": {
    brandName: "STONE'S THROW",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
  },
  "wrong-abv.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "40% Alc./Vol. (80 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
  },
  "brand-typo-needs-review.png": {
    brandName: "OLD TAM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
  },
  "warning-title-case.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: TITLE_CASE_WARNING_LINES,
  },
  "warning-reworded.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: REWORDED_WARNING_LINES,
  },
  "warning-not-bold.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
    warningLeadInBold: false,
  },
  "missing-warning.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "750 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: [],
  },
  "wine-table-wine-exempt.png": {
    brandName: "FIELDSTONE VINEYARDS",
    classType: "Red Table Wine",
    abvLine: "", // deliberately omitted — legal under the wine <=14% ABV exemption when the class/type reads "Table Wine"
    netLine: "750 mL",
    nameAddressLine: "BOTTLED BY FIELDSTONE VINEYARDS, SONOMA, CA",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "beer-optional-abv.png": {
    brandName: "HARBOR LIGHT BREWING",
    classType: "Lager",
    abvLine: "", // deliberately omitted — ABV disclosure is optional for malt beverages under federal law
    netLine: "12 fl oz",
    nameAddressLine: "BREWED BY HARBOR LIGHT BREWING CO., PORTLAND, OR",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "imported-scotch.png": {
    brandName: "GLEN MUIR",
    classType: "Blended Scotch Whisky",
    abvLine: "43% Alc./Vol. (86 Proof)",
    netLine: "750 mL",
    nameAddressLine: "IMPORTED BY OLD TOM IMPORTS, ATLANTA, GA",
    countryOfOriginLine: "PRODUCT OF SCOTLAND",
    warningLines: CANONICAL_WARNING_LINES,
  },
  "nonstandard-fill.png": {
    brandName: "OLD TOM DISTILLERY",
    classType: "Kentucky Straight Bourbon Whiskey",
    abvLine: "45% Alc./Vol. (90 Proof)",
    netLine: "700 mL",
    nameAddressLine: OLD_TOM_NAME_ADDRESS,
    warningLines: CANONICAL_WARNING_LINES,
  },
};

interface BatchManifestEntry {
  fileName: string;
  beverageType: "beer" | "wine" | "spirits";
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  nameAddress: string;
  isImport: boolean;
  countryOfOrigin: string;
}

const batchLabels: Array<{ fileName: string; spec: LabelSpec; manifest: BatchManifestEntry }> = [
  {
    fileName: "batch-01-pass.png",
    spec: {
      brandName: "HARBORVIEW VODKA",
      classType: "Vodka",
      abvLine: "40% Alc./Vol. (80 Proof)",
      netLine: "1 L",
      nameAddressLine: "DISTILLED BY HARBORVIEW DISTILLING CO., SEATTLE, WA",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-01-pass.png",
      beverageType: "spirits",
      brandName: "Harborview Vodka",
      classType: "Vodka",
      alcoholContent: "40",
      netContents: "1 L",
      nameAddress: "Harborview Distilling Co., Seattle, WA",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "batch-02-needs-review.png",
    spec: {
      brandName: "REDWOOD RIDGE",
      classType: "American Single Malt Whiskey",
      abvLine: "43% Alc./Vol. (86 Proof)",
      netLine: "750 mL",
      nameAddressLine: "DISTILLED AND BOTTLED BY REDWOOD RIDGE DISTILLERS, PORTLAND, OR",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-02-needs-review.png",
      beverageType: "spirits",
      brandName: "Redwood Ridge",
      classType: "American Single-Malt Whiskey",
      alcoholContent: "43",
      netContents: "750 mL",
      nameAddress: "Redwood Ridge Distillers, Portland, OR",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "batch-03-fail-abv.png",
    spec: {
      brandName: "BLUE HERON GIN",
      classType: "Gin",
      abvLine: "47% Alc./Vol. (94 Proof)",
      netLine: "750 mL",
      nameAddressLine: "DISTILLED BY BLUE HERON DISTILLING, AUSTIN, TX",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-03-fail-abv.png",
      beverageType: "spirits",
      brandName: "Blue Heron Gin",
      classType: "Gin",
      alcoholContent: "40",
      netContents: "750 mL",
      nameAddress: "Blue Heron Distilling, Austin, TX",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "batch-04-fail-warning.png",
    spec: {
      brandName: "SUNSET RANCH TEQUILA",
      classType: "Tequila",
      abvLine: "40% Alc./Vol. (80 Proof)",
      netLine: "750 mL",
      nameAddressLine: "IMPORTED BY SUNSET RANCH IMPORTS, EL PASO, TX",
      countryOfOriginLine: "PRODUCT OF MEXICO",
      warningLines: TITLE_CASE_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-04-fail-warning.png",
      beverageType: "spirits",
      brandName: "Sunset Ranch Tequila",
      classType: "Tequila",
      alcoholContent: "40",
      netContents: "750 mL",
      nameAddress: "Sunset Ranch Imports, El Paso, TX",
      isImport: true,
      countryOfOrigin: "Mexico",
    },
  },
  {
    fileName: "batch-05-wine-pass.png",
    spec: {
      brandName: "MEADOWBROOK CELLARS",
      classType: "Chardonnay",
      abvLine: "13.5% Alc./Vol.",
      netLine: "750 mL",
      nameAddressLine: "BOTTLED BY MEADOWBROOK CELLARS, NAPA, CA",
      warningLines: CANONICAL_WARNING_LINES,
    },
    manifest: {
      fileName: "batch-05-wine-pass.png",
      beverageType: "wine",
      brandName: "Meadowbrook Cellars",
      classType: "Chardonnay",
      alcoholContent: "13.5",
      netContents: "750 mL",
      nameAddress: "Meadowbrook Cellars, Napa, CA",
      isImport: false,
      countryOfOrigin: "",
    },
  },
];

function csvField(value: string | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [fileName, spec] of Object.entries(singleLabels)) {
    await renderLabel(fileName, spec);
  }

  for (const { fileName, spec } of batchLabels) {
    await renderLabel(fileName, spec);
  }

  const csvHeader = "fileName,beverageType,brandName,classType,alcoholContent,netContents,nameAddress,isImport,countryOfOrigin";
  const csvRows = batchLabels.map(({ manifest }) =>
    [
      manifest.fileName,
      manifest.beverageType,
      manifest.brandName,
      manifest.classType,
      manifest.alcoholContent,
      manifest.netContents,
      manifest.nameAddress,
      manifest.isImport,
      manifest.countryOfOrigin,
    ]
      .map(csvField)
      .join(","),
  );
  await writeFile(path.join(OUT_DIR, "batch-manifest.csv"), [csvHeader, ...csvRows].join("\n") + "\n");
  console.log("wrote batch-manifest.csv");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
