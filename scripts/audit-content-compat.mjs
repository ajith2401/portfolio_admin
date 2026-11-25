#!/usr/bin/env node
// Dry-run, read-only compatibility audit. Defaults to the local throwaway DB.
// Never writes. Refuses non-local URIs unless --allow-remote is given explicitly.
import mongoose from "mongoose";
import { auditWritings, checkUriAllowed } from "../src/lib/editor/audit-content.js";

const args = process.argv.slice(2);
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27018/admin_test";
const gate = checkUriAllowed(uri, { allowRemote: args.includes("--allow-remote") });
if (!gate.ok) {
  console.error(gate.reason);
  process.exit(2);
}
await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
try {
  const docs = await mongoose.connection.db
    .collection("writings")
    .find({}, { projection: { title: 1, slug: 1, body: 1, status: 1, category: 1, language: 1, contentFormat: 1, content: 1 } })
    .toArray();
  const report = auditWritings(docs);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mongoose.disconnect();
}
