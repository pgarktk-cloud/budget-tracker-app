/* Unit-test bank interest accrual without a browser.

   Slices the real valuation helpers out of index.html by name and runs them in
   a vm context, per CLAUDE.md — testing the shipped code, not a
   reimplementation.

   The contract being tested (see docs/decisions.md, "Bank interest is derived
   from an anchor, never incremented into the balance"):
     • `balance` is never rewritten; the value shown is recomputed on read from
       `balanceAsOf`, so the maths is idempotent across devices and gaps
     • tiers are WHOLE-BALANCE — the balance selects one rate for all of it
     • tax reduces the rate, not the accrued amount after the fact
     • the value is constant within a calendar day (whole-day exponent), which
       is what stops the history/snapshot effects looping
     • an account with no interest block behaves exactly as it did before

   Gotcha: assert.deepStrictEqual compares prototypes and therefore fails
   across vm realms. Use deepEqual for anything built inside the vm. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8")
  // normalise CRLF: a Windows checkout would otherwise break every slice
  // marker that spans a newline (see .gitattributes)
  .replace(/\r\n/g, "\n");

function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

// Everything from the crediting-options constant through settledBankPatch.
const src=slice('const BANK_CREDITING=[["daily","Daily"],["monthly","Monthly"]];',
                "/* ── Liability remaining balance");
const ctx={};
vm.createContext(ctx);
// Function declarations attach themselves to the vm's global; top-level
// `const` bindings do NOT, so the two constants have to be handed over
// explicitly or they read as undefined here while working fine in the app.
vm.runInContext(src+"\nthis.DEFAULT_BANK_INTEREST=DEFAULT_BANK_INTEREST;this.BANK_CREDITING=BANK_CREDITING;",ctx);
const{bankValuation,bankValue,bankTierRate,settledBankPatch,dayNumber,completedMonths,DEFAULT_BANK_INTEREST}=ctx;

const acct=(over={})=>Object.assign({
  id:"b1",balance:100000,balanceAsOf:"2026-01-01",
  interest:{enabled:true,tiers:[{from:0,rate:3.25}],taxPct:20,crediting:"daily"},
},over);
const near=(a,b,eps=0.02)=>assert.ok(Math.abs(a-b)<=eps,`${a} !≈ ${b}`);

console.log("bank interest accrual");

/* ── the off switches ─────────────────────────────────────────────────── */

t("an account with no interest block is untouched",()=>{
  const b={balance:12345.67,balanceAsOf:"2020-01-01",interest:null};
  const v=bankValuation(b,"2026-07-31");
  assert.strictEqual(v.value,12345.67);
  assert.strictEqual(v.accrued,0);
  assert.strictEqual(v.active,false);
});

t("interest disabled keeps its tiers but stops accruing",()=>{
  const b=acct({interest:{enabled:false,tiers:[{from:0,rate:3.25}],taxPct:20,crediting:"daily"}});
  const v=bankValuation(b,"2026-07-31");
  assert.strictEqual(v.value,100000);
  assert.strictEqual(v.active,false);
});

t("a zero or negative balance earns nothing",()=>{
  // an overdraft doesn't earn interest, and charging it is a different feature
  assert.strictEqual(bankValue(acct({balance:0}),"2026-07-31"),0);
  assert.strictEqual(bankValue(acct({balance:-500}),"2026-07-31"),-500);
});

t("a zero rate accrues nothing",()=>{
  const b=acct({interest:{enabled:true,tiers:[{from:0,rate:0}],taxPct:20,crediting:"daily"}});
  assert.strictEqual(bankValue(b,"2026-07-31"),100000);
});

t("no tiers configured accrues nothing",()=>{
  const b=acct({interest:{enabled:true,tiers:[],taxPct:20,crediting:"daily"}});
  assert.strictEqual(bankValue(b,"2026-07-31"),100000);
});

t("a missing anchor date accrues nothing",()=>{
  assert.strictEqual(bankValue(acct({balanceAsOf:null}),"2026-07-31"),100000);
});

/* ── the maths ────────────────────────────────────────────────────────── */

t("one day at 3.25% less 20% tax",()=>{
  // net annual 2.6%; 100000 * (1+0.026/365)^1
  const v=bankValuation(acct(),"2026-01-02");
  near(v.value,100000*Math.pow(1+0.026/365,1));
  near(v.accrued,v.value-100000);
  assert.strictEqual(v.days,1);
  assert.strictEqual(v.rate,3.25);
  near(v.netRate,2.6);
});

t("a full year of daily compounding",()=>{
  const v=bankValuation(acct(),"2027-01-01");
  assert.strictEqual(v.days,365);
  near(v.value,100000*Math.pow(1+0.026/365,365),0.05);
  // compounding daily beats the flat 2,600 of simple interest, slightly
  assert.ok(v.accrued>2600&&v.accrued<2640);
});

t("tax of 0 accrues the gross rate",()=>{
  const b=acct({interest:{enabled:true,tiers:[{from:0,rate:3.25}],taxPct:0,crediting:"daily"}});
  const v=bankValuation(b,"2027-01-01");
  near(v.netRate,3.25);
  near(v.value,100000*Math.pow(1+0.0325/365,365),0.05);
});

t("monthly crediting compounds only completed months",()=>{
  const b=acct({interest:{enabled:true,tiers:[{from:0,rate:3.25}],taxPct:20,crediting:"monthly"}});
  // 2026-01-01 → 2026-04-01 is exactly 3 completed months
  const v=bankValuation(b,"2026-04-01");
  assert.strictEqual(v.periods,3);
  near(v.value,100000*Math.pow(1+0.026/12,3));
});

t("monthly crediting ignores a part-month",()=>{
  const b=acct({interest:{enabled:true,tiers:[{from:0,rate:3.25}],taxPct:20,crediting:"monthly"}});
  // the day of the month hasn't come round again, so month 4 hasn't completed
  assert.strictEqual(bankValuation(b,"2026-04-30").periods,3);
  assert.strictEqual(bankValuation(b,"2026-05-01").periods,4);
});

t("monthly crediting pays nothing before the first month completes",()=>{
  const b=acct({interest:{enabled:true,tiers:[{from:0,rate:3.25}],taxPct:20,crediting:"monthly"}});
  const v=bankValuation(b,"2026-01-31");
  assert.strictEqual(v.periods,0);
  assert.strictEqual(v.value,100000);
});

/* ── tiers are whole-balance, not marginal ────────────────────────────── */

t("the balance selects ONE tier and that rate applies to all of it",()=>{
  const tiers=[{from:0,rate:3.25},{from:1000000,rate:3.75}];
  assert.strictEqual(bankTierRate({tiers},999999),3.25);
  assert.strictEqual(bankTierRate({tiers},1000000),3.75);
  // marginal would give a blended rate here; whole-balance gives a flat 3.75
  assert.strictEqual(bankTierRate({tiers},2500000),3.75);
});

t("tiers are sorted defensively — the editor appends in typing order",()=>{
  const tiers=[{from:1000000,rate:3.75},{from:0,rate:3.25},{from:500000,rate:3.5}];
  assert.strictEqual(bankTierRate({tiers},600000),3.5);
  assert.strictEqual(bankTierRate({tiers},100),3.25);
});

t("a balance under every tier floor earns the lowest configured rate",()=>{
  // "above a million you get more", not "below a million you get zero"
  assert.strictEqual(bankTierRate({tiers:[{from:1000000,rate:3.75}]},5000),3.75);
});

t("malformed tier rows are ignored, not counted as zero",()=>{
  const tiers=[{from:0,rate:3.25},{from:"abc",rate:9},{rate:9}];
  assert.strictEqual(bankTierRate({tiers},50000),3.25);
});

t("a tier change is picked up on the next read, not written into balance",()=>{
  const b=acct();
  const before=bankValue(b,"2026-07-01");
  b.interest={...b.interest,tiers:[{from:0,rate:6.5}]};
  assert.ok(bankValue(b,"2026-07-01")>before);
  assert.strictEqual(b.balance,100000);  // stored figure never rewritten
});

/* ── the properties that keep sync and the effects honest ─────────────── */

t("the value is constant within a calendar day",()=>{
  // this is what stops the history/snapshot effects seeing a moving number
  // mid-session and looping; the exponent is a whole number of days
  const b=acct();
  const a1=bankValue(b,"2026-07-31");
  const a2=bankValue(b,"2026-07-31");
  assert.strictEqual(a1,a2);
  assert.notStrictEqual(bankValue(b,"2026-08-01"),a1);
});

t("reading is idempotent — no gap is lost and none is double-counted",()=>{
  // a phone opened every day and a phone opened once must agree
  const b=acct();
  const direct=bankValue(b,"2026-06-01");
  let step=b;
  ["2026-03-01","2026-05-01","2026-06-01"].forEach(d=>{step={...b};bankValue(step,d);});
  assert.strictEqual(bankValue(b,"2026-06-01"),direct);
  assert.strictEqual(b.balance,100000);
});

t("an asOf before the anchor never accrues backwards",()=>{
  const v=bankValuation(acct({balanceAsOf:"2026-07-01"}),"2026-06-01");
  assert.strictEqual(v.value,100000);
  assert.strictEqual(v.active,false);
});

t("settling folds the estimate in and re-anchors to that day",()=>{
  const b=acct();
  const p=settledBankPatch(b,"2026-07-01");
  assert.strictEqual(p.balanceAsOf,"2026-07-01");
  assert.strictEqual(p.balance,bankValue(b,"2026-07-01"));
  // and a settled account accrues nothing further on the same day
  assert.strictEqual(bankValue({...b,...p},"2026-07-01"),p.balance);
});

t("settle-then-credit doesn't compound old days onto new money",()=>{
  // recordMp2Payout / transferTdProceeds both go through settledBankPatch
  const b=acct();
  const s=settledBankPatch(b,"2026-07-01");
  const credited={...b,...s,balance:s.balance+50000};
  // the deposit earns from today, not from January
  assert.strictEqual(bankValue(credited,"2026-07-01"),150000+0+(s.balance-100000));
  assert.strictEqual(credited.balanceAsOf,"2026-07-01");
});

t("day counting is DST-proof",()=>{
  // parsing both ends as local midnight and subtracting gives 23h or 25h
  // across a DST boundary, which floors to the wrong number of days
  assert.strictEqual(dayNumber("2026-03-30")-dayNumber("2026-03-29"),1);
  assert.strictEqual(dayNumber("2026-10-26")-dayNumber("2026-10-25"),1);
  assert.strictEqual(dayNumber("2026-01-01")-dayNumber("2025-01-01"),365);
});

t("completedMonths handles year boundaries and short months",()=>{
  assert.strictEqual(completedMonths("2025-11-15","2026-02-15"),3);
  assert.strictEqual(completedMonths("2025-11-15","2026-02-14"),2);
  assert.strictEqual(completedMonths("2026-01-31","2026-02-28"),0); // Feb has no 31st
  assert.strictEqual(completedMonths("2026-05-01","2026-01-01"),0); // never negative
});

t("the shipped default block is 20% tax, daily, one tier",()=>{
  const d=DEFAULT_BANK_INTEREST();
  assert.strictEqual(d.enabled,true);
  assert.strictEqual(d.taxPct,20);
  assert.strictEqual(d.crediting,"daily");
  assert.strictEqual(d.tiers.length,1);
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
