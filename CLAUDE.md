# WheredItGo — project conventions

Personal salary/budget/net-worth/investment planner. Single-page app, no
build step: React + Recharts + Babel loaded from CDN, JSX compiled in-browser.

## Where the code actually lives

- **`index.html`** is the entire live app (~8.2k lines, one big
  `<script type="text/babel">` block). Every feature — Home, Budget, Banks,
  Investments, Net Worth, Goals, etc. — is defined here.
- **`sw.js`** is a PWA service worker caching the app shell (`index.html` +
  CDN scripts). **Bump `BUILD_ID` any time `index.html` or `APP_SHELL`
  changes**, or returning users stay stuck on the old cached copy. `BUILD_ID`
  lives in *three* places that must always match: `sw.js` (it forms the cache
  name), `APP_VERSION`/`BUILD_ID` in `index.html`, and `version.json` (the
  update-check endpoint). Bump all three together. (This replaced the older
  `CACHE_VERSION` constant — older doc entries below still say `CACHE_VERSION`.)
- **`worker.js`** is a separate Cloudflare Worker — the store/retrieve proxy
  behind the app's cloud sync. It's schema-agnostic (stores whatever JSON blob
  the client sends) — changes to the data model inside `data` (plans,
  investments, banks, etc.) do **not** require touching `worker.js`. Only touch
  it if the sync *protocol* itself changes (new endpoints, auth,
  request/response shape).
  - Since 2026-08-05 sync lives in a **Durable Object** (`SyncRoom`), not plain
    KV: KV had no compare-and-swap, so the rev check was a race, and the three
    separate puts could tear. The whole document commits under **one** storage
    key — if it ever outgrows the 2 MB per-value ceiling (it's ~126 KB) it needs
    chunking *inside* one write, never a second key written separately.
  - **It is deployed with `npx wrangler deploy`, not the dashboard** — a DO class
    can only be created at deploy time. Editing it in the dashboard editor gets
    overwritten by the next deploy. `wrangler.jsonc` must declare **every**
    binding, because a deploy replaces them; a missing `ALLOC_KV` would silently
    unbind KV. Secrets are not in the config and are not touched by a deploy.
  - It still **mirrors every accepted write back to the three legacy KV keys**,
    purely so a rollback resumes against current data. Remove that only when
    rolling back is off the table.

## Data model conventions

- The whole app state is one `data` object, persisted to `localStorage` and
  optionally to a Cloudflare KV store via `worker.js`. `migrate(d)` is the
  single place that upgrades old saved shapes — **any new field added to an
  existing record type must get a default in `migrate()`**, not just in
  `defaultData()`, or existing users' saved data will be missing it.
- **A fresh device opens EMPTY, not on sample data** (2026-08-07).
  `defaultData()` is now `sampleData(structuralDefaults())`: the first is the
  shape of an empty document (settings, plus one income-0 plan per owner as a
  *skeleton*, so `activePlanId` still resolves and Budget renders its existing
  zero state), the second layers the demo records on. `App`'s `useState`,
  `continueOffline()` and `migrate`'s not-an-object fallback all use
  `structuralDefaults()`; only Settings → "Load sample data" produces the demo
  set. All three functions must stay in one span — `importtest.cjs` and
  `cloudguardtest.cjs` slice `function structuralDefaults(){` →
  `/* Bills Reserve = opening baseline` and would silently test nothing if one
  moved out. See "Connecting a device" below for why this changed.
- Owners: the two named people are stored under fixed keys `"me"` / `"wife"`
  (labels customizable via `data.owners.me`/`.wife` — in this user's data
  they're "Jastine"/"Charlene"). **`"household"` is never a third person.**
  It carries two related meanings, and both are load-bearing:
  - As a **profile** (Home, Banks, Investments, Net Worth) it is a view-only
    pseudo-profile meaning "everything combined", with no literal value
    stored anywhere.
  - As a stored **`owner`** on a record — investments (Phase 1), banks and
    assets/liabilities (2026-08-01) — it means *jointly owned*. Such a record
    appears **only under the combined view**, never in either person's, so
    **me + wife ≠ household** whenever anything is joint. That's the chosen
    semantics; `ownertest.cjs` asserts the inequality on purpose, so don't
    "fix" it into adding up.
  - The two `owner` fallbacks differ and must not be unified: an
    owner-less **investment** reads as `"me"` (predates joint accounts, always
    personal), an owner-less **asset/liability** reads as `"household"`
    (`migrate()` defaults them there rather than guessing a person). The one
    predicate for assets is module-scope `ownerMatch(rec,profile)`.
  - Per-profile net worth goes through **one** helper, `netWorthParts(p)` in
    `App()`; `assetSar`/`liabSar`/`netWorth` are just its household case, and
    the daily snapshot effect must use it for **all five** fields. Writing a
    second per-owner reduce is how assets/liabilities ended up counted on
    every profile's row. See `docs/decisions.md`.
  - The **viewing** profile lives in `localStorage` under `VIEW_PROFILE_KEY`,
    never in `data` — it's a per-device preference, and syncing it would dirty
    the doc and change what the other device is looking at. `data.settings` is
    for toggles that change *calculation*, not *what you're looking at*.
    Budget/Expenses keep their own 2-way `OwnerToggle` (a plan belongs to a
    person) and drive the same value; `budgetOwner` never becomes
    `"household"`, which is what makes the fallback work without extra state.
- Soft-delete pattern: most record arrays use `deletedAt` timestamps rather
  than removing entries outright (for undo support); always filter
  `!x.deletedAt` when reading, never `splice`/filter-out on delete.
- **A budget category's `amount` is a manual figure only while it has no
  sub-items.** The moment `subs.length > 0`, `effectiveAmt` reads the sub sum
  and `amount` is just a cache kept by `syncAmt`. So any code path that changes
  whether a category *has* subs must decide explicitly what happens to the
  money: emptying one leaves a stale sum that resurfaces as a live manual value
  (zero it), and filling an empty one makes its manual amount stop being read
  at all (carry it over as a seeded sub). Currently only "Add sub-item" and
  delete change sub count, and "Add sub-item" knowingly still has the second
  trap — but any *new* such path must decide this explicitly.
- **A plan's categories and groups are records, not array positions**
  (2026-08-05). They carry `deletedAt` (tombstoned, never spliced — a hard
  delete cannot survive a merge, because the other device's copy would
  resurrect it), `updatedAt` (stamped **only when edited**, by
  `stampPlanRecords` inside `editPlanForMonth` — never in `migrate()`, so an
  untouched record stays "oldest"), and `ord` (display order, backfilled once by
  `migrate()` from the old array order). `plans` merges through
  `mergeArrayByIdWithChildren`, so two people editing different categories in
  the same month both survive.
  **Every read goes through `livePlanView(plan)`** — applied inside
  `resolvePlanForMonth` and to the App-level active plan — which filters
  tombstones and sorts by `ord`. It returns the **identical object** when
  there's nothing to do, so render identity doesn't churn; don't "simplify" that
  into always copying. Anything that reorders categories must renumber `ord`
  (see `moveCat`), never rearrange the array: `mergeArrayById` sorts children by
  id, so array order is erased by the first sync — the same rule transactions
  follow.
  Sub-items are `{id,name,amount}` nested in the category, hard-deleted rather
  than tombstoned, and **nothing outside the `subs` array references a sub id**
  — expenses/targets/envelopes key on `catId`, several features key on
  category or group *names*. That's load-bearing; re-check it before storing a
  sub id anywhere.
- **Groups are the fixed frame; categories are what gets reorganised.** The
  user's "categories" are the app's **groups** (Invest & Grow, Essentials, …)
  and their "subcategories" are the app's **category rows** — not the `subs`
  feature, which they barely use. Read any request about moving/reordering
  "categories" at the group→category level first. Budget's multi-select move
  re-parents categories between groups (`moveSelectedTo(destGroupId)`); it is a
  pure `groupId` change, since everything else keys on the category id. The one
  coupling is `investTarget.groupNames`, which keys on group **names**, so a
  move can change the Invest & Grow figure.
- **A month inherits the nearest PRECEDING month's plan, and materialises its
  own on first edit.** `resolvePlanForMonth()` (module scope, pure) walks
  `monthlyPlans` backwards from the viewed bucket, falling back to
  `activePlanId[owner]` only when nothing precedes it — so `activePlanId` is
  now the *root of the chain*, not "the plan the current month edits."
  **Every budget mutation must go through `editPlanForMonth(mo,owner,label,
  mutate)`**, never a by-plan-id setter (those were deleted for exactly this
  reason): it copy-on-writes the inherited plan, folding the clone and the edit
  into ONE `setData`. Two traps if you extend it — a half-materialised month
  (mapping written, edit not) renders as an empty budget for a debounce tick,
  and the **no-op guard is load-bearing** because `NumField` commits even when
  you re-type the same number, so without it merely tapping around a past month
  creates plans. Paging to a month must write nothing.
- **The unaccounted sheet's classifier lives in `reconcilePeriod`** (module
  scope, v1.47.0) — it moved out of a `useMemo` unchanged, and `goaltest` /
  `installmenttest` drive it through there. It is **read-only**: pure, never
  reads the clock, never calls `setData`, and above all **never calls
  `editPlanForMonth`** — viewing a past period must not materialise a plan for
  it. `reconciletest.cjs` case 9 pins that by source sweep, the same way
  `purchasetest.cjs` does for the Advisor.
  Its planned side is where a new defect would hide, so four rules:
  **`trackedSpendingFor(...).budget` must not be reused** (it folds
  `extraFundsMap` into the budget, and extra funds are their own `+` line
  here); a goal-linked untracked category's allocation is **inside** the
  untracked total and so is subtracted from Transfers out, or two lines claim
  it; the installment planned figure reuses `derivedInstallmentRowsFor` with
  the `fundedElsewhere?0:` rule rather than restating it; and money that
  matches no live envelope goes to **`unmatched`**, which exists so the sheet
  can say *what* an excess is instead of asserting an over-transfer.
  A line whose comparison would be meaningless carries **`comparable:false`**
  (Income, Extra funds) — not a planned figure of 0, which would report every
  gift as an overshoot.
- **`isExtraFunds` rows are money coming IN, stored as ordinary expenses.**
  `addExtraFunds` writes a normal expense row with the flag set (a spouse
  sending cash earmarked for a category). `spentMap` excludes them,
  `extraFundsMap` collects them, and an envelope's displayed budget is
  **base + extra funds** — as is the Expenses hero's "of X". So **any new
  reduce over `expenses` must classify `isExtraFunds` explicitly**: treating
  those rows as spending is what made "salary not yet spent" go *down* when
  money arrived (fixed 2026-08-01). The same trap bites when reconciling by
  hand — summing envelope budgets against plan income double-counts them.
  Likewise `isTransfer` is set by **both** untracked transfers and goal
  contributions. Since v1.27.0 a goal contribution carries an explicit
  **`goalId` + `goalContributionId`**, and `unaccountedParts` prefers it;
  `catId` matching a live goal id is only the fallback, for rows written before
  that build (which is why a deleted goal used to silently reclassify its whole
  history as transfers).
- **Money reaching a goal is ONE write producing TWO linked records.**
  `applyGoalContribution` (module scope, pure) writes the ledger transfer and
  the goal's contribution together, and the App mutator `contributeToGoal` is
  the only way in — the Goals tab, Home's sheet and the add-transaction modal
  all call it. **There is no goal-only writer any more**, deliberately:
  `addContribution` was deleted because its existence is how those three paths
  came to disagree (two of them credited a goal without any money leaving the
  budget). Deleting either half tombstones the other in the same write, via
  `applyGoalContributionDelete/RestoreByExpense|ByContribution`; `removeExpenseTx`,
  `removeContribution` and `restoreRecord` all route through them. Records made
  before v1.27.0 carry no link and are left alone — never backfill a
  relationship the user didn't assert. Covered by `goaltest.cjs`.
  Since v1.28.0 an **untracked** category may carry an optional `goalId`, and a
  transfer against it credits that goal in the same write. Two rules there:
  `catId` stays the **category** (the envelope's transferred figure and the
  category filter read it) while `goalId` records the credit; and the link is
  resolved by `categoryGoalFor` **before** the write, so a deleted goal degrades
  the category to a plain transfer rather than having
  `applyGoalContribution`'s unknown-goal guard silently swallow the whole
  transaction. `goalId` is deliberately not defaulted in `migrate()` — absent
  means unlinked, and defaulting it would cost every device a KV write.
- **Transaction order lives in record fields, never array position.**
  `mergeArrayById` re-sorts expenses by id on every sync and `fingerprint`
  canonicalizes with `sortedById`, so array order is erased the first time two
  devices sync. Expenses carry `createdAt` (stamped once at insert, never
  re-stamped — unlike `updatedAt`) and an optional `ord` for manual within-a-day
  placement, compared by the single module-scope `compareTxForDisplay()` that
  both list sites use. **An absent `ord` is meaningful** — unplaced sorts above
  every placed row of its day, which is what makes "added after a reorder lands
  on top" and "a re-dated row arrives at the newest position" the same rule.
  Never default it to a number, including in `migrate()`.
- **Anything derived from a live source must reconcile, not just generate.**
  `data.bills` is a snapshot layer over `household.expenses`; its generator was
  create-only, which silently encoded "the source only ever grows" and left
  untracked bills in the list and the reserve forever. Create, update *and*
  retire each pass. Two follow-ons: decide per field whether it's a projection
  (keeps following the source) or a record (freezes — e.g. `allocated` freezes
  once `paid > 0`), and return the **identical object** when nothing changed,
  or the effect loops and dirties the doc on every app open.
- Shared reducer pattern for per-profile totals: filter the raw array by
  owner with a small helper (e.g. `investmentsForProfile`), then run it
  through the *same* valuation function used for the combined total — don't
  write a second bespoke reduce for "just this owner."
- Investment Accounts now support three priced types (Phase 2, 2026-07-28):
  Stocks/ETF (live quotes), Pag-IBIG MP2 (contribution log + a centrally
  shared declared-dividend-rate table in `data.mp2DividendRates`, confirmed
  vs. estimated valuation), and Time Deposit (principal/rate/term, status-
  driven confirmed vs. estimated value). Gold is selectable but unpriced
  (Phase 3). All three are priced through one dispatch, `investmentValueSar()`
  inside `App()` in `index.html` — extend that function's type branches for
  any new investment type rather than writing a parallel reduce elsewhere.
  See `docs/current-status.md` / `docs/decisions.md` for the valuation math.
- **A pay period's key is its *nominal* payday start; only its boundaries
  move.** `payPeriods[owner].actualStarts` maps a nominal period key to the day
  that period really began. **An entry has TWO stored shapes and exactly one
  reader** (v1.43.0): the legacy bare `YYYY-MM-DD` string, and the stamped
  `{v:"YYYY-MM-DD"|null, updatedAt}` that v1.44.0 writes so a *clear* can
  survive a union merge — `v:null` is a tombstone, meaning "this correction was
  cleared", not "no entry". Everything goes through module-scope
  **`actualStartValue`** (live date or null), **`hasLiveActualStart`** (does the
  map still move any boundary — a map of nothing but tombstones must take
  `periodKeyFor`'s fast path) and **`isActualStartEntry`** (keep vs sweep).
  Never read `actualStarts[k]` raw: the three Settings reads that did are
  exactly what would have rendered `Invalid Date` on the other phone.
  `migrate()` still sweeps genuine junk (the old `"pending"` sentinel, removed
  2026-07-31) but **must never again drop a `{v,updatedAt}` record** — doing so
  strips the other phone's corrections and pushes the stripped copy back, which
  is data loss that looks exactly like nothing happening. v1.43.0 **read** the
  stamped shape while still writing the legacy one; **v1.44.0 writes it**, and
  `migrate()` upgrades a bare string in place to `{v,updatedAt:""}` — a
  deliberate document-changing repair like the bills dedupe, costing one KV
  write per device, once, and idempotent thereafter. That two-release split is
  the pattern to repeat for any future shape change: **tolerance ships one
  release before anything writes the new shape**, because the device that has
  to cope is the one you are not deploying to.
  Three writers, and all three must keep the tombstone rule: `withActualStart`
  (set *and* clear — clearing writes `{v:null}`, never `delete`, because a
  union merge cannot see a deletion and the other phone would hand the value
  straight back), `tombstonedActualStarts` (the payday change, which clears
  every key wholesale and must not hand back `{}` for the same reason), and
  `migrate()`'s upgrade. The `SalaryArrivedSheet` preview config deliberately
  stays a bare string — it is never stored, and stamping it would imply an edit
  that hasn't happened.
  **The map merges per key via `mergeActualStarts`**, which must live between
  `function mergeArrayById(` and `/* Full cross-field auto-merge` (`synctest`,
  `mergetest` and `purchasetest` all slice that region by text) and is applied
  by `withMergedActualStarts` **after** `mergeSettingPaths` — `payPeriods.<owner>`
  is a single `SETTING_PATH`, so that function takes one side's whole config,
  corrections included, wholesale. Let it decide `payday`/`enabled`, then
  re-merge only `actualStarts` on top. Keys are **sorted** (payPeriods is
  fingerprinted un-canonicalised through `...rest`, so key order is load-bearing
  for the dirty flag) and the object is returned **by identity** when nothing
  moved. Unlike `mergeTrimPolicy` its stamp tie-break is by **value, not by
  side**: "local wins ties" never converges, because each device's merge is
  then a no-op on its own side and the two documents never agree.
  `shiftPeriod` is pure payday arithmetic and ignores overrides — identity and
  extent are different questions. Views call the `bucket*` wrappers, which hand
  the whole owner **config** down to the `period*` layer; never pass a bare
  `payday` to those. Invariants: an empty `actualStarts` short-circuits to
  the nominal answer (so untouched data costs what it always did — which is why
  clearing an override writes a *tombstone* rather than storing the nominal
  date — and `hasLiveActualStart` is what keeps the fast path working once a
  map holds nothing but tombstones);
  validation forbids an override crossing a whole period, which is what
  makes `periodKeyFor`'s three-candidate scan sound; and **`periodRange` must
  never read the clock** — a period's extent is a pure function of `(key,cfg)`,
  so labels and bucketing don't move at midnight and the history/snapshot
  effects can't loop on a boundary that shifts under them.
  **One override moves TWO boundaries** — it is period K's start and K−1's end
  — so a corrected period *stretches, it does not slide*: recording that August
  began Jul 30 makes August Jul 30–Aug 31 and shortens July to Jul 1–Jul 29,
  without cascading into September. **Periods are never pro-rated** — a short
  period keeps full monthly amounts on purpose, so the daily allowance absorbs
  the change. Corrections live in **Settings → Pay periods** (there is no Home
  card; it was removed for prompting speculatively while being invisible to
  owners who had tracking switched off, which was the case that needed it).
  Toggling tracking re-buckets that owner's entire expense history, so it
  confirms with a count first — in both directions.
- **Bank balances are derived on read, not stored current.** `bank.balance` is
  the last figure a person typed, anchored by `balanceAsOf`; an optional
  `interest` block (`null` = off) makes the *displayed* value
  `balance × (1 + netAnnual/365) ^ days`. Everything goes through
  `bankValuation()`/`bankValue()` — same single-dispatch rule as
  `investmentValueSar()`. Two invariants to preserve: the accrual exponent is a
  whole number of days (so the value is constant within a calendar day and the
  history/snapshot effects can't loop on it), and **anything that credits or
  debits an account must call `settledBankPatch()` first** — folding in the
  accrual and re-anchoring — or the elapsed period's interest gets applied to
  money that arrived today. Interest tiers are **whole-balance, not marginal**.
- **Installments: the schedule plans, Budget displays, Expenses records.** Three
  collections own three different things and nothing owns two —
  `data.installments` (the plan), `data.installmentPayments` (planned timing and
  amounts), `data.expenses` (money that actually moved). Load-bearing rules:
  - **Budget stores no copy.** It renders a *derived* group from
    `derivedInstallmentRowsFor()`, a pure module-scope function, and the path
    from there to the rendered rows must never touch `editPlanForMonth` —
    viewing a month must not materialise a plan. Rows use synthetic ids
    (`installmentRowId(paymentId)` → `inst:<id>`), never a plan category id: a
    cloned plan remints those every month and the link would silently break.
  - **Nothing derivable is stored.** No `remainingBalance`, `paymentsRemaining`
    or `progress`. `"overdue"` in particular is a function of `(dueDate, today)`
    and is *never written* — a stored flag rots while a device is closed. The
    three stored payment states are only what a user action can cause:
    `upcoming` / `paid` / `cancelled`.
  - **Every mutation is a pure `(d,args)=>d` at module scope** (`apply*`), and
    the App mutator is one line over it. A plan and its schedule, or a payment
    and its ledger row, must land in ONE `setData` or a half-written plan can be
    synced. This is also what makes `installmenttest.cjs` able to test the
    shipped coupling instead of a copy.
  - **One real payment ⇒ exactly one expense row**, `isTransfer:true` with
    `catId` = the installment id and `installmentId`/`installmentPaymentId`
    links — deliberately the same shape a goal contribution uses, which is why
    `unaccountedParts` needed no change (they land in "Transfers out", never in
    `spentMap`). Only a row carrying those exact links may update a payment;
    never match by name or amount.
  - **Early payoff is ONE transaction** (`installmentPayoff:true`, no
    `installmentPaymentId`), not one per cancelled payment. Cancelled rows keep
    their original `dueDate`/`scheduledAmount` — that single choice is what makes
    "removes future planning, preserves history" one rule instead of two.
    `payoffExpenseId` on each is what lets deleting the payoff reopen exactly
    the set it closed.
  - **A payment may optionally be funded from a budget category**
    (`fundedCatId`, v1.30.0) — the BNPL downpayment taken out of this month's
    Shopping. It is the ONE case where the shape above inverts: `catId` becomes
    the **category** and `isTransfer` is **false**, so it consumes the envelope
    and lands in `spentMap`. Safe only because nothing reads `catId` on an
    installment expense; every reader keys on the link ids. Two halves that must
    move together or you get a double-allocation: the ledger row stops being a
    transfer **and** `installmentTotal` drops the row (it feeds the
    untracked-envelope allocation). `unaccountedParts` needs no branch —
    `isTransfer:false` already falls through to tracked spend, and adding one is
    how it would break. `fundedElsewhere` is derived, never stored; the category
    is resolved against live, **owner-scoped** categories *before* the write so
    an unusable one degrades to a plain transfer without swallowing the
    transaction; and delete/unlink clear the mark while restore re-derives it
    from the expense. Not defaulted in `migrate()` — absent means unfunded.
  - **`household` is never an installment owner** (unlike investments/assets),
    and a linked chain's owner is fixed — moving one half of it is the
    corruption the module exists to prevent.
  - Deleting a plan tombstones it and its **unpaid** payments (stamped
    `deletedWith` so restore returns that exact batch); paid payments and every
    expense row are left alone. `installmentPayments` is in
    `CONFLICT_COLLECTIONS` but in `HIDE_FROM_RECENTLY_DELETED`.
  - `fingerprint()` emits the two collections **only when non-empty**, so
    `migrate()` adding them is byte-identical for an existing document and
    doesn't cost a KV write per device on first open.
- **The purchase period counts as a saving period; the current period does not,
  and both forward walks must agree** (v1.50.0, Phase 9a — supersedes the
  v1.37.0 `max(0, n−1)` rule). `purchaseHeadroomForBucket` is plan-based, so
  bucket 0 reports its whole headroom on the 28th exactly as on the 1st — so
  bucket 0 (the part-spent current period) is still excluded. But the PURCHASE
  bucket now counts: you keep saving up to the period you buy in. One helper,
  **`purchaseSaveableBuckets(n)` → `max(0, n)`**, answers "how many saving
  periods" for both walks (buckets **1 … n inclusive**), so they cannot drift.
  `purchaseSavingsPlan` loops `k = 1 … n`; the earliest walk banks a bucket
  BEFORE testing affordability. A four-periods-away target is four saving
  periods (7350 ÷ 4 = 1837.50), and a next-period target is ONE saving period,
  not zero.
  - It still **understates rather than pro-rating by days elapsed**: a pro-rated
    figure moves every day, this engine is plan-based on purpose (a plan is a
    decision, a trailing average is a description). Don't "improve" it into
    reading the clock or the actuals. Only the *set* of counted buckets changed.
  - **`purchaseSavingsSchedule(ctx,{shortfall,nowBucket,n})`** turns the
    aggregate into a per-period plan by deterministic water-filling (even share;
    caps a lean period to its room and redistributes; reconciles the rounding
    remainder so the column totals the shortfall EXACTLY and no row exceeds its
    room; infeasible windows fill to the brim and report `gap`). Pure — the UI
    renders its rows and never re-derives money.
  - `tightest` is the raw headroom (kept NEGATIVE) of the leanest bucket in
    1 … n, reported separately so the card can warn; `capacity` only sums
    `max(0, headroom)`.
  - Changing this **changes figures already on screen**. Thirteen `purchasetest`
    cases were re-derived by hand (never re-baselined) plus new schedule/
    semantics cases; `headroomcheck.cjs` is unaffected (per-bucket headroom
    didn't move).
- **`purchaseOptionsFor` is the advisor's answer to "now what?"** — ranked
  concrete moves (trim / shiftDate / finance / reducePrice), each carrying its
  own arithmetic and an `apply` payload naming **only existing draft levers**.
  It returns `[]` when there is no gap. It must stay pure, must never reach
  `setData` or the clock, and every option's figures must come from the
  existing helpers (`purchaseHeadroomForBucket`, `buildPurchaseSchedule`,
  `purchaseSavingsPlan`) rather than a second reduce — the rule A3 established.
  `optionLine` in the view is the ONE place an option is put into words.
- **The advisor may now cause ONE durable budget change — a temporary trim —
  and the "never materialises a plan" invariant is NARROWED, not gone** (Phase
  9c). The view and the engine still reach no `setData`/`editPlanForMonth` (S3
  asserts it); the single writer is the pure module-scope
  **`applyPurchaseTrimPlan(d,{owner,cuts,buckets,restoreBucket,now,uid}) →
  {d,preImage}`** (installment `apply*` pattern, its own section between the
  engine and the installment block). The App mutator `applyTrimPlan` wraps it
  (computed once from `dataRef.current` so preImage ids match the committed doc)
  and arms **`undoKind:"planSnapshot"`**; it's passed into `PurchaseAdvisorView`
  as a prop. Load-bearing rules, each pinned by `purchasetest` §14:
  - **Trims buckets 1…n inclusive, restore override at n+1.** Current period
    (bucket 0) untouched. The restore is **mandatory** — later buckets otherwise
    inherit the trimmed values via `resolvePlanForMonth` and the cut leaks
    forever.
  - **Absolute targets, computed from the pre-touch document** (`original − cut`),
    written absolutely — this is what stops a later bucket that inherits an
    already-trimmed clone from being cut twice, and it makes the copy-on-write
    materialise *fewer* plans than buckets (an inherited-equal bucket is a no-op).
  - **Subcategory-aware**: distribute the cut across subs proportionally, last
    sub absorbs the cent remainder, keep parent `amount` = new sub sum (never a
    dead manual figure). **Restore without clobber**: the n+1 write only sets the
    trimmed categories back; other edits in an existing n+1 override survive.
  - **Atomic + surgical undo.** One returned `d`; `preImage` captures created
    (null → drop) and edited (deep copy → revert) plan records and created
    `monthlyPlans` mappings (keyed `"<month>|<owner>"`). `performUndo` restores
    by id, so unrelated edits inside the 6s window are left alone. A wholesale
    snapshot was rejected for that reason.
  - The confirm sheet is `PurchaseTrimApplySheet` (placed before
    `PurchaseCompareSheet`, outside the S4 slice). The banner "Use this plan"
    routes by previewed option: trim → confirm sheet, finance → `openCreate`,
    waiting/spend-less → accept the draft, saving → the separate `startSaving`.
- **`data.trimPolicy` decides what the Purchase Advisor may suggest cutting,
  and it is a MAP, not a record array** (2026-08-08). Shape is
  `{ "<catId|groupId>": {v:bool, updatedAt} }`, resolved **category → group →
  `false`** by module-scope `trimPolicyFor`. Absent means unanswered and the
  default is NO — ranked by size alone the top candidates on this user's real
  data are Rent, Tuition and Groceries, so a permissive default opens the
  feature by proposing you cut your rent.
  - **Not a field on the category record**, deliberately. A category lives in a
    plan, the only legal plan writer is `editPlanForMonth`, and that
    copy-on-writes the *viewed* month — so tagging one would materialise a plan
    just to record a timeless fact, and leave earlier months untagged. Safe as
    an external map only because `clonePlanRecord` runs with
    `{preserveIds:true}`, so ids survive the month clone.
  - **Entries are flipped, never deleted** — a deletion cannot survive a union
    merge. `payPeriods.actualStarts` learned the same lesson the hard way in
    v1.44.0, where the value is a date rather than a boolean, so it needs an
    explicit `{v:null}` tombstone instead of this one's explicit-`false` trick.
  - Being a map changes the eight-touch-point list below: it must **not** go in
    `BACKUP_ARRAY_KEYS` (which asserts "if present, a list"), needs no
    `CONFLICT_COLLECTIONS` or `purgeOldTombstones` entry, and gets its own
    per-key newest-wins `mergeTrimPolicy` plus an object check in
    `validateBackup`. `fingerprint` emits it only when non-empty.
  - **`mergeTrimPolicy` lives with `mergeArrayById`/`mergeSettingPaths`, not
    with the purchase engine** — `tryAutoMergeAll` calls it, and `synctest`/
    `mergetest` slice that region by text. Defining it elsewhere broke three
    runners at once; move the function, don't widen three slices.
- **`data.txTemplates` are pinned transaction shortcuts — chosen, not
  observed.** Flat and id-keyed like every other synced collection.
  Deliberately NOT derived from history the way the Repeat chips are: a
  shortcut exists because someone pinned it, so it must survive a quiet month
  and reach the other person's phone. The two are rendered as **separate chip
  rows** and `recentTxTemplates(…,{excludeKeys})` removes pinned entries from
  the derived row, so pinning *moves* an entry between rows rather than showing
  it twice. Pinning is idempotent on `(owner,name,catId)` and **revives a
  tombstone** rather than creating a twin — the row is keyed by what the user
  recognises, not by an id they never see. Covered by `templatetest.cjs`.
- `data.settings` is a small object for user-facing toggles that change
  *calculation* behavior (currently just `includeMp2EstimateInNetWorth`) —
  put future calculation-affecting toggles here, not as ad hoc top-level
  `data` fields.
- **A DERIVED record's identity must itself be derived** (2026-08-07). Anything
  two devices generate independently — bill rows, the derived Budget
  installment rows — must build its id from what makes it unique, because
  `tryAutoMergeAll` unions **by id**. Bill rows used `id:uid()`, so both phones
  minted different ids for the same (month, item), nothing collided, the union
  kept both, and the Bills Reserve read exactly **double**. Now
  `billRowId(monthKey,itemId)` → `bill:<monthKey>:<itemId>`, the same shape
  `installmentRowId` already used. Three follow-ons, all load-bearing:
  `dedupeBillRows` picks its survivor **deterministically** (greatest `paid` →
  canonical id → oldest `createdAt` → smallest id) or two devices each tombstone
  the other's pick and the record vanishes; the survivor rung preferring the
  canonical id is what makes it **converge** instead of churning on every sync;
  and the reconciler must **not revive a row marked `dedupedAt`** — it used to
  revive every tombstoned row for a tracked item, which undid the repair on the
  next app open. The repair lives in `migrate()` as well as the reconciler,
  because the reconciler only ever touches the CURRENT month.
- **A field added to an existing record type is NOT defaulted in `migrate()`**
  unless absence would be ambiguous. `banks[].accessible`/`.purpose`,
  `goals[].bankId`/`.deadline`, `installmentPayments[].fundedCatId`, a
  category's `goalId` and an expense's `ord` all read as absent-means-default.
  Defaulting rewrites every record on every device's first open, which changes
  the document, changes the fingerprint, and buys a KV write per device for
  information nobody entered. (`bills`' dedupe is the deliberate exception: it
  is a *repair*, so it is meant to change the document — once, idempotently.)
- **Cached market data lives in `data` and is excluded from `fingerprint()`.**
  `livePrice`/`livePriceAt`/`prevClose` were joined by `rates`/`ratesAt`
  (v1.32.0). Two rules: add any new one to the destructure at the top of
  `fingerprint`, or a background refresh marks the doc dirty and costs a KV
  write on every app open; and **an effect that reads persisted state must wait
  for `loaded`** — App's initial state is an EMPTY document and the stored one
  arrives later, so a bare `[]` mount effect never sees the cache and refetches
  every time.

## Styling conventions

- Card-like surfaces (top-level tab content, Home dashboard cards, holding/
  account cards) should go through the shared `neu(r)`/`neuInset(r)` helpers
  (or `homeCardStyle()` for Home cards specifically) rather than a
  hand-rolled `{background:P.neuBg,borderRadius:...,boxShadow:...}` object —
  a 2026-07-29 audit found three tabs (`HouseholdView`/`BillsView`/
  `CurrencyView`) had each drifted to a slightly flatter shadow than the
  rest of the app by doing this. The standard top-level card radius is
  **16** (`neu(16)`); smaller nested cards (envelope rows, etc.) use 14.
- Delete/trash `IconButton`s use `opacity:.5` — keep new ones consistent
  with that rather than picking a new value per call site.
- **`<input type="date">` needs three corrections or it will not line up with
  the field beside it.** All three were found in one sheet (2026-08-07) and each
  looks like the whole answer on its own:
  - **`fontFamily:"inherit"`** — a bare date input renders in the *UA's* font
    while `NumField` carries `tnum`, so a two-up row comes out uneven.
  - **an explicit `height`** — even with the font matched it still measures
    ~2px taller, because its shadow-DOM `-webkit-datetime-edit` contributes
    content height that neither padding nor `line-height` reaches. Both were
    measured in the browser; only the explicit height works. Put it on the
    shared field style, and give any smaller reuse its own.
  - **`appearance:none`** (all three prefixes) — Safari gives that shadow tree
    a min-content width which *ignores* `width:100%`, so it visibly spills over
    the neighbouring field. This is the one that reads as "overlapping".

  A two-up row of fields should also carry `flexWrap:"wrap"` with
  `flex:"1 1 150px"` cells rather than `flex:1`, so it stacks on a narrow phone
  instead of colliding. **Verify by measuring `getBoundingClientRect` with the
  sheet open** — a live-DOM check only sees mounted elements.
- Shared small components worth reusing rather than reinventing: `.fab-btn`
  (floating action button), `.status-pill`/`.status-pill-fixed` (Tracked/
  Not-tracked-style toggle pills), `.seg-control`/`.seg-indicator`
  (fixed-width animated segmented control, see `HomeProfileToggle`).

## Accordions — a section that collapses UNMOUNTS its children

Settings is six collapsed sections since v1.46.0 (`InstallmentsView` has had
the same pattern for longer). Three rules, none of which a parse check catches:

- **The section renderer must be a HELPER, not a component.** `const
  section=(id,title,children)=>(…)` returning JSX is fine; `function Section(){}`
  or `const Section=()=>{}` declared *inside* the component is not — React sees
  a new type on every render and remounts the whole subtree, so every input in
  that panel loses focus on each keystroke. The bug is invisible until someone
  types.
- **No dialog may live inside a section body.** Collapsing unmounts it, which
  skips its cleanup — and `useScrollLock` is refcounted, so an unmounted-while-
  open sheet leaves the body pinned forever with nothing visible to close.
  Render sheets as siblings of the panel list, where `SalaryArrivedSheet`, the
  `ConfirmDialog`s and `ImportPreviewSheet` already are.
- **Anything that reports a failure belongs OUTSIDE the sections.** A person
  who cannot see the error cannot know which section to open to fix it. The
  flash message and the sync-error line render above the accordion, and the
  error line opens the relevant section itself.

Expansion state is plain local `useState`, **never synced** — which panel you
left open is about this screen, not about the household (same reasoning as
`VIEW_PROFILE_KEY`). Default every section closed, or the sheet opens long and
the reorganisation buys nothing.

Since v1.60.0 Settings is **also a desktop two-pane** (≥1024): a `.settings-nav`
left rail drives a separate `activeSec` state, and the `section` helper shows only
the active section's body on desktop. This was added **beside** the accordion, not
through it — `openSec`/`useState({})`, the 7 `section()` calls and the helper
signature are untouched, so `settingstest` still passes. The breakpoint is
**1024 (via `useMinWidth`), matching the CSS** — `useIsMobile`'s 768 would strand
the user in a 769–1023 zone where the nav is hidden but the headers are too. Any
future Settings edit must keep the two mechanisms parallel.

**A big JSX move is done by asserted line ranges, not string matching.** Phase 5
moved ~500 lines inside a 460-line component with a script that mapped each
block, asserted every boundary line still contained its expected heading,
checked each source line was used exactly once, and wrote **once** at the end.
Matching 100-line JSX strings is how an edit half-applies.

## Modals / sheets — always Portal them

Every `.sheet-bg` overlay rendered from inside a tab view **must** be wrapped
in `<Portal>`. `TabPane` applies a `.tab-enter-*` animation declared
`fill-mode: both`, so its final keyframe's `transform` stays applied forever —
which makes that div the containing block for *all* `position:fixed`
descendants. An un-portalled sheet therefore anchors to the scrollable tab
pane instead of the viewport, and since `.sheet-bg` is `align-items:flex-start`
it lands at the top of the whole page. With `useScrollLock` freezing the body,
the result is an invisible, unreachable dialog. This bit `ConfirmDialog` and
`AdjustReserveSheet` (fixed 2026-07-30). App-level modals rendered outside
`TabPane` (Settings/Conflict/PendingChanges/RecentlyDeleted/ProfilePicker) are
fine without it. Size sheets in `dvh`, not `vh` — mobile `100vh` is the
URL-bar-hidden height and overflows the visible area.

`useScrollLock` is **refcounted** (module-scope counter, not a per-instance
ref) because sheets nest — Settings holds a lock and opens the pay-period date
sheet and a ConfirmDialog on top of itself. Only the outermost lock owns the
saved scroll position; a per-instance one had the inner sheet's cleanup unlock
the body while Settings was still open and jump the page to a `savedY` it read
as 0. Don't "simplify" it back.

**A scroll lock makes `window.scrollY` lie, so no window-level gesture may read
it alone** (fixed 2026-08-14, v1.42.0). The lock pins the body with
`position:fixed`, which pins `window.scrollY` at **0** for as long as any sheet
is open — so pull-to-sync, whose only arm condition was `scrollY <= 0`, was
armed inside every sheet in the app. Its `touchmove` listener is non-passive, so
the `preventDefault()` that follows cancelled the *sheet's* own scroll: Settings
could not be scrolled back up, the indicator painted over it, and letting go
fired a real cloud save. Every arm now goes through module-scope **`mayArmPull`**
and refuses on any of four grounds — `anyOverlayOpen()` (the refcount above,
which is why it is the app's one honest "is a sheet open"), a touch target
inside `.sheet-bg`/`.modal-bg`/`[role="dialog"]`, an already-scrolled scrollable
ancestor, and only then `atTop()`. `onMove` re-checks the overlay every move,
because a sheet can open mid-drag from the FAB. Pinned by `pulltest.cjs`.

A long sheet's title bar goes in **`.sheet-head`**, whose `top` is **`-18px`,
not `0`**: a sticky element pins to the scroller's content edge, which sits 19px
in (`.sheet`'s 18px padding + 1px border), so `top:0` parks the header 19px down
and the content scrolls visibly through the translucent strip above it. Its
background must be an **opaque** token — `.sheet` itself is translucent glass.
Both measured in the browser; don't re-derive them by eye.

## Numeric inputs — always `NumField`

Never write `<input type="number" value={n} onChange={e=>set(Number(e.target.value))}/>`.
When auditing, grep for **`<input type={`** as well as the literal
`type="number"` — the trade modal built its fields from an array and escaped
the original sweep for a full five builds. A live-DOM check only sees mounted
elements, so open modals before trusting one.
`Number("")` is `0`, so clearing the box writes 0 back and it can never be
blank. **All 38 numeric fields go through `NumField`** (defined just above
`STORAGE_KEY`), which holds a string draft, commits on blur through
`evalMathExpr` (so `1200+350` works everywhere), and selects on focus. Props:
`allowEmpty` when "unset" differs from zero, `integer`/`min`/`max` to clamp on
commit, `live` when something outside the field reacts before blur (a
`disabled={!valid}` submit button, or a running preview — a disabled button
doesn't reliably fire the field's blur), `navGroup` to make Enter jump to the
next field in that group. Don't clamp a value that has a validation message
telling the user it's out of range — clamping makes the message unreachable.

## Hosting and deploying the app

The app is served by **Cloudflare Pages** at **https://whered-it-go.pages.dev**
(project `whered-it-go`), moved off GitHub Pages on 2026-08-06 after its deploy
job failed five times with `Timeout reached, aborting` and no actionable
diagnostics. Both the app and the sync Worker now live on one Cloudflare
account, but as **two separate projects** — an app release must never be able to
redeploy the Durable-Object-bearing Worker.

**Deploy:**

    node stage.cjs && npx wrangler pages deploy site --project-name=whered-it-go --branch=main

- **`stage.cjs` is the release guard, not a copy step.** It refuses to stage
  unless `APP_VERSION`/`BUILD_ID` in `index.html`, `BUILD_ID` in `sw.js` and
  `version.json` all agree — the three-way mismatch this file has warned about
  for months, now enforced. It rebuilds `site/` from scratch each run so a stale
  file can't be published silently.
- **`site/` is build output** (gitignored). The seven served files stay at the
  repo root, because `parsecheck.cjs` and all 18 runners read `index.html` from
  there. Never move the source into `site/`.
- **The repo is not the website.** Only those seven files ship; the runners,
  `worker.js`, `wrangler.jsonc` and `docs/` are tooling. Add a served file to
  `SERVED` in `stage.cjs` or it silently won't deploy.
- **Never add `pages_build_output_dir` to `wrangler.jsonc`.** That file is the
  *Worker's* config; Pages warns it's missing that field and correctly ignores
  the file. Adding it would make `wrangler deploy` and `wrangler pages deploy`
  fight over one config.
- Deployment is **direct upload**, deliberately — not Git-triggered. It gives
  immediate readable output, which is exactly what the GitHub pipeline never did.

**Setting a Worker secret: the value goes on STDIN, never on the command line.**
`npx wrangler secret put NAME` takes the *name* as its argument and prompts for
the value. Passing the key as that argument creates a secret **named** after
your key — and secret *names* are not encrypted: they come back in plaintext
from `wrangler secret list`, the dashboard and the API. That happened on
2026-08-07 with the Gemini key, which then had to be rotated.

Two follow-ons, both learned the same day:
- **`wrangler secret put` must be run in a REAL terminal.** Claude Code's `!`
  prefix is non-interactive, so the `Enter a secret value:` prompt never
  appears and wrangler silently takes an empty stdin — you get
  `✨ Success! Uploaded secret` for an **empty** value. The tell is the absence
  of the prompt line in the output. (Same mechanism makes destructive commands
  auto-confirm: `🤖 Using fallback value in non-interactive context: yes`.)
- **Verify a secret took, without ever reading it.** The empty-upload failure
  above is silent, so a new secret needs an endpoint that fails differently for
  "unset" and "set but rejected". (The Gemini path did this with 503 vs 502; it
  was removed in v1.41.0, but design the next one the same way.)

**A new hosting origin needs a Worker change.** `ALLOWED_ORIGINS` in `worker.js`
gates browser access; an origin missing from it loads the app fine and then
fails every sync with a CORS error — the worst failure shape, because it looks
like the app working. Add the origin, `npx wrangler deploy`, and confirm both
bindings (`SYNC_ROOM`, `ALLOC_KV`) are still listed in the output.

**Cloudflare Pages 308-redirects `/index.html` → `/`.** Hence `start_url` is
`"./"` and `APP_SHELL` lists `'./'` only. Don't reintroduce `./index.html` in
either.

**Browser storage is per-origin**, so changing the app's address again would
strand every device's data — the document, the passphrase, device identity and
the local safety copies all live under the origin. Any future move must repeat
the push-everything-first migration (see `docs/current-status.md`). A custom
domain is the only thing that makes a future move free.

## Focusing a field — `focus()` is the gesture's, `select()` is the commit's

**iOS Safari raises the keyboard only for a `focus()` called synchronously
inside the user gesture.** Deferring it (rAF, `setTimeout`, an effect) moves the
caret and nothing else, so an affordance whose whole value is "fewer taps" ships
with its main tap still required — and a desktop sandbox will show it as
working. Focus the field inline in the handler whenever it is already mounted.

**`select()` must NOT be in the same tick.** At gesture time the input still
holds the *old* value, and React's commit setting the new one collapses the
selection to the caret. Select on the next tick. `focusField` in
`ExpenseTrackerView` does both halves — reuse it rather than calling `focus()`.

Prefer `setTimeout(...,0)` over `requestAnimationFrame` for the deferred half:
rAF is throttled in a non-foreground tab, which makes it fail under browser
automation for reasons unrelated to the code.

Autofocus is **conditional or it's a regression**: focusing a text field when
the user's next step is a `<select>` buries the list behind the keyboard.

## Declaration order inside a component body is load-bearing

`const` in a component body is block-scoped, so reading one above its
declaration is a **temporal-dead-zone throw at render time** — the app blanks
into its error boundary and the console shows an error nobody is watching for.
This is invisible to every runner, because each pure function still passes: it
is a fact about the order of statements, not about any function's behaviour.
It has now caused a blank screen four times across two features, every one of
 them visible only in a browser.

Two consequences. When adding a `useMemo`/`useCallback` block to a long
component, **insert it after everything it reads**, not at the logically tidy
spot. And when the ordering matters, pin it by test — compare `indexOf` on
comment-stripped source, as `purchasetest.cjs` case 13o does for `optionLine`.
Cheap, and it fails loudly instead of blanking the app.

**The same blank-screen failure comes from a prop referenced but never
destructured** — `trimPolicy is not defined` took out the whole Budget tab in
C1 while every runner stayed green, because the engine was fine and only
the component was broken. `purchasetest.cjs` case 13m2 pins it: if a
component's body names a prop, its signature must declare it *and* the mount
site must pass it.

Its root cause is worth its own warning. A `node -e` script doing several
`String.replace`s **must write the file before it can throw** — one that
validates all replacements in a loop and calls `writeFileSync` afterwards
silently discards the edits that already succeeded when a later one fails. The
console then shows a plausible error for the *last* edit while the earlier ones
have vanished. Prefer the `Edit` tool for anything with awkward quoting; when
scripting, verify with `grep` afterwards rather than trusting the exit code.

## The header carries one sync control

Since v1.45.0 the header is the wordmark, **one** status pill, and Settings.
Everything else moved: theme to Settings → Appearance, Pull and "what's
pending" into the **`SyncSheet`** the pill opens. Three rules hold it together.

- **`syncPill` is the only place a sync label is decided.** Four controls each
  deriving their own wording from the same state is how a pill could read
  "Cloud synced" beside a badge showing a pending count. It reads
  **worst-first** — offline is more useful than "3 pending" when both are true.
- **`SyncSheet` owns no sync logic.** It calls `saveToCloud` / `pullFromCloud` /
  the pending viewer unchanged, and **routes recovery to Settings rather than
  repeating it**: restoring a pre-cloud slot overwrites the document, and a
  destructive action with two homes eventually differs between them — the
  reason `addContribution` was deleted. `headertest.cjs` asserts the sheet
  contains no `setData`, `fetch`, `KVSync`, `localStorage` or `migrate`.
- **Header copy states the rule, never an instruction.** The old line told you
  to pull before editing and save when finished, which the app has not required
  for a long time — and Settings said the opposite three screens away. If a
  sentence tells someone to do something the app already does, delete it.

**Nothing editable belongs in the header.** Income was a live `NumField` shown
on every tab, one mis-tap from rewriting the plan while looking at Investments;
it is a figure that taps through to Budget now. Before removing an editor,
check the destination has one — `headertest.cjs` case 6 pins both halves.

**A header change is a 320px change.** The right-hand controls need ~178px of a
288px content box, so the wordmark shrinks and ellipses and no sync label may
exceed 16 characters. Both were found by measuring in a browser after the
runners were green, and both are now pinned by test.

## Navigation

Tabs live in three module-scope lists — `PRIMARY_TABS` (the DEFAULT bottom bar),
`MORE_TABS` (default More sheet — Net Worth, Goals, Installments, Purchase
Advisor, Bills, Household, Currency), `HIDDEN_TABS` (reachable by code only;
Forecast sits here). `TAB_ORDER` is derived from all three, so a new tab cannot
be added without landing in the slide-direction tracker. Labels/icons come from
the single `TAB_META` registry (`short` is bar-only).

**Since v1.48.0 the bar is customisable per owner** (Phase 7). What actually
renders is `navTabsFor(data.navTabs,defaultPerson)` + `moreTabsFor(...)` — not
`PRIMARY_TABS`/`MORE_TABS` directly. `data.navTabs` is a stamped per-owner map
(`{me:{v:[ids],updatedAt}}`, the SAME map-not-array shape and touch points as
`trimPolicy` — reuses `mergeTrimPolicy`, `fingerprint`-when-non-empty,
`validateBackup` object check, and is **not** defaulted in `migrate()`).
`navTabsFor` validates against `SELECTABLE_TABS` (= PRIMARY+MORE, so `targets`
and unknown ids are dropped), dedupes, caps at `NAV_BAR_SIZE`, and falls back to
a **copy** of `PRIMARY_TABS`. The bar follows `defaultPerson` (seeded from
`PROFILE_KEY`, moved only by `chooseDefaultProfile`) — deliberately not
`budgetOwner` (flips during Budget use) or `profile` (can be `"household"`).
The editor is the Settings **Navigation** section; `navtabtest.cjs` covers it.
z-index ladder:
bottom nav 30 → FAB 35 → pull-to-sync indicator 38 → sheets/modals 40 →
undo toast 80. (The indicator was 60 until v1.42.0, which painted it over an
open sheet — only ever visible because the gesture could arm inside one.)

A tab that renders its **own** `.fab-btn` (Home, Installments) must both suppress
the global one in `App` *and* wrap its button in `<Portal>` — `.fab-btn` is
`position:fixed`, and the `TabPane` containing-block trap below applies to it
exactly as it does to a sheet, parking it inside the scrollable tab pane instead
of the viewport.

## `position:sticky` and `overflow`

`overflow-x:hidden` belongs on `<html>` ONLY. On `<body>` it computes to
`hidden auto` (spec: hidden-x + visible-y ⇒ auto-y), making body a scroll
container, and **every** `position:sticky` descendant then resolves `top:0`
against the whole document instead of the viewport — sticky silently does
nothing. Same trap on a smaller scale: an ancestor with `overflow:hidden`
(e.g. a card clipping its corners) kills sticky inside it; use
`overflow:clip`, which clips without creating a scroll container.

## Home cards answer questions

Each Home card exists to answer one question, and a figure is not an answer.
Cards lead with a `<Verdict tone=...>` line (good/warn/bad/flat, same
semantics as `spendStatusColor`) and demote the numbers to supporting detail.
A card with nothing honest to say returns `null` — `.home-cell:empty` hides
the wrapper, so never duplicate a card's own conditions in `HomeView`.
History-dependent cards gate on `MIN_TREND_BUCKETS` completed periods and
render nothing (never "not enough data yet") until then. Past-period figures
must come from `bucketHistoryFor`/`bucketHistoryCombined`, which reuse the
same `trackedSpendingFor`/`savingsInvestingFor` as the live cards with an
explicit bucket — don't write a parallel per-month reduce. `trendtest.cjs`
covers this maths; run `node trendtest.cjs` after touching it.

## Sync — what counts as a "change"

Two fingerprints, deliberately:
- `fingerprint(d)` — raw byte comparison. Used for conflict detection and the
  sync baseline. **Don't** weaken it; auto rows still need to merge across
  devices.
- `userFingerprint(d)` — same, minus `history`/`snapshots` rows stamped
  `auto:true`. Used **only** for the dirty/pending flag.

The split exists because opening the app refreshes quotes/FX, which makes two
effects recompute derived `history`/`snapshots` rows. Those are in
`fingerprint()`, so a price tick used to mark the doc dirty and fire the 8s
idle autosave — a Cloudflare KV write per app open, for data nobody touched.
Any new background-derived data should be stamped `auto:true` and added to
`stripAutoRows`' reach, not left to dirty the document.

## Connecting a device — merging needs a shared ancestor

**A merge is only meaningful against a baseline.** Until 2026-08-07 a
first-time connection ran `tryAutoMergeAll(local, cloud)` like any other, and
that merge *succeeded* — it is id-keyed, and a fresh device's ids are all
novel, so nothing collides and every local record survives into the union,
which was then auto-pushed. A brand-new Safari origin therefore booted on the
sample dataset and, on entering the passphrase, published 15 demo categories,
3 goals and 3 investments to both real phones. Without a shared ancestor the
union of two documents is not a reconciliation; it is contamination wearing a
merge's clothes.

One pure module-scope function, **`syncConnectDecision(ctx)`**, now answers
this for all three paths that used to decide it independently — the startup
`reconcile`, `pullFromCloud`, and `saveToCloud`'s conflict retry (that third
one is a real door: a rev rejection hands back the server's document and the
reflex is to merge into it). `hasBaseline` (`meta.lastCloudSnapshot != null`)
is its first and most important input and must stay the first branch: an
established device merges exactly as before, and if anything could override
that, a normal two-phone merge could silently drop one side's offline edits.
The other outcomes are `adopt` (take the cloud document exactly, zero POST),
`ask` (the `FirstConnectSheet` chooser), and `onboard` (empty cloud).

- **`cloudConfirmedRef` may only be set by a validated full `/sync` read.**
  `/sync/meta` accepting the passphrase is an *authentication* fact and says
  nothing about the document; the connect effect used to set the flag on it,
  which cleared a device to push over a document it had never seen.
- **Records decide whether a person is interrupted; settings never do.**
  `countLocalRecords` counts live records (and plan *categories*, never plans —
  the skeleton would make every fresh device look occupied). A settings-only
  difference adopts silently and leaves a dismissible line.
- **`FirstConnectSheet` is not `ConflictModal`** and must not be merged into
  it. The conflict modal describes two devices that diverged from a shared
  baseline and offers an overwrite; from a device that has never synced, that
  button would destroy the other phone's entire dataset while being unable to
  show what it was destroying. The chooser offers merge-with-counts instead.
- **Provenance is per-device `localStorage`** (`PROVENANCE_KEY`), never a field
  in `data` — same reasoning as `VIEW_PROFILE_KEY`, plus: a synced
  `provenance` would travel and make the receiving phone distrust its own
  records. Two values, `"sample"` and `"reset"`, meaning **this state was
  manufactured on this device and may not travel on its own**; the push guard
  treats them identically and they differ only so the message can name what is
  held back. The mark is **sticky** — cleared by an explicit Save to Cloud, or
  when a pull/merge leaves no manufactured record behind.
  Two traps, both hit in practice on 2026-08-07:
  - An earlier version anchored the mark to the document's fingerprint so any
    edit would clear it automatically. The bills reconciler, daily snapshot and
    quote refresh all mutate the document within seconds of load, so it cleared
    itself and the demo dataset auto-pushed exactly as before. Don't.
  - Clearing it after a merge is gated on **record count**
    (`countLocalRecords(merged) <= countLocalRecords(remote)`), not on
    `stillDirty`. A reset device keeps its preferences, so its merge result is
    never byte-equal to a cloud document carrying fewer settings fields, and a
    `stillDirty` gate left it held forever. Record count asks the question that
    matters: did this device contribute anything of its own?
- **"Reset to empty" clears RECORDS, keeps preferences** (`resetToEmptyDoc`,
  `RESET_KEEPS`). Two reasons: a person resetting means "clear my data", not
  "forget my name"; and a reset that wipes settings comes back from the next
  pull with the reset device's freshly-stamped defaults **beating** the cloud's
  real settings in `mergeSettingPaths`, so the data returns while the owner
  names return as "Me"/"My wife". Reset also calls `markResetData()` — without
  it, Reset marks the doc dirty and the idle autosave uploads the emptied
  device ~8s later, so a button reading "clean up this device" empties the
  other phone too.
- `migrate()` now defaults `goals`/`investments`/`banks`/`assets` to `[]`.
  Without that, adopting a sparse cloud document left the device differing
  from the baseline just recorded for it, and it pushed a normalised copy
  straight back — "adopted exactly, without issuing a POST" was not true.

**Every document arriving from the cloud goes through `cloudDocProblem(raw)`**
before `migrate()` sees it — startup reconcile, the inline copy a rev-rejected
save hands back, and manual Pull. It delegates to `validateBackup` but ignores
its *warnings*: a warning means "this device hasn't used that feature yet",
which is normal, and refusing on one would lock two honest devices out of each
other. A rejected document is treated as a **failed read**, never as a conflict
(the conflict modal asks you to pick between two documents; a corrupt blob isn't
one of them), and pushing stops until a readable document arrives. Any new pull
path must call it — a second `Array.isArray(remote.plans)` check is the exact
bug this replaced.

**Adding a synced collection therefore has EIGHT touch points, not seven.** The
seven `installments` established (`defaultData`, `migrate`, `fingerprint`,
`tryAutoMergeAll`, `CONFLICT_COLLECTIONS`, `countPendingChanges`,
`purgeOldTombstones`) plus **both** backup key lists: `BACKUP_ARRAY_KEYS` (if
present it must be a list) *and* `BACKUP_OPTIONAL_KEYS` (absent is normal, i.e.
a warning). Because `validateBackup` now gates every cloud pull, omitting the
second means the device that upgrades **first** starts refusing the other
phone's document — which has no such key yet. Two healthy devices, sync broken,
and an error naming a collection the user has never heard of.
`cloudguardtest.cjs`'s forward-compatibility case is the guard; keep it green.

## Testing this app

- No test suite, no build step. "Testing" means opening it in a browser.
- **A parse error silently blanks the app with zero console output** (Babel
  throws after `#loading` is removed and `#root` never mounts). Always
  parse-check after editing: `node parsecheck.cjs <path-to-@babel/standalone>`
  (the dep isn't vendored — `npm i @babel/standalone --prefix /tmp/pc` once).
  If writing your own: the tag is `<script type="text/babel"
  data-presets="react">`, so a regex matching `type="text/babel">` exactly
  finds nothing and reports a false "no block found".
- Pure helpers (fingerprints, diffs, valuation math) can be genuinely
  unit-tested without a browser: slice the function text out of `index.html`
  by name and `vm.runInContext` it with a small harness — much better than
  reimplementing the logic in the test, which only tests the copy. Committed
  runners — **there are twenty-six, run all of them**: `trendtest.cjs` (Home trend
  maths), `billstest.cjs` (bills reconciler), `budgettest.cjs` (carry-forward
  chain + copy-on-write + plan clone + category moves), `banktest.cjs` (bank
  interest accrual), `periodtest.cjs` (pay-period boundaries), `txordertest.cjs`
  (transaction display order + entry-stamp backfill), `ownertest.cjs`
  (per-profile ownership + `netWorthParts`), `suggesttest.cjs`
  (transaction-name ranking), `synctest.cjs` (per-setting merge resolution),
  `installmenttest.cjs` (installment schedule maths, derived Budget rows,
  payment/payoff/cancel/delete coupling, migration byte-equivalence),
  `templatetest.cjs` (pinned transaction shortcuts: Repeat/Shortcut dedupe,
  migration byte-equivalence, merge),
  `goaltest.cjs` (goal contributions as one linked write: both delete
  directions, both restores, legacy unlinked records, the unaccounted
  classifier),
  `importtest.cjs` (`validateBackup` accept/refuse cases), `backupslottest.cjs`
  (rotating pre-import safety slots + quota degradation), `mergetest.cjs`
  (two-device merge: per-category plans, `monthlyPlans`, `household.expenses`),
  `devicetagtest.cjs` (`headerSafe` against Node's real `Headers`),
  `cloudguardtest.cjs` (the gate on documents arriving from the cloud), and
  `synconnecttest.cjs` (a device's FIRST contact with the cloud:
  `syncConnectDecision`, the record/settings distinction, sample provenance,
  and three source-structure assertions pinning the `cloudConfirmedRef` and
  no-baseline guards that live in `App()` effects rather than a pure function),
  and `purchasetest.cjs` (the Purchase Advisor engine: headroom vs the SLICED
  BudgetView expression, per-bank withholding, the savings plan, and
  source-structure assertions pinning "touches no synced data" and the NARROWED
  "never materialises a plan except through `applyPurchaseTrimPlan`" invariant
  (S3); plus the options engine, cuttability, a sweep asserting no reference to
  the removed AI path survives, and §14 for the durable temporary trim — buckets
  1…n + restore at n+1, absolute targets, subcategory cent-exactness, atomic
  planSnapshot undo, owner isolation, restore-without-clobber),
  and `pulltest.cjs` (pull-to-sync may not arm inside a sheet: `mayArmPull` as a
  pure predicate over all sixteen input combinations, plus source-structure
  assertions pinning the wiring that lives in an `App()` effect — the arm order,
  the mid-drag re-check before `preventDefault`, the z-index ladder, and the
  sticky Settings header),
  and `periodmergetest.cjs` (the per-key merge of corrected period starts:
  different periods on different devices both survive, a clear stays cleared, a
  newer re-correction beats an older clear, `merge(a,b)` deep-equals
  `merge(b,a)` **including key order**, unstamped legacy entries lose to any
  edit, a v1.43.0 document merges with a v1.44.0 one, `payday`/`enabled` still
  resolve through `mergeSettingPaths` untouched, and an unchanged map is
  returned by identity).
  and `headertest.cjs` (the header and its sync sheet: the old instruction line
  cannot come back, exactly one sync entry point, the sheet contains no
  `setData`/`fetch`/`KVSync`, it is mounted after `</TabPane>`, every prop its
  body names is passed at the mount site, income is display-only *and* still
  editable in Budget, and every sync label fits a 320px header).
  and `settingstest.cjs` (the Settings accordion: all eleven headings survive
  the move, six sections all closed by default, `section` is a render helper and
  not a component, `useScrollLock` is taken exactly once, every nested dialog
  sits after the last section, and errors render above the sections).
  and `reconciletest.cjs` (salary reconciliation: the actual column still sums
  to the headline, extra funds are money in, a goal-linked untracked category is
  not claimed by two lines, both installment shapes, a past bucket reconciles
  against ITS plan, unmatched transfers are named, the legacy goal fallback, and
  a source assertion that the function never mentions `editPlanForMonth`,
  `setData` or the clock).
  and `navtabtest.cjs` (customisable bottom navigation: `navTabsFor`
  fallback/validation/dedupe/cap and its no-mutation-of-`PRIMARY_TABS`
  guarantee, `moreTabsFor` as the exact complement, `mergeTrimPolicy` over the
  navTabs shape, and six source-structure assertions pinning the out-of-function
  wiring — merged in `tryAutoMergeAll`, normalised in `fingerprint`, checked in
  `validateBackup`, NOT defaulted in `migrate`/`defaultData`, NOT in
  `BACKUP_ARRAY_KEYS`, and `BottomNav` rendering its `tabs` prop).
  and `milestonetest.cjs` (net-worth milestone memory: `nextNwMilestone`/
  `highestNwMilestone` rung boundaries, `mergeMilestones` **max-per-key** merge
  — highest-ever wins, commutative incl. key order, never downgrades,
  undefined-when-empty — and source assertions pinning the sync wiring: merged in
  `tryAutoMergeAll`, emitted-when-non-empty in `fingerprint`, object-checked in
  `validateBackup`, NOT defaulted in `migrate`/defaults, NOT in
  `BACKUP_ARRAY_KEYS`, NOT stripped as `auto`, and the detection effect writing
  through `setData` — not `setDataRaw` — with an `if(!changed)return d;`
  no-op guard).
  **Commit new ones** — `baltest.cjs`
  was written in-session, never committed, and is gone.
- **A green suite does not mean a sync change works.** The 2026-08-07 session
  shipped three defects past a fully green suite, each found only by driving
  the app in a browser: `migrate()` missing four collection defaults (so a
  device "adopted the cloud exactly" and then immediately pushed a normalised
  copy back), a provenance mark anchored to the document fingerprint (cleared
  by the bills reconciler within seconds of load), and a hold that never lifted
  (gated on `stillDirty`, which a preference-keeping device never reaches).
  All three are invisible to a pure function under test, because they are about
  what the app's *effects* do to the document afterwards. **Anything touching
  sync must be driven against `sandboxworker.cjs` with the network log open,
  watching for POSTs across a full autosave window (wait 15–25s, not 3).**
- **`headroomcheck.cjs`** is tooling, not a runner — it needs a backup file
  nobody may commit, so it takes the path as an argument and a "run all
  twenty-six" sweep must not include it. It cross-checks the Purchase Advisor's
  `purchaseHeadroomForBucket` against the **sliced** `BudgetView` "Left"
  expression over every owner × the full 24-bucket horizon of a REAL document.
  `purchasetest.cjs` case 2 asserts the same equality, but over a three-category
  fixture — which cannot exercise 29 plans, an `actualStarts` override, or a
  plan chain inherited 24 buckets forward. Run it by hand after touching either
  side's arithmetic. It compares the three **inputs** separately as well as the
  totals, because two wrongs that cancel leave the totals equal. Verified
  against injected defects: a fabricated `planned` was caught in 48/48 buckets,
  and counting a `fundedElsewhere` row again was caught in the **1** bucket that
  has one — the narrow case a fixture would most easily miss. It proves the two
  expressions agree with each other, not that either is right: confirm one row
  against the app's own Budget tab before trusting a clean run.
- **`dotest.cjs`** is tooling, not a runner — it launches `npx wrangler dev`
  four times, needs four free ports and takes ~25s, so it stays out of the
  "run all twenty-six" sweep. It is the **only** coverage `SyncRoom` has: every
  other runner slices pure functions out of `index.html`, and the thing under
  test here is the storage runtime's serialisation guarantee, not an
  expression. Run it by hand after touching `worker.js` or `wrangler.jsonc`.
  - **Every instance is local** (`wrangler dev` defaults to workerd+miniflare)
    with its own throwaway `--persist-to` dir and `--var SYNC_TOKEN:test-token`.
    **There must never be a `--remote` in it** — the room name is hardcoded
    `"household"`, so a remote run would compare-and-swap against the real
    document. That is also why the production cross-check is read-only: only
    the 401 and CORS cases (4 and 9) can be run against the deployed Worker.
  - **A rev conflict is HTTP 200**, not 409 — the client branches on
    `conflict:true` in the body. Case 6 asserts the status explicitly so nobody
    "corrects" it in passing and breaks every device not upgraded in lockstep.
  - **The KV mirror is best-effort and must stay that way.** Case 11 runs a
    whole instance with `ALLOC_KV` unbound to prove a write still succeeds.
    Retiring the mirror rewrites that case; it is a separate change.
  - Two traps found writing it. `spawn` needs `shell:true` (npx is a `.cmd`
    and Node refuses to spawn one directly), and **cmd.exe strips the inner
    quotes out of a JSON literal on the command line** — so seeding KV inline
    delivered `{legacy:true}`, `JSON.parse` threw inside the Worker's seed, the
    room correctly started empty, and the harness blamed the Worker for what
    the shell had done. Values go in by `--path`. And wrangler picks a
    different port if the requested one is busy, so the port is parsed back out
    of its "Ready on" line rather than assumed.
- **`samplescan.cjs`** is tooling, not a runner — it finds `sampleData()`
  records inside a real backup. **It never matches on name, and neither should
  anything else**: `defaultData()`'s seed set was authored from this user's
  real life ("Charlene", "Tuition Fee Wife", "Braces", "Toyota Raize" are real
  categories, and Toyota Raize is also a real asset), so a name sweep deletes
  genuine data while appearing to work. It scores exact value match (sliced
  from `index.html`, name excluded from the fingerprint), a shared cohort date,
  and absence from an older backup passed via `--before`. Reports only;
  `--remove` takes explicit ids, soft-deletes, and writes a *separate* file.
- **`sandboxworker.cjs`** serves a sandbox copy *and* impersonates the Worker's
  `/sync` endpoints, switching between a good and a deliberately corrupt
  document on the fly. It is how the cloud-validation branches (and the
  new-device and self-heal paths) get exercised without touching live data —
  usage is in its header comment. **It answers every POST with
  `conflict:true` and stores nothing**, so a *successful* push is the one thing
  it cannot exercise: repeated POSTs while testing are that artifact, not a
  retry loop in the app. (`dotest.cjs` covers the accepted push, against the
  real Worker — but against a local room, so it says nothing about how the app
  behaves afterwards. The two tools do not overlap.) Its `GOOD` document is also deliberately sparse, which
  is what exposed the `migrate()` defaults gap — don't "fix" it by fattening it.
  - Three traps: `assert.deepStrictEqual` compares prototypes and therefore
    fails on anything built inside the vm — use `deepEqual`. Slice markers
    are plain `indexOf` on source text, so they break silently when the code
    moves; assert on the marker being found. And top-level **`const` bindings
    don't attach to a vm context** — only function declarations do, so a
    sliced-out `const` reads as `undefined` unless you append an explicit
    `this.X=X`.
- `setData` writes to `localStorage` on a debounce, so reading it back
  immediately after a UI action shows the *previous* state. Re-read before
  concluding an action did nothing.
- `python3`/`python` resolve to a non-functional Windows Store alias stub in
  this project's shell environment — `python3 -m http.server` silently
  fails or serves stale content. **Use Node instead**: a small inline
  `http.createServer` script (see git history / session transcript,
  2026-07-29) reliably serves a sandboxed test copy. Also start it with the
  `Bash` tool's own `run_in_background:true`, not a trailing shell `&` —
  backgrounded-via-`&` processes don't reliably survive past the tool call
  in this environment.
- **Testing is safe by default now, and used to not be.** The sync token was
  once a hardcoded constant in `index.html`, so any fresh browser profile
  pulled the real user's live financial data on load; older doc entries below
  still describe the workaround (a `"PASTE_"`-prefixed dummy value). Since
  2026-08-01 the passphrase lives per-device in `localStorage`
  (`SYNC_TOKEN_KEY`), so a copy served on a fresh port has a clean
  `localStorage`, is unconnected, and starts from `structuralDefaults()` (an
  empty document — since 2026-08-07 it is no longer seeded with sample data)
  — just don't type the real passphrase into it. Nothing needs editing out of
  the file. **An old localhost port keeps its own `localStorage`**, so verify a
  "fresh device" really is fresh (`localStorage.clear()` then reload) before
  concluding anything from what it shows.
- **The five CDN `<script>` tags are pinned with SRI hashes.** Bumping a
  library version WITHOUT regenerating its `integrity` value blanks the app
  (the browser refuses the file; the error is in the console, not on screen).
  Regenerate with:
  `curl -sS <url> | openssl dgst -sha384 -binary | openssl base64 -A`
  Two rules: the URL must be a **real file inside the npm package**, never one
  jsDelivr synthesises — asking for `recharts@2.12.7/umd/Recharts.min.js` (which
  the package doesn't ship) got a generated file with a jsDelivr banner, whose
  bytes can change under you; the real file is `umd/Recharts.js`, already
  minified. And cross-check the hash against unpkg before trusting it, so a
  single compromised CDN can't dictate what you pin. `sw.js`'s `APP_SHELL` must
  list the identical URLs or it caches files the page never asks for.
- **Nothing in this repo may be secret** — it's a public repo.
  `SYNC_TOKEN`/`FINNHUB_KEY` are Cloudflare Worker env secrets read via `env`
  in `worker.js`; `PROXY_URL` is a plain public URL that authorizes nothing.
  Never reintroduce a credential literal.
- The Worker authenticates **every** endpoint, `/quote` and `/name` included
  (they were open proxies until 2026-08-01). So live prices, not just sync,
  are off until a device has its passphrase — `fetchQuotes`/`fetchName` gate
  on `KVSync._ready()` rather than a `PASTE_` check.
- `file://` URLs don't work with the Chrome automation extension — serve
  over `http://localhost` (a one-line Node static server is enough).
- **`curl` in this environment fails every HTTPS request with exit 35**
  (`CRYPT_E_REVOCATION_OFFLINE` — schannel can't reach the cert revocation
  server). It looks exactly like the remote host being down. Add
  `--ssl-no-revoke`. Worth knowing before concluding the Worker is broken.
- Old **localhost origins keep their own `localStorage`**, and copies served
  before 2026-08-01 auto-pulled the real dataset (the token was hardcoded then),
  so a stale but real financial snapshot can still be sitting on some
  `localhost:PORT` from a past session. Inert now — no passphrase, so it can't
  sync — but don't be alarmed to see real figures on a test server, and don't
  mistake one for live data.

## Docs

- `docs/current-status.md` — what's implemented, known gaps, verification notes.
  **Starts with a "State of play — read this first" block**: what is live, what
  the next session is, and the open carried-forward items. Read that before
  anything else.
- `docs/decisions.md` — why things were built the way they were.
- `docs/roadmap.md` — recommended next phases. The **next build's full spec sits
  at the top**, self-contained, because planning sessions write their plan to
  `~/.claude/plans/`, which is machine-local and NOT in the repo. Anything a
  future session must be able to execute from has to be copied into these docs.
- `docs/stitch-workflow.md` — the Stitch screen-port playbook; **read before
  touching any redesign screen.** It ties the scattered redesign lessons
  (mockup-outranks-code-export, global-primitives-first, presentation-only, the
  true-390px gap-list verify loop) into one procedure and links out to
  `design-system.md`/`ui-audit.md`/`ui-verification.md`. Its project-agnostic
  twin, `docs/stitch-ui-overhaul-playbook.md`, is meant to be copied into other
  repos.

Keep these updated at the end of any substantial session (see prior handover
in git history / conversation, not duplicated here).
