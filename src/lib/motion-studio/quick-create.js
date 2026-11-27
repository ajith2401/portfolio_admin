// Quick Create model (pure). Poem -> output route (formats.js ROUTES) -> template -> Create, using the EXISTING generation
// path (parsePoemText + generateScenes + defaultComposition) and the EXISTING route validators. Nothing here draws,
// edits text or bypasses a check: gateRoute() always awaits the injected ensureFonts before it runs route.validate().
import { ROUTES, routeById } from "./formats.js";
import { TEMPLATE_LIBRARY, familyOf, familyLabel } from "./templates.js";
import { parsePoemText } from "./poem-input.js";
import { generateScenes } from "./scenes.js";
import {
  defaultComposition,
  normalizeComposition,
  MAX_SCENES,
  FORMAT_KEYS,
} from "./composition.js";

/** Routes Quick Create offers: every registered route except EXCERPT routes (those need a line selection: Export > Quote). */
export const quickRoutes = () =>
  ROUTES.filter((r) => !r.excerpt).map((r) => ({
    id: r.id,
    label: r.label,
    format: r.format,
    kind: r.kind,
  }));
const KIND_LABEL = { video: "Video", image: "Image", set: "Set of images" };
export const routeKindLabel = (k) => KIND_LABEL[k] || k;

/** The composition format a route draws with (the full-poem poster is format-independent; it starts as a Reel). */
export function formatForRoute(route) {
  if (!route) return "reel";
  return FORMAT_KEYS.includes(route.format) ? route.format : "reel";
}
/** The Studio tab where the route's export lives after Create. */
export const tabForRoute = (route) =>
  route?.group === "whole" || route?.id === "whole-cover"
    ? "whole"
    : route?.id === "full-poem"
    ? "full"
    : route?.id === "story-stills"
      ? "story"
      : "export";

/** Template gallery: search over name/mood/family, filter all|favourites|recent; capped list size; recent keeps its order. */
export const MAX_GALLERY = 60;
export function galleryList(
  templates = TEMPLATE_LIBRARY,
  { query = "", filter = "all", favourites = [], recent = [] } = {},
) {
  const q = String(query || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  let list = templates;
  if (filter === "favourites")
    list = list.filter((t) => favourites.includes(t.id));
  if (filter === "recent")
    list = recent
      .map((id) => templates.find((t) => t.id === id))
      .filter(Boolean);
  if (q)
    list = list.filter((t) =>
      `${t.name} ${t.mood || ""} ${t.id} ${familyLabel(familyOf(t))}`.toLowerCase().includes(q),
    );
  return list.slice(0, MAX_GALLERY);
}

/**
 * Validates the Quick Create choices and builds the composition the existing manual path would build.
 * input: { text?, title?, poem? ({title, stanzas} from a Portfolio writing), routeId, templateId }
 * Returns { ok:false, issues:[...] } or { ok:true, route, format, templateId, scenes, poem, composition }.
 * The poem text is never cut, merged or rewritten: an over-long poem is refused, not truncated.
 */
export function planQuickCreate(input = {}) {
  const issues = [];
  const route = routeById(input.routeId);
  if (!route || route.excerpt) issues.push("Choose an output.");
  const tpl = TEMPLATE_LIBRARY.find((t) => t.id === input.templateId);
  if (!tpl) issues.push("Choose a template.");
  let poem = null;
  if (input.poem && Array.isArray(input.poem.stanzas)) {
    poem = {
      title: String(input.poem.title || ""),
      stanzas: input.poem.stanzas,
    };
    if (!poem.stanzas.length)
      issues.push("This writing has no poem lines to animate.");
  } else {
    const p = parsePoemText(String(input.text ?? ""), {
      title: String(input.title ?? ""),
    });
    if (!p.stanzas.length) issues.push("Write, paste or choose a poem first.");
    else if (!p.ok) issues.push(...p.issues.map((i) => i.message));
    else
      poem = {
        title: p.title,
        stanzas: p.stanzas,
        source: p.source,
        blank: p.blank,
        trailingBlank: p.trailingBlank,
      };
  }
  if (issues.length) return { ok: false, issues };
  const scenes = generateScenes(
    { stanzas: poem.stanzas },
    { title: poem.title },
  );
  if (scenes.length > MAX_SCENES)
    return {
      ok: false,
      issues: [
        `This poem needs ${scenes.length} scenes; the limit is ${MAX_SCENES}. Nothing was cut. Split it into several poems.`,
      ],
    };
  const format = formatForRoute(route);
  const composition = normalizeComposition({
    ...defaultComposition({ format, templateId: tpl.id, scenes }),
    originalScenes: structuredClone(scenes),
    ...(input.poem ? {} : { poem }),
  });
  return {
    ok: true,
    route: { id: route.id, label: route.label, kind: route.kind },
    format,
    templateId: tpl.id,
    scenes,
    poem,
    composition,
  };
}

/** The route-specific validator input (the same values ExportPanel/FullPoemPanel pass). */
export const routeInput = (
  routeId,
  { fullPoem, preset = "balanced", height = "standard" } = {},
) => (routeId === "full-poem" ? { poem: fullPoem, preset, height } : /^whole-/.test(routeId) ? { poem: fullPoem } : {});

/**
 * The export gate for Quick Create: fonts FIRST (deps.ensureFonts), then the route's own validator, with a measuring ctx.
 * Refuses (allowed:false) when the route is unknown, fonts are not ready, the validator throws, or it returns ok:false.
 * The validator's messages are passed through verbatim (deduplicated, order kept).
 */
export async function gateRoute(routeId, comp, input, deps = {}) {
  const route = routeById(routeId);
  if (!route)
    return { allowed: false, messages: ["Unknown output."], result: null };
  try {
    if (typeof deps.ensureFonts !== "function")
      throw new Error(
        "Fonts could not be checked, so nothing can be exported.",
      );
    await deps.ensureFonts(comp);
  } catch (e) {
    return {
      allowed: false,
      messages: [e?.message || String(e)],
      result: null,
      stage: "fonts",
    };
  }
  let result;
  try {
    result = route.validate(deps.ctx, comp, input || {});
  } catch (e) {
    return {
      allowed: false,
      messages: [`The ${route.label} check could not run: ${e?.message || e}`],
      result: null,
      stage: "validate",
    };
  }
  const messages = [
    ...new Set([
      ...(result?.messages || []),
      ...(result?.fontWarning ? [result.fontWarning] : []),
    ]),
  ];
  return { allowed: result?.ok === true, messages, result, stage: "validate" };
}
