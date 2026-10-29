import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, requireAuth, getAuthenticatedUser, createSessionCookie, clearSessionCookie } from '../../src/lib/auth.js';

describe('Security: Authentication & RBAC', () => {
  it('rejects unauthenticated requests to protected handlers with 401', async () => {
    const fakeRequest = new Request('http://localhost:3000/api/writings', {
      method: 'POST',
      headers: {}
    });

    const result = await requireAuth(fakeRequest, ['admin', 'editor']);
    assert.equal(result.authorized, false);
    assert.ok(result.response);
    assert.equal(result.response.status, 401);
    
    const body = await result.response.json();
    assert.equal(body.error, 'Unauthorized: Authentication required');
  });

  it('rejects requests with an invalid/tampered token with 401', async () => {
    const fakeRequest = new Request('http://localhost:3000/api/writings', {
      method: 'POST',
      headers: {
        'cookie': 'token=invalid.tampered.token'
      }
    });

    const result = await requireAuth(fakeRequest, ['admin', 'editor']);
    assert.equal(result.authorized, false);
    assert.equal(result.response.status, 401);
  });

  it('authorizes valid admin token for admin operations', async () => {
    const token = await signToken({
      userId: '60c72b2f9b1d8b2bad8e9999',
      role: 'admin',
      email: 'admin@ajithkumar.com'
    }, '1h');

    const fakeRequest = new Request('http://localhost:3000/api/writings', {
      method: 'POST',
      headers: {
        'cookie': `token=${token}`
      }
    });

    const result = await requireAuth(fakeRequest, ['admin', 'editor']);
    assert.equal(result.authorized, true);
    assert.equal(result.user.role, 'admin');
    assert.equal(result.user.email, 'admin@ajithkumar.com');
  });

  it('authorizes valid Bearer authorization header', async () => {
    const token = await signToken({
      userId: '60c72b2f9b1d8b2bad8e8888',
      role: 'editor',
      email: 'editor@ajithkumar.com'
    }, '1h');

    const fakeRequest = new Request('http://localhost:3000/api/writings', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`
      }
    });

    const result = await requireAuth(fakeRequest, ['admin', 'editor']);
    assert.equal(result.authorized, true);
    assert.equal(result.user.role, 'editor');
  });

  it('forbids editor role when admin role is strictly required with 403', async () => {
    const token = await signToken({
      userId: '60c72b2f9b1d8b2bad8e8888',
      role: 'editor',
      email: 'editor@ajithkumar.com'
    }, '1h');

    const fakeRequest = new Request('http://localhost:3000/api/delete-image', {
      method: 'DELETE',
      headers: {
        'cookie': `token=${token}`
      }
    });

    const result = await requireAuth(fakeRequest, ['admin']);
    assert.equal(result.authorized, false);
    assert.equal(result.response.status, 403);
    const body = await result.response.json();
    assert.equal(body.error, 'Forbidden: Insufficient privileges');
  });

  it('generates secure cookie headers with HttpOnly and SameSite=lax', () => {
    const cookie = createSessionCookie('test-token-12345', 3600);
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('SameSite=Lax') || cookie.includes('SameSite=lax'));
    assert.ok(cookie.includes('Path=/'));
    assert.ok(cookie.includes('Max-Age=3600'));
  });

  it('generates expired cookie string upon logout', () => {
    const clearCookie = clearSessionCookie();
    assert.ok(clearCookie.includes('Max-Age=0'));
    assert.ok(clearCookie.includes('HttpOnly'));
  });
});

