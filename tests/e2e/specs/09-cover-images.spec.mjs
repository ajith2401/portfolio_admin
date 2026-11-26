// Writing cover images: every cover state must render deliberately (no broken-image box, no empty hero).
// Real Chrome against the Portfolio production build. Evidence (DOM, src, network, console, sizes) is written to
// $TMPDIR/cover-evidence-<width>-<page>.json (or E2E_EVIDENCE_DIR) on every run.
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { doc, para } from "../helpers.mjs";

const PUB = process.env.E2E_PUBLIC;
const URI = process.env.E2E_MONGODB_URI;
const RUN = Date.now().toString(36);
const CLOUD = process.env.E2E_CLOUD_NAME || "e2etestcloud";
const VARIANTS = {
  control: { small: "/placeholder.jpg" }, // a real, locally served image
  missing: undefined,
  nullimg: null,
  empty: { small: "", medium: "" },
  whitespace: { small: "   " },
  malformed: { small: "not a url at all" },
  badscheme: { small: "javascript:alert(1)" },
  unavailable: { small: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/writings/does-not-exist-${RUN}.jpg` },
};
const SLUG = (k) => `zz-cover-${k}-${RUN}`;
let db;

test.beforeAll(async () => {
  expect(URI).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost):.*test/);
  await mongoose.connect(URI);
  db = mongoose.connection.db;
  await db.collection("writings").deleteMany({ slug: /^zz-cover-/ });
  const now = Date.now();
  const rows = Object.entries(VARIANTS).map(([k, images], i) => ({
    _id: new mongoose.Types.ObjectId(), title: `கவர் ${k} ${RUN}`, slug: SLUG(k), status: "published", category: "poem", language: "Tamil",
    contentFormat: "tiptap", version: 1, content: doc(para("வானம் அழுதது")), body: "வானம் அழுதது", excerpt: "வானம் அழுதது", slugHistory: [],
    ratings: [], averageRating: 0, totalRatings: 0, createdAt: new Date(now - i), publishedAt: new Date(now - i),
    ...(images === undefined ? {} : { images }),
  }));
  await db.collection("writings").insertMany(rows);
  // The list is ISR; refresh it the way the Admin does after a publish.
  const r = await fetch(`${PUB}/api/revalidate`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.E2E_REVALIDATE_SECRET}` }, body: JSON.stringify({ slug: SLUG("control") }) });
  expect(r.status).toBe(200);
});
test.afterAll(async () => { await db?.collection("writings").deleteMany({ slug: /^zz-cover-/ }); await mongoose.disconnect(); });

async function probe(page, url, width) {
  const consoleErrors = [];
  const imageResponses = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  page.on("response", (r) => /_next\/image|placeholder\.jpg|cloudinary/.test(r.url()) && imageResponses.push({ url: r.url().slice(0, 160), status: r.status() }));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const dom = await page.evaluate(() => ({
    imgs: [...document.querySelectorAll("main img, article img")].map((i) => ({
      src: i.getAttribute("src")?.slice(0, 140), currentSrc: i.currentSrc?.slice(0, 140), alt: i.alt, complete: i.complete, naturalWidth: i.naturalWidth,
      w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height),
    })),
    covers: [...document.querySelectorAll("[data-cover]")].map((c) => ({ kind: c.getAttribute("data-cover"), w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height), text: c.textContent.trim().slice(0, 60) })),
    articles: [...document.querySelectorAll("article")].map((a) => a.textContent.trim().slice(0, 40)),
    bodyText: document.body.innerText.replace(/\s+/g, " ").slice(380, 1100),
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  }));
  const ev = { url, width, dom, imageResponses, consoleErrors };
  const dir = process.env.E2E_EVIDENCE_DIR || os.tmpdir();
  fs.writeFileSync(path.join(dir, `cover-evidence-${width}-${url.includes("/quill/") ? "detail" : "list"}.json`), JSON.stringify(ev, null, 1));
  return ev;
}

for (const width of [390, 820, 1440]) {
  test.describe(`covers at ${width}px`, () => {
    test.use({ storageState: { cookies: [], origins: [] }, viewport: { width, height: 900 } });

    test("list page: no broken image box, no horizontal overflow, every card has a deliberate cover", async ({ page }) => {
      const ev = await probe(page, `${PUB}/quill`, width);
      const broken = ev.dom.imgs.filter((i) => i.complete && i.naturalWidth === 0);
      expect(broken, `broken <img>: ${JSON.stringify(broken)}`).toEqual([]);
      expect(ev.dom.scrollW, "horizontal overflow").toBeLessThanOrEqual(ev.dom.innerW + 1);
      expect(page.url()).toBeTruthy();
      const cards = await page.locator("article").filter({ hasText: RUN }).count();
      expect(cards, "seeded cards rendered").toBeGreaterThanOrEqual(Object.keys(VARIANTS).length);
      const covers = ev.dom.covers;
      expect(covers.length, "every card exposes a cover element").toBeGreaterThanOrEqual(cards);
      for (const c of covers) expect(c.h, JSON.stringify(c)).toBeGreaterThan(40); // never collapsed/empty
    });

    test("detail page: related cards and page body are unaffected by bad covers", async ({ page }) => {
      const ev = await probe(page, `${PUB}/quill/${SLUG("control")}`, width);
      const broken = ev.dom.imgs.filter((i) => i.complete && i.naturalWidth === 0);
      expect(broken, `broken <img>: ${JSON.stringify(broken)}`).toEqual([]);
      expect(ev.dom.scrollW).toBeLessThanOrEqual(ev.dom.innerW + 1);
      for (const c of ev.dom.covers) expect(c.h).toBeGreaterThan(40);
      await expect(page.locator("main")).toContainText("வானம் அழுதது");
    });
  });
}
