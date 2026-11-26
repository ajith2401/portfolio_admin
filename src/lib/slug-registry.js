// Atomic slug reservations. Mongo cannot enforce "a slug is unique across Writing.slug AND every
// Writing.slugHistory[].slug" with one index, so each slug a writing has ever used is reserved here
// (unique index on `slug`). A claim is an atomic insert: two concurrent writers cannot both win.
// Admin-only (the public site never writes), so it lives outside the shared src/models contract.
import mongoose from 'mongoose';

const SlugClaimSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    writingId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'slugclaims' },
);

export const SlugClaim = mongoose.models.SlugClaim || mongoose.model('SlugClaim', SlugClaimSchema);

/**
 * Reserve `slug` for `writingId`. Returns { ok:true, created } (created=false when we already owned it)
 * or { ok:false } when another writing owns it. Never throws for a plain conflict.
 */
export async function claimSlug(slug, writingId, Model = SlugClaim) {
  try {
    await Model.create({ slug, writingId });
    return { ok: true, created: true };
  } catch (e) {
    if (e?.code !== 11000) throw e;
    const owner = await Model.findOne({ slug }).select('writingId').lean();
    if (owner && String(owner.writingId) === String(writingId)) return { ok: true, created: false };
    return { ok: false };
  }
}

/** Give a claim back (used when the save that needed it failed). Only removes our own claim. */
export async function releaseSlug(slug, writingId, Model = SlugClaim) {
  await Model.deleteOne({ slug, writingId }).catch(() => {});
}
