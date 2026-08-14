/* Unit-test the customisable bottom navigation (Phase 7, v1.48.0).

   Slices the real helpers out of index.html and runs them in a vm context,
   per CLAUDE.md — testing the shipped code, not a reimplementation.

   data.navTabs is a stamped per-owner map, `{me:{v:[ids],updatedAt}}`, the same
   {v,updatedAt} shape as trimPolicy, so it inherits mergeTrimPolicy and the
   undefined-when-empty fingerprint rule. What's under test:
     • navTabsFor falls back to PRIMARY_TABS when uncustomised
     • it validates against the live catalogue: drops unknown/hidden ids and
       duplicates, and caps at NAV_BAR_SIZE
     • moreTabsFor is the exact complement
     • mergeTrimPolicy resolves navTabs entries per key, newest-wins, and keeps
       two owners edited on two devices
     • the wiring that lives outside a pure function is pinned by source
       assertion: navTabs is merged in tryAutoMergeAll, normalised in
       fingerprint, checked in validateBackup, NOT defaulted in migrate() or
       defaultData(), and the bar renders the passed-in list

   vm traps (see synctest.cjs): use deepEqual not deepStrictEqual across realms;
   assert slice markers were found; and top-level `const` bindings don't attach
   to the context — hand them over explicitly. */
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

const ctx={};
vm.createContext(ctx);
// The tab constants + navTabsFor + moreTabsFor are one contiguous span ending
// at TabPane. Hand the consts over explicitly (only functions auto-attach).
const navSrc=slice("const PRIMARY_TABS=","function TabPane(");
vm.runInContext(navSrc+`
this.PRIMARY_TABS=PRIMARY_TABS; this.MORE_TABS=MORE_TABS; this.HIDDEN_TABS=HIDDEN_TABS;
this.SELECTABLE_TABS=SELECTABLE_TABS; this.NAV_BAR_SIZE=NAV_BAR_SIZE;
this.navTabsFor=navTabsFor; this.moreTabsFor=moreTabsFor;`,ctx);
const{PRIMARY_TABS,MORE_TABS,SELECTABLE_TABS,NAV_BAR_SIZE,navTabsFor,moreTabsFor}=ctx;

// mergeTrimPolicy is the merge navTabs reuses. Standalone function.
const mergeSrc=slice("function mergeTrimPolicy(","\n/* Per-key newest-wins for one owner");
vm.runInContext(mergeSrc+`\nthis.mergeTrimPolicy=mergeTrimPolicy;`,ctx);
const{mergeTrimPolicy}=ctx;

const stamp=(v,ts)=>({v,updatedAt:ts});

/* ── navTabsFor ──────────────────────────────────────────────────────────── */
t("1 · uncustomised owner falls back to PRIMARY_TABS",()=>{
  assert.deepEqual(navTabsFor(undefined,"me"),PRIMARY_TABS);
  assert.deepEqual(navTabsFor({},"me"),PRIMARY_TABS);
  assert.deepEqual(navTabsFor({wife:stamp(["home","goals","budget","expenses","banks"],"x")},"me"),PRIMARY_TABS);
});

t("2 · a valid custom list is returned in its stored order",()=>{
  const nav={me:stamp(["goals","home","advisor","budget","networth"],"x")};
  assert.deepEqual(navTabsFor(nav,"me"),["goals","home","advisor","budget","networth"]);
});

t("3 · unknown and hidden ids are dropped",()=>{
  // "targets" is HIDDEN_TABS (not selectable); "bogus" doesn't exist.
  const nav={me:stamp(["home","targets","bogus","budget"],"x")};
  assert.deepEqual(navTabsFor(nav,"me"),["home","budget"]);
});

t("4 · duplicates are collapsed, order preserved",()=>{
  const nav={me:stamp(["home","home","budget","home"],"x")};
  assert.deepEqual(navTabsFor(nav,"me"),["home","budget"]);
});

t("5 · a too-long list is capped at NAV_BAR_SIZE",()=>{
  const many=SELECTABLE_TABS.slice(0,NAV_BAR_SIZE+3);
  assert.ok(many.length>NAV_BAR_SIZE);
  const got=navTabsFor({me:stamp(many,"x")},"me");
  assert.strictEqual(got.length,NAV_BAR_SIZE);
  assert.deepEqual(got,many.slice(0,NAV_BAR_SIZE));
});

t("6 · a list that validates to empty falls back to PRIMARY_TABS",()=>{
  assert.deepEqual(navTabsFor({me:stamp(["targets","bogus"],"x")},"me"),PRIMARY_TABS);
  assert.deepEqual(navTabsFor({me:stamp([],"x")},"me"),PRIMARY_TABS);
});

t("7 · fewer than NAV_BAR_SIZE is honoured, not padded",()=>{
  assert.deepEqual(navTabsFor({me:stamp(["home","goals","budget"],"x")},"me"),["home","goals","budget"]);
});

t("8 · navTabsFor never mutates the shared PRIMARY_TABS constant",()=>{
  const before=PRIMARY_TABS.slice();
  const out=navTabsFor({},"me");
  out.push("advisor"); // caller may treat the result as its own
  assert.deepEqual(PRIMARY_TABS,before,"PRIMARY_TABS was mutated through the fallback");
});

/* ── moreTabsFor ─────────────────────────────────────────────────────────── */
t("9 · moreTabsFor is the exact complement of the bar within SELECTABLE_TABS",()=>{
  const bar=["home","goals","advisor","budget","networth"];
  const more=moreTabsFor(bar);
  assert.deepEqual(more,SELECTABLE_TABS.filter(id=>bar.indexOf(id)===-1));
  // partition: every selectable tab is in exactly one of the two lists
  const union=[...bar,...more].sort();
  assert.deepEqual(union,SELECTABLE_TABS.slice().sort());
  assert.ok(more.every(id=>bar.indexOf(id)===-1));
});

t("10 · default bar (PRIMARY_TABS) sends exactly MORE_TABS to More",()=>{
  assert.deepEqual(moreTabsFor(PRIMARY_TABS),MORE_TABS);
});

/* ── merge (reused mergeTrimPolicy) ──────────────────────────────────────── */
t("11 · two owners edited on two devices both survive",()=>{
  const localDoc={me:stamp(["home","goals"],"2026-01-01T00:00:00Z")};
  const remoteDoc={wife:stamp(["budget","banks"],"2026-01-01T00:00:00Z")};
  const merged=mergeTrimPolicy(localDoc,remoteDoc);
  assert.deepEqual(merged.me.v,["home","goals"]);
  assert.deepEqual(merged.wife.v,["budget","banks"]);
});

t("12 · same owner, newer stamp wins",()=>{
  const older=stamp(["home","goals"],"2026-01-01T00:00:00Z");
  const newer=stamp(["banks","budget"],"2026-06-01T00:00:00Z");
  assert.deepEqual(mergeTrimPolicy({me:older},{me:newer}).me.v,["banks","budget"]);
  assert.deepEqual(mergeTrimPolicy({me:newer},{me:older}).me.v,["banks","budget"]);
});

t("13 · empty maps merge to undefined (undefined-when-empty rule)",()=>{
  assert.strictEqual(mergeTrimPolicy(undefined,undefined),undefined);
  assert.strictEqual(mergeTrimPolicy({},{}),undefined);
});

/* ── source-structure assertions: the out-of-function wiring ─────────────── */
const stripComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"");
const code=stripComments(html);

t("14 · navTabs is merged in tryAutoMergeAll via mergeTrimPolicy",()=>{
  assert.ok(/navTabs\s*:\s*mergeTrimPolicy\(\s*local\.navTabs\s*,\s*remote\.navTabs\s*\)/.test(code),
    "tryAutoMergeAll must merge navTabs with mergeTrimPolicy");
});

t("15 · navTabs is normalised undefined-when-empty in fingerprint",()=>{
  assert.ok(/navTabs\s*:\s*Object\.keys\(\s*rest\.navTabs\s*\|\|\s*\{\}\s*\)\.length\s*\?\s*rest\.navTabs\s*:\s*undefined/.test(code),
    "fingerprint must emit navTabs only when non-empty");
});

t("16 · validateBackup checks navTabs is an object",()=>{
  assert.ok(/obj\.navTabs\s*!==\s*undefined\s*&&/.test(code),
    "validateBackup must guard navTabs shape");
});

t("17 · navTabs is NOT defaulted in migrate() or defaultData()",()=>{
  // absent means 'never customised'; defaulting it would cost a KV write per
  // device on first open, exactly like trimPolicy.
  const migrate=slice("function migrate(","function validateBackup(");
  assert.ok(!/navTabs/.test(migrate),"migrate() must not mention navTabs");
  // structuralDefaults()+sampleData()+defaultData() span (ends at migrate)
  const defs=slice("function structuralDefaults(","function migrate(");
  assert.ok(!/navTabs/.test(defs),"structuralDefaults/defaultData must not mention navTabs");
});

t("18 · navTabs is NOT in BACKUP_ARRAY_KEYS (it is a map, not a list)",()=>{
  const arr=slice("const BACKUP_ARRAY_KEYS=","const BACKUP_OPTIONAL_KEYS=");
  assert.ok(!/navTabs/.test(arr),"navTabs must not be listed as an array-shaped backup key");
});

t("19 · the bar renders the passed-in tab list, not a hardcoded constant",()=>{
  // BottomNav must map over its `tabs` prop and highlight More off it.
  const bn=slice("function BottomNav(","function App(");
  assert.ok(/\{tabs\.map\(/.test(bn),"BottomNav must render tabs.map(...)");
  assert.ok(/tabs\.indexOf\(tab\)\s*===\s*-1/.test(bn),"More-active must derive from the tabs prop");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
