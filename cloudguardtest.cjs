/* Unit-test the gate that stands in front of documents arriving from the CLOUD.

   Slices the real cloudDocProblem() (and the validateBackup it delegates to)
   out of index.html and runs them in a vm context, per CLAUDE.md — testing the
   shipped function, not a reimplementation.

   The gap this closes (2026-08-05): all three pull paths — startup reconcile,
   the inline document handed back by a rejected save, and manual Pull —
   adopted whatever the cloud returned behind a single `Array.isArray(
   remote.plans)` check, then passed it to migrate(). That is exactly the
   one-line check the *import* path outgrew in v1.20.0, left in place on the
   path that runs unattended on both phones.

   What's under test:
     • a current-shape document is accepted
     • a legitimately older document is accepted — warnings must NOT reject,
       or a phone that hasn't used Installments yet would be refused
     • a document carrying collections this build has never heard of is
       accepted (forward compatibility: the other phone may be on a newer
       build, and refusing it would be worse than the bug being fixed)
     • an empty account is not corruption
     • structurally broken documents are refused, and the reason names the
       first real problem and how many there were — a rejection nobody can
       read is the v1.22.1 failure mode all over again
     • the gate never mutates the document it inspects

   Three vm traps (see synctest.cjs): assert.deepStrictEqual compares
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

const ctx={console};
vm.createContext(ctx);
/* structuralDefaults() -> sampleData() -> defaultData() -> migrate() ->
   validateBackup() -> cloudDocProblem() are contiguous in the source; the same
   span importtest.cjs takes. Starts at structuralDefaults because defaultData
   is now just the composition of the two helpers above it. */
const src=slice("function structuralDefaults(){","/* Bills Reserve = opening baseline");
vm.runInContext(`
function uid(){return Math.random().toString(36).slice(2,9);}
var SEG=["#2C5FA8","#6FA0D6","#1B3E73","#2E8BB0","#4C6E9C","#8FB4DD","#173B5E","#5BA7C2"];
var monthLabel=function(){return "August 2026";};
var P={gr:"#2f9e6d",br:"#8a6a3d",amber:"#c98a12"};
`+src+`
this.defaultData=defaultData; this.migrate=migrate;
this.structuralDefaults=structuralDefaults; this.sampleData=sampleData;
this.validateBackup=validateBackup; this.cloudDocProblem=cloudDocProblem;`,ctx);
const{defaultData,migrate,structuralDefaults,sampleData,validateBackup,cloudDocProblem}=ctx;

assert.ok(typeof cloudDocProblem==="function","cloudDocProblem was not sliced out");
assert.ok(typeof structuralDefaults==="function","structuralDefaults was not sliced out");

/* A minimal document that is genuinely usable: one plan with a category and a
   group, one placeable transaction. Built by hand rather than from
   defaultData() so a change to the app's seed data can't quietly weaken what
   "valid" means here. */
const okDoc=()=>({
  plans:[{id:"p1",name:"Base",categories:[{id:"c1",name:"Groceries",amount:1200,ord:0}],groups:[{id:"g1",name:"Essentials",ord:0}]}],
  expenses:[{id:"e1",catId:"c1",name:"Market",amount:340,date:"2026-08-03"}],
  owners:{me:"Jastine",wife:"Charlene"},
  currency:"SAR",
  household:{splitMine:50,expenses:[{id:"h1",name:"Rent",amount:4000}]},
});

console.log("\ncloudDocProblem — what may be adopted from the cloud\n");

t("a current-shape document is accepted",()=>{
  assert.equal(cloudDocProblem(okDoc()),null);
});

t("an empty account is not corruption (null / undefined pass)",()=>{
  assert.equal(cloudDocProblem(null),null);
  assert.equal(cloudDocProblem(undefined),null);
});

t("an older document missing newer collections is ACCEPTED, not refused",()=>{
  /* validateBackup emits warnings for every absent BACKUP_OPTIONAL_KEY. If
     cloudDocProblem looked at warnings, a phone that simply hasn't used
     Installments would have its document refused by the other phone. */
  const d=okDoc();
  const report=validateBackup(d);
  assert.ok(report.warnings.length>0,"expected this fixture to produce warnings at all");
  assert.equal(cloudDocProblem(d),null,"warnings must not reject a document");
});

t("collections from a NEWER build are accepted (forward compatibility)",()=>{
  const d=okDoc();
  d.somethingThisBuildHasNeverHeardOf=[{id:"x1"}];
  d.txTemplates=[{id:"t1",name:"Coffee"}];
  assert.equal(cloudDocProblem(d),null);
});

t("stamped actualStarts entries pass the gate (v1.44.0 forward compat)",()=>{
  /* payPeriods entries changed shape in v1.44.0: a bare "YYYY-MM-DD" became
     {v,updatedAt}, with v:null as a tombstone for a cleared correction. The
     gate does not inspect payPeriods today, so this passes for free — the
     case exists so that if anyone ever adds a payPeriods check, they are told
     immediately rather than by two healthy phones refusing each other's
     documents. That is exactly how trimPolicy's forward-compat case earns its
     place. Both shapes must be accepted, and for as long as any device might
     still hold the legacy one, which is forever. */
  const d=okDoc();
  d.payPeriods={me:{enabled:true,payday:28,actualStarts:{
                  "2026-08-28":{v:"2026-08-24",updatedAt:"2026-08-14T10:00:00.000Z"},
                  "2026-07-28":{v:null,updatedAt:"2026-08-14T10:00:00.000Z"},
                  "2026-06-28":"2026-06-26"}},
                wife:{enabled:false,payday:1,actualStarts:{}}};
  assert.equal(cloudDocProblem(d),null);
});

t("a non-object is refused",()=>{
  assert.ok(cloudDocProblem("{\"plans\":[]}"),"a JSON string is not a document");
  assert.ok(cloudDocProblem(42));
  assert.ok(cloudDocProblem([{id:"p1"}]),"an array is not a document");
});

t("a document with no plans is refused",()=>{
  const d=okDoc();delete d.plans;
  assert.ok(cloudDocProblem(d));
});

t("a known collection that isn't a list is refused (the v1.20.0 bug class)",()=>{
  const d=okDoc();d.banks="oops";
  const why=cloudDocProblem(d);
  assert.ok(why,"banks-as-a-string must be refused");
  assert.ok(/banks/.test(why),"the reason should name the offending collection: "+why);
});

t("a transaction with no usable amount is refused",()=>{
  const d=okDoc();d.expenses.push({id:"e2",catId:"c1",name:"Broken",amount:null,date:"2026-08-04"});
  assert.ok(cloudDocProblem(d));
});

t("a transaction with no id is refused",()=>{
  const d=okDoc();d.expenses.push({catId:"c1",name:"No id",amount:12,date:"2026-08-04"});
  assert.ok(cloudDocProblem(d));
});

t("a plan with no id or no category list is refused",()=>{
  const noId=okDoc();delete noId.plans[0].id;
  assert.ok(cloudDocProblem(noId));
  const noCats=okDoc();delete noCats.plans[0].categories;
  assert.ok(cloudDocProblem(noCats));
});

t("a category with a broken subs list is refused",()=>{
  const d=okDoc();d.plans[0].categories[0].subs="nope";
  assert.ok(cloudDocProblem(d));
});

t("a broken household.expenses list is refused",()=>{
  const d=okDoc();d.household.expenses="nope";
  assert.ok(cloudDocProblem(d));
});

t("the reason names the first problem and counts the rest",()=>{
  const d=okDoc();
  d.banks="oops";d.goals="also oops";d.investments="and this";
  const why=cloudDocProblem(d);
  assert.ok(/^Cloud copy rejected \(3 problems\)/.test(why),"expected a 3-problem prefix, got: "+why);
  /* Which one is quoted follows BACKUP_ARRAY_KEYS order, not the order they
     were broken in — the contract is that a real problem is named, not which. */
  assert.ok(/"(goals|banks|investments)"/.test(why),"expected a real problem quoted: "+why);
});

t("a single problem is reported in the singular",()=>{
  const d=okDoc();d.banks="oops";
  const why=cloudDocProblem(d);
  assert.ok(/\(1 problem\)/.test(why),"expected singular wording, got: "+why);
});

t("a thrown validator is caught, not propagated",()=>{
  /* A document that makes validateBackup itself blow up must still come back
     as a refusal — the pull paths call this inside their own try/catch, but a
     throw there loses the reason and reports a generic sync failure. */
  const hostile={get plans(){throw new Error("boom");}};
  const why=cloudDocProblem(hostile);
  assert.ok(why,"a throwing document must be refused, not rethrown");
  assert.ok(/could not be read/.test(why),"expected the read-failure wording, got: "+why);
});

t("inspecting a document never mutates it",()=>{
  const d=okDoc();
  const before=JSON.stringify(d);
  cloudDocProblem(d);
  assert.equal(JSON.stringify(d),before);
});

t("an accepted document still survives migrate()",()=>{
  /* The gate's whole job is to decide what may be handed to migrate(). If
     something passes here and then breaks there, the gate is in the wrong
     place. */
  const d=okDoc();
  assert.equal(cloudDocProblem(d),null);
  const m=migrate(JSON.parse(JSON.stringify(d)));
  assert.ok(Array.isArray(m.plans)&&m.plans.length===1);
  assert.ok(Array.isArray(m.expenses)&&m.expenses.length===1);
  assert.deepEqual(m.plans[0].categories.map(c=>c.id),["c1"]);
});

t("REGRESSION: the old one-line check would have adopted all of these",()=>{
  /* cloudDocProblem is new, so running this file against HEAD~ proves nothing
     on its own — there is no old function to fail. What CAN be pinned is the
     behaviour that changed: the check the three pull paths actually used was
     `Array.isArray(remote.plans)`, so every document below was adopted and
     handed to migrate(). Each must now be refused. If someone ever weakens the
     gate back toward the old check, this is the assertion that goes red. */
  const oldCheck=raw=>!!(raw&&Array.isArray(raw.plans));
  const wouldHaveBeenAdopted=[
    (()=>{const d=okDoc();d.banks="oops";return d;})(),
    (()=>{const d=okDoc();d.expenses.push({id:"e2",catId:"c1",amount:null});return d;})(),
    (()=>{const d=okDoc();delete d.plans[0].id;return d;})(),
    (()=>{const d=okDoc();delete d.plans[0].categories;return d;})(),
    (()=>{const d=okDoc();d.household.expenses="nope";return d;})(),
    (()=>{const d=okDoc();d.plans[0].categories[0].subs="nope";return d;})(),
  ];
  wouldHaveBeenAdopted.forEach((d,i)=>{
    assert.ok(oldCheck(d),`fixture ${i} should pass the OLD check, or it proves nothing`);
    assert.ok(cloudDocProblem(d),`fixture ${i} must be refused by the new gate`);
  });
});

t("every document defaultData() produces is acceptable to the gate",()=>{
  /* A fresh device's own document must never be one this gate would refuse —
     otherwise the first device to save would lock the other one out. */
  assert.equal(cloudDocProblem(migrate(defaultData())),null);
});

t("the EMPTY document a fresh device now opens on is acceptable to the gate",()=>{
  /* Since 2026-08-07 a brand-new device boots on structuralDefaults(), not
     defaultData() — so this, not the sample document, is what an onboarding
     device would push to an empty cloud. An empty plan list of empty plans is
     still a valid document; if this ever fails, first-run sync is broken. */
  assert.equal(cloudDocProblem(migrate(structuralDefaults())),null);
});

t("structuralDefaults() carries no sample records",()=>{
  /* The whole point of the split. If a sample record leaks back into the
     empty shape, the fresh-device contamination bug returns silently. */
  const d=migrate(structuralDefaults());
  ["goals","investments","banks","assets"].forEach(k=>
    assert.equal((d[k]||[]).length,0,`${k} should be empty on a fresh device`));
  assert.equal((d.household&&d.household.expenses||[]).length,0,"household.expenses should be empty");
  assert.equal(d.plans.reduce((s,p)=>s+p.categories.length,0),0,"no seeded categories");
  assert.equal(d.plans.reduce((s,p)=>s+p.income,0),0,"no seeded income");
  // ...while the sample document still has all of them.
  const s=migrate(defaultData());
  assert.ok(s.goals.length&&s.investments.length&&s.banks.length&&s.assets.length,
    "defaultData() must still produce the sample records");
  assert.ok(s.plans.reduce((a,p)=>a+p.categories.length,0)>0,"sample categories still present");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
