import { request } from '@playwright/test';
import { BASE, ADMIN } from './env.mjs';
export default async function () {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE } });
  const r = await ctx.post('/api/login', { data: ADMIN });
  if (!r.ok()) throw new Error('e2e login failed: ' + r.status());
  await ctx.storageState({ path: '.auth/state.json' });
  await ctx.dispose();
}
