import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { checkViewport } from '../helpers.mjs';

const URL_ = '/admin/poem-motion-studio';
const SHORT = 'அன்பே சிவம்\nஅறமே துணை\n\nஇன்றே செய்\nஒன்றே குலம்';
const begin = async (page, text = SHORT) => {
  await page.goto(URL_);
  await page.getByRole('button', { name: /Write a poem/ }).first().click();
  await page.getByLabel('Title (optional)').fill('QA கவிதை');
  await page.getByLabel('Poem text').fill(text);
  await page.getByRole('button', { name: 'Create scenes' }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole('button', { name: 'Advanced Studio' }).click();
};
const nonBlank = (page, sel) => page.locator(sel).evaluate((cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; const first = [d[0], d[1], d[2]]; let diff = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - first[0]) + Math.abs(d[i + 1] - first[1]) + Math.abs(d[i + 2] - first[2]) > 40) diff++; return diff; });

test('templates: real thumbnails, keyboard peek, tap/click preview dialog with focus management, apply', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.getByRole('tab', { name: 'Look' }).click();
  const list = page.getByRole('list', { name: 'Templates' });
  await expect(list.getByRole('listitem')).toHaveCount(6);
  // every thumbnail is drawn by the real renderer (not an empty/CSS-only swatch): text pixels differ from the background
  const diffs = await list.locator('canvas').evaluateAll((cs) => cs.map((cv) => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) n++; return n; }));
  expect(diffs.every((n) => n > 5), `thumbnails with visible text: ${diffs}`).toBe(true);
  // keyboard focus reveals the enlarged still (hover/focus parity), never the only path
  await list.getByRole('button', { name: 'Use template Paper & Ink' }).focus();
  await expect(list.locator('li').nth(1).locator('canvas')).toHaveCount(2);
  // dialog: opened by a normal button, focus lands inside, Tab is trapped, Escape closes and restores focus
  const opener = list.getByRole('button', { name: 'Preview template Golden Hour' });
  await opener.click();
  const dlg = page.getByRole('dialog', { name: 'Template preview: Golden Hour' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Close' })).toBeFocused();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await expect(dlg.getByText('Typography')).toBeVisible();
  await expect(dlg.getByText(/Anek Tamil/)).toBeVisible();
  const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).include('[role=dialog]').exclude('canvas').analyze();
  expect(ax.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(opener).toBeFocused();
  // apply from the dialog
  await opener.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use this template' }).click();
  await expect(list.getByRole('button', { name: 'Use template Golden Hour' })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile 390: editing panel is a bottom sheet — collapsed by default, preview stays usable, safe area respected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  const sheet = page.locator('.pms-sheet');
  await expect(sheet).toHaveAttribute('data-open', 'false');
  await expect(page.getByRole('tabpanel')).toBeHidden();
  const box0 = await sheet.boundingBox();
  expect(box0.y + box0.height).toBeCloseTo(844, 0); // docked to the bottom
  await page.getByRole('tab', { name: 'Look' }).click();
  await expect(sheet).toHaveAttribute('data-open', 'true');
  await expect(page.getByRole('tabpanel')).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box.height).toBeLessThanOrEqual(844 * 0.63);
  // the preview can be scrolled fully above the sheet and is not squeezed to nothing
  await page.evaluate(() => { const r = document.querySelector('canvas[aria-label^=Preview]').getBoundingClientRect(); window.scrollBy(0, r.top - 8); });
  const cv = await page.locator('canvas[aria-label^=Preview]').boundingBox();
  expect(cv.height).toBeGreaterThan(200);
  expect(cv.y + cv.height).toBeLessThanOrEqual(box.y + 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // every panel can be reached from the sheet
  for (const t of ['Poem', 'Scenes', 'Background', 'Audio', 'Story', 'Full poem', 'Feed poster', 'Project', 'Export']) {
    await page.getByRole('tab', { name: t, exact: true }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    const b = await sheet.boundingBox();
    expect(b.y + b.height, `sheet bottom on ${t}`).toBeLessThanOrEqual(845);
  }
  await page.getByRole('button', { name: /Hide panel/ }).click();
  await expect(page.getByRole('tabpanel')).toBeHidden();
  // template preview dialog is a sheet that fits the phone
  await page.getByRole('tab', { name: 'Look' }).click();
  await page.getByRole('button', { name: 'Preview template Monsoon Memories' }).click();
  const d = await page.getByRole('dialog').boundingBox();
  expect(d.x).toBeGreaterThanOrEqual(0); expect(d.x + d.width).toBeLessThanOrEqual(390); expect(d.y + d.height).toBeLessThanOrEqual(844);
  await checkViewport(page, 390, 844);
});

test('mobile sheet follows the on-screen keyboard (visualViewport) and keeps the field reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await begin(page);
  await page.getByRole('tab', { name: 'Poem', exact: true }).click();
  // simulate the keyboard: shrink the visual viewport the way iOS/Android do
  await page.evaluate(() => { const v = window.visualViewport; Object.defineProperty(v, 'height', { configurable: true, get: () => 500 }); v.dispatchEvent(new Event('resize')); });
  await expect.poll(() => page.locator('.pms-sheet').evaluate((e) => getComputedStyle(e).bottom)).toBe('344px');
  const maxH = await page.locator('.pms-sheet').evaluate((e) => parseFloat(getComputedStyle(e).maxHeight));
  expect(maxH).toBeLessThanOrEqual(500 * 0.62 + 1);
});

test('desktop: 3 panes at ≥1056px content width (poem+scenes | preview | controls), 2 panes below, same panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  const left = page.getByRole('region', { name: 'Source poem and scenes' });
  await expect(left).toBeVisible();
  await expect(left.getByRole('heading', { name: 'Poem text' })).toBeVisible();
  await expect(left.getByRole('heading', { name: /Scenes \(\d+\)/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Poem', exact: true })).toHaveCount(0);
  const l = await left.boundingBox(), c = await page.locator('canvas[aria-label^=Preview]').boundingBox(), r = await page.getByRole('tabpanel').boundingBox();
  expect(l.x + l.width).toBeLessThanOrEqual(c.x + 1); expect(c.x + c.width).toBeLessThanOrEqual(r.x + 1); // no overlap
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await nonBlank(page, 'canvas[aria-label^=Preview]')).toBeGreaterThan(5);
  // narrower → tabs return and the left pane goes away
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.getByRole('tab', { name: 'Scenes', exact: true })).toBeVisible();
  await expect(left).toHaveCount(0);
  // axe on the 3-pane layout
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme').selectOption(theme);
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('canvas').analyze();
    expect(ax.violations.map((v) => `${theme}:${v.id}:${v.nodes[0]?.html?.slice(0, 80)}`)).toEqual([]);
  }
});

test('reduced motion: template preview is a still frame and says so', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.getByRole('tab', { name: 'Look' }).click();
  await page.getByRole('button', { name: 'Preview template Monsoon Memories' }).click();
  await expect(page.getByText(/Reduced motion is on/)).toBeVisible();
});

test('textures + film grain visibly change the real preview, keep the poem text, and Reduce effects removes them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await begin(page);
  await page.getByRole('tab', { name: 'Look' }).click();
  const preview = page.locator('canvas[aria-label^=Preview]').first();
  const snap = () => preview.evaluate((cv) => Array.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.filter((_, i) => i % 32 === 0)));
  const diff = (a, b) => a.reduce((n, v, i) => n + (Math.abs(v - b[i]) > 6 ? 1 : 0), 0) / a.length;
  await page.waitForTimeout(400);
  const plain = await snap();
  const swatches = page.getByRole('group', { name: 'Surface textures' });
  await expect(swatches.getByRole('button')).toHaveCount(22); // None + 21 textures (7 added: rice paper … slate)
  for (const name of ['Paper', 'Watercolour wash', 'Canvas', 'Rice paper', 'Slate']) {
    await swatches.getByRole('button', { name: `Texture: ${name}` }).click();
    await expect(swatches.getByRole('button', { name: `Texture: ${name}` })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(400);
    const d = diff(plain, await snap());
    expect(d, `${name} changes the preview (${d})`).toBeGreaterThan(0.05);
  }
  await page.getByLabel('Film grain', { exact: true }).fill('0.8');
  await page.getByLabel('Reduce effects').check();
  await page.waitForTimeout(400);
  expect(diff(plain, await snap()), 'Reduce effects restores the plain look').toBeLessThan(0.01);
});
