/* purchasetest.cjs — the Purchase Advisor engine (Build A).
   Run: node purchasetest.cjs [path-to-index.html]

   Slices the real module-scope engine block out of index.html and runs it in a
   vm context, per CLAUDE.md — so this tests the shipped functions rather than a
   restatement of the logic. The period/plan/installment helpers are sliced in
   alongside rather than stubbed, because "which bucket does this due date fall
   in" and "which plan does this future month inherit" ARE half of what a
   projection is; a stub would test the stub.

   The contract being tested:
     • headroom is Budget's own arithmetic — the anti-drift test drives the
       SLICED BudgetView expression over the same fixture and demands equality
     • an installment already funded from a category is not counted again
     • money is subtracted from availability exactly once, joint accounts are
       reported and never added, and an unprotected goal is spendable
     • the forward walk never counts a deficit as savings, and a plan finishing
       inside the horizon brings the answer forward on its own
     • verdict boundaries are exact at 0 and at PURCHASE_THIN_PCT
     • the whole feature touches NO synced data, and its render path cannot
       materialise a plan

   Three vm traps (see installmenttest.cjs): assert.deepStrictEqual compares
   prototypes and fails across realms — use deepEqual; slice markers are plain
   indexOf on source text, so assert they were found; and top-level `const`
   bindings don't attach to the context — only function declarations do — so
   hand those over explicitly. */
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
const deepEqual=(a,b,m)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);
const near=(a,b,m)=>assert.ok(Math.abs(Number(a)-Number(b))<1e-9,`${m||"not equal"}: ${a} vs ${b}`);

/* ── the sandbox ──────────────────────────────────────────────────────────── */
const ctx={console};
vm.createContext(ctx);
Object.assign(ctx,{defaultData:()=>({}),uid:()=>"stub"});

vm.runInContext(
  /* period helpers → plan resolution → installments → the advisor engine */
  slice("function daysInCalMonth(y,m){","/* Tracked-spending rollup for one owner")+"\n"+
  /* MIN_TREND_BUCKETS, which purchaseHistoryWarning gates on */
  slice("const MIN_TREND_BUCKETS=3;","function bucketHistoryFor(")+"\n"+
  /* bank valuation, which the availability stack values accounts through */
  slice("function dayNumber(str){","/* Reconcile: fold the accrued estimate")+`
this.PURCHASE_HORIZON_BUCKETS=PURCHASE_HORIZON_BUCKETS;
this.PURCHASE_THIN_PCT=PURCHASE_THIN_PCT;
this.MIN_TREND_BUCKETS=MIN_TREND_BUCKETS;
this.INSTALLMENT_ROUND_TOL=INSTALLMENT_ROUND_TOL;`,ctx);

const{
  categoryEffectiveAmt,purchaseTrimFor,purchasePlannedTotal,purchaseHeadroomForBucket,
  purchaseAvailableStack,buildPurchaseSchedule,projectPurchaseScenarios,purchaseVerdict,
  purchaseHistoryWarning,
  resolvePlanForMonth,derivedInstallmentRowsFor,bucketKeyFor,bucketShift,
  generateInstallmentSchedule,scheduleDiff,scheduleTotal,roundTo,addMonthsISO,
  PURCHASE_HORIZON_BUCKETS,PURCHASE_THIN_PCT,MIN_TREND_BUCKETS,INSTALLMENT_ROUND_TOL,
}=ctx;

/* BudgetView's OWN remaining expression, lifted out of the component so the
   anti-drift test compares against the shipped code and not against a copy of
   it. `effectiveAmt` is handed in because the component now aliases the same
   module-scope function this file is testing. */
const bctx={};
vm.createContext(bctx);
vm.runInContext(
  "function budgetTotals(monthPlan,installmentRows,effectiveAmt){\n"+
  slice("  const installmentTotal=installmentRows.reduce(","  const pct=n=>income>0?")+
  "\n  return{income,manualAllocated,installmentTotal,allocated,remaining};\n}",bctx);
const budgetTotals=bctx.budgetTotals;

/* ── fixtures ─────────────────────────────────────────────────────────────
   "me" runs on calendar months except where a test says otherwise, so bucket
   keys read as plain "YYYY-MM" and the arithmetic is legible. The pay-period
   case gets its own config, because a corrected boundary is exactly the kind
   of thing an advisor must not quietly get wrong. */
const CAL={me:{enabled:false,payday:28,actualStarts:{}},
           wife:{enabled:false,payday:1,actualStarts:{}}};
const TODAY="2026-08-10";

/* income 10,000; Food 2,000 + Rent 3,000 + Subscriptions (subs) 500 = 5,500.
   `c3` carries a STALE `amount` of 9,999 behind its subs on purpose — that is
   the cache syncAmt keeps, and reading it instead of the sub sum is the bug
   categoryEffectiveAmt exists to make impossible. `cDead` is tombstoned. */
function basePlan(over={}){
  return{id:"p1",owner:"me",name:"Monthly",income:10000,
    groups:[{id:"g1",name:"Essentials",ord:0}],
    categories:[
      {id:"c1",groupId:"g1",name:"Food",amount:2000,ord:0},
      {id:"c2",groupId:"g1",name:"Rent",amount:3000,ord:1},
      {id:"c3",groupId:"g1",name:"Subscriptions",amount:9999,ord:2,
        subs:[{id:"s1",name:"Music",amount:300},{id:"s2",name:"Cloud",amount:200}]},
      {id:"cDead",groupId:"g1",name:"Old car loan",amount:1500,ord:3,deletedAt:"2026-07-01T00:00:00.000Z"},
    ],...over};
}
function baseCtx(over={}){
  return{monthlyPlans:[],plans:[basePlan()],activePlanId:{me:"p1"},
    installments:[],installmentPayments:[],payPeriods:CAL,owner:"me",trims:{},...over};
}
/* One installment plan of `count` payments of `amount`, first due `first`. */
function instal(id,{owner="me",amount=500,count=3,first="2026-08-15",status="upcoming",
                    fundedCatId=null}={}){
  const rows=[];
  for(let i=0;i<count;i++)rows.push({id:`${id}-p${i+1}`,installmentId:id,owner,sequence:i+1,
    dueDate:addMonthsISO(first,i),scheduledAmount:amount,status,
    ...(fundedCatId?{fundedCatId}:{})});
  return{inst:{id,owner,name:id,provider:"tabby",includeInBudget:true,status:"active",
    originalAmount:amount*count},rows};
}

console.log("\n1 · categoryEffectiveAmt\n");

t("1 · sub sum wins over `amount`; no subs falls back; junk reads as 0",()=>{
  assert.equal(categoryEffectiveAmt({amount:9999,subs:[{amount:300},{amount:200}]}),500,
    "a category with subs must read the sub sum, never its cached amount");
  assert.equal(categoryEffectiveAmt({amount:2000}),2000);
  assert.equal(categoryEffectiveAmt({amount:2000,subs:[]}),2000,
    "an empty subs array is not the same as having subs");
  assert.equal(categoryEffectiveAmt({amount:"abc"}),0);
  assert.equal(categoryEffectiveAmt({amount:"1500"}),1500,"numeric strings still count");
  assert.equal(categoryEffectiveAmt({subs:[{amount:"100"},{amount:null}]}),100);
  assert.equal(categoryEffectiveAmt(null),0);
  assert.equal(categoryEffectiveAmt(undefined),0);
});

t("1b · equivalent to the pre-refactor inline expression, case for case",()=>{
  /* The exact expression BudgetView and ExpenseTrackerView each carried before
     the extraction. The refactor is only safe if these agree everywhere. */
  const old=c=>(c.subs||[]).length>0
    ?(c.subs||[]).reduce((s,sub)=>s+(Number(sub.amount)||0),0)
    :Number(c.amount)||0;
  const cases=[{amount:0},{amount:2000},{amount:2000,subs:[]},
    {amount:9999,subs:[{amount:300},{amount:200}]},{amount:"abc"},{amount:-50},
    {subs:[{amount:0}]},{amount:12.34,subs:[{amount:12.34}]},{}];
  cases.forEach(c=>assert.equal(categoryEffectiveAmt(c),old(c),
    "diverged on "+JSON.stringify(c)));
});

console.log("\n2 · headroom is Budget's own arithmetic\n");

t("2 · purchaseHeadroomForBucket === income − manualAllocated − installmentTotal",()=>{
  /* The anti-drift test. Budget's expression is sliced from the component and
     driven over the same fixture; the advisor must never show a headroom the
     Budget tab disagrees with. */
  const c=baseCtx({installments:[],installmentPayments:[]});
  const two=instal("i1",{amount:400,count:2,first:"2026-08-15"});
  c.installments=[two.inst];c.installmentPayments=two.rows;

  ["2026-08","2026-09","2026-10"].forEach(bucket=>{
    const monthPlan=resolvePlanForMonth(c.monthlyPlans,bucket,c.owner,c.activePlanId,c.plans).plan;
    const rows=derivedInstallmentRowsFor(c.installments,c.installmentPayments,c.owner,bucket,c.payPeriods);
    const budget=budgetTotals(monthPlan,rows,categoryEffectiveAmt);
    const engine=purchaseHeadroomForBucket(c,bucket);
    near(engine.headroom,budget.remaining,`headroom drifted from Budget in ${bucket}`);
    near(engine.income,budget.income,"income");
    near(engine.planned,budget.manualAllocated,"planned");
    near(engine.installmentTotal,budget.installmentTotal,"installmentTotal");
  });
  // and the figure itself, so a change that moved BOTH sides would still fail
  near(purchaseHeadroomForBucket(c,"2026-08").headroom,10000-5500-400);
  near(purchaseHeadroomForBucket(c,"2026-10").headroom,10000-5500);
});

console.log("\n3 · plan inheritance\n");

t("3 · a future bucket with no mapping inherits through the chain",()=>{
  const c=baseCtx();
  // nothing preceding at all → the activePlanId root
  near(purchaseHeadroomForBucket(c,"2027-05").headroom,4500);
  // a September plan is inherited by every later bucket, not just September
  const sept={...basePlan(),id:"p2",income:12000};
  const c2=baseCtx({plans:[basePlan(),sept],
    monthlyPlans:[{month:"2026-09",owner:"me",planId:"p2"}]});
  near(purchaseHeadroomForBucket(c2,"2026-08").headroom,4500,"August precedes the mapping");
  near(purchaseHeadroomForBucket(c2,"2026-09").headroom,6500);
  near(purchaseHeadroomForBucket(c2,"2027-02").headroom,6500,"the chain carries forward");
});

t("3b · a tombstoned category is excluded, and `ord` never changes the sum",()=>{
  const c=baseCtx();
  near(purchasePlannedTotal(c.plans[0],{}),5500,
    "the tombstoned 1,500 category must not be counted");
  const shuffled={...basePlan()};
  shuffled.categories=[...shuffled.categories].reverse().map((x,i)=>({...x,ord:99-i}));
  near(purchasePlannedTotal(shuffled,{}),5500,"display order is not arithmetic");
});

console.log("\n4 · funded installment rows\n");

t("4 · a payment funded from a category is NOT counted again",()=>{
  /* The double-allocation trap: a funded payment's money is already inside the
     category's allocation, so counting the row as well reserves the same riyal
     twice — which is exactly what BudgetView's installmentTotal avoids. */
  const funded=instal("i1",{amount:600,count:1,first:"2026-08-15",
    status:"paid",fundedCatId:"c1"});
  const c=baseCtx({installments:[funded.inst],installmentPayments:funded.rows});
  const rows=derivedInstallmentRowsFor(c.installments,c.installmentPayments,"me","2026-08",CAL);
  assert.equal(rows.length,1,"the row still DISPLAYS — it is only the total that drops it");
  assert.equal(rows[0].fundedElsewhere,true);
  near(purchaseHeadroomForBucket(c,"2026-08").installmentTotal,0);
  near(purchaseHeadroomForBucket(c,"2026-08").headroom,4500);

  // the same payment unfunded is counted in full
  const plain=instal("i2",{amount:600,count:1,first:"2026-08-15"});
  const c2=baseCtx({installments:[plain.inst],installmentPayments:plain.rows});
  near(purchaseHeadroomForBucket(c2,"2026-08").installmentTotal,600);
  near(purchaseHeadroomForBucket(c2,"2026-08").headroom,3900);
});

t("4b · the other person's installments never reach this owner's headroom",()=>{
  const hers=instal("i9",{owner:"wife",amount:800,count:1,first:"2026-08-15"});
  const c=baseCtx({installments:[hers.inst],installmentPayments:hers.rows});
  near(purchaseHeadroomForBucket(c,"2026-08").installmentTotal,0);
});

console.log("\n5 · buildPurchaseSchedule\n");

t("5 · the schedule sums to price − downPayment + fees, within tolerance",()=>{
  const s=buildPurchaseSchedule({price:5200,downPayment:1300,feesOrInterest:0,
    count:4,firstDueDate:"2026-09-15"});
  assert.equal(s.downPayment,1300);
  assert.equal(s.financed,3900,"the down payment leaves the financed total");
  assert.equal(s.rows.length,4);
  assert.ok(s.check.ok,"scheduleDiff must accept the generated schedule");
  assert.ok(Math.abs(scheduleTotal(s.rows)-3900)<=INSTALLMENT_ROUND_TOL);
  const withFee=buildPurchaseSchedule({price:5200,downPayment:1300,feesOrInterest:150,
    count:3,firstDueDate:"2026-09-15"});
  assert.equal(withFee.financed,4050);
  assert.ok(withFee.check.ok);
  assert.ok(Math.abs(scheduleTotal(withFee.rows)-4050)<=INSTALLMENT_ROUND_TOL);
});

t("5b · a month-end first due clamps via addMonthsISO, and a rounding remainder lands last",()=>{
  const s=buildPurchaseSchedule({price:1000,downPayment:0,feesOrInterest:0,
    count:4,firstDueDate:"2026-01-31"});
  deepEqual(s.rows.map(r=>r.dueDate),["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]);
  const odd=buildPurchaseSchedule({price:1000,downPayment:0,feesOrInterest:0,
    count:3,firstDueDate:"2026-09-15"});
  deepEqual(odd.rows.map(r=>r.scheduledAmount),[333.33,333.33,333.34]);
});

t("5c · a down payment larger than the price clamps rather than financing a negative",()=>{
  const s=buildPurchaseSchedule({price:500,downPayment:900,feesOrInterest:0,
    count:2,firstDueDate:"2026-09-15"});
  assert.equal(s.downPayment,500);
  assert.equal(s.financed,0);
});

console.log("\n6 · purchaseAvailableStack\n");

const BANKS=[
  {id:"b1",owner:"me",name:"Main",currency:"SAR",balance:31000},
  {id:"b2",owner:"wife",name:"Hers",currency:"SAR",balance:9000},
  {id:"b3",owner:"household",name:"Joint",currency:"SAR",balance:18000},
  {id:"b4",owner:"me",name:"Closed",currency:"SAR",balance:5000,deletedAt:"2026-07-01T00:00:00.000Z"},
];
const GOALS=[
  {id:"g1",owner:"me",name:"Emergency",contributions:[{id:"x1",amount:6000},{id:"x2",amount:500}]},
  {id:"g2",owner:"me",name:"Trip",contributions:[{id:"x3",amount:2000}]},
  {id:"g3",owner:"me",name:"Dead",deletedAt:"2026-07-01T00:00:00.000Z",
    contributions:[{id:"x4",amount:99999}]},
  {id:"g4",owner:"wife",name:"Hers",contributions:[{id:"x5",amount:4000}]},
];

t("6 · goals and the reserve are subtracted exactly once; joint is reported, not added",()=>{
  const s=purchaseAvailableStack({banks:BANKS,goals:GOALS,billsReserve:6100,owner:"me",
    protectedGoalIds:["g1","g2"],todayStr:TODAY});
  assert.equal(s.banks,31000,"only this owner's live accounts, and only once");
  assert.equal(s.joint,18000);
  assert.equal(s.reserve,6100);
  assert.equal(s.protectedGoals,8500,"6,000 + 500 + 2,000");
  assert.equal(s.protectedGoalCount,2);
  assert.equal(s.available,31000-6100-8500);
  assert.ok(s.available<s.banks+s.joint,"a joint account must never inflate availability");
});

t("6b · a tombstoned goal contributes nothing, even when it is named protected",()=>{
  const s=purchaseAvailableStack({banks:BANKS,goals:GOALS,billsReserve:0,owner:"me",
    protectedGoalIds:["g1","g3"],todayStr:TODAY});
  assert.equal(s.protectedGoalCount,1);
  assert.equal(s.protectedGoals,6500);
  // and a deleted contribution inside a live goal is ignored too
  const withDead=purchaseAvailableStack({banks:BANKS,billsReserve:0,owner:"me",
    goals:[{id:"gz",owner:"me",contributions:[{id:"a",amount:100},
      {id:"b",amount:900,deletedAt:"2026-07-01T00:00:00.000Z"}]}],
    protectedGoalIds:["gz"],todayStr:TODAY});
  assert.equal(withDead.protectedGoals,100);
});

t("6c · an UNPROTECTED goal is not subtracted — that is what the lever does",()=>{
  const all=purchaseAvailableStack({banks:BANKS,goals:GOALS,billsReserve:0,owner:"me",
    protectedGoalIds:["g1","g2"],todayStr:TODAY});
  const trip=purchaseAvailableStack({banks:BANKS,goals:GOALS,billsReserve:0,owner:"me",
    protectedGoalIds:["g1"],todayStr:TODAY});
  assert.equal(trip.available-all.available,2000,
    "unprotecting the 2,000 trip goal must free exactly 2,000");
  assert.equal(trip.protectedGoalCount,1);
});

t("6d · the other person's goal is never subtracted from this person's cash",()=>{
  const s=purchaseAvailableStack({banks:BANKS,goals:GOALS,billsReserve:0,owner:"me",
    protectedGoalIds:["g1","g4"],todayStr:TODAY});
  assert.equal(s.protectedGoalCount,1,"g4 belongs to wife");
  assert.equal(s.protectedGoals,6500);
});

t("6e · an account in another currency is excluded and REPORTED, never added raw",()=>{
  const banks=[...BANKS,{id:"b5",owner:"me",name:"Manila",currency:"PHP",balance:200000}];
  const noFx=purchaseAvailableStack({banks,goals:[],billsReserve:0,owner:"me",
    protectedGoalIds:[],todayStr:TODAY,toBase:(v,c)=>c==="SAR"?v:null});
  assert.equal(noFx.unconverted,1);
  assert.equal(noFx.banks,31000,"200,000 PHP must not be added as 200,000 SAR");
  const fx=purchaseAvailableStack({banks,goals:[],billsReserve:0,owner:"me",
    protectedGoalIds:[],todayStr:TODAY,toBase:(v,c)=>c==="SAR"?v:v*0.065});
  assert.equal(fx.unconverted,0);
  assert.equal(fx.banks,31000+13000);
});

t("6f · a bank's accrued interest is valued through bankValue, not read raw",()=>{
  const s=purchaseAvailableStack({billsReserve:0,owner:"me",protectedGoalIds:[],
    todayStr:"2027-08-10",goals:[],
    banks:[{id:"b1",owner:"me",currency:"SAR",balance:10000,balanceAsOf:"2026-08-10",
      interest:{enabled:true,taxPct:0,crediting:"daily",tiers:[{from:0,rate:5}]}}]});
  assert.ok(s.banks>10000,"a year of 5% must show up");
  assert.ok(s.banks<10600,"and it is daily compounding, not a wild figure");
});

console.log("\n7 · projectPurchaseScenarios\n");

/* A deliberately plain budget for the walk: income 1,000, one 900 category,
   so base headroom is a round 100 per bucket. */
function walkCtx(over={}){
  const plan={id:"pw",owner:"me",name:"Flat",income:1000,
    groups:[{id:"g1",name:"All",ord:0}],
    categories:[{id:"c1",groupId:"g1",name:"Everything",amount:900,ord:0}]};
  return{monthlyPlans:[],plans:[plan],activePlanId:{me:"pw"},
    installments:[],installmentPayments:[],payPeriods:CAL,owner:"me",trims:{},
    todayStr:TODAY,stack:{available:0},...over};
}

t("7 · earliest finds the first bucket whose accumulated headroom reaches the price",()=>{
  const s=projectPurchaseScenarios(walkCtx({stack:{available:0}}),{price:500});
  assert.equal(s.earliest.n,5,"100 a period, 500 to find");
  assert.equal(s.earliest.bucketKey,"2027-01","five buckets on from 2026-08");
  near(s.earliest.shortfall,500);
  near(s.earliest.requiredPerBucket,100);
  // already affordable → n = 0, and no waiting is proposed
  const now=projectPurchaseScenarios(walkCtx({stack:{available:900}}),{price:500});
  assert.equal(now.earliest.n,0);
  near(now.earliest.shortfall,0);
  near(now.earliest.requiredPerBucket,0);
});

t("7b · an installment ENDING inside the horizon brings the answer forward on its own",()=>{
  /* The reason "wait until the Tabby plan finishes" needs no scenario of its
     own: the walk simply stops subtracting once the schedule runs out. */
  const short=instal("i1",{amount:50,count:3,first:"2026-08-15"});
  const long =instal("i2",{amount:50,count:24,first:"2026-08-15"});
  const a=projectPurchaseScenarios(
    walkCtx({installments:[short.inst],installmentPayments:short.rows}),{price:500});
  const b=projectPurchaseScenarios(
    walkCtx({installments:[long.inst],installmentPayments:long.rows}),{price:500});
  assert.equal(a.earliest.n,7);
  assert.equal(b.earliest.n,10);
  assert.ok(a.earliest.n<b.earliest.n,
    "a plan that finishes must free its money up without being asked");
});

t("7c · a bucket in deficit contributes 0, never a negative",()=>{
  /* One huge payment sinks the first bucket to −500. If deficits subtracted,
     the answer would slip three buckets; they must simply contribute nothing. */
  const sink=instal("i1",{amount:600,count:1,first:"2026-08-15"});
  const c=walkCtx({installments:[sink.inst],installmentPayments:sink.rows});
  near(purchaseHeadroomForBucket(c,"2026-08").headroom,-500);
  const s=projectPurchaseScenarios(c,{price:200});
  /* Buckets 1 and 2 supply 100 each and the deficit supplies nothing. Were the
     −500 carried into the running total instead, the answer would be 8. */
  assert.equal(s.earliest.n,3);
});

t("7d · beyond the horizon it returns null rather than extrapolating",()=>{
  const s=projectPurchaseScenarios(walkCtx(),{price:1000000});
  assert.equal(s.earliest,null);
  // exactly at the horizon it still answers
  const edge=projectPurchaseScenarios(walkCtx(),{price:100*PURCHASE_HORIZON_BUCKETS});
  assert.equal(edge.earliest.n,PURCHASE_HORIZON_BUCKETS);
  const justOver=projectPurchaseScenarios(walkCtx(),{price:100*PURCHASE_HORIZON_BUCKETS+1});
  assert.equal(justOver.earliest,null);
});

t("7e · cash does not touch a single future bucket",()=>{
  const s=projectPurchaseScenarios(walkCtx({stack:{available:5000}}),{price:1200});
  assert.equal(s.cash.feasible,true);
  near(s.cash.remainingAfter,3800);
  const no=projectPurchaseScenarios(walkCtx({stack:{available:800}}),{price:1200});
  assert.equal(no.cash.feasible,false);
  near(no.cash.remainingAfter,-400);
});

t("7f · financed spreads the schedule across the buckets its rows fall in",()=>{
  const s=projectPurchaseScenarios(walkCtx({stack:{available:2000}}),
    {price:1200,financed:true,downPayment:0,feesOrInterest:0,count:3,firstDueDate:"2026-09-15"});
  deepEqual(s.financed.buckets.map(b=>b.key),["2026-09","2026-10","2026-11"]);
  s.financed.buckets.forEach(b=>{
    near(b.baseHeadroom,100);
    near(b.obligation,400);
    near(b.headroom,-300);
  });
  assert.equal(s.financed.deficits.length,3);
  assert.equal(s.financed.upfront,0);
  assert.equal(s.financed.upfrontFeasible,true);
  // two rows landing in one bucket are summed, not listed twice
  const twice=projectPurchaseScenarios(walkCtx({stack:{available:2000}}),
    {price:200,financed:true,count:2,firstDueDate:"2026-09-15"});
  const sep=twice.financed.buckets.find(b=>b.key==="2026-09");
  assert.equal(twice.financed.buckets.length,2);
  near(sep.obligation,100);
});

t("7g · the down payment is charged to cash on hand, not to a bucket",()=>{
  const s=projectPurchaseScenarios(walkCtx({stack:{available:1000}}),
    {price:1200,financed:true,downPayment:300,count:3,firstDueDate:"2026-09-15"});
  assert.equal(s.financed.upfront,300);
  near(s.financed.availableAfterUpfront,700);
  assert.equal(s.financed.upfrontFeasible,true);
  s.financed.buckets.forEach(b=>near(b.obligation,300));  // 900 financed over 3
  const broke=projectPurchaseScenarios(walkCtx({stack:{available:100}}),
    {price:1200,financed:true,downPayment:300,count:3,firstDueDate:"2026-09-15"});
  assert.equal(broke.financed.upfrontFeasible,false);
});

console.log("\n8 · pay periods\n");

t("8 · a corrected period start re-buckets a payment into the stretched window",()=>{
  /* "me" is paid on the 28th, so Aug 27 nominally belongs to the July period.
     Recording that August really began on Aug 26 stretches August back over it
     — and the advisor must bucket the payment where Budget will show it. */
  const PP={me:{enabled:true,payday:28,actualStarts:{"2026-08-28":"2026-08-26"}},
            wife:{enabled:false,payday:1,actualStarts:{}}};
  const NOM={me:{enabled:true,payday:28,actualStarts:{}},
             wife:{enabled:false,payday:1,actualStarts:{}}};
  assert.equal(bucketKeyFor("2026-08-27",NOM,"me"),"2026-07-28","nominally the July period");
  assert.equal(bucketKeyFor("2026-08-27",PP,"me"),"2026-08-28","the correction stretches August back");

  const s=projectPurchaseScenarios(walkCtx({payPeriods:PP,stack:{available:0}}),
    {price:100,financed:true,count:1,firstDueDate:"2026-08-27"});
  deepEqual(s.financed.buckets.map(b=>b.key),["2026-08-28"]);

  const nominal=projectPurchaseScenarios(walkCtx({payPeriods:NOM,stack:{available:0}}),
    {price:100,financed:true,count:1,firstDueDate:"2026-08-27"});
  deepEqual(nominal.financed.buckets.map(b=>b.key),["2026-07-28"]);
});

t("8b · the forward walk steps in the owner's periods, not calendar months",()=>{
  const PP={me:{enabled:true,payday:28,actualStarts:{}},
            wife:{enabled:false,payday:1,actualStarts:{}}};
  const s=projectPurchaseScenarios(walkCtx({payPeriods:PP}),{price:300});
  assert.equal(s.earliest.n,3);
  assert.equal(s.earliest.bucketKey,bucketShift(bucketKeyFor(TODAY,PP,"me"),PP,"me",3));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.earliest.bucketKey),"a pay-period key, not YYYY-MM");
});

console.log("\n9 · purchaseVerdict\n");

t("9 · cash — infeasible is bad, a thin cushion warns, exactly one period is fine",()=>{
  assert.equal(purchaseVerdict({id:"cash",feasible:false,remainingAfter:-10},{}),"bad");
  assert.equal(purchaseVerdict({id:"cash",feasible:true,remainingAfter:5500},
    {periodAllocation:5500}),"good","exactly one period's allocation left is not a warning");
  assert.equal(purchaseVerdict({id:"cash",feasible:true,remainingAfter:5499.99},
    {periodAllocation:5500}),"warn");
  assert.equal(purchaseVerdict({id:"cash",feasible:true,remainingAfter:0},{}),"good",
    "with nothing to compare against, feasible is the whole answer");
});

t("9 · financed — the boundary is exact at 0 and at PURCHASE_THIN_PCT",()=>{
  const fin=buckets=>({id:"financed",upfrontFeasible:true,buckets});
  const thin=1000*(PURCHASE_THIN_PCT/100);
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:-0.01}]),{}),"bad");
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:0}]),{}),"warn",
    "zero headroom is not yet a deficit, but it is certainly thin");
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:thin-0.01}]),{}),"warn");
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:thin}]),{}),"good",
    `exactly ${PURCHASE_THIN_PCT}% of income is the good side of the line`);
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:900},{income:1000,headroom:-1}]),{}),
    "bad","one bad bucket decides the verdict");
  assert.equal(purchaseVerdict(fin([{income:1000,headroom:900},{income:1000,headroom:10}]),{}),
    "warn");
  assert.equal(purchaseVerdict({id:"financed",upfrontFeasible:false,
    buckets:[{income:1000,headroom:900}]},{}),"bad",
    "a down payment you cannot pay is not a comfortable plan");
  assert.equal(purchaseVerdict(fin([{income:0,headroom:0}]),{}),"good",
    "no income means no percentage to be thin against");
});

t("9 · earliest — near term is good, far off is flat, unreachable is nothing at all",()=>{
  assert.equal(purchaseVerdict({id:"earliest",n:0},{}),"good");
  assert.equal(purchaseVerdict({id:"earliest",n:3},{}),"good");
  assert.equal(purchaseVerdict({id:"earliest",n:4},{}),"flat");
  assert.equal(purchaseVerdict(null,{}),"flat");
});

console.log("\n10 · trims\n");

t("10 · a trim clamps to [0, effAmt] and never becomes a raise",()=>{
  const plan=basePlan();
  near(purchasePlannedTotal(plan,{c1:500}),5000,"Food 2,000 → 1,500");
  near(purchasePlannedTotal(plan,{c1:99999}),3500,"cannot trim more than the category holds");
  near(purchasePlannedTotal(plan,{c1:-800}),5500,"a negative trim is not a raise");
  near(purchasePlannedTotal(plan,{c1:"abc"}),5500);
  near(purchasePlannedTotal(plan,{c3:500}),5000,"a subs category trims against its sub sum");
  near(purchasePlannedTotal(plan,{c3:600}),5000,"...and clamps there, not at its stale amount");
  assert.equal(purchaseTrimFor({c1:300},"c1",2000),300);
  assert.equal(purchaseTrimFor({},"c1",2000),0);
});

t("10b · a trim naming a deleted category is ignored",()=>{
  const plan=basePlan();
  near(purchasePlannedTotal(plan,{cDead:1500}),5500,
    "a tombstoned category is not in the sum, so trimming it changes nothing");
  near(purchasePlannedTotal(plan,{nosuch:900}),5500);
});

t("10c · trims flow through headroom and move the earliest date",()=>{
  const c=baseCtx({trims:{c1:1000}});
  near(purchaseHeadroomForBucket(c,"2026-08").headroom,5500);
  const before=projectPurchaseScenarios({...walkCtx()},{price:500});
  const after=projectPurchaseScenarios({...walkCtx(),trims:{c1:400}},{price:500});
  assert.equal(before.earliest.n,5);
  assert.equal(after.earliest.n,1,"headroom 500 a period reaches 500 in one");
});

console.log("\nhistory warning\n");

t("the actuals warning stays dark below MIN_TREND_BUCKETS and never feeds the maths",()=>{
  const over=[{budget:1000,spent:1300},{budget:1000,spent:1200},{budget:1000,spent:1250}];
  assert.equal(purchaseHistoryWarning(over.slice(0,MIN_TREND_BUCKETS-1)),null,
    "not enough completed periods to be honest about");
  assert.ok(String(purchaseHistoryWarning(over)).indexOf("1250")>=0,
    "the mean actual (1,250) should be quoted");
  assert.equal(purchaseHistoryWarning(
    [{budget:1000,spent:1050},{budget:1000,spent:1000},{budget:1000,spent:1050}]),null,
    "within 10% is not worth interrupting anyone over");
  assert.equal(purchaseHistoryWarning([]),null);
  assert.equal(purchaseHistoryWarning(null),null);
  // a bucket with no budget at all is not evidence of overspending
  assert.equal(purchaseHistoryWarning(
    [{budget:0,spent:900},{budget:0,spent:900},{budget:0,spent:900}]),null);
});

/* ── source-structure assertions ──────────────────────────────────────────
   The properties that live in the source's SHAPE rather than in a value, and
   which nothing else can catch. Same pattern as synconnecttest.cjs. */
console.log("\nsource structure\n");

t("S1 · the advisor tab is registered in all the places a tab must be",()=>{
  const more=slice("const MORE_TABS=",";\n");
  assert.ok(more.indexOf('"advisor"')>=0,"advisor missing from MORE_TABS");
  const meta=slice("const TAB_META={","};");
  assert.ok(/\badvisor:\{label:/.test(meta),"advisor missing from TAB_META");
  assert.ok(html.indexOf('{tab==="advisor"&&<PurchaseAdvisorView')>=0,
    "advisor missing its TabPane render branch");
  assert.ok(html.indexOf("function PurchaseAdvisorView(")>=0,"the view itself is missing");
});

t("S2 · PURCHASE_DRAFT_KEY is nowhere near anything synced",()=>{
  /* Build A's whole premise: it cannot cause a KV write, cannot change a
     fingerprint, and cannot reach the other phone. Pinned here so a later edit
     has to delete this test to break it. */
  const spans={
    "fingerprint/userFingerprint":slice("const sortedById=arr=>",'/* "Did a *person* change anything?"'),
    "migrate":slice("function migrate(d){","/* Bills Reserve = opening baseline"),
    "tryAutoMergeAll":slice("function tryAutoMergeAll(local,remote){",
      "/* Reports what's different between local and remote"),
    "BACKUP_*_KEYS":slice("const BACKUP_ARRAY_KEYS=","function validateBackup(obj){"),
  };
  Object.keys(spans).forEach(k=>assert.ok(spans[k].indexOf("PURCHASE_DRAFT_KEY")<0,
    `PURCHASE_DRAFT_KEY appears inside ${k} — the advisor must touch no synced data`));
  // and the same for the collections list every synced array has to join
  ["defaultData","structuralDefaults","CONFLICT_COLLECTIONS","countPendingChanges",
   "purgeOldTombstones"].forEach(name=>{
    const i=html.indexOf(name);
    assert.ok(i>=0,`${name} not found`);
  });
  /* And the document shape itself: the advisor adds no field to a saved
     document, so migrate() has nothing to default and fingerprint() nothing
     new to hash. (`purchaseDate` on the sample installments is unrelated — the
     check is for the draft, which must exist only in localStorage.) */
  const shape=slice("function structuralDefaults(){","/* Bills Reserve = opening baseline");
  ["PURCHASE_DRAFT_KEY","purchaseDraft","advisor"].forEach(k=>
    assert.ok(shape.indexOf(k)<0,`the empty/sample document must gain no "${k}" field`));
});

t("S3 · the advisor's render path can never materialise a plan",()=>{
  /* Viewing must not write. The advisor resolves up to 24 future buckets, so
     one editPlanForMonth on this path would clone a plan into every month
     somebody merely looked at — the trap the derived Budget rows avoid. */
  /* Comments are stripped first — this block's own prose names the very
     functions it forbids, and a substring match would flag the explanation. */
  const code=s=>s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
  const view=code(slice("function PurchaseAdvisorView({","/* ── OVERVIEW VIEW ── */"));
  assert.ok(view.indexOf("editPlanForMonth")<0,
    "PurchaseAdvisorView must not reach editPlanForMonth");
  assert.ok(view.indexOf("setData")<0,"the advisor holds no writer into `data`");
  const engine=code(slice("/* ── Purchase Advisor engine","/* ── Installment state transactions"));
  assert.ok(engine.indexOf("editPlanForMonth")<0,"nor may the engine");
  assert.ok(engine.indexOf("localStorage")<0,"the engine is pure — no storage");
  assert.ok(!/new Date\(\)|Date\.now\(\)|todayISO\(\)/.test(engine),
    "the engine must take todayStr, never read the clock");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
