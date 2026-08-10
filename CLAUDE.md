@AGENTS.md

# TTB Label Verification — agent notes

Take-home prototype for a Treasury AI Engineer application. See `README.md`
for the user-facing setup/approach doc and `docs/stakeholder-notes.md` for
the original brief. This file is for whoever (human or agent) touches the
code next.

## Deployment gotcha: tesseract.js on Vercel

`tesseract.js` works locally with zero config but **silently breaks in
Vercel's serverless build** — the build tracer can't see its dynamic
`require()`s (Node worker script, `tesseract.js-core`'s WASM binaries, and
runtime deps like `bmp-js`/`zlibjs`), so requests to `/api/verify` and
`/api/batch` hang until the function timeout with no build-time error. Fixed
in `next.config.ts` via `serverExternalPackages` (stops Turbopack from
bundling it) + `outputFileTracingIncludes` (tells Vercel to ship the files
its tracer misses). If you bump `tesseract.js` or add another dynamic-require
package, re-verify against the **actual deployed URL** with a real
`/api/verify` call — `next build && next start` locally does not reproduce
this; only Vercel's own file tracing does.

## Other non-obvious things

- The single-check page's sample-label loader sets `imageFile` state
  programmatically (not via the file input's real `.files`), so that input
  must not have `required` — the browser's native validation blocks
  submission otherwise even though the app's own validation is correct.
- ABV comparison (`lib/compare.ts`) accepts a bare number ("40") as well as
  "40%" for the *expected* value, since batch manifests may omit the sign —
  don't reintroduce a percent-only regex there.
- `docs/stakeholder-notes.md` is the original README the take-home shipped
  with; it got overwritten once by `create-next-app`'s scaffolding and was
  restored from conversation context — keep it as the canonical brief, don't
  regenerate it from memory.
- `lib/compare.ts`'s `compareTextField` (brand name, class/type) passes
  shortened/abbreviated values outright — e.g. "VERMOUTH" vs "VERMOUTH DE
  CHAMBÉRY", or "Dolin" vs "MAISON DOLIN & CIE" — via `isAbbreviationMatch`
  (one value's significant words are a subset of the other's, past a small
  legal/connective-word stoplist). Status is `pass` with a reason noting the
  abbreviation, not `needs_review` — per stakeholder guidance, a shortened
  name/class isn't "meaningfully different" and shouldn't drag the overall
  verdict down. The government warning has no equivalent leniency; it's
  still checked word-for-word.
- `lib/visionExtract.ts`'s vision call (`runVisionAssessment`) can run
  against a self-hosted model instead of the Anthropic API — set
  `VISION_BACKEND=local` plus `LOCAL_VISION_URL` (default
  `http://localhost:11434/api/chat`, i.e. an Ollama instance) and
  `LOCAL_VISION_MODEL` (default `llava`). This exists for deployments
  behind an outbound firewall that blocks `api.anthropic.com`. The local
  path has no forced tool-calling, so it asks for raw JSON (`format:
  "json"`) and validates the shape instead of trusting a schema — if you
  swap in a different local server, keep that validation, don't assume
  well-formed output. Not deployed/tested against a real local model yet.
- **Vision now runs on every `/api/verify` request, not just as an OCR
  fallback.** `runVisionAssessment` (`lib/visionExtract.ts`) returns both
  extracted fields *and* a Government Warning formatting judgment (bold
  lead-in / non-bold body / visually set off from other text) in one call —
  bold/layout is a purely visual property tesseract.js (or any OCR text
  output) has no way to express, so this can't be an OCR-confidence-gated
  fallback like the field extraction is. `verifyPipeline.ts` calls it
  unconditionally but only *uses* its field values to fill OCR gaps
  (`needsVisionForFields`); the formatting result is always used. This
  means every request — and every image in a batch — now pays for one
  Claude Haiku call minimum, not just low-confidence ones; see the
  "formatting check" bullets in README's latency/cost-guardrail sections
  before changing rate limits or `MAX_BATCH_IMAGES`.
- `lib/compare.ts`'s `compareWarningFormatting` turns that vision judgment
  into a `governmentWarningFormat` field result (`pass`/`fail` based on the
  three booleans; `needs_review` only if the vision call itself errored, so
  a transient failure doesn't silently disappear formatting from the
  verdict). It doesn't attempt the minimum-type-size-vs-container-volume
  TTB rule — no physical scale reference exists in a photo — that's
  documented as a known gap in README, not silently dropped.

## Design system ("modern federal digital service")

Originally styled as a vintage "inspection ledger" (cream paper, italic
serif, rotated ink-stamp badges); re-skinned toward a modern,
USWDS-influenced federal look (white surfaces, systematic type, solid status
chips) per stakeholder request. Palette and type tokens still live in
`app/globals.css` (`--paper`, `--surface`, `--ink`, `--navy`, `--navy-dark`,
`--brass`, `--brass-light`, `--stamp-pass`, `--stamp-fail`, `--stamp-review`)
and are exposed as Tailwind utilities (`bg-navy`, `text-brass`, etc.) via the
`@theme inline` block — use those tokens rather than Tailwind's default
palette (`neutral-*`, `blue-*`) so new UI stays visually consistent. `--brass`
is now a Treasury-blue accent (not literal brass) — kept the variable name so
existing utility classes didn't need a rename. Fonts: Fraunces (serif, used
sparingly for page-level `<h1>`s only, non-italic, via `font-serif`), IBM
Plex Sans (body/UI default), IBM Plex Mono (`font-mono`, for the
application-vs-label comparison values and any status/data display — the
mono treatment is deliberate, it reinforces that the match must be exact).
`StatusBadge`'s `lg` size is the one signature element (a solid, filled
status chip for the overall verdict) — keep that visual weight concentrated
there; `md` (used in per-field rows) stays outlined/flat on purpose.

Accessibility constraints are load-bearing, not decorative — they came
directly from the stakeholder interviews (agent's mother testing it, half
the review team over 50): 18px base font, no dark-mode media query, visible
`:focus-visible` ring, status conveyed by icon *and* text label, never color
alone. Preserve all of these in any future styling pass.

## Commands

```bash
npm run dev                   # local dev (Turbopack)
npm run build                 # production build — do this before deploying
npm test                      # vitest, lib/__tests__/compare.test.ts
npm run generate-test-labels  # regenerate test-labels/ + public/samples/
vercel --prod                 # deploy (CLI already linked to dbober/ttb-label-verification)
```

`ANTHROPIC_API_KEY` is already set as a Vercel production env var
(`vercel env ls production` to confirm — never print the value). Local dev
needs it in `.env.local` (gitignored, not committed).

## Deployed

- Repo: https://github.com/DylanB18/ttb-label-verification
- Live: https://ttb-label-verification-three.vercel.app
