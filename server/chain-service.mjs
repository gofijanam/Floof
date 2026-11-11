import {migratedPool,cpmmQuote,cpmmIxs} from './cpmm-trade.mjs';
import {decodePool,tradeQuote,tradeIxs} from './launchlab-trade.mjs';
import {Buffer} from 'buffer';
import {MAX_FIRST_BUY,MIN_FIRST_BUY} from './launchlab-curve.mjs';
import {Transaction,ComputeBudgetProgram} from '@solana/web3.js';
import {requireThat} from './errors.mjs';
import {hash} from './crypto.mjs';
import {verifiedConfig,rpcClient,fetchWindow} from './chain-rpc.mjs';
import {key,creatorIx,createIx,pledgeIxs,claimIxs,settleIx,instruction,meta,rewardClaimIx} from './chain-client.mjs';
import {walletEvidence,checkEligibility,clusterFor,signPledge} from './sybil-service.mjs';
import {ingestFinalized} from './chain-indexer.mjs';
const integer=(v,name)=>{requireThat(/^(0|[1-9]\d*)$/.test(String(v))&&BigInt(v)<=0xffffffffffffffffn,'AMOUNT',`${name} must be an unsigned base-unit integer.`);return BigInt(v)};
export async function prepareChain(env,db,owner,wallet,b,now=Date.now()){
 const rpc=rpcClient(env),config=await verifiedConfig(env,rpc);requireThat(!config.paused,'PAUSED','Devnet execution is paused.',503);let ixs,expected={};
 const allowed=['create','pledge','claim','settle','abort','reserve','bond','vested','creator-fees','buy','sell','scout'];requireThat(allowed.includes(b.action),'ACTION','Unsupported chain action.');
 if(b.action==='scout'){
  const epoch=integer(b.epoch,'epoch'),row=await db.prepare('SELECT manifest FROM chain_distributions WHERE program=? AND epoch=?').bind(config.program,String(epoch)).first();requireThat(row,'REWARDS','No funded epoch found.',404);const manifest=JSON.parse(row.manifest),leaf=manifest.leaves.find(l=>l.wallet===wallet);requireThat(leaf,'REWARDS','This wallet has no allocation in this epoch.',404);ixs=[await rewardClaimIx(wallet,epoch,leaf.amount,leaf.proof)];expected={epoch:String(epoch),rewardLamports:leaf.amount};
 }else if(b.action==='create'){
  const v=b.params||{},start=integer(v.start,'start');requireThat(start>=BigInt(Math.floor(now/1000))&&start<=BigInt(Math.floor(now/1000)+86400),'TIME','Choose a start within the next 24 hours.');
  requireThat(typeof v.name==='string'&&Buffer.byteLength(v.name)>=2&&Buffer.byteLength(v.name)<=32&&typeof v.symbol==='string'&&/^[A-Za-z0-9]{2,10}$/.test(v.symbol),'METADATA','Invalid token name or symbol.');
  let uri;try{uri=new URL(v.uri)}catch{}requireThat(uri?.protocol==='https:'&&!uri.username&&!uri.password&&Buffer.byteLength(v.uri)<=200,'METADATA','Use an HTTPS metadata URI of at most 200 bytes.');
  const p={...v,start,end:start+600n};for(const n of ['nonce','minTarget','maxRaise','creatorBuy','creatorTokens','bond'])p[n]=integer(v[n]??'0',n);
  requireThat(p.maxRaise+p.creatorBuy>=MIN_FIRST_BUY&&p.maxRaise+p.creatorBuy<=MAX_FIRST_BUY&&p.minTarget>=p.maxRaise/10n&&p.minTarget<=p.maxRaise,'RAISE','Invalid raise limits.');requireThat(p.creatorTokens<=50_000_000_000_000n,'ALLOCATION','Invalid token allocations.');requireThat(p.bond>=1_000_000_000n&&p.bond<=50_000_000_000n&&Number.isInteger(p.lockDays)&&p.lockDays>=30&&p.lockDays<=180,'BOND','Invalid bond or lock.');
  requireThat(typeof p.walletAge==='boolean'&&typeof p.history==='boolean','POLICY','Eligibility settings must be booleans.');
  const c=await createIx(wallet,config.platform,config.treasury,p,config.program);ixs=[c.instruction];expected={window:c.addresses.window.toBase58(),mint:c.addresses.mint.toBase58(),creatorReserveLamports:'100000000',creationFeeLamports:'20000000',creatorBuyLamports:String(p.creatorBuy)};
 }else{
  const w=await fetchWindow(rpc,b.window,config.program);expected={window:b.window,mint:w.mint.toBase58()};
  if(b.action==='pledge'){
   const amount=integer(b.amount,'amount');requireThat(amount>=10000000n&&amount<=w.maxRaise/100n,'CAP','Pledge amount exceeds this launch’s cap.');const seconds=Math.floor(now/1000);requireThat(w.state===0&&BigInt(seconds)>=w.start&&BigInt(seconds)<w.end,'WINDOW_CLOSED','This fair window is not open.',409);
   const evidence=await walletEvidence(rpc,wallet,seconds);checkEligibility(evidence,w);const cluster=await clusterFor(db,config.program,b.window,owner,evidence,now),expiry=seconds+120,signed=await signPledge(env,config.program,wallet,b.window,cluster,expiry);
   ixs=await pledgeIxs(wallet,b.window,amount,Buffer.from(cluster,'hex'),expiry,config.attestor,Buffer.from(signed.signature,'base64'),config.program);
  }else if(['reserve','bond','vested','creator-fees'].includes(b.action)){requireThat(w.creator.toBase58()===wallet,'CREATOR','Only the creator can claim these funds.',403);ixs=[await creatorIx(b.action,wallet,b.window,w,config.program)];
  }else if(['buy','sell'].includes(b.action)){
   requireThat(w.state===1,'POOL','This window has not launched.',409);const r=await rpc('getAccountInfo',[w.pool.toBase58(),{encoding:'base64',commitment:'confirmed'}]);requireThat(r.value?.owner==='DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6','POOL','Invalid pool owner.');const pool=await decodePool(Buffer.from(r.value.data[0],'base64'));requireThat(pool.mint.equals(w.mint)&&pool.platform.equals(w.platform),'POOL','Pool does not match this launch.');let quote;if(pool.status===2){const migrated=await migratedPool(rpc,w);quote=cpmmQuote(migrated,b.action,integer(b.amount,'amount'),b.slippageBps??100);ixs=await cpmmIxs(wallet,migrated,quote)}else{quote=tradeQuote(pool,b.action,integer(b.amount,'amount'),b.slippageBps??100);ixs=await tradeIxs(wallet,w.pool,pool,quote)}expected.quote=quote;expected.proceeds=b.action==='sell'?'WSOL in your associated token account':undefined;
  }else if(b.action==='claim')ixs=await claimIxs(wallet,b.window,w,config.program);
  else if(b.action==='settle')ixs=[await settleIx(b.window,w,config.program)];
  else ixs=[await instruction('abort_stalled',[meta(b.window,true)],undefined,config.program)];
 }
 const latest=(await rpc('getLatestBlockhash',[{commitment:'confirmed'}])).value;
 const tx=new Transaction({feePayer:key(wallet),...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...ixs),encoded=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
 // Simulation is not a receipt. It rejects malformed/unsafe preparations before a wallet is asked to sign.
 const simulation=await rpc('simulateTransaction',[encoded,{encoding:'base64',sigVerify:false,commitment:'confirmed'}]);requireThat(!simulation.value.err,'SIMULATION_FAILED','The Devnet transaction could not be simulated. Refresh and retry; no funds were moved.',409);
 const messageHash=await hash(tx.serializeMessage().toString('base64')),id=crypto.randomUUID(),result={id,action:b.action,...expected,transaction:encoded,...latest,expiresAt:now+60000,network:'devnet',requiresWalletSignature:true,simulatedUnits:simulation.value.unitsConsumed};
 await db.prepare('INSERT INTO chain_requests(id,owner_id,wallet,program,kind,message_hash,transaction_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,owner,wallet,config.program,b.action,messageHash,JSON.stringify(result),result.expiresAt,now).run();return result;
}
export async function confirmChain(env,db,owner,b,now=Date.now()){
 requireThat(typeof b.id==='string'&&typeof b.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(b.signature),'TRANSACTION','Invalid transaction reference.');
 const row=await db.prepare('SELECT * FROM chain_requests WHERE id=? AND owner_id=?').bind(b.id,owner).first();requireThat(row,'NOT_FOUND','Prepared transaction was not found.',404);requireThat(!row.signature||row.signature===b.signature,'REPLAY','This request already has a different confirmed signature.',409);
 const rpc=rpcClient(env);await verifiedConfig(env,rpc);
 const raw=await rpc('getTransaction',[b.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);requireThat(raw&&!raw.meta.err,'NOT_FINALIZED','Transaction is not finalized successfully yet.',409);
 const tx=Transaction.from(Buffer.from(raw.transaction[0],'base64'));requireThat(tx.feePayer?.toBase58()===row.wallet&&await hash(tx.serializeMessage().toString('base64'))===row.message_hash,'TRANSACTION_MISMATCH','Signature does not match the transaction prepared for this wallet.',403);
 const json=await rpc('getTransaction',[b.signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);if(!['buy','sell'].includes(row.kind))await ingestFinalized(db,b.signature,json,row.program,now,rpc);
 else {const prepared=JSON.parse(row.transaction_json),balance=(list,mint)=>(list||[]).filter(t=>t.owner===row.wallet&&t.mint===mint).reduce((n,t)=>n+BigInt(t.uiTokenAmount.amount),0n);const delta=balance(json.meta.postTokenBalances,prepared.mint)-balance(json.meta.preTokenBalances,prepared.mint);requireThat(row.kind==='buy'?delta>0n:delta<0n,'TRADE','No matching token transfer was found.');const lamports=row.kind==='buy'?BigInt(prepared.quote.amount):balance(json.meta.postTokenBalances,'So11111111111111111111111111111111111111112')-balance(json.meta.preTokenBalances,'So11111111111111111111111111111111111111112');requireThat(lamports>0n,'TRADE','No matching quote transfer was found.');await db.prepare('INSERT OR IGNORE INTO chain_trades(signature,program,window,wallet,side,tokens,lamports,slot,block_time) VALUES(?,?,?,?,?,?,?,?,?)').bind(b.signature,row.program,prepared.window,row.wallet,row.kind,String(delta<0n?-delta:delta),String(lamports),json.slot,json.blockTime*1000).run();}
 await db.prepare('UPDATE chain_requests SET signature=? WHERE id=? AND (signature IS NULL OR signature=?)').bind(b.signature,b.id,b.signature).run();
 return {confirmed:true,signature:b.signature,slot:raw.slot,...JSON.parse(row.transaction_json),transaction:undefined,explorer:`https://explorer.solana.com/tx/${b.signature}?cluster=devnet`};
}
