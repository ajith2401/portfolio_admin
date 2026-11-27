import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// P9 Export all: route checklist, labelled estimate, one bundle ZIP whose MANIFEST.json records line counts and
// complete flags, a refused route shown (stop by default; continue only on an explicit click), 44px targets. Synthetic.
const URL_ = "/admin/poem-motion-studio";
const POEM = "மழைத் துளி மண்ணில்\nமெல்ல விழுகிறது\n\nநினைவின் வாசனை\nமீண்டும் எழுகிறது";
// long enough that ONE feed poster card cannot hold it (the single-poster route must refuse, never clip)
const LONG = Array.from({ length: 6 }, (_, s) =>
  Array.from(
    { length: 6 },
    (_, l) => `கனவின் வரி ${s + 1}.${l + 1} மெல்ல ஒளிர்கிறது`,
  ).join("\n"),
).join("\n\n");

const quickCreate = async (page, poem) => {
  await page.goto(URL_);
  await page.getByRole("button", { name: /^Quick Create/ }).click();
  const qc = page.getByRole("region", { name: "Quick Create" });
  await qc.getByLabel("Title for Quick Create").fill("மழை");
  await qc.getByLabel("Quick Create poem").fill(poem);
  await qc.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced Studio" }).click();
  await page.getByRole("tab", { name: "Export", exact: true }).click();
  const box = page.getByRole("region", { name: "Export all" });
  await expect(box).toBeVisible();
  return box;
};
const choose = async (box, ids) => {
  const list = box.getByRole("list", { name: "Bundle routes" });
  for (const cb of await list.getByRole("checkbox").all()) {
    if (await cb.isDisabled()) continue;
    const label = (await cb.getAttribute("aria-label")).replace(
      /^Include /,
      "",
    );
    if (ids.includes(label) !== (await cb.isChecked())) await cb.click();
  }
};
/** store-only ZIP reader (central directory), independent of the app's own reader */
const unzip = (buf) => {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = {};
  for (let i = 0; i < n; i++) {
    const size = buf.readUInt32LE(p + 24),
      nl = buf.readUInt16LE(p + 28),
      xl = buf.readUInt16LE(p + 30),
      cl = buf.readUInt16LE(p + 32),
      off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString("utf8");
    const ln = buf.readUInt16LE(off + 26),
      lx = buf.readUInt16LE(off + 28);
    out[name] = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + size);
    p += 46 + nl + xl + cl;
  }
  return out;
};
const download = async (page, click) => {
  const d = page.waitForEvent("download", { timeout: 120_000 });
  await click();
  const dd = await d;
  const f = path.join(
    os.tmpdir(),
    `p9-${process.pid}-${dd.suggestedFilename()}`,
  );
  await dd.saveAs(f);
  return { name: dd.suggestedFilename(), files: unzip(fs.readFileSync(f)) };
};

test("Export all: choose routes, see the labelled estimate, one ZIP with MANIFEST.json (line count, complete flags)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const box = await quickCreate(page, POEM);
  await choose(box, ["Full-poem poster", "Reel cover", "Feed carousel"]);
  const est = box.getByTestId("bundle-estimate");
  await expect(est).toHaveAttribute("role", "status");
  await expect(est).toContainText(/Estimate \(not exact\): 3 routes/);
  await box.getByLabel("Output size").selectOption("draft");
  await expect(est).toContainText(/Estimate \(not exact\): 3 routes/);
  const z = await download(page, () =>
    box
      .getByRole("button", { name: "Export all selected routes as one ZIP" })
      .click(),
  );
  expect(z.name).toMatch(/-bundle\.zip$/);
  const m = JSON.parse(z.files["MANIFEST.json"].toString("utf8"));
  expect(z.files["README.txt"]).toBeTruthy();
  expect(m.poem.sourceLineCount).toBe(4);
  expect(m.preset).toBe("draft");
  // registry order, exactly the chosen routes
  expect(m.routes.map((r) => r.id)).toEqual([
    "full-poem",
    "reel-cover",
    "carousel",
  ]);
  const by = Object.fromEntries(m.routes.map((r) => [r.id, r]));
  expect(by["full-poem"]).toMatchObject({
    status: "ok",
    complete: true,
    drawnLines: 4,
  });
  expect(by.carousel).toMatchObject({ status: "ok", complete: true });
  expect(by["reel-cover"]).toMatchObject({
    status: "ok",
    complete: false,
    partial: true,
  });
  expect(by["reel-cover"].width).toBe(540);
  // every listed file is in the ZIP with the listed size, and nothing else
  const listed = m.routes.flatMap((r) => r.files);
  expect(Object.keys(z.files).sort()).toEqual(
    [...listed.map((f) => f.name), "MANIFEST.json", "README.txt"].sort(),
  );
  for (const f of listed) expect(z.files[f.name].length).toBe(f.size);
  await expect(box.getByTestId("bundle-done")).toContainText("NOT complete");
  await expect(
    box.getByRole("button", { name: "Share the exported files" }),
  ).toBeVisible();
});

test("Export all: a refused route is shown, nothing is written by default; continue is explicit and the manifest keeps the refusal", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const box = await quickCreate(page, LONG);
  await choose(box, ["Feed poster", "Feed carousel"]);
  let downloads = 0;
  page.on("download", () => downloads++);
  await box
    .getByRole("button", { name: "Export all selected routes as one ZIP" })
    .click();
  const refused = box.getByTestId("bundle-refused");
  await expect(refused).toBeVisible({ timeout: 60_000 });
  await expect(refused).toContainText(
    /Stopped: 1 route was refused, so no ZIP was written/,
  );
  await expect(refused).toContainText("Feed poster");
  expect(downloads).toBe(0);
  await expect(
    box.getByRole("button", {
      name: "Retry the bundle export (re-checks every route)",
    }),
  ).toBeVisible();
  const z = await download(page, () =>
    box.getByRole("button", { name: "Continue without failed routes" }).click(),
  );
  const m = JSON.parse(z.files["MANIFEST.json"].toString("utf8"));
  const poster = m.routes.find((r) => r.id === "poster");
  expect(poster).toMatchObject({
    status: "refused",
    complete: false,
    files: [],
  });
  expect(poster.reason.length).toBeGreaterThan(0);
  expect(m.routes.find((r) => r.id === "carousel")).toMatchObject({
    status: "ok",
    complete: true,
  });
  expect(m.poem.sourceLineCount).toBe(36);
  expect(m.complete).toBe(false);
  expect(Object.keys(z.files).some((n) => n.includes("-poster"))).toBe(false);
});

for (const w of [360, 390, 430]) {
  test(`${w}px: Export all has ≥44px targets and no horizontal overflow`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: 800 });
    const box = await quickCreate(page, POEM);
    await box.scrollIntoViewIfNeeded();
    const small = await box
      .locator(
        "button:visible, select:visible, label:has(input[type=checkbox]):visible",
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
    for (const el of await box.locator("button, select, input").all()) {
      const label =
        (await el.getAttribute("aria-label")) || (await el.textContent());
      expect(label?.trim().length, "every control is labelled").toBeGreaterThan(
        0,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(
      await box.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
}
