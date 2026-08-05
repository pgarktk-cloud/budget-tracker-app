/* devicetagtest.cjs — the device label that reaches the X-Sync/X-Device-Id header.
 *
 * Why this exists: naming a phone "Wife's iPhone" on iOS broke sync outright.
 * Smart punctuation turns the typed apostrophe into U+2019, HTTP header values
 * are ByteStrings (<= U+00FF), so fetch() threw a TypeError before a byte left
 * the device and the app could only say "Sync failed". Shipped in v1.21.0,
 * found on a real phone 2026-08-05, fixed in v1.22.1.
 *
 * Slices headerSafe/deviceTag out of index.html and runs them under vm, per
 * CLAUDE.md — testing a reimplementation would only test the copy.
 *
 *   node devicetagtest.cjs
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

/* Slice markers are plain indexOf on source text and break silently when the
   code moves — assert they were found (CLAUDE.md trap #2). */
function slice(startMarker, endMarker) {
  const a = SRC.indexOf(startMarker);
  assert.ok(a !== -1, `slice marker not found: ${startMarker}`);
  const b = SRC.indexOf(endMarker, a);
  assert.ok(b !== -1, `end marker not found: ${endMarker}`);
  return SRC.slice(a, b);
}

const ctx = { localStorage: null };
vm.createContext(ctx);

// A fake localStorage so getDeviceId/getDeviceLabel behave as they do on device.
function useStore(store) {
  ctx.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
}

const body = slice("const DEVICE_ID_KEY=", "const PROFILE_KEY=");
/* Top-level const bindings do NOT attach to a vm context — only function
   declarations do (CLAUDE.md trap #3). Hand the ones we need over explicitly. */
vm.runInContext(body + "\nthis.HEADER_PUNCT_MAP=HEADER_PUNCT_MAP;", ctx);

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* Node's Headers is the same ByteString check the browser's fetch applies —
   so this asserts the real constraint, not our idea of it. */
function headerAccepts(value) {
  try { new Headers({ "X-Device-Id": value }); return true; }
  catch (e) { return false; }
}

console.log("headerSafe — the actual failure");

check("the exact bug: iOS smart apostrophe is rejected by a real Headers()", () => {
  assert.strictEqual(headerAccepts("Wife’s iPhone (ab12cd34)"), false);
});

check("...and headerSafe makes that same string acceptable", () => {
  const out = ctx.headerSafe("Wife’s iPhone (ab12cd34)");
  assert.strictEqual(out, "Wife's iPhone (ab12cd34)");
  assert.strictEqual(headerAccepts(out), true);
});

check("straight apostrophe was always fine and is left alone", () => {
  assert.strictEqual(ctx.headerSafe("Wife's iPhone"), "Wife's iPhone");
});

check("curly double quotes and dashes fold to ASCII", () => {
  assert.strictEqual(ctx.headerSafe("“Jas” — phone"), '"Jas" - phone');
});

check("ellipsis folds to three dots", () => {
  assert.strictEqual(ctx.headerSafe("phone…"), "phone...");
});

check("non-breaking space becomes a normal space", () => {
  assert.strictEqual(ctx.headerSafe("my phone"), "my phone");
});

check("accents fold rather than vanish", () => {
  assert.strictEqual(ctx.headerSafe("José"), "Jose");
  assert.strictEqual(ctx.headerSafe("Charlène"), "Charlene");
});

check("emoji are dropped, surrounding text survives", () => {
  const out = ctx.headerSafe("phone 📱 two");
  assert.strictEqual(out, "phone two");
  assert.strictEqual(headerAccepts(out), true);
});

check("CJK is dropped without throwing", () => {
  assert.strictEqual(headerAccepts(ctx.headerSafe("妈妈的手机")), true);
});

check("CR/LF are removed — a newline in a header value is header injection", () => {
  const out = ctx.headerSafe("a\r\nX-Sync-Token: stolen");
  assert.ok(!/[\r\n]/.test(out), `still contains CR/LF: ${JSON.stringify(out)}`);
  assert.strictEqual(headerAccepts(out), true);
});

check("null/undefined/number inputs don't throw", () => {
  assert.strictEqual(ctx.headerSafe(null), "");
  assert.strictEqual(ctx.headerSafe(undefined), "");
  assert.strictEqual(ctx.headerSafe(42), "42");
});

check("leading/trailing and runs of whitespace collapse", () => {
  assert.strictEqual(ctx.headerSafe("  a   b  "), "a b");
});

console.log("\ndeviceTag — what actually goes on the wire");

check("no label → bare id", () => {
  useStore({ "allocation:deviceId": "ab12cd34" });
  assert.strictEqual(ctx.deviceTag(), "ab12cd34");
});

check("label with a smart apostrophe produces a sendable tag", () => {
  useStore({ "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": "Wife’s iPhone" });
  const tag = ctx.deviceTag();
  assert.strictEqual(tag, "Wife's iPhone (ab12cd34)");
  assert.strictEqual(headerAccepts(tag), true);
});

check("HEALS ON READ: a bad label already in storage needs no retyping", () => {
  // This is the whole point of sanitizing at the read point rather than the
  // setter — her phone already has the broken label saved.
  useStore({ "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": "Wife’s iPhone" });
  assert.strictEqual(headerAccepts(ctx.deviceTag()), true);
  // ...and the stored label is untouched, so Settings still shows what she typed.
  assert.strictEqual(ctx.getDeviceLabel(), "Wife’s iPhone");
});

check("a label that sanitizes to nothing falls back to the bare id", () => {
  useStore({ "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": "📱📱" });
  assert.strictEqual(ctx.deviceTag(), "ab12cd34");
});

check("tag stays within the Worker's own 64-char slice", () => {
  useStore({ "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": "x".repeat(120) });
  const tag = ctx.deviceTag();
  assert.ok(tag.length <= 64, `length ${tag.length}`);
  assert.strictEqual(headerAccepts(tag), true);
});

check("every label a person could plausibly type is sendable", () => {
  const labels = [
    "Wife’s iPhone", "Jastine’s phone", "Charlène’s 📱",
    "iPhone 15 Pro", "‘work’ phone", "mum—phone", "妈妈的手机",
    "", "   ", "tab\there",
  ];
  for (const l of labels) {
    useStore({ "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": l });
    const tag = ctx.deviceTag();
    assert.strictEqual(headerAccepts(tag), true, `not sendable for ${JSON.stringify(l)}: ${JSON.stringify(tag)}`);
    assert.ok(tag.length > 0, `empty tag for ${JSON.stringify(l)}`);
  }
});

console.log("\nsetDeviceLabel — storage side");

check("control characters are stripped at the store point", () => {
  const store = { "allocation:deviceId": "ab12cd34" };
  useStore(store);
  ctx.setDeviceLabel("a\x00b\x1Fc");
  assert.strictEqual(ctx.getDeviceLabel(), "abc");
});

check("smart punctuation is PRESERVED in storage — display keeps what was typed", () => {
  const store = { "allocation:deviceId": "ab12cd34" };
  useStore(store);
  ctx.setDeviceLabel("Wife’s iPhone");
  assert.strictEqual(ctx.getDeviceLabel(), "Wife’s iPhone");
});

check("clearing the field removes the key", () => {
  const store = { "allocation:deviceId": "ab12cd34", "allocation:deviceLabel": "x" };
  useStore(store);
  ctx.setDeviceLabel("   ");
  assert.strictEqual("allocation:deviceLabel" in store, false);
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
