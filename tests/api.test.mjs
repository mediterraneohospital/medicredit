import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
let source=await readFile(new URL('../src/data.js',import.meta.url),'utf8');source=source.replace("import {config} from '../config.js';","const config={mode:'supabase',supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};").replace("'./domain.js'",JSON.stringify(new URL('../src/domain.js',import.meta.url).href));
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('REST adapter: login, paginated read, save, private PDF, logout',async()=>{
 const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url,options});let body={};if(url.includes('/auth/v1/token'))body={access_token:'access',refresh_token:'refresh',expires_in:3600};else if(url.includes('mc_cases?'))body=url.includes('offset=0')?Array.from({length:500},(_,i)=>({id:String(i),payload:{code:'T'+i},version:1})):[];else if(url.includes('mc_members?'))body=[{user_id:'member'}];else if(url.includes('mc_companies?'))body=[];else if(url.includes('/rpc/mc_save_case'))body={id:'test',payload:{code:'X'},version:2};else if(url.includes('/object/sign/'))body={signedURL:'/object/sign/mc-documents/test/a.pdf?token=x'};else if(url.includes('/logout'))return new Response(null,{status:204});return Response.json(body);};
 await api.login('demo@example.test','fake-password');assert.ok(api.signedIn());const data=await api.load();assert.equal(data.cases.length,500);assert.ok(calls.some(c=>c.url.includes('offset=500')));assert.ok(calls.filter(c=>c.url.includes('/rest/')).every(c=>c.options.headers.Authorization==='Bearer access'));
 const c={id:'test',version:1,code:'X',patient:'Demo',doctor:'Demo',incidentDate:'2026-08-28',date:'2026-09-01',type:'Plafond',total:0,recognized:0,notes:'',closedReason:'',lines:[]};assert.equal((await api.saveCase(c)).version,2);
 const file=new File(['%PDF-1.4\n'], 'demo.pdf',{type:'application/pdf'});const f=await api.upload(file,'test');assert.equal(f.name,'demo.pdf');assert.ok(f.path.endsWith('.pdf'));assert.ok((await api.fileURL(f)).startsWith('https://test.supabase.co/storage/v1/object/sign/'));await assert.rejects(()=>api.upload(new File(['invalid'],'bad.pdf'),'test'));
 await api.logout();assert.equal(api.signedIn(),false);assert.equal(values.size,0);
});

