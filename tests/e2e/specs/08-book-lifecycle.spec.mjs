// Book lifecycle across BOTH apps on one disposable DB: Admin writes, Portfolio must reflect each change within seconds
// (not after the 1-hour ISR window). Synthetic content only; slugs are unique per run (the Portfolio's ISR cache is on disk).
import { test, expect } from "@playwright/test";
import { api } from "../helpers.mjs";
import { BASE } from "../env.mjs";

const PUB = process.env.E2E_PUBLIC;
const pub = (p, o = {}) => fetch(PUB + p, { redirect: "manual", ...o });
const RUN = Date.now().toString(36);
const TITLE = `ZZLifecycle ${RUN}`;
const TITLE2 = `ZZLifecycle edited ${RUN}`;
const SLUG = `zz-lifecycle-${RUN}`;
const SLUG2 = `zz-lifecycle-renamed-${RUN}`;

async function until(fn, { timeout = 20000, step = 400 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("public site did not reflect the change in time; last=" + JSON.stringify(last));
}
const detailStatus = async (slug) => (await pub(`/spotlight/${slug}`)).status;
const inSitemap = async (slug) => (await (await pub("/sitemap.xml")).text()).includes(slug);
const inList = async (title) => JSON.stringify(await (await pub("/api/books")).json()).includes(title);

test.describe.serial("book lifecycle: admin -> shared DB -> portfolio", () => {
  let page, id;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/state.json" });
    page = await ctx.newPage();
    await page.goto("/admin/writings");
  });

  test("unauthenticated and unsafe requests are rejected", async () => {
    for (const [m, u] of [["POST", "/api/books"], ["PUT", "/api/books/" + "a".repeat(24)], ["DELETE", "/api/books/" + "a".repeat(24)]]) {
      const r = await fetch(BASE + u, { method: m, headers: { "content-type": "application/json" }, body: m === "DELETE" ? undefined : "{}" });
      expect(r.status, `${m} ${u}`).toBe(401);
    }
    const bad = await api(page, "POST", "/api/books", { title: "x", description: "y", publishYear: 2020, status: "bogus" });
    expect(bad.status).toBe(400);
  });

  test("create as draft: private everywhere", async () => {
    const r = await api(page, "POST", "/api/books", { title: TITLE, slug: SLUG, description: "ZZ synthetic book", publishYear: 2024, reviews: [{ rating: 5 }], shortCode: "hijack1", averageRating: 5 });
    expect(r.status).toBe(201);
    id = r.body.book._id;
    expect(r.body.book.status).toBe("draft");
    expect(r.body.book.shortCode).not.toBe("hijack1"); // mass assignment ignored
    expect(r.body.book.reviews ?? []).toHaveLength(0);
    expect(await detailStatus(SLUG)).toBe(404); // primes the public cache with a 404 on purpose
    expect(await inSitemap(SLUG)).toBe(false);
  });

  test("publish: public detail, listing and sitemap update promptly", async () => {
    const r = await api(page, "PUT", `/api/books/${id}`, { status: "published" });
    expect(r.status).toBe(200);
    expect(r.body.revalidate.status).toBe("ok");
    await until(async () => (await detailStatus(SLUG)) === 200);
    await until(() => inSitemap(SLUG));
    await until(() => inList(TITLE));
  });

  test("edit text: public page shows the new title", async () => {
    const r = await api(page, "PUT", `/api/books/${id}`, { title: TITLE2 });
    expect(r.body.revalidate.status).toBe("ok");
    await until(async () => (await (await pub(`/spotlight/${SLUG}`)).text()).includes(TITLE2));
  });

  test("rename slug: new URL works, old URL redirects", async () => {
    const r = await api(page, "PUT", `/api/books/${id}`, { slug: SLUG2 });
    expect(r.status).toBe(200);
    expect(r.body.revalidate.status).toBe("ok");
    await until(async () => (await detailStatus(SLUG2)) === 200);
    const old = await until(async () => { const x = await pub(`/spotlight/${SLUG}`); return [301, 308].includes(x.status) ? x : null; });
    expect(old.headers.get("location")).toContain(SLUG2);
  });

  test("unpublish: gone from detail, listing and sitemap", async () => {
    expect((await api(page, "PUT", `/api/books/${id}`, { status: "draft" })).body.revalidate.status).toBe("ok");
    await until(async () => (await detailStatus(SLUG2)) === 404);
    await until(async () => !(await inSitemap(SLUG2)));
    await until(async () => !(await inList(TITLE2)));
    expect(await detailStatus(SLUG)).not.toBe(200); // old slug must not leak the hidden book either
  });

  test("restore to published, then archive", async () => {
    expect((await api(page, "PUT", `/api/books/${id}`, { status: "published" })).body.revalidate.status).toBe("ok");
    await until(async () => (await detailStatus(SLUG2)) === 200);
    const a = await api(page, "DELETE", `/api/books/${id}`);
    expect(a.status).toBe(200);
    expect(a.body.book.status).toBe("archived");
    await until(async () => (await detailStatus(SLUG2)) === 404);
    await until(async () => !(await inSitemap(SLUG2)));
  });

  test("legacy key-gated writes on the public site are retired", async () => {
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      expect((await pub(`/api/books/${id}`, { method: m, headers: { "x-api-key": "anything", "content-type": "application/json" }, body: m === "DELETE" ? undefined : "{}" })).status).toBe(410);
    }
  });
});
