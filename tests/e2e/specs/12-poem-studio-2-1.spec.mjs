import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api, checkViewport } from '../helpers.mjs';

const URL_ = '/admin/poem-motion-studio';
const SHORT = 'அன்பே சிவம்\nஅறமே துணை\n\nஇன்றே செய்\nஒன்றே குலம்';
const long = (stanzas, n) => Array.from({ length: stanzas }, (_, s) => Array.from({ length: n }, (_, l) => `வரி ${s + 1}.${l + 1} தமிழ் கவிதை வரி`).join('\n')).join('\n\n');
// ≥1280px advanced mode is 3-pane: Poem and Scenes live in the always-visible left pane instead of tabs.
const tab = async (page, n) => { const t = page.getByRole('tab', { name: n, exact: true }); if ((n === 'Poem' || n === 'Scenes') && (await t.count()) === 0) return; await t.click(); };
const route = (page, n) => page.getByRole('button', { name: n }).first().click();
const begin = async (page, text, title = 'என் கவிதை', via = 'Write a poem') => {
  await page.goto(URL_);
  await expect(page.getByRole('heading', { name: 'How would you like to start your poem?' })).toBeVisible();
  await route(page, via);
  await page.getByLabel('Title (optional)').fill(title);
  await page.getByLabel('Poem text').fill(text);
  await page.getByRole('button', { name: 'Create scenes' }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
};
const dl = async (page, click) => { const d = page.waitForEvent('download'); await click(); const dd = await d; const f = path.join(os.tmpdir(), `${Date.now()}-${dd.suggestedFilename()}`); await dd.saveAs(f); return { f, name: dd.suggestedFilename() }; };
const pngSize = (f) => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), sig: b.subarray(1, 4).toString() }; };

test('A/B: start screen offers five routes and none needs a Writing record', async ({ page }) => {
  await page.goto(URL_);
  for (const n of ['Write a poem', 'Paste a poem', 'Import a file', 'Portfolio poem', 'Continue']) await expect(page.getByRole('button', { name: new RegExp(n) }).first()).toBeVisible();
  await route(page, 'Paste a poem');
  await expect(page.getByRole('button', { name: 'Paste from clipboard' })).toBeVisible();
});

test('A: write from scratch keeps every line and stanza; no network writes to the DB', async ({ page }) => {
  const writes = [];
  page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`); });
  await begin(page, SHORT);
  await expect(page.getByText('Saved on this device only')).toBeVisible({ timeout: 10_000 });
  expect(writes).toEqual([]); // workflow G: device-only storage makes no DB writes
});

test('B: pasted CRLF text from Notes keeps stanza breaks', async ({ page }) => {
  await begin(page, SHORT.replace(/\n/g, '\r\n'), 'குறிப்பு', 'Paste a poem');
  await page.getByRole('button', { name: 'Advanced Studio' }).click();
  await tab(page, 'Poem');
  await expect(page.getByLabel('Poem text')).toHaveValue(SHORT);
});

test('D: .md import is text-preserving', async ({ page }) => {
  await page.goto(URL_);
  await route(page, 'Import a file');
  const f = path.join(os.tmpdir(), 'கவிதை.md'); fs.writeFileSync(f, '# தலைப்பு\n\n**அன்பே** சிவம்\nஅறமே துணை\n\nஇன்றே செய்\n');
  await page.locator('input[type=file]').setInputFiles(f);
  await expect(page.getByLabel('Poem text')).toHaveValue('அன்பே சிவம்\nஅறமே துணை\n\nஇன்றே செய்');
  await expect(page.getByLabel('Title (optional)')).toHaveValue('தலைப்பு');
  const bad = path.join(os.tmpdir(), 'x.exe'); fs.writeFileSync(bad, 'MZ');
  await page.locator('input[type=file]').setInputFiles(bad);
  await expect(page.getByRole('alert').first()).toContainText('.txt or .md');
});

test('E: short poem → ONE 1080×1920 PNG containing every line; high-res 2×', async ({ page }) => {
  test.setTimeout(120_000);
  await begin(page, SHORT);
  await tab(page, 'Full poem');
  await expect(page.getByText(/All 4 lines are on the poster/)).toBeVisible();
  await expect(page.getByText(/font size \d+px/)).toBeVisible();
  const a = await dl(page, () => page.getByRole('button', { name: 'PNG', exact: true }).click());
  expect(pngSize(a.f)).toMatchObject({ w: 1080, h: 1920, sig: 'PNG' });
  const b = await dl(page, () => page.getByRole('button', { name: /High-res PNG/ }).click());
  expect(pngSize(b.f)).toMatchObject({ w: 2160, h: 3840 });
  for (const p of ['Elegant', 'Compact', 'Expressive']) { await page.getByRole('button', { name: p }).click(); await expect(page.getByText(/All 4 lines/)).toBeVisible(); }
});

test('F: long poem is never silently cut — warning, author chooses extended single image', async ({ page }) => {
  test.setTimeout(120_000);
  const text = long(9, 6); // 54 lines
  await begin(page, text, 'நீண்ட கவிதை');
  await tab(page, 'Full poem');
  const alert = page.getByRole('alert').filter({ hasText: 'too long' });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('button', { name: 'PNG', exact: true })).toBeDisabled(); // no export while it would be cut
  await alert.getByRole('button', { name: /One taller image/ }).click();
  await expect(page.getByText(/All 54 lines are on the poster/)).toBeVisible();
  const d = await dl(page, () => page.getByRole('button', { name: 'PNG', exact: true }).click());
  const sz = pngSize(d.f);
  expect(sz.w).toBe(1080); expect(sz.h).toBeGreaterThan(1920);
});

test('61+ scenes: nothing truncated (regression for Scenes (60))', async ({ page }) => {
  await begin(page, long(70, 5), 'மிகநீளம்');
  await page.getByRole('button', { name: 'Advanced Studio' }).click();
  await tab(page, 'Scenes');
  await expect(page.getByText(/not in any scene/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Scenes \((\d+)\)/ })).toBeVisible();
  const n = Number((await page.getByRole('heading', { name: /Scenes \((\d+)\)/ }).textContent()).match(/\((\d+)\)/)[1]);
  expect(n).toBeGreaterThan(60);
});

test('Reel cover and Feed poster still export', async ({ page }) => {
  test.setTimeout(120_000);
  await begin(page, SHORT);
  await tab(page, 'Export');
  const c = await dl(page, () => page.getByRole('button', { name: 'Reel cover PNG' }).click());
  expect(pngSize(c.f)).toMatchObject({ w: 1080, h: 1920 });
  const p = await dl(page, () => page.getByRole('button', { name: 'Export Feed poster PNG' }).click());
  expect(pngSize(p.f)).toMatchObject({ w: 1080, h: 1350 });
});

test('G/H: device recovery is listed/clearable; cloud save needs the explicit disclosure and creates a snapshot project, never a Writing', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(URL_);
  const writings0 = (await api(page, 'GET', '/api/writings?limit=500')).body;
  const count = (w) => (w.writings || w).length;
  await begin(page, SHORT, 'மேகம்');
  await expect(page.getByText('Saved on this device only')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start a different poem' }).click();
  await route(page, 'Continue');
  await expect(page.getByRole('heading', { name: 'Saved on this device' })).toBeVisible();
  await expect(page.getByText(/மேகம்/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await expect(page.getByText('Restored from this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Advanced Studio' }).click();
  await tab(page, 'Project');
  await page.getByRole('button', { name: 'Save project to Admin' }).click();
  await expect(page.getByText('does not create or publish a Portfolio Writing record')).toBeVisible();
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/motion-projects') && r.request().method() === 'POST');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save project to Admin' }).click();
  const res = await posted; expect(res.status()).toBe(201);
  const { project } = await res.json();
  expect(project.sourceKind).toBe('manual'); expect(project.sourceWritingId ?? null).toBeNull();
  const got = (await api(page, 'GET', `/api/motion-projects/${project._id}`)).body.project;
  expect(got.composition.poem.stanzas).toEqual([['அன்பே சிவம்', 'அறமே துணை'], ['இன்றே செய்', 'ஒன்றே குலம்']]);
  const w1 = (await api(page, 'GET', '/api/writings?limit=500')).body;
  expect(count(w1)).toBe(count(writings0));
  await api(page, 'DELETE', `/api/motion-projects/${project._id}`);
  await page.getByRole('button', { name: 'Start a different poem' }).click();
  await route(page, 'Continue');
  await page.getByRole('button', { name: 'Clear all device copies' }).click();
  await expect(page.getByText('No recovery copies on this device.')).toBeVisible();
});

for (const [w, h] of [[360, 740], [390, 844], [430, 932], [820, 1180], [1024, 768], [1440, 900]]) {
  test(`layout ${w}px: no horizontal overflow on start, with a long poem, on every tab; touch targets ≥ 44px on phones`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(URL_);
    await checkViewport(page, w, h);
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(await over()).toBeLessThanOrEqual(0);
    await begin(page, long(70, 5), 'மிகநீளம்');
    await checkViewport(page, w, h);
    expect(await over()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Advanced Studio' }).click();
    for (const t of ['Poem', 'Scenes', 'Look', 'Background', 'Audio', 'Story', 'Full poem', 'Feed poster', 'Project', 'Export']) {
      await tab(page, t);
      expect(await over(), `tab ${t} @${w}`).toBeLessThanOrEqual(0);
    }
    if (w <= 430) {
      const small = await page.evaluate(() => [...document.querySelectorAll('button, [role=tab], input:not([type=hidden]), select, textarea')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && e.type !== 'checkbox' && e.type !== 'radio'; }).map((e) => `${e.tagName}:${(e.textContent || e.ariaLabel || '').slice(0, 20)}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
      expect(small).toEqual([]);
    }
  });
}

test('a11y (axe wcag2a/aa/22aa) on start and full-poem tab, light and dark', async ({ page }) => {
  await page.goto(URL_);
  await route(page, 'Write a poem');
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme').selectOption(theme);
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('canvas').analyze();
    expect(ax.violations.map((v) => `${theme}:${v.id}:${v.nodes[0]?.html?.slice(0, 90)}`)).toEqual([]);
  }
  await begin(page, SHORT);
  await tab(page, 'Full poem');
  const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('canvas').analyze();
  expect(ax.violations.map((v) => `${v.id}:${v.nodes[0]?.html?.slice(0, 90)}`)).toEqual([]);
});
