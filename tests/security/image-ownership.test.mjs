import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cloudinaryPublicId, imageUrlsOf, planImageDeletion, referenceFilter } from '../../src/lib/image-ownership.js';

const C = 'democloud';
const u = (p) => `https://res.cloudinary.com/${C}/image/upload/${p}`;

describe('cloudinaryPublicId', () => {
  it('accepts our own asset, with or without transformations and version', () => {
    assert.equal(cloudinaryPublicId(u('v1700000000/writings/abc_123.jpg'), C), 'writings/abc_123');
    assert.equal(cloudinaryPublicId(u('w_200,h_200,c_fill,q_auto/v17/writings/abc_123.webp'), C), 'writings/abc_123');
    assert.equal(cloudinaryPublicId(u('writings/abc'), C), 'writings/abc');
  });
  it('rejects other hosts, clouds, folders, traversal and junk', () => {
    for (const bad of [
      'http://res.cloudinary.com/democloud/image/upload/writings/a.jpg',
      'https://evil.com/democloud/image/upload/writings/a.jpg',
      'https://res.cloudinary.com.evil.com/democloud/image/upload/writings/a.jpg',
      'https://user:pw@res.cloudinary.com/democloud/image/upload/writings/a.jpg',
      `https://res.cloudinary.com/othercloud/image/upload/writings/a.jpg`,
      u('v1/other-folder/a.jpg'),
      u('v1/writings/../secret/a.jpg'),
      u('v1/writings/sub/a.jpg'),
      u('v1/writings/a%2Fb.jpg'),
      'https://res.cloudinary.com/democloud/video/upload/writings/a.mp4',
      'not a url', '', null, undefined, 42, {},
    ]) assert.equal(cloudinaryPublicId(bad, C), null, String(bad));
  });
});

describe('imageUrlsOf', () => {
  it('returns URL fields only, never alt text', () => {
    assert.deepEqual(imageUrlsOf({ images: { small: 'a', medium: 'b', alt: 'a poem about rain', large: '' } }), ['a', 'b']);
    assert.deepEqual(imageUrlsOf({}), []);
    assert.deepEqual(imageUrlsOf({ images: null }), []);
  });
});

describe('planImageDeletion', () => {
  const own = u('v1/writings/mine.jpg'), other = u('v1/writings/theirs.jpg');
  it('deletes an unshared owned asset once even if small/medium/large point to it', async () => {
    const r = await planImageDeletion([own, u('w_200/v1/writings/mine.jpg'), u('w_600/v1/writings/mine.jpg')], { cloudName: C, isReferencedElsewhere: async () => false });
    assert.deepEqual(r.deletable.map((d) => d.publicId), ['writings/mine']);
  });
  it('skips an asset another document still uses (cross-writing)', async () => {
    const r = await planImageDeletion([own, other], { cloudName: C, isReferencedElsewhere: async (id) => id === 'writings/theirs' });
    assert.deepEqual(r.deletable.map((d) => d.publicId), ['writings/mine']);
    assert.deepEqual(r.skipped.map((s) => s.reason), ['shared']);
  });
  it('skips foreign and malformed URLs and ignores empties', async () => {
    const r = await planImageDeletion(['https://evil.com/x.jpg', 'junk', '', null], { cloudName: C, isReferencedElsewhere: async () => false });
    assert.equal(r.deletable.length, 0);
    assert.equal(r.skipped.length, 2);
  });
});

describe('referenceFilter', () => {
  it('escapes the public id and covers every image key', () => {
    const f = referenceFilter('writings/a.b');
    assert.ok(f.$or.length >= 4);
    const re = f.$or[0]['images.small'];
    assert.ok(re.test('https://x/v1/writings/a.b.jpg'));
    assert.ok(!re.test('https://x/v1/writings/aXb.jpg'));
    assert.ok(!re.test('https://x/v1/writings/a.b-other.jpg'));
  });
});
