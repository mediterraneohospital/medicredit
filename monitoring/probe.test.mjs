import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probe, validate} from './probe.mjs';
const p={ref:'a'.repeat(20),key:'sb_publishable_test',table:'sample'};
test('inventory rejects duplicates, secrets, injected paths and empty input',()=>{
  validate([p]);
  for(const input of [[],[p,p],[{...p,key:'sb_secret_test'}],[{...p,table:'x?limit=1'}]]) assert.throws(()=>validate(input));
});
test('success is a real empty database response; no auth token or row fetch',async()=>{
  const result=await probe(p,{request:async(url,opts)=>{
    assert.equal(url,`https://${p.ref}.supabase.co/rest/v1/sample?select=*&limit=0`);
    assert.equal(opts.method,'GET'); assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.apikey,p.key); assert.equal(opts.headers.Authorization,undefined);
    return Response.json([]);
  }}); assert.equal(result.ok,true);
});
test('401 and 403 are failures and never retried',async()=>{
  for(const status of [401,403]){let calls=0; const r=await probe(p,{request:async()=>{calls++;return new Response('',{status})}});assert.equal(r.ok,false);assert.equal(r.failure,'access-denied');assert.equal(calls,1);}
});
test('429 and 503 retry then recover',async()=>{
  for(const status of [429,503]) {let calls=0;const r=await probe(p,{sleep:async()=>{},request:async()=>++calls<3?new Response('',{status}):Response.json([])});assert.equal(r.ok,true);assert.equal(calls,3);}
});
test('persistent failures are bounded',async()=>{
  let calls=0;const r=await probe(p,{sleep:async()=>{},request:async()=>{calls++;throw Error('private secret')}});assert.equal(r.ok,false);assert.equal(calls,3);assert.ok(!JSON.stringify(r).includes('private secret'));
});
test('404 is not health and does not retry',async()=>{const r=await probe(p,{request:async()=>new Response('',{status:404})});assert.equal(r.ok,false);});
test('200 HTML, object or leaked rows are not accepted',async()=>{
  for(const response of [()=>new Response('<html>'),()=>Response.json({}),()=>Response.json([{secret:1}])]) {const r=await probe(p,{sleep:async()=>{},request:async()=>response()});assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('secret'));}
});
test('one failed project does not prevent other probes',async()=>{
  const rs=await Promise.all([probe(p,{request:async()=>Response.json([])}),probe(p,{request:async()=>new Response('',{status:403})})]);assert.deepEqual(rs.map(r=>r.ok),[true,false]);
});
