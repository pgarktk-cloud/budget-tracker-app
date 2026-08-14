/* dotest.cjs — end-to-end harness for the SyncRoom Durable Object.

   TOOLING, NOT A RUNNER. It is deliberately NOT part of the "run all twenty"
   sweep: it launches `npx wrangler dev` four times, needs four free ports and
   takes ~25s (longer on a cold npx cache). Run it by hand after touching
   worker.js or wrangler.jsonc,
   the same way headroomcheck.cjs and samplescan.cjs are run by hand.

     node dotest.cjs                 # default base port 8930
     node dotest.cjs --port 9100     # four ports from here
     node dotest.cjs --keep          # keep the temp state dirs and logs

   WHY THIS EXISTS. worker.js's SyncRoom (the compare-and-swap that stops two
   phones both being accepted at the same rev) had NO automated coverage at
   all. It was verified once at cutover, by hand; `aiburst.cjs` was the only
   thing that ever exercised it over HTTP and it was deleted with the AI path
   in v1.41.0. Every other runner in this repo slices pure functions out of
   index.html — none of them can reach a Durable Object, because the thing
   under test is the *storage runtime's* serialisation guarantee, not any
   expression. So this drives the real Worker over real HTTP.

   NOTHING HERE TOUCHES PRODUCTION. Every instance runs `wrangler dev` in
   LOCAL mode (workerd + miniflare, the default in wrangler v4) with its own
   throwaway `--persist-to` directory under the OS temp dir, and a
   `SYNC_TOKEN` of "test-token" passed with `--var`. There is no `--remote`
   anywhere in this file and there must never be one: a `--remote` run would
   compare-and-swap against the household's real document. The one sanctioned
   production check is manual and described at the bottom of this comment.

   ── Things that will trip you up ────────────────────────────────────────────

   * A REV CONFLICT IS HTTP 200, not 409. The body carries
     {ok:false,conflict:true,...} and the client branches on that. Case 6
     asserts the status explicitly so nobody "corrects" it to 409 in passing.
   * THE KV MIRROR IS BEST-EFFORT AND MUST STAY THAT WAY. It is written after
     the commit, inside a try/catch, precisely so a KV failure cannot fail an
     accepted write (worker.js "Rollback mirror"). Case 11 runs a whole
     instance with ALLOC_KV unbound to prove a write still succeeds.
   * `sandboxworker.cjs` answers every POST with conflict:true and stores
     nothing, so a SUCCESSFUL push is the one path it can never exercise.
     That gap is the main reason this file exists.
   * Ports: wrangler will pick a different port if the requested one is busy,
     so the port is parsed back out of its "Ready on" line and used from there.

   ── The manual check this does not replace ──────────────────────────────────
   Once — after a worker.js change, before trusting a release — run the same
   shapes against the DEPLOYED Worker with a throwaway document, to confirm
   local workerd and production agree. Then never again against production.

   ── Open item this unblocks ────────────────────────────────────────────────
   The KV rollback mirror stays until this harness has been trusted through a
   real release. Retiring it is a separate change, and it rewrites case 11. */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os"),
      vm = require("vm"), assert = require("assert");

const REPO = __dirname;
const TOKEN = "test-token";
const argv = process.argv.slice(2);
const KEEP = argv.includes("--keep");
const portArg = argv.indexOf("--port");
const BASE_PORT = portArg >= 0 ? parseInt(argv[portArg + 1], 10) : 8930;
const IS_WIN = process.platform === "win32";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wig-dotest-"));

/* ── The app's own merge, sliced out of index.html ──────────────────────────
   Case 8 (merge-and-retry) has to be the round trip the app really performs,
   so the merge step is the shipped `tryAutoMergeAll`, not a stand-in. Same
   slice window and the same vm traps mergetest.cjs documents: deepStrictEqual
   compares prototypes across realms, markers are plain indexOf on source
   text, and top-level `const` bindings don't attach to the context. */
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/\r\n/g, "\n");
function slice(startMarker, endMarker) {
  const a = html.indexOf(startMarker);
  assert.ok(a >= 0, "start marker not found (did the source move?): " + startMarker);
  const b = html.indexOf(endMarker, a);
  assert.ok(b > a, "end marker not found: " + endMarker);
  return html.slice(a, b);
}
const mergeCtx = {};
vm.createContext(mergeCtx);
vm.runInContext(
  slice("const PLAN_ORD_LAST=", "function resolvePlanForMonth(") +
  slice("function mergeArrayById(", "function buildConflictDiff(") + `
function installmentProviderLabel(i){return i.provider||"";}
this.tryAutoMergeAll=tryAutoMergeAll;`, mergeCtx);
const { tryAutoMergeAll } = mergeCtx;

/* A minimal but structurally complete document — tryAutoMergeAll reads every
   collection, so a sparse object would throw rather than merge. Same fixture
   shape mergetest.cjs uses. */
const EMPTY = {
  expenses: [], goals: [], investments: [], banks: [], assets: [], targets: [],
  mp2DividendRates: [], plans: [], bills: [], billAdjustments: [], monthlyPlans: [],
  portHistory: [], history: [], snapshots: [], household: { splitMine: 50, expenses: [] },
};
const doc = (over = {}) => JSON.parse(JSON.stringify({
  ...EMPTY,
  dataUpdatedAt: "2026-08-14T10:00:00.000Z",
  fieldUpdatedAt: {}, currency: "SAR",
  owners: { me: "Jastine", wife: "Charlene" },
  projection: {}, settings: {}, homeDisplay: {}, homeSettings: {}, billsSettings: {},
  quickTransferLast: {},
  payPeriods: { me: { enabled: false, payday: 28, actualStarts: {} },
                wife: { enabled: false, payday: 1, actualStarts: {} } },
  activePlanId: { me: "p1", wife: "pw1" },
  investTarget: { me: {}, wife: {} },
  ...over,
}));
const expense = (id, name) => ({ id, name, amount: 100, date: "2026-08-14",
  owner: "me", catId: "c1", createdAt: "2026-08-14T10:00:00.000Z" });

/* ── Process control ────────────────────────────────────────────────────────
   spawn() with shell:true because npx is a .cmd on Windows and Node refuses
   to spawn one directly. Killing the shell is not enough there either — the
   workerd child outlives it — hence taskkill /T. */
const q = s => `"${s}"`;
const running = [];
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/* Killing the shell is NOT enough. The tree is cmd.exe → node (wrangler) →
   workerd, and workerd routinely survives its parent — a run that only killed
   the shell left four workerd processes and four locked state directories
   behind every time. So: kill the tree, then kill whatever is still listening
   on the port, which is the one thing that identifies a stray workerd
   unambiguously. */
/* Each `wrangler dev` leaves one or two workerd processes that survive a tree
   kill — they get re-parented as the intermediate node exits, so taskkill /T
   can no longer see them, and only one of them holds the port. So each
   instance records which workerd processes appeared while it was starting and
   kills exactly those. Sampling the difference (rather than every workerd on
   the machine) matters: the user may be running `wrangler dev` for the app
   itself in another window, and a test must not kill it. */
function workerdPids() {
  if (!IS_WIN) return new Set();
  const r = spawnSync("tasklist", ["/FI", "IMAGENAME eq workerd.exe", "/NH", "/FO", "CSV"], { encoding: "utf8" });
  const s = new Set();
  for (const line of (r.stdout || "").split("\n")) {
    const m = line.match(/^"workerd\.exe","(\d+)"/);
    if (m) s.add(m[1]);
  }
  return s;
}
function killPort(port) {
  if (!IS_WIN || !port) return;
  const r = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
  const pids = new Set();
  for (const line of (r.stdout || "").split("\n")) {
    const m = line.match(/^\s*TCP\s+\S*:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (m && Number(m[1]) === port) pids.add(m[2]);
  }
  for (const pid of pids) spawnSync("taskkill", ["/pid", pid, "/T", "/F"], { stdio: "ignore" });
}
function stop(inst) {
  if (!inst || inst.stopped) return;
  inst.stopped = true;
  try {
    if (IS_WIN) {
      spawnSync("taskkill", ["/pid", String(inst.proc.pid), "/T", "/F"], { stdio: "ignore" });
      killPort(inst.port);
      for (const pid of inst.ownPids || [])
        spawnSync("taskkill", ["/pid", pid, "/T", "/F"], { stdio: "ignore" });
    } else {
      // detached:true put it in its own process group, so the negative pid
      // reaches workerd as well as the shell.
      try { process.kill(-inst.proc.pid, "SIGTERM"); } catch (e) { inst.proc.kill("SIGTERM"); }
    }
  } catch (e) { /* already gone */ }
}
function stopAll() { running.forEach(stop); }
process.on("exit", stopAll);
process.on("SIGINT", () => { stopAll(); process.exit(130); });

function startWorker({ label, port, persist, config, token }) {
  fs.mkdirSync(persist, { recursive: true });
  const before = workerdPids();
  const args = ["wrangler", "dev", "--port", String(port), "--persist-to", q(persist)];
  if (config) args.push("-c", q(config));
  if (token) args.push("--var", "SYNC_TOKEN:" + token);
  const proc = spawn("npx " + args.join(" "), {
    cwd: REPO, shell: true, detached: !IS_WIN,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
  });
  const inst = { label, proc, log: "", port, stopped: false };
  running.push(inst);
  const onData = d => { inst.log += d.toString(); };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = fn => { if (!done) { done = true; clearInterval(poll); clearTimeout(bail); fn(); } };
    proc.on("exit", code => finish(() => reject(
      new Error(`[${label}] wrangler exited early (code ${code}):\n${tail(inst.log)}`))));
    const poll = setInterval(() => {
      // Take the port wrangler actually bound, not the one that was asked for.
      const m = inst.log.match(/Ready on https?:\/\/[^\s:]+:(\d+)/);
      if (m) finish(() => {
        inst.port = parseInt(m[1], 10);
        // Give the last workerd a moment to appear before taking the census.
        sleep(500);
        inst.ownPids = [...workerdPids()].filter(p => !before.has(p));
        resolve(inst);
      });
    }, 250);
    const bail = setTimeout(() => finish(() => {
      stop(inst);
      reject(new Error(`[${label}] wrangler never became ready within 120s:\n${tail(inst.log)}`));
    }), 120000);
  });
}
const tail = s => s.split("\n").slice(-25).join("\n");

/* The state dirs are SQLite-backed and stay locked for a moment after workerd
   goes; retry rather than swallowing the failure, and say so if it persists —
   a silent leak here is four locked directories per run. */
function rmTemp() {
  for (let i = 0; i < 6; i++) {
    try { fs.rmSync(TMP, { recursive: true, force: true }); return true; }
    catch (e) { sleep(400); }
  }
  return false;
}

/* ── HTTP ───────────────────────────────────────────────────────────────── */
async function call(inst, urlPath, { method = "GET", token = TOKEN, deviceId, origin, body, raw } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers["X-Sync-Token"] = token;
  if (deviceId) headers["X-Device-Id"] = deviceId;
  if (origin) headers["Origin"] = origin;
  const r = await fetch(`http://127.0.0.1:${inst.port}${urlPath}`, {
    method, headers,
    body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* asserted on by the caller */ }
  return { status: r.status, text, json, headers: r.headers };
}
const push = (inst, data, rev, deviceId) =>
  call(inst, "/sync", { method: "POST", deviceId, body: { data, savedAt: null, rev } });

/* ── Test bookkeeping ───────────────────────────────────────────────────── */
let n = 0, fails = 0;
async function t(name, fn) {
  n++;
  try { await fn(); console.log("  ok   " + name); }
  catch (e) { fails++; console.log("  FAIL " + name + "\n       " + (e.message || e)); }
}
const head = s => console.log("\n" + s + "\n");

/* ── The cases ──────────────────────────────────────────────────────────── */
(async () => {
  console.log(`SyncRoom end-to-end (local workerd) — state in ${TMP}`);
  console.log("Starting wrangler; first run may take a while.\n");

  /* ---- Instance A: the ordinary configuration ---------------------------- */
  const A = await startWorker({ label: "main", port: BASE_PORT, persist: path.join(TMP, "a"), token: TOKEN });
  head(`A. The ordinary path — port ${A.port}`);

  await t("1. an empty room reads as empty, not as an error", async () => {
    const r = await call(A, "/sync");
    assert.strictEqual(r.status, 200);
    assert.deepEqual(r.json, { data: null, savedAt: null, rev: 0, lastWriter: null });
  });

  const docA = doc({ expenses: [expense("e1", "from phone A")] });
  await t("2. a first connection is accepted at rev 0 and becomes rev 1", async () => {
    const r = await push(A, docA, 0, "phoneA");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.conflict, false);
    assert.strictEqual(r.json.rev, 1);
    assert.ok(r.json.savedAt, "the server stamps savedAt when the client sends none");
  });

  await t("3. /sync/meta answers rev + writer and does NOT carry the document", async () => {
    const r = await call(A, "/sync/meta");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.rev, 1);
    assert.strictEqual(r.json.lastWriter, "phoneA");
    assert.ok(r.json.savedAt);
    // The whole point of the endpoint: a cheap check that doesn't download
    // ~126KB. If `data` ever appears here, every app open pays for it.
    assert.ok(!("data" in r.json), "/sync/meta must not return the document");
  });

  await t("4. every endpoint is behind the token, /quote and /name included", async () => {
    for (const p of ["/sync", "/sync/meta", "/quote?symbols=AAPL", "/name?symbol=AAPL"]) {
      for (const tok of [null, "wrong-token", "", "test-tokenX"]) {
        const r = await call(A, p, { token: tok });
        assert.strictEqual(r.status, 401, `${p} with token ${JSON.stringify(tok)} was not 401`);
        assert.deepEqual(r.json, { error: "Unauthorized" });
      }
    }
    // A POST must not be able to write on a bad token either.
    const w = await call(A, "/sync", { method: "POST", token: "wrong-token", body: { data: doc(), rev: 1 } });
    assert.strictEqual(w.status, 401);
    assert.strictEqual((await call(A, "/sync/meta")).json.rev, 1, "a rejected POST must not have written");
  });

  await t("6. a stale rev is refused as HTTP 200 + conflict:true, NOT 409", async () => {
    const r = await push(A, doc({ expenses: [expense("e9", "stale")] }), 0, "phoneB");
    // Deliberately explicit: the client branches on the body, and every
    // device in the field expects 200 here. Changing it to 409 would look
    // tidier and would break sync for anything not upgraded in lockstep.
    assert.strictEqual(r.status, 200, "a conflict must be 200, not a 4xx");
    assert.strictEqual(r.json.ok, false);
    assert.strictEqual(r.json.conflict, true);
    assert.strictEqual(r.json.rev, 1);
    assert.strictEqual(r.json.lastWriter, "phoneA");
    assert.deepEqual(r.json.data, docA, "a conflict hands back the current document to merge against");
    assert.strictEqual((await call(A, "/sync/meta")).json.rev, 1, "the refused write must not have landed");
  });

  /* Case 7 is the reason the Durable Object replaced KV. Under the old
     read-rev-then-write-KV code both of these could read rev 1, both pass the
     check, and the second would silently overwrite the first. */
  const docB = doc({ expenses: [expense("e2", "from phone B")] });
  let loser = null, winner = null;
  await t("7. two saves at the same base rev: exactly one wins, and no tear", async () => {
    const base = (await call(A, "/sync/meta")).json.rev;
    const [ra, rb] = await Promise.all([
      push(A, docA, base, "phoneA"),
      push(A, docB, base, "phoneB"),
    ]);
    const accepted = [ra, rb].filter(x => x.json.ok === true);
    const refused  = [ra, rb].filter(x => x.json.conflict === true);
    assert.strictEqual(accepted.length, 1, "exactly one write may be accepted");
    assert.strictEqual(refused.length, 1, "the other must be told it conflicted");
    assert.strictEqual(accepted[0].json.rev, base + 1, "the revision advances by exactly one");

    const after = await call(A, "/sync");
    assert.strictEqual(after.json.rev, base + 1);
    // Not a tear: the stored document is one side's, whole — never a mixture,
    // and never one device's data stamped with the other's rev.
    const storedIds = after.json.data.expenses.map(e => e.id);
    assert.deepEqual(storedIds.length, 1, "the stored document is one side's, not a blend");
    const winnerIsA = storedIds[0] === "e1";
    assert.strictEqual(after.json.lastWriter, winnerIsA ? "phoneA" : "phoneB");
    winner = winnerIsA ? docA : docB;
    loser  = { doc: winnerIsA ? docB : docA, res: refused[0] };
  });

  await t("8. the loser merges the returned document and retries successfully", async () => {
    assert.ok(loser, "case 7 did not produce a loser to retry");
    // Exactly what the app does on a rev rejection: merge the server's copy
    // into the local one with the shipped merge, then re-POST at the rev the
    // rejection reported. Both edits must survive.
    const merged = tryAutoMergeAll(loser.doc, loser.res.json.data);
    assert.deepEqual(merged.expenses.map(e => e.id).sort(), ["e1", "e2"],
      "the merge must keep both devices' rows before the retry is worth making");
    const r = await push(A, merged, loser.res.json.rev, "phoneRetry");
    assert.strictEqual(r.json.ok, true, "the retry at the returned rev must be accepted");
    assert.strictEqual(r.json.rev, loser.res.json.rev + 1);
    const after = await call(A, "/sync");
    assert.deepEqual(after.json.data.expenses.map(e => e.id).sort(), ["e1", "e2"],
      "neither device's edit may be lost across a conflict + merge + retry");
    assert.ok(winner, "case 7 must have identified a winner");
  });

  await t("9. response shapes: JSON, CORS per origin, device id truncated", async () => {
    const meta = await call(A, "/sync/meta", { origin: "https://whered-it-go.pages.dev" });
    assert.strictEqual(meta.headers.get("content-type"), "application/json");
    assert.strictEqual(meta.headers.get("access-control-allow-origin"), "https://whered-it-go.pages.dev");
    assert.strictEqual(meta.headers.get("vary"), "Origin",
      "Vary: Origin or a cache can hand one origin's CORS headers to another");

    const local = await call(A, "/sync/meta", { origin: "http://localhost:8123" });
    assert.strictEqual(local.headers.get("access-control-allow-origin"), "http://localhost:8123");

    // A disallowed origin still gets a 200 body — the token is the real gate,
    // and CORS is defence in depth. What it must NOT get is the header.
    const bad = await call(A, "/sync/meta", { origin: "https://evil.example" });
    assert.strictEqual(bad.headers.get("access-control-allow-origin"), null,
      "a disallowed origin must not be echoed back");

    const pre = await call(A, "/sync", { method: "OPTIONS", origin: "https://whered-it-go.pages.dev" });
    assert.ok(pre.status < 400, "the preflight must not be rejected");
    assert.ok((pre.headers.get("access-control-allow-headers") || "").includes("X-Sync-Token"),
      "the preflight must allow the token header the app actually sends");

    const rev = (await call(A, "/sync/meta")).json.rev;
    await push(A, doc(), rev, "D".repeat(200));
    assert.strictEqual((await call(A, "/sync/meta")).json.lastWriter.length, 64,
      "X-Device-Id is truncated to 64 chars — it is a label, never trusted input");
  });

  await t("12. a malformed body is a 400, an unsupported method is a 404", async () => {
    const before = (await call(A, "/sync/meta")).json.rev;
    const bad = await call(A, "/sync", { method: "POST", body: "{not json", raw: true });
    assert.strictEqual(bad.status, 400);
    assert.deepEqual(bad.json, { error: "Invalid JSON" });

    const put = await call(A, "/sync", { method: "PUT", body: {} });
    assert.strictEqual(put.status, 404);
    assert.deepEqual(put.json, { error: "Not found" });

    const unknown = await call(A, "/nope");
    assert.strictEqual(unknown.status, 404);

    assert.strictEqual((await call(A, "/sync/meta")).json.rev, before,
      "neither may have written anything");
  });
  stop(A);

  /* ---- Instance B: SYNC_TOKEN never set --------------------------------- */
  const B = await startWorker({ label: "nosecret", port: BASE_PORT + 1, persist: path.join(TMP, "b") });
  head(`B. A Worker with no SYNC_TOKEN — port ${B.port}`);

  await t("5. a missing secret is a 500 that says so, not a 401", async () => {
    // A misconfigured Worker must not look like a wrong passphrase — that
    // sends someone to re-type a passphrase that was never the problem.
    for (const p of ["/sync", "/sync/meta", "/quote?symbols=AAPL"]) {
      const r = await call(B, p, { token: "anything" });
      assert.strictEqual(r.status, 500, `${p} should be 500 when the secret is unset` +
        " (if this is 401, a .dev.vars in the repo is supplying SYNC_TOKEN)");
      assert.ok(/SYNC_TOKEN secret not set/.test(r.json.error), r.text);
    }
  });
  stop(B);

  /* ---- Instance C: legacy KV pre-seeded, DO storage empty ---------------- */
  const seedDir = path.join(TMP, "c");
  fs.mkdirSync(seedDir, { recursive: true });
  /* The value goes in via --path, never on the command line. spawn() needs
     shell:true here (npx is a .cmd on Windows and Node refuses to spawn one
     directly), and cmd.exe strips the inner quotes out of a JSON literal — so
     an inline `data` value arrives as {legacy:true}, JSON.parse throws inside
     the Worker's seed, and the room starts EMPTY. That failure is silent: the
     Worker is right to fall back rather than refuse service, so the harness
     just sees rev 0 and blames the seeding it cannot see. */
  const kvPut = (k, v) => {
    const f = path.join(TMP, `seed-${k}.txt`);
    fs.writeFileSync(f, v);
    const r = spawnSync(`npx wrangler kv key put --binding ALLOC_KV --local --persist-to ${q(seedDir)} ${q(k)} --path ${q(f)}`,
      { cwd: REPO, shell: true, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
    assert.strictEqual(r.status, 0, `seeding KV key ${k} failed:\n${r.stderr}`);
  };
  kvPut("data", JSON.stringify({ legacy: true, expenses: [] }));
  kvPut("savedAt", "2026-01-01T00:00:00.000Z");
  kvPut("rev", "7");

  const C = await startWorker({ label: "seeded", port: BASE_PORT + 2, persist: seedDir, token: TOKEN });
  head(`C. Adoption of the pre-Durable-Object KV document — port ${C.port}`);

  await t("10. a fresh room adopts the legacy KV keys, once", async () => {
    const first = await call(C, "/sync");
    assert.strictEqual(first.json.rev, 7, "the KV revision must carry over, not restart at 0");
    assert.deepEqual(first.json.data, { legacy: true, expenses: [] });
    assert.strictEqual(first.json.savedAt, "2026-01-01T00:00:00.000Z");

    const second = await call(C, "/sync");
    assert.deepEqual(second.json, first.json, "a second read must not re-run the seed");

    // And once adopted, the Durable Object is the authority: a write moves on
    // from the adopted rev rather than being reset by the seed on next read.
    const w = await push(C, doc({ expenses: [expense("e3", "post-adoption")] }), 7, "phoneA");
    assert.strictEqual(w.json.ok, true);
    assert.strictEqual(w.json.rev, 8);
    const third = await call(C, "/sync");
    assert.strictEqual(third.json.rev, 8, "the seed must never re-adopt over newer data");
    assert.deepEqual(third.json.data.expenses.map(e => e.id), ["e3"]);
  });
  stop(C);

  /* ---- Instance D: ALLOC_KV unbound ------------------------------------- */
  // A config with SYNC_ROOM but no kv_namespaces. Written to the temp dir, not
  // the repo, so it cannot be mistaken for a deployable config — wrangler.jsonc
  // must stay the only one, because a deploy replaces every binding with what
  // it declares.
  const nokvCfg = path.join(TMP, "nokv.jsonc");
  fs.writeFileSync(nokvCfg, JSON.stringify({
    name: "alloc-kv-nokv-test",
    main: path.join(REPO, "worker.js").replace(/\\/g, "/"),
    compatibility_date: "2026-06-27",
    exports: { SyncRoom: { type: "durable-object", storage: "sqlite" } },
    durable_objects: { bindings: [{ name: "SYNC_ROOM", class_name: "SyncRoom" }] },
  }, null, 2));

  const D = await startWorker({ label: "nokv", port: BASE_PORT + 3, persist: path.join(TMP, "d"),
                                config: nokvCfg, token: TOKEN });
  head(`D. ALLOC_KV unbound — the mirror must never gate a write — port ${D.port}`);

  await t("11. a write succeeds with no KV at all, and the read reflects it", async () => {
    const empty = await call(D, "/sync");
    assert.strictEqual(empty.status, 200, "an unreadable/absent KV must start empty, not refuse service");
    assert.strictEqual(empty.json.rev, 0);

    const w = await push(D, doc({ expenses: [expense("e4", "no mirror")] }), 0, "phoneA");
    assert.strictEqual(w.status, 200);
    assert.strictEqual(w.json.ok, true, "the KV mirror is best-effort; its absence must not fail a write");
    assert.strictEqual(w.json.rev, 1);

    const after = await call(D, "/sync");
    assert.strictEqual(after.json.rev, 1);
    assert.deepEqual(after.json.data.expenses.map(e => e.id), ["e4"]);

    // The Durable Object is the authority either way, so the conflict check
    // must still hold with no mirror behind it.
    const stale = await push(D, doc(), 0, "phoneB");
    assert.strictEqual(stale.json.conflict, true);
  });
  stop(D);

  /* ---- Done ------------------------------------------------------------- */
  stopAll();
  if (KEEP) console.log(`\nState and logs kept in ${TMP}`);
  else if (!rmTemp()) console.log(`\nNOTE: could not remove ${TMP} — a workerd may still hold it. Delete it by hand.`);

  console.log(`\n${fails ? "FAILED" : "PASSED"} — ${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => {
  stopAll();
  console.error("\nHarness error (not a test failure):\n" + (e.stack || e.message || e));
  console.error(`\nState kept for inspection in ${TMP}`);
  process.exit(2);
});
