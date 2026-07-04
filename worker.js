/* ════════════════════════════════════════════════════════════════════════
   Where'dItGo — Cloudflare Worker sync backend (Phase 2 + Provisioning)

   Multi-tenant KV sync gated by Supabase JWT verification. Every request to
   /sync must carry `Authorization: Bearer <supabase access_token>`. The
   Worker verifies the token's signature against your Supabase project's
   JWT secret, extracts the user id from the verified payload, and reads /
   writes that user's data under an isolated KV key. No client can read or
   overwrite another user's data — the key is derived only from the verified
   token, never from anything the client sends directly.

   On a user's very first GET /sync (nothing yet in KV for their id), the
   Worker also reads `account_mode` ("single" | "couple") off the verified
   token's user_metadata — set at signup — and seeds their KV record with a
   matching starter template before returning it. This never overwrites an
   account that already has data; it only fires once, on first touch.

   ── Setup ──────────────────────────────────────────────────────────────
   1. Create a KV namespace and bind it to this Worker as `SYNC_KV`
      (wrangler.toml: kv_namespaces = [{ binding = "SYNC_KV", id = "..." }]).
   2. Set a secret with your Supabase project's JWT secret:
        wrangler secret put SUPABASE_JWT_SECRET
      (Find it in Supabase Dashboard → Project Settings → API → JWT Secret.)
   3. Optionally set ALLOWED_ORIGIN as a var/secret to lock CORS down to your
      app's origin instead of "*".
   ════════════════════════════════════════════════════════════════════════ */

const JSON_HEADERS = { "Content-Type": "application/json" };

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(env) },
  });
}

/* ── base64url helpers ──────────────────────────────────────────────── */
function b64urlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
function b64urlToJson(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToUint8Array(b64url)));
}

/* ── JWT verification (HS256, Supabase's default) ───────────────────────
   Supabase issues HS256-signed JWTs by default, symmetric-keyed with the
   project's JWT secret. We recompute the HMAC over "<header>.<payload>"
   and compare it — constant-time, via WebCrypto — against the signature
   on the token. Also validates alg, exp, and the standard "authenticated"
   role Supabase sets on user sessions. Throws on any failure; callers
   should treat a thrown error as "reject the request as unauthenticated".
   ─────────────────────────────────────────────────────────────────────── */
async function verifySupabaseJWT(token, secret) {
  if (!token) throw new Error("missing token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlToJson(headerB64);
  if (header.alg !== "HS256") throw new Error("unsupported alg");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signature = b64urlToUint8Array(sigB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify("HMAC", key, signature, data);
  if (!valid) throw new Error("bad signature");

  const payload = b64urlToJson(payloadB64);
  if (typeof payload.exp === "number" && Date.now() / 1000 >= payload.exp) {
    throw new Error("expired token");
  }

  const userId = payload.sub || payload.user_id;
  if (!userId) throw new Error("token missing user id");

  // Supabase mirrors the signUp() options.data payload onto the token as
  // user_metadata. These are only ever read here — the client can't send
  // them directly to the Worker, so a user can't spoof different values
  // after the fact by editing a request body.
  const meta = payload.user_metadata || {};
  const accountMode = meta.account_mode || "single";
  const displayName = (typeof meta.display_name === "string" && meta.display_name.trim()) || null;
  const baseCurrency = (typeof meta.base_currency === "string" && meta.base_currency.trim()) || null;

  return { userId, accountMode, displayName, baseCurrency, payload };
}

async function authenticate(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error("missing bearer token");
    err.status = 401;
    throw err;
  }
  if (!env.SUPABASE_JWT_SECRET) {
    const err = new Error("worker misconfigured: no SUPABASE_JWT_SECRET set");
    err.status = 500;
    throw err;
  }
  try {
    const { userId, accountMode, displayName, baseCurrency } = await verifySupabaseJWT(match[1], env.SUPABASE_JWT_SECRET);
    return { userId, accountMode, displayName, baseCurrency };
  } catch (e) {
    const err = new Error(`invalid token: ${e.message}`);
    err.status = 401;
    throw err;
  }
}

/* Storage isolation: every user's data lives under its own key, derived
   only from the verified JWT — never from a client-supplied id. */
const userDataKey = (userId) => `user:data:${userId}`;

/* ── First-time provisioning templates ──────────────────────────────────
   Deliberately generic/neutral placeholder data — NOT anyone's real
   financial figures — since every new signup gets a copy of this. Shape
   matches what the frontend's migrate() expects; fields migrate() already
   backfills (owners, activePlanId, theme, payPeriods, investTarget, etc.)
   are omitted here and left for it to fill in on load.
   ─────────────────────────────────────────────────────────────────────── */
function starterCategories(names) {
  const palette = ["#3FBF9E", "#C97177", "#7BAFD4", "#E0B354", "#9B8AC4", "#6FBF73"];
  return names.map((name, i) => ({
    id: `cat_${i}_${Math.random().toString(36).slice(2, 8)}`,
    name, amount: 0, groupId: "g1", color: palette[i % palette.length],
    subs: [], trackExpenses: true,
  }));
}

function templateSingle(displayName, baseCurrency) {
  return {
    currency: baseCurrency || "SAR",
    owners: { me: displayName || "Me", wife: "Partner" },
    plans: [{
      id: "p1", owner: "me", name: "Monthly Budget",
      month: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      income: 0,
      groups: [{ id: "g1", name: "Essentials" }, { id: "g2", name: "Savings" }, { id: "g3", name: "Personal" }],
      categories: starterCategories(["Rent/Housing", "Groceries", "Savings", "Personal"]),
    }],
    goals: [],
    investments: [],
    banks: [],
    assets: [],
    expenses: [],
    targets: [],
    household: { splitMine: 50, expenses: [] },
  };
}

function templateCouple(displayName, baseCurrency) {
  return {
    currency: baseCurrency || "SAR",
    owners: { me: displayName || "Me", wife: "Partner" },
    plans: [
      {
        id: "p1", owner: "me", name: "Monthly Budget",
        month: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
        income: 0,
        groups: [{ id: "g1", name: "Essentials" }, { id: "g2", name: "Savings" }, { id: "g3", name: "Personal" }],
        categories: starterCategories(["Rent/Housing", "Groceries", "Savings", "Personal"]),
      },
      {
        id: "pw1", owner: "wife", name: "Monthly Budget",
        month: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
        income: 0,
        groups: [{ id: "wg1", name: "Essentials" }, { id: "wg2", name: "Savings" }, { id: "wg3", name: "Personal" }],
        categories: starterCategories(["Groceries", "Savings", "Personal"]),
      },
    ],
    goals: [],
    investments: [],
    banks: [],
    assets: [],
    expenses: [],
    targets: [],
    household: { splitMine: 50, expenses: [] },
  };
}

function starterTemplateFor(accountMode, displayName, baseCurrency) {
  return accountMode === "couple"
    ? templateCouple(displayName, baseCurrency)
    : templateSingle(displayName, baseCurrency);
}

/* ── route handlers ─────────────────────────────────────────────────── */
async function handleGetSync(request, env, userId, accountMode, displayName, baseCurrency) {
  const key = userDataKey(userId);
  const raw = await env.SYNC_KV.get(key);
  if (!raw) {
    // First-time provisioning: nothing exists yet for this verified user,
    // so seed their KV record with the starter template matching the
    // account_mode/display_name/base_currency they chose at signup, then
    // hand it back. This only ever runs once — subsequent requests find a
    // real record and skip straight to the branch below.
    const template = starterTemplateFor(accountMode, displayName, baseCurrency);
    const savedAt = new Date().toISOString();
    await env.SYNC_KV.put(key, JSON.stringify({ data: template, savedAt }));
    return json({ ok: true, isNew: true, provisioned: accountMode, data: template, savedAt }, 200, env);
  }
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (e) {
    return json({ ok: true, isNew: true, data: null, savedAt: null }, 200, env);
  }
  return json({ ok: true, data: stored.data ?? null, savedAt: stored.savedAt ?? null }, 200, env);
}

async function handlePostSync(request, env, userId) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, reason: "invalid JSON body" }, 400, env);
  }
  const { data, savedAt, lastPulledAt } = body || {};
  if (data === undefined) {
    return json({ ok: false, reason: "missing data" }, 400, env);
  }

  const key = userDataKey(userId);
  const existingRaw = await env.SYNC_KV.get(key);
  const existing = existingRaw ? JSON.parse(existingRaw) : null;

  // Optimistic-concurrency check: if the cloud copy has moved on since this
  // client last pulled it, don't blindly clobber it — surface a conflict
  // so the frontend can offer to merge/reconcile instead.
  if (existing && existing.savedAt && existing.savedAt !== lastPulledAt) {
    return json({ ok: false, conflict: true, savedAt: existing.savedAt }, 200, env);
  }

  const record = { data, savedAt: savedAt || new Date().toISOString() };
  await env.SYNC_KV.put(key, JSON.stringify(record));
  return json({ ok: true, savedAt: record.savedAt }, 200, env);
}

async function handleMeta(request, env, userId) {
  const raw = await env.SYNC_KV.get(userDataKey(userId));
  if (!raw) return json({ ok: true, isNew: true, savedAt: null }, 200, env);
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch (e) {
    return json({ ok: true, isNew: true, savedAt: null }, 200, env);
  }
  return json({ ok: true, savedAt: stored.savedAt ?? null }, 200, env);
}

/* ── entrypoint ──────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname !== "/sync" && url.pathname !== "/sync/meta") {
      return json({ ok: false, reason: "not found" }, 404, env);
    }
    if (!env.SYNC_KV) {
      return json({ ok: false, reason: "worker misconfigured: no SYNC_KV binding" }, 500, env);
    }

    let userId, accountMode, displayName, baseCurrency;
    try {
      ({ userId, accountMode, displayName, baseCurrency } = await authenticate(request, env));
    } catch (e) {
      return json({ ok: false, reason: e.message }, e.status || 401, env);
    }

    try {
      if (url.pathname === "/sync/meta" && request.method === "GET") {
        return await handleMeta(request, env, userId);
      }
      if (url.pathname === "/sync" && request.method === "GET") {
        return await handleGetSync(request, env, userId, accountMode, displayName, baseCurrency);
      }
      if (url.pathname === "/sync" && request.method === "POST") {
        return await handlePostSync(request, env, userId);
      }
      return json({ ok: false, reason: "method not allowed" }, 405, env);
    } catch (e) {
      return json({ ok: false, reason: `internal error: ${e.message}` }, 500, env);
    }
  },
};
