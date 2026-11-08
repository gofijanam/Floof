import test from 'node:test';import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';import {decodeMarket,positionLedger} from '../server/market-history.mjs';import {earnedPoints} from '../server/scout-points.mjs';import {LAUNCHLAB,WSOL,discriminator} from '../server/chain-client.mjs';import {base58encode} from '../server/crypto.mjs';
test('external LaunchLab swaps are measured from finalized vault and wallet deltas',async()=>{
 const keys=Array.from({length:19},()=>Keypair.generate().publicKey.toBase58()),w={mint:Keypair.generate().publicKey,pool:Keypair.generate().publicKey};keys[4]=w.pool.toBase58();keys[9]=w.mint.toBase58();keys[18]=LAUNCHLAB.toBase58();
 const b=(accountIndex,owner,mint,n)=>({accountIndex,owner,mint,uiTokenAmount:{amount:String(n)}});
 const tx={slot:4,blockTime:100,transaction:{message:{accountKeys:keys,instructions:[{programIdIndex:18,accounts:Array.from({length:18},(_,i)=>i),data:base58encode(await discriminator('global:buy_exact_in'))}]}},meta:{err:null,preTokenBalances:[b(5,keys[0],keys[9],10),b(8,keys[1],WSOL.toBase58(),1000),b(16,keys[1],WSOL.toBase58(),0)],postTokenBalances:[b(5,keys[0],keys[9],20),b(8,keys[1],WSOL.toBase58(),1099),b(16,keys[1],WSOL.toBase58(),1)]}};
 const result=await decodeMarket(tx,w);assert.equal(result.trade.lamports,'100');assert.equal(result.trade.tokens,'10');assert.equal(result.trade.side,'buy');
 const wrong={...w,pool:Keypair.generate().publicKey};assert.equal((await decodeMarket(tx,wrong)).trade,null);
 tx.transaction.message.instructions.push(tx.transaction.message.instructions[0]);assert.equal((await decodeMarket(tx,w)).classification,'unclassified-swap');tx.meta.err={x:1};await assert.rejects(()=>decodeMarket(tx,w));
});
test('cost basis tracks partial sells and refuses unknown transferred inventory',()=>{
 const rows=[{slot:1,signature:'a',side:'buy',tokens:'100',lamports:'50'},{slot:2,signature:'b',side:'sell',tokens:'40',lamports:'30'}];assert.deepEqual(positionLedger(rows),{tokens:'60',costLamports:'30',realizedLamports:'10',known:true});assert.equal(positionLedger([{slot:1,signature:'x',side:'sell',tokens:'1',lamports:'2'}]).known,false);
});
test('Scout hold points stop after transfer, count unclaimed allocation and bound the epoch',()=>{
 const day=86400000,base={pledged:1000000000n,allocation:100n,early:true,settledAt:0,claimedAt:0,movements:[{time:0,delta:'100'}],start:0,end:day,graduatedAt:null};assert.equal(earnedPoints(base),200n);
 assert.equal(earnedPoints({...base,movements:[{time:0,delta:'100'},{time:day/2,delta:'-100'}]}),100n);
 assert.equal(earnedPoints({...base,claimedAt:day*2,movements:[]}),200n);
 assert.equal(earnedPoints({...base,early:false}),100n);
 assert.equal(earnedPoints({...base,graduatedAt:day/2}),300n);
 assert.equal(earnedPoints({...base,weightedPledge:1500000000n}),150n,'only the early part of a pledge receives a multiplier');
 assert.equal(earnedPoints({...base,graduatedAt:day/4,movements:[{time:0,delta:'100'},{time:day/2,delta:'-100'}]}),200n,'graduation uses holdings at graduation, not week end');
});
