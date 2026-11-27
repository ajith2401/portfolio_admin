// Native share sheet for exported files. Feature-detected (navigator.canShare/share with files); runs ONLY from a user
// gesture (the caller passes userGesture:true from a click handler); never automatic; no third-party calls. When the
// browser cannot share these files it falls back to a normal download and says so.
export const SHARE_FALLBACK_MESSAGE =
  "This browser cannot share these files directly, so they were downloaded instead.";

/** true when the browser says it can share exactly these files. Never throws. */
export function canShareFiles(
  files,
  nav = typeof navigator !== "undefined" ? navigator : null,
) {
  try {
    return !!(
      nav &&
      typeof nav.share === "function" &&
      typeof nav.canShare === "function" &&
      files?.length &&
      nav.canShare({ files })
    );
  } catch {
    return false;
  }
}

/**
 * files: File[] (name + type). deps: { nav, download(file, name) | fallback(files), userGesture, title }.
 * Returns { shared, fellBack, cancelled, message }.
 */
export async function shareFiles(
  files,
  {
    nav = typeof navigator !== "undefined" ? navigator : null,
    download,
    fallback: onFallback,
    userGesture = false,
    title,
  } = {},
) {
  if (!userGesture)
    return {
      shared: false,
      fellBack: false,
      refused: true,
      message: "Sharing only starts from a tap or click on Share.",
    };
  const fallback = (message = SHARE_FALLBACK_MESSAGE) => {
    // onFallback(files) replaces the per-file download (e.g. the UI already downloaded the bundle ZIP)
    if (onFallback) onFallback(files);
    else for (const f of files || []) download?.(f, f.name);
    return { shared: false, fellBack: true, message };
  };
  if (!canShareFiles(files, nav)) return fallback();
  try {
    await nav.share({ files, ...(title ? { title } : {}) });
    return { shared: true, fellBack: false, message: "Shared." };
  } catch (e) {
    if (e?.name === "AbortError")
      return {
        shared: false,
        fellBack: false,
        cancelled: true,
        message: "Sharing was cancelled. Nothing was sent.",
      };
    return fallback(
      `Sharing failed (${e?.message || e}), so the files were downloaded instead.`,
    );
  }
}
