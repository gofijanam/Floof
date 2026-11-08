import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {sqliteDB} from '../scripts/sqlite-adapter.mjs';
await mkdir('.local',{recursive:true});await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:'.local/test-worker.mjs'});
const worker=(await import('../.local/test-worker.mjs')).default;
test('authorized durable checkpoints remain recoverable when RPC configuration is unavailable',async()=>{
 const env={...await setup(),INDEXER_SECRET:'test-only-indexer',SOLANA_DEVNET_RPC_URL:'http://invalid-rpc.test'};
 const url='https://floof.test/api/indexer/checkpoint?name=outage-test';
 const request=(method,token,data)=>worker.fetch(new Request(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env,{});
 assert.equal((await request('GET','wrong')).status,403);
 assert.equal((await request('POST',env.INDEXER_SECRET,{head:'finalized-test-signature'})).status,200);
 const result=await request('GET',env.INDEXER_SECRET);assert.equal(result.status,200);
 assert.deepEqual((await result.json()).cursor,{head:'finalized-test-signature'});
 const scan=await worker.fetch(new Request('https://floof.test/api/indexer/scan',{method:'POST',headers:{Authorization:`Bearer ${env.INDEXER_SECRET}`},body:'{}'}),env,{});assert.equal(scan.status,503);
});
async function setup(){const DB=sqliteDB();for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())DB.raw.exec(await readFile('drizzle/'+f,'utf8'));return {DB}}
async function call(env,path,{data,user='alice',key=crypto.randomUUID(),origin}={}){const headers=new Headers();if(user)headers.set('oai-authenticated-user-id',user);if(origin)headers.set('Origin',origin);if(data!==undefined){headers.set('Content-Type','application/json');headers.set('Idempotency-Key',key)}const res=await worker.fetch(new Request('https://floof.test/api'+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)}),env,{});return {status:res.status,body:await res.json()}}
test('bootstrap is persistent; authentication and cross-origin checks are enforced',async()=>{const env=await setup();const first=await call(env,'/bootstrap');const second=await call(env,'/bootstrap');assert.equal(first.status,200);assert.equal(first.body.coins[0].windowEnd,second.body.coins[0].windowEnd);assert.equal(first.body.stats.launched,0);assert.equal((await call(env,'/session',{data:{},user:null})).status,401);assert.equal((await call(env,'/session',{data:{},origin:'https://evil.test'})).status,403)});
test('same request twice credits only once; request body conflict returns 409',async()=>{const env=await setup(),key=crypto.randomUUID();const a=await call(env,'/session',{data:{},key});const b=await call(env,'/session',{data:{},key});assert.equal(a.status,200);assert.equal(a.body.receipt,b.body.receipt);assert.equal(b.body.state.sol,100);const bad=await call(env,'/session',{data:{different:true},key});assert.equal(bad.status,409)});
test('concurrent pledges are atomic and cannot overdraw account cap',async()=>{const env=await setup();await call(env,'/session',{data:{}});const att=await Promise.all([0,1].map(()=>call(env,'/pledge/attest',{data:{coin:'floof'}})));const results=await Promise.all(att.map(r=>call(env,'/pledges',{data:{coin:'floof',amount:0.8,attestation:r.body.id}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const state=(await call(env,'/state')).body;assert.equal(state.sol,99.2);assert.equal(state.myPledges.floof,0.8);assert.equal(state.coins[0].pledgers,1)});
test('accounts cannot read another wallet, indexes require authorization, unknown TRUTH stays unavailable',async()=>{const env=await setup();const a=await call(env,'/session',{data:{}});await call(env,'/session',{data:{},user:'bob'});const p=await call(env,`/wallets/${a.body.state.walletAddress}/positions`,{user:'bob'});assert.equal(p.status,403);assert.equal((await call(env,'/indexer/webhook',{data:{signatures:[]}})).status,403);const truth=await call(env,'/truth/unknown');assert.equal(truth.body.grade,null);assert.equal(truth.body.status,'unavailable');assert.equal((await call(env,'/chain/prepare',{data:{}})).status,401)});
test('API trade receipt is server persisted and holdings match reload',async()=>{const env=await setup();await call(env,'/session',{data:{}});const q=await call(env,'/quote',{data:{coin:'puff',side:'buy',amount:0.5,unit:'sol',slippageBps:100}});assert.equal(q.status,200);const key=crypto.randomUUID();const t=await call(env,'/trades',{data:{quoteId:q.body.quoteId},key});assert.equal(t.status,200);const repeat=await call(env,'/trades',{data:{quoteId:q.body.quoteId},key});assert.equal(repeat.body.receipt,t.body.receipt);const state=(await call(env,'/state')).body;assert.equal(state.sol,99.5);assert.equal(state.positions.puff.tokens,t.body.tokens);assert.equal((await call(env,'/coins/puff/trades')).body.length,1);assert.equal((await call(env,'/coins/puff/candles?tf=5m')).body.length,1)});
const launchForm={name:'Launch test',ticker:'TSTNEW',desc:'Saved metadata',alloc:30,startIn:10,ceiling:'0.0000004',minTarget:'40',bond:5,creatorPct:2,vest:90,x:'@floof_test',tg:'t.me/flooftest',web:'https://example.com'};
test('launch drafts survive reload, isolate owners and reject conflicting tabs',async()=>{
 const env=await setup();assert.equal((await call(env,'/drafts/launch',{user:null})).status,401);
 assert.equal((await call(env,'/drafts/launch')).body.revision,0);
 const saved=await call(env,'/drafts/launch',{data:{revision:0,form:launchForm}});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
 assert.equal((await call(env,'/drafts/launch')).body.form.name,'Launch test');assert.equal((await call(env,'/drafts/launch',{user:'bob'})).body.form,null);
 assert.equal((await call(env,'/drafts/launch',{data:{revision:0,form:launchForm}})).status,200);
 assert.equal((await call(env,'/drafts/launch',{data:{revision:0,form:{...launchForm,name:'Stale'}}})).status,409);
 assert.equal((await call(env,'/drafts/launch',{data:{revision:1,form:null}})).body.revision,2);
 assert.equal((await call(env,'/drafts/launch')).body.form,null);
});
test('token settings reject malformed links and numbers and publish normalized metadata',async()=>{
 const env=await setup();await call(env,'/session',{data:{}});
 for(const bad of [{tg:'javascript:alert(1)'},{x:'not a handle'},{web:'http://example.com'},{web:'https://me:password@example.com'},{ceiling:'0.0000004junk'},{ceiling:'4e-7'}])assert.equal((await call(env,'/coins/prepare',{data:{...launchForm,...bad}})).status,400);
 const r=await call(env,'/coins',{data:launchForm});assert.equal(r.status,200);assert.equal(r.body.state.sol,94.98);
 const metadata=(await call(env,`/coins/${r.body.coin}/metadata`)).body;assert.equal(metadata.symbol,'TSTNEW');assert.equal(metadata.extensions.telegram,'https://t.me/flooftest');assert.equal(metadata.extensions.twitter,'https://x.com/floof_test');assert.equal(metadata.permanent,false);
});
