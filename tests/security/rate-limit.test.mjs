import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRateLimit, globalRateLimiter } from '../../src/lib/rateLimit.js';

describe('Security: Sliding Window Rate Limiting', () => {
  it('allows requests within the limit', () => {
    const ip = '192.168.1.100';
    const fakeRequest = new Request('http://localhost:3000/api/login', {
      headers: { 'x-forwarded-for': ip }
    });

    const res1 = applyRateLimit(fakeRequest, 'test-limit', 3, 10000);
    assert.equal(res1.allowed, true);
    assert.equal(res1.response, null);

    const res2 = applyRateLimit(fakeRequest, 'test-limit', 3, 10000);
    assert.equal(res2.allowed, true);

    const res3 = applyRateLimit(fakeRequest, 'test-limit', 3, 10000);
    assert.equal(res3.allowed, true);
  });

  it('blocks and returns 429 when limit is exceeded', async () => {
    const ip = '192.168.1.101';
    const fakeRequest = new Request('http://localhost:3000/api/login', {
      headers: { 'x-forwarded-for': ip }
    });

    // 2 allowed requests
    applyRateLimit(fakeRequest, 'test-exceed', 2, 10000);
    applyRateLimit(fakeRequest, 'test-exceed', 2, 10000);

    // 3rd request must be blocked
    const blocked = applyRateLimit(fakeRequest, 'test-exceed', 2, 10000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.response);
    assert.equal(blocked.response.status, 429);

    const body = await blocked.response.json();
    assert.equal(body.error, 'Too many requests. Please try again later.');
    assert.ok(blocked.response.headers.get('Retry-After'));
    assert.equal(blocked.response.headers.get('X-RateLimit-Remaining'), '0');
  });

  it('isolates different IP addresses', () => {
    const reqA = new Request('http://localhost:3000/api/login', {
      headers: { 'x-forwarded-for': '10.0.0.1' }
    });
    const reqB = new Request('http://localhost:3000/api/login', {
      headers: { 'x-forwarded-for': '10.0.0.2' }
    });

    // Exhaust limit for reqA
    applyRateLimit(reqA, 'test-isolate', 1, 10000);
    const blockedA = applyRateLimit(reqA, 'test-isolate', 1, 10000);
    assert.equal(blockedA.allowed, false);

    // reqB should still be allowed
    const allowedB = applyRateLimit(reqB, 'test-isolate', 1, 10000);
    assert.equal(allowedB.allowed, true);
  });

  it('allows manual reset of rate limit key', () => {
    const ip = '10.0.0.5';
    const req = new Request('http://localhost:3000/api/login', {
      headers: { 'x-forwarded-for': ip }
    });

    applyRateLimit(req, 'test-reset', 1, 10000);
    assert.equal(applyRateLimit(req, 'test-reset', 1, 10000).allowed, false);

    // Reset key
    globalRateLimiter.reset(`test-reset:${ip}`);

    // Should be allowed again
    assert.equal(applyRateLimit(req, 'test-reset', 1, 10000).allowed, true);
  });
});

