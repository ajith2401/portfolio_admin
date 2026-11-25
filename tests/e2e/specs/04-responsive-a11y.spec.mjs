import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import mongoose from 'mongoose';
import { checkViewport, editor, newWriting, waitSavedId, api } from '../helpers.mjs';
import { MONGO } from '../env.mjs';

const MOD = 'ControlOrMeta';
const noHScroll = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = r.violations.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

for (const [w, h] of [[390, 844], [820, 1180], [1440, 900]]) {
  test.describe(`responsive ${w}x${h}`, () => {
    test('library and editor: no horizontal overflow; floating toolbar and tabs usable', async ({ page }) => {
      await page.goto('/admin/writings');
      await checkViewport(page, w, h);
      await expect(page.getByRole('heading').first()).toBeVisible();
      let m = await noHScroll(page);
      expect(m.sw, `library scrollWidth ${m.sw} > ${m.iw}`).toBeLessThanOrEqual(m.iw);
      await newWriting(page);
      await checkViewport(page, w, h);
      await page.getByLabel('Title').fill('Responsive probe');
      await editor(page).click();
      await page.keyboard.type('select me please');
      m = await noHScroll(page);
      expect(m.sw, `editor scrollWidth ${m.sw} > ${m.iw}`).toBeLessThanOrEqual(m.iw);
      await page.keyboard.press(`${MOD}+a`);
      const bold = page.getByRole('toolbar').getByRole('button', { name: /^Bold/ }).first();
      await expect(bold).toBeVisible();
      const box = await bold.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(w);
      expect(box.height).toBeGreaterThanOrEqual(24);
      await bold.click();
      await expect(editor(page).locator('strong')).toHaveText('select me please');
      for (const tab of ['Preview', 'Search & Sharing', 'Write']) {
        await page.getByRole('tab', { name: tab }).click();
        m = await noHScroll(page);
        expect(m.sw, `${tab} scrollWidth ${m.sw} > ${m.iw}`).toBeLessThanOrEqual(m.iw);
      }
    });
  });
}

test.describe('keyboard only (1280x800)', () => {
  test.beforeEach(async ({ page }) => { await newWriting(page); await checkViewport(page, 1280, 800); });

  test('Tab order is logical and every stop has a visible focus indicator', async ({ page }) => {
    await page.getByLabel('Title').focus();
    const seen = [];
    for (let i = 0; i < 40; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
        const name = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent?.trim().slice(0, 30) || el.id;
        return { tag: el.tagName, role: el.getAttribute('role'), name, visible, pm: el.classList.contains('ProseMirror'), rect: el.getBoundingClientRect().toJSON() };
      });
      if (info) seen.push(info);
      if (info?.pm) break;
      await page.keyboard.press('Tab');
    }
    const iTitle = seen.findIndex((s) => /title/i.test(s.name));
    const iEditor = seen.findIndex((s) => s.pm);
    expect(iTitle).toBeGreaterThanOrEqual(0);
    expect(iEditor, 'editor reachable by keyboard').toBeGreaterThan(iTitle);
    const missing = seen.filter((s) => !s.visible).map((s) => `${s.tag}:${s.name}`);
    expect(missing, 'stops without a visible focus ring').toEqual([]);
    // Visual order follows DOM order top-to-bottom (allowing same-row left-to-right).
    const tops = seen.map((s) => Math.round(s.rect.top));
    for (let i = 1; i < tops.length; i++) expect(tops[i], `stop ${i} ${seen[i].name} jumps up`).toBeGreaterThanOrEqual(tops[i - 1] - 8);
  });

  test('write, format, save and switch tabs without a mouse', async ({ page }) => {
    await page.getByLabel('Title').focus();
    await page.keyboard.type('Keys only');
    await page.keyboard.press('Tab'); // category or next field
    await editor(page).focus();
    await page.keyboard.type('hello');
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+b`);
    await expect(editor(page).locator('strong')).toHaveText('hello');
    await waitSavedId(page);
    const tablist = page.getByRole('tablist', { name: 'Sections' });
    await tablist.getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('ArrowRight');
    const sel = await tablist.getByRole('tab', { selected: true }).textContent();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focused).toBe('tab');
    expect(sel).toMatch(/Preview|Search/);
  });
});

test.describe('dialogs (1280x800)', () => {
  test.beforeEach(async ({ page }) => { await newWriting(page); await checkViewport(page, 1280, 800); await page.getByLabel('Title').fill('Dialog probe'); await editor(page).click(); await page.keyboard.type('anchor'); });

  async function assertDialog(page, dlg, returnTo) {
    await expect(dlg).toBeVisible();
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(dlg).toHaveAccessibleName(/./);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog],[role=alertdialog]'));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await inside(), `Tab ${i} escaped`).toBe(true); }
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside(), `Shift+Tab ${i} escaped`).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(returnTo).toBeFocused();
  }

  test('link dialog: role, label, focus trap, Esc, focus returns to the editor', async ({ page }) => {
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press(`${MOD}+k`);
    await assertDialog(page, page.getByRole('dialog'), editor(page));
  });

  test('image dialog from the slash menu: role, label, trap, Esc, focus return', async ({ page }) => {
    await page.keyboard.press('Enter');
    await page.keyboard.type('/image');
    await page.keyboard.press('Enter');
    await assertDialog(page, page.getByRole('dialog'), editor(page));
  });

  test('legacy convert flow: review step is labelled and keyboard reachable', async ({ page }) => {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
    const slug = `legacy-${Date.now()}`;
    const ins = await mongoose.connection.db.collection('writings').insertOne({
      title: 'Legacy piece', slug, body: '# Heading\n\nline one\nline two\n\nsecond para', category: 'poem', language: 'English',
      contentFormat: 'markdown', status: 'draft', tags: [], images: [], version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    await mongoose.disconnect();
    await page.goto(`/admin/writings/${ins.insertedId}`);
    await expect(page.getByRole('note')).toBeVisible();
    await axe(page, 'legacy view');
    await page.getByRole('button', { name: 'Convert to the new editor' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Review conversion' })).toBeVisible();
    await axe(page, 'convert review');
  });
});

test.describe('axe-core (1280x800, WCAG 2.0/2.1 A and AA)', () => {
  test('library', async ({ page }) => { await page.goto('/admin/writings'); await checkViewport(page, 1280, 800); await expect(page.getByRole('heading').first()).toBeVisible(); await axe(page, 'library'); });
  test('editor', async ({ page }) => { await newWriting(page); await checkViewport(page, 1280, 800); await page.getByLabel('Title').fill('Axe probe'); await axe(page, 'editor'); });
  test('Search & Sharing tab', async ({ page }) => {
    await newWriting(page); await checkViewport(page, 1280, 800);
    await page.getByLabel('Title').fill('Axe probe'); await editor(page).click(); await page.keyboard.type('some text'); await waitSavedId(page);
    await page.getByRole('tab', { name: 'Search & Sharing' }).click(); await axe(page, 'search and sharing');
  });
  test('conflict dialog', async ({ page }) => {
    await newWriting(page); await checkViewport(page, 1280, 800);
    await page.getByLabel('Title').fill('Axe conflict'); await editor(page).click(); await page.keyboard.type('base');
    const id = await waitSavedId(page);
    await page.waitForTimeout(2500);
    const cur = (await api(page, 'GET', `/api/writings/${id}`)).body;
    await api(page, 'PUT', `/api/writings/${id}`, { title: 'Theirs', category: cur.category, language: cur.language, content: cur.content, version: cur.version });
    await page.getByLabel('Title').fill('Mine'); await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 15000 });
    await axe(page, 'conflict dialog');
  });
});
