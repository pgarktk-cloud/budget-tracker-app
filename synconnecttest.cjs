/* synconnecttest.cjs — the gate on a device's FIRST contact with the cloud.
   Run: node synconnecttest.cjs [path-to-index.html]

   The bug this exists to prevent (2026-08-07): a brand-new Safari/PWA origin
   booted on the SAMPLE dataset, persisted it, and the moment a passphrase was
   entered ran tryAutoMergeAll(sample, cloud) and auto-pushed the union. Both
   real phones then adopted the demo records.

   The merge is the part worth understanding, because it did not fail — it
   worked perfectly. tryAutoMergeAll is id-keyed, every sample id is freshly
   minted, so nothing collides and every demo record survives into the result.
   A merge is only meaningful against a SHARED ANCESTOR; without one, the union
   of two documents isn't a reconciliation, it's contamination wearing a
   merge's clothes. Hence syncConnectDecision, and hence hasBaseline being its
   first and most important input.

   Covers: the six required cases, the record/settings distinction that decides
   whether a person is interrupted, and the sample-data provenance mark. Merge
   MECHANICS are mergetest.cjs's job — this file only asserts that an
   established device is still routed to them.

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
const deepEqual=(a,b,m)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),m);

/* ── the sandbox ─────────────────────────────────────────────────────────── */
const ctx={console};
vm.createContext(ctx);

// A stand-in localStorage, so the provenance helpers can be exercised for
// real rather than reimplemented here.
const store={};
ctx.localStorage={
  getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];},
};

const docShape=slice("function structuralDefaults(){","/* Bills Reserve = opening baseline");
const provenance=slice("const PROVENANCE_KEY=","/* theme is a per-device UI preference");
const decision=slice("const RECORD_COLLECTIONS=","function tryAutoMergeAll(");

vm.runInContext(`
function uid(){return Math.random().toString(36).slice(2,9);}
var SEG=["#2C5FA8","#6FA0D6","#1B3E73","#2E8BB0","#4C6E9C","#8FB4DD","#173B5E","#5BA7C2"];
var monthLabel=function(){return "August 2026";};
var P={gr:"#2f9e6d",br:"#8a6a3d",amber:"#c98a12"};

`+docShape+provenance+decision+`
this.structuralDefaults=structuralDefaults;
this.sampleData=sampleData;
this.defaultData=defaultData;
this.migrate=migrate;
this.countLocalRecords=countLocalRecords;
this.settingsSignature=settingsSignature;
this.syncConnectDecision=syncConnectDecision;
this.markSampleData=markSampleData;
this.clearSampleMark=clearSampleMark;
this.getProvenance=getProvenance;
this.RECORD_COLLECTIONS=RECORD_COLLECTIONS;
`,ctx);

const{structuralDefaults,sampleData,defaultData,migrate,countLocalRecords,
  settingsSignature,syncConnectDecision,markSampleData,clearSampleMark,
  getProvenance,RECORD_COLLECTIONS}=ctx;

assert.ok(typeof syncConnectDecision==="function","syncConnectDecision was not sliced out");
assert.ok(typeof getProvenance==="function","the provenance helpers were not sliced out");
assert.ok(Array.isArray(RECORD_COLLECTIONS),"RECORD_COLLECTIONS was not sliced out");

const clone=o=>JSON.parse(JSON.stringify(o));
/* An "established cloud": somebody's real household document. Deliberately
   hand-built rather than taken from defaultData(), so that a change to the
   app's seed data can't quietly change what "the cloud already has data"
   means in these tests. */
const cloudDoc=()=>migrate({
  currency:"SAR",owners:{me:"Jastine",wife:"Charlene"},
  plans:[{id:"p1",owner:"me",name:"Monthly Salary",month:"August 2026",income:22000,
    groups:[{id:"g1",name:"Essentials"}],
    categories:[{id:"c1",name:"Groceries",amount:1200,groupId:"g1",subs:[]}]}],
  expenses:[{id:"e1",catId:"c1",name:"Market",amount:340,date:"2026-08-03"}],
  goals:[{id:"go1",owner:"me",name:"Emergency Fund",target:60000,contributions:[]}],
  banks:[{id:"b1",owner:"me",name:"Salary account",balance:12000}],
});

/* ── 1. fresh origin + established cloud ──────────────────────────────────── */

t("CASE 1: fresh origin meeting an established cloud adopts it, and posts nothing",()=>{
  const local=migrate(structuralDefaults());   // what a new device now boots on
  const d=syncConnectDecision({
    hasBaseline:false,
    provenance:"user",
    localHasRecords:countLocalRecords(local)>0,
    localDiffersInSettings:settingsSignature(local)!==settingsSignature(cloudDoc()),
    remoteExists:true,
  });
  assert.equal(d.action,"adopt","a device with no baseline and no records must adopt");
  assert.equal(d.post,false,"a fresh device must never POST on first contact");
});

t("CASE 1: the empty boot document contains nothing to count as user data",()=>{
  /* If this ever fails, every fresh device starts routing to the blocking
     chooser instead of adopting — the bug's mirror image. */
  assert.equal(countLocalRecords(migrate(structuralDefaults())),0);
});

t("CASE 1: adopting means the cloud document EXACTLY, byte for byte",()=>{
  /* adoptCloudDoc sets data to the remote object itself. The regression worth
     guarding is that nothing local rides along, so assert the identity the app
     relies on: the adopted document is the remote one, unmodified. */
  const remote=cloudDoc();
  const before=JSON.stringify(remote);
  const local=migrate(structuralDefaults());
  syncConnectDecision({hasBaseline:false,provenance:"user",
    localHasRecords:countLocalRecords(local)>0,localDiffersInSettings:true,remoteExists:true});
  assert.equal(JSON.stringify(remote),before,"deciding must not mutate the remote document");
});

/* ── 2. untouched sample data + established cloud ─────────────────────────── */

t("CASE 2: untouched sample data has no claim on an established cloud",()=>{
  const local=migrate(defaultData());          // the demo dataset
  assert.ok(countLocalRecords(local)>0,"the sample dataset must actually have records, or this proves nothing");
  const d=syncConnectDecision({
    hasBaseline:false,
    provenance:"sample",
    localHasRecords:true,                       // it does have records — and is still ignored
    localDiffersInSettings:true,
    remoteExists:true,
  });
  assert.equal(d.action,"adopt","sample data must be discarded, not offered as a choice");
  assert.equal(d.post,false,"no sample record may reach the cloud");
});

t("CASE 2: sample provenance outranks having records — that is the whole point",()=>{
  /* Without this precedence the demo dataset would route to the chooser, and
     "Merge and upload" would be one tap away from the original bug. */
  const withRecords=syncConnectDecision({hasBaseline:false,provenance:"sample",
    localHasRecords:true,localDiffersInSettings:true,remoteExists:true});
  assert.equal(withRecords.action,"adopt");
});

t("CASE 2: sample data is not pushed to an EMPTY cloud either",()=>{
  /* Onboarding an empty cloud is the one case where a device legitimately
     writes first — but seeding a household's shared document with demo records
     is still not something that may happen without being asked for. */
  const d=syncConnectDecision({hasBaseline:false,provenance:"sample",
    localHasRecords:true,localDiffersInSettings:false,remoteExists:false});
  assert.equal(d.post,false,"sample data must not silently seed an empty cloud");
});

/* ── 3. genuine pre-connection edits + established cloud ──────────────────── */

t("CASE 3: genuine local records meeting an established cloud must ASK",()=>{
  const local=migrate(structuralDefaults());
  local.expenses=[{id:"mine1",catId:"c9",name:"Coffee",amount:18,date:"2026-08-06"}];
  assert.equal(countLocalRecords(local),1);
  const d=syncConnectDecision({
    hasBaseline:false,provenance:"user",
    localHasRecords:true,localDiffersInSettings:false,remoteExists:true,
  });
  assert.equal(d.action,"ask","real local data may not be silently discarded OR silently merged");
  assert.equal(d.post,false,"nothing may be uploaded before the person answers");
});

t("CASE 3: a settings-only difference does NOT interrupt with a dialog",()=>{
  /* A person who picked their currency before connecting should not be shown a
     three-way data-loss chooser. Adopt, and say so in a line. */
  const d=syncConnectDecision({hasBaseline:false,provenance:"user",
    localHasRecords:false,localDiffersInSettings:true,remoteExists:true});
  assert.equal(d.action,"adopt");
  assert.equal(d.post,false);
  assert.equal(d.banner,true,"a silently replaced preference has to be mentioned");
});

t("CASE 3: no settings difference means no banner either",()=>{
  const d=syncConnectDecision({hasBaseline:false,provenance:"user",
    localHasRecords:false,localDiffersInSettings:false,remoteExists:true});
  deepEqual(d,{action:"adopt",post:false,banner:false});
});

t("CASE 3: settings are not records — changing currency alone can't trigger ASK",()=>{
  const local=migrate(structuralDefaults());
  local.currency="PHP";
  local.owners={me:"Jastine",wife:"Charlene"};
  local.payPeriods.me.enabled=true;
  assert.equal(countLocalRecords(local),0,"preferences must never count as user records");
  assert.notEqual(settingsSignature(local),settingsSignature(migrate(structuralDefaults())),
    "...but they must still register as a settings difference");
});

t("CASE 3: the empty plan skeleton is not mistaken for user data",()=>{
  /* structuralDefaults ships one empty plan per owner so activePlanId
     resolves. Counting PLANS rather than plan CATEGORIES would report every
     fresh device as having user data and block every first connection. */
  const local=migrate(structuralDefaults());
  assert.ok(local.plans.length>0,"the skeleton must exist, or Budget has nothing to render");
  assert.equal(countLocalRecords(local),0);
  local.plans[0].categories.push({id:"c1",name:"Groceries",amount:1200,subs:[]});
  assert.equal(countLocalRecords(local),1,"a real category IS user data");
});

t("CASE 3: tombstoned records are not something to protect",()=>{
  const local=migrate(structuralDefaults());
  local.expenses=[{id:"gone",amount:10,date:"2026-08-01",deletedAt:"2026-08-02T00:00:00Z"}];
  assert.equal(countLocalRecords(local),0,"a deleted record has nothing left to lose");
});

/* ── 4. established device with offline edits ─────────────────────────────── */

t("CASE 4: an established device still merges — existing behaviour untouched",()=>{
  const d=syncConnectDecision({
    hasBaseline:true,                 // has reconciled with the cloud before
    provenance:"user",
    localHasRecords:true,
    localDiffersInSettings:true,
    remoteExists:true,
  });
  deepEqual(d,{action:"merge",post:true,banner:false},
    "two devices that share an ancestor must keep merging exactly as before");
});

t("CASE 4: hasBaseline outranks every other input",()=>{
  /* The established-device branch must stay FIRST. If a later condition could
     override it, a normal two-phone merge could be turned into an adopt and
     silently drop one side's offline edits — a far worse bug than the one
     being fixed. */
  const combos=[];
  [true,false].forEach(r=>[true,false].forEach(s=>["user","sample"].forEach(p=>{
    combos.push(syncConnectDecision({hasBaseline:true,provenance:p,
      localHasRecords:s,localDiffersInSettings:s,remoteExists:r}));
  })));
  combos.forEach(d=>assert.equal(d.action,"merge",
    "an established device must merge regardless of provenance or record counts"));
});

/* ── 5. empty cloud + fresh device ────────────────────────────────────────── */

t("CASE 5: a fresh device seeds an empty cloud",()=>{
  const d=syncConnectDecision({hasBaseline:false,provenance:"user",
    localHasRecords:true,localDiffersInSettings:false,remoteExists:false});
  assert.equal(d.action,"onboard","somebody has to write first");
  assert.equal(d.post,true);
});

t("CASE 5: an empty device onboarding an empty cloud is still allowed to push",()=>{
  /* Otherwise a genuinely new household could never establish a document. */
  const d=syncConnectDecision({hasBaseline:false,provenance:"user",
    localHasRecords:false,localDiffersInSettings:false,remoteExists:false});
  assert.equal(d.action,"onboard");
  assert.equal(d.post,true);
});

/* ── 6. reconnect after a bad passphrase / a network failure ──────────────── */

t("CASE 6a: a rejected passphrase leaves no residue — a later attempt decides afresh",()=>{
  /* connectPass only stores the token when the Worker returns ok, so a
     rejection changes nothing this function can see. The invariant worth
     pinning is that the SAME inputs still produce the same first-connection
     answer afterwards — a failed attempt must not have quietly consumed it. */
  const args={hasBaseline:false,provenance:"user",localHasRecords:true,
    localDiffersInSettings:false,remoteExists:true};
  const first=syncConnectDecision(args);
  const second=syncConnectDecision(args);
  deepEqual(second,first,"a retry after a failed connect must ask the same question");
  assert.equal(second.action,"ask");
});

t("CASE 6b: connecting is an AUTH fact — pushing is enabled only by a validated read",()=>{
  /* Structural, because this one lives in App() effects rather than in a pure
     function, and it is the requirement most easily undone by a later edit:
     the connect effect must not set cloudConfirmedRef. That flag used to be
     flipped purely because /sync/meta accepted the passphrase, which cleared a
     device to push over a document it had never read. */
  const a=html.indexOf("First pull after connecting a device");
  assert.ok(a>=0,"the connect effect's comment banner moved");
  const b=html.indexOf("},[syncTokenSet,loaded]);",a);
  assert.ok(b>a,"could not find the end of the connect effect");
  const body=html.slice(a,b);
  assert.ok(!/cloudConfirmedRef\.current\s*=\s*true/.test(body),
    "the connect effect must NOT enable pushing — only a validated /sync read may");
  assert.ok(/pullFromCloudRef\.current\(\)/.test(body),
    "...it should still trigger the pull that does the validating");
});

t("CASE 6b: pullFromCloud enables pushing only after cloudDocProblem has passed",()=>{
  const a=html.indexOf("const pullFromCloud=async()=>{");
  assert.ok(a>=0,"pullFromCloud moved");
  const problem=html.indexOf("const problem=cloudDocProblem(remoteRaw);",a);
  const enable=html.indexOf("cloudConfirmedRef.current=true;",a);
  assert.ok(problem>a,"the validation call moved");
  assert.ok(enable>problem,
    "cloudConfirmedRef must be set AFTER the document has been validated, not before");
});

t("CASE 6b: a device holding no baseline never reaches the merge-and-retry path",()=>{
  /* saveToCloud's conflict retry is the third door to the same contamination:
     a rev rejection hands back the server's document and the reflex is to
     merge into it. Without a baseline that union is not a merge. */
  const a=html.indexOf("let result=await KVSync.save(payload,localRevRef.current);");
  assert.ok(a>=0,"the save/conflict block moved");
  const guard=html.indexOf("m0.lastCloudSnapshot==null",a);
  const merge=html.indexOf("const merged=tryAutoMergeAll(payload,remoteMigrated);",a);
  assert.ok(guard>a&&guard<merge,
    "the no-baseline guard must come BEFORE the conflict-retry merge");
});

/* ── provenance mark ──────────────────────────────────────────────────────── */

t("provenance: a loaded sample reads as sample",()=>{
  clearSampleMark();
  markSampleData();
  assert.equal(getProvenance(),"sample");
});

t("provenance: the mark is STICKY — background effects must not clear it",()=>{
  /* The first version of this anchored the mark to the document's fingerprint
     so that any edit would end sample status by itself. It cleared itself
     within seconds of load, because the bills reconciler, the daily snapshot
     effect and the quote refresh all mutate the document — and the demo
     dataset auto-pushed exactly as before. The mark must survive the document
     changing underneath it; only the three explicit exits below end it. */
  clearSampleMark();
  markSampleData();
  assert.equal(getProvenance(),"sample");
  assert.equal(getProvenance(),"sample","reading it must not consume it");
  assert.equal(getProvenance(),"sample");
});

t("provenance: clearing is explicit, and is what a Save to Cloud performs",()=>{
  clearSampleMark();
  markSampleData();
  clearSampleMark();
  assert.equal(getProvenance(),"user","once shared or replaced, it is the person's own data");
});

t("provenance: absent means USER, never sample",()=>{
  /* A device that has held real data since before this build has no mark. If
     absence read as "sample" its owner's data would be silently discarded on
     the next connection. */
  clearSampleMark();
  assert.equal(getProvenance(),"user");
});

t("provenance: a sample device is refused the cloud, and never pushes to it",()=>{
  /* The two halves of requirement 7 in one place: sample data neither claims
     an established cloud nor silently seeds an empty one. */
  clearSampleMark();
  markSampleData();
  const established=syncConnectDecision({hasBaseline:false,provenance:getProvenance(),
    localHasRecords:true,localDiffersInSettings:true,remoteExists:true});
  const empty=syncConnectDecision({hasBaseline:false,provenance:getProvenance(),
    localHasRecords:true,localDiffersInSettings:true,remoteExists:false});
  assert.equal(established.action,"adopt");
  assert.equal(established.post,false);
  assert.equal(empty.post,false);
  clearSampleMark();
});

/* ── the split itself ─────────────────────────────────────────────────────── */

t("structuralDefaults carries no records; defaultData still carries all of them",()=>{
  const empty=migrate(structuralDefaults());
  RECORD_COLLECTIONS.forEach(k=>
    assert.equal((empty[k]||[]).length,0,`${k} must be empty on a fresh device`));
  assert.equal((empty.household.expenses||[]).length,0);
  const sample=migrate(defaultData());
  assert.ok(sample.goals.length&&sample.investments.length&&sample.banks.length,
    "defaultData() must still produce the demo dataset for the sample button");
});

t("the sample document is reachable only by composing the two halves",()=>{
  /* If sampleData ever stopped layering onto structuralDefaults, a field added
     to the empty shape could go missing from the sample one. */
  const s=sampleData(structuralDefaults());
  const e=structuralDefaults();
  Object.keys(e).forEach(k=>assert.ok(k in s,`sampleData dropped "${k}"`));
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
