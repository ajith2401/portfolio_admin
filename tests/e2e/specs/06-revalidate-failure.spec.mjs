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
