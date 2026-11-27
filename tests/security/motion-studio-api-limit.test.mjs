import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overLongLine, overLongMessage, normalizeComposition, MAX_LINE_CHARS } from "../../src/lib/motion-studio/composition.js";

const ta = "தமிழ்";
const mk = (line) => ({ scenes: [{ lines: ["ok", line] }], poem: { title: "t", stanzas: [["ok", line]] } });

test("exactly 400 is accepted, 401 is refused (scene and poem)", () => {
  assert.equal(overLongLine(mk("க".repeat(400))), null);
  const o = overLongLine(mk("க".repeat(401)));
  assert.equal(o.where, "poem");
  assert.equal(o.length, 401);
  assert.equal(overLongLine({ scenes: [{ lines: ["க".repeat(401)] }] }).where, "scene");
  assert.match(overLongMessage(o), /Nothing was saved/);
});
test("negative control: the normalizer alone WOULD cut it (so the guard is what protects the poem)", () => {
  const c = normalizeComposition(mk(ta.repeat(100)));
  assert.ok(c.scenes[0].lines.every((l) => l.length <= MAX_LINE_CHARS));
  assert.ok(overLongLine(mk(ta.repeat(100))));
});
test("malformed input never throws; short Tamil is untouched", () => {
  for (const v of [null, undefined, 5, {}, { scenes: "x" }, { poem: { stanzas: [null, 3] } }]) assert.equal(overLongLine(v), null);
  assert.equal(overLongLine(mk(ta)), null);
});
test("both API routes call the guard before normalizing and answer 422", () => {
  for (const f of ["src/app/api/motion-projects/route.js", "src/app/api/motion-projects/[id]/route.js"]) {
    const s = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const g = s.indexOf("overLongLine(body?.composition)");
    assert.ok(g > 0, f);
    assert.ok(g < s.indexOf("normalizeComposition(body"), f);
    assert.match(s, /status: 422/);
  }
});
test("the guard runs only after auth, origin and (PUT) ownership checks", () => {
  for (const f of ["src/app/api/motion-projects/route.js", "src/app/api/motion-projects/[id]/route.js"]) {
    const s = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
    const body = s.slice(s.indexOf(f.includes("[id]") ? "export async function PUT" : "export async function POST"));
    const g = body.indexOf("overLongLine(body?.composition)");
    assert.ok(g > body.indexOf("requireAuth(") && g > body.indexOf("validateOrigin(request)"), f);
    if (f.includes("[id]")) assert.ok(g > body.indexOf("if (!owns(auth, existing)) return denied();") && body.indexOf("if (!owns(") > 0, f);
  }
});
