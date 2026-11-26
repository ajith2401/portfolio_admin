// Pure, synchronous validators for every export route. Each takes a MEASURING ctx (fonts must already be proven ready by
// ensureFonts) and returns the shared result shape ({ok, messages, ...} from validateScene(s) / validateFullPoem /
// newResult()). export.js runs them before drawing; formats.js exposes them per route; tests run them directly.
// `mutate` is for negative controls only: it transforms a COPY of each layout before it is checked.
import { validateScenes, posterCards, POSTER_MIN } from "./render.js";
import { layoutFullPoem, validateFullPoem } from "./full-poem.js";
import { MIN_TEXT_PX } from "./safe-zone.js";

export const sceneMin = (format) => MIN_TEXT_PX[format] ?? MIN_TEXT_PX.reel;
export const FULL_NO_FIT = "This poem does not fit this canvas at a readable size. Choose the extended-height poster or a more compact layout.";

/** Every scene a scene-based route draws, validated exactly as drawFrame lays it out. */
export function checkScenes(ctx, comp, scenes = comp.scenes, { minSize = sceneMin(comp.format), mutate = null } = {}) {
  return validateScenes(ctx, comp, scenes, { minSize, mutate });
}

/** The scene a Reel cover draws: the title card, else the first scene. */
export const coverScene = (comp) => comp.scenes.find((x) => x.kind === "title") || comp.scenes[0] || null;
export function checkCover(ctx, comp, opts = {}) {
  const sc = coverScene(comp);
  if (!sc) return { ok: false, messages: ["There are no scenes to make a cover from."], results: [] };
  return checkScenes(ctx, { ...comp, format: "reel" }, [sc], opts);
}

/** Poster cards a Feed poster (single or set) will draw, and the selected scenes they must reproduce. */
export function posterPlan(ctx, comp) {
  const pc = { ...comp, format: "poster" };
  const { cards, overflow } = posterCards(ctx, comp);
  const ids = comp.poster.sceneIds, chosen = comp.scenes.filter((s) => s.kind !== "title" && (!ids.length || ids.includes(s.id)));
  const cardScenes = cards.map((card, i) => ({ kind: "stanza", lines: card.lines, durationMs: 1, id: `p${i}` }));
  return { pc, cards, overflow, chosen, cardScenes };
}
export function checkPoster(ctx, comp, { mutate = null } = {}) {
  const plan = posterPlan(ctx, comp);
  const v = validateScenes(ctx, plan.pc, plan.cardScenes, { minSize: POSTER_MIN, mutate });
  const want = plan.chosen.flatMap((s) => s.lines), got = plan.cards.flatMap((cd) => cd.lines).filter((l) => l !== "");
  const messages = [...v.messages];
  if (want.length !== got.length || want.some((l, i) => l !== got[i])) messages.push("the poster cards do not contain every selected line, in order");
  return { ...v, ok: messages.length === 0, messages, plan };
}

/** Full-poem poster: layout + source-aware validation against the SOURCE poem. `fits:false` is a failure, never a clip. */
export function checkFull(ctx, comp, poem, { preset = "balanced", height = "standard", mutate = null } = {}) {
  const layout0 = layoutFullPoem(ctx, comp, poem, { preset, height });
  if (!layout0.fits) return { ok: false, fits: false, messages: [FULL_NO_FIT], layout: layout0 };
  const layout = mutate ? mutate(structuredClone(layout0)) || layout0 : layout0;
  return { ...validateFullPoem(poem, layout), fits: true, layout };
}
