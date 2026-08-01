/* Unit-test the remembered-transaction-name ranking without a browser.

   Slices rankNameSuggestions out of index.html by name and runs it in a vm
   context, per CLAUDE.md — testing the shipped function, not a copy of it.

   The contract being tested:
     • it FILTERS as you type — the old chip row was gated on an empty input
       and vanished on the first keystroke, which is the bug this replaced
     • substring match, so "amazon" still finds "Buy Amazon gift card"
     • but a PREFIX match outranks a mid-string one, so typing "amazon" puts
       "Amazon" and "Amazon Now" above "Buy Amazon gift card"
     • ties keep the caller's order, which is already most-recent-first
     • case-insensitive both ways, and capped

   Gotcha: assert.deepStrictEqual compares prototypes and therefore fails
   across vm realms. Use deepEqual for anything built inside the vm. */
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

const src=slice("function rankNameSuggestions(names,query,limit=6){",
                "/* Explains the \"unaccounted\" figure");
const ctx={};
vm.createContext(ctx);
vm.runInContext(src,ctx);
const{rankNameSuggestions:rank}=ctx;

/* recency order, as recentNames would hand it over */
const NAMES=["Amazon Now","Grab","Amazon","Buy Amazon gift card","Jollibee","SM Supermarket","Shell","Amazon Prime"];

console.log("\nrankNameSuggestions\n");

t("empty query returns the head of the list, unreordered",()=>{
  assert.deepEqual(rank(NAMES,"",4),["Amazon Now","Grab","Amazon","Buy Amazon gift card"]);
});

t("a whitespace-only query counts as empty",()=>{
  assert.deepEqual(rank(NAMES,"   ",2),["Amazon Now","Grab"]);
});

t("typing 'amazon' returns BOTH Amazon and Amazon Now — the two-word case",()=>{
  const out=rank(NAMES,"amazon");
  assert.ok(out.includes("Amazon"),"missing Amazon");
  assert.ok(out.includes("Amazon Now"),"missing Amazon Now");
});

t("prefix matches rank above mid-string ones",()=>{
  const out=rank(NAMES,"amazon");
  // three prefix hits, in their original recency order, then the mid-string one
  assert.deepEqual(out,["Amazon Now","Amazon","Amazon Prime","Buy Amazon gift card"]);
});

t("ties keep caller order, i.e. recency",()=>{
  // "Amazon Now" precedes "Amazon" in NAMES and both are prefix hits
  const out=rank(NAMES,"ama");
  assert.equal(out[0],"Amazon Now");
  assert.equal(out[1],"Amazon");
});

t("match is case-insensitive in both directions",()=>{
  assert.deepEqual(rank(["Jollibee"],"JOLLI"),["Jollibee"]);
  assert.deepEqual(rank(["JOLLIBEE"],"jolli"),["JOLLIBEE"]);
});

t("a partial word still narrows rather than clearing the list",()=>{
  // the whole point: one keystroke must not empty the suggestions
  assert.ok(rank(NAMES,"a").length>0);
  assert.ok(rank(NAMES,"sh").length>0);
});

t("no match returns empty, not the unfiltered list",()=>{
  assert.deepEqual(rank(NAMES,"zzzz"),[]);
});

t("respects the limit, defaulting to 6",()=>{
  assert.equal(rank(NAMES,"").length,6);
  assert.equal(rank(NAMES,"",2).length,2);
  const many=Array.from({length:20},(_,i)=>"Amazon "+i);
  assert.equal(rank(many,"amazon").length,6);
});

t("tolerates a missing or empty candidate list",()=>{
  assert.deepEqual(rank(undefined,"amazon"),[]);
  assert.deepEqual(rank([],"amazon"),[]);
  assert.deepEqual(rank(undefined,""),[]);
});

t("is pure — does not reorder or mutate the input array",()=>{
  const before=NAMES.slice();
  rank(NAMES,"amazon");
  assert.deepEqual(NAMES,before);
});

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
