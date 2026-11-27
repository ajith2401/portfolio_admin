// Font-size control and export correctness (2026-11 spec). Small sizes (14/16/20/23/30/32/36px) are accepted, stored
// exactly, previewed and EXPORTED at that size — measured on the real exported PNG/MP4 pixels with ffmpeg, not on UI
// text. Readability advice never blocks export. Save/reopen, undo/redo and template switching keep the exact size.
// Mobile widths are Playwright viewport emulation (not physical devices). Synthetic poems only.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { api } from "../helpers.mjs";

const URL_ = "/admin/poem-motion-studio";
const POEM =
  "மழைத் துளி மண்ணில் மெல்ல விழுகிறது\nநினைவின் வாசனை மீண்டும் எழுகிறது\nகாற்றின் இசை கேட்கிறது\n\nஸ்ரீ க்ஷ கௌ — கடைசி வரி\nஒளியின் வழியே நடக்கிறோம்";

// ---------------------------------------------------------------- pixel measurement (real exported files)
const probe = (f) => {
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
  return { w, h };
};
const gray = (f, frame = null) => {
  const { w, h } = probe(f);
  const vf =
    frame == null ? "format=gray" : `select=eq(n\\,${frame}),format=gray`;
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
  return { buf, w, h };
};
/** Text-line ink runs: rows with sharp horizontal luminance jumps (glyph edges; smooth gradients have none). Only the
 * central 80% of columns is scanned so the preview's dashed safe-zone guide (drawn near the edges) is not counted. */
function inkRuns({ buf, w, h }) {
  const rows = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9) - 2; x += 1)
      if (Math.abs(buf[y * w + x] - buf[y * w + x + 2]) > 45) n++;
    rows[y] = n >= 4;
  }
  const runs = [];
  let s = -1,
    gap = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && rows[y]) {
      if (s < 0) s = y;
      gap = 0;
    } else if (s >= 0 && ++gap > 2) {
      runs.push({ top: s, h: y - gap - s + 1 });
      s = -1;
      gap = 0;
    }
  }
  return runs.filter((r) => r.h >= 4);
}
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor(b.length / 2)] : 0;
};
/** Median drawn line-ink height in canvas px of the native 1080-wide output. */
const lineInk = (img) => {
  const runs = inkRuns(img);
  return { med: median(runs.map((r) => r.h)) * (1080 / img.w), n: runs.length };
};

// ---------------------------------------------------------------- UI helpers
const sizeInput = (page, label) =>
  page.getByLabel(`${label} in px`, { exact: true });
const setSize = async (page, label, v) => {
  const i = sizeInput(page, label);
  await i.fill(String(v));
  await i.press("Enter");
  await expect(i).toHaveValue(String(v));
};
const createScenes = async (page) => {
  await page.goto(URL_);
  await page
    .getByRole("button", { name: /Write a poem/ })
    .first()
    .click();
  await page.getByLabel("Title (optional)").fill("மழை");
  await page.getByLabel("Poem text").fill(POEM);
  await page.getByRole("button", { name: "Create scenes" }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
};
const createWhole = async (page) => {
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc.getByRole("button", { name: /^Whole-Poem Video/ }).click();
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const panel = page.getByRole("region", { name: "Whole poem video" });
  await expect(panel).toBeVisible();
  return panel;
};
const download = async (page, btn, info, name, timeout = 120_000) => {
  const dl = page.waitForEvent("download", { timeout });
  await btn.click();
  const f = info.outputPath(name);
  await (await dl).saveAs(f);
  return f;
};
const previewInk = (page, sel = "canvas[aria-label^=Preview]") =>
  page
    .locator(sel)
    .first()
    .evaluate((cv) => {
      const d = cv
        .getContext("2d")
        .getImageData(0, 0, cv.width, cv.height).data;
      const buf = new Uint8Array(cv.width * cv.height);
      for (let i = 0; i < buf.length; i++)
        buf[i] = Math.round(
          d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114,
        );
      return { buf: Array.from(buf), w: cv.width, h: cv.height };
    });

// ---------------------------------------------------------------- A. Look panel: entry, presets, advice, state
test("A: Scene-by-Scene font size — exact entry (14/16/20/23/30/32/36/40), presets, advisory text, undo/redo, template switch keeps it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createScenes(page);
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  const ctl = page.getByTestId("font-size");
  for (const v of [14, 16, 20, 23, 30, 32, 36, 40]) {
    await setSize(page, "Font size", v);
    await expect(ctl.getByText(`Font size: ${v}px`)).toBeVisible();
    await expect(page.getByTestId("readability-warning")).toHaveCount(0); // advice is not a blocking warning
  }
  await setSize(page, "Font size", 14);
  await expect(page.getByTestId("font-size-advice")).toHaveAttribute(
    "data-level",
    "tiny",
  );
  await expect(page.getByTestId("font-size-advice")).toContainText(
    "It will still export at this size",
  );
  await expect(page.getByTestId("font-size-advice")).toContainText(
    "pt on a phone screen",
  );
  // invalid input is rejected without changing the size
  for (const bad of ["0", "-5"]) {
    await sizeInput(page, "Font size").fill(bad);
    await sizeInput(page, "Font size").press("Enter");
    await expect(sizeInput(page, "Font size")).toHaveValue("14");
  }
  // presets
  await ctl.getByRole("button", { name: "30px", exact: true }).click();
  await expect(sizeInput(page, "Font size")).toHaveValue("30");
  await expect(
    ctl.getByRole("button", { name: "30px", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // undo / redo restore the exact value
  await page.waitForTimeout(1200); // separate undo steps (rapid same-control edits coalesce, like a slider drag)
  await setSize(page, "Font size", 23);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(sizeInput(page, "Font size")).toHaveValue("30");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(sizeInput(page, "Font size")).toHaveValue("23");
  // a template switch keeps a manually chosen size
  await page
    .getByRole("list", { name: "Templates" })
    .getByRole("button", { name: "Use template Golden Hour" })
    .click();
  await expect(sizeInput(page, "Font size")).toHaveValue("23");
  // Export is not blocked by a small size
  await setSize(page, "Font size", 16);
  await page.getByRole("tab", { name: "Export" }).click();
  await expect(
    page.getByRole("button", { name: /Export Reel MP4/ }),
  ).toBeEnabled({ timeout: 30_000 });
});

// ---------------------------------------------------------------- B. Feed poster PNG: size is really exported
test("B: Feed poster PNG at 14/16/24/30/32/40 — drawn line height scales with the chosen size (export measured), preview matches export", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createScenes(page);
  const out = {};
  for (const v of [14, 16, 24, 30, 32, 40]) {
    await page.getByRole("tab", { name: "Look", exact: true }).click();
    await setSize(page, "Font size", v);
    await page.getByRole("tab", { name: "Feed poster" }).click();
    const f = await download(
      page,
      page.getByRole("button", { name: "Poster PNG" }),
      info,
      `poster-${v}.png`,
    );
    out[v] = lineInk(gray(f));
  }
  console.log("POSTER_INK", JSON.stringify(out));
  const k40 = out[40].med / 40;
  for (const v of [14, 16, 24, 30, 32]) {
    expect(out[v].n, `${v}px: text present`).toBeGreaterThan(0);
    const k = out[v].med / v;
    expect(
      Math.abs(k - k40) / k40,
      `${v}px drawn at ${v}px (ink ${out[v].med.toFixed(1)}px)`,
    ).toBeLessThan(0.3);
  }
  expect(out[14].med).toBeLessThan(out[40].med * 0.55); // 14px is really smaller (not raised to 40)
});

// ---------------------------------------------------------------- C/D. Whole-Poem: preview vs export + MP4 frames
test("C: Whole-Poem image at 14/16/24/30/32/40 — preview and exported PNG agree on the drawn size", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const panel = await createWhole(page);
  const tl = page.getByRole("slider", { name: "Timeline" });
  const rows = {};
  for (const v of [14, 16, 24, 30, 32, 40]) {
    await setSize(page, "Whole poem text size", v);
    await expect(panel.getByTestId("whole-size")).toContainText(`${v}px`);
    await tl.fill(
      String(Math.round(Number(await tl.getAttribute("max")) * 0.5)),
    );
    const f = await download(
      page,
      panel.getByRole("button", { name: /Export as image/ }),
      info,
      `whole-${v}.png`,
    );
    const ex = lineInk(gray(f));
    // the preview redraws asynchronously after a size change: wait for it to settle, then compare
    let pv = { med: 0, n: 0 };
    await expect
      .poll(async () => { pv = lineInk(await previewInk(page)); return Math.abs(pv.med - ex.med) / ex.med; }, { timeout: 8000, message: `${v}px preview ≈ export (${JSON.stringify(pv)} vs ${JSON.stringify(ex)})` })
      .toBeLessThan(0.25);
    rows[v] = {
      preview: +pv.med.toFixed(1),
      export: +ex.med.toFixed(1),
      nP: pv.n,
      nE: ex.n,
    };
    expect(ex.n, `${v}px: text in export`).toBeGreaterThan(0);
  }
  console.log("WHOLE_PREVIEW_VS_EXPORT", JSON.stringify(rows));
  const k40 = rows[40].export / 40;
  for (const v of [14, 16, 24, 30, 32])
    expect(Math.abs(rows[v].export / v - k40) / k40, `${v}px`).toBeLessThan(
      0.3,
    );
});

for (const v of [14, 24, 30, 32, 40])
  test(`D: Whole-Poem MP4 at ${v}px — 1080×1920, 900 frames, first/middle/final frames drawn at ${v}px`, async ({
    page,
  }, info) => {
    test.setTimeout(480_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const panel = await createWhole(page);
    await setSize(page, "Whole poem text size", v);
    const btn = panel.getByRole("button", {
      name: /Export Whole-Poem MP4 \(30s\)/,
    });
    await expect(btn).toBeEnabled({ timeout: 30_000 });
    const mp = await download(page, btn, info, `whole-${v}.mp4`, 460_000);
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
      ].map(([k, n]) => [k, lineInk(gray(mp, n))]),
    );
    console.log(`WHOLE_MP4_${v}`, JSON.stringify(fr));
    for (const k of ["middle", "final"]) {
      expect(fr[k].n, `${k}: text present`).toBeGreaterThan(0);
      // Tamil line ink ≈ 0.8–1.5 × the font size; a 40px floor would make 14px read ≥ 32px here
      expect(
        fr[k].med / v,
        `${k} frame drawn at ${v}px (ink ${fr[k].med.toFixed(1)})`,
      ).toBeGreaterThan(0.6);
      expect(
        fr[k].med / v,
        `${k} frame drawn at ${v}px (ink ${fr[k].med.toFixed(1)})`,
      ).toBeLessThan(1.8);
    }
    expect(Math.abs(fr.middle.med - fr.final.med)).toBeLessThanOrEqual(
      Math.max(2, v * 0.1),
    ); // no size jump mid-video
  });

// ---------------------------------------------------------------- E. Full-Poem poster
test("E: Full-Poem poster at 14/16/24/30/32/40 — chosen size shown, exported, preview ≈ export", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createScenes(page);
  await page.getByRole("tab", { name: "Full poem" }).click();
  const region = page.getByRole("region", { name: "Full poem" });
  const rows = {};
  for (const v of [14, 16, 24, 30, 32, 40]) {
    await setSize(page, "Poster text size", v);
    await expect(
      region.getByText(new RegExp(`font size ${v}px`)),
    ).toBeVisible();
    await page.waitForTimeout(500);
    const pv = lineInk(
      await previewInk(
        page,
        "canvas[aria-label='Preview of the full-poem poster']",
      ),
    );
    const f = await download(
      page,
      region.getByRole("button", { name: "PNG", exact: true }),
      info,
      `full-${v}.png`,
    );
    const ex = lineInk(gray(f));
    rows[v] = { preview: +pv.med.toFixed(1), export: +ex.med.toFixed(1) };
    expect(
      Math.abs(pv.med - ex.med) / ex.med,
      `${v}px preview ≈ export`,
    ).toBeLessThan(0.25);
  }
  console.log("FULL_PREVIEW_VS_EXPORT", JSON.stringify(rows));
  const k40 = rows[40].export / 40;
  for (const v of [14, 16, 24, 30, 32])
    expect(Math.abs(rows[v].export / v - k40) / k40, `${v}px`).toBeLessThan(
      0.3,
    );
});

// ---------------------------------------------------------------- F. Scene-by-Scene Reel MP4 + per-scene size
test("F: Scene-by-Scene Reel MP4 at 16px with a per-scene size — exported, not raised to 40px", async ({
  page,
}, info) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createScenes(page);
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  await setSize(page, "Font size", 16);
  await page.getByRole("tab", { name: "Export" }).click();
  const btn = page.getByRole("button", { name: /Export Reel MP4/ });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const totalS = Number(
    (
      await page
        .getByText(/^0\.0s \/ [\d.]+s/)
        .first()
        .textContent()
    ).match(/\/ ([\d.]+)s/)[1],
  );
  const mp = await download(page, btn, info, "scenes-16.mp4", 340_000);
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
  const n = Number(pr.nb_read_frames);
  expect(Math.abs(n - Math.ceil(totalS * 30))).toBeLessThanOrEqual(1);
  // sample frames through the video; every frame with poem text shows it at ~16px, never ≥ 32px
  const meds = [];
  for (const k of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const m = lineInk(gray(mp, Math.floor(n * k)));
    if (m.n) meds.push(m.med);
  }
  console.log("SCENES_MP4_16", JSON.stringify({ n, meds }));
  expect(meds.length).toBeGreaterThan(0);
  expect(median(meds) / 16).toBeLessThan(1.8);
});

// ---------------------------------------------------------------- G. Save / reopen keeps the exact values
test("G: save to Admin and reopen keep 23px body, 18px whole and 30px full-poem sizes exactly", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await createScenes(page);
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  await setSize(page, "Font size", 23);
  await page.getByRole("tab", { name: "Full poem" }).click();
  await setSize(page, "Poster text size", 30);
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
  expect(got.style.sizePx).toBe(23);
  expect(got.style.sizeSet).toBe(true);
  expect(got.full.size).toBe(30);
  // API round trip with a whole-poem size and an edge value
  const r2 = await api(page, "POST", "/api/motion-projects", {
    name: "size-edge",
    composition: {
      ...got,
      style: { ...got.style, sizePx: 14 },
      whole: { on: true, size: 18 },
    },
  });
  const g2 = (
    await api(page, "GET", `/api/motion-projects/${r2.body.project._id}`)
  ).body.project.composition;
  expect([g2.style.sizePx, g2.whole.size]).toEqual([14, 18]);
  // reload -> device draft restore keeps the exact size in the UI
  await page.waitForTimeout(1500);
  await page.reload();
  const banner = page.getByRole("region", { name: "Recovered work" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("button", { name: "Restore recovered work" }).click();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Look", exact: true }).click();
  await expect(sizeInput(page, "Font size")).toHaveValue("23");
  await api(page, "DELETE", `/api/motion-projects/${project._id}`);
  await api(page, "DELETE", `/api/motion-projects/${r2.body.project._id}`);
});

// ---------------------------------------------------------------- H. mobile widths (viewport emulation)
for (const w of [360, 390, 412, 430])
  test(`H: ${w}px — size control usable (≥44px targets), custom 23 + preset 16 apply, no horizontal overflow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    await createScenes(page);
    await page.getByRole("tab", { name: "Look", exact: true }).click();
    const ctl = page.getByTestId("font-size");
    await ctl.scrollIntoViewIfNeeded();
    await setSize(page, "Font size", 23);
    await ctl.getByRole("button", { name: "16px", exact: true }).click();
    await expect(sizeInput(page, "Font size")).toHaveValue("16");
    const small = await ctl
      .locator("button:visible, input[type=number]:visible")
      .evaluateAll((els) =>
        els
          .map((e) => ({
            n: e.getAttribute("aria-label") || e.textContent.trim(),
            r: e.getBoundingClientRect(),
          }))
          .filter((x) => x.r.height < 44 || x.r.width < 44)
          .map(
            (x) => `${x.n} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`,
          ),
      );
    expect(small).toEqual([]);
    const ov = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(ov).toBeLessThanOrEqual(0);
  });
