import test from "node:test";
import assert from "node:assert/strict";
import { generateScenes, sceneLines } from "../../src/lib/motion-studio/scenes.js";
import * as E from "../../src/lib/motion-studio/scene-edit.js";

const poem = { stanzas: [["அ1", "ஆ2", "இ3", "ஈ4", "உ5"], ["ஊ6", "எ7"]] };
const base = () => generateScenes(poem, { includeTitle: false });
const lines = (s) => sceneLines(s);

test("edit/split/merge/move keep every line, in order, and never mutate input", () => {
  const s0 = base(), snap = JSON.stringify(s0);
  const split = E.splitScene(s0, 0, 1);
  assert.equal(split.length, s0.length + 1);
  assert.deepEqual(lines(split), lines(s0));
  const merged = E.mergeNext(split, 0);
  assert.deepEqual(lines(merged), lines(s0));
  const swapped = E.moveScene(s0, 0, 1);
  assert.deepEqual(lines(swapped).sort(), lines(s0).sort());
  const ml = E.moveLine(s0, 0, 0, s0.length - 1, 0);
  assert.equal(lines(ml).length, lines(s0).length);
  assert.equal(JSON.stringify(s0), snap);
});
test("moving the only line out of a scene removes the empty scene, not the text", () => {
  const s = E.splitScene(base(), 0, 1); // scene 0 now has 1 line
  const out = E.moveLine(s, 0, 0, 1, 0);
  assert.equal(out.length, s.length - 1);
  assert.equal(lines(out).length, lines(s).length);
});
test("editLine / duration clamp / presentation clamp", () => {
  const s = base();
  assert.equal(E.editLine(s, 0, 0, "புதிது")[0].lines[0], "புதிது");
  assert.equal(E.setDuration(s, 0, 1)[0].durationMs, 3000);
  assert.equal(E.setDuration(s, 0, 99999)[0].durationMs, 12000);
  const p = E.setScenePresentation(s, 0, { offsetY: 99, scale: 5, align: "x" })[0];
  assert.equal(p.offsetY, 30); assert.equal(p.scale, 1.4); assert.equal(p.align, undefined);
});
test("missingLines reports omissions instead of hiding them", () => {
  const s = E.removeScene(base(), base().length - 1);
  assert.deepEqual(E.missingLines(poem, s), ["ஊ6", "எ7"]);
  assert.deepEqual(E.missingLines(poem, base()), []);
});
test("history undo/redo and restore-original", () => {
  const h = E.createHistory(base());
  const a = E.splitScene(h.present, 0, 1); h.push(a);
  assert.ok(h.canUndo); assert.equal(h.undo().length, base().length);
  assert.ok(h.canRedo); assert.equal(h.redo().length, a.length);
  h.push(base()); assert.equal(h.canRedo, false);
});
