// Pure planner behind the explicit "Fit scenes" action. It only ever REGROUPS whole source lines into more
// scenes (line boundaries first); it never edits, drops, reorders or shrinks text. A single line too long for one
// scene at the minimum size is left to wrap (wrapped rows are fine) and is reported in `unfittable` if even that fails.
import { validateScene } from "./render.js";
import { sceneMin } from "./route-checks.js";
import { restamp } from "./scene-edit.js";
import { sceneDuration, sceneLines, totalDuration, MIN_SCENE_MS, MAX_SCENE_MS } from "./scenes.js";
import { MAX_SCENES } from "./composition.js";

const clampMs = (n) => Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, Math.round(n)));
const OVERRIDES = ["offsetY", "align", "scale"];

/** Does this group of lines fit as ONE scene at >= minSize (every source line reproduced, inside the safe area)? */
function fitsAsScene(ctx, fitComp, base, lines, minSize) {
  return validateScene(ctx, fitComp, { ...base, lines }, { minSize, label: "fit" }).ok;
}

/** Smallest even split of `lines` into n>=2 consecutive groups that all fit; else greedy; lone unfittable lines stay alone. */
function splitLines(ctx, fitComp, base, lines, minSize) {
  for (let n = 2; n <= lines.length; n++) {
    const per = Math.ceil(lines.length / n), groups = [];
    for (let i = 0; i < lines.length; i += per) groups.push(lines.slice(i, i + per));
    if (groups.every((g) => fitsAsScene(ctx, fitComp, base, g, minSize))) return groups;
  }
  // greedy fallback: longest fitting prefix, a single line is always allowed to stand alone (it will wrap)
  const groups = [];
  let i = 0;
  while (i < lines.length) {
    let k = 1;
    while (i + k < lines.length && fitsAsScene(ctx, fitComp, base, lines.slice(i, i + k + 1), minSize)) k++;
    groups.push(lines.slice(i, i + k));
    i += k;
  }
  return groups;
}

/**
 * planFit(ctx, comp) -> { ok, reason?, scenes, addedScenes, sceneCountBefore, sceneCountAfter, durationBeforeMs,
 * durationAfterMs, changed:[new-array indices of new/modified scenes], keptManualTimings, unfittable:[indices],
 * sizePx:{from,to} }. `ctx` is a measuring 2D context. The input comp is never mutated; apply with applyFit().
 */
export function planFit(ctx, comp) {
  const before = comp.scenes || [];
  const fmt = comp.format;
  const minSize = sceneMin(fmt, comp); // the author's own size when it is below the recommended size
  const baseOut = (extra) => ({
    ok: true, scenes: before, addedScenes: 0, sceneCountBefore: before.length, sceneCountAfter: before.length,
    durationBeforeMs: totalDuration(before), durationAfterMs: totalDuration(before), changed: [], keptManualTimings: 0,
    unfittable: [], sizePx: { from: comp.style.sizePx, to: comp.style.sizePx }, ...extra,
  });
  if (fmt === "poster") return baseOut({ ok: true, reason: "Posters are not split into scenes." });

  // The author's size is used as chosen: fitting only regroups whole lines, it never raises the size or a scene scale.
  const sizePx = comp.style.sizePx;
  const fitComp = { ...comp, style: { ...comp.style, sizePx } };
  const out = [];
  const changedSet = new Set();
  let keptManual = 0;

  before.forEach((sc) => {
    const scene = sc;
    const needsSplit = scene.lines.length > 1 && !fitsAsScene(ctx, fitComp, scene, scene.lines, minSize);
    if (!needsSplit) {
      if (scene.durationMs !== sceneDuration(scene.lines)) keptManual++;
      out.push({ ...scene, lines: scene.lines.slice() });
      return;
    }
    const groups = splitLines(ctx, fitComp, scene, scene.lines, minSize);
    const total = scene.durationMs, n = scene.lines.length;
    groups.forEach((g, gi) => {
      const piece = { id: gi === 0 ? scene.id : `${String(scene.id).slice(0, 30)}-f${gi}`, kind: gi === 0 ? scene.kind : "stanza", lines: g.slice(), durationMs: clampMs((total * g.length) / n) };
      if (scene.stanza != null && scene.part != null) { piece.stanza = scene.stanza; piece.part = scene.part + gi / (groups.length + 1); piece.parts = scene.parts; }
      if (gi === 0) OVERRIDES.forEach((k) => { if (scene[k] != null) piece[k] = scene[k]; });
      else if (scene.scale != null) piece.scale = scene.scale; // every piece keeps the scene's own size
      changedSet.add(out.length);
      out.push(piece);
    });
  });

  const scenes = restamp(out);
  const unfittable = [];
  scenes.forEach((sc, i) => { if (!fitsAsScene(ctx, fitComp, sc, sc.lines, minSize)) unfittable.push(i); });
  const after = totalDuration(scenes);
  const plan = {
    ok: true, scenes, addedScenes: scenes.length - before.length, sceneCountBefore: before.length, sceneCountAfter: scenes.length,
    durationBeforeMs: totalDuration(before), durationAfterMs: after, changed: [...changedSet].sort((a, b) => a - b),
    keptManualTimings: keptManual, unfittable, sizePx: { from: comp.style.sizePx, to: sizePx },
  };
  if (scenes.length > MAX_SCENES) return { ...plan, ok: false, reason: `Fitting would need ${scenes.length} scenes; the limit is ${MAX_SCENES}. Nothing was changed.` };
  // Final safety net: the planner must reproduce the exact same lines in the same order, or it refuses.
  if (JSON.stringify(sceneLines(scenes)) !== JSON.stringify(sceneLines(before)) || scenes.filter((s) => s.kind === "title").length !== before.filter((s) => s.kind === "title").length)
    return { ...plan, ok: false, reason: "Internal check failed: the fitted scenes would not reproduce every line in order. Nothing was changed." };
  return plan;
}

/** The composition after an accepted plan (style size raised only when the plan says so). */
export function applyFit(comp, plan) {
  return { ...comp, scenes: plan.scenes, style: { ...comp.style, sizePx: plan.sizePx.to } };
}

/** Scenes whose resolved size is below the floor or that cannot fit at it. Drives the readability warning. */
export function readabilityIssues(ctx, comp) {
  if (comp.format === "poster") return [];
  const minSize = sceneMin(comp.format, comp);
  const bad = [];
  comp.scenes.forEach((sc, i) => { if (!validateScene(ctx, comp, sc, { minSize, label: `Scene ${i + 1}` }).ok) bad.push(i); });
  return bad;
}
