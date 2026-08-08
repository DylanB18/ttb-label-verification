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
