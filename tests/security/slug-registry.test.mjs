import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { claimSlug, releaseSlug } from '../../src/lib/slug-registry.js';

// In-memory stand-in with Mongo's unique-index semantics (duplicate -> error code 11000).
function fakeModel() {
  const rows = new Map();
  return {
    rows,
    async create({ slug, writingId }) {
      await Promise.resolve(); // yield, so concurrent callers interleave
      if (rows.has(slug)) throw Object.assign(new Error('dup'), { code: 11000 });
      rows.set(slug, writingId);
    },
    findOne({ slug }) {
      const v = rows.get(slug);
      return { select: () => ({ lean: async () => (v ? { writingId: v } : null) }) };
    },
    async deleteOne({ slug, writingId }) {
      if (String(rows.get(slug)) === String(writingId)) rows.delete(slug);
    },
  };
}

describe('slug registry', () => {
  it('first claim wins, second writing loses, same writing is idempotent', async () => {
    const M = fakeModel();
    assert.deepEqual(await claimSlug('rain', 'A', M), { ok: true, created: true });
    assert.deepEqual(await claimSlug('rain', 'B', M), { ok: false });
    assert.deepEqual(await claimSlug('rain', 'A', M), { ok: true, created: false });
  });
  it('concurrent claims for one slug: exactly one winner', async () => {
    const M = fakeModel();
    const res = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((w) => claimSlug('storm', w, M)));
    assert.equal(res.filter((r) => r.ok).length, 1);
  });
  it('release only removes the caller’s own claim', async () => {
    const M = fakeModel();
    await claimSlug('x', 'A', M);
    await releaseSlug('x', 'B', M);
    assert.equal(M.rows.has('x'), true);
    await releaseSlug('x', 'A', M);
    assert.equal(M.rows.has('x'), false);
  });
  it('rethrows non-duplicate errors', async () => {
    const M = { create: async () => { throw new Error('network'); } };
    await assert.rejects(() => claimSlug('x', 'A', M), /network/);
  });
});
