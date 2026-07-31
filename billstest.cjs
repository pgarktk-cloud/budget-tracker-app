/* Unit-test the Bills reconciler without a browser.

   Slices the real effect body out of index.html by text and runs it in a vm
   context, per CLAUDE.md — testing the shipped code, not a reimplementation.

   The reconciler keeps data.bills in step with household.expenses: it creates
   rows for newly tracked items, revives tombstoned ones when an item is
   re-tracked, retires rows whose item is no longer tracked, and resyncs the
   ones that are. The two asymmetries below are deliberate — see
   docs/decisions.md, "Derived collections must reconcile, not only generate":
     • a row with paid > 0 survives untracking (it's a record, not a projection)
     • `allocated` follows Household only while unpaid; the name always follows

   Gotcha: assert.deepStrictEqual compares prototypes and therefore fails
   across vm realms. Use deepEqual for anything built inside the vm. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8");

function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

const effect=slice("      const items=((d.household||{}).expenses||[]).filter(e=>!e.deletedAt&&e.trackInBills);",
                   "  },[loaded,currentBillMonthKey,trackedHhKey]);");
const body=effect.replace(/\s*\}\);\s*$/,"");
let seq=0;
const reconcile=(d,monthKey="2026-07")=>{
  const ctx={currentBillMonthKey:monthKey,uid:()=>"b"+(++seq)};
  vm.createContext(ctx);
  vm.runInContext("var __run=function(d){"+body+"\n};",ctx);
  return ctx.__run(d);
};
const doc=(exp,bills)=>({household:{expenses:exp},bills});
const item=(id,name,amount,tracked)=>({id,name,amount,trackInBills:tracked});
const bill=(id,itemId,over)=>Object.assign({id,monthKey:"2026-07",itemId,itemName:"x",allocated:100,paid:0,status:"unpaid"},over);

console.log("bills reconciler");

t("creates a row for a newly tracked item",()=>{
  const out=reconcile(doc([item("i1","Rent",5000,true)],[]));
  assert.strictEqual(out.bills.length,1);
  assert.strictEqual(out.bills[0].itemName,"Rent");
  assert.strictEqual(out.bills[0].allocated,5000);
});

t("is a no-op (identity) when nothing changed",()=>{
  // critical: this runs in an effect, so a fresh object every pass would loop
  // and dirty the document on every app open
  const d=doc([item("i1","Rent",5000,true)],[bill("b1","i1",{itemName:"Rent",allocated:5000})]);
  assert.strictEqual(reconcile(d),d,"must return the same object reference");
});

t("tombstones an untracked, unpaid row",()=>{
  const d=doc([item("i1","Rent",5000,false)],[bill("b1","i1",{itemName:"Rent",allocated:5000})]);
  const out=reconcile(d);
  assert.ok(out.bills[0].deletedAt,"row should be tombstoned");
  assert.strictEqual(out.bills.length,1,"tombstone, never splice");
});

t("cleans up even when the LAST tracked item is untracked",()=>{
  // the old create-only version returned early on items.length===0
  const d=doc([item("i1","Rent",5000,false)],[bill("b1","i1")]);
  assert.ok(reconcile(d).bills[0].deletedAt);
});

t("cleans up when the household item is soft-deleted",()=>{
  const d={household:{expenses:[{id:"i1",name:"Rent",amount:5000,trackInBills:true,deletedAt:"2026-07-01"}]},bills:[bill("b1","i1")]};
  assert.ok(reconcile(d).bills[0].deletedAt);
});

t("keeps an untracked row that has money recorded against it",()=>{
  const d=doc([item("i1","Rent",5000,false)],[bill("b1","i1",{paid:2500,status:"partial"})]);
  assert.strictEqual(reconcile(d),d,"paid history must survive untouched");
});

t("resyncs name always, and amount only while unpaid",()=>{
  const out=reconcile(doc([item("i1","Rent (new)",7000,true)],[bill("b1","i1",{itemName:"Rent",allocated:5000})]));
  assert.strictEqual(out.bills[0].itemName,"Rent (new)");
  assert.strictEqual(out.bills[0].allocated,7000);
});

t("freezes allocated once the bill is paid, but still follows the name",()=>{
  const out=reconcile(doc([item("i1","Rent (new)",7000,true)],[bill("b1","i1",{itemName:"Rent",allocated:5000,paid:5000,status:"paid"})]));
  assert.strictEqual(out.bills[0].itemName,"Rent (new)");
  assert.strictEqual(out.bills[0].allocated,5000,"paid snapshot must not move");
});

t("revives a tombstoned row on re-track instead of duplicating",()=>{
  const out=reconcile(doc([item("i1","Rent",5000,true)],[bill("b1","i1",{deletedAt:"2026-07-02",allocated:5000,itemName:"Rent"})]));
  assert.strictEqual(out.bills.length,1,"must not create a second row");
  assert.strictEqual(out.bills[0].deletedAt,null);
});

t("never touches rows from other months",()=>{
  const past=Object.assign(bill("b0","i1"),{monthKey:"2026-06"});
  const out=reconcile(doc([item("i1","Rent",9000,false)],[past]));
  assert.strictEqual(out.bills.find(b=>b.id==="b0"),past,"prior bucket must be identical");
});

t("handles a mix: create + retire + resync in one pass",()=>{
  const d=doc(
    [item("i1","Rent",5000,true),item("i2","Wifi",1500,false),item("i3","Power",2000,true)],
    [bill("b1","i1",{itemName:"Rent",allocated:4000}),bill("b2","i2",{itemName:"Wifi",allocated:1500})]);
  const out=reconcile(d);
  const by=id=>out.bills.find(b=>b.itemId===id);
  assert.strictEqual(by("i1").allocated,5000,"resynced");
  assert.ok(by("i2").deletedAt,"retired");
  assert.strictEqual(by("i3").allocated,2000,"created");
  assert.strictEqual(out.bills.length,3);
});

console.log("\n"+(n-fails)+"/"+n+" passed");
process.exit(fails?1:0);
