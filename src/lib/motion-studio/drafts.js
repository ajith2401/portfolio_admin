// Device-only drafts (IndexedDB). Nothing here ever leaves the browser. Every function resolves to a safe value when
// IndexedDB is unavailable (private mode, old WebView) so the Studio keeps working without recovery.
const DB = "pms-drafts", STORE = "drafts";
const open = () => new Promise((res, rej) => {
  if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB unavailable"));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const run = async (mode, fn) => {
  const db = await open();
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE), req = fn(st);
      tx.oncomplete = () => res(req?.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  } finally { db.close(); }
};
export const draftsAvailable = () => typeof indexedDB !== "undefined";
export const newDraftId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
/** @param {{id:string,name:string,source:object,composition:object}} d */
export const saveDraft = (d) => run("readwrite", (s) => s.put({ ...d, updatedAt: Date.now() })).then(() => true, () => false);
export const loadDraft = (id) => run("readonly", (s) => s.get(id)).catch(() => null);
export const listDrafts = () =>
  run("readonly", (s) => s.getAll()).then((rows) => (rows || []).map(({ id, name, updatedAt, source }) => ({ id, name, updatedAt, lines: source?.poem?.stanzas?.flat().length || 0 })).sort((a, b) => b.updatedAt - a.updatedAt), () => []);
export const deleteDraft = (id) => run("readwrite", (s) => s.delete(id)).then(() => true, () => false);
export const clearDrafts = () => run("readwrite", (s) => s.clear()).then(() => true, () => false);
