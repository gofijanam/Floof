import {Buffer} from 'buffer';
import {PROGRAM,LAUNCHLAB,WSOL,key,discriminator} from './chain-client.mjs';
import {CPMM,migratedPool} from './cpmm-trade.mjs';import {base58decode} from './crypto.mjs';import {requireThat} from './errors.mjs';import {fetchWindow} from './chain-rpc.mjs';import {decodePool} from './launchlab-trade.mjs';import {walletEvidence} from './sybil-service.mjs';
const amount=b=>BigInt(b.uiTokenAmount.amount);
export async function decodeMarket(tx,w){
 requireThat(tx?.meta&&!tx.meta.err&&Number.isSafeInteger(tx.slot)&&Number.isSafeInteger(tx.blockTime),'TRANSACTION','A successful finalized transaction with block time is required.',409);
 const keys=[...tx.transaction.message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey),...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])],mint=w.mint.toBase58();
 const pre=tx.meta.preTokenBalances||[],post=tx.meta.postTokenBalances||[],owners=new Map(),accounts=new Set();
 for(const [rows,sign]of [[pre,-1n],[post,1n]])for(const b of rows)if(b.mint===mint){requireThat(b.owner&&keys[b.accountIndex],'HISTORY','Token balance lacks owner evidence.',409);owners.set(b.owner,(owners.get(b.owner)||0n)+sign*amount(b));accounts.add(keys[b.accountIndex]);}
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(g=>g.instructions||[])];
 const tags=await Promise.all(['buy_exact_in','buy_exact_out','sell_exact_in','sell_exact_out'].map(n=>discriminator('global:'+n)));
 const matches=instructions.filter(ix=>{const pid=keys[ix.programIdIndex],a=ix.accounts||[],data=Buffer.from(base58decode(ix.data||''));return pid===LAUNCHLAB.toBase58()&&keys[a[4]]===w.pool.toBase58()&&tags.some(t=>data.subarray(0,8).equals(t))||pid===CPMM.toBase58()&&w.cpmmPool&&keys[a[3]]===w.cpmmPool&&data.subarray(0,8).equals(Buffer.from([143,190,90,218,196,30,51,222]));});
 let trade=null,classification='transfer';
 // Floof's initial exact-out CPI is the settlement allocation, not a user market trade.
 const settlement=instructions.some(ix=>keys[ix.programIdIndex]===PROGRAM.toBase58());
 if(matches.length===1&&!settlement){const ix=matches[0],wallet=keys[ix.accounts[0]],delta=owners.get(wallet)||0n,pid=keys[ix.programIdIndex],isLL=pid===LAUNCHLAB.toBase58(),quoteIndexes=isLL?[8,16,17]:[6,7];
  const vaults=new Set(quoteIndexes.map(i=>keys[ix.accounts[i]]).filter(Boolean));
  const quoteDelta=rows=>rows.filter(b=>b.mint===WSOL.toBase58()&&vaults.has(keys[b.accountIndex])).reduce((n,b)=>n+amount(b),0n);
  const q=quoteDelta(post)-quoteDelta(pre);
  if(delta!==0n&&q!==0n&&((delta>0n)===(q>0n))){trade={wallet,side:delta>0n?'buy':'sell',tokens:String(delta<0n?-delta:delta),lamports:String(q<0n?-q:q)};classification='swap';}else classification='unclassified-swap';
 }else if(matches.length>1&&!settlement)classification='unclassified-swap';
 else if(settlement)classification='floof';
 const migrationTag=await discriminator('global:migrate_to_cpswap');if(instructions.some(ix=>keys[ix.programIdIndex]===LAUNCHLAB.toBase58()&&keys[ix.accounts?.[17]]===w.pool.toBase58()&&Buffer.from(base58decode(ix.data||'')).subarray(0,8).equals(migrationTag)))classification='migration';
 return {classification,trade,accounts:[...accounts],movements:[...owners].filter(([,d])=>d!==0n).map(([wallet,delta])=>({wallet,delta:String(delta)}))};
}
export async function ingestMarket(db,window,w,signature,tx,now=Date.now()){
 const decoded=await decodeMarket(tx,w),program=PROGRAM.toBase58(),time=tx.blockTime*1000;
 const statements=[db.prepare('INSERT OR IGNORE INTO market_transactions(program,window,signature,slot,block_time,classification,body) VALUES(?,?,?,?,?,?,?)').bind(program,window,signature,tx.slot,time,decoded.classification,JSON.stringify(tx))];
 for(const a of decoded.accounts)statements.push(db.prepare('INSERT OR IGNORE INTO market_accounts(program,window,address) VALUES(?,?,?)').bind(program,window,a));
 for(const m of decoded.movements)statements.push(db.prepare('INSERT OR IGNORE INTO market_movements(program,window,signature,wallet,delta,slot,block_time) VALUES(?,?,?,?,?,?,?)').bind(program,window,signature,m.wallet,m.delta,tx.slot,time));
 if(decoded.trade){const t=decoded.trade;statements.push(db.prepare('INSERT OR IGNORE INTO chain_trades(signature,program,window,wallet,side,tokens,lamports,slot,block_time) VALUES(?,?,?,?,?,?,?,?,?)').bind(signature,program,window,t.wallet,t.side,t.tokens,t.lamports,tx.slot,time));}
 await db.batch(statements);return decoded;
}
// Average-cost accounting refuses to invent a purchase price for external transfers.
export function positionLedger(rows,allocations=[]){
 let tokens=0n,cost=0n,realized=0n,known=true;
 const events=[...allocations.map(a=>({...a,type:'allocation'})),...rows.map(r=>({...r,type:'trade'}))].sort((a,b)=>a.slot-b.slot||a.signature.localeCompare(b.signature));
 for(const r of events){const qty=BigInt(r.tokens),value=BigInt(r.lamports);if(r.type==='allocation'||r.side==='buy'){tokens+=qty;cost+=value;}else{if(qty>tokens){known=false;tokens=0n;cost=0n;continue;}const removed=tokens?cost*qty/tokens:0n;tokens-=qty;cost-=removed;realized+=value-removed;}}
 return {tokens:String(tokens),costLamports:String(cost),realizedLamports:String(realized),known};
}
export async function scanMarket(db,rpc,window,now=Date.now()){
 const program=PROGRAM.toBase58(),w=await fetchWindow(rpc,window,program);if(w.state!==1)return {window,status:'not-launched'};
 const poolAccount=(await rpc('getAccountInfo',[w.pool.toBase58(),{encoding:'base64',commitment:'finalized'}])).value;requireThat(poolAccount?.owner===LAUNCHLAB.toBase58(),'POOL','Invalid LaunchLab pool');const pool=await decodePool(Buffer.from(poolAccount.data[0],'base64'));
 if(pool.status===2)w.cpmmPool=(await migratedPool(rpc,w)).pool.toBase58();
 for(const address of [w.mint.toBase58(),w.pool.toBase58(),...(w.cpmmPool?[w.cpmmPool]:[])])await db.prepare('INSERT OR IGNORE INTO market_accounts(program,window,address) VALUES(?,?,?)').bind(program,window,address).run();
 const account=await db.prepare('SELECT * FROM market_accounts WHERE program=? AND window=? ORDER BY complete,updated_at,address LIMIT 1').bind(program,window).first(),cursor=account.cursor?JSON.parse(account.cursor):{};
 const signatures=await rpc('getSignaturesForAddress',[account.address,{commitment:'finalized',limit:5,...(cursor.before?{before:cursor.before}:{}),...(cursor.head?{until:cursor.head}:{})}]);
 for(const item of signatures){if(item.err)continue;const tx=await rpc('getTransaction',[item.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);requireThat(tx,'ARCHIVE_REQUIRED','RPC omitted a historical transaction. Cursor is unchanged.',503);await ingestMarket(db,window,w,item.signature,tx,now);}
 const head=cursor.pendingHead||signatures[0]?.signature||cursor.head,done=signatures.length<5,next=done?{head}:{head:cursor.head,before:signatures.at(-1).signature,pendingHead:head};
 await db.prepare('UPDATE market_accounts SET cursor=?,complete=?,updated_at=? WHERE program=? AND window=? AND address=?').bind(JSON.stringify(next),done?1:0,now,program,window,account.address).run();
 const counts=await db.prepare('SELECT COUNT(*) AS total,SUM(complete) AS complete,MIN(updated_at) AS oldest FROM market_accounts WHERE program=? AND window=?').bind(program,window).first();
 const unknown=await db.prepare("SELECT COUNT(*) AS n FROM market_transactions WHERE program=? AND window=? AND classification='unclassified-swap'").bind(program,window).first();
 const buyer=await db.prepare('SELECT DISTINCT t.wallet FROM chain_trades t LEFT JOIN wallet_evidence e ON e.program=t.program AND e.wallet=t.wallet WHERE t.program=? AND t.window=? AND e.wallet IS NULL LIMIT 1').bind(program,window).first();
 if(buyer){try{const evidence=await walletEvidence(rpc,buyer.wallet,Math.floor(now/1000));await db.prepare('INSERT OR REPLACE INTO wallet_evidence(program,wallet,evidence,observed_at) VALUES(?,?,?,?)').bind(program,buyer.wallet,JSON.stringify(evidence),now).run();}catch(e){if(!['HISTORY_COVERAGE','FUNDING_COVERAGE','NO_HISTORY'].includes(e.code))throw e;}}
 const state=counts.total===counts.complete?'complete-finalized-account-history':'backfilling';
 const evidence={accounts:counts.total,completeAccounts:counts.complete,oldestCheck:counts.oldest,unclassifiedSwaps:unknown.n,mint:w.mint.toBase58(),pool:w.pool.toBase58(),migrationStatus:pool.status,cpmmPool:w.cpmmPool||null};
 await db.prepare('INSERT INTO market_coverage(program,window,checked_at,status,evidence) VALUES(?,?,?,?,?) ON CONFLICT(program,window) DO UPDATE SET checked_at=excluded.checked_at,status=excluded.status,evidence=excluded.evidence').bind(program,window,now,state,JSON.stringify(evidence)).run();return {window,status:state,...evidence,scanned:signatures.length};
}
