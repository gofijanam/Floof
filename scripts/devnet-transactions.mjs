import fs from 'node:fs';
import {Transaction,ComputeBudgetProgram} from '@solana/web3.js';
import {base58encode} from '../server/crypto.mjs';
import {DEVNET_GENESIS} from '../server/chain-rpc.mjs';
export async function assertDevnet(connection){if(await connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Refusing non-Devnet transaction');}
export async function finalized(connection,signature,timeout=120000){
 const until=Date.now()+timeout;
 while(Date.now()<until){const s=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];if(s?.err)throw Error(`Transaction failed: ${JSON.stringify(s.err)} (${signature})`);if(s?.confirmationStatus==='finalized')return s;await new Promise(r=>setTimeout(r,1500));}
 throw Error(`Finalization pending: ${signature}. Reconcile before retrying.`);
}
// A finalized height beyond expiry must be observed BEFORE checking history.
// Only recent transactions can be reconciled this way; old/pruned history requires manual review.
export async function reconcileExpired(connection,entry){
 const age=Date.now()-Date.parse(entry.submittedAt);
 if(!Number.isFinite(age)||age<0||age>3600000||!Number.isSafeInteger(entry.lastValidBlockHeight))return false;
 if(await connection.getBlockHeight('finalized')<=entry.lastValidBlockHeight)return false;
 const status=(await connection.getSignatureStatuses([entry.signature],{searchTransactionHistory:true})).value[0];
 if(status)return false;
 return await connection.getTransaction(entry.signature,{commitment:'finalized',maxSupportedTransactionVersion:0})===null;
}
// Persist signed bytes before submission. Never re-sign an unresolved transaction.
export async function sendOnce(connection,payer,ixs,name,{journal='.local/devnet-transactions.json',signers=[]}={}){
 await assertDevnet(connection);fs.mkdirSync('.local',{recursive:true});
 let state=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):{};
 let attempts=state[name]?.expiredAttempts||[];
 if(state[name]){
  const old=state[name];
  if(attempts.length<3&&await reconcileExpired(connection,old)){
   attempts=[...attempts,{...old,expiredAttempts:undefined,reconciledAt:new Date().toISOString()}];
   console.log(JSON.stringify({step:name,expiredSignature:old.signature,reconciled:true}));
  }else{await finalized(connection,old.signature);return old.signature;}
 }
 const latest=await connection.getLatestBlockhash('confirmed');
 const tx=new Transaction({feePayer:payer.publicKey,...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...ixs);tx.sign(payer,...signers);
 const sim=await connection.simulateTransaction(tx);if(sim.value.err)throw Error(`Simulation ${name}: ${JSON.stringify(sim.value.err)}\n${sim.value.logs?.slice(-12).join('\n')}`);
 const bytes=tx.serialize(),signature=base58encode(tx.signature);state[name]={signature,transaction:bytes.toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,submittedAt:new Date().toISOString(),expiredAttempts:attempts};
 fs.writeFileSync(journal+'.tmp',JSON.stringify(state,null,2));fs.renameSync(journal+'.tmp',journal);
 await connection.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:5});await finalized(connection,signature);console.log(JSON.stringify({step:name,signature,finalized:true}));return signature;
}
