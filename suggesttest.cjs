/* Unit-test the remembered-transaction-name ranking AND the Repeat-chip
   templates without a browser.

   Slices rankNameSuggestions + recentTxTemplates out of index.html by name and
   runs them in a vm context, per CLAUDE.md — testing the shipped functions, not
   a copy of them. (Both live in the same slice: recentTxTemplates sits directly
   below rankNameSuggestions, above the UnaccountedSheet comment.)

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
const{rankNameSuggestions:rank,recentTxTemplates:templates}=ctx;
assert.ok(typeof templates==="function","recentTxTemplates not in the slice — did it move?");

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

/* ── recentTxTemplates — the Repeat chips ────────────────────────────────────

   The contract:
     • most recent first, deduped on name|catId (NOT name alone)
     • money coming IN (isExtraFunds) and money merely MOVED (isTransfer) are
       never offered — replaying either through the tracked form would record
       something that isn't spending as spending
     • tombstones never offered
     • a category the plan no longer has is filtered out, so a chip can never
       fill a catId the dropdown has no option for                            */
console.log("\nrecentTxTemplates\n");

const TX=[
  {id:"1",owner:"me",catId:"food",name:"Jollibee",amount:250,date:"2026-08-04",createdAt:"2026-08-04T10:00:00Z"},
  {id:"2",owner:"me",catId:"food",name:"Jollibee",amount:300,date:"2026-08-01",createdAt:"2026-08-01T10:00:00Z"},
  {id:"3",owner:"me",catId:"transport",name:"Grab",amount:120,date:"2026-08-03",createdAt:"2026-08-03T10:00:00Z"},
  {id:"4",owner:"wife",catId:"food",name:"SM Supermarket",amount:900,date:"2026-08-05",createdAt:"2026-08-05T10:00:00Z"},
];
const cats=["food","transport"];

t("most recent first, and a repeated name collapses to its LATEST amount",()=>{
  const out=templates(TX,"me",{catIds:cats});
  assert.deepEqual(out.map(x=>x.name),["Jollibee","Grab"]);
  assert.equal(out[0].amount,250);   // the 2026-08-04 one, not the older 300
  assert.equal(out[0].catId,"food");
});

t("scoped to the owner, with an absent owner reading as 'me'",()=>{
  assert.deepEqual(templates(TX,"wife",{catIds:cats}).map(x=>x.name),["SM Supermarket"]);
  const noOwner=[{id:"x",catId:"food",name:"Unlabelled",amount:10,date:"2026-08-06"}];
  assert.deepEqual(templates(noOwner,"me",{catIds:cats}).map(x=>x.name),["Unlabelled"]);
});

t("THE TRAP: isExtraFunds rows are money coming IN and are never offered",()=>{
  // CLAUDE.md: any new reduce over expenses must classify isExtraFunds
  // explicitly. Offering one here would let a tap log incoming money as spend.
  const rows=TX.concat([{id:"5",owner:"me",catId:"food",name:"Wife sent extra",
    amount:2000,date:"2026-08-06",isExtraFunds:true}]);
  const out=templates(rows,"me",{catIds:cats});
  assert.ok(!out.some(x=>x.name==="Wife sent extra"),"extra funds offered as a repeat");
});

t("isTransfer rows are never offered — their catId is a goal/installment id",()=>{
  const rows=TX.concat([
    {id:"6",owner:"me",catId:"goal-1",name:"House fund",amount:5000,date:"2026-08-06",isTransfer:true},
    {id:"7",owner:"me",catId:"inst-1",name:"Tabby payment",amount:400,date:"2026-08-06",isTransfer:true},
  ]);
  const out=templates(rows,"me",{catIds:cats.concat(["goal-1","inst-1"])});
  assert.deepEqual(out.map(x=>x.name),["Jollibee","Grab"]);
});

t("tombstoned rows are never offered",()=>{
  const rows=TX.concat([{id:"8",owner:"me",catId:"food",name:"Deleted lunch",
    amount:99,date:"2026-08-06",deletedAt:"2026-08-06T00:00:00Z"}]);
  assert.ok(!templates(rows,"me",{catIds:cats}).some(x=>x.name==="Deleted lunch"));
});

t("the same name under two categories is TWO repeats, not one",()=>{
  const rows=[
    {id:"a",owner:"me",catId:"transport",name:"Top-up",amount:100,date:"2026-08-05"},
    {id:"b",owner:"me",catId:"phone",name:"Top-up",amount:50,date:"2026-08-04"},
  ];
  const out=templates(rows,"me",{catIds:["transport","phone"]});
  assert.equal(out.length,2);
  assert.deepEqual(out.map(x=>x.catId),["transport","phone"]);
});

t("a category the plan no longer has is filtered out",()=>{
  // otherwise the chip fills a catId the select has no option for: it renders
  // blank and Save writes a dangling reference
  const out=templates(TX,"me",{catIds:["transport"]});
  assert.deepEqual(out.map(x=>x.name),["Grab"]);
});

t("no catIds given means no category filtering",()=>{
  assert.equal(templates(TX,"me").length,2);
  assert.equal(templates(TX,"me",{}).length,2);
});

t("catIds accepts a Set as well as an array",()=>{
  assert.deepEqual(templates(TX,"me",{catIds:new Set(["transport"])}).map(x=>x.name),["Grab"]);
});

t("rows with no name, no catId or no positive amount are unusable",()=>{
  const rows=[
    {id:"a",owner:"me",catId:"food",name:"",amount:10,date:"2026-08-05"},
    {id:"b",owner:"me",catId:"",name:"No cat",amount:10,date:"2026-08-05"},
    {id:"c",owner:"me",catId:"food",name:"Zero",amount:0,date:"2026-08-05"},
    {id:"d",owner:"me",catId:"food",name:"Negative",amount:-5,date:"2026-08-05"},
    {id:"e",owner:"me",catId:"food",name:"Fine",amount:5,date:"2026-08-05"},
  ];
  assert.deepEqual(templates(rows,"me",{catIds:cats}).map(x=>x.name),["Fine"]);
});

t("same-day rows fall back to createdAt, newest entry first",()=>{
  const rows=[
    {id:"a",owner:"me",catId:"food",name:"Earlier",amount:10,date:"2026-08-05",createdAt:"2026-08-05T08:00:00Z"},
    {id:"b",owner:"me",catId:"food",name:"Later",amount:20,date:"2026-08-05",createdAt:"2026-08-05T20:00:00Z"},
  ];
  assert.deepEqual(templates(rows,"me",{catIds:cats}).map(x=>x.name),["Later","Earlier"]);
});

t("`ord` is ignored — it is a display preference, not recency",()=>{
  const rows=[
    {id:"a",owner:"me",catId:"food",name:"Pinned to bottom",amount:10,date:"2026-08-05",createdAt:"2026-08-05T20:00:00Z",ord:99},
    {id:"b",owner:"me",catId:"food",name:"Pinned to top",amount:20,date:"2026-08-05",createdAt:"2026-08-05T08:00:00Z",ord:0},
  ];
  assert.deepEqual(templates(rows,"me",{catIds:cats}).map(x=>x.name),["Pinned to bottom","Pinned to top"]);
});

t("respects the limit, defaulting to 8",()=>{
  const many=Array.from({length:20},(_,i)=>({id:"m"+i,owner:"me",catId:"food",
    name:"Item "+i,amount:i+1,date:"2026-08-"+String(20-i).padStart(2,"0")}));
  assert.equal(templates(many,"me",{catIds:cats}).length,8);
  assert.equal(templates(many,"me",{catIds:cats,limit:3}).length,3);
});

t("tolerates a missing or empty expense list",()=>{
  assert.deepEqual(templates(undefined,"me"),[]);
  assert.deepEqual(templates([],"me"),[]);
  assert.deepEqual(templates([null,undefined],"me"),[]);
});

t("is pure — does not reorder or mutate the input array",()=>{
  const before=TX.map(x=>x.id);
  templates(TX,"me",{catIds:cats});
  assert.deepEqual(TX.map(x=>x.id),before);
});

console.log("\n"+(fails?fails+"/"+n+" FAILED":n+"/"+n+" passed")+"\n");
process.exit(fails?1:0);
