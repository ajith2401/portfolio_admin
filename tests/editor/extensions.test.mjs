import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { buildExtensions } from '../../src/lib/editor/extensions.js';
import { NODE_SPEC, MARK_SPEC, validateDoc } from '../../src/lib/content-contract/document.js';

describe('Tiptap schema matches the shared contract', () => {
  const schema = getSchema(buildExtensions({ forSchema: true }));
  it('has exactly the contract nodes', () => {
    const got = Object.keys(schema.nodes).sort();
    assert.deepEqual(got, Object.keys(NODE_SPEC).sort());
  });
  it('has exactly the contract marks', () => {
    assert.deepEqual(Object.keys(schema.marks).sort(), Object.keys(MARK_SPEC).sort());
  });
  it('a poem with stanzas and line breaks round-trips through the schema and validates', () => {
    const doc = { type: 'doc', content: [{ type: 'poem', attrs: { align: 'center' }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'மழை பெய்தது' }, { type: 'hardBreak' }, { type: 'text', text: 'நிலம் குளிர்ந்தது' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'இரண்டாம் பத்தி', marks: [{ type: 'italic' }] }] } ] }] };
    const node = schema.nodeFromJSON(doc);
    node.check();
    assert.equal(validateDoc(node.toJSON()).ok, true);
  });
  it('rejects a heading inside a blockquote (contract)', () => {
    const bad = { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }] }] };
    assert.throws(() => schema.nodeFromJSON(bad).check());
  });
});
