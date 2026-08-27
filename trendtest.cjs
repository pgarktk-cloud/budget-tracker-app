/* Unit-test Home's trend maths without a browser.
   Slices the real function bodies out of index.html by name and runs them in
   a vm context, per CLAUDE.md — testing the actual code, not a reimplementation.
   These two cards cannot render yet (they need 3 completed periods and the
   user has one month of data), so this is the only verification available
   before ~Oct 2026. */
const fs=require("fs"), vm=require("vm"), assert=require("assert"), path=require("path");
// Resolve relative to this file, not an absolute machine path — the runner has
// to work in a fresh clone. Normalise CRLF for the same reason: a Windows
// checkout would otherwise break slice markers that span a newline.
const src=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8")
  .replace(/\r\n/g,"\n");

function grabFn(name){
  const re=new RegExp("^function "+name+"\\(","m");
  const m=re.exec(src);
  if(!m)throw new Error("function not found: "+name);
  // skip the parameter list first — several of these destructure, so the
  // first "{" after the name belongs to the params, not the body
  let k=src.indexOf("(",m.index), pd=0;
  for(;k<src.length;k++){
    if(src[k]==="(")pd++;
    else if(src[k]===")"){pd--;if(pd===0){k++;break;}}
  }
  let depth=0, j=src.indexOf("{",k);
  for(;j<src.length;j++){
    const ch=src[j];
    if(ch==="{")depth++;
    else if(ch==="}"){depth--;if(depth===0){j++;break;}}
  }
  return src.slice(m.index,j);
}
function grabConst(name){
  const re=new RegExp("^const "+name+"=[^;]+;","m");
  const m=re.exec(src);
  if(!m)throw new Error("const not found: "+name);
  // `const` at the top level of runInContext does not become a property of
  // the context object the way function declarations do — rebind as var so
  // the test can read it back.
  return m[0].replace(/^const /,"var ");
}
// arrays built inside the vm have a different Array prototype, so
// deepStrictEqual fails on the realm check alone; compare by value.
const sameList=(a,b,msg)=>assert.strictEqual(JSON.stringify(a),JSON.stringify(b),msg);

const ctx={console};
vm.createContext(ctx);
vm.runInContext([
  // pay-periods are off in these fixtures, so the period helpers must never
  // be reached; make that an assertion rather than an assumption.
  "function periodKeyFor(){throw new Error('period path taken unexpectedly');}",
  grabConst("MIN_TREND_BUCKETS"),
  grabFn("todayISO"),
  grabFn("bucketKeyFor"),
  grabFn("bucketNow"),
  grabFn("trackedSpendingFor"),
  grabFn("savingsInvestingFor"),
  grabFn("bucketHistoryFor"),
  grabFn("bucketHistoryCombined"),
].join("\n"), ctx);

const CUR=ctx.todayISO().slice(0,7);
const monthsAgo=n=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;};

// one plan shape reused for every month: two tracked envelopes + a savings cat
const plan={income:10000,groups:[{id:"g1"}],categories:[
  {id:"food",groupId:"g1",name:"Food",amount:1000,trackExpenses:true},
  {id:"gas", groupId:"g1",name:"Gas", amount:500, trackExpenses:true},
  {id:"sav", groupId:"g1",name:"Savings",amount:0,trackExpenses:false},
]};
const planForMonth=()=>plan;
const tx=(owner,date,catId,amount)=>({owner,date,catId,amount});
const mk=expenses=>({planForMonth,expenses,payPeriods:{}});

let pass=0;
const t=(name,fn)=>{try{fn();console.log("  ok  "+name);pass++;}
  catch(e){console.error("  FAIL "+name+"\n       "+e.message);process.exitCode=1;}};

console.log("\nbucketHistoryFor — gating");
t("returns nothing when there is no history", ()=>{
  assert.strictEqual(ctx.bucketHistoryFor("me",mk([]),["Savings"],[]).length,0);
});
t("EXCLUDES the in-progress current period", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([tx("me",CUR+"-05","food",300)]),["Savings"],[]);
  assert.strictEqual(h.length,0,"current bucket must not count as history");
});
t("two completed periods is still below the render gate", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(1)+"-05","food",300),
    tx("me",monthsAgo(2)+"-05","food",300),
  ]),["Savings"],[]);
  assert.strictEqual(h.length,2);
  assert.ok(h.length<ctx.MIN_TREND_BUCKETS,"2 < gate, so both cards stay hidden");
});
t("three completed periods opens the gate, in chronological order", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(3)+"-05","food",300),
    tx("me",monthsAgo(1)+"-05","food",300),
    tx("me",monthsAgo(2)+"-05","food",300),
  ]),["Savings"],[]);
  assert.strictEqual(h.length,3);
  sameList(h.map(r=>r.bucket),[monthsAgo(3),monthsAgo(2),monthsAgo(1)]);
});
t("a period with only a plan and no expenses is not 'tracked'", ()=>{
  // plans carry forward automatically, so plan-existence must not imply data
  const h=ctx.bucketHistoryFor("me",mk([tx("me",monthsAgo(1)+"-05","food",300)]),["Savings"],[]);
  assert.strictEqual(h.length,1,"only the month with a real expense row");
});
t("other owners' rows never leak in", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("wife",monthsAgo(1)+"-05","food",900),
    tx("me",  monthsAgo(1)+"-05","food",100),
  ]),["Savings"],[]);
  assert.strictEqual(h.length,1);
  assert.strictEqual(h[0].spent,100);
});

console.log("\nLifestyleCreepCard maths (latest vs mean of prior)");
const creep=h=>{
  const latest=h[h.length-1], prior=h.slice(0,-1);
  const baseline=prior.reduce((s,r)=>s+r.spent,0)/prior.length;
  return((latest.spent-baseline)/baseline)*100;
};
t("flags a real increase", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(3)+"-05","food",100),
    tx("me",monthsAgo(2)+"-05","food",100),
    tx("me",monthsAgo(1)+"-05","food",150),
  ]),["Savings"],[]);
  assert.strictEqual(Math.round(creep(h)),50); // 150 vs mean(100,100)
});
t("reports a decrease as a decrease", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(3)+"-05","food",200),
    tx("me",monthsAgo(2)+"-05","food",200),
    tx("me",monthsAgo(1)+"-05","food",100),
  ]),["Savings"],[]);
  assert.strictEqual(Math.round(creep(h)),-50);
});
t("steady spending reads as steady, inside the ±5% noise band", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(3)+"-05","food",100),
    tx("me",monthsAgo(2)+"-05","food",100),
    tx("me",monthsAgo(1)+"-05","food",102),
  ]),["Savings"],[]);
  assert.ok(Math.abs(creep(h))<=5);
});

console.log("\nSavingsTrendCard maths (rate in points)");
t("rate is savings+investing over income, per period", ()=>{
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(3)+"-05","sav",1000),
    tx("me",monthsAgo(2)+"-05","sav",1500),
    tx("me",monthsAgo(1)+"-05","sav",2000),
  ]),["Savings"],[]);
  sameList(h.map(r=>Math.round(r.rate)),[10,15,20]);
  assert.strictEqual(Math.round(h[h.length-1].rate-h[0].rate),10,"up 10 points");
});
t("untracked savings category is excluded from `spent`", ()=>{
  // Savings has trackExpenses:false, so it must not inflate spending
  const h=ctx.bucketHistoryFor("me",mk([
    tx("me",monthsAgo(1)+"-05","sav",5000),
    tx("me",monthsAgo(1)+"-06","food",100),
  ]),["Savings"],[]);
  assert.strictEqual(h[0].spent,100);
  assert.strictEqual(h[0].saved,5000);
});

console.log("\nHousehold merging");
t("sums both owners per period rather than concatenating", ()=>{
  const ex=[];
  [3,2,1].forEach(n=>{
    ex.push(tx("me",  monthsAgo(n)+"-05","food",100));
    ex.push(tx("wife",monthsAgo(n)+"-05","food",50));
  });
  const h=ctx.bucketHistoryCombined("household",mk(ex),["Savings"],[]);
  assert.strictEqual(h.length,3,"one row per period, not six");
  assert.strictEqual(h[0].spent,150);
  assert.strictEqual(h[0].income,20000,"both incomes");
});
t("household rate is recomputed, NOT averaged from each owner's rate", ()=>{
  // me saves 4000/10000 = 40%, wife saves 0/10000 = 0% → household 20%,
  // which a naive mean of rates would also give; make them uneven to tell apart
  const ex=[];
  [3,2,1].forEach(n=>{
    ex.push(tx("me",  monthsAgo(n)+"-05","sav",4000));
    ex.push(tx("wife",monthsAgo(n)+"-05","sav",1000));
  });
  const h=ctx.bucketHistoryCombined("household",mk(ex),["Savings"],[]);
  assert.strictEqual(Math.round(h[0].rate),25,"5000/20000 = 25%");
});
t("household handles a period only one owner tracked", ()=>{
  const ex=[
    tx("me",monthsAgo(3)+"-05","food",100),
    tx("me",monthsAgo(2)+"-05","food",100),
    tx("me",monthsAgo(1)+"-05","food",100),
    tx("wife",monthsAgo(1)+"-05","food",70),
  ];
  const h=ctx.bucketHistoryCombined("household",mk(ex),["Savings"],[]);
  assert.strictEqual(h.length,3);
  assert.strictEqual(h[2].spent,170);
  assert.strictEqual(h[0].spent,100,"periods wife didn't track still work");
});

console.log("\ntrackedSpendingFor — carry-over raises budget, never spend");
const cur=d=>CUR+"-"+d; // a date inside the current bucket
t("a carryover row RAISES budget/remaining and is NOT counted as spent", ()=>{
  const base=ctx.trackedSpendingFor("me",mk([tx("me",cur("05"),"gas",100)]),CUR);
  const gasBase=base.cats.find(c=>c.id==="gas");
  const withCarry=ctx.trackedSpendingFor("me",mk([
    tx("me",cur("05"),"gas",100),
    {owner:"me",date:cur("06"),catId:"gas",amount:200,isCarryover:true},
  ]),CUR);
  const gas=withCarry.cats.find(c=>c.id==="gas");
  assert.strictEqual(gas.spent,gasBase.spent,"carryover must not count as spend");
  assert.strictEqual(gas.budget,gasBase.budget+200,"carryover must raise budget");
  assert.strictEqual(gas.remaining,gasBase.remaining+200,"carryover must raise remaining");
});
t("a NEGATIVE carryover LOWERS budget and remaining", ()=>{
  const base=ctx.trackedSpendingFor("me",mk([tx("me",cur("05"),"gas",100)]),CUR);
  const gasBase=base.cats.find(c=>c.id==="gas");
  const withNeg=ctx.trackedSpendingFor("me",mk([
    tx("me",cur("05"),"gas",100),
    {owner:"me",date:cur("06"),catId:"gas",amount:-150,isCarryover:true},
  ]),CUR);
  const gas=withNeg.cats.find(c=>c.id==="gas");
  assert.strictEqual(gas.spent,gasBase.spent,"negative carryover must not move spend");
  assert.strictEqual(gas.budget,gasBase.budget-150,"negative carryover must lower budget");
  assert.strictEqual(gas.remaining,gasBase.remaining-150,"negative carryover must lower remaining");
});

console.log("\n"+pass+" assertions passed"+(process.exitCode?" (with failures above)":""));
