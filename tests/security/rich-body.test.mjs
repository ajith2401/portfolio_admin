import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyRichBody } from "../../src/lib/rich-body.js";

const root = path.resolve(import.meta.dirname, "../..");
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }] };

test("valid tiptap doc derives the plain-text field", () => {
  const d = { contentFormat: "tiptap", doc };
  assert.equal(applyRichBody(d, "content"), null);
  assert.equal(d.content, "Hello world");
});
test("invalid or empty documents are rejected", () => {
  assert.match(applyRichBody({ contentFormat: "tiptap", doc: { type: "doc", content: [{ type: "script" }] } }, "content"), /Invalid document/);
  assert.ok(applyRichBody({ contentFormat: "tiptap" }, "content"));
  assert.ok(applyRichBody({ contentFormat: "tiptap", doc: { type: "doc", content: [{ type: "paragraph" }] } }, "content"));
});
test("non-tiptap payloads cannot smuggle a doc", () => {
  const d = { contentFormat: "weird", doc, content: "x" };
  assert.equal(applyRichBody(d, "content"), null);
  assert.equal(d.doc, undefined);
  assert.equal(d.contentFormat, "markdown");
});
test("derived text honours the length cap", () => {
  const big = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a".repeat(50) }] }] };
  const d = { contentFormat: "tiptap", doc: big };
  applyRichBody(d, "longDescription", 10);
  assert.equal(d.longDescription.length, 10);
});
test("all four write routes call applyRichBody; audit script has no write calls", () => {
  for (const f of ["tech-blog/route.js", "tech-blog/[id]/route.js", "projects/route.js", "projects/[id]/route.js"])
    assert.match(fs.readFileSync(path.join(root, "src/app/api", f), "utf8"), /applyRichBody\(/, f);
  const audit = fs.readFileSync(path.join(root, "scripts/audit-markdown-bodies.mjs"), "utf8");
  assert.doesNotMatch(audit, /\.(updateOne|updateMany|insert\w*|deleteOne|deleteMany|replaceOne|bulkWrite|findOneAndUpdate)\(/);
});
