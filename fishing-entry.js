import app from "./fishing-worker.js";

const BUILD_TAG = "20261003d";
const ROOT_TO_INTERNAL = new Map([
  ["/", "/fishing"],
  ["/auth/login", "/fishing/auth/login"],
  ["/auth/logout", "/fishing/auth/logout"],
  ["/styles.css", "/fishing/styles.css"],
  ["/app.js", "/fishing/app.js"],
  ["/extras.js", "/fishing/extras.js"],
  ["/utilities.js", "/fishing/utilities.js"],
  ["/jotrip-logo.png", "/fishing/jotrip-logo.png"]
]);

function mapPath(pathname) {
  if (ROOT_TO_INTERNAL.has(pathname)) return ROOT_TO_INTERNAL.get(pathname);
  if (pathname.startsWith("/api/")) return `/fishing${pathname}`;
  return pathname;
}

function noStore(headers) {
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return headers;
}

function rewriteJavascript(body) {
  return body
    .replaceAll("/fishing/api", "/api")
    .replaceAll('window.location.href="/fishing"', 'window.location.replace("/?session=expired")')
    .replaceAll("window.location.href='/fishing'", "window.location.replace('/?session=expired')")
    .replaceAll('window.location.assign("/fishing")', 'window.location.replace("/?session=expired")')
    .replaceAll("window.location.assign('/fishing')", "window.location.replace('/?session=expired')");
}

async function normalizeResponse(response, publicPath = "") {
  const headers = new Headers(response.headers);
  const location = headers.get("location");
  if (location) {
    if (location === "/fishing" || location === "/fishing/") headers.set("location", "/");
    else if (location.startsWith("/fishing/")) headers.set("location", location.slice("/fishing".length));
  }

  const contentType = (headers.get("content-type") || "").toLowerCase();
  const isJs = publicPath === "/app.js" || publicPath === "/extras.js" || publicPath === "/utilities.js" || publicPath.endsWith(".js") || contentType.includes("javascript");
  const isHtml = publicPath === "/" || publicPath === "/fishing" || publicPath === "/fishing/" || contentType.includes("text/html");

  if (isJs || isHtml) noStore(headers);

  if (isJs) {
    const body = rewriteJavascript(await response.text());
    headers.set("content-type", "application/javascript; charset=utf-8");
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  }

  if (!isHtml) return new Response(response.body, { status: response.status, statusText: response.statusText, headers });

  let body = await response.text();
  body = body
    .replaceAll('href="/fishing/styles.css"', `href="/styles.css?v=${BUILD_TAG}"`)
    .replaceAll('src="/fishing/app.js"', `src="/app.js?v=${BUILD_TAG}"`)
    .replaceAll('src="/fishing/extras.js"', `src="/extras.js?v=${BUILD_TAG}"`)
    .replaceAll('src="/fishing/jotrip-logo.png"', `src="/jotrip-logo.png?v=${BUILD_TAG}"`)
    .replaceAll('action="/fishing/auth/login"', 'action="/auth/login"')
    .replaceAll('action="/fishing/auth/logout"', 'action="/auth/logout"')
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

    // Legacy URL is a direct page, never a redirect. This prevents old Safari 308 caches
    // from becoming part of the current login/session flow.
    if (url.pathname === "/fishing" || url.pathname === "/fishing/") {
      return normalizeResponse(await app.fetch(request, env, ctx), url.pathname);
    }

    const internalPath = mapPath(url.pathname);
    if (internalPath !== url.pathname) {
      const internal = new URL(request.url);
      internal.pathname = internalPath;
      const rewritten = new Request(internal, request);
      return normalizeResponse(await app.fetch(rewritten, env, ctx), url.pathname);
    }

    return normalizeResponse(await app.fetch(request, env, ctx), url.pathname);
  }
};
