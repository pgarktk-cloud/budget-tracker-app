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
  contributions; `catId` matching a live goal id is the only discriminator,
  so a deleted goal silently reclassifies its contributions as transfers.
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
- `data.settings` is a small object for user-facing toggles that change
  *calculation* behavior (currently just `includeMp2EstimateInNetWorth`) —
  put future calculation-affecting toggles here, not as ad hoc top-level
  `data` fields.

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
`MORE_TABS` (More sheet), `HIDDEN_TABS` (reachable by code only; Forecast
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
  runners — **there are fifteen, run all of them**: `trendtest.cjs` (Home trend
  maths), `billstest.cjs` (bills reconciler), `budgettest.cjs` (carry-forward
  chain + copy-on-write + plan clone + category moves), `banktest.cjs` (bank
  interest accrual), `periodtest.cjs` (pay-period boundaries), `txordertest.cjs`
  (transaction display order + entry-stamp backfill), `ownertest.cjs`
  (per-profile ownership + `netWorthParts`), `suggesttest.cjs`
  (transaction-name ranking), `synctest.cjs` (per-setting merge resolution),
  `installmenttest.cjs` (installment schedule maths, derived Budget rows,
  payment/payoff/cancel/delete coupling, migration byte-equivalence),
  `importtest.cjs` (`validateBackup` accept/refuse cases), `backupslottest.cjs`
  (rotating pre-import safety slots + quota degradation), `mergetest.cjs`
  (two-device merge: per-category plans, `monthlyPlans`, `household.expenses`),
  `devicetagtest.cjs` (`headerSafe` against Node's real `Headers`), and
  `cloudguardtest.cjs` (the gate on documents arriving from the cloud).
  **Commit new ones** — `baltest.cjs`
  was written in-session, never committed, and is gone.
- **`sandboxworker.cjs`** serves a sandbox copy *and* impersonates the Worker's
  `/sync` endpoints, switching between a good and a deliberately corrupt
  document on the fly. It is how the cloud-validation branches (and the
  new-device and self-heal paths) get exercised without touching live data —
  usage is in its header comment.
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
  `localStorage`, is unconnected, and starts from `defaultData()` — just don't
  type the real passphrase into it. Nothing needs editing out of the file.
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
- **Nothing in this repo may be secret** — it's public, because GitHub Pages
  serves `index.html` from it. `SYNC_TOKEN`/`FINNHUB_KEY` are Cloudflare
  Worker env secrets read via `env` in `worker.js`; `PROXY_URL` is a plain
  public URL that authorizes nothing. Never reintroduce a credential literal.
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
- `docs/decisions.md` — why things were built the way they were.
- `docs/roadmap.md` — recommended next phases.

Keep these updated at the end of any substantial session (see prior handover
in git history / conversation, not duplicated here).
