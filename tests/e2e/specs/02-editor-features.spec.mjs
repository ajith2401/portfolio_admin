import { test, expect } from '@playwright/test';
import { checkViewport, editor, newWriting, waitSavedId, api } from '../helpers.mjs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
// The renderer is plain ESM inside a package without "type": "module", so load it in a real Node ESM process.
const docToHtml = (doc) => execFileSync('node', ['--input-type=module', '-e',
  `import { docToHtml } from ${JSON.stringify(path.resolve(import.meta.dirname, '../../../src/lib/editor/doc-render.js'))}; process.stdout.write(docToHtml(JSON.parse(process.env.DOC)).html);`], { encoding: 'utf8', maxBuffer: 1 << 24, env: { ...process.env, DOC: JSON.stringify(doc) } });

const MOD = 'ControlOrMeta';

test.describe('editor features (desktop 1280x800)', () => {
  test.beforeEach(async ({ page }) => {
    await newWriting(page);
    await checkViewport(page, 1280, 800);
    await page.getByLabel('Title').fill('Feature probe');
    await editor(page).click();
  });

  test('slash menu opens, filters, navigates and inserts a heading; Esc closes it', async ({ page }) => {
    await page.keyboard.type('/');
    const list = page.getByRole('listbox', { name: 'Insert block' });
    await expect(list).toBeVisible();
    await page.keyboard.type('head');
    await expect(list.getByRole('option')).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await page.keyboard.type('Section');
    await expect(editor(page).locator('h3')).toHaveText('Section');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/qu');
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
  });

  test('floating toolbar appears on selection and applies bold', async ({ page }) => {
    await page.keyboard.type('select this word');
    await expect(page.getByRole('toolbar', { name: 'Selection formatting' })).toBeHidden();
    await page.keyboard.press('Shift+Control+ArrowLeft'.replace('Control', process.platform === 'darwin' ? 'Alt' : 'Control'));
    const bar = page.getByRole('toolbar', { name: 'Selection formatting' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Bold' }).click();
    await expect(editor(page).locator('strong')).toHaveText('word');
    const box = await bar.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
  });

  test('keyboard shortcuts: bold, italic, undo/redo, link dialog, heading', async ({ page }) => {
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.type('bold');
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.press(`${MOD}+i`);
    await page.keyboard.type(' ital');
    await page.keyboard.press(`${MOD}+i`);
    await expect(editor(page).locator('strong')).toHaveText('bold');
    await expect(editor(page).locator('em')).toHaveText('ital');
    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press(`${MOD}+z`);
    await expect(editor(page).locator('em')).toHaveCount(0);
    await page.keyboard.press(`${MOD}+Shift+z`);
    await expect(editor(page)).toContainText('ital');
    await page.keyboard.press(`${MOD}+k`);
    await expect(page.getByRole('dialog', { name: 'Link' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('image upload (stubbed endpoint), caption and alt text', async ({ page }) => {
    let uploads = 0;
    await page.route('**/api/upload-image', async (route) => {
      uploads++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ imageUrls: { large: '/favicon.ico' } }) });
    });
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: /image/i });
    await expect(dlg).toBeVisible();
    await dlg.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
    await expect(dlg.getByLabel(/image address|address|url/i).first()).toHaveValue('/favicon.ico');
    expect(uploads).toBe(1);
    await expect(dlg.getByText(/No alt text/)).toBeVisible();
    await dlg.locator('#img-alt').fill('A small icon');
    await expect(dlg.getByText(/No alt text/)).toBeHidden();
    await dlg.locator('#img-cap').fill('Figure one');
    await dlg.getByRole('button', { name: /insert|save|apply/i }).last().click();
    await expect(dlg).toBeHidden();
    const img = editor(page).locator('img');
    await expect(img).toHaveAttribute('src', '/favicon.ico');
    await expect(img).toHaveAttribute('alt', 'A small icon');
    await expect(img).toHaveAttribute('title', 'Figure one');
    await page.getByRole('tab', { name: 'Preview' }).click();
    const fig = page.locator('.published-body figure');
    await expect(fig.locator('figcaption')).toHaveText('Figure one');
    await expect(fig.locator('img')).toHaveAttribute('alt', 'A small icon');
  });

  test('fullscreen toggles and Esc exits', async ({ page }) => {
    await page.getByRole('button', { name: 'Fullscreen' }).click();
    await expect(page.getByRole('button', { name: /Exit fullscreen/ })).toBeVisible();
    const r = await page.locator('.rich-editor-content').first().boundingBox();
    expect(r.width).toBeGreaterThan(300);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  });

  test('Preview tab equals the shared published render of the saved document', async ({ page }) => {
    await page.keyboard.type('/');
    await page.keyboard.press('Enter'); // Heading 2
    await page.keyboard.type('Heading');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Paragraph with ');
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.type('bold');
    await page.keyboard.press(`${MOD}+b`);
    await page.keyboard.press('Enter');
    await page.keyboard.type('- bullet one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('bullet two');
    const id = await waitSavedId(page);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Preview' }).click();
    const preview = await page.locator('.published-body').innerHTML();
    const saved = await api(page, 'GET', `/api/writings/${id}`);
    expect(saved.status, `${id} @ ${page.url()} ${JSON.stringify(saved).slice(0, 200)}`).toBe(200);
    const expected = await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; return d.innerHTML; }, docToHtml(saved.body.content));
    expect(preview).toBe(expected);
    expect(preview).toContain('<strong>bold</strong>');
    expect(preview).toContain('<ul>');
  });
});
