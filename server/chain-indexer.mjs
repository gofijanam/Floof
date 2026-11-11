import {Buffer} from 'buffer';
import {decodeWindow,pda,key,discriminator} from './chain-client.mjs';
import {requireThat} from './errors.mjs';
import {base58decode,base58encode,fromBase64,hash,hex} from './crypto.mjs';
// Borsh layouts emitted by programs/floof-escrow. Amounts stay decimal strings.
const layouts={WindowCreated:[['window','key'],['creator','key'],['mint','key'],['end','i64']],Pledged:[['window','key'],['wallet','key'],['amount','u64'],['total','u64']],WindowSettled:[['window','key'],['state','u8'],['raised','u64']],Claimed:[['window','key'],['wallet','key'],['tokens','u64'],['refund','u64']],ScoutFunded:[['epoch','u64'],['root','hash'],['budget','u64']],ScoutClaimed:[['epoch','u64'],['wallet','key'],['amount','u64']],
 // Token-quoted windows (quote.rs). Amounts are raw units of the window's quote mint.
 QuoteWindowCreated:[['window','key'],['quoteMint','key'],['target','u64'],['creatorBuy','u64']],QuoteSet:[['mint','key'],['global','key'],['enabled','u8']]};
let decoders;
async function eventDecoders(){return decoders??=Promise.all(Object.entries(layouts).map(async([kind,fields])=>[(await hash('event:'+kind)).slice(0,16),kind,fields]))}
export async function decodeEvents(tx,program){
 requireThat(tx?.meta&&!tx.meta.err&&Number.isSafeInteger(tx.slot),'TRANSACTION','Only successful finalized transactions may be indexed.',409);
 const keys=[...(tx.transaction?.message?.accountKeys||[]).map(k=>typeof k==='string'?k:k.pubkey),...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])];
 requireThat([...(tx.transaction?.message?.instructions||[]),...(tx.meta.innerInstructions||[]).flatMap(g=>g.instructions||[])].some(ix=>keys[ix.programIdIndex]===program),'PROGRAM_MISMATCH','Transaction did not invoke Floof.');
 const schemas=await eventDecoders(),stack=[],events=[];
 for(const [logIndex,line] of (tx.meta.logMessages||[]).entries()){
  let match=/^Program (\w+) invoke \[(\d+)\]$/.exec(line);
  if(match){const depth=Number(match[2]);requireThat(depth===stack.length+1,'LOGS','Incomplete invocation trace.',409);stack.push(match[1]);continue}
  match=/^Program (\w+) (?:success|failed:.*)$/.exec(line);
  if(match){requireThat(stack.pop()===match[1],'LOGS','Invalid invocation trace.',409);continue}
  if(stack.at(-1)!==program||!line.startsWith('Program data: '))continue;
  let data;try{data=fromBase64(line.slice(14))}catch{continue}
  const spec=schemas.find(([tag])=>tag===hex(data.slice(0,8)));if(!spec)continue;
  const [,kind,fields]=spec,body={};let off=8;const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  for(const [name,type]of fields){const size=['key','hash'].includes(type)?32:type==='u8'?1:8;requireThat(off+size<=data.length,'EVENT','Truncated Floof event.',409);body[name]=type==='key'?base58encode(data.slice(off,off+32)):type==='hash'?hex(data.slice(off,off+32)):type==='u8'?data[off]:(type==='i64'?view.getBigInt64(off,true):view.getBigUint64(off,true)).toString();off+=size}
  requireThat(off===data.length,'EVENT_VERSION','Unknown Floof event layout.',409);events.push({logIndex,kind,...body});
 }
 requireThat(stack.length===0,'LOGS','Truncated invocation trace. Retry from an archival RPC.',409);return events;
}
export async function recoverSettlement(tx,program,rpc){
 requireThat(tx?.meta&&!tx.meta.err&&Number.isSafeInteger(tx.slot)&&tx.meta.logMessages?.includes('Log truncated'),'LOGS','Only a successful runtime-truncated settlement may be recovered.',409);
 const keys=[...tx.transaction.message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey),...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])];
 const instructions=tx.transaction.message.instructions.filter(ix=>keys[ix.programIdIndex]===program);
 requireThat(instructions.length===1,'LOGS','Ambiguous truncated Floof transaction.',409);
 const ix=instructions[0],data=Buffer.from(base58decode(ix.data||''));
 const quoted=data.subarray(0,8).equals(await discriminator('global:settle_launch_quote'));
 requireThat(quoted?data.length===8&&ix.accounts.length===28:data.length===16&&data.subarray(0,8).equals(await discriminator('global:settle_launch'))&&ix.accounts.length===24,'LOGS','Truncated transaction is not a canonical launch settlement.',409);
 const [mintAt,poolAt]=quoted?[2,8]:[1,7],window=keys[ix.accounts[0]],result=await rpc('getAccountInfo',[window,{encoding:'base64',commitment:'finalized',minContextSlot:tx.slot}]);
 requireThat(result?.context?.slot>=tx.slot&&result.value?.owner===program,'LOGS','Finalized settlement account evidence is unavailable.',409);
 const w=await decodeWindow(Buffer.from(result.value.data[0],'base64'));
 requireThat(pda(['window',w.mint],program).toBase58()===window&&w.mint.toBase58()===keys[ix.accounts[mintAt]]&&w.pool.toBase58()===keys[ix.accounts[poolAt]]&&w.state===1&&w.raised<=(w.pledged<w.maxRaise?w.pledged:w.maxRaise),'LOGS','Settlement account does not match the successful instruction.',409);
 return [{logIndex:-1,kind:'WindowSettled',window,state:w.state,raised:String(w.raised),evidence:'finalized-account-recovery',accountSlot:result.context.slot}];
}
export async function ingestFinalized(db,signature,tx,program,now,rpc){
 let events;try{events=await decodeEvents(tx,program)}catch(e){if(e.code!=='LOGS'||!rpc)throw e;events=await recoverSettlement(tx,program,rpc)}
 // Raw record and event rows commit atomically. Replay repairs missing event rows without duplicates.
 const statements=[db.prepare('INSERT OR IGNORE INTO indexed_transactions (signature,slot,block_time,program_id,body,indexed_at) VALUES (?,?,?,?,?,?)').bind(signature,tx.slot,tx.blockTime,program,JSON.stringify(tx),now),...events.map(e=>db.prepare('INSERT OR IGNORE INTO chain_events (signature,log_index,slot,program_id,window,kind,body,indexed_at) VALUES (?,?,?,?,?,?,?,?)').bind(signature,e.logIndex,tx.slot,program,e.window||(e.kind==='QuoteSet'?`quote:${e.mint}`:`scout:${e.epoch}`),e.kind,JSON.stringify(e),now))];
 const results=await db.batch(statements);return {inserted:results[0].meta.changes,events:results.slice(1).reduce((n,r)=>n+r.meta.changes,0)};
}
export async function chainWindow(db,program,window){
 const rows=await db.prepare('SELECT signature,slot,body FROM chain_events WHERE program_id=? AND window=? ORDER BY slot,signature,log_index LIMIT 1001').bind(program,window).all();
 requireThat(rows.results.length<=1000,'HISTORY_LIMIT','Window projection exceeds the inline history limit.',503);
 // Cross-transaction order inside a slot is not guessed. Pledged total is the maximum
 // cumulative on-chain total, claims are per-wallet and lifecycle is monotonic.
 const projection={window,program,network:'devnet',source:'finalized-chain-events',created:null,pledgedLamports:'0',settlement:null,claims:[],events:rows.results.length};
 for(const row of rows.results){const e=JSON.parse(row.body),evidence={signature:row.signature,slot:row.slot};
  if(e.kind==='WindowCreated')projection.created={...e,...evidence};
  if(e.kind==='QuoteWindowCreated')projection.quote={mint:e.quoteMint,migrationTarget:e.target,creatorBuy:e.creatorBuy,...evidence};
  if(e.kind==='Pledged'&&BigInt(e.total)>BigInt(projection.pledgedLamports))projection.pledgedLamports=e.total;
  if(e.kind==='WindowSettled')projection.settlement={...e,...evidence};
  if(e.kind==='Claimed')projection.claims.push({...e,...evidence});
 }return projection;
}
