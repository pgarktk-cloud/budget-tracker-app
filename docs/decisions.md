# Architectural & Technical Decisions

## The Bills Reserve is not the advisor's business (2026-08-07, v1.34.0)

Removed from `purchaseAvailableStack`. Two reasons, and the second is the one
that settles it.

It was always the weakest line in the stack: the reserve is a **household-wide**
figure and the advisor's scope is strictly **per-owner**, so it was subtracted
in full from *each* person's available cash independently. Two people looking at
the same household reserve each lost the whole of it. That was flagged at design
time as conservative-and-deliberate, "revisit only alongside a household-scope
conversation" — which is a polite way of saying it was known to be wrong and
tolerated.

And it was subtracting a figure that is itself unreliable (see the bill-row
identity bug), so the advisor was propagating someone else's arithmetic error
into a buy/don't-buy verdict.

Protecting money genuinely set aside for bills is now the **account flags'**
job. They are per-owner, visible in the stack, releasable for a single purchase,
and they name the account rather than asserting a total — everything the
reserve subtraction was not. `purchasetest.cjs` asserts that passing
`billsReserve` is now **inert**, so a caller left over from before cannot
quietly reinstate it.

## Don't ship a control without the behaviour it claims (2026-08-07, v1.33.0)

A2 added "this account is my emergency fund" and "I can't reach this money" to
the Banks tab, with helper text reading *"Held back from the Purchase Advisor's
available cash"* — present tense — while `purchaseAvailableStack` contained no
reference to `accessible`, `purpose` or `bankId`. Setting a flag stored it
correctly and changed nothing anyone could see. The first thing that happened
on testing was, correctly, "why is it still showing as cash I could actually
use?"

The build split itself was defensible: A2 touched synced data and A3 didn't, and
separating them made the risky half independently verifiable. The mistake was
the **copy**, which described A3's behaviour as though it already existed. Two
rules fall out:

- A control whose effect is not yet built must say so, or not ship.
- When splitting a feature across builds, the split has to be visible from the
  user's side, not just from the diff's. "Fields now, behaviour later" is a
  reasonable engineering plan and an unreasonable thing to hand somebody
  without a word.

## `max`, never a sum — goal money lives inside bank balances (2026-08-07)

The heart of A3. `applyGoalContribution` writes a transfer expense and credits
the goal; it never touches `banks`. So an emergency fund tracked as **both** a
reserved account and a protected goal linked to that account is one pile of
money described twice. Two independently-computed totals subtracted from one
pool withhold it twice — 25,000 from an account holding 15,000 — which drives
"available" negative and refuses purchases the household can plainly afford.

So the withholding is computed **per bank**:
`withheld += max(reserved, claimed)`. A reserved account withholds its whole
balance and the goal inside it costs nothing further; a goal claiming more than
its account holds wins the max and is subtracted conservatively.

The corollary is the three ways a protected goal's `bankId` can resolve, which
are three *different* answers and not variations of one:

- a **counted** bank → already inside that bank's `max()`;
- a bank that is **not counted** (unreachable, joint, the other person's) →
  subtract **nothing**, because its money was never added to the total and
  subtracting would remove money that isn't there;
- **absent or dangling** → subtract from the pool, as before. A deleted account
  is not evidence the money moved.

## Releasing an account is not releasing the goal inside it (2026-08-07)

The emergency-fund flag is a *policy*, so it is releasable for a single purchase
— that is the whole reason it is a separate concept from "can't reach it". But
releasing the **account** must not silently spend a **goal** kept in it: the
goal is a separate decision with its own toggle, and the `max()` keeps
withholding what it claims. Releasing a 15,000 emergency account holding a
10,000 goal frees exactly 5,000, and the card says so rather than leaving the
person to work out why the number moved less than they expected.

Both levers (`includedBankIds`, `releasedBankIds`) live in the draft, never on
the record. The account's flag is a fact about the account and syncs; including
or releasing it for one purchase is a fact about one decision and doesn't.

## Feasibility is capacity across the window, not every bucket (2026-08-07)

`purchaseSavingsPlan` asks whether the total spare money between now and the
target date reaches the shortfall — not whether every single period can spare
the even share. Saving more in a fat period to cover a lean one is a real plan
and rejecting it would be wrong. The tightest period is reported separately, so
the card can *warn* that front-loading is required without calling it
impossible.

It plans from **available cash**, not from zero. Starting from zero would tell
someone to save the full price for something their available cash already
covers — and the whole point of the account flags is that "available" is now a
number worth starting from.

## A handoff has to be self-consistent on arrival (2026-08-07)

"Start saving for this" first created a Goal with the purchase **price** as its
target and the advisor's **per-period** figure as its monthly. The result read
*"Behind · needs SAR 10,667/mo"* the instant it appeared, directly beneath a
card saying *"On track — set aside SAR 875 per period"*. Two distinct causes,
both worth stating because either alone would have been enough:

- A goal targeting the full price asks you to save money you already have. The
  target is the **shortfall** — the same figure the card shows as "still to
  find".
- The advisor counts pay-period **buckets**; `goalDeadlineStatus` counts whole
  calendar **months**, deliberately rounding up. Near a boundary these differ by
  one, so `monthly` is now derived through `goalDeadlineStatus` itself rather
  than copied across from the card.

The general rule: when one feature creates a record another feature judges,
compute the seed values with **the judging feature's own arithmetic**. Reusing
the originating feature's numbers produces a record that is born failing.


## "Can't reach it" and "won't spend it" are two fields, not one (2026-08-07, v1.32.0)

The obvious design is a single "don't count this account" checkbox. It is wrong,
and the two reasons a person gives for wanting it are what give it away.

`accessible:false` is a **capability**. Money in a Philippine account this
household cannot reach is not spendable no matter how anyone feels about it, so
it is excluded outright — and reported, because an account silently missing from
a total looks like the app is broken rather than careful.

`purpose:"emergency"` is a **policy**. You *can* spend it; you have decided you
shouldn't. So it stays counted, is withheld by default, and can be released for
a single decision — the same shape the Purchase Advisor's protected goals
already use.

Collapse them and the emergency fund loses the only interesting thing about it:
being able to ask what raiding it would cost. Merging them also loses the
distinction in the UI, where one wants a checkbox and the other wants a
releasable toggle in a different tab entirely.

Both are advisor-only. **Net Worth, the Home cash card and every other total
still count this money** — an account you can't reach today has not stopped
being yours, and a "net worth" that quietly omitted it would be a different and
much worse bug than the one being fixed.

## Absence is the value, and it is worth protecting on purpose (2026-08-07)

None of the four new fields (`banks[].accessible`, `banks[].purpose`,
`goals[].bankId`, `goals[].deadline`) is defaulted in `migrate()`. This is not
laziness — a default would be a regression.

`banks` and `goals` are already synced collections, hashed wholesale by
`fingerprint()`. Writing `accessible:true` onto every existing account states a
fact the absence already states, but it changes the document, which changes the
fingerprint, which marks every device dirty on first open, which buys a
Cloudflare KV write per device for information nobody entered. The rule
`goalId`, `fundedCatId` and expense `ord` already follow.

The corollary is that a *prose mention* of a field inside `migrate()` is not a
violation of that rule, but a substring check can't tell the two apart —
`installmenttest.cjs` case 27 failed on a comment explaining the very rule it
enforces. The assertion now strips comments first, verified still to catch a
real injected default. The same trap had already bitten `purchasetest.cjs`
earlier the same day; if a third one appears, the strip helper should be shared.

## FX rates belong in `data`, and the mount effect can't see it (2026-08-07)

Rates lived in `useState(null)`, so every reload began with no FX at all:
`convert()` returned null for everything until the network answered, and an
offline cold start showed nothing in a foreign currency even though it had
converted fine a minute earlier. They now live in `data` beside
`livePrice`/`prevClose` and are excluded from `fingerprint()` alongside them —
the mechanism already existed, because cached market data had already posed
exactly this question once.

The interesting part is the bug that followed. The refresh was written as a
mount effect with a staleness check, which looks obviously correct and refetched
on **every single app open** regardless — measured with a cache 80 seconds old
inside a six-hour window.

App's initial state is an EMPTY document (`structuralDefaults()`); the stored one
arrives later, in the load effect. So a `[]` mount effect reads `data.rates`
before the document exists, finds nothing cached every time, and refetches.
Gating on `loaded` fixes it. **Anything that consults persisted state from an
effect must wait for `loaded`** — the empty initial document is a real value,
not a momentary blank.

Two things this reinforces. The `fingerprint()` exclusion meant the churn never
cost a KV write, which is the safety net doing its job — but a safety net is not
a substitute for the behaviour being right. And it was invisible to all nineteen
runners, because it is a fact about what the app's effects do after mount rather
than about any pure function. That is now the third defect of this exact shape
(after `migrate()`'s missing collection defaults and the fingerprint-anchored
provenance mark) that only appeared when the app was driven in a browser.

## A deadline that nothing reads is the bug it was added to fix (2026-08-07)

Build A collected a purchase date and used it for nothing — it prefilled the
installment handoff and entered no calculation. That is precisely why "save up
for it" answered the wrong question.

So `goals[].deadline` ships **with** the Goals tab acting on it, not ahead of
it. `goalDeadlineStatus` returns `null` when there is no deadline, so a goal
without one renders exactly the card it always did — no empty state, nothing to
dismiss — and a goal with one gains an on-track/behind verdict on both the card
and the detail sheet.

Two choices inside it:

- **Whole months remaining**, via the existing `completedMonths`, which rounds
  the requirement *up*: with three and a half months left you are asked for the
  three-month figure. A deadline is a commitment; flattering it with a
  part-month helps nobody.
- **`onTrack` compares the goal's stated `monthly`**, never recent actual
  contributions. Plan-based, with actuals only ever a warning — one month you
  happened to skip is not evidence the plan is wrong, and quietly re-deriving
  the plan from behaviour is how a budget stops being a decision. The same rule
  the Purchase Advisor's projections follow.


## The Purchase Advisor is two builds, and Build A is the feature (2026-08-07, v1.31.0)

"Should I buy this MacBook, and how?" reads like an AI question. It isn't. The
expensive, risky and interesting part is the forward cash-flow model, which the
app had never had — and once that exists, the answer is already on screen. So
the work was split: **Build A**, a deterministic scenario engine plus a tab,
shipping alone; **Build B**, a one-shot Gemini narration of Build A's output
behind a new Worker endpoint with hard spend caps, shipping separately or never.

The split is not tidiness. Build A changes no synced data, needs no Worker
change, no secret, no CSP work and no rate limiting, so it is independently
rollback-able and cannot break sync. It is also permanently the offline,
quota-exhausted and model-down fallback: if Build B is never built, or is built
and later removed, nothing is lost. Splitting the other way round — narration
first, over figures computed ad hoc — would have made the model the load-bearing
part of a financial recommendation, which is exactly what it must never be.

## Availability is a subtraction, never a number (2026-08-07, v1.31.0)

The naive "cash available" figure is `Σ bankValue()`, and it recommends spending
the emergency fund. `applyGoalContribution` writes an `isTransfer:true` expense
and credits the goal — **it never touches `banks`** — so every goal pot and the
whole Bills Reserve is already inside that sum. Subtracting them is not
conservatism; it is removing a double count.

Hence `purchaseAvailableStack` returns every component rather than a total, and
the UI renders the stack:

    Accounts · Me            SAR 31,000
    Bills Reserve          − SAR  6,100
    3 protected goals      − SAR 12,500
    Available                SAR 12,400
    Joint accounts — not counted  SAR 18,000   (greyed)

Three consequences worth naming:

- **Every goal is protected by default**, with per-goal unprotect toggles that
  live in the draft and never in `data`. The safe default is the one where a
  recommendation cannot quietly spend the emergency fund.
- **Joint accounts are reported and never added.** Scope is strictly per-owner
  (following `budgetOwner`), and `"household"` is not a third person. A joint
  account silently missing from a total is the surprise the greyed line exists
  to prevent — an exclusion the user can see is a decision; one they cannot is
  a bug.
- **The Bills Reserve is household-wide but is subtracted in full** from one
  owner's cash. That understates availability, deliberately, and is labelled.
  Revisit only alongside a household-scope design conversation.

An account in a currency FX cannot yet convert is **excluded and counted**, not
added at face value — 200,000 PHP silently landing in a SAR total would be the
worst possible failure shape for a spending recommendation.

## The advisor must never be able to disagree with the Budget tab (2026-08-07)

The projection is only credible if its "headroom" is the same number Budget
already shows as "Left". Two devices for that, both structural rather than
disciplinary:

1. `purchaseHeadroomForBucket` is literally `income − Σ categoryEffectiveAmt −
   installmentTotal`, and `categoryEffectiveAmt` is `BudgetView`'s own
   `effectiveAmt` extracted to module scope (with `ExpenseTrackerView`'s second
   inline copy deleted in the same change — three copies of "a category's
   `amount` is manual only while it has no subs" was two too many).
2. `purchasetest.cjs` slices the **shipped `BudgetView` expression** out of
   `index.html`, runs it over the same fixture, and asserts equality. A
   restatement of the arithmetic in the test would only ever test the
   restatement; slicing means a future edit to either side fails the runner.

The funded-installment rule falls out of the same discipline: a payment with
`fundedCatId` is already inside a category's allocation, so it leaves the
obligation exactly as it leaves `BudgetView.installmentTotal`. Counting it in
both places reserves the same riyal twice.

## Plan-based, with actuals as a warning and never as arithmetic (2026-08-07)

The engine projects from the plan, not from a trailing average. A plan is a
decision; a trailing average is a description, and projecting from it quietly
tells someone their overspending is a law of nature. But a plan the last three
periods consistently overran is worth saying out loud before committing to
twelve payments against it — so `purchaseHistoryWarning` returns a sentence,
gated on `MIN_TREND_BUCKETS` (the same bar Home's trend cards use) and on the
mean exceeding plan by more than 10%. It never feeds a figure. It is dark until
roughly Oct 2026, which is a carried-forward action, not a finished one.

## Nothing derivable is stored, and nothing at all is synced (2026-08-07)

The whole feature adds no field to the document: no collection, no
`migrate()` default, no `fingerprint()` touch point, no merge entry, no backup
key. It cannot cause a KV write and cannot reach the other phone — which is
precisely why it could ship without the sync-testing discipline every previous
build needed.

The draft is per-device `localStorage` (`PURCHASE_DRAFT_KEY`) for the same
reasons as `VIEW_PROFILE_KEY` and `PROVENANCE_KEY`, plus one of its own: a
half-finished thought is not a household record, and syncing it would change
what the other phone is looking at. It stores **inputs only** — a stored
headroom or verdict would be a snapshot of a budget that has since moved, and
recomputing on open is free.

The render path also never reaches `editPlanForMonth`. The advisor resolves up
to 24 future buckets; one write on that path would clone a plan into every
month somebody merely glanced at. It is the same rule the derived Budget rows
follow, and `purchasetest.cjs` asserts it as a property of the source rather
than trusting it to stay true.

## `prefill` is not `initial` (2026-08-07)

"Create this plan" hands `InstallmentEditSheet` a **`prefill`**, not an
`initial`. They look interchangeable and are not: `editing = !!initial` decides
whether Save updates or creates, whether the schedule starts hand-edited, and
whether the first-due/count row is offered at all. A prefill wants none of that
— it only wants the boxes filled in. Reusing `initial` would have produced a
sheet that edited a record which does not exist yet.

From the moment it saves it is an ordinary installment. The advisor stores
nothing about it and has no further relationship with it — which is what keeps
"the advisor is read-only" true with exactly one explicit exception the user
performs themselves.


## Cleaning up demo records can't match on name (2026-08-07)

`samplescan.cjs` deliberately never matches a record by its name, which looks
like an obvious way to find demo data and would delete real records here.

`defaultData()`'s seed set was not written as generic filler — it was authored
from this user's actual financial life. "Charlene", "Tuition Fee Wife",
"Braces", "Postpaid Bill" and "Toyota Raize" are real budget categories, and
Toyota Raize is also a real asset. Any name-based sweep deletes genuine data
while looking like it is working.

So the tool scores three independent signals and never sums them into an
automatic verdict: exact **value** match against `sampleData()` (sliced from
`index.html`, so it cannot drift from what the app actually seeds, and
deliberately excluding the name from the fingerprint); a **cohort date**, since
every sample record carries the day the fresh device generated them and a real
day rarely creates a bank, an asset, a goal and three investments at once; and
**absence** from an older backup passed via `--before`. It reports; the person
decides; `--remove` takes explicit ids. Removal is a soft delete to a *new*
file, so it is reversible and its tombstones propagate correctly to the other
device — a hard delete could not survive a merge.

Verified against a fixture in which real records deliberately share names with
seeded ones: all ten sample records were found, all four real ones left alone,
and the one genuinely ambiguous record (an asset, which carries no date and so
has no cohort signal) was reported as WEAK rather than silently removed.

## Reset was the same bug, quieter (2026-08-07, v1.29.1)

v1.29.0 changed Settings' Reset from "load sample data" to "empty this
device". That looked like a straightforward improvement and introduced a
quieter version of the bug the release was fixing: Reset marks the document
dirty, the idle autosave fires ~8s later, and the emptied device uploads
itself. A button that reads as "clean up this device" reached the other phone.

The blast radius was smaller than it sounds — Reset writes no tombstones, so
the other device's next merge restores everything and pushes it back — but that
depends on another device being around to heal it, and "your data comes back
once you open the other phone" is not something anybody should have to know.
The old behaviour was arguably safer for the wrong reason: pushing *sample
records* is obviously wrong on sight, while pushing *nothing* is not.

The fix reuses the mark built for sample data, so `PROVENANCE_KEY` now holds
`"sample"` or `"reset"` — one behaviour, two values, distinguished only so the
message can say which. Two follow-on corrections, both found by driving the
real app rather than by reasoning:

**Reset must keep preferences.** Emptying them too meant the next pull brought
the records back but the owner names back as "Me"/"My wife": the reset device's
freshly-stamped defaults beat the cloud's real settings in
`mergeSettingPaths`. Keeping preferences leaves a reset device with nothing to
disagree with the cloud about, which is both the correct merge behaviour and
the correct reading of what "reset" means to a person.

**Lifting the mark is gated on record count, not on cleanliness.** The obvious
gate — clear it once the device is no longer dirty — left the reset device held
forever, because a device that keeps its preferences is never byte-equal to a
cloud document carrying fewer settings fields. `countLocalRecords(merged) <=
countLocalRecords(remote)` asks the question that actually matters: did this
device contribute anything of its own? A reset device contributes nothing;
sample data merged onto an established device contributes fifteen categories
and must stay held. Both verified in the browser: reset → pull recovers data
and names and frees the device, sample → pull stays silent for 22s while dirty.

## A merge needs a shared ancestor (2026-08-07)

A new Safari/PWA origin booted on the **sample dataset**, and entering the sync
passphrase published it: 15 demo categories, 3 goals, 3 investments, arriving
on both real phones.

The instructive part is that nothing malfunctioned. `tryAutoMergeAll` is
id-keyed; a fresh device's ids are all newly minted, so nothing collided and
every demo record survived into the union, which the post-merge auto-push then
sent. Each step did exactly what it was written to do. The defect was a missing
question: **merging is only meaningful against a shared ancestor.** Two
documents with no common history don't have a divergence to reconcile, so their
union isn't a merge at all — it is one device's contents added to somebody
else's document.

So `syncConnectDecision(ctx)` is a pure function whose first input is
`hasBaseline`, and every path that previously decided this on its own now calls
it: the startup `reconcile`, `pullFromCloud`, and `saveToCloud`'s conflict
retry. That third one mattered — a rev rejection hands back the server's
document, and the reflex is to merge into it, which is the same bug through a
different door. Three independent copies of a rule is how they came to disagree
in the first place.

Three supporting choices, each of which could plausibly have gone the other way:

**A fresh device now opens empty.** Sample data was a genuinely good
first-run experience, and it is still one tap away in Settings — but as the
*default* it meant every new device's opening state was fifteen fabricated
records indistinguishable, to every code path downstream, from real ones. Once
the boot state is empty, "don't upload untouched sample data" stops being a
special case that has to be detected and becomes a thing that cannot arise.
`structuralDefaults()` still ships one income-0 plan per owner as a skeleton,
because `plans:[]` (though a valid document) leaves `resolvePlanForMonth` with
nothing to return; the skeleton keeps Budget on its existing zero state instead
of needing a new no-plan render path.

**The chooser is not the conflict modal.** Reusing `ConflictModal` was the
smaller diff, and it was wrong twice over: its copy asserts a shared history
that by definition doesn't exist here, and its "Save Local to Cloud" button
*overwrites*. Offering that from a device which has never synced means offering
to destroy the other phone's entire dataset from a screen that cannot show what
it would destroy. `FirstConnectSheet` offers merge-with-counts instead — the
union of two unrelated documents loses neither side, which is the only outcome
safe to offer blind.

**Provenance is per-device and sticky.** It lives in `localStorage`, not
`data`: a synced `provenance` field would travel to the other phone and make it
distrust its own records, and per the `migrate()` rule it would cost every
device a KV write for information no other device can use. The first
implementation anchored the mark to the document's fingerprint, so that any
edit would end sample status automatically — elegant, and it failed in the
browser within seconds: the bills reconciler, the daily snapshot effect and the
quote refresh all mutate the document on load, the fingerprint stopped
matching, and the demo dataset auto-pushed exactly as before. The question "has
a person edited this?" turned out to be the wrong one to ask. Sample status now
ends only when somebody says so — an explicit Save to Cloud, a Reset, or
adopting/merging a cloud document. Being too sticky costs one deliberate tap;
being too eager costs somebody else's phone.

A fourth thing surfaced only under a real browser: `migrate()` never defaulted
`goals`/`investments`/`banks`/`assets`, so adopting a sparse cloud document
left the device differing from the baseline just recorded for it, and it pushed
a normalised copy straight back. "Adopted exactly, without issuing a POST" was
false until those four defaults were added. The unit tests could not have found
it — it needed the app's own effects running against a live document.

## Two Cloudflare projects, not one (2026-08-06)

Moving the app to Cloudflare made it tempting to serve it from the **existing**
`alloc-kv` Worker via static assets: same origin, so CORS disappears entirely,
one service, one deploy. It was rejected.

Every app release would then redeploy the Worker that owns the `SyncRoom`
Durable Object — and a Worker deploy **replaces its bindings** with whatever
`wrangler.jsonc` declares. A mistake in a routine app release could silently
unbind KV and take sync with it. Today an app build cannot touch the sync
backend at all, which is why every build note in this file can say "`worker.js`
is untouched, so nothing needs a `wrangler deploy`". That isolation is worth
more than deleting a CORS allowlist.

The cost is honest and small: one origin added to `ALLOWED_ORIGINS`, one Worker
deploy, once.

## The pipeline you can't read is the one that fails (2026-08-06)

GitHub Pages failed five times in a row with `Timeout reached, aborting`, while
its own status page stayed green. The build always succeeded; only the deploy
died. Nothing in the repo could cause it and nothing in the repo could fix it —
`.nojekyll`, re-running, deleting the stuck run and recreating the Pages site
all changed nothing.

Two things worth carrying forward.

**A diagnosis that predicts a fix, and the fix does nothing, is wrong.** The
stuck-deployment theory was plausible and fit the timeline — repeated timeouts,
green status, a queue behind a first failure. Clearing the queue changed
nothing, which meant the theory was wrong, not that it needed another attempt.
Pushing `.nojekyll` before reading the error was the mistake: the error said the
*build* had succeeded, so no amount of build configuration could ever have been
the answer.

**Deploy visibility is a feature.** The replacement deploys by an explicit
command that prints what it uploaded and finishes in seconds. The old pipeline's
failure was discovered by email, hours after the fact, with four builds stacked
behind it. For an app two people use daily for real money, "I can see whether it
shipped" is worth more than "it ships by itself".

## Verification is the part that finds the bug (2026-08-06)

The Cloudflare deploy was verified rather than assumed, and that is what caught
**Pages 308-redirecting `/index.html` → `/`**. The site worked either way, so
nothing would have looked broken — but `manifest.webmanifest` pointed
`start_url` at `./index.html`, so the home-screen app would have taken a
redirect on **every single launch**, and `sw.js` would have pre-cached a
redirected response for a page it already had.

The timing is the point: both phones were about to install the PWA. Found
before, it is a one-line change; found after, it is "please delete and
re-install the app on both phones". A deploy isn't done when the upload
succeeds — it's done when you've read back what the server actually serves.

## A convenience link must degrade, never swallow (2026-08-06)

`category.goalId` lets a transfer against "Long Term Savings" also credit a
goal. The obvious implementation hands the goal id to `applyGoalContribution`
and lets it sort things out — and that function already refuses to write for an
unknown goal, which reads like a safe guard.

It is the opposite of safe here. Refusing is right for a *direct* contribution
(there is nothing to record), but for a linked transfer the money genuinely
moved: refusing would silently drop the whole transaction because a goal the
user deleted months ago no longer exists. The failure would be invisible and the
data simply missing.

So the link is resolved **before** the write, by `categoryGoalFor`, which returns
null for a deleted or missing goal. A stale link makes the category behave as an
ordinary untracked category again. The rule generalises: **an optional link is a
convenience, not a dependency — when it can't be honoured, the primary action
must still happen.**

## `catId` and `goalId` answer different questions (2026-08-06)

A direct goal contribution had `catId` = the goal id, so the two were the same
value and nothing forced the distinction. A category-linked transfer breaks the
coincidence: the money left via a **budget category** and landed in a **goal**.

`catId` had to stay the category, because that is what the envelope's
"transferred" figure and the Expenses category filter read — pointing it at the
goal would make the transfer vanish from the envelope that planned it. `goalId`
is what records the credit. Two fields, two questions, and the old code only
worked because it never had to tell them apart.

**The classification consequence was chosen, not inherited.** `unaccountedParts`
prefers `goalId`, so a linked transfer now counts under "Goal contributions"
rather than "Transfers out". Both lines subtract, so the sheet reconciles either
way — the choice is about which is *truthful*, and a transfer that funded a goal
is a goal contribution. The cost is stated rather than hidden: hand-summing
untracked envelopes against "Transfers out" is now short by whatever went
through a linked category, which is the same trap extra funds already set, and
5b has to account for it.

## Three screens, one action, three different meanings (2026-08-06)

Crediting a goal was implemented three times. The add-transaction modal wrote
the ledger transfer and the contribution; the Goals tab and Home's sheet wrote
only the contribution. Nothing was obviously broken — each screen did something
reasonable — but the *same user action* meant different things depending on
where it was started, and one of those meanings was wrong: a goal could grow
while the money was still sitting in "still unaccounted for".

**The fix is deleting a function, not adding one.** `addContribution` was the
goal-only writer, and keeping it alongside the new `contributeToGoal` would have
been the safer-looking change. It is exactly how the three paths drifted in the
first place: a second entry point that does half the work will eventually be
called by a third screen. One writer, no alternative.

**The two records had to link by id.** Before this, the only thing tying a
transfer to a goal was `catId` happening to equal a live goal id — inference,
not a relationship. So deleting a goal silently reclassified its whole history
from "Goal contributions" to "Transfers out"; the sheet still added up, but
figures moved between lines months after the money did. An explicit link cannot
rot, and legacy rows keep the old inference as a fallback.

**Nothing is backfilled**, and that is the same call `ord` and `actualAmount`
already made: absence means "made before this existed". Pairing historical
expenses with historical contributions by amount and date would be *inventing* a
relationship the user never asserted, and it would be wrong precisely in the
messy cases — two contributions of the same size in one month.

**Delete symmetry is not a nicety here.** If deleting the transfer left the goal
credited, the app would claim money both left the budget and didn't. The
mirrors are four small pure functions rather than two, because restore has to
reverse each direction independently — and Recently Deleted can restore from
either side.

## Chosen and observed are different data, even when they look identical (2026-08-06)

A pinned shortcut and a Repeat chip render as the same chip and fill the same
form. The obvious move is one list. They are not the same data:

- A **Repeat** entry is an *observation* about recent history. It is derived, it
  is per-device, and it disappears when you stop doing the thing.
- A **shortcut** is a *decision*. It must survive a quiet month, and it must
  reach the other person's phone — which makes it a synced collection with an
  id, a tombstone and a merge rule.

Storage had to differ, so the honest UI is two rows. This is the third time the
same call has come up in this feature (name chips vs Repeat, Repeat vs
Shortcuts) and the answer has been the same each time: **overloading one control
saves a row of pixels and costs a sentence of explanation.**

**The cost of two rows is that they can show the same entry twice**, one line
apart, which looks like a bug even though both are correct. So pinning *moves*
an entry between rows — `recentTxTemplates` takes `excludeKeys` and the pinned
keys are passed in. Worth stating because the dedupe is not a detail: without it
the separation would have looked like duplication, and the temptation would have
been to merge the rows and lose the distinction.

**Pinning is keyed by what the user recognises.** Re-pinning `(owner, name,
catId)` updates the amount instead of creating a twin, and a tombstoned match is
*revived* rather than left dead beside a new record. The alternative — key by
id — is correct in the database and wrong in the head: nobody pins "Jollibee"
twice on purpose, and pin/unpin/pin should not leave a graveyard that syncs
forever.

## A new collection has an eighth touch point now, and it's the dangerous one (2026-08-06)

`installments` established seven places a synced collection must be wired into,
and that list was written down. It is now incomplete, because v1.23.0 put
`validateBackup` on the critical path for **every document arriving from the
cloud**, not just imported files.

So a new collection must also be added to **both** backup key lists:
`BACKUP_ARRAY_KEYS` (if present it must be a list — an error) and
`BACKUP_OPTIONAL_KEYS` (its absence is normal — a warning, which
`cloudDocProblem` drops).

Missing the second is the sharp one, and the failure is asymmetric in the worst
way: the device that upgrades **first** starts refusing the other phone's
document, because that phone has no `txTemplates` key yet. Sync would break
between two entirely healthy devices, and the error would name a collection the
user has never heard of.

The general lesson: **a validation gate that was written for one entry point
becomes a constraint on every entry point it is later reused at.** The
forward-compatibility assertion in `cloudguardtest.cjs` exists for exactly this,
and it staying green is what proves the wiring is right.

## An undo that only runs one direction is half a mechanism (2026-08-06)

The undo toast had shipped a dozen call sites deep and looked general. It was
not: `triggerUndo` stored restore arguments and `performUndo` called
`restoreRecord`, so the only thing it could express was *un-delete*. That was
invisible for as long as every undoable action happened to be a delete.

Rapid entry writes rows nobody has reviewed, so it needs the mirror — undo an
*add* — and the shape of the fix mattered. Routing it through the existing
`removeExpenseTx` would have been one line and would have raised that function's
own *"Deleted …"* toast, telling the user they deleted something they were only
taking back. **A message that is technically accurate about the mechanism and
wrong about the intent is still a lie**, so the undo-an-add path tombstones
silently.

It tombstones rather than splicing for the ordinary reason: a hard delete cannot
survive a merge, because the other device's copy resurrects it.

**Tracked mode only, and the boundary is "can this be honestly reversed".** A
Goals contribution writes two records — the transfer row and the goal's own
contribution — so a one-record undo leaves the goal credited. Untracked
transfers also write `quickTransferLast`. Both could be supported; neither is a
single-record insert, and offering an Undo that only partly undoes is worse than
not offering the button.

## An updater that mints an id is not a pure updater (2026-08-06)

`addExpenseTx` called `uid()` **inside** its `setData` updater. React may invoke
an updater more than once, and each invocation would have produced a different
id for one logical insert. Nothing had ever depended on it, so nothing had ever
failed.

Needing the id as a return value is what made the latent bug reachable, and the
fix — hoist `uid()` above `setData` — is what the rule already required. Worth
recording because the diff looks cosmetic: **the reason to move it is not that
it's tidier, it's that an updater must be a pure function of previous state.**

## A prefilled field is only useful if it's cheap to overwrite (2026-08-06)

The Repeat chips refill a whole past transaction. The obvious objection is the
amount: groceries are 250 one week and 180 the next, so prefilling it is wrong
about as often as it's right.

The resolution is not to prefill less, it is to make the wrong case cost one
keystroke — **prefill the amount and select it**. A right guess saves a typed
figure; a wrong guess costs nothing, because the first digit typed replaces the
whole thing. Choosing between "always right" and "don't try" was a false choice.

**Repeat is a second control, not a change to the first.** `roadmap.md` had
flagged that the name chips fill the name only, deliberately, and that changing
that was a real decision. It stays unchanged. One chip whose effect depends on
which row it came from is unexplainable; two controls with two meanings are not,
and the name chips keep the job they're good at — narrowing as you type, which a
whole-transaction chip cannot do.

**Autofocus had to become conditional to be worth having.** Focusing Title on
open is right when the modal was opened from an envelope (the category is
already decided). It is actively wrong from the generic Add button, where the
next step is the category select and raising the keyboard buries the list the
user has to read. "Autofocus" as a flat rule would have been a regression half
the time it fired.

## The iOS keyboard rule is a focus rule, and it decides where focus() goes (2026-08-06)

The first Repeat implementation deferred focus to `requestAnimationFrame`. It
failed under browser automation, which was luck: rAF is throttled in a
non-foreground tab, so the bug was visible on a desktop.

The real defect was worse and would not have shown up there at all. **iOS Safari
raises the keyboard only for a `focus()` call made synchronously inside the user
gesture that triggered it.** A deferred focus moves the caret and nothing else —
on the phone this feature exists for, the chip would have looked like it worked
while saving no typing at all. A feature whose entire value is "fewer taps"
would have shipped with its main tap still required.

So focus is synchronous. But **`select()` cannot be**, and the reason is React:
at gesture time the input still holds the *old* value, and the commit that sets
the new one collapses any selection to the caret. Selecting on the next tick is
what actually leaves the figure highlighted.

The general shape worth remembering: **`focus()` belongs to the gesture and
`select()` belongs to the commit.** They look like one operation and are not.

The modal-open autofocus keeps a deferred path because its field genuinely isn't
mounted yet, and it uses `setTimeout(0)` rather than rAF — same throttling
lesson. That path can't raise an iOS keyboard, and that limitation is written
down rather than papered over, because no focus call can fix it.

## The fixture found the older bug (2026-08-06)

The `isExtraFunds` row seeded into the sandbox existed to prove the *new*
function excluded it. It did — and it also showed up in the *old* name-chip row
directly below, which had filtered `isTransfer` but never `isExtraFunds` since
the day it shipped. "Wife sent extra" was being offered as a title for a spend.

Worth naming because the mechanism generalises: **a fixture built to exercise
new code runs past all the old code on the same screen.** Testing the new
function in isolation — which the unit test also does — would have proved the
new function correct and left the shipped bug in place. Both are worth doing;
only one of them found this.

It is also the third time this specific trap has bitten (`spentMap` in
2026-08-01, the unaccounted figure, now the name chips), which is why the rule
in `CLAUDE.md` is phrased as an obligation on *every* reduce over `expenses`
rather than a note about one function.

## An unreadable document is a failed read, not a conflict (2026-08-05)

Validating documents arriving from the cloud (v1.23.0) looked like it had an
obvious home: the conflict modal already exists to say "these two copies
disagree, pick one". Routing a rejected document there would have been one line.

It is the wrong shape. **The conflict modal asks the user to choose between two
documents; a corrupt blob is not one of the choices.** Rendering "Use Cloud" as
an option against a document we have just proved unparseable offers a button
that must never be pressed. So a rejected document takes the path a *failed
read* takes — adopt nothing, merge nothing, advance no rev, record no snapshot —
and reports itself as a sync failure, which is what it is.

**Warnings had to be dropped, and that is the whole reason `cloudDocProblem`
isn't just `validateBackup(x).ok`.** `validateBackup` warns about every absent
optional collection, because for a *file* that means "an older backup". For a
*device*, it means "hasn't used Installments yet" — the normal state of a
perfectly healthy phone. Refusing on warnings would have made the gate reject
honest devices, which is a worse bug than the one being fixed. The same instinct
drives the forward-compatibility assertion in `cloudguardtest.cjs`: collections
this build has never heard of must pass, because the other phone may be ahead.

**Pushing stops rather than offering a force-overwrite.** The tempting escape
hatch is a button that replaces the corrupt cloud copy with this device's data —
sync is restored, corruption gone. It was rejected: it only works by forcing the
rev past a compare-and-swap, and the case where the "corrupt" document is
actually the other phone's real data costs someone their records. Blocking is
recoverable; a wrong overwrite is not. The cost is stated plainly — repairing a
corrupt cloud document is not an in-app operation — rather than papered over.

**The new-device case reuses the "still connecting" screen on purpose.** Opening
on `defaultData()` there is worse than the timeout it was built for: the typing
would sit on top of a document we already know we can't reconcile with. Same
screen, different copy, plus the reason in monospace — the v1.22.2 lesson that a
failure nobody can read costs a session.

## Making records mergeable costs more than writing the merge (2026-08-05)

The per-category plan merge was scoped as "swap `mergeArrayById` for
`mergeArrayByIdWithChildren`". The merge call is genuinely one line. Everything
else was the actual work, and neither part was optional:

- **Deletion.** `removeCat` spliced. A union merge would resurrect a deleted
  category — a silent lost edit traded for a silent resurrected delete.
- **Order.** Category order was array position, and `mergeArrayById` sorts
  children by id for determinism. Merging would have quietly reordered the
  envelope list. Order had to become `ord`, a field.

Both are the same underlying point: **array position and absence are not
representable in a merge.** A record can only survive one if every meaningful
fact about it is a field on it. This app already learned that for transactions —
`compareTxForDisplay` exists because `mergeArrayById` erases array order — and
categories were the same lesson in a place nobody had looked.

**37 read sites is why `livePlanView` exists.** Tombstoning categories means
every reader must filter, and auditing 37 call sites is exactly how a subtle
one gets missed. Filtering inside `resolvePlanForMonth` — the single point every
reader already resolves a plan through — makes them all correct without touching
any of them. The one reader that bypasses it (the App-level active plan, feeding
the header income field and `allocated`) had to be wrapped explicitly, and
finding it required grepping rather than assuming.

**The identical-object rule is load-bearing here, not a micro-optimisation.**
`livePlanView` runs on every render for every plan lookup. Returning a fresh
object each time would break `useMemo([plan])` identity across the app. It
returns the same object whenever nothing is tombstoned and nothing is out of
order — which is the overwhelmingly common case — mirroring the bills
reconciler's "return the identical object when nothing changed".

**One deliberate one-time cost.** Backfilling `ord` changes `fingerprint()` for
every existing document, so each device does one KV write on first open. That was
worth stating rather than hiding: it is a one-off, unlike the per-app-open write
the `userFingerprint` split was introduced to stop, and it is deterministic, so
two devices converge on the same result instead of fighting. `updatedAt` was
deliberately **not** backfilled — absent must keep meaning "never edited
anywhere", which is what lets a real edit on either device win.

## A merge test that passes before the fix is not a test (2026-08-05)

Every assertion in `mergetest.cjs` was run against the *previous* `index.html`
before being trusted. Eight of the twenty-two failed there, which is the only
reason the other fourteen mean anything: merge code is full of paths that look
covered and aren't, because the default outcome frequently happens to be the
right one. `node mergetest.cjs /path/to/old-index.html` is a cheap habit worth
keeping for anything that resolves a conflict.

The three defects it locked down share a shape worth naming: **each one was a
field that existed, was written on every edit, and was never read.**
`monthlyPlans` records have carried `updatedAt` since they were introduced and
the merge ignored it. `household.expenses` rows carry `updatedAt` and the merge
passed `()=>""` instead. Writing a timestamp is not the same as honouring one,
and nothing fails loudly when you don't — the data just quietly picks a winner.

`tsOf=()=>""` deserves its own note. It reads like "no timestamp available", but
its actual effect is `"" > ""` = false, i.e. **local always wins**. A default
that silently encodes a policy is worse than no default.

## Deletion is what makes a merge hard (2026-08-05)

Build 3C was split in half, and the fault line is deletion.

Everything in 3C-1 — `monthlyPlans`, `household.expenses`, device identity —
involves records that are **soft-deleted or upserted**, so a delete is itself a
record and travels through a union merge like any other edit. Those were safe to
fix immediately.

The plan-category merge is not, and the reason is one line: `removeCat` does
`cats.filter(c=>c.id!==id)`. A hard delete. Union the categories by id and the
category one person deleted comes back from the other device's copy — trading a
silent lost *edit* for a silent resurrected *delete*, which is not an
improvement.

So the prerequisite for per-category merging is a tombstone, and the cost of a
tombstone is that **37 places read `plan.categories`** and each would have to
filter. The planned shape avoids auditing all 37: filter at
`resolvePlanForMonth`, the single point every reader already resolves a plan
through, and **return the identical object when nothing is tombstoned** so
render identity doesn't churn on the overwhelmingly common path. That is the
same "return the identical object when nothing changed" rule the bills
reconciler already follows.

Worth stating plainly because it is tempting to do the union first and the
tombstone "later": the union is the part that looks like the feature, and the
tombstone is the part that makes it correct.

## The cutover that needed no cutover (2026-08-05)

Moving sync from KV to a Durable Object sounded like the risky build of the
programme: a shared financial document, two people, a storage engine swap. It
turned out to need no downtime, no coordination and no data migration, because
of three choices made deliberately.

**Keep the wire format identical.** Same URLs, same request bodies, same
response shapes, same auth header. The phones were running v1.20.1 throughout
and never knew the backend changed. Nothing had to be updated in lockstep, which
is what removes the "both devices must upgrade first" problem entirely.

**Let the new thing adopt the old thing.** `SyncRoom` seeds itself from the
existing KV keys the first time it is used. There was no export/import step and
no moment where the document lived nowhere.

**Keep writing the old store for one release.** Every accepted write is mirrored
back to the three KV keys. That is what makes rollback *real* rather than
theoretical: revert the Worker and the old code resumes against current data,
even after several saves. A rollback path you cannot use after the first write is
not a rollback path.

**Verify with a write, not a read.** The plan was to read `/sync/meta` and check
the revision. What actually proved seeding worked was the *save*: the phone was
at 701 and its save was accepted as 702. A stale or empty DO would have rejected
that as a conflict. An operation that can only succeed if the invariant holds is
better evidence than reading the invariant.

**What made this safe to do with only one device backed up.** Not optimism — a
guard already in the client. All three places that could adopt a cloud document
require `Array.isArray(remoteRaw.plans)`, so an empty cloud is a no-op on every
device rather than a wipe. Worth knowing before the next risky server change:
*the client already refuses to be emptied.*

**Two things checked rather than assumed**, both of which would have been silent
failures. The KV namespace binding was read off the deployed Worker instead of
matched by name — the account has a second namespace whose contents belong to an
older version of the app. And the compatibility date was pinned to the one
already deployed rather than raised to today's, so a storage-engine change
didn't also quietly opt into unrelated runtime changes.

## An import is a decision, and a decision needs a window (2026-08-05)

Import replaced everything and then uploaded it within eight seconds. The
dangerous part was never the replacement — that is what the button is for — it
was that the *consequence reached the other person* before the user could look at
what they had done. Restoring a wrong backup on a phone silently overwrote the
copy the other phone was using.

So the fix is not more confirmations. It is a **hold**: the import lands locally,
and every automatic upload path checks a flag. The user gets an unbounded window
in which the mistake is theirs alone and reversible. Only an action they took on
purpose — Save to Cloud — ends it.

**`migrate()` is a defaulter, not a validator, and the two must not be conflated.**
It fills in keys it enumerates and leaves everything else exactly as found. A file
whose `banks` was the string `"nope"` passed straight through it and became the
live document. Validation had to be a separate function that runs *before* it.

**Errors are layered on purpose.** Top-level shape is checked and returns early,
so a broken `banks` is reported as a broken `banks` — not buried under thirty
consequent complaints about records inside it. A refusal a person can act on beats
a complete one they can't read.

**Pull is refused while a hold is outstanding.** This was the subtle one. A pull
*merges*, so pulling on top of an unreviewed import would fold the imported
records into the cloud copy — neither "keep it" nor "throw it away", and no
sentence could honestly describe the result. When an operation has no explainable
meaning, the right move is to refuse it and name the two that do.

**The hold is only armed when sync is configured.** A flag set on a device with no
passphrase costs nothing today and silently blocks syncing months later, the day
a passphrase is finally entered. State that exists to gate a subsystem should not
outlive the subsystem being absent.

**~~One safety slot~~ two, and the second one earns its keep (revised 2026-08-05).**
The pre-import copy reuses the existing "Restore previous local copy" mechanism
rather than inventing a second one. It shipped as a single slot with the
limitation stated in the sheet; the user asked for two the same day, and they
were right — the failure mode is specific and likely. A person who imports the
wrong file often imports *again* looking for the right one, and a one-slot design
destroys the real data on exactly that second attempt.

Two consequences worth recording:

- **A copy has to say what it is.** With one slot, "Restore previous local copy"
  was unambiguous. With two, an unlabelled pair of timestamps is a guess, so each
  slot stores *why* it was taken ("before importing a backup", "before merging
  cloud changes", "before replacing with the cloud copy").
- **Two slots is four copies of the document on the device**, alongside the live
  one and the last-synced baseline, in a ~5 MB localStorage. So the writer
  degrades rather than fails: it retries with fewer slots on quota and only
  reports failure when not even one fits. Keeping the newest copy is worth more
  than keeping both, and a safety mechanism that fails *closed* when storage is
  tight would block the import entirely. It also returns what was actually
  persisted, not what it was asked to persist — otherwise the UI offers a restore
  button for a copy that isn't on disk, which is a worse lie than having no
  button.

A stash that fails outright still aborts the import: proceeding would leave the
user with no way back, which is worse than not importing at all.

## Documentation that describes a policy the code abandoned (2026-08-05)

The Settings text said cloud upload happens only on an explicit tap. That was
true when it was written — the autosave, `pushImportant`, the visibility push and
the pagehide beacon were all added afterwards, each one a good change, and none
of them came back to the sentence that described the old rule.

Two things worth keeping from this.

**The lie was load-bearing, not cosmetic.** Two people share this dataset. A user
who believes nothing uploads until they tap a button will edit freely on a phone
they think is offline-only, and will not understand why the other phone changed.
The same sentence is what makes the import flow dangerous (see the import build):
"it hasn't uploaded yet" was a reasonable thing to believe.

**Copy is not exempt from verification.** The fix here was found by reading the
six push call sites, not by re-reading the sentence. A claim about behaviour
should be checked against the call sites that implement it, exactly like a
figure in a card is checked against the reduce that produces it.

Deliberately **not** changed in this build: the redundant conflict buttons.
`resolveKeepLocal` and `resolveSaveLocalToCloud` do the same thing, so the modal
has three buttons and two outcomes. Merging them is a behaviour change, and a
copy-only build that quietly removes a user-visible option is the same class of
mistake as a behaviour change that quietly leaves its copy behind.

## Installments: three owners of three different things (2026-08-02)

The ask was a module for short-term purchase installments — Tabby, Tamara,
Amazon, credit-card pay-in-3/4 — explicitly *not* a loan or debt-management
system. The whole design turns on one question: who owns the fact that
SAR 249.75 is due on 15 August?

Three candidates already existed, and picking wrong in either direction is what
makes this kind of feature rot:

- **Budget owns it.** Rejected. It would mean writing the payment into the
  stored monthly plan, and `clonePlanForMonth` remints every category id each
  month, so the link from a payment back to its plan row would silently break
  the first time a month was materialised — the same trap that forced Savings &
  Investing to match categories by *name* (see "Savings & Investing matched by
  name"). Worse, deriving the row on view would have to go through
  `editPlanForMonth`, so merely paging to next month would materialise a custom
  plan for it.
- **Expenses owns it.** Rejected. The ledger is a record of money that actually
  moved. A payment that hasn't happened yet is a plan, and putting it there
  would either need a "pending" transaction state — which the app has
  deliberately never had — or would inflate every actuals figure in the app.
- **A third collection owns it.** Chosen.

So: **`data.installmentPayments` owns planned timing and amounts. Budget renders
a derived group and stores nothing. `data.expenses` owns actual cash movement.**
Budget's group comes from `derivedInstallmentRowsFor(...)`, a pure function, and
the rows carry synthetic ids (`inst:<paymentId>`) that can never be mistaken for
a plan category — a stray write against one fails to find a target rather than
corrupting a budget line. Nothing in that path calls a plan setter, and
`installmenttest.cjs` asserts that at source level so a future edit can't
quietly reintroduce it.

### Nothing is stored that can be derived

No `remainingBalance`, no `paymentsRemaining`, no `progress`. All three are
functions of the live payment records, so they cannot drift after an edit, a
deletion, a sync merge or an early payoff — the same rule bank interest
(`bankValuation`) and the Bills Reserve (`computeBillsReserve`) already follow.

`"overdue"` is the sharpest case: it is derived from `(dueDate, today)` and
**never written**. A stored overdue flag would need something to write it, which
means a schedule silently rots while a device is closed, and two devices
disagree about a plan neither of them touched. The three stored payment states
are only the ones a user action can cause: `upcoming`, `paid`, `cancelled`.

### Two flat collections, not payments nested in the plan

`mergeArrayByIdWithChild` exists and would have fit the shape, but both sides
here are edited independently — one device records a payment while the other
edits the plan's name — and each payment links to its own expense row. Flat
id-keyed collections merge per record with `mergeArrayById`, which is what that
usage actually wants. `owner` is duplicated onto the payment on purpose so every
read filter is a direct field test and a payment is never resolvable only
through a tombstoned parent.

### Early payoff: one transaction, and cancelled rows keep their history

Represented as **one** expense row carrying `installmentId` + `installmentPayoff:
true` (no `installmentPaymentId` — it settles no single payment), plus the
unpaid rows marked `status:"cancelled"`, `cancelledBy:"payoff"` and
`payoffExpenseId:<that row>`. The alternative — one ledger entry per cancelled
payment — would triple-count money that moved once.

The cancelled rows **keep their original `dueDate` and `scheduledAmount`**. That
is what makes "early payoff removes future planning but preserves history" a
single rule rather than two: the rows drop out of `derivedInstallmentRowsFor`
because they're cancelled, so future Budget periods lose them, while the
schedule sheet can still show what the deal originally was. Storing
`payoffExpenseId` on each one is what lets deleting the payoff transaction
reopen *exactly* the set it closed instead of guessing from status.

### Installment payments are Transfers out, not spend

The ledger row is an ordinary `isTransfer:true` expense whose `catId` is the
installment id — deliberately the same shape a goal contribution already uses
(`catId` = goal id + `isTransfer`). That means `unaccountedParts` needed **no
arithmetic change**: the row falls through to `untrackedTransfers`, which is
correct, and `spentMap` ignores transfers so nothing is double counted.

For the pending UnaccountedSheet plan-vs-actual work: the *planned* figure for
the Transfers-out line is `derivedInstallmentRowsFor(...)` summed for the viewed
bucket, added to the untracked-envelope allocation. The sheet must keep counting
the **ledger** and must never read payment `status` — reading both is exactly
how the same payment gets counted twice.

### …except a payment funded from a budget category (v1.30.0)

The rule above holds for every payment that is *planned* as its own Budget line.
It does not fit the BNPL case that prompted this: with Tabby the first payment is
a downpayment taken **at purchase**, and the natural thing is to fund it out of an
envelope that already has room this month (Shopping) and let the remaining
payments become their own budget line from next month. As a transfer it was
invisible to that envelope, so "use some of my Shopping budget for it" could not
be said at all.

An optional `installmentPayments[].fundedCatId` says it. When present the ledger
row **inverts shape**:

    catId       = the BUDGET CATEGORY, not the installment id
    isTransfer  = false, so it consumes the envelope and lands in spentMap

Four things make that cheap rather than invasive:

- **Nothing reads `catId` on an installment expense.** Every reader keys on
  `installmentId`/`installmentPaymentId`. The field was almost dead weight, so
  repurposing it costs nothing and the links are untouched.
- **It is the shape v1.28.0 already chose** for untracked-category goal links:
  `catId` stays the category a person recognises, and the explicit link id is
  what *means* it.
- **`unaccountedParts` needed no change again**, for the opposite reason this
  time — `isTransfer:false` already falls through to `trackedSpend`.
- **The planned side moves in the same breath.** `derivedInstallmentRowsFor`
  marks the row `fundedElsewhere` and `installmentTotal` drops it, because that
  money is now allocated by the envelope's own budget. Counting both is the
  double-allocation the paragraph above has always been guarding against. The
  row stays **visible** — greyed, struck through, naming the category — because
  the schedule should still read complete.

`fundedElsewhere` is derived (`status==="paid" && !!fundedCatId`), never stored,
so a reopened payment stops being funded with nothing to clean up. The field is
resolved against live categories **before** the write, exactly as
`categoryGoalFor` resolves a goal link: a tombstoned category, a category
belonging to the *other owner*, or an id that never existed all degrade to an
ordinary transfer rather than being swallowed by a guard inside the writer. The
payment is still recorded either way — degrading must never lose the transaction.

Deleting or unlinking the ledger row clears `fundedCatId` along with the rest of
the paid state: a reopened payment is planned again, and leaving the mark would
keep it out of the planned total while nothing funds it. Restore re-derives it
from the restored expense (`!isTransfer && catId`) rather than from a stashed
copy, so there is no second record to fall out of step.

`fundedCatId` is **deliberately not defaulted in `migrate()`** — absent means
unfunded, the same reasoning as `goalId` and `ord`. Defaulting it would rewrite
every existing payment row and cost every device a KV write on first open.

### Deleting a plan must not delete money that moved

`applyInstallmentDelete` tombstones the plan and its **unpaid** payments
(stamped `deletedWith` so restore puts back exactly that batch), and leaves paid
payments and every expense row alone. The confirmation says so in words. Cancel
and Delete are separate actions because they answer different questions: the
arrangement fell through, versus tidying up a record.

`installmentPayments` is in `CONFLICT_COLLECTIONS` (it merges, it counts as
pending, a conflict should describe it) but in `HIDE_FROM_RECENTLY_DELETED` — a
payment tombstone is a side effect of deleting its plan, and listing a dozen of
them per plan would bury the entries a person deleted on purpose.

### The upgrade is byte-identical for anyone with no installments

`migrate()` creates both arrays on every existing document, which would normally
change `fingerprint()` and make every device look dirty on first open — one
Cloudflare KV write per device for data nobody touched, the same class of bug
the `userFingerprint()` split was introduced to fix. So `fingerprint()` emits
the two keys **only when non-empty** (`JSON.stringify` drops `undefined`), and
`installmenttest.cjs` asserts the byte equality.

### Currency is stored but pinned to `data.currency`

Expense rows have no per-row currency; every amount in the ledger is in
`data.currency`. A foreign-currency installment would therefore need an
FX-rate-at-payment-time rule and a stored rate, which is a separate design.
The field exists on the record so adding that later needs no migration, but the
picker offers one value and no conversion path is built.

## "Household" is a view, not a person — and the app half-believed both (2026-08-01)

The request was "Net worth and investment right now is combined, should be
separated." The grilling turned up that the codebase held two incompatible
meanings of `household` at once:

- For Home-tab aggregation it was a **view-only pseudo-profile**: me + wife,
  with no literal value stored anywhere.
- For investment ownership it was a **real stored `owner`**: a joint account.

Both were documented in `CLAUDE.md`, and both are still true. The mistake would
have been to build a Me/Charlene/Combined toggle on top of the second meaning
without noticing, which silently hides joint accounts from every view. The user
resolved it: **household is not a third person**, it is the combined view, and
a jointly-owned record shows up there and nowhere else.

The accepted consequence is that **Me + Charlene ≠ Combined** whenever anything
is joint. That was chosen over the alternative (joint money appearing in both
people's views, so the singles double-count) because "my view shows what is
mine" is the property worth keeping. `ownertest.cjs` asserts the inequality
deliberately, so a future "bug fix" that makes them add up gets caught.

### Why assets default to Joint

Assets and liabilities never had an owner. `ownerNetWorthSar` added the full
`assetSar` and `liabSar` to *every* profile, so per-person net worth was
inflated by the whole household's car and loans. Adding the field forces a
default for existing data, and there were only bad options:

- default to `me` — silently hands one person the other's liabilities
- ask on upgrade — a migration prompt for something the user can fix inline
- default to `household` — honest about not knowing, but each person's net
  worth visibly drops to banks + investments until they reassign

We took the third. The app never asked who owned the car, so it should not
pretend to know. Existing snapshot rows were **not** rewritten to match: they
recorded what the app actually displayed at the time, and smoothing the trend
line would be falsifying history to hide a real correction. The one-day step in
the Me/Charlene trend on upgrade day is expected.

### The profile switch is localStorage, not `data`

It would have been easy to put the selected profile in `data.settings` — it is
a user-facing toggle, which is what that object is for. But `data` syncs, and
`fingerprint` covers it, so choosing "Charlene" on the phone would both dirty
the document and change what the laptop was looking at. `data.settings` is for
toggles that change *calculation* behaviour; this changes *what you are
looking at*, which is per-device, like theme and `PROFILE_KEY`.

## The unaccounted figure was arithmetically fine and semantically wrong (2026-08-01)

"Remove salary not yet spent or transferred. Doesn't make sense also the math
where it's getting the figure."

The maths was `plan income − sum(every logged row)`, which is defensible on its
face. The defect was one row type: `addExtraFunds` writes an **ordinary
expense** with `isExtraFunds:true` — money coming *in*, earmarked for a
category. `spentMap` excludes those rows; `totalLoggedAllCats` did not. So a
spouse sending ₱1,000 for groceries raised that category's budget *and* lowered
your unspent salary by the same ₱1,000.

Worth recording because the flag-on-an-expense representation is what made it
invisible: every consumer has to decide whether an extra-funds row is income or
spending, and there was no single place enforcing that. Anything new that
reduces over `expenses` must classify `isExtraFunds` explicitly.

The second lesson is about *where* the explanation lives. The user offered
"remove it, or make it clickable with a modal showing the computation." Given
the figure was wrong, deleting it would have buried the bug rather than fixing
it. Building the explanation sheet is what forced the classification to be
written down as four named buckets that provably sum to the total — the sheet
could not be made to reconcile against the old maths, which is how the sign
error surfaced. **A number that resists being explained is usually wrong.**

Note the sheet computes from raw `viewMonthExpenses`, not from `totalSpent`:
`envelopes` drops categories whose effective amount is ≤ 0, so spending against
a zero-budget tracked category is real but absent from `totalSpent`. Deriving
the breakdown from the display figure would have made the sheet disagree with
its own headline.

## A decorative chart is not free (2026-08-01)

The Budget donut had no `onClick`, no `activeIndex`, no `<Legend>`, no selected
state — a `<Tooltip>` and nothing else. It occupied a 190px card next to the
legend that carried the actual numbers, and it was the only use of `PieChart`,
`Pie` and `Cell` in the file.

Replacing it with a stacked proportion bar kept the one thing the donut
genuinely conveyed (relative size, at a glance) while returning the space and
letting the legend go full width — which made room to show amounts alongside
the percentages, information the donut's tooltip only gave one slice at a time.
The Recharts dependency stays regardless; five other charts use it.


## The move feature was built at the wrong level, twice over (2026-07-31)

The user asked for a way to move things between the fixed sections of their
budget. What shipped in v1.11.0 moved **sub-items between categories**. What
they meant was moving **categories between groups**.

The mistake is worth recording because the information needed to avoid it was
already written down. `current-status.md` had, from the Budget scrolling work:

> The user's "5 categories, each with subcategories, 21 subcategories total"
> maps to the app's **5 groups and 21 category rows** — not the app's `subs`
> feature, which they barely use (17 of 19 demo categories have no subs).

That note was used to decide what stays on a collapsed row, and then not
applied when the same words came up again for the move feature. **A recorded
terminology mapping only helps if it's re-read when the same vocabulary
reappears, not just when it's first written.** The tell was available in the
data too: a feature aimed at `subs` was being built for a plan where 17 of 19
categories have none.

The corrected feature is strictly simpler, which is itself a signal the level
was wrong. Moving a category between groups is a pure `groupId` change:

- A category owns its `amount`, `subs` and `trackExpenses`, and everything that
  references it — expenses, targets, envelopes, quick transfers — keys on the
  **category id**. Nothing keys on `groupId` except rendering.
- Group totals are derived sums, so they just re-add. No money can be created,
  destroyed or reinterpreted.

So the entire class of hazard the sub-item version had to defend against — the
manual-amount-vs-sub-sum trap in both directions, seeding a destination,
zeroing an emptied source — **does not exist at this level**. All of that
machinery was deleted rather than ported.

The one genuine coupling is `investTarget.groupNames`, which keys on group
*names*: moving a category into or out of a named group changes the Invest &
Grow figure. That's usually the intent, so the destination sheet states it per
group rather than blocking it.

Display order inside a group is array order, so moved categories are appended —
they land at the end of the destination group instead of interleaving at
whatever positions they held in the source.

**Note for anyone reading the old entry below** ("Sub-items have no external
references, so moving one is free"): its analysis is still correct and still
worth keeping — it's why storing a sub id anywhere is still off-limits — but
the feature it justified no longer exists.

## A period's identity is its payday; its boundaries are what actually happened (2026-07-31)

The obvious model for "salary arrived on the 24th instead of the 28th" is to
key the period by its real start. That is wrong in a way that only shows up
later: every expense, plan mapping and trend bucket points at a period *key*,
so changing the key when a period is corrected orphans all of them, and
correcting it twice orphans them twice.

So `payday` stays the identity function forever and `actualStarts` records
reality where it differed. `shiftPeriod` is deliberately pure payday arithmetic
— the period after `2026-08-28` is `2026-09-28` however early it began — while
`periodRange` consults the overrides. Identity and extent are different
questions and are answered by different code.

This was also chosen over a simpler one-shot "shift the current period" flag,
which **cannot be read backwards**: past periods would recompute from
`payday = 28` and silently re-render a 24-day August as a normal month forever.
A dated map is the only shape that keeps history true.

Related: a period runs from its own real start to the day *before the next
period's* real start. Defining it that way (rather than storing an end) is what
makes a single edit resize both neighbours and keeps them contiguous by
construction — there is no way to store a gap or an overlap.

## The indirection that was already there paid for this feature (2026-07-31)

The scoping note warned that `periodStartFor`/`periodRange`/`periodKeyFor`/
`periodLength`/`shiftPeriod`/`bucketProgress` all took a bare `payday` and that
changing them "touches every call site". It turned out to touch **one**.

The `bucket*` wrappers already took `(payPeriods, owner)` and already looked up
the owner's config — they simply passed `cfg.payday` down and threw the rest
away. So the change was to pass `cfg` instead. Every view calls the `bucket*`
layer, so every view got corrected boundaries for free.

Worth recording as a general observation: **a wrapper that already receives the
whole config is the cheap place to add config-dependent behaviour later**, even
when it currently forwards only one field. The cost of the original
indirection, which looked redundant, was repaid entirely by this one change.

The one exception — `BudgetView`'s envelope depletion-date — was calling
`periodRange` directly with `payPeriods[owner]?.payday`. That it was the *only*
such call is why the risky part of this feature was mechanical.

## An override map needs a fast path, or every expense pays for a feature nobody uses (2026-07-31)

`periodKeyFor` runs for every expense row on several tabs. Making it
override-aware means asking "which period's real range contains this date?",
which needs up to three range computations instead of one piece of modular
arithmetic.

Since a moved boundary can only ever push a date into an adjacent period —
validation forbids an override crossing a whole period, which is what makes the
three-candidate scan sound — the scan is bounded. But it still costs three
times as much for owners who have never corrected anything, which is everyone
until they do.

So an empty (or absent) `actualStarts` returns the nominal answer immediately.
That also makes the migration a genuine no-op rather than a no-op-shaped
behaviour change, and it's why clearing an override **deletes the key** instead
of writing back the nominal date: a map full of "corrections" that happen to
equal the payday would silently switch every owner onto the slow path and lose
the guarantee that untouched data behaves exactly as before.

## Auto-advance stays; the button only corrects (2026-07-31)

The request was "never auto-advance, the period changes only when I press the
button." That was talked down to keeping auto-advance and making the control
corrective only, because the two designs differ in what happens when life gets
busy:

- **Button-only**: forget to press it and you are stranded in a stale period.
  Every figure on Home is quietly wrong, and nothing says so.
- **Auto-advance plus corrections**: forget to press it and the period rolls
  over on payday as it always did. The failure mode is "nothing happened"
  rather than "the budget is lying."

The corrective design does everything the button-only design does — it just
doesn't depend on the user for correctness. That is the whole argument.

`pending` ("hasn't arrived yet") is the one state that can go stale, since it
holds the previous period open until resolved. It's bounded by the card
continuing to prompt while it's set, and by Undo always being present.

## The sheet shows what will move, because a boundary silently re-buckets money (2026-07-31)

Moving a period start doesn't just relabel a date range — it changes which
period real, already-logged expenses belong to, and therefore which budget they
count against. That consequence is invisible in a date picker.

So `SalaryArrivedSheet` previews the new boundaries, the new length, and the
**count of logged expenses that would move into the period**, before anything
is committed. Same principle as `UpdateBalanceSheet`'s running preview and the
sub-item move sheet's before → after: if an action silently rewrites where
existing records live, the UI has to say so first.

It also states "Budget amounts don't change — the daily allowance adjusts
instead", because the natural assumption about a 24-day period is that it gets
24/31 of the budget. Not pro-rating is deliberate (it's what stops Home reading
an early payday as overspending), so it has to be said rather than discovered.

## Bank interest is derived from an anchor, never incremented into the balance (2026-07-31)

The obvious implementation is "each day, add today's interest to the balance."
It was rejected before any code was written, and the reasons generalise to any
value that grows with the clock:

- **Two synced devices double-count.** Both phones would apply the same day.
- **A day the app isn't opened is lost forever**, because nothing runs to add
  it. The figure silently under-reports and never catches up.
- **Undo stops being sound.** Reverting an edit can't know which part of the
  balance was typed and which part was accrued into it.

Recomputing from `balance` + `balanceAsOf` on every read has none of those
failure modes: it's idempotent, so both phones agree after any gap, and the
stored figure keeps its plain meaning — the last number a person typed.

Two consequences that made this cheap rather than merely correct:

- **The exponent is a whole number of days**, so the value is constant within a
  calendar day. The history/snapshot effects can't see it move mid-session and
  loop — the failure mode the bills reconciler had to be careful about.
- **Nothing is written**, so accrual can't dirty the document. Combined with
  the existing `auto:true` stamping, a bank quietly earning interest costs zero
  Cloudflare KV writes. An incrementing design would have cost one per day per
  device.

**The reciprocal rule: anything that moves money must settle first.** A deposit
added to the stale stored balance would then have the *whole* elapsed period's
exponent applied to money that arrived today. So `recordMp2Payout`,
`transferTdProceeds`, the inline balance field and all three modes of the
Update sheet go through `settledBankPatch()` — fold in the accrual, re-anchor
to today, then apply the delta. A derived value is only safe if every writer
knows it exists.

## A backfilled anchor date must be inert until something re-stamps it (2026-07-31)

`migrate()` backfills `balanceAsOf` from `updatedAt`, per the project rule that
every new field on an existing record type needs a default. But `updatedAt` is
a poor proxy for "when was this balance confirmed" — it also moves on a rename,
and `migrate()` itself sets it to a year-2000 sentinel on records old enough to
predate it.

The backfill is safe only because `interest` defaults to `null`, so the anchor
is never read. The moment it *is* read — when someone enables interest — the
toggle re-stamps `balanceAsOf` to today. Without that, flipping the switch on
an old account would have invented 26 years of compounding in one render.

Worth generalising: **a default that is meaningless-but-harmless while unread
becomes a bug the instant a feature starts reading it.** The fix belongs at the
transition (the enable handler), not in the migration, because migration can't
know which records will later matter.

## Interest tiers are whole-balance, and the UI has to say so (2026-07-31)

Maribank PH applies one rate to the entire balance based on which tier the
balance falls in — 3.25% below a million, 3.75% at or above it, on *all* of it.
Marginal tiering (the tax-bracket model, where each slice earns its own rate)
is the more common convention and produces a materially different number on the
same inputs.

Since the data shape `[{from,rate}]` is identical under both readings, nothing
about the stored config reveals which one is meant. So the editor states it in
plain language above the rows. A configuration format that can be read two ways
needs the reading written down where it's edited, not only in a code comment.

Related, decided in the same pass: a balance below every configured tier floor
earns the *lowest* configured rate rather than nothing. A list starting at
1,000,000 means "above a million you get more", not "below a million you get
zero" — and returning zero there would look like the feature was broken.

## Accrual is always an estimate, and only ever "since you last confirmed" (2026-07-31)

The user asked, secondarily, how much interest they were earning. The app
cannot answer the lifetime version of that question: after a reconcile it has
no way to separate credited interest from a deposit, so the difference between
the estimate and the real figure is unattributable.

Two options were weighed. Assume the estimate was right and book the remainder
as a deposit — which would fabricate a number and quietly corrupt a "lifetime
interest" total forever. Or report only accrual *since the last confirmation*,
and say exactly that. Chose the second: the card reads `≈ 203.14 accrued since
Jul 12 · est.`, naming both the estimate and its starting point.

**No net-worth toggle**, unlike `includeMp2EstimateInNetWorth`. That toggle
exists because an MP2 estimate can swing net worth by tens of thousands; a few
days of bank interest is pocket change. A settings switch per estimate would be
cargo-culting the earlier decision rather than applying its reasoning.

## Audit the real data before "fixing" it (2026-07-31)

A follow-up was logged to sweep pre-existing orphaned categories out of the
live data. The obvious move was to write the sweep and run it. Instead the KV
blob was pulled **read-only** first (`GET /sync`, backup kept) and audited:
**zero orphans in all 24 plans.** The repair would have been a no-op dressed up
as a fix, on a live financial dataset, for a condition that didn't exist.

Two things that fell out of doing it in that order:

- The first pass reported a "discrepancy" of −1.8e-12 — floating-point noise
  from summing decimals, not an orphan. **Structural checks that compare two
  computed sums need an epsilon**, or they invent problems.
- The audit found the *actual* defect: 16 of 24 plans referenced by nothing,
  including six all named "September 2026" with six different totals. That —
  not orphaned categories — is the best explanation for the original "some
  amounts differ" report, and it was already fixed by switching the picker to
  months.

The guard still shipped, for a reason the audit also clarified: the fix lives
in `clonePlanForMonth`, but the user's other devices keep running the old build
until they update, and can still create an orphan and sync it here. **A
data-shape guard in `migrate()` earns its place when other clients can still
produce the bad shape**, not merely when the current build once could.

Because `migrate()` runs on every load, the guard has to be idempotent —
reusing an existing `Ungrouped` group rather than appending one per run. It was
verified as a byte-identical no-op against the real blob before shipping, which
is the cheapest possible proof that a migration is safe.

## Derived collections must reconcile, not only generate (2026-07-31)

`data.bills` is a snapshot layer over `household.expenses`. The generator was
written as "create the rows that don't exist yet" — idempotent, and therefore
looked correct. It wasn't: nothing in the app ever *un*-created a row, so
un-ticking "Track in Bills" was invisible to Bills and to the reserve, and the
`already.has(it.id)` guard that made creation idempotent also blocked every
later name/amount edit from reaching the row.

The rule: **anything derived from a live source has to reconcile the full set
each pass — create, update, and retire — not just fill gaps.** A create-only
generator silently encodes "the source only ever grows."

Two carve-outs are deliberate rather than accidental, and both come down to the
same question — *is this row a projection or a record?*

- A bill with `paid > 0` is a record. Untracking must not delete it.
- `allocated` is a projection while unpaid and a record once paid. So it
  resyncs from Household until the first payment, then freezes. The item's
  *name* is a label, never a record, so it always follows.

The mechanical constraint: the reconciler runs in an effect via `setDataRaw`,
so it must return the **identical object** when nothing changed. Returning a
fresh `{...d}` every pass loops, and (because the pass is background-derived)
would dirty the document and fire the idle autosave on every app open.

## "Which month's budget?" is a question only `planForMonth` can answer (2026-07-31)

A month's budget is a whole *plan record* reached through the `monthlyPlans`
mapping, and `removePlanForMonth` tombstones only the mapping — the plan record
lives on. So `data.plans` accumulates orphans, several of which carry the same
`name`/`month` label ("June 2026") because `clonePlanForMonth` overwrites both
with the destination label.

Both copy pickers listed those records. That made the source list simultaneously
too long (orphans indistinguishable from the live plan) and too short (a
carry-forward month has no record at all, so it couldn't be picked). Users
picked a plausible twin and got different numbers.

The fix is to make the picker ask the same question the tab asks: enumerate
*buckets* and resolve each through `planForMonth`. **If a view renders through
a resolver, anything that offers to copy that view must go through the same
resolver** — otherwise the list and the thing it claims to describe drift apart.

## An id that resolves to nothing should fail, not fall back (2026-07-31)

`clonePlanForMonth` did `plans.find(p=>p.id===sourcePlanId)||plans[0]` and then
stamped the requested `owner` on the result. When the id didn't resolve — a
plan soft-deleted locally, or tombstoned by a sync from another device — it
copied the *global* first plan, frequently the other owner's, and the output
looked entirely legitimate. Same shape at the Expenses-tab caller.

A silent fallback is only safe when the fallback is *equivalent*. Here it was
arbitrary. Returning `null` and doing nothing is strictly better than
fabricating a plausible wrong budget.

Related, in the same function: `source.groups.map(...)` had no null guard,
and `migrate()` guarantees neither `groups` nor `categories`. The throw
happened *before* `setData`, so the failure mode was "the button does
nothing" — no error, no copy. Guard array access on any record shape
`migrate()` doesn't backfill.

## A category's `amount` is manual only while it has no subs (2026-07-31)

`effectiveAmt` reads the sub sum the moment `subs.length > 0`, so `c.amount` is
a cache in that state and a user-entered figure otherwise. Every path that
changes whether a category *has* subs is therefore a path that can silently
destroy or resurrect money:

- **Emptying a category** — `syncAmt` returns the category untouched at zero
  subs, so the last sub-sum stays in `amount` and becomes live again as a
  manual value. The move feature zeroes it explicitly.
- **Filling an empty category** — the manual amount stops being read at all.
  Moving SAR 820 into a manual SAR 4,200 "Bills" made it SAR 820. The move
  feature seeds a sub named after the category to carry the old amount, so the
  total is 5,020 as the preview promises.

The same trap exists on "Add sub-item" (adding the first sub drops the manual
amount to whatever you type). That is long-standing behaviour that users may
be relying on as a way to re-plan a category, so it was left alone — but any
*new* code path that changes sub count must decide this question explicitly.

## Sub-items have no external references, so moving one is free (2026-07-31)

Before building the move feature, every reference to a sub id was traced: there
are none outside the `subs` array itself. Expenses (`catId`), targets
(`categoryAlloc`), envelopes, quick transfers, per-envelope trends and Home's
spending cards all key on the **category** id; `savingsInvestingFor`,
`homeSettings.savingsCategories` and `investTarget.groupNames` key on **names**.

A sub is a pure arithmetic breakdown of its category's amount. That's what made
plan-wide multi-select cheap — no remapping, no migration, one `setCatsFor`.
It's also worth re-checking before anything starts storing a sub id, because
that assumption is currently load-bearing.

## A grep for `type="number"` cannot find every numeric input (2026-07-31)

The v1.5.1 sweep converted 38 fields to `NumField` and verified "zero
`input[type=number]` in the live DOM" — but two fields survived: the trade
modal built its inputs from an array,
`[["date","Date","date"],["shares","Shares","number"],…].map(([k,label,type])
=> <input type={type} …>)`. The literal string never appears in the source, and
the DOM check passed because the modal was closed when it ran.

Two lessons, both now in `CLAUDE.md`: grep for `<input type={` as well as the
literal, and when auditing modal contents, open the modal first — a DOM sweep
only sees what is mounted.

## Collapsed rows are for scanning; the chevron is for editing (2026-07-31)

The Investments account cards were the strongest case yet for the split first
made in Budget: an MP2 card rendered ~10 stacked blocks, ~300px, every field
permanently in edit mode. You cannot skim a list of accounts when each one is
a form.

The rule applied across Budget, Home Goals and now Investments: **the
collapsed row carries what you scan by; everything you occasionally change
lives behind the chevron.** Two constraints keep it honest:

- **Anything needing action stays visible.** A matured Time Deposit shows
  "Matured — confirm it" in red on the collapsed row, because hiding a
  call-to-action behind a chevron means it never gets done.
- **Validation errors surface as a marker on the collapsed row** (a red `!`).
  Collapsing must never make a broken record look fine.

## One composition chart, parameterised (2026-07-31)

Investments needed the same "what's driving it" chart Net Worth got a build
earlier. Rather than copy it, `CompositionRangeChart` gained a `series` prop
with dot-path keys, so Net Worth passes banks/investments/assets/liabilities
and Investments passes `byType.{stocks,mp2,td,gold}`.

This also let the standalone "Gold value over time" card be deleted — gold is
one band of the composition, which is more useful than an isolated line and
one card shorter. The `negate` flag (rather than a hard-coded liabilities
check) is what keeps the separate-stack rule general: any series can be sent
below the axis, and only Net Worth currently uses it.

## Net Worth's second chart answers a different question (2026-07-31)

The tab had two charts of net worth over time — one from daily `snapshots`,
one from monthly `history` — stacked on a single screen. The user read this as
"boring and repetitive", which it was: a second view of the same number adds
nothing except height.

The replacement had to justify its own space, so it answers the follow-up
question the first chart provokes: *it went up — because of what?* Every
snapshot already stores `banks`, `investments`, `assets` and `liabilities`
alongside `net`, so a composition-over-time chart needed no new capture and no
schema change. It reuses `RANGES`/`bucketSnapshotsForRange` rather than
inventing a second range mechanism, so both charts' pills behave identically.

Rejected: deleting the second chart outright. The card it lived in also owns
the snapshot management UI (force refresh, add past entry, delete chips), so
the card had to stay; leaving it chartless would have been a straight
subtraction rather than an improvement.

**Stacking gotcha, recorded because it looked right and wasn't.** Negating
liabilities and giving them the *same* `stackId` as the assets makes Recharts
accumulate: the debt band draws downward from the top of the asset stack, so
the visible top edge is gross assets and the band's lower edge is net worth.
The arithmetic is right, the reading is wrong — and it contradicted the card's
own caption. Liabilities now get their own `stackId`, putting assets above the
axis and debt below it. Worth remembering generally: with mixed signs in
Recharts, a shared stack id means "sum these", not "draw these on opposite
sides".

Series that are zero across the whole range are dropped from the chart and the
legend, so a household with no liabilities doesn't carry a permanent zero
entry — the same "don't render something with nothing to say" rule the Home
trend cards follow.

## Home's Goals card lists every goal, capped (2026-07-31)

Showing a single goal was a deliberate earlier choice — the schema has no
priority field, so the card picked the goal closest to completion as a proxy.
In practice that was the wrong trade: with two goals you only ever saw one,
and a third would have changed which one appeared rather than showing more.
Reversed: every active goal gets a compact row.

The interesting constraint is that Home is a dashboard, so "show everything"
and "stay glanceable" pull against each other. Resolution:

- **Cap at 4 rows + "+N more goals".** Bounded height, and nothing is hidden
  without saying so. An uncapped list recreates exactly the runaway-scrolling
  problem just fixed on Budget; an inner scroll region was rejected as fiddly
  on a phone and used nowhere else in this app.
- **Ordering stays derived** (closest to completion first) rather than adding
  a `priority`/`order` field. A new schema field would need a `migrate()`
  default, conflict-merge behaviour and UI to set it — a lot of machinery for
  ordering four rows on one card.
- **Completed goals stay a header count.** They need no action; a dashboard
  card should spend its vertical space on what does.
- **Bars, not rings.** Rings match the Goals tab, but a name under a 48px ring
  truncates to ~7 characters, and a wrapped block of rings is harder to scan
  than a list. Bars also reuse `liquidFillBg()`/`.liquid-fill`, the progress
  language already used in four other views.
- **Owner suffix only in Household.** Both people have an "Emergency Fund", so
  merged rows were ambiguous — but on a single profile the owner is implied and
  the suffix would just be noise competing with the name for width.

## Home answers questions; it does not display figures (2026-07-31)

The redesign brief was six questions, not six cards — and four of the six
already *had* cards. What was missing was the judgement: every card showed a
number and left the user to decide whether the number was good. So the change
is one shared `Verdict` line per card rather than new cards or new charts.

Three judgement calls in the verdicts themselves:

- **Spending is judged on pace, not on percentage used.** "60% of budget
  used" is meaningless without knowing where you are in the period. The
  verdict projects the current burn rate to the period end using
  `bucketProgress`, and only then decides. It stays silent for the first two
  days: a single large shop on day 1 projects to a disaster and would make
  the card cry wolf every period, which trains you to ignore it.
- **Goals are judged on movement, not lateness.** The goal schema has no
  target date to be late against (dated projections live in TargetsView), so
  the honest question is whether anything is carrying a goal forward — i.e.
  whether `monthly` is set. A goal with no monthly amount will look identical
  next month, and that is what the verdict says.
- **"Saving enough" required inventing a benchmark.** There was no target in
  the data model, and a rate with nothing to compare against cannot answer
  the question. `data.settings.savingsTargetPct` (default 20) is that
  benchmark — deliberately in `data.settings` per the convention for
  calculation-affecting toggles, and deliberately display-only.

## Trend cards ship dark rather than showing "not enough data" (2026-07-31)

Two of the six questions — lifestyle creep and savings improvement — need at
least three completed periods. Expense tracking here began July 2026, so both
cards were written, tested, and then shipped rendering **nothing**.

The alternative, a card reading "not enough data yet" until October, is
exactly the decoration the redesign set out to remove; the user had already
rejected that shape when it was offered as an option. They self-activate at
`MIN_TREND_BUCKETS`.

Two consequences worth knowing:

1. **They cannot be verified by looking at the app**, so they are covered by
   `trendtest.cjs` instead — real functions sliced out of `index.html` and run
   under `vm`, plus a one-off synthetic-history injection to watch them render.
   That is weaker than production data; re-check when they light up.
2. **A null card must not leave a grid gap.** Because these cards decide for
   themselves whether they have anything honest to say, `HomeView` cannot know
   in advance whether a wrapper is needed. `.home-cell:empty{display:none}`
   makes the wrapper follow the card instead of duplicating its conditions —
   which also covers any future self-suppressing card.

The history helpers deliberately reuse `trackedSpendingFor` and
`savingsInvestingFor` with an added optional `bucket` argument rather than
growing a parallel per-month reduce, so a past period can never be scored by a
different rule than the current one. The in-progress period is excluded for
the same honesty reason: a period four days old always looks like a spending
collapse, and comparing against it would report an improvement that is not
real.

## What stays on a Budget row, and what goes behind the chevron (2026-07-31)

The category row had to shrink from three wrapped lines to one, so something
had to leave it. The deciding question was **what gets touched monthly**, and
the answer needed the user's own terminology decoded first: their
"5 categories with 21 subcategories" is the app's *5 groups and 21 category
rows*, not the app's `subs` feature. So the monthly sweep edits **category-row
amounts** — those stay on the row, along with the name you scan by.

Moved into the panel: the Tracked toggle and Delete. Both are occasional, and
critically **the row already signals tracking state without the pill** — an
untracked category renders its name italic and greyed, which was verified
rather than assumed. So the pill was redundant with styling that was already
there.

Dropped below 768px: the per-row `%` and the currency code. Both are
duplicated elsewhere (the "Where your income goes" card; the group total and
income line), and together they were worth ~70px of category-name width —
the difference between "Long Term Savings" fitting and truncating.

Rejected alternatives:
- *Collapse categories by default.* This was the original plan until the user
  said they "sweep through and touch most of them each month" — collapsing
  would have added a tap to the exact task being complained about.
- *Two lines, nothing moves.* Safe, but leaves a 40px near-empty control
  strip under every category and only reaches ~3,520px instead of 2,777px.
- *One line with everything visible* (icon-only Tracked, no %). Same height,
  but squeezes names to ~98px so they truncate mid-word while scanning —
  which defeats the point of a list you navigate by name.

## `overflow-x:hidden` belongs on `<html>`, never on `<body>` (2026-07-31)

Worth recording because it silently disables a whole CSS feature. `html,body
{overflow-x:hidden}` looks symmetrical and harmless, but per spec an element
with `overflow-x:hidden` and `overflow-y:visible` computes its y axis to
`auto` — so `body` became a **scroll container** reporting `hidden auto`.
Every `position:sticky` descendant then resolved `top:0` against body's
scrollport, which is the full document height, so sticky never engaged.

The root element's overflow propagates to the viewport, so `html` alone still
clips horizontal overflow — the rule simply does not belong on `body`. The
first sticky group-header attempt appeared to "just not work" with no error
and no clue in the markup; the giveaway was walking the header's ancestor
chain and finding body's computed overflow.

## Five tabs in a bottom bar, five behind More, one retired (2026-07-30)

Which tabs are primary was decided from **actual weekly use**, not from what
the data model contains. The user named Home, Budget, Expenses, Investments
and Net Worth as their weekly tabs, then added Banks back as a priority —
six candidates for five slots.

**Net Worth lost the slot**, because Home's whole job is now answering "how
rich am I", which makes the Net Worth tab a drill-down rather than a daily
destination. Home already links into it (`onOpen={()=>setTab("networth")}`),
as it does for Goals, so demoting both cost nothing in reachability.

Rejected alternatives:
- *Six tabs in the bar.* 65px cells at 390px; it fits, but it breaks the
  five-max convention and leaves no room for a More affordance.
- *Demoting Investments instead.* Net Worth already includes investments in
  its totals, so on paper Investments is the detail view — but it is also the
  tab with the most content, and the user opens it weekly.
- *Demoting Banks.* Briefly considered and reversed: `UpdateBalanceSheet` had
  just shipped (v1.5.0) specifically to make bank balances easy to update, so
  putting Banks two taps deeper would have undone that work days later.

**Forecast was retired to nowhere, not to More.** The user asked for the tab
gone but the code kept. It now has no nav entry at all, which means
`TargetsView` is unreachable from the UI while `data.targets` still syncs,
still merges, and still appears in Recently Deleted. That is deliberate: a
`HIDDEN_TABS` list documents it, and restoring the tab is a one-line change
if it is ever wanted back. Deleting the view would have orphaned saved
records and meant a `CONFLICT_COLLECTIONS` change for no user-visible gain.

**A section title was added above the tab content.** Bottom bars label
destinations in ~10px type, which is enough to navigate by and not enough to
stay oriented by after scrolling — the old top nav doubled as a "you are
here" marker, and removing it would have lost that for free.

## What "more graphical" turned out to mean (2026-07-30)

Worth recording because it changed the plan: the user's opening ask included
"more graphical, but the right amount." Every time that was probed they named
a *question* they wanted answered — how rich am I, is my lifestyle creeping,
am I overspending — and never a visual they wanted added. Offered a concrete
new chart (balance-over-time on Banks) they declined it as something they
would only scroll past.

So the goal was restated as **"Home doesn't answer these questions, so it
reads as decoration"**, and "add charts" was dropped as an objective. Charts
are justified per-question from here on. The existing distribution supports
this reading: Investments already has five charts and Bills/Banks/Currency
have none, so a global "more graphical" instruction would have been aimed at
the wrong places anyway.

## One `NumField`, not 32 local fixes (2026-07-30)

The controlled-`type="number"` bug (`Number("")===0`, so a cleared field
writes `0` back) existed at 32 call sites. Options considered:

1. **Patch each site** with a local string-draft `useState`. Rejected — the
   app already had this pattern hand-rolled at six sites (Budget cat/sub,
   Household, Bills, Banks) with three slightly different spellings of the
   same `onBlur`/`onKeyDown` pair, and none of them had select-on-focus. More
   copies meant more drift.
2. **Uncontrolled inputs with `defaultValue` + `onBlur`.** Rejected — several
   fields are driven from outside (a cloud sync pull, a month switch in
   Budget, a profile toggle), and an uncontrolled input would keep showing a
   stale figure after those.
3. **One `NumField` component.** Chosen. It also let the six hand-rolled
   sites collapse into the same component, which is how `BillsView` lost its
   `openingDraft` state and resync effect.

Three judgement calls worth recording:

- **Blur-on-empty restores the previous value rather than writing 0.** An
  emptied box is almost always mid-edit, not an assertion that the figure is
  zero. Writing `0` is the behaviour that caused the original complaint. To
  actually set zero you type `0`. Fields where "unset" is genuinely distinct
  from "zero" pass `allowEmpty` and commit `""`.
- **`live` exists only because of `disabled={!valid}` submit buttons.** A
  blur-only commit is better everywhere else (it avoids writing junk to the
  data model on every keystroke, which the old Budget rows did — they stored
  the raw *string* mid-typing). But a disabled button doesn't reliably fire
  the field's blur when tapped, so a blur-only commit in the MP2/TD modals
  would leave a filled box next to a dead button. The currency converter uses
  `live` for the same class of reason: its result is rendered outside the
  field.
- **Clamping is opt-in per field, and karat is deliberately unclamped.** The
  gold card renders "Karat must be between 1 and 24" as a validation message;
  clamping on commit would make that message unreachable and silently rewrite
  the user's entry instead of telling them it was wrong.

## Two fingerprints: one for "are the bytes different", one for "did a person change something" (2026-07-30)

`fingerprint()` was doing two incompatible jobs. For conflict detection and
the sync baseline, raw bytes are exactly right — auto-captured `history`/
`snapshots` rows genuinely need to merge across devices, and a comparison that
ignored them would let one device's snapshot history silently replace
another's on the `localFP===remoteFP` fast path. But for the *dirty flag*, raw
bytes were wrong: a background quote refresh recomputes derived history and
snapshot rows, which made merely opening the app look like an edit and spend a
Cloudflare KV write.

Three options were considered:
1. Make `fingerprint()` itself ignore auto rows. Rejected — it would change
   conflict semantics, and the `localFP===remoteFP` branch keeps local
   wholesale, so a remote device's snapshot rows for days this device never
   saw would be dropped.
2. Keep a second parallel *fingerprint string* baseline
   (`lastCloudUserFPRef`) alongside `lastCloudSnapshotRef`. Rejected — it
   would need setting at all five places the baseline is assigned, plus a new
   field in `syncMeta` for the reload path. Five chances for the two baselines
   to drift apart.
3. **Chosen**: keep one baseline, and compare against the last-synced *data
   object*, which the app already caches for `PendingChangesModal`
   (`LAST_SYNCED_DATA_KEY`). `userFingerprint(local) !== userFingerprint(base)`
   needs no new persisted state at all — just an in-memory memo of the parsed
   object so the 450ms-debounced check isn't re-parsing the dataset.

The dirty flag requires *both* conditions. If no baseline object is cached yet
(brand-new device), it falls back to the plain byte comparison — under-
reporting a real pending edit is the one failure mode worth avoiding
absolutely, so the ambiguous case errs toward "dirty".

`auto:true` is the discriminator because the two background effects already
stamped it, and the manual paths (`captureSnapshot`, `addPastSnap`) already
didn't. No migration was needed.

## Bank balances get an Add/Subtract/Set sheet rather than a smarter inline field (2026-07-30)

The inline balance input supported math expressions (`evalMathExpr`), so
`12400+500` already worked in principle — but on a phone you still had to
select the existing text, delete it, and retype the whole thing first, which
is the actual friction. Options weighed were: inline `+`/`−` buttons (fast for
deposits, but leaves no "replace" affordance, so the cumbersome path survives
for corrections); a single signed field where `+500`/`-120`/`12900` infer the
operation (fewest controls, but a dropped sign silently *replaces* a balance
instead of adding to it); and a per-account adjustment audit log mirroring
`billAdjustments`.

Chose the explicit three-mode sheet: the mode is never inferred, and the
running preview shows the exact figure to be written before it's committed, so
a wrong mode or a mistyped amount is visible rather than destructive. It also
adds no fields to the data model, so it can't affect sync or merge behaviour —
the audit-log variant would have needed a `migrate()` default and a new
id-keyed collection. That remains the right follow-up *if* an audit trail is
actually wanted; this sheet is a strict subset of it.

## Household Bills — a layer on top of Household, not a second budget (2026-07-28)

### Bills has no independent item setup by design
The brief was explicit: Bills must not duplicate bill definitions. So
`data.bills` records only ever reference an existing `household.expenses`
item (`itemId`/`itemName` snapshot) — there's no "add a bill" flow in the
Bills tab itself, only a `trackInBills` toggle on the Household item. This
keeps Household as the single place a bill's name/amount/existence is
edited, matching the existing convention that Household is a thin
bill-splitting ledger, not a second parallel budget module.

### Monthly bill records are snapshots, not live references
`allocated` is copied from the Household item's `amount` at generation
time and never re-read afterward, even if the Household amount changes
mid-month or in later months — otherwise editing this month's rent in
Household would silently rewrite January's already-closed Bills history.
This is the same "snapshot now, never re-derive" pattern the app already
uses for MP2 dividend-rate-at-contribution-time and TD maturity snapshots.

### Bills Reserve is a formula over three additive sources, not a single mutable counter
`computeBillsReserve(data) = openingReserve + Σ(allocated−paid) + Σ(adjustment
amounts)`, recomputed on every render rather than stored as a running
total. A stored running total would need a mutation path for every one of
{generate month, edit paid amount, edit status, adjust reserve, edit
opening reserve} to stay consistent, and any missed path (or a merge from
another device) would silently desync it from its own history. Deriving it
purely from `bills`+`billAdjustments`+`openingReserve` means it's always
correct by construction and the merge logic never has to reconcile it
directly — only the underlying arrays need id-based merging (already a
solved problem via `mergeArrayById`).

### "Adjust Bills Reserve" logs a delta, never a raw overwrite
The UI accepts a target balance, but what's actually written to
`billAdjustments` is `newBalance - computeBillsReserve(data)` at save time,
computed inside the `setData` updater (not from a stale render-time
closure) so a rapid double-edit or a value that changed via sync between
opening the sheet and confirming still produces a correct delta rather
than double-counting or silently dropping the difference.

### Opening Bills Reserve is directly editable, adjustments are audit-logged — deliberately different UX
The brief distinguishes "one-time baseline the user sets once" from
"corrections that must leave a trail." Making the opening-reserve field a
plain inline number input keeps setup fast (no dialog for what's usually
a single edit before first use); routing every later correction through
the `AdjustReserveSheet` (prevBalance/newBalance/amount/date/note, all
persisted to `billAdjustments`) satisfies "every manual adjustment must be
recorded" without also forcing a friction dialog on initial setup.

## Home Dashboard redesign — Phase 4 (2026-07-28)

### Savings & Investing categories are matched by name, not id
Budget categories get fresh ids whenever a plan is cloned into a new month
(`clonePlanForMonth`), but a user thinks of "Savings (Seabank)" as the same
category every month. Storing selected category **ids** in
`data.homeSettings` would silently stop matching the moment the current
month's plan is a clone rather than the original. Name is the only thing
stable across a user's mental model of "the same category," so
`savingsInvestingFor()` resolves names → this month's actual ids at call
time, per owner, per bucket — same tradeoff `trackedSpendingFor()` already
lives with for tracked/untracked category behavior.

### Savings & Investing is deliberately a second, unreconciled "investing" concept
BudgetView already has `data.investTarget` — a per-owner *group*-based
"Invest & Grow" threshold measured against **budgeted** (allocated) amounts.
The roadmap explicitly asked for a Home card driven by **actual** money
moved, at **category** granularity, chosen independently of that existing
target. Rather than trying to unify the two (different granularity: group
vs. category; different basis: allocated vs. actual-spent; different
audience: Budget-tab power users vs. a glanceable Home summary), this phase
left `investTarget` untouched and added `data.homeSettings.{savingsCategories,
investmentCategories}` as a parallel, Home-only setting. They can disagree
(e.g., a category inside the "Invest & Grow" group not also picked as a
Home "investment category") — that's accepted as a known limitation rather
than solved by a forced merge that neither feature actually asked for.

### Expenses' category filter gained array support instead of a new prop-driven UI
The spec wants every Home card's tap-through to open its detail page already
scoped (Savings & Investing → Expenses filtered to the selected categories).
Expenses' `filterCat` state was a single id/`"all"` dropdown with no external
entry point. Redesigning Expenses' filter UI was explicitly out of scope for
this phase, so instead: (1) `filterCat` now also accepts an array of ids —
one extra branch in the existing `allFiltered` filter and one synthetic
`"__multi__"` `<option>` in the existing `<select>` so it doesn't render an
invalid value — and (2) a one-shot `{catNames,nonce}` request object
(`expensesFilterRequest`, owned by `App()`) tells `ExpenseTrackerView` which
category *names* to resolve into that month's ids and apply, on mount/nonce
change. Expenses' own filtering UI, log-grouping, and transaction logic are
otherwise unchanged.

### Card visibility over drag-to-reorder
The roadmap marked custom card order "optional if lightweight." A real
reorder control (drag handles, persisted index array, interaction with the
fixed mobile-vs-desktop `order`/`grid-column` CSS per breakpoint) is not
lightweight once it has to survive both layouts without breaking the
row-pairing (Portfolio+Savings, Tracked Spending+Goals) the desktop grid
depends on. Show/hide per card (`data.homeSettings.cardVisibility`) covers
the practical want ("I don't care about Goals on Home") without that
complexity; order stays fixed and CSS-driven, same as before this phase.

## Investment module redesign — Phase 3 (2026-07-28)

### Gold ticker is `GC=F`, not `XAUUSD=X` — verified by testing against the live Worker, not assumed
The brief said "use a market gold price provider already compatible with the
project's existing cloud/API architecture" — the existing Worker already
proxies arbitrary tickers to Yahoo Finance's chart endpoint for stocks, so
the obvious zero-new-infrastructure move was to feed it a gold ticker
instead of adding a new provider. `XAUUSD=X` (the FX-style spot-gold symbol)
was tried first as the more "obviously spot price" option, but a direct
`fetch()` against the deployed Worker returned an empty quote object for it.
`GC=F` (COMEX gold futures, the conventional Yahoo Finance proxy for spot
gold pricing) was tested the same way and returned a live price. Decision:
use `GC=F`. This was caught *before* shipping by testing against the real
Worker in the browser sandbox rather than assuming the symbol would resolve
— a reminder that "the same API architecture" doesn't guarantee "the same
ticker format" for a different asset class.

### Purity entered as karat, not a raw 0–1 fraction
Gold purity is conventionally quoted/sold in karats (24K, 22K, etc.), not as
a percentage or decimal fraction — asking the user to type "0.9167" instead
of picking "22K" (or typing a custom karat number) would be translating
their mental model into the app's internal representation for no reason.
`goldValuation()` converts `karat/24` to a fraction internally; the stored
field (`hld.karat`) and the UI both stay karat-native. `purityType` ("24k"/
"22k"/"custom") only drives which UI is shown (a fixed label vs. an editable
number) — it doesn't feed the valuation math directly, `karat` does.

### Gold priced through the same `investmentValueSar()` dispatch, not a parallel reduce
Consistent with the Phase 2 decision for MP2/TD: every new investment type
adds a branch to the one shared valuation function rather than a bespoke
reduce living in `PortfolioCard`/`InvestmentsView`/Home separately. This is
why gold "just worked" in Net Worth, Home's Investments card, and Asset
Allocation the moment the branch was added — no additional plumbing needed
in any of those call sites.

### New `data.snapshots` array, additive — not a replacement for `history`/`portHistory`
The brief asked for daily/weekly/monthly progressive history with per-type
breakdowns and range-selectable charts — a genuinely different shape and
cadence than the existing monthly-only, whole-household-only `history`
(Net Worth) and `portHistory` (Portfolio) arrays, which also serve a
*different* purpose (manual past-entry logging, MoM-%-since-last-snapshot
stat) that still works fine and wasn't asked to change. Rather than
migrating those into the new shape (real risk of losing a user's manually-
entered historical entries, or subtly changing the MoM stat's behavior),
`data.snapshots` was added as a third, independent array. The two systems
never read each other; `HistoryRangeChart` only ever reads `snapshots`.
Revisit only if the duplication (two "history of net worth" concepts)
becomes confusing enough to warrant a deliberate migration — not attempted
here since the brief's scope was "add snapshots," not "replace history."

### One snapshot record holds both Net Worth *and* Portfolio figures, per profile
Rather than two separate arrays (one for Net Worth snapshots, one for
Portfolio snapshots) that would always be captured at the same moment for
the same profile anyway, `data.snapshots` rows carry `net`, `investments`,
`banks`, `assets`, `liabilities`, and `byType` all in one record keyed by
`{date, profile}`. `HistoryRangeChart` just points at whichever `field` a
given tab cares about (`net` vs `investments`). This avoids two arrays that
would always grow, compress, and merge in lockstep with each other.

### Progressive retention compresses on every write, not on a scheduled job
`compressSnapshots()` runs synchronously inside the same `setData` update
that appends/updates today's row — there's no separate cron-like sweep.
This works because the arrays stay small by construction (a handful of
profiles × at most ~35 daily + ~52 weekly + a few hundred months, tops) so
the compression pass costs nothing measurable; a background job would be
solving a problem that doesn't exist at this scale, and would be one more
thing to keep synchronized with the write path.

### Bucketing for chart ranges takes the *last* snapshot per bucket, never averages
`bucketSnapshotsForRange()` (feeding `HistoryRangeChart`) downsamples a
range's snapshots to one point per day/week/month by picking the latest
snapshot in that bucket, not an average. Every stored snapshot value is
already a real point-in-time truth (a snapshot of that day's actual
computed Net Worth/Portfolio) — averaging would fabricate a number that was
never actually true on any given day. This mirrors `compressSnapshots()`'s
own retention logic (also last-in-bucket, not averaged) for consistency.

### Home Portfolio card's mini trend now plots real per-profile data, replacing the Household-only `portHistory` fallback
Phase 1 left an explicit known gap: `portHistory` was whole-portfolio-only,
so Me/Wife profile views on Home showed no trend chart at all (documented
in Phase 1's decisions as "future phase captures per-owner history"). Phase
3's daily per-profile `data.snapshots` closes this gap directly — no design
change needed, just swapping `PortfolioCard`'s data source. Kept the card
visually compact per the brief (no range selector on Home — that's reserved
for the full Net Worth/Investments tabs).

## Investment module redesign — Phase 2 (2026-07-28)

### Confirmed vs. estimated: two independent walks, not one walk that "switches"
`mp2Valuation()` computes confirmed and estimated dividends as two separate
calls to `mp2GrowContribution()` per contribution — one whose rate-lookup
returns `null` for any undeclared year (confirmed), one that falls back to
the projection rate for those same years (estimated). This was chosen over a
single walk that compounds with "whatever rate is available, tagging each
year as confirmed or not" because in **compounded** mode that single-walk
approach would let an undeclared year's *projected* growth compound into a
*later* year that does get an official rate declared — silently baking
projected money into a number labeled "confirmed." Two independent walks cost
roughly double the arithmetic (trivial at this scale — a handful of
contributions, one MP2 account per person) in exchange for confirmed value
never depending on anything but declared rates, full stop.

### MP2 declared rates: one shared table, not per-account entry
`data.mp2DividendRates` is a single top-level array (one entry per year),
not a per-account field, because Pag-IBIG declares one official rate per
year for everyone — duplicating that entry across every MP2 account would
mean updating N places for the same fact and risking them drifting apart.
`acc.rateOverrides` (a small `{year: rate}` map) exists as the explicit
escape hatch for the rare case an account's rate genuinely differs (the
brief: "reused by all MP2 accounts unless explicitly overridden").

### Annual-payout mode dividends are a receivable, not auto-compounded, and paying them out zeroes them from the account's own value
For `payoutMode:"annual"`, `mp2GrowContribution()` is called with
`compound:false` — each year's dividend is tracked but never added back into
the base that grows. Recording a payout (`recordMp2Payout`) subtracts that
paid amount from the account's own confirmed/estimated value (the `paid`
term in `mp2Valuation`) exactly because that money, once recorded received,
either sits in a bank balance already counted elsewhere or is simply no
longer "inside" the MP2 account — leaving it in both places would
double-count real money the same way Phase 1 was careful not to double-count
goal contributions against bank balances.

### Time Deposit "closed" values at $0, not just "matured"
A TD has three statuses: `active` (still accruing, valued via the day-count
estimate), `matured` (user has confirmed the bank's actual figures — valued
at that confirmed figure, no longer an estimate), and `closed` (proceeds
have been transferred to a bank via `transferTdProceeds`). Only `closed`
drops to $0 in all totals — a `matured`-but-not-yet-transferred TD still
represents real, uncollected money and must keep counting. This mirrors the
MP2 annual-payout pattern above: the transition that actually moves money
out (transfer/payout), not the transition that merely confirms a number, is
what zeroes the source account's contribution to totals.

### Labels changed from "Portfolio"/"stock portfolic" to "Investments"/"Total investments"
Once MP2 and TD accounts can hold real value, continuing to call the
combined figure "stock portfolio" (or its gain % a stock-style return) would
misrepresent non-market-priced money as if it behaved like equities. The
brief was explicit about this ("do not combine stock-market gains with MP2
projections or Time Deposit interest into one misleading percentage") — the
stock-only cost/gain/% stats were kept, just visually separated and labeled
"stocks/ETF only," rather than removed, since they're still useful and
already existed pre-Phase-2.

### Generalizing the trades-only child-merge helper instead of writing a parallel one
`mergeArrayByIdWithChild` (singular, used by goals→contributions) already
existed and was reused as-is for nothing new; investments needed to merge
*up to three* possible child arrays (`trades` for stocks, `contributions`
and `paidDividends` for MP2) on the same parent record type, which the
singular helper's signature couldn't express. Rather than duplicate its body
with a different childKey, `mergeArrayByIdWithChildren` (plural) takes a list
of `{key, tsOf}` specs and only merges a key when at least one side actually
has it — so a stock's merge never gets a spurious empty `contributions: []`
grafted on, and vice versa.

## Investment module redesign — Phase 1 (2026-07-28)

### The live app is `index.html`, not `app.jsx`
`app.jsx` (repo root) is a stale, out-of-date single-file copy from an earlier
iteration (no Home tab, no pay periods, no trade log). The actual shipped app —
confirmed by checking file mtimes and by live-testing against the user's real
synced data — is the single `<script type="text/babel">` block inside
`index.html`. **Any future change to "the app" means editing `index.html`.**

### "Household" is now a real investment owner, not just a Home-view aggregate
Before this session, `"household"` only existed as a Home-tab-only pseudo-profile
(`HomeProfileToggle`) that aggregated `"me"` + `"wife"` — there was no literal
`household` value anywhere in stored data. Banks and goals still work this way.

For investments, the brief explicitly requires a genuine joint-account owner
(an investment really can be held jointly, unlike a goal or a named bank
account). Decision: `investment.owner` accepts `"household"` as a real stored
value. `investmentsForProfile(invs, "household")` returns *all* investments
(not just ones tagged `"household"`), because Home's Household view is meant
to be the combined view, and an investment tagged `owner:"household"` is
already included in "all investments" — see the helper's own comment.

This creates an intentional asymmetry with banks/goals (2-owner only). Don't
"fix" this by adding a 3rd owner to banks/goals without a separate design
decision — it wasn't asked for and changes the meaning of Home's existing
Household toggle for those cards.

### One shared valuation loop, filtered per call, not a single grouped pass
`investmentsSarValue(list)` is the same reduce loop `invSar` always used;
`invSarForOwner(owner)` just calls it again with `investmentsForProfile()`
pre-filtering the list. This was chosen over refactoring into a single
group-by-owner pass because:
- The existing codebase's convention for banks/goals is already
  "filter-then-reduce" per profile (see `BanksView`, `AssetAllocationCard`'s
  goal filtering) — consistency over a one-off micro-optimization.
- Only 2–3 owner buckets exist; a grouped pass would save one loop over a tiny
  array (`invs` is a handful of holdings), not worth the abstraction.

### `PortfolioCard` history chart: Household-only, not per-owner
`portHistory` (`addPortSnap`) captures one whole-portfolio USD snapshot when
prices are refreshed — it was never per-owner. Two options existed:
1. Show the existing (unfiltered) history chart under every profile anyway.
2. Only show it for the Household view; per-profile views show current-value
   stats only.

Chose (2): showing a whole-portfolio trend line under a filtered "Me"-only
current value would silently mix two different scopes and mislead the user
about that profile's actual growth. This is documented in-code as a known
gap for a future phase (per-owner history capture), not implemented now —
staying inside the "architecture only, no new calculations" scope of Phase 1.

### Migration default: existing holdings → owner `"me"`, type `"stocks"`
Every investment that existed before this change was, by definition, a stock/ETF
holding belonging to whoever primarily used the Investments tab (Jastine/`"me"`
per the brief). No other default was safe or inferable from old data, so
`migrate()` sets both fields unconditionally when missing.

### Testing methodology: sandbox copy instead of the real synced instance
The app auto-connects to a live Cloudflare KV store via a token hardcoded in
`index.html` (not per-device login) — even a fresh browser profile pulls the
user's real financial data on load. Decision: never edit fields while
connected to the real store during testing. Verification split into:
1. A read-only pass against the real live data (safe: switching Home's profile
   toggle only touches a local, non-synced React/localStorage preference —
   confirmed by reading `budgetOwner`'s implementation before relying on this).
2. A full read/write pass in a throwaway copy with `SYNC_TOKEN` overwritten to a
   `"PASTE_"`-prefixed dummy (the app's own existing convention for "service
   not configured" — see `PROXY_URL`/`FINNHUB_KEY`/`GOOGLE_CLIENT_ID` for
   precedent), served on a different port for a clean `localStorage`.

Future sessions testing this app in a browser should follow the same pattern —
do not assume "fresh tab" == "safe to edit," because the sync token isn't
tied to browser session/login state.

**Superseded 2026-08-01** (see "Secrets out of the public repo" below): the
passphrase is now per-device, so a fresh tab genuinely *is* safe — it starts
unconnected. Step 2's "overwrite `SYNC_TOKEN` to a dummy" is no longer needed
or possible.

---

## Budget carry-forward chain, transaction entry order, pay periods to Settings (2026-07-31)

### An unplanned month inherits the nearest PRECEDING month, not the base plan
`planForMonth` used to resolve every month without its own `monthlyPlans`
mapping to `activePlanId[owner]`. One plan therefore answered for the whole
timeline, which had two consequences nobody had connected:

1. **Planning ahead was impossible.** September could only ever show the base
   plan. "Plan two months out, starting from what I planned for the month
   before" had no expression in the data model.
2. **Editing today silently rewrote history.** `editable=isNow||hasOwnPlan`
   meant the current month edited the base plan *in place*, and every past
   month without a custom copy rendered that same record — so changing this
   month's grocery budget retroactively changed what last March displayed, and
   Home's trend cards were comparing the current budget against itself.

Now `resolvePlanForMonth(monthlyPlans,mo,owner,activePlanId,plans)` walks
backwards to the nearest mapping at or before `mo`, falling back to
`activePlanId` only when nothing precedes it. Both problems are the same bug
and this is the single fix for both.

Three behaviours in it are deliberate and commented in-source: a tombstoned
mapping is *skipped* rather than terminating the walk ("remove this month's
plan" means it goes back to inheriting); a mapping pointing at a soft-deleted
plan is skipped and the walk continues (an older real plan beats a blank
month); and calendar and pay-period keys interleave correctly under plain
string comparison (`"2026-03" < "2026-03-28" < "2026-04"`), so after toggling
pay periods a period inherits that month's calendar plan.

`activePlanId` narrows in meaning: it is now the **root of the chain**, not
"the plan the current month edits."

### Copy-on-write through one choke point, not at each call site
Every month is editable immediately; the first real change to a month with no
mapping clones what it was previewing and applies the edit. The alternative —
materialising a plan when you merely page to a month — would create a plan
record for idle browsing and make `monthlyPlans` grow without user intent.

All twelve budget mutators route through `editPlanForMonth(mo,owner,label,
mutate)` rather than each deciding for itself. The by-plan-id mutators
(`patchPlanById`/`setCatsFor`/`setGrpsFor`) were **deleted**, because taking a
plan id means the caller has already made the copy-on-write decision — and for
a carried-forward month that decision was invisibly "edit the plan every other
month inherits." One mutator forgetting would be a silent data bug, so the
decision now exists in exactly one place. `ExpenseTrackerView`'s `moveCat` is
included: envelope order is array position inside the plan.

Two implementation invariants:
- **Clone and edit land in one `setData`.** A half-materialised month (mapping
  written, edit not) renders as an empty custom budget for a debounce tick and
  can be persisted that way.
- **The no-op guard is load-bearing.** `NumField` commits whenever a draft
  exists, including re-typing the same number. Without the guard, tapping an
  amount in a past month and retyping it materialises a plan — the "paging
  writes nothing" rule leaking one step downstream. The clone branch compares
  against the *clone*, not the source: the clone legitimately has fresh ids
  throughout, so comparing to the source would always differ.

### Transaction order lives in fields, never in array position
Expenses had no creation timestamp and no order field; `uid()` is
`Math.random()`, so same-day rows sorted arbitrarily and *differently on each
device*. Two new fields: `createdAt` (stamped once at insert, never
re-stamped — that is what distinguishes it from `updatedAt`, which every edit
bumps) and an optional `ord` for manual within-a-day placement.

It has to be fields rather than array order because `mergeArrayById` re-sorts
expenses by id on every sync and `fingerprint` canonicalizes with `sortedById`
— an array-position order would be erased the first time two devices synced.
Conversely, because `ord` *is* a record field, a reorder correctly marks the
document dirty.

`compareTxForDisplay` is one module-scope comparator used by both list sites,
so the period log and the per-envelope list can't drift. **An unplaced row
(no `ord`) sorts above every placed row of its day.** That single rule
delivers two behaviours that would otherwise need separate handling: a
transaction added after a day was reordered lands on top, and a transaction
whose date is edited into a reordered day arrives at the newest position
(`updateExpenseTx` deletes `ord` on a date change). So the *absence* of `ord`
is meaningful and must never be defaulted to a number — including in
`migrate()`, which backfills `createdAt` from `updatedAt` but never invents an
`ord`.

Reordering reuses the existing up/down-arrow modal pattern rather than
drag-and-drop: there is no build step and no DnD library, and a hand-rolled
touch drag would fight page scroll and the existing pull-to-refresh handler.
It commits once on Done rather than per tap, because per-tap writes fight
`setData`'s debounce.

### The pay-period Home card was removed, not fixed
The card prompted "has your salary arrived?" in a 5-day window around payday.
It was wrong in both directions: noise for the overwhelmingly common case
where salary arrived on time (it offered a "Hasn't arrived yet" button to
someone who had already been paid), and **invisible in the case that actually
needed it** — `ownerUsesPayPeriod` returns false when tracking is off, so an
owner whose spending was being bucketed by calendar month against their will
saw nothing at all. That was the real-world failure: an owner paid on Jul 30
against an Aug 1 payday had no route to record it and re-dated transactions to
Aug 1 by hand instead.

Corrections moved to Settings → Pay periods, where they can be made at any
time rather than only inside a window, and where the tracking toggle sits next
to them. Toggling tracking now shows a `ConfirmDialog` quoting how many of that
owner's logged expenses change bucket (computed by comparing `bucketKeyFor`
under the current and trial configs) — in **both** directions, since the
re-bucketing is symmetric.

### `PERIOD_PENDING` deleted
The `"pending"` sentinel made a period open-ended until salary was confirmed,
and required two interactions on two different days. Saying "it started on the
4th" after the fact expresses the same thing in one, so the sentinel is gone
and `migrate()` sweeps `actualStarts` of any non-date value.

The real win is that `periodRange` **no longer reads the clock**: a period's
extent is now a pure function of `(key,cfg)`. Labels, lengths and bucketing no
longer change at midnight, and the derived history/snapshot effects can't loop
on a boundary that moves under them. `periodActualStart` always returns a date
string, so no caller has to defend against `null`.

Worth restating because it is the most misunderstood part of the feature: an
override moves **two** boundaries — it is period K's start and period K−1's end
— so a corrected period **stretches rather than slides**. Recording that August
began Jul 30 makes August Jul 30–Aug 31 (33 days) and shortens July to
Jul 1–Jul 29. It does not cascade; September still starts nominally. Periods
are never pro-rated, so the daily allowance absorbs the length change. The
Settings row shows the resulting range and day count for exactly this reason.

---

## Secrets out of the public repo (2026-08-01)

### The problem: a static page cannot hold a secret
`index.html` is served from GitHub Pages out of a **public** repo, and it
contained `SYNC_TOKEN` (the only thing guarding `/sync`) and `FINNHUB_KEY` as
plain literals. Anyone who opened the site and viewed source could read and
overwrite the entire household dataset. `/quote` and `/name` on the Worker were
additionally unauthenticated, making it a free Yahoo Finance proxy billed to
this Cloudflare account.

Making the repo private wouldn't have fixed it: the deployed page still ships
its own source to every visitor. The credential had to stop being *in* the page.

### Chosen: passphrase per device, in `localStorage`
`index.html` ships with no credential at all. The passphrase is typed once per
device in Settings → Cloudflare KV Sync, held in `localStorage` under
`SYNC_TOKEN_KEY`, and checked against the `SYNC_TOKEN` **secret** in the
Worker's environment. `getSyncToken()`/`setSyncToken()` are the only accessors.

Rejected alternative: keep the token embedded and lock the Worker to the
GitHub Pages `Origin`. CORS is enforced by *browsers*; `curl` ignores it
entirely, so an origin allowlist is worthless against anyone who has read the
token out of the public page — which is everyone. The allowlist is still there
(`ALLOWED_ORIGINS` in `worker.js`) but strictly as defense in depth; the token
remains the only real gate.

### The passphrase is deliberately NOT in `data`
Same reasoning as `VIEW_PROFILE_KEY`: it's a per-device credential, not part of
the financial document. In `data` it would be uploaded to the cloud, dirty the
doc on every device, and — worse — land in every Settings → Download backup
JSON, which people email to themselves. It must stay out of `defaultData()`,
`migrate()`, `fingerprint()` and `userFingerprint()`.

### Validate before persisting
"Connect" tests the typed value against `GET /sync/meta` (the cheapest
authenticated endpoint — no dataset transfer) and only writes to `localStorage`
on a 200. Persisting first would leave a device holding a typo'd credential
whose only symptom is background saves failing silently, days later.

`KVSync.lastStatus` exists for the same reason at the other end: a 401 means
"the passphrase was rotated, re-enter it" and a network failure means "wait",
and they need different words. Without it a rotated token renders identically
to ordinary sync failure.

### `kvReady` had to become state
It was a module-constant expression evaluated once. Entering a passphrase must
bring the sync effects and buttons alive without a reload, so it now derives
from a `syncTokenSet` state cell. The boot effect runs with `[]`, so a
just-connected device also fires one `pullFromCloud()` — which auto-merges and
stashes a pre-cloud backup, so it's safe on a device with unshared local edits.

### Finnhub moved into the Worker rather than being dropped
The two-tier "Yahoo first, Finnhub for whatever's missing" chain moved verbatim
into `worker.js`'s `/quote` and `/name` handlers. Adding new endpoints was the
obvious alternative; folding it into the existing ones meant the client's URLs
didn't change at all. Note Finnhub takes its key as a **query parameter** —
that's their API design, and the fix isn't to hide it but to make the call
server-side, where query strings don't reach browser history or referrers.

### Consequence accepted: no passphrase, no live prices
Authenticating `/quote`/`/name` means an unconnected device shows no market
data. That's correct — it's the same rule sync already followed — but it does
mean `fetchQuotes`/`fetchName` now gate on `KVSync._ready()` rather than a
`PASTE_` check, and the error copy points at Settings, not at the setup guide.

### Rotation, not history rewrite
The old values remain in git history. They were revoked instead: new Worker
secrets, new Finnhub key. Rewriting history with `git-filter-repo` would have
meant a force-push and broken clones to scrub strings that are already dead.
Rotating is what actually removes the risk; scrubbing only removes the
embarrassment.

### SRI on the CDN scripts, and why the Recharts URL had to change
Moving the passphrase into `localStorage` (above) made the CDN a live threat
rather than a theoretical one: anything executing on this origin can read that
key, and five of the page's scripts are fetched from jsDelivr. A compromised CDN
or a hijacked connection would have handed over the credential the previous
change had just finished protecting. SRI is the answer — the browser hashes what
it received and refuses to run it on a mismatch.

The non-obvious part: **the pinned URL must be a real file inside the npm
package.** The app was loading `recharts@2.12.7/umd/Recharts.min.js`, which the
package does not contain — jsDelivr was generating it from `umd/Recharts.js` and
prepending a banner. Its own banner text says "Do NOT use SRI with dynamically
generated files", because those bytes can change when jsDelivr's pipeline
changes, which would blank the app for no traceable reason. Fixed by pointing at
`umd/Recharts.js`, which is already minified (the 273-byte difference *is* the
banner). `sw.js`'s `APP_SHELL` has to list the identical URL or the service
worker caches something the page never asks for.

Hashes were cross-checked against unpkg as well as jsDelivr. Pinning to whatever
one CDN happens to serve defeats the point of pinning; agreement between two
independent mirrors of the same npm tarball is what makes the value trustworthy.

Accepted cost: bumping a library version now requires regenerating that
library's hash, or the app goes blank with a console-only error. That trap is
documented in `CLAUDE.md` next to the regeneration one-liner, because the
failure mode gives no on-screen hint about its cause.

Not done: SRI on the app's own `index.html` (same-origin, and it changes every
deploy), and Content-Security-Policy headers (GitHub Pages can't set them; a
`<meta>` CSP would help but Babel's in-browser JSX compilation needs
`unsafe-eval`, so it would be weak. Worth revisiting only if the app ever gains
a build step).
