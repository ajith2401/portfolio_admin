// Sky & Celestial collection (sky.js), through the real UI and the real exported files: every preset changes the live
// preview and the presets look different from each other; the aurora animates while Static holds still; the Whole-Poem
// MP4 (Quick Create with a sky) is 1080×1920 / 900 frames with the sky in its first, middle and final frames; the
// Poster PNG has the sky and is byte-identical when exported twice; save/reopen and a template switch keep the sky;
// mobile widths (Playwright viewport emulation, not physical devices) have 44px targets and no overflow.
// Synthetic poems only. SKY_SHOTS=<dir> saves one preview PNG per preset for visual inspection.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { api } from "../helpers.mjs";

const URL_ = "/admin/poem-motion-studio";
const POEM =
  "இரவின் வானம் விரிகிறது\nநட்சத்திரங்கள் மின்னுகின்றன\n\nநிலவின் ஒளியில்\nஒரு கனவு நடக்கிறது";
const NIGHT = [
  "Velvet Midnight",
  "Moonlit Clouds",
  "Indigo Milky Way",
  "Violet Dream",
  "Aurora Veil",
  "Meteor Shower",
  "Lavender Twilight",
  "Silver Moonlight",
  "Cloud Cathedral",
  "Starlit Horizon",
];
const DAY = [
  "Blue Hour",
  "Clear Blue Day",
  "Cotton Cumulus",
  "Golden Hour",
  "Pastel Dawn",
];

const begin = async (page) => {
  await page.goto(URL_);
  await page
    .getByRole("button", { name: /Write a poem/ })
    .first()
    .click();
  await page.getByLabel("Title (optional)").fill("இரவு");
  await page.getByLabel("Poem text").fill(POEM);
  await page.getByRole("button", { name: "Create scenes" }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Look", exact: true }).click();
};
const preview = (page) => page.locator("canvas[aria-label^=Preview]").first();
// mean colour + bright-pixel share of a horizontal band of the preview (fractions of the height), and a coarse grid
const band = (page, y0 = 0, y1 = 0.12, x0 = 0, x1 = 1) =>
  preview(page).evaluate(
    (cv, [a, b, xa, xb]) => {
      const d = cv
        .getContext("2d")
        .getImageData(
          Math.floor(cv.width * xa),
          Math.floor(cv.height * a),
          Math.max(1, Math.floor(cv.width * (xb - xa))),
          Math.max(1, Math.floor(cv.height * (b - a))),
        ).data;
      let R = 0,
        G = 0,
        B = 0,
        n = 0,
        hi = 0;
      const grid = [];
      for (let i = 0; i < d.length; i += 4) {
        R += d[i];
        G += d[i + 1];
        B += d[i + 2];
        n++;
        if (d[i] + d[i + 1] + d[i + 2] > 600) hi++;
        if (i % (xb - xa < 1 ? 64 : 4096) === 0) grid.push(d[i], d[i + 1], d[i + 2]);
      }
      return { r: R / n, g: G / n, b: B / n, hi: hi / n, grid };
    },
    [y0, y1, x0, x1],
  );
const gridDiff = (a, b) =>
  a.grid.reduce((s, v, i) => s + (Math.abs(v - b.grid[i]) > 6 ? 1 : 0), 0) /
  a.grid.length;
const settle = (page) => page.waitForTimeout(450);
const pickSky = async (page, label) => {
  await page
    .getByRole("button", { name: `Sky: ${label}`, exact: true })
    .click();
  await settle(page);
};
const download = async (page, btn, info, name, timeout = 120_000) => {
  const dl = page.waitForEvent("download", { timeout });
  await btn.click();
  const f = info.outputPath(name);
  await (await dl).saveAs(f);
  return f;
};
// mean RGB of the top 12% of a decoded frame (video or image file), via ffmpeg
const fileTop = (f, frame = null) => {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    f,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  const vf = `${frame == null ? "" : `select=eq(n\\,${frame}),`}crop=${w}:${Math.floor(h * 0.12)}:0:0,format=rgb24`;
  const buf = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      f,
      "-vf",
      vf,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  let R = 0,
    G = 0,
    B = 0,
    hi = 0;
  const n = buf.length / 3;
  for (let i = 0; i < buf.length; i += 3) {
    R += buf[i];
    G += buf[i + 1];
    B += buf[i + 2];
    if (buf[i] + buf[i + 1] + buf[i + 2] > 600) hi++;
  }
  return { w, h, r: R / n, g: G / n, b: B / n, hi: hi / n };
};

test("A: Sky & Celestial gallery — 10 night + 5 day presets; each one changes the preview; all look different", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  const sec = page.getByTestId("sky-section");
  await sec.scrollIntoViewIfNeeded();
  await expect(
    sec
      .getByRole("group", { name: "Sky presets: Night skies" })
      .getByRole("button"),
  ).toHaveCount(NIGHT.length + 1); // + None
  await expect(
    sec
      .getByRole("group", { name: "Sky presets: Day & twilight" })
      .getByRole("button"),
  ).toHaveCount(DAY.length);
  await expect(page.getByTestId("sky-quick")).toHaveCount(0); // controls appear once a sky is chosen
  const plain = await band(page);
  const shots = process.env.SKY_SHOTS;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const seen = {},
    whole = {};
  for (const label of [...NIGHT, ...DAY]) {
    await pickSky(page, label);
    await expect(
      page.getByRole("button", { name: `Sky: ${label}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const s = await band(page);
    expect(gridDiff(plain, s), `${label} changes the preview`).toBeGreaterThan(
      0.3,
    );
    seen[label] = s;
    whole[label] = await band(page, 0, 1); // horizon, hills and sun sit low: compare whole frames
    if (shots) {
      const b64 = await preview(page).evaluate(
        (cv) => cv.toDataURL("image/png").split(",")[1],
      );
      fs.writeFileSync(
        path.join(shots, `${label.replace(/\W+/g, "-").toLowerCase()}.png`),
        Buffer.from(b64, "base64"),
      );
    }
  }
  const labels = Object.keys(seen);
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = whole[labels[i]],
        b = whole[labels[j]];
      const dist =
        Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) + 100 * gridDiff(a, b);
      expect(
        dist,
        `${labels[i]} vs ${labels[j]} look different`,
      ).toBeGreaterThan(8);
    }
  // night skies are dark with stars at the top; a clear day is bright blue
  expect(seen["Velvet Midnight"].b).toBeGreaterThan(seen["Velvet Midnight"].r);
  expect(
    seen["Velvet Midnight"].r +
      seen["Velvet Midnight"].g +
      seen["Velvet Midnight"].b,
  ).toBeLessThan(150);
  expect(seen["Clear Blue Day"].b).toBeGreaterThan(150);
  console.log(
    "SKY_TOP",
    JSON.stringify(
      Object.fromEntries(
        labels.map((l) => [
          l,
          [seen[l].r, seen[l].g, seen[l].b, seen[l].hi].map(
            (v) => Math.round(v * 1000) / 1000,
          ),
        ]),
      ),
    ),
  );
  // None removes the sky again: back to the template background exactly
  await page.getByRole("button", { name: "Sky: None", exact: true }).click();
  await settle(page);
  expect(gridDiff(plain, await band(page))).toBeLessThan(0.02);
});

test("B: aurora animates over the timeline; Static holds one frame; Reset sky returns the preset defaults", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  // the template's own drifting dust and dust specks are separate Look effects (not the sky): off, so only the sky is judged
  await page.getByLabel("Particles").selectOption("none");
  await page.getByRole("slider", { name: "Dust specks" }).fill("0");
  await pickSky(page, "Aurora Veil");
  const tl = page.getByRole("slider", { name: "Timeline" });
  const at = async (ms) => {
    await tl.fill(String(ms));
    await settle(page);
    return band(page, 0.12, 0.45, 0, 0.1); // the aurora curtain's body, left of the poem text
  };
  const a = await at(1000),
    b = await at(7000),
    a2 = await at(1000);
  expect(gridDiff(a, b), "aurora/stars move between 1s and 7s").toBeGreaterThan(
    0.05,
  );
  expect(gridDiff(a, a2), "the same time draws the same sky").toBeLessThan(
    0.01,
  );
  const outside = async (ms) => {
    await tl.fill(String(ms));
    await settle(page);
    const top = await band(page, 0, 0.1),
      low = await band(page, 0.72, 1);
    return { grid: [...top.grid, ...low.grid] };
  };
  const o1 = await outside(1000),
    o2 = await outside(7000);
  expect(gridDiff(o1, o2), "Cinematic: the sky outside the text moves").toBeGreaterThan(0.005);
  const quick = page.getByTestId("sky-quick");
  await quick
    .getByRole("group", { name: "Sky Sky motion" })
    .getByRole("button", { name: "Static" })
    .click();
  // Static is judged on the sky outside the text safe area (top 10%, bottom 28%): inside it, each scene's own text and
  // readability shade change by design. The same regions were shown to move above (Cinematic) before Static.
  const s1 = await outside(1000),
    s2 = await outside(7000);
  expect(gridDiff(s1, s2), "Static: nothing moves").toBe(0);
  // advanced controls are folded away; Reset sky goes back to the preset's own choices
  const adv = page.getByTestId("sky-advanced");
  await expect(adv).not.toHaveAttribute("open", "");
  await adv.locator("summary").click();
  await adv.getByRole("button", { name: "Reset sky" }).click();
  await expect(
    quick
      .getByRole("group", { name: "Sky Sky motion" })
      .getByRole("button", { name: "Cinematic" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("C: Poster PNG has the sky and is byte-identical when exported twice (deterministic still frame)", async ({
  page,
}, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await pickSky(page, "Indigo Milky Way");
  await page.getByRole("tab", { name: "Feed poster" }).click();
  const btn = page.getByRole("button", { name: "Poster PNG" });
  const f1 = await download(page, btn, info, "sky-poster-1.png");
  const f2 = await download(page, btn, info, "sky-poster-2.png");
  const h = (f) =>
    crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  expect(h(f1)).toBe(h(f2));
  const top = fileTop(f1);
  console.log("SKY_POSTER", JSON.stringify(top));
  // Deep Cosmic Blue zenith (#050C20) with stars, not the template's grey #111214
  expect(top.b).toBeGreaterThan(top.r + 6);
  expect(top.hi).toBeGreaterThan(0);
});

test("D: Quick Create Whole-Poem Video with a sky → MP4 1080×1920, 900 frames, sky in first/middle/final frames (export timed)", async ({
  page,
}, info) => {
  test.setTimeout(560_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("இரவு");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc.getByRole("button", { name: /^Whole-Poem Video/ }).click();
  await qc.getByLabel("Sky preset").selectOption({ label: "Meteor Shower" });
  await expect(qc.getByTestId("qc-sky-quick")).toBeVisible();
  await qc.getByLabel("Quick Create sky motion").selectOption("cinematic");
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const panel = page.getByRole("region", { name: "Whole poem video" });
  const btn = panel.getByRole("button", {
    name: /Export Whole-Poem MP4 \(30s\)/,
  });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now();
  const mp = await download(page, btn, info, "sky-whole.mp4", 540_000);
  const secs = (Date.now() - t0) / 1000;
  const pr = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames",
      "-of",
      "json",
      mp,
    ]).toString(),
  ).streams[0];
  expect([pr.width, pr.height]).toEqual([1080, 1920]);
  expect(Number(pr.nb_read_frames)).toBe(900);
  const fr = Object.fromEntries(
    [
      ["first", 0],
      ["middle", 450],
      ["final", 899],
    ].map(([k, n]) => [k, fileTop(mp, n)]),
  );
  console.log(
    "SKY_MP4",
    JSON.stringify({
      exportSeconds: Math.round(secs * 10) / 10,
      bytes: fs.statSync(mp).size,
      fr,
    }),
  );
  for (const k of ["first", "middle", "final"]) {
    expect(fr[k].b, `${k}: blue night sky at the top`).toBeGreaterThan(
      fr[k].r + 6,
    );
    expect(fr[k].r + fr[k].g + fr[k].b, `${k}: dark`).toBeLessThan(200);
  }
});

test("E: save to Admin + reopen and a template switch keep the sky settings exactly", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await pickSky(page, "Moonlit Clouds");
  await page
    .getByTestId("sky-quick")
    .getByRole("group", { name: "Sky Clouds" })
    .getByRole("button", { name: "Soft" })
    .click();
  await page
    .getByRole("list", { name: "Templates" })
    .getByRole("button", { name: "Use template Golden Hour" })
    .click();
  await settle(page);
  await expect(
    page.getByRole("button", { name: "Sky: Moonlit Clouds", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Project" }).click();
  await page.getByRole("button", { name: "Save project to Admin" }).click();
  const posted = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/motion-projects") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save project to Admin" })
    .click();
  const res = await posted;
  expect(res.status()).toBe(201);
  const { project } = await res.json();
  const got = (await api(page, "GET", `/api/motion-projects/${project._id}`))
    .body.project.composition;
  expect(got.material.sky).toEqual({ id: "moonlit-clouds", clouds: "soft" });
  // API round trip with advanced values (clamped server-side by the same normalizer)
  const r2 = await api(page, "POST", "/api/motion-projects", {
    name: "sky-edge",
    composition: {
      ...got,
      material: {
        ...got.material,
        sky: {
          id: "aurora-veil",
          aurora: 7,
          auroraColor: "violet",
          motion: "static",
          junk: 1,
        },
      },
    },
  });
  const g2 = (
    await api(page, "GET", `/api/motion-projects/${r2.body.project._id}`)
  ).body.project.composition;
  expect(g2.material.sky).toEqual({
    id: "aurora-veil",
    motion: "static",
    aurora: 1,
    auroraColor: "violet",
  });
  await page.waitForTimeout(1500);
  await page.reload();
  const banner = page.getByRole("region", { name: "Recovered work" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("button", { name: "Restore recovered work" }).click();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sky: Moonlit Clouds", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await api(page, "DELETE", `/api/motion-projects/${project._id}`);
  await api(page, "DELETE", `/api/motion-projects/${r2.body.project._id}`);
});

for (const w of [360, 390, 430])
  test(`F: ${w}px — sky cards and controls usable (≥44px targets), apply + reset, no horizontal overflow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    await begin(page);
    const sec = page.getByTestId("sky-section");
    await sec.scrollIntoViewIfNeeded();
    await pickSky(page, "Velvet Midnight");
    await page.getByTestId("sky-advanced").locator("summary").click();
    const small = await sec
      .locator("button:visible, select:visible, summary:visible")
      .evaluateAll((els) =>
        els
          .map((e) => ({
            n: e.getAttribute("aria-label") || e.textContent.trim(),
            r: e.getBoundingClientRect(),
          }))
          .filter((x) => x.r.height < 44 || (x.r.width < 44 && x.r.width > 0))
          .map(
            (x) => `${x.n} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`,
          ),
      );
    expect(small).toEqual([]);
    await page.getByRole("button", { name: "Reset sky" }).click();
    await expect(
      page.getByRole("button", { name: "Sky: Velvet Midnight", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const ov = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(ov).toBeLessThanOrEqual(0);
  });
