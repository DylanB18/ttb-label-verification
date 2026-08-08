import { describe, expect, it } from "vitest";
import { buildVerdict } from "../compare";
import { CANONICAL_GOVERNMENT_WARNING, type ExpectedFields, type LabelFields } from "../types";

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

function fieldFor(fields: ReturnType<typeof buildVerdict>["fields"], key: string) {
  const f = fields.find((f) => f.field === key);
  if (!f) throw new Error(`missing field ${key}`);
  return f;
}

describe("buildVerdict", () => {
  it("passes every field on a clean match", () => {
    const { overallStatus, fields } = buildVerdict(matchingLabel, expected);
    expect(overallStatus).toBe("pass");
    for (const f of fields) expect(f.status).toBe("pass");
  });

  it("passes a case/punctuation-only brand name difference outright (STONE'S THROW vs Stone's Throw)", () => {
    const label: LabelFields = { ...matchingLabel, brandName: "STONE'S THROW" };
    const exp: ExpectedFields = { ...expected, brandName: "Stone's Throw" };
    const { fields, overallStatus } = buildVerdict(label, exp);
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
});
