// Tells the public portfolio to refresh a writing after publish / unpublish / slug change.
// Never throws and never fails the save: the result is reported back so the UI can show a warning.
// The shared secret is read from the environment and is never logged or returned.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export async function notifyPortfolio(
  { slug, previousSlugs = [], section },
  { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {},
) {
  const url = env.PORTFOLIO_REVALIDATE_URL;
  const secret = env.REVALIDATE_SECRET;
  if (!url)
    return {
      status: "skipped",
      warning:
        "PORTFOLIO_REVALIDATE_URL is not set: the public site was not told to refresh and may show old content until its cache expires.",
    };
  if (!secret)
    return {
      status: "skipped",
      warning:
        "REVALIDATE_SECRET is not set: the public site was not told to refresh.",
    };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      status: "skipped",
      warning: "PORTFOLIO_REVALIDATE_URL is not a valid address.",
    };
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname))
  )
    return {
      status: "skipped",
      warning:
        "PORTFOLIO_REVALIDATE_URL must use https (http is only allowed for localhost).",
    };
  if (!slug) return { status: "skipped", warning: "No slug to refresh." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(parsed.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        slug,
        ...(section ? { section } : {}),
        ...(previousSlugs.length ? { previousSlugs } : {}),
      }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok)
      return {
        status: "failed",
        warning: `The public site refused the refresh request (HTTP ${res.status}).`,
      };
    return { status: "ok" };
  } catch (e) {
    return {
      status: "failed",
      warning:
        e?.name === "AbortError"
          ? "The public site did not answer the refresh request in time."
          : "The public site could not be reached for a refresh.",
    };
  } finally {
    clearTimeout(timer);
  }
}
