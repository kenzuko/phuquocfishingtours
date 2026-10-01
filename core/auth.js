const COOKIE = "fishing_desk_session";

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signed));
}

export function authConfigured(env) {
  return Boolean(env.ADMIN_USER && env.ADMIN_PASSWORD && env.SESSION_SECRET);
}

export async function createSession(env) {
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  const payload = `${env.ADMIN_USER}.${expires}`;
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

export async function validSession(request, env) {
  if (!authConfigured(env)) return false;
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(/;\s*/).find(x => x.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [user, expires, signature] = parts;
  if (user !== env.ADMIN_USER || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  return signature === await hmac(env.SESSION_SECRET, `${user}.${expires}`);
}

export function sessionCookie(value) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${7 * 86400}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function loginPage(error = "", configured = true) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fishing Desk Login</title><style>body{font-family:system-ui;background:#eff5f2;color:#17342e;display:grid;place-items:center;min-height:100vh;margin:0}.card{width:min(420px,calc(100% - 32px));background:white;padding:28px;border-radius:18px;box-shadow:0 18px 60px #17342e18}input,button{width:100%;box-sizing:border-box;padding:12px;margin-top:10px;border-radius:10px;border:1px solid #cfddd6;font:inherit}button{background:#12665a;color:white;border:0;font-weight:700}.err{color:#b6403a}.muted{color:#6b7d76;font-size:13px}</style></head><body><form class="card" method="post" action="/auth/login"><h1>Fishing Desk</h1><p class="muted">JoTrip internal booking & dispatch desk</p>${!configured ? '<p class="err">Production auth chưa được cấu hình.</p>' : ''}${error ? `<p class="err">${error}</p>` : ''}<input name="username" placeholder="Username" autocomplete="username" required><input name="password" type="password" placeholder="Password" autocomplete="current-password" required><button type="submit">Đăng nhập</button></form></body></html>`;
}
