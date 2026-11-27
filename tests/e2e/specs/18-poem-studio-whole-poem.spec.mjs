import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

// P0 Whole-Poem Video: Quick Create -> Whole-Poem Video -> the whole poem on one 9:16 screen -> MP4 of EXACTLY 30 s
// (900 frames, verified with ffprobe on the real file), mode switch, long-poem fallback, 360/390/430 px. Synthetic poems.
const URL_ = "/admin/poem-motion-studio";
const POEM =
  "மழைத் துளி மண்ணில்\nமெல்ல விழுகிறது\n\nநினைவின் வாசனை\nமீண்டும் எழுகிறது\n\nஸ்ரீ க்ஷ கௌ — கடைசி வரி, with English.";
const LONG = Array.from({ length: 14 }, (_, s) =>
  Array.from(
    { length: 6 },
    (_, l) => `கனவின் வரி ${s + 1}.${l + 1} மெல்ல ஒளிர்கிறது இன்னும் நீளமாக`,
  ).join("\n"),
).join("\n\n");

const createWhole = async (page, poem) => {
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(poem);
  await qc.getByRole("button", { name: /^Whole-Poem Video/ }).click();
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const panel = page.getByRole("region", { name: "Whole poem video" });
  await expect(panel).toBeVisible();
  return panel;
};

test("Whole-Poem Video: one screen, default 30 s, exported MP4 is exactly 30 s / 900 frames at 1080×1920", async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  const panel = await createWhole(page, POEM);
  await expect(panel.getByRole("status")).toContainText("Fits on one screen");
  await expect(panel.getByRole("status")).toContainText("30s");
  await expect(
    panel.getByRole("button", { name: "30s", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: "Composition mode" })
      .getByRole("button", { name: /Whole poem/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("0.0s / 30.0s")).toBeVisible();
  // a moving background
  await panel.getByRole("button", { name: /^Falling rain/ }).click();
  await expect(
    panel.getByRole("button", { name: /^Falling rain/ }),
  ).toHaveAttribute("aria-pressed", "true");
  // custom length validation (never silently accepted)
  await panel.getByLabel("Custom length (seconds)").fill("2");
  await panel.getByRole("button", { name: "Set length" }).click();
  await expect(panel.getByRole("alert")).toContainText("from 5 to 120 seconds");
  const btn = panel.getByRole("button", {
    name: /Export Whole-Poem MP4 \(30s\)/,
  });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const dl = page.waitForEvent("download", { timeout: 400_000 });
  await btn.click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/whole-poem-30s\.mp4$/);
  const mp = info.outputPath("whole.mp4");
  await d.saveAs(mp);
  const pr = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,nb_read_frames,r_frame_rate,duration:format=duration",
      "-of",
      "json",
      mp,
    ]).toString(),
  );
  const v = pr.streams[0];
  console.log(
    "WHOLE",
    JSON.stringify(v),
    pr.format.duration,
    fs.statSync(mp).size + "B",
  );
  expect(v.codec_name).toBe("h264");
  expect([v.width, v.height]).toEqual([1080, 1920]);
  expect(Number(v.nb_read_frames)).toBe(900);
  expect(Math.abs(Number(pr.format.duration) - 30)).toBeLessThan(0.05);
  await expect(
    page.getByText(/30\.0 s, 900 frames, all 5 lines/),
  ).toBeVisible();
});

test("Whole-Poem image export and the switch back to Scene-by-Scene keep the poem", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const panel = await createWhole(page, POEM);
  const dl = page.waitForEvent("download");
  await panel.getByRole("button", { name: /Export as image/ }).click();
  const f = info.outputPath("whole.png");
  await (await dl).saveAs(f);
  expect(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      f,
    ])
      .toString()
      .trim(),
  ).toBe("1080,1920");
  const mode = page.getByRole("group", { name: "Composition mode" });
  await mode.getByRole("button", { name: "Scene by scene" }).click();
  await expect(
    mode.getByRole("button", { name: "Scene by scene" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: "Whole poem" })).toHaveCount(0);
  await mode.getByRole("button", { name: /Whole poem/ }).click();
  await expect(
    page.getByRole("region", { name: "Whole poem video" }),
  ).toBeVisible();
});

test("long poem: never cut — explains why and offers Scene-by-Scene / Full-Poem Poster", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const panel = await createWhole(page, LONG);
  const st = panel.getByRole("status");
  await expect(st).toContainText("too long for one readable screen");
  await expect(st).toContainText("Nothing was cut");
  await expect(
    panel.getByRole("button", { name: /Export Whole-Poem MP4/ }),
  ).toBeDisabled();
  await st.getByRole("button", { name: "Use Scene-by-Scene" }).click();
  await expect(
    page
      .getByRole("group", { name: "Composition mode" })
      .getByRole("button", { name: "Scene by scene" }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const w of [360, 390, 430]) {
  test(`${w}px: Whole-Poem panel has ≥44px targets and no horizontal overflow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    const panel = await createWhole(page, POEM);
    const small = await panel
      .locator(
        "button:visible, input:visible:not([type=checkbox]):not([type=range])",
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
}
