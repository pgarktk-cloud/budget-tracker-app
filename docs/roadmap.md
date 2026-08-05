# Implementation Roadmap

## Agreed programme (planned 2026-08-05) — six independent builds

Planned in a grilling session. Each ships, is verified and is rollback-able on
its own; none are combined.

1. **Sync wording correction — DONE**, build `2026.08.05.0001` / v1.19.1.
2. **Backup import hardening — DONE**, build `2026.08.05.0002` / v1.20.0.
   `validateBackup` + preview sheet + size gate + aborting pre-import backup +
   the upload held until an explicit Save to Cloud. `importtest.cjs` (34/34).
3. **Safer two-device sync** — split in two:
   - **3B Worker → Durable Object — DONE**, deployed 2026-08-05, Worker version
     `a3cb3ce0`. Seeded from KV, mirrors back to it for rollback, wire format
     unchanged. See `current-status.md`.
   - **3C-1 Merge fixes with no data-model change — DONE**, build
     `2026.08.05.0004` / v1.21.0. `monthlyPlans` per-record resolution,
     `household.expenses` merging on its own timestamp and joining
     `CONFLICT_COLLECTIONS`, device identity + conflict naming.
     `mergetest.cjs` (22/22; 8 of them fail against the pre-fix code).
   - **3C-2 Per-category plan merge — NEXT, and still the headline defect.**
     `plans` merges whole-record newest-wins, so two people editing different
     categories in the same budget month still silently lose one side.
     Blocked on category/group **tombstones**: `removeCat` hard-deletes, so a
     union would resurrect a deleted category. Planned shape — `deletedAt` +
     `updatedAt` on categories/groups, stamped centrally in `editPlanForMonth`
     (the existing choke point), filtered by a new `livePlanView()` at
     `resolvePlanForMonth` **returning the identical object when nothing is
     tombstoned**, then `mergeArrayByIdWithChildren` for plans. **No Cloudflare
     work.**
   - **3C-3 `payPeriods.actualStarts` — deferred with 3C-2**, same reason:
     clearing an override *deletes the key* by design, so a union merge would
     resurrect a cleared correction. Needs the same "how is a deletion
     represented" answer.
4. **Faster transaction entry** — autofocus + Repeat, richer suggestion chips,
   rapid entry with undo-on-save, then a synced `txTemplates` collection.
5a. **Category → goal link** — an optional `category.goalId`; a transfer against
   a linked category credits the goal in one action, and the Goals tab's "Add
   money" becomes a real transfer instead of a goal-only edit.
5b. **Salary reconciliation** — planned figures beside the actuals in
   `UnaccountedSheet` (supersedes the "Next up" section below).

### Follow-ups opened by build 3B
- **Remove the KV mirror**, once there is no intention of rolling back. Until
  then the Worker writes every accepted save to KV as well as the Durable Object.
  Cheap, but it is duplicated state and should not become permanent by accident.
- **The DO handler has no automated test.** It needs `wrangler dev` plus a test
  harness this repo doesn't have. Covered by cutover verification only — do not
  let that be mistaken for coverage.
- **`SYNC_KV` namespace is unexplained.** Holds two `user:data:<uuid>` keys from
  an older version of the app. Not bound, not read. Worth looking at once, then
  deleting or documenting.
- **The Worker is no longer dashboard-managed.** Editing it in the dashboard
  editor would be overwritten by the next `npx wrangler deploy`. Deploy from the
  repo.

### Follow-ups opened by build 2
- ~~**The import hold has no second slot.**~~ **DONE 2026-08-05**, build
  `2026.08.05.0003` / v1.20.1 — two rotating labelled slots with quota
  degradation. `backupslottest.cjs` (14/14).
- **Nothing re-validates a document arriving from the cloud.** `validateBackup`
  guards the file picker, but a pull still trusts `Array.isArray(remote.plans)`,
  the same one-line check import used to have. Worth folding into build 3, where
  the sync protocol is open anyway.

### Follow-up opened by build 1
- **The conflict modal has three buttons and two outcomes.**
  `resolveKeepLocal` (`index.html:4311-4323`) and `resolveSaveLocalToCloud`
  (`4347-4357`) both adopt the remote rev and push local — identical results, one
  awaited and one fire-and-forget. Build 1 was copy-only so it only *admits* this
  in the button text. Consolidate to two buttons in build 3, which reworks that
  modal for device naming anyway.

## Next up — reconcile plan vs actual in the Expenses unaccounted sheet (scoped 2026-08-01, NOT built)

Surfaced by the user trying to check the unaccounted figure by hand after
v1.17.0 shipped, and worth building because the reconciliation is currently
impossible without a calculator.

**The gap.** The unaccounted sheet is entirely *actuals* — every subtraction is
a logged transaction. The Budget tab is entirely *plan*. Nothing anywhere shows
the allocation split **tracked vs untracked**, so to answer "did I transfer what
I meant to transfer?" the user has to hand-sum ~19 category rows. They did, got
a 203 discrepancy, and there was no way to place it from the UI.

Compounding it: an Expenses envelope card shows **base allocation + extra
funds**, not the base — so hand-summing the Expenses tab and comparing against
plan income silently double-counts extra funds. That's correct behaviour and
correctly reflected in the hero total, but it's an easy trap when reconciling.

**Proposed shape** — a planned figure beside each actual in `UnaccountedSheet`:

    Income for this period          + SAR 22,000.00
    Tracked spending                −  ...  (of 5,304 allocated)
    Transfers out                   − SAR 16,696.00  (of 16,493 allocated)  ⚠ 203 over
    Goal contributions              −  ...
    Still unaccounted for              SAR ...

**Implementation notes.**

- The plan side is derivable from what the view already holds: `envelopes` is
  the tracked allocation, `untrackedEnvelopes` the untracked one. Neither is
  currently summed for this purpose. **Use base `e.budget`, NOT
  `budget + extraFundsMap[id]`** — extra funds are already their own `+` line
  in the sheet, so folding them into "allocated" double-counts them.
- Keep the existing four lines as the arithmetic of record. The planned figures
  are annotation only; the sheet must still sum to the headline, and
  `UnaccountedSheet`'s lines must keep reconciling exactly.
- A third bucket exists that belongs to neither envelope list: "Transfers out"
  counts every `isTransfer` row that isn't a *live* goal contribution, so it
  also picks up a transfer whose category was deleted from the plan, one
  against a category later switched to tracked, and a goal contribution whose
  goal was deleted (it loses its goal id and falls through to transfers). Those
  appear in the total but in no card. A "⚠ N over" annotation should therefore
  say *what* the excess is, or at minimum not imply it's necessarily an
  over-transfer.

**Deliberately not doing:** making the unaccounted card read from the budget.
It answers "is all my pay accounted for", which is an actuals question; the
plan figures are context beside it, not inputs to it.


---

## Investment Module

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

## Security — residual items after the 2026-08-01 secrets work

The public-repo credential leak is fixed (see `docs/decisions.md`). What's left,
roughly in order of how much it actually matters:

1. **Assume the pre-2026-08-01 dataset may already be public.** `SYNC_TOKEN` was
   readable in the served `index.html` for months. Rotation protects everything
   from here on but cannot un-copy what may already have been taken. No evidence
   of access; there is also no logging that *could* show it. Nothing to build —
   just don't treat the old data as having been private.
2. **Cloudflare account 2FA is now the most valuable key in the chain.** KV
   stores the dataset as plain JSON, so account access = full read. Confirm it's
   on.
3. **No rate limiting on the Worker.** Nothing stops an attacker grinding
   passphrase guesses. Currently mitigated only by the passphrase being five
   random words (~64 bits — infeasible). If it's ever shortened for convenience,
   add Cloudflare Rate Limiting on `/sync*` first, not after.
4. **One shared passphrase, not per-person accounts.** Fine for two people who
   already share the dataset; it does mean no revoking one device without
   rotating for everyone. Rotation is cheap (change the Worker secret, re-enter
   on each device), so this is a deliberate trade, not an oversight.
5. **No Content-Security-Policy.** GitHub Pages can't set headers, and a `<meta>`
   CSP would need `unsafe-eval` for Babel's in-browser JSX compilation, making it
   weak. Only worth revisiting if the app ever gains a build step — at which
   point dropping Babel and adding a real CSP become the same piece of work.

## Installments (DONE, 2026-08-02)

Shipped in v1.19.0 / `2026.08.02.0001`. Tabby / Tamara / Amazon / card
pay-in-N plans, a derived Budget group, and linked ledger transfers. See
`current-status.md` for what's in it and `decisions.md` for why.

### Deliberately left out of this release
Each of these is a separate piece of work, not an oversight:
- Partial-pay allocation across several future payments (today an odd payment is
  stored as-is and the schedule is edited by hand if the provider changed it).
- Weekly / bi-weekly schedules; long-term loan amortisation; interest, penalties
  and late fees.
- Multi-currency. The record carries `currency`, but expense rows have no
  per-row currency, so this needs an FX-rate-at-payment-time rule and a stored
  rate first. Do that before offering the picker, not after.
- Automatic bank-statement import, provider APIs, remote provider logos,
  notifications.
- A Home dashboard card and any new charts.
- `"household"`-owned plans — see the bottom of this file.

### Follow-ups worth considering later
- **Re-link.** Unlinking a transaction from its installment is one-way; there is
  no flow to attach an existing transaction to a payment. Fine for the escape
  hatch it is, but a mis-tap is only undone by deleting and re-recording.
- **`installmentPayments` merges without a per-record conflict UI.** It's in
  `CONFLICT_COLLECTIONS` so it merges and counts as pending, but it's hidden
  from Recently Deleted by `HIDE_FROM_RECENTLY_DELETED`. If two devices ever
  edit the same schedule concurrently, the conflict modal will describe it in
  raw `#seq / dueDate / amount` terms.
- **Category filter.** An installment transaction's `catId` is the installment
  id, so it never matches the Expenses category filter. If installments become
  common, that filter may want an "Installments" option.
- **UnaccountedSheet.** When the plan-vs-actual annotation is built, the planned
  side of "Transfers out" must include `derivedInstallmentRowsFor(...)` for the
  viewed bucket. It must keep reading the ledger for the actual side — see
  decisions.md for why reading payment status too would double count.

## Explicitly not recommended without a separate design conversation
- Extending banks/goals to support a literal `"household"` owner (currently
  Household is a Home-only aggregate for those — see decisions.md). Doing this
  silently would change what Home's existing Household toggle means for those
  cards.
- Household-owned **installments**, for the same reason plus a sharper one: a
  plan, its derived Budget row and its ledger transfer must all carry the same
  owner, and a combined list would have no editable meaning.
