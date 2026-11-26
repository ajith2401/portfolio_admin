// Public SEO structure on the real Portfolio production build: JSON-LD breadcrumbs are emitted at most once per page,
// every ld+json block parses, and generated social images are 1200x630 PNGs whose pixels depend on the (Tamil) title.
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { doc, para } from "../helpers.mjs";

const PUB = process.env.E2E_PUBLIC;
const URI = process.env.E2E_MONGODB_URI;
const RUN = Date.now().toString(36);
const SLUGS = { a: `zz-seo-a-${RUN}`, b: `zz-seo-b-${RUN}` };
const TITLES = { a: `மழை இரவு ${RUN}`, b: `நிலா வெளிச்சம் ${RUN}` };
let db;

test.beforeAll(async () => {
  expect(URI).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):.*test/);
  await mongoose.connect(URI); db = mongoose.connection.db;
  await db.collection("writings").deleteMany({ slug: /^zz-seo-/ });
  await db.collection("writings").insertMany(["a", "b"].map((k, i) => ({
    _id: new mongoose.Types.ObjectId(), title: TITLES[k], slug: SLUGS[k], status: "published", category: "poem", language: "Tamil",
    contentFormat: "tiptap", version: 1, content: doc(para("வானம் அழுதது")), body: "வானம் அழுதது", excerpt: "வானம் அழுதது", slugHistory: [],
    ratings: [], averageRating: 0, totalRatings: 0, createdAt: new Date(Date.now() - i), publishedAt: new Date(Date.now() - i),
  })));
});
test.afterAll(async () => { await db?.collection("writings").deleteMany({ slug: /^zz-seo-/ }); await mongoose.disconnect(); });

const ld = (html) => [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const flat = (blocks) => blocks.flatMap((b) => (Array.isArray(b) ? b : b["@graph"] ? b["@graph"] : [b]));

for (const path of ["/", "/quill", "/blog", "/books", "/spotlight", "/devfolio", "/about", `/quill/${SLUGS.a}`]) {
  test(`${path.replace(RUN, '<run>')}: JSON-LD parses and has at most one BreadcrumbList`, async () => {
    const res = await fetch(PUB + path);
    expect([200, 404]).toContain(res.status);
    const items = flat(ld(await res.text()));
    expect(items.filter((x) => x["@type"] === "BreadcrumbList").length, `${path} breadcrumb count`).toBeLessThanOrEqual(1);
  });
}

test("writing OG image: 1200x630 PNG, and different Tamil titles give different pixels", async () => {
  const get = async (slug) => { const r = await fetch(`${PUB}/quill/${slug}/opengraph-image`); return { r, buf: Buffer.from(await r.arrayBuffer()) }; };
  const a = await get(SLUGS.a), b = await get(SLUGS.b);
  for (const x of [a, b]) {
    expect(x.r.status).toBe(200);
    expect(x.r.headers.get("content-type")).toMatch(/image\/png/);
    expect(x.buf.subarray(1, 4).toString()).toBe("PNG");
    expect([x.buf.readUInt32BE(16), x.buf.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(x.buf.length).toBeGreaterThan(8000);
  }
  expect(a.buf.equals(b.buf)).toBe(false);
});
