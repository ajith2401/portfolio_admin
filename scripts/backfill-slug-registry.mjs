#!/usr/bin/env node
// Reserves every slug a writing has ever used (current + history) in the `slugclaims` collection.
// DRY-RUN by default: prints a report and writes nothing. Pass --apply to write (owner-approved, off-hours).
//   MONGODB_URI=... node scripts/backfill-slug-registry.mjs [--apply] [--json]
// Safe to re-run (idempotent). Never prints credentials. Production use needs the owner's separate approval.
import mongoose from "mongoose";
import { validateSlug } from "../src/lib/content-contract/slug.js";

const uri = process.env.MONGODB_URI;
if (!uri) { console.error("MONGODB_URI is not set. Nothing was contacted."); process.exit(2); }
const apply = process.argv.includes("--apply");
const asJson = process.argv.includes("--json");
const host = (() => { try { const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")); return `${u.host.replace(/^.*@/, "")}${u.pathname}`; } catch { return "(unparseable)"; } })();

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: false, autoCreate: false });
const db = mongoose.connection.db;
const claims = db.collection("slugclaims");

let currentTotal = 0, historyTotal = 0, writings = 0;
const owners = new Map();      // slug -> first writing id that used it
const invalid = [];            // fail the contract (still reserved: they exist in the data)
const duplicateWithinDoc = []; // same slug twice on one writing (harmless; counted once)
const conflicts = [];          // a slug used by two different writings: needs a human decision
for await (const w of db.collection("writings").find({}, { projection: { slug: 1, "slugHistory.slug": 1 } })) {
  writings++;
  const id = String(w._id);
  const seen = new Set();
  const note = (slug, kind) => {
    if (typeof slug !== "string" || !slug) return;
    if (kind === "current") currentTotal++; else historyTotal++;
    if (!validateSlug(slug).valid) invalid.push({ slug, writing: id, kind });
    if (seen.has(slug)) { duplicateWithinDoc.push({ slug, writing: id }); return; }
    seen.add(slug);
    const prev = owners.get(slug);
    if (prev && prev !== id) conflicts.push({ slug, first: prev, second: id, kind });
    else if (!prev) owners.set(slug, id);
  };
  note(w.slug, "current");
  for (const h of w.slugHistory || []) note(h?.slug, "history");
}
const existing = new Set((await claims.find({}, { projection: { slug: 1 } }).toArray()).map((c) => c.slug));
const toInsert = [...owners].filter(([s]) => !existing.has(s));

if (apply) {
  await claims.createIndex({ slug: 1 }, { unique: true });
  for (const [slug, id] of toInsert) await claims.insertOne({ slug, writingId: new mongoose.Types.ObjectId(id), createdAt: new Date() });
}
const report = {
  target: host, mode: apply ? "APPLY" : "dry-run", writings,
  currentSlugs: currentTotal, historicalSlugs: historyTotal,
  distinctSlugs: owners.size, alreadyInRegistry: existing.size,
  expectedNewRegistryRecords: toInsert.length,
  duplicateWithinOneWriting: duplicateWithinDoc.length,
  invalidSlugs: invalid.length,
  conflictsNeedingManualResolution: conflicts.length,
};
if (asJson) console.log(JSON.stringify({ report, invalid: invalid.slice(0, 50), conflicts: conflicts.slice(0, 50) }, null, 2));
else {
  console.log(Object.entries(report).map(([k, v]) => `${k.padEnd(34)} ${v}`).join("\n"));
  for (const c of conflicts.slice(0, 20)) console.log("  conflict:", JSON.stringify(c));
  for (const c of invalid.slice(0, 20)) console.log("  invalid :", JSON.stringify(c));
  if (conflicts.length) console.log("\nA conflicting slug is registered to the FIRST writing seen; resolve by hand before relying on the registry for it.");
}
await mongoose.disconnect();
