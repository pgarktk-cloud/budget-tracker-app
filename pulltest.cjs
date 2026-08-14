/* Pull-to-sync must never arm from a touch inside a sheet (v1.42.0).

   THE BUG THIS PINS. `useScrollLock` pins the body with position:fixed, which
   makes `window.scrollY` read 0 for as long as ANY sheet is open. The pull
   gesture armed on `window.scrollY <= 0` and nothing else, so a downward drag
   inside a scrolled Settings sheet armed it — and because the touchmove
   listener is non-passive, the resulting `preventDefault()` cancelled the
   SHEET's own scroll. Settings could not be scrolled back up, an indicator
   painted over it, and letting go fired a real cloud save.

   Two halves are tested two different ways, because they live in two
   different kinds of place:

     • `mayArmPull` is a pure module-scope predicate and is unit-tested.
     • The wiring lives inside an App() effect, which no vm harness can reach,
       so it is pinned by SOURCE STRUCTURE — the same technique
       synconnecttest.cjs uses for the guards that live in effects. A green
       unit test over a predicate nobody calls would be worthless.

   Run: node pulltest.cjs [path-to-index.html]                              */

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
const at=(needle,from=0)=>{
  const i=html.indexOf(needle,from);
  assert.ok(i>=0,"not found in index.html: "+needle);
  return i;
};

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

/* ── harness ─────────────────────────────────────────────────────────────
   The lock region is sliced whole so `anyOverlayOpen` closes over the real
   counter. `scrollLockCount` is a top-level `let`, which does NOT attach to a
   vm context — hence the explicit handover, plus a test-only setter that can
   reach the private binding from inside the same scope. `useScrollLock` is
   only declared here, never called, so React being absent doesn't matter. */
const ctx={};
vm.createContext(ctx);
const lockSrc=slice("let scrollLockCount=0,scrollLockY=0;",
                    "/* ── May a pull-to-refresh gesture arm");
const armSrc=slice("function mayArmPull({","const PULL_OVERLAY_SELECTOR=");
vm.runInContext(lockSrc+armSrc+`
this.anyOverlayOpen=anyOverlayOpen;
this.mayArmPull=mayArmPull;
this.__setLockCount=v=>{scrollLockCount=v;};`,ctx);
const{anyOverlayOpen,mayArmPull,__setLockCount}=ctx;

/* Every combination of the four inputs. Only one of the sixteen may arm. */
const ALL=[false,true];
const combos=[];
ALL.forEach(overlayOpen=>ALL.forEach(inOverlay=>ALL.forEach(scrolledAncestor=>ALL.forEach(atTop=>
  combos.push({overlayOpen,inOverlay,scrolledAncestor,atTop})))));

console.log("\nmayArmPull — the predicate\n");

t("1 · arms only when at the top with nothing in the way",()=>{
  const arming=combos.filter(c=>mayArmPull(c)===true);
  assert.equal(arming.length,1,"exactly one of the 16 combinations may arm, got "+arming.length);
  assert.deepEqual(arming[0],{overlayOpen:false,inOverlay:false,scrolledAncestor:false,atTop:true});
});

t("2 · an open overlay refuses even at the top — the reported bug",()=>{
  // This is the exact state a scrolled Settings sheet produces: the body is
  // position:fixed so window.scrollY reads 0, i.e. atTop is TRUE and lying.
  assert.equal(mayArmPull({overlayOpen:true,inOverlay:false,scrolledAncestor:false,atTop:true}),false);
});

t("3 · a touch inside an overlay refuses, even if nothing locked the body",()=>{
  assert.equal(mayArmPull({overlayOpen:false,inOverlay:true,scrolledAncestor:false,atTop:true}),false);
});

t("4 · a scrolled nested container refuses",()=>{
  assert.equal(mayArmPull({overlayOpen:false,inOverlay:false,scrolledAncestor:true,atTop:true}),false);
});

t("5 · not at the top still refuses — the original condition is kept",()=>{
  assert.equal(mayArmPull({overlayOpen:false,inOverlay:false,scrolledAncestor:false,atTop:false}),false);
});

t("6 · each guard is independently sufficient to refuse",()=>{
  // Guards against a future `&&` where an `||` belongs: if any one of the
  // three refusals were dropped, one of these would start arming.
  ["overlayOpen","inOverlay","scrolledAncestor"].forEach(k=>{
    const c={overlayOpen:false,inOverlay:false,scrolledAncestor:false,atTop:true};
    c[k]=true;
    assert.equal(mayArmPull(c),false,k+" alone must refuse");
  });
});

t("7 · returns a real boolean, never a truthy value",()=>{
  combos.forEach(c=>assert.equal(typeof mayArmPull(c),"boolean"));
  // atTop is coerced, so a missing argument object member can't leak through.
  assert.equal(mayArmPull({overlayOpen:false,inOverlay:false,scrolledAncestor:false,atTop:undefined}),false);
  assert.equal(mayArmPull({overlayOpen:false,inOverlay:false,scrolledAncestor:false,atTop:1}),true);
});

console.log("\nanyOverlayOpen — the lock counter\n");

t("8 · false with no lock, true with one, true while nested",()=>{
  __setLockCount(0); assert.equal(anyOverlayOpen(),false);
  __setLockCount(1); assert.equal(anyOverlayOpen(),true);
  __setLockCount(3); assert.equal(anyOverlayOpen(),true,"nested sheets still count as open");
  __setLockCount(0); assert.equal(anyOverlayOpen(),false);
});

t("9 · anyOverlayOpen is module scope, not inside App()",()=>{
  // Inside App() it would be re-created per render and unreachable from the
  // module-scope predicate — and, worse, would still look fine in this file.
  assert.ok(at("function anyOverlayOpen()")<at("function App(){"),
    "anyOverlayOpen must be declared above function App()");
  assert.ok(at("function mayArmPull({")<at("function App(){"),
    "mayArmPull must be declared above function App()");
});

console.log("\nthe wiring — source structure\n");

const eff=slice("  /* ── pull-to-refresh ─","  /* which owner is active in Budget/Expenses tabs");
const effAt=(needle)=>{
  const i=eff.indexOf(needle);
  assert.ok(i>=0,"not found in the pull-to-refresh effect: "+needle);
  return i;
};

t("10 · the effect arms through mayArmPull, not through atTop() alone",()=>{
  assert.ok(effAt("mayArmPull(")<effAt("pullArmed.current=true;"),
    "the arm must be decided by mayArmPull before pullArmed is set");
  ["overlayOpen:anyOverlayOpen()","inOverlay:touchInOverlay(","scrolledAncestor:hasScrolledScrollableAncestor(","atTop:atTop()"]
    .forEach(k=>effAt(k));
});

t("11 · the overlay selector covers sheets, modals and dialogs",()=>{
  const sel=slice("const PULL_OVERLAY_SELECTOR=","function touchInOverlay(");
  [".sheet-bg",".modal-bg","[role=\"dialog\"]"].forEach(s=>
    assert.ok(sel.includes(s),"PULL_OVERLAY_SELECTOR must list "+s));
});

t("12 · onMove re-checks the overlay BEFORE preventDefault",()=>{
  // A sheet can open mid-drag (the FAB sits under the thumb). An armed
  // gesture that outlives the sheet's arrival is the same bug again.
  assert.ok(effAt("anyOverlayOpen()||!atTop()")<effAt("e.preventDefault();"),
    "the mid-drag overlay re-check must precede preventDefault");
});

t("13 · preventDefault is called exactly once, inside the armed path",()=>{
  const hits=eff.split("e.preventDefault()").length-1;
  assert.equal(hits,1,"expected one preventDefault in the pull effect, found "+hits);
  // and it must come after the guard that returns when not armed
  assert.ok(effAt("if(!pullArmed.current||pullStartY.current==null)return;")<effAt("e.preventDefault();"));
});

t("14 · touchmove is still the only non-passive listener",()=>{
  effAt('window.addEventListener("touchmove",onMove,{passive:false});');
  ["touchstart","touchend","touchcancel"].forEach(ev=>
    effAt(`window.addEventListener("${ev}",on`));
});

t("15 · the indicator sits below sheets in the z-index ladder",()=>{
  const ind=slice("{/* pull-to-sync indicator","})()}");
  assert.ok(ind.includes("zIndex:38"),"pull indicator should be zIndex 38");
  assert.ok(!ind.includes("zIndex:60"),
    "zIndex 60 painted the indicator over .sheet-bg (40)");
});

console.log("\nthe Settings sheet header\n");

t("16 · .sheet-head is sticky, opaque and layered like .group-head",()=>{
  const css=slice(".sheet-head{","}");
  ["position:sticky","z-index:2"].forEach(s=>
    assert.ok(css.includes(s),".sheet-head must declare "+s));
  // Measured in the browser: sticky pins to the scroller's CONTENT edge, 19px
  // in (18px .sheet padding + 1px border). `top:0` parks the header 19px down
  // and the settings scroll through the translucent strip above it.
  assert.ok(css.includes("top:-18px"),
    ".sheet-head needs top:-18px to clear .sheet's padding — top:0 leaves a see-through strip");
  assert.ok(/background:var\(--[a-zA-Z]+\)/.test(css),
    ".sheet-head needs an opaque background token — the sheet itself is translucent glass");
  assert.ok(!/rgba\(/.test(css),
    ".sheet-head must not use a translucent background: content would scroll through the title");
});

t("17 · the Settings header uses it, and Close keeps its 40x40 default",()=>{
  const head=slice('<div className="sheet-head">',"</div>");
  assert.ok(head.includes("<h3"),"the sticky header should carry the title");
  assert.ok(head.includes('label="Close"'),"the sticky header should carry Close");
  assert.ok(!head.includes("minWidth:0"),
    "Close must not shrink below IconButton's 40x40 default");
  assert.ok(!head.includes("minHeight:0"));
  assert.ok(!head.includes("padding:0"));
});

t("18 · SettingsModal still holds exactly one scroll lock",()=>{
  // SettingsModal is the last component in the file, so the end marker is the
  // render call rather than the next declaration.
  const modal=slice("function SettingsModal({","ReactDOM.createRoot(");
  const locks=modal.split("useScrollLock(").length-1;
  assert.equal(locks,1,"expected one useScrollLock in SettingsModal, found "+locks);
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
