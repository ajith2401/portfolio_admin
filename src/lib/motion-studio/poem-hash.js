// Server-only (node:crypto). Fingerprint of poem text used to detect that the source writing changed.
import { createHash } from "node:crypto";
export const poemHash = (poem) =>
  createHash("sha256").update(JSON.stringify(poem.stanzas)).digest("hex");
