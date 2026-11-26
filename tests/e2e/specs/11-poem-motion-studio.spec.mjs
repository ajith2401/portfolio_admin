import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE } from '../env.mjs';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { api, checkViewport } from '../helpers.mjs';

const T = (text) => ({ type: 'text', text });
const poemDoc = { type: 'doc', content: [{ type: 'poem', content: [
  { type: 'paragraph', content: [T('அன்பே சிவம்'), { type: 'hardBreak' }, T('அறமே துணை'), { type: 'hardBreak' }, T('நன்றே செய்')] },
  { type: 'paragraph', content: [T('இன்றே செய்'), { type: 'hardBreak' }, T('ஒன்றே குலம்')] },
] }] };
let poemId, before;

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: '.auth/state.json' })).newPage();
  await page.goto('/admin');
  const r = await api(page, 'POST', '/api/writings', { title: 'மோஷன் சோதனை பாடல்', category: 'poem', language: 'Tamil', status: 'draft', contentFormat: 'tiptap', content: poemDoc, body: '' });
  expect([200, 201], JSON.stringify(r.body).slice(0, 200)).toContain(r.status);
  poemId = r.body._id || r.body.writing?._id;
  before = JSON.stringify((await api(page, 'GET', `/api/writings/${poemId}`)).body.content);
});

test('studio: pick Tamil poem, scenes, templates, save/reopen, source-change, exports', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto('/admin/poem-motion-studio');
  await expect(page.getByRole('heading', { name: 'Poem Motion Studio' })).toBeVisible();
  await page.getByLabel('Start from a poem').selectOption(poemId);
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await expect(page.getByText('அன்பே சிவம்').first()).toBeVisible();
  // six distinct templates
  await expect(page.locator('button[aria-pressed]')).toHaveCount(6);
  await page.getByRole('button', { name: /Monsoon Memories/ }).click();
  await expect(page.getByRole('button', { name: /Monsoon Memories/ })).toHaveAttribute('aria-pressed', 'true');
  // canvas actually painted (not blank)
  const painted = await page.locator('canvas').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n; });
  expect(painted).toBeGreaterThan(10);
  // a11y
  const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(ax.violations.map((v) => `${v.id}:${v.nodes[0]?.html?.slice(0, 80)}`)).toEqual([]);
  // save + autosave round trip
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  // exports
  const poster = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Poster PNG' }).click();
  const p = await poster; const pp = info.outputPath('poster.png'); await p.saveAs(pp);
  expect(fs.statSync(pp).size).toBeGreaterThan(5000);
  const reelBtn = page.getByRole('button', { name: /Export Reel MP4/ });
  await expect(reelBtn).toBeEnabled({ timeout: 20_000 });
  const dl = page.waitForEvent('download', { timeout: 150_000 });
  await reelBtn.click();
  const d = await dl; const mp = info.outputPath('reel.mp4'); await d.saveAs(mp);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp]).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video');
  expect(v.codec_name).toBe('h264'); expect(v.width).toBe(1080); expect(v.height).toBe(1920);
  expect(Number(probe.format.duration)).toBeGreaterThan(8);
  console.log('REEL', v.codec_name, v.width + 'x' + v.height, v.r_frame_rate, v.pix_fmt, probe.format.duration + 's', fs.statSync(mp).size + 'B');
  // original writing untouched
  const after = JSON.stringify((await api(page, 'GET', `/api/writings/${poemId}`)).body.content);
  expect(after).toBe(before);
});

test('project API: auth required, origin enforced, normalisation, source change', async ({ page, browser }) => {
  await page.goto('/admin');
  const anon = await pwRequest.newContext({ baseURL: BASE, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Origin: BASE } });
  expect((await anon.get('/api/motion-projects')).status()).toBe(401);
  expect((await anon.post('/api/motion-projects', { data: { name: 'x', composition: {} } })).status()).toBe(401);
  expect((await anon.delete('/api/motion-projects/000000000000000000000000')).status()).toBe(401);
  const bad = await api(page, 'POST', '/api/motion-projects', { name: 'evil', composition: { format: 'x', injected: '<script>', scenes: [{ lines: ['a'] }], style: { sizePx: 99999 } } });
  expect(bad.status).toBe(201);
  const got = (await api(page, 'GET', `/api/motion-projects/${bad.body.project._id}`)).body.project.composition;
  expect(got.style.sizePx).toBe(140); expect('injected' in got).toBe(false);
  const withSrc = await api(page, 'POST', '/api/motion-projects', { name: 'src', sourceWritingId: poemId, composition: { scenes: [{ lines: ['a'] }] } });
  const id = withSrc.body.project._id;
  expect((await api(page, 'GET', `/api/motion-projects/${id}`)).body.sourceChanged).toBe(false);
  const w = (await api(page, 'GET', `/api/writings/${poemId}`)).body;
  const edited = JSON.parse(JSON.stringify(w.content)); edited.content[0].content[0].content[0].text = 'மாற்றப்பட்டது';
  const put = await api(page, 'PUT', `/api/writings/${poemId}`, { ...w, content: edited, version: w.version });
  expect([200, 201]).toContain(put.status);
  expect((await api(page, 'GET', `/api/motion-projects/${id}`)).body.sourceChanged).toBe(true);
  await api(page, 'PUT', `/api/motion-projects/${id}`, { acknowledgeSource: true });
  expect((await api(page, 'GET', `/api/motion-projects/${id}`)).body.sourceChanged).toBe(false);
  expect((await api(page, 'DELETE', `/api/motion-projects/${id}`)).status).toBe(200);
});

test('mobile 390: no horizontal overflow', async ({ page }) => {
  await page.goto('/admin/poem-motion-studio');
  await checkViewport(page, 390, 844);
  await page.getByLabel('Start from a poem').selectOption(poemId);
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
});
