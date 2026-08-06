/* Unit-test the pinned transaction shortcuts (`txTemplates`, v1.26.0) without
   a browser.

   Slices the shipped liveTxTemplates / txTemplateKey / recentTxTemplates, plus
   the real migrate() / fingerprint() / tryAutoMergeAll, out of index.html and
   runs them in a vm context, per CLAUDE.md — testing what ships, not a copy.

   The contract:
     • a shortcut is user-made and synced; a Repeat chip is derived from history
     • the two rows must not show the same entry twice (excludeKeys)
     • a shortcut whose category left the plan is not offerable, exactly like a
       derived one — it would fill a catId the dropdown cannot show
     • adding the collection is a BYTE-IDENTICAL no-op for an existing document,
       so nobody pays a Cloudflare KV write for an upgrade they didn't ask for
     • it merges by id and a tombstone survives, like every other collection

   Gotchas (CLAUDE.md): assert.deepStrictEqual compares prototypes and fails
   across vm realms — use deepEqual. Slice markers are plain indexOf on source
   text, so assert they were found. Top-level `const` bindings do NOT attach to
   a vm context — only function declarations do — hence the explicit this.X=X. */
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
const clone=o=>JSON.parse(JSON.stringify(o));

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

let uidN=0;
const ctx={defaultData:()=>({}),uid:()=>"uid"+(++uidN)};
vm.createContext(ctx);
vm.runInContext(
  slice("function liveTxTemplates(","/* Explains the \"unaccounted\" figure")+"\n"+
  slice("const sortedById=arr=>",'/* "Did a *person* change anything?"')+"\n"+
  slice("function mergeArrayById(","/* Reports what's different between local and remote")+"\n"+
  slice("function migrate(d){","/* Bills Reserve = opening baseline")+`
this.sortedById=sortedById; this.fingerprint=fingerprint;`,ctx);

const{liveTxTemplates,txTemplateKey,recentTxTemplates,migrate,fingerprint,
  tryAutoMergeAll,mergeArrayById}=ctx;
assert.ok(typeof liveTxTemplates==="function","liveTxTemplates missing from the slice");
assert.ok(typeof txTemplateKey==="function","txTemplateKey missing from the slice");

const CATS=["food","transport"];
const T=(o)=>Object.assign({owner:"me",note:"",createdAt:"2026-08-01T00:00:00Z",
  updatedAt:"2026-08-01T00:00:00Z"},o);

console.log("\nliveTxTemplates\n");

t("returns this owner's live shortcuts, oldest pinned first",()=>{
  const list=[
    T({id:"b",catId:"food",name:"Second",amount:20,createdAt:"2026-08-02T00:00:00Z"}),
    T({id:"a",catId:"food",name:"First",amount:10,createdAt:"2026-08-01T00:00:00Z"}),
  ];
  // stable order matters: the row must not reshuffle under a thumb as more are pinned
  assert.deepEqual(liveTxTemplates(list,"me",{catIds:CATS}).map(x=>x.name),["First","Second"]);
});

t("scoped to the owner, absent owner reads as 'me'",()=>{
  const list=[T({id:"a",catId:"food",name:"Mine",amount:10}),
              T({id:"b",catId:"food",name:"Hers",amount:10,owner:"wife"})];
  assert.deepEqual(liveTxTemplates(list,"me",{catIds:CATS}).map(x=>x.name),["Mine"]);
  assert.deepEqual(liveTxTemplates(list,"wife",{catIds:CATS}).map(x=>x.name),["Hers"]);
  const noOwner=[{id:"c",catId:"food",name:"Unlabelled",amount:5}];
  assert.deepEqual(liveTxTemplates(noOwner,"me",{catIds:CATS}).map(x=>x.name),["Unlabelled"]);
});

t("tombstoned shortcuts are not offered",()=>{
  const list=[T({id:"a",catId:"food",name:"Gone",amount:10,deletedAt:"2026-08-03T00:00:00Z"})];
  assert.deepEqual(liveTxTemplates(list,"me",{catIds:CATS}),[]);
});

t("a category the plan no longer has is filtered out",()=>{
  // same rule as recentTxTemplates: it would fill a catId the select can't show
  const list=[T({id:"a",catId:"deleted-cat",name:"Orphan",amount:10})];
  assert.deepEqual(liveTxTemplates(list,"me",{catIds:CATS}),[]);
  assert.deepEqual(liveTxTemplates(list,"me").map(x=>x.name),["Orphan"]); // no filter given
});

t("unusable shortcuts (no name / no category / no positive amount) are skipped",()=>{
  const list=[
    T({id:"a",catId:"food",name:"",amount:10}),
    T({id:"b",catId:"",name:"No cat",amount:10}),
    T({id:"c",catId:"food",name:"Zero",amount:0}),
    T({id:"d",catId:"food",name:"Fine",amount:1}),
  ];
  assert.deepEqual(liveTxTemplates(list,"me",{catIds:CATS}).map(x=>x.name),["Fine"]);
});

t("tolerates a missing list",()=>{
  assert.deepEqual(liveTxTemplates(undefined,"me"),[]);
  assert.deepEqual(liveTxTemplates([null],"me"),[]);
});

console.log("\nShortcuts vs Repeat — no double display\n");

t("THE DEDUPE: a pinned entry is removed from the derived Repeat list",()=>{
  const expenses=[
    {id:"e1",owner:"me",catId:"food",name:"Jollibee",amount:250,date:"2026-08-04"},
    {id:"e2",owner:"me",catId:"transport",name:"Grab",amount:120,date:"2026-08-03"},
  ];
  const pinned=[T({id:"s1",catId:"food",name:"Jollibee",amount:250})];
  const keys=new Set(liveTxTemplates(pinned,"me",{catIds:CATS}).map(txTemplateKey));
  const repeat=recentTxTemplates(expenses,"me",{catIds:CATS,excludeKeys:keys});
  assert.deepEqual(repeat.map(x=>x.name),["Grab"],"Jollibee shown in both rows");
});

t("the dedupe is per (name,category), not per name",()=>{
  const expenses=[
    {id:"e1",owner:"me",catId:"food",name:"Top-up",amount:100,date:"2026-08-04"},
    {id:"e2",owner:"me",catId:"transport",name:"Top-up",amount:50,date:"2026-08-03"},
  ];
  const keys=new Set([txTemplateKey({name:"Top-up",catId:"food"})]);
  const repeat=recentTxTemplates(expenses,"me",{catIds:CATS,excludeKeys:keys});
  assert.equal(repeat.length,1);
  assert.equal(repeat[0].catId,"transport");
});

t("excludeKeys accepts an array as well as a Set, and is optional",()=>{
  const expenses=[{id:"e1",owner:"me",catId:"food",name:"Jollibee",amount:250,date:"2026-08-04"}];
  assert.equal(recentTxTemplates(expenses,"me",{catIds:CATS,excludeKeys:["Jollibee|food"]}).length,0);
  assert.equal(recentTxTemplates(expenses,"me",{catIds:CATS}).length,1);
});

console.log("\nmigrate / fingerprint\n");

function baseDoc(){
  return{owners:{me:"Me",wife:"My wife"},currency:"SAR",
    plans:[{id:"p1",name:"Base",categories:[],groups:[]}],
    expenses:[],goals:[],investments:[],banks:[],assets:[],targets:[],
    mp2DividendRates:[],monthlyPlans:[],bills:[],billAdjustments:[],
    portHistory:[],history:[],snapshots:[],household:{splitMine:50,expenses:[]},
    installments:[],installmentPayments:[]};
}

t("THE UPGRADE COST: adding the collection is byte-identical for an existing doc",()=>{
  const legacy=migrate(clone(baseDoc()));
  delete legacy.txTemplates;
  const before=fingerprint(clone(legacy));
  const after=fingerprint(migrate(clone(legacy)));
  assert.equal(before,after,"an existing document must not look dirty after the upgrade");
});

t("the array IS created — it is only omitted from the fingerprint while empty",()=>{
  const legacy=migrate(clone(baseDoc()));
  delete legacy.txTemplates;
  assert.deepEqual(migrate(clone(legacy)).txTemplates,[]);
});

t("a non-empty collection DOES change the fingerprint",()=>{
  const doc=migrate(clone(baseDoc()));
  const withOne=migrate({...clone(doc),
    txTemplates:[T({id:"s1",catId:"food",name:"Jollibee",amount:250})]});
  assert.notEqual(fingerprint(doc),fingerprint(withOne));
});

t("migrate fills only safe defaults and is idempotent",()=>{
  const raw={...baseDoc(),txTemplates:[{id:"s1",catId:"food",name:"Jollibee",amount:250}]};
  const once=migrate(clone(raw));
  assert.equal(once.txTemplates[0].owner,"me");
  assert.equal(once.txTemplates[0].note,"");
  assert.ok(once.txTemplates[0].createdAt);
  assert.ok(once.txTemplates[0].updatedAt);
  // `ord` must NOT be invented — absent means unplaced, as it does for expenses
  assert.equal("ord"in once.txTemplates[0],false);
  assert.equal(fingerprint(once),fingerprint(migrate(clone(once))));
});

t("a garbage txTemplates value is replaced rather than trusted",()=>{
  assert.deepEqual(migrate({...baseDoc(),txTemplates:"nope"}).txTemplates,[]);
  assert.deepEqual(migrate({...baseDoc(),txTemplates:null}).txTemplates,[]);
});

console.log("\nmerge\n");

t("two devices pinning different shortcuts both survive",()=>{
  const base=migrate(clone(baseDoc()));
  const local={...clone(base),dataUpdatedAt:"2026-08-06T10:00:00Z",
    txTemplates:[T({id:"s1",catId:"food",name:"Mine",amount:10})]};
  const remote={...clone(base),dataUpdatedAt:"2026-08-06T09:00:00Z",
    txTemplates:[T({id:"s2",catId:"food",name:"Theirs",amount:20})]};
  const merged=tryAutoMergeAll(local,remote);
  assert.ok(merged,"merge returned null");
  assert.deepEqual(merged.txTemplates.map(x=>x.name).sort(),["Mine","Theirs"]);
});

t("an unpinned shortcut is not resurrected by the other device's stale copy",()=>{
  const base=migrate(clone(baseDoc()));
  const local={...clone(base),dataUpdatedAt:"2026-08-06T10:00:00Z",
    txTemplates:[T({id:"s1",catId:"food",name:"Gone",amount:10,
      deletedAt:"2026-08-06T10:00:00Z",updatedAt:"2026-08-06T10:00:00Z"})]};
  const remote={...clone(base),dataUpdatedAt:"2026-08-06T09:00:00Z",
    txTemplates:[T({id:"s1",catId:"food",name:"Gone",amount:10})]};
  const merged=tryAutoMergeAll(local,remote);
  assert.ok(merged.txTemplates.find(x=>x.id==="s1").deletedAt,"tombstone lost — the delete came back");
});

t("the newer edit of the same shortcut wins",()=>{
  const base=migrate(clone(baseDoc()));
  const local={...clone(base),dataUpdatedAt:"2026-08-06T10:00:00Z",
    txTemplates:[T({id:"s1",catId:"food",name:"Jollibee",amount:250,updatedAt:"2026-08-06T08:00:00Z"})]};
  const remote={...clone(base),dataUpdatedAt:"2026-08-06T09:00:00Z",
    txTemplates:[T({id:"s1",catId:"food",name:"Jollibee",amount:300,updatedAt:"2026-08-06T09:30:00Z"})]};
  assert.equal(tryAutoMergeAll(local,remote).txTemplates[0].amount,300);
});

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
