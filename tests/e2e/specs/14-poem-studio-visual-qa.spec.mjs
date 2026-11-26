// Visual QA corpus: writes REAL exports to QA_OUT so a human (or Claude) can open and look at them.
// Assertions here only prove dimensions/validity; whether the image is beautiful is judged by eye.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = process.env.QA_OUT || path.join(os.tmpdir(), 'poem-qa');
fs.mkdirSync(OUT, { recursive: true });
const URL_ = '/admin/poem-motion-studio';
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const CORPUS = {
  '1-short': { title: 'அறம்', text: 'அன்பே சிவம்\nஅறமே துணை\n\nஇன்றே செய்\nஒன்றே குலம்' },
  '2-medium': { title: 'மழைக்காலம்', text: rep(3, (s) => rep(4, (l) => `மழை பெய்யும் மாலை நேரம் ${s + 1}.${l + 1}`).join('\n')).join('\n\n') },
  '3-long': { title: 'நீண்ட பயணம்', text: rep(9, (s) => rep(6, (l) => `நீண்ட பாதையில் நடக்கிறேன் வரி ${s + 1}.${l + 1}`).join('\n')).join('\n\n') },
  '4-mixed': { title: 'Monsoon / மழை', text: 'Rain on a quiet street\nமழை பேசும் மௌனம்\n\nI remember you, அன்பே\nWi-Fi இல்லாத night, ஆனால் you were there\n\nCoffee & கருப்பட்டி\nடீ கடை — 6:30 PM' },
  '5-punctuation': { title: '“உயிர்” — ‘மெய்’?', text: '“நீ ஏன் வந்தாய்?” — என்றேன்…\n‘நான் வரவில்லை!’ என்றாய்; அது (உண்மை) அல்ல.\n\n1) முதலில்: அமைதி;\n2) பிறகு: ஆரவாரம் ~ ௧௨௩ ₹500 @ 50% #கவிதை\n\nஎன்ன?! ஏன்?!! ... ஏனோ…' },
  '6-blank-lines': { title: 'இடைவெளி', text: rep(12, (i) => `ஒரு வரி ${i + 1}\nஇரண்டாம் வரி ${i + 1}`).join('\n\n\n\n') },
  '7-long-lines': { title: 'நீளமான வரிகள்', text: 'இந்த வரி மிகவும் நீளமானது என்பதால் அது பல வரிசைகளாக உடைந்து போகக்கூடும் ஆனால் எந்த எழுத்தும் இழக்கப்படக்கூடாது என்பதே இங்கு சோதனை\nபல் வகை மொழிகளிலும் கவிதை எழுதும் ஒருவன் தன் சொந்த மொழியிலேயே அதிகம் உயிர் வாழ்கிறான் என்பதைச் சொல்லும் ஒரு நீண்ட வரி இது\n\nகுறுகிய வரி' },
};
const dl = async (page, click, file) => { const d = page.waitForEvent('download', { timeout: 120_000 }); await click(); const dd = await d; await dd.saveAs(file); return file; };
const size = (f) => { const b = fs.readFileSync(f); return b.subarray(1, 4).toString() === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null; };

for (const [key, p] of Object.entries(CORPUS)) {
  test(`visual corpus ${key}: full-poem poster is complete`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL_);
    await page.getByRole('button', { name: /Write a poem/ }).first().click();
    await page.getByLabel('Title (optional)').fill(p.title);
    await page.getByLabel('Poem text').fill(p.text);
    await page.getByRole('button', { name: 'Create scenes' }).click();
    await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
    await page.getByRole('tab', { name: 'Full poem' }).click();
    const warn = page.getByRole('alert').filter({ hasText: 'too long' });
    const status = async () => (await page.getByText(/lines? (are|is) on the poster|All \d+ lines/).first().textContent().catch(() => '')) || '';
    let mode = 'standard';
    if (await warn.isVisible().catch(() => false)) { await warn.getByRole('button', { name: /One taller image/ }).click(); mode = 'extended'; }
    await expect(page.getByText(/All \d+ lines are on the poster/)).toBeVisible();
    const f = await dl(page, () => page.getByRole('button', { name: 'PNG', exact: true }).click(), path.join(OUT, `${key}-${mode}.png`));
    const s = size(f);
    expect(s.w).toBe(1080); expect(s.h).toBeGreaterThanOrEqual(1920); if (mode === 'standard') expect(s.h).toBe(1920);
    const jf = await dl(page, () => page.getByRole('button', { name: 'JPEG', exact: true }).click(), path.join(OUT, `${key}-${mode}.jpg`));
    console.log('QA', key, mode, `${s.w}x${s.h}`, await status(), fs.statSync(f).size + 'B', path.basename(jf));
    if (key === '1-short') {
      // dark photo-free background vs light template: also capture the paper template and expressive preset
      await page.getByRole('tab', { name: 'Look' }).click();
      await page.getByRole('button', { name: 'Use template Paper & Ink' }).click();
      await page.getByRole('tab', { name: 'Full poem' }).click();
      await page.getByRole('button', { name: /Expressive/ }).click();
      await dl(page, () => page.getByRole('button', { name: 'PNG', exact: true }).click(), path.join(OUT, `${key}-paper-expressive.png`));
    }
  });
}

test('visual corpus: Reel MP4 + cover + feed poster + story frames', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL_);
  await page.getByRole('button', { name: /Write a poem/ }).first().click();
  await page.getByLabel('Title (optional)').fill(CORPUS['1-short'].title);
  await page.getByLabel('Poem text').fill(CORPUS['4-mixed'].text);
  await page.getByRole('button', { name: 'Create scenes' }).click();
  await expect(page.getByText(/Created \d+ scenes/)).toBeVisible();
  await page.getByRole('button', { name: 'Advanced Studio' }).click();
  await page.getByRole('tab', { name: 'Export' }).click();
  const btn = page.getByRole('button', { name: /Export Reel MP4/ });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  const t0 = Date.now();
  const mp = await dl(page, () => btn.click(), path.join(OUT, 'reel.mp4'));
  const ms = Date.now() - t0;
  const pr = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp]).toString());
  const v = pr.streams.find((x) => x.codec_type === 'video');
  console.log('QA-REEL', v.codec_name, v.profile, `${v.width}x${v.height}`, v.r_frame_rate, v.pix_fmt, pr.format.duration + 's', fs.statSync(mp).size + 'B', `exportMs=${ms}`);
  expect(v.codec_name).toBe('h264'); expect(v.width).toBe(1080); expect(v.height).toBe(1920);
  await dl(page, () => page.getByRole('button', { name: 'Reel cover PNG' }).click(), path.join(OUT, 'reel-cover.png'));
  await dl(page, () => page.getByRole('button', { name: 'Export Feed poster PNG' }).click(), path.join(OUT, 'feed-poster.png'));
});
