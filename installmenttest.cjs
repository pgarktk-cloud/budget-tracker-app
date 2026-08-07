/* Unit-test the Installments module without a browser.

   Slices the real module-scope helpers, the real apply* state transactions,
   the real migrate()/fingerprint()/tryAutoMergeAll and the real Expenses
   classifier out of index.html and runs them in a vm context, per CLAUDE.md —
   so this tests the shipped code rather than a copy of the logic.

   The contract being tested:
     • the schedule owns planned timing; Budget only DERIVES from it and never
       materialises a plan just because a month was viewed
     • Expenses owns actual cash movement, one ledger row per real payment
     • links are installment/payment ids, never names or plan category ids
     • balances, progress, "next payment" and "overdue" are derived on read
     • "household" is not an installment owner, and me/wife never cross
     • early payoff and cancel remove FUTURE planning only; paid history stands
     • adding the feature is a byte-equivalent no-op for an existing document

   Three vm traps: assert.deepStrictEqual compares prototypes and fails across
   realms (use deepEqual); slice markers are plain indexOf on source text, so
   assert they were found; and top-level `const` bindings don't attach to the
   context — only function declarations do — so hand those over explicitly. */
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
const clone=x=>JSON.parse(JSON.stringify(x));

/* ── one context holding period helpers + installments + sync machinery ──
   The period/bucket helpers are sliced in with the installment ones rather
   than stubbed: "which pay period does this due date fall in" is half of what
   the derived Budget rows are, and a stub would test the stub. */
const ctx={};
vm.createContext(ctx);
Object.assign(ctx,{
  // migrate()'s two escape hatches; neither is on any path under test here
  defaultData:()=>({}),
  uid:()=>"stub",
});
vm.runInContext(
  slice("function daysInCalMonth(y,m){","/* Tracked-spending rollup for one owner")+"\n"+
  slice("const sortedById=arr=>",'/* "Did a *person* change anything?"')+"\n"+
  slice("function mergeArrayById(","/* Reports what's different between local and remote")+"\n"+
  slice("function migrate(d){","/* Bills Reserve = opening baseline")+`
this.INSTALLMENT_ROUND_TOL=INSTALLMENT_ROUND_TOL;
this.INSTALLMENT_PROVIDERS=INSTALLMENT_PROVIDERS;
this.installmentPaymentIsOpen=installmentPaymentIsOpen;
this.sortedById=sortedById; this.fingerprint=fingerprint;
this.dateToKey=dateToKey;`,ctx);

const{
  generateInstallmentSchedule,scheduleTotal,scheduleDiff,addMonthsISO,roundTo,
  installmentsForOwner,installmentPaymentsFor,installmentPaymentDerivedStatus,
  installmentRemainingBalance,installmentPaidTotal,installmentProgress,
  installmentNextPayment,installmentExpectedCompletion,installmentDerivedStatus,
  installmentSummary,derivedInstallmentRowsFor,installmentRowId,
  applyInstallmentCreate,applyInstallmentUpdate,applyInstallmentPayment,
  applyInstallmentExpenseEdit,applyInstallmentExpenseDelete,applyInstallmentExpenseRestore,
  applyInstallmentPayoff,applyInstallmentCancel,applyInstallmentDelete,
  applyInstallmentRestore,applyInstallmentUnlink,
  bucketKeyFor,fingerprint,migrate,tryAutoMergeAll,INSTALLMENT_ROUND_TOL,
}=ctx;

/* The Expenses hero's classifier, lifted out of its useMemo so the
   "installment payments are Transfers out, never spend, never counted twice"
   rule is asserted against the shipped reducer. */
const clsCtx={};
vm.createContext(clsCtx);
vm.runInContext("function classify(viewMonthExpenses,goals){\n"+
  slice("    let trackedSpend=0,untrackedTransfers=0,goalContribs=0,extraFunds=0;",
        "  },[viewMonthExpenses,goals]);")+"\n}",clsCtx);
const classify=clsCtx.classify;

/* ── fixtures ─────────────────────────────────────────────────────────────
   Jastine ("me") is on pay periods with payday 28, so their August money runs
   Jul 28 – Aug 27; Charlene ("wife") is on calendar months. That asymmetry is
   the point: a due date must bucket by the OWNER's periods, not the calendar. */
const PP={me:{enabled:true,payday:28,actualStarts:{}},
          wife:{enabled:false,payday:1,actualStarts:{}}};
const NOW="2026-08-02T09:00:00.000Z";
const TODAY="2026-08-02";

function seed(){
  return{currency:"SAR",expenses:[],installments:[],installmentPayments:[]};
}
/* 1,000 over 4 from 15 Aug for `me`, unless overridden. */
function withPlan(d,over={},rowsOver=null){
  const plan={id:"i1",owner:"me",name:"Office chair",provider:"tabby",
    customProviderName:"",purchaseDate:"2026-08-01",originalAmount:1000,
    currency:"SAR",includeInBudget:true,notes:"",...over};
  const rows=rowsOver||generateInstallmentSchedule({firstDueDate:"2026-08-15",count:4,total:1000});
  return applyInstallmentCreate(d,{plan,rows,now:NOW,ids:rows.map((_,i)=>`p${i+1}`)});
}
const paysOf=(d,id)=>installmentPaymentsFor(d.installmentPayments,id);
const live=arr=>(arr||[]).filter(x=>!x.deletedAt);

console.log("\nschedule generation\n");

t("1 · an equal split produces N rows a month apart, summing to the total",()=>{
  const rows=generateInstallmentSchedule({firstDueDate:"2026-08-15",count:4,total:1000});
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(r=>r.dueDate),["2026-08-15","2026-09-15","2026-10-15","2026-11-15"]);
  assert.deepEqual(rows.map(r=>r.sequence),[1,2,3,4]);
  assert.deepEqual(rows.map(r=>r.scheduledAmount),[250,250,250,250]);
  assert.equal(roundTo(scheduleTotal(rows),2),1000);
});

t("2 · an unavoidable rounding remainder lands in the FINAL payment",()=>{
  const rows=generateInstallmentSchedule({firstDueDate:"2026-08-15",count:3,total:1000});
  assert.deepEqual(rows.map(r=>r.scheduledAmount),[333.33,333.33,333.34]);
  assert.equal(roundTo(scheduleTotal(rows),2),1000);
  // and the other direction, where the rounded share is too big
  const up=generateInstallmentSchedule({firstDueDate:"2026-08-15",count:3,total:1000.01});
  assert.equal(roundTo(scheduleTotal(up),2),1000.01);
  assert.ok(up[2].scheduledAmount<=up[0].scheduledAmount);
});

t("2b · a month-end first due date clamps without drifting",()=>{
  // stepping from the FIRST date each time, not iteratively, is what keeps
  // the 31st coming back after February
  const rows=generateInstallmentSchedule({firstDueDate:"2026-01-31",count:4,total:400});
  assert.deepEqual(rows.map(r=>r.dueDate),["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]);
  assert.equal(addMonthsISO("2026-01-31",1),"2026-02-28");
});

t("3 · hand-typed uneven amounts are kept exactly and still validate",()=>{
  const rows=[{sequence:1,dueDate:"2026-08-15",scheduledAmount:249.75},
              {sequence:2,dueDate:"2026-09-15",scheduledAmount:249.75},
              {sequence:3,dueDate:"2026-10-15",scheduledAmount:249.74},
              {sequence:4,dueDate:"2026-11-15",scheduledAmount:250.76}];
  const chk=scheduleDiff(1000,rows);
  assert.equal(chk.ok,true);
  assert.equal(chk.scheduledTotal,1000);
  assert.equal(chk.difference,0);
  // a real disagreement blocks Save, and says by how much
  const bad=scheduleDiff(1000,rows.slice(0,3));
  assert.equal(bad.ok,false);
  assert.equal(bad.difference,-250.76);
  // …but float noise inside the tolerance does not
  assert.equal(scheduleDiff(1000,[{scheduledAmount:1000.001}]).ok,true);
  // creating with those exact rows stores them untouched
  const d=withPlan(seed(),{},rows);
  assert.deepEqual(paysOf(d,"i1").map(p=>p.scheduledAmount),[249.75,249.75,249.74,250.76]);
});

console.log("\nderived figures\n");

t("4 · remaining balance derives from unpaid rows only",()=>{
  let d=withPlan(seed());
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),1000);
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),750);
  d=applyInstallmentCancel(d,{installmentId:"i1",now:NOW});
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),0);
  // nothing anywhere stores it
  assert.ok(!("remainingBalance"in d.installments[0]));
  assert.ok(!("progress"in d.installments[0]));
  assert.ok(!("paymentsRemaining"in d.installments[0]));
});

t("4b · progress counts payment state, not elapsed months",()=>{
  let d=withPlan(seed());
  assert.deepEqual(installmentProgress(paysOf(d,"i1")),{paid:0,total:4,closed:0,pct:0});
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentPayment(d,{paymentId:"p2",actualAmount:250,paidDate:"2026-08-16",now:NOW,expenseId:"e2"});
  // two paid on the same day, three months before the schedule says so
  const pr=installmentProgress(paysOf(d,"i1"));
  assert.equal(pr.paid,2);assert.equal(pr.pct,50);
  assert.equal(installmentPaidTotal(paysOf(d,"i1")),500);
});

t("5 · next payment is the earliest unpaid due date",()=>{
  let d=withPlan(seed());
  assert.equal(installmentNextPayment(paysOf(d,"i1"),TODAY).id,"p1");
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  assert.equal(installmentNextPayment(paysOf(d,"i1"),TODAY).id,"p2");
  // paying out of order still points at the earliest one still open
  d=applyInstallmentPayment(d,{paymentId:"p4",actualAmount:250,paidDate:"2026-08-16",now:NOW,expenseId:"e4"});
  assert.equal(installmentNextPayment(paysOf(d,"i1"),TODAY).id,"p2");
  assert.equal(installmentExpectedCompletion(paysOf(d,"i1")),"2026-10-15");
});

t("6 · overdue is derived and never written to the record",()=>{
  const d=withPlan(seed(),{},[{sequence:1,dueDate:"2026-07-01",scheduledAmount:500},
                              {sequence:2,dueDate:"2026-09-01",scheduledAmount:500}]);
  const pays=paysOf(d,"i1");
  assert.equal(installmentPaymentDerivedStatus(pays[0],TODAY),"overdue");
  assert.equal(installmentPaymentDerivedStatus(pays[1],TODAY),"upcoming");
  // the schedule underneath is untouched — no stored "overdue" anywhere
  assert.deepEqual(pays.map(p=>p.status),["upcoming","upcoming"]);
  assert.deepEqual(pays.map(p=>p.dueDate),["2026-07-01","2026-09-01"]);
  assert.deepEqual(pays.map(p=>p.scheduledAmount),[500,500]);
  // and it moves with the clock without any write
  assert.equal(installmentPaymentDerivedStatus(pays[1],"2026-09-02"),"overdue");
  assert.equal(installmentSummary(d.installments,d.installmentPayments,"me",{todayStr:TODAY}).overdueCount,1);
});

t("6b · derived plan status: active → completed without a second write",()=>{
  let d=withPlan(seed(),{},[{sequence:1,dueDate:"2026-08-15",scheduledAmount:1000}]);
  assert.equal(installmentDerivedStatus(d.installments[0],paysOf(d,"i1")),"active");
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:1000,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  assert.equal(d.installments[0].status,"active");                        // stored
  assert.equal(installmentDerivedStatus(d.installments[0],paysOf(d,"i1")),"completed"); // derived
});

console.log("\nownership\n");

t("7 · an installment belongs to one real person, never to household",()=>{
  let d=withPlan(seed());
  d=withPlan(d,{id:"i2",owner:"wife",name:"Phone"});
  assert.deepEqual(installmentsForOwner(d.installments,"me").map(x=>x.id),["i1"]);
  assert.deepEqual(installmentsForOwner(d.installments,"wife").map(x=>x.id),["i2"]);
  // household is a view across the app, not an installment owner
  assert.deepEqual(installmentsForOwner(d.installments,"household"),[]);
  // and migrate() refuses to keep one that says otherwise
  const m=migrate({currency:"SAR",installments:[{id:"x",owner:"household"}],installmentPayments:[]});
  assert.equal(m.installments[0].owner,"me");
});

t("18 · me and wife data never cross",()=>{
  let d=withPlan(seed());
  d=withPlan(d,{id:"i2",owner:"wife",name:"Phone",originalAmount:400},
    generateInstallmentSchedule({firstDueDate:"2026-08-15",count:2,total:400}));
  // the second create reuses p1..pN ids, so give the wife's rows their own
  d.installmentPayments=d.installmentPayments.map((p,i)=>
    p.installmentId==="i2"?{...p,id:"w"+i,owner:"wife"}:p);
  const meSum=installmentSummary(d.installments,d.installmentPayments,"me",
    {bucketKey:"2026-07-28",payPeriods:PP,todayStr:TODAY});
  const wifeSum=installmentSummary(d.installments,d.installmentPayments,"wife",
    {bucketKey:"2026-08",payPeriods:PP,todayStr:TODAY});
  assert.equal(meSum.remaining,1000);
  assert.equal(wifeSum.remaining,400);
  assert.equal(meSum.activeCount,1);
  assert.equal(wifeSum.activeCount,1);
  // one owner's rows never appear in the other's Budget group
  const meRows=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP);
  const wifeRows=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"wife","2026-08",PP);
  assert.deepEqual(meRows.map(r=>r.installmentId),["i1"]);
  assert.deepEqual(wifeRows.map(r=>r.installmentId),["i2"]);
});

console.log("\nderived Budget rows\n");

t("8 · inclusion uses the owner's pay-period bucket, not the calendar month",()=>{
  const d=withPlan(seed(),{},[{sequence:1,dueDate:"2026-08-05",scheduledAmount:500},
                              {sequence:2,dueDate:"2026-09-05",scheduledAmount:500}]);
  // payday 28 ⇒ 5 Aug belongs to the period that began 28 Jul
  assert.equal(bucketKeyFor("2026-08-05",PP,"me"),"2026-07-28");
  const inPeriod=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP);
  assert.equal(inPeriod.length,1);
  assert.equal(inPeriod[0].amount,500);
  // the calendar-month key finds nothing for this owner
  assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-08",PP).length,0);
  // a calendar-month owner buckets the same date as "2026-08"
  const w=clone(d);
  w.installments[0].owner="wife";w.installmentPayments.forEach(p=>{p.owner="wife";});
  assert.equal(derivedInstallmentRowsFor(w.installments,w.installmentPayments,"wife","2026-08",PP).length,1);
});

t("9 · a payment appears only in the period it is due in",()=>{
  const d=withPlan(seed());   // 15 Aug, 15 Sep, 15 Oct, 15 Nov
  const at=k=>derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me",k,PP);
  assert.equal(at("2026-06-28").length,0);
  assert.equal(at("2026-07-28").length,1);   // 15 Aug
  assert.equal(at("2026-08-28").length,1);   // 15 Sep
  assert.equal(at("2026-11-28").length,0);   // past the end
  // never the outstanding balance — one period, one payment
  assert.equal(at("2026-07-28")[0].amount,250);
  // stable synthetic ids, derived from the PAYMENT id and never a plan category
  assert.equal(at("2026-07-28")[0].id,installmentRowId("p1"));
  assert.equal(at("2026-07-28")[0].paymentId,"p1");
  // includeInBudget:false keeps the plan but drops it out of Budget entirely
  const off=clone(d);off.installments[0].includeInBudget=false;
  assert.equal(derivedInstallmentRowsFor(off.installments,off.installmentPayments,"me","2026-07-28",PP).length,0);
});

t("9b · the planned figure stays the SCHEDULED amount after an odd payment",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:262.4,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  const row=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP)[0];
  assert.equal(row.amount,250);          // what was planned
  assert.equal(row.actualAmount,262.4);  // what happened, alongside it
  assert.equal(paysOf(d,"i1")[0].scheduledAmount,250);
});

t("10 · deriving Budget rows cannot write or clone a plan",()=>{
  // the derivation itself is pure
  const fn=slice("function derivedInstallmentRowsFor(","function installmentSummary(");
  assert.ok(!/setData|editPlanForMonth|clonePlanForMonth/.test(fn));
  // …and so is the whole path BudgetView uses to build and render them
  const memo=slice("  const installmentRows=useMemo(()=>derivedInstallmentRowsFor(","  /* month-scoped totals */");
  assert.ok(!/setData|editPlanForMonth|clonePlanForMonth|assignPlanToMonth/.test(memo));
  const render=slice("      {/* ── Derived Installments group ──","        <button onClick={addGroup}");
  assert.ok(!/editPlanForMonth|updateCat|addCat|removeCat|NumField/.test(render),
    "derived rows must be read-only: no plan mutator and no editable field");
  // and the rows carry no plan-category id to be mistaken for one
  const rows=derivedInstallmentRowsFor(withPlan(seed()).installments,
    withPlan(seed()).installmentPayments,"me","2026-07-28",PP);
  assert.ok(rows.every(r=>String(r.id).startsWith("inst:")));
});

console.log("\nrecording payments\n");

t("11 · one real payment creates exactly one linked transfer",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  assert.equal(live(d.expenses).length,1);
  const e=d.expenses[0];
  assert.equal(e.isTransfer,true);
  assert.equal(e.isExtraFunds,false);
  assert.equal(e.installmentId,"i1");
  assert.equal(e.installmentPaymentId,"p1");
  assert.equal(e.catId,"i1");
  assert.equal(e.owner,"me");
  assert.equal(e.amount,250);
  const p=paysOf(d,"i1")[0];
  assert.equal(p.status,"paid");
  assert.equal(p.actualAmount,250);
  assert.equal(p.paidDate,"2026-08-15");
  assert.equal(p.expenseId,"e1");
  // recording the same payment twice must not produce a second ledger row
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:260,paidDate:"2026-08-16",now:NOW,expenseId:"e9"});
  assert.equal(live(d.expenses).length,1);
  assert.equal(live(d.expenses)[0].amount,260);
  assert.equal(paysOf(d,"i1")[0].actualAmount,260);
});

t("11b · actual and scheduled are stored separately",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:249.4,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  const p=paysOf(d,"i1")[0];
  assert.equal(p.scheduledAmount,250);
  assert.equal(p.actualAmount,249.4);
  assert.equal(d.expenses[0].amount,249.4);
  // and the rest of the schedule is NOT redistributed
  assert.deepEqual(paysOf(d,"i1").slice(1).map(x=>x.scheduledAmount),[250,250,250]);
});

t("12 · editing the linked transaction updates its payment",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentExpenseEdit(d,{expenseId:"e1",amount:271.5,date:"2026-08-18",now:NOW});
  const p=paysOf(d,"i1")[0];
  assert.equal(p.actualAmount,271.5);
  assert.equal(p.paidDate,"2026-08-18");
  assert.equal(p.scheduledAmount,250);          // the plan is not rewritten
  // owner and both link fields are untouchable through this path
  assert.equal(d.expenses[0].owner,"me");
  assert.equal(d.expenses[0].installmentId,"i1");
  assert.equal(d.expenses[0].installmentPaymentId,"p1");
});

t("13 · deleting the transaction reopens the payment; restoring re-settles it",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentExpenseDelete(d,{expenseId:"e1",now:NOW});
  let p=paysOf(d,"i1")[0];
  assert.equal(p.status,"upcoming");
  assert.equal(p.actualAmount,undefined);
  assert.equal(p.paidDate,undefined);
  assert.equal(p.expenseId,undefined);
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),1000);
  // tombstoned, never spliced — and the links survive on the deleted row so a
  // restore can find the same payment after a merge round-trip
  assert.equal(d.expenses.length,1);
  assert.ok(d.expenses[0].deletedAt);
  assert.equal(d.expenses[0].installmentPaymentId,"p1");
  d=applyInstallmentExpenseRestore(d,{expenseId:"e1",now:NOW});
  p=paysOf(d,"i1")[0];
  assert.equal(p.status,"paid");
  assert.equal(p.actualAmount,250);
  assert.equal(p.paidDate,"2026-08-15");
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),750);
});

t("13b · unlinking keeps the transaction and reopens the payment",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentUnlink(d,{expenseId:"e1",now:NOW});
  assert.equal(live(d.expenses).length,1);
  assert.equal(d.expenses[0].installmentId,undefined);
  assert.equal(d.expenses[0].installmentPaymentId,undefined);
  assert.equal(paysOf(d,"i1")[0].status,"upcoming");
});

console.log("\nearly payoff, cancel, delete\n");

t("14 · early payoff makes ONE transaction and clears future planning",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentPayoff(d,{installmentId:"i1",payoffDate:"2026-08-20",amount:735,
    note:"settled",now:NOW,expenseId:"x1"});
  // one row for the whole payoff, not one per cancelled payment
  assert.equal(live(d.expenses).length,2);
  const x=d.expenses.find(e=>e.id==="x1");
  assert.equal(x.installmentPayoff,true);
  assert.equal(x.installmentId,"i1");
  assert.equal(x.installmentPaymentId,undefined);
  assert.equal(x.isTransfer,true);
  assert.equal(x.amount,735);
  assert.equal(d.installments[0].status,"paidOffEarly");
  assert.equal(d.installments[0].payoffExpenseId,"x1");
  // the paid one stands; the future three close but keep what was planned
  const pays=paysOf(d,"i1");
  assert.deepEqual(pays.map(p=>p.status),["paid","cancelled","cancelled","cancelled"]);
  assert.deepEqual(pays.slice(1).map(p=>p.scheduledAmount),[250,250,250]);
  assert.deepEqual(pays.slice(1).map(p=>p.dueDate),["2026-09-15","2026-10-15","2026-11-15"]);
  assert.ok(pays.slice(1).every(p=>p.cancelledBy==="payoff"&&p.payoffExpenseId==="x1"));
  // future Budget rows are gone; the paid period keeps its history
  assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-08-28",PP).length,0);
  assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-09-28",PP).length,0);
  assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP).length,1);
  assert.equal(installmentRemainingBalance(null,pays),0);
});

t("14b · deleting the payoff transaction restores the plan exactly",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentPayoff(d,{installmentId:"i1",payoffDate:"2026-08-20",amount:750,now:NOW,expenseId:"x1"});
  d=applyInstallmentExpenseDelete(d,{expenseId:"x1",now:NOW});
  assert.equal(d.installments[0].status,"active");
  assert.deepEqual(paysOf(d,"i1").map(p=>p.status),["paid","upcoming","upcoming","upcoming"]);
  assert.equal(installmentRemainingBalance(null,paysOf(d,"i1")),750);
  d=applyInstallmentExpenseRestore(d,{expenseId:"x1",now:NOW});
  assert.equal(d.installments[0].status,"paidOffEarly");
  assert.deepEqual(paysOf(d,"i1").map(p=>p.status),["paid","cancelled","cancelled","cancelled"]);
});

t("15 · a cancelled plan leaves future Budget groups and keeps paid history",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentCancel(d,{installmentId:"i1",now:NOW});
  assert.equal(d.installments[0].status,"cancelled");
  assert.deepEqual(paysOf(d,"i1").map(p=>p.status),["paid","cancelled","cancelled","cancelled"]);
  assert.ok(paysOf(d,"i1").slice(1).every(p=>p.cancelledBy==="plan"));
  ["2026-07-28","2026-08-28","2026-09-28","2026-10-28"].forEach(k=>
    assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me",k,PP).length,0,
      "a cancelled plan shows in no period: "+k));
  // no ledger row was created, and the recorded payment is untouched
  assert.equal(live(d.expenses).length,1);
  assert.equal(live(d.expenses)[0].amount,250);
  assert.equal(installmentDerivedStatus(d.installments[0],paysOf(d,"i1")),"cancelled");
});

t("15b · deleting tombstones the plan and its UNPAID rows, never the ledger",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentDelete(d,{installmentId:"i1",now:NOW});
  assert.ok(d.installments[0].deletedAt);
  assert.equal(d.installments.length,1);                       // soft, not spliced
  const paid=d.installmentPayments.find(p=>p.id==="p1");
  assert.ok(!paid.deletedAt,"a paid payment is history and stays");
  assert.ok(d.installmentPayments.filter(p=>p.id!=="p1").every(p=>p.deletedWith==="i1"));
  assert.equal(live(d.expenses).length,1,"the real transaction is never removed");
  assert.equal(installmentsForOwner(d.installments,"me").length,0);
  assert.equal(derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-08-28",PP).length,0);
  // restoring the plan brings back exactly the rows it took down
  d=applyInstallmentRestore(d,{installmentId:"i1",now:NOW});
  assert.equal(installmentsForOwner(d.installments,"me").length,1);
  assert.equal(paysOf(d,"i1").length,4);
  assert.ok(paysOf(d,"i1").every(p=>p.deletedWith===undefined));
});

console.log("\nediting the schedule\n");

t("a schedule edit rewrites open rows and refuses to touch paid ones",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentUpdate(d,{installmentId:"i1",patch:{name:"Desk chair"},
    rows:[{id:"p1",sequence:1,dueDate:"2026-08-15",scheduledAmount:999},   // ignored: paid
          {id:"p2",sequence:2,dueDate:"2026-09-20",scheduledAmount:400},
          {id:"p3",sequence:3,dueDate:"2026-10-20",scheduledAmount:350}],
    ids:[],now:NOW});
  assert.equal(d.installments[0].name,"Desk chair");
  const pays=paysOf(d,"i1");
  assert.equal(pays.length,3);
  assert.equal(pays[0].scheduledAmount,250);           // paid row untouched
  assert.equal(pays[1].dueDate,"2026-09-20");
  assert.equal(pays[1].scheduledAmount,400);
  // p4 dropped out of the list, so it's tombstoned rather than spliced
  const p4=d.installmentPayments.find(p=>p.id==="p4");
  assert.ok(p4&&p4.deletedAt);
});

console.log("\nExpenses arithmetic\n");

t("19 · installment payments are Transfers out, counted exactly once",()=>{
  let d=withPlan(seed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e1"});
  d=applyInstallmentPayoff(d,{installmentId:"i1",payoffDate:"2026-08-20",amount:750,now:NOW,expenseId:"x1"});
  const rows=[...live(d.expenses),
    {id:"t1",catId:"c1",amount:100,isTransfer:false,isExtraFunds:false},   // real spend
    {id:"g1",catId:"goal1",amount:60,isTransfer:true},                     // goal contribution
    {id:"f1",catId:"c1",amount:40,isExtraFunds:true}];                     // money in
  const parts=classify(rows,[{id:"goal1"}]);
  assert.equal(parts.untrackedTransfers,1000);   // 250 payment + 750 payoff
  assert.equal(parts.trackedSpend,100);          // installments are NOT spend
  assert.equal(parts.goalContribs,60);
  assert.equal(parts.extraFunds,40);
  // the four buckets still partition the ledger exactly — nothing double-counted
  const total=rows.reduce((s,e)=>s+e.amount,0);
  assert.equal(parts.trackedSpend+parts.untrackedTransfers+parts.goalContribs+parts.extraFunds,total);
});

console.log("\nmigration and sync\n");

function baseDoc(){
  return{currency:"SAR",dataUpdatedAt:"2026-08-01T00:00:00.000Z",fieldUpdatedAt:{},
    expenses:[],goals:[],investments:[],banks:[],assets:[],targets:[],
    mp2DividendRates:[],plans:[],bills:[],billAdjustments:[],monthlyPlans:[],
    portHistory:[],history:[],snapshots:[],household:{splitMine:50,expenses:[]},
    installments:[],installmentPayments:[]};
}

t("17 · adding the feature is byte-identical for a document without one",()=>{
  const legacy=migrate(clone(baseDoc()));
  delete legacy.installments;delete legacy.installmentPayments;
  const before=fingerprint(clone(legacy));
  const after=fingerprint(migrate(clone(legacy)));
  assert.equal(before,after,"an existing document must not look dirty after the upgrade");
  // the arrays ARE created — they're just omitted from the fingerprint while empty
  const m=migrate(clone(legacy));
  assert.deepEqual(m.installments,[]);
  assert.deepEqual(m.installmentPayments,[]);
});

t("17b · migrate is idempotent and fills only safe defaults",()=>{
  const raw={...baseDoc(),
    installments:[{id:"i1",name:"Chair"}],
    installmentPayments:[{id:"pb",installmentId:"i1",dueDate:"2026-09-15",scheduledAmount:100},
                         {id:"pa",installmentId:"i1",dueDate:"2026-08-15",scheduledAmount:100}]};
  const once=migrate(clone(raw));
  assert.equal(once.installments[0].owner,"me");
  assert.equal(once.installments[0].status,"active");
  assert.equal(once.installments[0].includeInBudget,true);
  assert.equal(once.installments[0].currency,"SAR");
  // sequence backfills by due date, not array position
  assert.equal(once.installmentPayments.find(p=>p.id==="pa").sequence,1);
  assert.equal(once.installmentPayments.find(p=>p.id==="pb").sequence,2);
  // "not paid" must stay absent, the same way an expense's `ord` does
  assert.equal("actualAmount"in once.installmentPayments[0],false);
  assert.equal("paidDate"in once.installmentPayments[0],false);
  assert.equal(fingerprint(once),fingerprint(migrate(clone(once))));
});

t("16 · a soft-deleted installment does not resurrect after a merge",()=>{
  const withOne=withPlan({...baseDoc()});
  const remote=clone(withOne);
  remote.dataUpdatedAt="2026-08-01T00:00:00.000Z";
  const local=clone(withOne);
  local.dataUpdatedAt="2026-08-03T00:00:00.000Z";
  // later than the records' own creation stamp — mergeArrayById resolves per
  // record on updatedAt, not on which document is newer
  const deleted=applyInstallmentDelete(local,{installmentId:"i1",now:"2026-08-03T00:00:00.000Z"});
  const merged=tryAutoMergeAll(deleted,remote);
  assert.ok(merged,"the merge must succeed, not fall through to a conflict");
  assert.equal(merged.installments.length,1);
  assert.ok(merged.installments[0].deletedAt,"the tombstone must win over the older live copy");
  assert.equal(installmentsForOwner(merged.installments,"me").length,0);
  // the schedule tombstones survive too
  assert.ok(merged.installmentPayments.every(p=>p.deletedAt));
});

t("16b · a payment recorded on one device merges into the other",()=>{
  const base=withPlan({...baseDoc()});
  const local={...clone(base),dataUpdatedAt:"2026-08-03T00:00:00.000Z"};
  const remote={...clone(base),dataUpdatedAt:"2026-08-02T00:00:00.000Z"};
  const paid=applyInstallmentPayment(local,{paymentId:"p1",actualAmount:250,
    paidDate:"2026-08-15",now:"2026-08-03T00:00:00.000Z",expenseId:"e1"});
  const merged=tryAutoMergeAll(paid,remote);
  assert.ok(merged);
  assert.equal(merged.expenses.filter(e=>e.installmentPaymentId==="p1").length,1,
    "exactly one ledger row survives the merge");
  assert.equal(merged.installmentPayments.find(p=>p.id==="p1").status,"paid");
  assert.equal(installmentRemainingBalance(null,installmentPaymentsFor(merged.installmentPayments,"i1")),750);
});

/* ── Funding a payment from a budget category ──────────────────────────────
   The Tabby downpayment case: the first payment is due at purchase and comes
   out of an envelope that already has room this month, rather than being
   planned as its own Budget line.

   The whole feature is one optional field, and its correctness is entirely
   about the two halves moving TOGETHER — the ledger row stops being a transfer
   at the same moment the derived row stops allocating. Either half alone is a
   double-count or a hole. */
console.log("\nfunding a payment from a budget category\n");

/* A plan carrying a real Shopping category for `me`, so the resolver has
   something live to find. Owner-scoped by construction: `wife`'s plan holds a
   DIFFERENT category id, which is what test 24 leans on. */
function withCats(d){
  return{...d,plans:[
    {id:"pl1",owner:"me",name:"Monthly Salary",month:"2026-08",income:10000,
     groups:[{id:"g1",name:"Essentials"}],
     categories:[{id:"cShop",groupId:"g1",name:"Shopping"},
                 {id:"cGone",groupId:"g1",name:"Retired",deletedAt:"2026-07-01T00:00:00.000Z"}]},
    {id:"pl2",owner:"wife",name:"Monthly Salary",month:"2026-08",income:8000,
     groups:[{id:"g2",name:"Essentials"}],
     categories:[{id:"cHers",groupId:"g2",name:"Shopping"}]},
  ]};
}
const fundedSeed=()=>withCats({...baseDoc()});

t("20 · a funded payment is real spending against the category, not a transfer",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  const e=d.expenses[0];
  assert.equal(e.catId,"cShop","catId becomes the CATEGORY, not the installment id");
  assert.equal(e.isTransfer,false,"it must consume the envelope");
  // the links that make it an installment payment are untouched
  assert.equal(e.installmentId,"i1");
  assert.equal(e.installmentPaymentId,"p1");
  assert.equal(d.installmentPayments.find(p=>p.id==="p1").fundedCatId,"cShop");
  assert.equal(d.installmentPayments.find(p=>p.id==="p1").status,"paid");
});

t("21 · the unaccounted classifier needs no branch — it lands in tracked spend",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  const funded=classify(d.expenses,[]);
  assert.equal(funded.trackedSpend,250);
  assert.equal(funded.untrackedTransfers,0,"a funded payment is NOT a transfer out");
  // and the unfunded case is unchanged, which is the half that must not regress
  let u=withPlan(fundedSeed());
  u=applyInstallmentPayment(u,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e2"});
  const plain=classify(u.expenses,[]);
  assert.equal(plain.untrackedTransfers,250);
  assert.equal(plain.trackedSpend,0);
});

t("22 · the derived row stays VISIBLE but stops allocating",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  // p1 is due 15 Aug, which for `me` (payday 28) is the bucket opening 28 Jul
  const rows=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP);
  const row=rows.find(r=>r.paymentId==="p1");
  assert.ok(row,"the row must NOT disappear — the schedule stays readable");
  assert.equal(row.fundedElsewhere,true);
  assert.equal(row.fundedCatId,"cShop");
  assert.equal(row.amount,250,"it still displays what was due");
  // the exclusion is the caller's, and it is the line that prevents the double
  const total=rows.reduce((s,r)=>s+(r.fundedElsewhere?0:r.amount),0);
  assert.equal(total,0,"nothing else falls in this bucket, and the funded row adds nothing");
  assert.ok(/installmentRows\.reduce\(\(s,r\)=>s\+\(r\.fundedElsewhere\?0:r\.amount\),0\)/.test(html),
    "installmentTotal must exclude funded rows — this is the double-allocation guard");
});

t("23 · fundedElsewhere is derived from status, so a reopened payment resets",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  d=applyInstallmentExpenseDelete(d,{expenseId:"e1",now:NOW});
  const p=d.installmentPayments.find(x=>x.id==="p1");
  assert.equal(p.status,"upcoming","deleting the money reopens the payment");
  assert.equal("fundedCatId"in p,false,"the mark goes with the money, or the row allocates nowhere");
  const rows=derivedInstallmentRowsFor(d.installments,d.installmentPayments,"me","2026-07-28",PP);
  const row=rows.find(r=>r.paymentId==="p1");
  assert.equal(row.fundedElsewhere,false);
  assert.equal(rows.reduce((s,r)=>s+(r.fundedElsewhere?0:r.amount),0),250,
    "it must re-enter the planned total");
});

t("23b · restoring re-derives the funding from the expense itself",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  d=applyInstallmentExpenseDelete(d,{expenseId:"e1",now:NOW});
  d=applyInstallmentExpenseRestore(d,{expenseId:"e1",now:NOW});
  const p=d.installmentPayments.find(x=>x.id==="p1");
  assert.equal(p.status,"paid");
  assert.equal(p.fundedCatId,"cShop","re-derived from the restored row, not from a stash");
  // an UNfunded payment must not acquire one on restore
  let u=withPlan(fundedSeed());
  u=applyInstallmentPayment(u,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW,expenseId:"e2"});
  u=applyInstallmentExpenseDelete(u,{expenseId:"e2",now:NOW});
  u=applyInstallmentExpenseRestore(u,{expenseId:"e2",now:NOW});
  assert.equal("fundedCatId"in u.installmentPayments.find(x=>x.id==="p1"),false);
});

t("24 · an unusable category degrades to a plain transfer rather than being swallowed",()=>{
  const cases=[
    ["cHers","the OTHER owner's category — a cross-owner link is the corruption to prevent"],
    ["cGone","a tombstoned category"],
    ["nope", "a category that never existed"],
  ];
  cases.forEach(([catId,why])=>{
    let d=withPlan(fundedSeed());
    d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
      now:NOW,expenseId:"e1",fundedCatId:catId});
    const e=d.expenses[0];
    assert.equal(e.catId,"i1",why+": catId falls back to the installment");
    assert.equal(e.isTransfer,true,why+": it must still record that money moved");
    assert.equal("fundedCatId"in d.installmentPayments.find(p=>p.id==="p1"),false,why);
    assert.equal(d.installmentPayments.find(p=>p.id==="p1").status,"paid",
      why+": the payment is still recorded — degrading must not swallow the transaction");
  });
});

t("25 · unlinking leaves an ordinary category expense and reopens the payment",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  d=applyInstallmentUnlink(d,{expenseId:"e1",now:NOW});
  const e=d.expenses[0];
  assert.equal(e.catId,"cShop","it becomes a plain Shopping expense — exactly what unlink should leave");
  assert.equal(e.isTransfer,false);
  assert.equal("installmentPaymentId"in e,false);
  const p=d.installmentPayments.find(x=>x.id==="p1");
  assert.equal(p.status,"upcoming");
  assert.equal("fundedCatId"in p,false,"reopened means planned again, so it must allocate again");
});

t("26 · re-recording without a category clears a stale funding mark",()=>{
  let d=withPlan(fundedSeed());
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",
    now:NOW,expenseId:"e1",fundedCatId:"cShop"});
  // the same payment recorded again, this time as an ordinary transfer
  d=applyInstallmentPayment(d,{paymentId:"p1",actualAmount:250,paidDate:"2026-08-15",now:NOW});
  assert.equal("fundedCatId"in d.installmentPayments.find(p=>p.id==="p1"),false);
  assert.equal(d.expenses[0].isTransfer,true);
  assert.equal(d.expenses[0].catId,"i1");
  assert.equal(live(d.expenses).length,1,"still exactly one ledger row");
});

t("27 · the field is absent by default, so migrate stays byte-identical",()=>{
  const doc=migrate(withPlan({...baseDoc()}));
  assert.ok(doc.installmentPayments.every(p=>!("fundedCatId"in p)),
    "absent means unfunded — defaulting it would cost every device a KV write");
  assert.equal(fingerprint(doc),fingerprint(migrate(clone(doc))));
  /* Comments are stripped before the search. The assertion is about CODE — and
     migrate() now explains the absent-means-default rule in prose, naming
     fundedCatId as the precedent it follows, which a bare substring check reads
     as a violation of the very rule the comment is upholding. */
  const migrateCode=slice("function migrate(d){","/* Bills Reserve = opening baseline")
    .replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
  assert.ok(!/fundedCatId/.test(migrateCode),"migrate() must not default fundedCatId");
});

t("28 · a funded payment merges across devices intact",()=>{
  const base=withPlan(fundedSeed());
  const local={...clone(base),dataUpdatedAt:"2026-08-03T00:00:00.000Z"};
  const remote={...clone(base),dataUpdatedAt:"2026-08-02T00:00:00.000Z"};
  const paid=applyInstallmentPayment(local,{paymentId:"p1",actualAmount:250,
    paidDate:"2026-08-15",now:"2026-08-03T00:00:00.000Z",expenseId:"e1",fundedCatId:"cShop"});
  const merged=tryAutoMergeAll(paid,remote);
  assert.ok(merged);
  const p=merged.installmentPayments.find(x=>x.id==="p1");
  assert.equal(p.fundedCatId,"cShop");
  const rows=merged.expenses.filter(e=>e.installmentPaymentId==="p1");
  assert.equal(rows.length,1);
  assert.equal(rows[0].isTransfer,false);
  assert.equal(rows[0].catId,"cShop");
});

t("the two collections are wired into every persistence site",()=>{
  // cheap source guards — these are the sites a new collection silently misses
  ["installments:[]","installmentPayments:[]"].forEach(s=>
    assert.ok(html.includes("    "+s),"defaultData is missing "+s));
  assert.ok(/installments:mergeArrayById\(local\.installments,remote\.installments\)/.test(html),"tryAutoMergeAll");
  assert.ok(/installmentPayments:mergeArrayById\(/.test(html),"tryAutoMergeAll (payments)");
  assert.ok(/\{key:"installments",label:"Installments"/.test(html),"CONFLICT_COLLECTIONS");
  assert.ok(/\{key:"installmentPayments",label:"Installment payments"/.test(html),"CONFLICT_COLLECTIONS");
  assert.ok(/installments:\(d\.installments\|\|\[\]\)\.filter\(fresh\)/.test(html),"purgeOldTombstones");
  assert.ok(/HIDE_FROM_RECENTLY_DELETED/.test(html),"Recently Deleted carve-out");
  // and reachable from the UI
  assert.ok(/const MORE_TABS=\[[^\]]*"installments"/.test(html),"MORE_TABS");
  assert.ok(/installments:\{label:"Installments"/.test(html),"TAB_META");
});

console.log(`\n${n-fails}/${n} passed${fails?` — ${fails} FAILED`:""}\n`);
process.exit(fails?1:0);
