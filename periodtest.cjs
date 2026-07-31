/* Unit-test the pay-period date core without a browser.

   Slices the real helpers out of index.html by name and runs them in a vm
   context, per CLAUDE.md — testing the shipped code, not a reimplementation.

   What's under test (see docs/decisions.md, "A period's identity is its
   payday, its boundaries are what actually happened"):
     • with no overrides, behaviour is byte-identical to payday-only bucketing
     • a period's KEY is always nominal — corrections move boundaries, never
       identity, or every expense pointing at a period would be orphaned
     • an early start pulls expenses in that window into the new period and
       shortens the previous one
     • periodRange never reads the clock — a period's extent is a pure function
       of (key,cfg), so labels and bucketing don't move at midnight
     • periods are never pro-rated — length reflects reality, amounts don't

   Two vm traps: assert.deepStrictEqual compares prototypes and fails across
   realms (use deepEqual), and top-level `const` bindings don't attach to the
   context — only function declarations do, so constants are handed over
   explicitly below. */
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

const src=slice("/* Last valid calendar day of a given year/month (month is 1-12) */",
                "/* ── Unified period helpers");
const ctx={};
vm.createContext(ctx);
vm.runInContext(src+"\nthis.keyToDate=keyToDate;this.dateToKey=dateToKey;",ctx);
const{periodKeyFor,periodRange,periodLength,periodLabel,shiftPeriod,periodActualStart,
      periodStartValidity,withActualStart,todayISO,nominalKeyFor,dateToKey}=ctx;

const key=d=>dateToKey(d);
const plain={payday:28};                       // no overrides
const withStarts=starts=>({payday:28,actualStarts:starts});
const TODAY=todayISO();
const shiftDays=(str,n)=>{const d=new Date(str+"T00:00:00");d.setDate(d.getDate()+n);return dateToKey(d);};

console.log("pay-period date core");

/* ── no overrides: nothing may change ─────────────────────────────────── */

t("with no overrides, keys are pure payday arithmetic",()=>{
  assert.strictEqual(periodKeyFor("2026-08-28",plain),"2026-08-28");
  assert.strictEqual(periodKeyFor("2026-09-27",plain),"2026-08-28");
  assert.strictEqual(periodKeyFor("2026-08-27",plain),"2026-07-28");
});

t("with no overrides, a period runs payday to payday-minus-one",()=>{
  const{start,end}=periodRange("2026-08-28",plain);
  assert.strictEqual(key(start),"2026-08-28");
  assert.strictEqual(key(end),"2026-09-27");
  assert.strictEqual(periodLength("2026-08-28",plain),31);
});

t("a payday past the end of a short month still clamps",()=>{
  // payday 31 in February becomes that February's last real day
  assert.strictEqual(periodKeyFor("2026-02-15",{payday:31}),"2026-01-31");
  assert.strictEqual(key(periodRange("2026-01-31",{payday:31}).end),"2026-02-27");
});

t("an empty actualStarts map behaves exactly like none at all",()=>{
  assert.strictEqual(periodKeyFor("2026-08-28",withStarts({})),"2026-08-28");
  assert.strictEqual(periodLength("2026-08-28",withStarts({})),31);
});

t("a bare payday number still works (defensive, for stray callers)",()=>{
  assert.strictEqual(periodKeyFor("2026-08-28",28),"2026-08-28");
  assert.strictEqual(periodLength("2026-08-28",28),31);
});

/* ── identity never moves ─────────────────────────────────────────────── */

t("shiftPeriod is nominal and ignores overrides entirely",()=>{
  // the period after 2026-08-28 is 2026-09-28 however early it began
  const cfg=withStarts({"2026-08-28":"2026-08-24","2026-09-28":"2026-09-25"});
  assert.strictEqual(shiftPeriod("2026-08-28",cfg,1),"2026-09-28");
  assert.strictEqual(shiftPeriod("2026-08-28",cfg,-1),"2026-07-28");
  assert.strictEqual(shiftPeriod("2026-08-28",plain,1),"2026-09-28");
});

t("shiftPeriod crosses year boundaries in both directions",()=>{
  assert.strictEqual(shiftPeriod("2026-12-28",plain,1),"2027-01-28");
  assert.strictEqual(shiftPeriod("2026-01-28",plain,-1),"2025-12-28");
  assert.strictEqual(shiftPeriod("2026-01-28",plain,-13),"2024-12-28");
  assert.strictEqual(shiftPeriod("2026-01-28",plain,14),"2027-03-28");
});

t("a corrected period keeps its key, so expenses can't be orphaned",()=>{
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  // every day of the period, early days included, reports the SAME key
  ["2026-08-24","2026-08-27","2026-08-28","2026-09-15","2026-09-27"]
    .forEach(d=>assert.strictEqual(periodKeyFor(d,cfg),"2026-08-28",d));
});

/* ── salary arrived early ─────────────────────────────────────────────── */

t("an early start pulls that window's dates into the new period",()=>{
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  // Aug 24-27 nominally belong to July's period; they now belong to August's
  assert.strictEqual(periodKeyFor("2026-08-23",cfg),"2026-07-28");
  assert.strictEqual(periodKeyFor("2026-08-24",cfg),"2026-08-28");
  assert.strictEqual(periodKeyFor("2026-08-27",cfg),"2026-08-28");
});

t("an early start shortens the previous period and lengthens the new one",()=>{
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  assert.strictEqual(key(periodRange("2026-07-28",cfg).end),"2026-08-23");
  assert.strictEqual(periodLength("2026-07-28",cfg),27);   // was 31
  assert.strictEqual(key(periodRange("2026-08-28",cfg).start),"2026-08-24");
  assert.strictEqual(periodLength("2026-08-28",cfg),35);   // was 31
});

t("periods stay contiguous — no gap, no overlap at a moved boundary",()=>{
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  const prevEnd=periodRange("2026-07-28",cfg).end;
  const thisStart=periodRange("2026-08-28",cfg).start;
  assert.strictEqual(Math.round((thisStart-prevEnd)/86400000),1);
});

t("a late start pushes the boundary forward the same way",()=>{
  const cfg=withStarts({"2026-08-28":"2026-09-02"});
  assert.strictEqual(periodKeyFor("2026-09-01",cfg),"2026-07-28");
  assert.strictEqual(periodKeyFor("2026-09-02",cfg),"2026-08-28");
  assert.strictEqual(periodLength("2026-07-28",cfg),36);
});

t("the label reports the real boundaries, so history reads true",()=>{
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  assert.ok(/Aug 24/.test(periodLabel("2026-08-28",cfg)),periodLabel("2026-08-28",cfg));
  assert.ok(/Jul 28/.test(periodLabel("2026-07-28",cfg)));
  assert.ok(/Aug 23/.test(periodLabel("2026-07-28",cfg)));
});

t("a short period is NOT pro-rated — only its length changes",()=>{
  // the whole point: a 27-day period keeps its full monthly amounts, so the
  // daily allowance rises rather than Home reading it as overspending
  const cfg=withStarts({"2026-08-28":"2026-08-24"});
  assert.strictEqual(periodLength("2026-07-28",cfg),27);
  assert.strictEqual(periodLength("2026-07-28",plain),31);
  // nothing in this layer touches amounts at all
  assert.strictEqual(typeof periodRange("2026-07-28",cfg).start.getTime(),"number");
});

/* ── a period's extent never depends on "now" ─────────────────────────── */

t("periodRange is independent of today",()=>{
  // The "pending" sentinel used to make a period end today and grow nightly.
  // With it gone, a period three periods out is pure payday arithmetic — which
  // is what lets the history/snapshot effects be idempotent across midnight.
  const future=shiftPeriod(nominalKeyFor(TODAY,plain),plain,3);
  const{start,end}=periodRange(future,plain);
  assert.strictEqual(key(start),future);
  assert.strictEqual(key(end),shiftDays(shiftPeriod(future,plain,1),-1));
});

t("a period always reports a real start date",()=>{
  // periodActualStart used to return null for a pending period; every caller
  // had to defend against it. It is now always a YYYY-MM-DD string.
  assert.strictEqual(periodActualStart("2026-08-28",plain),"2026-08-28");
  assert.strictEqual(periodActualStart("2026-08-28",withStarts({"2026-08-28":"2026-08-24"})),"2026-08-24");
});

t("a non-date override is stored verbatim — sanitising is migrate()'s job",()=>{
  // withActualStart is a dumb setter by design; migrate() sweeps actualStarts
  // and deletes anything that isn't a date, which is what retires the old
  // "pending" values. This layer must not silently reinterpret one.
  const cfg=withStarts({"2026-08-28":"pending"});
  assert.strictEqual(periodActualStart("2026-08-28",cfg),"2026-08-28");
  assert.strictEqual(periodLength("2026-08-28",cfg),31);
});

/* ── clearing an override ─────────────────────────────────────────────── */

t("withActualStart sets, then clears back to nominal",()=>{
  const pp={me:{payday:28,actualStarts:{}}};
  const set=withActualStart(pp,"me","2026-08-28","2026-08-24");
  assert.strictEqual(set.me.actualStarts["2026-08-28"],"2026-08-24");
  assert.strictEqual(periodKeyFor("2026-08-25",set.me),"2026-08-28");
  const cleared=withActualStart(set,"me","2026-08-28",null);
  // the key is REMOVED, not written back as the nominal date, so "untouched"
  // and "corrected back to payday" can never drift apart
  assert.ok(!("2026-08-28" in cleared.me.actualStarts));
  assert.strictEqual(periodKeyFor("2026-08-25",cleared.me),"2026-07-28");
});

t("withActualStart doesn't mutate the object it was given",()=>{
  const pp={me:{payday:28,actualStarts:{}},wife:{payday:1,actualStarts:{}}};
  const out=withActualStart(pp,"me","2026-08-28","2026-08-24");
  assert.strictEqual(Object.keys(pp.me.actualStarts).length,0);
  assert.notStrictEqual(out,pp);
  assert.strictEqual(out.wife,pp.wife);   // the other owner is untouched
});

/* ── validation ───────────────────────────────────────────────────────── */

t("a start in the future is rejected",()=>{
  const nominal=nominalKeyFor(TODAY,plain);
  const v=periodStartValidity(nominal,plain,shiftDays(TODAY,1));
  assert.strictEqual(v.ok,false);
  assert.ok(/future/i.test(v.why));
});

t("a start before the previous period is rejected",()=>{
  // it would swallow that period whole and orphan its expenses
  const cfg=plain;
  const v=periodStartValidity("2026-08-28",cfg,"2026-07-28");
  assert.strictEqual(v.ok,false);
  assert.ok(/previous period/i.test(v.why));
  // one day into the previous period is the floor, and is allowed
  assert.strictEqual(periodStartValidity("2026-08-28",cfg,"2026-07-29").ok,true);
});

t("a malformed date is rejected rather than parsed into nonsense",()=>{
  assert.strictEqual(periodStartValidity("2026-08-28",plain,"").ok,false);
  assert.strictEqual(periodStartValidity("2026-08-28",plain,"nope").ok,false);
  assert.strictEqual(periodStartValidity("2026-08-28",plain,null).ok,false);
});

t("today is always a legal start",()=>{
  const nominal=nominalKeyFor(TODAY,plain);
  assert.strictEqual(periodStartValidity(nominal,plain,TODAY).ok,true);
});

/* ── malformed keys still can't produce Invalid Date ──────────────────── */

t("a stale calendar-month key falls back to today's period",()=>{
  // the old "Invalid Date budget header" bug — a YYYY-MM key arriving for one
  // render while pay-periods finish turning on
  const r=periodRange("2026-08",plain);
  assert.ok(!isNaN(r.start.getTime())&&!isNaN(r.end.getTime()));
  assert.strictEqual(key(r.start),nominalKeyFor(TODAY,plain));
  assert.ok(!isNaN(periodLength("2026-08",plain)));
  assert.strictEqual(shiftPeriod("",plain,1),shiftPeriod(nominalKeyFor(TODAY,plain),plain,1));
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
