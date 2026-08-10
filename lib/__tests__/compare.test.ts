import { describe, expect, it } from "vitest";
import { buildVerdict } from "../compare";
import { CANONICAL_GOVERNMENT_WARNING, type ExpectedFields, type LabelFields, type WarningFormatCheck } from "../types";

const expected: ExpectedFields = {
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45%",
  netContents: "750 mL",
};

const matchingLabel: LabelFields = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  governmentWarning: CANONICAL_GOVERNMENT_WARNING,
};

const wellFormattedWarning: WarningFormatCheck = {
  boldLeadIn: true,
  restNotBold: true,
  visuallySeparated: true,
  notes: null,
};

function fieldFor(fields: ReturnType<typeof buildVerdict>["fields"], key: string) {
  const f = fields.find((f) => f.field === key);
  if (!f) throw new Error(`missing field ${key}`);
  return f;
}

describe("buildVerdict", () => {
  it("passes every field on a clean match", () => {
    const { overallStatus, fields } = buildVerdict(matchingLabel, expected, wellFormattedWarning);
    expect(overallStatus).toBe("pass");
    for (const f of fields) expect(f.status).toBe("pass");
  });

  it("passes a case/punctuation-only brand name difference outright (STONE'S THROW vs Stone's Throw)", () => {
    const label: LabelFields = { ...matchingLabel, brandName: "STONE'S THROW" };
    const exp: ExpectedFields = { ...expected, brandName: "Stone's Throw" };
    const { fields, overallStatus } = buildVerdict(label, exp, wellFormattedWarning);
    expect(fieldFor(fields, "brandName").status).toBe("pass");
    expect(overallStatus).toBe("pass");
  });

  it("passes an abbreviated class/type outright (VERMOUTH vs VERMOUTH DE CHAMBÉRY)", () => {
    const label: LabelFields = { ...matchingLabel, classType: "VERMOUTH" };
    const exp: ExpectedFields = { ...expected, classType: "VERMOUTH DE CHAMBÉRY" };
    const { fields, overallStatus } = buildVerdict(label, exp, wellFormattedWarning);
    expect(fieldFor(fields, "classType").status).toBe("pass");
    expect(overallStatus).toBe("pass");
  });

  it("passes an abbreviated brand name outright (Dolin vs MAISON DOLIN & CIE)", () => {
    const label: LabelFields = { ...matchingLabel, brandName: "Dolin" };
    const exp: ExpectedFields = { ...expected, brandName: "MAISON DOLIN & CIE" };
    const { fields, overallStatus } = buildVerdict(label, exp, wellFormattedWarning);
    expect(fieldFor(fields, "brandName").status).toBe("pass");
    expect(overallStatus).toBe("pass");
  });

  it("flags a near-miss brand name (likely OCR misread) as needs_review, not fail", () => {
    const label: LabelFields = { ...matchingLabel, brandName: "Old Tim Distillery" };
    const { fields, overallStatus } = buildVerdict(label, expected);
    expect(fieldFor(fields, "brandName").status).toBe("needs_review");
    expect(overallStatus).toBe("needs_review");
  });

  it("fails a genuinely different brand name", () => {
    const label: LabelFields = { ...matchingLabel, brandName: "Completely Different Brand" };
    const { fields } = buildVerdict(label, expected);
    expect(fieldFor(fields, "brandName").status).toBe("fail");
  });

  it("fails when ABV numerically mismatches", () => {
    const label: LabelFields = { ...matchingLabel, alcoholContent: "40% Alc./Vol. (80 Proof)" };
    const { fields, overallStatus } = buildVerdict(label, expected);
    expect(fieldFor(fields, "alcoholContent").status).toBe("fail");
    expect(overallStatus).toBe("fail");
  });

  it("parses a bare-number expected ABV (no % sign, as batch manifests may supply)", () => {
    const exp: ExpectedFields = { ...expected, alcoholContent: "40" };
    const label: LabelFields = { ...matchingLabel, alcoholContent: "47% Alc./Vol. (94 Proof)" };
    const { fields } = buildVerdict(label, exp);
    expect(fieldFor(fields, "alcoholContent").status).toBe("fail");
  });

  it("passes net contents across unit conversion (0.75 L vs 750 mL)", () => {
    const label: LabelFields = { ...matchingLabel, netContents: "0.75 L" };
    const { fields } = buildVerdict(label, expected);
    expect(fieldFor(fields, "netContents").status).toBe("pass");
  });

  it("fails net contents when volumes differ", () => {
    const label: LabelFields = { ...matchingLabel, netContents: "1 L" };
    const { fields } = buildVerdict(label, expected);
    expect(fieldFor(fields, "netContents").status).toBe("fail");
  });

  it("passes the government warning only on an exact, case-sensitive match", () => {
    const { fields } = buildVerdict(matchingLabel, expected);
    expect(fieldFor(fields, "governmentWarning").status).toBe("pass");
  });

  it("fails the government warning when the lead-in isn't in all caps", () => {
    const label: LabelFields = {
      ...matchingLabel,
      governmentWarning: CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:"),
    };
    const { fields, overallStatus } = buildVerdict(label, expected);
    expect(fieldFor(fields, "governmentWarning").status).toBe("fail");
    expect(overallStatus).toBe("fail");
  });

  it("fails the government warning when reworded", () => {
    const label: LabelFields = {
      ...matchingLabel,
      governmentWarning: "GOVERNMENT WARNING: Drinking may be bad for your health.",
    };
    const { fields } = buildVerdict(label, expected);
    expect(fieldFor(fields, "governmentWarning").status).toBe("fail");
  });

  it("fails a missing government warning as not found", () => {
    const label: LabelFields = { ...matchingLabel, governmentWarning: null };
    const { fields } = buildVerdict(label, expected);
    const result = fieldFor(fields, "governmentWarning");
    expect(result.status).toBe("fail");
    expect(result.reason).toMatch(/not found/i);
  });

  it("fails a field that OCR/vision could not find at all", () => {
    const label: LabelFields = { ...matchingLabel, brandName: null };
    const { fields } = buildVerdict(label, expected);
    expect(fieldFor(fields, "brandName").status).toBe("fail");
  });

  it("flags warning formatting as needs_review when no vision check was made", () => {
    const { fields, overallStatus } = buildVerdict(matchingLabel, expected, null);
    expect(fieldFor(fields, "governmentWarningFormat").status).toBe("needs_review");
    expect(overallStatus).toBe("needs_review");
  });

  it("passes warning formatting when the lead-in is bold, the body isn't, and it's set off from other text", () => {
    const { fields } = buildVerdict(matchingLabel, expected, wellFormattedWarning);
    expect(fieldFor(fields, "governmentWarningFormat").status).toBe("pass");
  });

  it("fails warning formatting when the lead-in isn't bold", () => {
    const check: WarningFormatCheck = { ...wellFormattedWarning, boldLeadIn: false };
    const { fields, overallStatus } = buildVerdict(matchingLabel, expected, check);
    const result = fieldFor(fields, "governmentWarningFormat");
    expect(result.status).toBe("fail");
    expect(result.reason).toMatch(/not in bold/i);
    expect(overallStatus).toBe("fail");
  });

  it("fails warning formatting when the whole statement is bold, not just the lead-in", () => {
    const check: WarningFormatCheck = { ...wellFormattedWarning, restNotBold: false };
    const { fields } = buildVerdict(matchingLabel, expected, check);
    expect(fieldFor(fields, "governmentWarningFormat").status).toBe("fail");
  });

  it("fails warning formatting when the statement isn't visually set off from other text", () => {
    const check: WarningFormatCheck = { ...wellFormattedWarning, visuallySeparated: false };
    const { fields } = buildVerdict(matchingLabel, expected, check);
    expect(fieldFor(fields, "governmentWarningFormat").status).toBe("fail");
  });

  it("fails warning formatting when the vision check couldn't locate the warning at all", () => {
    const check: WarningFormatCheck = { boldLeadIn: null, restNotBold: null, visuallySeparated: null, notes: null };
    const { fields } = buildVerdict(matchingLabel, expected, check);
    expect(fieldFor(fields, "governmentWarningFormat").status).toBe("fail");
  });
});
