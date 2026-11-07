// Run outside the request Worker: node scripts/indexer-runner.mjs [--once]
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const rpc=process.env.SOLANA_DEVNET_RPC_URL||'https://api.devnet.solana.com';
const program=process.env.FLOOF_PROGRAM_ID,origin=process.env.FLOOF_API_ORIGIN,secret=process.env.INDEXER_SECRET;
const checkpoint=process.env.INDEXER_CHECKPOINT||'.local/indexer-cursor.json';
if(!program||!origin||!secret)throw new Error('Configure FLOOF_PROGRAM_ID, FLOOF_API_ORIGIN and INDEXER_SECRET.');
if(new URL(rpc).protocol!=='https:'||new URL(origin).protocol!=='https:')throw new Error('HTTPS endpoints required.');
async function chain(method,params){const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`RPC HTTP ${r.status}`);const b=await r.json();if(b.error)throw new Error('RPC request failed');return b.result}
async function run(){
 // A configuration accidentally pointed at Mainnet must not silently change networks.
 if(await chain('getGenesisHash',[])!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('RPC is not Solana Devnet.');
 let saved;try{saved=JSON.parse(await readFile(checkpoint,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(saved&&(saved.program!==program||saved.rpc!==rpc))throw new Error('Checkpoint belongs to another program or RPC.');
 const items=[];let before,complete=false;
 for(let page=0;page<10;page++){
  const list=await chain('getSignaturesForAddress',[program,{commitment:'finalized',limit:1000,...(before?{before}:{}),...(saved?.signature?{until:saved.signature}:{})}]);
  items.push(...list);if(list.length<1000){complete=true;break}before=list.at(-1).signature;
 }
 if(!complete)throw new Error('Backfill exceeds 10,000 transactions; cursor was not advanced. Use a complete archival backfill.');
 const valid=items.filter(t=>!t.err).reverse();let inserted=0;
 for(let i=0;i<valid.length;i+=10){const headers={'Content-Type':'application/json','Authorization':`Bearer ${secret}`};if(process.env.SITES_SERVICE_TOKEN)headers['OAI-Sites-Authorization']=`Bearer ${process.env.SITES_SERVICE_TOKEN}`;
  const r=await fetch(new URL('/api/indexer/webhook',origin),{method:'POST',headers,body:JSON.stringify({signatures:valid.slice(i,i+10).map(t=>t.signature)}),signal:AbortSignal.timeout(150000)});if(!r.ok)throw new Error(`Indexer ingest HTTP ${r.status}; cursor unchanged`);inserted+=(await r.json()).inserted;
 }
 if(items.length){await mkdir(dirname(checkpoint),{recursive:true});await writeFile(checkpoint+'.tmp',JSON.stringify({program,rpc,signature:items[0].signature,slot:items[0].slot}));await rename(checkpoint+'.tmp',checkpoint)}
 console.log(JSON.stringify({at:new Date().toISOString(),observed:items.length,inserted}));
}
for(;;){try{await run()}catch(e){console.error(JSON.stringify({at:new Date().toISOString(),error:e.message}));if(process.argv.includes('--once'))process.exitCode=1}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,10000))}
