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
vm.runInContext(slice("function applyGoalContribution(d,{",
                      "/* Tracked-spending rollup for one owner"),ctx);
const{applyGoalContribution,applyGoalContributionDeleteByExpense,
  applyGoalContributionRestoreByExpense,applyGoalContributionDeleteByContribution,
  applyGoalContributionRestoreByContribution,categoryGoalFor}=ctx;
assert.ok(typeof applyGoalContribution==="function","applyGoalContribution missing from the slice");
assert.ok(typeof categoryGoalFor==="function","categoryGoalFor missing from the slice");

/* The unaccounted classifier, lifted out of its useMemo so the "goal
   contributions are their own line" rule is asserted against the shipped
   reducer rather than a restatement of it. */
const clsCtx={};
vm.createContext(clsCtx);
vm.runInContext("function classify(viewMonthExpenses,goals){\n"+
  slice("    let trackedSpend=0,untrackedTransfers=0,goalContribs=0,extraFunds=0;",
        "  },[viewMonthExpenses,goals]);")+"\n}",clsCtx);
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

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
