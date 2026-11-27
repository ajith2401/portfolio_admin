// Woven textiles: pick Dark Indigo Woven Fabric -> the real preview changes and is navy-dominant, the strength slider
// changes pixels, the poem keeps >= 4.5:1 contrast on the cloth (or a local scrim is drawn), the Poster PNG export
// contains the texture, undo/redo keeps the choice, Quick Create applies one, and mobile 390 has no overflow and
// 44px targets. Synthetic poems only.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { checkViewport } from "../helpers.mjs";

const URL_ = "/admin/poem-motion-studio";
const POEM = "மழை பெய்கிறது\nமனம் நனைகிறது\n\nஒரு கவிதை\nஒரு நினைவு";
const begin = async (page) => {
  await page.goto(URL_);
  await page
    .getByRole("button", { name: /Write a poem/ })
    .first()
    .click();
  await page.getByLabel("Title (optional)").fill("QA கவிதை");
  await page.getByLabel("Poem text").fill(POEM);
  await page.getByRole("button", { name: "Create scenes" }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
};
const preview = (page) => page.locator("canvas[aria-label^=Preview]").first();
const snap = (page) =>
  preview(page).evaluate((cv) =>
    Array.from(
      cv
        .getContext("2d")
        .getImageData(0, 0, cv.width, cv.height)
        .data.filter((_, i) => i % 32 === 0),
    ),
  );
const diff = (a, b) =>
  a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 6 ? 1 : 0), 0) / a.length;

// Pixel statistics of an RGBA buffer, evaluated in the page (registered once as window.__txStats; no eval in the page)
const STATS = `(d, w, h) => {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  const y8 = (i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  const med = (a) => (a.sort((x, y) => x - y), a[Math.floor(a.length / 2)]);
  // cloth: the top 12% of the frame (no poem text there)
  let n = 0, R = 0, G = 0, B = 0, navy = 0; const L = [];
  for (let y = 0; y < Math.floor(h * 0.12); y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    R += r; G += g; B += b; n++; if (b > r + 12 && b >= g) navy++; L.push(y8(i));
  }
  const mean = L.reduce((a, v) => a + v, 0) / L.length;
  const sd = Math.sqrt(L.reduce((a, v) => a + (v - mean) ** 2, 0) / L.length);
  // text band (middle of the frame): text = brightest 0.5%; background = 90th percentile of the darkest 80%
  const T = [];
  for (let y = Math.floor(h * 0.3); y < Math.floor(h * 0.7); y += 2) for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x += 2) T.push(lum((y * w + x) * 4));
  T.sort((a, b) => a - b);
  const text = T[Math.floor(T.length * 0.995)], bgs = T.slice(0, Math.floor(T.length * 0.8)), bg = bgs[Math.floor(bgs.length * 0.9)];
  // local scrim: the darkest row (row median, so thin text strokes do not count) vs the cloth at the top
  let darkest = 255;
  for (let y = Math.floor(h * 0.25); y < Math.floor(h * 0.75); y += 4) {
    const row = []; for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += 3) row.push(y8((y * w + x) * 4));
    darkest = Math.min(darkest, med(row));
  }
  return { r: R / n, g: G / n, b: B / n, navy: navy / n, sd, cloth: med(L.slice()), darkest,
    contrast: (Math.max(text, bg) + 0.05) / (Math.min(text, bg) + 0.05) };
}`;
const canvasStats = async (page) => {
  await page.evaluate(`window.__txStats = ${STATS}`);
  return preview(page).evaluate((cv) =>
    window.__txStats(
      cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data,
      cv.width,
      cv.height,
    ),
  );
};
// Export the Poster PNG through the real UI and measure the file itself
const posterStats = async (page, info, name) => {
  await page.getByRole("tab", { name: "Feed poster" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Poster PNG" }).click();
  const f = info.outputPath(name);
  await (await dl).saveAs(f);
  const b64 = fs.readFileSync(f).toString("base64");
  await page.evaluate(`window.__txStats = ${STATS}`);
  return page.evaluate(async (b) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    return window.__txStats(
      x.getImageData(0, 0, c.width, c.height).data,
      c.width,
      c.height,
    );
  }, b64);
};
const lookTab = async (page) => {
  await page.getByRole("tab", { name: "Look" }).click();
  return page.getByRole("group", { name: "Woven textiles" });
};

test("Dark Indigo Woven: preview changes and is navy-dominant; strength changes pixels; undo/redo; poster export has the texture and readable text", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  const cards = await lookTab(page);
  await expect(cards.getByRole("button")).toHaveCount(9); // None + 8 textiles
  // controls appear only once a textile is selected
  await expect(page.getByTestId("fabric-controls")).toHaveCount(0);
  await page.waitForTimeout(400);
  const plain = await snap(page);

  const hero = cards.getByRole("button", {
    name: "Textile: Dark Indigo Woven Fabric",
  });
  await expect(hero).toContainText("Midnight Thoughts"); // suggested family on the card
  await expect(hero).toContainText(/subtle|medium|strong/);
  await hero.click();
  await expect(hero).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  const woven = await snap(page);
  expect(diff(plain, woven), "the textile changes the preview").toBeGreaterThan(
    0.2,
  );
  const s = await canvasStats(page);
  expect(s.b, `navy: blue dominant (${JSON.stringify(s)})`).toBeGreaterThan(
    s.r + 15,
  );
  expect(s.navy, "most cloth pixels are navy").toBeGreaterThan(0.8);
  expect(s.sd, "woven structure, not flat navy").toBeGreaterThan(1.2);

  // strength + another fabric control change pixels
  const controls = page.getByTestId("fabric-controls");
  await controls.locator("summary").click();
  await page.getByLabel("Fabric strength", { exact: true }).fill("0.2");
  await page.waitForTimeout(400);
  const weak = await snap(page);
  // a dark cloth moves pixels by a few levels only: count changes > 2 levels, and check the weave visibly flattens
  const fine = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 2 ? 1 : 0), 0) / a.length;
  expect(fine(woven, weak), "Fabric strength changes the preview").toBeGreaterThan(0.05);
  const sw = await canvasStats(page);
  expect(sw.sd, `lower strength flattens the weave (${s.sd} -> ${sw.sd})`).toBeLessThan(s.sd * 0.85);
  await page.getByLabel("Weave scale", { exact: true }).fill("1.8");
  await page.waitForTimeout(400);
  expect(fine(weak, await snap(page)), "Weave scale changes the preview").toBeGreaterThan(0.05);
  await page.getByRole("button", { name: "Reset fabric" }).click();
  await expect(page.getByLabel("Fabric strength", { exact: true })).toHaveValue(
    "0.75",
  );

  // undo / redo keep the textile choice
  const charcoal = cards.getByRole("button", {
    name: "Textile: Charcoal Woven Fabric",
  });
  await charcoal.click();
  await expect(charcoal).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(hero).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(charcoal).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(hero).toHaveAttribute("aria-pressed", "true");

  // poster export: the cloth is in the file, and the poem reads at >= 4.5:1 on it (or a local scrim is drawn)
  const ps = await posterStats(page, info, "poster-indigo.png");
  expect(
    ps.navy,
    `poster cloth is navy (${JSON.stringify(ps)})`,
  ).toBeGreaterThan(0.8);
  expect(ps.sd, "poster has woven structure").toBeGreaterThan(1.2);
  expect(
    ps.contrast >= 4.5 || ps.darkest < ps.cloth - 20,
    "poster poem contrast >= 4.5 or a scrim",
  ).toBe(true);

  // None removes it again
  await page.getByRole("tab", { name: "Look" }).click();
  await cards.getByRole("button", { name: "Textile: None" }).click();
  await expect(page.getByTestId("fabric-controls")).toHaveCount(0);
});

test("light cloth under light text: the panel explains it, and the export draws a local scrim behind the poem", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  const cards = await lookTab(page);
  await cards.getByRole("button", { name: "Textile: Natural Linen" }).click();
  await expect(
    page.getByText(/a soft shade is added behind the words/),
  ).toBeVisible();
  const ps = await posterStats(page, info, "poster-linen.png");
  expect(
    ps.cloth,
    `the linen is light (${JSON.stringify(ps)})`,
  ).toBeGreaterThan(120);
  expect(
    ps.darkest,
    "a scrim darkens the cloth behind the light text",
  ).toBeLessThan(ps.cloth - 20);
});

test("Quick Create: Woven texture applies the chosen fabric", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc.getByLabel("Woven texture", { exact: true }).check();
  await qc
    .getByLabel("Woven texture preset")
    .selectOption("indigo-denim-twill");
  await qc.getByLabel("Woven texture strength").fill("0.5");
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const cards = await lookTab(page);
  await expect(
    cards.getByRole("button", { name: "Textile: Indigo Denim Twill" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("fabric-controls").locator("summary").click();
  await expect(page.getByLabel("Fabric strength", { exact: true })).toHaveValue(
    "0.5",
  );
});

test("mobile 390: textile cards scroll in one row, 44px targets, no horizontal overflow", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  const cards = await lookTab(page);
  await cards
    .getByRole("button", { name: "Textile: Dark Indigo Woven Fabric" })
    .click();
  await page.getByTestId("fabric-controls").locator("summary").click();
  const section = page.getByTestId("textile-section");
  for (const b of await section.locator("button, summary, input").all()) {
    if (!(await b.isVisible())) continue;
    const r = await b.boundingBox();
    if (r && r.y < 844 && r.y > 0 && r.x >= 0 && r.x + r.width <= 390)
      expect(
        r.height,
        (await b.getAttribute("aria-label")) || (await b.textContent()),
      ).toBeGreaterThanOrEqual(43);
  }
  // the 9 cards share one scrolling row instead of flooding the sheet
  const tops = new Set();
  for (const b of await cards.getByRole("button").all())
    tops.add(Math.round((await b.boundingBox()).y));
  expect(tops.size).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await checkViewport(page, 390, 844);
});
