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
    && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32
    && typeof env.PASSWORD_PEPPER === 'string' && env.PASSWORD_PEPPER.length >= 32 && !!env.AUTH_DB;
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
async function issueToken(secret, version) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = `${Math.floor(Date.now()/1000)}.${base64url(nonce)}`;
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(`${payload}.${version}`));
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
  const record = await getAuthRecord(env);
  try { return await crypto.subtle.verify('HMAC', await keyFor(env.SESSION_SECRET), unbase64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}.${record?.version || 'bootstrap'}`)); }
  catch { return false; }
}
// D1 without the Sessions API executes every query against the primary. Avoid KV for auth state:
// session revocation and password changes must not be subject to edge cache propagation.
async function getAuthRecord(env) {
  return env.AUTH_DB.prepare('SELECT salt, hash, version FROM admin_auth WHERE id = 1').first();
}
async function derivePasswordHash(password, salt, pepper) {
  const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(pepper), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const peppered = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(`hyprint-admin-password\0${password}`));
  const base = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'}, base, 256));
}
async function checkPassword(candidate, env, record) {
  if(typeof candidate !== 'string' || candidate.length > 256) return false;
  if(!record) return passwordMatches(candidate,env.ADMIN_PASSWORD);
  if(!/^[A-Za-z0-9_-]{22}$/.test(record.salt) || !/^[A-Za-z0-9_-]{43}$/.test(record.hash) || !/^[A-Za-z0-9_-]{22}$/.test(record.version)) throw new Error('invalid auth record');
  const actual=await derivePasswordHash(candidate,unbase64url(record.salt),env.PASSWORD_PEPPER);
  const expected=unbase64url(record.hash);let difference=0;
  for(let i=0;i<actual.length;i++) difference|=actual[i]^expected[i];
  return difference===0;
}
async function updatePassword(env, currentRecord, password) {
  const salt=crypto.getRandomValues(new Uint8Array(16)), version=base64url(crypto.getRandomValues(new Uint8Array(16)));
  const hash=await derivePasswordHash(password,salt,env.PASSWORD_PEPPER);
  const statement=currentRecord
    ? env.AUTH_DB.prepare('UPDATE admin_auth SET salt = ?, hash = ?, version = ? WHERE id = 1 AND version = ?').bind(base64url(salt),base64url(hash),version,currentRecord.version)
    : env.AUTH_DB.prepare('INSERT INTO admin_auth (id, salt, hash, version) SELECT 1, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM admin_auth WHERE id = 1)').bind(base64url(salt),base64url(hash),version);
  const result=await statement.run();
  return result.meta.changes===1;
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
        const record=await getAuthRecord(env);
        if (!body || !await checkPassword(body.password, env, record)) return json(401,{error:'Kata sandi salah.'});
        return json(200,{ok:true},{'Set-Cookie':sessionCookie(await issueToken(env.SESSION_SECRET, record?.version || 'bootstrap'))});
      }
      if (path === '/api/admin/password' && request.method === 'POST') {
        if (!configured(env) || !env.LOGIN_LIMITER) return json(503,{error:'Admin belum dikonfigurasi.'});
        if (!await authenticated(request,env)) return json(401,{error:'Sesi tidak aktif. Masuk kembali.'});
        const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!(await env.LOGIN_LIMITER.limit({key:`admin-password:${ip}`})).success) return json(429,{error:'Terlalu banyak percobaan. Coba lagi nanti.'},{'Retry-After':'60'});
        const body=await parseJson(request);
        if (!body || typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 256 || body.newPassword === body.currentPassword) return json(400,{error:'Kata sandi baru harus 12–256 karakter dan berbeda dari sebelumnya.'});
        const record=await getAuthRecord(env);
        if (!await checkPassword(body.currentPassword,env,record)) return json(403,{error:'Kata sandi lama salah.'});
        if (!await updatePassword(env,record,body.newPassword)) return json(409,{error:'Kata sandi telah berubah. Masuk kembali.'});
        return json(200,{ok:true},{'Set-Cookie':sessionCookie('',0)});
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
