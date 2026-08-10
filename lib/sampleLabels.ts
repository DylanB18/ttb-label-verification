import type { BeverageType } from "./types";

export interface SampleLabel {
  fileName: string;
  imagePath: string;
  description: string;
  expected: {
    beverageType: BeverageType;
    brandName: string;
    classType: string;
    alcoholContent: string;
    netContents: string;
    nameAddress: string;
    isImport: boolean;
    countryOfOrigin: string;
  };
}

/** Bundled sample labels so the app can be tried in one click without a real label photo on hand. */
export const SAMPLE_LABELS: SampleLabel[] = [
  {
    fileName: "clean-match-bourbon.png",
    imagePath: "/samples/clean-match-bourbon.png",
    description: "Clean match — everything lines up",
    expected: {
      beverageType: "spirits",
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
      nameAddress: "Old Tom Distillery, Louisville, KY",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "brand-typo-needs-review.png",
    imagePath: "/samples/brand-typo-needs-review.png",
    description: "Brand name typo — flagged for review, not an outright fail",
    expected: {
      beverageType: "spirits",
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
      nameAddress: "Old Tom Distillery, Louisville, KY",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "wrong-abv.png",
    imagePath: "/samples/wrong-abv.png",
    description: "Alcohol content mismatch — clear fail",
    expected: {
      beverageType: "spirits",
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
      nameAddress: "Old Tom Distillery, Louisville, KY",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "warning-title-case.png",
    imagePath: "/samples/warning-title-case.png",
    description: "Government warning in title case, not all caps — fail",
    expected: {
      beverageType: "spirits",
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
      nameAddress: "Old Tom Distillery, Louisville, KY",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "wine-table-wine-exempt.png",
    imagePath: "/samples/wine-table-wine-exempt.png",
    description: "Wine, no ABV printed — exempt at ≤14%, still passes",
    expected: {
      beverageType: "wine",
      brandName: "Fieldstone Vineyards",
      classType: "Red Table Wine",
      alcoholContent: "13%",
      netContents: "750 mL",
      nameAddress: "Fieldstone Vineyards, Sonoma, CA",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "beer-optional-abv.png",
    imagePath: "/samples/beer-optional-abv.png",
    description: "Beer, no ABV printed — optional under federal law, still passes",
    expected: {
      beverageType: "beer",
      brandName: "Harbor Light Brewing",
      classType: "Lager",
      alcoholContent: "5.2%",
      netContents: "12 fl oz",
      nameAddress: "Harbor Light Brewing Co., Portland, OR",
      isImport: false,
      countryOfOrigin: "",
    },
  },
  {
    fileName: "imported-scotch.png",
    imagePath: "/samples/imported-scotch.png",
    description: "Imported spirits — country of origin checked",
    expected: {
      beverageType: "spirits",
      brandName: "Glen Muir",
      classType: "Blended Scotch Whisky",
      alcoholContent: "43%",
      netContents: "750 mL",
      nameAddress: "Old Tom Imports, Atlanta, GA",
      isImport: true,
      countryOfOrigin: "Scotland",
    },
  },
  {
    fileName: "nonstandard-fill.png",
    imagePath: "/samples/nonstandard-fill.png",
    description: "Spirits in a non-standard bottle size — standard-of-fill fail",
    expected: {
      beverageType: "spirits",
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "700 mL",
      nameAddress: "Old Tom Distillery, Louisville, KY",
      isImport: false,
      countryOfOrigin: "",
    },
  },
];
