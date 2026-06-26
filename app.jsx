/* =========================================================================
   Allocation — salary & net worth planner (standalone, GitHub-Pages friendly)
   React + Recharts via CDN, no build step. JSX compiled in-browser by Babel.
   ========================================================================= */
const { useState, useEffect, useMemo, useRef, createElement: h } = React;
const _RC = (typeof Recharts !== 'undefined') ? Recharts : window.Recharts || {};
const { PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = _RC;

/* ---- tiny inline icon set (replaces lucide-react; same names used as comps) */
const Ic = (path, vb) => (p) =>
  h("svg", { width: p.size || 16, height: p.size || 16, viewBox: vb || "0 0 24 24",
    fill: "none", stroke: "currentColor", strokeWidth: p.strokeWidth || 2,
    strokeLinecap: "round", strokeLinejoin: "round", style: p.style }, path);
const I = {
  Plus: Ic([h("line",{key:1,x1:12,y1:5,x2:12,y2:19}),h("line",{key:2,x1:5,y1:12,x2:19,y2:12})]),
  X: Ic([h("line",{key:1,x1:18,y1:6,x2:6,y2:18}),h("line",{key:2,x1:6,y1:6,x2:18,y2:18})]),
  Trash: Ic([h("polyline",{key:1,points:"3 6 5 6 21 6"}),h("path",{key:2,d:"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"})]),
  Settings: Ic([h("circle",{key:1,cx:12,cy:12,r:3}),h("path",{key:2,d:"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"})]),
  Wallet: Ic([h("path",{key:1,d:"M21 12V7H5a2 2 0 0 1 0-4h14v4"}),h("path",{key:2,d:"M3 5v14a2 2 0 0 0 2 2h16v-5"}),h("path",{key:3,d:"M18 12a2 2 0 0 0 0 4h4v-4z"})]),
  Layers: Ic([h("polygon",{key:1,points:"12 2 2 7 12 12 22 7 12 2"}),h("polyline",{key:2,points:"2 17 12 22 22 17"}),h("polyline",{key:3,points:"2 12 12 17 22 12"})]),
  Target: Ic([h("circle",{key:1,cx:12,cy:12,r:10}),h("circle",{key:2,cx:12,cy:12,r:6}),h("circle",{key:3,cx:12,cy:12,r:2})]),
  Trending: Ic([h("polyline",{key:1,points:"23 6 13.5 15.5 8.5 10.5 1 18"}),h("polyline",{key:2,points:"17 6 23 6 23 12"})]),
  Gem: Ic([h("path",{key:1,d:"M6 3h12l4 6-10 13L2 9z"}),h("path",{key:2,d:"M11 3 8 9l4 13 4-13-3-6"}),h("path",{key:3,d:"M2 9h20"})]),
  Swap: Ic([h("polyline",{key:1,points:"17 1 21 5 17 9"}),h("path",{key:2,d:"M3 11V9a4 4 0 0 1 4-4h14"}),h("polyline",{key:3,points:"7 23 3 19 7 15"}),h("path",{key:4,d:"M21 13v2a4 4 0 0 1-4 4H3"})]),
  Pie: Ic([h("path",{key:1,d:"M21.21 15.89A10 10 0 1 1 8 2.83"}),h("path",{key:2,d:"M22 12A10 10 0 0 0 12 2v10z"})]),
  Bank: Ic([h("line",{key:1,x1:3,y1:22,x2:21,y2:22}),h("line",{key:2,x1:6,y1:18,x2:6,y2:11}),h("line",{key:3,x1:10,y1:18,x2:10,y2:11}),h("line",{key:4,x1:14,y1:18,x2:14,y2:11}),h("line",{key:5,x1:18,y1:18,x2:18,y2:11}),h("polygon",{key:6,points:"12 2 20 7 4 7"})]),
  Users: Ic([h("path",{key:1,d:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"}),h("circle",{key:2,cx:9,cy:7,r:4}),h("path",{key:3,d:"M23 21v-2a4 4 0 0 0-3-3.87"}),h("path",{key:4,d:"M16 3.13a4 4 0 0 1 0 7.75"})]),
  Refresh: Ic([h("polyline",{key:1,points:"23 4 23 10 17 10"}),h("polyline",{key:2,points:"1 20 1 14 7 14"}),h("path",{key:3,d:"M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"})]),
  Check: Ic([h("polyline",{key:1,points:"20 6 9 17 4 12"})]),
  Chevron: Ic([h("polyline",{key:1,points:"6 9 12 15 18 9"})]),
  Brief: Ic([h("rect",{key:1,x:2,y:7,width:20,height:14,rx:2}),h("path",{key:2,d:"M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"})]),
  Cloud: Ic([h("path",{key:1,d:"M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"})]),
  Download: Ic([h("path",{key:1,d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),h("polyline",{key:2,points:"7 10 12 15 17 10"}),h("line",{key:3,x1:12,y1:15,x2:12,y2:3})]),
  Upload: Ic([h("path",{key:1,d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}),h("polyline",{key:2,points:"17 8 12 3 7 8"}),h("line",{key:3,x1:12,y1:3,x2:12,y2:15})]),
  Reset: Ic([h("polyline",{key:1,points:"1 4 1 10 7 10"}),h("path",{key:2,d:"M3.51 15a9 9 0 1 0 2.13-9.36L1 10"})]),
};

/* ---- palette object kept for inline style refs ---- */
const P = {
  bg:"#E8EDF4", ink:"#15243B", sub:"#56657E", faint:"#8A98AD",
  line:"#D2DBE7", surface:"#FFFFFF", surfaceAlt:"#F0F4F9",
  green:"#2C5FA8", greenDeep:"#1B3E73", greenSoft:"#E2EAF6",
  brass:"#2E8BB0", brassSoft:"#E0EEF4", danger:"#C2533F",
};
const SEG = ["#2C5FA8","#6FA0D6","#1B3E73","#2E8BB0","#4C6E9C","#8FB4DD",
  "#173B5E","#5BA7C2","#3D5A86","#7E97C4","#2A6F8E","#9DB8D9",
  "#244C7A","#4F8FB0","#6678A8","#87A9CE"];

/* ---- helpers ---- */
const uid = () => Math.random().toString(36).slice(2, 9);
const STORAGE_KEY = "salaryPlanner:v2";
const monthLabel = () => new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"});
const CCY_NAME = {
  USD:"US Dollar", SAR:"Saudi Riyal", PHP:"Philippine Peso", EUR:"Euro",
  GBP:"British Pound", AED:"UAE Dirham", JPY:"Japanese Yen", INR:"Indian Rupee",
  AUD:"Australian Dollar", CAD:"Canadian Dollar", SGD:"Singapore Dollar",
};
const FX_CODES = ["USD","SAR","PHP","AED","EUR","GBP","JPY","INR","AUD","CAD","SGD"];
const BANK_CCY = ["SAR","PHP","USD","AED","EUR","GBP"];
const COUNTRIES = [["SA","Saudi Arabia"],["PH","Philippines"],["Other","Other"]];

/* =========================================================================
   LIVE FX  — free, no key, CORS-friendly. Tries two public endpoints.
   Returns { rates, at } where rates[code] = units of `code` per 1 USD.
   ========================================================================= */
async function fetchRates() {
  // Endpoint 1: open.er-api.com (free, no key, returns USD-based rates)
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (r.ok) {
      const j = await r.json();
      if (j && j.rates && j.rates.USD) {
        const rates = {};
        FX_CODES.forEach((c) => { if (j.rates[c] != null) rates[c] = j.rates[c]; });
        rates.USD = 1;
        return { rates, at: Date.now() };
      }
    }
  } catch (e) { /* fall through */ }

  // Endpoint 2: frankfurter.app (free, no key; EUR-based -> rebase to USD)
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=" +
      FX_CODES.filter((c) => c !== "USD").join(","));
    if (r.ok) {
      const j = await r.json();
      if (j && j.rates) {
        const rates = { USD: 1, ...j.rates };
        return { rates, at: Date.now() };
      }
    }
  } catch (e) { /* fall through */ }

  throw new Error("no rates");
}

/* =========================================================================
   LIVE STOCK QUOTES — free, no key. Uses Stooq CSV (CORS-open).
   Stooq symbol convention: US tickers get ".us" suffix, e.g. aapl.us
   Returns { TICKER: priceUSD, ... }
   ========================================================================= */
// Finnhub free API key — get yours free at https://finnhub.io
const FINNHUB_API_KEY = "d8v0c6hr01qrt65ul4k0d8v0c6hr01qrt65ul4kg";

async function fetchQuotes(tickers) {
  const out = {};
  if (!FINNHUB_API_KEY.startsWith("PASTE_")) {
    await Promise.all(tickers.map(async (t) => {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t.toUpperCase())}&token=${FINNHUB_API_KEY}`
        );
        if (!r.ok) return;
        const j = await r.json();
        const price = j.c && j.c > 0 ? j.c : (j.pc && j.pc > 0 ? j.pc : null);
        if (price) out[t.toUpperCase()] = price;
      } catch (e) {}
    }));
    if (Object.keys(out).length > 0) return out;
  }
  await Promise.all(tickers.map(async (t) => {
    if (out[t.toUpperCase()]) return;
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.toUpperCase())}?interval=1d&range=1d`
      );
      if (!r.ok) return;
      const j = await r.json();
      const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) out[t.toUpperCase()] = price;
    } catch (e) {}
  }));
  if (Object.keys(out).length === 0) throw new Error("no quotes");
  return out;
}

/* compound growth: lump sum + monthly contributions, monthly compounding */
function projectSeries(start, monthly, years, annualPct) {
  const r = annualPct / 100 / 12;
  const out = [];
  for (let y = 0; y <= years; y++) {
    const m = y * 12;
    const fv = r === 0 ? start + monthly * m
      : start * Math.pow(1 + r, m) + monthly * ((Math.pow(1 + r, m) - 1) / r);
    out.push(Math.round(fv));
  }
  return out;
}

/* =========================================================================
   DEFAULT DATA — now with per-owner banks & goals (you + wife)
   owner: "me" | "wife"  on banks and goals
   ========================================================================= */
function defaultData() {
  const groups = [
    { id:"g1", name:"Invest & Grow" }, { id:"g2", name:"Savings" },
    { id:"g3", name:"Essentials" }, { id:"g4", name:"Personal" },
    { id:"g5", name:"Commitments" },
  ];
  const seed = [
    ["Investment (GoTrade)",3300,"g1"],["Long Term Savings",2750,"g1"],
    ["Savings (Seabank)",4796,"g2"],["Misc. Savings",350,"g2"],
    ["Bills",4200,"g3"],["Subscriptions",209,"g3"],["Postpaid Bill",90,"g3"],
    ["Allowance",1305,"g4"],["Shopping",1250,"g4"],["Gym",750,"g4"],
    ["Charlene",750,"g4"],["Braces",150,"g4"],
    ["Toyota Raize",1100,"g5"],["Tuition Fee Wife",1000,"g5"],
  ];
  const categories = seed.map(([name,amount,groupId],i)=>(
    { id:uid(), name, amount, groupId, color:SEG[i%SEG.length] }));
  return {
    currency:"SAR",
    owners:{ me:"Me", wife:"My wife" },
    activePlanId:"p1",
    plans:[{ id:"p1", name:"Monthly Salary", month:monthLabel(), income:22000, groups, categories }],
    goals:[
      { id:uid(), owner:"me",   name:"Emergency Fund", target:60000, saved:18500, monthly:2000, color:P.green },
      { id:uid(), owner:"me",   name:"Family Trip",    target:25000, saved:6000,  monthly:1000, color:P.brass },
      { id:uid(), owner:"wife", name:"New Laptop",     target:8000,  saved:1500,  monthly:500,  color:SEG[4] },
    ],
    investments:[
      { id:uid(), ticker:"AAPL", name:"Apple Inc.",        broker:"IBKR",   shares:10, avgCost:180, price:230 },
      { id:uid(), ticker:"VOO",  name:"Vanguard S&P 500",  broker:"GoTrade",shares:5,  avgCost:420, price:560 },
    ],
    projection:{ monthly:1500, years:20 },
    banks:[
      { id:uid(), owner:"me",   name:"Salary account", bank:"Al Rajhi Bank", country:"SA", currency:"SAR", balance:12000 },
      { id:uid(), owner:"me",   name:"Savings",        bank:"BDO",           country:"PH", currency:"PHP", balance:150000 },
      { id:uid(), owner:"wife", name:"Personal",       bank:"Al Rajhi Bank", country:"SA", currency:"SAR", balance:4000 },
    ],
    assets:[
      { id:uid(), name:"Toyota Raize", kind:"asset",     currency:"SAR", value:85000 },
      { id:uid(), name:"Car loan",     kind:"liability", currency:"SAR", value:35000 },
    ],
    history:[],
    household:{ splitMine:50, expenses:[
      { id:uid(), name:"Rent",      amount:2000, color:SEG[0] },
      { id:uid(), name:"Transport", amount:500,  color:SEG[3] },
      { id:uid(), name:"Groceries", amount:1200, color:SEG[5] },
      { id:uid(), name:"Utilities", amount:400,  color:SEG[8] },
    ]},
  };
}

/* migrate old saved data so nothing breaks for existing users */
function migrate(d) {
  if (!d || typeof d !== "object") return defaultData();
  if (!d.owners) d.owners = { me:"Me", wife:"My wife" };
  (d.banks || []).forEach((b) => { if (!b.owner) b.owner = "me"; });
  (d.goals || []).forEach((g) => { if (!g.owner) g.owner = "me"; });
  return d;
}

/* =========================================================================
   GOOGLE DRIVE SYNC
   Stores one JSON file ("allocation-data.json") in the user's Drive appData
   space (private to this app). Both spouses sign into the SAME Google account
   to share, OR share the file — simplest is one shared Google account.
   Uses Google Identity Services token client (no backend needed).
   Set your OAuth Client ID below after the setup steps in the guide.
   ========================================================================= */
const GOOGLE_CLIENT_ID = "162677799244-aobgmvtfsdb5resdf06pao8vn47a18ln.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_FILENAME = "allocation-data.json";

const Drive = {
  token: null,
  tokenClient: null,
  fileId: null,
  ready: false,

  init() {
    if (this.ready) return true;
    if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
    if (GOOGLE_CLIENT_ID.startsWith("PASTE_")) return false;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: () => {},   // set per-request
    });
    this.ready = true;
    return true;
  },

  signIn() {
    return new Promise((resolve, reject) => {
      if (!this.init()) return reject(new Error("Google sign-in not configured"));
      this.tokenClient.callback = (resp) => {
        if (resp && resp.access_token) { this.token = resp.access_token; resolve(resp.access_token); }
        else reject(new Error("sign-in failed"));
      };
      this.tokenClient.requestAccessToken({ prompt: this.token ? "" : "consent" });
    });
  },

  signOut() {
    if (this.token && window.google) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null; this.fileId = null;
  },

  async _findFile() {
    const q = encodeURIComponent(`name='${DRIVE_FILENAME}'`);
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: "Bearer " + this.token } });
    const j = await r.json();
    if (j.files && j.files.length) { this.fileId = j.files[0].id; return j.files[0]; }
    return null;
  },

  async load() {
    await this._findFile();
    if (!this.fileId) return null;
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`,
      { headers: { Authorization: "Bearer " + this.token } });
    if (!r.ok) return null;
    return await r.json();
  },

  async save(data) {
    const meta = { name: DRIVE_FILENAME, mimeType: "application/json" };
    const body = JSON.stringify(data);
    if (!this.fileId) await this._findFile();

    if (this.fileId) {
      // update existing
      await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media`,
        { method: "PATCH",
          headers: { Authorization: "Bearer " + this.token, "Content-Type": "application/json" },
          body });
    } else {
      // create new in appDataFolder
      const boundary = "-------alloc" + uid();
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ ...meta, parents: ["appDataFolder"] }) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        body + `\r\n--${boundary}--`;
      const r = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        { method: "POST",
          headers: { Authorization: "Bearer " + this.token,
            "Content-Type": `multipart/related; boundary=${boundary}` },
          body: multipart });
      const j = await r.json();
      this.fileId = j.id;
    }
  },
};

/* =========================================================================
   MAIN APP
   ========================================================================= */
function App() {
  const [data, setData] = useState(defaultData);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("budget");
  const [editPct, setEditPct] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [planMenu, setPlanMenu] = useState(false);

  /* sync state */
  const [signedIn, setSignedIn] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const skipNextSave = useRef(false);

  /* ---- load from localStorage once ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(migrate(JSON.parse(raw)));
    } catch (e) {}
    setLoaded(true);
    if (typeof window.__hideLoading === 'function') window.__hideLoading();
  }, []);

  /* ---- persist to localStorage + (if signed in) Drive, debounced ---- */
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    const t = setTimeout(async () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
      if (signedIn) {
        try { setSyncing(true); await Drive.save(data); setSyncMsg("Synced ✓"); }
        catch (e) { setSyncMsg("Sync failed — saved on this device"); }
        setSyncing(false);
        setTimeout(() => setSyncMsg(""), 2500);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [data, loaded, signedIn]);

  /* ---- Drive: connect & pull ---- */
  const connectDrive = async () => {
    try {
      setSyncing(true); setSyncMsg("Connecting…");
      await Drive.signIn();
      const remote = await Drive.load();
      if (remote && Array.isArray(remote.plans)) {
        skipNextSave.current = true;
        setData(migrate(remote));
        setSyncMsg("Loaded from Drive ✓");
      } else {
        await Drive.save(data);
        setSyncMsg("Drive connected ✓");
      }
      setSignedIn(true);
    } catch (e) {
      setSyncMsg(e.message === "Google sign-in not configured"
        ? "Add your Google Client ID first (see guide)"
        : "Couldn't connect to Drive");
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 4000);
  };
  const pullDrive = async () => {
    try {
      setSyncing(true); setSyncMsg("Pulling latest…");
      const remote = await Drive.load();
      if (remote && Array.isArray(remote.plans)) {
        skipNextSave.current = true;
        setData(migrate(remote));
        setSyncMsg("Up to date ✓");
      } else setSyncMsg("Nothing saved in Drive yet");
    } catch (e) { setSyncMsg("Pull failed"); }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 3000);
  };
  const disconnectDrive = () => { Drive.signOut(); setSignedIn(false); setSyncMsg("Disconnected"); setTimeout(()=>setSyncMsg(""),2000); };

  const plan = data.plans.find((p) => p.id === data.activePlanId) || data.plans[0];
  const cur = data.currency;

  /* ---- plan mutators ---- */
  const patchPlan = (patch) =>
    setData((d) => ({ ...d, plans: d.plans.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)) }));
  const setCategories = (cats) => patchPlan({ categories: cats });
  const setGroups = (groups) => patchPlan({ groups });
  const updateCat = (id, patch) => setCategories(plan.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCat = (groupId) => setCategories([...plan.categories,
    { id:uid(), name:"New category", amount:0, groupId, color:SEG[plan.categories.length % SEG.length] }]);
  const removeCat = (id) => setCategories(plan.categories.filter((c) => c.id !== id));
  const addGroup = () => setGroups([...plan.groups, { id:uid(), name:"New group" }]);
  const renameGroup = (id, name) => setGroups(plan.groups.map((g) => (g.id === id ? { ...g, name } : g)));
  const removeGroup = (id) => { setCategories(plan.categories.filter((c) => c.groupId !== id)); setGroups(plan.groups.filter((g) => g.id !== id)); };

  const addPlan = () => { const id = uid(); setData((d) => ({ ...d, activePlanId:id,
    plans:[...d.plans, { id, name:"New plan", month:monthLabel(), income:0, groups:[{id:uid(),name:"General"}], categories:[] }] })); setPlanMenu(false); };
  const removePlan = (id) => setData((d) => { if (d.plans.length <= 1) return d;
    const plans = d.plans.filter((p) => p.id !== id); return { ...d, plans, activePlanId:plans[0].id }; });
  const renamePlan = (id, name) => setData((d) => ({ ...d, plans:d.plans.map((p) => (p.id === id ? { ...p, name } : p)) }));

  /* ---- goals (now per-owner) ---- */
  const addGoal = (owner) => setData((d) => ({ ...d, goals:[...d.goals,
    { id:uid(), owner, name:"New goal", target:10000, saved:0, monthly:500, color:SEG[d.goals.length % SEG.length] }] }));
  const updateGoal = (id, patch) => setData((d) => ({ ...d, goals:d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const removeGoal = (id) => setData((d) => ({ ...d, goals:d.goals.filter((g) => g.id !== id) }));

  /* ---- investments ---- */
  const invs = data.investments || [];
  const addInv = () => setData((d) => ({ ...d, investments:[...(d.investments || []),
    { id:uid(), ticker:"", name:"", broker:"IBKR", shares:0, avgCost:0, price:0 }] }));
  const updateInv = (id, patch) => setData((d) => ({ ...d, investments:(d.investments || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const removeInv = (id) => setData((d) => ({ ...d, investments:(d.investments || []).filter((x) => x.id !== id) }));
  const setProjection = (patch) => setData((d) => ({ ...d, projection:{ ...(d.projection || { monthly:1500, years:20 }), ...patch } }));

  /* ---- live FX ---- */
  const [rates, setRates] = useState(null);
  const [ratesAt, setRatesAt] = useState(null);
  const [ratesErr, setRatesErr] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const loadRates = async () => {
    setRatesLoading(true); setRatesErr(false);
    try { const { rates:r, at } = await fetchRates(); setRates(r); setRatesAt(at); }
    catch (e) { setRatesErr(true); }
    setRatesLoading(false);
  };
  useEffect(() => { loadRates(); }, []);
  const convert = (amt, from, to) => {
    if (!rates || !rates[from] || !rates[to]) return null;
    return ((Number(amt) || 0) / rates[from]) * rates[to];
  };
  const sarRate = rates && rates.SAR ? rates.SAR : null;

  /* ---- banks (per-owner) ---- */
  const banks = data.banks || [];
  const addBank = (owner) => setData((d) => ({ ...d, banks:[...(d.banks || []),
    { id:uid(), owner, name:"New account", bank:"", country:"SA", currency:"SAR", balance:0 }] }));
  const updateBank = (id, patch) => setData((d) => ({ ...d, banks:(d.banks || []).map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const removeBank = (id) => setData((d) => ({ ...d, banks:(d.banks || []).filter((b) => b.id !== id) }));

  /* ---- assets & liabilities ---- */
  const assets = data.assets || [];
  const addAsset = (kind) => setData((d) => ({ ...d, assets:[...(d.assets || []),
    { id:uid(), name:kind === "liability" ? "New liability" : "New asset", kind, currency:"SAR", value:0 }] }));
  const updateAsset = (id, patch) => setData((d) => ({ ...d, assets:(d.assets || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const removeAsset = (id) => setData((d) => ({ ...d, assets:(d.assets || []).filter((a) => a.id !== id) }));

  /* ---- net worth (everything in SAR) ---- */
  const sarOf = (amt, ccy) => { const v = convert(amt, ccy, "SAR"); return v == null ? 0 : v; };
  const banksSar = banks.reduce((s, b) => s + sarOf(b.balance, b.currency), 0);
  const invSar = (data.investments || []).reduce((s, hld) => s + (Number(hld.shares) || 0) * (Number(hld.price) || 0), 0) * (sarRate || 0);
  const assetSar = assets.filter((a) => a.kind === "asset").reduce((s, a) => s + sarOf(a.value, a.currency), 0);
  const liabSar = assets.filter((a) => a.kind === "liability").reduce((s, a) => s + sarOf(a.value, a.currency), 0);
  const netWorth = banksSar + invSar + assetSar - liabSar;

  /* ---- history snapshots ---- */
  const history = data.history || [];
  const captureSnapshot = () => {
    const month = new Date().toISOString().slice(0, 7);
    const snap = { id:uid(), month, net:Math.round(netWorth), banks:Math.round(banksSar),
      investments:Math.round(invSar), assets:Math.round(assetSar), liabilities:Math.round(liabSar) };
    setData((d) => { const rest = (d.history || []).filter((hh) => hh.month !== month);
      return { ...d, history:[...rest, snap].sort((a, b) => a.month.localeCompare(b.month)) }; });
  };
  const addPastSnapshot = (month, net) => setData((d) => { const rest = (d.history || []).filter((hh) => hh.month !== month);
    return { ...d, history:[...rest, { id:uid(), month, net:Math.round(net), banks:0, investments:0, assets:0, liabilities:0 }].sort((a, b) => a.month.localeCompare(b.month)) }; });
  const removeSnapshot = (id) => setData((d) => ({ ...d, history:(d.history || []).filter((hh) => hh.id !== id) }));

  /* ---- household ---- */
  const household = data.household || { splitMine:50, expenses:[] };
  const setSplit = (v) => setData((d) => ({ ...d, household:{ ...(d.household || { splitMine:50, expenses:[] }), splitMine:v } }));
  const addExpense = () => setData((d) => { const hh = d.household || { splitMine:50, expenses:[] };
    return { ...d, household:{ ...hh, expenses:[...hh.expenses, { id:uid(), name:"New expense", amount:0, color:SEG[hh.expenses.length % SEG.length] }] } }; });
  const updateExpense = (id, patch) => setData((d) => { const hh = d.household;
    return { ...d, household:{ ...hh, expenses:hh.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) } }; });
  const removeExpense = (id) => setData((d) => { const hh = d.household;
    return { ...d, household:{ ...hh, expenses:hh.expenses.filter((e) => e.id !== id) } }; });

  /* ---- owners ---- */
  const setOwnerName = (key, name) => setData((d) => ({ ...d, owners:{ ...d.owners, [key]:name } }));

  /* ---- derived ---- */
  const allocated = useMemo(() => plan.categories.reduce((s, c) => s + (Number(c.amount) || 0), 0), [plan]);
  const remaining = (Number(plan.income) || 0) - allocated;
  const fmt = (n) => `${cur} ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
  const pct = (n) => (plan.income > 0 ? ((Number(n) || 0) / plan.income) * 100 : 0);

  /* ---- render ---- */
  const TABS = [
    ["budget","Budget",I.Wallet],["household","Household",I.Users],
    ["banks","Banks",I.Bank],["investments","Investments",I.Trending],
    ["networth","Net Worth",I.Gem],["goals","Goals",I.Target],
    ["currency","Currency",I.Swap],["overview","Overview",I.Pie],
  ];

  return (
    <div style={{ background:P.bg, color:P.ink, minHeight:"100vh" }} className="w-full">
      <div style={{ maxWidth:920, margin:"0 auto", padding:"0 16px 64px" }}>

        {/* header */}
        <header style={{ paddingTop:28, paddingBottom:16 }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, color:P.green }}>
              <I.Wallet size={18} strokeWidth={2.2} />
              <span style={{ fontSize:12, fontWeight:600, letterSpacing:"0.18em", textTransform:"uppercase" }}>Allocation</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <SyncPill {...{ signedIn, syncing, syncMsg, connectDrive, pullDrive }} />
              <button onClick={() => setShowSettings(true)} title="Settings"
                style={{ borderRadius:999, padding:8, color:P.sub, background:"transparent", border:"none" }}>
                <I.Settings size={18} />
              </button>
            </div>
          </div>

          {/* plan selector + income */}
          <div style={{ marginTop:16, display:"flex", flexWrap:"wrap", alignItems:"flex-end", justifyContent:"space-between", gap:16 }}>
            <div style={{ position:"relative" }}>
              <button onClick={() => setPlanMenu((v) => !v)}
                style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:500, borderRadius:999, padding:"4px 10px", background:P.surface, border:`1px solid ${P.line}`, color:P.sub }}>
                <I.Layers size={13} /> {plan.name} <I.Chevron size={13} />
              </button>
              {planMenu && (
                <div style={{ position:"absolute", zIndex:20, marginTop:4, borderRadius:12, padding:"4px 0", boxShadow:"0 8px 28px rgba(12,22,40,.18)", background:P.surface, border:`1px solid ${P.line}`, minWidth:260 }}>
                  {data.plans.map((p) => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px" }}>
                      <button onClick={() => setData((d) => ({ ...d, activePlanId:p.id }))} title="Switch"
                        style={{ flexShrink:0, borderRadius:999, padding:4, background:"transparent", border:"none", color:p.id === plan.id ? P.green : P.faint }}>
                        {p.id === plan.id ? <I.Check size={15} /> : <I.Layers size={14} />}
                      </button>
                      <input value={p.name} onChange={(e) => renamePlan(p.id, e.target.value)} className="bare" style={{ flex:1, fontSize:14 }} />
                      {data.plans.length > 1 && (
                        <button onClick={() => removePlan(p.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.5 }}><I.X size={14} /></button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPlan} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"6px 10px", fontSize:13, color:P.green, background:"transparent", border:"none" }}>
                    <I.Plus size={14} /> New plan
                  </button>
                </div>
              )}
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:P.faint, textTransform:"uppercase", letterSpacing:".1em" }}>{plan.month} · Income</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, justifyContent:"flex-end" }}>
                <span style={{ fontSize:14, color:P.sub }}>{cur}</span>
                <input type="number" value={plan.income} onChange={(e) => patchPlan({ income:Number(e.target.value) })}
                  className="bare tabular-nums serif" style={{ fontSize:30, fontWeight:600, width:170, textAlign:"right", color:P.ink }} />
              </div>
            </div>
          </div>
        </header>

        {/* tabs */}
        <nav style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:20 }}>
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              style={tab === id
                ? { display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"6px 14px", fontSize:14, fontWeight:500, background:P.ink, color:"#fff", border:"none" }
                : { display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"6px 14px", fontSize:14, fontWeight:500, background:P.surface, color:P.sub, border:`1px solid ${P.line}` }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </nav>

        {/* views */}
        {tab === "budget" && <BudgetView {...{ plan, fmt, pct, cur, editPct, setEditPct, updateCat, addCat, removeCat, addGroup, renameGroup, removeGroup, allocated, remaining }} />}
        {tab === "household" && <HouseholdView {...{ household, setSplit, addExpense, updateExpense, removeExpense, fmt, owners:data.owners }} />}
        {tab === "banks" && <BanksView {...{ banks, addBank, updateBank, removeBank, convert, sarRate, owners:data.owners }} />}
        {tab === "networth" && <NetWorthView {...{ netWorth, banksSar, invSar, assetSar, liabSar, sarRate, convert, ratesErr, assets, addAsset, updateAsset, removeAsset, history, captureSnapshot, addPastSnapshot, removeSnapshot }} />}
        {tab === "investments" && <InvestmentsView {...{ invs, addInv, updateInv, removeInv, sarRate, projection:data.projection || { monthly:1500, years:20 }, setProjection }} />}
        {tab === "currency" && <CurrencyView {...{ rates, ratesAt, ratesErr, ratesLoading, onRefresh:loadRates, convert }} />}
        {tab === "goals" && <GoalsView {...{ goals:data.goals, fmt, addGoal, updateGoal, removeGoal, owners:data.owners }} />}
        {tab === "overview" && <OverviewView {...{ plan, data, fmt, pct, allocated, remaining }} />}
      </div>

      {showSettings && <SettingsModal {...{ data, setData, onClose:() => setShowSettings(false), signedIn, connectDrive, pullDrive, disconnectDrive, setOwnerName, owners:data.owners }} />}
    </div>
  );
}

/* ---- sync pill in header ---- */
function SyncPill({ signedIn, syncing, syncMsg, connectDrive, pullDrive }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      {syncMsg && <span style={{ fontSize:11, color:P.sub }}>{syncMsg}</span>}
      <button onClick={signedIn ? pullDrive : connectDrive} title={signedIn ? "Pull latest from Drive" : "Connect Google Drive to sync"}
        style={{ display:"flex", alignItems:"center", gap:5, borderRadius:999, padding:"5px 10px", fontSize:12, fontWeight:500,
          background:signedIn ? P.greenSoft : P.surface, color:signedIn ? P.greenDeep : P.sub, border:`1px solid ${signedIn ? P.greenSoft : P.line}` }}>
        <I.Cloud size={13} style={syncing ? { animation:"spin .9s linear infinite" } : null} />
        {signedIn ? "Synced" : "Sync"}
      </button>
    </div>
  );
}

/* =========================================================================
   BUDGET VIEW
   ========================================================================= */
function BudgetView({ plan, fmt, pct, cur, editPct, setEditPct, updateCat, addCat, removeCat, addGroup, renameGroup, removeGroup, allocated, remaining }) {
  const card = { background:P.surface, border:`1px solid ${P.line}`, borderRadius:16 };
  return (
    <div>
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:P.sub }}>Allocated {fmt(allocated)}</span>
          <span style={{ fontSize:13, fontWeight:600, color:remaining < 0 ? P.danger : P.green }}>
            {remaining < 0 ? "Over by " : "Left "} {fmt(Math.abs(remaining))}
          </span>
        </div>
        <div style={{ marginTop:10, height:10, background:P.surfaceAlt, borderRadius:999, overflow:"hidden", display:"flex" }}>
          {plan.categories.map((c) => (
            <div key={c.id} style={{ width:`${pct(c.amount)}%`, background:c.color }} title={c.name} />
          ))}
        </div>
        <div style={{ marginTop:8 }}>
          <button onClick={() => setEditPct(!editPct)} style={{ fontSize:11, color:P.faint, background:"transparent", border:"none" }}>
            {editPct ? "Show amounts" : "Show percentages"}
          </button>
        </div>
      </div>

      {plan.groups.map((g) => {
        const items = plan.categories.filter((c) => c.groupId === g.id);
        const sub = items.reduce((s, c) => s + (Number(c.amount) || 0), 0);
        return (
          <section key={g.id} style={{ ...card, overflow:"hidden", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:P.surfaceAlt, borderBottom:`1px solid ${P.line}` }}>
              <input value={g.name} onChange={(e) => renameGroup(g.id, e.target.value)} className="bare" style={{ fontSize:14, fontWeight:600, color:P.ink }} />
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:P.sub }} className="tabular-nums">{fmt(sub)}</span>
                <button onClick={() => removeGroup(g.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.4 }}><I.Trash size={14} /></button>
              </div>
            </div>
            {items.map((c) => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:`1px solid ${P.surfaceAlt}` }}>
                <span style={{ width:10, height:10, borderRadius:999, background:c.color, flexShrink:0 }} />
                <input value={c.name} onChange={(e) => updateCat(c.id, { name:e.target.value })} className="bare" style={{ flex:1, fontSize:14, minWidth:0 }} />
                {editPct ? (
                  <span className="tabular-nums" style={{ fontSize:13, color:P.sub, width:64, textAlign:"right" }}>{pct(c.amount).toFixed(1)}%</span>
                ) : (
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:11, color:P.faint }}>{cur}</span>
                    <input type="number" value={c.amount} onChange={(e) => updateCat(c.id, { amount:Number(e.target.value) })}
                      className="bare tabular-nums" style={{ width:92, textAlign:"right", fontSize:14, fontWeight:600 }} />
                  </div>
                )}
                <button onClick={() => removeCat(c.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.3 }}><I.X size={15} /></button>
              </div>
            ))}
            <button onClick={() => addCat(g.id)} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.green, background:"transparent", border:"none" }}>
              <I.Plus size={14} /> Add category
            </button>
          </section>
        );
      })}

      <button onClick={addGroup} style={{ display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"8px 14px", fontSize:14, fontWeight:500, background:P.surface, border:`1px dashed ${P.line}`, color:P.green }}>
        <I.Plus size={14} /> Add group
      </button>
    </div>
  );
}

/* =========================================================================
   HOUSEHOLD VIEW
   ========================================================================= */
function HouseholdView({ household, setSplit, addExpense, updateExpense, removeExpense, fmt, owners }) {
  const total = household.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const mine = total * (household.splitMine / 100);
  const theirs = total - mine;
  const card = { background:P.surface, border:`1px solid ${P.line}`, borderRadius:16 };
  return (
    <div>
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:P.sub, marginBottom:10 }}>Shared monthly expenses · {fmt(total)}</div>
        <div style={{ display:"flex", gap:12, marginBottom:12 }}>
          <div style={{ flex:1, background:P.greenSoft, borderRadius:12, padding:12 }}>
            <div style={{ fontSize:11, color:P.greenDeep }}>{owners.me} pays ({household.splitMine}%)</div>
            <div className="serif tabular-nums" style={{ fontSize:22, fontWeight:600, color:P.greenDeep }}>{fmt(mine)}</div>
          </div>
          <div style={{ flex:1, background:P.brassSoft, borderRadius:12, padding:12 }}>
            <div style={{ fontSize:11, color:P.brass }}>{owners.wife} pays ({100 - household.splitMine}%)</div>
            <div className="serif tabular-nums" style={{ fontSize:22, fontWeight:600, color:P.brass }}>{fmt(theirs)}</div>
          </div>
        </div>
        <input type="range" min="0" max="100" value={household.splitMine} onChange={(e) => setSplit(Number(e.target.value))} style={{ width:"100%" }} />
      </div>

      <section style={{ ...card, overflow:"hidden" }}>
        {household.expenses.map((e) => (
          <div key={e.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:`1px solid ${P.surfaceAlt}` }}>
            <span style={{ width:10, height:10, borderRadius:999, background:e.color, flexShrink:0 }} />
            <input value={e.name} onChange={(ev) => updateExpense(e.id, { name:ev.target.value })} className="bare" style={{ flex:1, fontSize:14 }} />
            <input type="number" value={e.amount} onChange={(ev) => updateExpense(e.id, { amount:Number(ev.target.value) })}
              className="bare tabular-nums" style={{ width:92, textAlign:"right", fontSize:14, fontWeight:600 }} />
            <button onClick={() => removeExpense(e.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.3 }}><I.X size={15} /></button>
          </div>
        ))}
        <button onClick={addExpense} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.green, background:"transparent", border:"none" }}>
          <I.Plus size={14} /> Add shared expense
        </button>
      </section>
    </div>
  );
}

/* =========================================================================
   BANKS VIEW  — split into "You" and "Wife" sections
   ========================================================================= */
function BanksView({ banks, addBank, updateBank, removeBank, convert, sarRate, owners }) {
  const sar = (n) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
  const sarOf = (b) => { const v = convert(b.balance, b.currency, "SAR"); return v == null ? 0 : v; };
  const total = banks.reduce((s, b) => s + sarOf(b), 0);
  const usdTotal = sarRate ? Math.round(total / sarRate) : null;
  const phpTotal = convert ? convert(total, "SAR", "PHP") : null;

  const ownerKeys = ["me", "wife"];

  const AccountRow = (b) => (
    <div key={b.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${P.surfaceAlt}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <input value={b.name} placeholder="Account name" onChange={(e) => updateBank(b.id, { name:e.target.value })}
          className="bare" style={{ fontSize:14, fontWeight:600, flex:1, minWidth:0 }} />
        <button onClick={() => removeBank(b.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.4 }}><I.X size={15} /></button>
      </div>
      <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
        <input value={b.bank} placeholder="Bank" onChange={(e) => updateBank(b.id, { bank:e.target.value })} className="bare" style={{ fontSize:12, color:P.sub, width:110 }} />
        <select value={b.country} onChange={(e) => updateBank(b.id, { country:e.target.value })}
          style={{ borderRadius:999, padding:"2px 8px", fontSize:12, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.sub }}>
          {COUNTRIES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>
        <select value={b.currency} onChange={(e) => updateBank(b.id, { currency:e.target.value })}
          style={{ borderRadius:999, padding:"2px 8px", fontSize:12, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.sub }}>
          {BANK_CCY.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:12, color:P.faint }}>{b.currency}</span>
          <input type="number" value={b.balance} onChange={(e) => updateBank(b.id, { balance:Number(e.target.value) })}
            className="bare tabular-nums" style={{ width:100, textAlign:"right", fontSize:14, fontWeight:600 }} />
        </div>
      </div>
      {b.currency !== "SAR" && (
        <div className="tabular-nums" style={{ fontSize:12, textAlign:"right", marginTop:4, color:P.faint }}>= {sar(sarOf(b))}</div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ background:P.ink, color:"#fff", borderRadius:16, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:500, color:"#9DB0CC" }}>
          <I.Bank size={13} /> Cash across all accounts
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"baseline", gap:12, marginTop:4 }}>
          <span className="serif tabular-nums" style={{ fontSize:30, fontWeight:600 }}>{sar(total)}</span>
          <span className="tabular-nums" style={{ color:"#9DB0CC" }}>
            {usdTotal != null
              ? <span style={{ fontSize:14 }}>≈ ${usdTotal.toLocaleString("en-US")}</span>
              : <span style={{ fontSize:14, opacity:.7 }}>USD —</span>}
            {phpTotal != null
              ? <span style={{ fontSize:12, opacity:.85, marginLeft:10 }}>≈ ₱{Math.round(phpTotal).toLocaleString("en-US")}</span>
              : <span style={{ fontSize:12, opacity:.7, marginLeft:10 }}>PHP —</span>}
          </span>
        </div>
      </div>

      {ownerKeys.map((ok) => {
        const items = banks.filter((b) => b.owner === ok);
        const sub = items.reduce((s, b) => s + sarOf(b), 0);
        return (
          <section key={ok} style={{ marginBottom:16, borderRadius:16, overflow:"hidden", background:P.surface, border:`1px solid ${P.line}` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:`1px solid ${P.line}`, background:ok === "me" ? P.greenSoft : P.brassSoft }}>
              <span style={{ fontSize:14, fontWeight:600, color:ok === "me" ? P.greenDeep : P.brass }}>{owners[ok]}</span>
              <span className="tabular-nums" style={{ fontSize:14, fontWeight:600, color:P.sub }}>{sar(sub)}</span>
            </div>
            {items.map(AccountRow)}
            <button onClick={() => addBank(ok)} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.green, background:"transparent", border:"none" }}>
              <I.Plus size={14} /> Add {owners[ok]}'s account
            </button>
          </section>
        );
      })}

      {!sarRate && (
        <div style={{ marginTop:8, fontSize:12, color:P.danger }}>
          Live rates aren't loaded yet, so non-SAR balances can't be converted. Open the Currency tab and tap refresh.
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   NET WORTH VIEW  — PHP & USD now always shown (with — placeholder while
   rates load) instead of silently disappearing.
   ========================================================================= */
function NetWorthView({ netWorth, banksSar, invSar, assetSar, liabSar, sarRate, convert, ratesErr, assets, addAsset, updateAsset, removeAsset, history, captureSnapshot, addPastSnapshot, removeSnapshot }) {
  const [gran, setGran] = useState("month");
  const [pm, setPm] = useState(new Date().toISOString().slice(0, 7));
  const [pv, setPv] = useState("");

  const sar = (n) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
  const usd = sarRate ? Math.round(netWorth / sarRate) : null;
  const php = convert ? convert(netWorth, "SAR", "PHP") : null;

  const parts = [
    { label:"Bank accounts", value:banksSar, color:SEG[0] },
    { label:"Investments",   value:invSar,   color:SEG[3] },
    { label:"Other assets",  value:assetSar, color:SEG[5] },
    { label:"Liabilities",   value:-liabSar, color:P.danger },
  ];
  const gross = banksSar + invSar + assetSar;

  const fmtMonth = (m) => { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-US", { month:"short", year:"2-digit" }); };
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));
  let pts;
  if (gran === "year") { const m = {}; sorted.forEach((s) => { m[s.month.slice(0, 4)] = s; }); pts = Object.entries(m).map(([y, s]) => ({ label:y, net:s.net })); }
  else pts = sorted.map((s) => ({ label:fmtMonth(s.month), net:s.net }));
  const last = sorted[sorted.length - 1];
  const delta = last ? netWorth - last.net : null;

  const assetItems = assets.filter((a) => a.kind === "asset");
  const liabItems = assets.filter((a) => a.kind === "liability");

  const AssetRow = ({ a }) => (
    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:`1px solid ${P.surfaceAlt}` }}>
      <input value={a.name} onChange={(e) => updateAsset(a.id, { name:e.target.value })} className="bare" style={{ fontSize:14, flex:1, minWidth:0 }} />
      <select value={a.currency} onChange={(e) => updateAsset(a.id, { currency:e.target.value })}
        style={{ borderRadius:999, padding:"2px 8px", fontSize:12, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.sub }}>
        {BANK_CCY.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input type="number" value={a.value} onChange={(e) => updateAsset(a.id, { value:Number(e.target.value) })}
        className="bare tabular-nums" style={{ width:92, textAlign:"right", fontSize:14, fontWeight:500 }} />
      <button onClick={() => removeAsset(a.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.4 }}><I.X size={15} /></button>
    </div>
  );

  return (
    <div>
      {/* hero */}
      <div style={{ borderRadius:16, padding:20, marginBottom:16, background:P.ink, color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:500, color:"#9DB0CC" }}>
          <I.Gem size={13} /> Net worth
        </div>
        <div style={{ marginTop:4 }}>
          <span className="serif tabular-nums" style={{ fontSize:38, fontWeight:600 }}>{sar(netWorth)}</span>
        </div>
        {/* USD + PHP — always present; show — until rates load */}
        <div className="tabular-nums" style={{ display:"flex", flexWrap:"wrap", gap:16, marginTop:6, color:"#9DB0CC" }}>
          <span style={{ fontSize:14 }}>
            {usd != null ? `≈ $${usd.toLocaleString("en-US")}` : "USD —"}
          </span>
          <span style={{ fontSize:14 }}>
            {php != null ? `≈ ₱${Math.round(php).toLocaleString("en-US")}` : "PHP —"}
          </span>
        </div>
        {(usd == null || php == null) && (
          <div style={{ fontSize:11, marginTop:6, color:"#E89B8C" }}>
            {ratesErr ? "Couldn't load live rates — tap refresh in the Currency tab." : "Loading live rates…"}
          </div>
        )}
        {delta != null && (
          <div className="tabular-nums" style={{ fontSize:14, marginTop:6, color:delta >= 0 ? "#6FC6DA" : "#E89B8C" }}>
            {delta >= 0 ? "▲" : "▼"} {sar(Math.abs(delta))} since last snapshot
          </div>
        )}
      </div>

      {/* composition */}
      <div style={{ borderRadius:16, padding:16, marginBottom:16, background:P.surface, border:`1px solid ${P.line}` }}>
        <h3 style={{ fontSize:14, fontWeight:600, margin:"0 0 12px", color:P.sub }}>What it's made of</h3>
        <div style={{ display:"flex", height:12, width:"100%", overflow:"hidden", borderRadius:999, marginBottom:12, background:P.surfaceAlt }}>
          {[parts[0], parts[1], parts[2]].map((p) => gross > 0 && p.value > 0 && (
            <div key={p.label} style={{ width:`${(p.value / gross) * 100}%`, background:p.color }} />
          ))}
        </div>
        {parts.map((p) => (
          <div key={p.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"4px 0", fontSize:14 }}>
            <span style={{ display:"flex", alignItems:"center", gap:8, color:P.ink }}>
              <span style={{ width:10, height:10, borderRadius:999, background:p.color }} /> {p.label}
            </span>
            <span className="tabular-nums" style={{ color:p.value < 0 ? P.danger : P.sub }}>
              {p.value < 0 ? `− ${sar(-p.value)}` : sar(p.value)}
            </span>
          </div>
        ))}
      </div>

      {/* assets & liabilities */}
      <div style={{ borderRadius:16, overflow:"hidden", marginBottom:16, background:P.surface, border:`1px solid ${P.line}` }}>
        <div style={{ padding:"10px 16px", fontSize:14, fontWeight:600, background:P.surfaceAlt, color:P.ink, borderBottom:`1px solid ${P.line}` }}>Assets (house, car, cash held elsewhere)</div>
        {assetItems.map((a) => <AssetRow key={a.id} a={a} />)}
        <button onClick={() => addAsset("asset")} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.green, background:"transparent", border:"none" }}><I.Plus size={14} /> Add asset</button>
        <div style={{ padding:"10px 16px", fontSize:14, fontWeight:600, background:P.surfaceAlt, color:P.ink, borderTop:`1px solid ${P.line}`, borderBottom:`1px solid ${P.line}` }}>Liabilities (loans, credit owed)</div>
        {liabItems.map((a) => <AssetRow key={a.id} a={a} />)}
        <button onClick={() => addAsset("liability")} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.danger, background:"transparent", border:"none" }}><I.Plus size={14} /> Add liability</button>
      </div>

      {/* history */}
      <div style={{ borderRadius:16, padding:16, background:P.surface, border:`1px solid ${P.line}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <h3 style={{ fontSize:14, fontWeight:600, margin:0, color:P.sub }}>Net worth over time</h3>
          <div style={{ display:"flex", gap:4 }}>
            {["month", "year"].map((gv) => (
              <button key={gv} onClick={() => setGran(gv)} style={{ borderRadius:999, padding:"3px 10px", fontSize:12, textTransform:"capitalize",
                background:gran === gv ? P.ink : P.surfaceAlt, color:gran === gv ? "#fff" : P.sub, border:"none" }}>{gv}</button>
            ))}
          </div>
        </div>
        {pts.length > 0 ? (
          <div style={{ width:"100%", height:200 }}>
            <ResponsiveContainer>
              <LineChart data={pts} margin={{ top:8, right:8, bottom:0, left:-12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.surfaceAlt} />
                <XAxis dataKey="label" tick={{ fontSize:11, fill:P.faint }} />
                <YAxis tick={{ fontSize:11, fill:P.faint }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => sar(v)} />
                <Line type="monotone" dataKey="net" stroke={P.green} strokeWidth={2} dot={{ r:3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ fontSize:13, color:P.faint }}>No snapshots yet. Capture today's net worth to start your timeline.</p>
        )}

        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, marginTop:12 }}>
          <button onClick={captureSnapshot} style={{ borderRadius:999, padding:"8px 14px", fontSize:14, fontWeight:500, background:P.green, color:"#fff", border:"none" }}>Capture this month</button>
          <span style={{ fontSize:12, color:P.faint }}>Saves today's {sar(netWorth)} to your timeline</span>
        </div>

        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-end", gap:8, marginTop:12, paddingTop:12, borderTop:`1px solid ${P.surfaceAlt}` }}>
          <div>
            <div style={{ color:P.faint, fontSize:10 }}>Backfill month</div>
            <input type="month" value={pm} onChange={(e) => setPm(e.target.value)} style={{ borderRadius:8, padding:"4px 8px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink }} />
          </div>
          <div>
            <div style={{ color:P.faint, fontSize:10 }}>Net worth (SAR)</div>
            <input type="number" value={pv} placeholder="0" onChange={(e) => setPv(e.target.value)} className="tabular-nums" style={{ borderRadius:8, padding:"4px 8px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink, width:120 }} />
          </div>
          <button onClick={() => { if (pm && Number(pv)) { addPastSnapshot(pm, Number(pv)); setPv(""); } }} style={{ borderRadius:8, padding:"6px 12px", fontSize:14, fontWeight:500, background:P.surfaceAlt, color:P.green, border:`1px solid ${P.line}` }}>Add entry</button>
        </div>

        {sorted.length > 0 && (
          <div style={{ marginTop:12, display:"flex", flexWrap:"wrap", gap:6 }}>
            {sorted.map((s) => (
              <span key={s.id} className="tabular-nums" style={{ display:"inline-flex", alignItems:"center", gap:4, borderRadius:999, padding:"4px 10px", fontSize:12, background:P.surfaceAlt, color:P.sub }}>
                {fmtMonth(s.month)} · {sar(s.net)}
                <button onClick={() => removeSnapshot(s.id)} style={{ background:"transparent", border:"none", color:P.danger }}><I.X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   INVESTMENTS VIEW — live quotes via Stooq (free)
   ========================================================================= */
function InvestmentsView({ invs, addInv, updateInv, removeInv, sarRate, projection, setProjection }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
  const rows = invs.map((hld) => {
    const value = (Number(hld.shares) || 0) * (Number(hld.price) || 0);
    const cost = (Number(hld.shares) || 0) * (Number(hld.avgCost) || 0);
    return { ...hld, value, cost, gain:value - cost, gainPct:cost > 0 ? ((value - cost) / cost) * 100 : 0 };
  });
  const totVal = rows.reduce((s, r) => s + r.value, 0);
  const totCost = rows.reduce((s, r) => s + r.cost, 0);
  const totGain = totVal - totCost;
  const totGainPct = totCost > 0 ? (totGain / totCost) * 100 : 0;

  const refresh = async () => {
    const tickers = [...new Set(invs.map((hld) => (hld.ticker || "").trim().toUpperCase()).filter(Boolean))];
    if (!tickers.length) { setErr("Add a ticker symbol first."); return; }
    setLoading(true); setErr("");
    try {
      const quotes = await fetchQuotes(tickers);
      let hit = 0;
      invs.forEach((hld) => { const t = (hld.ticker || "").trim().toUpperCase();
        if (quotes[t] != null) { updateInv(hld.id, { price:Number(quotes[t]) }); hit++; } });
      if (!hit) setErr("Couldn't match any prices. Edit them by hand below.");
      else if (hit < tickers.length) setErr("Some tickers weren't found — those still need manual prices.");
      setUpdatedAt(Date.now());
    } catch (e) { setErr("Live quotes aren't responding right now — you can still edit prices by hand."); }
    setLoading(false);
  };

  const gTone = (n) => (n > 0 ? P.green : n < 0 ? P.danger : P.sub);
  const series = projectSeries(totVal, projection.monthly, projection.years, 8);
  const projData = series.map((v, i) => ({ year:`Y${i}`, value:v }));

  return (
    <div>
      <div style={{ borderRadius:16, padding:16, marginBottom:16, background:P.ink, color:"#fff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:500, color:"#9DB0CC" }}>
          <I.Brief size={13} /> Portfolio value
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"baseline", gap:12, marginTop:4 }}>
          <span className="serif tabular-nums" style={{ fontSize:30, fontWeight:600 }}>{usd(totVal)}</span>
          {sarRate && <span className="tabular-nums" style={{ fontSize:14, color:"#9DB0CC" }}>≈ SAR {Math.round(totVal * sarRate).toLocaleString("en-US")}</span>}
        </div>
        <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:20, fontSize:14 }} className="tabular-nums">
          <span style={{ color:"#9DB0CC" }}>Cost {usd(totCost)}</span>
          <span style={{ color:totGain >= 0 ? "#6FC6DA" : "#E89B8C", fontWeight:600 }}>
            {totGain >= 0 ? "▲" : "▼"} {usd(Math.abs(totGain))} ({totGainPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <h2 style={{ fontSize:14, fontWeight:600, color:P.sub, margin:0 }}>Holdings</h2>
        <button onClick={refresh} disabled={loading} style={{ display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"6px 12px", fontSize:14, fontWeight:500, background:P.green, color:"#fff", border:"none", opacity:loading ? .6 : 1 }}>
          <I.Refresh size={14} style={loading ? { animation:"spin .9s linear infinite" } : null} /> {loading ? "Fetching…" : "Refresh prices"}
        </button>
      </div>
      {err && <div style={{ fontSize:12, color:P.danger, marginBottom:8 }}>{err}</div>}
      {updatedAt && !err && <div style={{ fontSize:11, color:P.faint, marginBottom:8 }}>Updated {new Date(updatedAt).toLocaleTimeString()}</div>}

      <div style={{ borderRadius:16, overflow:"hidden", marginBottom:16, background:P.surface, border:`1px solid ${P.line}` }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding:"12px 16px", borderBottom:`1px solid ${P.surfaceAlt}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input value={r.ticker} placeholder="TICKER" onChange={(e) => updateInv(r.id, { ticker:e.target.value.toUpperCase() })}
                className="bare" style={{ fontSize:14, fontWeight:700, width:74, letterSpacing:".03em" }} />
              <input value={r.name} placeholder="Name" onChange={(e) => updateInv(r.id, { name:e.target.value })} className="bare" style={{ fontSize:13, color:P.sub, flex:1, minWidth:0 }} />
              <span className="tabular-nums" style={{ fontSize:14, fontWeight:600 }}>{usd(r.value)}</span>
              <button onClick={() => removeInv(r.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.4 }}><I.X size={15} /></button>
            </div>
            <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, fontSize:12, color:P.sub }}>
              <label>Shares <input type="number" value={r.shares} onChange={(e) => updateInv(r.id, { shares:Number(e.target.value) })} className="bare tabular-nums" style={{ width:56, fontWeight:600 }} /></label>
              <label>Avg $ <input type="number" value={r.avgCost} onChange={(e) => updateInv(r.id, { avgCost:Number(e.target.value) })} className="bare tabular-nums" style={{ width:62, fontWeight:600 }} /></label>
              <label>Price $ <input type="number" value={r.price} onChange={(e) => updateInv(r.id, { price:Number(e.target.value) })} className="bare tabular-nums" style={{ width:62, fontWeight:600 }} /></label>
              <span className="tabular-nums" style={{ marginLeft:"auto", color:gTone(r.gain), fontWeight:600 }}>
                {r.gain >= 0 ? "▲" : "▼"} {usd(Math.abs(r.gain))} ({r.gainPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
        <button onClick={addInv} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"10px 16px", fontSize:14, fontWeight:500, color:P.green, background:"transparent", border:"none" }}><I.Plus size={14} /> Add holding</button>
      </div>

      <div style={{ borderRadius:16, padding:16, background:P.surface, border:`1px solid ${P.line}` }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:P.sub, margin:"0 0 8px" }}>Growth projection (8%/yr)</h3>
        <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginBottom:10, fontSize:13 }}>
          <label style={{ color:P.sub }}>+$/mo <input type="number" value={projection.monthly} onChange={(e) => setProjection({ monthly:Number(e.target.value) })} className="bare tabular-nums" style={{ width:80, fontWeight:600 }} /></label>
          <label style={{ color:P.sub }}>Years <input type="number" value={projection.years} onChange={(e) => setProjection({ years:Number(e.target.value) })} className="bare tabular-nums" style={{ width:56, fontWeight:600 }} /></label>
          <span className="tabular-nums" style={{ marginLeft:"auto", fontWeight:600, color:P.green }}>→ {usd(series[series.length - 1])}</span>
        </div>
        <div style={{ width:"100%", height:180 }}>
          <ResponsiveContainer>
            <LineChart data={projData} margin={{ top:8, right:8, bottom:0, left:-12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={P.surfaceAlt} />
              <XAxis dataKey="year" tick={{ fontSize:11, fill:P.faint }} />
              <YAxis tick={{ fontSize:11, fill:P.faint }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => usd(v)} />
              <Line type="monotone" dataKey="value" stroke={P.brass} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   CURRENCY VIEW
   ========================================================================= */
function CurrencyView({ rates, ratesAt, ratesErr, ratesLoading, onRefresh, convert }) {
  const [amount, setAmount] = useState(100);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("SAR");
  const result = convert(amount, from, to);
  const one = convert(1, from, to);
  const card = { background:P.surface, border:`1px solid ${P.line}`, borderRadius:16 };

  return (
    <div>
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <span style={{ fontSize:13, fontWeight:600, color:P.sub }}>Live converter</span>
          <button onClick={onRefresh} disabled={ratesLoading} style={{ display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"5px 10px", fontSize:12, fontWeight:500, background:P.surfaceAlt, color:P.green, border:`1px solid ${P.line}` }}>
            <I.Refresh size={13} style={ratesLoading ? { animation:"spin .9s linear infinite" } : null} /> Refresh
          </button>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:8 }}>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="tabular-nums" style={{ borderRadius:10, padding:"8px 10px", fontSize:18, fontWeight:600, width:130, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink }} />
          <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ borderRadius:10, padding:"8px 10px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}` }}>
            {FX_CODES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button onClick={() => { setFrom(to); setTo(from); }} style={{ borderRadius:999, padding:8, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.sub }}><I.Swap size={16} /></button>
          <select value={to} onChange={(e) => setTo(e.target.value)} style={{ borderRadius:10, padding:"8px 10px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}` }}>
            {FX_CODES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginTop:14 }}>
          {result != null ? (
            <div>
              <div className="serif tabular-nums" style={{ fontSize:30, fontWeight:600, color:P.ink }}>
                {result.toLocaleString("en-US", { maximumFractionDigits:2 })} <span style={{ fontSize:16, color:P.sub }}>{to}</span>
              </div>
              <div style={{ fontSize:12, color:P.faint }}>1 {from} = {one.toLocaleString("en-US", { maximumFractionDigits:4 })} {to}</div>
            </div>
          ) : (
            <div style={{ fontSize:14, color:P.danger }}>{ratesErr ? "Rates unavailable — tap refresh." : "Loading rates…"}</div>
          )}
        </div>
      </div>

      <div style={{ ...card, padding:16 }}>
        <div style={{ fontSize:13, fontWeight:600, color:P.sub, marginBottom:10 }}>Quick rates</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10 }}>
          {[["USD", "SAR"], ["SAR", "PHP"], ["USD", "PHP"], ["AED", "PHP"]].map(([f, t]) => {
            const v = convert(1, f, t);
            return (
              <div key={f + t} style={{ borderRadius:12, padding:12, background:P.surfaceAlt }}>
                <div style={{ fontSize:11, color:P.faint }}>1 {f} →</div>
                <div className="tabular-nums" style={{ fontSize:18, fontWeight:600, color:P.ink }}>
                  {v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits:t === "PHP" ? 2 : 4 })} <span style={{ fontSize:12, color:P.sub }}>{t}</span>
                </div>
              </div>
            );
          })}
        </div>
        {ratesAt && <div style={{ fontSize:11, color:P.faint, marginTop:10 }}>Updated {new Date(ratesAt).toLocaleString()}</div>}
      </div>
    </div>
  );
}

/* =========================================================================
   GOALS VIEW — split into You / Wife
   ========================================================================= */
function GoalsView({ goals, fmt, addGoal, updateGoal, removeGoal, owners }) {
  const ownerKeys = ["me", "wife"];
  const GoalCard = (g) => {
    const pctDone = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const remain = Math.max(0, g.target - g.saved);
    const months = g.monthly > 0 ? Math.ceil(remain / g.monthly) : null;
    return (
      <div key={g.id} style={{ borderRadius:16, padding:16, marginBottom:12, background:P.surface, border:`1px solid ${P.line}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
          <span style={{ width:10, height:10, borderRadius:999, background:g.color, flexShrink:0 }} />
          <input value={g.name} onChange={(e) => updateGoal(g.id, { name:e.target.value })} className="bare" style={{ fontSize:15, fontWeight:600, flex:1, minWidth:0 }} />
          <button onClick={() => removeGoal(g.id)} style={{ background:"transparent", border:"none", color:P.danger, opacity:.4 }}><I.X size={15} /></button>
        </div>
        <div style={{ height:10, borderRadius:999, background:P.surfaceAlt, overflow:"hidden", marginBottom:8 }}>
          <div style={{ width:`${pctDone}%`, height:"100%", background:g.color }} />
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:14, fontSize:13, color:P.sub }} className="tabular-nums">
          <label>Saved <input type="number" value={g.saved} onChange={(e) => updateGoal(g.id, { saved:Number(e.target.value) })} className="bare" style={{ width:80, fontWeight:600 }} /></label>
          <label>Target <input type="number" value={g.target} onChange={(e) => updateGoal(g.id, { target:Number(e.target.value) })} className="bare" style={{ width:80, fontWeight:600 }} /></label>
          <label>+/mo <input type="number" value={g.monthly} onChange={(e) => updateGoal(g.id, { monthly:Number(e.target.value) })} className="bare" style={{ width:64, fontWeight:600 }} /></label>
        </div>
        <div style={{ fontSize:12, color:P.faint, marginTop:6 }}>
          {pctDone.toFixed(0)}% there · {fmt(remain)} to go{months != null ? ` · ~${months} mo at this pace` : ""}
        </div>
      </div>
    );
  };

  return (
    <div>
      {ownerKeys.map((ok) => {
        const items = goals.filter((g) => g.owner === ok);
        return (
          <section key={ok} style={{ marginBottom:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <span style={{ width:8, height:8, borderRadius:999, background:ok === "me" ? P.green : P.brass }} />
              <h2 style={{ fontSize:14, fontWeight:600, color:ok === "me" ? P.greenDeep : P.brass, margin:0 }}>{owners[ok]}'s goals</h2>
            </div>
            {items.map(GoalCard)}
            <button onClick={() => addGoal(ok)} style={{ display:"flex", alignItems:"center", gap:6, borderRadius:999, padding:"8px 14px", fontSize:14, fontWeight:500, background:P.surface, border:`1px dashed ${P.line}`, color:P.green }}>
              <I.Plus size={14} /> Add {owners[ok]}'s goal
            </button>
          </section>
        );
      })}
    </div>
  );
}

/* =========================================================================
   OVERVIEW VIEW
   ========================================================================= */
function OverviewView({ plan, data, fmt, pct, allocated, remaining }) {
  const pieData = plan.groups.map((g) => {
    const val = plan.categories.filter((c) => c.groupId === g.id).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { name:g.name, value:val };
  }).filter((d) => d.value > 0);
  const card = { background:P.surface, border:`1px solid ${P.line}`, borderRadius:16 };

  return (
    <div>
      <div style={{ ...card, padding:16, marginBottom:16 }}>
        <h3 style={{ fontSize:14, fontWeight:600, color:P.sub, margin:"0 0 8px" }}>Where the {fmt(plan.income)} goes</h3>
        <div style={{ width:"100%", height:240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={48} paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={SEG[i % SEG.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:8 }}>
          {pieData.map((d, i) => (
            <span key={d.name} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:P.sub }}>
              <span style={{ width:9, height:9, borderRadius:999, background:SEG[i % SEG.length] }} /> {d.name} · {pct(d.value).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>
      <div style={{ ...card, padding:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, padding:"4px 0" }}>
          <span style={{ color:P.sub }}>Income</span><span className="tabular-nums" style={{ fontWeight:600 }}>{fmt(plan.income)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, padding:"4px 0" }}>
          <span style={{ color:P.sub }}>Allocated</span><span className="tabular-nums" style={{ fontWeight:600 }}>{fmt(allocated)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, padding:"4px 0", borderTop:`1px solid ${P.surfaceAlt}`, marginTop:4, paddingTop:8 }}>
          <span style={{ color:P.sub }}>{remaining < 0 ? "Over budget" : "Unallocated"}</span>
          <span className="tabular-nums" style={{ fontWeight:600, color:remaining < 0 ? P.danger : P.green }}>{fmt(Math.abs(remaining))}</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   SETTINGS MODAL — currency label, owner names, sync controls, backup/reset
   ========================================================================= */
function SettingsModal({ data, setData, onClose, signedIn, connectDrive, pullDrive, disconnectDrive, setOwnerName, owners }) {
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `allocation-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash("Backup downloaded ✓");
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { const d = JSON.parse(String(reader.result)); if (!Array.isArray(d.plans)) throw 0; setData(migrate(d)); flash("Backup loaded ✓"); } catch { flash("That isn't a valid backup."); } };
    reader.readAsText(f);
  };
  const btn = { background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink, borderRadius:10, padding:"8px 12px", fontSize:14, fontWeight:500, display:"flex", alignItems:"center", justifyContent:"center", gap:6 };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:30, display:"flex", alignItems:"center", justifyContent:"center", padding:16, background:"rgba(12,22,40,0.4)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ borderRadius:18, padding:20, width:"100%", maxWidth:420, maxHeight:"88vh", overflowY:"auto", background:P.surface }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <h3 style={{ margin:0, fontWeight:600 }}>Settings</h3>
          <button onClick={onClose} style={{ background:"transparent", border:"none", color:P.sub }}><I.X size={18} /></button>
        </div>

        {/* names */}
        <div style={{ fontSize:12, fontWeight:600, color:P.sub, marginBottom:8 }}>Who's who</div>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <input value={owners.me} onChange={(e) => setOwnerName("me", e.target.value)} placeholder="Your name"
            style={{ flex:1, borderRadius:10, padding:"8px 10px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink }} />
          <input value={owners.wife} onChange={(e) => setOwnerName("wife", e.target.value)} placeholder="Wife's name"
            style={{ flex:1, borderRadius:10, padding:"8px 10px", fontSize:14, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink }} />
        </div>

        {/* currency */}
        <div style={{ fontSize:12, fontWeight:600, color:P.sub, marginBottom:6 }}>Currency label</div>
        <input value={data.currency} onChange={(e) => setData((d) => ({ ...d, currency:e.target.value }))}
          style={{ width:"100%", borderRadius:10, padding:"8px 10px", fontSize:14, marginBottom:16, background:P.surfaceAlt, border:`1px solid ${P.line}`, color:P.ink }} />

        {/* sync */}
        <div style={{ fontSize:12, fontWeight:600, color:P.sub, marginBottom:6 }}>Sync across devices (Google Drive)</div>
        <p style={{ fontSize:12, color:P.faint, margin:"0 0 8px" }}>
          Connect the same Google account on your PC, iPad, and phone — and on your wife's devices — to share one synced copy.
        </p>
        {signedIn ? (
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <button onClick={pullDrive} style={{ ...btn, flex:1 }}><I.Cloud size={14} /> Pull latest</button>
            <button onClick={disconnectDrive} style={{ ...btn, flex:1, color:P.danger }}>Disconnect</button>
          </div>
        ) : (
          <button onClick={connectDrive} style={{ ...btn, width:"100%", marginBottom:16, background:P.greenSoft, color:P.greenDeep, border:`1px solid ${P.greenSoft}` }}>
            <I.Cloud size={14} /> Connect Google Drive
          </button>
        )}

        {/* backup */}
        <div style={{ fontSize:12, fontWeight:600, color:P.sub, marginBottom:6 }}>Manual backup</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
          <button onClick={download} style={btn}><I.Download size={14} /> Download</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} style={btn}><I.Upload size={14} /> Import file</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display:"none" }} />
        {msg && <div style={{ fontSize:12, color:P.green, marginBottom:12 }}>{msg}</div>}

        <button onClick={() => (confirm ? (setData(defaultData()), flash("Reset to sample data")) : setConfirm(true))}
          style={{ display:"flex", width:"100%", alignItems:"center", justifyContent:"center", gap:8, borderRadius:10, padding:"8px 12px", fontSize:14, fontWeight:500, marginTop:4,
            background:confirm ? P.danger : P.surfaceAlt, color:confirm ? "#fff" : P.danger, border:`1px solid ${confirm ? P.danger : P.line}` }}>
          <I.Reset size={14} /> {confirm ? "Tap again to confirm reset" : "Reset everything to sample data"}
        </button>
      </div>
    </div>
  );
}

/* ---- mount ---- */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
