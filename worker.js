/**
 * Allocation Worker — Cloudflare Worker
 *
 * Two jobs in one Worker:
 *
 * 1. STOCK PRICE PROXY  GET /quote?symbols=AAPL,VWRA.L,VOO
 *    Fetches Yahoo Finance server-side (no CORS issue), returns JSON.
 *
 * 2. KV DATA SYNC  (replaces Google Drive — no login ever required)
 *    GET  /sync          → returns { data, savedAt, rev } from KV
 *    POST /sync          → body: { data, savedAt, rev } — saves to KV
 *    GET  /sync/meta     → returns { savedAt, rev } only (cheap conflict check)
 *
 * Setup:
 *   In Cloudflare dashboard → Workers & Pages → your Worker → Settings → Bindings
 *   Add KV Namespace binding:  Variable name = ALLOC_KV  (create the namespace first)
 *
 * Security:
 *   Requests to /sync must include header  X-Sync-Token: <your secret>
 *   Set SYNC_TOKEN below to any long random string you choose.
 *   Paste the same token into index.html where it says PASTE_YOUR_SYNC_TOKEN_HERE.
 */

// ── Your secret sync token — change this to anything long and random ──────────
// e.g. "xK9mP2qL8nR4vT6wY1cZ3bA5jE7hU0s"  (just mash your keyboard)
const SYNC_TOKEN = "kgTZEPzv2cSIcG79rv04pZFeyK2mPg2bhw2gh";
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function authOk(request) {
  return request.headers.get("X-Sync-Token") === SYNC_TOKEN;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── KV SYNC ─────────────────────────────────────────────────────────────
    if (path === "/sync" || path === "/sync/meta") {

      // Auth check for all sync endpoints
      if (!authOk(request)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const KV = env.ALLOC_KV;
      if (!KV) return json({ error: "KV not bound — add ALLOC_KV binding in Worker settings" }, 500);

      // GET /sync/meta — cheap metadata-only check (savedAt + revision number).
      // Used by the client to decide, without downloading the full dataset,
      // whether the cloud has moved on since the last time this device
      // fully reconciled with it.
      if (path === "/sync/meta" && request.method === "GET") {
        const savedAt = await KV.get("savedAt");
        const revRaw = await KV.get("rev");
        return json({ savedAt: savedAt || null, rev: revRaw ? parseInt(revRaw, 10) : 0 });
      }

      // GET /sync — load full data (+ the revision it corresponds to)
      if (request.method === "GET") {
        const raw = await KV.get("data");
        const savedAt = await KV.get("savedAt");
        const revRaw = await KV.get("rev");
        const rev = revRaw ? parseInt(revRaw, 10) : 0;
        if (!raw) return json({ data: null, savedAt: null, rev });
        try {
          return json({ data: JSON.parse(raw), savedAt, rev });
        } catch {
          return json({ data: null, savedAt: null, rev });
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
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

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
          return json({ ok: false, conflict: true, rev: currentRev, savedAt: savedAt || null, data });
        }

        const newRev = currentRev + 1;
        await KV.put("data", JSON.stringify(body.data));
        await KV.put("savedAt", incoming);
        await KV.put("rev", String(newRev));

        return json({ ok: true, conflict: false, savedAt: incoming, rev: newRev });
      }
    }

    // ── STOCK PRICE PROXY ────────────────────────────────────────────────────
    if (path === "/quote") {
      const symbolsParam = url.searchParams.get("symbols") || "";
      if (!symbolsParam) return json({ error: "No symbols" }, 400);

      const symbols = symbolsParam.split(",").map(s => s.trim()).filter(Boolean);
      const results = {};

      await Promise.all(symbols.map(async (sym) => {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
            { headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "application/json",
            }}
          );
          if (!r.ok) return;
          const data = await r.json();
          const meta = data?.chart?.result?.[0]?.meta;
          const price = meta?.regularMarketPrice;
          // chartPreviousClose/previousClose come from the same chart-meta object
          // Yahoo already returns for this endpoint — no extra request needed.
          // Added so the client can compute a "today's gain/loss" line without
          // fabricating anything (see index.html PortfolioCard).
          const prevClose = meta?.previousClose ?? meta?.chartPreviousClose;
          if (price && price > 0) results[sym] = { price, previousClose: (prevClose && prevClose > 0) ? prevClose : null };
        } catch (e) { /* skip */ }
      }));

      return json(results);
    }

    // ── Ticker name lookup (for auto-fill) ───────────────────────────────────
    if (path === "/name") {
      const symbol = url.searchParams.get("symbol") || "";
      if (!symbol) return json({ name: null });
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" } }
        );
        if (r.ok) {
          const data = await r.json();
          const name = data?.chart?.result?.[0]?.meta?.longName ||
                       data?.chart?.result?.[0]?.meta?.shortName || null;
          return json({ name });
        }
      } catch (e) { /* skip */ }
      return json({ name: null });
    }

    return json({ error: "Not found" }, 404);
  },
};
