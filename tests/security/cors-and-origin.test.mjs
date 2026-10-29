import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrigin, ALLOWED_ORIGINS } from '../../src/lib/auth.js';

describe('Security: CORS & Origin Validation', () => {
  it('allows legitimate admin and portfolio origins', () => {
    for (const origin of ALLOWED_ORIGINS) {
      const req = new Request('http://localhost:3000/api/writings', {
        headers: { origin }
      });
      assert.equal(validateOrigin(req), true, `Should allow ${origin}`);
    }
  });

  it('rejects malicious external origins', () => {
    const maliciousOrigins = [
      'https://malicious-site.com',
      'https://attacker-domain.org',
      'http://localhost:8080',
      'https://evil.ajithkumar.com.attacker.com',
      'null'
    ];

    for (const origin of maliciousOrigins) {
      const req = new Request('http://localhost:3000/api/writings', {
        headers: { origin }
      });
      assert.equal(validateOrigin(req), false, `Should reject ${origin}`);
    }
  });

  it('rejects origin suffix bypass attempts', () => {
    // Attempting to match 'https://admin.ajithkumar.com' as a substring
    const suffixAttack = 'https://admin.ajithkumar.com.malicious.net';
    const req = new Request('http://localhost:3000/api/writings', {
      headers: { origin: suffixAttack }
    });
    assert.equal(validateOrigin(req), false);
  });

  it('validates referer origin correctly when origin header is omitted', () => {
    const validRefererReq = new Request('http://localhost:3000/api/writings', {
      headers: { referer: 'https://admin.ajithkumar.com/dashboard/writings' }
    });
    assert.equal(validateOrigin(validRefererReq), true);

    const evilRefererReq = new Request('http://localhost:3000/api/writings', {
      headers: { referer: 'https://evil.com/phishing' }
    });
    assert.equal(validateOrigin(evilRefererReq), false);
  });
});

