/* Unit-test goal contributions as ONE action producing TWO linked records.

   Slices the shipped applyGoalContribution* pair out of index.html, plus the
   Expenses hero's classifier, and runs them in a vm context per CLAUDE.md —
   testing the shipped coupling, not a copy of it.

   The defect this locks down: three UI paths credited a goal and only one of
   them also moved the money. The Goals tab and Home's sheet wrote a
   contribution ONLY, so a goal could grow without anything leaving the budget.
   The add-transaction modal wrote both, but in two separate setData calls.

   The contract:
     • one call writes the ledger transfer AND the contribution, linked by id
     • deleting either half takes the other with it, and restoring reverses it
     • a LEGACY record (no link) still behaves exactly as it did before
     • the unaccounted classifier prefers the explicit goalId, so deleting a
       goal no longer silently reclassifies its contributions as transfers

   Gotchas (CLAUDE.md): deepStrictEqual fails across vm realms — use deepEqual.
   Slice markers are plain indexOf, so assert they were found. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8")
  .replace(/\r\n/g,"\n");

function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}
const clone=o=>JSON.parse(JSON.stringify(o));
let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

const ctx={};
vm.createContext(ctx);
/* completedMonths is sliced in rather than reimplemented: "how many whole
   months until the deadline" is half of what goalDeadlineStatus answers, and a
   local copy would only ever test the copy. */
vm.runInContext(
  slice("function completedMonths(fromStr,toStr){","/* Tiers are WHOLE-BALANCE")+"\n"+
  slice("function applyGoalContribution(d,{","/* Tracked-spending rollup for one owner"),ctx);
const{applyGoalContribution,applyGoalContributionDeleteByExpense,
  applyGoalContributionRestoreByExpense,applyGoalContributionDeleteByContribution,
  applyGoalContributionRestoreByContribution,categoryGoalFor,goalDeadlineStatus}=ctx;
assert.ok(typeof applyGoalContribution==="function","applyGoalContribution missing from the slice");
assert.ok(typeof categoryGoalFor==="function","categoryGoalFor missing from the slice");
assert.ok(typeof goalDeadlineStatus==="function","goalDeadlineStatus missing from the slice");

/* The unaccounted classifier. It moved out of its useMemo and into
   module-scope reconcilePeriod in v1.47.0; this drives it through there, so
   the rule is still asserted against the shipped reducer rather than a
   restatement of it. The two helpers reconcilePeriod composes are stubbed —
   only the ACTUAL side is under test here, and both are covered by their own
   runners (purchasetest, installmenttest) and by reconciletest. */
const clsCtx={};
vm.createContext(clsCtx);
vm.runInContext(
  "function categoryEffectiveAmt(){return 0;}\n"+
  "function derivedInstallmentRowsFor(){return [];}\n"+
  slice("function reconcilePeriod({","\n/* The one sentence above the table")+`
function classify(viewMonthExpenses,goals){
  const r=reconcilePeriod({plan:null,expenses:viewMonthExpenses,goals,bucketKey:"2026-08",
    payPeriods:{},owner:"me",installments:[],installmentPayments:[]});
  const v=k=>r.lines.find(l=>l.key===k).actual;
  return{trackedSpend:v("tracked"),untrackedTransfers:v("transfers"),
         goalContribs:v("goals"),extraFunds:v("extraFunds")};
}
this.classify=classify;`,clsCtx);
const{classify}=clsCtx;

const NOW="2026-08-06T12:00:00.000Z";
function doc(){
  return{expenses:[],goals:[
    {id:"g1",owner:"me",name:"Emergency Fund",target:60000,contributions:[]},
    {id:"g2",owner:"wife",name:"New Laptop",target:8000,contributions:[]},
  ]};
}
const add=(d,over={})=>applyGoalContribution(d,Object.assign(
  {goalId:"g1",amount:500,note:"",date:"2026-08-06",owner:"me",
   expenseId:"e1",contributionId:"c1",now:NOW},over));

console.log("\napplyGoalContribution — one action, two linked records\n");

t("THE FIX: one call writes BOTH the ledger row and the contribution",()=>{
  const d=add(doc());
  assert.equal(d.expenses.length,1,"no ledger row written — money never left the budget");
  assert.equal((d.goals.find(g=>g.id==="g1").contributions||[]).length,1,"no contribution written");
});

t("the two records link by id in both directions",()=>{
  const d=add(doc());
  const e=d.expenses[0], c=d.goals.find(g=>g.id==="g1").contributions[0];
  assert.equal(e.goalId,"g1");
  assert.equal(e.goalContributionId,c.id);
  assert.equal(c.expenseId,e.id);
});

t("the ledger row is a transfer, keyed for every existing reader",()=>{
  const e=add(doc()).expenses[0];
  assert.equal(e.isTransfer,true);
  assert.equal(e.catId,"g1","catId must stay the goal id — the category filter reads it");
  assert.equal(e.amount,500);
  assert.equal(e.date,"2026-08-06");
  assert.equal(e.owner,"me");
  assert.ok(e.createdAt,"createdAt must be stamped at insert");
  assert.equal("ord"in e,false,"an absent ord is meaningful — never invent one");
});

t("owner falls back to the goal's own owner when not given",()=>{
  const d=applyGoalContribution(doc(),{goalId:"g2",amount:100,date:"2026-08-06",
    expenseId:"e9",contributionId:"c9",now:NOW});
  assert.equal(d.expenses[0].owner,"wife");
});

t("the row is named after the goal unless a name is supplied",()=>{
  assert.equal(add(doc()).expenses[0].name,"Emergency Fund (goal)");
  assert.equal(add(doc(),{name:"Payday top-up"}).expenses[0].name,"Payday top-up");
});

t("a non-positive amount writes nothing at all",()=>{
  [0,-5,"","abc",null].forEach(v=>{
    const d=add(doc(),{amount:v});
    assert.equal(d.expenses.length,0,`amount ${JSON.stringify(v)} wrote a ledger row`);
    assert.equal(d.goals.find(g=>g.id==="g1").contributions.length,0);
  });
});

t("an unknown or deleted goal writes nothing — never a half write",()=>{
  assert.equal(add(doc(),{goalId:"nope"}).expenses.length,0);
  const gone=doc(); gone.goals[0].deletedAt=NOW;
  assert.equal(add(gone).expenses.length,0);
});

console.log("\nDelete and restore travel together\n");

t("deleting the ledger row makes the goal give the money back",()=>{
  const d=applyGoalContributionDeleteByExpense(add(doc()),{expenseId:"e1",now:NOW});
  assert.ok(d.expenses[0].deletedAt,"expense not tombstoned");
  assert.ok(d.goals.find(g=>g.id==="g1").contributions[0].deletedAt,
    "goal kept the money after its transfer was deleted");
});

t("restoring the ledger row brings the contribution back",()=>{
  let d=applyGoalContributionDeleteByExpense(add(doc()),{expenseId:"e1",now:NOW});
  d=applyGoalContributionRestoreByExpense(d,{expenseId:"e1",now:NOW});
  assert.equal(d.expenses[0].deletedAt,null);
  assert.equal(d.goals.find(g=>g.id==="g1").contributions[0].deletedAt,null);
});

t("deleting the contribution takes the ledger row with it",()=>{
  const d=applyGoalContributionDeleteByContribution(add(doc()),
    {goalId:"g1",contributionId:"c1",now:NOW});
  assert.ok(d.goals.find(g=>g.id==="g1").contributions[0].deletedAt);
  assert.ok(d.expenses[0].deletedAt,"money still shows as having left the budget");
});

t("restoring the contribution brings the ledger row back",()=>{
  let d=applyGoalContributionDeleteByContribution(add(doc()),
    {goalId:"g1",contributionId:"c1",now:NOW});
  d=applyGoalContributionRestoreByContribution(d,{goalId:"g1",contributionId:"c1",now:NOW});
  assert.equal(d.goals.find(g=>g.id==="g1").contributions[0].deletedAt,null);
  assert.equal(d.expenses[0].deletedAt,null);
});

t("everything is soft-deleted, never spliced, so a merge can't resurrect it",()=>{
  const d=applyGoalContributionDeleteByExpense(add(doc()),{expenseId:"e1",now:NOW});
  assert.equal(d.expenses.length,1);
  assert.equal(d.goals.find(g=>g.id==="g1").contributions.length,1);
});

console.log("\nLegacy records keep their old behaviour\n");

t("a pre-v1.27.0 expense with no link tombstones alone",()=>{
  const d={expenses:[{id:"old",catId:"g1",amount:200,isTransfer:true}],
    goals:[{id:"g1",owner:"me",name:"Emergency Fund",
      contributions:[{id:"oldc",amount:200,date:"2026-07-01"}]}]};
  const out=applyGoalContributionDeleteByExpense(d,{expenseId:"old",now:NOW});
  assert.ok(out.expenses[0].deletedAt);
  assert.ok(!out.goals[0].contributions[0].deletedAt,
    "an unlinked legacy contribution must not be guessed at");
});

t("a pre-v1.27.0 contribution with no expenseId tombstones alone",()=>{
  const d={expenses:[{id:"old",catId:"g1",amount:200,isTransfer:true}],
    goals:[{id:"g1",owner:"me",name:"EF",contributions:[{id:"oldc",amount:200}]}]};
  const out=applyGoalContributionDeleteByContribution(d,{goalId:"g1",contributionId:"oldc",now:NOW});
  assert.ok(out.goals[0].contributions[0].deletedAt);
  assert.ok(!out.expenses[0].deletedAt);
});

console.log("\nThe unaccounted classifier\n");

const G=[{id:"g1",name:"EF"},{id:"g2",name:"Laptop"}];

t("a linked contribution counts as a goal contribution, not a transfer",()=>{
  const r=classify([{amount:500,isTransfer:true,catId:"g1",goalId:"g1",goalContributionId:"c1"}],G);
  assert.equal(r.goalContribs,500);
  assert.equal(r.untrackedTransfers,0);
});

t("THE ROT THIS FIXES: a deleted goal no longer reclassifies its own history",()=>{
  // catId still points at g1, but g1 is gone from the goals list. Before the
  // explicit link, this row silently moved from "Goal contributions" to
  // "Transfers out" — months after the money actually moved.
  const rows=[{amount:500,isTransfer:true,catId:"g1",goalId:"g1",goalContributionId:"c1"}];
  const stillThere=classify(rows,G);
  const goalDeleted=classify(rows,[{id:"g2",name:"Laptop"}]);
  assert.equal(stillThere.goalContribs,500);
  assert.equal(goalDeleted.goalContribs,0,"the row must not vanish silently...");
  assert.equal(goalDeleted.untrackedTransfers,500,"...it falls to Transfers out, and the TOTAL is unchanged");
  assert.equal(stillThere.goalContribs+stillThere.untrackedTransfers,
               goalDeleted.goalContribs+goalDeleted.untrackedTransfers,
               "the sheet must still reconcile either way");
});

t("a legacy row with no goalId still classifies off catId",()=>{
  const r=classify([{amount:300,isTransfer:true,catId:"g2"}],G);
  assert.equal(r.goalContribs,300);
});

t("an ordinary untracked transfer is untouched",()=>{
  const r=classify([{amount:1000,isTransfer:true,catId:"savings-cat"}],G);
  assert.equal(r.untrackedTransfers,1000);
  assert.equal(r.goalContribs,0);
});

t("extra funds are still classified first and never as spending",()=>{
  const r=classify([{amount:2000,isExtraFunds:true,catId:"food"}],G);
  assert.equal(r.extraFunds,2000);
  assert.equal(r.trackedSpend,0);
});

/* ── 5a-2: category → goal link ──────────────────────────────────────────── */
console.log("\ncategoryGoalFor — the link, and how it degrades\n");

const GOALS=[{id:"g1",owner:"me",name:"Emergency Fund",contributions:[]},
             {id:"gDead",owner:"me",name:"Old goal",deletedAt:NOW,contributions:[]}];

t("an unlinked category resolves to nothing",()=>{
  assert.equal(categoryGoalFor({id:"c1",name:"Savings"},GOALS),null);
  assert.equal(categoryGoalFor(null,GOALS),null);
  assert.equal(categoryGoalFor({id:"c1",goalId:""},GOALS),null);
});

t("a linked category resolves to its goal",()=>{
  assert.equal(categoryGoalFor({id:"c1",goalId:"g1"},GOALS).name,"Emergency Fund");
});

t("A STALE LINK DEGRADES: a deleted or missing goal resolves to null",()=>{
  // this is what stops a transfer being swallowed — see quickTransfer
  assert.equal(categoryGoalFor({id:"c1",goalId:"gDead"},GOALS),null);
  assert.equal(categoryGoalFor({id:"c1",goalId:"gone"},GOALS),null);
  assert.equal(categoryGoalFor({id:"c1",goalId:"g1"},[]),null);
});

console.log("\nA category-linked transfer keys to the CATEGORY\n");

t("catId is the category, goalId is the goal — they are different questions",()=>{
  const d=applyGoalContribution(doc(),{goalId:"g1",amount:5000,date:"2026-08-06",
    owner:"me",name:"Long Term Savings",catId:"cat-lts",
    expenseId:"e1",contributionId:"c1",now:NOW});
  const e=d.expenses[0];
  assert.equal(e.catId,"cat-lts","the envelope's transferred figure reads catId");
  assert.equal(e.goalId,"g1");
  assert.equal(e.isTransfer,true);
  assert.equal(d.goals.find(g=>g.id==="g1").contributions[0].amount,5000);
});

t("without a catId override it still defaults to the goal, as before",()=>{
  assert.equal(add(doc()).expenses[0].catId,"g1");
});

t("delete symmetry still holds for a category-linked row",()=>{
  let d=applyGoalContribution(doc(),{goalId:"g1",amount:5000,date:"2026-08-06",
    owner:"me",catId:"cat-lts",expenseId:"e1",contributionId:"c1",now:NOW});
  d=applyGoalContributionDeleteByExpense(d,{expenseId:"e1",now:NOW});
  assert.ok(d.expenses[0].deletedAt);
  assert.ok(d.goals.find(g=>g.id==="g1").contributions[0].deletedAt,
    "the goal kept money whose transfer was deleted");
});

t("a linked transfer classifies as a goal contribution, not Transfers out",()=>{
  // deliberate: the money left via the category but it funded a goal, and
  // goalId is what says so. Both lines subtract, so the sheet still reconciles
  // — but a hand-reconciliation of untracked envelopes vs "Transfers out" will
  // now be short by this amount. Recorded in decisions.md.
  const r=classify([{amount:5000,isTransfer:true,catId:"cat-lts",goalId:"g1",goalContributionId:"c1"}],G);
  assert.equal(r.goalContribs,5000);
  assert.equal(r.untrackedTransfers,0);
});

t("an unlinked transfer against the same category is untouched",()=>{
  const r=classify([{amount:5000,isTransfer:true,catId:"cat-lts"}],G);
  assert.equal(r.untrackedTransfers,5000);
  assert.equal(r.goalContribs,0);
});

/* ── goalDeadlineStatus (v1.32.0) ─────────────────────────────────────────
   A target and a monthly figure can only say "~16 months at this pace". The
   deadline is what turns that into "you will miss this", which is the question
   somebody saving for a dated purchase is actually asking. */
console.log("\ngoal deadlines\n");

const TODAY="2026-08-07";
const goal=(over={})=>({id:"gd",owner:"me",name:"MacBook",type:"tech",
  target:5200,monthly:800,contributions:[{id:"c1",date:"2026-07-01",amount:2000}],...over});

t("no deadline returns null — absence is the normal case, not an empty state",()=>{
  assert.equal(goalDeadlineStatus(goal(),TODAY),null);
  assert.equal(goalDeadlineStatus(goal({deadline:""}),TODAY),null);
  assert.equal(goalDeadlineStatus(null,TODAY),null);
});

t("months remaining are WHOLE months, so the requirement rounds UP",()=>{
  /* 7 Aug → 1 Dec is three and a half months. Asking for the four-month figure
     would flatter the deadline; the honest ask is the three-month one. */
  const s=goalDeadlineStatus(goal({deadline:"2026-12-01"}),TODAY);
  assert.equal(s.monthsLeft,3);
  assert.equal(s.remain,3200);
  assert.ok(Math.abs(s.requiredMonthly-3200/3)<1e-9);
});

t("on track compares the STATED monthly, never recent actual contributions",()=>{
  /* Plan-based, with actuals only ever a warning — the same rule the Purchase
     Advisor's projections follow. A goal funded 800/mo against a 1,066/mo
     requirement is behind even though it has been contributed to recently. */
  assert.equal(goalDeadlineStatus(goal({deadline:"2026-12-01"}),TODAY).onTrack,false);
  assert.equal(goalDeadlineStatus(goal({deadline:"2026-12-01",monthly:1100}),TODAY).onTrack,true);
  // and a goal with no contributions at all is judged the same way
  const bare=goalDeadlineStatus(goal({deadline:"2026-12-01",monthly:1100,contributions:[]}),TODAY);
  assert.equal(bare.remain,5200);
  assert.equal(bare.onTrack,false,"5,200 over 3 months needs more than 1,100/mo");
});

t("the boundary is exact — monthly EQUAL to the requirement is on track",()=>{
  const s=goalDeadlineStatus(goal({deadline:"2026-11-07",monthly:0}),TODAY);
  assert.equal(s.monthsLeft,3);
  const exact=goalDeadlineStatus(goal({deadline:"2026-11-07",monthly:s.requiredMonthly}),TODAY);
  assert.equal(exact.onTrack,true,"meeting the requirement exactly is not behind");
  const under=goalDeadlineStatus(goal({deadline:"2026-11-07",monthly:s.requiredMonthly-0.01}),TODAY);
  assert.equal(under.onTrack,false);
});

t("a deadline this month asks for the whole remainder now, never divides by zero",()=>{
  const s=goalDeadlineStatus(goal({deadline:"2026-08-20"}),TODAY);
  assert.equal(s.monthsLeft,0);
  assert.equal(s.requiredMonthly,3200,"nothing left to spread it over");
  assert.ok(isFinite(s.requiredMonthly));
});

t("reached counts as reached — a finished goal is never overdue or behind",()=>{
  const done=goal({deadline:"2020-01-01",contributions:[{id:"c1",amount:5200}]});
  const s=goalDeadlineStatus(done,TODAY);
  assert.equal(s.done,true);
  assert.equal(s.overdue,false,"a goal you finished early is not late");
  assert.equal(s.onTrack,true);
  assert.equal(s.requiredMonthly,0);
  // over-funded is still just done, never a negative remainder
  assert.equal(goalDeadlineStatus(goal({deadline:"2020-01-01",
    contributions:[{id:"c1",amount:9999}]}),TODAY).remain,0);
});

t("an unmet deadline in the past is overdue, and overdue is never on track",()=>{
  const s=goalDeadlineStatus(goal({deadline:"2026-07-01",monthly:99999}),TODAY);
  assert.equal(s.overdue,true);
  assert.equal(s.monthsLeft,0);
  assert.equal(s.onTrack,false,"no monthly figure rescues a date that has passed");
});

t("deleted contributions don't count toward the goal",()=>{
  const s=goalDeadlineStatus(goal({deadline:"2026-12-01",
    contributions:[{id:"c1",amount:2000},{id:"c2",amount:9000,deletedAt:"2026-07-02T00:00:00.000Z"}]}),TODAY);
  assert.equal(s.saved,2000);
  assert.equal(s.remain,3200);
});

t("it is pure — same answer for the same todayStr, and the goal is untouched",()=>{
  const g=goal({deadline:"2026-12-01"});
  const before=JSON.stringify(g);
  const a=goalDeadlineStatus(g,TODAY),b=goalDeadlineStatus(g,TODAY);
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
  assert.equal(JSON.stringify(g),before,"must not mutate its argument");
});

/* ── the four new fields cost an existing document nothing ────────────────
   banks[].accessible/purpose and goals[].bankId/deadline are deliberately NOT
   defaulted in migrate(). Defaulting them would rewrite every bank and goal on
   every device's first open, changing the document, changing the fingerprint,
   and buying a Cloudflare KV write per device for information nobody entered.
   Absence IS the value — the same rule goalId, fundedCatId and expense `ord`
   already follow. */
console.log("\nmigration is a no-op for an existing document\n");

const migCtx={};
vm.createContext(migCtx);
Object.assign(migCtx,{defaultData:()=>({}),uid:()=>"stub"});
vm.runInContext(
  slice("const sortedById=arr=>",'/* "Did a *person* change anything?"')+"\n"+
  slice("function migrate(d){","/* Bills Reserve = opening baseline")+`
this.fingerprint=fingerprint;`,migCtx);
const{migrate:migrateFn,fingerprint}=migCtx;

t("migrate() adds none of the four new fields to an existing record",()=>{
  const doc={plans:[],expenses:[],
    banks:[{id:"b1",owner:"me",name:"Main",currency:"SAR",balance:100,
      balanceAsOf:"2026-08-01",interest:null,updatedAt:"2026-08-01T00:00:00.000Z"}],
    goals:[{id:"g1",owner:"me",name:"Trip",type:"savings",target:1000,monthly:100,
      contributions:[],updatedAt:"2026-08-01T00:00:00.000Z"}]};
  const out=migrateFn(JSON.parse(JSON.stringify(doc)));
  ["accessible","purpose"].forEach(k=>
    assert.ok(!(k in out.banks[0]),`migrate() must not write banks[].${k}`));
  ["bankId","deadline"].forEach(k=>
    assert.ok(!(k in out.goals[0]),`migrate() must not write goals[].${k}`));
});

t("the fingerprint of an upgraded document is unchanged — no KV write on open",()=>{
  /* The property the whole absent-means-default rule exists to protect: a
     device upgrading to this build must not discover it has "changes to save". */
  const doc={plans:[],expenses:[],
    banks:[{id:"b1",owner:"me",name:"Main",currency:"SAR",balance:100,
      balanceAsOf:"2026-08-01",interest:null,updatedAt:"2026-08-01T00:00:00.000Z"}],
    goals:[{id:"g1",owner:"me",name:"Trip",type:"savings",target:1000,monthly:100,
      contributions:[],updatedAt:"2026-08-01T00:00:00.000Z"}]};
  const once=migrateFn(JSON.parse(JSON.stringify(doc)));
  const twice=migrateFn(JSON.parse(JSON.stringify(once)));
  assert.equal(fingerprint(once),fingerprint(twice),"migrate() must be idempotent");
  assert.equal(fingerprint(migrateFn(JSON.parse(JSON.stringify(doc)))),fingerprint(once));
});

t("cached FX rates are OUTSIDE the fingerprint — a rate tick can't dirty the doc",()=>{
  /* loadRates() fires from a mount effect on every single app open. If rates
     were inside the fingerprint, every open would mark the document dirty and
     buy a KV write for a number nobody typed. */
  const base=migrateFn({plans:[],expenses:[],banks:[],goals:[]});
  const withRates={...base,rates:{USD:1,SAR:3.75,PHP:57.2},ratesAt:1754500000000};
  const moved={...base,rates:{USD:1,SAR:3.76,PHP:58.9},ratesAt:1754600000000};
  assert.equal(fingerprint(base),fingerprint(withRates),
    "caching rates must not change the fingerprint");
  assert.equal(fingerprint(withRates),fingerprint(moved),
    "a rate moving must not change the fingerprint");
});

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
