// Ready-made programs, plan files and the AI route all end at one preview screen (#/import/preview).
// Nothing here redraws from a timer or async work except filling a list that is not being typed in.
import { GOALS, MUSCLES } from "../constants.js";
import {
  applyPlan,
  buildAiPrompt,
  fileKind,
  needsMuscle,
  parsePlanText,
  planFromFile,
} from "../planfile.js";
import { confirmSheet, esc, fmtKg, showBanner } from "../ui.js";
import { ltr, t as tr, tk } from "../i18n/index.js";

let pending = null; // { preview, back } the plan being previewed
const ai = { request: "", mode: "describe", pasted: "", filePasted: "" }; // survives going to the preview and back
const MAX_FILE = 1_000_000;

const head = (t, sub = "") =>
  `<h1 class="title">${esc(t)}</h1>${sub ? `<p class="muted" style="margin:0 0 12px">${sub}</p>` : ""}`;
const back = () => `<a class="btn" href="#/plan">${tr("import.back")}</a>`;
const repsText = (x) =>
  x.repMin === x.repMax ? `${x.repMin}` : `${x.repMin}–${x.repMax}`;

// Text -> preview, or plain errors shown in `box`. Changes nothing in the saved data.
function submit(text, ctx, box, backTo) {
  const read = parsePlanText(text);
  const p = read.ok
    ? planFromFile(read.obj, ctx.library, ctx.state.customExercises)
    : read;
  if (!p.ok) {
    box.innerHTML = `<section class="card"><h3 style="margin-top:0">${tr("import.err.title")}</h3><ul>${p.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul><p class="muted small">${tr("import.err.nothing")}</p></section>`;
    return false;
  }
  pending = { preview: p, back: backTo, fixes: read.fixes ?? [] };
  ctx.go("#/import/preview");
  return true;
}

const pasteBox = (
  id,
  label,
) => `<label class="setting" style="display:block">${label}
    <textarea id="${id}" dir="auto" rows="8" style="width:100%;margin-top:6px" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea></label>`;

// Copies `text`; on failure shows a select-all box in `fb`. Call straight from a tap handler (iOS needs a fresh tap).
async function copyText(text, fb) {
  try {
    await navigator.clipboard.writeText(text);
    fb.innerHTML = "";
    showBanner(tr("import.copied"), { kind: "ok" });
  } catch {
    fb.innerHTML = `<p class="muted small">${tr("import.copyfail")}</p><textarea id="prompt" rows="8" readonly style="width:100%"></textarea>`;
    const ta = fb.querySelector("#prompt");
    ta.value = text;
    ta.focus();
    ta.select();
  }
}

// "Paste the AI's answer" box -> preview. Same on the AI screen and the file screen.
const answerHtml = () => `${pasteBox("answer", tr("import.paste.answer"))}
      <button class="btn btn-primary" id="checkAnswer">${tr("import.check")}</button>`;
function wireAnswer(root, ctx, out, backTo) {
  const a = root.querySelector("#answer");
  a.value = ai.pasted;
  a.oninput = () => (ai.pasted = a.value);
  root.querySelector("#checkAnswer").onclick = () =>
    submit(a.value, ctx, out, backTo);
}

function programsView(root, ctx) {
  root.innerHTML = `${head(tr("import.programs.title"), tr("import.programs.sub"))}<div id="list"><p class="muted">${tr("import.loading")}</p></div>${back()}`;
  fetch("./data/programs.json")
    .then((r) => r.json())
    .then((list) => {
      if (!root.isConnected) return;
      root.querySelector("#list").innerHTML = list
        .map(
          (
            p,
            i,
          ) => `<button class="card btn" data-i="${i}" style="display:block;width:100%;text-align:start">
        <b>${esc(p.name)}</b><div class="muted small">${tr("import.programs.line", { workouts: tr("import.workouts", { n: p.days.length, num: ltr(p.days.length) }), goal: GOALS[p.goal] ? esc(tk("goal", p.goal)) : "" })}</div>
        <div class="muted small">${esc(p.notes ?? "")}</div></button>`,
        )
        .join("");
      root.querySelector("#list").onclick = (e) => {
        const b = e.target.closest("[data-i]");
        if (!b) return;
        const p = planFromFile(
          list[+b.dataset.i],
          ctx.library,
          ctx.state.customExercises,
        );
        if (!p.ok) return showBanner(tr("import.program.unreadable"));
        pending = { preview: p, back: "#/import/programs" };
        ctx.go("#/import/preview");
      };
    })
    .catch(() => {
      if (root.isConnected)
        root.querySelector("#list").innerHTML =
          `<p class="muted">${tr("import.programs.fail")}</p>`;
    });
}

// PDF, photo or Word file: the app cannot read it, so help the owner hand it to their AI app. The File is never read here.
function docPanel(root, ctx, docs, out, f) {
  docs.innerHTML = `<section class="card"><h2>${tr("import.doc.title")}</h2>
    <p>${tr("import.doc.two")}</p>
    <button class="btn btn-primary" id="copyDoc">${tr("import.copy")}</button>
    <div id="docFallback"></div>
    <button class="btn" id="shareDoc">${tr("import.doc.send")}</button>
    <p class="muted small" id="shareMsg"></p>
    <p class="muted small">${tr("import.doc.after")}</p>
    ${answerHtml()}</section>`;
  const $ = (q) => docs.querySelector(q);
  const hint = tr("import.doc.hint");
  $("#copyDoc").onclick = () =>
    copyText(
      buildAiPrompt({
        library: ctx.library,
        custom: ctx.state.customExercises,
        mode: "convert",
      }),
      $("#docFallback"),
    );
  $("#shareDoc").onclick = async () => {
    if (!navigator.canShare?.({ files: [f] }))
      return ($("#shareMsg").textContent = hint);
    try {
      await navigator.share({ files: [f] });
      $("#shareMsg").textContent = "";
    } catch {
      $("#shareMsg").textContent = hint; // cancelled (AbortError) or failed: same plain hint, no error
    }
  };
  wireAnswer(docs, ctx, out, "#/import/file");
}

function fileView(root, ctx) {
  root.innerHTML = `${head(tr("import.file.title"), tr("import.file.sub"))}
    <label class="btn file-btn">${tr("import.file.choose")}<input type="file" accept="application/json,text/plain,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.json,.txt,.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" id="file" /></label>
    ${pasteBox("paste", tr("import.file.paste"))}
    <button class="btn btn-primary" id="check">${tr("import.file.check")}</button>
    <div id="docs"></div>
    <div id="out"></div>${back()}`;
  const out = root.querySelector("#out");
  const docs = root.querySelector("#docs");
  const paste = root.querySelector("#paste");
  paste.value = ai.filePasted;
  paste.oninput = () => (ai.filePasted = paste.value);
  root.querySelector("#file").onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    docs.innerHTML = out.innerHTML = "";
    const kind = fileKind(f.name, f.type);
    if (kind === "ai") return docPanel(root, ctx, docs, out, f);
    if (kind === "unsupported")
      return (out.innerHTML = `<section class="card"><p>${tr("import.file.unsupported")}</p></section>`);
    if (f.size > MAX_FILE)
      return (out.innerHTML = `<section class="card"><p>${tr("import.file.big")}</p></section>`);
    submit(await f.text(), ctx, out, "#/import/file");
  };
  root.querySelector("#check").onclick = () =>
    submit(paste.value, ctx, out, "#/import/file");
}

function aiView(root, ctx) {
  root.innerHTML = `${head(tr("import.ai.title"), tr("import.ai.sub"))}
    <section class="card"><h2>${tr("import.ai.step1")}</h2>
      <label class="setting" style="display:block">${tr("import.ai.want")}
        <textarea id="req" dir="auto" rows="3" style="width:100%;margin-top:6px" maxlength="1000"></textarea></label>
      <div class="seg" role="group" aria-label="${tr("import.ai.kind")}">
        <button class="chip" data-mode="describe">${tr("import.ai.describe")}</button>
        <button class="chip" data-mode="convert">${tr("import.ai.convert")}</button>
      </div>
      <button class="btn btn-primary" id="copy">${tr("import.copy")}</button>
      <div id="fallback"></div>
      <p class="muted small" id="attachNote" hidden>${tr("import.ai.attach")}</p>
      <p class="muted small">${tr("import.ai.paste")}</p>
    </section>
    <section class="card"><h2>${tr("import.ai.step2")}</h2>
      ${answerHtml()}
    </section>
    <div id="out"></div>${back()}`;
  const $ = (s) => root.querySelector(s);
  $("#req").value = ai.request;
  $("#req").oninput = (e) => (ai.request = e.target.value);
  const paint = () => {
    root
      .querySelectorAll("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === ai.mode)),
      );
    $("#attachNote").hidden = ai.mode !== "convert";
  };
  paint();
  root.querySelector(".seg").onclick = (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b) return;
    ai.mode = b.dataset.mode;
    paint();
  };
  $("#copy").onclick = () =>
    copyText(
      buildAiPrompt({
        request: ai.request,
        library: ctx.library,
        custom: ctx.state.customExercises,
        mode: ai.mode,
      }),
      $("#fallback"),
    );
  wireAnswer(root, ctx, $("#out"), "#/import/ai");
}

function previewView(root, ctx) {
  if (!pending) return void (location.hash = "#/plan");
  const { preview: p, back: backTo, fixes = [] } = pending;
  const active = !!ctx.state.active;
  root.innerHTML = `${head(p.name)}
    ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ""}
    <p class="small">${tr("import.preview.goal", { goal: esc(tk("goal", p.goal)), workouts: tr("import.workouts", { n: p.days.length, num: ltr(p.days.length) }) })}</p>
    ${fixes.length ? `<details class="card" id="fixes"><summary>${tr("import.fixes", { n: ltr(fixes.length) })}</summary><ul>${fixes.map((f) => `<li class="small">${esc(f)}</li>`).join("")}</ul></details>` : ""}
    ${active ? `<section class="card"><p>${tr("import.active.card")}</p></section>` : ""}
    ${
      p.newExercises.length
        ? `<section class="card"><h3 style="margin-top:0">${tr("import.new.title")}</h3>
        <p class="muted small">${tr("import.new.sub")}</p>
        ${p.newExercises
          .map(
            (n, i) => `<label class="setting"><span dir="auto">${esc(n.name)}</span>
          <select data-n="${i}" aria-label="${tr("import.muscle.aria", { name: esc(n.name) })}"><option value="">${tr("import.choose")}</option>${MUSCLES.map((m) => `<option value="${esc(m)}"${n.muscle === m ? " selected" : ""}>${esc(tk("muscle", m))}</option>`).join("")}</select></label>`,
          )
          .join("")}
      </section>`
        : ""
    }
    ${p.days
      .map(
        (d) =>
          `<section class="card"><h3 style="margin-top:0" dir="auto">${esc(d.name)}</h3><ul class="items">${d.exercises
            .map(
              (
                x,
              ) => `<li class="item"><div class="row"><div class="grow"><div class="ex-name" dir="auto">${esc(x.name)}</div>
          ${x.kind === "new" ? `<span class="tag">${tr("import.tag.new")}</span>` : x.kind === "existing" ? `<span class="tag">${tr("import.tag.existing")}</span>` : ""}</div>
          <div class="muted">${ltr(`${x.sets} × ${repsText(x)}${x.step !== 2.5 ? ` · +${fmtKg(x.step)} kg` : ""}`)}</div></div></li>`,
            )
            .join("")}</ul></section>`,
      )
      .join("")}
    <button class="btn btn-primary" id="use">${tr("import.use")}</button>
    <a class="btn" href="${esc(backTo)}">${tr("import.cancel")}</a>`;
  const use = root.querySelector("#use");
  const sync = () => (use.disabled = active || needsMuscle(p));
  sync();
  root.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-n]");
    if (!s) return;
    p.newExercises[+s.dataset.n].muscle = s.value || null;
    sync();
  });
  use.onclick = async () => {
    if (ctx.state.active)
      return showBanner(tr("import.active.banner"));
    if (
      !(await confirmSheet(
        tr("import.confirm", { name: p.name }),
        tr("import.use"),
      ))
    )
      return;
    use.disabled = true;
    const { state } = ctx;
    const prev = {
      workouts: state.workouts,
      goal: state.settings.goal,
      n: state.customExercises.length,
    };
    const r = applyPlan(state, p);
    if (!r.ok) {
      sync();
      return showBanner(r.error);
    }
    if (await ctx.save({ render: false })) {
      pending = null;
      showBanner(tr("import.changed"), { kind: "ok" });
      ctx.go("#/today");
    } else {
      state.workouts = prev.workouts;
      state.settings.goal = prev.goal;
      state.customExercises.length = prev.n;
      sync();
    }
  };
}

export function render(root, ctx) {
  const view = {
    programs: programsView,
    file: fileView,
    ai: aiView,
    preview: previewView,
  }[ctx.params.id];
  if (!view) return void (location.hash = "#/plan");
  view(root, ctx);
}
