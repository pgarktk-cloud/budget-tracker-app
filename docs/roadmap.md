# Implementation Roadmap

## ▶ PROGRAMME — planned 2026-08-14, fifteen items in phases

Planned in full on 2026-08-14. The plan file lives at
`~/.claude/plans/this-is-a-planning-radiant-waterfall.md`, which is
**machine-local and not in the repo** — so the phase list is reproduced here,
and anything a future session must execute from belongs in this file.

Ordering is risk-aware: the confirmed bug first, then the data-correctness gap
(behind new tests), then presentation. Each row is one deploy.

| Phase | Version | Risk | Theme |
|---|---|---|---|
| 1 | **1.42.0 — DONE** | low | Pull-gesture guard + sticky Settings header |
| 2 | **— DONE** | none | `dotest.cjs` — Durable Object e2e harness (tooling only) |
| 3a | 1.43.0 | med | `actualStarts` — tolerant readers, old writer |
| 3b | 1.44.0 | med | `actualStarts` — stamped writer + per-key merge |
| 4 | 1.45.0 | low | Header simplification + one sync sentence |
| 5 | 1.46.0 | low | Settings reorganised into accordion sections |
| 6 | 1.47.0 | med | Salary reconciliation (5b, spec below) |
| 7 | 1.48.0 | med | Customisable bottom navigation |
| 8 | 1.49.0 | low | Collapsible completed/healthy sections |
| 9 | 1.50.0 | low | Purchase Advisor result hierarchy |
| 10 | 1.51.0 | low | Focus Home mode |
| 11 | 1.52.0 | low | Type & touch-target pass |
| 12 | 1.53.0 | low | Draft/context preservation (add-transaction only) |
| 13 | 1.54.0 | trivial | Trim coach mark + wording |
| 14 | — | — | Mobile interaction review (after 1, 5, 7, 11) |
| 15 | — | — | Architecture proposal, document only |

**Must not be combined in one release:** 3b with any other synced-data change ·
6 with 7 (both on hourly-use tabs) · 5 with 7 (ship the Settings container
before its contents) · 11 with anything functional (hundreds of style lines) ·
15 with anything, ever.

**Decisions taken 2026-08-14, for the phases not yet built:**

- **3a/3b — `actualStarts` merges as per-entry stamped records** with an
  explicit tombstone, `{v:"YYYY-MM-DD"|null, updatedAt}`, per-key newest-wins
  like `trimPolicy`. `trimPolicy`'s explicit-`false` trick does not transfer:
  the value is a date, not a boolean. **It ships over two releases** because
  `migrate()` currently deletes any non-date value from the map — an old build
  receiving the new shape would strip every correction and push the stripped
  copy back. 3a makes readers and `migrate()` tolerant; 3b starts writing.
  **Do not ship 3b until both phones report 1.43.0.**
  `mergeActualStarts` must be defined between `function mergeArrayById(` and
  `/* Full cross-field auto-merge` — `synctest`, `mergetest` and `purchasetest`
  all slice that region by text — and applied **after** `mergeSettingPaths`,
  which overwrites `payPeriods.<owner>` wholesale. Sort its keys: `payPeriods`
  is fingerprinted un-canonicalised through `...rest`, so key order is
  load-bearing for the dirty flag.
- **7 — nav preferences are synced per owner**, `data.navTabs` as a stamped map
  (same shape as `trimPolicy`, so it gets the merge for free), **not** defaulted
  in `migrate()`. The active list follows the device's remembered default person
  (`PROFILE_KEY`), not `profile` (can be `"household"`) and not `budgetOwner`
  (flips during ordinary Budget use) — either would rearrange the bar mid-use.
  Home **is** removable; More renders active whenever the open tab is not among
  the chosen five. `TAB_ORDER` stays static — it only drives slide direction.
- **10 — Focus Home is `data.homeSettings.focusMode = {me,wife}`**, chosen
  because `homeSettings` is already a `SETTING_PATH`: no new merge function, no
  new backup key, no `fingerprint` touch point.
- **11 — no new "saved idea" collection.** The Advisor already has two durable
  exits (a Goal via `startSaving`, an Installment via `openCreate`); a record
  that is neither is one nobody acts on. A parked idea, if ever wanted, is a
  Goal with no monthly.
- **12 — accordion sections in one sheet**, not sub-sheets: seven sections is
  under the threshold where an index earns its second tap, and sub-sheets would
  multiply the nested-scroll-lock surface that has already bitten twice. No
  search field.

### Phase 2 as built (2026-08-14)

All twelve planned cases, exactly as specified, 12/12 green. Four local
`wrangler dev` instances: the ordinary path, one with no `SYNC_TOKEN`, one with
the legacy KV keys pre-seeded, one with `ALLOC_KV` unbound. Case 8 merges
through the shipped `tryAutoMergeAll`, sliced out of `index.html` the way
`mergetest.cjs` does.

**Proven able to fail**, which is the only thing that makes a green run mean
anything: three defects injected into `worker.js` — the compare-and-swap
removed, `/sync/meta` leaking the document, the KV mirror made to gate the
write — and exactly the predicted five cases (3, 6, 7, 8, 11) went red.
`worker.js` restored byte-identical.

**The production cross-check the plan called for is only half-runnable, and
that is inherent.** The room name is hardcoded `"household"`, so there is no
throwaway document on the deployed Worker and no POST may be aimed at it. The
read-only half was run and matches local exactly: 401 on all four endpoints
with a wrong token, the allowed/disallowed/localhost origins, `Vary: Origin`,
and the preflight's allowed headers. Everything else stays local-only unless a
future change gives the Worker a second room name — which is not worth doing
for a test.

## ▶ NEXT SESSION — 5b, salary reconciliation

The Purchase Advisor is finished and engine-only (A · A2 · A3 · C1; B and C2
were removed — see below). Nothing is half-built, so this is a clean start.

**What 5b is:** the Expenses unaccounted sheet (`UnaccountedSheet`) shows where a period's salary actually went. It shows
*actuals* only. 5b puts the **planned** figure beside each line, so the sheet
answers "did this period go the way I intended" rather than only "where did it
go".

**Read this before designing it — it is the trap 5a-2 left behind.** A transfer
through a category with a `goalId` counts as a **Goal contribution**, not
"Transfers out". Both lines subtract, so the sheet still reconciles — but
hand-summing untracked envelopes against "Transfers out" is now short by
whatever went through a linked category. Any "planned vs actual" arithmetic has
to classify those rows explicitly or it will not balance, and the imbalance will
look like a data problem rather than a classification one.

**Other classification rules that must be honoured** (all in CLAUDE.md, all
already load-bearing elsewhere):

- `isExtraFunds` rows are money coming **IN**, stored as ordinary expenses. Any
  new reduce over `expenses` must classify them explicitly — treating them as
  spending is what once made "salary not yet spent" go *down* when money
  arrived.
- `isTransfer` is set by untracked transfers **and** goal contributions **and**
  installment payments. An installment payment funded from a category
  (`fundedCatId`) inverts the usual shape: `catId` is the category and
  `isTransfer` is **false**.
- The planned side must come from `resolvePlanForMonth` + `livePlanView`, never
  from `activePlanId` directly — a past period may have materialised its own
  plan, and the whole point is comparing against what was planned *then*.

**Suggested shape**, consistent with how this app already works: a pure
module-scope function taking `(plan, expenses, bucketKey, payPeriods, owner)`
and returning per-line `{planned, actual, delta}`, sliced and unit-tested the
way `unaccountedParts` already is. Do not compute it inside the component.

**Where to start:** read `unaccountedParts` and the existing `UnaccountedSheet`
render, then write the test first — this is arithmetic over a classifier that
has bitten three times already.

## 🗑 Purchase Advisor Builds B and C2 (Gemini narration) — REMOVED 2026-08-08, v1.41.0

Built, deployed, iterated five times, then deleted. Every guard held; it was
removed for not earning its place, which was the stated criterion when C2 was
chosen over a deterministic ranker.

**Do not rebuild it from scratch.** The working design is in git at v1.40.0 —
reviving it is a revert, not a rebuild. Read `decisions.md` first: the five
real-use defects, the reasoning behind each guard, and why the last one was
unfixable in principle (the model is never given a calendar date, so it could
not answer "when can I buy it" — that answer had to come from the engine).

Two of the five fixes were app-side and were **kept**: the magnitude of a real
figure counts as that figure, and the picked option renders the engine's own
numbers.

The spec that follows this section is the record of what was agreed and built.
It is kept for the reasoning, not as a plan.

---

## ✅ Purchase Advisor C1 (the options engine) — DONE 2026-08-08, v1.37.0

Shipped and deployed. `purchaseSaveableBuckets` (the current period no longer
counts toward what you can still save), `data.trimPolicy` (nothing is
suggestable until marked, category → group → false), `purchaseOptionsFor` (the
ranked options), and option cards with one-tap apply into the existing What-if
levers. `purchasetest.cjs` 52 → 70. See `current-status.md` for the session
note and `decisions.md` for the three rules it established.

---

## 📄 Purchase Advisor Build B — the spec, for the record (REMOVED v1.41.0)

Shipped and deployed: Worker version `2897b1d2` first, then Pages build
`2026.08.07.0009`, and removed again in v1.41.0 — its runners went with it. See
`current-status.md` for the session note and `decisions.md` for the reasoning.

The spec below is kept as the record of what was agreed and what was built. It
was followed as written, with three additions the sandbox forced: the engine's
own verdict is now sent explicitly (it was crossing the wire as `""`, leaving
the model to judge for itself what counts as "thin"), the client carries its
own 25s timeout above the Worker's 20s, and component-body declaration order is
pinned by test after two temporal-dead-zone crashes.

Two deviations from the spec as written, both deliberate:

- **`rehydratePurchaseRefs` returns SEGMENTS, not React nodes.** The spec said
  "a React fragment array"; segments (`{t:"text"|"ref", v}`) keep the function
  a pure unit testable outside a browser, and let the caller choose the
  emphasis element. The guarantee the spec was protecting — an array, never a
  concatenated HTML string, no markdown renderer, no `dangerouslySetInnerHTML`
  — holds exactly as stated. `aitest.cjs` case 4 asserts it.
- **`buildPurchaseAiContext` takes one options object**, not
  `(scenarios, stack, input)`. It needs the current bucket, the pay-period
  config and the verdicts as well; the app's other multi-argument pure helpers
  (`purchaseAvailableStack`) already take an object.

### The original spec, as executed

Everything needed to execute is in this section. The original grilling plan is
at `~/.claude/plans/i-want-to-plan-majestic-pancake.md`, but that path is
machine-local and outside the repo — **treat this section as the spec**, and
note that the engine has changed since that plan was written (see "What
changed" below).

Build B was the **only** piece that touches `worker.js`, `wrangler.jsonc` or a
secret. Builds A/A2/A3 deliberately touched none of them. In the event
`wrangler.jsonc` needed no change at all — the caps went onto the existing
`SyncRoom` — so a deploy still cannot unbind `SYNC_ROOM` or `ALLOC_KV`.

### What it is, and what it is not

A **one-shot structured narration** of the engine's output. No chat, no
conversation state, no history, no model escalation, no grounding. The model
never computes anything: it receives figures that are already correct and
explains them. Build A remains the feature — B is commentary on it, and every
failure path renders the cards without prose.

### Why the free tier is disqualified

ai.google.dev/gemini-api/docs/pricing: free-tier content **is** used to improve
Google products; paid tier explicitly is not. This document is the household's
entire financial life, so paid only. `gemini-3.5-flash-lite` at $0.30 in /
$2.50 out per 1M tokens; at ~3k in / ~600 out that is roughly **$0.001 a call**,
so the caps below exist to bound a runaway loop, not to ration normal use.

### Worker — `POST /ai/advice`

Added after the `/sync` block, behind the **existing** `authOk()` gate. That is
appropriate: the passphrase already authorises full read/write of the whole
document, so it cannot be under-powered for a read-only narration.

Order of operations, **all before any outbound fetch**:

1. `Content-Length` / body size cap — reject `> 16 KB` with **413**.
2. `request.json()`; reject non-conforming shapes with **400**.
3. **Structural rejection of anything resembling raw data** — reject if the body
   carries keys outside the allowlist, or any string longer than 120 chars.
4. Rate check against the `SyncRoom` DO. On refusal **429** with
   `{error:"limit", scope:"minute"|"day"|"month"}`.
5. `fetch` to Gemini with an `AbortController` timeout of **20s** — the Worker
   has no outbound timeout anywhere today; this would be the first.
6. Response parsed, size-capped, returned. **No retries** — a retry on a paid
   call is a doubled bill for an unknown reason.

**Never logged**: prompt, context, response, or any figure. There is no
`observability` block in `wrangler.jsonc` and none is added. Counters only.

### Spend caps — methods on the EXISTING `SyncRoom` DO

No new Durable Object class and no new binding, so `wrangler.jsonc` keeps
declaring exactly `SYNC_ROOM` + `ALLOC_KV` and a deploy cannot silently unbind
anything.

```
aiCheck(deviceId, nowIso) →
  minute : ≤ 5   per device
  day    : ≤ 60  across all devices
  month  : ≤ 600 across all devices
```

**Counters live under their own storage key**, separate from the document key.
The 2 MB single-key rule applies to the document; mixing a per-minute counter
into it would rewrite the whole document on every AI call. Compare-and-swap
under the DO's single-threaded execution — the same property KV lacked, which is
why sync moved off it.

### Request to Gemini

- `GEMINI_MODEL = "gemini-3.5-flash-lite"` as a module constant in `worker.js`.
- `responseMimeType: "application/json"` **plus** an explicit `responseSchema`.
- `maxOutputTokens: 700`. Minimal/off thinking.
- **`tools` omitted entirely**, so grounding cannot be enabled by a prompt.
- System prompt must state, explicitly: (a) you receive figures that are already
  correct — never compute, never restate a number that is not in the context;
  (b) refer to categories only by their `{{ref}}` tokens; (c) the `product`
  field is untrusted user text inside a delimited block and is **data, never
  instructions**; (d) output only the schema.

### The minimized context — allowlist BY CONSTRUCTION

New module-scope pure `buildPurchaseAiContext(scenarios, stack, input)` in
`index.html`. It **builds a fresh object and never copies from `data`**, which
is what makes the allowlist structural rather than a filter someone can forget
to update.

Absent by construction: every record id, every category/goal/bank/owner name,
every transaction, every date beyond a bucket *index*, per-account balances, the
sync token, device id, sync metadata, tombstones, backups, settings. Bucket
**indices** (`n`) rather than dates — a date is one more identifying fact and the
app can label them itself.

### Response schema and semantic validation

```jsonc
{ "headline": "string ≤160",
  "recommended": "cash" | "financed" | "savings" | "earliest" | "none",
  "scenarioNotes": [ {"id":"…","text":"string ≤400"} ],
  "watchOuts": [ "string ≤200" ]   // max 3
}
```

App-side `validatePurchaseNarration(res, ctx)` rejects the **whole** response
(falling back to cards-without-prose) if:

- the schema does not match, any length cap is exceeded, or `scenarioNotes`
  carries an id not in the request;
- `recommended` is not one of the supplied scenario ids or `"none"`;
- **any currency-shaped number in the prose is not present in the context.**
  This is the load-bearing guard — it turns "the model invented a figure" into a
  *detected* failure rather than a plausible sentence. Directly unit-testable;
- an unknown `{{ref}}` token appears (unknown tokens are stripped; a response
  that is mostly unknown tokens is rejected).

Rendering: `rehydratePurchaseRefs(text, refMap)` returns a **React fragment
array**, never a string, splitting on `{{refN}}` and emitting real names as text
nodes. **No markdown renderer, no `dangerouslySetInnerHTML`** — the app has
neither today, and adding one is the only way to create an XSS here.

### Failure behaviour — the feature still works in every case

| Condition | Behaviour |
|---|---|
| Offline / `!isOnline` | Button hidden. Cards unchanged. |
| Not connected (`!KVSync._ready()`) | Button hidden — same gate as `fetchQuotes`. |
| 429 limit | "Explanations paused — daily limit reached." Cards unchanged. |
| Timeout / 5xx / prepaid balance exhausted | "Couldn't generate an explanation." + retry button. Cards unchanged. |
| Validation rejection | Render cards without prose + a subtle "explanation unavailable". **Never render an unvalidated response.** |

### Disclaimers

- Persistent header on the panel: **"Explanation — written by AI from the
  figures above. The figures themselves are calculated by the app."**
- Every number the user sees comes from the engine's render path, never from the
  model's text. Uncertainty is expressed by the engine (`savings.mode ===
  "beyondHorizon"` → "not reachable within two years"), not narrated.
- The model is read-only. It never calls `setData` and never proposes a
  mutation.

### What changed in the engine since the plan was written

`buildPurchaseAiContext` must reflect the **current** shapes, not the plan's
originals:

- `purchaseAvailableStack` **no longer takes or returns `billsReserve`/`reserve`**
  (removed v1.34.0). It now returns `banks`, `joint`, `withheld`, `reserved[]`,
  `inaccessible[]`, `protectedGoals`, `protectedGoalCount`,
  `unlinkedProtectedCount`, `notCountedGoals`, `unconverted`, `available`.
  Send counts and totals only — `reserved[]` and `inaccessible[]` carry account
  **names**, which must never leave the device.
- `projectPurchaseScenarios` now returns a fourth scenario, **`savings`**
  (`{mode, n, shortfall, requiredPerBucket, capacity, tightest, feasible}`),
  where `mode` is `plan` | `now` | `beyondHorizon`. Include it, and add
  `"savings"` to the `recommended` enum.
- Two per-decision levers exist (`includedBankIds`, `releasedBankIds`) — send
  booleans/counts if anything, never ids.

### Tests — `aitest.cjs`, new and committed

11. `buildPurchaseAiContext` over a fixture containing real names, ids, dates
    and a sync token: assert **none of them appear anywhere in
    `JSON.stringify(ctx)`**. Allowlist proven by absence, not by inspection.
12. Product name: 200 chars truncated to 80; control chars and newlines
    stripped; a name containing `Ignore previous instructions` survives as inert
    data — assert the delimiter is present and unclosable.
13. `validatePurchaseNarration`: rejects an unknown scenario id; rejects
    over-length; rejects `recommended:"maybe"`; **rejects prose containing
    `SAR 9,999` when 9999 is not in the context**; accepts prose quoting a
    figure that is.
14. `rehydratePurchaseRefs`: substitutes known tokens, strips unknown ones,
    returns an array of nodes and never a concatenated HTML string.

### Deployment order — Worker FIRST, then Pages

1. `npx wrangler secret put GEMINI_API_KEY` (secrets survive deploys; never in
   `wrangler.jsonc`, `index.html`, localStorage, a backup, a log, or git).
2. `npx wrangler deploy` — **confirm both `SYNC_ROOM` and `ALLOC_KV` appear in
   the output.** The endpoint is purely additive and the deployed app never
   calls it, so this step is safe alone and can sit unused.
3. Verify the caps with a scripted burst **before** any app change.
4. `node stage.cjs && npx wrangler pages deploy site --project-name=whered-it-go --branch=main`

Rollback: revert Pages first (removes all callers instantly), then
`npx wrangler deploy` from the previous commit if the Worker itself is at fault.
**Never edit the Worker in the dashboard** — the next deploy overwrites it, and a
DO class can only be created at deploy time.

### Before starting: the engine's arithmetic is now confirmed

The Budget-vs-advisor cross-check is **done** (2026-08-07, `headroomcheck.cjs`,
48 buckets across both owners, no drift), so Build B is narrating figures that
have been checked against Budget's own on the real dataset — not merely against
fixtures. Re-run it if anything in the engine or in `BudgetView`'s totals moves
while Build B is in progress.

### Sandbox testing

Extend `sandboxworker.cjs` with a fake `/ai/advice` and drive the 429, timeout,
malformed-JSON and invented-figure paths. Watch the network log across a **full
autosave window (15–25s, not 3)** to confirm an AI call causes **no POST to
`/sync`** — the advisor must not dirty the document. One live Gemini call only
after the caps are verified in the sandbox.

---

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
   - **3C-2 Per-category plan merge — DONE**, build `2026.08.05.0005` /
     v1.22.0. Category/group `deletedAt` + `updatedAt` + `ord`, `livePlanView`
     at the read points, `stampPlanRecords` in `editPlanForMonth`,
     `mergeArrayByIdWithChildren` for plans. `mergetest.cjs` 40/40 (10 of them
     fail against the pre-fix code). See `current-status.md` / `decisions.md`.
   - **3C-3 `payPeriods.actualStarts` — deferred with 3C-2**, same reason:
     clearing an override *deletes the key* by design, so a union merge would
     resurrect a cleared correction. Needs the same "how is a deletion
     represented" answer.
4. **Faster transaction entry** — split in two:
   - **4a Repeat + autofocus — DONE**, build `2026.08.06.0001` / v1.24.0.
     `recentTxTemplates` at module scope, a Repeat chip row that refills
     category + title + amount in one tap, conditional autofocus, and a fix to
     the pre-existing `isExtraFunds` leak in the older name chips.
     `suggesttest.cjs` 26/26. See `current-status.md`.
   - **4b-1 Rapid entry with undo-on-save — DONE**, build `2026.08.06.0002` /
     v1.25.0. "Save & add another" keeps the sheet open, carries category+date,
     clears title/note/amount, and the undo toast gained `undoKind:"remove"` so
     it can reverse an *add*. `addExpenseTx` now returns the new id. Tracked
     mode only — see `current-status.md` for why Goals/Untracked are excluded.
   - **4b-2 A synced `txTemplates` collection — DONE**, build
     `2026.08.06.0003` / v1.26.0. Pinned shortcuts in their own chip row,
     deduped against Repeat via `excludeKeys`, idempotent pinning that revives
     a tombstone rather than twinning it, unpin through the existing undo
     toast. `templatetest.cjs` (17/17). **Note the eighth touch point the list
     below missed: `BACKUP_ARRAY_KEYS` *and* `BACKUP_OPTIONAL_KEYS`** — since
     v1.23.0 `validateBackup` gates every cloud pull, so a new collection
     absent from OPTIONAL_KEYS would make an upgraded device refuse the other
     phone's document. See `current-status.md`.

   **Build 4 is complete.** Constraints kept here because they remain true of
   this area of the code:
   - ~~`rankNameSuggestions` already does the ranking the chips need~~ — still
     true, and `recentTxTemplates` now sits beside it for the whole-transaction
     case. Extend one of those two; don't write a third matcher.
   - ~~Chips fill the **name only**, deliberately.~~ **Resolved 2026-08-06 by
     not changing it**: the name chips still fill the name, and Repeat is a
     separate control that fills everything. Two controls, two honest meanings.
   - **Focus must be synchronous inside the user gesture** or iOS won't raise
     the keyboard, and `select()` must be deferred one tick or React's commit
     collapses the selection. `focusField` in `ExpenseTrackerView` already does
     both — reuse it rather than calling `focus()` directly.
   - Every numeric field is a `NumField`; rapid entry needs `live` on anything
     a submit button reacts to, since a disabled button eats the blur. Note the
     add-transaction **Amount field is not a `NumField`** — it is a hand-rolled
     string-draft input with the same commit-on-blur/`evalMathExpr` behaviour.
     Leave it or convert it deliberately; don't half-convert it.
   - An expense's `createdAt` is stamped once at insert and never re-stamped,
     and an absent `ord` is meaningful (see `compareTxForDisplay`). Rapid entry
     must not default `ord` to a number.
   - `txTemplates` would be a new synced collection: it needs `defaultData`,
     `migrate`, `fingerprint`, `tryAutoMergeAll`, `CONFLICT_COLLECTIONS`,
     `countPendingChanges` and `purgeOldTombstones` — the same seven touch
     points `installments` needed. Emit it from `fingerprint()` **only when
     non-empty**, so adding it costs existing documents no KV write.
5a. **Category → goal link** — split in two:
   - **5a-1 One contribution path — DONE**, build `2026.08.06.0004` / v1.27.0.
     The Goals tab's "Add money" and Home's sheet are real transfers now, not
     goal-only edits; all three paths go through `contributeToGoal` and write
     both records in ONE `setData`, linked by id. `addContribution` deleted.
     `goaltest.cjs` (19/19). See `current-status.md`.
   - **5a-2 The `category.goalId` link — DONE**, build `2026.08.06.0005` /
     v1.28.0. Optional `goalId` on **untracked** categories only; the picker
     lives in the Budget chevron panel and the link is surfaced on the Expenses
     untracked card ("Also credits …"). `applyGoalContribution` gained a `catId`
     override so the row keys to the CATEGORY; `categoryGoalFor` resolves the
     link *before* the write so a deleted goal degrades to a plain transfer
     instead of swallowing it; `quickTransfer` became one write.
     `goaltest.cjs` 19 → 27. See `current-status.md`.

     **The classification decision, made deliberately:** a linked transfer
     counts as a **Goal contribution**, not "Transfers out". Both lines subtract
     so the unaccounted sheet still reconciles, but hand-summing untracked
     envelopes against "Transfers out" is now short by whatever went through a
     linked category. **5b must account for this.**
5b. **Salary reconciliation** — planned figures beside the actuals in
   `UnaccountedSheet` (supersedes the "Next up" section below).

### Manual two-device verification — DONE 2026-08-05
Both owners ran the full protocol on two real phones against the live Worker on
build `2026.08.05.0006`: headline per-category merge, delete-not-resurrected,
reorder survival, `monthlyPlans`, `household.expenses` both directions, the
Settings sync wording, and the import preview + upload hold. All passed. The
airplane-mode recipe is what makes it reproducible — without it `pushImportant`
and the 8s autosave upload before the second device can diverge. Details in
`current-status.md`.

Two things learned worth reusing:
- **The import path can be tested safely on live data** by re-importing a backup
  the same device just exported — identical bytes, so Replace is a no-op while
  still exercising the hold and the layout.
- **The conflict modal could not be reached**, deliberately or otherwise. It is
  now an exception path only. Don't schedule work to "test" it; if it appears,
  `tryAutoMergeAll` threw.

### Follow-up opened by the v1.22.1 device-name bug
- ~~**A sync failure is undiagnosable from a phone.**~~ **DONE 2026-08-05**,
  build `2026.08.05.0007` / v1.22.2 — the Settings status row now shows
  `lastSyncError` and `KVSync.lastStatus` under "Sync failed", in monospace.
  Nothing there is secret (an exception message or an HTTP status; the
  passphrase is in neither). Verified by pointing a sandbox copy's `PROXY_URL`
  at an unreachable host, which rendered `Failed to fetch` — reuse that recipe,
  it is the only way to reach the thrown-fetch branch without breaking the real
  Worker.
- **Nothing else that reaches a header or URL is sanitized.** `headerSafe()`
  fixes `X-Device-Id`. Audit for any future header/query value built from user
  text before it ships, rather than after.

### Follow-ups opened by build 3B
- **Remove the KV mirror**, once there is no intention of rolling back. Until
  then the Worker writes every accepted save to KV as well as the Durable Object.
  Cheap, but it is duplicated state and should not become permanent by accident.
- **The DO handler has no automated test.** It needs `wrangler dev` plus a test
  harness this repo doesn't have. Covered by cutover verification only — do not
  let that be mistaken for coverage.
- ~~**`SYNC_KV` namespace is unexplained.**~~ **LOOKED AT 2026-08-05.** Confirmed
  it still holds exactly the two `user:data:<uuid>` keys and is genuinely dead:
  `SYNC_KV` appears nowhere in `worker.js` or `index.html`, and the Worker reads
  only `ALLOC_KV`, `SYNC_ROOM`, `SYNC_TOKEN`, `FINNHUB_KEY`. **Left in place** —
  deleting is the account owner's call and is irreversible. The keys predate
  2026-08-01, so they fall under "assume it may already be public" below rather
  than being a fresh exposure. Delete when convenient; nothing depends on them.
  (Trap: Wrangler 4 defaults `kv key list` to *local* state — without `--remote`
  both namespaces read as empty, which looks like the mirror never ran.)
- **The Worker is no longer dashboard-managed.** Editing it in the dashboard
  editor would be overwritten by the next `npx wrangler deploy`. Deploy from the
  repo.

### Follow-ups opened by build 2
- ~~**The import hold has no second slot.**~~ **DONE 2026-08-05**, build
  `2026.08.05.0003` / v1.20.1 — two rotating labelled slots with quota
  degradation. `backupslottest.cjs` (14/14).
- ~~**Nothing re-validates a document arriving from the cloud.**~~ **DONE
  2026-08-05**, build `2026.08.05.0008` / v1.23.0 — `cloudDocProblem()` gates all
  three pull paths, reusing `validateBackup` minus its warnings.
  `cloudguardtest.cjs` (19/19). **Deployed and confirmed on a real phone
  2026-08-06**, with the Settings sync row reading normally — i.e. the live
  document passes `validateBackup` and the gate is inert on real data. See
  `current-status.md`.

### Follow-up opened by build 1
- ~~**The conflict modal has three buttons and two outcomes.**~~ **DONE
  2026-08-05**, build `2026.08.05.0008` / v1.23.0 — `resolveKeepLocal` deleted,
  two buttons left (Use Cloud / Save Local to Cloud). The modal is still
  unreachable in normal use, so this changed no observed behaviour.

### Follow-ups opened by the cloud-validation build (v1.23.0)
- **A corrupt cloud document cannot be repaired from the app.** Pushing is
  blocked while the cloud copy is unreadable, on purpose: a compare-and-swap
  against a document we can't parse isn't a phone decision. But that means the
  only repair is at the Worker/KV level. A "replace the cloud copy with this
  device's data" escape hatch would need to force the rev, which is a genuinely
  dangerous button — design it deliberately or not at all. Not reachable today
  by anything short of real corruption.
- **`cloudDocProblem` is only as good as `validateBackup`.** Both now sit on the
  critical path for *every* pull, not just imports, so tightening one rule there
  can lock two honest devices out of each other. The forward-compatibility case
  (a newer build's unknown collections must pass) is asserted in
  `cloudguardtest.cjs` — keep it green.

## Purchase Advisor — A, A2, A3 and B all DONE

Follow-on fixes found by using it on real data:

- **Bills Reserve removed from the advisor — DONE**, build `2026.08.07.0007` /
  v1.34.0. It is household-wide while the advisor is per-owner, so it was
  subtracted in full from each person independently. `purchasetest.cjs`
  asserts passing `billsReserve` is now inert.
- **Bills Reserve double-count repaired — DONE**, build `2026.08.07.0008` /
  v1.35.0. Bill rows were generated per device with `uid()` and merged by id,
  so every tracked bill was counted twice. `billRowId` + `dedupeBillRows` +
  a `migrate()` repair. `billstest.cjs` 11 → 23. See `decisions.md`.

Plan for A2/A3 at `~/.claude/plans/greedy-crunching-sprout.md` (grilling session
2026-08-07, prompted by testing v1.31.0).

- **A2 — account flags, goal deadlines, cached FX — DONE**, build
  `2026.08.07.0005` / v1.32.0. Four new fields (`banks[].accessible`,
  `banks[].purpose`, `goals[].bankId`, `goals[].deadline`), none defaulted in
  `migrate()`; `goalDeadlineStatus`; Banks controls + badges; Goals deadline,
  owner-scoped account picker and on-track verdict; `rates`/`ratesAt` cached in
  `data` and excluded from `fingerprint()`. Nineteen runners green, sandbox
  sync verification done, deployed. See `current-status.md`.
- **A3 — the advisor consumes them — DONE**, build `2026.08.07.0006` / v1.33.0.
  `purchaseAvailableStack` rewritten to per-bank withholding with
  `withheld = max(reserved, claimed)`; the three `bankId`-resolution rules;
  `purchaseBucketsBetween` + `purchaseSavingsPlan` giving the "Save up for it"
  card its date-driven mode; `includedBankIds` and `releasedBankIds` as
  per-decision levers; "Start saving the X" creating a Goal targeted at the
  **shortfall** with a monthly derived through `goalDeadlineStatus`.
  `purchasetest.cjs` 52/52, nineteen runners green. Deployed. See `current-status.md`.

  A2 shipped its Banks controls with copy describing A3's behaviour in the
  present tense, so the flags appeared broken until this build. Recorded in
  `decisions.md` — don't split a feature so the visible half lands first.

## Purchase Advisor — Build A DONE (2026-08-07, v1.31.0) · Build B DONE (v1.36.0)

Planned in a grilling session 2026-08-07; plan at
`C:\Users\arjas\.claude\plans\i-want-to-plan-majestic-pancake.md`.

- **Build A — the engine + tab — DONE**, build `2026.08.07.0004` / v1.31.0.
  Module-scope pure engine after `installmentSummary`, `PurchaseAdvisorView` +
  `PurchaseTrimSheet`, the `advisor` tab in all four places,
  `PURCHASE_DRAFT_KEY` in `localStorage`. Touches no synced data at all.
  `purchasetest.cjs` 35/35, all nineteen runners green, staged, **not
  deployed**. See `current-status.md` / `decisions.md`.
- **Build B — Gemini narration — NOT built and not started.** `POST /ai/advice`
  in `worker.js` behind the existing `authOk()`, spend caps as methods on the
  existing `SyncRoom` DO under their **own** storage key (never mixed into the
  document key), `AbortController` at 20s, no retries, `tools` omitted so
  grounding cannot be prompt-enabled, and an app-side
  `validatePurchaseNarration` whose load-bearing rule is *any currency-shaped
  number in the prose must be present in the context*. The free Gemini tier is
  disqualified on privacy (free-tier content is used to improve Google
  products; paid explicitly is not). No markdown renderer — the app has no
  `dangerouslySetInnerHTML` or `innerHTML` anywhere, and adding one is the only
  way to create an XSS in this feature.

**Carried-forward actions from Build A**

- ~~Cross-check the advisor's headroom against the Budget tab on the real
  dataset.~~ **DONE 2026-08-07** — `headroomcheck.cjs`, now committed, drives
  the advisor's `purchaseHeadroomForBucket` and the sliced `BudgetView` "Left"
  expression over a real backup: **48 buckets, both owners, no drift**. It is
  tooling rather than a runner (it needs a backup file that may not be
  committed) — run it by hand whenever either side's arithmetic is touched. See
  `current-status.md`.
- The trailing-actuals warning (`purchaseHistoryWarning`) is dark until
  ~Oct 2026. Re-check it the first period it appears — same action the two Home
  trend cards already carry.

**Consciously deferred:** goal deadlines · multi-currency · household scope ·
chat and history · grounding · automatic discretionary detection · applying a
recommendation as app changes · stored or synced analyses · a Home card.

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

## Mobile usability programme (scoped 2026-07-30) — all six steps DONE
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
5. **No Content-Security-Policy — but the blocker changed on 2026-08-06.** The
   reason used to be that GitHub Pages cannot set response headers. **Cloudflare
   Pages can**, via a `_headers` file, so a real CSP is now *possible* for the
   first time. What remains is that Babel's in-browser JSX compilation needs
   `unsafe-eval`, which makes any CSP weak — so this is still most valuable
   alongside a build step, where dropping Babel and adding a strict CSP become
   the same piece of work. A `_headers` file is worth adding regardless for
   cache-control.

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
