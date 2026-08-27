/* Salary reconciliation — planned vs actual for one bucket (v1.47.0, phase 6).

   Slices the real `reconcilePeriod` out of index.html and runs it in a vm, per
   CLAUDE.md — testing the shipped arithmetic, not a reimplementation.

   This is arithmetic over a CLASSIFIER, and that classifier has bitten three
   times already: `isExtraFunds` rows once made "salary not yet spent" go DOWN
   when money arrived; a deleted goal silently reclassified its whole history as
   transfers; and an installment payment funded from a category inverts the
   usual shape (`catId` is the category, `isTransfer` is false). Every one of
   those is a case below, because a planned-vs-actual sum that misclassifies a
   row does not crash — it just fails to balance, and the imbalance looks like a
   data problem rather than a classification one.

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

/* The same window installmenttest.cjs uses: it carries the date/bucket
   helpers, categoryEffectiveAmt and derivedInstallmentRowsFor, which is
   exactly what reconcilePeriod composes. Placing the new function inside this
   span rather than after it is deliberate. */
const ctx={};
vm.createContext(ctx);
vm.runInContext(
  slice("function daysInCalMonth(y,m){","/* Tracked-spending rollup for one owner")+`
this.reconcilePeriod=reconcilePeriod;
this.reconcileSentence=reconcileSentence;
this.categoryEffectiveAmt=categoryEffectiveAmt;
this.derivedInstallmentRowsFor=derivedInstallmentRowsFor;`,ctx);
const{reconcilePeriod,reconcileSentence,derivedInstallmentRowsFor}=ctx;

/* ── fixtures ─────────────────────────────────────────────────────────── */
const PP={me:{enabled:false,payday:28,actualStarts:{}},wife:{enabled:false,payday:1,actualStarts:{}}};
const BUCKET="2026-08";
const cat=(id,amount,over={})=>({id,name:id,amount,groupId:"g1",subs:[],trackExpenses:true,...over});
const untracked=(id,amount,over={})=>cat(id,amount,{trackExpenses:false,...over});
const plan=(cats,income=10000)=>({id:"p1",owner:"me",income,groups:[{id:"g1",name:"G"}],categories:cats});
const tx=(over={})=>({id:"e"+Math.random().toString(36).slice(2,8),amount:100,date:"2026-08-10",
  owner:"me",catId:"c1",...over});
const run=(over={})=>reconcilePeriod({plan:plan([cat("c1",1000)]),expenses:[],bucketKey:BUCKET,
  payPeriods:PP,owner:"me",goals:[],installments:[],installmentPayments:[],...over});
const lineOf=(r,k)=>r.lines.find(l=>l.key===k);

console.log("salary reconciliation (v1.47.0)");

/* ── 1. the invariant of record ───────────────────────────────────────── */

t("1 · the actual column still reconciles to the headline figure",()=>{
  /* The headline the sheet has always shown is
       income + extraFunds − tracked − transfers − goals
     and every line's `actual` must be exactly the term that fed it. If this
     ever fails, the sheet is showing a total its own rows don't add up to. */
  const r=run({plan:plan([cat("c1",1000),untracked("u1",2000)]),
    goals:[{id:"g9"}],
    expenses:[
      tx({amount:300}),                                       // tracked spend
      tx({amount:150,isExtraFunds:true}),                     // money IN
      tx({amount:500,isTransfer:true,catId:"u1"}),            // transfer out
      tx({amount:200,isTransfer:true,catId:"g9",goalId:"g9",goalContributionId:"gc1"}),
    ]});
  const a=k=>lineOf(r,k).actual;
  assert.strictEqual(a("tracked"),300);
  assert.strictEqual(a("extraFunds"),150);
  assert.strictEqual(a("transfers"),500);
  assert.strictEqual(a("goals"),200);
  assert.strictEqual(r.unaccounted,10000+150-300-500-200);
  // ...and the same figure recomputed straight from the lines
  const fromLines=r.lines.reduce((s,l)=>s+l.sign*(l.actual||0),0);
  assert.strictEqual(fromLines,r.unaccounted,"the rows must add up to the total");
});

/* ── 2. extra funds ───────────────────────────────────────────────────── */

t("2 · an isExtraFunds row raises income and is never spending",()=>{
  // The defect this pins: treating these as spend made "salary not yet spent"
  // go DOWN when a spouse sent money.
  const r=run({expenses:[tx({amount:400,isExtraFunds:true,catId:"c1"})]});
  assert.strictEqual(lineOf(r,"extraFunds").actual,400);
  assert.strictEqual(lineOf(r,"tracked").actual,0,"extra funds are not spending");
  assert.strictEqual(r.unaccounted,10400);
  // and they have NO planned figure — inventing 0 would report every gift as
  // an overshoot
  assert.strictEqual(lineOf(r,"extraFunds").planned,null);
  assert.strictEqual(lineOf(r,"extraFunds").comparable,false);
  assert.strictEqual(lineOf(r,"extraFunds").delta,null);
});

/* ── 3. goals are inside the untracked allocation ─────────────────────── */

t("3 · a goal-linked category is NOT counted by both lines",()=>{
  /* The untracked envelope carrying a goalId allocates money that will leave
     as a goal contribution. It is inside the untracked total, so Transfers out
     must exclude it or the plan appears to allocate it twice. */
  const r=run({plan:plan([untracked("sav",2000),untracked("gcat",800,{goalId:"g9"})]),
    goals:[{id:"g9"}],
    expenses:[tx({amount:800,isTransfer:true,catId:"gcat",goalId:"g9",goalContributionId:"gc1"})]});
  assert.strictEqual(lineOf(r,"goals").planned,800,"the goal line claims its own allocation");
  assert.strictEqual(lineOf(r,"transfers").planned,2000,"...and Transfers out must not claim it too");
  assert.strictEqual(lineOf(r,"goals").actual,800);
  assert.strictEqual(lineOf(r,"transfers").actual,0);
  // the two planned figures together are the whole untracked allocation, once
  assert.strictEqual(lineOf(r,"goals").planned+lineOf(r,"transfers").planned,2800);
});

t("3b · a goalId naming a goal that no longer exists degrades to a transfer",()=>{
  // Deliberate: an orphaned link is not a goal contribution. It lands in
  // Transfers out AND in `unmatched`, since no live envelope describes it.
  const r=run({plan:plan([untracked("sav",2000)]),goals:[],
    expenses:[tx({amount:300,isTransfer:true,catId:"gone",goalId:"gone"})]});
  assert.strictEqual(lineOf(r,"goals").actual,0);
  assert.strictEqual(lineOf(r,"transfers").actual,300);
  assert.strictEqual(r.unmatched,300);
});

/* ── 4 & 5. installments, both shapes ─────────────────────────────────── */

const INST=[{id:"i1",owner:"me",name:"Phone",provider:"tabby",includeInBudget:true,status:"active"}];
const pay=(over={})=>({id:"p1",installmentId:"i1",owner:"me",sequence:1,
  dueDate:"2026-08-12",scheduledAmount:500,status:"upcoming",...over});

t("4 · an ordinary installment payment is a transfer, planned from the schedule",()=>{
  const r=run({plan:plan([cat("c1",1000),untracked("sav",2000)]),
    installments:INST,installmentPayments:[pay()],
    expenses:[tx({amount:500,isTransfer:true,catId:"i1",
      installmentId:"i1",installmentPaymentId:"p1"})]});
  assert.strictEqual(lineOf(r,"transfers").actual,500);
  assert.strictEqual(lineOf(r,"transfers").planned,2000+500,
    "the schedule's row is part of what was planned to leave");
  assert.strictEqual(r.installmentPlanned,500);
  assert.strictEqual(r.unmatched,0,"an installment row is matched by its schedule, not by an envelope");
});

t("5 · a payment funded from a category is TRACKED, and leaves installmentTotal",()=>{
  /* The one case where the usual shape inverts: catId is the category,
     isTransfer is false. Both halves must move together — the ledger row stops
     being a transfer AND the derived row drops out of the planned total — or
     the same money is allocated twice. */
  const r=run({plan:plan([cat("shopping",1000),untracked("sav",2000)]),
    installments:INST,
    installmentPayments:[pay({status:"paid",fundedCatId:"shopping",actualAmount:500})],
    expenses:[tx({amount:500,catId:"shopping",installmentId:"i1",installmentPaymentId:"p1"})]});
  assert.strictEqual(lineOf(r,"tracked").actual,500,"it consumes the envelope");
  assert.strictEqual(lineOf(r,"transfers").actual,0);
  assert.strictEqual(r.installmentPlanned,0,"fundedElsewhere drops it from the planned transfers");
  assert.strictEqual(lineOf(r,"transfers").planned,2000,"...so Transfers out is the envelopes alone");
  assert.strictEqual(lineOf(r,"tracked").planned,1000,"and the envelope was already planned");
});

/* ── 6. the plan a past period actually had ───────────────────────────── */

t("6 · a past bucket reconciles against ITS plan, not today's",()=>{
  /* The caller resolves the plan; this asserts the function uses what it is
     handed and never reaches for a current one. A period that materialised its
     own plan is the whole reason the sheet is worth showing for a past month. */
  const past=plan([cat("c1",400)],6000);
  const now=plan([cat("c1",900)],10000);
  const rPast=run({plan:past,expenses:[tx({amount:500})]});
  const rNow=run({plan:now,expenses:[tx({amount:500})]});
  assert.strictEqual(rPast.income,6000);
  assert.strictEqual(lineOf(rPast,"tracked").planned,400);
  assert.strictEqual(lineOf(rPast,"tracked").delta,100,"overspent against the plan of the time");
  assert.strictEqual(lineOf(rNow,"tracked").delta,-400,"the same actuals read differently against today's plan");
});

/* ── 7. money the plan never described ────────────────────────────────── */

t("7 · a transfer against a deleted category is reported, not absorbed",()=>{
  const r=run({plan:plan([untracked("sav",2000)]),
    expenses:[tx({amount:300,isTransfer:true,catId:"deleted-cat"})]});
  assert.strictEqual(lineOf(r,"transfers").actual,300);
  assert.strictEqual(r.unmatched,300,"the sheet must be able to say what the excess is");
  assert.strictEqual(lineOf(r,"transfers").planned,2000,
    "and the planned side must not invent an envelope for it");
});

t("7b · a transfer against a category that is now TRACKED counts as unmatched",()=>{
  // The category exists but is on the other side of the tracked test, so the
  // untracked planned figure does not describe it either.
  const r=run({plan:plan([cat("c1",1000),untracked("sav",2000)]),
    expenses:[tx({amount:250,isTransfer:true,catId:"c1"})]});
  assert.strictEqual(r.unmatched,250);
});

/* ── 8. legacy rows ───────────────────────────────────────────────────── */

t("8 · a pre-v1.27.0 contribution with no goalId still classifies by catId",()=>{
  const r=run({plan:plan([untracked("sav",2000)]),goals:[{id:"g9"}],
    expenses:[tx({amount:400,isTransfer:true,catId:"g9"})]});   // no goalId
  assert.strictEqual(lineOf(r,"goals").actual,400,"the catId fallback must survive");
  assert.strictEqual(lineOf(r,"transfers").actual,0);
  assert.strictEqual(r.unmatched,0);
});

/* ── 9. it must not touch anything ────────────────────────────────────── */

t("9 · the function reads the clock, the plan writer and setData never",()=>{
  const src=slice("function reconcilePeriod({","\n/* The one sentence above the table");
  for(const forbidden of ["editPlanForMonth","setData","Date.now","new Date","todayISO","localStorage"])
    assert.ok(!src.includes(forbidden),
      `reconcilePeriod must not reference ${forbidden} — viewing a period may not change one`);
  // and it must compose the existing helpers rather than re-deriving them
  assert.ok(src.includes("categoryEffectiveAmt"),"the effective-amount rule is stated once, elsewhere");
  assert.ok(src.includes("derivedInstallmentRowsFor"),"the installment planned figure must reuse the derived rows");
  assert.ok(src.includes("fundedElsewhere"),"...including the rule that drops a funded row");
});

/* ── the sentence ─────────────────────────────────────────────────────── */

const fmt=n=>`SAR ${Math.round(n)}`;

t("10 · the sentence reports spending and saving separately",()=>{
  /* They net out to the same headline, so a single figure would call a period
     that overspent AND under-saved by equal amounts "fine". */
  const r=run({plan:plan([cat("c1",1000),untracked("sav",2000)]),
    expenses:[tx({amount:1250}),tx({amount:1700,isTransfer:true,catId:"sav"})]});
  const s=reconcileSentence(r,fmt);
  assert.ok(/spent SAR 250 more/.test(s),s);
  assert.ok(/set aside SAR 300 less/.test(s),s);
});

t("10b · nothing worth saying is said plainly",()=>{
  const r=run({plan:plan([cat("c1",1000)]),expenses:[tx({amount:1000})]});
  assert.strictEqual(reconcileSentence(r,fmt),"This period went broadly as planned.");
  // sub-unit drift is rounding, not news
  const r2=run({plan:plan([cat("c1",1000)]),expenses:[tx({amount:1000.4})]});
  assert.strictEqual(reconcileSentence(r2,fmt),"This period went broadly as planned.");
});

t("11 · an empty period is all zeroes, not NaN",()=>{
  const r=reconcilePeriod({plan:null,expenses:null,bucketKey:BUCKET,payPeriods:PP,
    owner:"me",goals:null,installments:null,installmentPayments:null});
  assert.strictEqual(r.income,0);
  assert.strictEqual(r.unaccounted,0);
  assert.strictEqual(r.unmatched,0);
  r.lines.forEach(l=>assert.ok(l.actual===0||l.actual===null||Number.isFinite(l.actual),
    `${l.key} actual is ${l.actual}`));
});

t("12 · a carryover row is never income, spend, transfer or unaccounted",()=>{
  // Baseline: one real spend of 300 against a 1000 tracked category.
  const base=run({plan:plan([cat("c1",1000)]),expenses:[tx({amount:300})]});
  // Same, plus a carryover row bringing 200 of last month's leftover forward.
  const withCarry=run({plan:plan([cat("c1",1000)]),
    expenses:[tx({amount:300}),tx({amount:200,isCarryover:true})]});
  // Carryover must not touch ANY reconciliation figure — it is not real money.
  assert.strictEqual(lineOf(withCarry,"extraFunds").actual,lineOf(base,"extraFunds").actual,
    "carryover leaked into extra-funds income");
  assert.strictEqual(lineOf(withCarry,"tracked").actual,lineOf(base,"tracked").actual,
    "carryover counted as tracked spend");
  assert.strictEqual(lineOf(withCarry,"transfers").actual,lineOf(base,"transfers").actual,
    "carryover counted as a transfer");
  assert.strictEqual(withCarry.unaccounted,base.unaccounted,"carryover changed unaccounted");
  assert.strictEqual(withCarry.unmatched,base.unmatched,"carryover changed unmatched");
});
t("12b · a NEGATIVE carryover is likewise ignored by reconciliation",()=>{
  const base=run({plan:plan([cat("c1",1000)]),expenses:[tx({amount:300})]});
  const withNeg=run({plan:plan([cat("c1",1000)]),
    expenses:[tx({amount:300}),tx({amount:-150,isCarryover:true})]});
  assert.strictEqual(withNeg.unaccounted,base.unaccounted,"negative carryover changed unaccounted");
  assert.strictEqual(lineOf(withNeg,"tracked").actual,lineOf(base,"tracked").actual,
    "negative carryover moved tracked spend");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
