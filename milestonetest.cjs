/* Unit-test the net-worth milestone memory (sticky achievements).

   Slices the real helpers out of index.html and runs them in a vm context,
   per CLAUDE.md — testing the shipped code, not a reimplementation.

   data.netWorthMilestones is a stamped per-profile map,
   `{me:{v,ccy,at,updatedAt}}`, like trimPolicy — BUT merged MAX-per-key
   (achievements are sticky/monotonic), not newest-wins. What's under test:
     • nextNwMilestone / highestNwMilestone rung boundaries
     • mergeMilestones keeps the HIGHEST v per profile, is commutative
       (merge(a,b) deep-equals merge(b,a) incl. key order), never downgrades,
       and returns undefined for the empty map
     • the sync wiring outside a pure function is pinned by source assertion:
       merged in tryAutoMergeAll, emitted-when-non-empty in fingerprint, checked
       in validateBackup, NOT defaulted in migrate()/defaults, NOT in the
       array-shaped backup key lists, and the detection effect writes through
       setData (a real, sync-worthy edit) using highestNwMilestone

   vm traps (see synctest.cjs): use deepEqual not deepStrictEqual across realms;
   assert slice markers were found; top-level `const` bindings don't attach to
   the context — hand them over explicitly. */
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

// Pure ladder helpers — a contiguous span ending at the next function. Consts
// don't auto-attach; hand them over explicitly.
const ladderSrc=slice("const NW_MILESTONE_STEPS=","function purchaseAvailableStack(");
vm.runInContext(ladderSrc+`
this.NW_MILESTONE_STEPS=NW_MILESTONE_STEPS;
this.nextNwMilestone=nextNwMilestone;
this.highestNwMilestone=highestNwMilestone;`,ctx);
const{NW_MILESTONE_STEPS,nextNwMilestone,highestNwMilestone}=ctx;

// The max-per-key merge (standalone function, in the merge region).
const mergeSrc=slice("function mergeMilestones(","\n/* Per-key newest-wins for one owner");
vm.runInContext(mergeSrc+`\nthis.mergeMilestones=mergeMilestones;`,ctx);
const{mergeMilestones}=ctx;

const M=(v,at,ts,ccy)=>({v,ccy:ccy||"PHP",at:at||"2026-08-01",updatedAt:ts||"t"});

/* ── nextNwMilestone ─────────────────────────────────────────────────────── */
t("1 · nextNwMilestone: non-positive → null",()=>{
  assert.strictEqual(nextNwMilestone(0),null);
  assert.strictEqual(nextNwMilestone(-5),null);
});
t("2 · nextNwMilestone: below a rung returns that rung",()=>{
  assert.strictEqual(nextNwMilestone(1),NW_MILESTONE_STEPS[0]); // 10000
  assert.strictEqual(nextNwMilestone(1376816),2000000);         // PHP sample
});
t("3 · nextNwMilestone: exactly on a rung returns the NEXT one",()=>{
  assert.strictEqual(nextNwMilestone(1000000),2000000);
});
t("4 · nextNwMilestone: above the top rung → next 10M multiple",()=>{
  assert.strictEqual(nextNwMilestone(25000000),30000000);
  assert.strictEqual(nextNwMilestone(31000000),40000000);
});

/* ── highestNwMilestone ──────────────────────────────────────────────────── */
t("5 · highestNwMilestone: below the lowest rung → null",()=>{
  assert.strictEqual(highestNwMilestone(9999),null);
  assert.strictEqual(highestNwMilestone(0),null);
});
t("6 · highestNwMilestone: greatest rung at or below n",()=>{
  assert.strictEqual(highestNwMilestone(1376816),1000000); // PHP sample → 1M
  assert.strictEqual(highestNwMilestone(347000),250000);   // a person's PHP
  assert.strictEqual(highestNwMilestone(1000000),1000000); // exactly on a rung
});
t("7 · next is always strictly greater than highest (they don't overlap)",()=>{
  [15000,260000,1376816,3000000].forEach(v=>{
    assert.ok(nextNwMilestone(v)>highestNwMilestone(v),"next>highest at "+v);
  });
});

/* ── mergeMilestones ─────────────────────────────────────────────────────── */
t("8 · empty inputs → undefined (byte-identical fingerprint when unused)",()=>{
  assert.strictEqual(mergeMilestones(undefined,undefined),undefined);
  assert.strictEqual(mergeMilestones({},{}),undefined);
});
t("9 · a key present on only one side survives",()=>{
  const out=mergeMilestones({me:M(1000000)},{wife:M(250000)});
  assert.deepEqual(out.me,M(1000000));
  assert.deepEqual(out.wife,M(250000));
});
t("10 · HIGHEST v wins per key (sticky/monotonic), never downgrades",()=>{
  const local={household:M(1000000,"2026-08-01","t1")};
  const remote={household:M(2000000,"2026-09-01","t2")};
  assert.strictEqual(mergeMilestones(local,remote).household.v,2000000);
  assert.strictEqual(mergeMilestones(remote,local).household.v,2000000);
});
t("11 · commutative incl. key order: merge(a,b) deep-equals merge(b,a)",()=>{
  const a={me:M(1000000,"2026-08-01","t1"),household:M(2000000,"2026-07-01","tA")};
  const b={wife:M(500000,"2026-06-01","t2"),household:M(2000000,"2026-08-15","tB")};
  const ab=mergeMilestones(a,b),ba=mergeMilestones(b,a);
  assert.deepEqual(ab,ba);
  assert.deepEqual(Object.keys(ab),Object.keys(ab).slice().sort()); // keys sorted
});
t("12 · equal v tie broken deterministically by (at,updatedAt)",()=>{
  // earlier composite key wins from either side → convergent
  const a={x:M(1000000,"2026-08-01","t1")};
  const b={x:M(1000000,"2026-07-01","t2")};
  assert.deepEqual(mergeMilestones(a,b),mergeMilestones(b,a));
  assert.strictEqual(mergeMilestones(a,b).x.at,"2026-07-01"); // earlier date
});

/* ── source assertions — the sync wiring lives outside pure functions ────── */
t("13 · merged in tryAutoMergeAll via mergeMilestones",()=>{
  assert.ok(/netWorthMilestones:mergeMilestones\(/.test(html),
    "tryAutoMergeAll must merge netWorthMilestones with mergeMilestones");
});
t("14 · emitted-when-non-empty in fingerprint",()=>{
  const fp=slice("const fingerprint=","const userFingerprint");
  assert.ok(/netWorthMilestones:Object\.keys\(rest\.netWorthMilestones\|\|\{\}\)\.length/.test(fp),
    "fingerprint must emit netWorthMilestones only when non-empty");
});
t("15 · object-shape checked in validateBackup",()=>{
  const vb=slice("function validateBackup(","const fingerprint=");
  assert.ok(/netWorthMilestones/.test(vb)&&/should be an object/.test(vb),
    "validateBackup must object-check netWorthMilestones");
});
t("16 · NOT defaulted in migrate() or the defaults span",()=>{
  const migrate=slice("function migrate(","function validateBackup(");
  assert.ok(!/netWorthMilestones/.test(migrate),"migrate() must not mention netWorthMilestones");
  const defs=slice("function structuralDefaults(","function migrate(");
  assert.ok(!/netWorthMilestones/.test(defs),"defaults must not mention netWorthMilestones");
});
t("17 · NOT in the array-shaped backup key lists (it is a map)",()=>{
  const arr=slice("const BACKUP_ARRAY_KEYS=","const BACKUP_OPTIONAL_KEYS=");
  assert.ok(!/netWorthMilestones/.test(arr),"must not be an array-shaped backup key");
});
t("18 · detection effect writes a REAL edit (setData, not setDataRaw) via highestNwMilestone",()=>{
  const eff=slice("Net-worth milestone memory (sticky","automatic market-data refresh");
  assert.ok(/highestNwMilestone\(/.test(eff),"effect must derive the rung from highestNwMilestone");
  assert.ok(/setData\(/.test(eff),"effect must persist through setData (dirties + syncs)");
  assert.ok(!/setDataRaw\(/.test(eff),"effect must NOT use setDataRaw (that would never sync the achievement)");
  assert.ok(/netWorthMilestones/.test(eff),"effect must write the netWorthMilestones map");
  // No-op guard: re-opening the app (no new all-time-high) must NOT write, or
  // every open would dirty the doc and burn a KV write.
  assert.ok(/if\(!changed\)return d;/.test(eff),"effect must bail via `if(!changed)return d;` when nothing crossed");
});

t("19 · milestones are NOT stripped as `auto` — a real achievement stays in userFingerprint (dirties + syncs)",()=>{
  // stripAutoRows only touches history/snapshots; a milestone is person-worthy
  // state, so it must NOT be excluded from the dirty flag the way price-tick
  // snapshot rows are.
  const strip=slice("const stripAutoRows=","const fingerprint=");
  assert.ok(!/netWorthMilestones/.test(strip),"netWorthMilestones must not be stripped as auto data");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
