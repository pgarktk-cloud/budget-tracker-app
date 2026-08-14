# Current Status

_Last updated: 2026-08-14 (phases 2, 3a and 3b all done — `dotest.cjs`, then
v1.43.0 and v1.44.0: `actualStarts` merges per key, verified on both phones)_

## State of play — read this first

**BUILT, not deployed: v1.48.0 / build `2026.08.14.0007`** — phase 7,
customisable bottom navigation. Each person picks and orders which five tabs sit
on the bar (Home removable), edited in a new **Navigation** section in Settings.
`data.navTabs` is a stamped per-owner map mirroring `trimPolicy` exactly (reuses
`mergeTrimPolicy`, emitted from `fingerprint` only when non-empty, checked in
`validateBackup`, not defaulted in `migrate`). New runner `navtabtest.cjs`
(19 cases); `settingstest.cjs` 6→7 sections; **all 25 runners green**,
parse-check clean, and verified in a browser (default bar, editor + cap, live
bar update on reorder, correct `{v,updatedAt}` persistence, per-owner
separation). **Next step: deploy** —
`node stage.cjs && npx wrangler pages deploy site --project-name=whered-it-go --branch=main`
(Worker untouched), then confirm on both phones. See `roadmap.md` "Phase 7 as
built".

**Live: v1.47.0 / build `2026.08.14.0006`**, deployed 2026-08-14 (`c945dd55`)
— phase 6. Confirmed on the production origin: all three version sites agree,
`reconcilePeriod` and `reconcileSentence` are served, the old `useMemo`
classifier is gone and the unmatched line is present. Worker untouched
(`d8b5b9ad`).

**Previously live: v1.46.0 / build `2026.08.14.0005`** (`621df4dd`)
— phase 5. Confirmed on the production origin: all three version sites agree,
all six sections are served in order, `section` is a helper and every panel
starts closed. Worker untouched (`d8b5b9ad`).

**Previously live: v1.45.0 / build `2026.08.14.0004`** (`f64dec0b`)
— phase 4, the header. Confirmed on the production origin: all three version
sites agree, `SyncSheet` and `syncPill` are present, and the old instruction
line and header income field are both gone. Worker untouched (`d8b5b9ad`).
**Not yet seen on either phone** — worth a look, since the header is the screen
you see most and this is the first release to change it.

**Previously live: v1.44.0 / build `2026.08.14.0003`** (`174db319`)
— phase 3b. Confirmed on the production origin: all three version sites agree,
and `mergeActualStarts`, `withMergedActualStarts`, `tombstonedActualStarts` and
`actualStartValue` are all present in the served file. The Worker was not
touched, so `d8b5b9ad` still stands.
**Confirmed on both phones, and all three two-phone merge scenarios pass**
(2026-08-14): different periods corrected on each phone both survive; the same
done offline and reconnected one at a time both survive; and a clear on one
phone stays cleared when the other — still holding the old value — syncs after.
That third one is what the tombstone exists for, and it is the first time the
corrections map has ever been proven to reconcile.

**Previously live: v1.43.0 / build `2026.08.14.0002`** (`537a5e51`), phase 3a,
confirmed on both phones — which is what unblocked 3b.

**Previously live: v1.42.0 / build `2026.08.14.0001`** at
https://whered-it-go.pages.dev, Worker version `d8b5b9ad` (unchanged — v1.42.0
touches no Worker code). All **twenty** runners green, including the new
`pulltest.cjs`. Confirmed on both phones against the checklist below.
`dotest.cjs` (12/12) is **tooling, not part of the sweep** — the count stays
twenty.

**v1.42.0 is Phase 1 of a fifteen-item programme** planned 2026-08-14. The plan
covers the Settings scroll bug (this release), `payPeriods.actualStarts`
merging, a Durable Object test harness, salary reconciliation (5b),
customisable bottom navigation, and a set of mobile-UX changes. The plan file is
machine-local (`~/.claude/plans/`), so the phase list and the decisions taken
for the unbuilt phases are reproduced at the top of `roadmap.md`.

### v1.42.0 — pull-to-sync must not arm inside a sheet

The bug two people hit daily: open Settings, scroll down, drag down to scroll
back up, and the pull-to-refresh gesture fired instead — the sheet would not
scroll, an indicator appeared over it, and a real cloud save ran.

`useScrollLock` pins the body with `position:fixed`, which pins `window.scrollY`
at 0; the gesture armed on `scrollY <= 0` and nothing else. Every arm now goes
through module-scope `mayArmPull`, which refuses on any of four grounds. See
`decisions.md` for why each guard is needed and why neither a unit test nor a
source assertion would have been enough on its own.

Also in this release: the Settings title/Close bar is sticky (`.sheet-head`), the
Close button renders at `IconButton`'s 40×40 default instead of an 18px glyph
with no padding, and the pull indicator drops from z-index 60 to 38 so it can
never paint over a sheet.

**Verified in a sandbox at `localhost:8842`** by dispatching synthetic
`TouchEvent`s: with Settings open and scrolled, `body` is `position:fixed` and
`window.scrollY` is 0 (the lying condition, reproduced) and the touchmoves come
back `defaultPrevented:false` with the indicator at opacity 0. With no sheet
open and the page at the top, the same drag arms and prevents, as it always did;
with the page scrolled 116px it does not.

**Verified on both phones**, all passing: Settings scrolls both ways with no
POSTs across a full 25 s autosave window; nested sheets (Settings → pay-period
date sheet → ConfirmDialog) close without the page jumping; pull still works
from the top of the main page; Expenses' transaction log scrolls without arming;
Close is reachable from the bottom of Settings. Keep this list — it is the
regression checklist for phases 5 and 12, which both rework Settings.

**Stale sandbox origins cleared, 2026-08-14.** Four localhost origins from past
sessions (`:8791`, `:8799`, `:8811`, `:8842`) were still holding documents of
3–10 KB, two cached app shells (builds `2026.08.01.0003` and `2026.08.05.0006`)
with live service-worker registrations, and — on `:8811`, the `sandboxworker`
port — a 12-byte `allocation:syncToken`, short enough to be the dummy value that
file's own instructions tell you to set. All four are now empty: localStorage,
sessionStorage, Cache Storage, IndexedDB and service workers. This is the hazard
the "Testing this app" section warns about; **sweep these origins at the end of
any session that serves a sandbox**, and prefer a fresh port each time so the
list stays enumerable.

**The Purchase Advisor is finished and is engine-only.** It computes concrete
options — trim, wait, finance, spend less — shows exactly what to set aside
and until when, and one tap fills the What-if levers. **The Gemini narration
was removed in v1.41.0** after five rounds of real use: every guard held, but
it was a thin layer over figures the app already stated. See the session note
and `decisions.md` — the design is in git at v1.40.0 if it is ever wanted back.

### v1.44.0 — `actualStarts` merges per key (programme phase 3b)

**Built and verified; NOT yet deployed.** Both phones reported v1.43.0 first,
which was the gate.

`payPeriods[owner].actualStarts` was the last synced map with no merge rule of
its own. `payPeriods.me`/`.wife` are single `SETTING_PATH`s, so
`mergeSettingPaths` took one side's whole config — payday, enabled *and* the
corrections — wholesale: two people correcting two different periods on two
phones lost one side entirely, with no conflict shown. The correction simply
wasn't there any more and the period went back to its nominal boundary.

- Clearing writes a **tombstone** (`{v:null,updatedAt}`), never a `delete` — a
  union merge cannot see a deletion, so the other phone would hand the old
  value straight back. Same for the payday change, which used to clear to `{}`.
- `migrate()` **upgrades a bare string in place** to `{v,updatedAt:""}`. This
  changes the document on purpose — one KV write per device, once, idempotent
  after — because an unstamped entry cannot take part in a per-key merge.
- `mergeActualStarts` + `withMergedActualStarts` run **after**
  `mergeSettingPaths`, so payday still resolves exactly as before and only the
  corrections map merges per key. Keys sorted; identity returned when nothing
  moved.
- **Tie-break is by value, not by side** — see `decisions.md`. "Local wins
  ties" never converges.

New runner `periodmergetest.cjs` (11 cases; unwiring the merge turns four red).
`periodtest.cjs` 32 → 33, `cloudguardtest.cjs` 21 → 22. **Twenty-one runners
in the sweep now.** All three write paths verified in a browser, plus a 20s
no-churn check on an upgraded document.

### v1.43.0 — `actualStarts` tolerant readers (programme phase 3a)

**Deployed 2026-08-14** (`537a5e51`). Readers only: nothing writes the new
shape, and a legacy document is byte-identical through `migrate()`, so this
costs no device a KV write. The Worker was **not** touched — v1.43.0 is a Pages
release only, so `d8b5b9ad` still stands.

An `actualStarts` entry now has two legal shapes — the legacy `"YYYY-MM-DD"`
string, and the stamped `{v,updatedAt}` that **v1.44.0** will write so that
*clearing* a correction can survive a union merge (`v:null` is a tombstone).
Three new module-scope helpers are the only place that knows this:
`actualStartValue`, `hasLiveActualStart`, `isActualStartEntry`.

**The line that matters is in `migrate()`.** It used to delete anything that
wasn't a bare date string — so a phone on an older build would receive the
other's stamped corrections, strip every one, and push the stripped copy back.
Data loss whose symptom is that nothing appears to happen.

Also here, though the plan had assigned it to 3b: the three Settings reads that
touched `actualStarts[k]` raw now go through `actualStartValue`. Without that,
an un-upgraded phone survives the data and breaks on the screen — tombstones
listed as corrections, and `keyToDate({v:…})` rendering **"Invalid Date"**.

`periodtest.cjs` 24 → 32, now including a real `migrate()` round trip.
**Verified in a browser**, and the same document was loaded into v1.42.0 for
comparison: the old build stripped both stamped entries, this one keeps them.
Full detail in `roadmap.md`; the reasoning in `decisions.md`.

**Programme phase 2 is done (2026-08-14), and it shipped nothing.**
`dotest.cjs` is tooling: no version bump, no `index.html` change, no deploy.
`SyncRoom` now has twelve end-to-end cases against a real local Worker, which
is what makes phases 3a/3b (the `actualStarts` merge) safe to attempt.

**Phases 1, 2, 3a, 3b and 4 are done. Nothing is half-built.**

**Next: programme phase 7** — customisable bottom
navigation (v1.48.0). Its Settings container now exists (the empty Navigation
section is added *with* its contents, in that phase).

### v1.47.0 — the unaccounted sheet shows planned beside actual (phase 6)

**Deployed 2026-08-14** (`c945dd55`). Read-only over existing records —
nothing stored, nothing derived into `data`, nothing synced.

**Roadmap item 5b, the oldest carried-forward feature, is done.** New
module-scope pure `reconcilePeriod(...)`, into which the `unaccountedParts`
`useMemo` moved **unchanged**, so the four actual buckets keep their exact
classification and the sheet still reconciles to the headline it always showed.
`reconcileSentence` is the one sentence above the table.

Spending and saving are reported **separately** — they net out to the same
headline, so a single figure would call a period that overspent *and*
under-saved by equal amounts "fine". New `unmatched` names money that left
through no envelope at all, rather than letting the sheet blame the plan for
it. Income and Extra funds carry `comparable:false`: a difference there is
meaningless, not zero.

New runner `reconciletest.cjs` (14 cases, written before the UI). `goaltest`
and `installmenttest` were rewired to drive the classifier through its new
home. **Twenty-four runners in the sweep.** Full detail in `roadmap.md`.

### v1.46.0 — Settings is six collapsed sections (programme phase 5)

**Deployed 2026-08-14** (`621df4dd`). Only JSX moved — no data model, no
sync, no behaviour change.

Eleven flat headings became six sections, and Settings now opens at **380px, a
single screen that does not scroll at all** until you open one. Navigation is
deliberately absent until phase 7 gives it contents.

Three traps, all invisible to a parse check: `section` is a render **helper**
(a component declared inside a component remounts the subtree and every input
loses focus per keystroke); nested dialogs live **outside** every section (a
collapsing section would unmount an open sheet and leave `useScrollLock`
holding the body); and the flash message and sync errors render **above** the
sections, because someone who cannot see the error cannot know which section to
open.

One deliberate behaviour change: the pre-cloud restore slots moved to Backup &
restore, so they now show on an unconnected device too — correct, since an
import creates a slot with no cloud involved.

New runner `settingstest.cjs` (7 cases). **Twenty-three runners in the sweep.**
Full detail in `roadmap.md`.

### v1.45.0 — the header carries one sync control (programme phase 4)

**Deployed 2026-08-14** (`f64dec0b`). Presentation only — `saveToCloud`,
`pullFromCloud` and `reconcile` were deliberately not touched.

Four controls became one status pill that opens a **`SyncSheet`** (theme was
already in Settings; Pull and the pending badge moved into the sheet). The
sheet owns **no sync logic** — it calls the existing handlers and routes
recovery to Settings rather than duplicating a destructive restore. The
contradictory instruction line is gone: the header said "Pull before editing…
Save to Cloud when finished" while Settings said "Nothing here is manual".
Income is display-only and taps through to Budget, where the editable field has
always been.

New runner `headertest.cjs` (7 cases) pins all of it — the claims are
structural and would otherwise fail silently. **Twenty-two runners in the sweep
now.** The browser caught what the runners could not: the header **overflowed
at 320px**, fixed by letting the wordmark shrink and shortening the longest
label. See `roadmap.md`.

### v1.42.1 — no such release. Phase 2 (2026-08-14) — `dotest.cjs`

The one piece of this codebase with no automated coverage now has some. Twelve
cases over four local `wrangler dev` instances: the ordinary path (empty read,
first write, `/sync/meta` carrying no document, the auth gate on all four
endpoints, the 200-not-409 conflict, two simultaneous writes, merge-and-retry
through the shipped `tryAutoMergeAll`, response shapes, malformed bodies), a
Worker with no `SYNC_TOKEN`, one adopting the legacy KV keys, and one with
`ALLOC_KV` unbound.

**It was proven able to fail before it was believed.** Three defects injected
into `worker.js` — compare-and-swap removed, `/sync/meta` leaking the document,
the KV mirror made to gate the write — put exactly the predicted five cases
(3, 6, 7, 8, 11) red; `worker.js` was restored byte-identical afterwards.

**Nothing here can run against production, by design.** The room name is
hardcoded `"household"`, so the deployed Worker has no throwaway document and
no POST may be pointed at it. The read-only half was checked and matches local
exactly (401s and CORS). There is no `--remote` anywhere in `dotest.cjs` and
there must never be one.

One finding worth keeping: seeding KV with an inline JSON value **silently
produced a corrupt document**, because cmd.exe strips the inner quotes — the
Worker then did the right thing (its seed catches the parse error and starts
empty) and the harness blamed the Worker. Values go in by `--path` now. The
Worker's fallback behaviour was correct throughout; only the test was wrong.

### Shipped 2026-08-08

| Build | Version | What |
|---|---|---|
| C1 | 1.37.0 | The options engine: `purchaseSaveableBuckets` anchor fix, `data.trimPolicy`, `purchaseOptionsFor`, option cards with one-tap apply |
| C2 | 1.38.0 | The model recommends among those options: `options` in the context under `kind`, the prompt turned from explain to recommend, `SUGGESTED` badge |
| —  | 1.39.0 | The validator fired on correct prose (a shortfall stated positive); the rejection now names its rule |
| —  | 1.40.0 | shiftDate carries the saving it implies; the picked option renders engine figures |
| —  | 1.41.0 | **The AI narration removed entirely** — B and C2 deleted, secret revoked |

### Shipped 2026-08-07

| Build | Version | What |
|---|---|---|
| A  | 1.31.0 | Purchase Advisor engine + tab, three scenarios |
| A2 | 1.32.0 | Bank `accessible`/`purpose`, goal `bankId`/`deadline`, FX cached in `data` |
| A3 | 1.33.0 | The advisor uses the flags; per-bank `max(reserved, claimed)`; date-driven savings; goal handoff |
| —  | 1.34.0 | Bills Reserve removed from the advisor |
| —  | 1.35.0 | Bills Reserve double-count repaired (`billRowId` + `dedupeBillRows`) |
| —  | —      | `headroomcheck.cjs`: advisor vs Budget on real data — 48 buckets, no drift |
| B  | 1.36.0 | Gemini narration: `POST /ai/advice`, spend caps, the context builder, the validator, the panel |

### Open — nothing blocking, nothing half-built

**Needs a person, not a build:**

1. **Mark which categories the advisor may suggest cutting.** Budget → the
   scissors icon on a group header, or per category in the chevron panel.
   Default is NO for everything, so until this is done the advisor offers
   dates, financing and a lower price but **never a trim** — the headline half
   of C1 is silent on a fresh document. Deliberate (an advisor that opens by
   proposing you cut your rent is worse than one that says nothing), but it is
   a real first-run gap.
2. ~~**Open both phones and run the two-phone merge scenarios.**~~ **DONE
   2026-08-14 — all three pass.** Both phones are on v1.44.0, which also
   subsumed the older "open both on ≥ v1.41.0" item (each repaired its own
   duplicated bill rows so the canonical ids converged).
3. **Expect the savings and earliest figures to look worse than you remember.**
   v1.37.0 stopped counting the current, part-spent period toward what you can
   still save. Those are the corrected numbers, not a regression.

**Waiting on time:**

4. **`purchaseHistoryWarning` is dark until ~Oct 2026** — it needs
   `MIN_TREND_BUCKETS` = 3 completed periods. Re-check it the first period it
   appears; Home's two trend cards carry the same action.

**Work — now sequenced. See the programme table at the top of `roadmap.md`;
the entries below say what is left of each, not what order to do it in.**

5. **5b — salary reconciliation** in the Expenses unaccounted sheet.
   **Programme phase 6.** See `roadmap.md`, and read the 5a-2 classification
   note it must account for.
6. ~~**3C-3 — `payPeriods.actualStarts` has no merge rule.**~~ **CLOSED
   2026-08-14 — 3a (v1.43.0) + 3b (v1.44.0), deployed and verified on two real
   phones.** Per-entry stamped records with an explicit tombstone, shipped over
   two releases so an old build's `migrate()` could not strip corrections and
   push the stripped copy back. **Every synced collection now has a merge
   rule.** Details under phase 3b in `roadmap.md`.
   One follow-up it leaves behind: **`mergeTrimPolicy` breaks a stamp tie by
   side (`local wins`), which never converges** — with equal stamps and
   different values each device keeps its own answer forever, because each
   one's merge is a no-op on its own side. `mergeActualStarts` breaks ties by
   value instead. Low stakes (a boolean) and deliberately not fixed in the same
   release, since no release may carry two synced-data changes. See
   `decisions.md`.
7. **Retire the Worker's KV rollback mirror.** Every accepted write still
   mirrors to the three legacy KV keys so a rollback to the pre-Durable-Object
   Worker resumes cleanly. Cheap, but it is duplicated state and should not
   become permanent by accident. `dotest.cjs` now exists (below), but the gate
   is unchanged: **the mirror stays until that harness has been trusted through
   a real release** — it has not yet seen one. Retiring it rewrites case 11.
8. ~~**The Durable Object has no automated test.**~~ **DONE 2026-08-14 —
   programme phase 2.** `dotest.cjs`, twelve cases, 12/12. See the session note
   below. Two things it does *not* cover, so don't over-trust it: it runs
   against a **local** room, so it says nothing about how the app behaves after
   a push (that is still `sandboxworker.cjs`'s job), and only its 401 and CORS
   cases can ever be run against production.

### Known limitations and sharp edges

- **A target date in the very next period reports `saveable: 0`** and therefore
  infeasible, because there is no *full* period in between to save in. Honest
  and deliberate, but harsh — if it reads badly in practice, the fix is a
  presentation one (say "there's no full period before then"), not an
  arithmetic one.
- **`trimPolicy` entries are flipped, never deleted**, so there is no way back
  to "unanswered" once a category is marked. That is what makes it survive a
  union merge; the cost is that the map only ever grows.
- **`trimPolicy` is the eighth synced collection.** The forward-compatibility
  case in `cloudguardtest.cjs` must stay green, or the first phone to upgrade
  starts refusing the other's document.
- **The trim cap is a flat 30% per category** (`PURCHASE_TRIM_MAX_PCT`), chosen
  so a suggestion is never absurd. It is a guess, not a derived figure.
- **`headroomcheck.cjs` needs a real backup**, which may not be committed. A
  backup currently sits at the repo root, gitignored — delete it or keep it as
  the fixture, but decide rather than let it drift.
- **The Purchase Advisor's draft is per-device** (`PURCHASE_DRAFT_KEY`) and
  never synced, by design. A purchase you are weighing on one phone is invisible
  on the other.

### Deliberately deferred

Goal↔bank reconciliation warnings · multi-currency purchases · household scope ·
chat/history · grounding · automatic discretionary detection · applying a
recommendation as app changes · stored or synced analyses · a Home card for a
goal that has fallen behind.

---

# 📁 SESSION INVENTORY — 2026-08-07 → 2026-08-08

Thirteen commits, `46b101f..deedac7`. Six releases: v1.36.0 → v1.41.0, plus the
`headroomcheck` tooling commit that opened the session.

## Files created

| File | Kept? | What it is |
|---|---|---|
| `headroomcheck.cjs` | **yes** | Tooling. Cross-checks the advisor's headroom against the sliced `BudgetView` "Left" expression over a real backup. Takes the backup path as an argument, so it never joins the sweep. |
| `aitest.cjs` | deleted v1.41.0 | 46 cases over the AI path; the first runner to cover `worker.js`. |
| `aiburst.cjs` | deleted v1.41.0 | Verified the deployed spend caps with real paid calls. **Also the only thing that ever exercised `SyncRoom` over HTTP** — see open item 8. |
| `c2check.cjs` | deleted v1.41.0 | One live call proving the C2 path end to end. |

## Files modified

| File | What changed |
|---|---|
| `index.html` | **C1, kept:** `purchaseSaveableBuckets`, `trimPolicyFor` / `cuttableCategories`, `mergeTrimPolicy` (placed with the *merge* helpers, not the engine), `purchaseOptionsFor`, `bucketStartDate`, the Scissors icon, `setTrimPolicy`, Budget's group + category toggles, the options section with one-tap apply, `optionLine`. **B/C2, added then removed:** the whole narration module, `fetchPurchaseNarration`, both panel components. Net: the advisor gained an engine and lost a narrator. |
| `worker.js` | Gained `POST /ai/advice`, `SyncRoom.aiCheck` and the Gemini helpers (v1.36.0); all removed again in v1.41.0, leaving a tombstone comment pointing at v1.40.0 and `decisions.md`. |
| `purchasetest.cjs` | 52 → 70 cases. Eight expectations **re-derived by hand** for the anchor change, plus cuttability, the options engine, and three source-structure sweeps (no `setData`, no clock, no surviving AI reference). |
| `budgettest.cjs` | 39 → 41. Trim marks survive a month copy; a document with no marks is not given an empty one. |
| `sandboxworker.cjs` | Gained a fake `/ai/advice` with nine modes; removed with the feature. |
| `CLAUDE.md` | `trimPolicy`'s conventions, the declaration-order section, the secrets lesson, runner count 19 → 20 → 19. |
| `docs/*` | Session notes for C1, C2 and the removal; six new entries in `decisions.md`; `roadmap.md` re-headed to 5b. |
| `.gitignore` | `mode.txt`, `aimode.txt`, `lastaictx.json` — local sandbox knobs. |
| `sw.js`, `version.json` | Bumped with `index.html` each release. |

## Infrastructure changed outside the repo

- **Worker deployed six times.** Current: `d8b5b9ad`. Every deploy confirmed
  both `SYNC_ROOM` and `ALLOC_KV` in the output.
- **Pages deployed five times.** Current: `2026.08.08.0005`.
- **`GEMINI_API_KEY` created, then deleted.** `wrangler secret list` now shows
  exactly `SYNC_TOKEN` and `FINNHUB_KEY`.
- **One key was exposed and rotated** — set as a secret *name* rather than a
  value. See the "Hosting" section of CLAUDE.md; the rotated string is inert but
  still sits in shell history.
- `wrangler.jsonc` was **never touched**, so no deploy could unbind anything.


---

# 📋 SESSION NOTE — 2026-08-08 (v1.41.0) — The AI narration removed

Builds B and C2 are gone. **Every guard held** — nothing leaked, no invented
figure ever reached the screen, the caps worked, the endpoint was never logged.
It was deleted for not earning its place, which is a different question from
whether it worked. Full reasoning in `decisions.md`.

## What five rounds of real use actually produced

| # | What went wrong | Fix |
|---|---|---|
| 1 | Recommended `"none"` and argued against buying, while three working options sat unread | prompt |
| 2 | Printed the internal id as prose; picked the option that abandons what you wanted | prompt |
| 3 | Rejected a **correct** sentence because a shortfall was stated positive | **app — kept** |
| 4 | Offered a menu item that was not in the request (hardcoded enum) | worker |
| 5 | Vague where it structurally *could not* be specific | **app — kept** |

Every fix was sound and pinned by a test. The defects kept coming because they
were not bugs in a program — they were mismatches between a prompt and a
payload, and that surface is unbounded.

**Two of the five were app fixes and were kept**: `|x|` of a real figure counts
as that figure, and the picked option renders the engine's own numbers. Both
improved the product regardless of the AI.

**The tell was defect 5.** Asked "when can I buy it, how much should I save",
the model could not answer — it is never given a calendar date, only a bucket
index, deliberately. The answer had to come from the engine. At that point it
was commenting on an answer the app could already give in full.

## What was removed, and what stayed

Removed: `POST /ai/advice`, `SyncRoom.aiCheck` and its `aiCounters` key, the
Gemini constants and helpers, the whole app-side narration module (~22k
characters), both panel components, `aitest.cjs`, `aiburst.cjs`, `c2check.cjs`,
the sandbox's fake endpoint, and the `GEMINI_API_KEY` secret. `wrangler secret
list` now shows only `SYNC_TOKEN` and `FINNHUB_KEY`.

Stayed: **all of C1.** The advisor still computes trim / wait / finance /
spend-less, still says what to set aside and until when, and one tap still
fills the What-if levers.

One dependency had to be untangled first — C1's `shiftDate` used
`purchaseAiNum` for rounding, and now uses the existing `roundTo`. Worth
noticing in general: a feature being deleted had quietly become load-bearing
for one that stays.

## The guard against a half-removal

`purchasetest` 13o asserts that **the whole of `index.html`** contains no
reference to any removed function. A dangling one is a render-time
`ReferenceError` that blanks the tab — the exact failure this feature produced
three times while every runner stayed green — so a source sweep is the only
thing that catches it.

Driven in a browser, because a deletion this size is precisely what a green
suite cannot vouch for: the advisor renders, all four options are intact,
"Try this" applies a trim, Budget's scissors toggles work, and nothing of the
AI remains in the DOM.

## Verification

- Nineteen runners green. Parse OK. `headroomcheck` 48/48. Three sites agree.
- Worker `d8b5b9ad`, both bindings confirmed. Pages `2026.08.08.0005`.
- Note: an unauthenticated `POST /ai/advice` still answers **401**, not 404 —
  `authOk()` runs before routing, so that curl proves nothing about the route.
  The removal is verified by source and by the deploy, not by that status.

---

# 📋 SESSION NOTE — 2026-08-08 (v1.38.0) — Purchase Advisor C2

The model now **chooses** among the engine's options and says why. Deployed:
Worker `a714db20` first, then Pages `2026.08.08.0002`.

## What C2 actually is

C1 made the engine compute concrete moves. C2 gives the model the one job it is
genuinely better at than a rule: weighing them and phrasing the trade-off.

**The safety rule needed no loosening.** It still cannot state a figure the
engine did not compute, and it now also cannot recommend an option that was not
offered — inventing a course of action is the same class of failure as
inventing a number, so `validatePurchaseNarration` checks `recommended` against
the options actually sent.

## `kind`, never `id` — and why that is not pedantry

Options travel under `kind`. **`id` stays banned from `AI_CONTEXT_KEYS`
entirely**, because it is precisely the field name a record leak would ride on:
permitting it to carry `"trim"` would also permit `{id:"c1"}` anywhere in the
tree. The allowlist is only as strong as its most innocent-looking exception.

An option's picked categories become the same opaque `{{refN}}` tokens the
candidate list uses, `bucketKey` becomes an index, and the `apply` payload —
keyed by real record ids — is dropped before sending.

## Three live calls, three real defects, none visible to any test

This is the part worth remembering. Every defect was in the **prompt**, and
each was found only by making a real call and reading the answer.

**1 · It recommended `"none"` and advised against the purchase** — while three
options that *work* sat unread in the request. Cause: the prompt described
`"none"` as the answer "when nothing is worth doing", and never said the
options had already been checked by the engine. Seeing `cash: bad` and
`savings: bad`, it reasonably concluded "don't". It answered a question nobody
asked — *whether* to buy — while three answers to the real question went unread.

**2 · It wrote "We can choose reducePrice"** — the internal id as an English
word — and picked the one option that means *not getting what was asked for*,
over instalments that fit every period. Two defects: no plain-words translation
of the ids, and a list of considerations that was never actually ranked.

**3 · Serviceable.** Picked `shiftDate`, plain English, real reason.

The fixes: bad scenarios are the REASON options exist rather than the
conclusion; a non-empty options list compels a pick; `"none"` is only for an
empty list; it never recommends against a purchase already decided on; each
`kind` gets a plain-words gloss and the id is banned from the prose; and
`reducePrice` ranks last because it is the only option that changes *what* you
get. `aitest` 6c2 and 6c3 pin all seven.

**A unit test cannot assert that advice is good — but it can stop a fix being
edited away.** That is the whole role of those two cases.

## Known rough edges, recorded rather than fixed

- Watch-outs can be tautological: *"waiting 6 periods means holding off on the
  purchase until then."*
- It inferred "extra costs" about financing that carries **no fees** in the
  fixture. Not an invented figure — a wrong characterisation, which validation
  cannot catch by design.
- It says "6 periods" where the app's own cards say "February 2027", because it
  only ever receives a bucket index. That is the privacy rule working, and the
  cards are beside it, so it was left alone.

Each further prompt change costs another live call to verify, so these were
recorded instead of guessed at.

## The decision that was taken, and the one still open

Offered a deterministic ranker (no AI at all) versus C2, the choice was C2.
**Retiring the AI path remains cheap and available**: the engine computes
everything, and the option cards render fine with no prose. If the suggestions
stop earning their keep, deleting `/ai/advice`, the secret and the validation
layer is a small, clean change — not a loss.

## Verification

- Twenty runners green (`aitest` 38 → 43). Parse OK. Three sites agree.
- `npx wrangler deploy` × 3, each confirming `SYNC_ROOM` + `ALLOC_KV`.
- `c2check.cjs`, committed as tooling: one live call, passphrase on stdin, and
  it **slices `validatePurchaseNarration` out of `index.html`** rather than
  restating it, so it exercises the shipped guard. Third such tool after
  `aiburst` and `headroomcheck` — anything needing a real terminal, a real key
  or real data is tooling, never a runner.

---

# 📋 SESSION NOTE — 2026-08-08 (v1.37.0) — Purchase Advisor C1, the options engine

Prompted by testing Build B: *"This doesn't make sense. It's already the same
with what I can see in the data in the page."* Correct, and the cause is worth
recording precisely.

## Build B was not mistuned; it was correctly built to a self-defeating spec

B's system prompt says *"you receive figures that are already correct — never
compute, never state a number that is not in the context."* That rule is the
whole safety story: it is what makes an invented figure a detected failure. It
also **guarantees the output can only restate the cards**, because the model is
forbidden from deriving anything new. The ambition and the constraint were in
conflict, and it shipped anyway.

The fix is not to loosen the rule — a wrong number about someone's money reads
exactly like a right one. It is to **move the thinking into the engine**, where
it is deterministic and testable, and leave the model only the phrasing (C2).

One correction to the original diagnosis, worth keeping because it redirected
the work: the model was **already** receiving six periods forward, plus every
category's amount as an opaque token. The forward data was on the wire the
whole time. It simply was not asked to use it and was not allowed to do
arithmetic with it. So this was never "send different data" — it was "who
computes the suggestion".

## Two engine defects found in the grilling, both real regardless of the AI

**1 · The forward walks over-counted the current period.**
`purchaseHeadroomForBucket` is plan-based, so bucket 0 reports its full
headroom on the 28th exactly as on the 1st — and both `earliest` and
`purchaseSavingsPlan` then treated all of it as still savable. Every date they
quoted was optimistic. `purchaseSaveableBuckets(n)` → `max(0, n−1)` now answers
"how many FULL periods are there in between" for both walks, so they cannot
drift apart.

It **understates rather than pro-rating by days elapsed**, deliberately: a
pro-rated figure moves every day, this engine is plan-based on purpose (a plan
is a decision, a trailing average is a description), and understating is the
safe direction for a date someone is about to commit to.

This changed numbers already on screen. Eight `purchasetest` cases were
**re-derived by hand, not re-baselined** — including 12d, whose deficit bucket
had to move from August to September, because August is now excluded entirely
and a deficit there would have proved nothing about the rule under test.

**2 · Trim candidates were ranked by size alone.** On the real dataset the
three largest are Rent 9,000, Tuition Fee Wife 3,000 and Groceries 2,400 — so
the feature's first suggestion would have been to cut the rent. An advisor that
says nothing is better than one that says that.

## `data.trimPolicy` — a map, and outside `plans` on purpose

`{ "<catId|groupId>": {v:bool, updatedAt} }`, resolving **category → group →
false**. Absent means unanswered and the default is NO.

Why not a field on the category record: cuttability is a property of the
category as a concept, not of one month's plan. Writing it there means going
through `editPlanForMonth` — the only legal budget writer — which
**materialises a plan for whatever month is on screen** just to record a tag,
and leaves earlier months inheriting a plan without it. `clonePlanRecord` runs
with `{preserveIds:true}`, so category and group ids survive the month
copy-on-write, which is exactly what makes an external map keyed by id safe.

**Entries are flipped, never deleted.** A deletion cannot survive a union merge
— the same reason `payPeriods.actualStarts` still has no merge rule. Setting
`false` says the same thing and travels correctly.

Being a **map** changes the touch-point list that CLAUDE.md states for a new
collection: it must NOT go in `BACKUP_ARRAY_KEYS` (which asserts "if present it
must be a list"), it needs no `CONFLICT_COLLECTIONS` entry (nothing to name in
a diff) and no `purgeOldTombstones` entry (no tombstones). It gets its own
`mergeTrimPolicy` (per-key newest-wins) and an object-shape check in
`validateBackup`. `fingerprint` emits it only when non-empty, so an existing
document stays byte-identical.

`mergeTrimPolicy` lives beside `mergeArrayById`/`mergeSettingPaths`, **not**
with the purchase engine — `tryAutoMergeAll` calls it, and `synctest` and
`mergetest` slice that region. Putting it with the engine broke three runners
at once; the fix was to move the function, not to widen three slices.

## `purchaseOptionsFor` — the actual feature

Ranked options, each with its own arithmetic and an `apply` payload naming only
existing draft levers: **trim** (greedy over permitted categories, capped at
`PURCHASE_TRIM_MAX_PCT` = 30% each so it never proposes gutting one),
**shiftDate** (reuses the `earliest` walk rather than a second loop),
**finance** (fewest payments that fit every bucket, via the same
`buildPurchaseSchedule` real installments use), **reducePrice**. Empty list when
there is no gap to close.

One rounding subtlety worth keeping: the per-period trim rounds the remaining
need **up** to the cent. Rounding to nearest made 700/3 into 233.33, which is
699.99 over three periods — a cent short, so the option reported itself as *not*
closing the gap while being right in every way a person can see.

"Try this" fills `draft.trims` / `desiredDate` / `count` / `price` and nothing
else. Trims merge rather than replace, so suggestions stack, and the existing
Clear reverses the lot.

## What the sandbox caught — fifth session running

`BudgetView` **read `trimPolicy` without destructuring it**: a render-time
`ReferenceError` that blanked the entire Budget tab while all twenty runners
stayed green. Root cause was mundane and worth naming — a `node -e` script
applying two replacements threw on the second, so `writeFileSync` never ran and
the first edit was silently lost. The tests passed because the *engine* was
fine; only the component was broken.

`purchasetest` case 13m2 now asserts that a component whose body names a prop
also declares it in its signature **and** is passed it at the mount site.

## Verification

- Twenty runners green, `purchasetest` 52 → 68. Parse OK. Three sites agree.
- `headroomcheck.cjs` **48/48, no drift** — confirming the anchor fix stayed
  inside the savings walks and did not leak into `purchaseHeadroomForBucket`,
  which Budget's own "Left" shares.
- Driven in a browser: marking a group cuttable left `monthlyPlans` at 0 and
  `plans` at 2 — **no plan materialised**; the trim named only Eating out and
  Shopping, capped at 30%, and said so when it fell short; one tap moved
  capacity 24,000 → 25,800, exactly 600 × 3; and across a full 25-second
  autosave window the document stayed **byte-identical with zero POSTs**.
- Deployed to Pages. **Note:** the production URL served the previous
  `version.json` for a few seconds after deploy — a stale CDN copy, not a
  failed deploy. Re-check with a fresh cache-buster before concluding anything.

## Carried forward

- Nothing is suggestable until marked — see open item 0.
- C2 is deliberately not started. Decide whether it earns its place now that
  the engine does the thinking.

---

# 📋 SESSION NOTE — 2026-08-07 (v1.36.0) — Purchase Advisor Build B

Gemini narration. **Deployed**: Worker `2897b1d2` first, then Pages. The model
never computes — it receives figures that are already correct and explains
them, and every failure path renders the cards without prose.

## The property that shaped it, again

Build A's was "it touches no synced data". Build B's is **"nothing identifying
leaves the device"**, and it is structural rather than a filter:
`buildPurchaseAiContext` BUILDS a fresh object and never copies from `data`, so
a field cannot leak by being left in — only by being deliberately written.

Category names become opaque `{{refN}}` tokens whose map stays on the device
and is applied at render. Bucket keys become **indices**, because a date is one
more identifying fact and the app can label them itself. `reserved[]` and
`inaccessible[]` become **counts**, because they carry account names.

The Worker re-validates all of it against a flat `AI_CONTEXT_KEYS` allowlist
walked over the whole tree, because a client is code running on a device, not a
security boundary. Two lists in two files that must not drift — `aitest.cjs`
case 1b pins them together.

**Measured, not argued:** the full request body was dumped from the sandbox and
scanned — no category, account, goal or owner name, no record id, no date, no
token. And across three AI calls plus a full 25-second autosave window the
stored document stayed **byte-identical** with **zero POSTs to `/sync`**.

## The load-bearing validation rule

`validatePurchaseNarration` rejects the **whole** response — never repairs it —
if any currency-shaped figure in the prose is absent from the context. That
turns "the model invented a number" into a *detected* failure rather than a
plausible sentence. Rounding a real figure is allowed (`SAR 3,213` for
3212.78); `SAR 9,999` when 9999 was never sent is not.

A partly-trusted narration is the worst outcome available: the reader cannot
tell which sentence was the invented one, and the cards alone are already
correct and complete. Hence whole-response rejection, and hence the panel
formats **no figure of its own** — the model's text is rendered verbatim
precisely because each figure in it was checked.

Rendering goes through `rehydratePurchaseRefs`, which returns **segments**, not
a string. No markdown renderer, no `dangerouslySetInnerHTML` — the app has
never had one, and adding one is the only way to create an XSS here. A category
named `<img onerror=…>` renders as those characters.

## What the sandbox caught that twenty green runners did not

Fourth session running, and the sharpest set yet:

- **Every scenario verdict crossed the wire as `""`.** `purchaseVerdict` runs
  in the VIEW, not on the scenario objects, so the model was handed figures and
  left to decide what counts as "thin" — which is computing, the one thing it
  must never do. Now passed explicitly.
- **Two temporal-dead-zone crashes**, blanking the app into its error boundary.
  `const` in a component body is block-scoped, so a `useMemo` inserted at the
  tidy spot read `ready` / `cashVerdict` above their declarations. Invisible to
  every pure test. See the new CLAUDE.md section; `aitest.cjs` now pins five
  such source positions.
- **No client-side timeout.** The Worker aborts at 20s, but a connection
  stalled *before* reaching it left "Writing an explanation…" up forever. Now
  25s client-side — longer than the Worker's on purpose, so a real 504 wins
  whenever the Worker can answer at all.

## Verified live, against the deployed Worker

`aiburst.cjs`, in cost order: 401 unauthenticated · 413 on a 20KB body · 400 on
document-shaped keys (`unexpected field: plans`) · five 200s then **429
`scope=minute` at call 6**. The 429s returned in ~128ms against ~1000ms for a
real call — the cap rejecting *before* the paid call, which is the whole point
of the ordering.

## The security incident, recorded because the lesson is general

The Gemini key was first set with `npx wrangler secret put <the key>`, which
makes the key the secret **name**. Secret names are not encrypted — they are
returned in plaintext by `wrangler secret list`, the dashboard and the API. The
key was rotated, the malformed secret deleted.

The second attempt looked successful and was not: run through Claude Code's `!`
prefix, `secret put` is **non-interactive**, never shows `Enter a secret
value:`, and silently uploads an **empty** value while printing
`✨ Success!`. Both traps and the 503-vs-502 way to tell an empty key from a
rejected one are now in CLAUDE.md under "Hosting".

## Carried forward

- **No live narration has been seen in the app yet** — every in-app test used
  the sandbox's fake responses. See open item 1b.
- The Durable Object's `aiCheck` still has no unit test; `aiburst.cjs` against
  the deployed Worker is its only coverage. Same gap the DO handler has had
  since 3B — do not mistake the burst for a test suite.
- Deliberately not built: chat, history, grounding, model escalation, stored or
  synced analyses, any path where the model proposes a mutation.

---

# 📋 SESSION NOTE — 2026-08-07 — Budget-vs-advisor cross-check (no code change)

Build A's carried-forward risk, closed. **No change to `index.html`, `sw.js` or
any served file**, so no version bump: the only new file is `headroomcheck.cjs`,
which is tooling.

## The result

Driven over a real exported backup (29 plans, 9 `monthlyPlans` mappings, 227
expenses, 4 installment plans, both owners on pay periods, one `actualStarts`
override), across the full `PURCHASE_HORIZON_BUCKETS` window:

**48 buckets, 2 owners, zero drift.** Income, planned total, installment total
and headroom all identical to Budget's own figures.

## Why a fixture wasn't enough to have already answered this

`purchasetest.cjs` case 2 has asserted `headroom === Budget's remaining` since
Build A, but over a hand-built plan with three categories and one two-payment
installment. It cannot produce a 24-bucket inheritance chain, a corrected period
boundary, or a `fundedElsewhere` row in the one month that has one. The value of
the real document is the shapes nobody thought to write down.

Demonstrated rather than assumed: with `fundedElsewhere` removed from the
engine's `installmentTotal` — the double-allocation trap the code exists to
avoid — the real dataset disagrees in **exactly one of 48 buckets**. A fixture
whose installment happens to fall elsewhere would report that defect as green.

## What the real numbers showed, neither of which is a fault

- **Charlene's plan is over-allocated from September onward** — 13,000 income
  against 13,277 planned, and −737 in the November bucket where an installment
  lands. The advisor will refuse every purchase of hers indefinitely, correctly.
  Worth knowing before reading one of her verdicts as broken.
- **Jastine's current bucket is exactly 0.00 headroom**, with 3,212.78 freeing
  up from the October bucket as a plan finishes.
- One bucket reads **−0.01** from installment rounding (3,212.79 against
  3,212.78). Both sides agree, and the forward walk clamps with
  `max(0, headroom)`, so it changes no verdict. Left alone deliberately.

## The gap this method cannot close

It compares two expressions **sliced from the shipped source**, which is what
makes it a test of the real code rather than of a restatement — but it therefore
proves they agree with *each other*. If both resolved the wrong plan for a
bucket they would agree and both be wrong. The one-glance confirmation against
the app's Budget tab is recorded as carried forward above.

---

# 📋 SESSION NOTE — 2026-08-07 (v1.34.0 + v1.35.0) — Bills Reserve

Two changes, both prompted by the reserve being visibly wrong on real data.

## v1.34.0 — the advisor stops subtracting it

Removed from `purchaseAvailableStack` entirely, not zeroed. It was the weakest
line in that stack: a **household-wide** figure subtracted in full from **each**
owner's cash independently, so both people lost the whole reserve. Flagged at
design time as "revisit only alongside a household-scope conversation".

Protecting money genuinely set aside is now the account flags' job — per-owner,
visible, releasable per purchase, naming the account rather than asserting a
total. `purchasetest.cjs` asserts passing `billsReserve` is now **inert** and
that the `reserve` field is gone rather than zeroed, so a stale caller cannot
quietly reinstate it.

## v1.35.0 — the reserve itself was double-counting

Confirmed on the real dataset: every tracked bill appeared twice.

Bill rows are generated per (month, tracked item) by whichever device is open,
and were given `id: uid()`. `tryAutoMergeAll` merges bills with
`mergeArrayById` — a union **by id** — so two phones generating the same row
minted different ids, nothing collided, the union kept both, and
`computeBillsReserve` summed both. Full reasoning in `decisions.md` →
"A derived record's identity must itself be derived".

The fix has four parts:

- `billRowId(monthKey,itemId)` → `bill:<monthKey>:<itemId>`. Both devices now
  generate the **same** id, so the merge collapses them.
- `dedupeBillRows` collapses existing duplicates, keeping one by a
  deterministic order: greatest `paid` → canonical id → oldest `createdAt` →
  smallest id. Losers are tombstoned and marked `dedupedAt`, never spliced.
- `migrate()` runs it over ALL months, because the reconciler only ever touches
  the current one and past months would keep their duplicates forever. **This is
  a repair, so it deliberately changes the document** — it moves the fingerprint
  and costs one KV write per device on first open. Idempotent, so exactly one.
- The reconciler runs it too (an un-upgraded phone keeps sending random-id rows)
  and no longer revives a row marked `dedupedAt` — it used to revive *every*
  tombstoned row for a tracked item, which would have undone the repair on the
  very next app open.

### What the browser caught that the tests didn't

With a purely alphabetical tie-break, a stray row from an older phone
**displaced the incumbent** — tombstoning a good row and reviving a different one
on every sync. The reserve stayed correct, so no assertion failed; it was
visible only by watching the ids across reloads. Preferring the canonical id
makes the survivor converge and the churn stop. Both rungs now have tests.

### Verification

- `node parsecheck.cjs` OK; nineteen runners green, `billstest.cjs` 11 → 23.
- Sandbox, on a document shaped exactly as reported (3 items × 2 devices,
  no payments): 6 rows → **3 live, reserve SAR 6,300 instead of 12,600**, the
  three duplicates tombstoned and recoverable. Stable across repeated opens,
  and a stray old-device row injected mid-run is collapsed rather than
  displacing the incumbent.

### Carried forward

- Existing duplicates are **soft-deleted**, so if a collapse ever picks wrong
  the row is still in the document.
- Both phones should be opened on v1.35.0 so each repairs its own copy and the
  canonical ids converge.

---

# 📋 SESSION NOTE — 2026-08-07 (v1.33.0) — Purchase Advisor Build A3

Finishes what A2 started. **A2 shipped the account flags with Banks-tab copy
that described A3's behaviour in the present tense** — "Left out of the Purchase
Advisor's available cash", "Held back from the Purchase Advisor's available
cash" — while `purchaseAvailableStack` contained no reference to `accessible`,
`purpose` or `bankId` at all. Setting a flag correctly stored it and changed
nothing anyone could see. Reported immediately on testing, and rightly.

The lesson is not "A3 was late". It is that **a control shipped without the
behaviour it claims is worse than no control**, and the copy should have said
"will apply once…" or the two builds should not have been split there.

## The stack is now per-bank

```
for each live bank b where b.owner === owner:
    counted = (b.accessible !== false) || includedBankIds.has(b.id)
    if !counted            → reported as inaccessible, contributes nothing
    value = toBase(bankValue(b, todayStr), b.currency)
    if value == null       → reported as unconverted, contributes nothing
    own      += value
    claimed   = Σ protected goals with bankId === b.id
    reserved  = (b.purpose === "emergency" && !released) ? value : 0
    withheld += max(reserved, claimed)          ← max, NEVER a sum

joint             = Σ value for owner "household"   // reported, never added
unlinkedProtected = Σ protected goals whose bankId is absent or unresolvable
available = own − billsReserve − withheld − unlinkedProtected
```

`max` is the whole design. Goal money lives *inside* bank balances, so an
emergency fund tracked as both a reserved account **and** a protected goal
linked to it would otherwise be subtracted twice — 25,000 withheld from an
account holding 15,000, driving available negative and refusing purchases the
household can afford. Verified live: 46,000 counted, 15,000 withheld (not
25,000), available 28,500.

Three `bankId` resolutions, three different answers, all load-bearing:

| resolves to | treatment | why |
|---|---|---|
| a **counted** bank of this owner | folded into that bank's `max()` | its money is inside `own` |
| a bank that is **not counted** | subtract **0** | never added to `own`; subtracting removes money that isn't there |
| **absent** or dangling | subtract from the pool | matches pre-A3 behaviour; a deleted account is not evidence the money moved |

## Two per-decision levers, both draft-only

- `includedBankIds` — count an unreachable account for THIS purchase. Disabled
  when FX can't convert it, so a PHP balance can never land in a SAR total.
- `releasedBankIds` — spend the emergency fund on THIS purchase. **Releasing the
  account does not release a protected goal kept inside it**: the goal has its
  own toggle and the `max()` still withholds what it claims. Verified live —
  releasing a 15,000 emergency account holding a 10,000 goal freed exactly
  5,000 and said "SAR 10,000 still held back by a goal kept in this account".

Neither is stored on the record. The account's flag is a fact about the account
and syncs; including or releasing it once does not.

## The savings card has two modes

`desiredDate` finally does something. With a date:
`purchaseSavingsPlan` → periods until then, shortfall from **available** cash
(not from zero), required per period, and feasibility as **capacity across the
window** rather than per-bucket — saving more in a fat period to cover a lean
one is a real plan. The tightest period is reported separately so the UI can
warn about the front-loading that implies. Without a date it falls back to the
original earliest-possible answer. One card, because two would say nearly the
same thing twice.

`purchaseBucketsBetween` steps with the existing `bucketShift` in a bounded
loop rather than doing date arithmetic — a period is not a month, and counting
months between two period keys would drift for a pay-period owner. Capacity
reuses the same `max(0, headroom)` accumulator the earliest walk uses; a second
per-bucket reduce is how the two answers would diverge.

## The goal handoff, and the bug in its first version

"Start saving the SAR 3,500" creates a Goal — the savings mirror of "Create
this plan in Installments". The first version set the goal's target to the full
**price** and its monthly to the advisor's **per-period** figure, and the
result was a goal that read **"Behind · needs SAR 10,667/mo"** the instant it
appeared, directly under a card saying "On track — set aside SAR 875 per
period". Two separate causes:

- A goal targeting the full price asks you to save money you already have. The
  target is now the **shortfall**, mirroring the card's own "starting from
  available X, still to find Y".
- The advisor counts pay-period **buckets**; `goalDeadlineStatus` counts whole
  calendar **months**. Near a boundary they legitimately differ by one. `monthly`
  is now derived through `goalDeadlineStatus` itself, so the created goal is
  self-consistent. Verified: it now reads "On track · Dec 1" at creation.

## Verification

- `node parsecheck.cjs` — PARSE OK. All nineteen runners green;
  `purchasetest.cjs` **51/51** (was 35). `node stage.cjs` — three sites agree.
- New cases cover the double-subtraction, both `max()` directions, all three
  `bankId` rules, both levers, the FX-unavailable path, `purchaseBucketsBetween`
  in periods as well as months, the savings plan's four modes, and the savings
  verdict boundaries.
- **Backward compatibility is asserted**: with no flags set anywhere — which is
  what every existing document looks like, since A2 shipped the fields absent —
  the arithmetic is byte-for-byte what it was before A3.
- Driven in a sandbox on a document with the flags set exactly as reported:
  the stack reads 46,000 / −15,000 / −2,500 / **28,500 available**, the BDO
  account is listed as unreachable with its converted value, joint is reported
  and not added, both levers move the total by exactly the right amount, and
  the savings card plans 3,500 over 4 periods at 875.

## Carried forward

- Still not checked against the real dataset on a phone. The Budget-vs-advisor
  headroom cross-check from Build A has never been done on real data.
- Build B (Gemini narration) still not started.
---

# 📋 SESSION NOTE — 2026-08-07 (v1.32.0) — Purchase Advisor Build A2

**Built, tested and staged; NOT deployed.** A2 is the data-model half of the
follow-up to Build A: it adds the fields and the Banks/Goals UI, and changes
nothing in the advisor itself. A3 (the advisor consuming them) is the next
build. Plan: `~/.claude/plans/greedy-crunching-sprout.md`.

## Why

Testing v1.31.0 showed the advisor's "Available" figure counting money that
isn't available — Philippine accounts the household can't reach, and accounts
that *are* the emergency fund. And "Save up for it instead" answered "when is
the earliest?" rather than "can I make my date?", because `desiredDate` was
captured and then never used in any calculation.

## Four new fields, none defaulted in `migrate()`

```
banks[].accessible : false        // absent ⇒ accessible   (a capability)
banks[].purpose    : "emergency"  // absent ⇒ ordinary     (a policy)
goals[].bankId     : "<bank id>"  // absent ⇒ unlinked
goals[].deadline   : "YYYY-MM-DD" // absent ⇒ no deadline
```

`accessible` and `purpose` are deliberately **two** concepts. "I can't reach it"
and "I won't spend it" fail differently: the first is excluded outright, the
second is withheld by default but releasable for one decision. Collapsing them
into one flag would cost the emergency fund the only interesting thing about it
— being able to ask what raiding it would cost.

**Absence is the value.** Defaulting any of the four would rewrite every bank
and goal on every device's first open, change the document, change the
fingerprint, and buy a KV write per device for information nobody entered —
the rule `goalId`, `fundedCatId` and expense `ord` already follow. Verified
live: opening the new build on a v1.31.0 document writes none of the fields.

None are added to `structuralDefaults()`, so the empty-document shape (which
`importtest.cjs` and `cloudguardtest.cjs` slice) is unchanged.

`banks` and `goals` were already synced collections — in `CONFLICT_COLLECTIONS`,
hashed wholesale by `fingerprint()`, in `BACKUP_ARRAY_KEYS`, merged by
`tryAutoMergeAll` — so adding a *field* needed no new touch point. An earlier
claim in this session that it cost "eight touch points" was wrong.

## FX rates are now cached in `data`

`rates`/`ratesAt` moved out of `useState(null)` and into the document, beside
`livePrice`/`prevClose`, and **into the `fingerprint()` exclusion list with
them**. They were in-memory only, so every reload started with no FX at all:
`convert()` returned null for everything until the network answered, and an
offline cold start showed nothing in a foreign currency even though it had
converted fine a minute earlier.

Two things this required that the plan didn't anticipate:

- **`QUOTES_STALE_MS`/`RATES_STALE_MS` moved to module scope.** The mount effect
  now has to consult `RATES_STALE_MS` before App's body has finished executing;
  a const further down that body is a temporal-dead-zone trap waiting for the
  first reorder.
- **The mount effect is gated on `loaded`.** See the bug below.

## The bug the sandbox caught, which every test had passed

The rates effect was written as a bare `[]` mount effect with a staleness check.
It refetched on **every single app open** regardless — measured in the sandbox
with a cache 80 seconds old inside a 6-hour window.

Cause: App's initial state is an EMPTY document (`structuralDefaults()`); the
stored one arrives later, in the load effect. A mount effect therefore reads
`data.rates` before the document exists, finds nothing cached every time, and
refetches. Gating on `loaded` (and depending on it) fixes it.

The `fingerprint()` exclusion meant this never caused a KV write — the safety
net held — but it defeated the entire point of caching, and it rewrote the
document on every open. **Invisible to all nineteen runners**, because it is a
fact about what the app's effects do after mount, not about any pure function.
Third time this class of defect has only been caught by driving the app.

## Also

- `goalDeadlineStatus(goal, todayStr)` — module scope, pure, returns `null`
  when there is no deadline so a goal without one renders exactly the card it
  always did. Months are WHOLE months (`completedMonths`), rounding the
  requirement **up**: with three and a half months left you are asked for the
  three-month figure. `onTrack` compares the goal's **stated** `monthly`, never
  recent actual contributions — plan-based, with actuals only ever a warning.
- `addGoal(owner, patch)` gained an optional patch and now returns the new id,
  the mirror of `addInstallment`. Called with one argument it behaves exactly as
  before. Still the only way to create a goal.
- `bankIsAccessible` / `bankIsReserved` / `BANK_PURPOSES` at module scope beside
  `bankValue`, so the Banks tab and (in A3) the advisor cannot disagree.

## Verification

- `node parsecheck.cjs` — PARSE OK. All **nineteen** runners green
  (`goaltest` 39/39, `banktest` 30/30). `node stage.cjs` — three sites agree.
- `installmenttest.cjs` case 27 needed fixing, not the code: it asserts
  `migrate()`'s source doesn't contain `fundedCatId`, and migrate's new comment
  *names* it as the precedent being followed. Now strips comments before
  searching — confirmed it still catches a real injected default.
- Driven against `sandboxworker.cjs`:
  1. A v1.31.0 document opened in the new build gains **none** of the four
     fields. After the `loaded` fix, a second open changes the document **not at
     all** — `changedAfterOpen: []`, not even `dataUpdatedAt`.
  2. Repeated reloads no longer refetch rates.
  3. Offline cold start (FX hosts blocked, cache aged to 30h) still renders
     `PHP 895,972` from cache with the existing "Using last available exchange
     rates" line. Before this change there were no rates at all.
  4. Setting a flag writes **only** that field on **that** account; untouched
     accounts still carry neither. Net Worth is unaffected — an account you
     can't reach is still yours.
  - Note: POSTs seen on the first run were the sandbox merging its own `GOOD`
    document into the seeded one, not a change of mine. The unconfounded test
    runs **unconnected**, where nothing but the app's own effects can touch the
    document.
- Goals detail sheet measured with `getBoundingClientRect` open: the deadline
  date input and the account select are both **exactly 38px tall, same top,
  same width**. Bank picker is owner-scoped (the joint account is absent).
  Verdict arithmetic checked by hand: 10,000 remaining over 3 whole months →
  3,333/mo required against a stated 1,000/mo → "Behind".

## Carried forward

- **A3 has not started.** Advisor still uses the old flat availability stack, so
  the flags set in this build have no effect on it yet.
- The per-bank `withheld = max(reserved, claimed)` rule is A3's, and is the
  thing that stops an emergency fund tracked as *both* a bank and a goal being
  subtracted twice.
- Not yet verified against the real dataset on a phone.
---

# 📋 SESSION NOTE — 2026-08-07 (v1.31.0) — Purchase Advisor, Build A

**Built, tested and staged; NOT deployed and not yet verified against the real
dataset on a phone.** Build B (Gemini narration) is deliberately not in this
build — `worker.js`, `wrangler.jsonc` and every secret are untouched.

## What it is

A new More-sheet tab, `advisor`, answering "should I buy this, and how?" three
ways: **cash now**, **on the payment plan you entered**, and **the earliest
period you could afford it**. It is a deterministic scenario engine over data
the app already holds — plans, pay periods, installments, banks, goals, the
Bills Reserve — combined *forward in time* for the first time. `projectSeries`
and `computeTargetForecast` are investment compounding only and answer a
different question; none of this could reuse them.

## The property that shaped everything

**It touches no synced data.** No new collection, and no entry in
`defaultData` / `migrate` / `fingerprint` / `tryAutoMergeAll` /
`CONFLICT_COLLECTIONS` / `countPendingChanges` / `purgeOldTombstones` / either
`BACKUP_*_KEYS` list. It cannot cause a KV write, cannot change a fingerprint
and cannot reach the other phone. The draft lives in `localStorage` under
`PURCHASE_DRAFT_KEY` and holds **inputs only, never a computed figure** — a
stored headroom or verdict would be a snapshot of a budget that has since
moved. Same reasoning as `VIEW_PROFILE_KEY` and `PROVENANCE_KEY`.
`purchasetest.cjs` pins that as a source-structure assertion, so a later edit
has to delete a test to break it.

## Engine

One contiguous module-scope block immediately after `installmentSummary`, all
pure, all taking `todayStr` rather than reading the clock: `categoryEffectiveAmt`
· `purchaseTrimFor` · `purchasePlannedTotal` · `purchaseHeadroomForBucket` ·
`purchaseAvailableStack` · `buildPurchaseSchedule` · `projectPurchaseScenarios`
· `purchaseVerdict` · `purchaseHistoryWarning`, plus `PURCHASE_HORIZON_BUCKETS`
(24) and `PURCHASE_THIN_PCT` (5).

- `categoryEffectiveAmt` is `BudgetView`'s `effectiveAmt` extracted verbatim.
  `BudgetView` now aliases it and `ExpenseTrackerView`'s second inline copy is
  gone. Pure refactor; asserted equivalent to the old expression case for case.
- **Headroom is Budget's own arithmetic, not a second opinion.**
  `purchaseHeadroomForBucket` is `income − Σ categoryEffectiveAmt −
  installmentTotal`. The anti-drift test drives the *sliced* `BudgetView`
  expression over the same fixture and demands equality, rather than restating
  it. Checked by hand in the browser too: Budget showed `Left SAR 4,100.00` for
  August and the advisor computed 4,100 for the same owner and bucket.
- Funded installment rows (`fundedElsewhere`) leave the obligation, exactly as
  `BudgetView.installmentTotal` drops them — their money is already inside a
  category's allocation.
- `purchaseAvailableStack` renders a subtraction, never a bare number. Goal
  balances live *inside* bank balances (`applyGoalContribution` writes a
  transfer and credits the goal; it never touches `banks`), so protecting a goal
  subtracts it here. The Bills Reserve is always protected. Joint
  (`household`) accounts are **reported and never added**, on a greyed line, so
  the exclusion can never be a silent surprise. An account in another currency
  that FX cannot yet convert is excluded and counted as `unconverted`, never
  added at face value.
- `earliest` accumulates `max(0, headroom)` — a bucket in deficit contributes
  nothing and never subtracts — and returns `null` past 24 buckets rather than
  extrapolating. An existing installment ending inside the horizon raises
  headroom on its own, which is why "wait until the Tabby plan finishes" needed
  no scenario of its own.

## UI

`PurchaseAdvisorView` + `PurchaseTrimSheet`, following `InstallmentsView`.
Cards through `neu(16)`, each leading with a `<Verdict>` line and demoting the
figures beneath it; every numeric field a `NumField`; both `<input type="date">`
carrying `fontFamily:"inherit"`, an explicit `height:38` and `appearance:none`
in all three prefixes, inside `flexWrap:"wrap"` rows of `flex:"1 1 150px"`
cells; both sheets `<Portal>`-wrapped with `useScrollLock` + `useDialogA11y` and
sized in `dvh`.

Levers (protected-goal toggles, per-category trims) are transient draft state
and recompute all three scenarios live. Switching owner clears them, because
they name that person's records. The one durable exit is "Create this plan in
Installments", which opens the ordinary `InstallmentEditSheet` through a new
`prefill` prop — kept distinct from `initial`, which is what decides whether
Save updates or creates. From that moment it is an ordinary installment and the
advisor has no further relationship with it.

## Verification

- `node parsecheck.cjs` — PARSE OK.
- All **nineteen** runners green, including the new `purchasetest.cjs` (35/35):
  the ten unit cases from the plan plus three source-structure assertions.
- Driven in a sandbox copy at `localhost:8791` on a seeded document. The tab
  opens, all three scenarios compute, both sheets portal to `document.body` and
  anchor to the viewport, the prefill lands correctly (3,900 financed over
  4 × 975 after a 1,300 down payment), and the two date inputs measure
  **exactly 38px tall, same width, same top** as the `NumField` beside them via
  `getBoundingClientRect` with the fields mounted.
- `node stage.cjs` — all three version sites agree (1.31.0 / 2026.08.07.0004).

## Known gaps, all deliberate

- Projection is **plan-based**. Trailing actuals appear only as a
  non-authoritative warning gated on `MIN_TREND_BUCKETS`, so it stays dark until
  ~Oct 2026. Re-check it the first period it appears — the same carried-forward
  action Home's two trend cards already have.
- The Bills Reserve is household-wide but scope is per-owner, so it is
  subtracted in full from one owner's cash. Conservative (understates
  available), and labelled in the stack.
- Single currency, no picker. No goal deadlines, no household scope, no Home
  card, no stored analyses.
- **Not yet checked against the real dataset on a phone.** Cross-check the
  headroom figure against the Budget tab for the same owner and month before
  trusting a verdict.

---

# 📋 SESSION NOTE — 2026-08-07 (v1.30.0)

Two Installments changes, one cosmetic and one structural. **Built, tested and
staged; not yet deployed and not yet verified on real hardware.**

## 1. `InstallmentEditSheet` layout

The two-up rows (Purchase date / Total amount, First payment due / Number of
payments) rendered at different heights and the date inputs spilled over the
field beside them. Two causes, neither of them padding — `box-sizing:border-box`
is global:

- `box` set no `fontFamily`, so a bare `<input type="date">` rendered in the UA
  font while `NumField` carried `tnum`. That is the height mismatch.
- Safari's date input builds a shadow-DOM `-webkit-datetime-edit` whose
  min-content width ignores `width:100%`. That is the overlap.

Fixed with `fontFamily:"inherit"` on `box`, a `dateBox` variant carrying
`minWidth:0` + `appearance:none` for all three date fields in the sheet, and
`flexWrap:"wrap"` + `flex:"1 1 150px"` on both rows — the treatment the Provider
row directly above them already had. The same `dateBox` was applied in
`InstallmentPaymentSheet`, which had the identical pair of fields.

## 2. A payment may be funded from a budget category

New optional `installmentPayments[].fundedCatId`. Full reasoning in
`docs/decisions.md` → "…except a payment funded from a budget category". Short
version: the ledger row is written `isTransfer:false` with `catId` = the chosen
category, so it consumes that envelope; the derived Budget row stays visible but
leaves `installmentTotal`, so nothing is allocated twice.

Also in this build:
- **BNPL providers default the first payment to today.** `INSTALLMENT_PROVIDERS`
  gained a `bnpl` flag (Tabby, Tamara); it only ever seeds a default and nothing
  downstream branches on it. A `dueTouched` guard stops it moving under someone
  who has already set a date.
- **Creating a plan whose first payment is already due offers to record it**,
  by opening the ordinary payment sheet — not a create-and-pay shortcut, which
  would become a second way for money to reach a payment.
- **The tx list annotates a cross-bucket funded payment** ("covers September"),
  derived at render like `"overdue"`, never stored.

`installmenttest.cjs` grew nine cases (20–28) covering the write, the classifier
in both directions, the visible-but-not-allocating row, both reopen paths, the
three degrade cases, migration byte-equivalence and a two-device merge. All 41
pass; all eighteen runners green.

## Verified in a browser (not just under test)

Driven against a sandbox copy on a fresh port, per CLAUDE.md's rule that a green
suite does not prove a change works:

- Every field in the create sheet measures 38 high, both cells 206 wide, paired
  tops identical, 10px gap — no overlap. Measured with `getBoundingClientRect`,
  with the sheet **open** (a live-DOM check only sees mounted elements).
- Shopping went to `Spent SAR 250.00 of SAR 1,250.00`.
- The unaccounted sheet showed `Tracked spending − SAR 250.00` and **no**
  Transfers-out line — counted once.
- August's derived group read `SAR 0.00` with the row visible, struck through,
  "Funded from Shopping — not allocated here".
- Delete reopened the payment, cleared the mark and returned the group to
  `SAR 250.00`; Restore re-derived it from the expense.
- A payment due Sep 7 paid 20 Aug warned in the sheet, annotated the ledger row
  `Shopping · covers September 2026`, and marked **September's** row.
- `dataUpdatedAt` stable across 18s; no console errors.

## Shipped

**Committed `cc9b510` on `main` — local only, NOT pushed.** Deployed to
`https://whered-it-go.pages.dev`; all three version sites confirmed in agreement
on the live origin.

## Known limitations and unfinished items

- **Neither phone has been confirmed on real hardware for v1.29.1 or v1.30.0.**
  Both are two builds behind anything verified outside desktop Chrome. This is
  now the oldest outstanding item and it has grown by one release.
- **The height fix is a measured constant, not a derived one.** `height:38` was
  measured in desktop Chrome. It is correct there and should hold anywhere the
  font metrics match, but a platform whose text input renders taller than 38
  would clip. Worth a glance on the phones when they are updated. The schedule
  rows carry the matching `height:32`.
- **`appearance:none` on a date input is untested on real iOS Safari.** It is
  the documented cure for the shadow-DOM min-width, and desktop Chrome is happy,
  but Safari is the browser the bug was reasoned about and it has not been seen
  there.
- **`installmentFundingCategoryExists` is not month-scoped** — it asks whether
  the owner has that category in *any* plan. Deliberate (see decisions.md), but
  it means a category that exists only in a much later plan is offerable from an
  early month. The picker itself is month-scoped, so this only matters to the
  writer's guard.
- **A funded payment is only ever offered at record time.** There is no way to
  retro-fit a category onto an already-recorded payment except by deleting the
  ledger row and recording it again. That round trip is tested and lossless, but
  it is a round trip.
- **The Expenses category filter now shows installment payments** under whatever
  category funded them. That is the intent, but it does mean a Shopping filter
  is no longer purely discretionary shopping.
- **No cross-owner funding, by construction.** If the two of you ever want one
  person's envelope to fund the other's installment, that is a deliberate design
  reversal, not a missing feature — see the owner-scoping rationale.

## Files created or modified this session

| File | What changed |
|---|---|
| `index.html` | Both fixes. `INSTALLMENT_PROVIDERS` `bnpl` flag; `installmentFundingCategoryExists`; `applyInstallmentPayment` takes `fundedCatId`; delete/restore/unlink clear or re-derive it; `derivedInstallmentRowsFor` emits `fundedElsewhere`; `installmentTotal` excludes it; derived-group render; `fundingCategoriesFor` in `App`; `InstallmentPaymentSheet` picker + cross-bucket warning; `renderTxRow` annotation; `InstallmentEditSheet` layout; version constants |
| `installmenttest.cjs` | Nine new cases (20–28) and the `withCats`/`fundedSeed` fixtures |
| `sw.js` | `BUILD_ID` → `2026.08.07.0003` |
| `version.json` | 1.30.0 / `2026.08.07.0003` |
| `docs/decisions.md` | New "…except a payment funded from a budget category" section |
| `docs/current-status.md` | This note |
| `CLAUDE.md` | Date-input rule in Styling; `fundedCatId` in the Installments rules |

Created and removed within the session: `sandbox2/`, `scratch-serve.cjs`. Neither
is committed — the sandbox pattern is worth recreating rather than keeping, but
if a *reusable* one is ever wanted, commit it (see CLAUDE.md on `baltest.cjs`).

## Next steps

1. **Update both phones and confirm v1.30.0 on real hardware.** Two things to
   look at specifically, because desktop Chrome cannot answer either: the create
   sheet's two-up rows on a narrow iOS Safari viewport (the `appearance:none`
   and `height:38` fixes), and that a real Tabby purchase records payment #1
   from Shopping end to end.
2. **Decide whether to push `cc9b510`.** Three releases are now committed local
   only.
3. **Consider making the funding link editable after the fact** — the delete-and-
   re-record round trip works but is the obvious next friction point.
4. The pre-existing roadmap item about `derivedInstallmentRowsFor` and linked
   categories (current-status item 355) is now partly addressed; re-read it
   against what shipped before acting on it.

---

# 📋 SESSION HANDOVER — 2026-08-07 (v1.29.1)

**v1.29.0 shipped and is on both devices; the iPad was recovered by
reinstalling the PWA, which used the new adopt path and matched the iPhone
exactly.** v1.29.1 follows it.

## Why v1.29.1 exists

v1.29.0's own change to Settings' Reset — from "load sample data" to "empty
this device" — was a quieter version of the bug that release fixed. Reset marks
the document dirty, the idle autosave fires ~8s later, and the emptied device
uploads itself, so the other phone empties too. See `docs/decisions.md`,
"Reset was the same bug, quieter".

## What changed

- `PROVENANCE_KEY` now holds `"sample"` **or** `"reset"` — one behaviour, two
  values. Reset calls `markResetData()`, so an emptied device cannot auto-push.
- **Reset keeps preferences** (`resetToEmptyDoc`/`RESET_KEEPS`). Without this
  the next pull returned the records but the owner names as "Me"/"My wife" —
  the reset device's fresh settings stamps beat the cloud's in
  `mergeSettingPaths`.
- **The mark lifts on record count**, not on `stillDirty`
  (`countLocalRecords(merged) <= countLocalRecords(remote)`). The obvious gate
  left the reset device held forever.
- Settings gained a line under Reset: "Empties this device only."

## Verified

18 runners green (`synconnecttest.cjs` now 33 cases), parsecheck, `stage.cjs`.
In Chrome against `sandboxworker.cjs`:

| Scenario | Result |
|---|---|
| Established device → Reset | **0 requests** over 25s despite the doc being dirty |
| Reset → Pull | records **and** owner names recovered; mark cleared, device syncs again |
| Sample loaded → Pull | demo records merge locally but mark **stays**; 0 requests over 22s |

Both follow-on defects (settings loss, permanent hold) were found only by
driving the app — the unit tests passed throughout.

## Files touched across this whole session (v1.29.0 + v1.29.1)

### Created

| File | Purpose |
|---|---|
| `synconnecttest.cjs` | **Runner #18.** 33 assertions — `syncConnectDecision`, the record-vs-settings distinction, sample/reset provenance, `resetToEmptyDoc`, plus three *source-structure* assertions pinning guards that live in `App()` effects and cannot be sliced (the connect effect must not set `cloudConfirmedRef`; `pullFromCloud` must set it only after `cloudDocProblem`; the no-baseline guard must precede the conflict-retry merge). |
| `samplescan.cjs` | Tooling, **not a runner** — finds demo records inside a real backup by value + cohort date, never by name. Reports only; `--remove` takes explicit ids and writes a separate `.cleaned.json`. Never run against real data yet. |

### Modified

| File | What |
|---|---|
| `index.html` | `defaultData()` split; `syncConnectDecision`, `countLocalRecords`, `settingsSignature`, `resetToEmptyDoc`, `RESET_KEEPS`, `RECORD_COLLECTIONS`; provenance helpers; `FirstConnectSheet`; `adoptCloudDoc`; the three connect call sites; `migrate()` defaults for `goals`/`investments`/`banks`/`assets`; Settings' Reset + Load-sample buttons |
| `importtest.cjs`, `cloudguardtest.cjs` | Slice start marker moved to `function structuralDefaults(){`; cloudguard gained 2 cases (empty doc passes the gate; the empty shape carries no sample records) |
| `sw.js`, `version.json` | Build ids, twice |
| `CLAUDE.md` | New "Connecting a device" section; `defaultData` split; provenance and Reset rules; runner count 17 → 18 |
| `docs/decisions.md` | Two entries: "A merge needs a shared ancestor", "Reset was the same bug, quieter" |
| `docs/current-status.md` | This handover |

**Commits:** `661269c` (v1.29.0), `e8ed2ee` (v1.29.1). Both **local only —
`origin` has not been pushed.**

## Left undone this session

- **The live cloud document was never cleaned.** Prevention only, by choice.
  `samplescan.cjs` exists for it and is waiting on a `Settings → Download`
  export. Note the trap it was written around: `defaultData()`'s seed records
  were authored from the user's real life ("Charlene", "Tuition Fee Wife",
  "Braces", "Toyota Raize"), so name-matching would delete genuine records.
- **v1.29.1 has not been verified on real hardware.** Every browser check was
  desktop Chrome against `sandboxworker.cjs`. v1.29.0 *is* on both devices;
  1.29.1 is deployed but unconfirmed on the phones.
- No per-view onboarding empty states — a fresh device is blank-but-working.

---

# 📋 SESSION HANDOVER — 2026-08-07

**Built, tested and staged: v1.29.0 / `2026.08.07.0001`. NOT yet deployed and
NOT yet on either phone** — `npx wrangler pages deploy site` is the remaining
step. `worker.js` is untouched, so no `wrangler deploy` is needed.

## The bug

A new Safari/PWA origin booted showing the **sample dataset**. Entering the
sync passphrase then pulled the real cloud document, merged the demo records
into it, and auto-pushed the union — so both real phones received 15 fabricated
budget categories, 3 goals and 3 investments.

Nothing malfunctioned. `tryAutoMergeAll` is id-keyed and a fresh device's ids
are all novel, so the merge succeeded perfectly and preserved every demo
record. The missing idea was that **a merge is only meaningful against a shared
ancestor**; see `docs/decisions.md`, "A merge needs a shared ancestor".

Three code paths each decided this independently, and all three were doors to
the same outcome:

1. the connect effect set `cloudConfirmedRef=true` merely because `/sync/meta`
   accepted the passphrase — an authentication fact that says nothing about the
   document, clearing the device to push over data it had never read;
2. `pullFromCloud` merged and re-pushed;
3. `saveToCloud`'s conflict retry merged into the document a rev rejection
   handed back.

## What changed

- **A fresh device now opens empty.** `defaultData()` split into
  `structuralDefaults()` (settings + one income-0 plan per owner as a skeleton)
  and `sampleData()`. Sample data is now an explicit Settings button; Reset
  became "Reset to empty".
- **`syncConnectDecision(ctx)`** — one pure module-scope function, called by all
  three paths above. `hasBaseline` first, so an established device merges
  exactly as before.
- **`FirstConnectSheet`** — a blocking chooser when a never-synced device
  holding real records meets an established cloud. Merge-with-counts, never
  overwrite. Deliberately not `ConflictModal`.
- **Sample provenance** in per-device `localStorage`, sticky, cleared only by
  an explicit Save to Cloud / Reset / adopt / merge.
- **`migrate()` now defaults `goals`/`investments`/`banks`/`assets`** — without
  it, adopting a sparse cloud document immediately pushed a normalised copy
  back, so "adopt without POSTing" wasn't actually true.

## Verified

All **18** committed runners green (`synconnecttest.cjs` is new, 27 cases), plus
`parsecheck` and `stage.cjs`'s three-way version check.

Driven for real in Chrome against `sandboxworker.cjs`, watching the network log:

| Scenario | Result |
|---|---|
| Fresh origin, no passphrase | opens **empty** — 0 goals/investments/banks/assets/categories |
| Fresh device + populated cloud | `GET /sync/meta`, `GET /sync`, exact adoption, **0 POST** over 16s |
| Local records + populated cloud | chooser blocks, local data untouched, no baseline written, **0 POST** |
| "Merge and upload" | both sides survive (both transactions, both categories), then pushes |
| Sample data on a connected device | **0 requests** over 20s despite the doc being dirty |

Two findings came only from the browser and could not have come from the unit
tests: the `migrate()` defaults gap above, and the fingerprint-anchored
provenance mark clearing itself within seconds of load (see decisions.md).

## Not done

- **The live cloud document is not cleaned up.** Prevention only, by choice —
  any sample records already merged into the real dataset have to be deleted by
  hand in the app.
- No per-view onboarding empty states; the empty app is blank-but-working.

---

# 📋 SESSION HANDOVER — 2026-08-06

**Live: v1.28.1 / `2026.08.06.0006`, served from Cloudflare Pages at
https://whered-it-go.pages.dev, installed on both phones.**
Everything below is verified on real hardware unless it says otherwise.

## What shipped

Six app builds and a hosting migration. Each shipped and was verified on its
own; detail for each is in its own section below.

| Build | Version | What |
|---|---|---|
| 4a | v1.24.0 | **Repeat chips + autofocus** — one tap refills a past transaction's category, title and amount |
| 4b-1 | v1.25.0 | **Rapid entry** — "Save & add another" keeps the sheet open; undo toast learned to reverse an *add* |
| 4b-2 | v1.26.0 | **Pinned shortcuts** — new synced `txTemplates` collection, deduped against Repeat |
| 5a-1 | v1.27.0 | **Goal contributions unified** — one linked write; three screens no longer disagree |
| 5a-2 | v1.28.0 | **Category → goal link** — an untracked category can credit a goal |
| — | v1.28.1 | **Moved to Cloudflare Pages** + `start_url`/`APP_SHELL` fix for its `/index.html` redirect |

**Build 4 and 5a are both complete.** Nothing is queued.

### Two bugs found that were on no list
Both surfaced from fixtures built to test something else — worth remembering as
a technique, not luck (see `decisions.md`, "The fixture found the older bug"):

1. **The old name chips offered `isExtraFunds` rows as spend titles** — money
   coming *in* suggested as a title for money going *out*. Shipped long before
   this session; fixed in v1.24.0.
2. **`addExpenseTx` minted its id inside a `setData` updater.** React may invoke
   an updater more than once, so one logical insert could produce two ids.
   Latent until v1.25.0 needed the id returned; fixed by hoisting it out.

## Files created

| File | Purpose |
|---|---|
| `stage.cjs` | Stages the 7 served files into `site/` **and blocks the deploy if the three `BUILD_ID` sites disagree**. Guard verified against a deliberate mismatch. |
| `templatetest.cjs` | 17 assertions — pinned shortcuts, Repeat/Shortcut dedupe, migration byte-equivalence, merge |
| `goaltest.cjs` | 27 assertions — goal contributions as one linked write, both delete directions, legacy records, the classifier, the category link |
| `.nojekyll` | Now only relevant to the GitHub Pages fallback; harmless to keep |

## Files modified

`index.html` (all six builds), `sw.js` + `version.json` + `manifest.webmanifest`
(build ids, plus the Cloudflare `start_url`/`APP_SHELL` fix), `worker.js` (the
new origin in `ALLOWED_ORIGINS`), `suggesttest.cjs` (11 → 26 assertions),
`.gitignore` (`site/`, `sandbox*/`), `CLAUDE.md`, and all three files in `docs/`.

**Runner count is now 17** — `templatetest.cjs` and `goaltest.cjs` joined the
15 that existed at the start of the session. `CLAUDE.md` lists all of them.

---

# ⚠️ KNOWN BUGS, LIMITATIONS AND UNFINISHED WORK

_Current as of 2026-08-07. Supersedes the older list further down this file._

## From the 2026-08-07 sync session

- **Sample records may still be sitting in the live cloud document.** Not
  cleaned, by choice. `samplescan.cjs` is committed and ready but has never
  been run against real data. It needs a `Settings → Download` export, and
  optionally an older pre-contamination export via `--before` for a third
  signal. **Do not match on name** — see the note in the handover above.
- **A device that loses `localStorage` but keeps nothing else becomes "new"
  again.** The whole first-connection scheme keys on
  `meta.lastCloudSnapshot != null`. iOS evicts PWA storage under pressure and
  after long disuse, so a phone that has synced for months can present itself as
  a fresh device. It **fails safe** — it routes to the blocking chooser, not to
  silent contamination — but the chooser will occasionally appear to a
  long-standing device and the copy doesn't anticipate that.
- **`migrate()` may still be missing defaults for other collections.** Four
  (`goals`/`investments`/`banks`/`assets`) were found missing only because
  adopting a sparse cloud document exposed them. Nobody has audited the rest
  against `BACKUP_ARRAY_KEYS`. The symptom is subtle: a device adopts, then
  immediately pushes a normalised copy back.
- **"Decide later" in `FirstConnectSheet` leaves a device unsynced
  indefinitely.** Deliberate — the question genuinely hasn't been answered, and
  it re-asks on the next pull — but nothing nags, so a device could sit
  disconnected for weeks unnoticed.
- **There is no longer a true factory reset.** Reset now keeps preferences by
  design. Clearing currency/owners/pay-periods requires deleting site data.
- **`sampleData()`'s demo records are indistinguishable from real ones by
  shape.** The only reliable discriminators are exact values and shared cohort
  dates. If the seed data is ever edited, `samplescan.cjs` follows it
  automatically (it slices from `index.html`), but any *already-contaminated*
  document becomes harder to clean.
- **`sandboxworker.cjs` answers every POST with `conflict:true` and stores
  nothing.** So a *successful* push has never been exercised against it — the
  observed POST retries in testing were that artifact, not an app loop. Real
  push success is only ever verified against the live Worker.
- **Three of `synconnecttest.cjs`'s assertions match source text**, not
  behaviour, because the guards they protect live inside `App()` effects.
  They break loudly if that code is reworded — that is the intended trade, but
  a future refactor should update them rather than delete them.

## Needs attention before it's forgotten

- **Both phones still hold a full copy of the financial document — and the sync
  passphrase — under the OLD `pgarktk-cloud.github.io` origin.** Browser storage
  is per-origin, so the migration copied nothing and deleted nothing. That data
  is live, not stale, and it is a second unmanaged copy of everything. Clear
  site data for the old origin on both phones once you're confident you won't
  roll back. **Do this deliberately — it is the only cleanup step with a
  privacy dimension.**
- **GitHub Pages is still live** serving v1.26.0, and `https://pgarktk-cloud.github.io`
  is still in `ALLOWED_ORIGINS`. Both are the intentional rollback path. Remove
  in about a week (`worker.js` edit + `npx wrangler deploy`).

## Deliberate scope limits (not defects)

- **Rapid entry is tracked-mode only.** A Goals contribution writes two records
  and an untracked transfer also writes `quickTransferLast`; a one-record undo
  can't honestly reverse either.
- **`category.goalId` is offered on untracked categories only** — a tracked
  category is money spent, and only money moved can fund a goal.
- **A category-linked transfer counts as a "Goal contribution", not "Transfers
  out".** The unaccounted sheet still reconciles exactly, but hand-summing
  untracked envelopes against "Transfers out" now comes up short by whatever
  went through a linked category. **5b must account for this.**
- **Goal contributions made before v1.27.0 carry no link**, so deleting one half
  leaves the other alone. Deliberate — pairing historical records by amount and
  date would invent a relationship the user never asserted.

## Carried forward, still true

- **The Durable Object handler has no automated test.** Cutover checks only —
  that is the honest status, not implied coverage. Needs `wrangler dev` plus a
  harness this repo doesn't have.
- **3C-3: `payPeriods.actualStarts` merges whole-object, newest-document-wins**,
  so a correction can be silently dropped. Blocked on a design question, not
  effort: clearing an override *deletes* the key, so a union merge would
  resurrect a cleared correction.
- **The add-transaction Amount field is not a `NumField`** — it's a hand-rolled
  string-draft input with the same commit-on-blur/`evalMathExpr` behaviour.
  Leave it or convert it deliberately; don't half-convert it.
- **Home's two trend cards have never met real history** (~Oct 2026, first
  period with 3 completed buckets). Unit-tested only, and they now read
  corrected period lengths too.
- **`crediting:"monthly"`** is implemented and unit-tested but has never run
  against a real monthly-crediting account.
- **"Add sub-item" can silently drop a category's manual amount.** Known, left
  alone; the fix would now have to be written fresh.
- **`moveCat` in Expenses is the remaining accidental plan-materialisation
  surface** — reordering envelopes on a carried-forward month creates a plan.
- **16 of 24 plans are unreferenced** (~29% of the document). Offered and
  declined as cosmetic. If ever done: tombstone, don't hard-delete.
- **The conflict modal is unreachable and has never been seen rendered.** If it
  appears, `tryAutoMergeAll` threw — treat it as an exception report.
- **Two empty "retrigger deploy" commits** sit in history from the GitHub Pages
  troubleshooting. Cosmetic.
- MP2 remains an annual-bucket approximation; gold jewellery and other
  investment types are out of scope; the snapshot weekly window (365d) isn't
  user-configurable.

## Security residuals

- Assume the **pre-2026-08-01 dataset may already be public** (`SYNC_TOKEN` was
  readable in the served `index.html` for months).
- **No rate limiting on the Worker** — mitigated only by the passphrase being
  five random words. Add Cloudflare Rate Limiting on `/sync*` *before* ever
  shortening it.
- **No Content-Security-Policy** — but this is now *possible* for the first
  time. GitHub Pages couldn't set headers; Cloudflare Pages can, via a
  `_headers` file. Babel's in-browser JSX compilation still needs
  `unsafe-eval`, so it would be weak until the app gains a build step.

---

# ▶️ NEXT STEPS

**Do these first — they close out 2026-08-07 and are cheap.**

0a. **`git push`.** Two releases (`661269c`, `e8ed2ee`) are committed locally
    and deployed to production, but `origin` has neither. Production is
    currently running code that exists in exactly one place.
0b. **Update both phones to v1.29.1** and confirm on real hardware: Settings →
    "Update Available — Reload", swipe-close the PWA if it doesn't take.
    v1.29.1 has only ever been verified in desktop Chrome. Worth doing before
    anyone presses Reset on a device still running 1.29.0, which still has the
    auto-push hole.
0c. **Clean the sample records, if any survived.** `Settings → Download` on
    either phone, then `node samplescan.cjs <file.json>` — it reports and
    changes nothing. Review, then `--remove <ids>`, then import the cleaned
    file through Settings → Import (which previews it and keeps a safety copy).
    Soft-deletes, so the tombstones propagate correctly to the other device.
0d. **Audit `migrate()` for the remaining missing defaults** — walk
    `BACKUP_ARRAY_KEYS` and check each has a default. Same class of bug as the
    four found this session, and the symptom (adopt-then-push-back) is quiet.

Then, in rough order of value. Nothing below is blocked on anything else.

1. **5b — plan-vs-actual in `UnaccountedSheet`.** Fully scoped in `roadmap.md`.
   Two inputs that are easy to miss: use base `e.budget` (extra funds are
   already their own line), and the planned side of "Transfers out" must include
   `derivedInstallmentRowsFor(...)` *and* account for linked categories now
   counting as goal contributions.
2. **3C-3 — `payPeriods.actualStarts` per-record merge.** Answer the deletion
   question first; the merge is the easy half.
3. **A test harness for the Durable Object.** The only genuinely untested code
   in the sync path.
4. **Housekeeping (~1 week out):** clear the old origin's site data on both
   phones, turn GitHub Pages off, drop `github.io` from `ALLOWED_ORIGINS`.
5. **Optional:** a `_headers` file on Cloudflare for real cache-control, and a
   first pass at a CSP.

**Deploying** is now `node stage.cjs && npx wrangler pages deploy site
--project-name=whered-it-go --branch=main`. `stage.cjs` refuses to ship if the
three `BUILD_ID` sites drift. Run `node parsecheck.cjs <babel-path>` and all 18
runners first — see `CLAUDE.md`.

Two deploy notes from 2026-08-07: wrangler infers the branch from git, so
omitting `--branch=main` still produced a Production deployment — but pass it
anyway rather than relying on that. And **Cloudflare's edge caches
`version.json` and `sw.js` on the bare URL**, so a curl straight after a deploy
can show the *previous* build while the new one is live. Append a cache-busting
query (`?cb=1`) before concluding a deploy failed; the app's own update check
already does this.

---

## 🚚 The app moved to Cloudflare Pages (2026-08-06, v1.28.1)

**New address: https://whered-it-go.pages.dev** — the old
`pgarktk-cloud.github.io/budget-tracker-app` is still live as a fallback.

**Why.** GitHub Pages stopped deploying this repo. Five runs, `build` green
every time, `deploy` timing out every time with *"Timeout reached, aborting"*,
while githubstatus.com stayed green throughout. Four remedies failed: adding
`.nojekyll`, cancelling and re-running, deleting the stuck run, and recreating
the Pages site from scratch via the Source toggle. Four builds were stranded
unshipped and both phones were stuck on v1.26.0. Cloudflare already hosted the
sync Worker, so this consolidated rather than added a vendor. **The first
Cloudflare deploy finished in under two seconds.**

### What shipped with the move
- **`stage.cjs` (new, committed)** — stages the seven served files into `site/`
  and **blocks the deploy if the three `BUILD_ID` sites disagree**. That
  three-way match has been a documented hazard for months with nothing checking
  it. Verified by feeding it a deliberate mismatch: exits 1 and names both sides.
- **v1.28.1** — `start_url` is now `"./"` and `APP_SHELL` drops `'./index.html'`,
  because **Cloudflare Pages 308-redirects `/index.html` → `/`**. Caught during
  verification, before either phone installed the PWA — an installed app would
  otherwise have redirected on every launch.
- **`worker.js`** — `whered-it-go.pages.dev` added to `ALLOWED_ORIGINS`, with
  the GitHub origin **deliberately kept** so a phone that hasn't moved yet still
  syncs. That is what makes the migration phone-by-phone instead of all-at-once.
  Worker version `baeffdd2-efd5-4914-bb85-1046ed149c3d`; both bindings
  (`SYNC_ROOM`, `ALLOC_KV`) confirmed present after the deploy.

### Verified
`parsecheck` OK, 17 runners green. On the live site: all seven files 200,
`version.json`/`index.html`/`sw.js` all read **1.28.1 / `2026.08.06.0006`**, the
served `index.html` genuinely contains the v1.27/v1.28 code
(`applyGoalContribution`, `categoryGoalFor`, `recentTxTemplates`). In a browser:
app mounts, service worker registered at scope `/`, cache named
`allocation-shell-2026.08.06.0006`, Settings reads *Version 1.28.1 · Build
2026.08.06.0006*, no console or runtime errors. Worker CORS: the new origin and
the old origin both allowed, `localhost` still allowed (the sandbox workflow
depends on it), an unknown origin correctly gets **no** ACAO header, and a
tokenless request still returns **401**.

### Device migration — DONE, both phones (2026-08-06)
Both devices are on `whered-it-go.pages.dev` with the full dataset and the app
installed to the home screen.

**The v1.23.0 "new device with nothing local" path ran for real and worked.**
Browser storage is per-origin, so each phone arrived empty; entering the
passphrase made the app validate the cloud copy through `cloudDocProblem()` and
adopt it wholesale. That path had only ever been exercised against a fake Worker
in a sandbox — this is its first run on live data, and it did exactly what it
was built to do. Worth knowing: **the data was never "moved"**, it came down
from the Worker, which is where it has always actually lived. The host only ever
served the app shell.

Left deliberately in place for about a week: GitHub Pages, and the `github.io`
entry in `ALLOWED_ORIGINS`. Remove both once there's no intention of going back.

**Rollback (still available):** the cloud document was never modified by any
step, the old address still serves v1.26.0, and each phone's old-address storage
remains until cleared.

_Previously: 2026-08-06 (category → goal link, v1.28.0)_

**Live build:** `2026.08.06.0006` / v1.28.1, served from Cloudflare Pages and
**installed on both phones**. Every build from v1.24.0 through v1.28.1 is now
live on-device.

**Everything shipped today is verified on both phones**, including the v1.27.0 /
v1.28.0 two-phone merge test (see that section — it was the first user action
writing into two independently-merging collections, and all three cases passed).
**Nothing is queued.**

**Pick up next**, in rough order of value:
- **5b** — plan-vs-actual in `UnaccountedSheet`. Scoped in `roadmap.md`, and it
  now has an extra input: a category-linked transfer counts as a Goal
  contribution, so hand-summing untracked envelopes against "Transfers out"
  comes up short. See the reconciliation note in the v1.28.0 section.
- **3C-3** — `payPeriods.actualStarts` per-record merge, the last deliberate
  sync hold. Blocked on a design question: clearing an override *deletes* the
  key, so a union merge would resurrect a cleared correction.
- **The Durable Object has no automated test.** Needs `wrangler dev` plus a
  harness this repo doesn't have. Verified by cutover checks only — that is the
  honest status, not implied coverage.

Housekeeping, in about a week: remove GitHub Pages and drop the `github.io`
entry from `ALLOWED_ORIGINS` in `worker.js` once there's no intention of going
back.

## Category → goal link (2026-08-06, v1.28.0)

Build `2026.08.06.0005` / v1.28.0. Second half of 5a, and the reason 5a-1 went
first: this build adds **no new contribution path**, it extends the one that
already existed.

An untracked budget category can now carry an optional **`category.goalId`**.
Transferring against a linked category credits the goal in the same action — one
write, the same linked pair 5a-1 introduced.

**Untracked categories only.** A tracked category is money *spent*; only an
untracked one is money *moved*, which is the only thing a goal can be credited
from. Offering this on "Groceries" would be offering nonsense.

**`catId` is the category, `goalId` is the goal.** `applyGoalContribution` gained
a `catId` override, so a linked transfer keys to the **budget category** — which
is what the envelope's "transferred" figure and the Expenses category filter
read — while `goalId` records that a goal was credited. They were only ever the
same field by coincidence, on a direct contribution.

**A stale link degrades; it never swallows a transfer.** The link is resolved by
`categoryGoalFor` *before* the write, not inside `applyGoalContribution` — that
function writes nothing for an unknown goal, which is right for a direct
contribution but would silently drop a transfer whose linked goal was later
deleted. A deleted goal makes the category behave as an ordinary untracked
category again, and the "Also credits …" line simply stops rendering.

**`quickTransfer` became one write.** It was two `setData` calls (the row, then
`quickTransferLast`), which is the half-written-pair hazard installments and goal
contributions already avoid.

**`goalId` is deliberately NOT defaulted in `migrate()`.** The project rule says
a new field on an existing record type needs a default — but that rule exists so
readers never hit an undefined they must guess at, and here absent already means
the only sensible thing: not linked. Writing `goalId:null` onto every category in
every plan would change `fingerprint()` for every document and cost each device a
KV write to say nothing. Same call as `ord` on an expense.

**It lives on a plan record**, so it copy-on-writes like any other category edit,
gets `updatedAt` from `stampPlanRecords`, merges per record (3C-2), and is
carried into a cloned plan by `clonePlanRecord`'s `{...c}` spread.

### One consequence to know before reconciling
A linked transfer classifies as a **Goal contribution**, not "Transfers out" —
`unaccountedParts` prefers `goalId`, and that is the truthful attribution. Both
lines subtract, so the unaccounted sheet still reconciles exactly. But
**hand-summing untracked envelopes against "Transfers out" will now be short by
whatever went through a linked category.** This is the same class of trap the
extra-funds note already records, and **5b must account for it** when it puts
planned figures beside the actuals.

### Verified
`node parsecheck.cjs` OK. **Seventeen runners green**; `goaltest.cjs` extended
19 → **27** with the link, its degradation, the `catId`-vs-`goalId` split, delete
symmetry on a linked row, and both classifier outcomes.

Sandbox, fresh origin:
- the picker appears on **untracked** categories only — opening a tracked
  category's panel adds none — and only when the owner has goals
- linking "Long Term Savings" → "Emergency Fund" **materialised a custom August
  plan** (copy-on-write) and stamped `updatedAt` on the category
- the Expenses untracked card then read *"Also credits Emergency Fund"*
- transferring 2,750 wrote one expense with `catId` = **the category**,
  `goalId` = the goal, `isTransfer:true`, linked both ways, **no `ord`**, and
  took the goal 18,500 → 21,250
- the envelope read *"✓ Transferred SAR 2,750.00"* — category maths intact
- the unaccounted sheet read *Income 22,000 · Goal contributions −2,750 · Still
  unaccounted 19,250*
- **the degradation case**: deleting the goal hid the "Also credits" line, and a
  further transfer against the still-linked category **still landed**, as a plain
  transfer with no `goalId`. The picker reads "No goal".
- survived a reload; dark mode legible; no console errors or runtime exceptions

**Verified on both phones 2026-08-06**, as part of the v1.27.0 two-phone run
below — the linked-transfer path shares `applyGoalContribution` with the direct
contribution, so the merge behaviour proven there covers this build too.

## Goal contributions are one action again (2026-08-06, v1.27.0)

Build `2026.08.06.0004` / v1.27.0. First half of 5a. **A behaviour change to how
money moves**, so read this before the next reconciliation.

**The defect.** Money reaching a goal has always meant two things — it leaves
the budget (a ledger transfer) and it lands in the goal (a contribution). Three
UI paths did this, and they disagreed:

| Path | Ledger row | Contribution |
|---|---|---|
| Add-transaction modal → Goals | yes, but a **separate `setData`** | yes |
| Goals tab → "Add money" | **no** | yes |
| Home → goal contribution sheet | **no** | yes |

So a goal could grow with **nothing leaving the budget** — the money was still
sitting in "still unaccounted for" while the goal said it had arrived. Which
screen you started from decided what the action meant. And the one path that did
both used two writes, so a sync landing between them could persist half of it.

**`applyGoalContribution` and its four delete/restore mirrors** (module scope,
pure) are the one place it happens now, and both records land in **one** write —
the rule installments already follow. `contributeToGoal` is the single App
mutator over them, and all three UI paths call it. **`addContribution` is
deleted rather than kept alongside**: leaving a goal-only writer in place is
exactly how the three paths drifted, and a second entry point would silently
reintroduce it.

**The two records link by id** (`expense.goalContributionId` /
`contribution.expenseId`). Before this the only thing tying a transfer to a goal
was `catId` happening to equal a live goal id — which is why `CLAUDE.md` warned
that *deleting a goal silently reclassifies its contributions as transfers*.
`unaccountedParts` now prefers the explicit link, so a row written by this build
says what it is and cannot rot that way. The sheet still reconciles either way;
the fix is that figures stop moving between lines months after the fact.

**Deleting either half now takes the other with it, and undo reverses both.**
Deleting the transfer means the money didn't move, so the goal gives it back —
in the same write. `removeExpenseTx`, `removeContribution` and `restoreRecord`
all route through the pure functions, so the two halves cannot get out of step.

**Nothing is backfilled.** An absent link means "made before this build", the
same way an absent `ord` means "unplaced" — guessing which historical expense
pairs with which historical contribution would be inventing data. Legacy records
keep exactly their old behaviour, including deleting alone, and that is asserted
in the runner and was watched in the browser.

### What this changes about your numbers
Every future contribution from the Goals tab or the Home sheet now **also
deducts from the budget**, which it did not before. Existing contributions are
untouched. If a past goal contribution was made from the Goals tab, it is still
invisible in the unaccounted maths — that history is not rewritten.

### Verified
`node parsecheck.cjs` OK. **Seventeen runners green**, including new
**`goaltest.cjs` (19/19, committed)** — the linked write, both delete directions
and both restores, non-positive amounts and deleted goals writing nothing at
all, legacy records unchanged, and the classifier including the deleted-goal
case with an explicit assertion that the sheet's total is unchanged either way.

Sandbox, fresh origin, against the seeded default goals (whose contributions are
legacy — no links — which is exactly the mixed state a real device will be in):
- Goals tab → "Add money" 750 wrote **both** records, linked, `isTransfer:true`,
  `catId` still the goal id, `createdAt` stamped, **no `ord`**
- the Expenses hero's sheet then read *Income 22,000 · Goal contributions −750 ·
  Still unaccounted 21,250* — money that was previously invisible there
- deleting the **transaction** took the goal from 19,250 → 18,500 and UNDO
  restored both
- deleting the **contribution** removed the ledger row too, and UNDO restored
  both
- deleting the **legacy** "Opening balance" contribution tombstoned it alone and
  left the ledger untouched
- survived a reload; no console errors, no runtime exceptions

### VERIFIED ON TWO REAL PHONES, 2026-08-06
This was the interesting one: a goal contribution is **the first user action
that writes into two collections which merge independently** (`expenses` and
`goals.contributions`). Nothing else in the app does that, so the coupling had
never met a real merge. All three cases passed:

- **the write arrives whole** — Add money on phone A, and phone B showed *both*
  the higher goal total *and* the matching transaction. Before v1.27.0 the goal
  would have grown with no money leaving the budget.
- **the delete travels** — deleting the contribution on one phone removed both
  halves on the other. The two records cannot drift apart across devices.
- **the real merge** — with both phones in airplane mode, a contribution added
  to a *different* goal on each, then reconnected: **both survived on both
  phones.** Airplane mode is what makes this reachable at all; otherwise
  `pushImportant` and the 8s autosave upload before the devices can diverge.

The two-collection coupling is therefore confirmed on real hardware, not just in
`goaltest.cjs`.

## Pinned transaction shortcuts (2026-08-06, v1.26.0)

Build `2026.08.06.0003` / v1.26.0. Second half of Build 4b, and the last piece
of Build 4. **A new synced collection**, so unlike the two builds before it this
one does touch the data model.

**A shortcut is chosen; a Repeat chip is observed.** That distinction is the
whole feature. Repeat is derived from recent history, so it forgets anything you
haven't done lately and it is per-device by definition. `data.txTemplates` is a
record someone pinned on purpose: it survives a quiet month, and it reaches the
other person's phone.

`{id, owner, catId, name, amount, note, createdAt, updatedAt, deletedAt?}`.

**Its own row, not merged into Repeat.** Same reasoning as v1.24.0's name chips:
one row that sometimes offers a delete affordance and sometimes doesn't is
harder to explain than two rows that each mean one thing. The Shortcuts row
renders only when the owner has pinned something, so it costs nothing to anyone
who never uses it.

**The two rows must not show the same entry twice.** `recentTxTemplates` gained
`excludeKeys`, and the view passes it the pinned `name|catId` keys — so pinning
an entry *moves* it from Repeat to Shortcuts rather than duplicating it, and
unpinning moves it back. Both directions are asserted in the runner and were
watched in the browser.

**Pinning is idempotent on `(owner,name,catId)`.** Re-pinning updates the amount
rather than creating a twin, because the row is keyed by what the user
recognises, not by an id they never see. A **tombstoned** match is revived
rather than left dead beside a new record, so pin/unpin/pin doesn't accumulate
junk that syncs forever.

**Unpinning tombstones and takes the undo toast** rather than a confirm dialog —
the trade every other delete in this app makes. It reuses the *restore* half of
the toast, which the rapid-entry build (v1.25.0) had left untouched.

### The seven touch points, plus one the roadmap didn't list
`defaultData`, `migrate`, `fingerprint`, `tryAutoMergeAll`,
`CONFLICT_COLLECTIONS`, `countPendingChanges` (via that list) and
`purgeOldTombstones` — the same set `installments` needed.

The eighth is **`BACKUP_ARRAY_KEYS` + `BACKUP_OPTIONAL_KEYS`**, and it is the
one that could have hurt. Since v1.23.0 `validateBackup` is on the critical path
for *every document arriving from the cloud*, not just imports. A new collection
must be in **both** lists: `ARRAY_KEYS` so a corrupt value is an error,
`OPTIONAL_KEYS` so its *absence* is only a warning — which `cloudDocProblem`
drops. Missing the second would have made this build refuse the other phone's
document the moment one device upgraded first. `cloudguardtest.cjs` stays green,
which is what proves it.

**Emitted from `fingerprint()` only when non-empty**, so an existing document is
byte-identical after the upgrade and no device pays a Cloudflare KV write for a
collection it hasn't used. Asserted directly.

### Verified
`node parsecheck.cjs` OK. **Sixteen runners green**, including new
**`templatetest.cjs` (17/17, committed)** — the pure helpers, the Repeat/Shortcut
dedupe in both directions, migrate defaults and idempotence, the byte-identical
upgrade, and merge behaviour (two devices pinning different shortcuts both
survive; an unpin is not resurrected by a stale copy; the newer edit wins).

Run against `HEAD` it fails immediately on its slice marker, which is the
intended signal that it is testing code that did not previously exist.

Sandbox, fresh origin, seeded from live plan ids:
- no Shortcuts row until something is pinned; pin button reads *Pin this as a
  shortcut* and flips to *✓ Pinned as a shortcut*
- pinning moved Jollibee **out of Repeat and into Shortcuts** — not duplicated
- tapping a shortcut filled category/title/amount, focus landed on Amount
  **inside the gesture** with the figure selected (the v1.24.0 rule)
- re-pinning at a different amount **updated** the record — still one row
- the × unpinned it: live 0, one tombstone, Shortcuts row gone, Jollibee back in
  Repeat, toast *Removed shortcut "Jollibee"* — and UNDO restored it with its
  amount intact
- unpin → re-pin **revived the tombstone**: one record total, not two
- survived a reload; dark mode legible (jade-tinted shortcut chips vs neutral
  repeat chips); no console errors, no runtime exceptions

**Not verified on a phone.** Three things to look at on the first real open:
the version reads 1.26.0, pinning survives to the *other* device (this is the
first of the three builds that syncs anything), and the × is comfortable to hit
without mis-tapping the chip.

## Rapid entry: "Save & add another" (2026-08-06, v1.25.0)

Build `2026.08.06.0002` / v1.25.0. First half of Build 4b. **No data-model
change, no `migrate()` change, no `fingerprint()` change** — the rows it writes
are ordinary expenses. Rollback-able on its own.

A secondary button under the primary writes the row and **stays in the sheet**
for the next one, so a shop run is one sheet rather than one sheet per item.

**What carries and what clears is the design.** Category and date **stay** —
several items from one shop on one day is the case this exists for, and both are
one tap to change. Title, note and amount **clear**, because they are what
differs. Nothing writes `ord`: an absent `ord` is meaningful, and a rapid burst
is precisely where inventing one would reorder someone's day. `createdAt` is
stamped once per row by `addExpenseTx`, unchanged.

**The undo toast had to learn a second verb.** It was delete-only —
`triggerUndo` stored restore arguments and `performUndo` called `restoreRecord`,
i.e. it could only ever *un*-tombstone. Rapid entry writes rows the user has not
reviewed, so it needs the mirror: `undoKind:"remove"` tombstones the row instead.

Deliberately **not** routed through `removeExpenseTx`, which raises its own
*"Deleted …"* toast — telling someone they deleted a thing they were only taking
back is a worse lie than no message. The undo path is silent, and the row is a
plain tracked expense by construction, so none of `removeExpenseTx`'s
installment-link handling can apply.

**`addExpenseTx` now returns the new id**, which rapid entry needs to target its
undo. Minting `uid()` moved **out** of the `setData` updater in the process: an
updater must be a pure function of previous state and React may invoke it more
than once, so minting inside meant two invocations produced two different ids
for one logical insert. Nothing depended on that before; returning the id makes
it observable, and the pure version is correct either way.

**Tracked mode only, and that is a scope decision.** A Goals contribution writes
*two* records (the transfer row and the goal's own contribution), so a
one-record undo would leave the goal credited — "undo" has to mean undo.
Untracked transfers additionally write `quickTransferLast`. Both are legitimate
future work; neither is the single-record insert this undo can honestly reverse.

**Not `disabled` when the form is incomplete** — a disabled button swallows the
blur that commits the amount field's draft (the `NumField` rule, which the
hand-rolled amount input follows too). It dims to `.5` and no-ops.

### Verified
`node parsecheck.cjs` OK. **All fifteen runners green** (unchanged — this build
adds no pure helper; its logic is the mutation coupling, which the sandbox
exercises end to end).

Driven in a sandbox on a fresh origin:
- **the loop** — a Repeat chip filled the row, "Save & add another" wrote it and
  the sheet **stayed open**; focus landed on Title **inside the gesture** (the
  iOS keyboard rule from v1.24.0), category (`Allowance`) and date carried,
  title/note/amount cleared
- **two consecutive saves** — "Coffee" 18 then "Bread" 12, both written, both
  keeping the carried category, **neither carrying an `ord`**, `createdAt` set
- **undo** — tapping UNDO took the live count 2 → 1 and left exactly one
  tombstone (soft delete, so it still merges across devices), raised **no**
  "Deleted" toast, and left the sheet open
- **incomplete form** — tapping the button with an empty form changed nothing
- **the primary is unaffected** — "Record transaction" still writes and closes
- layout: buttons stacked, equal width, 40px tap target, no horizontal overflow
  on the sheet or the page; the Repeat row scrolls within itself as intended
- dark mode legible; no console errors, no runtime exceptions

**One fixture lesson worth reusing.** The first seed pointed at category ids
copied from an earlier sandbox. A fresh origin mints new ones, so the Repeat row
rendered empty — which was **the `catIds` filter working correctly** (a
transaction whose category the plan doesn't have is not offerable), not a bug.
Seed category ids by reading them out of the live plan, never by hardcoding.

**Not verified on a phone.** The thing to check is that the keyboard stays up
between consecutive rows — that is the entire point of the feature, and it is
the one behaviour a desktop sandbox cannot confirm.

## Faster transaction entry, part 1: Repeat + autofocus (2026-08-06, v1.24.0)

Build `2026.08.06.0001` / v1.24.0. **No data-model change, no `migrate()`
change, no `fingerprint()` change** — so it costs no device a KV write and is
rollback-able on its own. This is the first half of Build 4; rapid entry and
`txTemplates` are deliberately not in it.

**Repeat chips.** A row of chips above the Category select refills a whole past
transaction — category, title *and* amount — in one tap. A recurring entry goes
from six interactions (open, select category, type title, type amount, dismiss
keyboard, save) to two.

`recentTxTemplates(expenses,owner,{limit,catIds})` is a new pure module-scope
function beside `rankNameSuggestions`, so `suggesttest.cjs` can slice it. Its
three exclusions are the design, not hygiene:

- **`isExtraFunds` rows are money coming IN**, stored as ordinary expenses.
  Offering one would let a tap record incoming money as spending — the exact
  trap `CLAUDE.md` records against any new reduce over `expenses`.
- **`isTransfer` rows** (untracked transfers, goal contributions, installment
  payments) have a goal or installment id as their `catId`, not a plan category.
  Replaying one through the tracked form would write a tracked expense against
  an id no envelope can ever match.
- **`catIds`** keeps only categories the *viewed month's* plan still has.
  Without it a chip could fill a `catId` the dropdown below has no option for:
  the select renders blank and Save writes a dangling reference.

Deduped on **`name|catId`, not name alone** — the same title under two
categories ("Top-up" against Transport and against Phone) is genuinely two
repeats, and collapsing them would silently pick one category for both.

**Why Repeat is a separate control from the name chips.** `roadmap.md` flagged
that the existing chips fill the name only "deliberately", and that changing it
is a real decision. It stays unchanged: two controls with two honest meanings
beats one chip whose effect depends on where it came from, and it leaves the
name chips free to keep narrowing as you type, which is their whole job.

**Amount is prefilled *and then selected*.** The objection to prefilling an
amount is that groceries differ every time. Selecting the text answers it — the
figure is there when it repeats, and one keystroke replaces it when it doesn't.

**Autofocus is conditional, and the condition matters.** Opening the modal from
an envelope ("Add to Allowance") already knows the category, so Title is
genuinely the next field and gets focus. Opening it with **no** category chosen
does *not* steal focus: the select is the next step, and raising the keyboard
over the list the user still has to pick from would be worse than doing nothing.

### Two things the sandbox caught that reasoning did not

**1. A pre-existing bug in the old name chips.** Seeding an `isExtraFunds` row
to prove the new function excluded it revealed that `recentNames` /
`nameCandidates` — shipped long before this build — filtered `isTransfer` but
**not** `isExtraFunds`, so "Wife sent extra" was being offered as a title for a
*spend*. Fixed in the same build. It is the same classification trap in the same
file, found only because the fixture was built to exercise the new code.

**2. `requestAnimationFrame` was the wrong way to focus, for a reason worse than
the test failure.** The first implementation deferred focus to rAF and it never
fired under automation (rAF is throttled in a non-foreground tab). The real
problem is bigger: **iOS Safari only raises the keyboard for a `focus()` call
made synchronously inside the user gesture.** A deferred focus would have moved
the caret on the user's iPhone without opening the keyboard — the affordance
would have looked like it worked while saving no taps at all.

Focus and selection are therefore **split across the commit**: `focus()` runs
synchronously in the handler (keyboard), `select()` runs on the next tick,
because at gesture time the input still holds the *old* value and React setting
the new one collapses any selection to the caret. Both halves were verified
individually.

The modal-open autofocus keeps a deferred path (the field isn't mounted yet at
handler time) and uses `setTimeout(0)` rather than rAF. That branch is outside
the gesture, so on iOS it moves the caret without raising the keyboard — stated
plainly rather than papered over, because no focus call can fix it.

### Verified
`node parsecheck.cjs` OK. **All fifteen runners green**; `suggesttest.cjs`
extended from 11 to **26** with a `recentTxTemplates` section covering every
exclusion, the `name|catId` dedupe, the catIds filter, the createdAt tie-break,
and that `ord` is ignored (it is a display preference, not recency).

Driven end-to-end in a 390-wide sandbox on a fresh origin, seeded with a fixture
built to fail: two Jollibee rows at different amounts, a Netflix row, plus an
`isExtraFunds` row, an `isTransfer` row and a tombstoned row all named "should
not appear".

- chips rendered `Jollibee SAR 250.00` (the **newer** amount, not the older 300)
  and `Netflix SAR 55.00`, newest first; all three decoys absent
- tapping Jollibee filled category **Allowance**, title **Jollibee**, amount
  **250**, date today — and focus landed on Amount **within the gesture**, with
  `250` selected after the commit
- typing `180` replaced the selection; Record wrote one expense with
  `amount:180`, `createdAt` stamped and **no `ord`** — the absent-`ord`-is-
  meaningful rule survives the new path
- the chip then re-read `Jollibee SAR 180.00`, confirming the memo tracks writes
- "Add to Allowance" preset the category and focused Title; the generic "Add
  transaction" correctly left focus on the dialog
- Repeat is hidden in **Untracked** and **Goals** modes
- dark mode legible; no console errors

**Not verified on a phone.** The iOS keyboard behaviour is the reason the
synchronous-focus shape was chosen and is the one thing a desktop sandbox
cannot prove. Check it on the first real-device open: tapping a Repeat chip
should raise the keyboard with the amount selected.

**Deployed and confirmed on a real phone, 2026-08-06.** v1.23.0 is serving from
GitHub Pages, the app reads 1.23.0 on-device, and **the Settings sync row reads
normally** — not "Cloud copy rejected". That row was the one thing this build
existed to make legible, so it is the check that matters: the live document
passes `validateBackup`, and the new gate is therefore inert on real data
exactly as intended rather than untested. `worker.js` was untouched by this
build, so no `wrangler deploy` was needed and the Worker is unchanged at
`a3cb3ce0`.

Restated for the next session, because the inverse still holds: if that row ever
reads "Cloud copy rejected", the live document genuinely fails `validateBackup`
— capture the reason before doing anything else, because pushing is deliberately
blocked in that state and the app is telling you something true about the cloud.

## Documents arriving from the cloud are now validated (2026-08-05, v1.23.0)

Build `2026.08.05.0008` / v1.23.0. **Closes the last correctness gap in the sync
programme.** No data-model change, no `migrate()` change, no `fingerprint()`
change — so it costs no device a KV write and is rollback-able on its own.

**The gap.** `validateBackup` guarded the file picker from v1.20.0 onward, but
all three paths that adopt a document *from the cloud* still ran the single
check import itself had outgrown:

    if(remoteRaw && Array.isArray(remoteRaw.plans))

— startup reconcile, the inline document handed back by a rev-rejected save,
and manual Pull. Any object with a `plans` array was migrated and adopted. The
sharpest case was a device with **no local copy**, which adopted the remote
document wholesale, no merge, no questions.

**`cloudDocProblem(raw)`** (module scope, beside `validateBackup`) is the one
gate all three now go through. It delegates to `validateBackup` rather than
growing a second set of rules, with two deliberate differences:

- **Warnings are dropped.** They read *"No installments — an older backup. It'll
  start empty"*, which is the normal state of a phone that hasn't used a
  feature. Refusing on those would break sync between two honest devices. Only
  `errors` mean "do not adopt this".
- **A nullish document is not a problem.** "The account is legitimately empty"
  is a state the callers already distinguish from "the read failed", and
  collapsing the two would make a brand-new account unusable.

**An unusable document is treated exactly like a failed read** — adopt nothing,
merge nothing, advance no rev, record no cloud snapshot. It is deliberately
**not** treated as a conflict: the conflict modal asks the user to choose
between two documents, and here one of the two isn't a document.

**Pushing stops while the cloud is unreadable.** `cloudUnreadableRef` holds the
reason so the blocked-save message can name it instead of sniffing the text of
`lastSyncError`. A compare-and-swap against a document we can't read is not a
decision to make on a phone — which does mean **repairing a corrupt cloud
document is not an in-app operation**; see the follow-up in `roadmap.md`.

**A new device with nothing local does not open on an empty app.** It holds the
existing "still connecting" screen with different copy (*"Can't read the cloud
copy"*) plus the reason in monospace, and keeps retrying — a torn read heals
itself. Reusing that screen matters: opening on `defaultData()` here is worse
than the timeout case it was built for, because the typing would sit on top of a
document we already know we can't reconcile with.

### Verified
`node parsecheck.cjs` OK. **Fifteen runners green**, including new
**`cloudguardtest.cjs` (19/19, committed)**.

`cloudDocProblem` is new, so running the file against `HEAD~` proves nothing on
its own — there is no old function to fail. What the runner pins instead is the
*behaviour that changed*: a `REGRESSION` case asserts six documents that pass
`Array.isArray(remote.plans)` and must now be refused. That is the assertion
that goes red if the gate is ever weakened back toward the old check.

**Driven end-to-end in a sandbox against a fake Worker** — **`sandboxworker.cjs`,
committed**, serves the app and stands in for `/sync`, switching between a good
and a deliberately corrupt document via a `mode.txt` file it re-reads per
request (usage in its header comment). It is the only way to reach these
branches without corrupting the live document, and it is committed rather than
left in a scratch directory for the reason `CLAUDE.md` records about
`baltest.cjs`. The corrupt fixture
is broken in exactly the way the old check couldn't see: `plans` is a valid
array, but `banks` is a string and one transaction has a null amount. All four
paths confirmed:

- **startup, returning device** — app opened on its **local** data, header pill
  read *Sync failed*, background retry running. localStorage still held exactly
  one expense and an array-valued `banks`; nothing from the corrupt document
  reached it.
- **blocked push** — Save to Cloud refused with
  *`Cloud copy rejected (1 problem): "banks" should be a list, but it isn't. —
  saving is on hold until it can be read`*.
- **Settings** — the diagnostics row rendered the same reason plus `HTTP 200`,
  which is the useful pairing: the request succeeded and the *document* was the
  problem.
- **manual Pull** — refused and kept local data.
- **new device, nothing local** — held the *"Can't read the cloud copy"* screen
  with the reason in monospace and the existing "Continue offline for now"
  opt-out, instead of opening empty.
- **self-heal** — switching the fake Worker back to a good document mid-wait let
  the background retry adopt it, reveal the app, and clear the failed state
  (pill returned to *Save to Cloud*). The cloud's transaction and plan arrived
  intact.

No console errors beyond the known Babel size note. Version read 1.23.0 / build
`2026.08.05.0008`.

**One artefact of the fixture, not a defect:** on the self-heal the owner labels
stayed at the local defaults rather than the cloud's. Neither side of the
synthetic document carried a `fieldUpdatedAt` stamp, so `mergeSettingPaths` fell
back to whole-document age and the just-created local document was newer. Real
data always carries stamps.

### The conflict modal lost its duplicate button
`resolveKeepLocal` and `resolveSaveLocalToCloud` both adopted the remote rev and
pushed the local document — the same outcome by two routes, one fire-and-forget
and one awaited — and the modal said so in its own button text (*"Same result as
the green button below"*). Three buttons, two outcomes, in a dialog that only
appears when something has already gone wrong. Now two buttons: **Use Cloud** and
**Save Local to Cloud**. The modal remains unreachable in normal use (see 3C-1
below), so this is cleanup, and like everything else in that component its
rendered form has never been seen.

### SYNC_KV, resolved
The unexplained namespace is real and still holds exactly the two documented
`user:data:<uuid>` keys. Confirmed **unbound and unreferenced**: `SYNC_KV`
appears nowhere in `worker.js` or `index.html` — only in a `wrangler.jsonc`
comment — and the Worker reads `ALLOC_KV`, `SYNC_ROOM`, `SYNC_TOKEN`,
`FINNHUB_KEY` and nothing else. `ALLOC_KV` meanwhile still holds live
`data`/`rev`/`savedAt`, so the Durable Object's rollback mirror is working.

Not deleted — that is the account owner's call, and it is irreversible. Note
these keys predate 2026-08-01, i.e. the period when `SYNC_TOKEN` was readable in
the served `index.html`, so they fall under the "assume it may already be public"
item in `roadmap.md` rather than being a fresh exposure.

**Trap for next time:** Wrangler 4 defaults `kv key list` to **local** state.
Both namespaces read as `[]` until `--remote` is passed, which looks exactly
like "the mirror never ran".

## Sync failures now say why (2026-08-05, v1.22.2)

Build `2026.08.05.0007` / v1.22.2. Display only — no behaviour, no data shape.

The reason a sync failed lived **only** in a `title` tooltip on the cloud
button, which no phone renders, so a failure on the affected device was
undiagnosable. That is why the v1.22.1 device-name bug — `fetch` throwing before
a byte was sent — cost a whole session and was ultimately spotted by the user
rather than reported by the app.

The Settings status row now prints `lastSyncError` plus `HTTP <status>` when
there is one, in monospace, under "Sync failed". A thrown `TypeError` and an
`HTTP 500` need completely different responses and were previously identical on
screen. Nothing shown is secret: it is an exception message or a status code,
and the passphrase is in neither. The 401 "Passphrase rejected" row is
unchanged — it already had its own wording because its fix is different again.

**Verified** by pointing a sandbox copy's `PROXY_URL` at an unreachable host and
seeding a dummy passphrase: the row rendered `Failed to fetch`, with no HTTP
suffix (correct — no response came back), version read 1.22.2, no console
errors. **Reuse that recipe** — it is the only way to reach the thrown-fetch
branch without breaking the real Worker. `parsecheck.cjs` OK, fourteen runners
green.

## Two-phone protocol passed; device-name fix (v1.22.1)

**Previous build:** `2026.08.05.0006` / v1.22.1, deployed and serving.
**Live Worker version:** `a3cb3ce0-32dc-449f-97c1-35c19ac046f8` (Durable Object).
**Pick up next:** Build 4 — faster transaction entry. (Build 3 is complete:
3B server atomicity, 3C-1 merge fixes, 3C-2 per-category merge. The one piece
deliberately still open is `payPeriods.actualStarts` — see 3C-3 in roadmap.md.)

**Build 3 is verified on real hardware, not just in runners.** Both owners ran
the full two-device protocol on 2026-08-05 against the live Worker and
everything passed — see the 3C-2 section for what was actually exercised. The
manual gap that had been open all day is closed; treat two-device merge as
confirmed working, and the conflict modal as unreachable by design rather than
as untested.

## A device name broke sync outright (2026-08-05, v1.22.1)

Build `2026.08.05.0006` / v1.22.1. **Found on a real phone within hours of
v1.21.0 shipping device naming**, which is the only reason it was found at all —
nothing in the test suite touched the header layer.

Naming a phone **"Wife's iPhone"** stopped that device syncing completely.

**The mechanism.** iOS (and Android) smart punctuation silently replaces a typed
`'` with U+2019. `deviceTag()` interpolated the label straight into the
`X-Device-Id` header. HTTP header values are **ByteStrings** — anything above
U+00FF makes `fetch()` throw a `TypeError` *before a byte leaves the device*:

    Cannot convert argument to a ByteString because the character at
    index 4 has a value of 8217 which is greater than 255.

The app catches that in the generic `catch` and reports **"Sync failed"**. Every
symptom followed from that and every one of them pointed somewhere else:

- Started "today" → device naming had shipped that morning.
- Opening the Worker URL in the phone's browser returned `{"error":
  "Unauthorized"}` normally → a top-level navigation sends no custom header.
- The passphrase was accepted → connect ran *before* the label was set.
- Only one device affected → only one device had been named.

**The fix: sanitize where the value is USED, not where it's set.** `headerSafe()`
folds smart punctuation to ASCII, folds accents (`José` → `Jose`, since Latin-1
header bytes decode to mojibake), and drops anything else outside printable
ASCII — emoji, CJK, and CR/LF (a newline in a header value is header injection).
`deviceTag()` runs its output through it and falls back to the bare id if a label
sanitizes away to nothing.

Doing this at the read point is load-bearing: **a broken label is already in
localStorage on the affected phone**, so a setter-only fix would have required
the user to retype it while sync stayed dead. The stored label keeps its real
punctuation — this is a wire encoding, not a rename, and Settings still shows
what was typed.

### The reason this took so long to find
`lastSyncError` holds the actual message but is rendered **only in a `title`
tooltip** (`index.html:5775`), which a phone cannot show. The Settings row shows
the generic label. Diagnosis was guesswork until the user noticed the
correlation with the name themselves. **Surfacing `lastSyncError` and
`KVSync.lastStatus` in the Settings status row is logged in `roadmap.md`** and
should land before the next sync work.

### Verified
`node parsecheck.cjs` OK. **Fourteen runners green**, including new
**`devicetagtest.cjs` (21/21, committed)**. It asserts against Node's real
`Headers` constructor — the same ByteString check the browser applies — rather
than against an idea of the rule.

**Reproduced against the pre-fix code**: sliced `deviceTag()` out of `HEAD`,
fed it the smart-quote label, and `new Headers()` threw with the exact message
above. A fix whose test passes before and after proves nothing.

Browser (localhost:8799): app mounts, no console errors beyond the known Babel
size note, and the previously-fatal label now yields
`Wife's iPhone (ab12cd34)`, which `Headers` accepts.

**Confirmed on the affected phone (2026-08-05):** after updating to
`2026.08.05.0006` the device name was set back to `Wife's iPhone`, apostrophe
included, and sync works. Deployed and served from GitHub Pages with all three
BUILD_ID sites matching (`version.json`, `index.html`, `sw.js`).

## Per-category plan merge — the headline two-device fix (2026-08-05, build 3C-2)

Build `2026.08.05.0005` / v1.22.0. **This is the defect the whole sync programme
was for:** `plans` merged whole-record, newest `updatedAt` wins, so one person
editing Groceries while the other edited Transport in the same month silently
lost a side, with no conflict shown.

Fixing it needed two things the old shape couldn't express — both discovered by
reading the code, and both mandatory rather than optional scope:

**1. Deletion.** `removeCat` hard-deleted. A union merge would resurrect a
category the other person deleted — trading a silent lost edit for a silent
resurrected delete. Categories and groups are now **tombstoned** (`deletedAt`),
like every other collection in this app. `removeGroup` tombstones the group and
its categories in one mutate.

**2. Order.** Category order is user-controlled ("Reorder categories" moves them
up and down) and lived in **array position** — but `mergeArrayById` sorts
children by id, so the first sync would have scrambled the envelope list. Order
had to become a field. New **`ord`**, backfilled once by `migrate()` from the
existing array order, and `moveCat` now renumbers `ord` across the live
categories instead of swapping array slots — the same lesson transactions
learned (`compareTxForDisplay`).

**`livePlanView(plan)`** is the canonical read shape: tombstones filtered, `ord`
applied. Applied inside `resolvePlanForMonth` and to the App-level active plan,
so **all 37 `.categories` read sites get it for free** rather than each
remembering to filter. It returns the **identical object** when there is nothing
to do — the bills-reconciler rule — so render identity doesn't churn on the
overwhelmingly common path.

**`stampPlanRecords(prev,next,now)`** stamps `updatedAt` on the categories and
groups that actually changed and gives a new one an `ord`. Called from
`editPlanForMonth`, the choke point every budget mutation already goes through,
for the same reason the copy-on-write decision lives there.

### One-time cost, accepted deliberately
Backfilling `ord` changes `fingerprint()` for every existing document, so each
device does **one** Cloudflare KV write on first open. That is a one-off, and a
different thing from the per-app-open write the `userFingerprint` split exists to
prevent. It is deterministic — every device derives the same ords from the same
array — so two devices converge rather than conflict. `updatedAt` is deliberately
**not** backfilled: absent means "never edited on any device", which is exactly
what a merge should treat as oldest.

### Verified
`node parsecheck.cjs` OK. Thirteen runners green; `mergetest.cjs` now **40/40**.

**Run against the pre-3C-2 code, 10 of the new assertions fail** — including
*"THE HEADLINE: two devices editing DIFFERENT categories both survive"*, the
delete-resurrection guard, and the ordering guard.

`budgettest.cjs` dropped to 19/39 on the first run — **the documented slice-marker
trap**, not a regression: its vm slice started at `resolvePlanForMonth`, so the
new module-scope helpers above it were undefined and every test in two sections
failed with a ReferenceError. Slice widened and the helpers handed to the
context; back to 39/39.

Driven in a sandbox against the real seeded dataset:
- `migrate()` backfilled `ord` 0..n from array order; **no** `updatedAt` written
- deleting "Long Term Savings" tombstoned it (14 rows stored, 13 live), removed
  it from the Budget list, the reorder sheet and the group total (Invest & Grow
  6,050 → 3,300; Allocated 22,000 → 19,250) and materialised a custom plan
- the tombstoned row carries both `deletedAt` and `updatedAt`
- reordering renumbered `ord` across the live categories, left the tombstone's
  own `ord` alone, and **survived a reload**
- no console errors

**VERIFIED ON TWO REAL PHONES, 2026-08-05.** The full two-device protocol was
run by both owners against the live Worker, on build `2026.08.05.0006`, using
airplane mode to hold both devices' edits simultaneously — which is the only way
to reach the case, since `pushImportant` and the 8s idle autosave otherwise
upload before the second device can diverge. All passed:

- **the headline** — one phone edited category A, the other category B, same
  month, both offline. After reconnecting, **both edits survived on both
  phones**. This is the defect the whole sync programme existed to fix, and it
  is now confirmed fixed on real hardware rather than only in `mergetest.cjs`.
- **deletion** — a category deleted on one phone while the other edited a
  different one stayed deleted on both. No resurrection.
- **ordering** — a reorder on one phone reached the other unchanged and survived
  a restart, confirming `ord` beat the id-sort that used to erase array order.
- **`monthlyPlans`** — a month set up on one phone was not reverted by unrelated
  activity on the other (the 3C-1 defect).
- **`household.expenses`** — an edit made on the other phone arrived, and a
  delete stayed deleted. Both directions; this could never work before v1.21.0.
  The row also appeared correctly in "What's pending" and Recently Deleted.

The remaining gap is unchanged and is not reachable by testing: the conflict
modal (see 3C-1 below).

## Merge fixes that needed no data-model change (2026-08-05, build 3C-1)

Build `2026.08.05.0004` / v1.21.0. Three defects, each of which silently
discarded a real edit. Deliberately scoped to what could be fixed *without*
introducing tombstones, so the risky half could be its own build.

**1. `monthlyPlans` resolved by whole-document age.** It merged through
`mergeKeyed`, which has no per-record timestamp and falls back to whichever
document is newer overall — so assigning a plan to September on one device was
reverted as soon as the other logged an unrelated transaction. The records have
carried `updatedAt` all along; **nothing ever read it**. New `mergeKeyedByTs`
does, falling back to the old rule when neither side is stamped, so pre-existing
data behaves exactly as before. (Closes the follow-up logged 2026-07-31.)

**2. `household.expenses` merged with `tsOf=()=>""`.** `tsOf(rx)>tsOf(lx)` is
`""> ""` — always false — so **local always won an id collision**. An edit made
on the other device could never arrive, and a delete there was silently undone by
a stale local copy. Now uses the default `updatedAt` comparison like every other
collection.

**3. `household.expenses` was not in `CONFLICT_COLLECTIONS`.** It is id-keyed and
soft-deleted like everything else and was simply never added, so it was invisible
in the conflict modal and in Recently Deleted while still counting toward the
pending badge through a hand-written special case. It is now a normal entry —
which required an optional **`get`** accessor on the collection spec, since it is
the only nested one. `countPendingChanges`, `buildConflictDiff` and
`RecentlyDeletedModal` all read through `conflictArr(c,d)`; `restoreRecord`
handles the nested write. The special case is gone. (Closes the follow-up logged
2026-07-30.)

**4. Device identity.** New per-device `allocation:deviceId` +
`allocation:deviceLabel` in localStorage — never in `data`, never synced, same
rule as the view profile and the passphrase. Sent as `X-Device-Id`, echoed back
by the Worker as `lastWriter`, and used by the conflict modal to say *"saved by
Charlene's phone"* instead of "the cloud". Named in Settings → Name this device.
The conflict modal also now distinguishes the additions-only case ("you each
added different things") from a genuine same-record clash.

### Verified
`node parsecheck.cjs` OK. Thirteen runners green, including new
**`mergetest.cjs` (22/22, committed)**.

**The tests were checked against the OLD code and 8 of the 22 fail there** —
including both household defects and the `monthlyPlans` reversion. A merge test
that passes both before and after proves nothing, so this was run explicitly.

Sandbox: device-name field renders and persists, no console errors, version
reads 1.21.0.

**The conflict modal is effectively UNREACHABLE, and that is the honest
status — not a gap to keep chasing.** All three `setConflict` call sites
(`index.html:4106`, `4375`, `4600`) fire only when `tryAutoMergeAll` returns
null, and it returns null **only from its own `catch`** — i.e. when the merge
itself throws. Once 3C-2 made categories merge per record, every case the modal
was written for is handled before it can open. The two-phone protocol on
2026-08-05 deliberately tried to reach it and could not.

Consequences to carry forward:

- **Its copy — including "saved by <device>" — has never been seen rendered**,
  and cannot be without deliberately breaking the merge. The writer-label
  derivation is pure string handling (strip the ` (id)` suffix when a label is
  present; show nothing when the writer is this device).
- **Device naming still earns its keep**, just not through this modal: naming a
  phone is what surfaced the v1.22.1 header bug.
- **If that modal ever appears in normal use, it means `tryAutoMergeAll`
  threw.** Treat it as an exception report, not a routine conflict — that is
  now its only remaining trigger.

### Why the plan-category merge is NOT in this build
`plans` still merges whole-record. Fixing it means unioning categories by id —
and **categories are hard-deleted** (`removeCat` filters them out), so a union
would resurrect a category the other person deleted. That needs category and
group tombstones, which touches **37 `.categories` read sites**. The safe shape
is a `livePlanView()` filter applied at `resolvePlanForMonth` (and the App-level
active plan), returning the *identical object* when nothing is tombstoned so
render identity doesn't churn — the same rule the bills reconciler follows.
That is build 3C-2, on its own, with its own testing.

## Sync moved from KV to a Durable Object (2026-08-05)

Worker only — `index.html` is untouched, so no app version bump (the bump rule
covers `index.html`/`APP_SHELL`, and `worker.js` is in neither).

**The two defects this fixes.** `POST /sync` read `rev` from KV, compared it,
then did three separate `put`s. KV has no compare-and-swap, so two devices could
both read rev 700 and both be accepted, the second silently overwriting the
first. And a failure between the three puts left `data` written against a stale
`rev`, after which every client's revision check passed wrongly.

**`SyncRoom`** (module scope in `worker.js`) owns the document. Durable Objects
deliver events to an instance one at a time and hold new ones while a storage
operation is in flight, so the read-compare-write cannot interleave. The whole
document commits under **one** key, so a write is all-or-nothing.

- **Seeds from the existing KV keys on first use** — no manual migration, no
  downtime, no coordinated switchover.
- **Mirrors every accepted write back to the three legacy KV keys** for this
  release, so a rollback resumes exactly where the DO left off. Written after the
  commit, best-effort; the DO is the authority either way.
- Request/response shapes unchanged, so v1.20.1 phones talked to it without
  noticing. Nothing had to be updated in lockstep.
- Optional `X-Device-Id` header echoed as `lastWriter`, ready for 3C's "whose
  phone saved last" conflict copy. Never used for auth.

### Deployment facts worth keeping
- Deployed with **`npx wrangler deploy`**, not the dashboard. A DO class can only
  be created at deploy time; there is no dashboard path. This Worker is therefore
  **no longer dashboard-managed** — edit `worker.js` here and redeploy.
- `wrangler.jsonc` must declare **every** binding, because a deploy replaces
  them. The namespace id was verified with `wrangler versions view` against the
  *deployed* Worker, not inferred from the namespace title — the account also has
  a `SYNC_KV` namespace holding `user:data:<uuid>` keys from an older version of
  the app, which this Worker has never read.
- Compatibility date pinned to the already-deployed **2026-06-27** rather than
  raised, so the release changed the sync backend and nothing else.
- Secrets are not in the config and were not touched.
- **Document size: 126 KB** against a 2 MB per-value ceiling. If it ever
  approaches that it needs chunking *inside* one write — never a second key.

### Verified at cutover
Pre-deploy baseline `rev` 701 / `savedAt` 08:39:52.991Z, matching the phone.
After deploy: KV unchanged at 701; Worker live; 401 on both no-token and
wrong-token (proving the secrets survived — a missing `SYNC_TOKEN` returns 500).
Then the phone showed local rev 701 and **a save was accepted, taking it to
702** — which only happens if the DO was holding 701, so that increment *is* the
proof that seeding worked. KV mirror followed to 703 with a matching `savedAt`.
Document re-read and structurally verified: 28 plans, 177 transactions, 3 goals,
6 investments, 6 banks, 1 installment, 8 monthlyPlans, owners intact.

**Rollback (still available):** `npx wrangler rollback` to
`63d5fc31-f0d2-4b28-9719-f7377dd8ad37`. KV is current because of the mirror, so
the old KV Worker resumes correctly even after further saves. **Remove the mirror
only when there is no intention of going back.**

### Not covered by this
The DO handler has **no automated test** — that needs `wrangler dev` and a test
harness this repo doesn't have. It was verified by the cutover checks above, and
that is the honest status rather than implied coverage.

## Two rotating local safety copies (2026-08-05)

Build `2026.08.05.0003` / v1.20.1. Requested directly after v1.20.0 shipped with
a single slot. The single slot had a sharp edge: a second replacement destroyed
the copy you were about to go back to — which is exactly the moment people repeat
an action hoping for a different result.

- `PRE_CLOUD_BACKUP_KEY` now stores an **array**, newest first, capped at
  `PRE_CLOUD_SLOT_LIMIT = 2`. `readPreCloudSlots()`/`writePreCloudSlots()` are
  module-scope and unit-tested.
- **The pre-2026-08-05 single-object shape is adopted, not discarded** — an
  upgrading device may be relying on that one copy at that exact moment.
- Each copy is **labelled with what caused it** ("before importing a backup",
  "before merging cloud changes", "before replacing with the cloud copy") and
  shown with its timestamp, so the Settings list is choosable rather than a
  guess. `restorePreCloudBackup(index)` takes which one.
- **Quota degradation is the load-bearing part.** This device already holds the
  live document and the last-synced baseline, so two slots makes *four* copies of
  a financial document in a ~5 MB localStorage. `writePreCloudSlots` retries with
  fewer slots on quota and only reports failure when not even one fits — keeping
  the newest copy is worth more than keeping both. It returns what was actually
  persisted, so the UI can never offer a restore button for a copy that isn't on
  disk.

### Verified
`node parsecheck.cjs` OK. Twelve runners green, including new
**`backupslottest.cjs` (14/14, committed)** — rotation, eviction order, the
legacy-shape upgrade, garbage handling, and the quota path driven against a
fake localStorage with a real byte ceiling.

Driven end-to-end in a sandbox: seeded a legacy single-object copy, imported
twice in a row, and confirmed the slots read `[IMPORT-ONE, Me]` with the original
data still reachable — then restored the **older** slot and got the real
pre-import data back, with the upload hold cleared. Both slots render with
timestamp and reason. No console errors.
**Pick up next:** Build 3 of the agreed six-build programme — safer two-device
sync. **It starts with Checkpoint 3A, which is the user's action, not a code
change:** confirm Durable Objects are free on their Cloudflare plan and decide
between the `wrangler` CLI and dashboard click-paths. No sync code is written
until that answer exists.

## Backup import hardening (2026-08-05)

Build `2026.08.05.0002` / v1.20.0. Import used to be one line: parse the file,
check `Array.isArray(d.plans)`, replace the entire dataset, and let the 8-second
autosave push it to the cloud. Any object with a `plans` array passed — including
one whose `banks` was a string or whose transactions had no amounts.

**Four independent changes.**

1. **`validateBackup(obj)`** — new pure module-scope function beside `migrate()`,
   returning `{ok, errors, warnings, summary}`. Errors refuse the file (wrong
   top-level shape, a collection that should be a list and isn't, a plan with no
   id / categories / groups, a transaction with no id or no usable amount).
   Warnings don't (a missing `installments` is just an older backup). Layered:
   top-level shape is checked first and returns early, so a file with a broken
   `banks` reports that rather than an avalanche of consequent errors.
   `summary` carries the backup date, owners, currency and live-record counts —
   tombstones excluded from the counts and reported separately.
2. **`ImportPreviewSheet`** — portalled, `dvh`-sized. Shows the summary, then
   states the three things that aren't obvious: it replaces everything, it stays
   on this device until Save to Cloud, and the safety copy is a **single slot**
   that the next import overwrites. Two actions only: Replace, or Cancel. **No
   merge option** — merging two full financial documents can't be made both safe
   and explainable.
3. **Pre-import safety copy** — reuses the shipped `stashPreCloudBackup` and its
   existing "Restore previous local copy" button rather than inventing a second
   mechanism. `stashPreCloudBackup` now **returns whether it succeeded**, and a
   failed stash (quota) **aborts the import** instead of proceeding unprotected.
   While an import is held the button relabels to "Undo import — restore
   previous local copy".
4. **The upload hold** — `meta.importPending` in syncMeta (localStorage, not in
   `data`: it is a state of this device and syncing it would be meaningless on
   the other one). While set, `pushImportant`, the idle autosave, the
   visibility-hidden push, the pagehide beacon and the passive activation check
   all skip, and `saveToCloud` refuses any `reason` that isn't `manual` or
   `gesture`. Only a real Save to Cloud clears it — through `commitPush`, the
   single success choke point — or restoring the previous copy.

**Pull is blocked while an import is held**, deliberately. A pull *merges*, so
pulling on top of an unreviewed import would fold imported records into the cloud
copy — neither keeping the import nor discarding it, and impossible to explain.
The two answers are Save to Cloud or Undo, and the UI says so.

**The hold is only armed when `kvReady`.** On a device with no passphrase nothing
uploads anyway, and a flag left set there would silently block syncing the day a
passphrase was finally entered.

### Verified
`node parsecheck.cjs` OK. Eleven runners green, including new **`importtest.cjs`
(34/34, committed)**: current-shape backups, a legitimately older backup accepted
and correctly defaulted by `migrate()`, 21 refusal cases, tombstones excluded from
counts, zero-amount accepted (0 is a figure; absent isn't), and `validateBackup`
proven not to mutate what it inspects.

Driven end-to-end in a sandbox copy on `localhost:8791` (fresh origin, no real
data, dummy passphrase for the `kvReady` paths):
- a structurally invalid file → refusal sheet naming the reason, "Nothing on this
  device has been touched"
- a valid file → preview with correct date/owners/counts, cross-checked against
  the file's own contents
- **Cancel** → data byte-identical, no safety copy written, no hold set
- **Replace** → data swapped, safety copy holds the pre-import owner name
- **the hold** → 14 seconds after import (well past the 8s autosave) plus a
  simulated backgrounding and pagehide: **zero POSTs to `/sync`**, banner shown,
  Pull disabled, flag persisted across a reload
- **Undo import** → previous copy restored, hold cleared, Pull re-enabled
- dark mode legible; no console errors

**Verified on a real phone, 2026-08-05.** Layout checked at true phone width in
both themes, and the hold exercised against the live Worker: Replace set the
hold and disabled Pull, and "Undo import — restore this copy" released it.
Driven safely by re-importing a backup the same device had just exported, so
the bytes written were identical to what was already there — worth reusing, it
makes an otherwise destructive path testable on live data.

## Sync wording corrected (2026-08-05)

Build `2026.08.05.0001` / v1.19.1. **Copy only — no behaviour changed, no data
shape changed.** Settings claimed *"Cloud upload only happens when you tap Save
to Cloud"*, which six shipped code paths contradict: the 8s/45s idle autosave
(`index.html:4078-4095`), `pushImportant()` after any completed action
(`4061-4071`), `visibilitychange→hidden` (`4145`), the `pagehide` keepalive POST
(`4126-4140`), the auto re-push after a merge on pull (`4221`), and
`resolveKeepLocal` (`4311-4323`).

Replaced with three short plain-language paragraphs — saves locally at once and
uploads by itself; offline edits queue; the two buttons are shortcuts, not
requirements — plus a re-worded shared-dataset note that distinguishes "you both
changed different things" (combined automatically) from "you both changed the
same thing" (you get asked).

Also corrected `ConflictModal`'s **"Keep Local — Cloud is left as-is"**
(`12277`), which was false: `resolveKeepLocal` bumps the baseline to the remote
rev and pushes immediately.

### Found while verifying, not fixed here
`resolveKeepLocal` (`4311-4323`) and `resolveSaveLocalToCloud` (`4347-4357`) are
the **same action** — both adopt the remote rev and push local. The conflict
modal therefore offers three buttons but only two outcomes. The copy now admits
it ("Same result as the green button below"); consolidating the buttons is a
behaviour change and is deferred to the sync build, which reworks that modal
anyway. Logged in `roadmap.md`.

### Verified
`node parsecheck.cjs` OK. All ten runners green (trend 14, bills 11/11, budget
39/39, bank 25/25, period 24/24, txorder 17/17, owner 15/15, suggest 11/11, sync
15/15, installment 31/31).

**Read on both real phones, 2026-08-05** — the only way to see it, since the
block lives in the `kvReady` branch and a sandbox copy on a fresh localhost
origin has no passphrase by design (2026-08-01 secrets work), while typing the
real one into a test copy is exactly what CLAUDE.md forbids. Wording is correct
in both themes, and the device-name field persists across a restart.

## Installments module (2026-08-02)

Build `2026.08.02.0001` / v1.19.0. A new tab for short-term purchase
installments — Tabby, Tamara, Amazon, credit-card pay-in-3/4. Deliberately not a
loan system: no interest, no fees, no amortisation, no weekly schedules.

**Where it lives.** `More → Installments` (`MORE_TABS`, `TAB_META` icon
`I.Layers`). The tab renders its own portalled FAB; the global "quick add
transaction" FAB steps aside there, as it already does on Home.

**Data.** Two new flat id-keyed collections:

- `data.installments` — `{id, owner:"me"|"wife", name, provider, customProviderName,
  purchaseDate, originalAmount, currency, includeInBudget, notes, status, closedAt?,
  payoffExpenseId?, createdAt, updatedAt, deletedAt?}`
- `data.installmentPayments` — `{id, installmentId, owner, sequence, dueDate,
  scheduledAmount, actualAmount?, paidDate?, status, expenseId?, cancelledBy?,
  payoffExpenseId?, cancelledAt?, deletedWith?, createdAt, updatedAt, deletedAt?}`

Both are wired into `defaultData`, `migrate`, `fingerprint`, `tryAutoMergeAll`,
`CONFLICT_COLLECTIONS`, `countPendingChanges` and `purgeOldTombstones`. Backup
export/import needed no change (it is whole-document).

**Derived, never stored.** Remaining balance, "X of Y paid", next payment,
expected completion and *overdue* are all computed on read by module-scope pure
helpers (`installmentRemainingBalance`, `installmentProgress`,
`installmentNextPayment`, `installmentExpectedCompletion`,
`installmentPaymentDerivedStatus`, `installmentDerivedStatus`,
`installmentSummary`). Nothing writes a running total.

**Every mutation is one `setData`.** Each is a pure `(data, args) => data`
function at module scope (`applyInstallmentCreate/Update/Payment/Payoff/Cancel/
Delete/Restore/Unlink`, `applyInstallmentExpenseEdit/Delete/Restore`) and the
App-level mutator is a one-liner over it plus `pushImportant()`. A plan and its
schedule, or a payment and its ledger row, can never be persisted half-written.

**Budget.** When an owner has payments due in the viewed period with
`includeInBudget`, a visually distinct **derived** "Installments" group renders
after the manual groups: one read-only row per payment due, counting toward
`Allocated` and taking a segment in the "Where income goes" bar. Rows can't be
renamed, re-priced, moved or deleted from Budget; tapping one opens the plan.
The group is not in `monthPlan.groups`, which is what keeps it automatically
invisible to the move-categories sheet and to `investTarget.groupNames`.
**Viewing a month never materialises a plan** — verified in the browser
(`monthlyPlans` stayed empty after paging) and asserted in the runner.

**Expenses.** Recording a payment creates exactly one `isTransfer:true` expense
carrying `installmentId` + `installmentPaymentId`, `catId` = the installment id
(the same shape a goal contribution uses). It renders with an `INSTALLMENT`
badge (`PAYOFF` for an early payoff) beside the existing `TRANSFER` pill.
Editing one opens a locked variant of the edit sheet — category and owner fixed,
amount/date editable, with a warned "Unlink from installment" escape hatch — and
routes through `applyInstallmentExpenseEdit` so the payment's `actualAmount` /
`paidDate` follow in the same write. Deleting reopens the payment; restoring
re-settles it; both directions are tombstone-aware.

`unaccountedParts` needed no arithmetic change: installment rows are
`isTransfer` with a non-goal `catId`, so they land in "Transfers out", which is
the intended classification. See `decisions.md` for how the pending
plan-vs-actual annotation should read the planned side.

**UI.** Four portalled sheets (`useScrollLock` + `useDialogA11y`, sized in
`dvh`, every numeric input a `NumField`): Add/Edit with a generated but fully
editable schedule and a live Original/Scheduled/Difference strip that blocks
Save outside `INSTALLMENT_ROUND_TOL`; Record Payment; Pay Off Early (previews
the remaining balance, how many payments close, and which future periods lose
their Budget rows); Schedule. Cards are grouped into Active / Paid Off / Paid
Off Early / Cancelled collapsible sections with Active dominant. Two new icons
(`I.Package`, `I.Card`) — no remote logos, no provider branding.

**Verified.** `installmenttest.cjs` (31 assertions, committed) plus all nine
existing runners green and `parsecheck.cjs` clean. Browser: desktop and a
390×844 frame, light and dark, full create → derived Budget row → record payment
→ edit linked transaction → pay off early → delete → Recently Deleted → restore
flow, with no app console errors.

### Known gaps

- **Monthly frequency only.** Weekly / bi-weekly schedules are out of scope.
- **Single currency.** The record carries `currency`, but the picker offers only
  `data.currency` and no conversion path exists — expense rows have no per-row
  currency, so a foreign-currency plan needs an FX-at-payment rule first.
- **No partial-pay allocation.** A payment that differs from its scheduled
  amount is stored as-is and the rest of the schedule is left alone; correcting
  it means editing the schedule by hand.
- **No Home card, no charts, no notifications, no bank-statement import** — all
  deliberately out of scope for this release.
- Editing the schedule cannot change a **paid** row (by design: a recorded
  payment is history), so fixing a mistyped past amount means editing the
  transaction in Expenses instead.
- An installment payment's `catId` is the installment id, so it will not appear
  under any budget category filter in the Expenses log — it shows in the
  all-transactions list and in "Transfers out" only.

_Previously updated: 2026-08-01 (secrets out of the public repo; CDN scripts pinned)_

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

## Known bugs / limitations / deferred work (2026-07-28 — SUPERSEDED)

> **Historical.** The current list is **"KNOWN BUGS, LIMITATIONS AND UNFINISHED
> WORK" at the top of this file.** Kept for the phase context only; do not read
> this as the live status.

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
