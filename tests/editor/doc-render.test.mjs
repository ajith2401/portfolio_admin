import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { docToHtml, docToTree, treeToReact } from '../../src/lib/editor/doc-render.js';

const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('Preview renderer (as published)', () => {
  it('renders poem stanzas as paragraphs with <br> line breaks', () => {
    const doc = { type: 'doc', content: [{ type: 'poem', attrs: { align: 'center' }, content: [
      { type: 'paragraph', content: [t('வானம்'), { type: 'hardBreak' }, t('மண்')] },
      { type: 'paragraph', content: [t('இரவு')] }] }] };
    const { ok, html } = docToHtml(doc);
    assert.ok(ok);
    assert.equal(html, '<div class="poem" data-poem data-align="center"><p>வானம்<br>மண்</p><p>இரவு</p></div>');
  });
  it('renders images as figure/figcaption using the title as the caption', () => {
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://res.cloudinary.com/a.jpg', alt: 'மழை', title: 'தலைப்பு' } }] };
    assert.equal(docToHtml(doc).html, '<figure><img src="https://res.cloudinary.com/a.jpg" alt="மழை" loading="lazy"><figcaption>தலைப்பு</figcaption></figure>');
  });
  it('escapes text and nests marks deterministically', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      t('<script>alert(1)</script>&"'),
      t('b', [{ type: 'italic' }, { type: 'bold' }, { type: 'link', attrs: { href: 'https://e.com/?a=1&b="2"' } }])] }] };
    const { html } = docToHtml(doc);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('<a href="https://e.com/?a=1&amp;b=&quot;2&quot;" rel="noopener noreferrer nofollow"><strong><em>b</em></strong></a>'));
  });
  it('refuses invalid or hostile documents instead of rendering them', () => {
    for (const bad of [
      { type: 'doc', content: [{ type: 'script', content: [] }] },
      { type: 'doc', content: [{ type: 'paragraph', content: [t('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])] }] },
      { type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }] },
      { type: 'doc', content: [{ type: 'paragraph', attrs: { onclick: 'x' } }] },
    ]) {
      const r = docToHtml(bad);
      assert.equal(r.ok, false);
      assert.equal(r.html, '');
    }
  });
  it('React tree has no dangerouslySetInnerHTML and maps class/boolean attributes', () => {
    const doc = { type: 'doc', content: [{ type: 'poem', content: [{ type: 'paragraph', content: [t('a')] }] }] };
    const els = treeToReact(docToTree(doc).tree, (tag, props, ...kids) => ({ tag, props, kids }));
    assert.equal(els[0].props.className, 'poem');
    assert.equal(els[0].props['data-poem'], true);
    assert.ok(!JSON.stringify(els).includes('dangerouslySetInnerHTML'));
  });
});
