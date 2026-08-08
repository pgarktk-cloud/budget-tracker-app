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

*/
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

  let f=path.join(ROOT,url.pathname==="/"?"index.html":url.pathname.slice(1));
  fs.readFile(f,(err,buf)=>{
    if(err){res.writeHead(404);return res.end("not found");}
    res.setHeader("Content-Type",TYPES[path.extname(f)]||"application/octet-stream");
    res.setHeader("Cache-Control","no-store");
    res.writeHead(200);res.end(buf);
  });
}).listen(8811,()=>console.log("sandbox+worker on http://localhost:8811"));
