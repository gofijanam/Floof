// Always-on Devnet supervisor. Durable scan cursors live in the API database, not this filesystem.
import http from 'node:http';import fs from 'node:fs';import {spawn} from 'node:child_process';
import {Connection,Keypair} from '@solana/web3.js';import {PROGRAM,discriminator} from '../server/chain-client.mjs';import {base58encode} from '../server/crypto.mjs';import {DEVNET_GENESIS} from '../server/chain-rpc.mjs';import {WEEK} from '../server/scout-points.mjs';
const origin=process.env.FLOOF_API_ORIGIN,secret=process.env.INDEXER_SECRET;if(!origin||!secret||new URL(origin).protocol!=='https:')throw Error('HTTPS FLOOF_API_ORIGIN and INDEXER_SECRET required');
fs.mkdirSync('.secrets',{recursive:true,mode:0o700});fs.mkdirSync('.local',{recursive:true});
for(const [env,name]of [['KEEPER_KEYPAIR_JSON','keeper'],['DISTRIBUTOR_KEYPAIR_JSON','distributor']])if(process.env[env]){const bytes=JSON.parse(process.env[env]);Keypair.fromSecretKey(Uint8Array.from(bytes));fs.writeFileSync(`.secrets/${name}.json`,JSON.stringify(bytes),{mode:0o600});}
process.env.KEEPER_KEYPAIR||='.secrets/keeper.json';process.env.DISTRIBUTOR_KEYPAIR||='.secrets/distributor.json';
const connection=new Connection(process.env.SOLANA_DEVNET_RPC_URL||'https://api.devnet.solana.com','finalized');let stopping=false,lastSuccess=0,lastError=null,cycles=0;
async function api(path,data){const headers={'Authorization':`Bearer ${secret}`,'Content-Type':'application/json'};if(process.env.SITES_SERVICE_TOKEN)headers['OAI-Sites-Authorization']=`Bearer ${process.env.SITES_SERVICE_TOKEN}`;const r=await fetch(new URL('/api'+path,origin),{method:data===undefined?'GET':'POST',headers,...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(180000)});const b=await r.json();if(!r.ok)throw Error(`${path}: ${b.error?.code||r.status}`);return b;}
function child(script,args=[]){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script,...args],{stdio:'inherit',env:process.env});const timeout=setTimeout(()=>{p.kill('SIGTERM');setTimeout(()=>p.kill('SIGKILL'),5000).unref()},180000);p.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error(`${script} exited ${code}`))});p.on('error',e=>{clearTimeout(timeout);reject(e)});});}
async function indexProgram(){const name='events-v2',saved=(await api(`/indexer/checkpoint?name=${name}`)).cursor||{},items=await connection.getSignaturesForAddress(PROGRAM,{limit:20,...(saved.before?{before:saved.before}:{}),...(saved.head?{until:saved.head}:{})},'finalized');
 const valid=items.filter(x=>!x.err);for(let i=0;i<valid.length;i+=5)await api('/indexer/webhook',{signatures:valid.slice(i,i+5).map(r=>r.signature)});
 const head=saved.pendingHead||items[0]?.signature||saved.head,next=items.length<20?{head,complete:true}:{head:saved.head,before:items.at(-1).signature,pendingHead:head,complete:false};await api(`/indexer/checkpoint?name=${name}`,next);return next.complete;}
const tasks={};async function task(name,fn){try{const result=await fn();tasks[name]={ok:true,lastSuccess:Date.now()};return result}catch(e){tasks[name]={...tasks[name],ok:false,error:e.message};console.error(JSON.stringify({task:name,error:e.message}));return null}}
let lastScoutAttempt=0;
async function scouts(){if(Date.now()-lastScoutAttempt<3600000)return;lastScoutAttempt=Date.now();const epoch=String(Math.floor(Date.now()/WEEK)-1),done=(await api('/indexer/checkpoint?name=scout-last-epoch')).cursor;if(done?.epoch===epoch)return;
 const snapshot=await api(`/indexer/scout-snapshot?epoch=${epoch}`);if(!snapshot.points.length)return;const file=`.local/points-${epoch}.json`;fs.writeFileSync(file,JSON.stringify(snapshot));await child('scripts/scout-distributor.mjs',[file,'--send']);const manifest=JSON.parse(fs.readFileSync(`.local/scout-${epoch}.json`));await api('/indexer/scout-publish',manifest);await api('/indexer/checkpoint?name=scout-last-epoch',{epoch,signature:manifest.fundingSignature});}
const server=http.createServer((req,res)=>{if(!['/health','/api/health'].includes(req.url)){res.writeHead(404);res.end();return;}const ok=lastSuccess>0&&Date.now()-lastSuccess<300000;res.writeHead(ok?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'floof-devnet-jobs',network:'devnet',ok,cycles,lastSuccess,lastError,tasks}));});server.listen(Number(process.env.PORT||10000),'0.0.0.0');
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;});
while(!stopping){try{
 if(await connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Refusing non-Devnet RPC');
 await task('keeper',()=>child('scripts/settlement-keeper.mjs',['--once']));
 const complete=await task('indexer',indexProgram);
 if(complete!==null){lastSuccess=Date.now();lastError=null;cycles++;}
 else throw Error('Program indexing failed');
 if(complete){await task('markets',async()=>{const windows=await connection.getProgramAccounts(PROGRAM,{filters:[{memcmp:{offset:0,bytes:base58encode(await discriminator('account:Window'))}}]});for(const row of windows){if(stopping)break;await api('/indexer/scan',{window:row.pubkey.toBase58()});}});await task('scouts',scouts);}
 console.log(JSON.stringify({service:'jobs',cycle:cycles,at:new Date().toISOString(),tasks}));
 }catch(e){lastError=e.message;console.error(JSON.stringify({service:'jobs',error:e.message}));}
 if(!stopping)await new Promise(r=>setTimeout(r,30000));
}
server.close();process.exit(0);
