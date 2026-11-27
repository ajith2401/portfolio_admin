// "Export all": run a chosen set of routes ONE AT A TIME into a single ZIP with MANIFEST.json and README.txt.
//
// Safety rules (the priority is never to silently lose, alter or misrender a poem):
//   * Every route is validated FROM SCRATCH on every run (preflight: ensureFonts -> the route's validator), and its
//     renderer validates again before drawing (export.js). Nothing validated in an earlier run is ever reused.
//   * A route that fails is never silently skipped: the manifest records it as {status:"refused", reason}. By default the
//     whole bundle STOPS and no ZIP is written; only an explicit continueOnFailure produces a ZIP of the other routes,
//     and that manifest still lists the refused routes and says complete:false.
//   * Excerpt / partial routes are labelled (excerpt, complete:false, partial) in the manifest and README.
//   * Routes run sequentially; the injected `release` frees the route's canvases before the next route starts.
// Pure orchestration: rendering, validation and the clock are injected (generatedAt is passed in, never read here).
import { zipStore, crc32 } from "./zip.js";
import { outputSize } from "./output-size.js";

export const MANIFEST_NAME = "MANIFEST.json";
export const README_NAME = "README.txt";
export const MANIFEST_SCHEMA = "poem-motion-studio/bundle@1";
const enc = new TextEncoder();

// ---------------------------------------------------------------- poem identity
/** Canonical text of the source poem (title + stanzas, exact strings). */
export const poemCanonical = (poem) =>
  JSON.stringify([poem?.title ?? "", (poem?.stanzas || []).map((s) => [...s])]);
const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
};
/** 96-bit fingerprint of the exact source poem (cyrb53 x2 over UTF-16 + CRC-32 over UTF-8). Browser-safe, pure. */
export function poemFingerprint(poem) {
  const s = poemCanonical(poem);
  return `${cyrb53(s)}${crc32(enc.encode(s)).toString(16).padStart(8, "0")}`;
}
/** Non-empty source lines (the count every route's coverage is compared with). */
export const sourceLineCount = (poem) =>
  (poem?.stanzas || []).flat().filter((l) => l !== "").length;

/**
 * Which source lines a route draws, compared exactly (byte for byte, in order) with the source poem. Title and end cards
 * are not poem lines. complete:true only for a non-excerpt route that draws every source line, unchanged and in order.
 */
export function routeCoverage(route, comp, input, ctx) {
  const total = sourceLineCount(input?.poem);
  let scenes = [];
  try {
    scenes = route.scenesFor(comp, input, ctx) || [];
  } catch {
    scenes = [];
  }
  const drawn = scenes
    .filter((s) => s && s.kind !== "title" && s.id !== "end")
    .flatMap((s) => s.lines || [])
    .filter((l) => l !== "");
  const src = (input?.poem?.stanzas || []).flat().filter((l) => l !== "");
  const exact =
    drawn.length === src.length && drawn.every((l, i) => l === src[i]);
  const excerpt = !!route.excerpt;
  return {
    excerpt,
    complete: !excerpt && exact,
    partial: excerpt || !exact,
    drawnLines: drawn.length,
    sourceLines: total,
  };
}

// ---------------------------------------------------------------- route result -> files
const extOf = (blob, fallback) => {
  const t = blob?.type || "";
  return t === "video/mp4"
    ? "mp4"
    : t === "image/jpeg"
      ? "jpg"
      : t === "image/png"
        ? "png"
        : fallback;
};
/** Every route returns a different shape (blob | blob[] | {blob} | {blobs}); this is the one normalizer. */
export function routeBlobs(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.blobs)) return result.blobs;
  if (result.blob) return [result.blob];
  if (typeof result.arrayBuffer === "function" || result instanceof Uint8Array)
    return [result];
  return [];
}
export const safeStem = (s) =>
  String(s || "poem")
    .replace(/[^\w஀-௿-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "poem";
export function fileNames(stem, routeId, blobs) {
  const base = `${safeStem(stem)}-${routeId}`;
  return blobs.map((b, i) =>
    blobs.length === 1
      ? `${base}.${extOf(b, "bin")}`
      : `${base}-${String(i + 1).padStart(2, "0")}.${extOf(b, "bin")}`,
  );
}
const bytesOf = async (b) =>
  b instanceof Uint8Array ? b : new Uint8Array(await b.arrayBuffer());

// ---------------------------------------------------------------- manifest + readme
export function buildManifest({ generatedAt, poem, comp, preset, entries }) {
  const ok = entries.filter((e) => e.status === "ok");
  const failed = entries.filter((e) => e.status !== "ok");
  const review = entries.some((e) => e.fontReview === "unreviewed")
    ? "unreviewed"
    : "reviewed";
  return {
    schema: MANIFEST_SCHEMA,
    generatedAt: String(generatedAt),
    poem: {
      title: poem?.title ?? "",
      fingerprint: poemFingerprint(poem),
      sourceLineCount: sourceLineCount(poem),
      stanzas: (poem?.stanzas || []).length,
    },
    preset,
    templateId: comp?.templateId ?? null,
    material: comp?.material?.id ?? "none",
    fontReview: review,
    // the bundle is complete only if every requested route was written and none is an excerpt / partial
    complete:
      failed.length === 0 && ok.length > 0 && ok.every((e) => e.complete),
    routesRequested: entries.length,
    routesWritten: ok.length,
    routes: entries.map((e) => ({
      id: e.id,
      label: e.label,
      kind: e.kind,
      status: e.status,
      ...(e.reason ? { reason: e.reason } : {}),
      excerpt: !!e.excerpt,
      complete: e.status === "ok" && !!e.complete,
      partial: !!e.partial,
      drawnLines: e.drawnLines ?? null,
      sourceLines: e.sourceLines ?? sourceLineCount(poem),
      ...(e.coverage ? { coverage: e.coverage } : {}),
      fontReview: e.fontReview || "reviewed",
      ...(e.warnings?.length ? { warnings: e.warnings } : {}),
      width: e.width ?? null,
      height: e.height ?? null,
      scale: e.scale ?? null,
      files: (e.files || []).map((f) => ({ name: f.name, size: f.size })),
    })),
  };
}
export function buildReadme(m) {
  const L = [
    "Poem Motion Studio export bundle",
    "",
    `Poem: ${m.poem.title || "(untitled)"}  (${m.poem.sourceLineCount} source lines, fingerprint ${m.poem.fingerprint})`,
    `Generated: ${m.generatedAt}`,
    `Output size preset: ${m.preset}`,
    `Bundle complete: ${m.complete ? "yes" : "NO - see below"}`,
    `Font review: ${m.fontReview}${m.fontReview === "unreviewed" ? " (a candidate font was used; review the Tamil text before posting)" : ""}`,
    "",
    "Routes:",
  ];
  for (const r of m.routes) {
    const tag =
      r.status !== "ok"
        ? `${r.status.toUpperCase()}: ${r.reason || ""}`
        : r.excerpt
          ? "EXCERPT (not the whole poem)"
          : r.complete
            ? "complete"
            : "PARTIAL (not every source line)";
    L.push(`- ${r.label} [${r.id}] ${tag}`);
    for (const w of r.warnings || []) L.push(`    CHECK: ${w}`);
    for (const f of r.files) L.push(`    ${f.name}  ${f.size} bytes`);
  }
  L.push(
    "",
    "Every file was validated against the source poem before it was drawn. Play videos on your phone before posting.",
    "MANIFEST.json lists every file with its size.",
  );
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------- runner
const abortErr = () => new DOMException("Export cancelled", "AbortError");
const isAbort = (e) => e?.name === "AbortError";
const reasonOf = (e) =>
  e?.messages?.length
    ? e.messages.slice(0, 6).join("; ")
    : String(e?.message || e || "unknown error");

/**
 * items: [{ route, input }] in the order to run. Injected:
 *   preflight(route, input) -> validator result {ok, messages, plan?}  (MUST run ensureFonts + the route's validator fresh)
 *   render(route, input, { preset, size, signal, onProgress }) -> the route's own result (renderers re-validate)
 *   measureCtx: a measuring ctx for coverage; release(): frees canvases after each route; live(): canvases alive
 *   takeWarnings(): (optional) what the renderer had to adjust for the route just drawn; recorded per route in the
 *     manifest/README. A preflight may also return {ok:true, warnings:[...]} for a route it lets through with a note.
 * Returns { ok, stopped, failures, manifest, zip (Uint8Array|null), files }.
 */
export async function runBundle({
  items,
  comp,
  poem,
  preset,
  generatedAt,
  stem = "poem",
  preflight,
  render,
  measureCtx = null,
  continueOnFailure = false,
  signal,
  onProgress,
  release = () => {},
  live = () => 0,
  takeWarnings = () => [],
}) {
  if (generatedAt == null)
    throw new TypeError(
      "runBundle needs generatedAt (pass the time in; pure code never reads the clock).",
    );
  const entries = items.map(({ route, input }) => ({
    id: route.id,
    label: route.label,
    kind: route.kind,
    route,
    input,
    status: "pending",
    ...routeCoverage(route, comp, input, measureCtx),
  }));
  const refuse = (e, reason) =>
    Object.assign(e, { status: "refused", reason, complete: false });
  const check = () => {
    if (signal?.aborted) throw abortErr();
  };
  // ---- phase 1: validate every route from scratch before anything is drawn
  for (const e of entries) {
    check();
    onProgress?.({ phase: "validate", routeId: e.id, fraction: 0 });
    const size = outputSize(
      e.route.format === "any"
        ? e.input?.format || (e.kind === "video" ? "reel" : "poster")
        : e.route.format,
      preset,
      { kind: e.kind, height: e.input?.fullHeight },
    );
    if (!size.ok) {
      refuse(e, size.reason);
      continue;
    }
    e.size = size;
    try {
      const v = await preflight(e.route, e.input);
      if (!v || !v.ok)
        refuse(
          e,
          (v?.messages || ["the validator refused this route"])
            .slice(0, 6)
            .join("; "),
        );
      else if (v.plan?.overflow)
        refuse(
          e,
          "the text does not fit legibly on one poster card and would be clipped; use the poster set or the carousel",
        );
      else {
        if (v.fontReview) e.fontReview = v.fontReview;
        if (v.warnings?.length) e.warnings = [...v.warnings];
      }
    } catch (err) {
      if (isAbort(err)) throw err;
      refuse(e, reasonOf(err));
    }
  }
  const stopFor = () => entries.filter((e) => e.status === "refused");
  const finish = (zip, files) => {
    for (const e of entries)
      if (e.status === "pending")
        Object.assign(e, {
          status: "not-run",
          reason: "not run: the bundle stopped at a refused route",
          complete: false,
        });
    const manifest = buildManifest({
      generatedAt,
      poem,
      comp,
      preset,
      entries,
    });
    const failures = entries
      .filter((e) => e.status === "refused")
      .map((e) => ({ id: e.id, label: e.label, reason: e.reason }));
    return {
      ok: !!zip && failures.length === 0,
      stopped: !zip,
      failures,
      manifest,
      zip,
      files: files || [],
    };
  };
  if (stopFor().length && !continueOnFailure) return finish(null);
  // ---- phase 2: render the validated routes one at a time
  const files = [];
  const todo = entries.filter((e) => e.status === "pending");
  for (let i = 0; i < todo.length; i++) {
    const e = todo[i];
    check();
    if (live() > 0) release(); // never start a route while another route's canvas is alive
    try {
      const r = await render(e.route, e.input, {
        preset,
        signal,
        onProgress: (f) =>
          onProgress?.({
            phase: "render",
            routeId: e.id,
            index: i,
            total: todo.length,
            fraction: (i + Math.min(1, Math.max(0, f))) / todo.length,
          }),
      });
      if (r?.overflow)
        throw new Error(
          "the text does not fit legibly on one poster card and would be clipped",
        );
      const blobs = routeBlobs(r);
      if (!blobs.length) throw new Error("the route produced no files");
      const names = fileNames(stem, e.id, blobs);
      e.files = [];
      for (let k = 0; k < blobs.length; k++) {
        const data = await bytesOf(blobs[k]);
        files.push({ name: names[k], data });
        e.files.push({ name: names[k], size: data.length });
      }
      Object.assign(e, {
        status: "ok",
        width: r?.width ?? e.size?.w ?? null,
        height: r?.height ?? e.size?.h ?? null,
        scale: r?.scale ?? e.size?.scale ?? null,
      });
      if (r?.excerpt)
        Object.assign(e, { excerpt: true, complete: false, partial: true });
      if (r?.complete === false)
        Object.assign(e, { complete: false, partial: true });
      if (r?.coverage) e.coverage = r.coverage;
      if (r?.fontReview) e.fontReview = r.fontReview;
      const w = takeWarnings() || [];
      if (w.length) e.warnings = [...new Set([...(e.warnings || []), ...w])];
    } catch (err) {
      if (isAbort(err)) throw err; // finally releases; nothing is kept
      refuse(e, reasonOf(err));
      if (!continueOnFailure) return finish(null);
    } finally {
      release(); // free this route's canvases/bitmaps before the next route
    }
  }
  if (!entries.some((e) => e.status === "ok")) return finish(null);
  const { manifest } = finish(null, files);
  const m = JSON.stringify(manifest, null, 2);
  const all = [
    ...files,
    { name: MANIFEST_NAME, data: enc.encode(m) },
    { name: README_NAME, data: enc.encode(buildReadme(manifest)) },
  ];
  const out = finish(zipStore(all), files);
  return { ...out, manifest, manifestText: m };
}

/** Read the file table of a store-only ZIP written by zipStore (used by tests and by the UI to double-check the bundle). */
export function readZipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("not a zip");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [],
    dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const size = dv.getUint32(p + 24, true),
      nl = dv.getUint16(p + 28, true),
      off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true),
      start = off + 30 + lnl;
    out.push({ name, size, data: u8.subarray(start, start + size) });
    p += 46 + nl;
  }
  return out;
}
