// Token-quoted fair windows against the real Devnet LaunchLab + Metaplex binaries in LiteSVM.
// Quote mints are fabricated locally (SPL Token, 6 dp) and given a LaunchLab GlobalConfig cloned from the
// pinned SOL config with only mintB/minFundRaisingB changed. No CPI mocks. SOL path is covered by sbf-integration.mjs.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash,createPrivateKey,sign,randomBytes} from 'node:crypto';
import {LiteSvm,Account,FailedTransactionMetadata} from 'litesvm/dist/internal.js';
import {Connection,Keypair,PublicKey,Transaction,ComputeBudgetProgram,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,MINT_SIZE,createInitializeMint2Instruction,createAssociatedTokenAccountIdempotentInstruction,createMintToInstruction} from '@solana/spl-token';
import {createPlatformConfig,getPdaPlatformId,DEVNET_PROGRAM_ID,getCpmmPdaAmmConfigId} from '@raydium-io/raydium-sdk-v2';import BN from 'bn.js';
import {PROGRAM,LAUNCHLAB,METADATA,GLOBAL,WSOL,initializeIx,createIx,decodeWindow,pledgeIxs,pledgeMessage,creatorIx,ata,pda} from '../server/chain-client.mjs';
import {qata,setQuoteIx,createQuoteIxs,pledgeQuoteIxs,settleQuoteIx,claimQuoteIxs,creatorQuoteIx,launchlabConfigAddress,quoteMessage} from '../server/quote-client.mjs';
import {firstBuyQuote,SELL,maxFirstBuyFor,migrationTarget} from '../server/launchlab-curve.mjs';import {decodePool} from '../server/launchlab-trade.mjs';
const svm=new LiteSvm(),remote=new Connection('https://api.devnet.solana.com','finalized'),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),admin=Keypair.generate(),attestor=Keypair.generate(),oa=Keypair.generate(),ob=Keypair.generate();
fs.mkdirSync('.local/sbf-fixtures',{recursive:true});
async function fetchAccount(address){const name=address.toBase58(),path=`.local/sbf-fixtures/${name}.json`;let r;if(fs.existsSync(path))r=JSON.parse(fs.readFileSync(path));else{const a=await remote.getAccountInfo(address);if(!a)throw Error(`Missing Devnet account ${name}`);r={lamports:a.lamports,data:a.data.toString('base64'),owner:a.owner.toBase58(),executable:a.executable,rentEpoch:String(a.rentEpoch)};fs.writeFileSync(path,JSON.stringify(r))}return {...r,data:Buffer.from(r.data,'base64')}}
async function clone(address){const r=await fetchAccount(address);svm.setAccount(address.toBytes(),new Account(BigInt(r.lamports),r.data,new PublicKey(r.owner).toBytes(),r.executable,0n));}
for(const program of [LAUNCHLAB,METADATA]){const p=await fetchAccount(program);const pd=await fetchAccount(new PublicKey(p.data.subarray(4,36)));svm.addProgram(program.toBytes(),pd.data.subarray(45))}
const cp=getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,0).publicKey;for(const p of [GLOBAL,cp,WSOL])await clone(p);
svm.addProgramWithLoader(PROGRAM.toBytes(),fs.readFileSync('target/deploy/floof_escrow.so'),loader.toBytes());
const pdK=pda([PROGRAM],loader),pdAccount=svm.getAccount(pdK.toBytes());const pdData=Buffer.from(pdAccount.data());pdData[12]=1;admin.publicKey.toBuffer().copy(pdData,13);svm.setAccount(pdK.toBytes(),new Account(pdAccount.lamports(),pdData,loader.toBytes(),false,0n));
svm.airdrop(admin.publicKey.toBytes(),1000_000_000_000n);let clock=svm.getClock();clock.unixTimestamp=1794000000n;clock.slot=500000000n;svm.setClock(clock);
function send(ixs,signers=[admin],fail=false){svm.expireBlockhash();const tx=new Transaction({feePayer:signers[0].publicKey,recentBlockhash:svm.latestBlockhash()}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...ixs);tx.sign(...signers);const result=svm.sendLegacyTransaction(tx.serialize());if(fail){assert(result instanceof FailedTransactionMetadata,'Expected failure');if(process.env.SHOW_FAIL)console.log('expected-fail:',result.meta().logs().filter(l=>/Error|failed/.test(l)).slice(-1)[0]);return result}if(result instanceof FailedTransactionMetadata){console.error(result.meta().logs().slice(-25));throw Error(String(result.err()))}return result;}
const signWith=(kp,message)=>sign(null,message,createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(kp.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'}));const signAtt=m=>signWith(attestor,m);
const platform=getPdaPlatformId(LAUNCHLAB,admin.publicKey).publicKey;
send([createPlatformConfig(LAUNCHLAB,admin.publicKey,admin.publicKey,admin.publicKey,admin.publicKey,platform,cp,admin.publicKey,{platformScale:new BN(0),creatorScale:new BN(0),burnScale:new BN(1000000)},new BN(5000),new BN(2500),'Floof','https://floof.fun','',new BN(0))]);
send([await initializeIx(admin.publicKey,platform,attestor.publicKey,oa.publicKey,ob.publicKey)]);
const tokenAmount=a=>{const acc=svm.getAccount(new PublicKey(a).toBytes());return acc?Buffer.from(acc.data()).readBigUInt64LE(64):0n};
const get=async a=>decodeWindow(svm.getAccount(new PublicKey(a).toBytes()).data());
const advance=s=>{clock=svm.getClock();clock.unixTimestamp+=BigInt(s);clock.slot+=1500n;svm.setClock(clock)};
// ---- Fabricated quote: SPL mint (6 dp, USDC-like) + LaunchLab GlobalConfig for it ----
async function makeQuote(decimals,minFundRaising){const kp=Keypair.generate(),rent=svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE));
 send([SystemProgram.createAccount({fromPubkey:admin.publicKey,newAccountPubkey:kp.publicKey,lamports:Number(rent),space:MINT_SIZE,programId:TOKEN_PROGRAM_ID}),createInitializeMint2Instruction(kp.publicKey,decimals,admin.publicKey,null)],[admin,kp]);
 const g=await fetchAccount(GLOBAL),data=Buffer.from(g.data);kp.publicKey.toBuffer().copy(data,83);data.writeBigUInt64LE(BigInt(minFundRaising),75);const global=launchlabConfigAddress(kp.publicKey);
 svm.setAccount(global.toBytes(),new Account(BigInt(g.lamports),data,LAUNCHLAB.toBytes(),false,0n));return {mint:kp.publicKey,global,tokenProgram:TOKEN_PROGRAM_ID,decimals}}
const fund=(owner,q,amount)=>send([createAssociatedTokenAccountIdempotentInstruction(admin.publicKey,qata(owner,q.mint),owner,q.mint),createMintToInstruction(q.mint,qata(owner,q.mint),admin.publicKey,BigInt(amount))]);
const USDC=await makeQuote(6,1_000_000_000n);const T=migrationTarget({solUsd:150,quoteUsd:1,decimals:6});assert.equal(T,12_750_000_000n,'85 SOL at $150 = 12,750 USDC');
const qp={enabled:true,issuerControls:false,minPledge:1_000_000n,minFirstBuy:10_000_000n,targetMin:5_000_000_000n,targetMax:50_000_000_000n};
// set_quote: only the config authority; WSOL and a mismatched GlobalConfig are rejected.
const intruder=Keypair.generate();svm.airdrop(intruder.publicKey.toBytes(),10_000_000_000n);
send([await setQuoteIx(intruder.publicKey,platform,USDC,qp)],[intruder],true);
send([await setQuoteIx(admin.publicKey,platform,{...USDC,global:GLOBAL},qp)],[admin],true);
send([await setQuoteIx(admin.publicKey,platform,USDC,{...qp,targetMin:100_000_000n})],[admin],true); // below LaunchLab minFundRaisingB
send([await setQuoteIx(admin.publicKey,platform,USDC,qp)]);
const results={};let nonce=1;
async function scenario(label,{raise,creatorBuy=0n,pledgers=100,minTarget=raise/10n,lockDays=0,duration=600,target=T,quote=USDC,fill=1n}){
 const start=Number(svm.getClock().unixTimestamp),expiry=start+120;const v={nonce:nonce++,name:`Quote ${label}`,symbol:`Q${label}`.slice(0,10),uri:'https://example.com/m.json',walletAge:false,history:false,duration,minTarget,maxRaise:raise,creatorBuy,lockDays};
 if(creatorBuy>0n)fund(admin.publicKey,quote,creatorBuy);
 const c=await createQuoteIxs(admin.publicKey,platform,admin.publicKey,quote,v,{target,expiry,attestor:attestor.publicKey,signature:signAtt(quoteMessage(quote.mint,target,expiry))});send(c.instructions);
 let w=await get(c.addresses.window);assert.equal(w.fundraisingTarget,target);assert.equal(w.creatorBuy,creatorBuy);assert(w.global.equals(quote.global));assert.equal(tokenAmount(c.addresses.escrow),creatorBuy);
 const cap=raise/100n*fill,people=[];for(let i=0;i<pledgers;i++){const u=Keypair.generate();svm.airdrop(u.publicKey.toBytes(),100_000_000n);fund(u.publicKey,quote,cap);const cl=randomBytes(32);send(await pledgeQuoteIxs(u.publicKey,c.addresses.window,w,quote,cap,cl,expiry,attestor.publicKey,signAtt(pledgeMessage(u.publicKey,c.addresses.window,cl,expiry))),[u]);people.push(u)}
 w=await get(c.addresses.window);assert.equal(tokenAmount(c.addresses.escrow),w.pledged+creatorBuy);advance(duration+1);
 const tx=send([await settleQuoteIx(c.addresses.window,w,quote)]);w=await get(c.addresses.window);return {c,w,people,cu:tx.computeUnitsConsumed()};
}
// 1) 5,000 USDC presale (100 wallets at the 1% cap) + 200 USDC dev buy locked 30 days.
{const raise=5_000_000_000n,creatorBuy=200_000_000n;const r=await scenario('A',{raise,creatorBuy,lockDays:30});const {w}=r;assert.equal(w.state,1);
 const pool=await decodePool(svm.getAccount(w.pool.toBytes()).data());const q=firstBuyQuote({raise,creatorBuy,target:T,decimals:6});
 assert(pool.quoteMint.equals(USDC.mint));assert.equal(pool.target,T);assert.equal(pool.totalSell,SELL);assert.equal(pool.status,0);assert.equal(pool.realBase,q.tokens,'curve maths parity (6 dp quote)');assert.equal(pool.realQuote,q.spent-q.fee);
 assert.equal(w.creatorBuyTokens,q.creatorTokens);assert.equal(w.windowTokens,q.windowTokens);assert.equal(w.raised,raise);assert.equal(tokenAmount(r.c.addresses.escrow),0n,'whole budget spent from escrow');
 // Locked dev buy waits in the window vault.
 send(await creatorIx('dev-buy',admin.publicKey,r.c.addresses.window,w),[admin],true);
 let claimed=0n;for(const u of r.people.slice(0,10)){send(await claimQuoteIxs(u.publicKey,r.c.addresses.window,w,USDC),[u]);claimed=tokenAmount(ata(u.publicKey,w.mint))}
 send(await claimQuoteIxs(r.people[0].publicKey,r.c.addresses.window,w,USDC),[r.people[0]],true);
 const pledgerPrice=Number(raise/100n)/Number(claimed),creatorPrice=Number(creatorBuy)/Number(q.creatorTokens);assert(Math.abs(pledgerPrice/creatorPrice-1)<1e-6,'same average price');
 // Creator fees from the first buy arrive in USDC; only the fee delta leaves escrow.
 const before=tokenAmount(qata(admin.publicKey,USDC.mint));send(await creatorQuoteIx('creator-fees',admin.publicKey,r.c.addresses.window,w,USDC));const fees=tokenAmount(qata(admin.publicKey,USDC.mint))-before;assert(fees>0n);assert.equal(tokenAmount(r.c.addresses.escrow),0n);
 advance(30*86400);send(await creatorIx('dev-buy',admin.publicKey,r.c.addresses.window,w));assert.equal(tokenAmount(ata(admin.publicKey,w.mint)),q.creatorTokens);
 // SOL instructions refuse token windows.
 const u=r.people[50],cl=randomBytes(32),exp=Number(svm.getClock().unixTimestamp)+60;send(await pledgeIxs(u.publicKey,r.c.addresses.window,10_000_000,cl,exp,attestor.publicKey,signAtt(pledgeMessage(u.publicKey,r.c.addresses.window,cl,exp))),[u],true);
 send([await creatorIx('creator-fees',admin.publicKey,r.c.addresses.window,w)],[admin],true);
 results.usdc5000={target:String(T),tokens:String(q.tokens),pctOfSupply:q.pctOfSupply.toFixed(3),creatorFeesUsdcRaw:String(fees),settleCU:String(r.cu)};}
// 2) Failed window: below min target -> exact refunds in the quote, creator buy returned.
{const raise=2_000_000_000n,creatorBuy=50_000_000n;const r=await scenario('B',{raise,creatorBuy,pledgers:5,minTarget:1_000_000_000n});const {w}=r;assert.equal(w.state,2);
 for(const u of r.people){const b=tokenAmount(qata(u.publicKey,USDC.mint));send(await claimQuoteIxs(u.publicKey,r.c.addresses.window,w,USDC),[u]);assert.equal(tokenAmount(qata(u.publicKey,USDC.mint))-b,raise/100n)}
 send(await claimQuoteIxs(r.people[0].publicKey,r.c.addresses.window,w,USDC),[r.people[0]],true);
 const b=tokenAmount(qata(admin.publicKey,USDC.mint));send(await creatorQuoteIx('creator-buy-refund',admin.publicKey,r.c.addresses.window,w,USDC));assert.equal(tokenAmount(qata(admin.publicKey,USDC.mint))-b,creatorBuy);
 send(await creatorQuoteIx('creator-buy-refund',admin.publicKey,r.c.addresses.window,w,USDC),[admin],true);assert.equal(tokenAmount(r.c.addresses.escrow),0n);results.refund='exact';}
// 3) Full curve: raise = max first buy -> migration pending, unspent quote refunded pro-rata, escrow never short.
{const raise=maxFirstBuyFor(T);const r=await scenario('C',{raise});const {w}=r;assert.equal(w.state,1);const pool=await decodePool(svm.getAccount(w.pool.toBytes()).data());assert.equal(pool.status,1);assert.equal(pool.realBase,SELL);
 const left=tokenAmount(r.c.addresses.escrow);assert.equal(left,w.pledged-w.raised);let refunds=0n;for(const u of r.people){const b=tokenAmount(qata(u.publicKey,USDC.mint));send(await claimQuoteIxs(u.publicKey,r.c.addresses.window,w,USDC),[u]);refunds+=tokenAmount(qata(u.publicKey,USDC.mint))-b}
 assert(refunds<=left&&left-refunds<=100n,'pro-rata refunds fit escrow');results.fullCurve={raised:String(w.raised),refunded:String(refunds),dust:String(left-refunds)};}
// 4) Guards: bad attestation, target outside band, first buy above 86/85 headroom, pledge_quote into a SOL window.
{const start=Number(svm.getClock().unixTimestamp),expiry=start+120,v={nonce:900,name:'Guard',symbol:'GRD',uri:'https://example.com/m.json',walletAge:false,history:false,duration:600,minTarget:100_000_000n,maxRaise:1_000_000_000n,creatorBuy:0n,lockDays:0};
 const forged=await createQuoteIxs(admin.publicKey,platform,admin.publicKey,USDC,v,{target:T,expiry,attestor:oa.publicKey,signature:signWith(oa,quoteMessage(USDC.mint,T,expiry))});send(forged.instructions,[admin],true);
 const swapped=await createQuoteIxs(admin.publicKey,platform,admin.publicKey,USDC,v,{target:T*2n,expiry,attestor:attestor.publicKey,signature:signAtt(quoteMessage(USDC.mint,T,expiry))});send(swapped.instructions,[admin],true);
 const band=await createQuoteIxs(admin.publicKey,platform,admin.publicKey,USDC,v,{target:60_000_000_000n,expiry,attestor:attestor.publicKey,signature:signAtt(quoteMessage(USDC.mint,60_000_000_000n,expiry))});send(band.instructions,[admin],true);
 const big={...v,maxRaise:maxFirstBuyFor(T)+1n,minTarget:maxFirstBuyFor(T)};const over=await createQuoteIxs(admin.publicKey,platform,admin.publicKey,USDC,big,{target:T,expiry,attestor:attestor.publicKey,signature:signAtt(quoteMessage(USDC.mint,T,expiry))});send(over.instructions,[admin],true);
 const sol=await createIx(admin.publicKey,platform,admin.publicKey,{...v,nonce:901,minTarget:1e9,maxRaise:10e9,lockDays:0});send([sol.instruction]);const sw=await get(sol.addresses.window);const u=Keypair.generate();svm.airdrop(u.publicKey.toBytes(),100_000_000n);fund(u.publicKey,USDC,100_000_000n);const cl=randomBytes(32);
 send(await pledgeQuoteIxs(u.publicKey,sol.addresses.window,sw,USDC,100_000_000n,cl,expiry,attestor.publicKey,signAtt(pledgeMessage(u.publicKey,sol.addresses.window,cl,expiry))),[u],true);
 send(await pledgeIxs(u.publicKey,sol.addresses.window,50_000_000,cl,expiry,attestor.publicKey,signAtt(pledgeMessage(u.publicKey,sol.addresses.window,cl,expiry))),[u]);results.guards='ok';}
console.log(JSON.stringify({status:'passed',program:PROGRAM.toBase58(),quote:'SPL 6dp (fabricated)',...results},null,1));
