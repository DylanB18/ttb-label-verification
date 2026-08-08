export interface SampleLabel {
  fileName: string;
  imagePath: string;
  description: string;
  expected: {
    brandName: string;
    classType: string;
    alcoholContent: string;
    netContents: string;
  };
}

/** Bundled sample labels so the app can be tried in one click without a real label photo on hand. */
export const SAMPLE_LABELS: SampleLabel[] = [
  {
    fileName: "clean-match-bourbon.png",
    imagePath: "/samples/clean-match-bourbon.png",
    description: "Clean match — everything lines up",
    expected: {
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
    },
  },
  {
    fileName: "brand-typo-needs-review.png",
    imagePath: "/samples/brand-typo-needs-review.png",
    description: "Brand name typo — flagged for review, not an outright fail",
    expected: {
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
    },
  },
  {
    fileName: "wrong-abv.png",
    imagePath: "/samples/wrong-abv.png",
    description: "Alcohol content mismatch — clear fail",
    expected: {
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
    },
  },
  {
    fileName: "warning-title-case.png",
    imagePath: "/samples/warning-title-case.png",
    description: "Government warning in title case, not all caps — fail",
    expected: {
      brandName: "Old Tom Distillery",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45%",
      netContents: "750 mL",
    },
  },
];
