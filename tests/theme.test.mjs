import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { emptyState } from "../js/store.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Run the inline startup script against a fake page; returns the theme it picked.
function boot(localStorage, light = false) {
  const metas = {};
  const doc = {
    documentElement: { dataset: {} },
    querySelector: (q) => (metas[q] ??= { content: "" }),
  };
  const win = {};
  vm.runInNewContext(script, {
    window: win,
    document: doc,
    localStorage,
    matchMedia: () => ({ matches: light }),
  });
  return { theme: doc.documentElement.dataset.theme, metas, win };
}
const store = (v) => ({ getItem: () => v });
const withTheme = (theme) => JSON.stringify({ ...emptyState(), settings: { ...emptyState().settings, theme } });

test("theme: default is dark, and stays dark for missing or corrupt storage", () => {
  assert.equal(emptyState().settings.theme, undefined);
  assert.equal(boot(store(null)).theme, "dark");
  assert.equal(boot(store(JSON.stringify(emptyState()))).theme, "dark");
  assert.equal(boot(store("{not json")).theme, "dark");
  assert.equal(boot(store('{"version":1}')).theme, "dark");
  assert.equal(boot({ getItem: () => { throw new Error("blocked"); } }).theme, "dark");
  assert.equal(boot(undefined).theme, "dark");
});

test("theme: saved choice is applied, auto follows the phone, meta tags follow", () => {
  assert.equal(boot(store(withTheme("light"))).theme, "light");
  assert.equal(boot(store(withTheme("dark")), true).theme, "dark");
  assert.equal(boot(store(withTheme("auto")), true).theme, "light");
  assert.equal(boot(store(withTheme("auto")), false).theme, "dark");
  assert.equal(boot(store(withTheme("bogus")), true).theme, "dark");
  const { metas } = boot(store(withTheme("light")));
  assert.equal(metas['meta[name="theme-color"]'].content, "#f4f2ee");
});

test("theme: window.gymTheme switches live and never throws", () => {
  const { win } = boot(store(null));
  assert.doesNotThrow(() => win.gymTheme("light"));
  assert.doesNotThrow(() => win.gymTheme(null));
});

test("theme: the setting saves through the store and reloads", async () => {
  const { createStore } = await import("../js/store.js");
  const m = new Map();
  const s = createStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) });
  const st = emptyState();
  st.settings.theme = "light";
  assert.equal(s.save(st), true);
  assert.equal(s.load().state.settings.theme, "light");
  assert.equal(st.version, 1);
});
