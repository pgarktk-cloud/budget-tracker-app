# Current Status

_Last updated: 2026-08-01 (secrets out of the public repo; CDN scripts pinned)_

## CDN scripts pinned with SRI (2026-08-01)

Build `2026.08.01.0003` / v1.18.1. Follow-on to the secrets work below, closing
the one path that bypassed it: anything running on this origin can read the sync
passphrase out of `localStorage`, and five scripts on the page come from
jsDelivr. All five now carry `integrity="sha384-…"`, so the browser refuses to
execute a file whose bytes don't match.

**Recharts changed URL.** The package ships `umd/Recharts.js` (already minified)
and does *not* ship `umd/Recharts.min.js` — jsDelivr was synthesising that file
with a generated banner. Its own docs: "Do NOT use SRI with dynamically
generated files." `sw.js`'s `APP_SHELL` was updated to the same URL, or the
service worker caches something the page never requests. The two files differ by
273 bytes (the banner), so there's no size cost.

Hashes were cross-checked byte-for-byte against unpkg, so no single CDN dictates
what we pin.

**Maintenance cost, documented in `CLAUDE.md`:** bumping a library version
without regenerating its hash blanks the app — the error is in the console, not
on screen.

**Verified** in-browser on a local static server: app mounts, Recharts sparklines
draw, zero console errors (an integrity mismatch blanks the page loudly, so a
clean render is the proof). Settings correctly showed the not-connected
passphrase form. `parsecheck.cjs` OK; all eight runners pass.

## Secrets removed from the public repo (2026-08-01)

Build `2026.08.01.0002` / v1.18.0. `index.html` carried `SYNC_TOKEN` and
`FINNHUB_KEY` as plain literals while being served publicly from GitHub Pages
out of a public repo — anyone who viewed source could read and overwrite the
entire dataset. `/quote` and `/name` on the Worker were unauthenticated on top
of that, making it a free Yahoo Finance proxy on this Cloudflare account.

**Now:** every secret is a Cloudflare Worker env secret (`env.SYNC_TOKEN`,
`env.FINNHUB_KEY`); the client ships none. The sync passphrase is typed once per
device in Settings → Cloudflare KV Sync and held in `localStorage` under
`SYNC_TOKEN_KEY` — never in `data`, so it is not uploaded, not fingerprinted,
and not in backup files. `getSyncToken()`/`setSyncToken()` are the only
accessors.

- **Every** Worker endpoint authenticates now, `/quote` and `/name` included.
  Consequence accepted: no passphrase → no live prices, not just no sync.
  `fetchQuotes`/`fetchName` gate on `KVSync._ready()`, not a `PASTE_` check.
- The Yahoo→Finnhub fallback chain moved verbatim into `worker.js`, so the
  client's URLs are unchanged and the Finnhub key never reaches a browser.
- CORS limited to `ALLOWED_ORIGINS` + localhost, with `Vary: Origin`. Defense in
  depth only — curl ignores CORS, so the token stays the real gate.
- `authOk` compares in constant time after a length check.
- Connect validates against `GET /sync/meta` before persisting, so a typo can't
  leave a device holding a credential that only fails later, silently, in a
  background save. `KVSync.lastStatus===401` gets its own Settings row —
  "passphrase rejected" and "sync failed" need different words because they need
  different fixes.
- `kvReady` is state (`syncTokenSet`), not a constant, so connecting works
  without a reload; a just-connected device fires one `pullFromCloud()`, which
  auto-merges and stashes a pre-cloud backup.
- Settings gained "Forget passphrase on this device" (confirmed; local data
  untouched).

Old values were **rotated, not scrubbed from git history** — see
`docs/decisions.md` for why. Testing is now safe by default: a fresh browser
profile starts unconnected, so the old "replace SYNC_TOKEN with a PASTE_ dummy"
sandbox recipe is obsolete.

**Verified:** `parsecheck.cjs` OK; all eight committed runners pass (156
assertions). Browser verification is pending the Worker redeploy — it cannot be
done before the new secrets exist.

## Profile separation across the asset tabs, plus four UX fixes (2026-08-01)

Build `2026.08.01.0001` / v1.17.0. Five requests, three of which turned out to
be masking real defects rather than being cosmetic.

### 1. Remembered transaction names now filter as you type

The chip row in the add-transaction modal was gated on `!form.name`, so it
vanished on the first keystroke and left you with a native `<datalist>` —
unreliable on mobile, which is where this is used. There is now **one**
mechanism: module-scope `rankNameSuggestions(names,query,limit=6)` does a
case-insensitive substring match with prefix hits ranked above mid-string ones
and recency breaking ties, and the chips re-render on every keystroke. Typing
`amazon` offers Amazon, Amazon Now, Amazon Prime, then Buy Amazon gift card.

Tapping a chip fills the **name only** — deliberately, even though
`recentNames` also captures the category. `onMouseDown` preventDefault on each
chip, or the input's blur eats the tap before the click lands, and the list
renders in flow because the modal scrolls. Covered by `suggesttest.cjs`.

### 2. "Salary not yet spent" was subtracting money that came IN

The old standalone card computed `plan income − every logged row`, and
`isExtraFunds` rows are ordinary expenses with a flag — so cash a spouse sent
for groceries **lowered** your unspent salary. That is why the figure never
made sense. It is now:

    income + extra funds received − tracked spend − transfers out − goal contributions

The card is gone. The figure is a tappable pill in the Expenses hero header
that opens `UnaccountedSheet` (portalled), itemising those five lines.

Two traps handled: the classification runs off the raw `viewMonthExpenses`,
**not** off `totalSpent`, because `envelopes` drops zero-budget categories and
the sheet would not have reconciled with its own headline; and goal
contributions and untracked transfers both set `isTransfer`, so `catId` is the
only thing that separates them.

### 3. Banks / Investments / Net Worth are per-profile

One **global** view profile (`VIEW_PROFILE_KEY` in localStorage, never in
`data` — it is a per-device preference, and syncing it would push your current
view to the other device) shared by Home, Banks, Investments and Net Worth,
rendered through the existing `HomeProfileToggle`. Budget and Expenses keep
their 2-way `OwnerToggle` and drive the same value; when the global profile is
`household` they show whoever was picked last, since a plan belongs to a person.

- **Assets and liabilities gained a real `owner`.** They had none, and
  `ownerNetWorthSar` added the *whole* pile to *both* people. `migrate()`
  defaults existing ones to `household`.
- **One aggregator**, `netWorthParts(p)`, returns
  `{banks,investments,assets,liabilities,net}`; `assetSar`/`liabSar`/`netWorth`
  are just its household case. `ownerNetWorthSar` is a one-liner over it, and
  the daily snapshot effect uses it for all five fields — it used to store the
  household assets/liabilities figures on every profile's row, which made
  per-person "What's driving it" wrong regardless of what the hero showed.
- **Banks** gained a Joint bucket. A bank owned anything but `me`/`wife` was
  invisible in both sections while still counting toward the grand total; it
  now has a section, a header tile and an owner `<select>` in the settings
  panel — without that last one the value was unreachable, so the fix would
  have been dead code.
- **Investments'** owner dropdown became the toggle; `passFilters` matches
  literally, so joint holdings appear only under Household.
- Trend and composition charts follow the profile instead of a hardcoded
  `"household"`. Net Worth's "since last snapshot" delta is **hidden** off
  Household, because monthly `history` is written household-only.

Covered by `ownertest.cjs`.

### 4. Budget donut removed

It was decorative — no click, no filter, only a hover tooltip — and cost a
whole card of height. Replaced with a full-width stacked proportion bar over
the same legend, which now shows amounts as well as percentages.
`PieChart`/`Pie`/`Cell` dropped from the Recharts destructure; the dependency
stays for the other five charts.

### 5. Expenses hero rebalanced

The three-figure row with `marginLeft:auto` became: month plus the unaccounted
pill, a `spent / budget … left` line, a 16px bar (was 10px), and the top four
spending categories as mini-bars. The full envelope list still follows, so the
hero is only the head of it.

### Known gaps

- Each person's Net Worth is banks + investments until assets and liabilities
  are re-assigned away from Joint in Net Worth → Assets.
- Me + Charlene will not equal Combined while anything is jointly owned. That
  is the chosen semantics, not a rounding error.
- Per-profile trend lines step on upgrade day; old snapshot rows were
  deliberately not rewritten.
- **No tracked-vs-untracked split of the budget allocation exists anywhere**,
  so the unaccounted figure can't be reconciled against the plan without
  hand-summing every category row. Scoped in `roadmap.md`, not built.
  Related trap when reconciling by hand: an Expenses envelope card shows
  **base allocation + extra funds**, so summing those against plan income
  double-counts extra funds.


## Budget move feature corrected: categories → groups (2026-07-31)

Build `2026.07.31.0010` / v1.14.0.

**The v1.11.0 feature was built at the wrong level.** It moved *sub-items
between categories*. What was actually wanted — and what this replaces it with
— is moving **categories between groups**. Groups (Invest & Grow, Essentials,
Personal, …) are the fixed frame; the category rows under them are what gets
reorganised as life changes.

The terminology mapping needed to get this right was already in this file, from
the Budget scrolling work: the user's "5 categories with 21 subcategories" is
the app's **5 groups and 21 category rows**, and they barely use `subs` (17 of
19 categories have none). See `decisions.md` for why that note didn't get
applied the first time.

### What changed

- `moveSelectedTo(destGroupId)` re-parents the selected categories: a pure
  `groupId` change plus an append. **All the sub-item machinery was deleted,
  not ported** — the seeding of a subs-less destination, the zeroing of an
  emptied source, the tracked/untracked warning. None of it applies, because a
  category carries its own amount/subs/tracking and everything that references
  it keys on the category id. Group totals are derived sums.
- Checkboxes moved from the sub rows to the **category rows** (replacing the
  colour dot, same pattern as before). Select mode no longer force-opens
  categories — collapsed rows are what make a plan-wide selection scannable.
- The button reads **"Select categories to move"** and appears when the plan has
  at least two groups and one category.
- The destination sheet lists **groups**, each with `before → after` total, the
  resulting category count, and a per-group note when the move crosses the
  Invest & Grow boundary (`investTarget` keys on group *names* — the one real
  coupling).
- Sub-item rows are back to normal: no checkboxes, Add sub-item / Delete intact.

### Verified

`budgettest.cjs` move section rewritten for the new semantics (**19/19** total,
8 of them on the move): re-parenting with money, amount/subs/tracking untouched,
plan-total conservation, spanning multiple source groups, append ordering,
already-in-destination is a no-op, identity return when nothing moves, and an
emptied group surviving as a record.

*The old slice marker failed loudly rather than silently* — the CLAUDE.md rule
about asserting markers were found did its job.

In the 390×844 sandbox, against the real 5-group / 14-category demo plan:

- 14 checkboxes, one per category, labelled by category name; **0** on sub rows.
- Selected "Misc. Savings" (Savings) + "Subscriptions" (Essentials) →
  bar read `2 selected · SAR 559.00`.
- Sheet listed all five groups with correct arithmetic — Invest & Grow
  `6,050 → 6,609 · 4 categories · counts toward Invest & Grow`, Savings
  `5,146 → 5,355 · 2 categories`, Essentials `4,499 → 4,849 · 3 categories`,
  and so on. Every before→after and count hand-checked.
- Committed into Invest & Grow → stored plan matched the preview exactly
  (6,609 / 4,796 / 4,290), the two categories appended at the **end** of the
  destination group, **plan total conserved at 22,000**, select mode exited,
  sheet closed.
- The Invest & Grow badge moved to **30.04% of income** — exactly the
  consequence the sheet warned about.
- Category rows a uniform 48px in select mode, no horizontal overflow.

_Last updated: 2026-07-31 (pay-period "Salary arrived" control)_

## Pay-period corrections — "Salary arrived" (2026-07-31)

Build `2026.07.31.0009` / v1.13.0. Built to the design scoped in the
2026-07-31 session (`roadmap.md`), unchanged in substance.

**Problem**: salary sometimes lands earlier (or later) than the configured
payday. The money is already being spent while the app still counts it against
the old period's budget.

### Identity vs boundaries

`data.payPeriods[owner].actualStarts` maps a **nominal** period key to the day
that period really began:

    actualStarts: {"2026-08-28":"2026-08-24"}   // arrived four days early
    actualStarts: {"2026-08-28":"pending"}      // hasn't arrived yet

**A period's key stays derived from `payday` forever — only its boundaries
move.** Keying by the real start would change a period's identity the moment it
was corrected and orphan every expense pointing at it. `shiftPeriod` is
therefore pure payday arithmetic and deliberately ignores overrides: the period
after `2026-08-28` is `2026-09-28` however early it began.

A period runs from its own real start to the day before the *next* period's
real start, so moving one boundary resizes both neighbours and they stay
contiguous — no gap, no overlap.

### Far smaller blast radius than expected

The roadmap warned this "touches every call site". It didn't: the `bucket*`
wrappers already took `(payPeriods, owner)` and already had the config in hand
— they were just passing `cfg.payday` down. So the change is that the `period*`
layer now takes the owner's **config** instead of a bare payday, the six
wrappers pass `cfg`, and **exactly one** call site outside the helper block
needed touching (`BudgetView`'s envelope depletion-date). Everything reads
through `periodRange()`, so a corrected boundary reaches labels, lengths,
progress and bucketing at once.

`periodKeyFor` gained a three-candidate scan (previous / nominal / next) to find
which period actually contains a date — behind a fast path that returns the
nominal answer immediately when `actualStarts` is empty. An owner who never
corrects a period pays exactly what they always did.

### Behaviour

Auto-advance **stays**: periods still roll over on payday, so a forgotten
button can never strand anyone in a stale period. The control only corrects.

- **Salary arrived early** — pick the day (defaults today, can't be in the
  future, can't reach back past the previous period's start). Expenses already
  logged in that window move with the boundary, which is intended.
- **Hasn't arrived yet** — flags the current period `pending`, which drops back
  into the previous one and holds it open (its end tracks today until resolved).
- **Undo** — clears the override. The key is *removed*, not written back as the
  nominal date, so "untouched" and "corrected back to payday" can't drift apart
  and the fast path keeps working.

**Budgets are not pro-rated.** A 24-day period keeps its full monthly category
amounts, so the daily allowance rises and Home stops reading an early payday as
overspending. That is the entire point; nothing in this layer touches amounts.

### UI

`PayPeriodCard` sits on Home at `order:0` — **above** the hero, because it asks
for an action, the same rule that keeps "Matured — confirm it" on a collapsed
Time Deposit row. Per the Home doctrine it returns `null` unless there's
something to correct: within `PP_WINDOW_DAYS` (5) of a boundary, or while a
correction is in force. Verified that the wrapper cell collapses via
`.home-cell:empty` when it does.

Household has no period of its own and, with two different paydays, the owners
are *always* in different periods — so saying that permanently would be noise.
It surfaces only when a correction is in force, and says that instead.

`SalaryArrivedSheet` shows the consequence before committing: the new
boundaries, the new length, and **how many already-logged expenses would move
into the period** — because moving a boundary silently re-buckets real
transactions.

### Verified

`periodtest.cjs` (**24 assertions**, new, committed): no-override behaviour
identical to before (including February clamping and a bare-payday caller),
identity preserved across corrections, early and late starts, contiguity at a
moved boundary, labels reporting real boundaries, pending holding the previous
period open, resolving a pending period freezing history truthfully,
`withActualStart` set/clear/non-mutation, all four validation bounds, and the
malformed-key fallback that once produced the "Invalid Date" budget header.

In the 390×844 sandbox, payday 28, today Jul 31:

- Card renders above the hero: "This period started Jul 28 · Jul 28 – Aug 27,
  2026 · 31 days · [Hasn't arrived yet]".
- **Hasn't arrived** → stored `{"2026-07-28":"pending"}`, card became "Waiting
  for your salary — this period is still open, 34 days so far", period fell
  back to Jun 28 – Jul 31.
- **Sheet preview** at Jul 29: "This period runs Jul 29 – Aug 27 (30 days). 1
  logged expense moves into it." (correct singular); at today: "28 days. No
  logged expenses change period."
- **Validation**: Jun 20 → "Can't start before Jun 29 — that's the previous
  period." with Save disabled; Jun 29 (the floor) accepted.
- **Committed** Jul 29 → Expenses tab read "Jul 29 – Aug 27, 2026", unspent
  SAR 21,800 (= 22,000 − the Jul 29 expense); previous period read
  "Jun 28 – Jul 28, 2026", unspent 21,850 (= 22,000 − the Jul 26 expense). The
  two test expenses split exactly across the moved boundary.
- **Undo** removed the key entirely and restored Jul 28 – Aug 27.
- **Arrived early** (payday 3, 3 days out) → "Payday is in 3 days" →
  committed today → "This period started Jul 31, 3 days early · Jul 31 – Sep 2
  · 34 days", stored under the unchanged key `2026-08-03`.
- **Nothing to say** (payday 15, 16 days in) → card absent, cell empty and
  `display:none`.
- **Household** with one and with both overrides → correct singular/plural
  wording plus both owners' real ranges.
- Full sweep: all 10 destinations mount, no `Invalid Date`/`NaN` anywhere, no
  console errors beyond the SW stub. **Pay-periods-off path re-checked**:
  Expenses/Budget still read "July 2026 · Current month" and a stale override
  is correctly ignored.

### Known limitations

- **`payPeriods` merges as a whole object, newest-wins** (it's in the
  non-id-keyed group), so a two-device conflict can drop a correction wholesale
  rather than merging it. Same class as the `monthlyPlans` follow-up already
  logged; not observed, would present as "my correction didn't take".
- **A `pending` flag left set indefinitely keeps the old period growing.** The
  card keeps prompting while it's set and Undo is always there, so the failure
  mode is visible — but nothing forces resolution.
- **`crediting`-style edge case**: a correction that would move a boundary more
  than one whole period is rejected by validation rather than supported. The
  three-candidate scan in `periodKeyFor` depends on that bound.

_Last updated: 2026-07-31 (bank interest accrual)_

## Bank interest accrual (2026-07-31)

Build `2026.07.31.0008` / v1.12.0. Built to the design scoped in the
2026-07-31 grilling session (`roadmap.md`), unchanged in substance.

**Problem**: bank balances go stale between manual updates. Maribank PH credits
interest daily, so the figure in the app drifts a little further from reality
every day nobody retypes it.

### The rule: derived, never incremented

`balance` keeps exactly the meaning it always had — the last number a person
typed, now anchored by a new `balanceAsOf` date. It is **never auto-written**.
What every total shows is recomputed on read:

    netAnnual = tierRate × (1 − taxPct/100)
    value     = balance × (1 + netAnnual/365) ^ (days since balanceAsOf)

Monthly crediting compounds over *completed* months instead. All of it goes
through one function, `bankValuation(bank, asOf)`, with `bankValue()` as the
thin number-returning wrapper the reduce call sites use — the same
single-dispatch convention as `investmentValueSar()`. Extend that, don't write
a second accrual reduce.

Two properties fall out of deriving rather than incrementing, and both are
unit-tested:

- **Idempotent.** A phone opened daily and a phone opened once a month agree.
  No day is lost, none is double-counted, and undo stays sound.
- **Constant within a calendar day**, because the exponent is a whole number of
  days. The history/snapshot effects therefore can't watch it drift
  mid-session and loop. Those rows are already stamped `auto:true`, so a day's
  accrual never dirties the document — **no daily Cloudflare KV write**
  (verified: 9s after load with a 40-day accrual live, exactly 3 snapshot rows,
  `balance`/`balanceAsOf` byte-unchanged).

### Data model

Each bank gains an optional `interest` block (`null` = behaves exactly as
before) and `balanceAsOf`:

    interest: {enabled, tiers:[{from,rate}], taxPct, crediting:"daily"|"monthly"}

**Tiers are whole-balance, not marginal**: the balance selects one tier and
that rate applies to all of it (confirmed as Maribank's behaviour). The UI says
so in as many words, because the marginal reading is the more common convention
and would quietly produce a different number.

`migrate()` backfills `balanceAsOf` from `updatedAt` per the project rule.
That backfill is deliberately inert: `updatedAt` is only a proxy for "when the
balance was confirmed" (it also moves on a rename, and is the year-2000
sentinel on old records), so **enabling interest re-stamps `balanceAsOf` to
today**. Without that, flipping the toggle on a legacy account would invent 26
years of interest. Verified on an account anchored at 2000-01-01: enabling
re-stamped to today and accrued nothing.

### Where money moves, accrual settles first

Anything that credits or debits an account calls `settledBankPatch()` — fold
the accrued estimate into the stored balance, re-anchor to today — *before*
applying the delta. Otherwise a later day's exponent gets applied to money that
only arrived today. That covers `recordMp2Payout`, `transferTdProceeds`, the
inline balance field, and all three modes of `UpdateBalanceSheet`.

`UpdateBalanceSheet` is the reconcile point: it starts from the **accrued**
value rather than the stored one, says so out loud ("Starting from the
estimated balance — 150,000 confirmed on Jul 12 plus 203.14 accrued"), and
re-anchors on save. Its usual "nothing would change" guard is relaxed while
accrual is active, since committing the estimate unchanged *is* meaningful — it
confirms the figure and restarts the clock.

### UI

- Banks card shows the accrued value with a sub-line: `≈ 203.14 accrued since
  Jul 12 · est.` Always labelled an estimate, always stating what it's an
  estimate *since*.
- Interest setup lives in the account's settings panel behind the gear, so
  accounts that don't earn interest never see it.
- **No net-worth toggle**, unlike the MP2 estimate. A few days of bank interest
  is pocket change, not a figure that can swing net worth by tens of thousands.

**Deliberately not built: lifetime interest earned.** After a reconcile the app
cannot separate interest from deposits, so it only ever reports accrual since
the last confirmation, and says so. The alternative — assuming the estimate was
right and calling the remainder a deposit — would be the app inventing a number.

### Verified

`banktest.cjs` (**25 assertions**, new, committed) slices the real helpers out
of `index.html` and runs them under `vm`: the off switches (no block, disabled,
zero/negative balance, zero rate, no tiers, no anchor), one-day and full-year
daily compounding against hand-computed figures, tax at 0 and 20, monthly
crediting counting only completed months, whole-balance tier selection
including defensive sorting and malformed rows, idempotence, constant-within-a-
day, no backwards accrual, settle-then-credit, DST-proof day counting.

*Trap worth knowing*: top-level `const` bindings do **not** attach to a vm
context — only function declarations do. `BANK_CREDITING`/
`DEFAULT_BANK_INTEREST` had to be handed over explicitly or they read as
`undefined` in the test while working fine in the app.

In the 390×844 iframe sandbox, against a ₱150,000 account 19 days stale at
3.25% less 20% tax:

- Card reads **PHP 150,203** with `≈ 203.14 accrued since Jul 12 · est.` —
  matching the hand-computed 150,203.14 exactly.
- Totals follow: turning interest off dropped Total liquid assets
  25,155 → 25,143, and the accrual is present in the daily snapshot rows.
- Real mouse/keyboard: typed `2+2.5` into a tier rate → committed **4.5**;
  typed `5000+2000` into the Update sheet → preview `150,203.14 + 7,000 =
  157,203.14`, saved as `157203.14` with `balanceAsOf` re-anchored to today and
  the accrued sub-line correctly gone.
- Add tier / Remove tier round-trip; all **10 destinations** mount; no console
  errors beyond the intentional SW stub.

**Found and fixed during verification**: at 26px serif, `PHP 150,203.14` wrapped
to two lines and collided with the Update button. The card headline now renders
whole units (`money()`), which is what every other money figure in the app
already did — the card was the outlier. Cents stay in the accrued sub-line and
in the settings panel's editable Balance field.

**Pre-existing, not introduced**: BanksView's root `margin:"0 -4px"` reports
~7px of horizontal overflow against the iframe's scrollbar-reduced client
width. Reproduced identically with interest disabled, and on Budget and
Expenses, so it's the shared negative-margin pattern plus a desktop scrollbar,
not this work.

_Last updated: 2026-07-31 (orphan guard + live-data audit)_

## Live data audited for orphaned categories — none found (2026-07-31)

Build `2026.07.31.0007` / v1.11.1. Follow-up to the clone fix below, which
noted that pre-existing orphaned categories would need a separate sweep.

**Audited the real KV blob read-only** (rev 499, `GET /sync`, no writes; a
copy was kept as a backup for the session). Result: **zero orphaned categories
across all 24 plans.** The one discrepancy the first pass flagged was
floating-point noise (−1.8e-12 on a decimal sum), not a real orphan — worth
remembering when writing this kind of check.

So no data repair was needed. A **guard was added to `migrate()` anyway**: any
category whose `groupId` doesn't resolve is moved into an `Ungrouped` group on
load. `clonePlanForMonth` can no longer create one, but the user's other
devices run older builds until they update and could still sync a bad clone up.
Verified as a **byte-identical no-op** against the live blob (0 groups
invented, plan/group/category structure unchanged), and idempotent across
repeated loads — `migrate()` runs on every load, so inventing a group per run
would have been a real bug. Covered by 4 assertions in `budgettest.cjs`.

### What the audit did find: 16 unreferenced plans

`removePlanForMonth` tombstones only the month→plan mapping, so every "Remove"
strands a full plan record. **16 of 24 live plans are referenced by nothing** —
no `monthlyPlans` row, no `activePlanId` — and they are **29% of the document**
(28,001 of 96,551 bytes). Among them: **six plans all named "September 2026"**
(totals 10,600 / 11,000 / 11,000 / 11,698 / 10,750 / 9,350), three
"Aug 28 – Sep 27, 2026", and three "August 2026".

**This, not orphaned categories, is the likely origin of the original "some
amounts differ" report.** The old copy picker listed plan records, so all six
"September 2026" entries appeared as choices, distinguishable only by income.
The month-based picker shipped in v1.11.0 resolves through `planForMonth` and
shows each month once, so the confusion is already gone.

Cleanup was **deliberately declined** for now (user's call): the plans are
invisible to the UI, and 96KB is trivial for KV, so the remaining cost is
cosmetic. If it's ever done, tombstone rather than hard-delete — a hard delete
looks like "the other side hasn't seen it yet" to `mergeArrayById`, and any
un-synced device will re-upload them. See `roadmap.md`.

_Last updated: 2026-07-31 (Bills reconciliation, faithful budget copy, move sub-items)_

## Two bug fixes and one feature (2026-07-31)

Build `2026.07.31.0006` / v1.11.0.

### 1. Bills now reconcile instead of only generating

The bill-generation effect in `App()` was **create-only**: untracking a
Household item (or deleting it) left its row in Bills — and in the rolling
reserve — forever, and renaming/re-pricing an item never reached a row that had
already been created, because `already.has(it.id)` short-circuited.

It is now a reconciler over the current bill bucket. Per pass it creates
missing rows, revives a tombstoned row when an item is re-tracked (rather than
appending a duplicate), retires rows whose item is no longer tracked, and
resyncs the ones that are. Two deliberate asymmetries:

- **A row with `paid > 0` survives untracking.** That's recorded payment
  history, not a projection.
- **`allocated` follows the Household amount only while the row is unpaid.**
  Once paid, the snapshot freezes so the reserve maths stays honest about what
  was budgeted at payment time. The *name* always follows.

Retirement tombstones (`deletedAt`), never splices — `computeBillsReserve`
already skips tombstones, so the reserve self-corrects with no change there.
A `changed` flag keeps the effect returning the identical object when nothing
moved; without it, a fresh object every pass would loop and dirty the document.
Prior buckets are still never touched. Deleting a Household item now also
clears its unpaid current-month row, which finally makes the delete
ConfirmDialog's copy true.

**Verified in a sandboxed browser copy**: track 3 items → 3 rows, reserve
SAR 3,600. Partially pay one (800), untrack it → stays. Untrack an unpaid one
→ tombstoned. Re-track it → revived, still 3 rows, no duplicate. Change an
unpaid item's amount 400 → 550 → row followed.

### 2. Copying a budget from another month is now faithful

Two independent defects produced "some subcategories are missing, some amounts
differ":

- **`clonePlanForMonth` dangled orphaned categories.** `groupIdMap[c.groupId]
  ||c.groupId` left any category whose `groupId` wasn't in `source.groups`
  pointing at the *source* plan's group id — an id absent from the clone. Every
  renderer walks groups→categories, so those categories and all their sub-items
  were **invisible** in the copy while `allocated` (which sums all categories)
  still counted them. They now land in a synthesized `Ungrouped` group, created
  only when something needs it.
- **The picker listed plan records, not months.** `removePlanForMonth` only
  tombstones the month→plan mapping, so orphaned plans accumulate all bearing
  the same month label, and a carry-forward month had no entry at all. Both
  pickers (Budget banner, Expenses "Create plan" modal) now list the last 12
  buckets resolved through `planForMonth` — the same function the tab renders
  from — labelled with income, category count, and custom/carry-forward.

Also hardened: the `||plans[0]` fallback is gone (it could silently copy the
other owner's plan and stamp the requested owner on it), `groups`/`categories`
are null-guarded (an unguarded `.map` threw before `setData`, so the copy
silently did nothing), each cloned category's cached `amount` is re-derived
from its subs, and an inherited `deletedAt` is stripped.

**Verified**: seeded a plan with an orphaned category (2 subs, SAR 1,000) and a
category whose cached amount had drifted to 99,999. Source rendered 18,820 but
summed 19,820; the copy renders and sums 19,820, keeps 15/15 categories and
3/3 subs with byte-identical names/amounts/tracked flags, and corrects the
drifted cache to 120.

### 3. New: move sub-items to another category (plan-wide multi-select)

"Select sub-items to move" in the Budget tab enters a selection mode that
force-opens every category with subs, so ticks can span any number of
categories and groups at once. The action bar shows `N selected · <total>`; the
destination sheet is grouped by group, flags `NOT TRACKED` destinations, shows
each candidate's before → after, warns which source categories will be left at
zero, and warns when the move crosses the tracked/untracked boundary.

The move is one atomic `setCatsFor` in two passes (so a category can be both
source and destination). Two rules that are easy to get wrong:

- **A source emptied of every sub has its `amount` explicitly zeroed.**
  `syncAmt` leaves `amount` alone at zero subs, and the lingering last sub-sum
  would resurface as a manual value.
- **A subs-less destination's manual amount is preserved as a seeded sub**
  named after the category. A category's `amount` is manual only while it has
  no subs — without this, dropping SAR 820 into a manual SAR 4,200 "Bills"
  silently made it SAR 820. (Note the same trap still exists on "Add
  sub-item", which is long-standing behaviour and was left alone.)

**Verified**: moved 2 subs spanning 2 categories in 2 different groups into a
manual-amount category. Bills 4,200 → 5,020 (seed + both), source emptied to 0,
partially-emptied source kept its remainder, **plan total conserved at 19,820**.

### Testing

Three new runner files live in the repo root alongside `trendtest.cjs`, all
using the CLAUDE.md slice-and-`vm.runInContext` technique (testing the shipped
code, not a reimplementation):

- **`parsecheck.cjs`** — run after *every* edit. A syntax error blanks the app
  with zero console output, so this is the cheapest possible guard. Needs
  `@babel/standalone`, which isn't vendored: `npm i @babel/standalone --prefix
  /tmp/pc` then `node parsecheck.cjs /tmp/pc/node_modules/@babel/standalone`.
- **`billstest.cjs`** (11) — the reconciler: create/revive/retire/resync, the
  paid-row and unpaid-`allocated` asymmetries, prior buckets untouched, and the
  identity-return no-op.
- **`budgettest.cjs`** (15) — `clonePlanForMonth` (orphan rescue, fidelity, no
  silent fallback, null guards, drift correction) and `moveSelectedTo` (total
  conservation, emptied-source zeroing, destination-seeding).

`synctest.cjs`/`baltest.cjs` from the 2026-07-30 session were never committed
and are gone — hence committing these. Note `assert.deepStrictEqual` compares
prototypes and so fails across vm realms; use `deepEqual` for anything built
inside the vm.

_Last updated: 2026-07-31 (Investments tab polished)_

## Investments: Budget + Net Worth treatment applied (2026-07-31)

Build `2026.07.31.0005` / v1.10.0. Requested after the five-step programme —
the Investments tab had **both** previously-fixed problems, at larger scale.

**Measured**: **3,514px → 2,572px (4.2 → 3.0 screens, 27% shorter)**, with
stock holding rows going **175px → 57px** and MP2/TD/Gold account cards
**~300px → 70px** collapsed.

### 1. Duplicate chart (the Net Worth bug again)
`Portfolio trend` (daily `snapshots`, field `investments`) and
`Portfolio over time` (legacy monthly `LineChart` off `portHistory`) both
plotted portfolio value over time. The second is gone, replaced by
**"What's driving it"** — portfolio split by account type over time. The
standalone **"Gold value over time"** card was absorbed into it, so gold is
one band rather than its own chart. Four charts → three.

`CompositionRangeChart` was **generalised** to take a `series` prop
(`[{key,label,color,negate?}]`) with dot-path keys, so Investments plots
`byType.{stocks,mp2,td,gold}` through the same component rather than growing a
second near-identical chart. Net Worth's call site now passes its four series
explicitly; its behaviour is unchanged (verified: still 4 bands, Y-domain
still spans −75k, liabilities still below the axis).

`portHistory` is still written on refresh and **still read by Home's
`PortfolioCard`**, so nothing is orphaned.

### 2. Holdings and account cards collapse
Every stock row and account card was a permanently-open edit form. Now the
Budget split applies: the collapsed row is what you *scan*, the chevron opens
what you *edit*.

- **Stock row** (57px): ticker · value · gain %. Expanded: name, share/avg/
  price stats, owner + type selects, Add trade, Delete, trade log.
- **MP2** (70px): name · value · "owner · Matures January 2029 · 899 days".
- **Time Deposit** (70px): name · value · maturity countdown — and when a
  deposit has matured the line turns red and reads **"Matured — confirm it"**,
  because that state needs action and must not hide behind a chevron.
- **Gold** (70px): name · value · gain % · "owner · 100g · 24K".
- Validation problems (maturity-before-start, bad weight/karat/cost) surface
  as a red `!` on the collapsed row, so a broken account is never hidden.

### 3. Trade ledger
Was the **only non-responsive grid left in the app**:
`gridTemplateColumns:"1fr 80px 80px 80px 32px"` — 272px of fixed tracks +
gaps + padding = 320px, leaving the Date column ~38px on a 390px phone. Now
two compact lines (date · BUY/SELL · total · delete, then `shares × price`),
no fixed columns, and the header row is gone.

### 4. The last raw numeric inputs in the app
The trade modal built its fields from an array with `type={type}` (not a
literal `type="number"`), so **the NumField sweep's grep never found them**.
Shares and Price now use `NumField` (`live`, `navGroup="trade"`), and the
projection inputs got `navGroup="projection"`. **Zero `input[type=number]`
remain anywhere in the app.**

### 5. Sticky section headers
Stocks/ETF, Pag-IBIG MP2, Time Deposits and Gold headers now use the
`.group-head` pattern, each wrapped with its own card so the sticky is bounded
by its section.

**Verified** in the 390×844 iframe sandbox:
- Page 3,514 → 2,572px; rows 175 → 57px; no horizontal overflow.
- Stock row expands 57 → 290px with name, stats, both selects, Add trade,
  Delete and the reformatted trade log all present.
- Injected synthetic MP2/TD/Gold accounts: all three collapse to 70px with
  correct summaries, expand to 445–591px with 8–10 inputs each and a Delete;
  the TD correctly showed "Matured — confirm it".
- Composition chart with all four types present: **4 bands + full legend**;
  with stocks only, the other three are dropped from chart *and* legend.
- Trade modal with real typing: `3.5*2` → **7**, Enter jumped to Price with it
  selected. Total preview computed 12 × 200 = $2,400 from `10+2` / `100*2`.
- Sticky headers pin per section; Net Worth composition unchanged; all 10 tabs
  mount; `trendtest.cjs` still passes 14 assertions; no console errors beyond
  the SW stub.

## Net Worth: the duplicate chart is now "What's driving it" (2026-07-31)

Build `2026.07.31.0004` / v1.9.0. Step 5 — the last of the mobile-usability
work (`roadmap.md`).

**Symptom** (user-reported): the Net Worth line chart felt "boring and
repetitive". It was literally repetitive — the tab carried **two charts of the
same figure**: the range-selectable `HistoryRangeChart` (daily `snapshots`,
field `net`) and, further down inside the snapshot-log card, a monthly
`LineChart` of net worth built from the older `history` rows.

**Fix**: the second slot now answers a different question — *net worth went
up, because of what?*

- **New `CompositionRangeChart`** — a stacked `AreaChart` of the components
  already captured alongside `net` on every snapshot: `banks`, `investments`,
  `assets`, `liabilities`. No new capture, no data-model change. It reuses
  `RANGES` and `bucketSnapshotsForRange`, so its 1W/1M/3M/1Y/MAX pills behave
  exactly like the trend chart's.
- New card **"What's driving it"**, placed directly under "Net worth trend".
- The **snapshot-log card lost its chart** and its month/year granularity
  toggle (which only ever switched that chart's x-axis). It keeps everything
  that made it useful: "This month syncs automatically", Force refresh, the
  add-past-entry row, and the per-month chips. It is now a log, which is what
  its title always said.
- Dead locals removed with it: `gran`/`setGran` and `pts`.

**Stacking subtlety worth knowing**: liabilities are negated *and* given their
own `stackId`. Sharing the assets' stack id makes Recharts **accumulate** the
negative — the debt band renders downward from the top of the assets, so the
stack's top edge reads as gross assets and the band's *lower* edge is the real
net worth. Arithmetically correct, easy to misread. A separate stack puts
assets above the axis and debt below it, which is what the card's caption
promises. Caught by reading the rendered chart, not the code.

**Also fixed**: the "Net worth trend" card had `className="fade-up-1b"` — a
class that does not exist — so it was the only card on the tab with no
entrance animation. Now `fade-up-2`, with the cards below renumbered.

**Verified** in the 390×844 iframe sandbox:

- Card order: Composition → Net worth trend → **What's driving it** →
  Monthly snapshot log.
- Exactly **1 line chart** left on the tab (was 2) and 4 stacked areas.
- Y-axis domain spans **−75k to 225k**, confirming debt renders below zero;
  zoomed screenshot confirms the red band sits under the asset bands.
- Tooltip un-negates: "Bank accounts SAR 66,501 · Investments SAR 71,387 ·
  Other assets SAR 85,000 · **Liabilities SAR 26,400**" — and
  66,501 + 71,387 + 85,000 − 26,400 = 196,488, matching net worth.
- Series with no data are dropped from both chart and legend, so a household
  with no liabilities doesn't get a permanent zero row.
- Snapshot-log card still has Force refresh, Add entry and its chips; the
  granularity toggle is gone.
- Full tab sweep: all 10 destinations mount, no horizontal overflow, charts
  survive re-mount, no console errors beyond the SW stub.
- `trendtest.cjs` still passes 14 assertions.

**Note**: `history` (monthly rows) is now used only for the hero's "since last
snapshot" delta and the log chips — no chart reads it. It is still written and
still merges, so nothing is orphaned.

## Home Goals card: every goal, not just one (2026-07-31)

Build `2026.07.31.0003` / v1.8.1. Follow-up to step 4, requested after seeing
Home in use.

**Symptom** (user-reported): "it only shows one even though I have two."

**Cause**: `GoalsSummaryCard` deliberately rendered a single goal — the active
one closest to completion — as a documented stand-in for a priority field the
goal schema doesn't have. Adding a third goal would have changed *which* goal
appeared rather than showing more.

**Fix**: one compact row per active goal — colour dot, name, right-aligned %,
and a progress bar underneath. The bar reuses the existing
`.bar-animated`/`.liquid-fill` + `liquidFillBg()` language already used in
Budget, Expenses, Forecast and Net Worth rather than inventing a new one, with
the trough as `neuInset(999)`. Fill width is clamped to 0–100 so an
over-funded goal can't overflow its trough.

Decisions, agreed with the user before building:
- **Capped at `GOAL_ROWS_MAX` (4)** with a muted "+N more goals" line. Home is
  a dashboard; an uncapped list would let one card run away with the page,
  which is the same problem just fixed on Budget. Nothing is silently hidden —
  the count is always stated and the card taps through to Goals.
- **Completed goals stay in the header count only** ("1 completed · 4 active").
  They need no action, so they don't earn vertical space.
- **Ordering is unchanged** — closest to completion first, the same derived
  sort that used to pick the single goal, since there is still no
  `priority`/`order` field.
- The "+N more" line is plain text, **not** a button: the whole card is
  already `role="button"` wired to the Goals tab, so a nested control would be
  a second tap target for the same action.

**Also added during verification**: in the Household profile the two owners
genuinely have same-named goals (both have an "Emergency Fund"), so rows were
ambiguous. Household rows now append a muted owner name —
"Emergency Fund · Charlene". Only in Household; on a single profile every goal
already belongs to that person.

`ProgressRing` is no longer used by this card but stays — `SavingsInvestingCard`
still uses it.

**Verified** in the 390×844 iframe sandbox:

- 3 active demo goals → 3 rows, names/percentages/bar widths all agreeing
  (30.83% ↔ 31%, 24% ↔ 24%, 0% ↔ 0%); 6px troughs; no horizontal overflow.
- Injected 2 extra goals → exactly **4 rows + "+1 more goal"** (correct
  singular), card 251px tall.
- A 49-character goal name truncates with an ellipsis on **one line**, never
  wraps.
- Funded a goal to its target → it left the row list and the header moved to
  "1 completed · 4 active".
- Household → 7 active, capped at 4 with "+3 more goals", and the two
  "Emergency Fund" rows now read "· Charlene" / "· Jastine". Owner suffix
  confirmed absent on single profiles.
- Full tab sweep after the change: all 10 destinations mount, no console
  errors beyond the SW stub. `trendtest.cjs` still passes 14 assertions.

**Incidental confirmation**: the Household view showed the step-4 pace verdict
firing on real demo data — "Overspending — heading for SAR 24,344 over" — and
the pill was checked for clipping (it wraps correctly; the FAB merely overlaps
it in screenshots).

## Home: verdicts, not figures (2026-07-31)

Build `2026.07.31.0002` / v1.8.0. Step 4 of the mobile-usability work
(`roadmap.md`).

**The brief**, in the user's words, was that Home should answer: *How rich am
I? Is my lifestyle creeping? Am I overspending right now? Am I saving enough?
Am I improving my savings over time? Am I progressing with my goals?* They
agreed with the reframing that Home *"doesn't answer these, so it feels like
decoration"* — so this was never about adding charts (see `decisions.md`).

**Diagnosis**: four of the six already had cards. The problem was that every
card showed a *figure*, not an *answer*. "SAR 3,958 remaining · 0% used" tells
you what is true, not whether it is good.

**Fix — a shared `Verdict` line** at the top of each card, one plain-language
sentence, with the figures demoted to supporting detail. Tones (good / warn /
bad / flat) reuse the same semantics as `spendStatusColor` so a green verdict
never disagrees with a green bar.

| Question | Verdict | Basis |
|---|---|---|
| Overspending right now? | "On track" / "Overspending — heading for SAR N over" | burn rate vs `bucketProgress` elapsed, projected to period end |
| Saving enough? | "Saving 22% — at or above your 20% target" | new `data.settings.savingsTargetPct` |
| Goals progressing? | "2 of 3 goals have no monthly amount" | goals with no `monthly` are stalled |
| How rich am I? | existing net-worth delta (unchanged) | — |

The spending pace verdict is the substantive one: *% of budget used* is
meaningless alone — 60% is fine on day 25 and alarming on day 5. It is
suppressed for the first two days of a period, because one big shop on day 1
projects to a catastrophe and would cry wolf every single period.

**New: `savingsTargetPct`** in `data.settings` (default 20), with a Settings
control. "Am I saving enough?" needs something to be enough *of*. Display
only — it never changes a stored figure. Defaulted in both `defaultData()`
and `migrate()`.

**New: the two trend cards** — `LifestyleCreepCard` and `SavingsTrendCard`.
Both are fully built and **both currently render nothing**, because expense
tracking here started July 2026 and they need `MIN_TREND_BUCKETS` (3)
*completed* periods. They will switch themselves on around Oct 2026 with no
further work. Rendering nothing rather than "not enough data yet" was the
explicit call — that placeholder is exactly the decoration this removed.

New module-scope helpers `bucketHistoryFor` / `bucketHistoryCombined` run the
**same** `trackedSpendingFor`/`savingsInvestingFor` the live cards use, now
taking an optional `bucket` argument, so a past period can never be computed
by a different rule than the current one. The in-progress period is excluded
deliberately: a month four days old always looks like a spending collapse.

**Verified**:

- `trendtest.cjs` (kept in the repo) — **14 assertions**, slicing the real
  functions out of `index.html` and running them under `vm`, per CLAUDE.md.
  Covers the render gate (0/1/2/3 periods), exclusion of the current period,
  "a plan alone is not evidence a month was tracked", owner isolation, creep
  maths up/down/steady, savings-rate points, and household merging —
  including that the household rate is *recomputed*, not averaged from each
  owner's rate. Run with `node trendtest.cjs`.
- In the 390×844 sandbox: verdicts render on Savings & Investing
  ("Saving 0% — 20 points under your 20% target"), Tracked Spending ("On
  track this period") and Goals ("All 3 goals funded monthly"); trend cards
  correctly **absent**.
- Forced the trend cards on by injecting three months of synthetic history:
  "Spending up 50% vs your average · SAR 3,000 last period · SAR 2,001
  average" and "Improving — up 10 points · 20% last period · 10% at the start
  · 20% target" — both matching the injected figures exactly. Removing the
  synthetic rows closed the gate again.
- Full tab sweep after the change: all 10 destinations mount, no horizontal
  overflow, no console errors.

**Bug found and fixed during this**: a card returning `null` left its
`.home-cell` wrapper behind as a grid gap. Cards guard themselves (the trend
pair needs enough periods *and* a non-zero baseline), so the wrapper now
follows the card via `.home-cell:empty{display:none}` rather than duplicating
each card's conditions.

**Caveat for the next session**: the trend cards' maths is unit-tested and was
seen rendering against synthetic data, but has never run against the user's
real history. Re-check the first period they light up (~Oct 2026). Note also
that "me" has pay-periods enabled (payday 28), so their buckets are
`YYYY-MM-28` period keys, not calendar months — any future fixture work needs
to account for that.

## Budget: one-line rows, sticky headers, keyboard sweep (2026-07-31)

Build `2026.07.31.0001` / v1.7.0. Step 3 of the mobile-usability work
(`roadmap.md`).

**Symptom** (user-reported): "in the budget tab, when I'm browsing it on my
phone, I have to scroll down a lot just to get through all the categories."

**Measured baseline** at 390×844 with the demo plan (5 groups, 19
categories): **4,484px — 5.3 phone screens**. Two causes:

1. Each category row was **121px**, because `.cat-row` wrapped into *three*
   stacked lines on a phone: name / then % + amount / then the Tracked pill +
   chevron + trash. 19 × 121 = 2,299px, over half the page.
2. **17 "add sub-items" hint rows** (23px each, 391px) — one under every
   category with no sub-items, duplicating the "Add sub-item" button already
   inside the panel the chevron opens.

**Terminology note that shaped the fix.** The user's "5 categories, each with
subcategories, 21 subcategories total" maps to the app's **5 groups and 21
category rows** — not the app's `subs` feature, which they barely use (17 of
19 demo categories have no subs). The amounts edited monthly are therefore
the **category-row** amounts, which is why those stay on the collapsed row.

**Fix**:

- **One-line category rows at every width**, 121px → **48px**. The row keeps
  what gets edited: name and amount. Vertical padding is 4px because the
  40px chevron target already sets the height floor.
- **Tracked toggle and Delete moved into the panel** behind the chevron
  (relabelled "Show/Hide details"). Nothing is lost at a glance: an untracked
  category already renders its name *italic and greyed*, verified as the same
  signal the pill carried.
- **Per-row `%` and currency code hidden below 768px** (`.cat-pct`,
  `.cat-cur`). Together they buy the category name ~70px (73 → 143px), which
  is what you scan by. The % is still on desktop, and the "Where your income
  goes" card already breaks down shares.
- **Sticky group headers** (`.group-head`) so you always know which group the
  row under your thumb belongs to. The group `<section>` had to move from
  `overflow:hidden` to `overflow:clip` — `hidden` makes it a scroll container
  and sticky resolves against it instead of the viewport.
- **Enter jumps to the next amount field** (`NumField`'s new `navGroup`
  prop, `data-numnav` in the DOM). A monthly sweep is now type → Enter →
  type → Enter down the whole plan, across group boundaries, without
  dismissing the keyboard. Combined with focus-select, each amount is one
  keystroke away.

**Global CSS bug found and fixed**: `html,body{overflow-x:hidden}` made
**body a scroll container** — per spec `overflow-x:hidden` with
`overflow-y:visible` computes the y axis to `auto`, so body reported
`hidden auto`, and *every* `position:sticky` descendant resolved `top:0`
against body's scrollport (the full document) rather than the viewport. That
is why the first sticky-header attempt silently did nothing except on the
last card. `overflow-x:hidden` now sits on `<html>` only; the root element's
overflow propagates to the viewport, so horizontal clipping is unchanged.
**Any future `position:sticky` in this app depended on this fix.**

**Verified** in the 390×844 iframe sandbox:

- **4,484px → 2,777px — 5.3 → 3.3 screens, 38% shorter.** Rows a uniform
  48px; chevron still a 40×40 target; zero hint rows left; no horizontal
  overflow.
- Category name width 143px; of the demo names only "ADHD Consultation &
  Medication" (30 chars) truncates.
- Sticky headers probed at five scroll positions: the pinned header always
  matches the card crossing the top, and never pins when between cards.
- **Real mouse/keyboard sweep**: clicked Gas → whole value selected → typed
  `300+45` → Enter → committed **345**, focus jumped to Allowance with its
  value selected, group total updated 4,363 → 4,465.
- Panel controls work: Tracked toggles (row styling flips to italic/grey),
  Delete present with the right `aria-label`, Add sub-item intact.
- Regression sweep after the global `body` change: all 10 destinations mount,
  no horizontal overflow, nav pinned, and `useScrollLock` still sets
  `body{position:fixed}` and restores to `static`. No console errors.

## Bottom-bar navigation (2026-07-30)

Build `2026.07.30.0004` / v1.6.0. Step 2 of the mobile-usability work
(`roadmap.md`).

**Symptom** (user-reported): the app "feels like transferring worksheets in
Excel", and "I scroll too much to reach anything."

**Root cause**: 11 tabs rendered as wrapping ~30px pills
(`flexWrap:"wrap"`) in *normal document flow*, below a ~75-line header. On a
390px phone that is four to five rows of chrome before any content, and
because it scrolled away with the page, switching tabs from halfway down a
4,400px Budget view meant scrolling back to the top first. The Excel feeling
and the scrolling complaint were the same defect.

**Fix**:

- **Fixed bottom bar** (`BottomNav`), safe-area padded, 56px cells (≥44px
  touch target): **Home · Budget · Expenses · Banks · Invest · More**.
- **`MoreSheet`** — portalled `.sheet-bg` holding Net Worth, Goals, Bills,
  Household, Currency as a two-column grid.
- **Forecast's tab is gone**; `TargetsView` and `data.targets` stay. This
  makes the Forecast view unreachable from the UI, which was the explicit
  ask — deleting it would orphan saved records and mean touching
  `CONFLICT_COLLECTIONS` for no user-visible gain.
- **Section title** added above the tab content. The bar labels in 10px type
  are enough to navigate by but not to stay oriented by once scrolled.
- Single `TAB_META` registry names every tab (including hidden ones) so the
  bar, the sheet and any future entry point share labels and icons. `short`
  exists only for the bar (`Investments` → `Invest`).
- The bar spans the window for the glass edge-to-edge, but the row itself is
  capped at 560px and centred — full width flung six items across 1400px on
  a laptop.

**Latent bugs fixed in the same pass:**

- `"home"` was missing from `TAB_ORDER`, so `indexOf` returned `-1` and every
  transition into or out of Home computed its slide direction against a
  phantom position. `TAB_ORDER` is now derived from
  `PRIMARY_TABS`/`MORE_TABS`/`HIDDEN_TABS`, so a tab cannot be added without
  landing in it.
- App shell used `minHeight:"100vh"` → now `100dvh`.
- `.fab-btn` was `z-index:70`, above every `.sheet-bg` (40) — it floated over
  open sheets *and* stayed tappable through the scrim. Now `35`: above the
  nav (30), below sheets. This was pre-existing and affected every sheet in
  the app, not just the new one.
- The undo toast and the page container's bottom padding now clear
  `--bottom-nav-h`.

**Verified** in the sandbox (dummy `SYNC_TOKEN`, SW stubbed) at a true
390×844 viewport — `resize_window` does not shrink the viewport below the OS
window, so the app was loaded in a 390px iframe (`sandbox/phone.html`)
instead:

- Babel parse clean; build IDs in sync across all three files.
- All **10 destinations** reachable and mounting, each with the right heading;
  no horizontal overflow on any of them; nav pinned to the viewport bottom on
  all 10.
- Six 62px cells at 390px, **no label truncation** (widest is "Expenses" at
  41px).
- Scrolled to the bottom of a 4,484px Budget page: nav still pinned, 114px of
  clearance, **zero interactive elements obscured**.
- More sheet: portalled to `<body>`, fills the viewport, `z-index` 40 vs the
  nav's 30, body scroll locked while open, closes and unlocks on pick, and
  the More button reports `aria-label="More — Net Worth selected"`.
- FAB now sits under an open sheet — `elementFromPoint` at the FAB's centre
  returns `.sheet-bg`, so it is no longer tappable through the overlay.
- No console errors beyond the intentional SW stub.

**Note for the next session**: bottom-bar colour changes ride the global
`button{transition:color .22s}`, so reading `getComputedStyle().color`
immediately after a tab switch returns the *previous* tab's colour. That is
transition timing, not a bug — re-read after ~250ms.

## Numeric inputs rewritten around a shared `NumField` (2026-07-30)

Build `2026.07.30.0003` / v1.5.1. First step of the mobile-usability work
scoped in the 2026-07-30 grilling session (see `roadmap.md`).

**Symptom** (user-reported): "sometimes when you delete it, a zero stays, you
have to select all and delete that zero."

**Root cause**: 32 fields were `<input type="number" value={n}
onChange={e=>set(Number(e.target.value))}/>`. `Number("")` is `0`, so
backspacing the last digit wrote `0` straight back into state and React
repainted `"0"`. The box could never be blank, and because tapping a field
puts the caret at the end, typing over a `0` produced `0500`. Roughly 25 of
the 32 had that exact shape; the rest kept a string but were still
`type="number"` (spinner, no operator entry).

**Fix**: one shared `NumField` component (`index.html`, just above
`STORAGE_KEY`) now backs **38 call sites** — every numeric field in the app.
It keeps keystrokes in a local string draft, leaves real state alone until
blur/Enter, and commits through the existing `evalMathExpr`. Behaviour:

- **Empty is a real state.** Clearing the box shows empty rather than `0`.
- **Blur on an emptied box restores the previous value** rather than writing
  `0` — clearing is nearly always a prelude to typing. `allowEmpty` opts a
  field into committing `""` instead (used where "not entered yet" is
  meaningful: MP2/TD principal, rate, tax rate, gold weight/karat/cost,
  liability monthly/months).
- **Focus selects the whole value**, so tapping and typing replaces.
- **Math expressions everywhere** — `1200+350` now works in *any* numeric
  field, not just the expense form.
- `type="text"` + `inputMode` — numeric keypad on mobile, no desktop spinner,
  and operators can actually be typed. `inputMode="numeric"` for integer
  fields (year, payday, months remaining).
- `integer`/`min`/`max` clamp on commit. Deliberately **not** applied to gold
  karat, because clamping to 1..24 would make the existing "Karat must be
  between 1 and 24" message unreachable.
- `live` commits on every keystroke. Required where something outside the
  field reacts before blur: the currency converter's running result, and the
  MP2/TD modals whose submit buttons are `disabled={!valid}` (tapping a
  disabled button doesn't reliably blur the field, which would otherwise
  strand you with a filled box and a dead button).

Also removed `BillsView`'s `openingDraft` state and its resync `useEffect` —
`NumField` holds the draft now, so they were duplicating it.

**Verified** in a sandboxed copy (dummy `SYNC_TOKEN`, SW registration stubbed,
served over `http://localhost`, own `localStorage` from `defaultData()`):

- Babel parse clean (8,690 JSX lines) — see `parsecheck.cjs` note below.
- All 38 `NumField` sites statically confirmed to pass both `value` and
  `onCommit`.
- All 11 tabs mount; **zero `input[type=number]` left in the live DOM**; no
  console errors beyond the intentional SW stub.
- Real mouse/keyboard (not synthetic events): clicking a Budget amount
  selected the whole value (`selectionStart 0`, `selectionEnd 3`); typing
  `1200+350` + Enter committed **1550**; clearing a field and blurring
  restored **350** with the category total unchanged at SAR 3,350.
- `live` mode: typing `250` in the converter updated the result to
  **937.5 SAR** while the field was still focused.

**Testing note**: the Chrome automation tab is often backgrounded
(`document.hasFocus()===false`), and there `el.focus()`/`el.blur()` do not
fire React's handlers — a cleared field appears stuck empty. That is a harness
artifact, not an app bug; confirm focus/blur behaviour with real
`computer`-tool clicks and keystrokes, not synthetic `dispatchEvent`.

## Modal anchoring + KV write reduction + bank balance updater (2026-07-30)

Three items, build `2026.07.30.0002` / v1.5.0.

### 1. Unreachable confirm dialogs on mobile (fixed)
**Symptom**: deleting a Budget subcategory while scrolled down showed nothing
— the page froze with no visible dialog.

**Root cause**: the containing-block trap already documented on `Portal`
(`index.html:392`). `TabPane`'s `.tab-enter-*` animation is `fill-mode: both`,
so its final `transform:translateX(0)` sticks permanently, making that div the
containing block for every `position:fixed` descendant. 18 of the app's 20
`.sheet-bg` dialogs were already portalled; **`ConfirmDialog` and
`AdjustReserveSheet` were not**. Their overlays resolved against the tab pane
(as tall as the page) and `align-items:flex-start` pinned them to the top of
the whole document, while `useScrollLock` froze the body so you couldn't reach
them.

**Fix**: wrapped both in `<Portal>`. Also switched `.sheet-bg`/`.sheet` sizing
from `vh` to `dvh` (with a `vh` fallback line) — mobile `100vh` is the
URL-bar-hidden height, so tall sheets could push their buttons below the fold.

**Verified**: Babel parse clean; portal-coverage audit leaves exactly 7
un-portalled `.sheet-bg` sites, all correct (`QuickTransferSheet`/
`ExtraFundsSheet` are portalled at their call sites; the five App-level modals
render outside `TabPane`). Confirmed working on-device by the user.

### 2. "Save to Cloud (n)" with nothing to show — real, not phantom
**Symptom**: opening the app with no interaction showed 1–2+ pending changes,
while Pending Changes reported none.

**Root cause**, three compounding parts:
1. `index.html:3400` refreshes quotes (>15min stale) and FX (>6h) on every
   open, and again on visibility/focus/online.
2. `fingerprint()` correctly excludes `livePrice`/`prevClose` — but **not** the
   data derived from them. New prices change `invSar`, which makes two effects
   rewrite the current month's `history` row (`index.html:3272`) and all three
   per-profile `snapshots` rows (`index.html:3303`). Both arrays *are* in
   `fingerprint()`, so the doc looked edited → `hasUnsyncedChanges` →
   the 8s idle autosave → **a Cloudflare KV write on every app open**.
3. `PendingChangesModal` diffs only `CONFLICT_COLLECTIONS`, which contains
   neither `history` nor `snapshots` — hence "no changes."

Additionally `changesSinceSave` counted *firings of the debounced dirty-check
effect*, not records. The two effects land ~300ms apart, which is exactly why
the badge read (1) or (2).

**Fix**:
- New `userFingerprint(d)` = `fingerprint(d,{ignoreAuto:true})`, which drops
  `history`/`snapshots` rows stamped `auto:true`. The dirty flag now requires
  *both* a byte difference **and** a user-meaningful difference. `fingerprint()`
  itself is untouched — weakening it would have broken cross-device merging of
  auto rows (one device's snapshot history could quietly replace another's).
- `cacheSyncedSnapshot`/`syncedSnapshotObj()` memoize the last-synced data as a
  live object so the dirty check can compare content, not just a stored hash.
- New `countPendingChanges(local,base)` returns a real record count (plus
  `household.expenses`, which was never in `CONFLICT_COLLECTIONS`) and a
  separate `derived` count. The badge shows the former.
- `PendingChangesModal` now names the derived entries explicitly instead of
  claiming nothing changed.

All five automatic KV write paths (`pushImportant`, visibility-hidden,
`pagehide` beacon, activate, pull-to-refresh gesture) gate on
`hasUnsyncedRef`, so all five are now closed to auto-only changes.

**Verified**: 15 assertions against the real shipped helpers (lifted out of
`index.html` by name and run under `vm`, not reimplemented) — see
`synctest.cjs` in the session scratchpad. Covers the price-tick case, a real
edit, both together, manual (non-`auto`) history entries still counting, a
fresh day's 3 new snapshot rows, household expenses, tombstones, and the
no-baseline fallback.

### 3. Bank balance updater (Option A)
Balances previously required select-all-delete-retype in an inline field.
New `UpdateBalanceSheet` (portalled, `index.html` just above `BanksView`):
Add/Subtract/Set via the shared `.seg-control`, a numeric field that still
accepts math expressions through `evalMathExpr`, and a running preview line
(`12,400 + 500 = 12,900`) so the committed figure is visible before saving.
Each bank card gained a prominent "Update" button beside the balance; the old
inline field stays in the settings panel. Overdrafts are allowed but flagged.
The sheet resolves its account from `banks` on each render, so a sync landing
while it's open can't make it write a stale balance.

**Verified**: 15 arithmetic assertions using the real `evalMathExpr`
(`baltest.cjs`), including float rounding, math expressions, no-op guards, and
the negative-balance path. The test asserts the shipped `next=` formula is
still the one it models, so drift fails loudly.

### Known limitations / not done
- `history`/`snapshots` still aren't shown as *itemised* rows in Pending
  Changes — only a count and an explanation. Itemising them would mean adding
  them to `CONFLICT_COLLECTIONS`, which `RecentlyDeletedModal` also reads, and
  snapshot "deletions" there would be meaningless.
- A device that is opened daily but never edited will accumulate local-only
  auto snapshots until the next real edit flushes them. They merge by
  `{date,profile}` key, so nothing is lost — but cloud snapshot history is now
  slightly less eagerly current, which is the intended trade for the write
  saving.
- `household.expenses` counts toward the badge but still isn't in
  `CONFLICT_COLLECTIONS`, so it's absent from the conflict modal's itemised
  diff and from Recently Deleted despite being soft-deleted. Pre-existing gap,
  worth a focused follow-up.
- No browser-automation tool was available this session, so nothing was
  verified by automated in-browser testing. Instead: parse check + unit tests
  against the real shipped helpers, then **all three items were confirmed
  working on-device by the user** before the session closed. Treat them as
  verified.

## UI polish + responsive-layout pass, and pixel-perfect audit (2026-07-29)

Pure CSS/JSX styling pass across `index.html` — **no functionality,
calculations, or business logic touched**. Two parts: a requested
responsive/polish pass against a specific punch list, then a follow-up
pixel-level consistency audit (report first, fixes applied on approval).

### Responsive/polish pass
- **FAB**: both the global FAB (`App()`) and Home's own FAB now share one
  `.fab-btn` CSS class — `position:fixed`, all four `env(safe-area-inset-*)`
  respected (previously only bottom was). Main app container's bottom
  padding increased to `calc(env(safe-area-inset-bottom) + 96px)` so the FAB
  can never sit on top of the last card's content, on any tab.
- **Safe areas**: the main app container (`<div style={{maxWidth:920...}}>`
  wrapping the whole app below the pull-to-sync indicator) now pads all four
  sides with `env(safe-area-inset-*)`, not just top.
- **Segmented control** (`HomeProfileToggle` — Me/Wife/Household on the Home
  Hero card): rewritten from per-button color restyling to a fixed-width
  `.seg-control`/`.seg-indicator` pair — one absolutely-positioned pill that
  CSS-transforms between three equal-width columns, so the control's overall
  width never changes when switching profiles. Paired with a header-row fix
  on `HeroCard` (title truncates via ellipsis instead of wrapping) so the
  whole header stays a fixed height across all three profiles.
- **Status pills**: new shared `.status-pill` class (height, padding, icon
  gap, radius all fixed; only color/background come from inline style) used
  by the Budget category "Tracked"/"Not tracked" toggle and Household's
  "Track in Bills" toggle. `.status-pill-fixed` adds a `min-width` so
  "Tracked" vs "Not tracked" don't resize the button when toggled (relaxes
  to `min-width:0` under 400px).
- **Transaction/category rows**: `.cat-row-meta` and the expense-log row
  (`renderTxRow`, now using new `.tx-row`/`.tx-row-main`/`.tx-row-amount`/
  `.tx-row-actions` classes) both got explicit `flex-shrink:0` protection on
  amount/status/dropdown/delete, with the name/note column as the only thing
  that shrinks and ellipsizes — under 768px, `.cat-row-meta` now wraps
  (status pill + dropdown + delete drop to their own right-aligned line
  instead of clipping).
- **Grid overflow**: every fixed-pixel `minmax(Npx,1fr)` grid track (goal
  squares, MP2/TD/Gold holding cards, quick-rate tiles, Household expense
  tiles) changed to `minmax(min(Npx,100%),1fr)` so no grid track can force
  horizontal page scroll on a viewport narrower than its stated minimum.
- **Home card headers**: `homeCardStyle()`'s default padding unified to
  `16` (was `18`; per-card overrides of `14`/`16` on Portfolio/Savings &
  Investing/Tracked Spending/Goals removed) and every Home card header's
  `marginBottom` unified to `10` (was `6`/`8`/`10` depending on card) —
  all five Home dashboard cards now share identical header spacing.
- **Bug caught mid-pass**: the header's "Save to Cloud (n)" pill had no
  `white-space:nowrap`, so on narrow viewports its text wrapped inside the
  pill shape into an illegible blob instead of the button growing. Fixed
  (`whiteSpace:"nowrap"`, `flexShrink:0` on the button; `flexWrap:"wrap"` on
  its parent icon row so the row breaks cleanly instead).
- `sw.js` `CACHE_VERSION` bumped to `v23`.

### Pixel-perfect consistency audit (follow-up, same day)
Audited border-radius/shadow/opacity usage across every card-like component
for value consistency (not layout). Reported three findings, all approved
and fixed:
1. **Bank cards** (`BanksView`'s `Card` + its "Add account" tile) used
   `borderRadius:18`/`neu(18)` — every other top-level card in the app uses
   `neu(16)`. Changed both to `neu(16)`.
2. **`HouseholdView`, `BillsView`, `CurrencyView`** each hand-rolled a local
   `card` style object with a flatter shadow (`6px 6px 13px` /
   `-6px -6px 13px`) instead of reusing the shared `neu(16)` helper (which
   uses `7px 7px 15px` / `-7px -7px 15px`) — same radius, visibly shallower
   shadow than every other tab. All three now do `const card=neu(16);`.
3. **Delete/trash `IconButton` opacity** was inconsistent across ~17 call
   sites (`.5`/`.55`/`.6`/`.65`, no semantic pattern — e.g. group-delete was
   `.6`, category-delete was `.65`, sub-item-delete was `.55`). Standardized
   all of them to `.5`.
- `sw.js` `CACHE_VERSION` bumped again to `v24`.

### Verified
Live smoke test in a sandboxed copy (dummy `SYNC_TOKEN`, served via a small
Node static server on a scratch port — **`python3`/`python` are not usable
in this environment**, see Testing note below) plus a same-origin `<iframe>`
sized to 375×812 to force real mobile-breakpoint CSS (the browser
automation's `resize_window` tool does not shrink the actual rendered
viewport here — same limitation noted in earlier sessions below). Confirmed:
segmented control holds a fixed width across all three profiles with a
smoothly sliding indicator; FAB never overlaps the last Budget-tab card
(measured via `getBoundingClientRect()` — no horizontal or vertical overlap
with the "Add group" button); Budget category rows wrap status pill/dropdown/
delete onto their own line with nothing clipped at 375px width; header
"Save to Cloud" pill no longer wraps into a blob. No console errors at any
point. Did not re-verify the three pixel-audit fixes in-browser (simple,
low-risk value substitutions with no structural change).

### Known limitations
- The Home Hero card's title ("Net worth · {label}") ellipsizes rather than
  wrapping under ~360px viewport width when the profile label is long
  (e.g. "Household") — acceptable trade-off to keep the header a fixed
  height, but cosmetically the truncated text can read a little abrupt
  (`"Net worth :…"`). Not revisited.
- Did not do a full line-by-line pass over every remaining tab (Investments
  holding cards, Targets, MP2/TD modals) for the same class of spacing/
  padding nitpicks — the audit targeted radius/shadow/opacity specifically,
  not an exhaustive spacing sweep. A good candidate for a follow-up if more
  polish is wanted.

### Testing note for future sessions
`python3`/`python` resolve to a non-functional Windows Store alias stub in
this environment's shell (`Bash`/`PowerShell` tools) — `python3 -m
http.server` silently fails or serves stale/empty content. **Use Node
instead** (`node -e "..."` a small `http.createServer` script, confirmed
working) to serve a sandboxed test copy of `index.html`. Also: background
processes started with a trailing `&` inside a single `Bash` call do not
reliably survive past that tool call in this environment — use the `Bash`
tool's own `run_in_background:true` parameter instead, not shell-level
backgrounding.

## Phase — Household Bills + mobile usability pass (2026-07-28)

Implemented per the roadmap brief: a lightweight Bills module built on top
of the existing Household budget (no independent bill setup, no Expenses
integration), plus a mobile-usability pass focused on the accidental-tap
risk from cramped adjacent icon buttons.

### Household Bills
- **`household.expenses` items gained `trackInBills` (bool, default
  `false`)**. Household stays the single source of truth for what a bill
  *is* — the Bills tab only shows items with this flag on, and only
  Household can rename/re-amount/delete the underlying item.
- **New top-level collections** (`defaultData()`/`migrate()`, `index.html`):
  `data.bills` (one snapshot record per tracked item per calendar month —
  `id, monthKey, itemId, itemName, allocated, paid, paymentDate, status,
  createdAt, updatedAt, deletedAt`), `data.billAdjustments` (append-only
  Bills Reserve audit log — `prevBalance, newBalance, amount, date, note`),
  `data.billsSettings.openingReserve` (scalar baseline).
- **Monthly generation is lazy, not a scheduled job**: a `useEffect` in
  `App()` (keyed off the tracked-items set + current month) creates any
  missing current-month `bills` records the next time the app is open —
  idempotent, never touches prior months, never re-derives from a live
  Household amount after the snapshot is taken (so later Household edits
  don't retroactively change history).
- **Bills Reserve** = `computeBillsReserve(data)` (pure top-level function,
  usable from render and from inside `setData` updaters): opening baseline
  + Σ(allocated−paid) over all `bills` + Σ(amount) over all
  `billAdjustments`. "Adjust Bills Reserve" (a sheet on the Bills page)
  lets the user type a corrected balance; the delta is what's actually
  logged to `billAdjustments`, never a silent overwrite. The opening
  reserve itself is a small inline-editable field, not adjustment-logged
  (it's the one-time/rare baseline, not a correction).
- **`BillsView`**: reserve card + adjust action, a month navigator (prev/
  next over every `monthKey` that has records, always includes the current
  month even if empty), a 3-tile month summary (Allocated/Paid/Difference),
  per-bill cards (Paid amount input, Payment Date, Unpaid/Paid status chip
  — marking Paid auto-fills today's date if none is set), and a collapsible
  Bills Reserve history list.
- **Sync**: `bills`/`billAdjustments` wired into `tryAutoMergeAll`
  (`mergeArrayById`), `fingerprint()` canonicalization, and
  `CONFLICT_COLLECTIONS` — same id-keyed soft-delete pattern as
  banks/goals/investments, so they get conflict-diff and Recently-Deleted
  support for free.
- New tab: `["bills","Bills",I.PiggyBank]` in `TABS`/`TAB_ORDER`, between
  Household and Banks.

### Mobile usability
- **Root cause fixed**: across Household and Budget, delete buttons were
  `IconButton`s with `padding:0,minWidth:0,minHeight:0` sitting 2px away
  from other controls — shrinking the real tap target to the bare glyph.
  `IconButton`'s own default grew `32→40px`; the worst offenders (Budget
  category/sub/group delete, Household expense delete) now go through a
  new shared `ConfirmDialog` (two big buttons, Cancel/Delete) instead of
  firing on the first tap, and the Household/Budget "track" toggle is now
  a labeled pill (`"Tracked"`/`"Not tracked"`) instead of a bare icon —
  no longer visually or spatially confusable with the delete action next
  to it.
- Bumped `.cat-row-actions` gap `2px→8px` and `.sub-row-meta` gap
  `8px→10px` so adjacent controls have real breathing room.
- Extended the same `minWidth:32,minHeight:32` (up from `0,0`) fix to the
  dozen other inline "Delete X" `IconButton`s that had the identical
  shrink-to-glyph pattern across Banks/Investments/Goals/MP2 rates/
  snapshots/transactions (did **not** add confirm dialogs to all of these
  — out of scope for this phase; the touch-target fix alone meaningfully
  reduces accidental taps there).
- FAB (56×56), iOS zoom-prevention media query, and dialog/sheet shell
  CSS were already compliant — left untouched.
- `sw.js` `CACHE_VERSION` bumped to `v19`.

### Verified
Live smoke test in a sandboxed copy (dummy `SYNC_TOKEN`, local static
server): Bills tab auto-generated the seeded `trackInBills:true` item
("Utilities") for the current month with the correct allocated snapshot;
marking Paid auto-filled today's date; entering a paid amount recomputed
Total Paid/Monthly Difference/Bills Reserve correctly (400 allocated − 320
paid → reserve 80); "Adjust Bills Reserve" (80→150) produced a correctly
computed `+70` history entry; Household's per-row delete and Budget's
category delete both now route through `ConfirmDialog` with correct,
item-specific copy, and Cancel leaves data untouched. No console errors
at any point. One caught-and-fixed issue during this pass: a duplicate
top-level `const monthKeyOf` (a pre-existing helper at the snapshot-
retention call site, unrelated to Bills) collided with a same-named
helper this phase added, which is a `SyntaxError` under strict-mode
`const` redeclaration and silently blanked the entire app (Babel threw,
`#loading` was already removed, `#root` never mounted, zero console
output) — renamed the new one to `billMonthKeyOf`. Worth remembering:
this app's boot sequence gives no visible/console signal on a parse
error, so a full in-browser reload-and-screenshot check is the only way
to catch this class of bug.

### Known limitations
- Monthly bill generation happens on next app-open, not exactly "midnight
  on the 1st" — acceptable for a personal app with no background jobs;
  if the app isn't opened for the current month yet, the Bills list is
  simply empty until it is.
- Only the highest-risk delete buttons (Budget category/sub/group,
  Household expense) got the new `ConfirmDialog` treatment. Banks/
  Investments/Goals/MP2/snapshots/transactions delete buttons got the
  touch-target-size fix only, not a confirm step — a good candidate for
  a focused follow-up if accidental deletes keep happening there.
- No Home Dashboard card for Bills Reserve yet (explicitly deferred to a
  future phase per the brief).

## Bug fix — Household expenses resurrecting after delete + sync (2026-07-28)

**Symptom reported by user**: deleting a duplicate/unwanted Household shared
expense and syncing made it disappear, but a subsequent refresh or "Pull
from Cloud" brought it back.

**Root cause**: `removeExpense` (household shared-expense delete, in `App()`
near `hh`/`setSplit`) hard-spliced the record out of `data.household.
expenses` instead of soft-deleting it (`deletedAt` tombstone), which every
other collection in this app relies on for merge safety (see the comment
above `mergeArrayById`). Since a hard delete leaves no trace that a record
was ever removed, `mergeArrayById(local, remote)` — used to reconcile
`household.expenses` on pull/reconcile — saw "local doesn't have this id,
remote does" and unioned the remote's stale copy right back in. Confirmed
the exact mechanism with a standalone repro of `mergeArrayById` before/after
the fix (soft-deleted local record correctly stays deleted after merging
against a remote copy that still has it; a hard-deleted local record gets
resurrected) — see git history / session transcript for the repro script.

**Fix** (`index.html`, household section of `App()`):
- `removeExpense` now sets `deletedAt`+`updatedAt` instead of filtering the
  record out.
- `addExpense`/`updateExpense` now stamp `updatedAt` too (previously never
  set — needed for `mergeArrayById`'s newest-wins comparison to work
  correctly on ordinary edits, not just deletes).
- The `hh` object handed to `HouseholdView` filters `!e.deletedAt` at
  construction (mirrors the `expenses` pattern used for the main transaction
  log), so the read side never sees tombstones — the mutators still operate
  on the unfiltered `data.household.expenses` so tombstones stay in the
  synced array.
- `purgeOldTombstones` now also prunes household expense tombstones older
  than the retention window, matching every other collection (previously
  omitted household entirely).
- Bumped `sw.js` `CACHE_VERSION` to v18.

**Verified**: standalone Node repro of the merge logic (confirms the fix
prevents resurrection); live smoke test in a sandboxed copy — deleted a
Household expense, inspected `localStorage` directly, confirmed the record
is now `{..., deletedAt, updatedAt}` rather than removed from the array.
Did not have live Cloudflare KV credentials to test an actual two-device
pull round-trip in this session; the fix follows the identical pattern
already proven correct for `expenses`/`goals`/`investments`/etc., so risk is
low, but a real pull-from-cloud check on the user's own data is worth doing
once deployed.

## Phase 5 — UX/UI/a11y/perf polish pass

Audited the whole app against 17 categories (consistency, components,
responsiveness, animations, loading/empty states, forms, search, perf, code
quality, a11y, dashboard, settings, error handling, microinteractions) and
implemented the Critical + High + structural-Medium findings, per user
approval. No new features, no workflow redesigns.

- **Crash safety**: added a top-level `ErrorBoundary` around `<App/>` with a
  recovery screen ("Reload app") instead of the boot spinner silently
  vanishing into a blank page on an uncaught render error.
- **Accessibility — icon buttons**: added a shared `IconButton` component
  (forces `aria-label`) and migrated ~35 icon-only buttons app-wide (dialog
  close buttons, delete/edit row actions, theme toggle, settings gear, sync
  buttons, Goals "details" button) to it. `Ic()` (the SVG icon factory) now
  sets `aria-hidden="true"` by default so decorative icons stop being
  double-announced once their button has a real label.
  Also added `aria-pressed`/`aria-expanded` to toggle-style icon buttons
  (category tracking toggle, sub-items expander, account-settings gear).
- **Accessibility — dialogs**: every `.sheet-bg`/`.sheet` dialog (~22 of
  them — `QuickActionSheet`, `GoalContributionSheet`, add/edit transaction,
  reorder, plan picker, quick transfer, extra funds, trade/MP2/TD modals,
  goal type/add/detail sheets, targets picker, `ConflictModal`,
  `PendingChangesModal`, `RecentlyDeletedModal`, `ProfilePickerModal`,
  `SettingsModal`) now gets `role="dialog"`/`aria-modal`, initial focus, and
  Escape-to-close via one new shared hook, `useDialogA11y(onClose, active)`
  (next to `useScrollLock` — same file, same pattern). `ConflictModal` (which
  forces a choice, no dismiss) passes `null` for `onClose` so Escape is a
  no-op there, as intended.
- **Accessibility — segmented/toggle controls**: added `role="tab"`/
  `aria-selected` to the main tab bar, `aria-pressed` to `HistoryRangeChart`'s
  range pills, `HomeProfileToggle`, the shared Me/Wife owner-selector
  button, and the Settings card-visibility/category-chip toggle buttons —
  these previously indicated "selected" by color alone.
- **Performance**: `renderTxRow` (transaction log) no longer calls
  `bucketKeyFor`+`planForMonth` once per row — both call sites now resolve
  the bucket's plan once per group and pass it in.
- **Theming bug**: the undo toast hardcoded raw hex colors instead of `P.*`
  tokens (only worked by coincidence in both themes since `P.deep` happens
  to be dark in both palettes) — now uses `P.deep`/`P.grD` properly.
- **Structural — shared currency formatter**: added one `formatMoney(n,
  {code, symbol, decimals})` helper; `fmt`/`sar`/`usd`/`money` (6+ previously
  independent implementations across `BanksView`, `InvestmentsView`,
  `Mp2AccountCard`, `TdAccountCard`, `GoldAccountCard`, `CurrencyView`, plus
  an inline one for `TargetsView`) are now thin wrappers around it.
- **Structural — neumorphic/glass styling**: removed duplicate local
  `neu()`/`neuInset()`/`glassPanel()` re-declarations in `BudgetView` and
  `ExpenseTrackerView` (byte-identical to the global versions already
  defined once near `Ic()`) — both views now use the shared globals. Also
  removed an unused local `card` const in `BudgetView`.
- **Icon sweep**: replaced emoji-as-icon usages that sit in JSX (not deep in
  plain-string contexts) with the existing `I.*` SVG set — the 📋
  "carry-forward/custom plan" banners (Budget tab) and the sync-status list
  in Settings (✅/⚠️/📴/❌/⬆️ → `I.Check`/`I.Cloud`/`I.EyeOff`/`I.X`/
  `I.ArrowUp`). Added one new icon, `I.MoreHorizontal`, to replace the "⋯"
  text glyph on the Goals "details" button. Left the ▲/▼ gain/loss
  indicators and the 🎉 goals-complete celebration alone — they're
  interpolated into plain JS strings (tooltip text, computed `stat()`
  values) across ~10 call sites, not JSX children, so swapping them for SVG
  components would mean restructuring several small pure functions for
  marginal visual benefit; judged not worth the risk in a polish-only phase.
- Bumped `sw.js` `CACHE_VERSION` to v17.
- **Verified**: the extracted script block parses/transforms cleanly under
  `@babel/preset-react` (full-file syntax check). Also smoke-tested live in
  a sandbox copy (dummy `SYNC_TOKEN`, local static server): Home, Investments
  (delete-holding/delete-trade IconButtons show correct names in the a11y
  tree, MP2 rates modal open/Escape-close), Settings modal (open/Escape-
  close), Goals detail modal via the new `I.MoreHorizontal` button — no
  console errors or React warnings beyond the pre-existing in-browser-Babel
  notice.
- **Deliberately not done** (Medium/Low items from the audit, out of this
  approved scope): non-structural Medium items (chip/pill component
  unification, math-expression input hint text, inverted-date-range hard
  block, TD/MP2/Gold empty-state copy, Settings section grouping, Net Worth
  composition bar not showing liabilities) and all Low items (dead CSS,
  minor copy/timing inconsistencies). Good candidates for a follow-up pass.

## Phase 4 — Home Dashboard redesign

Redesigned the Home tab only (`HomeView` and its card components in
`index.html`); no investment/valuation math changed.

- **Removed** `AssetAllocationCard` (the donut) entirely.
- **Added** `SavingsInvestingCard` — circular Savings Rate ring + horizontal
  Saved-vs-Invested bar, computed by the new `savingsInvestingFor()` (module
  scope, alongside `trackedSpendingFor()`). Deliberately **not**
  Income-minus-Expenses: it sums actual `expenses` rows logged this bucket
  against budget categories the user has tagged as "savings" or "investment"
  in Settings (`data.homeSettings.{savingsCategories,investmentCategories}`,
  matched by category **name**, not id, since cloning a plan into a new
  month gives categories fresh ids). This is a separate concept from the
  pre-existing per-owner "Invest & Grow" *group*-based target in BudgetView
  (`data.investTarget`) — the two are not reconciled and can disagree.
- **Every Home card now navigates**: Hero → Net Worth, Portfolio →
  Investments, Savings & Investing → Expenses (filtered), Tracked Spending →
  Expenses, Goals → Goals. Filtering into Expenses is a one-shot
  `{catNames,nonce}` request (`expensesFilterRequest` state in `App()`) that
  `ExpenseTrackerView` resolves to this month's actual category ids and
  applies to its existing single-select `filterCat` (now also accepts an
  array) — Expenses' own UI/logic was not otherwise touched.
- **New Settings**: Savings & Investing card currency, Savings/Investment
  category pickers (multi-select over the union of category names across
  both owners' plans), and a Home card visibility toggle per card
  (`data.homeSettings.cardVisibility`). No drag-to-reorder — the roadmap
  marked ordering optional/lightweight and visibility alone covers the
  practical need.
- **CSS**: `.cell-allocation` renamed to `.cell-savings`, same grid slot/
  column-span rules as the old Asset Allocation card (mobile order stayed
  Hero/Portfolio/Tracked Spending/Savings & Investing/Goals; desktop kept
  Portfolio+Savings on one row, Tracked Spending+Goals on the next).
- Bumped `sw.js` `CACHE_VERSION` to v15.
- Verified in-browser (dummy `SYNC_TOKEN`, served from a local static
  server): desktop card layout/order, category pickers writing to
  `data.homeSettings`, card-visibility toggle, tap-through navigation
  including the Expenses filter drill-down, and Me/Wife/Household profile
  switching (Savings & Investing sums both owners for Household). Did not
  get a real mobile-viewport screenshot this session (window resize tool
  didn't shrink the actual rendered viewport in this environment) — the
  mobile breakpoint rules are unchanged from the prior working layout aside
  from the renamed class, so risk is low, but treat as unverified.

### Mobile-layout risk follow-up (2026-07-28, later session)
Re-attempted a live mobile-viewport screenshot to close out the risk noted
above and in Phase 3. Confirmed the browser automation's `resize_window`
tool still does not change the actual rendered viewport in this environment
(`window.innerWidth` stayed at the full desktop width — 1897px — no matter
what dimensions were requested; this is an environment limitation, not
something fixable from within the app). Since a live screenshot isn't
obtainable here, did a static audit instead: confirmed `.cell-savings` and
sibling `.cell-*` rules under `@media(max-width:768px)` mirror the pre-
existing (previously mobile-tested) `.cell-allocation` rules exactly aside
from the rename; confirmed `HistoryRangeChart` uses `width:"100%"` +
Recharts' `ResponsiveContainer` (no fixed pixel widths) and its range-pill
row uses `flexWrap:"wrap"`; confirmed `GoldAccountCard`'s field rows also
use `flexWrap:"wrap"` and its fixed-width inputs (90/100px) match the exact
pattern `TdAccountCard` already uses for its principal field (line 6635) —
not a new risk, just following precedent. Net: still not a substitute for
an eyes-on mobile screenshot, but the code-level risk is now confirmed low
rather than assumed low. If a future session has a working device-emulation
path (real phone, or a browser automation environment where viewport resize
actually works), that's the way to fully close this out.

### Known limitations
- Goals card still has no "nearest target date" (the roadmap asked for one,
  but the goal schema has no date field, and adding one would mean touching
  the Goals tab, which is out of scope for this phase).
- No card drag-to-reorder, only show/hide.
- Savings/Investment category matching is by name and is Budget-plan-scoped
  per owner; a category that exists for "me" but not "wife" (or that was
  renamed) silently drops out of that owner's rollup for the month it's
  missing.

## What this session did

Implemented **Phase 3**: Gold Investment Accounts (physical bars/coins,
priced off a live spot quote) and a new historical snapshot system powering
range-selectable Portfolio/Net Worth trend charts, on top of Phase 1/2's
architecture (owner/type-tagged Investment Accounts; MP2/TD valuation).

### Done — Gold
- **Gold account fields**: name, owner, currency, weight, unit (grams/troy
  ounces), purity (24K / 22K / custom karat), purchase date, purchase cost,
  notes. Added to `INVESTMENT_TYPES`/`NEW_INV_BY_TYPE`/`migrate()` alongside
  stocks/MP2/TD.
- **Gold valuation** (`goldValuation()`): weight → troy ounces (÷31.1034768
  for grams) × karat/24 purity fraction × live USD/oz spot price = current
  value; purchase cost (in the account's own currency) converted to USD for
  a purchase-value/gain/gain% comparison. Shows purchase value, current
  estimated value, unrealized gain/loss, gain %, and a last-updated
  timestamp (from the same refresh cycle as stock quotes).
- **Price source**: reuses the *existing* Cloudflare Worker → Yahoo Finance
  proxy — no new API, no new key, no key exposed client-side. Ticker is
  `GC=F` (COMEX gold futures — the standard Yahoo proxy for spot gold;
  `XAUUSD=X` was tried first but Yahoo's chart endpoint returns no data for
  it, confirmed by direct testing against the deployed Worker). Rides the
  same `fetchQuotes()`/`livePrice` cache as stocks, so a failed refresh
  never clears the last-known price (pre-existing guarantee, inherited for
  free).
- **Refresh integration**: gold ticker is added to both the automatic
  staleness-refresh (`refreshMarketDataIfStale`, gated by the new
  `settings.goldAutoRefresh` toggle, default on) and the manual "Refresh
  prices" button in Investments (always includes gold regardless of the
  toggle — manual means manual).
- **Portfolio/Net Worth integration**: priced through the same
  `investmentValueSar()` dispatch as every other type (new `gold` branch) —
  automatically included in Net Worth, Home's Investments card, Asset
  Allocation, and `InvestmentsView`'s hero total/breakdown line, respecting
  ownership (Me/Wife/Household) exactly like MP2/TD.
- **Validation**: inline (soft) validation — weight/purchase cost must be
  >0, karat must be 1–24 — shown as red text/red input borders, consistent
  with this app's existing no-hard-blocking-validation convention (no other
  investment type blocks saving either).

### Done — Historical snapshots + range charts
- **`data.snapshots`**: a new array, one row per **{date, profile}** per
  calendar day (profile ∈ `"me"`/`"wife"`/`"household"`), holding Net Worth,
  Portfolio (SAR-denominated, same canonical unit as `investmentValueSar`),
  and a per-type breakdown (`byType: {stocks,mp2,td,gold}`). Captured
  automatically (debounced, ~1.5s after balances settle) by a new effect in
  `App()`; **updates today's row in place** rather than duplicating if
  values change again the same day.
- **Progressive retention** (`compressSnapshots()`): every day for the most
  recent `settings.snapshotRetention.dailyDays` (default 35, user-adjustable
  14/35/60/90 in Settings), then one (latest) snapshot per ISO week for the
  next `weeklyDays` (365, fixed), then one per calendar month forever beyond
  that — run per-profile, on every write, so storage never grows unbounded.
- **Range-selectable chart** (`HistoryRangeChart`): one shared component (not
  two parallel ones) used by both the Net Worth tab ("Net worth trend") and
  the Investments tab ("Portfolio trend"), each just pointing it at a
  different `field` (`net` vs `investments`). Ranges: 1W/1M/3M/1Y (daily/
  weekly bucketing per spec) and MAX (monthly). Bucketing + selection is a
  pure, memoized function (`bucketSnapshotsForRange`) — derived chart points
  are never written back to `data`, only raw snapshots persist.
- **Home Portfolio card**: now plots a real per-profile mini trend (off
  `data.snapshots`, not the old whole-portfolio-only `portHistory`) under
  **all three** profiles (Me/Wife/Household), not just Household — falls
  back to "current value only" until 2+ days of history exist, staying
  compact either way (no range selector on Home, that's on the full tabs).
- **Left the pre-existing `history`/`portHistory` (monthly, manual-entry-
  friendly) arrays completely alone** — new snapshot system is additive, not
  a replacement, so the existing manual "Add past entry" table and MoM-%
  stat on Hero keep working exactly as before.
- **Sync**: `data.snapshots` merges via the existing `mergeKeyed()` (keyed
  by `date|profile`, same pattern as `history`/`portHistory`), covered by
  `fingerprint()`'s canonicalization.
- **Settings**: "Automatically refresh gold price" (on by default) and
  "Detailed (daily) snapshot history" retention-days picker (35 default).
- `sw.js` `CACHE_VERSION` bumped `v13` → `v14`.

### Verified (manually, in a browser sandbox — see decisions.md testing methodology)
- Added a Gold account (100g, 24K, $7,000 purchase cost) → after "Refresh
  prices", spot price ($4,025/oz that session) produced a current value of
  $12,941 (100g ÷ 31.1034768 × $4,025 = $12,940.66, rounds to $12,941) and a
  gain of $5,941 (84.9%) — hand-computed match. Switching purity to 22K
  recalculated to $11,862 (12,941 × 22/24 = 11,862.6) with no other field
  touched, confirming the karat-fraction math live.
- Confirmed via direct `fetch()` against the deployed Worker that
  `XAUUSD=X` returns an empty quote object while `GC=F` returns a live
  price — this is why `GOLD_TICKER` is `GC=F`, not the originally-assumed
  `XAUUSD=X`.
- Home page Investments card, Net Worth figure, and Asset Allocation donut
  all increased by exactly the gold value once refreshed — no double count,
  ownership (`owner:"me"`) correctly excluded gold from the "wife" profile.
- Inspected `localStorage` directly after multiple interactions across
  Home/Investments/Net Worth tabs: exactly **one** snapshot row per profile
  per day existed (not one per interaction) — `updatedAt` changed on
  subsequent writes, confirming the "update today's row, don't duplicate"
  behavior works.
- Range-chart pill rows (1W/1M/3M/1Y/MAX) render on both Net Worth and
  Investments tabs with correct empty-state copy before 2+ days of history
  exist.
- No console errors at any point across Home/Investments/Net Worth/Settings.

## Gold breakdown chart + app.jsx removal (2026-07-28, later session)
- **Added "Gold value over time"** to the Investments tab (below "Portfolio
  trend"), reusing `HistoryRangeChart` rather than a new chart. The
  component gained dot-path field support (`getField`-style split-on-"."
  reduce) so `field="byType.gold"` can reach into the nested per-type
  breakdown already captured by Phase 3's snapshot system — `net` and
  `investments` (top-level fields) still work unchanged. Card is gated on
  `goldInvs.length>0`, same condition the existing "Gold $…" hero line uses.
- **Removed `app.jsx`**, the stale unused duplicate flagged since Phase 1.
  Updated `CLAUDE.md` to drop the "don't edit app.jsx" warning since the
  file no longer exists.
- Bumped `sw.js` `CACHE_VERSION` to v16.
- Verified in a sandbox copy (dummy `SYNC_TOKEN`, local static server): no
  console errors on load; added a Gold account and confirmed the new chart
  card appears (with correct "not enough history" empty state) only once a
  Gold holding exists; confirmed `snapshot.byType.gold` is populated
  correctly in `localStorage`.

## Known bugs / limitations / deferred work
- **MP2 dividend model remains an annual-bucket approximation** (unchanged
  from Phase 2 — see prior note, still accurate).
- **Gold jewellery, commodity trading, and any other investment type are
  explicitly out of scope**, per this phase's brief — do not add without a
  separate design conversation.
- **Snapshot retention weekly window (365 days) is not user-configurable**
  — only the daily-resolution window is exposed in Settings; the weekly→
  monthly cutover is a fixed default. Revisit if there's real demand.
- **Mobile-viewport rendering of the new range chart/Gold card was not
  independently re-verified this session** (browser automation's window-
  resize didn't reliably change the captured viewport) — both reuse the
  same responsive flex/grid patterns as the rest of the app, which is
  already mobile-tested, but treat this as unconfirmed rather than verified.
- ~~`app.jsx` is still the stale, unused duplicate flagged in Phase 1~~ —
  removed 2026-07-28 (see roadmap.md "Cleanup").

## New reusable helpers (index.html)

| Name | Location | Purpose |
|---|---|---|
| `goldValuation(hld, priceUsdPerOz, convert)` | near `tdValuation()` | Weight/unit/karat → troy ounces × purity × spot price = current value; also purchase-value/gain/gain% off `purchaseCost`. |
| `goldWeightOz(hld)` / `goldKaratFraction(hld)` | same area | Unit conversion (g→troy oz) and karat→0–1 fraction, factored out of `goldValuation` for reuse/testability. |
| `investmentBreakdownSar(list)` | inside `App()`, near `investmentValueSar` | Per-type SAR totals (`{stocks,mp2,td,gold}`) for one owner's investments — feeds snapshot capture. |
| `compressSnapshots(snaps, retention)` | top-level, near `mergeKeyed` | Progressive daily→weekly→monthly retention, per profile. |
| `bucketSnapshotsForRange(sorted, range)` | same area | Pure bucketing/downsampling for the 1W/1M/3M/1Y/MAX chart ranges — takes the last snapshot per bucket, never averages. |
| `isoWeekKey` / `monthKeyOf` / `addDaysStr` | same area | Small date-bucketing primitives shared by the two functions above. |
| `HistoryRangeChart` (component) | near `Sparkline` | Shared range-selectable chart, used by both Net Worth and Investments tabs. |
| `GoldAccountCard` (component) | near `TdAccountCard` | Gold account form + summary card, same visual pattern as MP2/TD cards. |

Any future phase should keep extending `investmentValueSar()`'s per-type
dispatch (not a parallel reduce) and, for anything chart-related, reuse
`HistoryRangeChart`/`bucketSnapshotsForRange` rather than a third bespoke
chart implementation.

## Assumptions made this session
- Gold purity is entered as **karat** (24 = pure/24K, 22 = 22K, or any
  custom number 1–24 the user types), converted to a 0–1 fraction only
  inside `goldValuation()` — matches how gold is actually quoted/sold, not
  a raw percentage/fraction input.
- "Current estimated value" for gold has no user-confirmable "actual sale
  price" step like TD's maturity confirmation — physical gold has no
  analogous event, so it's always the live-spot-price estimate (or the
  last cached price if a refresh has never succeeded/is stale).
- Snapshot `date` is the **device's local calendar date** (`toISOString().
  slice(0,10)`, which is UTC-based) — a device near a UTC day boundary could
  in principle capture "today" a few hours off from its true local midnight;
  not addressed, consistent with how `history`/`portHistory` already key by
  UTC month.

---

## 2026-07-31 — Carry-forward chain, transaction order, pay periods in Settings

Build `2026.07.31.0011` / v1.15.0.

### Implemented

**Budget: carry-forward chain + silent copy-on-write**
- `resolvePlanForMonth()` (module scope, pure) resolves a bucket to the nearest
  *preceding* `monthlyPlans` mapping for that owner, falling back to
  `activePlanId` only when nothing precedes it. Returns
  `{plan,fromMonth,exact,source}`; `planForMonth` keeps its old signature and
  `planSourceForMonth` exposes the whole result for the banners.
- `clonePlanRecord()` split out of `clonePlanForMonth` as a pure record builder.
- `editPlanForMonth(mo,owner,label,mutate)` is the single choke point all
  budget mutators go through, materialising a copy on first real change in one
  `setData` with a no-op guard. `patchPlanById`/`setCatsFor`/`setGrpsFor` are
  deleted; `ExpenseTrackerView.moveCat` routes through it too.
- Every month is editable; the "+ Create copy" CTA and the locked preview panel
  are gone. Banners read *Custom plan for X* / *Carried forward from Y* /
  *Base plan*. Copy-source pickers are anchored on the viewed month and reach
  ±(12,3) months, so a future month can be a source.

**Expenses: entry order + per-day manual reorder**
- New `createdAt` (write-once) and optional `ord` fields; `migrate()` backfills
  `createdAt` from `updatedAt` and never invents an `ord`.
- One `compareTxForDisplay()` used by both list sites.
- Day sub-headers inside each period card (weekday label, day total, reorder
  affordance when >1 row); rows no longer repeat the date.
- Reorder modal (up/down arrows, mirrors the category reorder modal) editing
  local state and committing once via `setExpenseDayOrder`.

**Pay periods**
- `PayPeriodCard` deleted from Home along with its cell and CSS.
- `PERIOD_PENDING` deleted; `periodRange` is now clock-independent.
- Settings → Pay periods per owner: tracking toggle (with a re-bucket-count
  ConfirmDialog both directions), payday (clearing stale corrections when it
  changes), current + next period with range and day count, change/clear, and a
  list of active corrections.
- `useScrollLock` is refcounted, so the date sheet and ConfirmDialog can nest
  inside the Settings modal without releasing the body lock.

### Verified

- `parsecheck.cjs` clean. All runners pass: `trendtest` 14, `billstest` 11/11,
  `banktest` 25/25, `periodtest` 24/24, `txordertest` 17/17 (new, committed),
  `budgettest` 35/35 (extended with `resolvePlanForMonth` + `editPlanForMonth`
  sections).
- Browser pass on a sandboxed copy (dummy `SYNC_TOKEN`, fresh port, clean
  `defaultData()`): paging back 3 months wrote nothing; re-typing an identical
  income wrote nothing; a real edit to April created exactly one plan + one
  mapping with the edit applied and the base untouched; May/June then read
  *Carried forward from April 2026* while March stayed on *Base plan*.
  Same-day transactions sorted newest-entered-first; reorder committed once and
  survived reload; a newly added transaction landed on top of a reordered day;
  re-dating a row dropped its `ord` and moved it under the *Yesterday* header.
  Settings correctly produced Jul 30 – Aug 31 · 33 days with "started 2 days
  early" for a payday-1 owner, and Home showed no pay-period card.

### Known gaps / follow-ups

- **Historical Home figures shift once** on first load after this build:
  `bucketHistoryFor` reads past buckets through `planForMonth`, and unplanned
  past months now resolve to the nearest preceding plan instead of the base
  plan. This is the drift being corrected, not a regression — but it is a
  visible one-time change.
- Enabling pay-period tracking for an owner with history re-buckets all of
  their past expenses. The confirm dialog states this; `monthlyPlans` keys are
  deliberately *not* rewritten on toggle, so the switch stays reversible.
- `moveCat` in the Expenses tab is the main accidental-materialisation surface
  left: reordering envelopes while browsing a carried-forward month is a real
  edit and will create a plan for that month. The banner flipping to "Custom
  plan" is the only feedback.
- Manual reorder is within one day only, by design. There is still no drag
  gesture anywhere in the app.
