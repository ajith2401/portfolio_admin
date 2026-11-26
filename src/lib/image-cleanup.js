// Server-only: deletes Cloudinary assets a document no longer needs, but never an asset that is
// shared with another document, and never a URL that is not one of ours.
import { Writing, Project, TechBlog, Book } from '@/models';
import { destroyAsset } from '@/lib/cloudinary';
import { planImageDeletion, referenceFilter, classifyDestroyResult } from '@/lib/image-ownership';

const MODELS = { Writing, Project, TechBlog, Book };

/** True when any document other than (ownerModel, ownerId) still references the asset. */
export function makeSharedCheck(ownerModel, ownerId) {
  return async (publicId) => {
    const filter = referenceFilter(publicId);
    for (const [name, Model] of Object.entries(MODELS)) {
      if (!Model?.exists) continue;
      const q = name === ownerModel && ownerId ? { ...filter, _id: { $ne: ownerId } } : filter;
      if (await Model.exists(q)) return true;
    }
    return false;
  };
}

/**
 * Delete the assets behind `urls` that belonged to (ownerModel, ownerId).
 * Callers pass URLs taken from the OWNER document, never from the request body.
 */
export async function deleteOwnedImages(urls, { ownerModel, ownerId }, deps = {}) {
  const destroy = deps.destroy || destroyAsset;
  const { deletable, skipped } = await planImageDeletion(urls, {
    isReferencedElsewhere: deps.isReferencedElsewhere || makeSharedCheck(ownerModel, ownerId),
  });
  const deleted = [];
  for (const d of deletable) {
    try {
      const outcome = classifyDestroyResult(await destroy(d.publicId));
      if (outcome === 'deleted') deleted.push(d.publicId);
      else if (outcome === 'already-gone') skipped.push({ url: d.url, reason: 'already-gone' });
      else throw new Error('Cloudinary did not confirm the deletion');
    } catch (e) {
      skipped.push({ url: d.url, reason: 'destroy-failed' });
      console.error('Image cleanup failed for one asset:', e?.message);
    }
  }
  return { deleted, skipped };
}
