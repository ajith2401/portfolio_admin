// Cross-app publishing: Admin (3411) and Portfolio (3110) share ONE local database. Synthetic Tamil content only.
import { test, expect } from "@playwright/test";
import { editor, api } from "../helpers.mjs";

const PUB = process.env.E2E_PUBLIC;
const SITE = process.env.E2E_SITE_URL;
const pub = (p, o = {}) => fetch(PUB + p, { redirect: "manual", ...o });
const text = async (p) => (await pub(p)).text();
async function until(fn, { timeout = 30000, step = 500 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("condition not met in time; last=" + JSON.stringify(last));
}
// Unique per run: the Portfolio's on-disk ISR cache outlives its process, so a reused slug would serve the previous run's redirect.
const RUN = Date.now().toString(36);
const TITLE = `மழை இரவு ${RUN}`;
const L1 = "வானம் அழுதது",
  L2 = "மண் சிரித்தது",
  S2 = "இரண்டாம் பத்தி",
  EXTRA = "மூன்றாம் வரி";
const SEO_TITLE = "மழை இரவு – கவிதை";
const SEO_DESC = "ஒரு மழை இரவு பற்றிய சிறிய கவிதை.";

test.describe.serial("admin -> shared DB -> portfolio", () => {
  let id, slug, oldSlug;
  const newSlug = `rain-night-${RUN}`;
  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: ".auth/state.json",
      viewport: { width: 1440, height: 900 },
    });
    page = await ctx.newPage();
  });

  test("portfolio rejects bad/missing revalidate secret", async () => {
    const bad = await pub("/api/revalidate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.E2E_BAD_SECRET}`,
      },
      body: JSON.stringify({ slug: "x" }),
    });
    expect(bad.status).toBe(401);
    const none = await pub("/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "x" }),
    });
    expect([401, 403]).toContain(none.status);
  });

  test("1-4 create Tamil poem, autosave, preview, SEO", async () => {
    await page.goto("/admin/writings/new");
    await page.locator("#w-title").fill(TITLE);
    await page.locator("#w-cat").selectOption("poem");
    await expect(editor(page)).toBeFocused();
    await page.keyboard.type(L1);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(L2);
    await page.keyboard.press("Enter");
    await page.keyboard.type(S2);
    await page.waitForURL(/\/admin\/writings\/[0-9a-f]{24}$/, {
      timeout: 20000,
    });
    id = page.url().split("/").pop();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.locator("p:visible", { hasText: L1 })).toHaveCount(1); // only the Preview shows it; the editor is hidden
    await expect(page.locator("p:visible", { hasText: S2 })).toHaveCount(1);
    await page.getByRole("tab", { name: "Search & Sharing" }).click();
    await page.locator("#seo-title").fill(SEO_TITLE);
    await page.locator("#seo-desc").fill(SEO_DESC);
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const g = await api(page, "GET", `/api/writings/${id}`);
    expect(g.body.status).toBe("draft");
    expect(g.body.contentFormat).toBe("tiptap");
    slug = g.body.slug;
    expect(slug).toBeTruthy();
    expect((await pub("/quill/" + encodeURIComponent(slug))).status).toBe(404); // a draft is NOT public
  });

  test("5-12 publish; portfolio serves same doc: render, metadata, canonical, JSON-LD, image, sitemap", async () => {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("published", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    const url = "/quill/" + encodeURIComponent(slug);
    const html = await until(async () => {
      const r = await pub(url);
      return r.status === 200 ? r.text() : null;
    });
    expect(html).toContain(L1);
    expect(html).toContain(L2);
    expect(html).toContain(S2);
    expect(html).toMatch(/<br\s*\/?>/);
    expect(html).toContain(SEO_TITLE);
    const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(decodeURI(canon)).toBe(`${SITE}/quill/${slug}`);
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(og.startsWith(SITE)).toBe(true);
    const img = await fetch(og.replace(SITE, PUB));
    expect(img.headers.get("content-type")).toContain("image/png");
    const png = Buffer.from(await img.arrayBuffer());
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    const ld = [
      ...html.matchAll(
        /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => JSON.parse(m[1]));
    expect(ld.filter((j) => j["@type"] === "BreadcrumbList")).toHaveLength(1);
    expect(
      ld.some((j) =>
        ["Article", "CreativeWork", "BlogPosting", "Poem"].includes(j["@type"]),
      ),
    ).toBe(true);
    expect(await text("/sitemap.xml")).toContain(encodeURIComponent(slug));
  });

  test("13-14 edit in admin; portfolio revalidates on demand", async () => {
    await page.reload();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(EXTRA);
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await until(async () =>
      (await text("/quill/" + encodeURIComponent(slug))).includes(EXTRA),
    );
  });

  test("15-16 change slug; old URL permanently redirects", async () => {
    oldSlug = slug;
    await page.getByRole("tab", { name: "Search & Sharing" }).click();
    await page.getByLabel("Slug", { exact: true }).fill(newSlug);
    await page.getByRole("button", { name: "Change address" }).click();
    await expect(page.getByText("Previous addresses")).toBeVisible({
      timeout: 15000,
    });
    slug = newSlug;
    const r = await until(async () => {
      const x = await pub("/quill/" + encodeURIComponent(oldSlug));
      return [301, 308].includes(x.status) ? x : null;
    });
    expect(decodeURIComponent(r.headers.get("location"))).toMatch(
      new RegExp(`/quill/${newSlug}$`),
    );
    expect((await pub("/quill/" + newSlug)).status).toBe(200);
    const sm = await text("/sitemap.xml");
    expect(sm).toContain(newSlug);
    expect(sm).not.toContain(encodeURIComponent(oldSlug));
  });

  test("17-18 unpublish: route gone, sitemap excludes, list excludes", async () => {
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByText("draft", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await until(async () => (await pub("/quill/" + newSlug)).status === 404);
    const o = await pub("/quill/" + encodeURIComponent(oldSlug));
    if ([301, 308].includes(o.status))
      expect(
        (await pub(new URL(o.headers.get("location"), PUB).pathname)).status,
      ).toBe(404);
    else expect(o.status).toBe(404);
    expect(await text("/sitemap.xml")).not.toContain(newSlug);
    expect(await text("/quill/" + newSlug)).not.toContain(S2);
    expect(await text("/quill")).not.toContain(S2);
  });
});
