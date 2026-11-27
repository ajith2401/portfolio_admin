// Composition: the serialisable description of a Reel / Story / Poster. Never contains the poem document itself
// (only the text lines chosen for each scene) and never any HTML. normalizeComposition() is the single gate used
// by the API and the client: it whitelists fields, clamps numbers and rejects anything else.
import { templateById } from "./templates.js";
import { resolveFonts } from "./font-registry.js";
import { parsePoemText, MAX_POEM_CHARS } from "./poem-input.js";
import {
  SIG_SIZE_MIN,
  SIG_SIZE_MAX,
  SIG_Y_MIN,
  SIG_Y_MAX,
  newSignatureDefaults,
  isLegacySignature,
} from "./signature.js";
import {
  sceneDuration,
  attachStanzaMeta,
  MIN_SCENE_MS,
  MAX_SCENE_MS,
} from "./scenes.js";
import { normalizeMaterial, DEFAULT_INTENSITY } from "./materials.js";
import { LIBRARY_IDS, MOTION_PREFS } from "./animation.js";

export const FORMAT_KEYS = ["reel", "story", "poster", "square"];
export const TEXT_IN = ["fade", "line", "rise", "none"];
/** Every text-in id a composition may store: the four classic behaviours + the animation library (animation.js). */
export const TEXT_IN_ALL = [...TEXT_IN, ...LIBRARY_IDS];
/** Motion preference + reduce-motion, stored only when set (legacy projects normalize unchanged). */
export const motionPrefsOf = (m) => ({
  ...(MOTION_PREFS.includes(m?.pref) ? { pref: m.pref } : {}),
  ...(m?.reduceMotion === true ? { reduceMotion: true } : {}),
});
export const BG_MOTION = ["none", "zoom", "drift"];
export const PARTICLES = ["none", "dust", "rain", "stars", "light"];
export const ALIGN = ["left", "center", "right"];
export const VALIGN = ["top", "middle", "bottom"];
export const BG_KINDS = ["solid", "gradient", "paper"];
// Generous cap: a long poem must never lose scenes silently. normalizeComposition never truncates a realistic poem.
export const MAX_SCENES = 400;
export const MAX_LINES = 12;
export const MAX_LINE_CHARS = 400;

const hex = (v, d) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : d;
const num = (v, lo, hi, d) =>
  Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d;
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
// Background images must be an https Cloudinary image of ours or a same-origin path. blob:/data:/javascript: never persist.
export const safeImageUrl = (v) => {
  if (typeof v !== "string" || v.length > 2048) return null;
  if (/^\/[^/\\]/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.username &&
      !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
};
export const FULL_PRESETS = ["elegant", "balanced", "compact", "expressive"];
export const MAX_STANZAS = 400,
  MAX_STANZA_LINES = 120;
/**
 * Server-side guard: the first poem or scene line longer than MAX_LINE_CHARS in a raw composition, or null. The normalizer
 * cuts such a line, so the API REFUSES the request first (nothing is saved) instead of silently truncating a poem.
 * Uses UTF-16 length, the same unit the normalizer cuts at.
 */
export function overLongLine(c) {
  const long = (l) => typeof l === "string" && l.length > MAX_LINE_CHARS;
  const arr = (v) => (Array.isArray(v) ? v : []);
  for (const [si, st] of arr(c?.poem?.stanzas).entries())
    for (const [li, l] of arr(st).entries())
      if (long(l)) return { where: "poem", stanza: si + 1, line: li + 1, length: l.length };
  for (const [si, sc] of arr(c?.scenes).entries())
    for (const [li, l] of arr(sc?.lines).entries())
      if (long(l)) return { where: "scene", scene: si + 1, line: li + 1, length: l.length };
  return null;
}
export const overLongMessage = (o) =>
  `A ${o.where} line has ${o.length} characters; the limit is ${MAX_LINE_CHARS}. Nothing was saved. Shorten or split the line.`;
/** Poem snapshot kept inside a project: plain text only, bounded. Never HTML. */
export function normalizePoemSnapshot(p) {
  if (!p || typeof p !== "object") return undefined;
  const stanzas = (Array.isArray(p.stanzas) ? p.stanzas : [])
    .slice(0, MAX_STANZAS)
    .map((st) =>
      (Array.isArray(st) ? st : [])
        .slice(0, MAX_STANZA_LINES)
        .map((l) => str(l, MAX_LINE_CHARS))
        .filter((l) => l.trim() !== ""),
    )
    .filter((st) => st.length);
  if (!stanzas.length) return undefined;
  const out = { title: str(p.title, 300), stanzas };
  // Keep the verbatim source only when it still describes exactly these stanzas (never trust a stale copy), together
  // with the blank-line counts that parsePoemText derived from it. Old projects without them simply have neither.
  if (typeof p.source === "string" && p.source.length <= MAX_POEM_CHARS) {
    const re = parsePoemText(p.source);
    if (re.ok && JSON.stringify(re.stanzas) === JSON.stringify(stanzas)) {
      out.source = re.source;
      out.blank = re.blank;
      out.trailingBlank = re.trailingBlank;
    }
  }
  return out;
}
/** Source-stanza identity of a scene: stanza index + part ordering. Absent on legacy scenes (never invented). */
function stanzaMeta(sc) {
  const i = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const stanza = i(sc?.stanza, 9999),
    part = i(sc?.part, 999),
    parts = i(sc?.parts, 999);
  if (stanza == null || part == null || parts == null || part >= parts)
    return {};
  return { stanza, part, parts };
}
function str(v, max, d = "") {
  return typeof v === "string" ? v.slice(0, max) : d;
}

const SIG_KEYS = ["show", "signature", "watermark", "size", "yPct", "align"];
const pickBranding = (b) =>
  Object.fromEntries(SIG_KEYS.filter((k) => k in b).map((k) => [k, b[k]]));
// Legacy branding (none of size/yPct/align) stays legacy across a template switch: no silent move.
export function defaultComposition({
  format = "reel",
  templateId = "ink-silence",
  scenes = [],
  signature = "Ajithkumar R.",
  branding = null,
} = {}) {
  const t = templateById(templateId);
  return normalizeComposition({
    format,
    templateId: t.id,
    scenes,
    style: {
      ...t.style,
      bg: t.bg,
      overlay: t.fx.overlay,
      vignette: t.fx.vignette,
      grain: t.fx.grain,
      particles: t.fx.particles,
      geometry: !!t.fx.geometry,
    },
    motion: { ...t.motion, intensity: 0.5 },
    // a template switch passes the current branding: every signature field is carried (the colour follows the template)
    branding: {
      show: true,
      signature,
      watermark: false,
      ...(branding && isLegacySignature(branding)
        ? {}
        : newSignatureDefaults()),
      ...(branding ? pickBranding(branding) : {}),
      color: t.signatureColor,
    },
    audio: { source: "none", volume: 1, fadeInMs: 0, fadeOutMs: 800 },
    export: { quality: "standard" },
    // P8 templates may name a material preset; the six classic templates have none, so their output is unchanged
    ...(t.material
      ? { material: { id: t.material, intensity: DEFAULT_INTENSITY, seed: 1 } }
      : {}),
  });
}

export function normalizeComposition(input) {
  const c = input && typeof input === "object" ? input : {};
  const t = templateById(c.templateId);
  const s = c.style || {},
    bg = s.bg || {},
    ov = s.overlay || {},
    m = c.motion || {},
    b = c.branding || {},
    a = c.audio || {};
  const normScenes = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .slice(0, MAX_SCENES)
      .map((sc, i) => {
        const lines = (Array.isArray(sc?.lines) ? sc.lines : [])
          .slice(0, MAX_LINES)
          .map((l) => str(l, MAX_LINE_CHARS))
          .filter((l) => l.trim() !== "");
        return {
          id: str(sc?.id, 40, `s${i}`) || `s${i}`,
          kind: oneOf(sc?.kind, ["title", "stanza"], "stanza"),
          lines,
          ...stanzaMeta(sc),
          durationMs: Math.round(
            num(
              sc?.durationMs,
              MIN_SCENE_MS,
              MAX_SCENE_MS,
              sceneDuration(lines),
            ),
          ),
          ...(Number.isFinite(Number(sc?.offsetY)) && Number(sc.offsetY) !== 0
            ? { offsetY: num(sc.offsetY, -30, 30, 0) }
            : {}),
          ...(ALIGN.includes(sc?.align) ? { align: sc.align } : {}),
          ...(Number.isFinite(Number(sc?.scale)) && Number(sc.scale) !== 1
            ? { scale: num(sc.scale, 0.6, 1.4, 1) }
            : {}),
        };
      })
      .filter((sc) => sc.lines.length > 0);
  const poemSnap = normalizePoemSnapshot(c.poem);
  const scenes = attachStanzaMeta(normScenes(c.scenes), poemSnap);
  // Fonts: verified registry ids by default. A candidate (verified:false) is kept ONLY when the composition opted in with
  // fontPreview:true (the explicit "Preview candidate fonts (not reviewed)" toggle); otherwise it is replaced by the
  // template font and `notices.unverifiedFont` says so. A display-only font is never kept as the poem (body) font.
  const fontPreview = c.fontPreview === true;
  const fonts = resolveFonts({
    font: s.font,
    titleFont: s.titleFont,
    preview: fontPreview,
    fallback: t.style.font,
  });
  return {
    v: 1,
    format: oneOf(c.format, FORMAT_KEYS, "reel"),
    templateId: t.id,
    scenes,
    originalScenes: attachStanzaMeta(normScenes(c.originalScenes), poemSnap),
    style: {
      font: fonts.font,
      ...(fonts.titleFont ? { titleFont: fonts.titleFont } : {}),
      sizePx: Math.round(num(s.sizePx, 28, 140, t.style.sizePx)),
      weight: oneOf(Number(s.weight), [400, 500, 600, 700], t.style.weight),
      color: hex(s.color, t.style.color),
      align: oneOf(s.align, ALIGN, t.style.align),
      lineHeight: num(s.lineHeight, 1.2, 2.4, t.style.lineHeight),
      widthPct: Math.round(num(s.widthPct, 50, 100, 100)),
      vAlign: oneOf(s.vAlign, VALIGN, "middle"),
      shadow: !!s.shadow,
      bg: {
        kind: oneOf(bg.kind, BG_KINDS, t.bg.kind),
        a: hex(bg.a, t.bg.a),
        b: hex(bg.b, t.bg.b),
        ...(safeImageUrl(bg.image?.url) || bg.image?.local === true
          ? {
              image: {
                url: safeImageUrl(bg.image.url) || "",
                local: !safeImageUrl(bg.image.url),
                x: num(bg.image.x, 0, 1, 0.5),
                y: num(bg.image.y, 0, 1, 0.5),
                zoom: num(bg.image.zoom, 1, 3, 1),
                brightness: num(bg.image.brightness, -0.5, 0.5, 0),
                contrast: num(bg.image.contrast, -0.5, 0.5, 0),
                blur: Math.round(num(bg.image.blur, 0, 40, 0)),
              },
            }
          : {}),
      },
      overlay: {
        color: hex(ov.color, "#000000"),
        opacity: num(ov.opacity, 0, 0.9, 0),
      },
      vignette: num(s.vignette, 0, 1, t.fx.vignette),
      grain: num(s.grain, 0, 0.4, t.fx.grain),
      particles: oneOf(s.particles, PARTICLES, t.fx.particles),
      geometry: !!s.geometry,
    },
    motion: {
      textIn: oneOf(m.textIn, TEXT_IN_ALL, t.motion.textIn),
      bgMotion: oneOf(m.bgMotion, BG_MOTION, t.motion.bgMotion),
      intensity: num(m.intensity, 0, 1, 0.5),
      ...motionPrefsOf(m),
    },
    branding: {
      show: b.show !== false,
      signature: str(b.signature, 60, "Ajithkumar R."),
      watermark: !!b.watermark,
      color: hex(b.color, t.signatureColor),
      // WP6 fields are stored only when the input has them; absent = legacy geometry (30px, centred, 0.8 / 0.955)
      ...(isLegacySignature(b)
        ? {}
        : {
            size: Math.round(
              num(
                b.size == null ? NaN : b.size,
                SIG_SIZE_MIN,
                SIG_SIZE_MAX,
                newSignatureDefaults().size,
              ),
            ),
            yPct:
              b.yPct == null || !Number.isFinite(Number(b.yPct))
                ? null
                : num(b.yPct, SIG_Y_MIN, SIG_Y_MAX, null),
            align: oneOf(b.align, ALIGN, "center"),
          }),
    },
    audio: {
      source: oneOf(a.source, ["none", "upload", "record"], "none"),
      label: str(a.label, 80),
      volume: num(a.volume, 0, 1, 1),
      fadeInMs: Math.round(num(a.fadeInMs, 0, 5000, 0)),
      fadeOutMs: Math.round(num(a.fadeOutMs, 0, 5000, 800)),
      trimStartMs: Math.round(num(a.trimStartMs, 0, 3600000, 0)),
      trimEndMs: Math.round(num(a.trimEndMs, 0, 3600000, 0)),
      fitVideo: oneOf(a.fitVideo, ["keep", "extend"], "extend"),
    },
    poster: {
      sceneIds: (Array.isArray(c.poster?.sceneIds) ? c.poster.sceneIds : [])
        .slice(0, MAX_SCENES)
        .map((x) => str(x, 40))
        .filter(Boolean),
      mode: oneOf(c.poster?.mode, ["single", "set"], "single"),
      // optional closing card of a Feed carousel (plain text, drawn and validated like any scene)
      endText: str(c.poster?.endText, 280),
    },
    full: {
      preset: oneOf(c.full?.preset, FULL_PRESETS, "balanced"),
      height: oneOf(c.full?.height, ["standard", "extended"], "standard"),
    },
    export: {
      quality: oneOf(
        c.export?.quality,
        ["draft", "standard", "high"],
        "standard",
      ),
    },
    ...(poemSnap ? { poem: poemSnap } : {}),
    // material (materials.js) is stored only when the input has one: legacy projects normalize unchanged
    ...(c.material && typeof c.material === "object"
      ? { material: normalizeMaterial(c.material) }
      : {}),
    // stored only when on / when something was replaced: legacy projects normalize unchanged
    ...(fontPreview ? { fontPreview: true } : {}),
    ...(Object.keys(fonts.notices).length ? { notices: fonts.notices } : {}),
  };
}
