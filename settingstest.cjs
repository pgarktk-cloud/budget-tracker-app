/* Structure assertions for the Settings accordion (v1.46.0, phase 5).

   Phase 5 moved ~500 lines of JSX inside a 460-line component and changed no
   behaviour. That is exactly the kind of edit that half-applies: a heading
   silently dropped, a nested dialog swallowed by a collapsed section, a
   `useScrollLock` duplicated. `parsecheck.cjs` proves the file still parses;
   this proves the move didn't lose anything.

   Nothing here is a unit test — there is no arithmetic in Settings. These are
   the claims the release makes about the shape of the code, each invisible to
   every other runner. */
const fs=require("fs"),assert=require("assert"),path=require("path");
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,"index.html"),"utf8")
  .replace(/\r\n/g,"\n");

function slice(startMarker,endMarker){
  const a=html.indexOf(startMarker);
  assert.ok(a>=0,"start marker not found (did the source move?): "+startMarker);
  const b=html.indexOf(endMarker,a);
  assert.ok(b>a,"end marker not found: "+endMarker);
  return html.slice(a,b);
}
// SettingsModal is the last component in the file, so the babel block's own
// close is the end marker. Asserted by slice() if that ever stops being true.
const settings=slice("function SettingsModal(","\n</script>");

let n=0,fails=0;
const t=(name,fn)=>{n++;try{fn();console.log("  ok   "+name);}catch(e){fails++;console.log("  FAIL "+name+"\n       "+e.message);}};

console.log("Settings accordion (v1.46.0)");

t("1 · every one of the eleven headings survived the move",()=>{
  /* The whole risk of phase 5 in one assertion. A heading that vanishes takes
     its controls with it, and nothing else in the suite would notice. */
  const headings=["Appearance","Who's who","Savings target","Pay periods","Currency label",
    "Home Display","Savings &amp; Investing categories","Home card visibility","Investments",
    "Cloudflare KV Sync","Manual backup"];
  headings.forEach(h=>assert.ok(settings.includes(`>${h}</div>`),`the "${h}" heading is gone`));
  // and the controls that never had a heading
  ["Recently Deleted","Reset to empty","Load sample data","Change default profile"]
    .forEach(s=>assert.ok(settings.includes(s),`"${s}" is gone`));
});

t("2 · six sections, all collapsed by default",()=>{
  const ids=[...settings.matchAll(/\{section\("([a-z]+)","([^"]+)"/g)].map(m=>({id:m[1],title:m[2]}));
  assert.strictEqual(ids.length,6,"expected six sections, got "+JSON.stringify(ids));
  assert.deepStrictEqual(ids.map(s=>s.id),
    ["people","home","investments","cloud","backup","advanced"]);
  /* `useState({})` — every section closed, so the sheet opens as one short
     screen. An object with any `true` in it would defeat the point. */
  assert.ok(/const\[openSec,setOpenSec\]=useState\(\{\}\);/.test(settings),
    "sections must all start closed");
});

t("3 · `section` is a render helper, NOT a component",()=>{
  /* Declaring a component inside a component hands React a new type on every
     render, which remounts the subtree — every input in Settings would lose
     focus on each keystroke. The bug is invisible until someone types. */
  assert.ok(/const section=\(id,title,children\)=>\{/.test(settings),
    "section should be an arrow helper taking (id,title,children)");
  assert.ok(!/function Section\(|const Section=/.test(settings),
    "a capitalised Section component would be remounted on every render");
});

t("4 · the scroll lock is still taken exactly once",()=>{
  // Refcounted, and Settings is the outermost lock — it owns the saved scroll
  // position for every sheet opened on top of it. Two calls would leave the
  // body pinned after close.
  assert.strictEqual((settings.match(/useScrollLock\(/g)||[]).length,1,
    "SettingsModal must call useScrollLock exactly once");
  assert.ok(/useScrollLock\(true\)/.test(settings));
});

t("5 · nested dialogs are OUTSIDE every section",()=>{
  /* Collapsing a section unmounts its children. Unmounting an open sheet
     skips its cleanup, and useScrollLock's refcount is left holding the body
     — the page is then frozen with no visible dialog to close. */
  const lastSectionClose=settings.lastIndexOf("</>)}");
  assert.ok(lastSectionClose>0,"no section close found");
  for(const dialog of ["<SalaryArrivedSheet","<ConfirmDialog","<ImportPreviewSheet"])
    assert.ok(settings.indexOf(dialog)>lastSectionClose,
      `${dialog} must be rendered after the last section, not inside one`);
});

t("6 · errors and flash messages are reachable without expanding anything",()=>{
  const firstSection=settings.indexOf('{section("');
  assert.ok(firstSection>0);
  const preamble=settings.slice(0,firstSection);
  assert.ok(/\{msg&&/.test(preamble),
    "the flash message must render above the sections — it confirms a download or an import");
  assert.ok(/\{lastSyncError&&/.test(preamble),
    "a sync failure must be visible without opening a section, or you cannot know which to open");
  assert.ok(/setOpenSec\(s=>\(\{\.\.\.s,cloud:true\}\)\)/.test(preamble),
    "...and it should open the section that fixes it");
});

t("7 · the sticky header from v1.42.0 is untouched",()=>{
  // Phase 5 reworks the contents of the sheet that phase 1 made scrollable.
  assert.ok(settings.includes('className="sheet-head"'),"the sticky title bar is gone");
  const head=slice('<div className="sheet-head">',"</div>");
  assert.ok(/IconButton icon=\{I\.X\}/.test(head),"Close must stay in the sticky bar");
  assert.ok(!/minWidth:0|minHeight:0/.test(head),
    "Close keeps IconButton's 40x40 default — it was the smallest target in the app once");
});

console.log(`\n${n-fails}/${n} passed`);
process.exit(fails?1:0);
