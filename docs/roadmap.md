# Implementation Roadmap — Investment Module

## Phase 1 — Architecture & ownership (DONE, 2026-07-28)
Investment Accounts data model (`owner`, `type`), migration, Home page
ownership-aware calculations, minimal Owner/Type UI. See `docs/current-status.md`.

## Phase 2 — MP2 + Time Deposit valuation (DONE, 2026-07-28)
MP2 (contribution log, centrally-shared declared dividend rates, confirmed/
estimated valuation, annual-payout receivable tracking) and Time Deposit
(principal/rate/term/compounding, gross/net accrual, maturity confirmation +
optional bank transfer) both fully implemented, priced through
`investmentValueSar()`'s per-type dispatch, and included in profile-aware
Portfolio/Net Worth. See `docs/current-status.md` and `docs/decisions.md`.

## Phase 3 — Gold valuation + historical snapshots (DONE, 2026-07-28)
Gold Investment Accounts (physical bars/coins only; weight/unit/karat-purity/
purchase cost/date, priced off a live spot quote reusing the existing Worker→
Yahoo proxy — no new API/key), fully wired into `investmentValueSar()`'s
dispatch and therefore into Portfolio/Net Worth/Home exactly like MP2/TD.
Also added a new daily, per-profile (Me/Wife/Household) snapshot system
(`data.snapshots`) with progressive daily→weekly→monthly retention, and a
shared range-selectable chart component (1W/1M/3M/1Y/MAX) used by both the
Net Worth and Investments tabs, plus a real per-profile mini trend on the
Home Portfolio card. See `docs/current-status.md` and `docs/decisions.md`.

## Phase 4 (not yet scoped) — Per-owner portfolio history
Superseded by Phase 3's `data.snapshots` (already per-profile). Remaining
future work in this area, if ever needed: honoring `snapshotRetention` from
Settings in a user-facing "history depth" indicator.

## Gold breakdown chart (DONE, 2026-07-28)
Added a "Gold value over time" card to the Investments tab, directly below
the existing "Portfolio trend" card, using `snapshot.byType.gold`. No new
chart implementation — `HistoryRangeChart` gained dot-path field support
(`field="byType.gold"`) so it could point at a nested snapshot value instead
of a top-level one (`net`/`investments`); the card itself only renders when
`goldInvs.length>0`, matching the existing "Gold $…" hero-line gating.
Verified in a sandbox copy: renders with correct empty-state copy, appears/
disappears correctly as a Gold account is added, no console errors.

## Cleanup (DONE, 2026-07-28)
Removed `app.jsx`, the stale unused duplicate flagged since Phase 1 — it was
never loaded by `index.html` and wasn't part of the build. Updated
`CLAUDE.md` to drop the now-obsolete "don't edit app.jsx" warning.

## Modal anchoring / KV writes / bank balance updater (DONE, 2026-07-30)
Build `2026.07.30.0002` / v1.5.0. Portalled the two dialogs that weren't
(`ConfirmDialog`, `AdjustReserveSheet`); split `fingerprint()` into a byte
comparison (conflicts/baseline) and `userFingerprint()` (dirty flag) so
price-driven recomputes of `history`/`snapshots` stop costing a Cloudflare KV
write per app open; added `UpdateBalanceSheet` (Add/Subtract/Set + live
preview) to Banks. All confirmed on-device. See `docs/current-status.md` and
`docs/decisions.md`.

## Mobile usability programme (scoped 2026-07-30, in progress)
Agreed order after a design grilling session. Each step ships on its own; the
app must never be left non-working, because two people use it daily.

1. **Numeric inputs — DONE**, build `2026.07.30.0003` / v1.5.1. Shared
   `NumField` across all 38 numeric fields. See `current-status.md`.
2. **Navigation — DONE**, build `2026.07.30.0004` / v1.6.0. Fixed bottom bar
   (Home · Budget · Expenses · Banks · Invest · More), portalled More sheet,
   Forecast tab retired, section title added. Also fixed `TAB_ORDER` missing
   `"home"`, `100vh`→`100dvh`, and the FAB's `z-index:70` floating it over
   every open sheet. See `current-status.md`.
3. **Budget scrolling — DONE**, build `2026.07.31.0001` / v1.7.0. One-line
   category rows (121px → 48px), Tracked/Delete moved into the chevron panel,
   17 redundant hint rows removed, sticky group headers, and Enter-to-next
   keyboard sweep. **4,484px → 2,777px (5.3 → 3.3 screens).** Also fixed
   `overflow-x:hidden` on `<body>`, which had been disabling `position:sticky`
   app-wide. See `current-status.md` and `decisions.md`.
4. **Home rebuilt around six questions — DONE**, build `2026.07.31.0002` /
   v1.8.0. A shared `Verdict` line per card turns figures into answers
   (spending judged on *pace*, goals on *movement*, savings against a new
   `data.settings.savingsTargetPct`). The two history-dependent cards are
   built and ship dark until 3 completed periods exist (~Oct 2026), covered
   by `trendtest.cjs` in the meantime. **Re-check their maths against real
   data the first period they appear.** See `current-status.md`.
5. **Net Worth — DONE**, build `2026.07.31.0004` / v1.9.0. The duplicate
   monthly net-worth line was replaced with a new "What's driving it" card —
   a stacked composition-over-time chart (`CompositionRangeChart`) built from
   the `banks`/`investments`/`assets`/`liabilities` already on every snapshot.
   The snapshot-log card kept its management UI and became a log. Also fixed
   the non-existent `fade-up-1b` class on the trend card. See
   `current-status.md` and `decisions.md`.

6. **Investments tab — DONE**, build `2026.07.31.0005` / v1.10.0. Added after
   the original five steps, applying the same two patterns: the duplicate
   `Portfolio over time` chart became "What's driving it" (composition by
   account type, absorbing the standalone Gold chart), and stock rows plus
   MP2/TD/Gold cards collapse to a scannable summary. **3,514px → 2,572px
   (4.2 → 3.0 screens)**; rows 175px → 57px; account cards ~300px → 70px. Also
   fixed the last two raw numeric inputs in the app (they escaped the sweep by
   using `type={type}`) and the last non-responsive grid. See
   `current-status.md` and `decisions.md`.

**The mobile-usability programme is complete.** Remaining follow-ups live in
"Suggested next steps" below, plus these carried forward:
- **Re-check the two Home trend cards (~Oct 2026)**, the first period they
  have 3 completed buckets. Their maths is unit-tested (`trendtest.cjs`) and
  was seen rendering against synthetic data, but has never met real history.
- `history` (monthly rows) now feeds only the Net Worth hero delta and the
  snapshot-log chips. If that shrinks further, consider whether it still earns
  its place in the data model.

Explicitly dropped: "make the app more graphical." Every time it was probed
the user named a *question* they wanted answered, never a visual they wanted
added, and they rejected a proposed Banks balance-over-time chart as something
they'd only scroll past. Charts are justified per-question from here on.

## Suggested next steps (from the 2026-07-30 session)
Small, independent, each worth doing on its own:
- **`household.expenses` is missing from `CONFLICT_COLLECTIONS`.** It's
  id-keyed and soft-deleted like every other collection, but it was never
  added — so it's absent from the conflict modal's itemised diff and from
  Recently Deleted, despite being restorable in principle. It now counts
  toward the pending badge (via `countPendingChanges`), which makes the
  omission more visible, not less. Adding it should be a one-line change plus
  a `nameOf`.
- **Per-account bank adjustment log**, if an audit trail is wanted. The
  `UpdateBalanceSheet` UI is already a strict subset of it — mirror the
  `billAdjustments` pattern (new id-keyed collection + `migrate()` default +
  `mergeArrayById` + `CONFLICT_COLLECTIONS` entry). Deliberately not built
  this session; see `docs/decisions.md` for why.
- **Confirm dialogs on the remaining delete buttons.** Still outstanding from
  the 2026-07-28 phase: Banks/Investments/Goals/MP2/snapshots/transactions got
  the touch-target fix but no confirm step. `ConfirmDialog` is now correctly
  portalled, so wiring more call sites to it is safe.

## Bank interest accrual (DONE, 2026-07-31)
Build `2026.07.31.0008` / v1.12.0. Shipped as scoped below, no substantive
changes to the design. `bankValuation()`/`bankValue()`/`settledBankPatch()` at
module scope, `interest`+`balanceAsOf` on each bank with `migrate()` defaults,
interest editor behind the account's settings gear, and `UpdateBalanceSheet` as
the reconcile point. Covered by `banktest.cjs` (25 assertions, committed) and
verified in the 390×844 sandbox. See `current-status.md` / `decisions.md`.

Follow-ups left open, none blocking:
- **Per-account interest is not shown as an earnings history.** Only accrual
  since the last confirmation is reported, deliberately (see `decisions.md`).
  If a real "interest earned" ledger is ever wanted, it needs a per-account log
  written at each reconcile — which is the same shape as the per-account bank
  adjustment log already suggested below, and should be built as one thing.
- **`crediting:"monthly"` is implemented and unit-tested but has never run
  against a real monthly-crediting account** — no such account exists in the
  user's data yet.

### Original scope (kept for reference)
Agreed in a design grilling session. Build on its own, before the pay-period
feature — self-contained, touches nothing the other feature needs.

**Problem:** bank balances go stale between manual updates. Maribank PH credits
interest daily, so the figure in the app drifts downward from reality a little
every day. Wanting to know how much interest is being earned is secondary but
real.

**Data model.** Each bank gains an optional `interest` block (default `null`;
banks without it behave exactly as today):
- `tiers` — `[{from:0,rate:3.25},{from:1000000,rate:3.75}]`. **Whole-balance,
  not marginal**: the balance selects one tier and that rate applies to all of
  it. (Confirmed as Maribank's behaviour by the user.)
- `taxPct` — withholding tax, default 20 (PH), 0 elsewhere.
- `crediting` — `"daily"` or `"monthly"`, so other banks can be configured.

Every bank also gains `balanceAsOf` (ISO date, the day the balance was last
confirmed). Per the project rule, `migrate()` must backfill it — from
`updatedAt` — not just `defaultData()`.

**Maths — derived, never incremented.** `balance` keeps its current meaning:
the last number the user typed. It is never auto-written. The value shown
everywhere is recomputed on read:

    netAnnual = tierRate × (1 − taxPct/100)
    value     = balance × (1 + netAnnual/365) ^ (days since balanceAsOf)

Monthly crediting compounds over completed months instead. This was chosen
over "add today's interest to the balance" deliberately: incrementing
double-counts across two synced devices, loses days the app isn't opened, and
makes undo unsound. Recomputing from an anchor is idempotent — both phones
show the same figure after any gap.

All of it goes through **one** function, `bankValue(bank, asOf)`, mirroring the
existing `investmentValueSar()` single-dispatch convention. Extend that
function rather than writing a second reduce anywhere.

Because the value is derived, it never dirties the sync document — no daily
Cloudflare KV write.

**UI.**
- Banks tab shows the accrued value with a sub-line: `≈ ₱1,247 accrued since
  12 Jul · est.`
- `UpdateBalanceSheet`'s **Set** action is the reconcile: typing the real
  figure resets `balanceAsOf` to today and zeroes accrual. Add/Subtract stamp
  the date too.
- Interest setup sits in the account's edit UI, out of the way of accounts
  that don't use it.
- **No net-worth toggle.** Unlike the MP2 estimate (which can swing net worth
  by tens of thousands), a few days of bank interest is pocket change; accrued
  interest always counts and is always labelled an estimate.

**Deliberately not built: lifetime interest earned.** After a reconcile the app
cannot separate interest from deposits/withdrawals, so it only ever reports
accrual *since the last confirmation*, and says so. The alternative — assuming
the estimate was right and calling the remainder a deposit — would be the app
inventing a number.

## Pay-period "Salary arrived" control (DONE, 2026-07-31)
Build `2026.07.31.0009` / v1.13.0. Shipped as scoped below. The `period*` layer
now takes the owner's config instead of a bare payday and consults
`actualStarts`; `PayPeriodCard` sits above the Home hero and guards itself;
`SalaryArrivedSheet` previews the consequence. Covered by `periodtest.cjs`
(24 assertions, committed) and verified in the 390×844 sandbox, including a
full re-check of the pay-periods-*off* calendar-month path.

**The risky part turned out not to be risky.** The scope note below warns it
"touches every call site" — it touched **one** (`BudgetView`'s envelope
depletion date). The `bucket*` wrappers already received `(payPeriods, owner)`
and were simply forwarding `cfg.payday`, so passing `cfg` instead reached every
view. See `decisions.md`.

Follow-ups left open, none blocking:
- **`payPeriods` merges whole-object, newest-wins**, so a two-device conflict
  can drop a correction rather than merge it. Same class as the `monthlyPlans`
  follow-up; would present as "my correction didn't take".
- **A `pending` flag left set indefinitely keeps the old period growing.** The
  card keeps prompting and Undo is always available, but nothing forces
  resolution.
- **The two Home trend cards now read corrected period lengths** — worth
  re-checking alongside them when they light up (~Oct 2026), since a corrected
  period is exactly the kind of history they'll be comparing.

### Original scope (kept for reference)
Agreed in the same session. Build **after** bank interest, on its own build,
because it edits the shared date core and should be isolated if something's off.

**Problem:** salary sometimes lands earlier (or later) than the configured
payday. The user is then already spending next period's money while the app
still counts it against the old period's budget.

**Data model.** `data.payPeriods[owner].actualStarts` — a map of
`nominalPeriodKey → real start date`.

The critical subtlety: **the period key stays derived from `payday`.** A period
keeps its identity forever even when it really began four days early; only its
*boundaries* move. Keying by the real start would change a period's identity
when corrected and orphan every expense pointing at it.

So payday becomes the *default*, and `actualStarts` records reality when it
differed. This was chosen over a simple one-shot "shift" flag because a flag
can't be read backwards — past periods would recompute from `payday = 28` and
silently re-render a 24-day August as a normal month forever.

**Behaviour (option B — auto-advance stays).** Periods roll over on payday
exactly as today, so a forgotten button can never strand the user in a stale
period. The control only makes corrections:
- **Arrived early** — pick the date (defaults to today; cannot be before the
  current period's start, cannot be in the future). The boundary moves back and
  expenses already logged in that window move with it. This is intended: the
  user already pre-plans expenses into the next month's budget by hand.
- **Hasn't arrived** — after payday passes, hold the old period open.
- **Undo** — clear the override; boundaries snap back to the payday.

The user initially asked for "never auto-advance, button only" and was talked
into B: it does everything A does, and the failure mode when life gets busy is
"nothing happened" rather than "the budget is lying."

**Consequences, on purpose.**
- **Budgets do not scale with period length.** A 24-day period keeps its full
  monthly category amounts, so the daily allowance rises and Home stops reading
  an early payday as overspending. This is the entire point of the feature —
  do not pro-rate.
- **History stays true.** Pace, trend buckets and the Home verdict cards all
  read period length from the same place, so a short August still renders as a
  short August months later.
- **Home placement**, so it isn't forgotten. Control appears on **Me** and
  **Wife** only; Household is a combined view with no period of its own and
  just shows a quiet note when the two are in different periods.

**The risky part.** `periodStartFor`, `periodRange`, `periodKeyFor`,
`periodLength`, `shiftPeriod` and `bucketProgress` currently take a bare
`payday` number and must instead take the owner's config so they can consult
`actualStarts`. Mechanical, but it touches every call site. Parse-check and
`node trendtest.cjs` before shipping.

## Move categories between groups (DONE, 2026-07-31)
Build `2026.07.31.0010` / v1.14.0. **Corrects the "move sub-items" feature
below, which was built at the wrong level.** Groups are the fixed frame; the
category rows under them are what gets reorganised. `moveSelectedTo` now takes
a destination *group* and re-parents the ticked categories — a pure `groupId`
change, so all the sub-item money-handling machinery was deleted rather than
ported. `budgettest.cjs`'s move section rewritten (19/19). See
`current-status.md` / `decisions.md`.

## Bills / budget copy / move sub-items (DONE, 2026-07-31)
_(the "move sub-items" part of this was superseded — see above)_
Build `2026.07.31.0006` / v1.11.0. Bills generation became a reconciler (it was
create-only, so untracking a Household item never removed its row or its
contribution to the reserve); `clonePlanForMonth` stopped dangling orphaned
categories and both copy pickers now list *months* resolved through
`planForMonth` instead of raw plan records; new plan-wide multi-select "move
sub-items to another category" in Budget. Committed `parsecheck.cjs`,
`billstest.cjs`, `budgettest.cjs`. See `current-status.md` / `decisions.md`.

## Follow-ups left open by that work
Small, independent, none blocking:

1. **Orphaned plan records accumulate.** `removePlanForMonth` tombstones only
   the month→plan mapping, so every "Remove" leaves a full plan in `data.plans`
   forever. The month-based picker means users no longer *see* them, so this is
   now invisible bloat rather than a correctness bug — but it still syncs to KV
   on every write. **Measured 2026-07-31: 16 of 24 live plans are unreferenced,
   29% of the document** (six of them named "September 2026"). Offered and
   **declined** — cosmetic at this size. If it's ever done: **tombstone, don't
   hard-delete.** `mergeArrayById` reads a locally-missing record as "the other
   side hasn't seen it yet", so any un-synced device re-uploads them. Note
   tombstoning therefore does *not* shrink the blob; an actual purge needs
   every device caught up first.
2. **"Add sub-item" can silently drop a category's manual amount.** Adding the
   first sub to a category with a manual amount replaces that amount with
   whatever you type (a category's `amount` is manual only while it has no
   subs). Left alone because users may rely on it as a way to re-plan a
   category. If it's ever reported as a bug, the fix is to seed the existing
   amount as a sub named after the category first. **Note:** the sub-item move
   feature that originally carried this seeding logic was removed in v1.14.0
   (it was built at the wrong level — see below), so the fix would now have to
   be written fresh rather than copied.
3. **`monthlyPlans` merges without a per-record timestamp.** `mergeKeyed` on
   `month|owner` falls back to whichever whole document is newer, so a
   two-device conflict can drop a freshly-copied month's mapping wholesale and
   silently revert it to carry-forward. Not observed in practice; would present
   as "my copy didn't take."
4. ~~**A pre-existing plan can still contain an orphaned category.**~~ **DONE
   2026-07-31**, build `2026.07.31.0007` / v1.11.1. Live data audited read-only:
   **zero orphans across all 24 plans**, so no repair was needed. A guard was
   added to `migrate()` regardless (older builds on other devices can still
   sync a bad clone up); verified byte-identical no-op against the live blob
   and idempotent across loads.

## Explicitly not recommended without a separate design conversation
- Extending banks/goals to support a literal `"household"` owner (currently
  Household is a Home-only aggregate for those — see decisions.md). Doing this
  silently would change what Home's existing Household toggle means for those
  cards.
