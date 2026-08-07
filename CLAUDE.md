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
  that period really began — always a `YYYY-MM-DD` string (the old `"pending"`
  sentinel was removed 2026-07-31; `migrate()` sweeps any non-date value out).
  `shiftPeriod` is pure payday arithmetic and ignores overrides — identity and
  extent are different questions. Views call the `bucket*` wrappers, which hand
  the whole owner **config** down to the `period*` layer; never pass a bare
  `payday` to those. Invariants: an empty `actualStarts` short-circuits to
  the nominal answer (so untouched data costs what it always did — which is why
  clearing an override *deletes* the key rather than storing the nominal date);
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

## Navigation

Tabs live in three module-scope lists — `PRIMARY_TABS` (bottom bar),
`MORE_TABS` (More sheet — Net Worth, Goals, Installments, Purchase Advisor,
Bills, Household, Currency), `HIDDEN_TABS` (reachable by code only; Forecast
sits here). `TAB_ORDER` is derived from all three, so a new tab cannot be
added without landing in the slide-direction tracker. Labels/icons come from
the single `TAB_META` registry (`short` is bar-only). z-index ladder:
bottom nav 30 → FAB 35 → sheets/modals 40 → undo toast 80.

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
  runners — **there are nineteen, run all of them**: `trendtest.cjs` (Home trend
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
  BudgetView expression, per-bank withholding, the savings plan, and three
  source-structure assertions pinning "touches no synced data" and "never
  materialises a plan").
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
  nineteen" sweep must not include it. It cross-checks the Purchase Advisor's
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
  retry loop in the app. Its `GOOD` document is also deliberately sparse, which
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

Keep these updated at the end of any substantial session (see prior handover
in git history / conversation, not duplicated here).
