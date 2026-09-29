const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migrations/20260929060604_initial_medicredit.sql', import.meta.url),'utf8'));
const member='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',co='33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users values('${member}'),('${other}');insert into public.mc_members(user_id) values('${member}');set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);insert into public.mc_companies(id,name) values('${co}','Demo');`);
const c={id:'44444444-4444-4444-8444-444444444444',code:'TEST',patient:'Demo',doctor:'Demo',incidentDate:'2026-08-28',date:'2026-09-01',type:'Plafond',total:10000,recognized:6000,notes:'',closedReason:'',decision:null,lines:[{id:'55555555-5555-4555-8555-555555555555',companyId:co,cost:10000,proposed:4000,requested:4000,received:0,stage:'Προς αίτηση',requestDate:'',receiveDate:'',creditNumber:'',notes:'',credit:null}]};
const save=(x,v)=>db.query('select public.mc_save_case($1::jsonb,$2::bigint)',[JSON.stringify(x),v]);
let count=0;function ok(value,msg){if(!value)throw Error(msg);count++;console.log('PASS',msg);}
await save(c,0);ok((await db.query('select version from public.mc_cases')).rows[0].version===1,'schema and valid RPC insert');
await save({...c,notes:'edit'},1);ok((await db.query('select jsonb_array_length(history) n from public.mc_cases')).rows[0].n===1,'server history');
async function rejects(fn,label){try{await fn();}catch(e){ok(true,label);return;}throw Error('Expected rejection: '+label);}
await rejects(()=>save(c,1),'stale update rejected');
await rejects(()=>save({...c,recognized:10001},2),'negative coverage rejected');
await rejects(()=>save({...c,incidentDate:'2026-09-02'},2),'incident after committee rejected');
await rejects(()=>save({...c,lines:[{...c.lines[0],proposed:3999}]},2),'sum mismatch rejected');
await rejects(()=>save({...c,lines:[{...c.lines[0],received:1}]},2),'invalid receipt rejected');
const co2='88888888-8888-4888-8888-888888888888';
await db.exec(`insert into public.mc_companies(id,name) values('${co2}','Demo 2')`);
const rounding={...c,id:'77777777-7777-4777-8777-777777777777',code:'ROUNDING',total:100,recognized:67,lines:[{...c.lines[0],cost:33,proposed:11,requested:11},{...c.lines[0],id:'99999999-9999-4999-8999-999999999999',companyId:co2,cost:67,proposed:22,requested:22}]};
await save(rounding,0);ok(true,'SQL largest-remainder allocation accepted');
await rejects(()=>save({...rounding,lines:rounding.lines.map((l,i)=>({...l,proposed:i===0?10:23}))},1),'incorrect proportional split rejected even when sums reconcile');
await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
ok((await db.query('select * from public.mc_cases')).rows.length===0,'non-member cannot read cases');
await rejects(()=>save({...c,id:'66666666-6666-4666-8666-666666666666',code:'FORBIDDEN'},0),'non-member cannot insert');
await rejects(()=>db.exec(`insert into public.mc_members values('${other}',true,now())`),'non-member cannot self-enroll');
await db.exec(`select set_config('request.jwt.claim.sub','${member}',false);insert into storage.objects values(gen_random_uuid(),'${c.id}/77777777-7777-4777-8777-777777777777.pdf','mc-documents');`);
ok((await db.query('select * from storage.objects')).rows.length===1,'member storage policy');
await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
ok((await db.query('select * from storage.objects')).rows.length===0,'non-member storage denied');
await db.exec(`reset role;update public.mc_members set active=false;set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);`);
ok((await db.query('select * from public.mc_cases')).rows.length===0,'membership revocation immediate');
console.log(count+' PostgreSQL checks passed');await db.close();

