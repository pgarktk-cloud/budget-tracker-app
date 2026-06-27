/**
 * Allocation Worker — Cloudflare Worker
 *
 * Two jobs in one Worker:
 *
 * 1. STOCK PRICE PROXY  GET /quote?symbols=AAPL,VWRA.L,VOO
 *    Fetches Yahoo Finance server-side (no CORS issue), returns JSON.
 *
 * 2. KV DATA SYNC  (replaces Google Drive — no login ever required)
 *    GET  /sync          → returns { data, savedAt } from KV
 *    POST /sync          → body: { data, savedAt } — saves to KV
 *    GET  /sync/meta     → returns { savedAt } only (cheap conflict check)
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

      // GET /sync/meta — cheap timestamp-only check (used for conflict detection)
      if (path === "/sync/meta" && request.method === "GET") {
        const savedAt = await KV.get("savedAt");
        return json({ savedAt: savedAt || null });
      }

      // GET /sync — load full data
      if (request.method === "GET") {
        const raw = await KV.get("data");
        const savedAt = await KV.get("savedAt");
        if (!raw) return json({ data: null, savedAt: null });
        try {
          return json({ data: JSON.parse(raw), savedAt });
        } catch {
          return json({ data: null, savedAt: null });
        }
      }

      // POST /sync — save full data
      if (request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

        const incoming = body.savedAt || new Date().toISOString();

        // Conflict check: if KV has a newer timestamp than what the client
        // thinks it last synced from, warn (but still save — client decides)
        const kvSavedAt = await KV.get("savedAt");
        const conflict = kvSavedAt && body.lastPulledAt && kvSavedAt > body.lastPulledAt;

        await KV.put("data",    JSON.stringify(body.data));
        await KV.put("savedAt", incoming);

        return json({ ok: true, savedAt: incoming, conflict: conflict || false });
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
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price && price > 0) results[sym] = price;
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
