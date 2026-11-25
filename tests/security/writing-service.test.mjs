import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingChanges, validateStructuredContent, checkDocShape, cleanPlainText } from '../../src/lib/writing-service.js';

const t = (text) => ({ type: 'text', text });
const doc = (...blocks) => ({ type: 'doc', content: blocks });
const para = (s) => ({ type: 'paragraph', content: [t(s)] });
const taken = new Set();
const helpers = { exists: async (s) => taken.has(s), now: new Date('2026-01-01T00:00:00Z') };
const create = (input) => buildWritingChanges({ input, existing: null, helpers });
const stored = (over = {}) => ({ _id: 'a'.repeat(24), title: 'பழைய தலைப்பு', slug: 'old-slug', status: 'draft', version: 3, category: 'short story', contentFormat: 'tiptap', content: doc(para('உள்ளடக்கம்')), body: 'உள்ளடக்கம்', slugHistory: [], ...over });
const update = (input, over) => buildWritingChanges({ input, existing: stored(over), helpers });

describe('Structured content validation (server)', () => {
  it('rejects hostile / malformed documents with specific errors', async () => {
    const bad = [
      doc({ type: 'script' }),
      doc({ type: 'image', attrs: { src: 'javascript:alert(1)' } }),
      doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'data:text/html,x' } }] }] }),
      { type: 'doc', content: [{ type: 'paragraph', content: 'nope' }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [], $where: '1' }] },
      JSON.parse('{"type":"doc","content":[{"type":"paragraph","__proto__":{"x":1}}]}'),
      null, [], 'str',
    ];
    for (const b of bad) {
      const r = await create({ title: 'T', category: 'article', contentFormat: 'tiptap', content: b });
      assert.equal(r.ok, false, JSON.stringify(b));
      assert.equal(r.status, 422);
    }
  });
  it('rejects absurd depth without blowing the stack and oversized payloads', () => {
    let node = para('x');
    for (let i = 0; i < 100_000; i += 1) node = { type: 'blockquote', content: [node] };
    assert.equal(validateStructuredContent(doc(node)).ok, false);
    assert.ok(checkDocShape(doc(node)).length);
    assert.equal(validateStructuredContent(doc(para('அ'.repeat(2_100_000)))).ok, false);
  });
  it('canonicalises (drops unknown attrs and default poem align)', () => {
    const r = validateStructuredContent(doc({ type: 'poem', attrs: { align: 'left', evil: 1 }, content: [para('கவிதை')] }));
    assert.ok(r.ok);
    assert.equal(r.doc.content[0].attrs, undefined);
  });
});

describe('Create', () => {
  it('derives plain-text body and a Tamil slug from the title; never trusts client status fields', async () => {
    const r = await create({
      title: ' மழை <b>நாள்</b> ', category: 'short story', contentFormat: 'tiptap', content: doc(para('அவள்')),
      publishedAt: '2000-01-01', version: 99, ratings: [{ email: 'x' }], averageRating: 5, performance: { views: { total: 1e9 } },
    });
    assert.ok(r.ok, r.errors?.join());
    assert.equal(r.set.title, 'மழை நாள்');
    assert.equal(r.set.slug, 'மழை-நாள்');
    assert.equal(r.set.body, 'அவள்');
    for (const k of ['publishedAt', 'version', 'ratings', 'averageRating', 'performance']) assert.ok(!(k in r.set), k);
    assert.ok(!('status' in r.set));
  });
  it('suffixes a taken slug on create', async () => {
    taken.add('மழை'); 
    const r = await create({ title: 'மழை', category: 'poem', contentFormat: 'tiptap', content: doc({ type: 'poem', content: [para('மழை')] }) });
    assert.equal(r.set.slug, 'மழை-2');
    taken.clear();
  });
  it('publishing on create sets publishedAt via the contract, and a one-line poem is publishable', async () => {
    const r = await create({ title: 'ஒரு வரி', category: 'poem', contentFormat: 'tiptap', status: 'published', content: doc({ type: 'poem', content: [para('மழை')] }) });
    assert.ok(r.ok, r.errors?.join());
    assert.equal(r.set.status, 'published');
    assert.deepEqual(r.set.publishedAt, helpers.now);
  });
  it('cannot publish empty content', async () => {
    const r = await create({ title: 'வெறுமை', category: 'poem', contentFormat: 'tiptap', status: 'published', content: doc({ type: 'paragraph' }) });
    assert.equal(r.ok, false);
    assert.equal(r.status, 422);
  });
  it('rejects bad enums and seo urls; sanitises seo strings', async () => {
    const base = { title: 'T', category: 'article', contentFormat: 'tiptap', content: doc(para('x')) };
    assert.equal((await create({ ...base, category: 'nope' })).ok, false);
    assert.equal((await create({ ...base, language: 'Klingon' })).ok, false);
    assert.equal((await create({ ...base, seo: { canonicalUrl: 'javascript:alert(1)' } })).ok, false);
    assert.equal((await create({ ...base, seo: { ogImage: 'data:image/svg+xml;base64,AAA' } })).ok, false);
    assert.equal((await create({ ...base, images: { large: 'javascript:alert(1)' } })).ok, false);
    const ok = await create({ ...base, seo: { title: '<img src=x onerror=1>Hello', structuredData: { '@type': 'x' }, robots: { index: false } } });
    assert.ok(ok.ok);
    assert.equal(ok.set['seo.title'], 'Hello');
    assert.ok(!Object.keys(ok.set).some((k) => k.includes('structuredData')));
    assert.equal(ok.set['seo.robots.index'], false);
  });
});

describe('Update: concurrency, slug, status', () => {
  it('requires a version (428) and rejects stale versions (409) without writing', async () => {
    const missing = await update({ title: 'x' });
    assert.equal(missing.status, 428);
    const stale = await update({ title: 'x', version: 2 });
    assert.equal(stale.status, 409);
    assert.equal(stale.conflict, true);
    assert.equal(stale.currentVersion, 3);
  });
  it('title edits never change the slug; version increments', async () => {
    const r = await update({ title: 'முற்றிலும் புதிய தலைப்பு', version: 3 }, { status: 'published', publishedAt: '2025-01-01' });
    assert.ok(r.ok, r.errors?.join());
    assert.ok(!('slug' in r.set));
    assert.equal(r.set.version, 4);
  });
  it('explicit slug change keeps slugHistory for published writings and reports URL change', async () => {
    const r = await update({ slug: 'New Slug!', version: 3 }, { status: 'published', publishedAt: '2025-01-01' });
    assert.ok(r.ok, r.errors?.join());
    assert.equal(r.set.slug, 'new-slug');
    assert.deepEqual(r.set.slugHistory.map((h) => h.slug), ['old-slug']);
    assert.equal(r.slugChange.publishedUrlChanged, true);
  });
  it('slug change to a taken slug is a 409, to an ObjectId-looking slug a 422', async () => {
    taken.add('taken');
    assert.equal((await update({ slug: 'taken', version: 3 })).status, 409);
    taken.clear();
    assert.equal((await update({ slug: 'a'.repeat(24), version: 3 })).status, 422);
  });
  it('status goes through planTransition: sets publishedAt once, never client supplied', async () => {
    const r = await update({ status: 'published', publishedAt: '1999-01-01', version: 3 });
    assert.ok(r.ok);
    assert.deepEqual(r.set.publishedAt, helpers.now);
    const again = await update({ status: 'published', version: 3 }, { status: 'draft', publishedAt: '2025-05-05' });
    assert.ok(!('publishedAt' in again.set));
    const bad = await update({ status: 'live', version: 3 });
    assert.equal(bad.status, 422);
  });
  it('unpublish then archive allowed; draft->archived allowed', async () => {
    assert.ok((await update({ status: 'draft', version: 3 }, { status: 'published', publishedAt: '2025-01-01' })).ok);
    assert.ok((await update({ status: 'archived', version: 3 }, { status: 'published', publishedAt: '2025-01-01' })).ok);
  });
  it('blocks blanking a published writing', async () => {
    const r = await update({ content: doc({ type: 'paragraph' }), version: 3 }, { status: 'published', publishedAt: '2025-01-01' });
    assert.equal(r.ok, false);
  });
});

describe('Legacy Markdown protection', () => {
  const legacy = { contentFormat: 'markdown', content: undefined, body: '# பழைய\n\nஉரை', slug: 'legacy' };
  it('never downgrades structured -> markdown', async () => {
    const r = await update({ contentFormat: 'markdown', body: 'x', version: 3 });
    assert.equal(r.status, 422);
  });
  it('converts only with explicit confirmation; preserves original markdown + warnings server-side', async () => {
    const content = doc({ type: 'heading', attrs: { level: 1 }, content: [t('பழைய')] }, para('உரை'));
    const no = await update({ contentFormat: 'tiptap', content, version: 3 }, legacy);
    assert.equal(no.status, 422);
    const yes = await update({ contentFormat: 'tiptap', content, confirmConversion: true, version: 3, importedFrom: { markdown: 'FORGED' } }, legacy);
    assert.ok(yes.ok, yes.errors?.join());
    assert.equal(yes.converted, true);
    assert.equal(yes.set.importedFrom.markdown, '# பழைய\n\nஉரை');
    assert.deepEqual(yes.set.importedFrom.warnings, []);
  });
  it('legacy markdown body updates stay markdown and are sanitised', async () => {
    const r = await update({ body: 'hi <script>alert(1)</script> **x**', version: 3 }, legacy);
    assert.ok(r.ok);
    assert.equal(r.set.contentFormat, undefined);
  });
  it('plain text cleaner strips tags and control characters', () => {
    assert.equal(cleanPlainText('a<script>x</script>\u0000b'), 'axb');
  });
});
