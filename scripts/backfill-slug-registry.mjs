#!/usr/bin/env node
// Reserves every slug a writing has ever used (current + history) in the `slugclaims` collection.
// DRY-RUN by default: prints what it would insert and any conflicts. Pass --apply to write.
//   MONGODB_URI=... node scripts/backfill-slug-registry.mjs [--apply]
// Production use needs the owner's separate approval. Safe to re-run (idempotent).
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set. Nothing was contacted."); process.exit(2); }
const apply = process.argv.includes("--apply");
const host = (() => { try { const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")); return `${u.host.replace(/^.*@/, "")}${u.pathname}`; } catch { return "(unparseable)"; } })();
console.log(`Target: ${host}   mode: ${apply ? "APPLY" : "dry-run"}`);

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: false, autoCreate: false });
const db = mongoose.connection.db;
const claims = db.collection("slugclaims");
if (apply) await claims.createIndex({ slug: 1 }, { unique: true });

const owners = new Map(); const conflicts = [];
for await (const w of db.collection("writings").find({}, { projection: { slug: 1, "slugHistory.slug": 1 } })) {
  for (const s of [w.slug, ...(w.slugHistory || []).map((h) => h.slug)].filter(Boolean)) {
    const prev = owners.get(s);
    if (prev && String(prev) !== String(w._id)) conflicts.push({ slug: s, a: String(prev), b: String(w._id) });
    else owners.set(s, w._id);
  }
}
let inserted = 0;
for (const [slug, writingId] of owners) {
  if (await claims.findOne({ slug })) continue;
  if (apply) await claims.insertOne({ slug, writingId, createdAt: new Date() });
  inserted++;
}
console.log(`${apply ? "Inserted" : "Would insert"}: ${inserted} of ${owners.size} slugs. Conflicts needing a human decision: ${conflicts.length}`);
for (const c of conflicts.slice(0, 20)) console.log("  conflict:", JSON.stringify(c));
await mongoose.disconnect();
