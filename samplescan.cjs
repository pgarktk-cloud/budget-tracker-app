/* samplescan.cjs — find sample/demo records inside a real backup, and remove
   exactly the ones you confirm.
   Run:  node samplescan.cjs <backup.json>                    # report only
         node samplescan.cjs <backup.json> --remove <ids...>  # write a cleaned copy

   WHY THIS IS NOT A ONE-LINER
   ---------------------------
   defaultData()'s demo records were authored from this user's own financial
   life: "Charlene", "Tuition Fee Wife", "Braces", "Postpaid Bill" and
   "Toyota Raize" are real budget categories, and Toyota Raize is also a real
   asset. Matching on NAME would delete genuine records. So nothing here
   matches on name alone.

   Three signals, scored, never summed into an automatic verdict:
     value   — the record matches sampleData()'s exact literals (AAPL 10 @180,
               BDO 150000, Emergency Fund target 60000 with an 18500 opening
               contribution, and so on). Read straight out of index.html, so it
               cannot drift from what the app actually seeds.
     cohort  — sample records all carry the SAME date: the day the fresh device
               generated them. A cluster of otherwise-unrelated records sharing
               one date, none of which existed before it, is the strongest
               signal available and the one that survives a name collision.
     absent  — the record is missing from an OLDER backup supplied via
               --before, i.e. it demonstrably appeared after that point.

   It NEVER deletes on its own. --remove takes explicit ids, and writes to a new
   file; the original is not touched. Import the cleaned file through the app's
   own Import (which previews via validateBackup and stashes a pre-import safety
   copy) rather than pushing it anywhere directly. */
const fs=require("fs"),vm=require("vm"),path=require("path"),assert=require("assert");

const args=process.argv.slice(2);
const file=args[0];
if(!file||file.startsWith("--")){
  console.error("usage: node samplescan.cjs <backup.json> [--before <older.json>] [--remove <id> ...]");
  process.exit(2);
}
const beforeIdx=args.indexOf("--before");
const removeIdx=args.indexOf("--remove");
const beforeFile=beforeIdx>=0?args[beforeIdx+1]:null;
const removeIds=removeIdx>=0
  ?args.slice(removeIdx+1).filter(a=>!a.startsWith("--"))
  :[];

const readJson=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const doc=readJson(file);
const before=beforeFile?readJson(beforeFile):null;

/* ── the sample signature, taken from the app itself ─────────────────────── */
const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8").replace(/\r\n/g,"\n");
const a=html.indexOf("function structuralDefaults(){");
const b=html.indexOf("/* Bills Reserve = opening baseline");
assert.ok(a>=0&&b>a,"could not slice the seed data out of index.html — did it move?");
const ctx={console};
vm.createContext(ctx);
vm.runInContext(`
function uid(){return "sampleid";}
var SEG=["#2C5FA8","#6FA0D6","#1B3E73","#2E8BB0","#4C6E9C","#8FB4DD","#173B5E","#5BA7C2"];
var monthLabel=function(){return "";};
var P={gr:"#2f9e6d",br:"#8a6a3d",amber:"#c98a12"};
`+html.slice(a,b)+`
this.sampleData=sampleData; this.structuralDefaults=structuralDefaults;`,ctx);
const SAMPLE=ctx.sampleData(ctx.structuralDefaults());

const num=v=>Number(v)||0;
const live=arr=>(Array.isArray(arr)?arr:[]).filter(x=>x&&!x.deletedAt);

/* Value fingerprints — deliberately EXCLUDE the name, so that a real record
   which merely shares a name with a seeded one is not implicated, and a sample
   record whose name was later edited is still caught. */
const sig={
  investments:i=>{
    const t=(i.trades||[])[0]||{};
    return `${i.ticker}|${i.broker}|${(i.trades||[]).length}|${num(t.shares)}|${num(t.price)}`;
  },
  banks:x=>`${x.bank}|${x.country}|${x.currency}|${num(x.balance)}`,
  assets:x=>`${x.kind}|${x.currency}|${num(x.value)}|${num(x.monthly)}|${num(x.monthsRemaining)}`,
  goals:g=>`${g.type}|${num(g.target)}|${num(g.monthly)}|${(g.contributions||[]).map(c=>num(c.amount)).join(",")}`,
};
const sampleSigs={};
for(const k of Object.keys(sig))sampleSigs[k]=new Set(live(SAMPLE[k]).map(sig[k]));

/* Dates a record carries, for cohort detection. */
const datesOf=(k,r)=>{
  if(k==="investments")return (r.trades||[]).map(t=>t.date).filter(Boolean);
  if(k==="goals")return (r.contributions||[]).map(c=>c.date).filter(Boolean);
  if(k==="banks")return [r.balanceAsOf].filter(Boolean);
  if(k==="assets")return [r.asOfDate].filter(Boolean);
  return [];
};

const beforeIds=new Set();
if(before)for(const k of Object.keys(sig))live(before[k]).forEach(r=>beforeIds.add(r.id));

/* ── scan ─────────────────────────────────────────────────────────────────── */
const findings=[];
const dateTally={};
for(const k of Object.keys(sig)){
  for(const r of live(doc[k])){
    const reasons=[];
    if(sampleSigs[k].has(sig[k](r)))reasons.push("value matches sampleData() exactly");
    if(before&&!beforeIds.has(r.id))reasons.push("absent from the older backup");
    const ds=datesOf(k,r);
    ds.forEach(d=>{dateTally[d]=(dateTally[d]||0)+1;});
    if(reasons.length)findings.push({collection:k,id:r.id,name:r.name||r.ticker||"(unnamed)",dates:ds,reasons});
  }
}
/* A cohort date is one shared by implicated records across MORE THAN ONE
   collection — a real day of activity rarely creates a bank, an asset, a goal
   and three investments at once, but a sample load always does. */
const cohortDates=new Set();
{
  const byDate={};
  findings.forEach(f=>f.dates.forEach(d=>{(byDate[d]=byDate[d]||new Set()).add(f.collection);}));
  Object.entries(byDate).forEach(([d,cols])=>{if(cols.size>=3)cohortDates.add(d);});
}
findings.forEach(f=>{
  if(f.dates.some(d=>cohortDates.has(d)))f.reasons.push(`shares the ${f.dates.find(d=>cohortDates.has(d))} cohort`);
});

/* ── report ───────────────────────────────────────────────────────────────── */
if(!removeIds.length){
  const counts=k=>live(doc[k]).length;
  console.log(`\nScanned ${path.basename(file)}`);
  console.log(`  investments ${counts("investments")} · banks ${counts("banks")} · assets ${counts("assets")} · goals ${counts("goals")}`);
  if(before)console.log(`  compared against ${path.basename(beforeFile)}`);
  if(cohortDates.size)console.log(`  cohort date(s) detected: ${[...cohortDates].join(", ")}`);
  if(!findings.length){
    console.log("\n  Nothing matches the sample signature. This document looks clean.\n");
    process.exit(0);
  }
  console.log(`\n${findings.length} record(s) implicated — NOTHING has been changed:\n`);
  const strong=[],weak=[];
  findings.forEach(f=>(f.reasons.length>=2?strong:weak).push(f));
  const show=(title,list)=>{
    if(!list.length)return;
    console.log(`  ${title}`);
    list.forEach(f=>{
      console.log(`    ${f.id}  [${f.collection}] ${f.name}`);
      console.log(`        ${f.reasons.join("; ")}`);
    });
    console.log("");
  };
  show("STRONG (more than one independent signal):",strong);
  show("WEAK (one signal only — check these by hand):",weak);
  console.log("  Review the list, then remove only the ids you are sure about:");
  console.log(`    node samplescan.cjs ${path.basename(file)} --remove ${strong.map(f=>f.id).join(" ")||"<id>"}`);
  console.log("  Then Import the cleaned file through the app, so it previews the");
  console.log("  change and keeps a safety copy.\n");
  process.exit(0);
}

/* ── removal: soft-delete exactly the ids given, nothing else ─────────────── */
const wanted=new Set(removeIds);
const stamp=new Date().toISOString();
const removed=[];
for(const k of Object.keys(sig)){
  if(!Array.isArray(doc[k]))continue;
  doc[k].forEach(r=>{
    if(r&&wanted.has(r.id)&&!r.deletedAt){
      // Soft-delete, matching the app's own convention, so this is undoable
      // from Recently Deleted rather than being a hard removal.
      r.deletedAt=stamp;
      removed.push(`${k}: ${r.name||r.ticker||r.id}`);
    }
  });
}
const out=file.replace(/\.json$/i,"")+".cleaned.json";
fs.writeFileSync(out,JSON.stringify(doc,null,2));
console.log(`\nTombstoned ${removed.length} record(s):`);
removed.forEach(r=>console.log("  - "+r));
if(removed.length!==wanted.size)
  console.log(`\n  NOTE: ${wanted.size-removed.length} id(s) were not found or were already deleted.`);
console.log(`\nWrote ${path.basename(out)}. The original is untouched.`);
console.log("Import the cleaned file through the app (Settings -> Import), which");
console.log("previews it and keeps a pre-import safety copy.\n");
