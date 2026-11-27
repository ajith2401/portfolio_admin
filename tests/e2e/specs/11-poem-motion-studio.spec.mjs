import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE } from '../env.mjs';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
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


const wav = (sec = 4, sr = 44100) => { const n = sec * sr, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / sr * 2 * Math.PI * 440) * 9000), 44 + i * 2); return b; };
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).toString());
const open = async (page) => { await page.goto('/admin/poem-motion-studio'); await expect(page.getByRole('heading', { name: 'Poem Motion Studio' })).toBeVisible(); await page.getByRole('button', { name: /Portfolio poem/ }).click(); await page.getByLabel('Start from a poem').selectOption(poemId); await expect(page.getByText(/Created \d+ scenes/)).toBeVisible(); };
// ≥1280px advanced mode is 3-pane: Poem and Scenes live in the always-visible left pane instead of tabs.
const tab = async (page, n) => { const t = page.getByRole('tab', { name: n, exact: true }); if ((n === 'Poem' || n === 'Scenes') && (await t.count()) === 0) return; await t.click(); };
const advanced = (page) => page.getByRole('button', { name: 'Advanced Studio' }).click();

test('quick create: Tamil poem → style → preview → export (Poster PNG + Reel MP4), light and dark a11y', async ({ page }, info) => {
  test.setTimeout(240_000);
  await open(page);
  await tab(page, 'Look');
  const tpls = page.locator('fieldset:has(legend:text("Template")) button[aria-pressed]');
  await expect(tpls).toHaveCount(6);
  await page.getByRole('button', { name: 'Use template Monsoon Memories' }).click();
  await expect(page.getByRole('button', { name: 'Use template Monsoon Memories' })).toHaveAttribute('aria-pressed', 'true');
  const painted = await page.locator('canvas').first().evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] + d[i + 1] + d[i + 2] > 30) n++; return n; });
  expect(painted).toBeGreaterThan(10);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Theme').selectOption(theme);
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('canvas').exclude('fieldset button[aria-pressed]').analyze();
    expect(ax.violations.map((v) => `${theme}:${v.id}:${v.nodes[0]?.html?.slice(0, 90)}`)).toEqual([]);
  }
  await page.getByLabel('Theme').selectOption('system');
  await tab(page, 'Export');
  const poster = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Feed poster PNG' }).click();
  const pp = info.outputPath('poster.png'); await (await poster).saveAs(pp);
  expect(fs.statSync(pp).size).toBeGreaterThan(5000);
  expect(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', pp]).toString().trim()).toBe('1080,1350');
  const reelBtn = page.getByRole('button', { name: /Export Reel MP4/ });
  await expect(reelBtn).toBeEnabled({ timeout: 30_000 });
  const dl = page.waitForEvent('download', { timeout: 180_000 });
  await reelBtn.click();
  const mp = info.outputPath('reel.mp4'); await (await dl).saveAs(mp);
  const pr = probe(mp), v = pr.streams.find((x) => x.codec_type === 'video');
  expect(v.codec_name).toBe('h264'); expect(v.width).toBe(1080); expect(v.height).toBe(1920);
  expect(pr.streams.some((x) => x.codec_type === 'audio')).toBe(false); // silent reel stays valid
  expect(Number(pr.format.duration)).toBeGreaterThan(8);
  console.log('REEL', v.codec_name, v.width + 'x' + v.height, v.r_frame_rate, v.pix_fmt, pr.format.duration + 's', fs.statSync(mp).size + 'B');
  const after = JSON.stringify((await api(page, 'GET', `/api/writings/${poemId}`)).body.content);
  expect(after).toBe(before);
});

test('advanced: per-scene editing, undo/redo, restore original, no silent omission, save/reopen', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await advanced(page); await tab(page, 'Scenes');
  const count = () => page.locator('ol > li').filter({ has: page.getByLabel(/^Scene \d+ line 1$/) }).count();
  const n0 = await count();
  const line = page.getByLabel('Scene 2 line 1', { exact: true });
  await line.fill('திருத்திய வரி');
  await expect(line).toHaveValue('திருத்திய வரி');
  // P10: an edit over 400 characters is refused whole (never cut); the message is visible and the text is unchanged
  await line.fill('அ'.repeat(401));
  await expect(page.getByRole('alert').filter({ hasText: /401 characters; the limit is 400\. Nothing was changed/ })).toBeVisible();
  await expect(line).toHaveValue('திருத்திய வரி');
  await expect(line).toHaveAttribute('aria-invalid', 'true');
  await line.fill('திருத்திய வரி!'); // the next accepted edit clears the message
  await expect(line).toHaveValue('திருத்திய வரி!');
  await expect(page.getByRole('alert').filter({ hasText: /the limit is 400/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Split scene 2 before line 2' }).click();
  expect(await count()).toBe(n0 + 1);
  await page.getByRole('button', { name: 'Merge with next' }).nth(1).click();
  expect(await count()).toBe(n0);
  await page.getByLabel('Move scene 2 line 1 to').selectOption({ label: '→ Scene 3' });
  await expect(page.getByLabel('Scene 3 line 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Scene 3 line 3', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByLabel('Scene 3 line 3', { exact: true })).toBeVisible();
  await page.getByLabel('Scene 1 seconds', { exact: true }).fill('6'); await page.getByLabel('Scene 1 text position', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Restore original arrangement' }).click();
  await expect(page.getByLabel('Scene 2 line 1', { exact: true })).toHaveValue('அன்பே சிவம்');
  await page.getByRole('button', { name: /Remove scene 3 from the video/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not in any scene/ })).toBeVisible(); // omission is flagged, not silent
  await page.getByRole('button', { name: 'Restore original arrangement' }).click();
  await tab(page, 'Project');
  await page.getByRole('button', { name: 'Save project to Admin' }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Save project to Admin' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Continue/ }).click(); await page.getByLabel('Open a saved project').selectOption({ index: 1 });
  await advanced(page); await tab(page, 'Scenes');
  await expect(page.getByLabel('Scene 1 line 1', { exact: true })).toBeVisible();
  // safe delete confirmation
  await tab(page, 'Project');
  await page.getByRole('button', { name: 'Delete project' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('cannot be undone');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Delete project' }).click();
  await page.getByRole('button', { name: 'Yes, delete project' }).click();
  await expect(page.getByText(/Project deleted/)).toBeVisible();
});

test('audio: upload → AAC muxed, synced, duration matched; background photo gets readability veil', async ({ page }, info) => {
  test.setTimeout(240_000);
  const w = info.outputPath('tone.wav'); fs.writeFileSync(w, wav(4));
  const bgp = info.outputPath('white.png'); execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=900x1200', '-frames:v', '1', bgp]);
  await open(page); await advanced(page);
  await tab(page, 'Look'); await page.getByLabel('Text colour').fill('#ffffff');
  await tab(page, 'Background');
  await page.getByLabel('Choose background photo').setInputFiles(bgp);
  await expect(page.getByText(/Readability veil applied automatically: (\d+)%/)).toBeVisible();
  const pct = Number((await page.getByText(/Readability veil applied automatically/).textContent()).match(/(\d+)%/)[1]);
  expect(pct).toBeGreaterThan(20);
  await tab(page, 'Audio');
  await page.getByLabel('Upload audio').setInputFiles(w);
  await expect(page.getByLabel('Audio playback')).toBeVisible();
  await tab(page, 'Export');
  const btn = page.getByRole('button', { name: /Export Reel MP4/ });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const dl = page.waitForEvent('download', { timeout: 200_000 });
  await btn.click();
  const mp = info.outputPath('reel-audio.mp4'); await (await dl).saveAs(mp);
  const pr = probe(mp), a = pr.streams.find((x) => x.codec_type === 'audio'), v = pr.streams.find((x) => x.codec_type === 'video');
  expect(a?.codec_name).toBe('aac'); expect(v.codec_name).toBe('h264');
  expect(Math.abs(Number(a.start_time) - Number(v.start_time))).toBeLessThan(0.1);
  expect(Math.abs(Number(a.duration) - Number(v.duration))).toBeLessThan(0.25);
  console.log('AUDIO', a.codec_name, a.sample_rate, a.channels, 'a=' + a.duration, 'v=' + v.duration);
});

test('story frames in order (PNG + ZIP) and poster JPEG / multi-card set', async ({ page }, info) => {
  test.setTimeout(180_000);
  await open(page); await advanced(page);
  await tab(page, 'Story');
  await page.getByRole('button', { name: 'Render PNG frames' }).click();
  const frames = page.getByRole('img', { name: /Story frame \d+ of \d+/ });
  await expect(frames.first()).toBeVisible({ timeout: 60_000 });
  const nFrames = await frames.count(); expect(nFrames).toBeGreaterThanOrEqual(3);
  const z = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download all as ZIP' }).click();
  const zp = info.outputPath('story.zip'); await (await z).saveAs(zp);
  expect(execFileSync('unzip', ['-t', zp]).toString()).toMatch(/No errors detected/);
  expect(execFileSync('unzip', ['-l', zp]).toString()).toMatch(new RegExp(`${nFrames} files`));
  await tab(page, 'Feed poster');
  const j = page.waitForEvent('download'); await page.getByRole('button', { name: 'Poster JPEG' }).click();
  const jp = info.outputPath('poster.jpg'); await (await j).saveAs(jp);
  expect(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', jp]).toString().trim()).toBe('mjpeg,1080,1350');
  const s = page.waitForEvent('download'); await page.getByRole('button', { name: 'Multi-card set (PNG ZIP)' }).click();
  const sp = info.outputPath('posters.zip'); await (await s).saveAs(sp);
  const head = fs.readFileSync(sp).subarray(0, 4).toString('hex');
  if (head === '504b0304') expect(execFileSync('unzip', ['-t', sp]).toString()).toMatch(/No errors detected/); else expect(head).toBe('89504e47'); // a short poem fits one card → plain PNG
});

test('Tamil: every offered font loads, shape mixed Tamil-English, and render distinct exported frames', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page); await advanced(page); await tab(page, 'Scenes');
  await page.getByLabel('Scene 2 line 1', { exact: true }).fill('கொடுமை கூடாது, Hope & அன்பு — ஸ்ரீ க்ஷ கௌ');
  await page.getByRole('button', { name: 'Preview scene 2' }).click();
  await tab(page, 'Look');
  const opts = await page.getByLabel('Font', { exact: true }).locator('option').evaluateAll((o) => o.map((x) => x.value));
  expect(opts.length).toBeGreaterThanOrEqual(5); // core five + the approved tier (font upgrade)
  const sigs = [];
  for (const f of opts) {
    await page.getByLabel('Font', { exact: true }).selectOption(f);
    await page.getByRole('button', { name: 'Poster' }).first().click();
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const fams = [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family);
      const c = document.querySelector('canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
      return { fams: fams.length, h };
    });
    expect(r.fams).toBeGreaterThan(0);
    sigs.push(r.h);
  }
  expect(new Set(sigs).size).toBe(opts.length); // every offered face renders differently: no silent substitution to one fallback
});

test('benchmark: startup, preview fps, export time, responsiveness during export, heap', async ({ page }) => {
  test.setTimeout(180_000);
  const t0 = Date.now();
  await open(page);
  const startup = Date.now() - t0;
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  await tab(page, 'Export');
  await expect(page.getByRole('button', { name: /Export Reel MP4/ })).toBeEnabled({ timeout: 30_000 });
  // longest main-thread stall while exporting (editor must stay responsive)
  await page.evaluate(() => { window.__stall = 0; let l = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__stall = Math.max(window.__stall, n - l - 50); l = n; }, 50); });
  const dl = page.waitForEvent('download', { timeout: 150_000 });
  const t1 = Date.now();
  await page.getByRole('button', { name: /Export Reel MP4/ }).click();
  await dl; const exportMs = Date.now() - t1;
  const m = await page.evaluate(() => { clearInterval(window.__iv); return { stall: Math.round(window.__stall), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
  console.log('BENCH', JSON.stringify({ startupMs: startup, previewFps: Math.round(fps), reel11sExportMs: exportMs, longestMainThreadStallMs: m.stall, heapMB: m.heapMB }));
  expect(exportMs).toBeLessThan(90_000);
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


test('mobile 390: no overflow, bottom tab bar, full-screen preview, large touch targets', async ({ page }) => {
  await page.goto('/admin/poem-motion-studio');
  await checkViewport(page, 390, 844);
  await page.getByRole('button', { name: /Portfolio poem/ }).click(); await page.getByLabel('Start from a poem').selectOption(poemId);
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  const small = await page.$$eval('main button, main select, main input:not([type=file]):not([type=checkbox]):not([type=range])', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 43 || r.width < 43) && getComputedStyle(e).display !== 'none'; }).map((e) => (e.getAttribute('aria-label') || e.textContent || '').slice(0, 30)));
  expect(small).toEqual([]);
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(page.getByRole('dialog', { name: 'Full-screen preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('tablist')).toBeVisible();
});

// ANDROID REPRODUCTION. next/font adds a "<Font> Fallback" @font-face whose only source is local(Arial)/local("Times New
// Roman"). Android has no such font, so that face goes to status "error" and Chrome rejects document.fonts.load() for the
// whole family string ("A network error occurred"). Desktop has the font, so we force the same failure here by adding a
// face for each Fallback family whose local() source cannot exist, then prove (a) the condition really reproduces and
// (b) the Studio still exports, because the canvas no longer names the Fallback family.
test('android fallback-face failure: export still succeeds when every "<Font> Fallback" face errors', async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const fams = ['Noto Serif Tamil', 'Noto Sans Tamil', 'Hind Madurai', 'Anek Tamil', 'Tiro Tamil'];
      const st = document.createElement('style');
      st.textContent = fams.map((f) => `@font-face{font-family:"${f} Fallback";src:local("__no_such_font_on_android__")}`).join('\n');
      document.head.appendChild(st);
    });
  });
  await open(page);
  // (a) the failure condition is real in this page: the OLD canvas string (with the Fallback family) is rejected...
  const old = await page.evaluate(() => document.fonts.load("500 40px 'Noto Serif Tamil', 'Noto Serif Tamil Fallback'", 'தமிழ்').then(() => 'resolved', (e) => `rejected:${e.name}`));
  expect(old).toBe('rejected:NetworkError');
  // ...while the primary family alone loads
  const primary = await page.evaluate(() => document.fonts.load("500 40px 'Noto Serif Tamil', serif", 'தமிழ்').then((r) => `resolved:${r.length}`, (e) => `rejected:${e.name}`));
  expect(primary).toMatch(/^resolved:[1-9]/);
  // (b) the Studio exports anyway, with no font error shown
  await tab(page, 'Export');
  const poster = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Feed poster PNG' }).click();
  const pp = info.outputPath('android-poster.png'); await (await poster).saveAs(pp);
  expect(fs.statSync(pp).size).toBeGreaterThan(5000);
  await expect(page.getByText(/could not be loaded|not ready for this text/)).toHaveCount(0);
});
