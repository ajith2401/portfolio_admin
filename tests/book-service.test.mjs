import test from "node:test";
import assert from "node:assert/strict";
import { buildBookChanges } from "../src/lib/book-service.js";
import { notifyPortfolio } from "../src/lib/revalidate.js";

test("create requires title, description and a sane publishYear", () => {
  assert.ok(buildBookChanges({}).errors.length >= 3);
  assert.equal(buildBookChanges({ title: "T", description: "D", publishYear: 2024 }).errors.length, 0);
  assert.ok(buildBookChanges({ title: "T", description: "D", publishYear: 12 }).errors.length);
});

test("status must be a known value; unknown and null are rejected, never stored", () => {
  for (const status of ["scheduled", null, "Published", 1]) {
    assert.ok(buildBookChanges({ status }, { partial: true }).errors.length, String(status));
  }
  for (const status of ["draft", "published", "archived"]) assert.equal(buildBookChanges({ status }, { partial: true }).changes.status, status);
});

test("fields outside the whitelist cannot be set (mass assignment)", () => {
  const { changes } = buildBookChanges({ title: "T", reviews: [{ rating: 5 }], shortCode: "x", averageRating: 5, slugHistory: [{ slug: "a" }], performance: { views: 9 }, _id: "z" }, { partial: true });
  assert.deepEqual(Object.keys(changes), ["title"]);
});

test("Tamil titles are NFC-normalised and trimmed", () => {
  assert.equal(buildBookChanges({ title: "  கோல் " }, { partial: true }).changes.title, "கோல்".normalize("NFC"));
});

test("notifyPortfolio sends the section and previous slugs, with the bearer secret", async () => {
  let seen;
  const r = await notifyPortfolio(
    { slug: "new", previousSlugs: ["old"], section: "book" },
    { env: { PORTFOLIO_REVALIDATE_URL: "http://127.0.0.1:9/api/revalidate", REVALIDATE_SECRET: "s".repeat(20) }, fetchImpl: async (u, o) => { seen = o; return { ok: true }; } },
  );
  assert.equal(r.status, "ok");
  assert.deepEqual(JSON.parse(seen.body), { slug: "new", section: "book", previousSlugs: ["old"] });
  assert.equal(seen.headers.Authorization, "Bearer " + "s".repeat(20));
  assert.equal(seen.redirect, "error");
});

test("notifyPortfolio omits section for writings and never throws when the site is down", async () => {
  let body;
  await notifyPortfolio({ slug: "a" }, { env: { PORTFOLIO_REVALIDATE_URL: "http://localhost:9/x", REVALIDATE_SECRET: "k" }, fetchImpl: async (u, o) => { body = JSON.parse(o.body); return { ok: true }; } });
  assert.equal("section" in body, false);
  const r = await notifyPortfolio({ slug: "a", section: "book" }, { env: { PORTFOLIO_REVALIDATE_URL: "http://localhost:9/x", REVALIDATE_SECRET: "k" }, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(r.status, "failed");
});
