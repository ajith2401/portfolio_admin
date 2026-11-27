// Font upgrade: approved fonts are in the normal picker, change the real preview, title font + real-weight control,
// pairings, poster + whole-poem export with a self-hosted font, save -> reload -> same fonts, no Google Fonts CDN
// request at any point, mobile 390. Synthetic poems only.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { checkViewport } from "../helpers.mjs";

const URL_ = "/admin/poem-motion-studio";
const POEM = "மழை பெய்கிறது\nமனம் நனைகிறது\n\nஸ்ரீ க்ஷேத்திரம் கௌ\nஒரு நினைவு, with English.";
const watchCdn = (page) => {
  const hits = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) hits.push(r.url());
  });
  return hits;
};
const begin = async (page) => {
  await page.goto(URL_);
  await page.getByRole("button", { name: /Write a poem/ }).first().click();
  await page.getByLabel("Title (optional)").fill("மழைக் கவிதை");
  await page.getByLabel("Poem text").fill(POEM);
  await page.getByRole("button", { name: "Create scenes" }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Look", exact: true }).click();
};
const preview = (page) => page.locator("canvas[aria-label^=Preview]").first();
const snap = (page) =>
  preview(page).evaluate((cv) =>
    Array.from(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.filter((_, i) => i % 32 === 0)),
  );
const diff = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 10 ? 1 : 0), 0) / a.length;

test("approved fonts: picker, preview changes, title font, real weights, pairing, poster export, reload keeps fonts, no CDN", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const cdn = watchCdn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  const font = page.getByLabel("Font", { exact: true });
  const opts = await font.locator("option").allTextContents();
  for (const n of ["Korkai", "Kavivanar", "Arima", "Neythal", "Catamaran"]) expect(opts).toContain(n);
  expect(opts.some((o) => /Meera Inimai|Coiny|Vaagai|Panai|Oi$/.test(o))).toBe(false); // candidates + display-only
  // scrub to the middle of the first scene so text is on screen (t=0 is before the text appears)
  const tl = page.getByRole("slider", { name: "Timeline" });
  const max = Number(await tl.getAttribute("max"));
  await tl.fill(String(Math.round(max * 0.12)));
  await page.waitForTimeout(800);
  const before = await snap(page);
  await font.selectOption("korkai");
  await page.waitForTimeout(1500);
  const d = diff(before, await snap(page));
  console.log("KORKAI_DIFF", d);
  expect(d, "Korkai visibly changes the preview").toBeGreaterThan(0.002);
  // real weights only: Korkai = 400/500/700, Kavivanar = 400
  const weight = page.getByLabel("Weight", { exact: true });
  expect(await weight.locator("option").allTextContents()).toEqual(["Regular (400)", "Medium (500)", "Bold (700)"]);
  await weight.selectOption("700");
  await font.selectOption("kavivanar");
  expect(await weight.locator("option").allTextContents()).toEqual(["Regular (400)"]);
  await expect(weight).toHaveValue("400");
  // title font is available without the candidate opt-in
  const title = page.getByLabel("Title font", { exact: true });
  const tOpts = await title.locator("option").allTextContents();
  expect(tOpts).toContain("Panai");
  expect(tOpts.some((o) => /Coiny|Vaagai/.test(o))).toBe(false);
  // pairing sets both
  await page.getByRole("group", { name: "Font pairings" }).getByRole("button", { name: "Literary manuscript" }).click();
  await expect(font).toHaveValue("korkai");
  await expect(title).toHaveValue("noto-serif");
  await title.selectOption("panai");
  await expect(page.getByRole("group", { name: "Font pairings" }).getByRole("button", { name: "Literary manuscript" })).toHaveAttribute("aria-pressed", "false");
  // categorised browser
  await page.getByText("Browse fonts by style").click();
  await expect(page.getByRole("region", { name: "Handwritten fonts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Elegant literary fonts" }).getByText("Korkai", { exact: true })).toBeVisible();
  // no candidate warning for approved fonts
  await expect(page.getByText(/NOT reviewed for Tamil: every export/)).toHaveCount(0);
  // poster export with the self-hosted fonts
  await page.getByRole("tab", { name: "Feed poster" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Poster PNG" }).click();
  const f = info.outputPath("poster.png");
  await (await dl).saveAs(f);
  expect(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", f]).toString().trim()).toMatch(/^\d{3,4}$/);
  await expect(page.getByRole("alert").filter({ hasText: /font/i })).toHaveCount(0);
  // reload -> restore -> same fonts
  await page.waitForTimeout(1500);
  await page.reload();
  const banner = page.getByRole("region", { name: "Recovered work" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("button", { name: "Restore recovered work" }).click();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  await expect(page.getByLabel("Font", { exact: true })).toHaveValue("korkai");
  await expect(page.getByLabel("Title font", { exact: true })).toHaveValue("panai");
  expect(cdn, "no Google Fonts CDN request").toEqual([]);
});

test("whole-poem image export with an approved font succeeds (no fallback, no font error)", async ({ page }, info) => {
  test.setTimeout(120_000);
  const cdn = watchCdn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.getByLabel("Font", { exact: true }).selectOption("arima");
  await page.getByLabel("Title font", { exact: true }).selectOption("oi");
  await page.getByRole("group", { name: "Composition mode" }).getByRole("button", { name: /Whole poem/ }).click();
  const panel = page.getByRole("region", { name: "Whole poem video" });
  await expect(panel).toBeVisible();
  const dl = page.waitForEvent("download");
  await panel.getByRole("button", { name: /Export as image/ }).click();
  const f = info.outputPath("whole.png");
  await (await dl).saveAs(f);
  expect(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim()).toBe("1080,1920");
  await expect(page.getByRole("alert").filter({ hasText: /font/i })).toHaveCount(0);
  expect(cdn).toEqual([]);
});

test("mobile 390: font controls fit, 44px targets, no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await expect(page.getByLabel("Weight", { exact: true })).toBeVisible();
  const chips = page.getByRole("group", { name: "Font pairings" }).getByRole("button");
  for (const b of await chips.all()) {
    const r = await b.boundingBox();
    if (r) expect(r.height).toBeGreaterThanOrEqual(43);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await checkViewport(page, 390, 844);
});
