// Admin is configured with an unreachable PORTFOLIO_REVALIDATE_URL: publishing must still succeed and the author must be warned.
import { test, expect } from "@playwright/test";
import { editor } from "../helpers.mjs";

test("publish succeeds and warns when the public site cannot be told to refresh", async ({
  page,
}) => {
  await page.goto("/admin/writings/new");
  await page.locator("#w-title").fill("சோதனை கவிதை");
  await page.locator("#w-cat").selectOption("poem");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.type("ஒரு வரி");
  await page.waitForURL(/\/admin\/writings\/[0-9a-f]{24}$/, { timeout: 20000 });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("published", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const id = page.url().split("/").pop();
  const g = await page.evaluate(
    async (i) => (await fetch("/api/writings/" + i)).json(),
    id,
  );
  expect(g.status).toBe("published");
  await expect(
    page.getByText(/public site could not be reached/i).first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/revalidate-failure.png" });
});

test("a Book save also succeeds, with a warning, when the public site is unreachable", async ({ page }) => {
  await page.goto("/admin/writings");
  const { api } = await import("../helpers.mjs");
  const run = Date.now().toString(36);
  const slug = "zz-offline-" + run;
  const c = await api(page, "POST", "/api/books", { title: "ZZ offline " + run, slug, description: "d", publishYear: 2024 });
  expect(c.status).toBe(201);
  // Negative control: the sitemap is ISR (1h). Prime it, publish while the refresh endpoint is dead -> it stays stale.
  const PUB = process.env.E2E_PUBLIC;
  const inSitemap = async () => (await (await fetch(PUB + "/sitemap.xml")).text()).includes(slug);
  expect(await inSitemap()).toBe(false);
  const u = await api(page, "PUT", "/api/books/" + c.body.book._id, { status: "published" });
  expect(u.status).toBe(200);
  expect(u.body.book.status).toBe("published");
  expect(u.body.revalidate.status, JSON.stringify(u.body.revalidate)).toBe("failed");
  expect(u.body.revalidate.warning).toMatch(/could not be reached/i);
  expect(await inSitemap()).toBe(false); // still cached: proves spec 08 passes because of revalidation, not because nothing was cached
});
