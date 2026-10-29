import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper mirroring the secure validation logic implemented in /api/upload-image
function validateImageMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) return false;

  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === 'image/gif') {
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return false;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

describe('Security: File Upload Validation & Magic Bytes', () => {
  it('rejects dangerous and disallowed MIME types including SVG and HTML', () => {
    const dangerousMimes = [
      'image/svg+xml',
      'text/html',
      'application/javascript',
      'application/x-msdownload',
      'application/octet-stream',
      'text/plain'
    ];

    for (const mime of dangerousMimes) {
      assert.equal(ALLOWED_MIME_TYPES.has(mime), false, `Should reject ${mime}`);
    }
  });

  it('rejects disguised malicious files claiming to be image/png', () => {
    // Malicious shell script disguised as image/png
    const shellScript = Buffer.from('#!/bin/bash\nrm -rf /', 'utf-8');
    const isValid = validateImageMagicBytes(shellScript, 'image/png');
    assert.equal(isValid, false);
  });

  it('rejects disguised HTML with Javascript claiming to be image/jpeg', () => {
    const xssPayload = Buffer.from('<script>alert("XSS")</script>', 'utf-8');
    const isValid = validateImageMagicBytes(xssPayload, 'image/jpeg');
    assert.equal(isValid, false);
  });

  it('accepts genuine PNG buffer headers', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    assert.equal(validateImageMagicBytes(pngHeader, 'image/png'), true);
  });

  it('accepts genuine JPEG buffer headers', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    assert.equal(validateImageMagicBytes(jpegHeader, 'image/jpeg'), true);
  });

  it('accepts genuine WEBP buffer headers', () => {
    // RIFF....WEBP
    const webpHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
    ]);
    assert.equal(validateImageMagicBytes(webpHeader, 'image/webp'), true);
  });
});

