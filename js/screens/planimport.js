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

let pending = null; // { preview, back } the plan being previewed
const ai = { request: "", mode: "describe", pasted: "", filePasted: "" }; // survives going to the preview and back
const MAX_FILE = 1_000_000;

const head = (t, sub = "") =>
  `<h1 class="title">${esc(t)}</h1>${sub ? `<p class="muted" style="margin:0 0 12px">${sub}</p>` : ""}`;
const back = `<a class="btn" href="#/plan">Back to Plan</a>`;
const repsText = (x) =>
  x.repMin === x.repMax ? `${x.repMin}` : `${x.repMin}–${x.repMax}`;

// Text -> preview, or plain errors shown in `box`. Changes nothing in the saved data.
function submit(text, ctx, box, backTo) {
  const read = parsePlanText(text);
  const p = read.ok
    ? planFromFile(read.obj, ctx.library, ctx.state.customExercises)
    : read;
  if (!p.ok) {
    box.innerHTML = `<section class="card"><h3 style="margin-top:0">This plan cannot be used</h3><ul>${p.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul><p class="muted small">Nothing was changed.</p></section>`;
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
    <textarea id="${id}" rows="8" style="width:100%;margin-top:6px" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea></label>`;

// Copies `text`; on failure shows a select-all box in `fb`. Call straight from a tap handler (iOS needs a fresh tap).
async function copyText(text, fb) {
  try {
    await navigator.clipboard.writeText(text);
    fb.innerHTML = "";
    showBanner("Instructions copied.", { kind: "ok" });
  } catch {
    fb.innerHTML = `<p class="muted small">Copying did not work here. Select all of this text and copy it yourself.</p><textarea id="prompt" rows="8" readonly style="width:100%"></textarea>`;
    const ta = fb.querySelector("#prompt");
    ta.value = text;
    ta.focus();
    ta.select();
  }
}

// "Paste the AI's answer" box -> preview. Same on the AI screen and the file screen.
const answerHtml = `${pasteBox("answer", "Paste the AI's answer")}
      <button class="btn btn-primary" id="checkAnswer">Check the plan</button>`;
function wireAnswer(root, ctx, out, backTo) {
  const a = root.querySelector("#answer");
  a.value = ai.pasted;
  a.oninput = () => (ai.pasted = a.value);
  root.querySelector("#checkAnswer").onclick = () =>
    submit(a.value, ctx, out, backTo);
}

function programsView(root, ctx) {
  root.innerHTML = `${head("Ready-made programs", "Pick one to see it first. Nothing changes until you confirm.")}<div id="list"><p class="muted">Loading…</p></div>${back}`;
  fetch("./data/programs.json")
    .then((r) => r.json())
    .then((list) => {
      if (!root.isConnected) return;
      root.querySelector("#list").innerHTML = list
        .map(
          (
            p,
            i,
          ) => `<button class="card btn" data-i="${i}" style="display:block;width:100%;text-align:left">
        <b>${esc(p.name)}</b><div class="muted small">${p.days.length} ${p.days.length === 1 ? "workout" : "workouts"} · ${esc(GOALS[p.goal]?.label ?? "")}</div>
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
        if (!p.ok) return showBanner("This program could not be read.");
        pending = { preview: p, back: "#/import/programs" };
        ctx.go("#/import/preview");
      };
    })
    .catch(() => {
      if (root.isConnected)
        root.querySelector("#list").innerHTML =
          `<p class="muted">Could not load the programs. Check your connection and try again.</p>`;
    });
}

// PDF, photo or Word file: the app cannot read it, so help the owner hand it to their AI app. The File is never read here.
function docPanel(root, ctx, docs, out, f) {
  docs.innerHTML = `<section class="card"><h2>This app can't read PDFs or photos on its own yet.</h2>
    <p>Your AI app can: two taps.</p>
    <button class="btn btn-primary" id="copyDoc">Copy instructions</button>
    <div id="docFallback"></div>
    <button class="btn" id="shareDoc">Send the file to your AI app</button>
    <p class="muted small" id="shareMsg"></p>
    <p class="muted small">In your AI app, paste the instructions, send, then copy its whole answer and come back.</p>
    ${answerHtml}</section>`;
  const $ = (q) => docs.querySelector(q);
  const hint =
    "Open your AI app, attach the file there, and paste the instructions.";
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
  root.innerHTML = `${head("Load a plan from a file", "Choose a plan file (.json), or paste the plan text, for example an answer from an AI chat.")}
    <label class="btn file-btn">Choose a plan file<input type="file" accept="application/json,text/plain,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.json,.txt,.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx" id="file" /></label>
    ${pasteBox("paste", "Or paste plan text")}
    <button class="btn btn-primary" id="check">Check pasted plan</button>
    <div id="docs"></div>
    <div id="out"></div>${back}`;
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
      return (out.innerHTML = `<section class="card"><p>This kind of file cannot be used. Choose a plan file (.json or .txt), a PDF, a photo or a Word file.</p></section>`);
    if (f.size > MAX_FILE)
      return (out.innerHTML = `<section class="card"><p>This file is too big to be a plan.</p></section>`);
    submit(await f.text(), ctx, out, "#/import/file");
  };
  root.querySelector("#check").onclick = () =>
    submit(paste.value, ctx, out, "#/import/file");
}

function aiView(root, ctx) {
  root.innerHTML = `${head("Build a plan with AI", "Free: use the Claude or ChatGPT app you already have.")}
    <section class="card"><h2>Step 1</h2>
      <label class="setting" style="display:block">What do you want? (e.g. 3 days a week, build muscle, 1 hour, bad knees)
        <textarea id="req" rows="3" style="width:100%;margin-top:6px" maxlength="1000"></textarea></label>
      <div class="seg" role="group" aria-label="Kind of request">
        <button class="chip" data-mode="describe">Describe what I want</button>
        <button class="chip" data-mode="convert">I have a plan to convert (I'll attach it in the AI app)</button>
      </div>
      <button class="btn btn-primary" id="copy">Copy instructions</button>
      <div id="fallback"></div>
      <p class="muted small" id="attachNote" hidden>You can attach your file (PDF, photo or Word) in the AI app itself.</p>
      <p class="muted small">Paste this into the Claude or ChatGPT app (attach your plan file or photo there if you have one), then copy its whole answer and come back.</p>
    </section>
    <section class="card"><h2>Step 2</h2>
      ${answerHtml}
    </section>
    <div id="out"></div>${back}`;
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
    <p class="small"><b>Goal:</b> ${esc(GOALS[p.goal].label)} · ${p.days.length} ${p.days.length === 1 ? "workout" : "workouts"}</p>
    ${fixes.length ? `<details class="card" id="fixes"><summary>Adjusted while reading (${fixes.length})</summary><ul>${fixes.map((f) => `<li class="small">${esc(f)}</li>`).join("")}</ul></details>` : ""}
    ${active ? `<section class="card"><p>A workout is in progress. Finish or discard it before using a new plan.</p></section>` : ""}
    ${
      p.newExercises.length
        ? `<section class="card"><h3 style="margin-top:0">New exercises of your own</h3>
        <p class="muted small">These are not in the exercise list. They will be added as your own exercises. Choose the main muscle for each.</p>
        ${p.newExercises
          .map(
            (n, i) => `<label class="setting">${esc(n.name)}
          <select data-n="${i}" aria-label="Muscle group for ${esc(n.name)}"><option value="">Choose…</option>${MUSCLES.map((m) => `<option${n.muscle === m ? " selected" : ""}>${esc(m)}</option>`).join("")}</select></label>`,
          )
          .join("")}
      </section>`
        : ""
    }
    ${p.days
      .map(
        (d) =>
          `<section class="card"><h3 style="margin-top:0">${esc(d.name)}</h3><ul class="items">${d.exercises
            .map(
              (
                x,
              ) => `<li class="item"><div class="row"><div class="grow"><div class="ex-name">${esc(x.name)}</div>
          ${x.kind === "new" ? `<span class="tag">New exercise of your own</span>` : x.kind === "existing" ? `<span class="tag">Your exercise</span>` : ""}</div>
          <div class="muted">${x.sets} × ${repsText(x)}${x.step !== 2.5 ? ` · +${fmtKg(x.step)} kg` : ""}</div></div></li>`,
            )
            .join("")}</ul></section>`,
      )
      .join("")}
    <button class="btn btn-primary" id="use">Use this plan</button>
    <a class="btn" href="${esc(backTo)}">Cancel</a>`;
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
      return showBanner(
        "A workout is in progress. Finish or discard it first.",
      );
    if (
      !(await confirmSheet(
        `Use "${p.name}"? It replaces your current plan. Your workout history is kept. Making a backup first is a good idea (Plan, Export backup).`,
        "Use this plan",
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
      showBanner("Plan changed.", { kind: "ok" });
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
