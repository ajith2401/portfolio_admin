// Pure, synchronous validators for every export route. Each takes a MEASURING ctx (fonts must already be proven ready by
// ensureFonts) and returns the shared result shape ({ok, messages, ...} from validateScene(s) / validateFullPoem /
// newResult()). export.js runs them before drawing; formats.js exposes them per route; tests run them directly.
// `mutate` is for negative controls only: it transforms a COPY of each layout before it is checked.
import { validateScene, validateScenes, posterCards, POSTER_MIN, pageLabelBox, sceneGeometry } from "./render.js";
import { activeBehaviour, validateAnimation, prefParams } from "./animation.js";
import { layoutFullPoem, validateFullPoem, fullTune } from "./full-poem.js";
import { MIN_TEXT_PX, QUOTE_MIN_PX, FORMATS, TEXT_PX_MIN } from "./safe-zone.js";
import { newResult, note, TOLERANCE } from "./coverage.js";
import { textRect, signatureBox } from "./signature.js";
import { drawFrame } from "./render.js";
import { drawFullPoem } from "./full-poem.js";
import { layoutWhole, drawWholeFrame, wholeDuration } from "./whole-poem.js";
import { verifyMaterial } from "./fx/verify.js";
import { materialActive } from "./materials.js";
import { fontById, canBody, canTitle, fontLabel, fontReviewOf, CANDIDATE_EXPORT_WARNING } from "./font-registry.js";

export const SIZE_PX_MIN = TEXT_PX_MIN; // the smallest body size the author may choose (technical bound only)
/**
 * The text floor for a format. With a composition, an author who deliberately chose a SMALLER font size than the
 * format floor gets that size as the floor (their choice, not a failure); never below SIZE_PX_MIN.
 */
export const sceneMin = (format, comp = null) => {
  const f = MIN_TEXT_PX[format] ?? MIN_TEXT_PX.reel, own = Number(comp?.style?.sizePx);
  return Number.isFinite(own) && own < f ? Math.max(SIZE_PX_MIN, Math.round(own)) : f;
};
export const FULL_NO_FIT = "This poem does not fit this canvas at a readable size. Choose the extended-height poster or a more compact layout.";

// ---------------------------------------------------------------- material (fx) verification, shared by every route
// When comp.material is active, every route also proves (fx/verify.js) that the material leaves the text layer exactly
// as it is drawn without it, keeps over-text opacity <= the cap and text contrast >= the floor. No material => no-op.
export const MAX_FX_FRAMES = 16;
const sample = (list, n) => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]));
export function withMaterial(result, ctx, comp, draws) {
  return withFonts(materialOnly(result, ctx, comp, draws), comp);
}
function materialOnly(result, ctx, comp, draws) {
  if (!materialActive(comp)) return result;
  const v = verifyMaterial(ctx, comp, sample(draws, MAX_FX_FRAMES));
  if (v.ok) return { ...result, material: v };
  const messages = [...new Set([...(result.messages || []), ...v.messages])];
  return { ...result, ok: false, messages, material: v };
}

// ---------------------------------------------------------------- font roles, shared by every route (font-registry.js)
// A font outside the registry, a display-only font used for poem (body) text, or a body-only font as the title font is
// REFUSED. A candidate (unreviewed) font is allowed (ensureFonts already proved its glyphs) but the result always says
// fontReview:'unreviewed' with a warning: never silent.
export function fontIssues(comp) {
  const st = comp?.style || {}, out = [];
  if (!fontById(st.font)) out.push(`The poem font "${st.font}" is not in the Studio font list.`);
  else if (!canBody(st.font)) out.push(`"${fontLabel(st.font)}" is a display (title-only) font and cannot be used for poem text.`);
  if (st.titleFont != null) {
    if (!fontById(st.titleFont)) out.push(`The title font "${st.titleFont}" is not in the Studio font list.`);
    else if (!canTitle(st.titleFont)) out.push(`"${fontLabel(st.titleFont)}" cannot be used as a title font.`);
  }
  for (const id of [st.font, st.titleFont]) if (fontById(id) && !fontById(id).loadable) out.push(`"${fontLabel(id)}" cannot be loaded in this Studio.`);
  return out;
}
export function withFonts(result, comp) {
  const issues = fontIssues(comp);
  const review = fontReviewOf(comp);
  const out = review ? { ...result, fontReview: review, fontWarning: CANDIDATE_EXPORT_WARNING } : result;
  if (!issues.length) return out;
  return { ...out, ok: false, fontIssues: issues, messages: [...new Set([...(result.messages || []), ...issues])] };
}
/** The frames a scene route draws: each scene as a still, and mid-scene on the animated timeline. */
export function sceneDraws(comp, scenes, minSize, extra = {}) {
  const starts = new Map();
  let t = 0;
  for (const s of comp.scenes) { starts.set(s, t); t += s.durationMs; }
  return scenes.flatMap((sc) => {
    const still = (c, cm, x) => drawFrame(c, cm, 0, { still: true, scene: sc, minSize, ...extra, ...x });
    const at = starts.get(sc);
    return at == null ? [still] : [still, (c, cm, x) => drawFrame(c, cm, at + sc.durationMs * 0.5, { minSize, ...extra, ...x })];
  });
}

// ---------------------------------------------------------------- text animation (animation.js), every ANIMATED route
// A video route also proves its text animation for every scene it draws (validateAnimation: hold reached and held,
// every line/word fully shown in reading order, offsets/zoom bounded and inside the safe area, deterministic). Routes that
// draw stills (poster, cover, carousel, story frames, quote image, full poem) always draw the HOLD state instead.
// `scenes` are the scenes in play order: the last one has no out phase.
export function checkAnimation(ctx, comp, scenes, { minSize = sceneMin(comp.format, comp), behaviour = activeBehaviour(comp) } = {}) {
  const messages = [], results = [];
  scenes.forEach((sc, i) => {
    const v = validateAnimation(behaviour, sc, sceneGeometry(ctx, comp, sc, { minSize }), {
      last: i === scenes.length - 1, p: prefParams(comp), intensity: comp.motion?.intensity, label: `Scene ${i + 1}`,
    });
    results.push(v);
    messages.push(...v.messages);
  });
  return { ok: messages.length === 0, id: behaviour?.id, messages, warnings: [...new Set(results.flatMap((x) => x.warnings || []))], results };
}
function withAnimation(result, ctx, comp, scenes, opts) {
  const a = checkAnimation(ctx, comp, scenes, opts);
  const warn = a.warnings.length ? { animationWarnings: a.warnings } : {};
  if (a.ok) return { ...result, animation: a, ...warn };
  return { ...result, ok: false, messages: [...new Set([...(result.messages || []), ...a.messages])], animation: a, ...warn };
}

/** Every scene a scene-based route draws, validated exactly as drawFrame lays it out. `animated:false` = stills only. */
export function checkScenes(ctx, comp, scenes = comp.scenes, { minSize = sceneMin(comp.format, comp), mutate = null, animated = true } = {}) {
  const v = validateScenes(ctx, comp, scenes, { minSize, mutate });
  return withMaterial(animated ? withAnimation(v, ctx, comp, scenes, { minSize }) : v, ctx, comp, sceneDraws(comp, scenes, minSize));
}

/** The scene a Reel cover draws: the title card, else the first scene. */
export const coverScene = (comp) => comp.scenes.find((x) => x.kind === "title") || comp.scenes[0] || null;
export function checkCover(ctx, comp, opts = {}) {
  const sc = coverScene(comp);
  if (!sc) return { ok: false, messages: ["There are no scenes to make a cover from."], results: [] };
  return checkScenes(ctx, { ...comp, format: "reel" }, [sc], { ...opts, animated: false }); // a cover is a still
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
  return withMaterial({ ...v, ok: messages.length === 0, messages, plan }, ctx, plan.pc, sceneDraws(plan.pc, plan.cardScenes, POSTER_MIN));
}

// ---------------------------------------------------------------- quote (excerpt) routes
export const QUOTE_MAX_LINES = 8;
export const QUOTE_SCALE = 1.3; // a quote starts larger than a scene; the floor (QUOTE_MIN_PX) is enforced, never shrunk past
export const QUOTE_MS = 6000;
export const quoteMin = (format) => QUOTE_MIN_PX[format] ?? QUOTE_MIN_PX.reel;
/**
 * The scene a quote draws, built from the SOURCE poem (never from the selection's own text). A stanza boundary between
 * selected lines becomes a gap row. Returns null when the selection is not drawable (see checkQuote for why).
 */
export function quoteScene(poem, selection) {
  const lines = [];
  let prev = null;
  for (const s of selection || []) {
    const src = poem?.stanzas?.[s?.stanza]?.[s?.line];
    if (typeof src !== "string") return null;
    if (prev != null && s.stanza !== prev) lines.push("");
    lines.push(src);
    prev = s.stanza;
  }
  return lines.length ? { id: "quote", kind: "quote", lines, scale: QUOTE_SCALE, durationMs: QUOTE_MS } : null;
}
/**
 * Quote = an EXCERPT: user-selected whole lines. Every selection must name an exact, non-empty source line (in order, no
 * duplicates; a `text` it carries must equal the source byte for byte), and the drawn scene must pass validateScene at
 * the quote floor in any format. The result never claims completeness: excerpt:true, complete:false, coverage.partial.
 */
export function checkQuote(ctx, comp, poem, selection, { format = comp.format, mutate = null, animated = false } = {}) {
  const total = (poem?.stanzas || []).flat().filter((l) => l !== "").length;
  const sel = Array.isArray(selection) ? selection : [];
  const r = newResult();
  if (!sel.length) note(r, "missingLines", "Select at least one line for the quote.");
  if (sel.length > QUOTE_MAX_LINES) note(r, "outOfBounds", `A quote is at most ${QUOTE_MAX_LINES} lines; use a poster or the full poem for more.`);
  let prev = null;
  sel.forEach((s, i) => {
    const src = poem?.stanzas?.[s?.stanza]?.[s?.line];
    const where = `quote line ${i + 1}`;
    if (!Number.isInteger(s?.stanza) || !Number.isInteger(s?.line) || typeof src !== "string") return note(r, "missingLines", `${where} is not a line of the poem`);
    if (src === "") note(r, "missingLines", `${where} is an empty line`);
    if (s.text != null && s.text !== src) note(r, "orderIssues", `${where} is not the exact source text of stanza ${s.stanza + 1}, line ${s.line + 1}`);
    if (prev && (s.stanza < prev.stanza || (s.stanza === prev.stanza && s.line <= prev.line))) note(r, "orderIssues", `${where} is out of order or repeated`);
    prev = s;
  });
  const scene = r.messages.length ? null : quoteScene(poem, sel);
  const fc = { ...comp, format: FORMATS[format] ? format : "reel" };
  const v = scene ? validateScenes(ctx, fc, [scene], { minSize: quoteMin(fc.format), enforceMin: true, mutate }) : { ok: false, messages: [], results: [] };
  if (scene) v.messages.forEach((m) => note(r, "outOfBounds", m.replace(/^Scene 1/, "Quote")));
  const messages = r.messages;
  const out = { ...r, ok: messages.length === 0, messages, results: v.results, scene, format: fc.format, excerpt: true, complete: false,
    coverage: { selected: sel.length, total, partial: true } };
  if (!scene) return out;
  const qMin = quoteMin(fc.format);
  return withMaterial(animated ? withAnimation(out, ctx, fc, [scene], { minSize: qMin }) : out, ctx, fc, [
    (c, cm, x) => drawFrame(c, cm, 0, { still: true, scene, minSize: qMin, ...x }),
    (c, cm, x) => drawFrame(c, cm, QUOTE_MS * 0.5, { scene, minSize: qMin, ...x }),
  ]);
}

// ---------------------------------------------------------------- Feed carousel (cover + poem cards + end card, numbered)
/** Every card a carousel draws: optional title cover, the poster SET cards, optional end card; each numbered k/N. */
export function carouselPlan(ctx, comp) {
  const body = posterPlan(ctx, { ...comp, poster: { ...comp.poster, mode: "set" } });
  const title = comp.scenes.find((s) => s.kind === "title");
  const endLines = String(comp.poster?.endText || "").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l, i, a) => l !== "" || (i && a[i - 1] !== ""));
  const end = endLines.some((l) => l !== "") ? { kind: "stanza", lines: endLines, durationMs: 1, id: "end" } : null;
  const cards = [
    ...(title ? [{ role: "cover", scene: { ...title, id: "cover" } }] : []),
    ...body.cardScenes.map((scene) => ({ role: "poem", scene })),
    ...(end ? [{ role: "end", scene: end }] : []),
  ].map((c, i, a) => ({ ...c, page: `${i + 1}/${a.length}` }));
  return { ...body, cards, poemCards: body.cards };
}
export function checkCarousel(ctx, comp, { mutate = null } = {}) {
  const plan = carouselPlan(ctx, comp);
  const pc = plan.pc, fmt = FORMATS.poster;
  const body = checkPoster(ctx, { ...comp, poster: { ...comp.poster, mode: "set" } }, { mutate });
  // cover and end cards: their text goes through the same validator as every poem card
  const extra = plan.cards.filter((c) => c.role !== "poem").map((c) => validateScene(ctx, pc, c.scene, { minSize: POSTER_MIN, mutate, label: c.role === "end" ? "End card" : "Cover card" }));
  const messages = [...body.messages, ...extra.flatMap((x) => x.messages)];
  // numbering: inside the canvas and the side margins, above the text area, clear of the signature
  const rect = textRect(pc, fmt, ctx), side = fmt.safe.side * fmt.w, sg = signatureBox(pc, fmt, ctx);
  for (const c of plan.cards) {
    const b = pageLabelBox(pc, fmt, ctx, c.page);
    if (b.left < side - TOLERANCE || b.right > fmt.w - side + TOLERANCE || b.top < -TOLERANCE) messages.push(`page number ${c.page} is outside the margins`);
    if (b.bottom > rect.y + TOLERANCE) messages.push(`page number ${c.page} overlaps the text area`);
    if (sg && b.bottom > sg.top && b.top < sg.bottom && b.right > sg.left && b.left < sg.right) messages.push(`page number ${c.page} overlaps the signature`);
  }
  if (!plan.poemCards.length) messages.push("Select at least one stanza for the carousel.");
  const draws = plan.cards.map((cd) => (c, cm, x) => drawFrame(c, cm, 0, { still: true, scene: cd.scene, minSize: POSTER_MIN, pageLabel: cd.page, ...x }));
  return withMaterial({ ok: messages.length === 0, messages, results: [...body.results, ...extra], plan }, ctx, pc, draws);
}

/** Full-poem poster: layout + source-aware validation against the SOURCE poem. `fits:false` is a failure, never a clip. */
/**
 * Whole-Poem Video: the whole poem on ONE 9:16 screen. Same source-aware completeness check as the Full-Poem Poster
 * (every line, exact text, order, stanza gaps, bounds, signature) on the layout that is drawn on EVERY frame, plus the
 * material verifier on a still and on moving frames. fits:false => refused with the reason (offer Scene-by-Scene).
 */
export function checkWhole(ctx, comp, poem, { mutate = null } = {}) {
  const fit = layoutWhole(ctx, comp, poem);
  if (!fit.fits) return { ok: false, fits: false, messages: [fit.reason], layout: fit.layout, fit };
  const layout = mutate ? mutate(structuredClone(fit.layout)) || fit.layout : fit.layout;
  const T = wholeDuration(comp);
  const draws = [0.5, 0.25, 0.75].map((f) => (c, cm, x) => drawWholeFrame(c, cm, fit.layout, T * f, x));
  draws.unshift((c, cm, x) => drawWholeFrame(c, cm, fit.layout, 0, { ...x, still: true }));
  const v = withMaterial({ ...validateFullPoem(poem, layout), fits: true, layout, fit }, ctx, comp, draws);
  return fit.notes.length ? { ...v, warnings: fit.notes } : v;
}
export function checkFull(ctx, comp, poem, { preset = "balanced", height = "standard", mutate = null } = {}) {
  const layout0 = layoutFullPoem(ctx, comp, poem, { preset, height, tune: fullTune(comp) });
  if (!layout0.fits) return { ok: false, fits: false, messages: [FULL_NO_FIT], layout: layout0 };
  const layout = mutate ? mutate(structuredClone(layout0)) || layout0 : layout0;
  return withMaterial({ ...validateFullPoem(poem, layout), fits: true, layout }, ctx, comp, [(c, cm, x) => drawFullPoem(c, cm, layout0, x)]);

}
