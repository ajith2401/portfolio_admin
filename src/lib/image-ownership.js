// Strict ownership rules for deleting Cloudinary assets.
// An asset may be destroyed only if (1) its URL is one of OUR Cloudinary URLs, (2) the URL is
// referenced by the document being edited, and (3) no other document still references the same asset.
// Pure functions + an injected "finder" keep this unit-testable without a database or Cloudinary.

const IMAGE_KEYS = ["small", "medium", "large", "thumbnail", "featured"];
const ALLOWED_FOLDERS = ["writings"];
const TRANSFORM_SEG =
  /^(?:[a-z]{1,3}_[^/]*|[a-z]{1,3}(?:_[^/,]*)?(?:,[^/]+)+)$/; // w_200,h_200,c_fill / q_auto / f_auto

/** Returns the Cloudinary public id (e.g. "writings/abc") or null if the URL is not a deletable asset of ours. */
export function cloudinaryPublicId(
  url,
  cloudName = process.env.CLOUDINARY_CLOUD_NAME,
) {
  if (typeof url !== "string" || url.length > 2048) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (
    u.protocol !== "https:" ||
    u.hostname !== "res.cloudinary.com" ||
    u.username ||
    u.password ||
    u.port
  )
    return null;
  const segs = u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return null;
      }
    });
  if (segs.includes(null)) return null;
  // /<cloud>/image/upload/[transformations]/[v123]/<folder>/<name>.<ext>
  if (segs.length < 5 || segs[1] !== "image" || segs[2] !== "upload")
    return null;
  if (cloudName && segs[0] !== cloudName) return null;
  let rest = segs.slice(3);
  while (
    rest.length > 2 &&
    (TRANSFORM_SEG.test(rest[0]) || /^v\d+$/.test(rest[0]))
  )
    rest = rest.slice(1);
  if (rest.length !== 2) return null; // exactly <folder>/<file>
  const [folder, file] = rest;
  if (!ALLOWED_FOLDERS.includes(folder)) return null;
  const name = file.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(name)) return null;
  return `${folder}/${name}`;
}

/** The image URLs a document actually stores (alt text and other non-URL fields are ignored). */
export function imageUrlsOf(doc) {
  const imgs = doc?.images;
  if (!imgs || typeof imgs !== "object") return [];
  return IMAGE_KEYS.map((k) => imgs[k]).filter(
    (v) => typeof v === "string" && v,
  );
}

/**
 * Decide which URLs may be destroyed. `isReferencedElsewhere(publicId)` must return true when any OTHER
 * document (any collection) still points at the asset. Returns { deletable: [{url, publicId}], skipped: [{url, reason}] }.
 */
export async function planImageDeletion(
  urls,
  { isReferencedElsewhere, cloudName } = {},
) {
  const deletable = [];
  const skipped = [];
  const seen = new Set();
  for (const url of urls || []) {
    const publicId = cloudinaryPublicId(url, cloudName);
    if (!publicId) {
      if (typeof url === "string" && url)
        skipped.push({ url, reason: "not-deletable" });
      continue;
    }
    if (seen.has(publicId)) continue; // small/medium/large share one asset
    seen.add(publicId);
    if (isReferencedElsewhere && (await isReferencedElsewhere(publicId))) {
      skipped.push({ url, reason: "shared" });
      continue;
    }
    deletable.push({ url, publicId });
  }
  return { deletable, skipped };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mongo filter matching any image field that points at this public id. */
export function referenceFilter(publicId) {
  const re = new RegExp(`/${esc(publicId)}(?:\\.[a-z0-9]{2,5})?$`, "i");
  return {
    $or: IMAGE_KEYS.map((k) => ({ [`images.${k}`]: re })),
  };
}

/**
 * Cloudinary's destroy() answers { result: 'ok' | 'not found' | ... } and does not throw for most failures.
 * 'ok' = deleted, 'not found' = already gone (idempotent), anything else is NOT a confirmed deletion.
 */
export function classifyDestroyResult(res) {
  const result = res && typeof res === "object" && "result" in res ? res.result : undefined;
  if (result === "ok") return "deleted";
  if (result === "not found") return "already-gone";
  return "failed";
}
