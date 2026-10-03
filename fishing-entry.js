import app from "./fishing-worker.js";

const ROOT_TO_INTERNAL = new Map([
  ["/", "/fishing"],
  ["/auth/login", "/fishing/auth/login"],
  ["/auth/logout", "/fishing/auth/logout"],
  ["/styles.css", "/fishing/styles.css"],
  ["/app.js", "/fishing/app.js"],
  ["/utilities.js", "/fishing/utilities.js"],
  ["/jotrip-logo.png", "/fishing/jotrip-logo.png"]
]);

function mapPath(pathname) {
  if (ROOT_TO_INTERNAL.has(pathname)) return ROOT_TO_INTERNAL.get(pathname);
  if (pathname.startsWith("/api/")) return `/fishing${pathname}`;
  return pathname;
}

async function normalizeResponse(response) {
  const headers = new Headers(response.headers);
  const location = headers.get("location");
  if (location) {
    if (location === "/fishing" || location === "/fishing/") headers.set("location", "/");
    else if (location.startsWith("/fishing/")) headers.set("location", location.slice("/fishing".length));
  }

  const contentType = headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  // Never let Safari keep an authenticated/unauthenticated app shell across auth changes.
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");

  let body = await response.text();
  body = body
    .replaceAll('href="/fishing/', 'href="/')
    .replaceAll('src="/fishing/', 'src="/')
    .replaceAll('action="/fishing/', 'action="/')
    .replaceAll('href="/fishing"', 'href="/"')
    .replaceAll('action="/fishing"', 'action="/"');

  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Root is the canonical portal. Keep the old /fishing URL as a safe 200 fallback
    // instead of redirecting it, so an expired client session can never bounce forever.
    if (url.pathname === "/fishing" || url.pathname === "/fishing/") {
      return normalizeResponse(await app.fetch(request, env, ctx));
    }

    const internalPath = mapPath(url.pathname);
    if (internalPath !== url.pathname) {
      const internal = new URL(request.url);
      internal.pathname = internalPath;
      const rewritten = new Request(internal, request);
      return normalizeResponse(await app.fetch(rewritten, env, ctx));
    }

    return normalizeResponse(await app.fetch(request, env, ctx));
  }
};
