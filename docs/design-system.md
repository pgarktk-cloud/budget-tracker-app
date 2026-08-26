# Where'dItGo UI system

This is the implementation source of truth for the Stitch redesign. The approved
`stitch-reference/*/screen.png` files outrank the exported `code.html`; preserve
the app's existing information, calculations, navigation choices, and workflows.

## Direction

Use the approved **Technical Ledger** language: calm, precise, flat financial
instrumentation. Lead with the useful number or status, group related content
with a strict grid, and reveal editing detail progressively.

- No neumorphism or glass on content surfaces.
- Separate content with 1px hairlines, not shadows or nested rounded cards.
- Use jade/coral/blue only to explain status; default UI is cream, white, and ink.
- Keep the interface dense but touch-safe. Prefer aligned rows over card grids.

## Tokens

### Color

| Token | Value | Use |
| --- | --- | --- |
| `canvas` | `#FDFCF9` | App background and shell |
| `surface` | `#FFFFFF` | Inputs and interactive regions |
| `surface-subtle` | `#F3F3F3` | Selected/hovered rows |
| `surface-muted` | `#E8E8E8` | Disabled regions and chart tracks |
| `ink` | `#1B1B1B` | Primary text and black actions |
| `muted` | `#64748B` | Secondary labels and metadata |
| `hairline` | `#E4E2E4` | Borders and grid dividers |
| `success` | `#059669` | Positive/on-track states |
| `attention` | `#F87171` | Over-budget/negative states |
| `info` | `#3B82F6` | Neutral comparison series only |
| `danger` | `#BA1A1A` | Destructive actions and validation |

Use semantic names in components; do not embed screen-specific colors. The
approved set is light-only. Keep the same semantic roles in dark mode, but do
not treat the current dark palette or an automatic inversion as approved.

### Typography

Load the actual families rather than the current system/Iowan approximations.

**Corrected against the approved Stitch `code.html` (2026-08-26).** The earlier
table over-assigned Source Serif and Inter-bold; the approved screens are
**JetBrains-Mono-dominant**. Source Serif appears on essentially ONE figure —
the Investments portfolio total (`font-display-currency`, 40px). Inter is for
body text and row titles only. Where this table and an approved screenshot
disagree, the screenshot wins.

| Role | Family | Size / line | Weight and treatment |
| --- | --- | --- | --- |
| Primary financial display | Source Serif 4 | 40/46 | 600, tabular — Investments total only |
| Hero figure (Home/Budget/Expenses) | JetBrains Mono | 24–34 | 500 (600 acceptable), tabular |
| Instrument value | JetBrains Mono | 18–24 | 500, tabular |
| Page/section title | JetBrains Mono | 12/16 | 500, uppercase, `.12em` |
| Instrument label | JetBrains Mono | 10/14 | 400, uppercase, `.14em`, muted |
| Nav (sidebar/bottom) | JetBrains Mono | 12 / 10 | 400 inactive, 500 active, uppercase |
| Segmented control | JetBrains Mono | 10 | 500, uppercase, `.10em` |
| Body/data row | Inter | 14/20 | 400; 500 for row titles |
| Small metadata | Inter | 12/18 | 400 |

Everything technical — nav, page titles, instrument labels, and almost all
financial figures/percentages/dates/units — is **JetBrains Mono** (weights
400/500). Source Serif is reserved for the single dominant amount the approved
Investments screen renders in `font-display-currency`. Inter is body-only, with
500 for important row titles and 600–700 reserved for genuine emphasis/warnings.
Self-host these weights: Inter 400/500/600/700, JetBrains Mono 400/500/600,
Source Serif 4 600. Do not create extra type scales for individual screens.

### Spacing, shape, and elevation

- Base spacing: 4px. Prefer `8, 12, 16, 20, 24, 32`.
- Page inset: 20px mobile, 32px desktop. Primary module padding: 24px.
- Adjacent grid modules have no gap; distinct content zones may use a 20px gap.
- Content/module radius: 0. Controls may use 0-4px. Reserve circles for avatars,
  status dots, and icon geometry.
- Content has no shadow. A restrained shadow is allowed only on the mobile nav
  and FAB; neither should look glassy.
- Controls are at least 44px high/wide. FAB is 48px square with a 2-4px radius.

## Layout and responsive rules

### Mobile (`<768px`)

- Use an approximately 80px app header, a centered content column no wider than
  768px, and connected full-width modules separated by hairlines.
- Keep 20-24px internal module padding. Stack desktop columns in reading order:
  headline metric, context/status, detail rows, action.
- Use the fixed, centered bottom navigation shown in Stitch, clear it with page
  padding, and place the FAB above its top-right edge.
- The live product supports **five customizable destinations plus More**. Keep
  that behavior even though the concept screenshots show four plus More; adapt
  the Stitch bar to six touch-safe cells and verify at 320px.
- Hide secondary table columns only when their meaning remains available in the
  row/detail view. Never hide an action or financial state.

### Desktop (`>=768px`)

- Replace the stretched mobile shell with the Stitch shell: fixed 256px sidebar,
  64px top bar, and the remaining viewport as a 12-column content grid.
- Use full available width rather than the current global 920px cap. Typical
  splits are 8/4 for page + summary and 6/6 for analysis + ledger.
- Keep long ledgers independently scannable. Side summaries should align to the
  same horizontal and vertical hairlines as main content.
- Task flows may use a centered canvas up to 1152px, as in Add Transaction.

## Reusable components

Implement the smallest shared set below before converting screens. Existing
business components can render these primitives; do not replace state/data
architecture with Stitch's static markup.

1. `AppShell`: desktop sidebar/top bar; mobile header/bottom nav/FAB; sync,
   profile, Settings, safe areas, and the existing tab registry.
2. `PageBar` and `ScopeSwitch`: page title/date/actions and rectangular
   Me/Partner/Household or two-owner segmented controls.
3. `GridSection`: flat bordered module with optional title/action; composable
   into connected metric, content, and sidebar grids.
4. `MetricBlock` / `MetricStrip`: uppercase label, one dominant figure,
   comparison/status, and optional chart.
5. `LedgerRow` / `LedgerTable`: icon/title, aligned progress or metadata,
   amount, and optional disclosure/action. Desktop uses columns; mobile uses a
   compact row, not a separate raised card.
6. `ProgressMeter`: 4-8px neutral track, solid semantic fill, square marker,
   percentage/status labels. No liquid gradients or inset troughs.
7. `Status`: compact icon/text or 2px-radius badge; success, attention, info,
   neutral. Do not use color as the only signal.
8. `FieldRow` / `SegmentedControl` / `ActionButton`: hairline form grid,
   uppercase label, mono numeric value, and 44px target. Continue to use
   `NumField` for numeric behavior.
9. `TaskSurface`: full-screen mobile flow and wide desktop task canvas for
   transaction/update/contribution forms; sticky/fixed action region.
10. `Overlay`: shared sheet/dialog framing, focus management, scroll lock,
    destructive confirmation, loading, empty, offline, stale, and error states.

Keep the existing custom SVG icon registry unless there is a deliberate asset
decision. Normalize it to 20-24px outline icons, consistent stroke weight,
40-44px icon buttons, and filled active navigation icons. Stitch's remote
Material Symbols and portrait URLs are references, not production assets.

## Pattern rules

- A page gets one primary figure or decision, not several competing hero cards.
- Tables/lists use a header and continuous hairline rows. Use section labels to
  group owner, account, category, or status.
- Desktop side panels become inline sections below the related metric on mobile.
- Primary actions are black for general commits and jade for positive financial
  commits. Secondary actions are transparent with a hairline border; destructive
  actions use `danger` and confirmation.
- Prefer explicit status text (`ON TRACK`, `OVER`, `STALE`, `OFFLINE`) beside the
  value. Avoid soft filled pills as general decoration.
- Preserve empty, loading, offline, sync, stale-rate, conflict, undo, and error
  behavior while changing their presentation to the same grid/status system.
- Motion is brief and functional. Honor reduced motion; do not animate every
  list/card into view.

## Proven shared patterns (Home + the four direct-reference screens)

These are implemented and verified across Home, Budget, Expenses, Investments,
and Add/Edit Transaction. Reuse them rather than re-inventing per screen.

- **Open panels, not floating cards.** A screen section is an open region whose
  only structure is 1px hairlines. `homeCardStyle()` is borderless/transparent —
  the wrapper (a `.home-panel`, a `.split-*` column, or a `.ledger-row`) owns the
  padding and the rules. Do not wrap content in `neu()`/`glass()`/rounded cards.
- **Desktop splits** — `.split-8-4` (page/summary, e.g. Budget envelopes + right
  allocation rail; Expenses overview+envelopes + right activity rail) and
  `.split-6-6` (analysis + ledger, e.g. Investments overview+allocation + right
  holdings ledger). Both STACK on mobile and become adjoining columns divided by
  ONE vertical hairline (`> * + * { border-left }`) on desktop — the same rule as
  the Home primary panels. Inner padding via `.split-pad` / `.split-pad-l` /
  `.split-pad-r` so a column never collides with the vertical rule.
- **Ledger table** — `.ledger-head` (optional mono column header) + continuous
  `.ledger-row`s (hairline-separated, never raised cards); amounts are
  `.ledger-amt` (JetBrains Mono, tabular, right-aligned). `.ledger-group` is a
  muted mono group label (ESSENTIALS / STOCKS·ETF …). Per-row utilization/share
  uses `ProgressMeter` (flat, square marker); red only for genuine over/loss,
  green only for on-track/gain.
- **Metric strip** — a flat row of instruments (uppercase `.t-label`, one
  dominant mono figure, optional status/ruler) divided by vertical hairlines
  (`MetricStrip`/`MetricBlock`, or a screen-local `.bm`/`.exp-metrics` grid that
  stacks on mobile). Source Serif stays on the Investments portfolio total ONLY;
  every other hero/figure is JetBrains Mono.
- **Period control** — `.period-chip` (mono, hairline, dropdown affordance) or a
  flat ‹ month/subtitle › nav for the pay-period/month selector.
- **Scope switch** — the 3-way `HomeProfileToggle` (Me/Wife/Household) or 2-way
  `OwnerToggle`, flat `.seg-control`. On Home it lives in the desktop utility bar
  (`.home-scope-desktop`) and the mobile hero (`.home-scope-mobile`); Budget/
  Expenses keep their own 2-way toggle in-content.
- **Task surface** — `.sheet-task` full-screen mono form on mobile (Close ·
  TITLE · Clear header, context row, type segmented, prominent mono amount,
  connected left-label hairline field rows `.tx-field`, pinned RECORD action);
  bounded centered canvas (≤600px) on desktop. Required-empty validation shows
  as a red field label (borderless rows can't carry a border cue); the primary
  action stays disabled-until-valid.
- **Empty states keep geometry** — reserve the chart/region and show a restrained
  mono annotation; never fabricate trends. Offline sample data legitimately reads
  0 with empty charts.

## Reference map

- Shell and overview: `stitch-reference/dashboard-{mobile,desktop}/screen.png`
- Budget metrics and utilization: `budget-{mobile,desktop}/screen.png`
- Expense metrics, envelope rows, activity: `expenses-{mobile,desktop}/screen.png`
- Portfolio allocation and ledger: `investments-{mobile,desktop}/screen.png`
- Task forms: `transaction-{mobile,desktop}/screen.png`
- Supporting rationale/tokens: `stitch-reference/technical_ledger/DESIGN.md`

Generated brand names, currencies, sample data, navigation labels, and avatar
images are placeholders. Use Where'dItGo's real labels and data.
