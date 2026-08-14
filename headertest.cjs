/* Structure and copy assertions for the app header (v1.45.0, phase 4).

   There is nothing here to unit-test in the usual sense — no arithmetic, no
   merge. What this pins is the set of claims the release makes about the
   SHAPE of the code, each of which is invisible to every other runner and
   would fail silently:

     • the contradictory instruction line is gone, and cannot come back
     • the sync sheet owns no sync logic — it moved controls, it did not
       reimplement them
     • it is rendered at App level, not from inside the header
     • the header's income figure is display-only

   Same sweep style purchasetest.cjs uses to prove the removed AI path left
   nothing behind. Cheap, and it fails loudly instead of drifting. */
const fs=require("fs"),assert=require("assert"),path=require("path");
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

console.log("header + sync sheet (v1.45.0)");

t("1 · the contradictory instruction line is gone",()=>{
  /* "Pull before editing on another device; Save to Cloud when finished."
     described a manual model the app outgrew, and Settings has said the
     opposite — "Nothing here is manual" — for months. Two sentences, both
     shipped, disagreeing about how the app works. */
  assert.ok(!/Pull before editing/.test(html),"the old instruction line is back");
  assert.ok(/Nothing here is manual/.test(html),
    "the Settings sentence it contradicted should still be there — it was the correct one");
});

t("2 · exactly one sync control in the header",()=>{
  const header=slice("        {/* header */}","        {/* Section title");
  assert.ok(/setShowSyncSheet\(true\)/.test(header),"the header must open the sync sheet");
  // The four controls this replaced must not have crept back in beside it.
  assert.ok(!/pullFromCloud\(\)/.test(header),"the Pull button is back in the header");
  assert.ok(!/saveToCloud\(\)/.test(header),"the header must not save directly — that is the sheet's job");
  assert.ok(!/toggleTheme/.test(header),"the theme toggle belongs in Settings");
  assert.ok(!/setShowPendingDiff/.test(header),"the pending badge folded into the sync sheet");
  assert.strictEqual((header.match(/setShowSyncSheet\(true\)/g)||[]).length,1,
    "one status control means ONE entry point");
});

t("3 · the sheet moved the controls and reimplemented none of them",()=>{
  const sheet=slice("function SyncSheet(","/* ── Pending-changes viewer");
  // Phase 4 is presentation only. If any of these appear, the release has
  // grown a second copy of sync behaviour, which is how two paths come to
  // disagree — the reason addContribution was deleted.
  for(const forbidden of ["setData(","KVSync","fetch(","localStorage","migrate(","fingerprint("])
    assert.ok(!sheet.includes(forbidden),`SyncSheet must not contain ${forbidden}`);
  // It receives the app's own handlers instead.
  for(const prop of ["onSave","onPull","onViewPending","onOpenSettings"])
    assert.ok(sheet.includes(prop),`SyncSheet should be handed ${prop}`);
});

t("4 · the sheet is rendered at App level, not from inside the header",()=>{
  /* It is a `position:fixed` overlay. Rendered from within the animated
     TabPane, `fill-mode:both` leaves a transform applied forever and that div
     becomes the containing block — the invisible-unreachable-dialog trap that
     bit ConfirmDialog and AdjustReserveSheet. The header is not inside
     TabPane today, which makes rendering it there merely fragile rather than
     broken; App level removes the question. */
  const mount=html.indexOf("{showSyncSheet&&<SyncSheet");
  assert.ok(mount>0,"the sheet is never mounted");
  const tabPaneEnd=html.indexOf("</TabPane>");
  assert.ok(tabPaneEnd>0&&mount>tabPaneEnd,
    "SyncSheet must be mounted after </TabPane>, beside the other App-level modals");
  const header=slice("        {/* header */}","        {/* Section title");
  assert.ok(!header.includes("<SyncSheet"),"it must not be rendered from the header itself");
});

t("5 · every prop the sheet's body names is passed at the mount site",()=>{
  /* The blank-screen failure this repo has now had five times: a component
     reads a prop its signature never declared, or its signature declares one
     the mount site never passes. Every runner stays green and the tab dies. */
  const sig=slice("function SyncSheet({","}){");
  const props=sig.replace("function SyncSheet({","").split(",").map(s=>s.trim()).filter(Boolean);
  assert.ok(props.length>10,"expected the destructured signature, got: "+sig.slice(0,80));
  const mount=slice("{showSyncSheet&&<SyncSheet","/>}");
  for(const p of props)
    assert.ok(new RegExp(`\\b${p}\\b`).test(mount),`SyncSheet declares ${p} but the mount site never passes it`);
});

t("6 · the header's income is display-only",()=>{
  const header=slice("        {/* header */}","        {/* Section title");
  // The ELEMENT, not the word — the comment above the figure explains what it
  // replaced, and matching prose would make this fail on its own rationale.
  assert.ok(!/<NumField/.test(header),
    "income is a figure now — an editable field in a header shown on every tab is one mis-tap from rewriting the plan");
  assert.ok(!/<input/.test(header),"no editable field belongs in the header at all");
  assert.ok(!/patchPlan\(\{income/.test(header),"the header must not write income");
  assert.ok(/setTab\("budget"\)/.test(header),"...it navigates to where editing belongs instead");
  /* And the destination must actually be able to edit it. Removing the header
     field is only safe because BudgetView has always had its own income
     NumField, wired through `setIncome` → `editMonth`, i.e. through
     editPlanForMonth like every other budget mutation. If that ever goes, this
     tap-through becomes a dead end and income turns read-only for good. */
  assert.ok(/onCommit=\{setIncome\}/.test(html),
    "Budget must still have the income field this header now points at");
  assert.ok(/const setIncome=v=>editMonth\(/.test(html),
    "...and it must write through editMonth, not a by-plan-id setter");
});

t("7 · one place decides the sync label",()=>{
  // Four controls previously each derived their own wording from the same
  // state, which is how a pill could say "Cloud synced" beside a badge
  // showing a pending count.
  assert.ok(/const syncPill=\(\(\)=>\{/.test(html),"syncPill should be the single derivation");
  const pill=slice("const syncPill=(()=>{","})();");
  for(const state of ["Not connected","Offline","Sync failed","Cloud is newer","Synced"])
    assert.ok(pill.includes(state),`syncPill should cover the ${state} state`);
  /* Every label has to survive a 320px header, where the pill and Settings
     share a 288px content box with the wordmark. Measured in a browser; this
     just stops a future label being written without that in mind. */
  const labels=(pill.match(/label:"([^"]+)"/g)||[]).map(s=>s.slice(7,-1));
  assert.ok(labels.length>=6,"expected every branch to carry a label");
  labels.forEach(l=>assert.ok(l.length<=16,`sync label "${l}" is too long for a 320px header`));
  assert.ok(pill.indexOf("!isOnline")<pill.indexOf("hasUnsyncedChanges"),
    "worst-first: offline is more useful than a pending count when both are true");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
