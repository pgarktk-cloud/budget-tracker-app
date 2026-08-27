# Stitch screen-port workflow (this repo)

**Read this before touching any redesign screen.** This is the "start here"
playbook that ties together how the Technical Ledger overhaul actually got
built. It is deliberately thin — it gives the *sequence, rules, and gates* and
links out to the detail docs rather than repeating them:

- `docs/design-system.md` — the token/pattern **source of truth** (`P` palette,
  the flattened card primitives, type/spacing scales).
- `docs/ui-audit.md` — the A/B/C screen coverage matrix and the "global fixes
  first" mapping (legacy mechanism → replacement).
- `docs/ui-verification.md` — the exact screenshot method + the computed-font
  evidence format.
- `docs/roadmap.md` — the forward queue and the short "Per-screen recipe".

For the portable, project-agnostic version of this method (to reuse in other
codebases), see `docs/stitch-ui-overhaul-playbook.md`.

---

## The artifacts, and which one wins

- **`stitch-reference/<screen>/screen.png` is the source of truth.** Ten screen
  folders (`dashboard-*`, `budget-*`, `expenses-*`, `investments-*`,
  `transaction-*`, each `-mobile` and `-desktop`), each pairing the approved
  **PNG mockup** with a **`code.html` Stitch export**.
- **The `code.html` export is reference-only** — good for approximate
  dimensions and token values, nothing more. **Never paste its literal CSS.**
  You *translate the mockup into this app's own system* (`P` + the shared
  primitives). The PNG **outranks** the export (see `design-system.md:3`).
- `stitch-reference/technical_ledger/DESIGN.md` is the Stitch brief / token
  ledger (palette, type, spacing, the "Technical Grid System" prose).
- `docs/stitch-redesign/` is the **brief package that was sent *to* Stitch**
  (product context, current-UI summary, design direction, key screens, master
  prompt) plus `screenshots/` of the **pre-redesign** app — those screenshots
  document the OLD UI and are **not** approved references.

## Order of operations

1. **Global primitives first.** Most drift lives in the shared palette, card
   helpers, and global CSS — not in per-view markup. Flip those in one move
   before touching any single view. In this repo that meant flattening the six
   `neu*`/`glassPanel`/`homeCardStyle`/`liquidFillBg` helpers to borderless
   cream/ink/hairline surfaces and flipping `PALETTE_LIGHT`/`PALETTE_DARK`/`P`
   (adding `onInk`, `heroBg`/`heroFg`, `canvas`, `surface`, `hairline`, …). One
   primitives pass removes more inconsistency than rewriting each view. (See the
   "global fixes first" table in `ui-audit.md`.)
2. **Fix shared primitives in BOTH themes and BOTH breakpoints.** A token or
   helper change must be correct in light *and* dark, mobile *and* desktop. Only
   **composition** changes (what stacks where on a narrow screen) may be
   breakpoint-scoped — guard those with `useIsMobile()` (matchMedia 768), never
   by forking the primitive. (This is the rule commit `ad3d9ee` established.)
3. **Presentation-only discipline.** A redesign changes how things *look*, never
   what they *compute*. No edits to calculations, the data model, mutators, or
   sync. The proof is that **all 25 test runners + `parsecheck.cjs` stay green**
   across the whole redesign — a red runner means you changed behaviour, not
   just style. (Commit `a5baf71` shipped the 5 screens this way.)
4. **One screen at a time, serialized.** `index.html` is one monolith — never
   port two screens in parallel (parallel edits to the same file half-apply).
   The overhaul used serialized `fork` subagents, one screen each, in sequence.
5. **Port the screen** by re-expressing the mockup in the app's now-flat
   primitives + `P` tokens, preserving the screen's existing information,
   calculations, navigation, and workflows.
6. **Run the gap-list verify loop** (below) until the screen matches the PNG.
7. **Record any accepted diff** (below) so it isn't "re-fixed" next pass.
8. **Hit the done gate** (below), mark the checkpoint, then move to the next
   screen.

## Redesign principles (established in the Banks review, 2026-08-27)

These came out of a three-round user review of Banks and govern **every**
Category B/C screen from here (Net Worth next). They are as load-bearing as the
order of operations above.

- **Do NOT mirror the current live app 1:1 — re-layout freely.** The live screen
  is the source of *information and behaviour*, not of *layout*. A screen with no
  direct Stitch mockup (Category B/C) should be **re-composed** in the open-ledger
  language, not merely reskinned in place. Rearranging sections, changing what is
  primary vs secondary, and dropping decorations (boxed cards, dashed tiles,
  wallet-pass strips) are all in scope. Preserve every figure, calculation,
  navigation path and workflow; change the arrangement to fit the language.
- **Desktop gets a genuine second column, and it may carry NEW content.** Wide
  screens use the `.split-8-4` (main ledger LEFT + rail RIGHT) — never a
  mobile layout stretched to full width. The rail is allowed to introduce
  **new, read-only, derived modules that don't exist on mobile or in the current
  app** — e.g. Banks gained "Cash availability", "Account checkup", and a
  "Currency exposure" footer, all pure reads over existing data via existing
  helpers. Proposing such a rail (and asking the user what it should hold) is the
  expected move, not scope creep. The rail stacks below the ledger on mobile
  (the `.split-8-4` grid only turns on ≥1024px), consistent with Budget/Expenses.
  **Generating a short menu of candidate rail modules and letting the user pick
  is a valued step** (Net Worth's rail was chosen this way — Growth + Milestone,
  from a slate that also offered Owner-contribution and Net-worth-health). Be
  **exploratory**: propose modules that genuinely fit the screen and the app, not
  just the safe two; the user would rather choose from ideas than be handed one.
- **Only ONE bordered card per screen — the hero/summary. Everything else is an
  OPEN section.** This is the most-missed rule (Net Worth first shipped with
  Composition/trend/driving each wrapped in a `GridSection` card; Banks uses
  `GridSection` exactly **once**, for its summary). An open section is a
  `.t-section` mono label + hairline-separated content with **no border box** —
  the same treatment the rail modules already use. Reach for `GridSection` (which
  draws a border) only for the summary MetricStrip; compose composition,
  charts, ledgers, and logs as open sections. When in doubt, count your
  `GridSection`s: more than one is almost always the bug.
- **Open-ledger conversion checklist** (apply per screen): flatten boxed cards →
  **hairline-separated rows** (per-row `borderTop:1px hairline`, no card border);
  combine identity onto one line with a **primary name + quieter secondary**
  (e.g. "Name · BANK"); **normalize the metadata row** — every chip/tag at the
  same 10px/mono/`P.muted` weight, a *coloured square* the only status accent
  (never a bold `Status` chip inline); replace big "add" tiles with a flat
  **"+ Add …" row**; move any inline-edit/settings behind a **row expand**
  (Budget's precedent — panel renders below the row); remove **redundant labels**
  that the group header already states (e.g. per-row owner tags).
- **Font hierarchy is fixed: 500 is the ceiling for names and figures.** Names,
  balances, primary figures = **500**; de-emphasized labels = **400**; **600/700
  are reserved for tiny (≤11px) uppercase mono tags only** — never a name or a
  large number. Ledger row amounts are ~14–16px (not 26px). Note that **JetBrains
  Mono figures read chunkier than Inter at the same weight** — that's the intended
  "instrument" look, not bold; don't lighten mono numbers to compensate. Do not
  edit shared primitives (`MetricBlock`'s one 600 hero figure) to change a single
  screen — give that screen its own element instead.
- **Scope selector before its totals.** The profile/scope switch reads **above**
  the summary it scopes (left-aligned, as Budget/Expenses do), not centred and
  not below.
- **Percentages that are shown together must total 100.** Round with a
  largest-remainder apportionment (`pctInts` — floor all, hand leftover points to
  the largest fractional remainders), never three independent `Math.round`s
  (which produce 101%).
- **Verify at the Pro Max width too.** 390 is the *standard* iPhone width; the
  Pro Max is ~430–440pt (wider). The shots harness now captures **430** as well
  as 390/320/1600. A narrow-tile figure must not wrap mid-number at ≤390 — give
  it a small currency prefix + `nowrap` (see the Banks owner-split tiles).

## The gap-list verify loop

Do **not** eyeball fidelity. The loop that actually closed the gaps:

1. **Shoot the running screen at TRUE device width.** The in-browser screenshot
   tool **clamps to ~500px**, so a "mobile" shot from it is wrong. Use **headless
   Chromium via Playwright at a true 390px** viewport (deviceScaleFactor 2) and
   **1600px** desktop, saved as real PNG. Serve a fresh local origin with sample
   data and no real sync credentials. (Exact method + evidence table:
   `ui-verification.md`.)
2. **Enumerate discrepancies as a numbered gap list.** The mobile pass was
   literally "close **12 gaps** vs stitch-reference" — obs 1…12, each a concrete
   drift (e.g. "segments were 16 near-identical greys", "invisible white-on-ink
   in dark mode → new `onInk` token"). A numbered list is what makes "close
   enough" impossible to hide behind.
3. **Close them one by one**, re-shoot, and **read computed styles from the live
   DOM** (`getBoundingClientRect`, computed `font-family`/`weight`/`size`) to
   confirm — measurement, not impression. CLAUDE.md's date-input, sheet-header,
   and 320px-header notes are all "measured in the browser; don't re-derive by
   eye" for exactly this reason.
4. **Re-run the suite** (25 runners + `parsecheck.cjs`).

## Done gate — when a screen is "approved"

All four, or it is not done:

- Matches its `stitch-reference/*/screen.png` mockup, **browser-verified at both
  390px and 1600px**.
- All **25 test runners** and `parsecheck.cjs` green.
- **Presentation-only** — no logic/data/mutator/sync diff.
- Every intentional deviation is written in the accepted-diffs log below.

Mark a **CHECKPOINT** before starting the next screen. Screens are classified
**Category A** (direct-reference: Home, Budget, Expenses, Add Transaction,
Investments — all done) vs **B/C** (no direct mockup — derive from the
now-established system); do A before B/C. See the matrix in `ui-audit.md`.

## Accepted-diffs log

Intentional, approved deviations from the mockup — do **not** "fix" these:

- **Net Worth wave** (v1.53.1): the mockup's wave is a decorative sine; real net
  worth rises monotonically. Resolution: style the *real* data like the ref
  rather than faking a sine. (Don't restore a decorative wave over real data.)
