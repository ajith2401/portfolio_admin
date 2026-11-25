import { test, expect } from '@playwright/test';
import { checkViewport, editor, isEditorFocused, newWriting, waitSavedId } from '../helpers.mjs';

test.describe('poem focus', () => {
  test('choosing Poem in the category select focuses the real editor (new page)', async ({ page }) => {
    await newWriting(page);
    await checkViewport(page, 1280, 800);
    await page.getByLabel('Title').fill('ஒரு கவிதை');
    await page.locator('#w-cat').selectOption('poem');
    await expect.poll(() => isEditorFocused(page)).toBe(true);
    await page.keyboard.type('முதல் வரி');
    await page.keyboard.press('Enter');
    await page.keyboard.type('இரண்டாம் வரி');
    await expect(editor(page).locator('[data-type="poem"], .poem').first()).toBeVisible();
    await expect(editor(page)).toContainText('இரண்டாம் வரி');
  });

  test('still focuses after the draft is created and the URL is replaced (no remount)', async ({ page }) => {
    await newWriting(page);
    await page.getByLabel('Title').fill('Remount probe');
    await editor(page).click();
    await page.keyboard.type('first paragraph of the probe');
    const gets = [];
    page.on('request', (r) => { if (r.method() === 'GET' && /\/api\/writings\/[0-9a-f]{24}$/.test(r.url())) gets.push(r.url()); });
    await waitSavedId(page);
    await page.getByLabel('Title').click(); // move focus out of the editor first
    expect(await isEditorFocused(page)).toBe(false);
    // Mark the live editor DOM node: a remount would replace it.
    await page.evaluate(() => { document.querySelector('.ProseMirror').dataset.probe = 'same'; });
    await page.locator('#w-cat').selectOption('poem');
    await expect.poll(() => isEditorFocused(page)).toBe(true);
    await page.waitForTimeout(1200); // let any late refetch/hydrate happen
    await expect(page.locator('.ProseMirror[data-probe="same"]')).toHaveCount(1);
    expect(gets).toEqual([]); // creating the draft must not trigger a refetch + rehydrate of the page
    await expect.poll(() => isEditorFocused(page)).toBe(true);
    await page.keyboard.type(' typed after');
    await expect(editor(page)).toContainText('typed after');
  });

  test('toolbar Poem button keeps focus in the editor', async ({ page }) => {
    await newWriting(page);
    await editor(page).click();
    await page.keyboard.type('line one');
    await page.getByRole('button', { name: /poem block/i }).click();
    await expect.poll(() => isEditorFocused(page)).toBe(true);
    await page.keyboard.type(' more');
    await expect(editor(page)).toContainText('line one more');
  });

  test('title typing and Tab order are unaffected', async ({ page }) => {
    await newWriting(page);
    const title = page.getByLabel('Title');
    await title.click();
    await page.keyboard.type('Typing a title');
    await expect(title).toHaveValue('Typing a title');
    expect(await isEditorFocused(page)).toBe(false);
    await page.keyboard.press('Tab');
    await expect(page.locator('#w-cat')).toBeFocused();
  });
});
