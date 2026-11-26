// Splits a poem into scenes. Order is preserved, whole lines only, nothing is dropped.
import { graphemeCount } from "./graphemes.js";

export const MAX_LINES_PER_SCENE = 4;
export const MAX_GRAPHEMES_PER_SCENE = 140;
export const MIN_SCENE_MS = 3000;
export const MAX_SCENE_MS = 12000;

export function sceneDuration(lines) {
  const g = lines.reduce((n, l) => n + graphemeCount(l), 0);
  return Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, 1800 + lines.length * 700 + g * 25));
}

/** Split a stanza at line boundaries into balanced chunks that respect the line/grapheme budget. */
export function splitStanza(lines, maxLines = MAX_LINES_PER_SCENE, maxG = MAX_GRAPHEMES_PER_SCENE) {
  const total = lines.reduce((n, l) => n + graphemeCount(l), 0);
  const parts = Math.max(Math.ceil(lines.length / maxLines), Math.ceil(total / maxG), 1);
  if (parts === 1 || lines.length === 1) return [lines.slice()];
  const per = Math.ceil(lines.length / Math.min(parts, lines.length));
  const out = [];
  for (let i = 0; i < lines.length; i += per) out.push(lines.slice(i, i + per));
  return out;
}

let n = 0;
const sid = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

export function generateScenes(poem, { title, includeTitle = true } = {}) {
  const scenes = [];
  if (includeTitle && title) scenes.push({ id: sid(), kind: "title", lines: [title], durationMs: 3200 });
  for (const stanza of poem.stanzas || []) {
    for (const chunk of splitStanza(stanza)) {
      scenes.push({ id: sid(), kind: "stanza", lines: chunk, durationMs: sceneDuration(chunk) });
    }
  }
  return scenes;
}

/** Every poem line must appear exactly once, in order (title scene excluded). */
export function sceneLines(scenes) {
  return scenes.filter((s) => s.kind !== "title").flatMap((s) => s.lines);
}
export const totalDuration = (scenes) => scenes.reduce((t, s) => t + s.durationMs, 0);
