// Route-level negative tests against REAL production builds of both apps on one throwaway DB.
// Covers: Book visibility on every public surface, legacy write APIs, comments/ratings gating,
// Cloudinary ownership, slug collisions (current, historical, concurrent, compensation), JSON-LD breakout.
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { api, doc, para } from "../helpers.mjs";

const PUB = process.env.E2E_PUBLIC;
const URI = process.env.E2E_MONGODB_URI;
const RSECRET = process.env.E2E_REVALIDATE_SECRET;
const CLOUD = process.env.E2E_CLOUD_NAME || "e2etestcloud";
const pub = (p, o = {}) => fetch(PUB + p, { redirect: "manual", ...o });
const html = async (p) => (await pub(p)).text();
const oid = () => new mongoose.Types.ObjectId();
const img = (n) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1/writings/${n}.jpg`;
async function until(fn, { timeout = 30000, step = 500 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("condition not met in time; last=" + JSON.stringify(last));
}
const json = (r) => r.json().catch(() => null);

let db;
test.beforeAll(async () => {
  expect(URI, "E2E_MONGODB_URI").toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):.*test/);
  await mongoose.connect(URI);
  db = mongoose.connection.db;
});
test.afterAll(async () => {
  await mongoose.disconnect();
});

// ------------------------------------------------------------------ Books
test.describe.serial("Book visibility on every public surface", () => {
  const T = { pub: "ZZPubBook", draft: "ZZDraftBook", arch: "ZZArchBook", legacy: "ZZLegacyBook" };
  const B = {};
  test.beforeAll(async () => {
    const mk = (key, title, slug, status, code) => ({
      _id: oid(), title, slug, shortCode: code, description: `${title} description text`, publishYear: 2020,
      language: "Tamil", poems: [], genre: ["Poetry"], slugHistory: [], createdAt: new Date(), publishedAt: new Date(),
      ...(status ? { status } : {}),
    });
    B.pub = mk("pub", T.pub, "zz-pub-book", "published", "ZzPub01");
    B.draft = mk("draft", T.draft, "zz-draft-book", "draft", "ZzDft01");
    B.arch = mk("arch", T.arch, "zz-arch-book", "archived", "ZzArc01");
    B.legacy = mk("legacy", T.legacy, "zz-legacy-book", undefined, "ZzLeg01");
    await db.collection("books").deleteMany({ slug: /^zz-/ });
    await db.collection("books").insertMany(Object.values(B));
    const r = await pub("/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${RSECRET}` },
      body: JSON.stringify({ slug: "zz-pub-book", section: "book", previousSlugs: ["zz-draft-book", "zz-arch-book", "zz-legacy-book"] }),
    });
    expect(r.status).toBe(200);
  });
  const hidden = () => [["draft", T.draft], ["archived", T.arch]];

  test("positive control: published and legacy (no status) books are visible everywhere", async () => {
    for (const k of ["pub", "legacy"]) {
      expect((await pub(`/spotlight/${B[k].slug}`)).status, `detail ${k}`).toBe(200);
      expect((await pub(`/api/books/${B[k].slug}`)).status, `api ${k}`).toBe(k === "legacy" ? 404 : 200); // API is published-only by design
    }
    // revalidatePath serves the stale page once and regenerates; poll like spec 05 does.
    // /books renders a hardcoded bibliography (DB books are not displayed there), so no positive control.
    await until(async () => (await html("/spotlight")).includes(T.pub));
    await until(async () => (await html("/sitemap.xml")).includes("zz-pub-book"));
    const list = JSON.stringify(await json(await pub("/api/books")));
    expect(list).toContain(T.pub);
  });

  test("direct detail URLs by slug and by id are 404 and leak no title (metadata included)", async () => {
    for (const [k, title] of hidden()) {
      for (const p of [`/spotlight/${B[k === "draft" ? "draft" : "arch"].slug}`, `/spotlight/${B[k === "draft" ? "draft" : "arch"]._id}`]) {
        const r = await pub(p);
        expect(r.status, p).toBe(404);
        expect(await r.text(), `${p} leaked`).not.toContain(title);
      }
    }
  });

  test("short links (/s/<code>) do not resolve or leak draft/archived books", async () => {
    for (const [k, title] of hidden()) {
      const code = k === "draft" ? B.draft.shortCode : B.arch.shortCode;
      const r = await pub(`/s/${code}`);
      expect([404], `/s/${code} -> ${r.status}`).toContain(r.status);
      expect(await r.text()).not.toContain(title);
    }
    expect([301, 302, 303, 307, 308]).toContain((await pub(`/s/${B.pub.shortCode}`)).status);
  });

  test("public API: list, detail by slug/id, related", async () => {
    const list = JSON.stringify(await json(await pub("/api/books")));
    for (const [, title] of hidden()) expect(list).not.toContain(title);
    for (const k of ["draft", "arch"]) {
      for (const idOrSlug of [B[k].slug, String(B[k]._id)]) {
        const r = await pub(`/api/books/${idOrSlug}`);
        expect(r.status, `/api/books/${idOrSlug}`).toBe(404);
        expect(await r.text()).not.toContain(B[k].title);
      }
      expect((await pub(`/api/books/${B[k]._id}/related`)).status).toBeGreaterThanOrEqual(404);
    }
    const rel = JSON.stringify(await json(await pub(`/api/books/${B.pub._id}/related`)));
    for (const [, title] of hidden()) expect(rel).not.toContain(title);
  });

  test("HTML listings (/books, /spotlight) and sitemap exclude hidden books", async () => {
    for (const p of ["/books", "/spotlight", "/sitemap.xml"]) {
      const body = await html(p);
      for (const [, title] of hidden()) expect(body, `${p}`).not.toContain(title);
      expect(body, p).not.toContain("zz-draft-book");
      expect(body, p).not.toContain("zz-arch-book");
    }
  });

  test("search excludes hidden books, including across every page of results (pagination)", async () => {
    const seen = new Set();
    for (let page = 1; page <= 6; page++) {
      const r = await pub(`/api/search?q=ZZ&page=${page}&limit=1`);
      const body = JSON.stringify((await json(r))?.results ?? []);
      for (const [, title] of hidden()) expect(body, `page ${page}`).not.toContain(title);
      seen.add(body);
    }
    for (const t of ["ZZDraftBook", "ZZArchBook"]) {
      const r = await json(await pub(`/api/search?q=${t}&type=spotlight`));
      expect(JSON.stringify(r.results ?? []), `results for ${t}`).not.toContain(t);
    }
  });
});

// ------------------------------------------------------------------ Legacy writing write APIs
test("legacy Portfolio write endpoints are gone (410) for every method, with or without a key", async () => {
  const id = String(oid());
  const bodies = { "content-type": "application/json" };
  for (const auth of [{}, { authorization: "Bearer not-a-real-key-0123456789abcdef" }, { "x-api-key": "not-a-real-key-0123456789abcdef" }]) {
    for (const [m, p] of [["POST", "/api/writings"], ["PUT", "/api/writings"], ["PATCH", "/api/writings"], ["DELETE", "/api/writings"],
      ["PUT", `/api/writings/${id}`], ["PATCH", `/api/writings/${id}`], ["DELETE", `/api/writings/${id}`]]) {
      const r = await pub(p, { method: m, headers: { ...bodies, ...auth }, body: m === "DELETE" ? undefined : JSON.stringify({ title: "x", version: 1 }) });
      expect(r.status, `${m} ${p}`).toBe(410);
    }
  }
  expect((await pub("/api/writings/not-an-id/comments", { method: "POST", headers: bodies, body: "{}" })).status).toBe(410);
  expect((await pub(`/api/writings/${id}/rate`, { method: "POST", headers: bodies, body: JSON.stringify({ rating: 1, email: "a@b.co" }) })).status).toBe(410);
});

// ------------------------------------------------------------------ Comments and ratings
test.describe.serial("comments and ratings only on published work", () => {
  const W = {};
  const mkW = (status, slug) => ({
    _id: oid(), title: `CW ${status}`, slug, status, category: "poem", language: "Tamil", contentFormat: "tiptap", version: 1,
    content: doc(para("x")), body: "x", slugHistory: [], ratings: [], averageRating: 0, totalRatings: 0, createdAt: new Date(),
    ...(status === "published" ? { publishedAt: new Date() } : {}),
  });
  test.beforeAll(async () => {
    for (const s of ["published", "draft", "archived"]) W[s] = mkW(s, `cw-${s}`);
    await db.collection("writings").deleteMany({ slug: /^cw-/ });
    await db.collection("comments").deleteMany({ comment: /^E2E / });
    await db.collection("writings").insertMany(Object.values(W));
  });
  const payload = (parentId) => JSON.stringify({ parentModel: "Writing", parentId: String(parentId), name: "Tester", email: "reviewer@example.test", comment: "E2E hello", rating: 1 });
  const post = (parentId) => pub("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: payload(parentId) });

  test("Portfolio POST /api/comments: draft, archived, missing and malformed ids are 404; published is accepted as pending", async () => {
    for (const k of ["draft", "archived"]) expect((await post(W[k]._id)).status, k).toBe(404);
    expect((await post(oid())).status, "missing").toBe(404);
    expect((await post("not-an-object-id")).status, "malformed").toBeGreaterThanOrEqual(400);
    const ok = await post(W.published._id);
    expect(ok.status, await ok.clone().text()).toBeLessThan(300);
    expect(await db.collection("comments").countDocuments({ parentId: { $in: [W.draft._id, W.archived._id] } })).toBe(0);
  });
  test("the accepted comment is pending: not publicly listed, no reviewer email, aggregates unchanged", async () => {
    const stored = await db.collection("comments").findOne({ parentId: W.published._id });
    expect(stored.status).toBe("pending");
    const listed = await pub(`/api/comments/Writing/${W.published._id}`);
    const body = await listed.text();
    expect(body).not.toContain("E2E hello");
    expect(body).not.toContain("reviewer@example.test");
    const w = await db.collection("writings").findOne({ _id: W.published._id });
    expect(w.totalRatings || 0, "pending rating must not count").toBe(0);
    expect(w.averageRating || 0).toBe(0);
    for (const k of ["draft", "archived"]) expect((await pub(`/api/comments/Writing/${W[k]._id}`)).status, k).toBe(404);
  });
  test("an approved comment is listed without the email, and only then counts", async () => {
    await db.collection("comments").updateOne({ _id: (await db.collection("comments").findOne({ parentId: W.published._id }))._id }, { $set: { status: "approved" } });
    const body = await (await pub(`/api/comments/Writing/${W.published._id}`)).text();
    expect(body).toContain("E2E hello");
    expect(body).not.toContain("reviewer@example.test");
  });

  test("Admin public endpoints (rate/comments) apply the same gate", async ({ page }) => {
    await page.goto("/admin");
    for (const k of ["draft", "archived"]) {
      expect((await api(page, "POST", `/api/writings/${W[k]._id}/comments`, { name: "T", email: "a@b.co", comment: "E2E x", rating: 1 })).status, `comments ${k}`).toBe(404);
      expect([404, 410], `rate ${k}`).toContain((await api(page, "POST", `/api/writings/${W[k]._id}/rate`, { email: "a@b.co", rating: 1 })).status);
    }
    expect((await api(page, "POST", `/api/writings/${oid()}/comments`, { name: "T", email: "a@b.co", comment: "E2E x" })).status).toBe(404);
    expect((await api(page, "POST", `/api/writings/zzz/comments`, { name: "T", email: "a@b.co", comment: "E2E x" })).status).toBe(404);
    const before = await db.collection("writings").findOne({ _id: W.published._id });
    const rate = await api(page, "POST", `/api/writings/${W.published._id}/rate`, { email: "a@b.co", rating: 1 });
    const after = await db.collection("writings").findOne({ _id: W.published._id });
    expect([rate.status === 410, (after.totalRatings || 0) === (before.totalRatings || 0)], "an unmoderated rating must not change public aggregates").toContain(true);
    expect(after.totalRatings || 0).toBe(before.totalRatings || 0);
  });
});

// ------------------------------------------------------------------ Cloudinary ownership
test.describe.serial("DELETE /api/delete-image ownership", () => {
  let A, B, C;
  const mk = (slug, images) => ({ _id: oid(), title: slug, slug, status: "draft", category: "poem", language: "Tamil", contentFormat: "tiptap", version: 1, content: doc(para("x")), body: "x", slugHistory: [], images, createdAt: new Date() });
  test.beforeAll(async () => {
    A = mk("img-a", { large: img("e2e-a"), medium: img("e2e-a") });
    B = mk("img-b", { large: img("e2e-b") });
    C = mk("img-c", { large: img("e2e-shared") });
    const D = mk("img-d", { large: img("e2e-shared") });
    C.sharedWith = D._id; // remember
    await db.collection("writings").deleteMany({ slug: /^img-/ });
    await db.collection("writings").insertMany([A, B, C, D]);
    C.D = D;
  });
  const del = (page, writingId, imageUrl) => page.evaluate(async ([w, u]) => {
    const r = await fetch("/api/delete-image", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writingId: w, imageUrl: u }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [String(writingId), imageUrl]);
  const imagesOf = async (w) => (await db.collection("writings").findOne({ _id: w._id })).images || {};

  test("unauthenticated callers are rejected", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } }); // explicitly logged out
    const p = await ctx.newPage();
    await p.goto("/login");
    expect([401, 403]).toContain((await del(p, A._id, img("e2e-a"))).status);
    await ctx.close();
    expect((await imagesOf(A)).large).toBe(img("e2e-a"));
  });
  test("cross-writing: another writing's image cannot be deleted through this writing", async ({ page }) => {
    await page.goto("/admin");
    const r = await del(page, A._id, img("e2e-b"));
    expect(r.status).toBe(404);
    expect((await imagesOf(B)).large, "B untouched").toBe(img("e2e-b"));
  });
  test("arbitrary public ids / foreign hosts / traversal are refused and nothing changes", async ({ page }) => {
    await page.goto("/admin");
    for (const u of [
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/other-folder/secret.jpg`,
      `https://res.cloudinary.com/othercloud/image/upload/v1/writings/e2e-a.jpg`,
      `https://evil.example/image/upload/v1/writings/e2e-a.jpg`,
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/writings/..%2Fsecret.jpg`,
      "writings/e2e-a", "", "javascript:alert(1)",
    ]) {
      const r = await del(page, A._id, u);
      expect([400, 404], `${u} -> ${r.status}`).toContain(r.status);
    }
    expect(await imagesOf(A)).toEqual({ large: img("e2e-a"), medium: img("e2e-a") });
    expect((await del(page, "not-an-id", img("e2e-a"))).status).toBe(400);
    expect((await del(page, oid(), img("e2e-a"))).status).toBe(404);
  });
  test("legitimate deletion detaches the image from its own writing", async ({ page }) => {
    await page.goto("/admin");
    const r = await del(page, A._id, img("e2e-a"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const imgs = await imagesOf(A);
    expect(imgs.large ?? null).toBeNull();
    expect(imgs.medium ?? null).toBeNull();
    expect((await imagesOf(B)).large, "B unaffected").toBe(img("e2e-b"));
  });
  test("a shared asset is detached here but NOT destroyed while another writing references it", async ({ page }) => {
    await page.goto("/admin");
    const r = await del(page, C._id, img("e2e-shared"));
    expect(r.status).toBe(200);
    expect(r.body.keptBecauseShared, "asset still referenced elsewhere").toBe(true);
    expect(r.body.deleted).toBeFalsy();
    expect((await imagesOf(C.D)).large, "other writing keeps its reference").toBe(img("e2e-shared"));
  });
});

// ------------------------------------------------------------------ Slug collisions through the real routes
test.describe.serial("slug uniqueness, history and concurrency through POST/PUT /api/writings", () => {
  const body = (title, slug, extra = {}) => ({ title, slug, category: "poem", language: "Tamil", status: "draft", content: doc(para("வரி")), ...extra });
  let ids = {};
  test.beforeAll(async () => {
    await db.collection("writings").deleteMany({ slug: /^sl-/ });
    await db.collection("slugclaims").deleteMany({ slug: /^sl-/ });
  });
  test("create with a taken current slug never yields a duplicate (suffixed), rename onto it is 409", async ({ page }) => {
    await page.goto("/admin");
    const a = await api(page, "POST", "/api/writings", body("A", "sl-current"));
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    ids.a = a.body._id;
    const dup = await api(page, "POST", "/api/writings", body("B", "sl-current"));
    expect(dup.status).toBe(201);
    expect(dup.body.slug, "second writing must not share the slug").not.toBe("sl-current");
    expect(await db.collection("writings").countDocuments({ slug: "sl-current" })).toBe(1);
    const cur = (await api(page, "GET", `/api/writings/${dup.body._id}`)).body;
    const steal = await api(page, "PUT", `/api/writings/${dup.body._id}`, { title: cur.title, category: cur.category, language: cur.language, content: cur.content, version: cur.version, slug: "sl-current" });
    expect(steal.status).toBe(409);
  });
  test("a historical slug cannot be reused by another writing", async ({ page }) => {
    await page.goto("/admin");
    let cur = (await api(page, "GET", `/api/writings/${ids.a}`)).body;
    const pubd = await api(page, "PUT", `/api/writings/${ids.a}`, { title: cur.title, category: cur.category, language: cur.language, content: cur.content, version: cur.version, status: "published" });
    expect(pubd.status, JSON.stringify(pubd.body)).toBe(200);
    cur = (await api(page, "GET", `/api/writings/${ids.a}`)).body;
    const ren = await api(page, "PUT", `/api/writings/${ids.a}`, { title: cur.title, category: cur.category, language: cur.language, content: cur.content, version: cur.version, slug: "sl-renamed" });
    expect(ren.status, JSON.stringify(ren.body)).toBe(200);
    const reuse = await api(page, "POST", "/api/writings", body("C", "sl-current"));
    expect(reuse.status).toBe(201);
    expect(reuse.body.slug, "a historical slug must not be handed to a new writing").not.toBe("sl-current");
    expect(await db.collection("writings").countDocuments({ $or: [{ slug: "sl-current" }, { "slugHistory.slug": "sl-current" }] })).toBe(1);
    const other = await api(page, "POST", "/api/writings", body("D", "sl-other"));
    expect(other.status).toBe(201);
    ids.d = other.body._id;
    const cur2 = (await api(page, "GET", `/api/writings/${ids.d}`)).body;
    const steal = await api(page, "PUT", `/api/writings/${ids.d}`, { title: cur2.title, category: cur2.category, language: cur2.language, content: cur2.content, version: cur2.version, slug: "sl-current" });
    expect(steal.status, "rename onto another writing's history").toBe(409);
    expect((await db.collection("writings").findOne({ _id: new mongoose.Types.ObjectId(ids.d) })).slug).toBe("sl-other");
  });
  test("concurrent creates of one slug: no duplicate slug ever stored, every claim unique", async ({ page }) => {
    await page.goto("/admin");
    const res = await Promise.all(Array.from({ length: 8 }, (_, i) => api(page, "POST", "/api/writings", body(`R${i}`, "sl-race"))));
    expect(res.map((r) => r.status), "every create succeeds with its own slug").toEqual(Array(8).fill(201));
    const slugs = res.map((r) => r.body.slug);
    expect(new Set(slugs).size, `distinct slugs: ${slugs}`).toBe(8);
    expect(await db.collection("writings").countDocuments({ slug: "sl-race" })).toBe(1);
    expect(await db.collection("slugclaims").countDocuments({ slug: { $in: slugs } })).toBe(8);
  });
  test("failed save releases the claim: an invalid-document create does not strand the slug", async ({ page }) => {
    await page.goto("/admin");
    const bad = await api(page, "POST", "/api/writings", body("", "sl-comp"));
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await db.collection("slugclaims").countDocuments({ slug: "sl-comp" }), "no orphan claim").toBe(0);
    const good = await api(page, "POST", "/api/writings", body("Good", "sl-comp"));
    expect(good.status).toBe(201);
  });
});

// ------------------------------------------------------------------ JSON-LD breakout on older page types
test.describe("hostile content cannot break out of JSON-LD on older pages", () => {
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const EVIL = "</script><script>window.__pwn=1</script> & <b>x</b>" + LS + PS;
  test("books list/detail, blog list: every ld+json block parses and has no raw <, > or separators", async () => {
    const id = oid();
    await db.collection("books").deleteMany({ slug: "zz-evil-book" });
    await db.collection("books").insertOne({ _id: id, title: EVIL, slug: "zz-evil-book", description: EVIL, publishYear: 2021, language: "Tamil", poems: [], genre: ["Poetry"], slugHistory: [], status: "published", createdAt: new Date(), publishedAt: new Date() });
    await pub("/api/revalidate", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${RSECRET}` }, body: JSON.stringify({ slug: "zz-evil-book", section: "book" }) });
    for (const p of ["/books", "/spotlight/zz-evil-book", "/blog", "/"]) {
      const page = await html(p);
      const blocks = [...page.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      for (const b of blocks) {
        expect(() => JSON.parse(b), `${p} block parses`).not.toThrow();
        expect(new RegExp("[<>" + LS + PS + "]").test(b), `${p} raw delimiter`).toBe(false);
      }
      // Whole-document check: the only executable inline script payload we injected must not appear raw.
      expect(page, p).not.toContain("<script>window.__pwn=1</script>");
    }
  });
});
