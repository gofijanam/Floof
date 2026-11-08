import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileExpired} from '../scripts/devnet-transactions.mjs';

const entry=()=>({signature:'test-signature',lastValidBlockHeight:100,submittedAt:new Date().toISOString()});
function rpc(height,status=null,tx=null){const calls=[];return {calls,
 async getBlockHeight(commitment){calls.push(['height',commitment]);return height;},
 async getSignatureStatuses(signatures,options){calls.push(['status',signatures,options]);return {value:[status]};},
 async getTransaction(signature,options){calls.push(['transaction',signature,options]);return tx;}};}
test('expired transaction requires finalized expiry and absent status and history, in order',async()=>{
 const c=rpc(101);assert.equal(await reconcileExpired(c,entry()),true);
 assert.deepEqual(c.calls.map(x=>x[0]),['height','status','transaction']);
 assert.equal(c.calls[0][1],'finalized');assert.equal(c.calls[1][2].searchTransactionHistory,true);
});
test('valid or landed transactions are never replaced',async()=>{
 for(const c of [rpc(100),rpc(101,{confirmationStatus:'confirmed'}),rpc(101,{err:{InstructionError:[0,'failure']}}),rpc(101,null,{slot:42})])assert.equal(await reconcileExpired(c,entry()),false);
});
test('old, malformed or unavailable history fails closed',async()=>{
 const c=rpc(101);
 assert.equal(await reconcileExpired(c,{...entry(),submittedAt:new Date(Date.now()-3600001).toISOString()}),false);
 assert.equal(await reconcileExpired(c,{...entry(),lastValidBlockHeight:undefined}),false);
 assert.equal(c.calls.length,0);
 const unavailable=rpc(101);unavailable.getTransaction=async()=>{throw Error('RPC unavailable')};
 await assert.rejects(reconcileExpired(unavailable,entry()),/RPC unavailable/);
});
