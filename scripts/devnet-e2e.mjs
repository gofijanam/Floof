// Actual public Devnet tests. All signers are disposable test keys; attestations here
// are contract test fixtures, not a claim that same-funded wallets pass production Sybil policy.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash,createPrivateKey,sign} from 'node:crypto';
import {Connection,Keypair,SystemProgram} from '@solana/web3.js';
import {PROGRAM,pda,createIx,decodeWindow,pledgeIxs,pledgeMessage,settleIx,claimIxs,creatorIx,ata} from '../server/chain-client.mjs';
import {decodePool,tradeQuote,tradeIxs} from '../server/launchlab-trade.mjs';
import {sendOnce,assertDevnet} from './devnet-transactions.mjs';
const c=new Connection(process.env.SOLANA_DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(20000)})});await assertDevnet(c);
const load=n=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`.secrets/${n}.json`)))),admin=load('deployer'),attestor=load('attestor');
fs.mkdirSync('.secrets/e2e',{recursive:true});const users=Array.from({length:10},(_,i)=>{const f=`.secrets/e2e/user-${i}.json`;if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify([...Keypair.generate().secretKey]),{mode:0o600});return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f))))});
const file='.local/public-devnet-e2e.json',r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{network:'devnet',program:PROGRAM.toBase58(),transactions:{},checks:{}};
const save=()=>fs.writeFileSync(file,JSON.stringify(r,null,2));
const send=async(name,ixs,payer=admin)=>{const sig=await sendOnce(c,payer,ixs,`e2e-${name}`);r.transactions[name]=sig;save();return sig};
const get=async address=>decodeWindow((await c.getAccountInfo(address,'finalized')).data);
const config=(await c.getAccountInfo(pda(['config']),'finalized')).data;const {PublicKey}=await import('@solana/web3.js');const platform=new PublicKey(config.subarray(40,72));
if(!r.params){const slot=await c.getSlot(),time=await c.getBlockTime(slot);r.params={nonce:String(Date.now()),name:'Floof Devnet QA',symbol:'FLQA',uri:'https://floof-fair-launch.gofivahootan.chatgpt.site/api/qa-metadata.json',walletAge:false,history:false,duration:600,minTarget:'1000000000',maxRaise:'10000000000',creatorBuy:'0',creatorTokens:'10000000000000',lockDays:30};save();}
const live=await createIx(admin.publicKey,platform,admin.publicKey,r.params),failed=await createIx(admin.publicKey,platform,admin.publicKey,{...r.params,nonce:String(BigInt(r.params.nonce)+1n),name:'Floof Refund QA',symbol:'FLRF'});
r.window=live.addresses.window.toBase58();r.refundWindow=failed.addresses.window.toBase58();r.mint=live.addresses.mint.toBase58();save();
if(process.argv.includes('--setup')){
 await send('fund-test-wallets',users.map(u=>SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:u.publicKey,lamports:150000000})));
 await send('create-live',[live.instruction]);await send('create-refund',[failed.instruction]);
 const priv=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(attestor.secretKey.subarray(0,32))]),format:'der',type:'pkcs8'});
 for(let i=0;i<users.length;i++){const u=users[i],cluster=createHash('sha256').update(`devnet-contract-fixture:${r.params.nonce}:${i}`).digest(),expiry=Math.floor(Date.now()/1000)+280;
  const ixs=await pledgeIxs(u.publicKey,live.addresses.window,100000000,cluster,expiry,attestor.publicKey,sign(null,pledgeMessage(u.publicKey,live.addresses.window,cluster,expiry),priv));await send(`pledge-${i}`,ixs,u);
  if(i===0){const other=await pledgeIxs(u.publicKey,failed.addresses.window,10000000,cluster,expiry,attestor.publicKey,sign(null,pledgeMessage(u.publicKey,failed.addresses.window,cluster,expiry),priv));await send('pledge-refund',other,u);}
 }
 r.checks.multiwalletPledge=(await get(live.addresses.window)).pledged===1000000000n;save();console.log({readyToSettleAfter:new Date(Number((await get(live.addresses.window)).end)*1000).toISOString(),window:r.window});
}
if(process.argv.includes('--settle')){
 for(const [name,a] of [['live',live.addresses],['refund',failed.addresses]]){let w=await get(a.window);if(w.state===0)await send(`settle-${name}`,[await settleIx(a.window,w)]);w=await get(a.window);assert.equal(w.state,name==='live'?1:2);}
 let w=await get(live.addresses.window),allocated=0n;for(let i=0;i<users.length;i++){await send(`claim-${i}`,await claimIxs(users[i].publicKey,live.addresses.window,w),users[i]);allocated+=(await c.getTokenAccountBalance(ata(users[i].publicKey,w.mint))).value.amount?BigInt((await c.getTokenAccountBalance(ata(users[i].publicKey,w.mint))).value.amount):0n;}
 assert(allocated<=w.windowTokens&&w.windowTokens-allocated<10n);const f=await get(failed.addresses.window);assert.equal(await c.getAccountInfo(f.mint),null);await send('claim-refund',await claimIxs(users[0].publicKey,failed.addresses.window,f),users[0]);
 await send('refund-reserve',[await creatorIx('reserve',admin.publicKey,failed.addresses.window,f)]);await send('live-reserve',[await creatorIx('reserve',admin.publicKey,live.addresses.window,w)]);
 let pool=await decodePool((await c.getAccountInfo(w.pool)).data),buy=tradeQuote(pool,'buy',10000000n);await send('buy',await tradeIxs(users[0].publicKey,w.pool,pool,buy),users[0]);pool=await decodePool((await c.getAccountInfo(w.pool)).data);const sell=tradeQuote(pool,'sell',BigInt(buy.output)/2n);await send('sell',await tradeIxs(users[0].publicKey,w.pool,pool,sell),users[0]);await send('creator-fees',[await creatorIx('creator-fees',admin.publicKey,live.addresses.window,w)]);
 r.checks={...r.checks,atomicSettlement:true,allocatedTokens:String(allocated),refundWithoutMint:true,curveBuyAndSell:true,creatorFeeForwarding:true};r.pool=w.pool.toBase58();save();
}
console.log(JSON.stringify(r.checks));process.exit(0);
