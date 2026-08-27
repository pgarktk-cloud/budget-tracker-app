# Stitch UI-overhaul playbook (portable)

> **Copy this file into whatever project you're redesigning.** It is
> project-agnostic on purpose — it captures the *method* that made a Stitch
> "approved reference" overhaul succeed, not any one codebase's helpers.
> Substitute your own design system, files, and test command where noted.
> (Written around Stitch; the same method applies to Figma or any mockup tool —
> read "Stitch's code export" as "the mockup tool's code export.")

The core idea in one line: **the approved mockup is the target; your app's own
design system is the material. You translate the mockup into your system — you
never paste the tool's code export.**

---

## 0. Inputs — brief the tool well, keep the outputs

Before generating anything, write a short brief package (this is what produced
good, consistent Stitch screens):

1. **Product context** — what the app is, who uses it.
2. **Current-UI summary** — what exists today, so the redesign preserves
   information/workflows instead of inventing new ones.
3. **Design direction** — the visual language in words (e.g. "flat, hairline
   rules, monospace numerals, no shadows").
4. **Key screens & workflows** — the screens to design and what each must show.
5. **A master prompt** — the single prompt you hand the tool, distilled from 1–4.

Then, from the tool, keep **two artifacts per screen, both committed**:

- the **approved mockup image** (PNG) — the source of truth, and
- the **code export** (HTML/CSS) — reference-only.

Also keep a **design-token ledger** (the palette, type scale, spacing the tool
used). Commit all of it so later work can diff against it.

## 1. Which artifact wins

- **The mockup PNG is authoritative.** The code export is good only for
  *approximate* dimensions and token values.
- **Never paste the export's literal CSS into your app.** It references remote
  fonts/icons/placeholder assets and encodes the tool's own layout system, not
  yours. Instead, **re-express each screen in your app's existing design
  system** — your shared tokens and your shared surface/card/row helpers.
- If mockup and export disagree, the **mockup wins**.

## 2. Global primitives first — before any single screen

Most visual drift lives in **shared foundations** — the color tokens, the
card/surface helpers, the global CSS — not in per-screen markup. So:

- **Flip the foundations in one move first**: the color palette (both light and
  dark), the shared surface/card helpers, base typography. In practice this is a
  handful of edits that re-skin the *entire* app at once.
- Only *after* the foundations match the new language do you port individual
  screens. One foundation pass removes more inconsistency than rewriting every
  view independently ever will.

**Rule:** a foundation change (a token, a shared helper) must be correct in
**both themes and both breakpoints**. Only *composition* changes — what stacks
where on a narrow screen — may be breakpoint-scoped, behind a single breakpoint
hook. Never fork a shared primitive per breakpoint.

## 3. Presentation-only discipline

A UI overhaul changes how things *look*, never what they *compute*. **No changes
to business logic, data model, state mutations, or sync.** Your proof is that
**your existing test suite and build/parse check stay green through the entire
redesign** — a newly-red test means you changed behaviour, not just style. If
you have no tests, add at least a parse/build check you can run after every edit,
because a redesign touches a lot of surface area fast.

## 4. One screen at a time — serialized, never parallel

Port screens **one at a time, in sequence.** If your UI lives in a few large
files (or one monolith), parallel edits to the same file half-apply and corrupt
each other. Finish and verify a screen before starting the next.

Classify screens up front:
- **Category A** — screens you have a direct mockup for. Do these first.
- **Category B/C** — screens with no direct mockup. Derive them from the design
  system you established doing the A screens; don't guess per-screen.

## 5. The verify loop — measure, never eyeball

**Principle: verify fidelity at true device width by measurement, not by eye.**
The most common failure is trusting a screenshot at the wrong width, or judging
"close enough" by impression. Two things defeat that:

**a. Shoot at the *real* device width.** Many built-in/in-IDE screenshot tools
silently **clamp width** (often to ~500px), so a "mobile" shot is not actually
your target width and the comparison is meaningless. **Clamp-check your tool
once**: shoot a known 390px layout and confirm the PNG is really 390 CSS px
wide. If it clamps, use a headless browser (e.g. Playwright/Chromium) at the
true width instead (e.g. 390px mobile, deviceScaleFactor 2; plus your desktop
width). Serve a throwaway local origin with sample data and no real credentials.

**b. Run a numbered gap list.** Put the running screen next to the mockup and
write discrepancies as an *enumerated* list — "gap 1 … gap 12" — each a concrete
drift ("segments are near-identical greys", "white text invisible on the dark
hero"). Close them one by one, re-shoot, and where alignment/size/type matter,
**read the computed value from the live DOM** (bounding rects, computed
font-family/weight/size) rather than trusting the picture. A numbered list is
what makes "close enough" impossible to hide behind. Re-run your test/parse
check after each batch.

> If you have **no** screenshot/automation tool at all: you can still apply the
> principle — enumerate gaps from a manual side-by-side and read computed styles
> from your browser's devtools by hand. The loop is the same; only the capture
> is manual.

## 6. Record accepted diffs

Some deviations from the mockup are *intentional* — usually where the mockup
shows decorative or placeholder content that your real data can't match (e.g. a
decorative wave vs. real monotonic data). **Write each accepted diff down** in a
short running log, with the reason, so a later pass doesn't "re-fix" it back to
the mockup and undo a deliberate choice.

## 7. Done gate

A screen is done only when **all** hold:

- It matches its mockup, **browser-verified at every target width** (not just
  the clamped one).
- Your test suite / parse-build check is **green**.
- The change is **presentation-only** (no logic/data diff).
- Every intentional deviation is in the accepted-diffs log.

Mark a checkpoint, then move to the next screen.

---

### One-glance checklist

- [ ] Brief package written; mockups + code export + token ledger committed
- [ ] Mockup PNG treated as source of truth; export used for dims/tokens only
- [ ] Foundations (palette, shared helpers, global CSS) flipped first, both
      themes + both breakpoints
- [ ] Screens ported one at a time, serialized; A before B/C
- [ ] Presentation-only; suite/parse-check green throughout
- [ ] Screenshot tool clamp-checked; verified at TRUE device width
- [ ] Discrepancies closed via a numbered gap list, confirmed by DOM measurement
- [ ] Accepted diffs logged
- [ ] Done gate met per screen; checkpoint marked
