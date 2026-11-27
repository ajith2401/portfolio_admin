// Ink Reveal / Typewriter writing (lib/motion-studio/writing.js) in the real browser with real Tamil fonts:
// the style picker (Write by Hand disabled, never advertised), Ink Reveal on Whole-Poem with timeline scrub and
// "Show completed poem", an exported Whole-Poem MP4 of exactly 900 frames whose first / early / middle / near-end /
// final frames are checked (nothing at 0, the completed poem from the end of writing to the last frame), the "too
// long" estimate that recommends a duration instead of squeezing, saved settings surviving the server round-trip,
// and the controls at 360-430 px. Synthetic poems only.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { api } from "../helpers.mjs";

const URL_ = "/admin/poem-motion-studio";
const POEM = "தமிழ் மொழி இனிது\nஅன்பின் ஆழம்\n\nஸ்ரீ க்ஷேத்திரம்\nHello தமிழகம் — 2026";

const createWhole = async (page) => {
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("கவிதை");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc.getByRole("button", { name: /^Whole-Poem Video/ }).click();
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
};
const openLook = async (page) => {
  await page.getByRole("tab", { name: "Look" }).click();
  const wp = page.getByTestId("writing-panel");
  await expect(wp).toBeVisible();
  return wp;
};
const preview = (page) => page.locator("canvas[aria-label^=Preview]").first();
const edges = (page) =>
  preview(page).evaluate((cv) => {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const L = (i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    let n = 0;
    for (let y = 0; y < cv.height; y += 2)
      for (let x = 0; x < cv.width - 2; x += 2) {
        const i = (y * cv.width + x) * 4;
        if (Math.abs(L(i) - L(i + 8)) > 60) n++;
      }
    return n;
  });
// glyph-edge count of decoded frame n of an MP4 (grey, 270x480)
const frameEdges = (mp, n) => {
  const W = 270,
    H = 480;
  const buf = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      mp,
      "-vf",
      `select=eq(n\\,${n}),scale=${W}:${H},format=gray`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: 1 << 24 },
  );
  let e = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W - 2; x++)
      if (Math.abs(buf[y * W + x] - buf[y * W + x + 2]) > 50) e++;
  return e;
};

test("Whole-Poem Ink Reveal: picker, scrub, completed poem, 900-frame MP4 with correct first/early/middle/end frames, save round-trip", async ({
  page,
}, info) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createWhole(page);
  const wp = await openLook(page);
  // Write by Hand is listed but disabled; Ink Reveal is the production option
  await expect(
    wp.getByRole("button", { name: /^Write by Hand/ }),
  ).toBeDisabled();
  await expect(wp.getByRole("note").first()).toContainText(/pen|stroke/i);
  await expect(
    wp.getByRole("button", { name: /^Line by Line/ }),
  ).toBeDisabled(); // Scene-by-Scene only
  await page.waitForTimeout(500);
  const staticEdges = await edges(page);
  expect(staticEdges, "static poem visible").toBeGreaterThan(150);

  await wp.getByRole("button", { name: /^Ink Reveal/ }).click();
  await expect(wp.getByRole("button", { name: /^Ink Reveal/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(wp.getByTestId("writing-controls")).toBeVisible();
  await expect(wp.getByTestId("writing-estimate")).toContainText(
    /Writing takes about .* stays on screen/,
  );
  await wp.getByRole("button", { name: /Deep blue/ }).click();
  await expect(wp.getByRole("button", { name: /Deep blue/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // dark ink on this dark design: warned, then back to the design's own text colour for the legibility checks
  await expect(wp.getByText(/may be hard to read/)).toBeVisible();
  await wp.getByRole("button", { name: /Text colour/ }).click();

  // t = 0: nothing written yet (start delay); scrub to the middle of writing: partial; completed poem button: full
  const tl = page.getByRole("slider", { name: "Timeline" });
  await tl.fill("0");
  await page.waitForTimeout(300);
  const e0 = await edges(page);
  await tl.fill("1500");
  await page.waitForTimeout(300);
  const eMid = await edges(page);
  await page
    .getByRole("button", { name: "Show completed poem" })
    .first()
    .click();
  await page.waitForTimeout(300);
  const eEnd = await edges(page);
  console.log("PREVIEW EDGES", { staticEdges, e0, eMid, eEnd });
  expect(e0).toBeLessThan(eEnd * 0.25);
  expect(eMid).toBeGreaterThan(e0);
  expect(eMid).toBeLessThan(eEnd);
  expect(eEnd, "completed poem as legible as the static one").toBeGreaterThan(
    staticEdges * 0.8,
  );

  // export: exactly 900 frames; frame 0 empty, early partial, middle..final complete and stable
  await page
    .getByRole("tab", { name: "Whole poem" })
    .click()
    .catch(() => {});
  const panel = page.getByRole("region", { name: "Whole poem video" });
  const btn = panel.getByRole("button", {
    name: /Export Whole-Poem MP4 \(30s\)/,
  });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const dl = page.waitForEvent("download", { timeout: 400_000 });
  await btn.click();
  const mp = info.outputPath("writing.mp4");
  await (await dl).saveAs(mp);
  const pr = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,nb_read_frames:format=duration",
      "-of",
      "json",
      mp,
    ]).toString(),
  );
  const v = pr.streams[0];
  expect([v.width, v.height]).toEqual([1080, 1920]);
  expect(Number(v.nb_read_frames)).toBe(900);
  const fe = Object.fromEntries(
    [0, 45, 450, 850, 899].map((n) => [n, frameEdges(mp, n)]),
  );
  console.log("FRAME EDGES", JSON.stringify(fe));
  expect(fe[0]).toBeLessThan(fe[899] * 0.25);
  expect(fe[45]).toBeLessThan(fe[899]);
  expect(Math.abs(fe[450] - fe[899])).toBeLessThan(fe[899] * 0.1);
  expect(Math.abs(fe[850] - fe[899])).toBeLessThan(fe[899] * 0.1);

  // saved writing settings survive the server's normaliser (save / reopen)
  const r = await api(page, "POST", "/api/motion-projects", {
    name: "writing round-trip",
    composition: { scenes: [{ lines: ["தமிழ்"], noWrite: true }], motion: { writing: { mode: "ink", ink: "blue", speed: 1.6 } } },
  });
  expect(r.status).toBeLessThan(300);
  const got = (await api(page, "GET", `/api/motion-projects/${r.body.project._id}`)).body.project.composition;
  expect(got.motion.writing).toMatchObject({ mode: "ink", ink: "blue", speed: 1.6 });
  expect(got.scenes[0].noWrite).toBe(true);
  await api(page, "DELETE", `/api/motion-projects/${r.body.project._id}`);
});

test("too slow for the video: estimate + recommended duration, never squeezed; Typewriter and Static switch back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createWhole(page);
  const wp = await openLook(page);
  await wp.getByRole("button", { name: /^Ink Reveal/ }).click();
  // slowest speed + longest hold on the shortest video
  const panel = page.getByRole("region", { name: "Whole poem video" });
  await page
    .getByRole("tab", { name: "Whole poem" })
    .click()
    .catch(() => {});
  await panel.getByRole("button", { name: "10s", exact: true }).click();
  await page.getByRole("tab", { name: "Look" }).click();
  await wp.getByText("Advanced writing controls").click();
  await wp.getByRole("slider", { name: "Exact speed" }).fill("0.25");
  await wp.getByRole("slider", { name: "Final hold" }).fill("10");
  const est = wp.getByTestId("writing-estimate");
  await expect(est).toContainText(/needs about .* but the video is 10 s/);
  await expect(est).toContainText("Nothing is sped up");
  const rec = est.getByRole("button", { name: /Use \d+ s \(recommended\)/ });
  await rec.click();
  await expect(est).toContainText(/Writing takes about/);
  await wp.getByRole("button", { name: /^Typewriter/ }).click();
  await expect(wp.getByRole("button", { name: /^Typewriter/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await wp.getByRole("button", { name: /^Static/ }).click();
  await expect(wp.getByTestId("writing-controls")).toHaveCount(0);
});

test("Scene-by-Scene Ink Reveal: per-scene estimate, Reel MP4 exports through the fit gate, last frame shows the written scene", async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL_);
  await page.getByRole("button", { name: /Write a poem/ }).first().click();
  await page.getByLabel("Title (optional)").fill("கவிதை");
  await page.getByLabel("Poem text").fill(POEM);
  await page.getByRole("button", { name: "Create scenes" }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  const wp = await openLook(page);
  await expect(wp.getByRole("button", { name: /^Line by Line/ })).toBeEnabled();
  await wp.getByRole("button", { name: /^Ink Reveal/ }).click();
  const est = wp.getByTestId("writing-estimate");
  await expect(est).toBeVisible();
  if (await est.getByRole("button", { name: "Lengthen scenes to fit" }).count())
    await est.getByRole("button", { name: "Lengthen scenes to fit" }).click();
  await expect(est).toContainText("Every scene finishes writing");
  const totalS = Number((await page.getByText(/^0\.0s \/ [\d.]+s/).first().textContent()).match(/\/ ([\d.]+)s/)[1]);
  await page.getByRole("tab", { name: "Export" }).click();
  const btn = page.getByRole("button", { name: /Export Reel MP4/ });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const dl = page.waitForEvent("download", { timeout: 280_000 });
  await btn.click();
  const mp = info.outputPath("scenes.mp4");
  await (await dl).saveAs(mp);
  const pr = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", mp]).toString(),
  );
  const n = Number(pr.streams[0].nb_read_frames);
  expect(Math.abs(n - Math.ceil(totalS * 30))).toBeLessThanOrEqual(1);
  const first = frameEdges(mp, 0), last = frameEdges(mp, n - 1);
  console.log("SCENE FRAMES", { totalS, n, first, last });
  expect(last).toBeGreaterThan(first * 2);
});

for (const w of [360, 375, 390, 412, 430])
  test(`${w}px: text animation style + writing controls ≥44px, no horizontal overflow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    await createWhole(page);
    const wp = await openLook(page);
    await wp.getByRole("button", { name: /^Ink Reveal/ }).click();
    await expect(wp.getByTestId("writing-controls")).toBeVisible();
    const small = await wp
      .locator(
        "button:visible, input:visible:not([type=checkbox]):not([type=range]):not([type=color]), summary:visible",
      )
      .evaluateAll((els) =>
        els
          .map((e) => ({
            n:
              e.getAttribute("aria-label") || e.textContent.trim().slice(0, 30),
            r: e.getBoundingClientRect(),
          }))
          .filter((x) => x.r.height < 44 || x.r.width < 44)
          .map(
            (x) => `${x.n}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`,
          ),
      );
    expect(small).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
