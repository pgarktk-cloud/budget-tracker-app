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

const effect=slice("      const items=((d.household||{}).expenses||[]).filter(e=>!e.deletedAt&&e.trackInBills);",
                   "  },[loaded,currentBillMonthKey,trackedHhKey]);");
const body=effect.replace(/\s*\}\);\s*$/,"");
/* billRowId + dedupeBillRows are sliced in rather than stubbed: "which rows are
   duplicates of each other" is now half of what the reconciler does, and a stub
   would test the stub. */
const helpers=slice("function billRowId(monthKey,itemId){","/* Bills Reserve = opening baseline");
let seq=0;
const reconcile=(d,monthKey="2026-07")=>{
  const ctx={currentBillMonthKey:monthKey,uid:()=>"b"+(++seq)};
  vm.createContext(ctx);
  vm.runInContext(helpers+"\nvar __run=function(d){"+body+"\n};",ctx);
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

/* ── Duplicate bill rows (the reserve-is-double bug, v1.35.0) ─────────────
   Rows are GENERATED, once per (month, tracked item), by whichever device is
   open. They used to get `id: uid()`, and tryAutoMergeAll merges bills with
   mergeArrayById — a union by id. Two phones each generating a row for the
   same month and item minted different ids, nothing collided, the union kept
   both, and computeBillsReserve counted every tracked bill twice. */
console.log("\nduplicate rows");

const hctx={};
vm.createContext(hctx);
vm.runInContext(slice("function billRowId(monthKey,itemId){","function computeBillsReserve(d){")
  +slice("function computeBillsReserve(d){","const billMonthKeyOf="),hctx);
const{billRowId,dedupeBillRows,computeBillsReserve}=hctx;
const NOW="2026-07-15T00:00:00.000Z";

t("a generated row's id is derived from what makes it unique",()=>{
  /* The fix at its root: two devices generating the same row must produce the
     same id, so the merge collapses them instead of stacking them. */
  assert.strictEqual(billRowId("2026-07","i1"),billRowId("2026-07","i1"));
  assert.notStrictEqual(billRowId("2026-07","i1"),billRowId("2026-08","i1"));
  assert.notStrictEqual(billRowId("2026-07","i1"),billRowId("2026-07","i2"));
  assert.ok(/^bill:/.test(billRowId("2026-07","i1")),
    "prefixed so it can never collide with a uid()");
  const out=reconcile(doc([item("i1","Rent",5000,true)],[]));
  assert.strictEqual(out.bills[0].id,billRowId("2026-07","i1"),
    "the reconciler must stop minting uid()s");
});

t("the reserve is exactly doubled by duplicates, and the dedupe repairs it",()=>{
  const dup=[bill("randomA","i1",{allocated:5000,paid:0}),
             bill("randomB","i1",{allocated:5000,paid:0})];
  assert.strictEqual(computeBillsReserve({bills:dup}),10000,"the bug, reproduced");
  const{rows,removed}=dedupeBillRows(dup,NOW);
  assert.strictEqual(removed,1);
  assert.strictEqual(computeBillsReserve({bills:rows}),5000,"one bill, counted once");
});

t("the survivor is deterministic, so two devices never disagree",()=>{
  /* If each device kept a different copy, each would tombstone the other's and
     the bill would vanish from the reserve entirely. */
  const a=[bill("zzz","i1"),bill("aaa","i1")];
  const b=[bill("aaa","i1"),bill("zzz","i1")];   // same rows, other order
  const keptA=dedupeBillRows(a,NOW).rows.filter(r=>!r.deletedAt).map(r=>r.id);
  const keptB=dedupeBillRows(b,NOW).rows.filter(r=>!r.deletedAt).map(r=>r.id);
  assert.deepStrictEqual(keptA,keptB);
  assert.deepStrictEqual(keptA,["aaa"],"ties break on id, which depends on nothing else");
});

t("the canonical row wins, so the survivor converges instead of churning",()=>{
  /* Without this rung a stray row from a phone still on an older build could
     displace the incumbent purely on alphabetical order — tombstoning a good
     row and reviving a different one on every sync. Measured in the browser
     before the fix: "oldPhone-x" beat "phoneA-0" and took over the Rent row. */
  const canon=billRowId("2026-07","i1");
  const rows=[bill(canon,"i1"),bill("aaaa-from-old-phone","i1")];
  const live=dedupeBillRows(rows,NOW).rows.filter(r=>!r.deletedAt);
  assert.strictEqual(live.length,1);
  assert.strictEqual(live[0].id,canon,"the derived id beats a lower random one");
  // and it is stable: running again keeps the same survivor
  const again=dedupeBillRows(dedupeBillRows(rows,NOW).rows,NOW);
  assert.strictEqual(again.removed,0);
});

t("an older original still beats a newer copy when neither is canonical",()=>{
  const rows=[bill("zzz","i1",{createdAt:"2026-07-01T00:00:00.000Z"}),
              bill("aaa","i1",{createdAt:"2026-07-09T00:00:00.000Z"})];
  const live=dedupeBillRows(rows,NOW).rows.filter(r=>!r.deletedAt);
  assert.strictEqual(live[0].id,"zzz","oldest createdAt outranks the lower id");
});

t("payment history is never what gets discarded",()=>{
  const rows=[bill("aaa","i1",{paid:0}),bill("zzz","i1",{paid:5000,status:"paid"})];
  const live=dedupeBillRows(rows,NOW).rows.filter(r=>!r.deletedAt);
  assert.strictEqual(live.length,1);
  assert.strictEqual(live[0].id,"zzz","the paid copy wins over the lower id");
});

t("losers are tombstoned, never spliced, and are marked as deduped",()=>{
  /* A hard delete cannot survive a merge — the other device's copy would
     resurrect it — and a soft delete means a row collapsed in error is still
     in the document rather than gone. */
  const{rows}=dedupeBillRows([bill("aaa","i1"),bill("zzz","i1")],NOW);
  assert.strictEqual(rows.length,2,"nothing is removed from the array");
  const dead=rows.find(r=>r.deletedAt);
  assert.strictEqual(dead.id,"zzz");
  assert.strictEqual(dead.dedupedAt,NOW,"marked, so the reconciler won't revive it");
});

t("it is idempotent and identity-preserving when there is nothing to collapse",()=>{
  /* It runs inside migrate() and inside the reconciler effect, so returning a
     fresh array every pass would dirty the document on every app open. */
  const clean=[bill("aaa","i1"),bill("bbb","i2")];
  const first=dedupeBillRows(clean,NOW);
  assert.strictEqual(first.removed,0);
  assert.strictEqual(first.rows,clean,"same reference — no churn");
  const{rows}=dedupeBillRows([bill("aaa","i1"),bill("zzz","i1")],NOW);
  assert.strictEqual(dedupeBillRows(rows,NOW).removed,0,"already collapsed stays collapsed");
});

t("rows in different months are not duplicates of each other",()=>{
  const rows=[bill("aaa","i1"),Object.assign(bill("bbb","i1"),{monthKey:"2026-08"})];
  assert.strictEqual(dedupeBillRows(rows,NOW).removed,0);
});

t("a tombstoned duplicate is NOT revived on the next pass",()=>{
  /* The bug that would have made the repair useless: the reconciler revived
     every tombstoned row for a tracked item, so a collapsed duplicate came
     back on the next app open and the reserve doubled again. */
  const{rows}=dedupeBillRows([bill("aaa","i1",{itemName:"Rent",allocated:5000}),
                              bill("zzz","i1",{itemName:"Rent",allocated:5000})],NOW);
  const out=reconcile(doc([item("i1","Rent",5000,true)],rows));
  const live=(out.bills||[]).filter(b=>!b.deletedAt);
  assert.strictEqual(live.length,1,"still exactly one live row");
  assert.strictEqual(computeBillsReserve({bills:out.bills}),5000);
});

t("the reconciler collapses duplicates that arrive from an older device",()=>{
  /* migrate() repairs what is stored, but a phone still on an older build
     keeps minting random ids, so its rows arrive on the next merge. */
  const d=doc([item("i1","Rent",5000,true)],
    [bill("bill:2026-07:i1","i1",{itemName:"Rent",allocated:5000}),
     bill("fromOldPhone","i1",{itemName:"Rent",allocated:5000})]);
  const out=reconcile(d);
  const live=(out.bills||[]).filter(b=>!b.deletedAt);
  assert.strictEqual(live.length,1);
  assert.strictEqual(computeBillsReserve({bills:out.bills}),5000);
});

t("a genuinely re-tracked item still revives rather than duplicating",()=>{
  /* The dedupe must not break the existing revive path — an item untracked and
     then re-tracked has ONE tombstoned row, which is not a duplicate. */
  const d=doc([item("i1","Rent",5000,true)],
    [bill("bill:2026-07:i1","i1",{itemName:"Rent",allocated:5000,deletedAt:"2026-07-02T00:00:00.000Z"})]);
  const out=reconcile(d);
  assert.strictEqual(out.bills.length,1,"revived, not recreated alongside");
  assert.strictEqual(out.bills[0].deletedAt,null);
});

console.log("\n"+(n-fails)+"/"+n+" passed");
process.exit(fails?1:0);
