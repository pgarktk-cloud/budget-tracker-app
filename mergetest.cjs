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
// the diff helpers that sit just past it.
const src=slice("function mergeArrayById(","function buildConflictDiff(");
vm.runInContext(src+`
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
  conflictArr,CONFLICT_COLLECTIONS,HIDE_FROM_RECENTLY_DELETED,countPendingChanges}=ctx;

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
