import app from "./fishing-worker.js";

const ROOT_ASSETS = new Map([
  ["/styles.css", "/fishing/styles.css"],
  ["/app.js", "/fishing/app.js"],
  ["/extras.js", "/fishing/extras.js"],
  ["/utilities.js", "/fishing/utilities.js"],
  ["/jotrip-logo.png", "/fishing/jotrip-logo.png"]
]);

const INTERNAL_ASSETS = new Set(ROOT_ASSETS.values());

function noStore(headers) {
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  return headers;
}

function internalRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

async function serveAsset(request, env, pathname) {
  const response = await env.ASSETS.fetch(internalRequest(request, pathname));
  const headers = noStore(new Headers(response.headers));
  const type = headers.get("content-type") || "";

  if (type.includes("javascript")) {
    let body = await response.text();
    body = body
      .replaceAll('window.location.href="/fishing"', 'window.location.replace("/")')
      .replaceAll('"/fishing/api', '"/api')
      .replaceAll("'/fishing/api", "'/api")
      .replaceAll('const API_BASE = "/fishing/api"', 'const API_BASE = "/api"');
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function normalizeAppResponse(response) {
  const headers = noStore(new Headers(response.headers));
  const location = headers.get("location");
  if (location === "/fishing" || location === "/fishing/") headers.set("location", "/");
  else if (location?.startsWith("/fishing/")) headers.set("location", location.slice("/fishing".length));

  const type = headers.get("content-type") || "";
  if (!type.includes("text/html")) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  let body = await response.text();
  body = body
    .replaceAll('href="/fishing/', 'href="/')
    .replaceAll('src="/fishing/', 'src="/')
    .replaceAll('action="/fishing/', 'action="/')
    .replaceAll('href="/fishing"', 'href="/"')
    .replaceAll('action="/fishing"', 'action="/"');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function mapAppPath(pathname) {
  if (pathname === "/") return "/fishing";
  if (pathname === "/auth/login") return "/fishing/auth/login";
  if (pathname === "/auth/logout") return "/fishing/auth/logout";
  if (pathname.startsWith("/api/")) return `/fishing${pathname}`;
  return pathname;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (ROOT_ASSETS.has(url.pathname)) {
      return serveAsset(request, env, ROOT_ASSETS.get(url.pathname));
    }
    if (INTERNAL_ASSETS.has(url.pathname)) {
      return serveAsset(request, env, url.pathname);
    }

    const mapped = mapAppPath(url.pathname);
    if (mapped === url.pathname && url.pathname !== "/fishing" && url.pathname !== "/fishing/") {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }

    return normalizeAppResponse(await app.fetch(internalRequest(request, mapped), env, ctx));
  }
};
