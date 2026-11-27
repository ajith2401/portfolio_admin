// Visual Elements Library: add from the library, the real preview changes, inspector controls (sliders, presets,
// tint, lock), drag on the canvas, undo/redo, Quick Create decoration preset, export includes the art, mobile 390.
// Synthetic poems only.
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
  a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 10 ? 1 : 0), 0) / a.length;
// share of strongly red pixels (the test tints the element pure red)
const redShare = (page, sel) =>
  page
    .locator(sel)
    .first()
    .evaluate((cv) => {
      const d = cv
        .getContext("2d")
        .getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16)
        if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++;
      return n / (d.length / 16);
    });

test("library → add → preview changes; inspector, tint, lock, drag, undo/redo; poster export includes the art", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.getByRole("tab", { name: "Elements" }).click();
  const panel = page.getByRole("tabpanel");
  // library: search, category chips (non-empty only), cards
  const lib = panel.getByRole("list", { name: "Element library" });
  expect(await lib.getByRole("listitem").count()).toBeGreaterThan(50);
  await panel.getByLabel("Search elements").fill("moon");
  await expect(
    lib.getByRole("button", { name: /Add element .*Moon/i }).first(),
  ).toBeVisible();
  await panel.getByLabel("Search elements").fill("zzzz-nothing");
  await expect(panel.getByText(/No elements match/)).toBeVisible();
  await panel.getByLabel("Search elements").fill("");
  await panel
    .getByRole("group", { name: "Element categories" })
    .getByRole("button", { name: "Botanical" })
    .click();
  const n = await lib.getByRole("listitem").count();
  expect(n).toBeGreaterThan(2);
  expect(n).toBeLessThan(20);
  await page.waitForTimeout(300);
  const before = await snap(page);
  await lib
    .getByRole("button", { name: "Add element Delicate Jasmine Branch" })
    .click();
  await expect(
    panel.getByRole("region", { name: "Selected element" }),
  ).toBeVisible();
  // make it big, centred, opaque, still and red so it is unmistakable in pixels
  await panel.getByLabel("Element animation").selectOption("none");
  await panel.getByRole("button", { name: "Position: Centre" }).click();
  await panel.getByLabel("Size", { exact: true }).fill("0.9");
  await panel.getByLabel("Opacity", { exact: true }).fill("1");
  await panel.getByLabel("Tint").fill("#ff0000");
  await page.waitForTimeout(500);
  expect(
    diff(before, await snap(page)),
    "element visibly changes the preview",
  ).toBeGreaterThan(0.02);
  expect(await redShare(page, "canvas[aria-label^=Preview]")).toBeGreaterThan(
    0.002,
  );
  // -/+ step buttons are the non-drag alternative
  const rot = panel.getByLabel("Rotation", { exact: true });
  await panel.getByRole("button", { name: "Increase Rotation" }).click();
  await expect(rot).toHaveValue("1");
  // drag on the canvas moves the selected element
  const h0 = await panel.getByLabel("Horizontal", { exact: true }).inputValue();
  const box = await preview(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const h1 = await panel.getByLabel("Horizontal", { exact: true }).inputValue();
  expect(Number(h1)).toBeGreaterThan(Number(h0) + 0.05);
  // undo restores the previous position; redo re-applies
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.getByLabel("Horizontal", { exact: true })).toHaveValue(h0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(panel.getByLabel("Horizontal", { exact: true })).toHaveValue(h1);
  // lock: controls hidden, drag does nothing
  await panel.getByRole("button", { name: "Lock" }).click();
  await expect(panel.getByText(/Locked: unlock to move/)).toBeVisible();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await panel.getByRole("button", { name: "Unlock" }).click();
  await expect(panel.getByLabel("Horizontal", { exact: true })).toHaveValue(h1);
  // duplicate → two layers; delete one
  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    panel.getByRole("list", { name: "Element layers" }).getByRole("listitem"),
  ).toHaveCount(2);
  await panel.getByRole("button", { name: "Delete" }).click();
  await expect(
    panel.getByRole("list", { name: "Element layers" }).getByRole("listitem"),
  ).toHaveCount(1);
  // poster export contains the red element
  await page.getByRole("tab", { name: "Feed poster" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Poster PNG" }).click();
  const f = info.outputPath("poster.png");
  await (await dl).saveAs(f);
  const b64 = fs.readFileSync(f).toString("base64");
  const red = await page.evaluate(async (b) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 16)
      if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++;
    return n / (d.length / 16);
  }, b64);
  expect(red, "exported poster includes the element").toBeGreaterThan(0.002);
});

test("decoration presets: Quick Create applies one; Elements panel switches and None clears", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc.getByLabel("Decoration").selectOption("botanical");
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("tab", { name: "Elements" }).click();
  const layers = page
    .getByRole("tabpanel")
    .getByRole("list", { name: "Element layers" });
  expect(await layers.getByRole("listitem").count()).toBeGreaterThan(0);
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Celestial", exact: true })
    .first()
    .click();
  await expect(layers).toContainText(/Moon|Star/i);
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "None", exact: true })
    .click();
  await expect(page.getByText(/No elements yet/)).toBeVisible();
});

test("mobile 390: Elements panel in the sheet, 44px targets, no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await page.getByRole("tab", { name: "Elements" }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Add element Delicate Jasmine Branch" })
    .click();
  await expect(
    panel.getByRole("region", { name: "Selected element" }),
  ).toBeVisible();
  for (const b of await panel.getByRole("button").all()) {
    if (!(await b.isVisible())) continue;
    const r = await b.boundingBox();
    if (r && r.y < 844 && r.y > 0)
      expect(r.height, await b.textContent()).toBeGreaterThanOrEqual(43);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await checkViewport(page, 390, 844);
});
