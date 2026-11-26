// Export route registry: the ONE list of every output the Studio can produce. Each route names its format and kind,
// the scenes it draws, its validator (route-checks.js, run after ensureFonts) and its renderer (export.js).
// ExportPanel renders its buttons from this list; tests/security/motion-studio-routes.test.mjs fails if export.js
// gains a render*/export* function that is not registered here, and runs every route's validator against a Tamil corpus.
//
// route: { id, label, format, kind: "video"|"image"|"set", exportFn, scenesFor(comp, input, ctx), validate(ctx, comp,
//   input), render(comp, input, opts), ui?: { panel, action, label(comp) } }
import { exportMp4, renderSceneStills, renderPosters, renderFullPoem, renderReelCover, renderQuote, exportQuoteMp4, renderCarousel } from "./export.js";
import { checkScenes, checkCover, coverScene, checkPoster, posterPlan, checkFull, checkQuote, quoteScene, carouselPlan, checkCarousel } from "./route-checks.js";

const withFormat = (comp, format) => ({ ...comp, format });
const sceneVideo = (format, label, short) => ({
  id: `${format}-mp4`, label, short, format, kind: "video", group: "scenes", exportFn: exportMp4,
  scenesFor: (comp) => comp.scenes,
  validate: (ctx, comp, input = {}) => checkScenes(ctx, withFormat(comp, format), comp.scenes, { mutate: input.mutate }),
  render: (comp, input, opts) => exportMp4(withFormat(comp, format), opts),
  ui: { panel: "export", action: "video" },
});
const posterSet = (comp) => ({ ...comp, poster: { ...comp.poster, mode: "set" } });
const posterSingle = (comp) => ({ ...comp, poster: { ...comp.poster, mode: "single" } });

export const ROUTES = Object.freeze([
  sceneVideo("reel", "Reel MP4", "Reel"),
  sceneVideo("story", "Story MP4", "Story"),
  sceneVideo("square", "Square MP4", "Square"),
  // EXCERPT routes: only the lines the author selected (input.lines = [{stanza, line, text}]), in any format (input.format).
  // Their validator returns excerpt:true, complete:false, coverage.partial: they never claim to be the whole poem.
  {
    id: "quote", label: "Quote image (excerpt)", format: "any", kind: "image", excerpt: true, exportFn: renderQuote,
    scenesFor: (comp, input = {}) => [quoteScene(input.poem, input.lines)].filter(Boolean),
    validate: (ctx, comp, input = {}) => checkQuote(ctx, comp, input.poem, input.lines, { format: input.format || "poster", mutate: input.mutate }),
    render: (comp, input = {}, opts = {}) => renderQuote(comp, input.poem, input.lines, { format: input.format || "poster", ...opts }),
    ui: { panel: "quote", action: "quote" },
  },
  {
    id: "animated-quote", label: "Animated quote MP4 (excerpt)", format: "any", kind: "video", group: "quote", excerpt: true, exportFn: exportQuoteMp4,
    scenesFor: (comp, input = {}) => [quoteScene(input.poem, input.lines)].filter(Boolean),
    validate: (ctx, comp, input = {}) => checkQuote(ctx, comp, input.poem, input.lines, { format: input.format || "reel", mutate: input.mutate, animated: true }),
    render: (comp, input = {}, opts = {}) => exportQuoteMp4(comp, input.poem, input.lines, { format: input.format || "reel", ...opts }),
    ui: { panel: "quote", action: "quote-mp4" },
  },
  {
    id: "full-poem", label: "Full-poem poster", format: "full", kind: "image", exportFn: renderFullPoem,
    scenesFor: (comp, input = {}) => (input.poem?.stanzas || []).map((lines, i) => ({ id: `f${i}`, kind: "stanza", lines })),
    validate: (ctx, comp, input = {}) => checkFull(ctx, comp, input.poem, input),
    render: (comp, input = {}, opts = {}) => renderFullPoem(comp, input.poem, { preset: input.preset, height: input.height, ...opts }),
    ui: { panel: "export", action: "full-tab", label: () => "Full-poem poster…" },
  },
  {
    id: "reel-cover", label: "Reel cover", format: "reel", kind: "image", exportFn: renderReelCover,
    scenesFor: (comp) => [coverScene(comp)].filter(Boolean),
    validate: (ctx, comp, input = {}) => checkCover(ctx, comp, { mutate: input.mutate }),
    render: (comp, input, opts) => renderReelCover(comp, opts),
    ui: { panel: "export", action: "cover", label: () => "Reel cover PNG" },
  },
  {
    id: "poster", label: "Feed poster", format: "poster", kind: "image", exportFn: renderPosters,
    scenesFor: (comp, input, ctx) => posterPlan(ctx, posterSingle(comp)).cardScenes,
    validate: (ctx, comp, input = {}) => checkPoster(ctx, posterSingle(comp), { mutate: input.mutate }),
    render: (comp, input, opts) => renderPosters(posterSingle(comp), opts),
    ui: { panel: "export", action: "poster", label: () => "Export Feed poster PNG" },
  },
  {
    id: "poster-set", label: "Feed poster set", format: "poster", kind: "set", exportFn: renderPosters,
    scenesFor: (comp, input, ctx) => posterPlan(ctx, posterSet(comp)).cardScenes,
    validate: (ctx, comp, input = {}) => checkPoster(ctx, posterSet(comp), { mutate: input.mutate }),
    render: (comp, input, opts) => renderPosters(posterSet(comp), opts),
  },
  {
    id: "carousel", label: "Feed carousel", format: "poster", kind: "set", exportFn: renderCarousel,
    scenesFor: (comp, input, ctx) => carouselPlan(ctx, comp).cards.map((c) => c.scene),
    validate: (ctx, comp, input = {}) => checkCarousel(ctx, comp, { mutate: input.mutate }),
    render: (comp, input, opts) => renderCarousel(comp, opts),
    ui: { panel: "export", action: "carousel", label: () => "Export Feed carousel (ZIP)" },
  },
  {
    id: "story-stills", label: "Story frames", format: "story", kind: "set", exportFn: renderSceneStills,
    scenesFor: (comp) => comp.scenes,
    validate: (ctx, comp, input = {}) => checkScenes(ctx, withFormat(comp, "story"), comp.scenes, { mutate: input.mutate, animated: false }), // stills: HOLD
    render: (comp, input, opts = {}) => renderSceneStills(comp, { format: "story", ...opts }),
    ui: { panel: "export", action: "story-zip", label: () => "Export Story frames (ZIP)" },
  },
]);

export const routeById = (id) => ROUTES.find((r) => r.id === id) || null;
/** The video route for the composition's current format (a Poster composition exports a Reel). */
export const videoRouteFor = (comp) => ROUTES.find((r) => r.kind === "video" && r.group === "scenes" && r.format === (comp.format === "poster" ? "reel" : comp.format)) || routeById("reel-mp4");
/** Routes ExportPanel lists as buttons (video is rendered separately with its progress/cancel controls). */
export const panelRoutes = () => ROUTES.filter((r) => r.ui?.panel === "export" && r.ui.action !== "video");
