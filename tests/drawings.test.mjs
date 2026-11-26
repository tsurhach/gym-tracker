import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { exImageUrls, photoHtml, howtoHtml } from "../js/ui.js";

const root = new URL("../", import.meta.url);
const lib = JSON.parse(readFileSync(new URL("data/exercises.json", root), "utf8"));
const walk = (dir) =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`],
  );

test("every image path in exercises.json exists, and none is missing a count", () => {
  for (const e of lib) {
    assert.ok([0, 1, 2].includes(e.images), `${e.id} images`);
    const urls = exImageUrls(e);
    assert.equal(urls.length, e.images);
    for (const u of urls) assert.ok(existsSync(new URL(u, root)), `${u} missing`);
  }
});

test("no .jpg left under img/ex, and no unreferenced files", () => {
  const files = walk("img/ex/");
  assert.deepEqual(files.filter((f) => /\.jpe?g$/i.test(f)), []);
  const used = new Set(lib.flatMap(exImageUrls).map((u) => u.slice(2)));
  assert.deepEqual(files.filter((f) => !used.has(f)), []);
});

test("total picture size stays small", () => {
  const total = walk("img/ex/").reduce((n, f) => n + statSync(new URL(f, root)).size, 0);
  assert.ok(total < 16 * 1024 * 1024, `${total} bytes`);
});

test("0 pictures render nothing, 1 is still, 2 cross-fade", () => {
  assert.equal(photoHtml({ id: "x", images: 0 }), "");
  assert.equal(photoHtml({ id: "custom-1" }), "");
  const one = photoHtml({ id: "x", images: 1 });
  assert.match(one, /class="photo still"/);
  assert.equal((one.match(/<img/g) || []).length, 1);
  const two = photoHtml({ id: "x", images: 2 });
  assert.doesNotMatch(two, /still/);
  assert.match(two, /class="a" src="\.\/img\/ex\/x\/0\.svg"/);
  assert.match(two, /class="b" src="\.\/img\/ex\/x\/1\.svg"/);
});

test("png exercises use their extension", () => {
  assert.deepEqual(exImageUrls({ id: "x", images: 1, ext: "png" }), ["./img/ex/x/0.png"]);
});

test("the hint always shows under the picture, escaped", () => {
  const html = photoHtml({ id: "plank", images: 1, hint: "Hold <this>." });
  assert.match(html, /photo-hint">Hold &lt;this&gt;\.</);
  assert.doesNotMatch(photoHtml({ id: "x", images: 2 }), /photo-hint/);
  const plank = lib.find((e) => e.id === "plank");
  assert.equal(plank.hint, "Hold this position.");
  assert.ok(lib.find((e) => e.id === "russian-twist").hint.startsWith("Twist your upper body"));
});

test("how-to text: off by default, on shows, off hides", () => {
  const ex = { id: "x", howto: "Do it." };
  assert.equal(howtoHtml(ex, {}), "");
  assert.equal(howtoHtml(ex, undefined), "");
  assert.equal(howtoHtml(ex, { showHowTo: false }), "");
  assert.match(howtoHtml(ex, { showHowTo: true }), /Do it\./);
  assert.equal(howtoHtml({ id: "custom-1" }, { showHowTo: true }), "");
});

test("every library exercise has a written how-to", () => {
  for (const e of lib) {
    assert.equal(typeof e.howto, "string", e.id);
    assert.ok(e.howto.trim().length > 40, `${e.id} howto too short`);
  }
});

test("every drawing has the light line colour and no dark line colour on the dark fill", () => {
  for (const f of walk("img/ex/").filter((f) => f.endsWith(".svg"))) {
    const t = readFileSync(new URL(f, root), "utf8");
    const cols = [...t.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1].toLowerCase());
    assert.ok(cols.includes("#c9ced8"), `${f} has no light line colour`);
    for (const c of cols) assert.ok(c === "#1a1d24" || c === "#c9ced8", `${f} has stray colour ${c}`);
  }
});
