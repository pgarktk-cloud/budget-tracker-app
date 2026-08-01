/**
 * Allocation Worker — Cloudflare Worker
 *
 * Two jobs in one Worker:
 *
 * 1. MARKET DATA PROXY
 *    GET /quote?symbols=AAPL,VWRA.L,VOO  → { SYM: {price, previousClose} }
 *    GET /name?symbol=AAPL               → { name }
 *    Yahoo Finance first (server-side, so no CORS problem and no key needed),
 *    then Finnhub for anything Yahoo didn't return. Both providers are called
 *    from HERE, never from the browser, so no API key is ever shipped to a
 *    client. Note the Finnhub key travels in a query string — that's Finnhub's
 *    API design; keeping the call server-side is what stops it leaking into
 *    browser history, referrers and DevTools.
 *
 * 2. KV DATA SYNC  (no login ever required)
 *    GET  /sync          → returns { data, savedAt, rev } from KV
 *    POST /sync          → body: { data, savedAt, rev } — saves to KV
 *    GET  /sync/meta     → returns { savedAt, rev } only (cheap conflict check)
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 * Cloudflare dashboard → Workers & Pages → this Worker → Settings → Bindings:
 *
 *   KV Namespace binding   ALLOC_KV      (create the namespace first)
 *   Secret                 SYNC_TOKEN    your sync passphrase
 *   Secret (optional)      FINNHUB_KEY   finnhub.io API key
 *
 * Add SYNC_TOKEN/FINNHUB_KEY as type **Secret** (encrypted), not plaintext
 * variables. NOTHING SECRET BELONGS IN THIS FILE — it lives in a public repo.
 * The same passphrase you set as SYNC_TOKEN is what you type into the app once
 * per device (Settings → Cloudflare KV Sync). It is never embedded in
 * index.html, which is served publicly from GitHub Pages.
 *
 * To rotate: change the SYNC_TOKEN secret here, then re-enter the new
 * passphrase on each device. No code change, no redeploy of index.html.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Origins allowed to call this Worker from a browser. Defense in depth only:
   the token is the real gate, since curl and other non-browser clients ignore
   CORS entirely. Add a new entry here if the app is ever hosted elsewhere. */
const ALLOWED_ORIGINS = [
  "https://pgarktk-cloud.github.io",
];
/* Local development: any http://localhost:PORT / http://127.0.0.1:PORT. */
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function originAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin);
}

/* Vary: Origin is required because the response differs per origin — without
   it a cache could serve one origin's CORS headers to another. */
function corsFor(request) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
    "Vary": "Origin",
  };
  const origin = request.headers.get("Origin");
  if (originAllowed(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(request), "Content-Type": "application/json" },
  });
}

/* Length check first, then a constant-time compare of the remainder, so a
   caller can't learn the token one character at a time from response timing.
   (An unset env.SYNC_TOKEN fails closed here; the caller reports it as a 500
   so a misconfigured Worker doesn't look like a wrong passphrase.) */
function authOk(request, env) {
  const got = request.headers.get("X-Sync-Token") || "";
  const want = env.SYNC_TOKEN || "";
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/* Yahoo symbols carry an exchange suffix (VWRA.L, ASML.AS, SAP.DE); Finnhub
   wants the bare ticker. Mirrors baseKey() in index.html. */
function bareTicker(sym) {
  return sym.toUpperCase().replace(/\.L$|\.AS$|\.DE$/i, "");
}

async function yahooChartMeta(symbol) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    }}
  );
  if (!r.ok) return null;
  const data = await r.json();
  return data?.chart?.result?.[0]?.meta || null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsFor(request) });
    }

    // ── Auth gate — EVERY endpoint ──────────────────────────────────────────
    // /quote and /name used to be open, which made this Worker a free Yahoo
    // Finance proxy for anyone who knew the URL, billed to this account.
    // They're behind the same token now. The visible consequence is that live
    // prices don't work on a device until its passphrase is entered, which is
    // the same rule sync already followed.
    if (!env.SYNC_TOKEN) {
      return json(request, { error: "SYNC_TOKEN secret not set — add it in Worker settings" }, 500);
    }
    if (!authOk(request, env)) {
      return json(request, { error: "Unauthorized" }, 401);
    }

    // ── KV SYNC ─────────────────────────────────────────────────────────────
    if (path === "/sync" || path === "/sync/meta") {

      const KV = env.ALLOC_KV;
      if (!KV) return json(request, { error: "KV not bound — add ALLOC_KV binding in Worker settings" }, 500);

      // GET /sync/meta — cheap metadata-only check (savedAt + revision number).
      // Used by the client to decide, without downloading the full dataset,
      // whether the cloud has moved on since the last time this device
      // fully reconciled with it. Also doubles as the passphrase test the
      // Settings "Connect" button uses — it's the cheapest authenticated call.
      if (path === "/sync/meta" && request.method === "GET") {
        const savedAt = await KV.get("savedAt");
        const revRaw = await KV.get("rev");
        return json(request, { savedAt: savedAt || null, rev: revRaw ? parseInt(revRaw, 10) : 0 });
      }

      // GET /sync — load full data (+ the revision it corresponds to)
      if (request.method === "GET") {
        const raw = await KV.get("data");
        const savedAt = await KV.get("savedAt");
        const revRaw = await KV.get("rev");
        const rev = revRaw ? parseInt(revRaw, 10) : 0;
        if (!raw) return json(request, { data: null, savedAt: null, rev });
        try {
          return json(request, { data: JSON.parse(raw), savedAt, rev });
        } catch {
          return json(request, { data: null, savedAt: null, rev });
        }
      }

      // POST /sync — save full data, gated by an optimistic-concurrency
      // revision check.
      //
      // The client sends `rev`: the cloud revision it last fully
      // reconciled with (i.e. the baseline its edits are built on top of).
      // If that still matches KV's current revision, the write is accepted
      // and the revision is incremented. If it doesn't match, someone else
      // has saved in between — reject with the current server data + rev
      // so the client can merge locally and retry, instead of blindly
      // overwriting a change it never saw.
      //
      // Note: KV has no compare-and-swap primitive, so this is a
      // read-then-write check, not a true atomic transaction — there is a
      // narrow window where two requests could both read the same current
      // rev before either writes. For a small number of devices saving at
      // human typing speed (not truly simultaneous automated writers) this
      // is a solid practical guarantee. A fully atomic version would need
      // a Durable Object instead of plain KV.
      if (request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json(request, { error: "Invalid JSON" }, 400); }

        const incoming = body.savedAt || new Date().toISOString();
        const clientBaseRev = Number.isFinite(body.rev) ? body.rev : 0;

        const currentRevRaw = await KV.get("rev");
        const currentRev = currentRevRaw ? parseInt(currentRevRaw, 10) : 0;

        if (currentRev !== clientBaseRev) {
          // Conflict: cloud moved on since the client's baseline. Hand back
          // the current server state so the client can merge without a
          // second round trip.
          const raw = await KV.get("data");
          const savedAt = await KV.get("savedAt");
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
          return json(request, { ok: false, conflict: true, rev: currentRev, savedAt: savedAt || null, data });
        }

        const newRev = currentRev + 1;
        await KV.put("data", JSON.stringify(body.data));
        await KV.put("savedAt", incoming);
        await KV.put("rev", String(newRev));

        return json(request, { ok: true, conflict: false, savedAt: incoming, rev: newRev });
      }
    }

    // ── STOCK PRICE PROXY ────────────────────────────────────────────────────
    if (path === "/quote") {
      const symbolsParam = url.searchParams.get("symbols") || "";
      if (!symbolsParam) return json(request, { error: "No symbols" }, 400);

      const symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean);
      const results = {};

      // 1. Yahoo — handles everything, including LSE-listed ETFs like VWRA.L
      //    and the gold futures ticker GC=F.
      await Promise.all(symbols.map(async (sym) => {
        try {
          const meta = await yahooChartMeta(sym);
          if (!meta) return;
          const price = meta.regularMarketPrice;
          // previousClose/chartPreviousClose come from the same chart-meta
          // object Yahoo already returns for this endpoint — no extra request
          // needed. The client uses it for Home's "today's gain/loss" line,
          // and it stays null rather than being fabricated when absent.
          const prevClose = meta.previousClose ?? meta.chartPreviousClose;
          if (price && price > 0) results[sym] = { price, previousClose: (prevClose && prevClose > 0) ? prevClose : null };
        } catch (e) { /* skip */ }
      }));

      // 2. Finnhub — fills in whatever Yahoo missed (it's good at US stocks and
      //    real-time). This fallback used to run in the browser with the key in
      //    the URL; it lives here now so the key stays server-side.
      const missing = symbols.filter(s => !results[s]);
      if (env.FINNHUB_KEY && missing.length) {
        await Promise.all(missing.map(async (sym) => {
          try {
            const r = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(bareTicker(sym))}&token=${env.FINNHUB_KEY}`
            );
            if (!r.ok) return;
            const j = await r.json();
            // Finnhub returns current (c) and previous close (pc). Fall back to
            // pc as the price only when c is missing, same as the old client.
            const price = j.c > 0 ? j.c : (j.pc > 0 ? j.pc : null);
            if (price) results[sym] = { price, previousClose: j.pc > 0 ? j.pc : null };
          } catch (e) { /* skip */ }
        }));
      }

      return json(request, results);
    }

    // ── Ticker name lookup (for auto-fill) ───────────────────────────────────
    if (path === "/name") {
      const symbol = url.searchParams.get("symbol") || "";
      if (!symbol) return json(request, { name: null });

      // 1. Yahoo — best for ETFs, and the client already sends the mapped
      //    Yahoo symbol (VWRA → VWRA.L).
      try {
        const meta = await yahooChartMeta(symbol);
        const name = meta?.longName || meta?.shortName || null;
        if (name) return json(request, { name });
      } catch (e) { /* fall through to Finnhub */ }

      // 2. Finnhub search — better for US stocks. Same match-preference chain
      //    the client used to run: exact ticker, then the .US variant, then the
      //    bare ticker, then whatever came back first.
      if (env.FINNHUB_KEY) {
        const t = bareTicker(symbol);
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/search?q=${encodeURIComponent(t)}&token=${env.FINNHUB_KEY}`
          );
          if (r.ok) {
            const j = await r.json();
            const list = j.result || [];
            const match = list.find(x => x.symbol === t) ||
                          list.find(x => x.symbol === t + ".US") ||
                          list[0];
            if (match && match.description) return json(request, { name: match.description });
          }
        } catch (e) { /* skip */ }
      }

      return json(request, { name: null });
    }

    return json(request, { error: "Not found" }, 404);
  },
};
