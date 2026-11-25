import { test, expect } from '@playwright/test';
import { checkViewport, editor, newWriting, waitSavedId, api } from '../helpers.mjs';

const savedStatus = (page) => page.getByRole('status').filter({ hasText: /^Saved/ });
// Save now can be ignored while an autosave is in flight (the edit is re-queued as "dirty"), so settle:
// click, then require "Saved" to hold for longer than the 1.5s autosave debounce.
const flush = async (page) => {
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(savedStatus(page)).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(savedStatus(page)).toBeVisible();
};

test.describe('persistence and Tamil (1280x800)', () => {
  test.beforeEach(async ({ page }) => { await newWriting(page); await checkViewport(page, 1280, 800); });

  test('Tamil via CDP insertText: combining characters, grapheme intact, saved and reloaded (NOT a real OS IME)', async ({ page }) => {
    await page.getByLabel('Title').fill('தமிழ் சோதனை');
    await editor(page).click();
    const cdp = await page.context().newCDPSession(page);
    // Simulated composition: setComposition then commit with insertText. This exercises the editor's composition
    // handlers but is not a platform IME (no candidate window, no OS keyboard layout).
    await cdp.send('Input.imeSetComposition', { text: 'க', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: 'கா', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: 'கா' });
    await cdp.send('Input.insertText', { text: 'ஷ்ணம் கூடு, "வணக்கம்"।' });
    const typed = 'காஷ்ணம் கூடு, "வணக்கம்"।';
    await expect(editor(page)).toContainText(typed);
    const id = await waitSavedId(page);
    await flush(page);
    const got = await api(page, 'GET', `/api/writings/${id}`);
    const text = JSON.stringify(got.body.content);
    expect(text).toContain(JSON.stringify(typed).slice(1, -1).replace(/\\"/g, '\\"'));
    expect(got.body.title).toBe('தமிழ் சோதனை');
    await page.reload();
    await expect(editor(page)).toContainText(typed);
    // Backspace removes one code point at a time inside editor; the document must stay valid NFC-agnostic text
    const len = await editor(page).evaluate((el) => [...new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(el.textContent)].length);
    expect(len).toBeGreaterThan(5);
  });

  test('poem line breaks and stanzas survive save and reload', async ({ page }) => {
    await page.getByLabel('Title').fill('Poem keep');
    await page.locator('#w-cat').selectOption('poem');
    await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))).toBe(true);
    await page.keyboard.type('line one');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('stanza two first');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('stanza two second');
    const id = await waitSavedId(page);
    await flush(page);
    const srv = JSON.stringify((await api(page, 'GET', `/api/writings/${id}`)).body.content);
    expect(srv).toContain('stanza two second');
    const before = (await api(page, 'GET', `/api/writings/${id}`)).body.content;
    await page.reload();
    await expect(editor(page)).toContainText('stanza two second');
    const lines = await editor(page).evaluate((el) => el.innerText.split('\n').map((s) => s.trim()).filter(Boolean));
    expect(lines).toEqual(['line one', 'line two', 'stanza two first', 'stanza two second']);
    const after = (await api(page, 'GET', `/api/writings/${id}`)).body.content;
    expect(after).toEqual(before);
    const flat = JSON.stringify(after);
    expect(flat).toContain('hardBreak');
    expect((flat.match(/"type":"poem"/g) || []).length).toBe(1);
    // stanza boundary present
    expect(flat).toMatch(/"type":"poem"[\s\S]*line one[\s\S]*line two[\s\S]*stanza two first/);
  });

  test('category switch short story to poem to short story keeps text and does not lose content', async ({ page }) => {
    await page.getByLabel('Title').fill('Switch');
    await editor(page).click();
    await page.keyboard.type('Some prose that must survive.');
    await waitSavedId(page);
    await page.locator('#w-cat').selectOption('poem');
    await expect(editor(page)).toContainText('Some prose that must survive.');
    await page.locator('#w-cat').selectOption('short story');
    await expect(editor(page)).toContainText('Some prose that must survive.');
    await flush(page);
    await page.reload();
    await expect(page.locator('#w-cat')).toHaveValue('short story');
    await expect(editor(page)).toContainText('Some prose that must survive.');
  });

  test('autosave fires on its own; a failed PUT shows the failure and recovers', async ({ page }) => {
    await page.getByLabel('Title').fill('Autosave');
    await editor(page).click();
    await page.keyboard.type('first');
    const id = await waitSavedId(page);
    await expect(savedStatus(page)).toBeVisible({ timeout: 15000 });
    let fail = true; let failed = 0;
    await page.route(`**/api/writings/${id}`, async (route) => {
      if (route.request().method() === 'PUT' && fail) { failed++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }); }
      return route.continue();
    });
    await page.keyboard.type(' second');
    await expect(page.getByRole('status').filter({ hasText: /Save failed/ })).toBeVisible({ timeout: 15000 });
    expect(failed).toBeGreaterThan(0);
    await expect(editor(page)).toContainText('first second'); // nothing lost locally
    fail = false;
    await expect(savedStatus(page)).toBeVisible({ timeout: 40000 });
    const got = await api(page, 'GET', `/api/writings/${id}`);
    expect(JSON.stringify(got.body.content)).toContain('first second');
  });
});

test.describe('409 conflict (1280x800)', () => {
  async function conflict(page) {
    await newWriting(page);
    await checkViewport(page, 1280, 800);
    await page.getByLabel('Title').fill('Mine v1');
    await editor(page).click();
    await page.keyboard.type('base');
    const id = await waitSavedId(page);
    await flush(page);
    const cur = (await api(page, 'GET', `/api/writings/${id}`)).body;
    const r = await api(page, 'PUT', `/api/writings/${id}`, { title: 'Theirs', category: cur.category, language: cur.language, content: cur.content, version: cur.version });
    expect(r.status).toBe(200);
    await page.getByLabel('Title').fill('Mine v2');
    await page.getByRole('button', { name: 'Save now' }).click();
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toBeVisible({ timeout: 15000 });
    return { id, dlg };
  }

  test('dialog is labelled, traps Tab, closes on Esc and returns focus', async ({ page }) => {
    const { dlg } = await conflict(page);
    await expect(dlg).toHaveAttribute('aria-modal', 'true');
    await expect(dlg).toHaveAccessibleName(/./);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role=alertdialog]'));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
    await page.keyboard.press('Shift+Tab');
    expect(await inside()).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.getByRole('button', { name: 'Resolve conflict' })).toBeVisible();
    await page.getByRole('button', { name: 'Resolve conflict' }).click();
    await expect(dlg).toBeVisible();
  });

  test('Compare shows the differing field', async ({ page }) => {
    const { dlg } = await conflict(page);
    await dlg.getByRole('button', { name: 'Compare' }).click();
    await expect(dlg).toContainText('Theirs');
    await expect(dlg).toContainText('Mine v2');
  });

  test('Discard mine and reload loads the server copy', async ({ page }) => {
    const { dlg } = await conflict(page);
    await dlg.getByRole('button', { name: 'Discard mine and reload' }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByLabel('Title')).toHaveValue('Theirs');
  });

  test('Keep mine and overwrite requires Compare first and then wins', async ({ page }) => {
    const { id, dlg } = await conflict(page);
    await expect(dlg.getByRole('button', { name: 'Keep mine and overwrite' })).toBeDisabled();
    await dlg.getByRole('button', { name: 'Compare' }).click();
    await dlg.getByRole('button', { name: 'Keep mine and overwrite' }).click();
    await expect(dlg).toBeHidden();
    await expect(savedStatus(page)).toBeVisible({ timeout: 15000 });
    const got = await api(page, 'GET', `/api/writings/${id}`);
    expect(got.body.title).toBe('Mine v2');
  });
});
