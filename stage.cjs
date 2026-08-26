/* Stage the served files into ./site for a Cloudflare Pages deploy, and refuse
   to do it if the release is inconsistent.

   USAGE
     node stage.cjs && npx wrangler pages deploy site

   WHY THIS EXISTS (two reasons, both load-bearing)

   1. The repo is not the website. Only seven files are ever served; everything
      else — the 17 test runners, worker.js, wrangler.jsonc, docs/, .claude/ —
      is development tooling that has no business being published. GitHub Pages
      published all of it because it served the repo root. Staging makes the
      published surface an explicit, reviewable list.

   2. BUILD_ID lives in THREE places that must always match (index.html, sw.js,
      version.json). CLAUDE.md records this as a recurring hazard: sw.js's copy
      forms the cache name, so a mismatch strands returning users on an old
      cached build, and version.json is what the running app compares against to
      notice an update. Nothing checked it until now — the release just went out
      wrong. A deploy is the last moment it can be caught, so it is caught here
      and the deploy is blocked rather than warned about.

   Deliberately dependency-free so it can run before anything is installed, and
   deliberately NOT a parse check — that is parsecheck.cjs's job and it needs
   @babel/standalone. Run both. */
const fs=require("fs"),path=require("path");

const ROOT=__dirname;
const OUT=path.join(ROOT,"site");

/* The complete served surface. Verified against the source rather than
   guessed: index.html links only manifest.webmanifest and icon-180.png, the
   manifest references icon-192/512.png, sw.js's APP_SHELL lists './',
   './index.html' and './manifest.webmanifest' (the rest of APP_SHELL is
   CDN URLs), and the app fetches ./version.json for its update check.
   Adding a file the app serves and forgetting it here is the one way this
   script can be wrong — so it also fails if a listed file is missing. */
const SERVED=[
  "index.html",
  "sw.js",
  "manifest.webmanifest",
  "version.json",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  // Self-hosted webfonts (Technical Ledger redesign). @font-face in index.html
  // references ./fonts/*.woff2; sw.js's APP_SHELL precaches the same paths so
  // the app renders correctly offline on first load.
  "fonts/inter-400.woff2",
  "fonts/inter-500.woff2",
  "fonts/inter-600.woff2",
  "fonts/inter-700.woff2",
  "fonts/source-serif-4-600.woff2",
  "fonts/jetbrains-mono-400.woff2",
  "fonts/jetbrains-mono-500.woff2",
  "fonts/jetbrains-mono-600.woff2",
];

const die=msg=>{console.error("\n  STAGE FAILED — "+msg+"\n");process.exit(1);};

/* ── 1. the three BUILD_ID sites must agree ─────────────────────────────── */
const read=f=>{
  const p=path.join(ROOT,f);
  if(!fs.existsSync(p))die(`${f} is missing from the repo.`);
  return fs.readFileSync(p,"utf8");
};

const html=read("index.html");
const sw=read("sw.js");
const versionRaw=read("version.json");

const grab=(src,re,what)=>{
  const m=src.match(re);
  if(!m)die(`couldn't find ${what} — did the declaration move or change shape?`);
  return m[1];
};

const htmlVersion=grab(html,/const APP_VERSION="([^"]+)"/,"APP_VERSION in index.html");
const htmlBuild  =grab(html,/const BUILD_ID="([^"]+)"/,   "BUILD_ID in index.html");
const swBuild    =grab(sw,  /const BUILD_ID\s*=\s*'([^']+)'/,"BUILD_ID in sw.js");

let versionJson;
try{versionJson=JSON.parse(versionRaw);}
catch(e){die("version.json is not valid JSON: "+e.message);}

const problems=[];
if(htmlBuild!==swBuild)
  problems.push(`index.html BUILD_ID (${htmlBuild}) != sw.js BUILD_ID (${swBuild})`);
if(htmlBuild!==versionJson.buildId)
  problems.push(`index.html BUILD_ID (${htmlBuild}) != version.json buildId (${versionJson.buildId})`);
if(htmlVersion!==versionJson.version)
  problems.push(`index.html APP_VERSION (${htmlVersion}) != version.json version (${versionJson.version})`);

if(problems.length){
  die("the release is inconsistent — bump all three together:\n    "
    +problems.join("\n    ")
    +"\n\n  Sites: index.html (APP_VERSION/BUILD_ID), sw.js (BUILD_ID), version.json.");
}

/* ── 2. stage ───────────────────────────────────────────────────────────── */
/* Rebuilt from scratch every time. A stale file left behind from a previous
   release would be published silently, and Pages serves whatever is in the
   directory — there is no second chance to notice. */
fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});

let bytes=0;
for(const f of SERVED){
  const src=path.join(ROOT,f);
  if(!fs.existsSync(src))die(`${f} is listed as a served file but is missing.`);
  const dst=path.join(OUT,f);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
  bytes+=fs.statSync(src).size;
}

const kb=n=>(n/1024).toFixed(0)+" KB";
console.log(`\n  Staged ${SERVED.length} files into ./site  (${kb(bytes)})`);
console.log(`  Version ${htmlVersion} · Build ${htmlBuild} — all three sites agree`);
console.log(`\n  Next:  npx wrangler pages deploy site\n`);
