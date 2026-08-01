/* Unit-test per-profile ownership maths without a browser.

   Slices the real predicates and the real netWorthParts aggregator out of
   index.html and runs them in a vm context, per CLAUDE.md. netWorthParts is a
   closure over App() state, so its free variables (banks, assets, sarOf,
   bankValue, liabilityBalance, the household totals) are injected as small
   stubs — the arithmetic under test is still the shipped code.

   The contract being tested:
     • "household" is the COMBINED view: everything, including jointly-owned
       records. It is not a third person.
     • a person's view is strictly what they own, so joint records show up
       ONLY under household — which means me + wife < household whenever
       anything is joint. That is deliberate, not a rounding bug.
     • assets/liabilities with no owner read as "household", because migrate()
       defaults them there rather than guessing a person
     • investments with no owner read as "me" — a DIFFERENT fallback, because
       those predate joint accounts and were always personal

   Gotcha: assert.deepStrictEqual compares prototypes and therefore fails
   across vm realms. Use deepEqual for anything built inside the vm. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const SRC=process.argv[2]||path.join(__dirname,"index.html");
const html=fs.readFileSync(SRC,"utf8").replace(/\r\n/g,"\n");

function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

/* ── the two predicates ── */
const predSrc=slice("function investmentsForProfile(invs,owner){",
                    "/* ── Bank interest accrual");
const ctx={};
vm.createContext(ctx);
vm.runInContext(predSrc,ctx);
const{investmentsForProfile,ownerMatch}=ctx;

/* ── the aggregator, with App()'s free variables stubbed ── */
const partsSrc=slice("const netWorthParts=p=>{","const householdParts=");

/* Two banks each, one joint; two assets and one liability, one of each joint.
   Everything is SAR at 1:1 so the expected figures stay readable. */
const banks=[
  {id:"b1",owner:"me",currency:"SAR",balance:1000},
  {id:"b2",owner:"wife",currency:"SAR",balance:2000},
  {id:"b3",owner:"household",currency:"SAR",balance:500},
];
const assets=[
  {id:"a1",kind:"asset",owner:"me",currency:"SAR",value:100},
  {id:"a2",kind:"asset",owner:"household",currency:"SAR",value:300},
  {id:"a3",kind:"asset",currency:"SAR",value:50},               // pre-migration, no owner
  {id:"l1",kind:"liability",owner:"wife",currency:"SAR",value:80},
  {id:"l2",kind:"liability",owner:"household",currency:"SAR",value:20},
];
const invSarByProfile={me:10,wife:20,household:35}; // 5 of it jointly owned

function buildParts(over={}){
  const env=Object.assign({
    ownerMatch,
    banks,assets,
    banksSar:banks.reduce((s,b)=>s+b.balance,0),
    invSar:invSarByProfile.household,
    invSarForOwner:p=>invSarByProfile[p]||0,
    sarOf:(v)=>Number(v)||0,
    bankValue:b=>b.balance,
    liabilityBalance:a=>Number(a.value)||0,
    todayStr:"2026-08-01",
  },over);
  const c={};
  vm.createContext(c);
  Object.assign(c,env);
  vm.runInContext(partsSrc+"\nthis.netWorthParts=netWorthParts;",c);
  return c.netWorthParts;
}
const parts=buildParts();

console.log("\nownership predicates\n");

t("household matches everything, whatever the owner",()=>{
  assert.equal(ownerMatch({owner:"me"},"household"),true);
  assert.equal(ownerMatch({owner:"wife"},"household"),true);
  assert.equal(ownerMatch({owner:"household"},"household"),true);
  assert.equal(ownerMatch({},"household"),true);
});

t("a person matches only their own records",()=>{
  assert.equal(ownerMatch({owner:"me"},"me"),true);
  assert.equal(ownerMatch({owner:"wife"},"me"),false);
});

t("a JOINT asset is excluded from either person's view",()=>{
  assert.equal(ownerMatch({owner:"household"},"me"),false);
  assert.equal(ownerMatch({owner:"household"},"wife"),false);
});

t("an owner-less asset reads as household, not as 'me'",()=>{
  assert.equal(ownerMatch({},"me"),false);
  assert.equal(ownerMatch({},"wife"),false);
  assert.equal(ownerMatch({},"household"),true);
});

t("investments use the OTHER fallback — owner-less means 'me'",()=>{
  const list=[{id:1},{id:2,owner:"wife"},{id:3,owner:"household"}];
  assert.deepEqual(investmentsForProfile(list,"me").map(x=>x.id),[1]);
  assert.deepEqual(investmentsForProfile(list,"wife").map(x=>x.id),[2]);
  assert.deepEqual(investmentsForProfile(list,"household").map(x=>x.id),[1,2,3]);
});

console.log("\nnetWorthParts\n");

t("household is the combined view — all banks, all assets, all liabilities",()=>{
  const h=parts("household");
  assert.equal(h.banks,3500);
  assert.equal(h.investments,35);
  assert.equal(h.assets,450);      // 100 + 300 + 50 (the owner-less one)
  assert.equal(h.liabilities,100); // 80 + 20
  assert.equal(h.net,3500+35+450-100);
});

t("a person's view carries only their own banks",()=>{
  assert.equal(parts("me").banks,1000);
  assert.equal(parts("wife").banks,2000);
});

t("a person's view excludes joint and owner-less assets",()=>{
  assert.equal(parts("me").assets,100);
  assert.equal(parts("wife").assets,0);
  assert.equal(parts("me").liabilities,0);
  assert.equal(parts("wife").liabilities,80);
});

t("per-owner net worth no longer adds the WHOLE asset/liability pile to each",()=>{
  // the bug this replaced: ownerNetWorthSar used to add assetSar and liabSar
  // (450 / 100) to every profile, inflating both people
  assert.equal(parts("me").net,1000+10+100-0);
  assert.notEqual(parts("me").assets,parts("household").assets);
});

t("me + wife < household whenever anything is joint — by design",()=>{
  const sum=parts("me").net+parts("wife").net;
  assert.ok(sum<parts("household").net,"expected joint records to be missing from the singles");
  // exactly the joint bank + joint investments + joint/owner-less assets − joint liability
  assert.equal(parts("household").net-sum,500+5+350-20);
});

t("with nothing joint, me + wife DOES equal household",()=>{
  const p=buildParts({
    banks:[{id:"b1",owner:"me",currency:"SAR",balance:1000},{id:"b2",owner:"wife",currency:"SAR",balance:2000}],
    banksSar:3000,
    assets:[{id:"a1",kind:"asset",owner:"me",currency:"SAR",value:100},
            {id:"l1",kind:"liability",owner:"wife",currency:"SAR",value:80}],
    invSar:30,invSarForOwner:x=>({me:10,wife:20})[x]||0,
  });
  assert.equal(p("me").net+p("wife").net,p("household").net);
});

t("an empty book is zero everywhere, not NaN",()=>{
  const p=buildParts({banks:[],assets:[],banksSar:0,invSar:0,invSarForOwner:()=>0});
  ["me","wife","household"].forEach(k=>{
    assert.equal(p(k).net,0);
    assert.equal(p(k).assets,0);
  });
});

console.log("\nsource-level guards\n");

t("migrate() defaults an owner-less asset to household",()=>{
  assert.ok(/\(d\.assets\|\|\[\]\)\.forEach\(a=>\{[\s\S]{0,900}?if\(!a\.owner\)a\.owner="household";/.test(html),
    "migrate() no longer defaults asset owner to household");
});

t("netWorthParts routes assets through the shared predicate, not a local filter",()=>{
  assert.ok(/assets\.filter\(a=>ownerMatch\(a,p\)\)/.test(partsSrc),
    "netWorthParts stopped using ownerMatch");
});

t("the daily snapshot effect records per-profile assets/liabilities",()=>{
  // it used to store the household figures on every profile's row
  assert.ok(/assets:Math\.round\(parts\.assets\)/.test(html)&&/liabilities:Math\.round\(parts\.liabilities\)/.test(html),
    "snapshot effect is not using netWorthParts for assets/liabilities");
});

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
