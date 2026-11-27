import { test, expect } from "@playwright/test";

// P7 UX layer: Quick Create, undo/redo, recovery banner, shortcuts, narrow-screen targets. Synthetic poems only.
const URL_ = "/admin/poem-motion-studio";
const POEM = "மழைத் துளி மண்ணில்\nமெல்ல விழுகிறது\n\nநினைவின் வாசனை\nமீண்டும் எழுகிறது";
const tab = async (page, n) => {
  const t = page.getByRole("tab", { name: n, exact: true });
  if ((n === "Poem" || n === "Scenes") && (await t.count()) === 0) return;
  await t.click();
};
const openQuick = async (page) => {
  await page.goto(URL_);
  await expect(
    page.getByRole("heading", {
      name: "How would you like to start your poem?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  return page.getByRole("region", { name: "Quick Create" });
};
const quickCreate = async (page) => {
  const qc = await openQuick(page);
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(POEM);
  await qc
    .getByRole("group", { name: "Output" })
    .getByRole("button", { name: /Feed poster/ })
    .first()
    .click();
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
};

test("Quick Create: Tamil poem → output → look → Create shows the route check before export, text unchanged", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await quickCreate(page);
  const check = page.getByRole("region", { name: "Quick Create check" });
  await expect(
    check.getByRole("heading", { name: /Ready to export: Feed poster/ }),
  ).toBeVisible();
  await expect(check.getByRole("status")).toContainText(
    /All lines fit|cannot be exported/,
    { timeout: 30_000 },
  );
  await expect(check.getByRole("status")).toContainText("All lines fit");
  await expect(
    check.getByRole("button", { name: "Export Feed poster" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await tab(page, "Poem");
  await expect(page.getByLabel("Poem text")).toHaveValue(POEM); // the UI never mutates poem text
});

test("Undo/redo: template change is one step, buttons and keyboard agree", async ({
  page,
}) => {
  await quickCreate(page);
  await page.getByRole("tab", { name: "Look" }).click();
  const golden = page
    .getByRole("list", { name: "Templates" })
    .getByRole("button", { name: "Use template Golden Hour" });
  await golden.click();
  await expect(golden).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(golden).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(golden).toHaveAttribute("aria-pressed", "true");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(golden).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(golden).toHaveAttribute("aria-pressed", "true");
});

test("Recovery: after a reload the banner offers the work; Restore needs a click and keeps every line", async ({
  page,
}) => {
  await quickCreate(page);
  await page.waitForTimeout(1500); // autosave is debounced (800 ms)
  await page.reload();
  const banner = page.getByRole("region", { name: "Recovered work" });
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Created \d+ scenes/)).toHaveCount(0); // nothing restored without a click
  await banner.getByRole("button", { name: "Restore recovered work" }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await tab(page, "Poem");
  await expect(page.getByLabel("Poem text")).toHaveValue(POEM);
});

test("Shortcuts never hijack typing; ? outside a field opens the help list", async ({
  page,
}) => {
  const qc = await openQuick(page);
  const box = qc.getByLabel("Quick Create poem");
  await box.click();
  await page.keyboard.type("வரி?");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(box).toHaveValue("வரி?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toHaveCount(0);
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Shift+?");
  const dlg = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dlg).toBeVisible();
  await expect(
    dlg.getByRole("list", { name: "Shortcut list" }).getByRole("listitem"),
  ).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

for (const w of [360, 390, 430]) {
  test(`${w}px: Quick Create and the check have ≥44px targets and no horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: 800 });
    const qc = await openQuick(page);
    const small = async (scope) =>
      scope
        .locator(
          "button:visible, input:visible:not([type=checkbox]), select:visible, textarea:visible",
        )
        .evaluateAll((els) =>
          els
            .map((e) => ({
              n:
                e.getAttribute("aria-label") ||
                e.textContent.trim().slice(0, 30),
              r: e.getBoundingClientRect(),
            }))
            .filter((x) => x.r.height < 44 || x.r.width < 44)
            .map(
              (x) =>
                `${x.n}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`,
            ),
        );
    expect(await small(qc)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    await qc.getByLabel("Quick Create poem").fill(POEM);
    await qc.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
    const check = page.getByRole("region", { name: "Quick Create check" });
    await expect(check).toBeVisible();
    expect(await small(check)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
}
