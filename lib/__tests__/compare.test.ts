import { describe, expect, it } from "vitest";
import { buildVerdict } from "../compare";
import { CANONICAL_GOVERNMENT_WARNING, type ExpectedFields, type LabelFields, type WarningFormatCheck } from "../types";

const expected: ExpectedFields = {
  beverageType: "spirits",
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45%",
  netContents: "750 mL",
  nameAddress: "Old Tom Distillery, Louisville, KY",
  isImport: false,
  countryOfOrigin: "",
};

const matchingLabel: LabelFields = {
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholContent: "45% Alc./Vol. (90 Proof)",
  netContents: "750 mL",
  nameAddress: "BOTTLED BY OLD TOM DISTILLERY, LOUISVILLE, KY",
  countryOfOrigin: null,
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

  describe("name & address", () => {
    it("fails when no name/address statement was found on the label", () => {
      const label: LabelFields = { ...matchingLabel, nameAddress: null };
      const { fields } = buildVerdict(label, expected);
      const result = fieldFor(fields, "nameAddress");
      expect(result.status).toBe("fail");
      expect(result.reason).toMatch(/not found/i);
    });

    it("flags a near-miss name/address (likely OCR misread) as needs_review", () => {
      const label: LabelFields = { ...matchingLabel, nameAddress: "OLD TIM DISTILLERY, LOUISVILLE, KY" };
      const { fields } = buildVerdict(label, expected);
      expect(fieldFor(fields, "nameAddress").status).toBe("needs_review");
    });

    it("fails a genuinely different name/address", () => {
      const label: LabelFields = { ...matchingLabel, nameAddress: "BOTTLED BY COMPLETELY DIFFERENT COMPANY, MIAMI, FL" };
      const { fields } = buildVerdict(label, expected);
      expect(fieldFor(fields, "nameAddress").status).toBe("fail");
    });
  });

  describe("country of origin", () => {
    it("passes automatically when the product is domestic — not required", () => {
      const label: LabelFields = { ...matchingLabel, countryOfOrigin: null };
      const { fields } = buildVerdict(label, expected);
      const result = fieldFor(fields, "countryOfOrigin");
      expect(result.status).toBe("pass");
      expect(result.reason).toMatch(/domestic/i);
    });

    it("fails when the product is marked as an import but no country statement is on the label", () => {
      const exp: ExpectedFields = { ...expected, isImport: true, countryOfOrigin: "France" };
      const label: LabelFields = { ...matchingLabel, countryOfOrigin: null };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "countryOfOrigin").status).toBe("fail");
    });

    it("passes an import when the label states the expected country, alongside an explanatory phrase", () => {
      const exp: ExpectedFields = { ...expected, isImport: true, countryOfOrigin: "France" };
      const label: LabelFields = { ...matchingLabel, countryOfOrigin: "PRODUCT OF FRANCE" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "countryOfOrigin").status).toBe("pass");
    });

    it("fails an import when the label states a different country than the application", () => {
      const exp: ExpectedFields = { ...expected, isImport: true, countryOfOrigin: "France" };
      const label: LabelFields = { ...matchingLabel, countryOfOrigin: "PRODUCT OF ITALY" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "countryOfOrigin").status).toBe("fail");
    });

    it("flags needs_review when marked as an import but the application didn't supply a country", () => {
      const exp: ExpectedFields = { ...expected, isImport: true, countryOfOrigin: "" };
      const label: LabelFields = { ...matchingLabel, countryOfOrigin: "PRODUCT OF FRANCE" };
      const { fields } = buildVerdict(label, exp);
      const result = fieldFor(fields, "countryOfOrigin");
      expect(result.status).toBe("needs_review");
      expect(result.reason).toMatch(/didn't supply/i);
    });
  });

  describe("standard of fill", () => {
    it("passes for beer at any container size — no federal standard of fill applies", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "beer" };
      const label: LabelFields = { ...matchingLabel, netContents: "333 mL" };
      const { fields } = buildVerdict(label, exp);
      const result = fieldFor(fields, "standardOfFill");
      expect(result.status).toBe("pass");
      expect(result.reason).toMatch(/no standard of fill/i);
    });

    it("fails for spirits at a non-standard container size (700 mL)", () => {
      const exp: ExpectedFields = { ...expected, netContents: "700 mL" };
      const label: LabelFields = { ...matchingLabel, netContents: "700 mL" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("fail");
    });

    it("flags 500 mL spirits as needs_review — a legacy pre-1989 standard, not currently authorized", () => {
      const exp: ExpectedFields = { ...expected, netContents: "500 mL" };
      const label: LabelFields = { ...matchingLabel, netContents: "500 mL" };
      const { fields } = buildVerdict(label, exp);
      const result = fieldFor(fields, "standardOfFill");
      expect(result.status).toBe("needs_review");
      expect(result.reason).toMatch(/1989/);
    });

    it("passes wine at a current standard size (375 mL)", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", netContents: "375 mL" };
      const label: LabelFields = { ...matchingLabel, netContents: "375 mL" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("pass");
    });

    it("fails wine at a non-standard size (600 mL)", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", netContents: "600 mL" };
      const label: LabelFields = { ...matchingLabel, netContents: "600 mL" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("fail");
    });

    it("passes wine bulk containers (4-17L) filled in whole liters", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", netContents: "5 L" };
      const label: LabelFields = { ...matchingLabel, netContents: "5 L" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("pass");
    });

    it("fails wine bulk containers (4-17L) that aren't a whole liter", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", netContents: "4.5 L" };
      const label: LabelFields = { ...matchingLabel, netContents: "4.5 L" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("fail");
    });

    it("passes wine at 18L+ — no metric standard-of-fill restriction", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", netContents: "20 L" };
      const label: LabelFields = { ...matchingLabel, netContents: "20 L" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "standardOfFill").status).toBe("pass");
    });

    it("flags needs_review when the container size can't be parsed", () => {
      const label: LabelFields = { ...matchingLabel, netContents: "a lot" };
      const { fields } = buildVerdict(label, expected);
      expect(fieldFor(fields, "standardOfFill").status).toBe("needs_review");
    });
  });

  describe("beverage-type-specific alcohol content rules", () => {
    it("passes wine ABV omitted from the label when at/below 14% and class/type reads Table Wine (exemption)", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", alcoholContent: "13%", classType: "Red Table Wine" };
      const label: LabelFields = { ...matchingLabel, alcoholContent: null, classType: "Red Table Wine" };
      const { fields } = buildVerdict(label, exp);
      const result = fieldFor(fields, "alcoholContent");
      expect(result.status).toBe("pass");
      expect(result.reason).toMatch(/optional/i);
    });

    it("flags needs_review when wine ABV is omitted, application is at/below 14%, but class/type doesn't show the exemption", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", alcoholContent: "13%", classType: "Chardonnay" };
      const label: LabelFields = { ...matchingLabel, alcoholContent: null, classType: "Chardonnay" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "alcoholContent").status).toBe("needs_review");
    });

    it("fails wine ABV omitted from the label when application is above 14% — exemption doesn't apply", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", alcoholContent: "16%", classType: "Port" };
      const label: LabelFields = { ...matchingLabel, alcoholContent: null, classType: "Port" };
      const { fields } = buildVerdict(label, exp);
      expect(fieldFor(fields, "alcoholContent").status).toBe("fail");
    });

    it("applies wine's wider tolerance (±1.5 points) at or below 14% ABV", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", alcoholContent: "12%" };
      const passLabel: LabelFields = { ...matchingLabel, alcoholContent: "13.4% Alc./Vol." };
      const failLabel: LabelFields = { ...matchingLabel, alcoholContent: "13.6% Alc./Vol." };
      expect(fieldFor(buildVerdict(passLabel, exp).fields, "alcoholContent").status).toBe("pass");
      expect(fieldFor(buildVerdict(failLabel, exp).fields, "alcoholContent").status).toBe("fail");
    });

    it("applies wine's tighter tolerance (±1 point) above 14% ABV", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "wine", alcoholContent: "18%" };
      const passLabel: LabelFields = { ...matchingLabel, alcoholContent: "18.9% Alc./Vol." };
      const failLabel: LabelFields = { ...matchingLabel, alcoholContent: "19.1% Alc./Vol." };
      expect(fieldFor(buildVerdict(passLabel, exp).fields, "alcoholContent").status).toBe("pass");
      expect(fieldFor(buildVerdict(failLabel, exp).fields, "alcoholContent").status).toBe("fail");
    });

    it("passes beer ABV omitted from the label — disclosure is optional under federal law", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "beer", alcoholContent: "5%" };
      const label: LabelFields = { ...matchingLabel, alcoholContent: null };
      const { fields } = buildVerdict(label, exp);
      const result = fieldFor(fields, "alcoholContent");
      expect(result.status).toBe("pass");
      expect(result.reason).toMatch(/optional/i);
    });

    it("applies beer's ±0.3 point ABV tolerance", () => {
      const exp: ExpectedFields = { ...expected, beverageType: "beer", alcoholContent: "5.0%" };
      const passLabel: LabelFields = { ...matchingLabel, alcoholContent: "5.3% Alc./Vol." };
      const failLabel: LabelFields = { ...matchingLabel, alcoholContent: "5.4% Alc./Vol." };
      expect(fieldFor(buildVerdict(passLabel, exp).fields, "alcoholContent").status).toBe("pass");
      expect(fieldFor(buildVerdict(failLabel, exp).fields, "alcoholContent").status).toBe("fail");
    });

    it("applies the standard ±0.15 point spirits ABV tolerance for ordinary bottle sizes", () => {
      const exp: ExpectedFields = { ...expected, alcoholContent: "40%", netContents: "750 mL" };
      const passLabel: LabelFields = { ...matchingLabel, alcoholContent: "40.1% Alc./Vol.", netContents: "750 mL" };
      const failLabel: LabelFields = { ...matchingLabel, alcoholContent: "40.2% Alc./Vol.", netContents: "750 mL" };
      expect(fieldFor(buildVerdict(passLabel, exp).fields, "alcoholContent").status).toBe("pass");
      expect(fieldFor(buildVerdict(failLabel, exp).fields, "alcoholContent").status).toBe("fail");
    });

    it("applies the wider ±0.25 point spirits ABV tolerance for 50/100 mL mini bottles", () => {
      const exp: ExpectedFields = { ...expected, alcoholContent: "40%", netContents: "50 mL" };
      const label: LabelFields = { ...matchingLabel, alcoholContent: "40.2% Alc./Vol.", netContents: "50 mL" };
      // 0.2-point gap would fail at the standard 0.15 tolerance but passes under the 0.25 mini-bottle tolerance.
      expect(fieldFor(buildVerdict(label, exp).fields, "alcoholContent").status).toBe("pass");
    });
  });
});
