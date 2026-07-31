/* Unit-test transaction display order without a browser.

   Slices the real comparator and the real migrate() expense loop out of
   index.html and runs them in a vm context, per CLAUDE.md — testing the
   shipped code rather than a reimplementation of it.

   What's under test:
     • newer DAY first; within a day, newest-ENTERED first
     • a manual `ord` overrides entry order, ascending
     • an UNPLACED row (no `ord`) sorts above every placed row of its day —
       the single rule behind both "a transaction added after a reorder lands
       on top" and "a re-dated transaction arrives at the newest position"
     • the order is total and deterministic, so two devices agree even for
       legacy rows that all share the same backfilled createdAt
     • migrate backfills createdAt from updatedAt and never invents an `ord`

   Three vm traps: assert.deepStrictEqual compares prototypes and fails across
   realms (use deepEqual); slice markers are plain indexOf on source text, so
   assert they were found; and top-level `const` bindings don't attach to the
   context — only function declarations do — so hand anything else over
   explicitly. */
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

const ctx={};
vm.createContext(ctx);

/* ── the comparator ───────────────────────────────────────────────────── */
const cmpSrc=slice("function compareTxForDisplay(","/* \"Today\" / \"Yesterday\"");
vm.runInContext(cmpSrc+"\nthis.compareTxForDisplay=compareTxForDisplay;",ctx);
const{compareTxForDisplay}=ctx;

/* ── migrate()'s expense loop, wrapped so it can be called directly ────── */
const migSrc=slice("  (d.expenses||[]).forEach(e=>{","  // ensure monthlyPlans have owner");
vm.runInContext("this.migrateExpenses=function(d){"+migSrc+"\nreturn d;};",ctx);
const{migrateExpenses}=ctx;

const sorted=rows=>[...rows].sort(compareTxForDisplay).map(r=>r.id);
const tx=(id,date,createdAt,ord)=>{
  const o={id,date,createdAt};
  if(ord!==undefined)o.ord=ord;
  return o;
};

console.log("transaction display order");

/* ── day ordering wins over everything ────────────────────────────────── */

t("a newer day sorts first regardless of entry time",()=>{
  // the older day's row was entered LAST — the day still wins
  const a=tx("a","2026-07-31","2026-07-01T00:00:00Z");
  const b=tx("b","2026-07-30","2026-07-31T23:00:00Z");
  assert.deepEqual(sorted([b,a]),["a","b"]);
});

t("a manual ord never lifts a row out of its day",()=>{
  const a=tx("a","2026-07-31","2026-07-31T09:00:00Z",9);
  const b=tx("b","2026-07-30","2026-07-30T09:00:00Z",0);
  assert.deepEqual(sorted([b,a]),["a","b"]);
});

/* ── within a day: newest entered first ───────────────────────────────── */

t("within a day, the most recently entered sorts first",()=>{
  const rows=[
    tx("coffee","2026-07-31","2026-07-31T08:00:00Z"),
    tx("gas","2026-07-31","2026-07-31T18:00:00Z"),
    tx("groceries","2026-07-31","2026-07-31T12:00:00Z"),
  ];
  assert.deepEqual(sorted(rows),["gas","groceries","coffee"]);
});

t("createdAt is what's read, not updatedAt",()=>{
  // an edited old row must not jump to the top; only createdAt is consulted
  const old={id:"old",date:"2026-07-31",createdAt:"2026-07-31T08:00:00Z",updatedAt:"2026-07-31T23:59:00Z"};
  const fresh={id:"fresh",date:"2026-07-31",createdAt:"2026-07-31T20:00:00Z",updatedAt:"2026-07-31T20:00:00Z"};
  assert.deepEqual(sorted([old,fresh]),["fresh","old"]);
});

/* ── manual placement ─────────────────────────────────────────────────── */

t("placed rows order by ascending ord, ignoring entry time",()=>{
  const rows=[
    tx("a","2026-07-31","2026-07-31T08:00:00Z",2),
    tx("b","2026-07-31","2026-07-31T18:00:00Z",0),
    tx("c","2026-07-31","2026-07-31T12:00:00Z",1),
  ];
  assert.deepEqual(sorted(rows),["b","c","a"]);
});

t("ord:0 is a real position, not a missing one",()=>{
  // the falsy trap — 0 must not be treated as "unplaced"
  const zero=tx("zero","2026-07-31","2026-07-31T08:00:00Z",0);
  const two=tx("two","2026-07-31","2026-07-31T09:00:00Z",2);
  assert.deepEqual(sorted([two,zero]),["zero","two"]);
});

t("an UNPLACED row sorts above every placed row of its day",()=>{
  // this is the rule that makes "added after a reorder" land on top
  const rows=[
    tx("placed0","2026-07-31","2026-07-31T08:00:00Z",0),
    tx("placed1","2026-07-31","2026-07-31T09:00:00Z",1),
    tx("added","2026-07-31","2026-07-31T22:00:00Z"),
  ];
  assert.deepEqual(sorted(rows),["added","placed0","placed1"]);
});

t("a row re-dated into a reordered day lands at the newest position",()=>{
  // updateExpenseTx deletes ord on a date change, so it arrives unplaced —
  // even though it was entered BEFORE the rows already sitting in that day
  const rows=[
    tx("was-here-0","2026-07-30","2026-07-30T10:00:00Z",0),
    tx("was-here-1","2026-07-30","2026-07-30T11:00:00Z",1),
    tx("moved-in","2026-07-30","2026-07-01T09:00:00Z"),
  ];
  assert.deepEqual(sorted(rows),["moved-in","was-here-0","was-here-1"]);
});

t("two unplaced rows still fall back to entry order",()=>{
  const rows=[
    tx("placed","2026-07-31","2026-07-31T08:00:00Z",0),
    tx("early","2026-07-31","2026-07-31T20:00:00Z"),
    tx("late","2026-07-31","2026-07-31T21:00:00Z"),
  ];
  assert.deepEqual(sorted(rows),["late","early","placed"]);
});

/* ── total order, so every device agrees ──────────────────────────────── */

t("legacy rows tied on createdAt fall back to id, descending",()=>{
  // migrate gives every pre-feature row of a day the identical stamp
  const stamp="2026-07-31T00:00:00.000Z";
  const rows=[tx("aaa","2026-07-31",stamp),tx("ccc","2026-07-31",stamp),tx("bbb","2026-07-31",stamp)];
  assert.deepEqual(sorted(rows),["ccc","bbb","aaa"]);
});

t("the order is total — a shuffled input always yields the same result",()=>{
  const stamp="2026-07-31T00:00:00.000Z";
  const rows=[
    tx("a","2026-07-31",stamp),tx("b","2026-07-31",stamp),
    tx("c","2026-07-30",stamp,1),tx("d","2026-07-30",stamp,0),
    tx("e","2026-07-30",stamp),
  ];
  const want=sorted(rows);
  const shuffles=[[4,0,2,1,3],[2,3,4,0,1],[1,4,3,2,0],[3,2,1,0,4]];
  shuffles.forEach(order=>assert.deepEqual(sorted(order.map(i=>rows[i])),want));
  // and sorting an already-sorted list is a no-op
  assert.deepEqual(sorted([...rows].sort(compareTxForDisplay)),want);
});

t("missing date/createdAt/id don't throw",()=>{
  const rows=[{id:"a"},{id:"b",date:"2026-07-31"},{},{id:"c",createdAt:"x"}];
  assert.doesNotThrow(()=>[...rows].sort(compareTxForDisplay));
});

/* ── migrate backfill ─────────────────────────────────────────────────── */

t("createdAt is backfilled from updatedAt",()=>{
  const d=migrateExpenses({expenses:[
    {id:"a",date:"2026-07-31",owner:"me",note:"",updatedAt:"2026-07-31T09:00:00.000Z"},
  ]});
  assert.strictEqual(d.expenses[0].createdAt,"2026-07-31T09:00:00.000Z");
});

t("a legacy row with no updatedAt still ends up with a string createdAt",()=>{
  // the updatedAt backfill runs first and derives it from date
  const d=migrateExpenses({expenses:[{id:"a",date:"2026-07-31"}]});
  assert.strictEqual(d.expenses[0].updatedAt,"2026-07-31T00:00:00.000Z");
  assert.strictEqual(d.expenses[0].createdAt,"2026-07-31T00:00:00.000Z");
  // and a row with neither date nor updatedAt gets a real timestamp, not undefined
  const d2=migrateExpenses({expenses:[{id:"b"}]});
  assert.strictEqual(typeof d2.expenses[0].createdAt,"string");
  assert.ok(d2.expenses[0].createdAt.length>0);
});

t("an existing createdAt is never overwritten",()=>{
  const d=migrateExpenses({expenses:[
    {id:"a",date:"2026-07-31",createdAt:"2020-01-01T00:00:00.000Z",updatedAt:"2026-07-31T09:00:00.000Z"},
  ]});
  assert.strictEqual(d.expenses[0].createdAt,"2020-01-01T00:00:00.000Z");
});

t("migrate never invents an ord — absence is meaningful",()=>{
  const d=migrateExpenses({expenses:[{id:"a",date:"2026-07-31",updatedAt:"2026-07-31T09:00:00.000Z"}]});
  assert.ok(!("ord" in d.expenses[0]),"migrate must leave ord absent");
});

t("a non-numeric ord is deleted, but ord:0 survives",()=>{
  const d=migrateExpenses({expenses:[
    {id:"str",date:"2026-07-31",updatedAt:"2026-07-31T09:00:00.000Z",ord:"2"},
    {id:"nan",date:"2026-07-31",updatedAt:"2026-07-31T09:00:00.000Z",ord:NaN},
    {id:"inf",date:"2026-07-31",updatedAt:"2026-07-31T09:00:00.000Z",ord:Infinity},
    {id:"zero",date:"2026-07-31",updatedAt:"2026-07-31T09:00:00.000Z",ord:0},
  ]});
  const by=id=>d.expenses.find(e=>e.id===id);
  assert.ok(!("ord" in by("str")));
  assert.ok(!("ord" in by("nan")));
  assert.ok(!("ord" in by("inf")));
  assert.strictEqual(by("zero").ord,0);
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
