// Memory guard for export: at most `max` OUTPUT canvases may be alive at once (default 1). Every route acquires its
// output canvas through a lease and releases it (width/height set to 0, which frees the backing store in every major
// browser) in a finally block, so a bundle that runs ten routes never holds more than one full-size canvas.
// Pure: the canvas factory is injected (export.js passes a DOM/OffscreenCanvas maker; tests pass a fake).

export class CanvasBudgetError extends Error {
  constructor(max) {
    super(
      `Another export is still drawing (at most ${max} export canvas at a time). Wait for it to finish, or cancel it.`,
    );
    this.name = "CanvasBudgetError";
  }
}

export function createLease(make, { max = 1 } = {}) {
  const live = new Set();
  let peak = 0;
  return {
    acquire(w, h, ...rest) {
      if (live.size >= max) throw new CanvasBudgetError(max);
      const c = make(w, h, ...rest);
      live.add(c);
      peak = Math.max(peak, live.size);
      return c;
    },
    release(c) {
      if (!c || !live.has(c)) return false;
      live.delete(c);
      try {
        c.width = 0;
        c.height = 0;
      } catch {
        /* a detached/transferred canvas: nothing left to free */
      }
      return true;
    },
    /** Release everything still held (used between bundle routes and after a cancel). */
    releaseAll() {
      for (const c of [...live]) this.release(c);
    },
    live: () => live.size,
    peak: () => peak,
    max,
  };
}
