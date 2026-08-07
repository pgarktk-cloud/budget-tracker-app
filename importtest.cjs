/* Unit-test backup import validation without a browser.

   Slices the real validateBackup() and migrate() out of index.html and runs
   them in a vm context, per CLAUDE.md — testing the shipped code, not a
   reimplementation.

   The bug this guards against (2026-08-05): import validated exactly one
   thing, `Array.isArray(d.plans)`, then replaced the entire dataset and let
   the 8s autosave push it to the cloud. Any object with a `plans` array —
   including one whose expenses had no amounts, or whose `banks` was a string
   — became the live document on both devices.

   What's under test:
     • a current-shape backup is accepted, with correct counts
     • a legitimately older backup (no installments/bills/payPeriods) is
       accepted, warned about, and correctly defaulted by migrate()
     • structurally invalid documents are refused, with a reason
     • tombstones are excluded from the preview counts
     • validateBackup never mutates its argument (the preview must not be
       able to change what gets imported)

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
// structuralDefaults() -> sampleData() -> defaultData() -> migrate() ->
// validateBackup() are contiguous in the source. The start marker is
// structuralDefaults rather than defaultData because defaultData is now just
// the composition of the first two — starting at it would slice away the
// helpers it calls.
// uid() is referenced by sampleData, so it's handed in rather than sliced.
const src=slice("function structuralDefaults(){","/* Bills Reserve = opening baseline");
// uid() and SEG (the category colour palette) are referenced by defaultData
// but live far away in the source, so they're stubbed rather than sliced.
vm.runInContext(`
function uid(){return Math.random().toString(36).slice(2,9);}
var SEG=["#2C5FA8","#6FA0D6","#1B3E73","#2E8BB0","#4C6E9C","#8FB4DD","#173B5E","#5BA7C2"];
var monthLabel=function(){return "August 2026";};
var P={gr:"#2f9e6d",br:"#8a6a3d",amber:"#c98a12"};
`+src+`
this.defaultData=defaultData; this.migrate=migrate;
this.structuralDefaults=structuralDefaults; this.sampleData=sampleData;
this.validateBackup=validateBackup;
this.BACKUP_ARRAY_KEYS=BACKUP_ARRAY_KEYS;
this.BACKUP_OPTIONAL_KEYS=BACKUP_OPTIONAL_KEYS;`,ctx);
const{defaultData,migrate,validateBackup,BACKUP_ARRAY_KEYS,BACKUP_OPTIONAL_KEYS}=ctx;

const clone=o=>JSON.parse(JSON.stringify(o));

/* A realistic current-shape export: defaultData() is literally what the app
   ships, so it is the most honest "valid backup" fixture available. */
const current=()=>clone(migrate(defaultData()));

/* A plausible pre-installments, pre-bills backup. */
const legacy=()=>({
  currency:"SAR",
  owners:{me:"Jastine",wife:"Charlene"},
  dataUpdatedAt:"2026-05-01T09:00:00.000Z",
  plans:[{id:"p1",owner:"me",name:"Base",income:22000,
    groups:[{id:"g1",name:"Essentials"}],
    categories:[{id:"c1",name:"Groceries",amount:3000,groupId:"g1",subs:[]}]}],
  expenses:[{id:"e1",catId:"c1",name:"Store",amount:120,date:"2026-04-30",owner:"me"}],
  goals:[],investments:[],banks:[],assets:[],history:[],
  household:{splitMine:50,expenses:[]},
});

console.log("backup import validation");

/* ── accepted ───────────────────────────────────────────────────────────── */

t("a current-shape backup is accepted",()=>{
  const r=validateBackup(current());
  assert.ok(r.ok,"should be accepted, got: "+r.errors.join(" | "));
  assert.deepEqual(r.errors,[]);
});

t("counts describe what the user will get",()=>{
  const d=current();
  d.expenses=[{id:"e1",catId:"c1",amount:10,date:"2026-08-01"},
              {id:"e2",catId:"c1",amount:20,date:"2026-08-02"}];
  const r=validateBackup(d);
  assert.strictEqual(r.summary.counts.transactions,2);
  assert.strictEqual(r.summary.counts.plans,d.plans.length);
  assert.strictEqual(r.summary.currency,"SAR");
  assert.strictEqual(r.summary.owners.me,d.owners.me);
});

t("tombstones are excluded from the counts but reported separately",()=>{
  const d=current();
  d.expenses=[{id:"e1",catId:"c1",amount:10,date:"2026-08-01"},
              {id:"e2",catId:"c1",amount:20,date:"2026-08-02",deletedAt:"2026-08-03T00:00:00.000Z"}];
  const r=validateBackup(d);
  assert.strictEqual(r.summary.counts.transactions,1,"a deleted row is not something the user is importing");
  assert.ok(r.summary.deleted>=1,"but it should still be mentioned");
});

t("the backup date is read from dataUpdatedAt",()=>{
  const d=current();d.dataUpdatedAt="2026-07-04T12:00:00.000Z";
  assert.strictEqual(validateBackup(d).summary.savedAt,"2026-07-04T12:00:00.000Z");
});

t("a missing backup date is not an error",()=>{
  const d=current();delete d.dataUpdatedAt;
  const r=validateBackup(d);
  assert.ok(r.ok);
  assert.strictEqual(r.summary.savedAt,null,"the sheet says 'date not recorded' rather than refusing");
});

/* ── older backups ──────────────────────────────────────────────────────── */

t("a legitimately older backup is accepted, with warnings",()=>{
  const r=validateBackup(legacy());
  assert.ok(r.ok,"an old backup must not be refused: "+r.errors.join(" | "));
  assert.ok(r.warnings.length>0,"but the user should be told it's an old one");
  assert.ok(r.warnings.some(w=>w.includes("installments")),"installments predate it");
});

t("...and migrate() fills in everything it was missing",()=>{
  const m=migrate(legacy());
  BACKUP_OPTIONAL_KEYS.forEach(k=>{
    assert.ok(Array.isArray(m[k]),`migrate() should have defaulted "${k}"`);
  });
  assert.ok(m.payPeriods&&m.payPeriods.me,"payPeriods must be defaulted");
  assert.ok(m.settings,"settings must be defaulted");
  assert.strictEqual(m.expenses[0].createdAt!==undefined,true,"createdAt is backfilled");
});

t("an older backup's records survive the migration intact",()=>{
  const m=migrate(legacy());
  assert.strictEqual(m.expenses.length,1);
  assert.strictEqual(m.expenses[0].amount,120);
  assert.strictEqual(m.plans[0].categories[0].name,"Groceries");
});

/* ── refused ────────────────────────────────────────────────────────────── */

const refuse=(label,doc,expectFragment)=>t(label,()=>{
  const r=validateBackup(doc);
  assert.strictEqual(r.ok,false,"should have been refused");
  assert.ok(r.errors.length>0,"a refusal must say why");
  assert.strictEqual(r.summary,null,"no preview for something we refuse");
  if(expectFragment)assert.ok(r.errors.join(" | ").toLowerCase().includes(expectFragment.toLowerCase()),
    `expected a reason mentioning "${expectFragment}", got: ${r.errors.join(" | ")}`);
});

refuse("null is refused",null);
refuse("a top-level array is refused",[{id:"x"}]);
refuse("a string is refused","{}");
refuse("an empty object is refused (no plans)",{}, "plans");
refuse("a non-array plans is refused",{plans:"nope"});
refuse("a plan that isn't an object",{plans:["nope"]});
refuse("a plan with no id",{plans:[{name:"X",categories:[],groups:[]}]},"no id");
refuse("a plan with no categories",{plans:[{id:"p1",groups:[]}]},"category list");
refuse("a plan with no groups",{plans:[{id:"p1",categories:[]}]},"group list");
refuse("a category with no id",
  {plans:[{id:"p1",groups:[],categories:[{name:"Groceries"}]}]},"no id");
refuse("a broken subs list",
  {plans:[{id:"p1",groups:[],categories:[{id:"c1",name:"G",subs:"nope"}]}]},"sub-item");
refuse("banks that isn't a list",
  {plans:[{id:"p1",categories:[],groups:[]}],banks:{}},"banks");
refuse("owners that isn't an object",
  {plans:[{id:"p1",categories:[],groups:[]}],owners:["a","b"]},"owners");
refuse("currency that isn't a string",
  {plans:[{id:"p1",categories:[],groups:[]}],currency:42},"currency");
refuse("household.expenses that isn't a list",
  {plans:[{id:"p1",categories:[],groups:[]}],household:{expenses:"nope"}},"household.expenses");
refuse("an expense with no amount",
  {plans:[{id:"p1",categories:[],groups:[]}],expenses:[{id:"e1",name:"Store",date:"2026-08-01"}]},"amount");
refuse("an expense with a non-numeric amount",
  {plans:[{id:"p1",categories:[],groups:[]}],expenses:[{id:"e1",amount:"abc",date:"2026-08-01"}]},"amount");
refuse("an expense with no id",
  {plans:[{id:"p1",categories:[],groups:[]}],expenses:[{amount:10,date:"2026-08-01"}]},"no id");
refuse("an expense that isn't an object",
  {plans:[{id:"p1",categories:[],groups:[]}],expenses:["nope"]});
refuse("a broken household expense",
  {plans:[{id:"p1",categories:[],groups:[]}],household:{expenses:[{id:"h1",amount:null}]}},"amount");

t("a zero amount is fine — it is a real figure, unlike an absent one",()=>{
  const r=validateBackup({plans:[{id:"p1",categories:[],groups:[]}],
    expenses:[{id:"e1",amount:0,date:"2026-08-01"}]});
  assert.ok(r.ok,"0 must not be treated as missing: "+r.errors.join(" | "));
});

t("every error is reported, not just the first",()=>{
  const r=validateBackup({plans:[{id:"p1",categories:[],groups:[]}],
    expenses:[{id:"e1"},{id:"e2"},{id:"e3"}]});
  assert.strictEqual(r.ok,false);
  assert.ok(r.errors.length>=3,"the user should see how bad the file is, not one line of it");
});

/* ── safety ─────────────────────────────────────────────────────────────── */

t("validateBackup never mutates the document it inspects",()=>{
  const d=current();
  const before=JSON.stringify(d);
  validateBackup(d);
  assert.strictEqual(JSON.stringify(d),before,"the preview must not change what gets imported");
});

t("a refused document is also left untouched",()=>{
  const d={plans:[{id:"p1"}],expenses:[{id:"e1"}]};
  const before=JSON.stringify(d);
  validateBackup(d);
  assert.strictEqual(JSON.stringify(d),before);
});

t("unknown keys are preserved through migrate, not silently dropped",()=>{
  const d=legacy();d.somethingFromTheFuture={a:1};
  const m=migrate(clone(d));
  assert.deepEqual(m.somethingFromTheFuture,{a:1},
    "dropping a key we don't recognise would quietly lose data written by a newer build");
});

t("every array key the validator checks is one migrate() knows about",()=>{
  // catches a typo'd key silently never being validated
  const m=migrate(defaultData());
  const unknown=BACKUP_ARRAY_KEYS.filter(k=>m[k]===undefined&&k!=="portHistory");
  assert.deepEqual(unknown,[],"validator checks keys the app doesn't have: "+unknown.join(", "));
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
