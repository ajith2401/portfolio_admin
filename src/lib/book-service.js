// Whitelisted Book writes. Anything not listed here (reviews, performance, ratings, shortCode, slugHistory)
// can never be set through the API. Status goes through the same enum as the shared visibility policy.
import { BOOK_KNOWN_STATUSES } from "./content-contract/book-visibility.js";

const TEXT = ["title", "description", "metaDescription", "coverImage", "isbn", "publisher", "language", "genre", "slug"];
const str = (v, max) => (typeof v === "string" ? v.normalize("NFC").trim().slice(0, max) : undefined);

export function buildBookChanges(body, { partial = false } = {}) {
  const b = body && typeof body === "object" ? body : {};
  const out = {};
  const errors = [];
  for (const k of TEXT) {
    if (b[k] === undefined) continue;
    const v = str(b[k], k === "description" ? 5000 : 500);
    if (v === undefined) errors.push(`${k} must be text`);
    else out[k] = v;
  }
  if (b.publishYear !== undefined) {
    const n = Number(b.publishYear);
    if (!Number.isInteger(n) || n < 1000 || n > 3000) errors.push("publishYear is invalid");
    else out.publishYear = n;
  }
  if (b.pageCount !== undefined) {
    const n = Number(b.pageCount);
    if (!Number.isInteger(n) || n < 0) errors.push("pageCount is invalid");
    else out.pageCount = n;
  }
  if (b.featured !== undefined) out.featured = b.featured === true;
  if (b.status !== undefined) {
    if (!BOOK_KNOWN_STATUSES.includes(b.status)) errors.push(`status must be one of ${BOOK_KNOWN_STATUSES.join(", ")}`);
    else out.status = b.status;
  }
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags)) errors.push("tags must be a list");
    else out.tags = b.tags.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 30);
  }
  if (!partial) {
    for (const k of ["title", "description", "publishYear"]) if (out[k] === undefined || out[k] === "") errors.push(`${k} is required`);
  }
  return { changes: out, errors };
}
