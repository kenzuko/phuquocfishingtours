import app from "./fishing-worker.js";

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
  expires: "0",
  "x-robots-tag": "noindex, nofollow, noarchive"
};

function requestAt(request, pathname, { method = request.method, cookie = null } = {}) {
  const url = new URL(request.url);
  url.pathname = pathname;
  const headers = new Headers(request.headers);
  if (cookie === "") headers.delete("cookie");
  else if (cookie) headers.set("cookie", cookie);
  const init = { method, headers };
  if (!["GET", "HEAD"].includes(method)) init.body = request.body;
  return new Request(url, init);
}

function cookiePair(setCookie) {
  return String(setCookie || "").split(";", 1)[0];
}

async function htmlAtRoot(response, { setCookie = null, clearCache = false } = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(NO_STORE)) headers.set(key, value);
  if (setCookie) headers.set("set-cookie", setCookie);
  if (clearCache) headers.set("clear-site-data", '"cache"');

  const type = headers.get("content-type") || "";
  if (!type.includes("text/html")) {
    return new Response(response.body, { status: 200, headers });
  }

  let body = await response.text();
  const script = '<script>try{history.replaceState(null,"","/")}catch(e){}</script>';
  body = body.includes("</body>") ? body.replace("</body>", `${script}</body>`) : `${body}${script}`;
  return new Response(body, { status: 200, headers });
}

async function directLogin(request, env, ctx) {
  const result = await app.fetch(request, env, ctx);
  if (result.status !== 303) return result;

  const setCookie = result.headers.get("set-cookie");
  const pair = cookiePair(setCookie);
  const page = await app.fetch(requestAt(request, "/", { method: "GET", cookie: pair }), env, ctx);
  return htmlAtRoot(page, { setCookie, clearCache: true });
}

async function directLogout(request, env, ctx) {
  const result = await app.fetch(request, env, ctx);
  if (result.status !== 303) return result;

  const setCookie = result.headers.get("set-cookie");
  const page = await app.fetch(requestAt(request, "/", { method: "GET", cookie: "" }), env, ctx);
  return htmlAtRoot(page, { setCookie, clearCache: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Clean emergency entry. It never redirects and also asks the browser to
    // discard old cached redirect responses from earlier builds.
    if ((path === "/app" || path === "/app/") && request.method === "GET") {
      const page = await app.fetch(requestAt(request, "/", { method: "GET" }), env, ctx);
      return htmlAtRoot(page, { clearCache: true });
    }

    if ((path === "/auth/login" || path === "/fishing/auth/login") && request.method === "POST") {
      return directLogin(request, env, ctx);
    }

    if ((path === "/auth/logout" || path === "/fishing/auth/logout") && request.method === "POST") {
      return directLogout(request, env, ctx);
    }

    // Everything else is handled directly by the root-native portal worker.
    // No path rewriting, no response rewriting, no redirect bridge.
    return app.fetch(request, env, ctx);
  }
};
