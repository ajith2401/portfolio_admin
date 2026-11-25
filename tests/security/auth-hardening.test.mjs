import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecretBytes, validateOrigin, signToken, getAuthenticatedUser } from '../../src/lib/auth.js';

describe('Auth hardening', () => {
  it('fails closed in production without a real JWT_SECRET', () => {
    assert.throws(() => getJwtSecretBytes({ NODE_ENV: 'production' }));
    assert.throws(() => getJwtSecretBytes({ NODE_ENV: 'production', JWT_SECRET: 'dev-insecure-jwt-secret-replace-in-production' }));
    assert.ok(getJwtSecretBytes({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }).length > 0);
    assert.ok(getJwtSecretBytes({ NODE_ENV: 'development' }).length > 0);
  });
  it('rejects tokens signed with another algorithm / secret / none', async () => {
    const forged = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"userId":"1","role":"admin"}').toString('base64url')}.`;
    const req = new Request('http://x/api', { headers: { authorization: `Bearer ${forged}` } });
    assert.equal((await getAuthenticatedUser(req)).valid, false);
    const good = await signToken({ userId: '1', role: 'admin', email: 'a@b.c' });
    const ok = await getAuthenticatedUser(new Request('http://x/api', { headers: { authorization: `Bearer ${good}` } }));
    assert.equal(ok.valid, true);
    const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
    assert.equal((await getAuthenticatedUser(new Request('http://x/api', { headers: { authorization: `Bearer ${tampered}` } }))).valid, false);
  });
  it('a cookie-authenticated mutation without Origin/Referer is rejected (CSRF), a token-less CLI call is not', () => {
    assert.equal(validateOrigin(new Request('http://x/api', { method: 'POST', headers: { cookie: 'token=abc' } })), false);
    assert.equal(validateOrigin(new Request('http://x/api', { method: 'POST', headers: { cookie: 'theme=dark' } })), true);
    assert.equal(validateOrigin(new Request('http://x/api', { method: 'POST', headers: { authorization: 'Bearer t' } })), true);
    assert.equal(validateOrigin(new Request('http://x/api', { method: 'POST', headers: { cookie: 'token=abc', origin: 'https://evil.example' } })), false);
  });
});
