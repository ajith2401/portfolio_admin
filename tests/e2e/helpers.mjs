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
// Runs fetch inside the page so the browser's own cookie rules apply (Playwright's request jar skips Secure cookies over http).
export async function api(page, method, url, data) {
  return page.evaluate(async ([m, u, d]) => {
    const r = await fetch(u, { method: m, credentials: 'include', headers: d ? { 'Content-Type': 'application/json' } : {}, body: d ? JSON.stringify(d) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [method, url, data]);
}
export const doc = (...blocks) => ({ type: 'doc', content: blocks });
export const para = (t) => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : undefined });
