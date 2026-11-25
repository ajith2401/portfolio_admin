import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notifyPortfolio } from '../../src/lib/revalidate.js';

describe('Portfolio revalidation hook', () => {
  it('is a visible no-op when the URL is not configured', async () => {
    const r = await notifyPortfolio({ slug: 'a' }, { env: {} });
    assert.equal(r.status, 'skipped');
    assert.match(r.warning, /PORTFOLIO_REVALIDATE_URL/);
  });
  it('refuses plain http to a remote host (secret would travel in clear text)', async () => {
    const r = await notifyPortfolio({ slug: 'a' }, { env: { PORTFOLIO_REVALIDATE_URL: 'http://example.com/api/revalidate', REVALIDATE_SECRET: 's' } });
    assert.equal(r.status, 'skipped');
  });
  it('sends bearer auth and the documented body, and never leaks the secret in the result', async () => {
    let seen;
    const r = await notifyPortfolio({ slug: 'new', previousSlugs: ['old'] }, {
      env: { PORTFOLIO_REVALIDATE_URL: 'http://127.0.0.1:3000/api/revalidate', REVALIDATE_SECRET: 'topsecret' },
      fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; },
    });
    assert.deepEqual(r, { status: 'ok' });
    assert.equal(seen.init.headers.Authorization, 'Bearer topsecret');
    assert.deepEqual(JSON.parse(seen.init.body), { slug: 'new', previousSlugs: ['old'] });
    assert.ok(!JSON.stringify(r).includes('topsecret'));
  });
  it('turns failures and timeouts into warnings without throwing', async () => {
    const env = { PORTFOLIO_REVALIDATE_URL: 'https://x.example/api/revalidate', REVALIDATE_SECRET: 's' };
    assert.equal((await notifyPortfolio({ slug: 'a' }, { env, fetchImpl: async () => ({ ok: false, status: 401 }) })).status, 'failed');
    assert.equal((await notifyPortfolio({ slug: 'a' }, { env, fetchImpl: async () => { throw new Error('boom'); } })).status, 'failed');
    const slow = await notifyPortfolio({ slug: 'a' }, { env, timeoutMs: 10, fetchImpl: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) });
    assert.match(slow.warning, /in time/);
  });
});
