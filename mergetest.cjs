/* Unit-test the sync merge fixes of 2026-08-05 (build 3C-1).

   Slices the real merge helpers out of index.html and runs them in a vm, per
   CLAUDE.md — testing the shipped code, not a reimplementation.

   Three defects under test, all of which silently discarded a real edit:

   1. `monthlyPlans` merged with mergeKeyed, which has no per-record timestamp
      and falls back to whichever whole document is newer. Assigning a plan to
      September on the laptop was reverted as soon as the phone logged an
      unrelated transaction, because the phone's document was "newer" overall.
      The records have carried `updatedAt` all along; nothing read it.

   2. `household.expenses` merged with tsOf=()=>"", so `tsOf(rx) > tsOf(lx)` was
      always false and local ALWAYS won an id collision. An edit or a delete on
      the other device could never arrive.

   3. `household.expenses` was absent from CONFLICT_COLLECTIONS, so it was
      invisible in the conflict modal and in Recently Deleted despite being
      id-keyed and soft-deleted like everything else.

   vm traps (see synctest.cjs): assert.deepStrictEqual compares prototypes and
   fails across realms — use deepEqual; slice markers are plain indexOf on
   source text, so assert they were found; top-level `const` bindings don't
   attach to the context, only function declarations do. */
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

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

const ctx={};
vm.createContext(ctx);
// Same slice window synctest uses, extended to reach CONFLICT_COLLECTIONS and
// the diff helpers that sit just past it. The plan-record helpers live much
// earlier in the file (beside resolvePlanForMonth), so they are sliced
// separately and prepended.
const planSrc=slice("const PLAN_ORD_LAST=","function resolvePlanForMonth(");
const src=slice("function mergeArrayById(","function buildConflictDiff(");
vm.runInContext(planSrc+src+`
this.livePlanView=livePlanView;
this.stampPlanRecords=stampPlanRecords;
this.comparePlanRecords=comparePlanRecords;
function installmentProviderLabel(i){return i.provider||"";}
this.mergeArrayById=mergeArrayById;
this.mergeKeyed=mergeKeyed;
this.mergeKeyedByTs=mergeKeyedByTs;
this.tryAutoMergeAll=tryAutoMergeAll;
this.diffCollection=diffCollection;
this.conflictArr=conflictArr;
this.CONFLICT_COLLECTIONS=CONFLICT_COLLECTIONS;
this.HIDE_FROM_RECENTLY_DELETED=HIDE_FROM_RECENTLY_DELETED;
this.countPendingChanges=countPendingChanges;`,ctx);
const{mergeArrayById,mergeKeyed,mergeKeyedByTs,tryAutoMergeAll,diffCollection,
  conflictArr,CONFLICT_COLLECTIONS,HIDE_FROM_RECENTLY_DELETED,countPendingChanges,
  livePlanView,stampPlanRecords,comparePlanRecords}=ctx;

const EMPTY={expenses:[],goals:[],investments:[],banks:[],assets:[],targets:[],
  mp2DividendRates:[],plans:[],bills:[],billAdjustments:[],monthlyPlans:[],
  portHistory:[],history:[],snapshots:[],household:{splitMine:50,expenses:[]}};
const doc=(over={})=>JSON.parse(JSON.stringify({
  ...EMPTY,
  dataUpdatedAt:"2026-08-05T10:00:00.000Z",
  fieldUpdatedAt:{},
  currency:"SAR",
  owners:{me:"Jastine",wife:"Charlene"},
  projection:{},settings:{},homeDisplay:{},homeSettings:{},billsSettings:{},
  quickTransferLast:{},
  payPeriods:{me:{enabled:false,payday:28,actualStarts:{}},
              wife:{enabled:false,payday:1,actualStarts:{}}},
  activePlanId:{me:"p1",wife:"pw1"},
  investTarget:{me:{},wife:{}},
  ...over,
}));

console.log("sync merge (build 3C-1)");

/* ── 1. monthlyPlans per-record resolution ──────────────────────────────── */

t("a plan assignment survives an unrelated newer edit on the other device",()=>{
  // laptop assigned September at 12:00
  const laptop=doc({dataUpdatedAt:"2026-08-05T12:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pSep",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  // phone logged a transaction at 13:00 — newer document, stale mapping
  const phone=doc({dataUpdatedAt:"2026-08-05T13:00:00.000Z",monthlyPlans:[]});
  const m=tryAutoMergeAll(phone,laptop);
  assert.strictEqual(m.monthlyPlans.length,1,"the assignment was dropped");
  assert.strictEqual(m.monthlyPlans[0].planId,"pSep");
});

t("...and in the other direction",()=>{
  const laptop=doc({dataUpdatedAt:"2026-08-05T12:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pSep",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  const phone=doc({dataUpdatedAt:"2026-08-05T13:00:00.000Z",monthlyPlans:[]});
  const m=tryAutoMergeAll(laptop,phone);
  assert.strictEqual(m.monthlyPlans[0].planId,"pSep");
});

t("the newer assignment wins when both devices assign the SAME month",()=>{
  const a=doc({monthlyPlans:[{month:"2026-09",owner:"me",planId:"pA",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  const b=doc({monthlyPlans:[{month:"2026-09",owner:"me",planId:"pB",updatedAt:"2026-08-05T14:00:00.000Z"}]});
  assert.strictEqual(tryAutoMergeAll(a,b).monthlyPlans[0].planId,"pB");
  assert.strictEqual(tryAutoMergeAll(b,a).monthlyPlans[0].planId,"pB","order must not matter");
});

t("different months assigned on different devices both survive",()=>{
  const a=doc({monthlyPlans:[{month:"2026-09",owner:"me",planId:"pSep",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  const b=doc({monthlyPlans:[{month:"2026-10",owner:"me",planId:"pOct",updatedAt:"2026-08-05T13:00:00.000Z"}]});
  const m=tryAutoMergeAll(a,b);
  assert.deepEqual(m.monthlyPlans.map(x=>x.planId).sort(),["pOct","pSep"]);
});

t("the same month for DIFFERENT owners is not one record",()=>{
  const a=doc({monthlyPlans:[{month:"2026-09",owner:"me",planId:"pMe",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  const b=doc({monthlyPlans:[{month:"2026-09",owner:"wife",planId:"pW",updatedAt:"2026-08-05T13:00:00.000Z"}]});
  assert.strictEqual(tryAutoMergeAll(a,b).monthlyPlans.length,2);
});

t("an unassignment travels like any other edit",()=>{
  // removePlanForMonth writes planId:null + deletedAt rather than removing
  const assigned=doc({monthlyPlans:[{month:"2026-09",owner:"me",planId:"pSep",updatedAt:"2026-08-05T12:00:00.000Z"}]});
  const removed=doc({dataUpdatedAt:"2026-08-05T09:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:null,deletedAt:"2026-08-05T14:00:00.000Z",updatedAt:"2026-08-05T14:00:00.000Z"}]});
  const m=tryAutoMergeAll(assigned,removed);
  assert.strictEqual(m.monthlyPlans[0].planId,null,"the newer removal must win even though its doc is older");
});

t("unstamped monthlyPlans degrade to the old whole-document rule",()=>{
  const older=doc({dataUpdatedAt:"2026-08-05T10:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pOld"}]});
  const newer=doc({dataUpdatedAt:"2026-08-05T18:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pNew"}]});
  assert.strictEqual(tryAutoMergeAll(older,newer).monthlyPlans[0].planId,"pNew");
  assert.strictEqual(tryAutoMergeAll(newer,older).monthlyPlans[0].planId,"pNew");
});

t("a stamped record beats an unstamped one regardless of document age",()=>{
  const stamped=doc({dataUpdatedAt:"2026-08-05T09:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pStamped",updatedAt:"2026-08-05T09:00:00.000Z"}]});
  const unstamped=doc({dataUpdatedAt:"2026-08-05T20:00:00.000Z",
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"pUnstamped"}]});
  assert.strictEqual(tryAutoMergeAll(unstamped,stamped).monthlyPlans[0].planId,"pStamped");
});

t("mergeKeyed itself is untouched (history/snapshots still use it)",()=>{
  const out=mergeKeyed([{month:"2026-08",v:1}],[{month:"2026-08",v:2}],h=>h.month,true);
  assert.strictEqual(out[0].v,1,"preferLocal must still mean local");
});

/* ── 2. household.expenses merges on its timestamp ──────────────────────── */

const hh=rows=>({splitMine:50,expenses:rows});

t("an edit made on the other device now arrives",()=>{
  const local=doc({household:hh([{id:"h1",name:"Rent",amount:5000,updatedAt:"2026-08-05T10:00:00.000Z"}])});
  const remote=doc({household:hh([{id:"h1",name:"Rent",amount:5500,updatedAt:"2026-08-05T12:00:00.000Z"}])});
  const m=tryAutoMergeAll(local,remote);
  assert.strictEqual(m.household.expenses[0].amount,5500,"local used to always win this");
});

t("the local edit still wins when it is the newer one",()=>{
  const local=doc({household:hh([{id:"h1",name:"Rent",amount:6000,updatedAt:"2026-08-05T14:00:00.000Z"}])});
  const remote=doc({household:hh([{id:"h1",name:"Rent",amount:5500,updatedAt:"2026-08-05T12:00:00.000Z"}])});
  assert.strictEqual(tryAutoMergeAll(local,remote).household.expenses[0].amount,6000);
});

t("a delete on the other device is no longer silently undone",()=>{
  const local=doc({household:hh([{id:"h1",name:"Rent",amount:5000,updatedAt:"2026-08-05T10:00:00.000Z"}])});
  const remote=doc({household:hh([{id:"h1",name:"Rent",amount:5000,deletedAt:"2026-08-05T12:00:00.000Z",updatedAt:"2026-08-05T12:00:00.000Z"}])});
  assert.ok(tryAutoMergeAll(local,remote).household.expenses[0].deletedAt,"the tombstone must survive");
});

t("rows added on both devices are unioned",()=>{
  const local=doc({household:hh([{id:"h1",name:"Rent",amount:5000,updatedAt:"2026-08-05T10:00:00.000Z"}])});
  const remote=doc({household:hh([{id:"h2",name:"Water",amount:300,updatedAt:"2026-08-05T11:00:00.000Z"}])});
  assert.strictEqual(tryAutoMergeAll(local,remote).household.expenses.length,2);
});

t("splitMine still resolves as a setting, not by household spread",()=>{
  const a=doc({fieldUpdatedAt:{"household.splitMine":"2026-08-05T12:00:00.000Z"}});
  a.household.splitMine=70;
  const b=doc({dataUpdatedAt:"2026-08-05T18:00:00.000Z"});
  assert.strictEqual(tryAutoMergeAll(b,a).household.splitMine,70,
    "the record merge must not clobber the per-field setting merge");
});

/* ── 3. household.expenses is a first-class conflict collection ─────────── */

t("household.expenses is in CONFLICT_COLLECTIONS",()=>{
  const e=CONFLICT_COLLECTIONS.find(c=>c.key==="household.expenses");
  assert.ok(e,"missing");
  assert.ok(typeof e.get==="function","nested collections need a get()");
  assert.ok(typeof e.nameOf==="function","needs a nameOf for the conflict list");
});

t("it is NOT hidden from Recently Deleted",()=>{
  assert.ok(!HIDE_FROM_RECENTLY_DELETED.has("household.expenses"),
    "it is restorable in principle, which is the whole point of adding it");
});

t("conflictArr reads nested and flat collections alike",()=>{
  const d=doc({expenses:[{id:"e1"}],household:hh([{id:"h1"}])});
  const flat=CONFLICT_COLLECTIONS.find(c=>c.key==="expenses");
  const nested=CONFLICT_COLLECTIONS.find(c=>c.key==="household.expenses");
  assert.strictEqual(conflictArr(flat,d).length,1);
  assert.strictEqual(conflictArr(nested,d).length,1);
  assert.deepEqual(conflictArr(nested,{}),[],"a missing household must not throw");
});

t("a household expense now counts toward the pending badge exactly once",()=>{
  const base=doc({household:hh([])});
  const local=doc({household:hh([{id:"h1",name:"Rent",amount:5000,updatedAt:"2026-08-05T10:00:00.000Z"}])});
  const{records}=countPendingChanges(local,base);
  assert.strictEqual(records,1,"double counting would mean it is listed twice");
});

t("every conflict collection is reachable on a real-shaped document",()=>{
  // catches a typo'd key or a broken get() silently never being diffed
  const d=doc();
  const unreachable=CONFLICT_COLLECTIONS.filter(c=>!Array.isArray(conflictArr(c,d)));
  assert.deepEqual(unreachable.map(c=>c.key),[]);
});

t("nameOf produces something readable for a household expense",()=>{
  const e=CONFLICT_COLLECTIONS.find(c=>c.key==="household.expenses");
  assert.ok(/Rent/.test(e.nameOf({name:"Rent",amount:5000})));
});

/* ── 4. per-category plan merge (build 3C-2) ────────────────────────────── */

const cat=(id,name,amount,over={})=>({id,name,amount,groupId:"g1",subs:[],
  trackExpenses:true,ord:over.ord!=null?over.ord:0,...over});
const planWith=(cats,over={})=>({id:"p1",owner:"me",name:"Aug",month:"Aug 2026",
  income:22000,groups:[{id:"g1",name:"Essentials",ord:0}],categories:cats,
  updatedAt:"2026-08-05T10:00:00.000Z",...over});

t("THE HEADLINE: two devices editing DIFFERENT categories both survive",()=>{
  // phone edited Groceries at 12:00; laptop edited Transport at 12:30
  const phone=doc({plans:[planWith([
    cat("c1","Groceries",3500,{ord:0,updatedAt:"2026-08-05T12:00:00.000Z"}),
    cat("c2","Transport",1000,{ord:1}),
  ],{updatedAt:"2026-08-05T12:00:00.000Z"})]});
  const laptop=doc({plans:[planWith([
    cat("c1","Groceries",3000,{ord:0}),
    cat("c2","Transport",1500,{ord:1,updatedAt:"2026-08-05T12:30:00.000Z"}),
  ],{updatedAt:"2026-08-05T12:30:00.000Z"})]});
  const m=tryAutoMergeAll(phone,laptop);
  const by=id=>m.plans[0].categories.find(c=>c.id===id);
  assert.strictEqual(by("c1").amount,3500,"the phone's Groceries edit was lost");
  assert.strictEqual(by("c2").amount,1500,"the laptop's Transport edit was lost");
});

t("...and the result is the same whichever device merges",()=>{
  const phone=doc({plans:[planWith([
    cat("c1","Groceries",3500,{ord:0,updatedAt:"2026-08-05T12:00:00.000Z"}),
    cat("c2","Transport",1000,{ord:1}),
  ],{updatedAt:"2026-08-05T12:00:00.000Z"})]});
  const laptop=doc({plans:[planWith([
    cat("c1","Groceries",3000,{ord:0}),
    cat("c2","Transport",1500,{ord:1,updatedAt:"2026-08-05T12:30:00.000Z"}),
  ],{updatedAt:"2026-08-05T12:30:00.000Z"})]});
  const a=tryAutoMergeAll(phone,laptop),b=tryAutoMergeAll(laptop,phone);
  assert.deepEqual(a.plans[0].categories.map(c=>c.amount).sort(),
                   b.plans[0].categories.map(c=>c.amount).sort(),
                   "the two devices must converge, or they resync forever");
});

t("the newer edit still wins when both change the SAME category",()=>{
  const a=doc({plans:[planWith([cat("c1","Groceries",3500,{updatedAt:"2026-08-05T12:00:00.000Z"})])]});
  const b=doc({plans:[planWith([cat("c1","Groceries",4000,{updatedAt:"2026-08-05T14:00:00.000Z"})])]});
  assert.strictEqual(tryAutoMergeAll(a,b).plans[0].categories[0].amount,4000);
  assert.strictEqual(tryAutoMergeAll(b,a).plans[0].categories[0].amount,4000,"order must not matter");
});

t("a category added on one device arrives without displacing the other's",()=>{
  const a=doc({plans:[planWith([cat("c1","Groceries",3000,{ord:0})])]});
  const b=doc({plans:[planWith([cat("c1","Groceries",3000,{ord:0}),
                                cat("c9","Gym",500,{ord:1,updatedAt:"2026-08-05T13:00:00.000Z"})])]});
  const m=tryAutoMergeAll(a,b);
  assert.strictEqual(m.plans[0].categories.length,2);
  assert.ok(m.plans[0].categories.find(c=>c.id==="c9"),"the new category was dropped");
});

t("a DELETE is not resurrected by the other device's stale copy",()=>{
  // this is exactly why categories had to be tombstoned before merging them
  const stale=doc({plans:[planWith([cat("c1","Groceries",3000,{ord:0}),
                                    cat("c2","Transport",1000,{ord:1})])]});
  const deleted=doc({plans:[planWith([
    cat("c1","Groceries",3000,{ord:0}),
    cat("c2","Transport",1000,{ord:1,deletedAt:"2026-08-05T13:00:00.000Z",updatedAt:"2026-08-05T13:00:00.000Z"}),
  ])]});
  const m=tryAutoMergeAll(stale,deleted);
  const c2=m.plans[0].categories.find(c=>c.id==="c2");
  assert.ok(c2&&c2.deletedAt,"the tombstone must win over an un-deleted stale copy");
  assert.strictEqual(livePlanView(m.plans[0]).categories.length,1,"and it must not be visible");
});

t("groups merge per record too",()=>{
  const a=doc({plans:[planWith([cat("c1","G",1)],{groups:[
    {id:"g1",name:"Essentials",ord:0,updatedAt:"2026-08-05T12:00:00.000Z"},{id:"g2",name:"Fun",ord:1}]})]});
  const b=doc({plans:[planWith([cat("c1","G",1)],{groups:[
    {id:"g1",name:"Essentials",ord:0},{id:"g2",name:"Leisure",ord:1,updatedAt:"2026-08-05T12:30:00.000Z"}]})]});
  const m=tryAutoMergeAll(a,b);
  const g=id=>m.plans[0].groups.find(x=>x.id===id);
  assert.strictEqual(g("g1").name,"Essentials");
  assert.strictEqual(g("g2").name,"Leisure","the rename was lost");
});

t("plan-level fields still resolve by the whole record",()=>{
  const a=doc({plans:[planWith([cat("c1","G",1)],{income:22000,updatedAt:"2026-08-05T12:00:00.000Z"})]});
  const b=doc({plans:[planWith([cat("c1","G",1)],{income:25000,updatedAt:"2026-08-05T14:00:00.000Z"})]});
  assert.strictEqual(tryAutoMergeAll(a,b).plans[0].income,25000);
});

t("a whole plan present on only one device survives",()=>{
  const a=doc({plans:[planWith([cat("c1","G",1)])]});
  const b=doc({plans:[planWith([cat("c1","G",1)]),
                      planWith([cat("c5","X",1)],{id:"p2",name:"Sep"})]});
  assert.strictEqual(tryAutoMergeAll(a,b).plans.length,2);
});

/* ── ordering survives the merge ────────────────────────────────────────── */

t("user-chosen category order survives a merge",()=>{
  // ids deliberately chosen so id-sort would give the WRONG order:
  // "zzz" must come first because its ord says so.
  const cats=[cat("zzz","First",1,{ord:0}),cat("aaa","Second",2,{ord:1})];
  const a=doc({plans:[planWith(cats)]});
  const b=doc({plans:[planWith(cats)]});
  const merged=livePlanView(tryAutoMergeAll(a,b).plans[0]);
  assert.deepEqual(merged.categories.map(c=>c.name),["First","Second"],
    "merging must not re-sort the envelope list by id");
});

t("livePlanView orders by ord, then id for stability",()=>{
  const p=livePlanView(planWith([cat("b","B",1,{ord:2}),cat("a","A",1,{ord:1}),cat("c","C",1,{ord:1})]));
  assert.deepEqual(p.categories.map(c=>c.id),["a","c","b"]);
});

t("a category with no ord sorts last, not first",()=>{
  const p=livePlanView(planWith([cat("a","A",1,{ord:undefined}),cat("b","B",1,{ord:0})]));
  assert.deepEqual(p.categories.map(c=>c.id),["b","a"]);
});

t("livePlanView returns the IDENTICAL object when there is nothing to do",()=>{
  // otherwise every render allocates a new plan and memo identity churns
  const p=planWith([cat("a","A",1,{ord:0}),cat("b","B",1,{ord:1})]);
  assert.strictEqual(livePlanView(p),p);
});

t("livePlanView hides tombstoned categories and groups",()=>{
  const p=livePlanView(planWith(
    [cat("a","A",1,{ord:0}),cat("b","B",1,{ord:1,deletedAt:"2026-08-05T00:00:00.000Z"})],
    {groups:[{id:"g1",name:"E",ord:0},{id:"g2",name:"Gone",ord:1,deletedAt:"2026-08-05T00:00:00.000Z"}]}));
  assert.deepEqual(p.categories.map(c=>c.id),["a"]);
  assert.deepEqual(p.groups.map(g=>g.id),["g1"]);
});

t("livePlanView tolerates a null plan and missing arrays",()=>{
  assert.strictEqual(livePlanView(null),null);
  // A plan can genuinely lack these arrays (clonePlanRecord notes migrate()
  // doesn't guarantee them). livePlanView must NOT normalise them into empty
  // arrays: that would allocate a fresh object on every render for such a
  // plan, which is exactly the identity churn the identical-object rule
  // exists to prevent. Every consumer already reads `plan.categories||[]`.
  const bare={id:"p1"};
  assert.strictEqual(livePlanView(bare),bare,"must hand back the same object");
  assert.deepEqual((livePlanView(bare).categories)||[],[],"the ||[] idiom still holds");
});

/* ── stamping ───────────────────────────────────────────────────────────── */

const NOW="2026-08-05T15:00:00.000Z";

t("stampPlanRecords stamps only what actually changed",()=>{
  const prev=planWith([cat("a","A",1,{ord:0}),cat("b","B",2,{ord:1})]);
  const next=JSON.parse(JSON.stringify(prev));
  next.categories[1].amount=99;
  const out=stampPlanRecords(prev,next,NOW);
  assert.ok(!out.categories[0].updatedAt,"untouched category must not be stamped");
  assert.strictEqual(out.categories[1].updatedAt,NOW);
});

t("an identical mutate returns the object untouched",()=>{
  const prev=planWith([cat("a","A",1,{ord:0})]);
  const next=JSON.parse(JSON.stringify(prev));
  assert.strictEqual(stampPlanRecords(prev,next,NOW),next);
});

t("a new category gets both a stamp and an ord after the existing ones",()=>{
  const prev=planWith([cat("a","A",1,{ord:0}),cat("b","B",1,{ord:1})]);
  const next=JSON.parse(JSON.stringify(prev));
  next.categories.push({id:"c",name:"C",amount:5,groupId:"g1",subs:[]});
  const out=stampPlanRecords(prev,next,NOW);
  const c=out.categories.find(x=>x.id==="c");
  assert.strictEqual(c.updatedAt,NOW);
  assert.strictEqual(c.ord,2,"a new category must sort after the existing ones");
});

t("stampPlanRecords does not mutate the previous plan",()=>{
  const prev=planWith([cat("a","A",1,{ord:0})]);
  const before=JSON.stringify(prev);
  const next=JSON.parse(JSON.stringify(prev));
  next.categories[0].amount=42;
  stampPlanRecords(prev,next,NOW);
  assert.strictEqual(JSON.stringify(prev),before);
});

/* ── regression guard ───────────────────────────────────────────────────── */

t("ordinary collections still merge as before",()=>{
  const a=doc(); a.expenses=[{id:"e1",name:"Coffee",amount:1,updatedAt:"2026-08-05T10:00:00.000Z"}];
  const b=doc(); b.expenses=[{id:"e2",name:"Gas",amount:2,updatedAt:"2026-08-05T11:00:00.000Z"}];
  assert.strictEqual(tryAutoMergeAll(a,b).expenses.length,2);
});

t("theme is still device-local",()=>{
  const local=doc({theme:"dark"});
  const remote=doc({theme:"light",dataUpdatedAt:"2026-08-05T20:00:00.000Z"});
  assert.strictEqual(tryAutoMergeAll(local,remote).theme,"dark");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
