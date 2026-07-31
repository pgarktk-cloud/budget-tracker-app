/* Unit-test per-setting merge resolution without a browser.

   Slices the real helpers out of index.html and runs them in a vm context,
   per CLAUDE.md — testing the shipped code, not a reimplementation.

   The bug this guards against (2026-07-31): plain settings used to ride
   wholesale on whichever document had the newer `dataUpdatedAt`. Turning on
   one owner's pay-period tracking on the laptop was silently reverted as soon
   as the other device logged a transaction, because that device was now
   "newer" as a whole and its stale payPeriods came along with it. The two
   edits never conflicted — they touched different fields.

   What's under test:
     • two devices editing DIFFERENT settings both survive a merge
     • the newer edit wins when they edit the SAME setting
     • per-owner paths resolve independently (me vs wife)
     • unstamped (pre-migration) data degrades to the old whole-document
       behaviour rather than losing anything
     • theme is device-local and never crosses a merge

   Three vm traps: assert.deepStrictEqual compares prototypes and fails across
   realms (use deepEqual); slice markers are plain indexOf on source text, so
   assert they were found; and top-level `const` bindings don't attach to the
   context — only function declarations do — so hand those over explicitly. */
const fs=require("fs"),vm=require("vm"),assert=require("assert"),path=require("path");
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8")
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

const ctx={};
vm.createContext(ctx);
// SETTING_PATHS is a top-level const, so it does NOT attach to the context on
// its own — hand it over explicitly along with the functions.
// Slice from mergeArrayById, not from SETTING_PATHS: tryAutoMergeAll calls the
// array mergers, and its try/catch would otherwise swallow the ReferenceError
// and return null — which reads as "merge declined" rather than "test is
// broken". Every failure would then look like a real bug.
const src=slice("function mergeArrayById(","/* Reports what's different between local and remote");
vm.runInContext(src+`
this.SETTING_PATHS=SETTING_PATHS;
this.getPath=getPath; this.setPath=setPath;
this.stampSettings=stampSettings; this.mergeSettingPaths=mergeSettingPaths;
this.tryAutoMergeAll=tryAutoMergeAll;`,ctx);
const{SETTING_PATHS,getPath,setPath,stampSettings,mergeSettingPaths,tryAutoMergeAll}=ctx;

const EMPTY={expenses:[],goals:[],investments:[],banks:[],assets:[],targets:[],
  mp2DividendRates:[],plans:[],bills:[],billAdjustments:[],monthlyPlans:[],
  portHistory:[],history:[],snapshots:[],household:{splitMine:50,expenses:[]}};

const doc=(over={})=>JSON.parse(JSON.stringify({
  ...EMPTY,
  dataUpdatedAt:"2026-07-31T10:00:00.000Z",
  fieldUpdatedAt:{},
  currency:"SAR",
  owners:{me:"Jastine",wife:"Charlene"},
  projection:{},
  settings:{includeMp2EstimateInNetWorth:true},
  homeDisplay:{},
  homeSettings:{cardVisibility:{}},
  billsSettings:{openingReserve:0},
  quickTransferLast:{},
  payPeriods:{me:{enabled:false,payday:28,actualStarts:{}},
              wife:{enabled:false,payday:1,actualStarts:{}}},
  activePlanId:{me:"p1",wife:"pw1"},
  investTarget:{me:{thresholdPct:20,groupNames:[]},wife:{thresholdPct:20,groupNames:[]}},
  ...over,
}));

console.log("per-setting merge resolution");

/* ── the reported bug ──────────────────────────────────────────────────── */

t("two devices editing DIFFERENT settings both survive",()=>{
  // laptop turned on wife's pay periods at 12:00
  const laptop=doc({dataUpdatedAt:"2026-07-31T12:00:00.000Z",
    fieldUpdatedAt:{"payPeriods.wife":"2026-07-31T12:00:00.000Z"}});
  laptop.payPeriods.wife.enabled=true;
  // phone logged a transaction at 13:00 — later, but unrelated to settings
  const phone=doc({dataUpdatedAt:"2026-07-31T13:00:00.000Z",fieldUpdatedAt:{}});

  // phone pulls: local=phone (newer doc, stale setting), remote=laptop
  const m=tryAutoMergeAll(phone,laptop);
  assert.strictEqual(m.payPeriods.wife.enabled,true,
    "the wife's toggle must survive an unrelated newer edit on the other device");
});

t("...and it survives in the other direction too",()=>{
  const laptop=doc({dataUpdatedAt:"2026-07-31T12:00:00.000Z",
    fieldUpdatedAt:{"payPeriods.wife":"2026-07-31T12:00:00.000Z"}});
  laptop.payPeriods.wife.enabled=true;
  const phone=doc({dataUpdatedAt:"2026-07-31T13:00:00.000Z",fieldUpdatedAt:{}});
  const m=tryAutoMergeAll(laptop,phone);   // laptop pulls
  assert.strictEqual(m.payPeriods.wife.enabled,true);
});

t("the newer edit wins when both devices edit the SAME setting",()=>{
  const a=doc({fieldUpdatedAt:{currency:"2026-07-31T12:00:00.000Z"},currency:"PHP"});
  const b=doc({fieldUpdatedAt:{currency:"2026-07-31T14:00:00.000Z"},currency:"USD"});
  assert.strictEqual(tryAutoMergeAll(a,b).currency,"USD");
  assert.strictEqual(tryAutoMergeAll(b,a).currency,"USD","order must not matter");
});

t("per-owner paths resolve independently",()=>{
  // each device edited a DIFFERENT owner's pay periods
  const a=doc({fieldUpdatedAt:{"payPeriods.me":"2026-07-31T12:00:00.000Z"}});
  a.payPeriods.me.enabled=true;
  const b=doc({fieldUpdatedAt:{"payPeriods.wife":"2026-07-31T13:00:00.000Z"}});
  b.payPeriods.wife.enabled=true;
  const m=tryAutoMergeAll(a,b);
  assert.strictEqual(m.payPeriods.me.enabled,true,"me's edit lost");
  assert.strictEqual(m.payPeriods.wife.enabled,true,"wife's edit lost");
});

t("an unrelated per-owner field isn't disturbed",()=>{
  const a=doc({fieldUpdatedAt:{"payPeriods.wife":"2026-07-31T12:00:00.000Z"}});
  a.payPeriods.wife.enabled=true; a.payPeriods.wife.payday=1;
  const b=doc({dataUpdatedAt:"2026-07-31T20:00:00.000Z"});
  const m=tryAutoMergeAll(b,a);
  assert.strictEqual(m.payPeriods.wife.enabled,true);
  assert.strictEqual(m.payPeriods.me.payday,28,"me's block must be untouched");
});

/* ── backward compatibility ────────────────────────────────────────────── */

t("unstamped data degrades to the old whole-document behaviour",()=>{
  // neither side has fieldUpdatedAt (pre-migration docs)
  const older=doc({dataUpdatedAt:"2026-07-31T10:00:00.000Z",currency:"PHP",fieldUpdatedAt:{}});
  const newer=doc({dataUpdatedAt:"2026-07-31T18:00:00.000Z",currency:"USD",fieldUpdatedAt:{}});
  assert.strictEqual(tryAutoMergeAll(older,newer).currency,"USD","newer doc should win");
  assert.strictEqual(tryAutoMergeAll(newer,older).currency,"USD");
});

t("a stamped edit beats an unstamped older document",()=>{
  const stamped=doc({dataUpdatedAt:"2026-07-31T10:00:00.000Z",
    fieldUpdatedAt:{currency:"2026-07-31T10:00:00.000Z"},currency:"PHP"});
  const unstamped=doc({dataUpdatedAt:"2026-07-31T09:00:00.000Z",fieldUpdatedAt:{},currency:"USD"});
  assert.strictEqual(tryAutoMergeAll(unstamped,stamped).currency,"PHP");
});

t("stamps are merged forward, newest per key",()=>{
  const a=doc({fieldUpdatedAt:{currency:"2026-07-31T12:00:00.000Z","payPeriods.me":"2026-07-31T11:00:00.000Z"}});
  const b=doc({fieldUpdatedAt:{currency:"2026-07-31T14:00:00.000Z","payPeriods.wife":"2026-07-31T13:00:00.000Z"}});
  const f=tryAutoMergeAll(a,b).fieldUpdatedAt;
  assert.strictEqual(f.currency,"2026-07-31T14:00:00.000Z","should keep the newer");
  assert.strictEqual(f["payPeriods.me"],"2026-07-31T11:00:00.000Z");
  assert.strictEqual(f["payPeriods.wife"],"2026-07-31T13:00:00.000Z");
});

t("theme never crosses a merge — it's device-local",()=>{
  const local=doc({theme:"dark",dataUpdatedAt:"2026-07-31T10:00:00.000Z"});
  const remote=doc({theme:"light",dataUpdatedAt:"2026-07-31T20:00:00.000Z"});
  assert.strictEqual(tryAutoMergeAll(local,remote).theme,"dark",
    "a merge must not repaint this device from the other one");
});

/* ── stamping ──────────────────────────────────────────────────────────── */

t("stampSettings stamps only what actually changed",()=>{
  const prev=doc();
  const next=JSON.parse(JSON.stringify(prev));
  next.payPeriods.wife.enabled=true;
  const out=stampSettings(prev,next,"2026-07-31T15:00:00.000Z");
  assert.strictEqual(out.fieldUpdatedAt["payPeriods.wife"],"2026-07-31T15:00:00.000Z");
  assert.ok(!out.fieldUpdatedAt["payPeriods.me"],"untouched owner must not be stamped");
  assert.ok(!out.fieldUpdatedAt.currency,"untouched setting must not be stamped");
});

t("an equal-but-new object does NOT bump a stamp",()=>{
  // a re-render handing back a fresh object must not make this device
  // spuriously "win" a field it never edited
  const prev=doc();
  const next=JSON.parse(JSON.stringify(prev));
  const out=stampSettings(prev,next,"2026-07-31T15:00:00.000Z");
  assert.strictEqual(out,next,"identical values must return the object unchanged");
  assert.deepEqual(out.fieldUpdatedAt,{});
});

t("stampSettings doesn't mutate the previous state",()=>{
  const prev=doc();
  const next=JSON.parse(JSON.stringify(prev));
  next.currency="PHP";
  stampSettings(prev,next,"2026-07-31T15:00:00.000Z");
  assert.deepEqual(prev.fieldUpdatedAt,{},"prev must be untouched");
});

/* ── path helpers ──────────────────────────────────────────────────────── */

t("getPath/setPath handle nesting without mutating",()=>{
  const o={a:{b:{c:1}},x:2};
  assert.strictEqual(getPath(o,"a.b.c"),1);
  assert.strictEqual(getPath(o,"a.nope.c"),undefined,"missing path must not throw");
  const out=setPath(o,"a.b.c",9);
  assert.strictEqual(out.a.b.c,9);
  assert.strictEqual(o.a.b.c,1,"original must be untouched");
  assert.strictEqual(out.x,2);
});

t("every SETTING_PATH is reachable on a default document",()=>{
  // catches a typo'd path silently never merging
  const d=doc();
  const missing=SETTING_PATHS.filter(p=>getPath(d,p)===undefined);
  assert.deepEqual(missing,[],"unreachable setting paths: "+missing.join(", "));
});

t("record collections still merge normally alongside settings",()=>{
  const a=doc(); a.expenses=[{id:"e1",name:"Coffee",amount:1,updatedAt:"2026-07-31T10:00:00.000Z"}];
  const b=doc(); b.expenses=[{id:"e2",name:"Gas",amount:2,updatedAt:"2026-07-31T11:00:00.000Z"}];
  const m=tryAutoMergeAll(a,b);
  assert.strictEqual(m.expenses.length,2,"settings merge must not disturb record union");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
