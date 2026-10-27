import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function fixture() {
  const values=new Map();
  return { SETTINGS:{ get:async k=>values.get(k) ?? null, put:async (k,v)=>values.set(k,v)},
    ADMIN_PASSWORD:'unit-test-passphrase', SESSION_SECRET:'unit-test-session-secret-with-adequate-random-length', PASSWORD_PEPPER:'test-pepper-with-more-than-thirty-two-chars', AUTH_DB:fakeAuthDb(),
    LOGIN_LIMITER:{limit:async ()=>({success:true})}, ASSETS:{fetch:async ()=>new Response('asset')} };
}
function req(path, options={}) {
  let headers={Origin:'https://test.example','CF-Connecting-IP':'203.0.113.4',...options.headers};
  if(options.body) headers['Content-Type']='application/json';
  return new Request('https://test.example'+path,{...options,headers});
}

async function login(env) {
  const response=await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:'unit-test-passphrase'})}),env);
  return response;
}

test('public settings have sensible defaults without exposing secrets',async()=>{
  const env=fixture();const r=await worker.fetch(req('/api/settings'),env);
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{threshold:1,bwPrice:500,colorPrice:1500});
  assert.equal(r.headers.get('cache-control'),'no-store');
});
test('updates require valid authentication and a same-origin request',async()=>{
  const env=fixture();const data=JSON.stringify({threshold:2,bwPrice:400,colorPrice:2000});
  assert.equal((await worker.fetch(req('/api/admin/settings',{method:'PUT',body:data}),env)).status,401);
  const auth=await login(env);const cookie=auth.headers.get('set-cookie').split(';')[0];
  assert.equal((await worker.fetch(req('/api/admin/settings',{method:'PUT',body:data,headers:{Cookie:cookie,Origin:'https://malicious.example'}}),env)).status,403);
  assert.equal((await worker.fetch(req('/api/admin/settings',{method:'PUT',body:data,headers:{Cookie:cookie}}),env)).status,200);
  assert.deepEqual(await (await worker.fetch(req('/api/settings'),env)).json(),{threshold:2,bwPrice:400,colorPrice:2000});
});
test('admin login rejects invalid password and creates a protected expiring cookie',async()=>{
  const env=fixture();const bad=await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:'wrong'})}),env);assert.equal(bad.status,401);
  const ok=await login(env);assert.equal(ok.status,200);const cookie=ok.headers.get('set-cookie');
  for(const part of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=']) assert.ok(cookie.includes(part));
  const session=await worker.fetch(req('/api/admin/session',{headers:{Cookie:cookie.split(';')[0]}}),env);assert.equal(session.status,200);
  const fake=await worker.fetch(req('/api/admin/session',{headers:{Cookie:'__Host-hyprint_admin=forged'}}),env);assert.equal(fake.status,401);
});
test('rate limiting rejects login even with correct credentials',async()=>{
  const env=fixture();env.LOGIN_LIMITER.limit=async()=>({success:false});
  assert.equal((await login(env)).status,429);
});
test('settings updates reject out of range or fractional values',async()=>{
  const env=fixture();const cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  for(const obj of [{threshold:0,bwPrice:500,colorPrice:1000},{threshold:1,bwPrice:-1,colorPrice:1000},{threshold:1,bwPrice:1.5,colorPrice:1000},{threshold:1,bwPrice:true,colorPrice:1000}]) {
    assert.equal((await worker.fetch(req('/api/admin/settings',{method:'PUT',headers:{Cookie:cookie},body:JSON.stringify(obj)}),env)).status,400);
  }
});
test('missing secrets or rate limiting fails closed',async()=>{
  const env=fixture();delete env.SESSION_SECRET;assert.equal((await login(env)).status,503);
  const other=fixture();delete other.LOGIN_LIMITER;assert.equal((await login(other)).status,503);
});
test('logout clears cookie and static assets remain reachable',async()=>{
  const env=fixture();const out=await worker.fetch(req('/api/admin/logout',{method:'POST'}),env);assert.ok(out.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal(await (await worker.fetch(req('/'),env)).text(),'asset');
});

function fakeAuthDb() {
  let row=null;
  return { get row(){return row}, prepare(sql){return { bind(...args){return { first:async()=>row && {...row}, run:async()=>{
    if(sql.startsWith('INSERT')) { if(row) return {meta:{changes:0}}; row={salt:args[0],hash:args[1],version:args[2]}; return {meta:{changes:1}}; }
    if(sql.startsWith('UPDATE')) { if(!row||row.version!==args[3]) return {meta:{changes:0}}; row={salt:args[0],hash:args[1],version:args[2]}; return {meta:{changes:1}}; }
    throw new Error('Unexpected SQL');
  }}}, first:async()=>row && {...row} };}};
}

test('password change needs an authenticated session and current password',async()=>{
  const env=fixture();env.AUTH_DB=fakeAuthDb();env.PASSWORD_PEPPER='test-pepper-with-more-than-thirty-two-chars';
  const body=JSON.stringify({currentPassword:'incorrect',newPassword:'new-strong-passphrase'});
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',body}),env)).status,401);
  const cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body}),env)).status,403);
  assert.equal(env.AUTH_DB.row,null);
});

test('changing password invalidates prior sessions and bootstrap password',async()=>{
  const env=fixture();env.AUTH_DB=fakeAuthDb();env.PASSWORD_PEPPER='test-pepper-with-more-than-thirty-two-chars';
  const cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  const body=JSON.stringify({currentPassword:'unit-test-passphrase',newPassword:'another-safe-password'});
  const response=await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body}),env);
  assert.equal(response.status,200);
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));
  assert.notEqual(env.AUTH_DB.row.hash,'another-safe-password');
  assert.equal((await worker.fetch(req('/api/admin/session',{headers:{Cookie:cookie}}),env)).status,401);
  assert.equal((await login(env)).status,401);
  const newLogin=await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:'another-safe-password'})}),env);
  assert.equal(newLogin.status,200);
});

test('password change validates new password, origin, and rate limit',async()=>{
  const env=fixture();env.AUTH_DB=fakeAuthDb();env.PASSWORD_PEPPER='test-pepper-with-more-than-thirty-two-chars';
  const cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  const body=JSON.stringify({currentPassword:'unit-test-passphrase',newPassword:'x'});
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body}),env)).status,400);
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie,Origin:'https://bad.example'},body}),env)).status,403);
  env.LOGIN_LIMITER.limit=async()=>({success:false});
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body}),env)).status,429);
});

test('new passwords shorter than twelve characters are rejected',async()=>{
  const env=fixture(),cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  const body=JSON.stringify({currentPassword:'unit-test-passphrase',newPassword:'abcdefghijk'});
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body}),env)).status,400);
});

test('sessions expire after four hours and are revoked for all clients on password change',async()=>{
  const env=fixture(),cookie1=(await login(env)).headers.get('set-cookie').split(';')[0],cookie2=(await login(env)).headers.get('set-cookie').split(';')[0];
  const originalNow=Date.now;
  try { Date.now=()=>originalNow()+4*60*60*1000; assert.equal((await worker.fetch(req('/api/admin/session',{headers:{Cookie:cookie1}}),env)).status,401); }
  finally { Date.now=originalNow; }
  const body=JSON.stringify({currentPassword:'unit-test-passphrase',newPassword:'a-different-long-password'});
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie1},body}),env)).status,200);
  assert.equal((await worker.fetch(req('/api/admin/session',{headers:{Cookie:cookie2}}),env)).status,401);
});

test('password may be changed again using the latest password',async()=>{
  const env=fixture();const cookie=(await login(env)).headers.get('set-cookie').split(';')[0];
  const first={currentPassword:'unit-test-passphrase',newPassword:'another-safe-password'};
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify(first)}),env)).status,200);
  const auth=await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:first.newPassword})}),env);
  const nextCookie=auth.headers.get('set-cookie').split(';')[0];
  const second={currentPassword:first.newPassword,newPassword:'third-different-password'};
  assert.equal((await worker.fetch(req('/api/admin/password',{method:'POST',headers:{Cookie:nextCookie},body:JSON.stringify(second)}),env)).status,200);
  assert.equal((await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:first.newPassword})}),env)).status,401);
  assert.equal((await worker.fetch(req('/api/admin/login',{method:'POST',body:JSON.stringify({password:second.newPassword})}),env)).status,200);
});

test('authentication fails closed without the password database or pepper',async()=>{
  const noDb=fixture();delete noDb.AUTH_DB;assert.equal((await login(noDb)).status,503);
  const noPepper=fixture();delete noPepper.PASSWORD_PEPPER;assert.equal((await login(noPepper)).status,503);
});
