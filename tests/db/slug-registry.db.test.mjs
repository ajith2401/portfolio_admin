// Real-MongoDB verification of the slug registry. Skipped unless E2E_MONGODB_URI (local, name contains "test") is set.
//   E2E_MONGODB_URI=mongodb://127.0.0.1:27218/slugreg_test node --test tests/db/*.test.mjs
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { SlugClaim, claimSlug, releaseSlug } from '../../src/lib/slug-registry.js';

const uri = process.env.E2E_MONGODB_URI;
const ok = uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri) && /test/.test(uri);
const oid = () => new mongoose.Types.ObjectId();

describe('slug registry on real MongoDB', { skip: !ok && 'set E2E_MONGODB_URI to a local *test* db' }, () => {
  before(async () => {
    await mongoose.connect(uri);
    await SlugClaim.deleteMany({});
    await SlugClaim.syncIndexes();
  });
  after(async () => { await SlugClaim.deleteMany({}); await mongoose.disconnect(); });

  it('creates a UNIQUE index on slug', async () => {
    const ix = await SlugClaim.collection.indexes();
    assert.ok(ix.some((i) => i.key.slug === 1 && i.unique === true), JSON.stringify(ix.map((i) => i.key)));
  });
  it('20 simultaneous claims for one slug: exactly one winner, one stored row', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => claimSlug('same-slug', oid())));
    assert.equal(res.filter((r) => r.ok).length, 1);
    assert.equal(await SlugClaim.countDocuments({ slug: 'same-slug' }), 1);
  });
  it('simultaneous claims for different slugs all succeed', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => claimSlug(`diff-${i}`, oid())));
    assert.equal(res.every((r) => r.ok && r.created), true);
  });
  it('current-slug collision: another writing is refused', async () => {
    assert.equal((await claimSlug('current-one', oid())).ok, true);
    assert.equal((await claimSlug('current-one', oid())).ok, false);
  });
  it('historical-slug collision: an old slug stays reserved after a rename', async () => {
    const a = oid(), b = oid();
    await claimSlug('old-name', a);
    await claimSlug('new-name', a); // rename: new claimed, old KEPT for the redirect
    assert.equal((await claimSlug('old-name', b)).ok, false);
    assert.equal((await claimSlug('new-name', b)).ok, false);
  });
  it('idempotent retry by the same writing', async () => {
    const a = oid();
    assert.deepEqual(await claimSlug('retry', a), { ok: true, created: true });
    assert.deepEqual(await claimSlug('retry', a), { ok: true, created: false });
    assert.equal(await SlugClaim.countDocuments({ slug: 'retry' }), 1);
  });
  it('failed save compensation: released claim is reusable; a foreign release is a no-op', async () => {
    const a = oid(), b = oid();
    await claimSlug('comp', a);
    await releaseSlug('comp', b);
    assert.equal((await claimSlug('comp', b)).ok, false, 'foreign release must not free it');
    await releaseSlug('comp', a);
    assert.equal((await claimSlug('comp', b)).ok, true);
  });
});
