const SETTINGS_DEFAULT = Object.freeze({ threshold: 1, bwPrice: 500, colorPrice: 1500 });
const COOKIE = '__Host-hyprint_admin';
const SESSION_SECONDS = 4 * 60 * 60;
const encoder = new TextEncoder();

function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}
function validSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.threshold === 'number' && Number.isFinite(value.threshold) && value.threshold >= 0.1 && value.threshold <= 100
    && Number.isSafeInteger(value.bwPrice) && value.bwPrice >= 0 && value.bwPrice <= 10_000_000
    && Number.isSafeInteger(value.colorPrice) && value.colorPrice >= 0 && value.colorPrice <= 10_000_000;
}
function allowedOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}
function configured(env) {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length > 0
    && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32;
}
async function parseJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return null;
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 4096) return null;
  const text = await request.text();
  if (text.length > 4096) return null;
  try { return JSON.parse(text); } catch { return null; }
}
async function passwordMatches(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length > 256) return false;
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(candidate)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i=0; i<aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function unbase64url(value) {
  const text = atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(text, c => c.charCodeAt(0));
}
async function keyFor(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']);
}
async function issueToken(secret) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = `${Math.floor(Date.now()/1000)}.${base64url(nonce)}`;
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}
async function authenticated(request, env) {
  if (!configured(env)) return false;
  const cookie = request.headers.get('Cookie') || '';
  const item = cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`));
  if (!item) return false;
  const token = item.slice(COOKIE.length+1);
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d{10,}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
  const issued = Number(parts[0]), now = Math.floor(Date.now()/1000);
  if (!Number.isSafeInteger(issued) || issued > now + 30 || now - issued >= SESSION_SECONDS) return false;
  try { return await crypto.subtle.verify('HMAC', await keyFor(env.SESSION_SECRET), unbase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`)); }
  catch { return false; }
}
function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
async function getSettings(env) {
  if (!env.SETTINGS) throw new Error('settings unavailable');
  const raw = await env.SETTINGS.get('settings');
  if (!raw) return SETTINGS_DEFAULT;
  let data;
  try { data = JSON.parse(raw); } catch { return SETTINGS_DEFAULT; }
  return validSettings(data) ? { threshold:data.threshold, bwPrice:data.bwPrice, colorPrice:data.colorPrice } : SETTINGS_DEFAULT;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (path === '/api/settings' && request.method === 'GET') return json(200, await getSettings(env));
      if (path.startsWith('/api/admin/') && ['POST','PUT','PATCH','DELETE'].includes(request.method) && !allowedOrigin(request)) return json(403,{error:'Asal permintaan tidak diizinkan.'});
      if (path === '/api/admin/login' && request.method === 'POST') {
        if (!configured(env) || !env.LOGIN_LIMITER) return json(503,{error:'Admin belum dikonfigurasi.'});
        const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
        const {success} = await env.LOGIN_LIMITER.limit({key:`admin-login:${ip}`});
        if (!success) return json(429,{error:'Terlalu banyak percobaan. Coba lagi nanti.'},{'Retry-After':'60'});
        const body = await parseJson(request);
        if (!body || !await passwordMatches(body.password, env.ADMIN_PASSWORD)) return json(401,{error:'Kata sandi salah.'});
        return json(200,{ok:true},{'Set-Cookie':sessionCookie(await issueToken(env.SESSION_SECRET))});
      }
      if (path === '/api/admin/logout' && request.method === 'POST') return json(200,{ok:true},{'Set-Cookie':sessionCookie('',0)});
      if (path === '/api/admin/session' && request.method === 'GET') return await authenticated(request,env) ? json(200,{authenticated:true}) : json(401,{authenticated:false});
      if (path === '/api/admin/settings' && request.method === 'PUT') {
        if (!await authenticated(request,env)) return json(401,{error:'Masuk sebagai admin terlebih dahulu.'});
        const value = await parseJson(request);
        if (!validSettings(value)) return json(400,{error:'Pengaturan tidak valid.'});
        const settings = {threshold:value.threshold,bwPrice:value.bwPrice,colorPrice:value.colorPrice};
        await env.SETTINGS.put('settings',JSON.stringify(settings));
        return json(200,{ok:true,settings});
      }
      return json(404,{error:'Halaman tidak ditemukan.'});
    } catch { return json(503,{error:'Layanan sementara tidak tersedia.'}); }
  }
};
