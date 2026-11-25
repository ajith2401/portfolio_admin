import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { auditWritings, checkUriAllowed } from '../../src/lib/editor/audit-content.js';

const codes = (r, id) => r.perDoc.find((d) => d.id === id)?.issues.map((i) => i.code) ?? [];
describe('content compat audit', () => {
  it('flags empty, short, duplicate/invalid slug, language mismatch, import warnings', () => {
    const r = auditWritings([
      { _id: 'a', title: 'A', slug: 'dup', body: '', language: 'English' },
      { _id: 'b', title: 'B', slug: 'dup', body: 'hi there', language: 'English' },
      { _id: 'c', title: 'C', slug: 'Bad Slug!', body: 'x '.repeat(40), language: 'English' },
      { _id: 'd', title: 'D', slug: 'd', body: 'வணக்கம் உலகம் இது ஒரு தமிழ் கதை மிகவும் நீண்டது அல்ல ஆனால் போதும்', language: 'English' },
      { _id: 'e', title: 'E', slug: 'e', body: 'Some text <script>alert(1)</script> and more words here to be long enough for sure ok', language: 'English' },
      { _id: 'f', title: 'F', body: 'plain text '.repeat(10), language: 'English' },
    ]);
    assert.ok(codes(r, 'a').includes('empty-body') && codes(r, 'a').includes('duplicate-slug'));
    assert.ok(codes(r, 'b').includes('short-body'));
    assert.ok(codes(r, 'c').includes('invalid-slug'));
    assert.ok(codes(r, 'd').includes('language-mismatch'));
    assert.ok(codes(r, 'f').includes('missing-slug'));
    assert.equal(r.total, 6);
  });
  it('does not mutate its input', () => {
    const d = [{ _id: 'a', title: 'A', slug: 'a', body: '# hi\n\ntext' }];
    const before = JSON.stringify(d);
    auditWritings(d);
    assert.equal(JSON.stringify(d), before);
  });
  it('refuses non-local URIs unless explicitly allowed', () => {
    assert.equal(checkUriAllowed('mongodb+srv://u:p@cluster.mongodb.net/db').ok, false);
    assert.equal(checkUriAllowed('mongodb://prod.example.com/db').ok, false);
    assert.equal(checkUriAllowed('mongodb://127.0.0.1:27018/admin_test').ok, true);
    assert.equal(checkUriAllowed('mongodb://localhost/x').ok, true);
  });
  it('CLI exits 2 on a remote URI without connecting', () => {
    const r = spawnSync('node', ['scripts/audit-content-compat.mjs'], { env: { ...process.env, MONGODB_URI: 'mongodb://example.invalid/prod' }, encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Refusing non-local/);
  });
});
