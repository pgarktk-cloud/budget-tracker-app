/* Unit-test the rotating local safety copies without a browser.

   Slices readPreCloudSlots/writePreCloudSlots out of index.html and runs them
   against a fake localStorage, per CLAUDE.md — testing the shipped code.

   Why this exists (2026-08-05): the pre-import safety copy was a single slot,
   so a second replacement destroyed the copy you were about to go back to —
   which is exactly the moment people repeat an action hoping for a different
   result. Two rotating slots, newest first.

   The subtle part is quota. This device already holds the live document and
   the last-synced baseline; two slots makes FOUR copies of a financial
   document in a ~5MB localStorage. writePreCloudSlots must therefore DEGRADE
   (drop the older slot, keep the newest) rather than fail, and must only
   report failure when not even one slot fits.

   vm traps (see synctest.cjs): use deepEqual not deepStrictEqual; assert the
   slice markers were found; top-level `const` bindings don't attach to the
   context, so hand them over explicitly. */
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

/* A localStorage stand-in with a settable byte ceiling, so the quota path is
   tested for real rather than assumed. */
function makeStore(limit=Infinity){
  const map=new Map();
  return{
    limit,
    getItem(k){return map.has(k)?map.get(k):null;},
    removeItem(k){map.delete(k);},
    setItem(k,v){
      let total=v.length;
      map.forEach((val,key)=>{if(key!==k)total+=val.length;});
      if(total>this.limit){const e=new Error("QuotaExceededError");e.name="QuotaExceededError";throw e;}
      map.set(k,v);
    },
    _raw(k){return map.get(k);},
  };
}

const ctx={};
vm.createContext(ctx);
const src=slice('const PRE_CLOUD_BACKUP_KEY="salaryPlanner:v3:preCloudRestore";','const PROFILE_KEY=');
vm.runInContext(src+`
this.PRE_CLOUD_BACKUP_KEY=PRE_CLOUD_BACKUP_KEY;
this.PRE_CLOUD_SLOT_LIMIT=PRE_CLOUD_SLOT_LIMIT;
this.readPreCloudSlots=readPreCloudSlots;
this.writePreCloudSlots=writePreCloudSlots;
this.setStore=function(s){localStorage=s;};`,ctx);
const{PRE_CLOUD_BACKUP_KEY,PRE_CLOUD_SLOT_LIMIT,readPreCloudSlots,writePreCloudSlots,setStore}=ctx;

const slot=(at,label,payload)=>({at,label:label||null,data:{marker:payload||at}});
/* Mirrors the shipped stashPreCloudBackup: unshift, then write. */
const stash=s=>writePreCloudSlots([s,...readPreCloudSlots()]);

console.log("rotating local safety copies");

t("the limit is two",()=>{
  assert.strictEqual(PRE_CLOUD_SLOT_LIMIT,2);
});

t("no stored copies reads as an empty list, not a crash",()=>{
  setStore(makeStore());
  assert.deepEqual(readPreCloudSlots(),[]);
});

t("a first copy is stored",()=>{
  setStore(makeStore());
  stash(slot("2026-08-05T10:00:00.000Z","before importing a backup"));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,1);
  assert.strictEqual(s[0].data.marker,"2026-08-05T10:00:00.000Z");
  assert.strictEqual(s[0].label,"before importing a backup");
});

t("a second copy is kept ALONGSIDE the first, newest first",()=>{
  setStore(makeStore());
  stash(slot("2026-08-05T10:00:00.000Z","first"));
  stash(slot("2026-08-05T11:00:00.000Z","second"));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,2,"the whole point of the change");
  assert.strictEqual(s[0].label,"second","newest first");
  assert.strictEqual(s[1].label,"first");
});

t("a third copy evicts the oldest, never the newest",()=>{
  setStore(makeStore());
  stash(slot("2026-08-05T10:00:00.000Z","first"));
  stash(slot("2026-08-05T11:00:00.000Z","second"));
  stash(slot("2026-08-05T12:00:00.000Z","third"));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,2);
  assert.deepEqual(s.map(x=>x.label),["third","second"]);
});

t("importing twice by mistake still leaves a way back",()=>{
  // the exact scenario the second slot exists for
  setStore(makeStore());
  stash(slot("t1","before importing a backup","REAL-DATA"));
  stash(slot("t2","before importing a backup","WRONG-IMPORT"));
  const s=readPreCloudSlots();
  assert.ok(s.some(x=>x.data.marker==="REAL-DATA"),
    "the original data must still be reachable after a second bad import");
});

/* ── the pre-2026-08-05 shape ───────────────────────────────────────────── */

t("an old single-object copy is adopted, not discarded",()=>{
  const store=makeStore();
  setStore(store);
  store.setItem(PRE_CLOUD_BACKUP_KEY,JSON.stringify({at:"2026-08-01T09:00:00.000Z",data:{marker:"OLD"}}));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,1,"an upgrading device may be relying on this copy right now");
  assert.strictEqual(s[0].data.marker,"OLD");
  assert.strictEqual(s[0].label,null);
});

t("...and the next stash keeps it as the second slot",()=>{
  const store=makeStore();
  setStore(store);
  store.setItem(PRE_CLOUD_BACKUP_KEY,JSON.stringify({at:"2026-08-01T09:00:00.000Z",data:{marker:"OLD"}}));
  stash(slot("2026-08-05T10:00:00.000Z","new"));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,2);
  assert.strictEqual(s[1].data.marker,"OLD");
});

t("garbage in the key reads as empty rather than throwing",()=>{
  const store=makeStore();
  setStore(store);
  store.setItem(PRE_CLOUD_BACKUP_KEY,"{not json");
  assert.deepEqual(readPreCloudSlots(),[]);
});

t("entries missing at/data are ignored",()=>{
  const store=makeStore();
  setStore(store);
  store.setItem(PRE_CLOUD_BACKUP_KEY,JSON.stringify([{at:"t1"},{data:{}},{at:"t2",data:{marker:"ok"}}]));
  const s=readPreCloudSlots();
  assert.strictEqual(s.length,1);
  assert.strictEqual(s[0].data.marker,"ok");
});

/* ── quota degradation — the reason two slots isn't free ────────────────── */

const big=n=>"x".repeat(n);

t("when two slots won't fit, the NEWEST is kept alone",()=>{
  // room for roughly one payload, not two
  setStore(makeStore(2600));
  const wrote1=writePreCloudSlots([{at:"t1",label:"first",data:{blob:big(2000)}}]);
  assert.ok(wrote1,"one slot must fit");
  const wrote2=writePreCloudSlots([
    {at:"t2",label:"second",data:{blob:big(2000)}},
    {at:"t1",label:"first",data:{blob:big(2000)}},
  ]);
  assert.ok(wrote2,"must degrade to one slot rather than fail");
  assert.strictEqual(wrote2.length,1,"dropped the older copy");
  assert.strictEqual(wrote2[0].label,"second","kept the newest");
  assert.strictEqual(readPreCloudSlots().length,1);
});

t("writePreCloudSlots reports failure only when not even one slot fits",()=>{
  setStore(makeStore(50));
  const wrote=writePreCloudSlots([{at:"t1",label:"first",data:{blob:big(5000)}}]);
  assert.strictEqual(wrote,null,"import must be able to detect this and abort");
});

t("a failed write leaves the previous copies intact",()=>{
  const store=makeStore(3000);
  setStore(store);
  writePreCloudSlots([{at:"t1",label:"first",data:{blob:big(2000)}}]);
  const before=store._raw(PRE_CLOUD_BACKUP_KEY);
  const wrote=writePreCloudSlots([{at:"t2",label:"huge",data:{blob:big(999999)}}]);
  assert.strictEqual(wrote,null);
  assert.strictEqual(store._raw(PRE_CLOUD_BACKUP_KEY),before,
    "a rejected write must not have destroyed the copy already there");
});

t("the returned list is what was actually persisted",()=>{
  // the UI renders from the return value, so a lie here shows a restore
  // button for a copy that isn't on disk
  setStore(makeStore(2600));
  const wrote=writePreCloudSlots([
    {at:"t2",label:"second",data:{blob:big(2000)}},
    {at:"t1",label:"first",data:{blob:big(2000)}},
  ]);
  assert.deepEqual(wrote.map(s=>s.at),readPreCloudSlots().map(s=>s.at));
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
