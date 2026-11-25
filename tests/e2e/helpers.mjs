import { expect } from '@playwright/test';

export async function checkViewport(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  const m = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(m).toEqual({ w, h }); // measured, not assumed
}
export const editor = (page) => page.locator('.ProseMirror[contenteditable="true"]');
export const isEditorFocused = (page) =>
  page.evaluate(() => document.activeElement?.classList.contains('ProseMirror') ?? false);
export async function newWriting(page) {
  await page.goto('/admin/writings/new');
  await expect(editor(page)).toBeVisible();
}
export async function waitSavedId(page) {
  await page.waitForURL(/\/admin\/writings\/[0-9a-f]{24}$/, { timeout: 20000 });
  return page.url().split('/').pop();
}
export async function api(page, method, url, data) {
  const r = await page.request.fetch(url, { method, data, headers: { Origin: new URL(page.url() === 'about:blank' ? 'http://127.0.0.1' : page.url()).origin } });
  return { status: r.status(), body: await r.json().catch(() => null) };
}
export const doc = (...blocks) => ({ type: 'doc', content: blocks });
export const para = (t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : undefined });
