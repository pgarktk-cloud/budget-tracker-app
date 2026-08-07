/* Sandbox server: serves a copy of the app AND stands in for the Cloudflare
   Worker, so the cloud-document gate (cloudDocProblem, v1.23.0) can be driven
   for real instead of reasoned about.

   This is the ONLY way to reach the rejection branches without corrupting the
   live document — the same role the "point PROXY_URL at an unreachable host"
   recipe plays for the thrown-fetch branch. Committed because it is otherwise
   exactly the kind of in-session harness that gets lost (see CLAUDE.md on
   baltest.cjs).

   USAGE
     1. mkdir sandbox && copy index.html + manifest + icons into it
     2. in that copy, point PROXY_URL at http://localhost:8811 and disable the
        service-worker registration (it caches the shell and confuses reloads)
     3. echo good > mode.txt        # or: corrupt | empty
     4. node sandboxworker.cjs      # http://localhost:8811
     5. in the page: localStorage.setItem("allocation:syncToken","anything")
        — the fake Worker never checks it, it just has to be non-empty so
        KVSync._ready() passes — then reload

   Serve it on a fresh port: an old localhost origin keeps its own localStorage
   and may still hold a real dataset from a past session (see CLAUDE.md).

   MODE is re-read from mode.txt on every request, so the served document can be
   switched between good and corrupt mid-session — which is how the self-heal
   path (rejected → readable → app reveals) gets exercised.

   AI MODES (Build B) — aimode.txt, re-read per request, same idea:
     ok        a valid narration                            (default)
     invented  prose quoting SAR 9,999, which is NOT in the context — proves
               validatePurchaseNarration rejects rather than renders
     badref    prose that is mostly unknown {{refN}} tokens
     badscope  a note for a scenario that was never sent
     long      a headline past the 160-char cap
     malformed 200 with a body that is not the agreed shape
     limit     429 {error:"limit",scope:"day"}
     slow      a 25s hang, past the app's patience and the Worker's 20s abort
     500       an upstream failure
   The real Worker's own guards (size cap, allowlist, spend caps) are unit-
   tested in aitest.cjs; what can ONLY be tested here is what the app DOES with
   each answer — and, critically, that asking for one causes no POST to /sync. */
const http=require("http"),fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"sandbox");
const MODE_FILE=path.join(__dirname,"mode.txt");
const TYPES={".html":"text/html",".js":"text/javascript",".png":"image/png",".webmanifest":"application/manifest+json",".json":"application/json"};

const GOOD={
  plans:[{id:"p1",name:"Base plan",categories:[{id:"c1",name:"Groceries",amount:1200,groupId:"g1",ord:0}],groups:[{id:"g1",name:"Essentials",ord:0}]}],
  expenses:[{id:"e1",catId:"c1",name:"Market run",amount:340,date:"2026-08-03",owner:"me"}],
  owners:{me:"Jastine",wife:"Charlene"},currency:"SAR",
  household:{splitMine:50,expenses:[]},
};
// Broken in the exact way the old one-line check could not see: plans is an
// array (so `Array.isArray(remote.plans)` passes) but banks is a string and a
// transaction has no usable amount.
const CORRUPT={...GOOD,banks:"oops",expenses:[...GOOD.expenses,{id:"e2",catId:"c1",name:"Torn row",amount:null,date:"2026-08-04"}]};
const mode=()=>{try{return fs.readFileSync(MODE_FILE,"utf8").trim();}catch(e){return "good";}};
const docFor=m=>m==="corrupt"?CORRUPT:m==="empty"?null:GOOD;

const AI_MODE_FILE=path.join(__dirname,"aimode.txt");
const aimode=()=>{try{return fs.readFileSync(AI_MODE_FILE,"utf8").trim();}catch(e){return "ok";}};

/* Built from the context the app actually sent, so "ok" quotes real figures
   and passes validation while "invented" differs by exactly one number. That
   contrast is the point: both are well-formed JSON, and only the app-side
   check can tell them apart. */
function fakeNarration(kind,ctx){
  const c=ctx||{};
  const cur=c.currency||"SAR";
  const money=n=>`${cur} ${Number(n||0).toLocaleString("en-US")}`;
  const ids=Object.keys(c.scenarios||{});
  const first=ids[0]||"cash";
  const real=money((c.scenarios&&c.scenarios.cash&&c.scenarios.cash.remainingAfter)||c.available||0);
  if(kind==="invented")return{headline:`You would still hold ${cur} 9,999 afterwards.`,
    recommended:first,scenarioNotes:[{id:first,text:`Leaves ${cur} 9,999.`}],watchOuts:[]};
  if(kind==="badref")return{headline:"Trim your spending.",recommended:first,
    scenarioNotes:[{id:first,text:"Cut {{ref91}} and {{ref92}} and {{ref93}}."}],watchOuts:[]};
  if(kind==="badscope")return{headline:"Consider leasing.",recommended:first,
    scenarioNotes:[{id:"lease",text:"Leasing is cheaper."}],watchOuts:[]};
  if(kind==="long")return{headline:"x".repeat(200),recommended:first,scenarioNotes:[],watchOuts:[]};
  return{headline:`Affordable — ${real} would still be available.`,
    recommended:first,
    scenarioNotes:ids.slice(0,3).map(id=>({id,text:`This option leaves ${real} in reach.`})),
    watchOuts:[(c.trimCandidates||[])[0]
      ? `Trimming {{${c.trimCandidates[0].ref}}} would widen the gap.`
      : "Keep an eye on the leanest period."]};
}

const cors=res=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,X-Sync-Token,X-Device-Id");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
};

http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  cors(res);
  if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}

  if(url.pathname==="/sync"||url.pathname==="/sync/meta"){
    const m=mode();
    console.log(`[worker] ${req.method} ${url.pathname} mode=${m}`);
    res.setHeader("Content-Type","application/json");
    if(url.pathname==="/sync/meta"){
      res.writeHead(200);return res.end(JSON.stringify({savedAt:"2026-08-05T10:00:00.000Z",rev:7,lastWriter:"Test phone (aaaa1111)"}));
    }
    if(req.method==="POST"){
      // always answer a POST with a stale-rev conflict carrying the current
      // document — that is the second pull path under test
      res.writeHead(200);
      return res.end(JSON.stringify({ok:false,conflict:true,rev:7,savedAt:"2026-08-05T10:00:00.000Z",data:docFor(m),lastWriter:"Test phone (aaaa1111)"}));
    }
    res.writeHead(200);
    return res.end(JSON.stringify({data:docFor(m),savedAt:"2026-08-05T10:00:00.000Z",rev:7,lastWriter:"Test phone (aaaa1111)"}));
  }

  if(url.pathname==="/ai/advice"){
    const k=aimode();
    let raw="";
    req.on("data",d=>{raw+=d;});
    req.on("end",()=>{
      let ctx=null;
      try{ctx=(JSON.parse(raw)||{}).context||null;}catch(e){}
      /* Logged so a run can be inspected for leaks by eye as well as by the
         unit test — this is a local harness, not the real Worker, which logs
         nothing. Watch this line for any name, id or date. */
      console.log(`[ai] mode=${k} bytes=${raw.length} ctx=${JSON.stringify(ctx).slice(0,400)}`);
      /* The full body, unabridged, so a leak scan reads what was actually sent
         rather than a truncated log line. */
      try{fs.writeFileSync(path.join(__dirname,"lastaictx.json"),raw);}catch(e){}
      res.setHeader("Content-Type","application/json");
      if(k==="limit"){res.writeHead(429);return res.end(JSON.stringify({error:"limit",scope:"day"}));}
      if(k==="500"){res.writeHead(502);return res.end(JSON.stringify({error:"upstream"}));}
      if(k==="malformed"){res.writeHead(200);return res.end(JSON.stringify({narration:{nope:true}}));}
      const send=()=>{res.writeHead(200);
        res.end(JSON.stringify({narration:fakeNarration(k,ctx),remaining:{day:59,month:599}}));};
      /* Comfortably past BOTH the Worker's 20s abort and the app's own 25s
         client timeout, so "slow" tests the client giving up rather than
         racing it. A hang equal to the client timeout is a coin flip. */
      if(k==="slow")return setTimeout(send,40000);
      send();
    });
    return;
  }

  let f=path.join(ROOT,url.pathname==="/"?"index.html":url.pathname.slice(1));
  fs.readFile(f,(err,buf)=>{
    if(err){res.writeHead(404);return res.end("not found");}
    res.setHeader("Content-Type",TYPES[path.extname(f)]||"application/octet-stream");
    res.setHeader("Cache-Control","no-store");
    res.writeHead(200);res.end(buf);
  });
}).listen(8811,()=>console.log("sandbox+worker on http://localhost:8811"));
