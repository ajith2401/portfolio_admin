import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, sanitizeData } from '../../src/lib/sanitize.js';

describe('Security: Stored & DOM XSS Sanitization', () => {
  it('strips script tags and malicious executable scripts', () => {
    const malicious = '<p>Normal text</p><script>alert("XSS")</script>';
    const cleaned = sanitizeHtml(malicious);
    assert.equal(cleaned.includes('<script>'), false);
    assert.equal(cleaned.includes('alert'), false);
    assert.equal(cleaned.includes('Normal text'), true);
  });

  it('strips inline event handlers (onerror, onload, onclick)', () => {
    const malicious = '<img src="invalid-image" onerror="alert(document.cookie)" alt="avatar">';
    const cleaned = sanitizeHtml(malicious);
    assert.equal(cleaned.includes('onerror'), false);
    assert.equal(cleaned.includes('alert'), false);
  });

  it('neutralizes javascript: URIs in anchor links', () => {
    const malicious = '<a href="javascript:stealTokens()">Click here</a>';
    const cleaned = sanitizeHtml(malicious);
    assert.equal(cleaned.includes('javascript:'), false);
    assert.equal(cleaned.includes('stealTokens'), false);
  });

  it('strips dangerous embedded elements: iframe, object, embed', () => {
    const malicious = '<iframe src="http://attacker.com/steal"></iframe><object data="bad.swf"></object>';
    const cleaned = sanitizeHtml(malicious);
    assert.equal(cleaned.includes('<iframe'), false);
    assert.equal(cleaned.includes('<object'), false);
  });

  it('strictly preserves Tamil Unicode script and poetic typography', () => {
    const tamilPoem = `
      <div class="tamil-poem">
        <h2>யாதும் ஊரே யாவரும் கேளிர்</h2>
        <p>தீதும் நன்றும் பிறர்தர வாரா</p>
        <p>நோதலும் தணிதலும் அவற்றோ ரன்ன</p>
      </div>
    `;
    const cleaned = sanitizeHtml(tamilPoem);
    assert.ok(cleaned.includes('யாதும் ஊரே யாவரும் கேளிர்'));
    assert.ok(cleaned.includes('தீதும் நன்றும் பிறர்தர வாரா'));
    assert.ok(cleaned.includes('நோதலும் தணிதலும் அவற்றோ ரன்ன'));
    assert.ok(cleaned.includes('tamil-poem'));
  });

  it('preserves code blocks and syntax highlighting structures', () => {
    const codeSnippet = '<pre><code>const secure = true;\nif (secure) { console.log("OK"); }</code></pre>';
    const cleaned = sanitizeHtml(codeSnippet);
    assert.ok(cleaned.includes('<pre>'));
    assert.ok(cleaned.includes('<code>'));
    assert.ok(cleaned.includes('const secure = true;'));
  });

  it('recursively sanitizes nested objects and arrays with sanitizeData', () => {
    const input = {
      title: 'Valid Title <script>alert(1)</script>',
      tags: ['safe', '<b onmouseover="alert(2)">tag</b>'],
      metadata: {
        bio: 'Tamil bio: என் பெயர் அஜித் <img src=x onerror=alert(3)>'
      }
    };

    const sanitized = sanitizeData(input);
    assert.equal(sanitized.title.includes('<script>'), false);
    assert.ok(sanitized.title.includes('Valid Title'));
    assert.equal(sanitized.tags[1].includes('onmouseover'), false);
    assert.ok(sanitized.metadata.bio.includes('என் பெயர் அஜித்'));
    assert.equal(sanitized.metadata.bio.includes('onerror'), false);
  });
});

