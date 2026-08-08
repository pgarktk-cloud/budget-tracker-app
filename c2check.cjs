/* c2check.cjs — one live call proving the Build C2 path end to end.
   Run:  node c2check.cjs            (from the repo root, in a REAL terminal)

   TOOLING, NOT A RUNNER. It makes one real, paid Gemini call against the
   DEPLOYED Worker (~$0.001) and takes the passphrase on stdin, so it must
   never join the twenty-runner sweep. Same rules as aiburst.cjs.

   WHAT IT PROVES, which no unit test can:
     • the deployed prompt makes the model PICK one of the engine's options
       rather than describe the cards (that was Build B's whole failure)
     • the app's own validatePurchaseNarration — sliced live out of index.html,
       not restated here — accepts what actually comes back
     • {{refN}} tokens rehydrate into real category names on the device

   The context below is hand-built to match what the sandbox produced for a
   40,000 purchase against 3,000 available: cash fails, the date is
   unreachable, and four options exist. It carries no real data. */
const https=require("https"),readline=require("readline"),fs=require("fs"),
      vm=require("vm"),path=require("path");

const html=fs.readFileSync(path.join(__dirname,"index.html"),"utf8").replace(/\r\n/g,"\n");
function slice(a,b){
  const i=html.indexOf(a);
  if(i<0)throw new Error("start marker not found (did the source move?): "+a);
  const j=html.indexOf(b,i);
  if(j<0)throw new Error("end marker not found: "+b);
  return html.slice(i,j);
}
const ctx={console};
vm.createContext(ctx);
Object.assign(ctx,{defaultData:()=>({}),uid:()=>"stub"});
vm.runInContext(
  slice("function daysInCalMonth(y,m){","/* Tracked-spending rollup for one owner")+"\n"+
  slice("const MIN_TREND_BUCKETS=3;","function bucketHistoryFor(")+"\n"+
  slice("function dayNumber(str){","/* Reconcile: fold the accrued estimate"),ctx);
const{validatePurchaseNarration,rehydratePurchaseRefs}=ctx;

const WORKER=process.env.WORKER_HOST||"alloc-kv.jastinefodra21.workers.dev";

const CONTEXT={currency:"SAR",product:"Washing machine",price:40000,available:3000,
  periodAllocation:14000,horizonBuckets:24,historyWarning:false,
  stack:{banks:3000,joint:0,withheld:0,protectedGoals:0,protectedGoalCount:0,
    unlinkedProtectedCount:0,notCountedGoals:0,reservedCount:0,inaccessibleCount:0,
    unconverted:0,available:3000},
  scenarios:{cash:{feasible:false,remainingAfter:-37000,verdict:"bad"},
    savings:{mode:"plan",n:4,shortfall:37000,requiredPerBucket:12333.33,
      capacity:24000,tightestHeadroom:8000,feasible:false,verdict:"bad"}},
  horizon:[{n:0,income:22000,planned:14000,installmentTotal:0,headroom:8000}],
  trimCandidates:[{ref:"ref1",amount:9000},{ref:"ref2",amount:3000},
    {ref:"ref3",amount:1200},{ref:"ref4",amount:800}],
  options:[
    {kind:"trim",perPeriod:600,periods:3,freed:1800,closesGap:false,refs:["ref3","ref4"]},
    {kind:"shiftDate",n:6},
    {kind:"finance",count:5,perPayment:8000,financedTotal:40000},
    {kind:"reducePrice",price:27000,saving:13000}]};

/* Stays on this machine, exactly as it does in the app. */
const REFS={ref1:"Rent",ref2:"Tuition Fee Wife",ref3:"Eating out",ref4:"Shopping"};

const ask=q=>new Promise(res=>{
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const out=rl.output;let muted=false;
  out.write(q);
  rl._writeToOutput=s=>{if(!muted)out.write(s);};
  muted=true;
  rl.question("",a=>{muted=false;out.write("\n");rl.close();res(a.trim());});
});

(async()=>{
  const token=await ask("Sync passphrase (not echoed): ");
  if(!token){console.error("no passphrase given — stopping.");process.exit(2);}
  const body=JSON.stringify({context:CONTEXT});
  const r=await new Promise(resolve=>{
    const req=https.request({hostname:WORKER,path:"/ai/advice",method:"POST",
      headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body),
        "X-Sync-Token":token,"X-Device-Id":"c2check"}},
      res=>{let raw="";res.on("data",d=>raw+=d);
        res.on("end",()=>{let j=null;try{j=JSON.parse(raw);}catch(e){}
          resolve({status:res.statusCode,body:j});});});
    req.on("error",e=>resolve({status:0,body:{error:e.code||"network"}}));
    req.write(body);req.end();
  });

  console.log("\nHTTP "+r.status);
  if(r.status!==200){
    console.log(JSON.stringify(r.body));
    console.log("\n  503 = no key set · 502 = Google rejected the key · 429 = capped\n");
    process.exit(1);
  }

  const nar=r.body.narration;
  console.log("\n--- raw model output ---");
  console.log(JSON.stringify(nar,null,1));

  const v=validatePurchaseNarration(nar,CONTEXT);
  console.log("\n--- the app's OWN validator (sliced live from index.html) ---");
  console.log(v.ok?"ACCEPTED":"REJECTED: "+v.reason);
  if(!v.ok){
    console.log("\n  A rejection here is the guard WORKING — the app would render");
    console.log("  its cards with no prose. Worth reading the raw output above to");
    console.log("  see which rule it broke.\n");
    process.exit(1);
  }

  const show=t=>rehydratePurchaseRefs(t,REFS).map(s=>s.v).join("");
  const isOption=["trim","shiftDate","finance","reducePrice"].includes(v.value.recommended);
  console.log("\n--- as the user would see it ---");
  console.log("HEADLINE: "+show(v.value.headline));
  console.log("PICKED  : "+v.value.recommended+
    (isOption?"   <- an ENGINE option, which is the point of C2"
             :"   (a scenario, not one of the engine's moves)"));
  v.value.scenarioNotes.forEach(n=>console.log("  · "+n.id+": "+show(n.text)));
  v.value.watchOuts.forEach(w=>console.log("  ! "+show(w)));
  console.log("");
  process.exit(isOption?0:1);
})();
