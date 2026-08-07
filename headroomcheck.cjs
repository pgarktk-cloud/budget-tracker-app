/* headroomcheck.cjs — does the Purchase Advisor's headroom equal what the
   Budget tab shows as "Left", on a REAL document?
   Run:  node headroomcheck.cjs <backup.json> [path-to-index.html]
   Exit: 0 if every bucket agrees, 1 if any drifts. Read-only, offline.

   TOOLING, NOT A RUNNER. It is not one of the nineteen and must not be added
   to them: it needs a backup file that is nobody's to commit, so a CI-style
   "run all of them" sweep would fail for want of an argument. Run it by hand
   whenever the advisor's arithmetic or Budget's totals are touched.

   WHY IT EXISTS
   -------------
   purchasetest.cjs case 2 already asserts headroom === Budget's remaining, but
   over a FIXTURE — a hand-built plan with three categories and a two-payment
   installment. A fixture cannot exercise 29 plans, nine monthlyPlans mappings,
   an actualStarts override, or a plan chain inherited 24 buckets forward. This
   drives the same comparison over the real document, which is the only thing
   that can find a disagreement the fixture's shape happens not to produce.

   WHAT IT COMPARES
   ----------------
   Both sides are SLICED out of the shipped index.html, per CLAUDE.md — never
   restated here, or it would test the copy:

     advisor  purchaseHeadroomForBucket(ctx,bucket).headroom
     budget   BudgetView's own `income - manualAllocated - installmentTotal`,
              lifted from the component by the same markers purchasetest.cjs
              uses. That is the figure rendered as "Left" / "Over by".

   It also compares the three INPUTS separately (income, planned,
   installmentTotal), because two wrongs that cancel would leave the totals
   equal — a field drift with a matching headroom is still a real defect.

   WHAT IT CANNOT TELL YOU
   -----------------------
   It proves the two expressions agree with EACH OTHER. If both resolve the
   wrong plan for a bucket they agree and are both wrong. Confirm one row
   against the app's own Budget tab before trusting a clean run.

   PRIVACY
   -------
   The backup path is an argument and is never defaulted, so this file carries
   no data and cannot be committed with any. It prints only per-bucket totals —
   no category, account, goal or transaction names. `.gitignore` already covers
   `allocation-backup-*.json` and `*-backup-*.json`; keep it that way, this is a
   public repo. Nothing here writes or fetches. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");

const backupPath=process.argv[2];
const htmlPath=process.argv[3]||path.join(__dirname,"index.html");
if(!backupPath){
  console.error("\n  usage: node headroomcheck.cjs <backup.json> [path-to-index.html]\n"+
                "  Export one from the app: Settings -> Download backup.\n");
  process.exit(2);
}

const html=fs.readFileSync(htmlPath,"utf8").replace(/\r\n/g,"\n");
const data=JSON.parse(fs.readFileSync(backupPath,"utf8"));

/* Slice markers are plain indexOf on source text, so they break silently when
   the code moves — assert on the marker being found. */
function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}

/* ── the engine sandbox ───────────────────────────────────────────────────
   The period/plan/installment helpers are sliced in alongside the engine
   rather than stubbed, for the reason purchasetest.cjs gives: "which bucket
   does this due date fall in" and "which plan does this future month inherit"
   ARE half of what the answer is. Top-level `const` bindings don't attach to a
   vm context — only function declarations do — so hand those over explicitly. */
const ctx={console};
vm.createContext(ctx);
Object.assign(ctx,{defaultData:()=>({}),uid:()=>"stub"});
vm.runInContext(
  slice("function daysInCalMonth(y,m){","/* Tracked-spending rollup for one owner")+"\n"+
  slice("const MIN_TREND_BUCKETS=3;","function bucketHistoryFor(")+"\n"+
  slice("function dayNumber(str){","/* Reconcile: fold the accrued estimate")+`
this.PURCHASE_HORIZON_BUCKETS=PURCHASE_HORIZON_BUCKETS;
this.INSTALLMENT_ROUND_TOL=INSTALLMENT_ROUND_TOL;`,ctx);

const{categoryEffectiveAmt,purchaseHeadroomForBucket,resolvePlanForMonth,
      derivedInstallmentRowsFor,bucketKeyFor,bucketShift,
      PURCHASE_HORIZON_BUCKETS}=ctx;

/* ── BudgetView's OWN expression, lifted out of the component ────────────── */
const bctx={};
vm.createContext(bctx);
vm.runInContext(
  "function budgetTotals(monthPlan,installmentRows,effectiveAmt){\n"+
  slice("  const installmentTotal=installmentRows.reduce(","  const pct=n=>income>0?")+
  "\n  return{income,manualAllocated,installmentTotal,allocated,remaining};\n}",bctx);
const budgetTotals=bctx.budgetTotals;

/* ── drive it over every owner x the whole advisor horizon ───────────────── */
const todayStr=process.env.TODAY||new Date().toISOString().slice(0,10);
const money=n=>(Number(n)||0).toLocaleString("en-US",
  {minimumFractionDigits:2,maximumFractionDigits:2});
const OWNERS=["me","wife"];               // "household" is never an owner here
const label=o=>((data.owners||{})[o])||o;
const EPS=1e-9;

let checks=0,drifts=0;
console.log(`\nHeadroom cross-check — advisor vs Budget's "Left"`);
console.log(`  backup : ${path.basename(backupPath)}`);
console.log(`  build  : ${(html.match(/const APP_VERSION="([^"]+)"/)||[])[1]}`+
            ` / ${(html.match(/const BUILD_ID="([^"]+)"/)||[])[1]}`);
console.log(`  today  : ${todayStr}${process.env.TODAY?"  (TODAY override)":""}\n`);

for(const owner of OWNERS){
  const cfg=(data.payPeriods||{})[owner]||{};
  const cur=bucketKeyFor(todayStr,data.payPeriods,owner);
  const overrides=Object.keys((cfg.actualStarts)||{}).length;
  console.log(`${label(owner)}  (${owner})  pay periods `+
    `${cfg.enabled?`ON, payday ${cfg.payday}`:"off"}`+
    `${overrides?`, ${overrides} boundary override(s)`:""}  ·  current bucket ${cur}`);
  console.log(`  ${"bucket".padEnd(12)}${"income".padStart(13)}${"planned".padStart(13)}`+
              `${"instal".padStart(11)}${"advisor".padStart(14)}${"budget Left".padStart(14)}`);

  /* The advisor's own ctx shape. `trims` is a per-decision draft lever and is
     empty here on purpose — an untrimmed budget is what Budget itself shows. */
  const c={monthlyPlans:data.monthlyPlans,plans:data.plans,activePlanId:data.activePlanId,
           installments:data.installments,installmentPayments:data.installmentPayments,
           payPeriods:data.payPeriods,owner,trims:{}};

  for(let i=0;i<PURCHASE_HORIZON_BUCKETS;i++){
    const bucket=i===0?cur:bucketShift(cur,data.payPeriods,owner,i);
    const monthPlan=resolvePlanForMonth(
      data.monthlyPlans,bucket,owner,data.activePlanId,data.plans).plan;
    const rows=derivedInstallmentRowsFor(
      data.installments,data.installmentPayments,owner,bucket,data.payPeriods);
    const budget=budgetTotals(monthPlan,rows,categoryEffectiveAmt);
    const engine=purchaseHeadroomForBucket(c,bucket);

    const drift=Math.abs(engine.headroom-budget.remaining)>EPS;
    /* Checked separately: two wrongs that cancel still leave the totals equal. */
    const fieldDrift=["income","planned","installmentTotal"].filter(k=>{
      const b=k==="planned"?budget.manualAllocated:budget[k];
      return Math.abs((engine[k]||0)-(b||0))>EPS;
    });
    checks++; if(drift||fieldDrift.length)drifts++;

    const mark=drift?"  <<< DRIFT"
      :fieldDrift.length?"  <<< field drift: "+fieldDrift.join(",")
      :"  ok";
    console.log(`  ${bucket.padEnd(12)}${money(engine.income).padStart(13)}`+
      `${money(engine.planned).padStart(13)}${money(engine.installmentTotal).padStart(11)}`+
      `${money(engine.headroom).padStart(14)}${money(budget.remaining).padStart(14)}${mark}`);
    if(fieldDrift.length)
      console.log(`      budget: income ${money(budget.income)}`+
        ` planned ${money(budget.manualAllocated)} instal ${money(budget.installmentTotal)}`);
  }
  console.log("");
}

console.log(drifts===0
  ? `RESULT: ${checks} buckets checked across ${OWNERS.length} owners — advisor and`+
    ` Budget agree everywhere.\n         Confirm one row against the app's Budget`+
    ` tab; agreeing with each other is not the same as being right.\n`
  : `RESULT: ${drifts} of ${checks} buckets DISAGREE. The engine is wrong —`+
    ` fix it before trusting a verdict.\n`);
process.exit(drifts===0?0:1);
