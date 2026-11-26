import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipStore, crc32 } from "../../src/lib/motion-studio/zip.js";
import { requiredScrim, ratio, lum, hexRgb } from "../../src/lib/motion-studio/contrast.js";
import { normalizeComposition, safeImageUrl, defaultComposition } from "../../src/lib/motion-studio/composition.js";

test("crc32 known vector", () => assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926));
test("zipStore output is a valid archive with UTF-8 (Tamil) names", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-")), p = join(dir, "a.zip");
  writeFileSync(p, zipStore([{ name: "கவிதை-01.png", data: new Uint8Array([1, 2, 3, 4]) }, { name: "b.png", data: new Uint8Array(1000).fill(7) }]));
  const out = execFileSync("unzip", ["-t", p]).toString();
  assert.match(out, /No errors detected/);
});
test("requiredScrim: bright photo under white text needs a scrim; dark photo needs none", () => {
  const bright = Array.from({ length: 50 }, () => [240, 240, 235]), dark = Array.from({ length: 50 }, () => [20, 20, 30]);
  const o = requiredScrim(bright, "#ffffff");
  assert.ok(o > 0.3 && o <= 0.9);
  assert.equal(requiredScrim(dark, "#ffffff"), 0);
  // verify the claim: after scrim, contrast >= 4.5
  const m = bright[0].map((c) => c * (1 - o));
  assert.ok(ratio(lum(...hexRgb("#ffffff")), lum(...m)) >= 4.5);
});
test("image URLs: only https res.cloudinary.com or same-origin paths persist", () => {
  assert.ok(safeImageUrl("https://res.cloudinary.com/x/image/upload/a.jpg"));
  assert.ok(safeImageUrl("/uploads/a.jpg"));
  for (const bad of ["javascript:alert(1)", "data:image/png;base64,AA", "blob:https://a/1", "http://res.cloudinary.com/x", "https://evil.com/a.jpg", "//evil.com/a.jpg", "https://u:p@res.cloudinary.com/x"])
    assert.equal(safeImageUrl(bad), null, bad);
});
test("audio + poster settings are clamped; trim/fades never negative", () => {
  const c = normalizeComposition({ ...defaultComposition({ scenes: [{ lines: ["a"] }] }), audio: { volume: 9, fadeInMs: -5, fadeOutMs: 99999, trimStartMs: -1, fitVideo: "x" }, poster: { sceneIds: ["a", 5, null], mode: "zzz" } });
  assert.equal(c.audio.volume, 1); assert.equal(c.audio.fadeInMs, 0); assert.equal(c.audio.fadeOutMs, 5000); assert.equal(c.audio.trimStartMs, 0);
  assert.equal(c.audio.fitVideo, "extend"); assert.equal(c.poster.mode, "single");
});
