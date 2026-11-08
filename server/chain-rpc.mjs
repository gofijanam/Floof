import {Buffer} from 'buffer';
import {requireThat} from './errors.mjs';
import {PROGRAM,key,pda,decodeWindow,discriminator} from './chain-client.mjs';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const cache=new Map(), schedules=new Map();
async function pace(endpoint,method,env){const delay=method==='getTransaction'?Number(env.RPC_TRANSACTION_INTERVAL_MS||1200):Number(env.RPC_MIN_INTERVAL_MS||0);if(!delay)return;const id=endpoint+':'+(method==='getTransaction'?method:'reads'),now=Date.now(),at=Math.max(now,schedules.get(id)||0);schedules.set(id,at+delay);if(at>now)await new Promise(r=>setTimeout(r,at-now));}
export function rpcClient(env){return async(method,params=[])=>{
 const archival=method==='getTransaction'&&env.SOLANA_DEVNET_ARCHIVE_RPC_URL;const endpoint=archival||env.SOLANA_DEVNET_RPC_URL||'https://api.devnet.solana.com',url=new URL(endpoint);requireThat(url.protocol==='https:'&&!url.username&&!url.password,'RPC_CONFIG','A secure Devnet RPC is required.',503);
 const ttl=method==='getTransaction'?3600000:method==='getGenesisHash'?60000:['getAccountInfo','getMultipleAccounts','getProgramAccounts','getTokenAccountsByOwner','getBalance'].includes(method)?5000:0,id=endpoint+JSON.stringify([method,params]),cached=cache.get(id);if(ttl&&cached?.until>Date.now())return cached.promise;
 const promise=(async()=>{if(archival)requireThat(await rpcClient({...env,SOLANA_DEVNET_RPC_URL:archival,SOLANA_DEVNET_ARCHIVE_RPC_URL:''})('getGenesisHash')===DEVNET_GENESIS,'WRONG_NETWORK','Archive RPC must be Devnet.',503);for(let attempt=0;attempt<3;attempt++){await pace(endpoint,method,env);const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});if(response.status===429&&attempt<2){await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;}requireThat(response.ok,'RPC_UNAVAILABLE',`Devnet RPC returned HTTP ${response.status}.`,503);const r=await response.json();requireThat(!r.error,'RPC_UNAVAILABLE',`Devnet RPC rejected ${method} (${r.error?.code}).`,503);requireThat(Object.hasOwn(r,'result'),'RPC_UNAVAILABLE','Devnet RPC returned an incomplete response.',503);return r.result;}})();
 if(ttl){if(cache.size>500)cache.clear();cache.set(id,{until:Date.now()+ttl,promise});}try{const result=await promise;if(result===null)cache.delete(id);return result;}catch(e){cache.delete(id);throw e;}
};}
export async function verifiedConfig(env,rpc){
 requireThat(env.CHAIN_EXECUTION==='devnet'&&env.FLOOF_PROGRAM_ID===PROGRAM.toBase58(),'CHAIN_NOT_DEPLOYED','Devnet execution is not activated. No transaction has been prepared.',503);
 requireThat(await rpc('getGenesisHash')===DEVNET_GENESIS,'WRONG_NETWORK','RPC network is not Devnet.',503);
 const program=await rpc('getAccountInfo',[env.FLOOF_PROGRAM_ID,{encoding:'base64',commitment:'finalized'}]);requireThat(program.value?.executable,'PROGRAM_UNAVAILABLE','Floof program is not deployed.',503);
 const config=await rpc('getAccountInfo',[pda(['config']).toBase58(),{encoding:'base64',commitment:'finalized'}]);requireThat(config.value?.owner===env.FLOOF_PROGRAM_ID,'CONFIG_UNAVAILABLE','Floof configuration is not initialized.',503);
 const data=Buffer.from(config.value.data[0],'base64');requireThat(data.length===234&&data.subarray(0,8).equals(await discriminator('account:Config')),'CONFIG_UNAVAILABLE','Unsupported Floof configuration.',503);
 const pk=o=>key(data.subarray(o,o+32)).toBase58();return {program:env.FLOOF_PROGRAM_ID,global:pk(8),platform:pk(40),treasury:pk(72),authority:pk(104),attestor:pk(136),oracleA:pk(168),oracleB:pk(200),paused:!!data[232]};
}
export async function fetchWindow(rpc,address,program=PROGRAM.toBase58()){
 let pk;try{pk=key(address)}catch{requireThat(false,'WINDOW','Invalid window address.')}
 const r=await rpc('getAccountInfo',[pk.toBase58(),{encoding:'base64',commitment:'confirmed'}]);requireThat(r.value?.owner===program,'WINDOW','Window is unavailable.',404);const w=await decodeWindow(Buffer.from(r.value.data[0],'base64'));requireThat(pda(['window',w.mint],program).equals(pk),'WINDOW','Noncanonical window address.');return w;
}
