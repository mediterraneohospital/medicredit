import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notify,title} from './notify.mjs';
const bad={results:[{ref:'project',ok:false,failure:'access-denied',status:401}]};
const issue={number:12,title,user:{login:'github-actions[bot]'}};
test('failure opens an alert with owner mention',async()=>{const calls=[];assert.equal(await notify(bad,async(...args)=>{calls.push(args);return []},'https://example.test'),'opened');assert.equal(calls[1][0],'POST');assert.match(calls[1][2].body,/@danal8/);});
test('repeated failure is deduplicated',async()=>{let calls=0;assert.equal(await notify(bad,async()=>{calls++;return [issue]},''),'already-open');assert.equal(calls,1);});
test('recovery closes only bot monitor issues',async()=>{const calls=[];await notify({results:[{ok:true}]},async(...args)=>{calls.push(args);return args[0]==='GET'?[issue,{...issue,number:13,user:{login:'human'}}]:{}},'');assert.deepEqual(calls[1],['PATCH','/issues/12',{state:'closed',state_reason:'completed'}]);assert.equal(calls.length,2);});
test('notification API errors propagate',async()=>{await assert.rejects(notify(bad,async()=>{throw Error('HTTP 403')},''));});
