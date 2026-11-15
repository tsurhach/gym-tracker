import { GOALS, MUSCLES } from "../constants.js";
import { PRESETS, blankWorkouts, buildPlan } from "../proposal.js";
import { esc } from "../ui.js";

// Wizard state lives here (not in saved state) until the user finishes.
let draft = null;

const fresh = (ctx) => ({
  step: 1,
  goal: ctx.state.settings.goal,
  preset: null,
  drafts: blankWorkouts(2),
});

function finish(ctx, propose) {
  const d = draft;
  const { workouts, settings } = ctx.state;
  const prev = { workouts, goal: settings.goal };
  const named = d.drafts.map((w, i) => ({
    name: w.name.trim() || blankWorkouts(i + 1)[i].name,
    muscles: MUSCLES.filter((m) => w.muscles.includes(m)),
  }));
  ctx.state.settings.goal = d.goal;
  ctx.state.workouts = propose
    ? buildPlan(named, ctx.library, d.goal)
    : named.map((w) => ({ id: crypto.randomUUID(), ...w, items: [] }));
  ctx.save({ render: false }).then((saved) => {
    if (saved) {
      draft = null;
      ctx.go("#/plan");
    } else {
      // not saved: restore the old plan and stay here so the user can retry
      ctx.state.workouts = prev.workouts;
      ctx.state.settings.goal = prev.goal;
      window.dispatchEvent(new HashChangeEvent("hashchange")); // app.js re-renders
    }
  });
}

function stepHtml(d, ctx) {
  if (d.step === 1) {
    return `<h2>What is your goal?</h2>
      <p class="muted" style="margin:4px 0 12px">It sets the rep range and number of sets.</p>
      ${Object.entries(GOALS)
        .map(
          ([
            key,
            g,
          ]) => `<button class="big-choice" data-goal="${key}" aria-pressed="${d.goal === key}">
            <b>${esc(g.label)}</b><span>${g.repMin}–${g.repMax} reps · ${g.sets} sets</span></button>`,
        )
        .join("")}`;
  }
  if (d.step === 2) {
    return `<h2>How many workouts?</h2>
      <p class="muted" style="margin:4px 0 12px">Pick a starting point or set your own number.</p>
      <div class="chips">${PRESETS.map(
        (p) =>
          `<button class="chip" data-preset="${p.key}" aria-pressed="${d.preset === p.key}">${esc(p.label)}</button>`,
      ).join("")}</div>
      <div class="stepper">
        <button class="icon-btn" data-n="-1" aria-label="Fewer workouts"${d.drafts.length <= 1 ? " disabled" : ""}>−</button>
        <output aria-live="polite">${d.drafts.length}</output>
        <button class="icon-btn" data-n="1" aria-label="More workouts">+</button>
      </div>
      <button class="btn btn-primary" data-next>Next</button>
      <button class="btn" data-back>Back</button>`;
  }
  return `<h2>What does each workout train?</h2>
    <p class="muted" style="margin:4px 0 12px">Rename a workout and tick its muscles.</p>
    ${d.drafts
      .map(
        (w, i) => `<section class="card" data-i="${i}">
          <input class="name-input" data-name value="${esc(w.name)}" aria-label="Workout ${i + 1} name" maxlength="40" />
          <div class="chips">${MUSCLES.map(
            (m) =>
              `<button class="chip" data-m="${esc(m)}" aria-pressed="${w.muscles.includes(m)}">${esc(m)}</button>`,
          ).join("")}</div>
        </section>`,
      )
      .join("")}
    <button class="btn btn-primary" data-finish="propose">Propose my plan</button>
    <button class="btn" data-finish="empty">Start from empty</button>
    <button class="btn" data-back>Back</button>`;
}

export function render(root, ctx) {
  draft ??= fresh(ctx);
  const d = draft;
  const draw = () => {
    root.innerHTML = `<h1 class="title">Set up your plan</h1>
    <p class="subtitle">Step ${d.step} of 3</p>
    ${stepHtml(d, ctx)}
    ${ctx.state.workouts.length ? `<a class="btn" href="#/plan">Cancel</a>` : ""}`;
  };
  draw();

  // Name edits update the draft without redrawing, so typing is never interrupted.
  root.addEventListener("input", (e) => {
    const card = e.target.closest("[data-i]");
    if (card && e.target.matches("[data-name]"))
      d.drafts[+card.dataset.i].name = e.target.value;
  });

  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.goal) {
      d.goal = t.dataset.goal;
      d.step = 2;
    } else if (t.dataset.preset) {
      const p = PRESETS.find((x) => x.key === t.dataset.preset);
      d.preset = p.key;
      d.drafts = p.workouts.map((w) => ({
        name: w.name,
        muscles: [...w.muscles],
      }));
    } else if (t.dataset.n) {
      const n = Math.max(1, d.drafts.length + Number(t.dataset.n));
      d.preset = null;
      d.drafts = blankWorkouts(n).map((b, i) => d.drafts[i] ?? b);
    } else if (t.matches("[data-next]")) d.step = 3;
    else if (t.matches("[data-back]")) d.step -= 1;
    else if (t.dataset.m) {
      const w = d.drafts[+t.closest("[data-i]").dataset.i];
      w.muscles = w.muscles.includes(t.dataset.m)
        ? w.muscles.filter((m) => m !== t.dataset.m)
        : [...w.muscles, t.dataset.m];
    } else if (t.dataset.finish)
      return finish(ctx, t.dataset.finish === "propose");
    else return;
    draw();
  });
}
