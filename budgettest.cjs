/* Unit-test the budget-plan clone and the move-sub-items mutator.

   Slices the real function bodies out of index.html by text and runs them in a
   vm context, per CLAUDE.md — testing the shipped code, not a reimplementation.

   Covers things that were each subtly wrong and are easy to break again:

   0. resolvePlanForMonth + editPlanForMonth — the carry-forward chain and the
      copy-on-write choke point. An unmapped month resolves to the NEAREST
      PRECEDING mapping rather than to activePlanId, which is what stops
      editing this month from retroactively rewriting what last March shows;
      and the first real edit to such a month materialises its own plan in a
      single write. The no-op guard matters as much as the write: NumField
      commits on re-typing the same number, so without it merely tapping
      around a past month would create plans.

   1. clonePlanForMonth — "copy this month's budget". The bug it guards against
      is an orphaned category (groupId not present in source.groups) keeping a
      dangling id in the clone: every renderer walks groups→categories, so the
      category and all its sub-items go INVISIBLE while `allocated` (which sums
      all categories) still counts them. Hence the renderedTotal===flatTotal
      assertions — that identity is the real invariant.

   2. moveSelectedTo — moving sub-items between categories. A category's
      `amount` is a manual figure only while it has no subs (effectiveAmt reads
      the sub sum otherwise), so both ends of a move need explicit handling or
      money silently appears/vanishes. See docs/decisions.md.

   Gotcha: assert.deepStrictEqual compares prototypes and therefore fails
   across vm realms. Use deepEqual for anything built inside the vm. */
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
const eff=c=>(c.subs||[]).length?c.subs.reduce((s,x)=>s+(Number(x.amount)||0),0):(Number(c.amount)||0);

/* Slices shared by several sections below — declared up front so the
   copy-on-write tests can build a context out of the same real sources. */
const cloneRecSrc=slice("function clonePlanRecord(","/* Spend-status thresholds");
const cloneSrc=slice("  const clonePlanForMonth=(mo,sourcePlanId","  /* ── Copy-on-write, silent");
/* Starts at the plan-record helpers (livePlanView / stampPlanRecords /
   comparePlanRecords), not at resolvePlanForMonth: since 2026-08-05 resolve
   returns livePlanView(plan) and editPlanForMonth calls stampPlanRecords, so
   slicing from resolve alone leaves them undefined and every test in both
   sections fails with a ReferenceError rather than a real assertion. */
const resolveSrc=slice("const PLAN_ORD_LAST=","/* Deep-clone a plan record");

/* ── resolvePlanForMonth — the carry-forward chain ────────────────────── */
const rctx={};
vm.createContext(rctx);
// PLAN_ORD_LAST/planOrdOf are top-level consts and don't attach to the vm
// context on their own — only function declarations do.
vm.runInContext(resolveSrc+`
this.resolvePlanForMonth=resolvePlanForMonth;
this.livePlanView=livePlanView;
this.stampPlanRecords=stampPlanRecords;
this.comparePlanRecords=comparePlanRecords;
this.planOrdOf=planOrdOf;
this.PLAN_ORD_LAST=PLAN_ORD_LAST;`,rctx);
const{resolvePlanForMonth,livePlanView,stampPlanRecords,comparePlanRecords,planOrdOf}=rctx;
console.log("\nresolvePlanForMonth (carry-forward chain)");
{
  const P=[{id:"pJan",owner:"me"},{id:"pMar",owner:"me"},{id:"pJun",owner:"me"},
           {id:"pBase",owner:"me"},{id:"pWife",owner:"wife"}];
  const M=[{month:"2026-01",owner:"me",planId:"pJan"},
           {month:"2026-03",owner:"me",planId:"pMar"},
           {month:"2026-06",owner:"me",planId:"pJun"}];
  const A={me:"pBase",wife:"pWife"};
  const r=(mo,maps=M,plans=P,active=A,owner="me")=>resolvePlanForMonth(maps,mo,owner,active,plans);

  t("an exact mapping wins over any earlier one",()=>{
    const out=r("2026-03");
    assert.strictEqual(out.plan.id,"pMar");
    assert.strictEqual(out.exact,true);
    assert.strictEqual(out.fromMonth,"2026-03");
  });

  t("an unmapped month takes the NEAREST preceding mapping",()=>{
    // not the oldest (pJan) and not the newest overall (pJun)
    const out=r("2026-04");
    assert.strictEqual(out.plan.id,"pMar");
    assert.strictEqual(out.exact,false);
    assert.strictEqual(out.fromMonth,"2026-03");
    assert.strictEqual(out.source,"chain");
  });

  t("a mapping AFTER the month is never used",()=>{
    // this is the whole point: February must not see June's plan
    assert.strictEqual(r("2026-02").plan.id,"pJan");
  });

  t("with nothing preceding, it falls back to the base plan",()=>{
    const out=r("2025-12");
    assert.strictEqual(out.plan.id,"pBase");
    assert.strictEqual(out.source,"base");
    assert.strictEqual(out.fromMonth,null);
  });

  t("the base fallback degrades: activePlanId → owner's first → any → null",()=>{
    assert.strictEqual(r("2025-12",[],P,{me:"gone"}).plan.id,"pJan","dangling id → owner's first");
    assert.strictEqual(r("2025-12",[],[{id:"x",owner:"wife"}],{me:"gone"}).plan.id,"x","→ plans[0]");
    assert.strictEqual(r("2025-12",[],[],{}).plan,null,"→ null rather than undefined");
  });

  t("the other owner's mappings are invisible",()=>{
    const maps=[...M,{month:"2026-05",owner:"wife",planId:"pWife"}];
    assert.strictEqual(r("2026-06",maps).plan.id,"pJun");
    // and from the wife's side, none of me's mappings apply
    assert.strictEqual(r("2026-06",maps,P,A,"wife").plan.id,"pWife");
  });

  t("a tombstoned mapping is skipped, and the chain continues PAST it",()=>{
    // "remove this month's custom plan" means the month goes back to
    // inheriting — it must not stop the walk dead and drop to the base plan
    const maps=[...M,{month:"2026-05",owner:"me",planId:null,deletedAt:"2026-05-02"}];
    const out=r("2026-05",maps);
    assert.strictEqual(out.plan.id,"pMar");
    assert.strictEqual(out.fromMonth,"2026-03");
  });

  t("a mapping pointing at a soft-deleted plan is skipped, not rendered blank",()=>{
    const plans=P.map(p=>p.id==="pMar"?{...p,deletedAt:"2026-04-01"}:p);
    const out=r("2026-04",M,plans);
    assert.strictEqual(out.plan.id,"pJan","should fall through to the older real mapping");
    assert.strictEqual(out.fromMonth,"2026-01");
  });

  t("mixed calendar and pay-period keys still order correctly",()=>{
    // "2026-03" < "2026-03-28" < "2026-04" — a period beginning in March
    // inherits March's calendar plan, which is intended
    const maps=[{month:"2026-03",owner:"me",planId:"pMar"},
                {month:"2026-04",owner:"me",planId:"pJun"}];
    assert.strictEqual(r("2026-03-28",maps).plan.id,"pMar");
    assert.strictEqual(r("2026-04-28",maps).plan.id,"pJun");
  });

  t("undefined/empty inputs don't throw",()=>{
    assert.doesNotThrow(()=>resolvePlanForMonth(undefined,"2026-03","me",undefined,undefined));
    assert.strictEqual(resolvePlanForMonth(undefined,"2026-03","me",undefined,undefined).plan,null);
  });
}

/* ── editPlanForMonth — copy-on-write ─────────────────────────────────── */
const editSrc=slice("  const editPlanForMonth=","  const removePlanForMonth=");
console.log("\neditPlanForMonth (copy-on-write)");
{
  let seq=0;
  const run=(d,mo,owner,label,mutate)=>{
    let out;
    const ctx={uid:()=>"n"+(++seq),resolvePlanForMonth,clonePlanRecord:undefined,
      setData:fn=>{out=fn(d);}};
    vm.createContext(ctx);
    vm.runInContext(cloneRecSrc+"\n"+resolveSrc+"\n"+editSrc+"\nvar __edit=editPlanForMonth;",ctx);
    ctx.__edit(mo,owner,label,mutate);
    return out;
  };
  const base=()=>({
    plans:[{id:"pBase",owner:"me",income:100,groups:[{id:"g1",name:"G"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:50,subs:[]}]}],
    monthlyPlans:[],activePlanId:{me:"pBase"}});

  t("with an existing mapping it patches the plan and leaves monthlyPlans alone",()=>{
    const d={...base(),monthlyPlans:[{month:"2026-03",owner:"me",planId:"pBase"}]};
    const out=run(d,"2026-03","me","March 2026",p=>({...p,income:999}));
    assert.strictEqual(out.plans.length,1,"must not clone when the month owns a plan");
    assert.strictEqual(out.plans[0].income,999);
    assert.strictEqual(out.monthlyPlans.length,1);
    assert.ok(out.plans[0].updatedAt,"the edit must be stamped");
  });

  t("with no mapping, ONE call produces the plan AND the mapping, edit included",()=>{
    // a two-phase write would render an empty custom budget for a debounce tick
    const d=base();
    const out=run(d,"2026-05","me","May 2026",p=>({...p,income:777}));
    assert.strictEqual(out.plans.length,2);
    const made=out.plans[1];
    assert.strictEqual(made.income,777,"the edit must already be applied to the clone");
    assert.strictEqual(made.owner,"me");
    assert.strictEqual(made.name,"May 2026");
    assert.notStrictEqual(made.id,"pBase","fresh PLAN id");
    // deep-cloned means new OBJECTS, not renumbered ids — copy-on-write
    // deliberately keeps category ids so id-targeted edits still resolve
    assert.notStrictEqual(made.categories,d.plans[0].categories,"categories deep-cloned");
    assert.notStrictEqual(made.categories[0],d.plans[0].categories[0],"category objects deep-cloned");
    assert.strictEqual(out.monthlyPlans.length,1);
    assert.strictEqual(out.monthlyPlans[0].month,"2026-05");
    assert.strictEqual(out.monthlyPlans[0].planId,made.id);
    assert.strictEqual(out.plans[0].income,100,"the source must be untouched");
  });

  t("the clone's source is the CHAIN answer, not activePlanId",()=>{
    const d=base();
    d.plans.push({id:"pApr",owner:"me",income:555,groups:[],categories:[]});
    d.monthlyPlans=[{month:"2026-04",owner:"me",planId:"pApr"}];
    const out=run(d,"2026-06","me","June 2026",p=>({...p,income:p.income+1}));
    assert.strictEqual(out.plans[out.plans.length-1].income,556,"should have copied April, not the base");
  });

  t("an identity mutate writes NOTHING — same object back, both branches",()=>{
    // the NumField re-type-the-same-number case; without this, paging around a
    // past month and tapping an amount would materialise plans
    const d1=base();
    assert.strictEqual(run(d1,"2026-05","me","May 2026",p=>p),d1,"clone branch");
    assert.strictEqual(run(d1,"2026-05","me","May 2026",p=>({...p})),d1,"deep-equal clone branch");
    const d2={...base(),monthlyPlans:[{month:"2026-03",owner:"me",planId:"pBase"}]};
    assert.strictEqual(run(d2,"2026-03","me","March 2026",p=>({...p})),d2,"existing-mapping branch");
  });

  t("an unresolvable source writes nothing rather than fabricating a budget",()=>{
    const d={plans:[],monthlyPlans:[],activePlanId:{}};
    assert.strictEqual(run(d,"2026-05","me","May 2026",p=>({...p,income:1})),d);
  });

  t("a mutate returning nothing is treated as a no-op, not a wipe",()=>{
    const d=base();
    assert.strictEqual(run(d,"2026-05","me","May 2026",()=>undefined),d);
  });

  /* ── the carried-forward-month edit bug (2026-07-31) ──────────────────
     The UI reads the INHERITED plan and hands `mutate` that plan's category
     id. The clone used to renumber every id, so the mutation matched nothing,
     the result equalled the clone, and the no-op guard swallowed it: deleting
     or renaming a category in a carried-forward month did nothing at all,
     while "add category" and "set income" worked because they reference no
     existing id. That asymmetry is what made it look like the month was
     read-only rather than broken. */

  t("DELETING a category by its inherited id works on a carried-forward month",()=>{
    const out=run(base(),"2026-05","me","May 2026",
      p=>({...p,categories:(p.categories||[]).filter(c=>c.id!=="c1")}));
    assert.strictEqual(out.plans.length,2,"a plan should have been materialised");
    assert.strictEqual(out.plans[1].categories.length,0,"the category should be gone");
  });

  t("RENAMING a category by its inherited id works on a carried-forward month",()=>{
    const out=run(base(),"2026-05","me","May 2026",
      p=>({...p,categories:(p.categories||[]).map(c=>c.id==="c1"?{...c,name:"FOOD"}:c)}));
    assert.strictEqual(out.plans.length,2);
    assert.strictEqual(out.plans[1].categories[0].name,"FOOD");
  });

  t("copy-on-write PRESERVES category/group/sub ids",()=>{
    // not cosmetic: expenses key on catId, so renumbering orphans any
    // transaction already logged into that month against the inherited id
    const d=base();
    d.plans[0].categories[0].subs=[{id:"s1",name:"Fruit",amount:20}];
    const out=run(d,"2026-05","me","May 2026",p=>({...p,income:1}));
    const made=out.plans[1];
    assert.notStrictEqual(made.id,"pBase","the PLAN id must still be fresh");
    assert.strictEqual(made.categories[0].id,"c1","category id must survive");
    assert.strictEqual(made.groups[0].id,"g1","group id must survive");
    assert.strictEqual(made.categories[0].subs[0].id,"s1","sub id must survive");
  });

  t("the clone is still a deep copy — editing it never writes through",()=>{
    // preserving ids must not be mistaken for sharing objects
    const d=base();
    const out=run(d,"2026-05","me","May 2026",
      p=>({...p,categories:(p.categories||[]).map(c=>({...c,amount:999}))}));
    assert.strictEqual(out.plans[1].categories[0].amount,999);
    assert.strictEqual(out.plans[0].categories[0].amount,50,"source must be untouched");
    assert.notStrictEqual(out.plans[1].categories,out.plans[0].categories,"arrays must differ");
  });
}

/* ── clonePlanForMonth ────────────────────────────────────────────────────
   The record-building half now lives at module scope as the pure
   clonePlanRecord (so copy-on-write can fold a clone and an edit into one
   setData); App's clonePlanForMonth is the thin writer around it. Both are
   sliced so these assertions keep testing the real path end to end. */
console.log("\nclonePlanForMonth");
{
  let seq=0;
  const mk=(plans,owner="me")=>{
    let captured;
    const ctx={plans,budgetOwner:owner,uid:()=>"n"+(++seq),
      setData:fn=>{captured=fn({plans,monthlyPlans:[]});}};
    vm.createContext(ctx);
    vm.runInContext(cloneRecSrc+"\n"+cloneSrc+"\nvar __clone=clonePlanForMonth;",ctx);
    return{run:(...a)=>({ret:ctx.__clone(...a),data:captured})};
  };

  t("returns null and writes nothing when the source id doesn't resolve",()=>{
    // the old `||plans[0]` fallback could copy the OTHER owner's plan and
    // stamp the requested owner on it — a plausible, entirely wrong budget
    const{ret,data}=mk([{id:"p1",owner:"me",groups:[],categories:[]}]).run("2026-03","nope","me","March 2026");
    assert.strictEqual(ret,null);
    assert.strictEqual(data,undefined,"setData must not have fired");
  });

  t("survives a plan with no groups/categories arrays",()=>{
    // migrate() guarantees neither; an unguarded .map threw BEFORE setData,
    // so the failure mode was "the button does nothing"
    const{data}=mk([{id:"p1",owner:"me",income:100}]).run("2026-03","p1","me","March 2026");
    assert.deepEqual(data.plans[1].groups,[]);
    assert.deepEqual(data.plans[1].categories,[]);
  });

  t("carries the trim marks across, because THIS clone remints ids",()=>{
    /* editPlanForMonth preserves ids, so data.trimPolicy keeps applying month
       to month for free. This is the one clone that does NOT — so without the
       carry-over, using "Copy from another month" would silently make every
       category un-suggestable to the Purchase Advisor, and the marks would
       look like they needed re-doing every month. */
    const src={id:"p1",owner:"me",income:5000,
      groups:[{id:"g1",name:"Needs"},{id:"g2",name:"Wants"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:900},
                  {id:"c2",groupId:"g2",name:"Fun",amount:200}]};
    let captured;seq=0;
    const pol={g2:{v:true,updatedAt:"2026-08-01T00:00:00.000Z"},
               c1:{v:false,updatedAt:"2026-08-02T00:00:00.000Z"}};
    const ctx={plans:[src],budgetOwner:"me",uid:()=>"n"+(++seq),
      setData:fn=>{captured=fn({plans:[src],monthlyPlans:[],trimPolicy:pol});}};
    vm.createContext(ctx);
    vm.runInContext(cloneRecSrc+"\n"+cloneSrc+"\nvar __clone=clonePlanForMonth;",ctx);
    ctx.__clone("2026-03","p1","me","March 2026");
    const cloned=captured.plans[1];
    const newG2=cloned.groups[1].id, newC1=cloned.categories[0].id;
    assert.notStrictEqual(newG2,"g2","this clone is supposed to remint");
    assert.equal(captured.trimPolicy[newG2].v,true,"the group mark must follow");
    assert.equal(captured.trimPolicy[newC1].v,false,"and so must a NO override");
    assert.equal(captured.trimPolicy.g2.v,true,"the old entries are left alone");
  });

  t("a document with no trim marks is not given one by copying a month",()=>{
    const src={id:"p1",owner:"me",groups:[{id:"g1"}],categories:[{id:"c1",groupId:"g1"}]};
    let captured;seq=0;
    const ctx={plans:[src],budgetOwner:"me",uid:()=>"n"+(++seq),
      setData:fn=>{captured=fn({plans:[src],monthlyPlans:[]});}};
    vm.createContext(ctx);
    vm.runInContext(cloneRecSrc+"\n"+cloneSrc+"\nvar __clone=clonePlanForMonth;",ctx);
    ctx.__clone("2026-03","p1","me","March 2026");
    assert.ok(!("trimPolicy" in captured),
      "an untouched document must stay byte-identical — no empty map added");
  });

  t("copies every category and sub faithfully, with fresh ids",()=>{
    const src={id:"p1",owner:"me",income:5000,groups:[{id:"g1",name:"Needs"},{id:"g2",name:"Wants"}],
      categories:[
        {id:"c1",groupId:"g1",name:"Food",amount:900,color:"#111",trackExpenses:true,
          subs:[{id:"s1",name:"Groceries",amount:600},{id:"s2",name:"Dining",amount:300}]},
        {id:"c2",groupId:"g2",name:"Fun",amount:200,color:"#222",trackExpenses:false,subs:[]},
      ]};
    const{data}=mk([src]).run("2026-03","p1","me","March 2026");
    const c=data.plans[1];
    assert.strictEqual(c.income,5000);
    assert.strictEqual(c.categories.length,2);
    const gids=new Set(c.groups.map(g=>g.id));
    c.categories.forEach(x=>assert.ok(gids.has(x.groupId),x.name+" is orphaned"));
    const gname=id=>c.groups.find(g=>g.id===id).name;
    assert.strictEqual(gname(c.categories[0].groupId),"Needs");
    assert.strictEqual(gname(c.categories[1].groupId),"Wants");
    assert.deepEqual(c.categories[0].subs.map(s=>[s.name,s.amount]),[["Groceries",600],["Dining",300]]);
    assert.strictEqual(c.categories[1].trackExpenses,false,"non-obvious fields must survive");
    // ids must be fresh so edits don't write through to the source month
    assert.notStrictEqual(c.categories[0].id,"c1");
    assert.notStrictEqual(c.categories[0].subs[0].id,"s1");
    assert.notStrictEqual(c.groups[0].id,"g1");
    assert.strictEqual(c.categories.reduce((s,x)=>s+eff(x),0),
                       src.categories.reduce((s,x)=>s+eff(x),0),"totals must match");
  });

  t("rescues an orphaned category into an Ungrouped group instead of hiding it",()=>{
    const{data}=mk([{id:"p1",owner:"me",income:0,groups:[{id:"g1",name:"Needs"}],
      categories:[
        {id:"c1",groupId:"g1",name:"Food",amount:100,subs:[]},
        {id:"c2",groupId:"GONE",name:"Orphan",amount:250,subs:[{id:"s1",name:"x",amount:250}]},
      ]}]).run("2026-03","p1","me","March 2026");
    const c=data.plans[1];
    const gids=new Set(c.groups.map(g=>g.id));
    c.categories.forEach(x=>assert.ok(gids.has(x.groupId),x.name+" still orphaned"));
    const orphanGroup=c.groups.find(g=>g.name==="Ungrouped");
    assert.ok(orphanGroup,"Ungrouped group not created");
    assert.strictEqual(c.categories.find(x=>x.name==="Orphan").groupId,orphanGroup.id);
    // the invariant that actually matters: what renders === what's counted
    const rendered=c.groups.reduce((s,g)=>s+c.categories.filter(x=>x.groupId===g.id).reduce((a,x)=>a+eff(x),0),0);
    assert.strictEqual(rendered,350);
    assert.strictEqual(rendered,c.categories.reduce((s,x)=>s+eff(x),0));
  });

  t("does not create an Ungrouped group when nothing is orphaned",()=>{
    const{data}=mk([{id:"p1",owner:"me",groups:[{id:"g1",name:"Needs"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:100,subs:[]}]}]).run("2026-03","p1","me","March 2026");
    assert.strictEqual(data.plans[1].groups.length,1);
  });

  t("re-derives a drifted cached amount from the subs",()=>{
    const{data}=mk([{id:"p1",owner:"me",groups:[{id:"g1",name:"G"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:9999,
        subs:[{id:"s1",name:"a",amount:10},{id:"s2",name:"b",amount:5}]}]}]).run("2026-03","p1","me","March 2026");
    assert.strictEqual(data.plans[1].categories[0].amount,15);
  });

  t("maps the month and drops any inherited tombstone",()=>{
    const{ret,data}=mk([{id:"p1",owner:"me",deletedAt:"2020-01-01",groups:[],categories:[]}]).run("2026-03","p1","wife","March 2026");
    assert.strictEqual(data.plans[1].deletedAt,undefined);
    assert.strictEqual(data.plans[1].owner,"wife");
    assert.strictEqual(data.monthlyPlans[0].month,"2026-03");
    assert.strictEqual(data.monthlyPlans[0].planId,ret);
  });
}

/* ── moveSelectedTo — categories between GROUPS ─────────────────────────
   Groups are the fixed frame of a budget; the category rows under them are
   what gets reorganised. A category carries its own amount/subs/tracking and
   everything else keys on the category id, so the move is a pure re-parent:
   no amount is created, destroyed or reinterpreted. (An earlier build moved
   *sub-items between categories*, which was the wrong level — see
   docs/decisions.md.) */
console.log("moveSelectedTo (categories → group)");
{
  const mv=slice("  const moveSelectedTo=destGroupId=>{","\n    exitSelect();");
  // strip the outer wrapper to get at the updater body. The wrapper changed
  // from setCatsFor(pid,…) to editCats(…) when copy-on-write landed; assert on
  // the strip so a future rename fails loudly instead of feeding a syntax
  // error into the vm and reporting eight identical "missing )" failures.
  const wrapper="  const moveSelectedTo=destGroupId=>{\n    editCats(cats=>{";
  assert.ok(mv.startsWith(wrapper),"moveSelectedTo's wrapper changed shape: "+mv.slice(0,90));
  const inner=mv.replace(wrapper,"").replace(/\s*\}\);\s*$/,"");
  const run=(cats,sel,destGroupId)=>{
    const ctx={selectedCats:sel};
    vm.createContext(ctx);
    vm.runInContext("var __mv=function(cats,destGroupId){"+inner+"\n};",ctx);
    return ctx.__mv(cats,destGroupId);
  };
  const totalOf=(cats,gid)=>cats.filter(c=>c.groupId===gid).reduce((s,c)=>s+eff(c),0);

  t("re-parents a category and moves its money with it",()=>{
    const cats=[
      {id:"c1",name:"Food",amount:900,groupId:"g1",subs:[]},
      {id:"c2",name:"Fun",amount:200,groupId:"g1",subs:[]},
      {id:"c3",name:"Rent",amount:5000,groupId:"g2",subs:[]},
    ];
    const out=run(cats,{c2:"g1"},"g2");
    assert.strictEqual(out.find(c=>c.id==="c2").groupId,"g2");
    assert.strictEqual(totalOf(out,"g1"),900);
    assert.strictEqual(totalOf(out,"g2"),5200);
  });

  t("a category's amount, subs and tracking are untouched by the move",()=>{
    const cats=[{id:"c1",name:"Food",amount:900,groupId:"g1",trackExpenses:false,
      subs:[{id:"s1",name:"Groceries",amount:600},{id:"s2",name:"Dining",amount:300}]}];
    const out=run(cats,{c1:"g1"},"g2");
    const moved=out[0];
    assert.strictEqual(moved.amount,900);
    assert.strictEqual(moved.trackExpenses,false);
    assert.deepEqual(moved.subs.map(s=>[s.name,s.amount]),[["Groceries",600],["Dining",300]]);
    assert.strictEqual(eff(moved),900);
  });

  t("the plan total is conserved — a move is not a reallocation",()=>{
    const cats=[
      {id:"c1",amount:100,groupId:"g1",subs:[]},
      {id:"c2",amount:250,groupId:"g1",subs:[{id:"s1",amount:50},{id:"s2",amount:200}]},
      {id:"c3",amount:5000,groupId:"g2",subs:[]},
    ];
    const before=cats.reduce((s,c)=>s+eff(c),0);
    const out=run(cats,{c1:"g1",c2:"g1"},"g2");
    assert.strictEqual(out.reduce((s,c)=>s+eff(c),0),before);
    assert.strictEqual(totalOf(out,"g1"),0);
    assert.strictEqual(totalOf(out,"g2"),5350);
  });

  t("spans multiple source groups in one move",()=>{
    const cats=[
      {id:"c1",amount:100,groupId:"g1",subs:[]},
      {id:"c2",amount:50,groupId:"g2",subs:[]},
      {id:"c3",amount:10,groupId:"g3",subs:[]},
    ];
    const out=run(cats,{c1:"g1",c2:"g2"},"g3");
    assert.strictEqual(totalOf(out,"g3"),160);
    assert.strictEqual(totalOf(out,"g1"),0);
    assert.strictEqual(totalOf(out,"g2"),0);
  });

  t("moved categories are appended, so they land at the end of the group",()=>{
    // display order inside a group is array order, so appending is what makes
    // the result predictable rather than interleaved at old positions
    const cats=[
      {id:"c1",amount:1,groupId:"g1",subs:[]},
      {id:"c2",amount:2,groupId:"g2",subs:[]},
      {id:"c3",amount:3,groupId:"g2",subs:[]},
    ];
    const out=run(cats,{c1:"g1"},"g2");
    assert.deepEqual(out.map(c=>c.id),["c2","c3","c1"]);
    assert.deepEqual(out.filter(c=>c.groupId==="g2").map(c=>c.id),["c2","c3","c1"]);
  });

  t("categories already in the destination are left where they are",()=>{
    const cats=[
      {id:"c1",amount:1,groupId:"g1",subs:[]},
      {id:"c2",amount:2,groupId:"g2",subs:[]},
    ];
    const out=run(cats,{c1:"g1",c2:"g2"},"g2");
    assert.strictEqual(out.filter(c=>c.groupId==="g2").length,2);
    assert.strictEqual(totalOf(out,"g2"),3);
  });

  t("returns the array untouched when nothing would move",()=>{
    // identity matters: setCatsFor feeds a React state updater
    const cats=[{id:"c1",amount:10,groupId:"g1",subs:[]}];
    assert.strictEqual(run(cats,{c1:"g1"},"g1"),cats);
    assert.strictEqual(run(cats,{},"g2"),cats);
  });

  t("emptying a group of every category leaves the group itself alone",()=>{
    // the group is a separate record; only categories carry groupId
    const cats=[{id:"c1",amount:10,groupId:"g1",subs:[]}];
    const out=run(cats,{c1:"g1"},"g2");
    assert.strictEqual(out.length,1);
    assert.strictEqual(totalOf(out,"g1"),0);
  });
}

/* ── migrate()'s orphan guard ───────────────────────────────────────── */
console.log("migrate() orphan guard");
{
  // slice just the per-plan loop, not all of migrate()
  const loop=slice("  (d.plans||[]).forEach(plan=>{","\n  (d.investments||[]).forEach(inv=>{");
  let seq=0;
  const run=d=>{
    const ctx={d,uid:()=>"m"+(++seq)};
    vm.createContext(ctx);
    vm.runInContext("var __run=function(d){"+loop+"\n return d;};",ctx);
    return ctx.__run(d);
  };

  t("moves an unresolvable groupId into Ungrouped",()=>{
    const out=run({plans:[{id:"p1",groups:[{id:"g1",name:"Needs"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:100,subs:[]},
                  {id:"c2",groupId:"GONE",name:"Orphan",amount:250,subs:[]}]}]});
    const p=out.plans[0];
    const gids=new Set(p.groups.map(g=>g.id));
    p.categories.forEach(c=>assert.ok(gids.has(c.groupId),c.name+" still orphaned"));
    assert.ok(p.groups.find(g=>g.name==="Ungrouped"));
    const rendered=p.groups.reduce((s,g)=>s+p.categories.filter(c=>c.groupId===g.id).reduce((a,c)=>a+eff(c),0),0);
    assert.strictEqual(rendered,350,"rendered total must now equal the flat total");
  });

  t("leaves a healthy plan completely alone",()=>{
    const out=run({plans:[{id:"p1",groups:[{id:"g1",name:"Needs"}],
      categories:[{id:"c1",groupId:"g1",name:"Food",amount:100,subs:[],trackExpenses:true}],
      updatedAt:"2026-01-01"}]});
    assert.strictEqual(out.plans[0].groups.length,1,"no Ungrouped group invented");
  });

  t("reuses one Ungrouped group for several orphans, and on a second run",()=>{
    const d={plans:[{id:"p1",groups:[],
      categories:[{id:"c1",groupId:"X",name:"A",amount:1,subs:[]},
                  {id:"c2",groupId:"Y",name:"B",amount:2,subs:[]}]}]};
    run(d);
    assert.strictEqual(d.plans[0].groups.length,1);
    run(d); // migrate runs on every load — must be idempotent
    assert.strictEqual(d.plans[0].groups.length,1,"must not add a group per load");
  });

  t("handles a plan with no groups array at all",()=>{
    const out=run({plans:[{id:"p1",categories:[{id:"c1",groupId:"X",name:"A",amount:5}]}]});
    assert.strictEqual(out.plans[0].groups.length,1);
    assert.strictEqual(out.plans[0].categories[0].groupId,out.plans[0].groups[0].id);
  });
}

console.log("\n"+(n-fails)+"/"+n+" passed");
process.exit(fails?1:0);
