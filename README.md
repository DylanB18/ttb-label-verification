# TTB Label Verification (Prototype)

A standalone prototype that checks an alcohol beverage label photo against the
application data an agent would enter for it — brand name, class/type,
alcohol content, net contents, bottler/producer/importer name & address, and
(for imports) country of origin — checks the Government Warning statement
against the fixed federal wording, and assesses whether that warning is
formatted the way TTB requires (bold lead-in, non-bold body, visually set
off from other label text). The applicant also declares a **beverage type**
(beer / wine / spirits), because the underlying CFR requirements genuinely
diverge by type — wine may omit a numeric ABV statement at or below 14% ABV,
beer's ABV statement is federally optional altogether, and each type has its
own legal container sizes ("standards of fill") and ABV tolerance. Built for
the take-home described in
[`docs/stakeholder-notes.md`](docs/stakeholder-notes.md); the beverage-type-specific
rules were cross-checked against TTB's Beverage Alcohol Manual volumes for
beer, wine, and distilled spirits (not tracked in the repo — see
[`CLAUDE.md`](CLAUDE.md) for why).

**Live demo:** https://ttb-label-verification-three.vercel.app

## Setup & Run

Requires Node 20+.

```bash
npm install
cp .env.local.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

Other commands:

```bash
npm test                    # unit tests for the comparison logic (vitest)
npm run lint                # eslint
npm run generate-test-labels  # regenerate the synthetic label images in test-labels/
```

No database, no auth, nothing persisted — every request is stateless, in
keeping with the "don't store anything sensitive for this exercise" guidance
from the IT interview.

## How it works

1. **Extraction (hybrid OCR + vision, plus an always-on vision formatting
   check).** Every label image first goes through
   [`tesseract.js`](https://github.com/naptha/tesseract.js) OCR
   (`lib/ocr.ts`, `lib/parseFields.ts`) for the five text/numeric fields. If
   OCR confidence is low or a required field wasn't found, **Claude Haiku
   4.5** (`lib/visionExtract.ts`) fills in the gaps with a forced structured
   tool call — this keeps the common case cheap and fast while still
   handling labels plain OCR struggles with (during testing, generic OCR
   reliably dropped large stylized brand-name headers even on a clean,
   computer-generated label). Separately, **every request** — regardless of
   OCR confidence — also gets a vision call to assess the Government
   Warning's formatting (bold lead-in, non-bold body, visual separation from
   other text), because that's a judgment about the image itself that OCR
   text has no way to express. When both are needed, they're one combined
   call, not two, to keep latency and cost down.
2. **Comparison (`lib/compare.ts`).** Pure, unit-tested rules, no LLM
   judgment involved in the pass/fail decision itself:
   - **Brand name / class-type / name & address / country of origin:**
     normalized (case, punctuation, whitespace) exact match → PASS; a
     shortened/abbreviated form → PASS, flagged in the reason text rather
     than silently treated as identical — e.g. "VERMOUTH" vs "VERMOUTH DE
     CHAMBÉRY", or "Dolin" vs "MAISON DOLIN & CIE", where one value's
     significant words are a subset of the other's. The same subset check
     also covers name/address and country-of-origin values, since the label
     text there typically carries an explanatory phrase the application
     value doesn't (e.g. name/address "BOTTLED BY Old Tom Distillery..." vs
     application "Old Tom Distillery...", or country of origin "PRODUCT OF
     FRANCE" vs "France") — a close-but-not-identical match that isn't a
     clean abbreviation (Levenshtein similarity ≥ 85%) → NEEDS REVIEW, to
     mirror the "STONE'S THROW" vs "Stone's Throw" judgment call described
     in the agent interview, without silently passing something that might
     be a genuine typo; anything further off → FAIL. Country of origin is
     only checked at all when the applicant marks the product as an import;
     domestic products pass it automatically since the label correctly
     omits it.
   - **Alcohol content:** parsed to a number and compared against the
     application's value — but neither the *tolerance* nor whether a label
     is even allowed to omit it is a single flat rule; both depend on
     beverage type. Wine gets ±1 point above 14% ABV or ±1.5 points at/below
     14% (27 CFR 4.36), and may omit the numeric statement entirely at
     ≤14% ABV when the class/type reads "Table Wine" or "Light Wine" — PASS,
     not a missing-field fail. Beer's ABV statement is optional under
     federal law full stop (unless state law says otherwise, which isn't
     evaluated here) — a beer label with no ABV line PASSES. Spirits get
     ±0.15 points, widened to ±0.25 for 50mL/100mL containers. None of this
     models the wine range-statement format ("9%-12% ALC. BY VOL.", only the
     first number is parsed), beer's asymmetric low/non-alcoholic bounds, or
     the spirits high-solids-content exception (not detectable from a
     photo) — documented simplifications, not oversights.
   - **Net contents:** parsed to a number (with unit conversion — mL/L/oz)
     and compared numerically against the application. No fuzziness here; a
     number is either right or it isn't.
   - **Standard of fill:** a *second*, independent check on the same
     extracted net-contents value — is this container size even legal for
     the declared beverage type, regardless of what the application says?
     Beer has no federal standard of fill (any size is permitted); wine and
     spirits are each restricted to a fixed list of metric sizes (27 CFR
     4.72 for wine), with wine additionally requiring whole-liter fills for
     4-17L bulk containers and no restriction at all at 18L+. Spirits' 500mL
     size is flagged NEEDS REVIEW rather than FAIL — it was a legal standard
     until June 30, 1989 and may be genuine pre-1989 stock, which isn't
     something a photo can confirm on its own.
   - **Government Warning (wording):** compared **exactly, case-sensitive**,
     against the fixed statutory text, and separately checks that
     "GOVERNMENT WARNING:" is in all caps — this is what catches the
     title-case rejection example from the agent interview. Same word-for-word
     standard regardless of beverage type — unlike the fields above, TTB
     gives the warning text no shortened-name-style leniency.
   - **Government Warning (formatting):** driven by the vision model's
     boolean judgment (bold lead-in / non-bold body / visually set off), not
     text comparison — PASS only if all three hold; FAIL with the specific
     problem(s) named if any don't, or if the vision call couldn't locate
     the warning in the image; NEEDS REVIEW only if the vision call itself
     failed (network error, backend down), so formatting gets a human look
     rather than a silent skip.
3. **Verdict:** PASS if every field passes; NEEDS REVIEW if nothing failed
   but something needs a human look; FAIL if anything failed outright.

### Batch mode

`/api/batch` accepts a CSV or JSON manifest (one row per label, keyed by
image file name — template downloadable from the batch page) plus multiple
images, and processes them with a small worker pool and bounded concurrency
so a large batch doesn't serialize one-at-a-time the way the stakeholder
described the current process working. Manifest columns:
`fileName, beverageType, brandName, classType, alcoholContent, netContents,
nameAddress, isImport, countryOfOrigin`. `beverageType` defaults to
`spirits` if the column is omitted entirely (keeps older manifests written
before this field existed working unchanged); `countryOfOrigin` is only
enforced when `isImport` is `true`.

### Try it without a real label

The single-check page has a "no label handy? try a sample" section that
loads one of eight bundled synthetic labels (`public/samples/`, generated by
`scripts/generate-test-labels.ts`) and pre-fills the application fields: a
clean spirits pass, a brand-name typo (needs review), a wrong ABV (fail), a
warning statement in the wrong case (fail), a wine label with no ABV printed
that still passes under the ≤14% exemption, a beer label with no ABV printed
that passes because it's federally optional, an imported spirits label with
a matching country-of-origin statement (pass), and a spirits label in a
non-standard 700mL bottle (standard-of-fill fail).

## Tools & libraries

- **Next.js (App Router) + TypeScript** — single deployable app, API routes
  run server-side (Node runtime) so OCR and the Anthropic SDK don't need to
  ship to the browser.
- **tesseract.js** — OCR, runs in Node.
- **Claude Haiku 4.5** (`@anthropic-ai/sdk`) — chosen for being fast/cheap
  enough to fit the sub-5-second target even though, unlike a pure fallback,
  the warning-formatting check now calls it on every request, not just when
  OCR is uncertain. The IT interview flags that the agency's network blocks
  outbound calls to a lot of domains, so vision also supports
  `VISION_BACKEND=local` (see `.env.local.example`), which sends the same
  prompt to a self-hosted Ollama-compatible vision model instead of
  `api.anthropic.com`. This is wired up and unit-testable in isolation, but
  not deployed or exercised against a real local model server — it's
  scaffolding for that firewall scenario, not a verified production path.
- **sharp** — used only by the test-label generator, to rasterize SVG label
  mockups into PNGs.
- **papaparse** — CSV manifest parsing for batch mode.
- **vitest** — unit tests for the comparison logic.
- **Tailwind CSS** — styling.

**Deployment note:** `tesseract.js` works out of the box locally, but
Vercel's serverless build tracer can't see its dynamic `require()` calls (its
Node worker script, `tesseract.js-core`'s WASM binaries, and a handful of the
worker script's own runtime deps like `bmp-js`/`zlibjs`), so it silently
dropped them from the deployed function and every OCR request hung until
timeout. Fixed via `outputFileTracingIncludes` in `next.config.ts`, which
explicitly tells Vercel to bundle those files.

## Assumptions, trade-offs, and known limitations

- **Standalone prototype, no COLA integration** — confirmed out of scope by
  the IT interview.
- **Checked fields are brand name, class/type, ABV, net contents, standard
  of fill, name & address, country of origin (imports), and the Government
  Warning (wording + formatting)** — this now covers TTB's full
  mandatory-label-info list for the three beverage types' Chapter 1
  checklists, not just the day-to-day spot-check Sarah described in the
  interview. A few items from the Beverage Alcohol Manuals are still
  deliberately out of scope, listed below rather than silently dropped.
- **Physical/spatial requirements aren't checked** — minimum type size
  (mm, scaling with container volume), whether text is placed on a
  contrasting background, "separate and apart from" spacing, and spirits'
  "must appear parallel to the base of the container" rule all require a
  ruler or 3D knowledge of the physical bottle, not just a 2D photo with no
  scale reference. Same reasoning as the pre-existing warning-type-size gap
  below, extended to every field that has a type-size/legibility/placement
  sub-requirement in the source manuals (name & address, class/type, net
  contents, country of origin, etc.).
- **Conditional ingredient disclosures aren't checked** — sulfite,
  saccharin, aspartame, FD&C Yellow #5, and cochineal/carmine declarations
  are only mandatory when the product actually contains that ingredient,
  which isn't knowable from a photo or from the fields currently on the
  application form. Adding them would mean adding a new "does this product
  contain X?" input per ingredient — a real feature, not implemented here.
- **State of distillation and range-format ABV statements aren't checked**
  — spirits' "state of distillation must be disclosed if it differs from
  the state named in the name/address" rule and wine's ABV-as-a-range
  format ("9%-12% ALC. BY VOL.") both add conditional logic beyond what was
  practical for this pass; `parseAbvPercent` will read a range statement as
  just its first number, a known simplification.
- **Name & address matching is lenient about which parts of the address are
  present.** The regs let the label omit street address/ZIP (only city and
  state are strictly required); the abbreviation/subset match in
  `compareTextField` (reused for this field) handles that gracefully in
  practice, but if the application is given a full street address and the
  label only has "City, State" the match quality depends on which value's
  words happen to be the subset — recommend entering just name + city +
  state on the application to match what's actually mandatory on the label.
- **Government Warning text verified against ttb.gov.** The exact statutory
  wording used here (`lib/types.ts`) was cross-checked against TTB's public
  guidance, not just the take-home prompt:
  - [TTB — Distilled Spirits Labeling: Health Warning Statement](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-health-warning)
  - [TTB — Distilled Spirits Labeling: Checklist of Mandatory Label Information](https://www.ttb.gov/regulated-commodities/beverage-alcohol/distilled-spirits/ds-labeling-home/ds-checklist)
  - Real TTB rules also require "GOVERNMENT WARNING" specifically to be in
    **bold** type (with the rest of the statement *not* bold), visual
    separation/contrast from other label text, and a minimum type size that
    scales with container volume. The bold and separation checks are now
    covered (see "How it works" above) via a vision model's visual judgment
    on the photo — a genuine assessment, but not a pixel measurement, so
    treat borderline cases as informative rather than authoritative. The
    minimum-type-size-vs-container-volume rule is **still not checked**: it
    requires a physical measurement (point size against a known container
    volume) that isn't recoverable from a photo with no scale reference —
    documented here as a deliberate scope cut, not an oversight.
- **Brand name / class-type layout heuristic.** The OCR-only field parser
  (`lib/parseFields.ts`) assumes a top-to-bottom label layout (brand, then
  class/type, then ABV/net-contents/name-address/country-of-origin in any
  order among themselves, then warning last). Real labels vary a lot more;
  this is why the vision fallback exists, and why it triggers whenever a
  required field comes back empty. One specific consequence: everything
  after the warning statement starts gets swallowed into the warning text,
  so name/address or country-of-origin lines are only recognized by the
  OCR-only parser if they appear *before* the warning block on the label —
  vision doesn't share this limitation, so it's a gap only when OCR alone
  is confident and complete enough to skip the vision merge.
- **Image quality (angle, glare, poor lighting).** Not specifically handled
  beyond whatever robustness the vision fallback provides — noted in the
  agent interview as "maybe out of scope for a prototype," and treated that
  way here.
- **Cold-start latency.** The very first request to a fresh server instance
  pays a one-time cost to initialize the OCR worker (~6-9s in testing);
  every request after that on the same warm instance lands at ~2.5-3.5s for
  OCR alone. Serverless deployments (Vercel included) will re-pay this cost
  after periods of no traffic scale an instance to zero — a production
  version would want a keep-warm ping or a dedicated long-running OCR
  worker to avoid that first-request penalty.
- **The formatting check adds a vision call — and its latency — to every
  single request**, not just low-confidence ones. Measured around 3.8-4.8s
  total (OCR + vision) in testing against the deployed function, which
  still lands inside the 5-second target but with much less headroom than
  the OCR-only path had; a slow or rate-limited Anthropic API response
  would now affect every check, not just the subset that used to need
  vision. This was a deliberate trade — accurate formatting verification was
  judged worth it — but it's worth watching in aggregate usage/latency
  metrics if this moves beyond a prototype.
- **Public-deployment cost/abuse guardrails are best-effort, not
  production-grade.** This demo calls a paid API from a public URL, so
  `lib/rateLimit.ts` adds a simple in-memory per-IP rate limit and
  `lib/limits.ts` caps image size (8MB) and batch size (40 images). Because
  the formatting check now calls the API on every request (see above), the
  per-request cost floor is higher than before, and batch mode's rate limit
  (3 batches / 10 min / IP) is what mainly bounds cost, since a single batch
  can be up to 40 images × 1 vision call each. The rate limiter is also
  per-instance in-memory, which is fine for a prototype but would need a
  shared store (e.g. Redis) for a real multi-instance deployment.
- **No persistence, no auth** — per the "don't store anything sensitive for
  this exercise" guidance; every request is processed and discarded.

## Testing

`npm test` runs unit tests (`lib/__tests__/compare.test.ts`, 47 cases)
covering the comparison/verdict logic: clean matches, case/punctuation-only
and abbreviated-name differences (pass), near-miss typos (needs review),
genuine mismatches (fail), unit conversion for net contents, all the
Government Warning wording failure modes (missing, reworded, wrong case),
all the warning formatting outcomes (bold lead-in missing, body also bold,
not visually separated, warning not locatable, no vision check available),
name & address matching (found, near-miss, genuine mismatch), country of
origin (domestic skip, import match/mismatch/missing, import declared
without an expected country), standard of fill (beer's no-restriction case,
spirits pass/fail/legacy-500mL, wine pass/fail/bulk-container-whole-liters/
18L+-unrestricted, unparseable net contents), and the beverage-type-specific
alcohol content rules (wine's ≤14% exemption and its needs_review/fail
boundary cases, wine's two-tier tolerance, beer's optional-ABV pass and
±0.3 tolerance, spirits' ±0.15 vs ±0.25 mini-bottle tolerance).

The full pipeline (OCR → vision → compare) was exercised end-to-end via
`curl` against a local dev server for the wine ABV-exemption, beer
optional-ABV, imported-spirits country-of-origin, and non-standard-fill
samples specifically (in addition to the pre-existing spirits samples), plus
against the deployed Vercel function for the original single-label and batch
flows.
