import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSavePayload, formFromServer, diffFields, apiRequest, isSavable, errorMessage } from '../../src/lib/editor/writing-client.js';

const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
describe('writing client helpers', () => {
  it('autosave payload never carries slug or status, but explicit extras do', () => {
    const form = { ...formFromServer({ title: 'தலைப்பு', category: 'poem', language: 'Tamil', slug: 'old', status: 'published', seo: { title: 'x' } }) };
    const p = buildSavePayload({ form, doc, version: 3 });
    assert.ok(!('slug' in p) && !('status' in p));
    assert.deepEqual([p.version, p.contentFormat, p.seo.title], [3, 'tiptap', 'x']);
    assert.equal(buildSavePayload({ form, doc, version: 3, extra: { status: 'draft' } }).status, 'draft');
    assert.ok(!('version' in buildSavePayload({ form, doc })));
  });
  it('a document is savable only with a title and a valid doc', () => {
    assert.equal(isSavable({ form: { title: ' ', category: 'poem', language: 'Tamil' }, valid: true }), false);
    assert.equal(isSavable({ form: { title: 'a', category: 'poem', language: 'Tamil' }, valid: false }), false);
    assert.equal(isSavable({ form: { title: 'a', category: 'poem', language: 'Tamil' }, valid: true }), true);
  });
  it('diffFields lists only differing fields', () => {
    assert.deepEqual(diffFields({ title: 'a', category: 'poem' }, { title: 'b', category: 'poem' }).map((d) => d.field), ['title']);
  });
  it('apiRequest maps network failure, 409 and success without throwing', async () => {
    assert.equal((await apiRequest('GET', '/x', null, async () => { throw new Error('down'); })).kind, 'network');
    const mk = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
    const c = await apiRequest('PUT', '/x', { a: 1 }, mk(409, { error: 'Conflict', details: ['stale'] }));
    assert.deepEqual([c.ok, c.kind, errorMessage(c.data)], [false, 'conflict', 'Conflict: stale']);
    assert.equal((await apiRequest('GET', '/x', null, mk(200, { version: 2 }))).data.version, 2);
  });
});

import { excerptLine } from '../../src/lib/editor/writing-client.js';
describe('excerpt display', () => {
  it('shows stored multi-line excerpts with spaces, Tamil intact, stored value untouched', () => {
    const stored = 'முதல் வரி\nஇரண்டாம் வரி\r\n\r\nமூன்றாம்';
    assert.equal(excerptLine(stored), 'முதல் வரி இரண்டாம் வரி மூன்றாம்');
    assert.equal(excerptLine('a '), 'a ');
    assert.equal(stored.includes('\n'), true);
  });
});
