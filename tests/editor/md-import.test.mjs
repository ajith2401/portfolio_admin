import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToDoc } from '../../src/lib/editor/md-import.js';
import { validateDoc, docToPlainText, docHeadings, docImages, canonicalizeDoc } from '../../src/lib/content-contract/index.js';

const story = `# மழை நாள்\n\nஅவள் **மெல்ல** நடந்தாள். *குடை* இல்லை.\n\n> "நனைந்தால் என்ன?"\n\n- ஒன்று\n- இரண்டு\n\n---\n\n![மழை](https://res.cloudinary.com/x/a.jpg "தலைப்பு")\n\n[இணைப்பு](https://example.com) ~~பழையது~~`;

describe('Markdown importer (Tamil story)', () => {
  const { doc, warnings } = markdownToDoc(story, { category: 'short story' });
  it('produces a valid document', () => assert.deepEqual(validateDoc(doc), { ok: true, errors: [] }));
  it('keeps headings, images with caption and alt', () => {
    assert.deepEqual(docHeadings(doc), [{ level: 1, text: 'மழை நாள்' }]);
    assert.deepEqual(docImages(doc), [{ url: 'https://res.cloudinary.com/x/a.jpg', alt: 'மழை', caption: 'தலைப்பு' }]);
  });
  it('maps strike, bold, italic, link marks', () => {
    const json = JSON.stringify(doc);
    for (const m of ['bold', 'italic', 'strike', 'link']) assert.ok(json.includes(`"type":"${m}"`), m);
  });
  it('soft line breaks become spaces in prose', () => {
    const t = 'ஒரு நீண்ட வாக்கியம் இங்கே தொடங்கி, அடுத்த வரியிலும் தொடர்ந்து\nமுடிவுக்கு வருகிறது.';
    const r = markdownToDoc(t, { category: 'article' });
    assert.equal(docToPlainText(r.doc), t.replace('\n', ' '));
  });
  it('reports no warnings for clean input', () => assert.deepEqual(warnings, []));
  it('is canonical already', () => assert.deepEqual(canonicalizeDoc(doc), doc));
});

describe('Markdown importer (poems)', () => {
  it('keeps line breaks and stanzas in a poem block', () => {
    const { doc } = markdownToDoc('வானம் அழுதது,\nமண் சிரித்தது.\n\nஇரண்டாம் பத்தி\nஇன்னொரு வரி', { category: 'poem' });
    assert.equal(doc.content.length, 1);
    assert.equal(doc.content[0].type, 'poem');
    assert.equal(doc.content[0].content.length, 2);
    assert.equal(docToPlainText(doc), 'வானம் அழுதது,\nமண் சிரித்தது.\n\nஇரண்டாம் பத்தி\nஇன்னொரு வரி');
    assert.ok(validateDoc(doc).ok);
  });
  it('short two-line poem stays intact', () => {
    const { doc } = markdownToDoc('மழை\nஇரவு', { category: 'poem' });
    assert.equal(docToPlainText(doc), 'மழை\nஇரவு');
  });
  it('empty input yields a valid empty document', () => {
    const { doc } = markdownToDoc('', {});
    assert.ok(validateDoc(doc).ok);
    assert.equal(docToPlainText(doc), '');
  });
});

describe('Markdown importer (hostile input)', () => {
  const hostile = `[x](javascript:alert(1)) [y](data:text/html,<script>1</script>) ![i](javascript:alert(2))\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[z](vbscript:msgbox) [ok](https://example.com)`;
  const { doc, warnings } = markdownToDoc(hostile, {});
  it('still validates against the schema', () => assert.ok(validateDoc(doc).ok, validateDoc(doc).errors.join()));
  it('drops unsafe urls and warns', () => {
    const json = JSON.stringify(doc);
    assert.ok(!/javascript:|vbscript:|data:text/i.test(json));
    assert.ok(warnings.some((w) => /Unsafe link/.test(w)));
    assert.ok(warnings.some((w) => /Unsafe image/.test(w)));
  });
  it('keeps raw HTML only as literal text', () => {
    const json = JSON.stringify(doc);
    assert.ok(json.includes('<script>alert(1)</script>'));
    assert.ok(warnings.some((w) => /Raw HTML/.test(w)));
    // never a node type or attr outside the spec
    assert.ok(!/"onerror"/.test(json.replace(/<img[^"]*"/g, '')));
  });
  it('survives deeply nested and huge input without throwing', () => {
    const r = markdownToDoc('> '.repeat(500) + 'x', {});
    assert.ok(validateDoc(r.doc).ok);
    const big = markdownToDoc('அ'.repeat(2_500_000), {});
    assert.ok(big.warnings.some((w) => /longer than/.test(w)));
  });
  it('converts headings/code inside list items instead of losing them silently', () => {
    const r = markdownToDoc('- item\n\n  ```\n  code\n  ```\n', {});
    assert.ok(validateDoc(r.doc).ok);
    assert.ok(r.warnings.some((w) => /code block inside a list item/.test(w)));
    assert.ok(docToPlainText(r.doc).includes('code'));
  });
});

describe('Markdown importer: single line breaks', () => {
  const wrapped = 'அவன் காலையில் எழுந்து வயலுக்குச் சென்றான், அங்கே மழை பெய்து கொண்டிருந்தது என்பதை\nஅவன் கவனிக்கவே இல்லை; நீண்ட நேரம் கழித்து வீடு திரும்பிய போது அம்மா காத்திருந்தாள்.';
  const verse = 'நிலவு மெல்ல\nஇரவு சொல்ல\nகனவு வந்து\nகதவு தட்ட';
  it('joins a wrapped Tamil story paragraph and warns with an actionable message', () => {
    const r = markdownToDoc(wrapped, { category: 'short story' });
    assert.ok(!docToPlainText(r.doc).includes('\n'));
    assert.ok(r.warnings.some((w) => /1 paragraph contains single line breaks that were joined/.test(w) && /Keep line breaks/.test(w)));
  });
  it('multiline English story is joined, counts paragraphs', () => {
    const t = 'The rain kept falling on the old tin roof all through the long\nafternoon and nobody came.\n\nLater the lamp went out and the house was quiet for\nthe first time in years, so she slept.';
    const r = markdownToDoc(t, { category: 'short story' });
    assert.equal(docToPlainText(r.doc).split('\n').length, 3); // two paragraphs separated by one blank line
    assert.ok(r.warnings.some((w) => /^2 paragraphs contain/.test(w)));
  });
  it('poem-like text classified as story keeps its lines and says so', () => {
    const r = markdownToDoc(verse, { category: 'short story' });
    assert.equal(docToPlainText(r.doc), verse);
    assert.ok(r.warnings.some((w) => /look|looks like verse/.test(w) && /Join wrapped lines/.test(w)));
  });
  it('stanza boundaries are preserved either way', () => {
    const r = markdownToDoc(verse + '\n\n' + verse, { category: 'article' });
    assert.equal(r.doc.content.length, 2);
  });
  it('explicit modes override the guess; hard breaks always survive', () => {
    assert.equal(docToPlainText(markdownToDoc(wrapped, { lineBreaks: 'keep' }).doc).split('\n').length, 2);
    assert.ok(!docToPlainText(markdownToDoc(verse, { lineBreaks: 'join' }).doc).includes('\n'));
    assert.equal(docToPlainText(markdownToDoc('ஒன்று  \nஇரண்டு\\\nமூன்று', { lineBreaks: 'join' }).doc), 'ஒன்று\nஇரண்டு\nமூன்று');
  });
  it('never drops text: all words survive every mode', () => {
    for (const lineBreaks of ['auto', 'keep', 'join'])
      assert.equal(docToPlainText(markdownToDoc(wrapped, { lineBreaks }).doc).replace(/\s+/g, ' '), wrapped.replace(/\s+/g, ' '));
  });
  it('output stays valid and canonical', () => {
    const { doc } = markdownToDoc(verse + '\n\n' + wrapped, { category: 'essay' });
    assert.ok(validateDoc(doc).ok);
    assert.deepEqual(canonicalizeDoc(doc), doc);
  });
});
