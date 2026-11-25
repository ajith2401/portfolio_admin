import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialSave, saveReducer as r, shouldSave, saveDelay, classifyFailure } from '../../src/lib/editor/autosave.js';

describe('autosave state machine', () => {
  it('edit -> dirty -> saving -> saved with new version', () => {
    let s = r(initialSave(1), { type: 'EDIT', valid: true });
    assert.equal(s.status, 'dirty'); assert.ok(shouldSave(s));
    s = r(s, { type: 'SAVE_START' }); assert.equal(s.status, 'saving'); assert.ok(!shouldSave(s));
    s = r(s, { type: 'SAVE_OK', version: 2 }); assert.deepEqual([s.status, s.version], ['saved', 2]);
  });
  it('invalid content never autosaves', () => {
    const s = r(initialSave(1), { type: 'EDIT', valid: false });
    assert.equal(s.status, 'invalid'); assert.ok(!shouldSave(s));
  });
  it('an edit during a save stays dirty afterwards', () => {
    let s = r(r(initialSave(1), { type: 'EDIT', valid: true }), { type: 'SAVE_START' });
    s = r(s, { type: 'EDIT', valid: true }); assert.equal(s.status, 'saving');
    s = r(s, { type: 'SAVE_OK', version: 2 }); assert.equal(s.status, 'dirty');
  });
  it('409 enters conflict, blocks further saves and edits do not clear it', () => {
    let s = r(r(initialSave(1), { type: 'EDIT', valid: true }), { type: 'SAVE_START' });
    s = r(s, { type: 'SAVE_FAIL', kind: classifyFailure(409) });
    assert.equal(s.status, 'conflict'); assert.ok(!shouldSave(s));
    assert.equal(r(s, { type: 'EDIT', valid: true }).status, 'conflict');
    assert.equal(r(s, { type: 'RESOLVED', version: 5, keepLocal: false }).status, 'clean');
    const kept = r(s, { type: 'RESOLVED', version: 5, keepLocal: true });
    assert.deepEqual([kept.status, kept.version], ['dirty', 5]);
  });
  it('offline holds saves, reconnect resumes, network errors back off and stop after 5', () => {
    let s = r(r(initialSave(1), { type: 'EDIT', valid: true }), { type: 'OFFLINE' });
    assert.equal(s.status, 'offline'); assert.ok(!shouldSave(s));
    s = r(s, { type: 'ONLINE' }); assert.equal(s.status, 'dirty');
    for (let i = 0; i < 5; i++) s = r(r(s, { type: 'SAVE_START' }), { type: 'SAVE_FAIL', kind: 'network' });
    assert.ok(!shouldSave(s)); assert.ok(saveDelay({ attempts: 10 }) <= 30000); assert.ok(saveDelay({ attempts: 2 }) > saveDelay({ attempts: 0 }));
  });
  it('classifies HTTP failures', () => {
    assert.deepEqual([0, 409, 428, 422, 401, 429, 500].map(classifyFailure), ['network', 'conflict', 'conflict', 'validation', 'auth', 'rate', 'server']);
  });
});
