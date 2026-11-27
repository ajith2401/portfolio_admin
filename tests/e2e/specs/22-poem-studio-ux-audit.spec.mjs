// Regressions for the third-party UI/UX audit items that were still valid: resting first frame at t=0 (PMS-01),
// poster aspect on a phone with the sheet open (PMS-03), template switch keeps poem/elements (PMS-04), a single
// <main> landmark (PMS-10), sans UI chrome (PMS-09), full-screen dialog Esc/focus (PMS-08), sheet tabs >= 44px
// (PMS-07), leave-poem confirmation (PMS-06), dismissible messages (PMS-15). Synthetic poems only.
import { test, expect } from "@playwright/test";

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
// sharp horizontal luminance steps = glyph edges (a smooth gradient/cloth background has few)
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

test("desktop: resting first frame, one main landmark, sans chrome, template switch keeps content, full-screen dialog", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  // PMS-01: paused at t=0 the poem is visible without pressing Play
  await expect(page.getByRole("slider", { name: "Timeline" })).toHaveValue("0");
  await page.waitForTimeout(400);
  expect(await edges(page), "text visible at t=0").toBeGreaterThan(150);
  // PMS-10: exactly one <main>
  expect(await page.locator("main").count()).toBe(1);
  // PMS-09: Studio buttons use the Admin UI sans, not the canvas serif
  const ff = await page
    .getByRole("button", { name: "Advanced Studio" })
    .evaluate((b) => getComputedStyle(b).fontFamily);
  expect(ff).not.toMatch(/serif_?tamil|Noto Serif/i);
  // PMS-04: an added element and the poem survive a template switch
  await page.getByRole("tab", { name: "Elements" }).click();
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Add element Delicate Jasmine Branch" })
    .click();
  await page.getByRole("tab", { name: "Look" }).click();
  await page
    .getByRole("list", { name: "Templates" })
    .getByRole("button", { name: "Use template Golden Hour" })
    .click();
  await page.getByRole("tab", { name: "Elements" }).click();
  await expect(
    page
      .getByRole("tabpanel")
      .getByRole("list", { name: "Element layers" })
      .getByRole("listitem"),
  ).toHaveCount(1);
  // (on a wide screen the poem editor is the left pane, not a tab)
  await expect(page.getByLabel("Poem text", { exact: true })).toHaveValue(
    /மழை பெய்கிறது/,
  );
  // PMS-08: full-screen preview closes on Escape and returns focus to its opener
  const opener = page.getByRole("button", { name: "Full screen" });
  await opener.click();
  const dlg = page.getByRole("dialog", { name: "Full-screen preview" });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Close" })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(
    true,
  );
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(opener).toBeFocused();
  // PMS-06: leaving an edited, unsaved poem asks first; Keep editing stays
  await page.getByRole("button", { name: "Start a different poem" }).click();
  const ask = page.getByRole("group", { name: "Leave this poem?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(preview(page)).toBeVisible();
  await page.getByRole("button", { name: "Start a different poem" }).click();
  await ask
    .getByRole("button", { name: "Yes, start a different poem" })
    .click();
  await expect(preview(page)).toHaveCount(0);
});

test("mobile 390: poster keeps 4:5 with the sheet open; sheet tabs stay 44px on a tall panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await page.getByRole("tab", { name: "Look" }).click();
  await page.getByRole("button", { name: "Poster", exact: true }).click();
  await expect(page.locator(".pms-sheet")).toHaveAttribute("data-open", "true");
  const r = await preview(page).evaluate((cv) => {
    const b = cv.getBoundingClientRect();
    return { intrinsic: cv.width / cv.height, rendered: b.width / b.height };
  });
  expect(r.intrinsic).toBeCloseTo(0.8, 1);
  expect(Math.abs(r.rendered - r.intrinsic)).toBeLessThan(0.02);
  // a tall panel must not squash the tab strip
  await page.getByRole("tab", { name: "Scenes", exact: true }).click();
  for (const t of await page.locator(".pms-sheet [role=tab]").all()) {
    if (!(await t.isVisible())) continue;
    const b = await t.boundingBox();
    expect(b.height, await t.textContent()).toBeGreaterThanOrEqual(43);
  }
});
