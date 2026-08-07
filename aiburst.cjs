/* aiburst.cjs — verify /ai/advice's guards and spend caps against the DEPLOYED
   Worker, before any app build calls it.
   Run:  node aiburst.cjs [--url https://...] [--calls 7]

   It asks for the sync passphrase on stdin and echoes nothing. The passphrase
   is NEVER a command-line argument, never written to a file, and never logged:
   an argument lands in shell history and in any transcript of the session,
   which is exactly how the first attempt at setting GEMINI_API_KEY exposed it.

   TOOLING, NOT A RUNNER. It makes real, paid Gemini calls — about $0.001 each
   at gemini-3.5-flash-lite's $0.30/$2.50 per 1M — so it must never join the
   "run all of them" sweep. A default 7-call run costs well under a cent and
   consumes 5 of the day's 60.

   WHAT IT PROVES, in order of how cheap the rejection is:
     1. an unauthenticated call is refused                         401
     2. an over-large body is refused BEFORE the paid call         413
     3. a body carrying document-shaped keys is refused            400
     4. the per-device minute cap bites at the 6th call in a minute 429 minute
   Anything that reaches Gemini returns a narration; the app validates it
   again on arrival, so a 200 here is transport success, not trust. */
const https=require("https"),readline=require("readline");

const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const URL_BASE=arg("--url","https://alloc-kv.jastinefodra21.workers.dev");
const CALLS=Number(arg("--calls",7));
const MINUTE_CAP=5;   // must match AI_LIMIT_MINUTE in worker.js

/* A context shaped exactly like buildPurchaseAiContext's output — every key on
   the Worker's allowlist, no name, id or date anywhere. */
const CTX={
  currency:"SAR",product:"Cap verification",price:1000,available:5000,
  periodAllocation:1000,horizonBuckets:24,historyWarning:false,
  stack:{banks:5000,joint:0,withheld:0,protectedGoals:0,protectedGoalCount:0,
    unlinkedProtectedCount:0,notCountedGoals:0,reservedCount:0,
    inaccessibleCount:0,unconverted:0,available:5000},
  scenarios:{cash:{feasible:true,remainingAfter:4000,verdict:"good"}},
  horizon:[{n:0,income:5000,planned:4000,installmentTotal:0,headroom:1000}],
  trimCandidates:[{ref:"ref1",amount:400}],
};

function post(token,body){
  return new Promise(resolve=>{
    const data=typeof body==="string"?body:JSON.stringify(body);
    const u=new URL(URL_BASE+"/ai/advice");
    const req=https.request({hostname:u.hostname,path:u.pathname,method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(data),
        ...(token?{"X-Sync-Token":token}:{}),"X-Device-Id":"aiburst"}},
      res=>{let raw="";res.on("data",d=>raw+=d);
        res.on("end",()=>{let j=null;try{j=JSON.parse(raw);}catch(e){}
          resolve({status:res.statusCode,body:j});});});
    req.on("error",e=>resolve({status:0,body:{error:e.code||"network"}}));
    req.write(data);req.end();
  });
}

const ask=q=>new Promise(res=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  /* Suppress echo so a shoulder or a screen-share doesn't catch it. */
  const out=rl.output;let muted=false;
  out.write(q);
  rl._writeToOutput=s=>{if(!muted)out.write(s);};
  muted=true;
  rl.question("",a=>{muted=false;out.write("\n");rl.close();res(a.trim());});
});

(async()=>{
  console.log(`\n/ai/advice verification against ${URL_BASE}\n`);

  const un=await post(null,{context:CTX});
  console.log(`1 · no passphrase              → ${un.status} ${un.status===401?"OK (refused)":"UNEXPECTED"}`);

  const token=await ask("Sync passphrase (not echoed): ");
  if(!token){console.error("no passphrase given — stopping.");process.exit(2);}

  const big=await post(token,JSON.stringify({context:{...CTX,product:"x".repeat(20000)}}));
  console.log(`2 · 20KB body                  → ${big.status} ${big.status===413?"OK (refused before the paid call)":"UNEXPECTED"}`);

  const shaped=await post(token,{context:{...CTX,plans:[],expenses:[]}});
  console.log(`3 · document-shaped keys       → ${shaped.status} ${shaped.status===400?"OK (refused: "+((shaped.body||{}).detail||"")+")":"UNEXPECTED"}`);

  console.log(`\n4 · ${CALLS} calls in one minute (cap is ${MINUTE_CAP} per device):`);
  let ok=0,limited=0,firstLimitAt=null;
  for(let i=1;i<=CALLS;i++){
    const t0=Date.now();
    const r=await post(token,{context:CTX});
    const ms=Date.now()-t0;
    if(r.status===200){ok++;console.log(`    call ${i}: 200 narration (${ms}ms)`);}
    else if(r.status===429){limited++;firstLimitAt=firstLimitAt||i;
      console.log(`    call ${i}: 429 limit scope=${(r.body||{}).scope} (${ms}ms)`);}
    else console.log(`    call ${i}: ${r.status} ${JSON.stringify(r.body).slice(0,120)} (${ms}ms)`);
  }

  const pass=un.status===401&&big.status===413&&shaped.status===400
    &&firstLimitAt===MINUTE_CAP+1;
  console.log(`\n${ok} accepted, ${limited} limited; first refusal at call ${firstLimitAt}`);
  console.log(pass
    ? `RESULT: guards and the per-minute cap behave exactly as specified.\n`
    : `RESULT: SOMETHING IS OFF — expected the first 429 at call ${MINUTE_CAP+1}.\n`);
  process.exit(pass?0:1);
})();
