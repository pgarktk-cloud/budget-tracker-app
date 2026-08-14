/* Unit-test the per-key merge of corrected period starts (v1.44.0, phase 3b).

   Slices the real helpers out of index.html and runs them in a vm, per
   CLAUDE.md — testing the shipped merge, not a reimplementation. Harness
   copied from synctest.cjs, which covers the layer immediately underneath.

   THE BUG THIS FIXES. `payPeriods.me` and `payPeriods.wife` are single entries
   in SETTING_PATHS, so mergeSettingPaths took one side's whole config —
   payday, enabled AND the corrections map — wholesale. Two people correcting
   two different periods on two phones therefore lost one side entirely, with
   no conflict shown: the losing correction simply wasn't there any more, and
   the period silently went back to its nominal boundary. `actualStarts` was
   the last synced map with no merge rule of its own.

   THE PART THAT NEEDED TWO RELEASES. A cleared correction has to leave a
   tombstone ({v:null,updatedAt}), because a union merge cannot see a deletion
   — the other phone still holds the old value and would hand it back. But
   until v1.43.0, migrate() deleted every non-date value, so an un-upgraded
   phone would strip the new shape and push the stripped document back. Hence
   3a (read both shapes) shipped first, and 3b was gated on both phones
   reporting it. Case 6 is what that gate buys.

   Three vm traps: assert.deepStrictEqual compares prototypes and fails across
   realms (use deepEqual); slice markers are plain indexOf on source text, so
   assert they were found; and top-level `const` bindings don't attach to the
   context — only function declarations do. */
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
const clone=x=>JSON.parse(JSON.stringify(x));

const ctx={};
vm.createContext(ctx);
// Same slice window synctest uses, and for the same reason: starting at
// mergeArrayById means tryAutoMergeAll's own try/catch can't swallow a
// ReferenceError and return null, which would read as "merge declined"
// rather than "the test is broken".
vm.runInContext(slice("function mergeArrayById(","/* Reports what's different between local and remote")+`
this.SETTING_PATHS=SETTING_PATHS;
this.mergeActualStarts=mergeActualStarts;
this.withMergedActualStarts=withMergedActualStarts;
this.mergeSettingPaths=mergeSettingPaths;
this.tryAutoMergeAll=tryAutoMergeAll;`,ctx);
const{SETTING_PATHS,mergeActualStarts,withMergedActualStarts,tryAutoMergeAll}=ctx;

/* The period readers live far earlier in the file, so they get their own
   context — the point of several cases below is that a merged map still
   BUCKETS the way it should, which a shape assertion alone can't show. */
const pctx={};
vm.createContext(pctx);
vm.runInContext(slice("/* Last valid calendar day of a given year/month (month is 1-12) */",
                      "/* ── Unified period helpers")+`
this.dateToKey=dateToKey;`,pctx);
const{periodActualStart,periodKeyFor,actualStartValue,hasLiveActualStart}=pctx;

const EMPTY={expenses:[],goals:[],investments:[],banks:[],assets:[],targets:[],
  mp2DividendRates:[],plans:[],bills:[],billAdjustments:[],monthlyPlans:[],
  portHistory:[],history:[],snapshots:[],household:{splitMine:50,expenses:[]}};
const doc=(over={})=>clone({
  ...EMPTY,
  dataUpdatedAt:"2026-08-14T10:00:00.000Z",
  fieldUpdatedAt:{}, currency:"SAR",
  owners:{me:"Jastine",wife:"Charlene"},
  projection:{}, settings:{}, homeDisplay:{}, homeSettings:{}, billsSettings:{},
  quickTransferLast:{},
  payPeriods:{me:{enabled:true,payday:28,actualStarts:{}},
              wife:{enabled:false,payday:1,actualStarts:{}}},
  activePlanId:{me:"p1",wife:"pw1"},
  investTarget:{me:{},wife:{}},
  ...over,
});
/* A document whose `me` corrections are `starts`, stamped as an edit at
   `when` so mergeSettingPaths has something to resolve on. */
const withMe=(starts,when)=>{
  const d=doc({dataUpdatedAt:when});
  d.payPeriods.me.actualStarts=clone(starts);
  if(when)d.fieldUpdatedAt={"payPeriods.me":when};
  return d;
};
const T1="2026-08-10T10:00:00.000Z";
const T2="2026-08-11T10:00:00.000Z";
const T3="2026-08-12T10:00:00.000Z";
const ent=(v,at)=>({v,updatedAt:at});
const meStarts=d=>d.payPeriods.me.actualStarts;

console.log("actualStarts — per-key merge (v1.44.0)");

/* ── 1. the reported bug ────────────────────────────────────────────────── */

t("1 · different periods corrected on different devices — BOTH survive",()=>{
  // Phone A corrected August; phone B corrected September. Neither touched
  // the other's period. Before v1.44.0 exactly one of these was kept.
  const a=withMe({"2026-08-28":ent("2026-08-24",T1)},T1);
  const b=withMe({"2026-09-28":ent("2026-09-30",T2)},T2);
  const m=tryAutoMergeAll(a,b);
  assert.ok(m,"the merge must not decline");
  assert.deepEqual(Object.keys(meStarts(m)).sort(),["2026-08-28","2026-09-28"]);
  assert.strictEqual(periodActualStart("2026-08-28",m.payPeriods.me),"2026-08-24");
  assert.strictEqual(periodActualStart("2026-09-28",m.payPeriods.me),"2026-09-30");
});

/* ── 2. same key on both sides ──────────────────────────────────────────── */

t("2 · the same period corrected on both — the newer stamp wins",()=>{
  const a=withMe({"2026-08-28":ent("2026-08-24",T1)},T1);
  const b=withMe({"2026-08-28":ent("2026-08-26",T2)},T2);
  assert.strictEqual(periodActualStart("2026-08-28",tryAutoMergeAll(a,b).payPeriods.me),"2026-08-26");
  assert.strictEqual(periodActualStart("2026-08-28",tryAutoMergeAll(b,a).payPeriods.me),"2026-08-26",
    "and it must not depend on which side is 'local'");
});

/* ── 3. a clear must stay cleared ───────────────────────────────────────── */

t("3 · cleared on A while B still holds the old value — it STAYS cleared",()=>{
  // The whole reason a clear writes a tombstone. With a `delete`, B's copy is
  // simply the only one with an opinion and the correction comes back.
  const a=withMe({"2026-08-28":ent(null,T2)},T2);      // cleared, later
  const b=withMe({"2026-08-28":ent("2026-08-24",T1)},T1); // still holds it
  const m=tryAutoMergeAll(a,b);
  assert.deepEqual(meStarts(m)["2026-08-28"],ent(null,T2));
  assert.strictEqual(periodActualStart("2026-08-28",m.payPeriods.me),"2026-08-28",
    "a tombstone must read as 'no override'");
  assert.strictEqual(hasLiveActualStart(meStarts(m)),false,
    "and a map of nothing but tombstones must keep the fast path");
});

t("3b · ...but a genuinely newer re-correction beats an older clear",()=>{
  // The rule is newest-wins, not clear-always-wins. Clearing then deciding
  // again on the other phone has to work.
  const a=withMe({"2026-08-28":ent(null,T1)},T1);         // cleared earlier
  const b=withMe({"2026-08-28":ent("2026-08-24",T2)},T2); // re-corrected later
  assert.strictEqual(periodActualStart("2026-08-28",tryAutoMergeAll(a,b).payPeriods.me),"2026-08-24");
  assert.strictEqual(periodActualStart("2026-08-28",tryAutoMergeAll(b,a).payPeriods.me),"2026-08-24");
});

/* ── 4. direction independence ──────────────────────────────────────────── */

t("4 · merge(a,b) is deep-equal to merge(b,a), key order included",()=>{
  /* Two devices must reach the SAME document, not merely compatible ones —
     otherwise each keeps pushing its own version and they sync forever. Key
     order counts because payPeriods is fingerprinted un-canonicalised through
     ...rest, so a different order is a different document. */
  const pairs=[
    [{"2026-08-28":ent("2026-08-24",T1)},{"2026-09-28":ent("2026-09-30",T2)}],
    [{"2026-08-28":ent("2026-08-24",T1)},{"2026-08-28":ent("2026-08-26",T2)}],
    [{"2026-08-28":ent(null,T2)},{"2026-08-28":ent("2026-08-24",T1)}],
    [{"2026-09-28":ent("2026-09-30",T2),"2026-08-28":ent("2026-08-24",T1)},
     {"2026-07-28":ent("2026-07-26",T3)}],
    [{"2026-08-28":"2026-08-24"},{"2026-08-28":ent("2026-08-26",T1)}],
    [{},{"2026-08-28":ent("2026-08-24",T1)}],
    // equal stamps, different values: the tie-break must still converge
    [{"2026-08-28":ent("2026-08-24",T1)},{"2026-08-28":ent("2026-08-26",T1)}],
  ];
  pairs.forEach(([l,r],i)=>{
    const ab=mergeActualStarts(l,r),ba=mergeActualStarts(r,l);
    assert.deepEqual(ab,ba,"case "+i+" differs by value");
    assert.deepEqual(Object.keys(ab),Object.keys(ba),"case "+i+" differs by key ORDER");
    assert.deepEqual(Object.keys(ab),[...Object.keys(ab)].sort(),"case "+i+" is not sorted");
  });
});

/* ── 5. legacy unstamped entries ────────────────────────────────────────── */

t("5 · an unstamped legacy entry loses to any edit, and wins against nothing",()=>{
  // updatedAt:"" sorts oldest. A stamp is evidence of an edit; its absence is
  // evidence of nothing — the same rule mergeSettingPaths applies to a path.
  const legacy={"2026-08-28":ent("2026-08-24","")};
  const edited={"2026-08-28":ent("2026-08-26",T1)};
  assert.deepEqual(mergeActualStarts(legacy,edited)["2026-08-28"],ent("2026-08-26",T1));
  assert.deepEqual(mergeActualStarts(edited,legacy)["2026-08-28"],ent("2026-08-26",T1));
  // ...and against a side that simply has no entry for that key, it survives
  assert.deepEqual(mergeActualStarts(legacy,{})["2026-08-28"],ent("2026-08-24",""));
  assert.deepEqual(mergeActualStarts({},legacy)["2026-08-28"],ent("2026-08-24",""));
});

/* ── 6. mixed builds — what phase 3a bought ─────────────────────────────── */

t("6 · a v1.43.0 document (bare strings) merges with a v1.44.0 one",()=>{
  /* This is the case the two-release split exists for. The 1.43.0 phone has
     not upgraded its entries yet, so its values are bare strings with no
     stamp — they must lose to a real edit but must not be DROPPED, and the
     result has to be readable by both builds. */
  const old=withMe({"2026-08-28":"2026-08-24","2026-07-28":"2026-07-26"},T1);
  const neu=withMe({"2026-08-28":ent("2026-08-26",T2),"2026-09-28":ent("2026-09-30",T2)},T2);
  const m=tryAutoMergeAll(old,neu);
  const as=meStarts(m);
  assert.deepEqual(Object.keys(as).sort(),["2026-07-28","2026-08-28","2026-09-28"],
    "the old phone's untouched correction must not be dropped");
  assert.strictEqual(periodActualStart("2026-08-28",m.payPeriods.me),"2026-08-26","the real edit wins");
  assert.strictEqual(periodActualStart("2026-07-28",m.payPeriods.me),"2026-07-26","the legacy one survives");
  assert.strictEqual(periodActualStart("2026-09-28",m.payPeriods.me),"2026-09-30");
  // every surviving value must read on BOTH builds — i.e. through the one
  // reader 1.43.0 also has
  Object.keys(as).forEach(k=>assert.ok(actualStartValue(as[k])!==null||as[k].v===null,
    "unreadable entry survived: "+JSON.stringify(as[k])));
});

/* ── 7. the layer underneath must be untouched ──────────────────────────── */

t("7 · enabled/payday still resolve through mergeSettingPaths, unchanged",()=>{
  assert.ok(SETTING_PATHS.includes("payPeriods.me"),
    "payPeriods.me must remain a setting path — actualStarts merges ON TOP of it");
  const a=withMe({"2026-08-28":ent("2026-08-24",T1)},T1);
  a.payPeriods.me.payday=28;
  const b=withMe({"2026-09-28":ent("2026-09-30",T2)},T2);
  b.payPeriods.me.payday=15;                 // later edit to the same setting
  const m=tryAutoMergeAll(a,b);
  assert.strictEqual(m.payPeriods.me.payday,15,"the newer payday must still win");
  assert.strictEqual(m.payPeriods.me.enabled,true);
  assert.deepEqual(Object.keys(meStarts(m)).sort(),["2026-08-28","2026-09-28"],
    "...while both corrections still survive on top of it");
  assert.deepEqual(m.payPeriods.wife.actualStarts,{},"the other owner is untouched");
});

/* ── 8. nothing to do must cost nothing ─────────────────────────────────── */

t("8 · empty on both sides changes nothing and moves no fingerprint",()=>{
  assert.strictEqual(mergeActualStarts(undefined,undefined),undefined);
  assert.strictEqual(mergeActualStarts({},{}),undefined);
  const a=doc(),b=doc();
  const merged={payPeriods:clone(a.payPeriods)};
  assert.strictEqual(withMergedActualStarts(a,b,merged),merged,
    "a document that never corrected a period must come back IDENTICAL");
  const m=tryAutoMergeAll(a,b);
  assert.deepEqual(m.payPeriods.me.actualStarts,{});
});

t("8b · an unchanged map is returned by identity, not rebuilt",()=>{
  // Rebuilding an equal object would mark the document dirty on every sync
  // and buy a KV write per app open — the exact trap the auto:true split and
  // livePlanView were both written to avoid.
  const same={"2026-08-28":ent("2026-08-24",T1)};
  const a=withMe(same,T1),b=withMe(same,T1);
  const merged={payPeriods:clone(a.payPeriods)};
  assert.strictEqual(withMergedActualStarts(a,b,merged),merged);
});

/* ── bucketing must not move ────────────────────────────────────────────── */

t("9 · a merged map buckets exactly as the winning correction says",()=>{
  // The figures on screen come from bucketing, not from the map's shape.
  const a=withMe({"2026-08-28":ent("2026-08-24",T1)},T1);
  const b=withMe({"2026-09-28":ent("2026-09-30",T2)},T2);
  const cfg=tryAutoMergeAll(a,b).payPeriods.me;
  assert.strictEqual(periodKeyFor("2026-08-25",cfg),"2026-08-28","moved into August");
  assert.strictEqual(periodKeyFor("2026-08-23",cfg),"2026-07-28","...and July keeps the day before");
  assert.strictEqual(periodKeyFor("2026-09-29",cfg),"2026-08-28","September starts late, so this is still August");
  assert.strictEqual(periodKeyFor("2026-09-30",cfg),"2026-09-28");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
