#!/usr/bin/env node
// OWNER-RUN verification against a REAL Cloudinary account. Not run in CI and never run by the assistant
// without isolated credentials. It touches ONLY an asset it uploads itself (public id writings/zz-verify-<random>).
//
//   CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... \
//   node scripts/verify-cloudinary-deletion.mjs --i-am-using-a-test-account
//
// Use a dedicated/test Cloudinary account if you can. With a production account it is still safe by construction
// (random id, deletes only what it created), but you must opt in with the flag above.
import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

if (!process.argv.includes("--i-am-using-a-test-account")) {
  console.error("Refusing to run without --i-am-using-a-test-account");
  process.exit(2);
}
for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
  if (!process.env[k]) { console.error(`${k} is not set`); process.exit(2); }
}
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });

const { cloudinaryPublicId } = await import("../src/lib/image-ownership.js");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const id = `zz-verify-${crypto.randomBytes(6).toString("hex")}`;
const publicId = `writings/${id}`;
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) failures++; };
const exists = async (p) => { try { await cloudinary.api.resource(p); return true; } catch (e) { if (e?.error?.http_code === 404) return false; throw e; } };

try {
  const up = await cloudinary.uploader.upload(PNG, { public_id: id, folder: "writings", overwrite: false });
  check("temporary asset uploaded", up.public_id === publicId, publicId);
  check("asset exists before deletion", await exists(publicId));
  check("our URL parser derives the same public id", cloudinaryPublicId(up.secure_url, process.env.CLOUDINARY_CLOUD_NAME) === publicId);
  check("foreign cloud URL is not deletable", cloudinaryPublicId(up.secure_url.replace(process.env.CLOUDINARY_CLOUD_NAME, "someone-else"), process.env.CLOUDINARY_CLOUD_NAME) === null);
  check("arbitrary public id (other folder) is not deletable", cloudinaryPublicId(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/other/x.png`, process.env.CLOUDINARY_CLOUD_NAME) === null);

  const first = await cloudinary.uploader.destroy(publicId);
  check("destroy reports ok", first.result === "ok", first.result);
  check("asset no longer exists", !(await exists(publicId)));
  const again = await cloudinary.uploader.destroy(publicId);
  check("repeated deletion reports 'not found' (idempotent, no throw)", again.result === "not found", again.result);
} catch (e) {
  failures++;
  console.error("ERROR", e?.message || e?.error?.message || e);
} finally {
  try { await cloudinary.uploader.destroy(publicId); } catch { /* best-effort cleanup of our own temp asset */ }
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
