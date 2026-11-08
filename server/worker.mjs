import {chainTruth,indexedTruth} from './chain-truth.mjs';
import {scanMarket} from './market-history.mjs';
import {scoutSnapshot} from './scout-points.mjs';
import {rpcClient,verifiedConfig} from './chain-rpc.mjs';
import {PROGRAM,pda,u64,discriminator} from './chain-client.mjs';
import {scoutTree} from './scout-merkle.mjs';
import {Buffer} from 'buffer';
import {chainSnapshot} from './chain-state.mjs';
import {prepareChain,confirmChain} from './chain-service.mjs';
import {ingestFinalized,chainWindow} from './chain-indexer.mjs';
import {readDraft,saveDraft} from './launch-drafts.mjs';
import {Repository} from './repository.mjs';
import {AppError,requireThat} from './errors.mjs';
import {seedState,tick,snapshot,command,coin,publicCoin,creator,holders,candles,validateCoin,scoutRows,truthFor,rewardEpoch,audit} from './engine.mjs';
import {hash,hex,base58decode,verifyWallet,merkle} from './crypto.mjs';
import {buildCoins} from '../src/lib/mock.ts';
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const error=(status,code,message,requestId)=>json({error:{code,message},requestId},status);
async function bytes(req,limit){const reader=req.body?.getReader();requireThat(reader,'BODY','A request body is required.');let length=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new AppError(413,'TOO_LARGE','Upload or request is too large.')}chunks.push(value)}const result=new Uint8Array(length);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length}return result}
async function body(req){try{const data=JSON.parse(new TextDecoder().decode(await bytes(req,65536)));requireThat(data&&typeof data==='object'&&!Array.isArray(data),'JSON','Expected a JSON object.');return data}catch(e){if(e instanceof AppError)throw e;throw new AppError(400,'JSON','Invalid JSON request.')}}
function safeWallet(w){try{return base58decode(w).length===32}catch{return false}}
const rpc=(env,method,params)=>rpcClient(env)(method,params);
async function readState(repo,now){const current=await repo.read();if(Object.values(current.state.coins).some(c=>(['open','upcoming'].includes(c.status)&&now>=c.windowEnd)||(c.status==='upcoming'&&now>=c.windowStart)||(c.creatorId&&c.bondState==='locked'&&now>=c.createdAt+30*86400000)))return repo.change(s=>{if(!tick(s,now))return {unchanged:true,value:s};audit(s);return s});return current.state}
async function mutate(req,repo,id,kind,b,now){
 requireThat(id,'AUTH_REQUIRED','Sign in to use your sandbox wallet.',401);
 const key=req.headers.get('Idempotency-Key');requireThat(key&&/^[a-zA-Z0-9_-]{16,100}$/.test(key),'IDEMPOTENCY','A unique Idempotency-Key is required.');const digest=await hash(JSON.stringify({kind,b})),receiptKey=`${id}:${key}`;
 const result=await repo.change(s=>{
  const previous=s.receipts[receiptKey];if(previous){requireThat(previous.digest===digest,'IDEMPOTENCY_CONFLICT','This request ID was already used for a different action.',409);return {unchanged:true,value:previous}}
  requireThat(Object.keys(s.receipts).length<20000,'CAPACITY','Development action limit reached. Export the ledger before continuing.',503);
  const a=s.accounts[id];if(a){const rate=a.rate||{start:now,count:0};if(now-rate.start>60000){rate.start=now;rate.count=0}requireThat(rate.count<100,'RATE_LIMIT','Too many actions. Wait a minute.',429);rate.count++;a.rate=rate}
  const result=command(s,id,kind,b,now),receipt={id:`sandbox-${crypto.randomUUID()}`,digest,kind,result,at:now,mode:'sandbox'};s.receipts[receiptKey]=receipt;
  for(const [key,q] of Object.entries(s.quotes))if(q.expiresAt<now-60000)delete s.quotes[key];for(const [key,att]of Object.entries(s.attestations))if(att.expiry<now-60000)delete s.attestations[key];
  return receipt;
 });const {state}=await repo.read();return json({receipt:result.id,...result.result,state:snapshot(state,id,now),mode:'sandbox'});
}
async function route(req,env,ctx){
 const u=new URL(req.url),p=u.pathname.replace(/^\/api/,'')||'/',now=Date.now(),user=req.headers.get('oai-authenticated-user-id'),id=user?await hash(`floof-account-v1:${user}`):null;
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{Allow:'GET, POST, OPTIONS'}});
 if(req.method!=='GET'&&req.method!=='HEAD'){const origin=req.headers.get('Origin');requireThat(!origin||origin===u.origin,'ORIGIN','Cross-origin writes are not permitted.',403);requireThat(req.headers.get('Sec-Fetch-Site')!=='cross-site','ORIGIN','Cross-site writes are not permitted.',403)}
 if(p==='/health')return json({ok:!!env.DB,service:'floof-api',version:'0.4.0',mode:env.CHAIN_EXECUTION==='devnet'?'devnet':'sandbox',chainExecution:env.CHAIN_EXECUTION==='devnet',storage:env.DB?(env.STORAGE_NAME||'D1'):'missing',authMode:env.AUTH_MODE||'sites'});
 if(p==='/qa-metadata.json'&&req.method==='GET')return json({name:'Floof Devnet QA',symbol:'FLQA',description:'Disposable Floof integration-test token on Solana Devnet. No monetary value.',image:new URL('/mochi/happy-512.webp',u.origin).href});
 requireThat(env.DB,'DATABASE_UNAVAILABLE','Database binding is unavailable.',503);
 const repo=new Repository(env.DB,()=>seedState(buildCoins(now),now));
 if(p==='/session'&&req.method==='POST'&&env.AUTH_MODE==='wallet'&&env.AUTH_WALLET&&id){await repo.change(s=>{command(s,id,'connect',{},now);s.accounts[id].linkedWallet=env.AUTH_WALLET;return true});return json({connected:true,wallet:env.AUTH_WALLET});}
 if(p.startsWith('/indexer/')&&p!=='/indexer/webhook'){
  requireThat(env.INDEXER_SECRET&&req.headers.get('Authorization')===`Bearer ${env.INDEXER_SECRET}`,'FORBIDDEN','Invalid indexer authorization.',403);
  if(p==='/indexer/checkpoint'){
   const name=u.searchParams.get('name');requireThat(name&&/^[a-z0-9:-]{1,100}$/.test(name),'JOB','Invalid job name');
   if(req.method==='GET'){const row=await env.DB.prepare('SELECT cursor,updated_at FROM chain_jobs WHERE program=? AND name=?').bind(PROGRAM.toBase58(),name).first();return json(row?{...row,cursor:JSON.parse(row.cursor)}:{cursor:null});}
   requireThat(req.method==='POST','METHOD','POST required',405);const b=await body(req);await env.DB.prepare('INSERT INTO chain_jobs(program,name,cursor,updated_at) VALUES(?,?,?,?) ON CONFLICT(program,name) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at').bind(PROGRAM.toBase58(),name,JSON.stringify(b),now).run();return json({saved:true});
  }
  // Durable checkpoint recovery must work during an RPC outage. Chain-reading
  // operations still verify Devnet before doing any work.
  const chain=rpcClient(env);requireThat(await chain('getGenesisHash')==='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','WRONG_NETWORK','Devnet required.',503);
  if(p==='/indexer/scan'&&req.method==='POST'){const b=await body(req);return json(await scanMarket(env.DB,chain,b.window,now));}
  if(p==='/indexer/scout-snapshot'&&req.method==='GET')return json(await scoutSnapshot(env.DB,chain,u.searchParams.get('epoch'),now));
  if(p==='/indexer/scout-publish'&&req.method==='POST'){
   const b=await body(req),tree=await scoutTree(PROGRAM.toBase58(),b.epoch,b.leaves);requireThat(tree.root===b.root&&tree.budgetLamports===b.budgetLamports,'REWARDS','Manifest does not match its leaves.');
   const info=(await chain('getAccountInfo',[pda(['scout',u64(b.epoch)]).toBase58(),{encoding:'base64',commitment:'finalized'}])).value;requireThat(info?.owner===PROGRAM.toBase58(),'REWARDS','Reward epoch is not finalized.',409);const data=Buffer.from(info.data[0],'base64');requireThat(data.subarray(0,8).equals(await discriminator('account:ScoutEpoch'))&&data.subarray(16,48).toString('hex')===tree.root&&data.readBigUInt64LE(48)===BigInt(tree.budgetLamports),'REWARDS','On-chain budget or root does not match.',409);
   const tx=await chain('getTransaction',[b.fundingSignature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);requireThat(tx&&!tx.meta.err,'REWARDS','Funding transaction is not finalized.',409);const accountKeys=[...tx.transaction.message.accountKeys,...(tx.meta.loadedAddresses?.writable||[]),...(tx.meta.loadedAddresses?.readonly||[])],fundTag=await discriminator('global:fund_scout_epoch'),instructions=tx.transaction.message.instructions;requireThat(instructions.some(ix=>accountKeys[ix.programIdIndex]===PROGRAM.toBase58()&&Buffer.from(base58decode(ix.data)).subarray(0,8).equals(fundTag)&&Buffer.from(base58decode(ix.data)).subarray(16,48).toString('hex')===tree.root)&&instructions.some(ix=>accountKeys[ix.programIdIndex]==='DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6'&&Buffer.from(base58decode(ix.data)).subarray(0,8).equals(Buffer.from([117,241,198,168,248,218,80,29]))),'REWARDS','Funding must atomically collect real platform fees.');
   await env.DB.prepare('INSERT OR IGNORE INTO chain_distributions(program,epoch,manifest,funding_signature) VALUES(?,?,?,?)').bind(PROGRAM.toBase58(),String(b.epoch),JSON.stringify({...tree,evidenceHash:b.evidenceHash,points:b.points||[],source:'actual-platform-fees'}),b.fundingSignature).run();return json({published:true,epoch:b.epoch});
  }
  throw new AppError(404,'NOT_FOUND','Indexer route not found');
 }
 if(p==='/integrations')return json({mode:env.CHAIN_EXECUTION==='devnet'?'devnet':'sandbox',chainExecution:env.CHAIN_EXECUTION==='devnet',devnetRpc:!!env.SOLANA_DEVNET_RPC_URL,escrowProgram:env.FLOOF_PROGRAM_ID||null,launchlab:'verified_sbf_with_real_devnet_binary',indexer:!!env.INDEXER_SECRET,requirements:['Fund and deploy the verified program on public Devnet','Configure attestor and independent oracle runtime secrets','Run the persistent indexer/keeper and funded Scout distribution','Verify Raydium-operated CPMM migration and route migrated pools']});
 if(p==='/drafts/launch'){
  requireThat(id,'AUTH_REQUIRED','Sign in to save or restore a draft.',401);
  if(req.method==='GET')return json(await readDraft(env.DB,id));
  requireThat(req.method==='POST','METHOD','Method not allowed.',405);
  return json(await saveDraft(env.DB,id,await body(req),now));
 }
 if(p==='/uploads/image'&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in before uploading.',401);requireThat(env.BUCKET,'UPLOAD_UNAVAILABLE','Image storage is unavailable.',503);const data=await bytes(req,4*1024*1024);requireThat(data.length>12,'IMAGE','Image file is empty or invalid.');let ext,mime;if(data[0]===137&&data[1]===80&&data[2]===78&&data[3]===71){ext='png';mime='image/png'}else if(data[0]===255&&data[1]===216&&data[2]===255){ext='jpg';mime='image/jpeg'}else if(new TextDecoder().decode(data.slice(0,6)).startsWith('GIF8')){ext='gif';mime='image/gif'}else if(new TextDecoder().decode(data.slice(0,4))==='RIFF'&&new TextDecoder().decode(data.slice(8,12))==='WEBP'){ext='webp';mime='image/webp'}requireThat(ext,'IMAGE','Only PNG, JPEG, GIF and WebP are supported.');const digest=hex(await crypto.subtle.digest('SHA-256',data));const key=`images/${digest}.${ext}`;await env.BUCKET.put(key,data,{httpMetadata:{contentType:mime},customMetadata:{owner:id}});return json({uri:`/api/${key}`,storage:'r2',permanent:false},201);
 }
 if(p.startsWith('/images/')&&req.method==='GET'){
  requireThat(/^\/images\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(p),'NOT_FOUND','Image not found.',404);const obj=await env.BUCKET?.get(p.slice(1));requireThat(obj,'NOT_FOUND','Image not found.',404);const headers=new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=86400'});obj.writeHttpMetadata(headers);return new Response(obj.body,{headers});
 }
 if(env.CHAIN_EXECUTION==='devnet'&&p.startsWith('/truth/')&&req.method==='GET'){const mint=decodeURIComponent(p.slice(7));requireThat(safeWallet(mint),'MINT','Enter a Solana mint address.');return json(await indexedTruth(env,env.DB,mint));}
 if(p.startsWith('/chain/truth/')&&req.method==='GET'){const mint=p.slice('/chain/truth/'.length);requireThat(safeWallet(mint),'MINT','Invalid mint address.');return json(await chainTruth(env,mint));}
 if(p.startsWith('/chain/windows/')&&req.method==='GET'){
  requireThat(env.FLOOF_PROGRAM_ID&&safeWallet(env.FLOOF_PROGRAM_ID),'PROGRAM','Floof Devnet program is not configured.',503);
  const address=p.slice('/chain/windows/'.length);requireThat(safeWallet(address),'WINDOW','Invalid window address.');
  const projection=await chainWindow(env.DB,env.FLOOF_PROGRAM_ID,address);requireThat(projection.created,'NOT_INDEXED','This window has not been indexed.',404);return json(projection);
 }
 if(p==='/wallet/challenge'&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in before linking a wallet.',401);const b=await body(req);requireThat(safeWallet(b.wallet),'WALLET','Invalid Solana address.');const nonce=crypto.randomUUID(),expiresAt=now+300000;const message=`Floof wallet link\nOrigin: ${u.origin}\nWallet: ${b.wallet}\nAccount: ${id}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}\nThis signs a login message only. It does not authorize a transfer.`;
  await env.DB.prepare('DELETE FROM wallet_challenges WHERE expires_at < ?').bind(now).run();await env.DB.prepare('INSERT INTO wallet_challenges (id,owner_id,wallet,message,expires_at) VALUES (?,?,?,?,?)').bind(nonce,id,b.wallet,message,expiresAt).run();return json({id:nonce,message,expiresAt});
 }
 if(p==='/wallet/verify'&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in before linking a wallet.',401);const b=await body(req),challenge=await env.DB.prepare('SELECT * FROM wallet_challenges WHERE id=? AND owner_id=?').bind(b.id,id).first();requireThat(challenge&&!challenge.used&&challenge.expires_at>now,'CHALLENGE','Wallet challenge expired or used.',409);requireThat(await verifyWallet(challenge.wallet,challenge.message,b.signature),'SIGNATURE','Wallet signature could not be verified.',401);
  const used=await env.DB.prepare('UPDATE wallet_challenges SET used=1 WHERE id=? AND used=0').bind(b.id).run();requireThat(used.meta.changes===1,'CHALLENGE','Wallet challenge already used.',409);
  await repo.change(s=>{const a=s.accounts[id];requireThat(a,'CONNECT','Open your sandbox wallet first.',401);requireThat(!Object.values(s.accounts).some(other=>other.id!==id&&other.linkedWallet===challenge.wallet),'WALLET_LINKED','This wallet is already linked to another account.',409);a.linkedWallet=challenge.wallet;return true});return json({verified:true,wallet:challenge.wallet,network:'devnet',transferAuthorization:false});
 }
 if(p==='/wallet/balance'&&req.method==='GET'){requireThat(id,'AUTH_REQUIRED','Sign in first.',401);const {state}=await repo.read(),wallet=state.accounts[id]?.linkedWallet;requireThat(wallet,'WALLET','Link a wallet first.');const value=await rpc(env,'getBalance',[wallet,{commitment:'confirmed'}]);return json({wallet,lamports:value.value,sol:value.value/1e9,network:'devnet',sandboxBalanceSeparate:true})}
 if((p==='/chain/prepare'||p==='/chain/confirm')&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in before preparing a transaction.',401);const {state}=await repo.read(),wallet=state.accounts[id]?.linkedWallet;requireThat(wallet,'WALLET','Link and verify your wallet first.',401);const b=await body(req);
  return json(p==='/chain/prepare'?await prepareChain(env,env.DB,id,wallet,b,now):await confirmChain(env,env.DB,id,b,now));
 }
 if(p==='/indexer/webhook'&&req.method==='POST'){
  requireThat(env.INDEXER_SECRET&&req.headers.get('Authorization')===`Bearer ${env.INDEXER_SECRET}`,'FORBIDDEN','Invalid indexer authorization.',403);requireThat(env.FLOOF_PROGRAM_ID&&safeWallet(env.FLOOF_PROGRAM_ID),'PROGRAM','Configure the deployed Floof program first.',503);const b=await body(req);requireThat(Array.isArray(b.signatures)&&b.signatures.length<=10,'BATCH','Supply up to ten transaction signatures.');let inserted=0;
  for(const signature of b.signatures){requireThat(typeof signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature),'SIGNATURE','Invalid transaction signature.');const tx=await rpc(env,'getTransaction',[signature,{encoding:'json',commitment:'finalized',maxSupportedTransactionVersion:0}]);requireThat(tx&&tx.meta&&!tx.meta.err,'TRANSACTION','Transaction is missing, unfinalized or failed.',409);const r=await ingestFinalized(env.DB,signature,tx,env.FLOOF_PROGRAM_ID,now);inserted+=r.inserted}

  return json({inserted,projection:'verified_floof_events',sandboxLedgerUnaffected:true});
 }
 if(p==='/admin/rewards'&&req.method==='POST'){
  requireThat(env.ADMIN_SECRET&&req.headers.get('Authorization')===`Bearer ${env.ADMIN_SECRET}`,'FORBIDDEN','Admin authorization required.',403);const b=await body(req);const r=await repo.change(async s=>{const r=rewardEpoch(s,b.epoch,now),tree=await merkle(r.leaves);Object.assign(r,tree);audit(s);return r});return json(r);
 }
 if(p==='/admin/crank'&&req.method==='POST'){
  requireThat(env.ADMIN_SECRET&&req.headers.get('Authorization')===`Bearer ${env.ADMIN_SECRET}`,'FORBIDDEN','Admin authorization required.',403);const result=await repo.change(s=>({changed:tick(s,now),audit:audit(s)}));return json(result);
 }
 if(env.CHAIN_EXECUTION==='devnet'&&['/bootstrap','/state','/coins','/feed','/stats'].includes(p)&&req.method==='GET'){
  const {state}=await repo.read(),view=await chainSnapshot(env,env.DB,state.accounts[id]?.linkedWallet,now);return json(p==='/coins'?view.coins:p==='/feed'?view.feed:p==='/stats'?view.stats:view);
 }
 if(p.startsWith('/chain/prepared/')&&req.method==='GET'){requireThat(id,'AUTH_REQUIRED','Sign in first.',401);const row=await env.DB.prepare('SELECT * FROM chain_requests WHERE id=? AND owner_id=?').bind(p.slice('/chain/prepared/'.length),id).first();requireThat(row&&row.expires_at>now&&!row.signature,'EXPIRED','Prepared transaction expired or was already confirmed.',409);return json(JSON.parse(row.transaction_json));}
 if(env.CHAIN_EXECUTION==='devnet'&&p==='/quote'&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in first.',401);const {state}=await repo.read(),wallet=state.accounts[id]?.linkedWallet;requireThat(wallet,'WALLET','Link Phantom first.',401);const b=await body(req);requireThat(b.side==='buy'?b.unit==='sol':b.unit==='token','UNIT','Use SOL for buys and tokens for sells.');const amount=Number(b.amount),scale=b.side==='buy'?1e9:1e6;requireThat(Number.isFinite(amount)&&amount>0&&Number.isSafeInteger(Math.round(amount*scale)),'AMOUNT','Invalid trade amount.');const tx=await prepareChain(env,env.DB,id,wallet,{action:b.side,window:b.coin,amount:String(Math.round(amount*scale)),slippageBps:b.slippageBps},now),q=tx.quote,sol=Number(b.side==='buy'?q.amount:q.output)/1e9,tokens=Number(b.side==='buy'?q.output:q.amount)/1e6;return json({quoteId:tx.id,sol,tokens,fee:Number(q.feeLamports)/1e9,avg:sol/tokens,impact:0,minOut:Number(q.minimumOut)/(b.side==='buy'?1e6:1e9),expiresAt:tx.expiresAt,mode:'devnet'});
 }
 if(env.CHAIN_EXECUTION==='devnet'&&p.startsWith('/creators/')&&req.method==='GET'){const {state}=await repo.read(),view=await chainSnapshot(env,env.DB,state.accounts[id]?.linkedWallet,now),handle=decodeURIComponent(p.slice(10)),creator=view.creators.find(c=>c.handle===handle);requireThat(creator,'NOT_FOUND','Creator not found',404);return json({...creator,coins:view.coins.filter(c=>c.creator===handle),history:[]});}
 if(env.CHAIN_EXECUTION==='devnet'&&p.startsWith('/coins/')&&req.method==='GET'){
  const [, ,cid,section]=p.split('/');requireThat(safeWallet(cid),'COIN','Invalid on-chain window.');
  if(section==='trades'||section==='candles'){const rows=await env.DB.prepare('SELECT * FROM chain_trades WHERE program=? AND window=? ORDER BY block_time DESC LIMIT 1000').bind(env.FLOOF_PROGRAM_ID,cid).all();if(section==='trades')return json(rows.results.map(r=>({id:r.signature,coin:cid,wallet:r.wallet,kind:r.side,amount:Number(r.lamports)/1e9,tokens:Number(r.tokens)/1e6,t:r.block_time})));const period=({'5m':300000,'1h':3600000,'4h':14400000,'1d':86400000})[u.searchParams.get('tf')||'1h'];requireThat(period,'TIMEFRAME','Invalid chart timeframe.');const buckets=new Map();for(const r of rows.results.reverse()){const at=Math.floor(r.block_time/period)*period,price=Number(r.lamports)/Number(r.tokens)/1000,v=Number(r.lamports)/1e9,bar=buckets.get(at);if(bar){bar[2]=Math.max(bar[2],price);bar[3]=Math.min(bar[3],price);bar[4]=price;bar[5]+=v}else buckets.set(at,[at,price,price,price,price,v])}return json([...buckets.values()]);}
  const {state}=await repo.read(),view=await chainSnapshot(env,env.DB,state.accounts[id]?.linkedWallet,now),c=view.coins.find(c=>c.id===cid);requireThat(c,'NOT_FOUND','Window not found.',404);if(!section)return json(c);if(section==='settlement'){const claim=view.claims.find(c=>c.id===`window:${cid}`);return json({status:c.status,settled:!['open','upcoming'].includes(c.status),price:c.clearingPrice,fill:c.pledged?c.clearingPrice*c.windowTokens/c.pledged:0,myRefund:claim?.amount||0,myTokens:claim?.tokens||0,claimed:claim?.claimed||false,mode:'devnet'})}if(section==='holders'){const result=await rpc(env,'getTokenLargestAccounts',[c.ca,{commitment:'finalized'}]);return json(result.value.filter(a=>BigInt(a.amount)>0n).map(a=>({wallet:a.address,tokens:Number(a.amount)/1e6,pct:Number(a.amount)/1e15*100,tag:'token account'})));}
 }
 if(p==='/chain/launch-settings'&&req.method==='POST'){
  requireThat(id,'AUTH_REQUIRED','Sign in first.',401);requireThat(env.CHAIN_EXECUTION==='devnet','CHAIN_NOT_DEPLOYED','Devnet is not activated.',503);const b=await body(req),v=validateCoin(b,now);requireThat(env.BUCKET,'UPLOAD_UNAVAILABLE','Metadata storage is unavailable.',503);const metadata={name:v.name,symbol:v.ticker,description:v.tagline,image:v.image?new URL(v.image,u.origin).href:null,external_url:v.links.web||null};const digest=await hash(JSON.stringify(metadata));await env.BUCKET.put(`metadata/${digest}.json`,JSON.stringify(metadata),{httpMetadata:{contentType:'application/json'}});return json({nonce:String(BigInt('0x'+crypto.randomUUID().replaceAll('-','').slice(0,16))),name:v.name,symbol:v.ticker,uri:new URL(`/api/metadata/${digest}.json`,u.origin).href,start:Math.max(Math.floor(v.windowStart/1000),Math.floor(now/1000)+20),minTarget:String(v.minTargetL),maxRaise:String(v.maxRaiseL),windowTokens:String(v.windowUnits),creatorTokens:String(v.creatorUnits),bond:String(v.bondL),lockDays:v.lockDays,walletAge:v.policy.walletAge,history:v.policy.balHistory});
 }
 if(p.startsWith('/metadata/')&&req.method==='GET'){requireThat(/^\/metadata\/[a-f0-9]{64}\.json$/.test(p),'NOT_FOUND','Metadata not found.',404);const obj=await env.BUCKET?.get(p.slice(1));requireThat(obj,'NOT_FOUND','Metadata not found.',404);return new Response(obj.body,{headers:{'Content-Type':'application/json','X-Content-Type-Options':'nosniff'}})}
 if(req.method==='POST'){
  const b=await body(req);
  if(p==='/coins/prepare'){requireThat(id,'AUTH_REQUIRED','Sign in first.',401);const v=validateCoin(b,now),{state}=await repo.read();requireThat(!Object.values(state.coins).some(c=>c.ticker===v.ticker),'TICKER_EXISTS','This ticker is taken.',409);return json({mode:'sandbox',valid:true,tx:null,requiresWalletSignature:false,maximumRaise:v.maxRaiseL/1e9,notice:'Creating this record does not deploy an on-chain token.'})}
  const routes={'/session':'connect','/coins':'create','/pledges':'pledge','/pledge/attest':'attest','/claims':'claim','/quote':'quote','/trades':'trade','/sandbox/scenario':'scenario','/sandbox/advance':'fast-forward','/creators/follow':'follow','/creator-fees/claim':'creator-fees'};
  requireThat(Object.hasOwn(routes,p),'NOT_FOUND','API route not found.',404);return mutate(req,repo,id,routes[p],b,now);
 }
 requireThat(req.method==='GET','METHOD','Method not allowed.',405);
 const s=await readState(repo,now);
 if(p==='/bootstrap'||p==='/state')return json(snapshot(s,id,now));
 if(p==='/stats')return json(snapshot(s,id,now).stats);
 if(p==='/feed')return json(snapshot(s,id,now).feed);
 if(p==='/events'){const event={revision:s.sequence,state:snapshot(s,id,now)};return new Response(`retry: 4000\nid: ${s.sequence}\nevent: state\ndata: ${JSON.stringify(event)}\n\n`,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'}})}
 if(p==='/coins'){
  const grades=['N/A','D','C','B','A','A+'],status=u.searchParams.get('status'),q=(u.searchParams.get('q')||'').toLowerCase(),minGrade=u.searchParams.get('minGrade'),rep=Number(u.searchParams.get('minRep')||0),sort=u.searchParams.get('sort')||'newest';let rows=Object.values(s.coins).map(c=>publicCoin(s,c,now)).filter(c=>(!status||c.status===status)&&(!q||[c.ticker,c.name,c.ca].some(v=>v.toLowerCase().includes(q)))&&(!minGrade||grades.indexOf(c.truth.grade)>=grades.indexOf(minGrade))&&creator(s,c.creator).rep>=rep);rows.sort((a,b)=>sort==='ending'?a.windowEnd-b.windowEnd:sort==='pledged'?b.pledged-a.pledged:sort==='volume'?b.volume24h-a.volume24h:b.createdAt-a.createdAt||a.id.localeCompare(b.id));const offset=Number(u.searchParams.get('cursor')||0),limit=Math.min(100,Math.max(1,Number(u.searchParams.get('limit')||50)));requireThat(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit),'PAGINATION','Invalid pagination.');const next=offset+limit<rows.length?String(offset+limit):null;return json(rows.slice(offset,offset+limit),200,{'X-Next-Cursor':next||''});
 }
 if(p.startsWith('/coins/')){
  const [, ,cid,section]=p.split('/'),c=coin(s,cid);
  if(!section)return json(publicCoin(s,c,now));
  if(section==='metadata')return json({name:c.name,symbol:c.ticker,description:c.tagline,image:c.image?new URL(c.image,u.origin).href:null,external_url:c.links?.web||null,attributes:[{trait_type:'Environment',value:'Sandbox'},{trait_type:'Supply',value:1000000000},{trait_type:'Decimals',value:6}],properties:{category:'image'},extensions:{website:c.links?.web||null,twitter:c.links?.x?`https://x.com/${c.links.x.replace('@','')}`:null,telegram:c.links?.tg||null},permanent:false});
  if(section==='candles')return json(candles(s,c,u.searchParams.get('tf')||'1h'));
  if(section==='trades')return json(s.trades.filter(t=>t.coin===cid).slice(-200).reverse().map(({accountId,solL,tokensU,...t})=>t));
  if(section==='holders')return json(holders(s,c));
  if(section==='settlement'){
   const wallet=u.searchParams.get('wallet');requireThat(!wallet||wallet===s.accounts[id]?.wallet||wallet===s.accounts[id]?.linkedWallet,'FORBIDDEN','You can only request your own allocation.',403);const pledge=c.pledges[id];return json({status:c.status,settled:!!c.settledAt,price:c.clearingPrice,fill:c.pledged?c.raisedL/(c.pledged*1e9):0,oversub:c.pledged/(c.maxRaiseL/1e9),slot:null,myFilled:(pledge?.filled||0)/1e9,myRefund:(pledge?.refund||0)/1e9,myTokens:(pledge?.tokens||0)/1e6,claimed:pledge?.claimed||false,ticketNo:s.accounts[id]?.tickets.find(t=>t.coin===cid)?.no||null,mode:'sandbox'});
  }
 }
 if(p.startsWith('/wallets/')){const parts=p.split('/'),wallet=decodeURIComponent(parts[2]);requireThat(id&&(wallet===s.accounts[id]?.wallet||wallet===s.accounts[id]?.linkedWallet),'FORBIDDEN','You can only read your own wallet records.',403);const view=snapshot(s,id,now),key=parts[3];if(key==='positions')return json(Object.entries(view.positions).map(([coin,p])=>({coin,...p})));if(key==='pledges')return json(view.myPledges);if(key==='tickets')return json(view.tickets);if(key==='claims')return json(view.claims)}
 if(p.startsWith('/creators/')){const handle=decodeURIComponent(p.slice(10));requireThat(Object.values(s.coins).some(c=>c.creator===handle),'NOT_FOUND','Creator not found.',404);return json({...creator(s,handle),coins:Object.values(s.coins).filter(c=>c.creator===handle).map(c=>publicCoin(s,c,now))})}
 if(p.startsWith('/truth/')){const ca=decodeURIComponent(p.slice(7)),c=Object.values(s.coins).find(c=>c.ca===ca||c.ticker===ca.toUpperCase().replace('$',''));return c?json({...truthFor(s,c),name:`$${c.ticker}`,ca:c.ca,hue:c.hue,acc:c.accessory,onFloof:true}):json({status:'unavailable',grade:null,reason:'External chain history is not indexed. No risk score can be issued for this address.',ca,clusters:{nodes:[],edges:[]},checks:[]})}
 if(p==='/scouts')return json(scoutRows(s,now).map(({account,...r})=>r));
 if(p==='/export'){requireThat(id,'AUTH_REQUIRED','Sign in first.',401);return json({exportedAt:new Date(now).toISOString(),...snapshot(s,id,now),receipts:Object.values(s.receipts).filter(r=>Object.keys(s.receipts).some(k=>k.startsWith(id+':')&&s.receipts[k]===r)).map(({digest,...r})=>r)})}
 throw new AppError(404,'NOT_FOUND','API route not found.');
}
export default {async fetch(req,env,ctx){const url=new URL(req.url);if(!url.pathname.startsWith('/api/')){if(env.ASSETS)return env.ASSETS.fetch(req);return new Response('Asset service unavailable',{status:503})}const requestId=crypto.randomUUID();try{return await route(req,env,ctx)}catch(e){if(!(e instanceof AppError))console.error(JSON.stringify({requestId,error:e.message}));return error(e.status||500,e.code||'INTERNAL',e instanceof AppError?e.message:'Something went wrong. Please try again.',requestId)}}};
