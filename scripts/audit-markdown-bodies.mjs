#!/usr/bin/env node
// Dry-run, read-only report: how many Tech Blog posts / Projects still have a Markdown body, whether each converts
// cleanly to the structured document, and which would need review. THIS SCRIPT NEVER WRITES. It has no write mode;
// converting a post is done by the author in the Admin editor ("Convert to rich editor"), one post at a time.
// Defaults to the local throwaway DB; refuses non-local URIs unless --allow-remote is given explicitly.
import mongoose from "mongoose";
import { checkUriAllowed } from "../src/lib/editor/audit-content.js";
import { markdownToDoc } from "../src/lib/editor/md-import.js";
import { validateDoc } from "../src/lib/content-contract/document.js";

const args = process.argv.slice(2);
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27018/admin_test";
const gate = checkUriAllowed(uri, { allowRemote: args.includes("--allow-remote") });
if (!gate.ok) {
  console.error(gate.reason);
  process.exit(2);
}
const TARGETS = [
  { collection: "techblogs", field: "content" },
  { collection: "projects", field: "longDescription" },
];
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
try {
  const report = {};
  for (const { collection, field } of TARGETS) {
    const docs = await mongoose.connection.db
      .collection(collection)
      .find({}, { projection: { title: 1, slug: 1, contentFormat: 1, [field]: 1 } })
      .toArray();
    const r = { total: docs.length, alreadyRich: 0, markdown: 0, convertsCleanly: 0, needsReview: [] };
    for (const d of docs) {
      if (d.contentFormat === "tiptap") { r.alreadyRich++; continue; }
      r.markdown++;
      const text = String(d[field] || "");
      const { doc, warnings } = markdownToDoc(text);
      const v = validateDoc(doc);
      if (v.ok && warnings.length === 0) r.convertsCleanly++;
      else r.needsReview.push({ id: String(d._id), title: d.title, warnings: warnings.slice(0, 5), valid: v.ok });
    }
    report[collection] = r;
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
