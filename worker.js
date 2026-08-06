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
 * 2. DATA SYNC  (no login ever required)
 *    GET  /sync          → returns { data, savedAt, rev }
 *    POST /sync          → body: { data, savedAt, rev } — saves
 *    GET  /sync/meta     → returns { savedAt, rev } only (cheap conflict check)
 *
 *    Backed by a Durable Object (SyncRoom) as of 2026-08-05, NOT plain KV.
 *    Why: KV has no compare-and-swap, so the old read-rev-then-write check had
 *    a real race — two devices could both read rev 5 and both be accepted — and
 *    the three separate puts (data/savedAt/rev) could tear, leaving data
 *    written against a stale rev. A Durable Object serialises everything for a
 *    single instance and commits the whole document in ONE storage write, so
 *    the check and the write cannot be separated. See docs/decisions.md.
 *
 *    The request and response shapes are UNCHANGED, so an app version from
 *    before this switch keeps working against it.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 * This Worker is deployed with the wrangler CLI (`npx wrangler deploy`), not
 * from the dashboard editor — a Durable Object class can only be created at
 * deploy time. See wrangler.jsonc, which must declare EVERY binding: a deploy
 * replaces the Worker's bindings with whatever that file says, so a missing
 * ALLOC_KV entry would silently unbind KV.
 *
 *   KV Namespace binding      ALLOC_KV      (legacy store + rollback mirror)
 *   Durable Object binding    SYNC_ROOM     (class SyncRoom, SQLite-backed)
 *   Secret                    SYNC_TOKEN    your sync passphrase
 *   Secret (optional)         FINNHUB_KEY   finnhub.io API key
 *
 * Secrets are NOT in wrangler.jsonc and are NOT replaced by a deploy — they
 * stay as set in the dashboard. NOTHING SECRET BELONGS IN THIS FILE — it lives
 * in a public repo. The same passphrase you set as SYNC_TOKEN is what you type
 * into the app once per device (Settings → Cloudflare KV Sync). It is never
 * embedded in index.html, which is served publicly from GitHub Pages.
 *
 * To rotate: change the SYNC_TOKEN secret, then re-enter the new passphrase on
 * each device. No code change, no redeploy of index.html.
 * ──────────────────────────────────────────────────────────────────────────── */

import { DurableObject } from "cloudflare:workers";

/* ── SyncRoom — the one place the household document lives ───────────────────
 * A single instance (named "household") owns the whole document. Durable
 * Objects deliver events to an instance one at a time and hold new ones while
 * a storage operation is in flight, so the read-compare-write below genuinely
 * cannot interleave with another writer — which is the entire reason this
 * exists rather than more careful KV code.
 *
 * The document is stored under ONE key, so a write is all-or-nothing. The
 * household's real document is ~150KB; the per-value ceiling is 2MB. If it
 * ever approaches that, this needs chunking across rows INSIDE one write, not
 * a second key written separately — that would reintroduce the tear.
 */
export class SyncRoom extends DurableObject {
  /* Adopt whatever is already in KV the first time this object is used, so
     the switch needs no manual data migration and no downtime. Memoised as a
     promise because seeding does external I/O (a KV read), and unlike storage
     operations that does allow other events in — without the memo two
     concurrent first requests could both seed. */
  #seeded = null;
  #ensureSeeded() {
    if (!this.#seeded) this.#seeded = this.#seed();
    return this.#seeded;
  }
  async #seed() {
    const existing = await this.ctx.storage.get("doc");
    if (existing) return;                     // already ours; never re-adopt
    const KV = this.env.ALLOC_KV;
    let doc = { data: null, savedAt: null, rev: 0, lastWriter: null };
    if (KV) {
      try {
        const raw = await KV.get("data");
        const savedAt = await KV.get("savedAt");
        const revRaw = await KV.get("rev");
        doc = {
          data: raw ? JSON.parse(raw) : null,
          savedAt: savedAt || null,
          rev: revRaw ? parseInt(revRaw, 10) : 0,
          lastWriter: null,
        };
      } catch (e) { /* unreadable KV: start empty rather than refuse service */ }
    }
    await this.ctx.storage.put("doc", doc);
  }
  async #doc() {
    await this.#ensureSeeded();
    return (await this.ctx.storage.get("doc")) || { data: null, savedAt: null, rev: 0, lastWriter: null };
  }

  async meta() {
    const d = await this.#doc();
    return { savedAt: d.savedAt || null, rev: d.rev || 0, lastWriter: d.lastWriter || null };
  }

  async read() {
    const d = await this.#doc();
    return { data: d.data ?? null, savedAt: d.savedAt || null, rev: d.rev || 0, lastWriter: d.lastWriter || null };
  }

  /* The critical section. Everything between reading `rev` and committing the
     new document is storage-only — no fetch, no KV, nothing that would let
     another request in. The KV mirror is written AFTER the commit, on purpose. */
  async write({ data, savedAt, rev, deviceId }) {
    const current = await this.#doc();
    const clientBaseRev = Number.isFinite(rev) ? rev : 0;
    if ((current.rev || 0) !== clientBaseRev) {
      return {
        ok: false, conflict: true,
        rev: current.rev || 0,
        savedAt: current.savedAt || null,
        data: current.data ?? null,
        lastWriter: current.lastWriter || null,
      };
    }
    const next = {
      data,
      savedAt: savedAt || new Date().toISOString(),
      rev: (current.rev || 0) + 1,
      lastWriter: deviceId || null,
    };
    await this.ctx.storage.put("doc", next);

    /* Rollback mirror. For this release the three legacy KV keys are kept up
       to date, so reverting the Worker to the pre-Durable-Object version
       resumes exactly where this left off. Best-effort and deliberately after
       the commit: a failure here must never fail an accepted write, and the
       Durable Object is the authority either way. Remove in a later release,
       once there is no intention of going back. */
    const KV = this.env.ALLOC_KV;
    if (KV) {
      try {
        await KV.put("data", JSON.stringify(next.data));
        await KV.put("savedAt", next.savedAt);
        await KV.put("rev", String(next.rev));
      } catch (e) { /* mirror only */ }
    }
    return { ok: true, conflict: false, savedAt: next.savedAt, rev: next.rev };
  }
}

/* Origins allowed to call this Worker from a browser. Defense in depth only:
   the token is the real gate, since curl and other non-browser clients ignore
   CORS entirely. Add a new entry here if the app is ever hosted elsewhere. */
const ALLOWED_ORIGINS = [
  // Cloudflare Pages — the app's home since 2026-08-06.
  "https://whered-it-go.pages.dev",
  // GitHub Pages — the previous home, kept during the migration so a phone
  // that hasn't moved yet still syncs against the same document. Both origins
  // talk to this one Worker, which is what makes the move phone-by-phone
  // rather than all-at-once. Remove once both devices are settled.
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
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token, X-Device-Id",
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

    // ── DATA SYNC ───────────────────────────────────────────────────────────
    // Everything here is delegated to the SyncRoom Durable Object. The
    // request/response shapes are identical to the previous KV implementation
    // so an app version from before the switch keeps working unchanged.
    if (path === "/sync" || path === "/sync/meta") {

      if (!env.SYNC_ROOM) {
        return json(request, { error: "SYNC_ROOM not bound — deploy with wrangler.jsonc" }, 500);
      }
      // One document, one instance. getByName is deterministic, so every
      // request from either device lands on the same object.
      const room = env.SYNC_ROOM.getByName("household");

      // Which device is writing — used only to make a conflict message say
      // whose phone saved last. Never used for authentication, and never
      // trusted for anything a client shouldn't be able to choose freely.
      const deviceId = (request.headers.get("X-Device-Id") || "").slice(0, 64) || null;

      // GET /sync/meta — cheap metadata-only check (savedAt + revision number).
      // Used by the client to decide, without downloading the full dataset,
      // whether the cloud has moved on since the last time this device fully
      // reconciled with it. Also doubles as the passphrase test the Settings
      // "Connect" button uses — it's the cheapest authenticated call.
      if (path === "/sync/meta" && request.method === "GET") {
        return json(request, await room.meta());
      }

      // GET /sync — load full data (+ the revision it corresponds to)
      if (request.method === "GET") {
        return json(request, await room.read());
      }

      // POST /sync — save full data, gated by an optimistic-concurrency
      // revision check.
      //
      // The client sends `rev`: the cloud revision it last fully reconciled
      // with (i.e. the baseline its edits are built on top of). If that still
      // matches the current revision the write is accepted and the revision
      // is incremented. If it doesn't, someone else saved in between — reject
      // with the current server data + rev so the client can merge locally
      // and retry, instead of blindly overwriting a change it never saw.
      //
      // The compare and the write now happen inside the Durable Object, in
      // one storage commit, so unlike the old KV version two devices cannot
      // both pass the same check.
      if (request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json(request, { error: "Invalid JSON" }, 400); }
        return json(request, await room.write({
          data: body.data,
          savedAt: body.savedAt,
          rev: body.rev,
          deviceId,
        }));
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
