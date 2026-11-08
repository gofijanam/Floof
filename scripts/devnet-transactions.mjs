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
// Persist the signed bytes before submission. Restart recovery never creates a second transfer.
export async function sendOnce(connection,payer,ixs,name,{journal='.local/devnet-transactions.json',signers=[]}={}){
 await assertDevnet(connection);fs.mkdirSync('.local',{recursive:true});
 let state=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):{};
 if(state[name]){await finalized(connection,state[name].signature);return state[name].signature;}
 const latest=await connection.getLatestBlockhash('confirmed');
 const tx=new Transaction({feePayer:payer.publicKey,...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...ixs);tx.sign(payer,...signers);
 const sim=await connection.simulateTransaction(tx);if(sim.value.err)throw Error(`Simulation ${name}: ${JSON.stringify(sim.value.err)}\n${sim.value.logs?.slice(-12).join('\n')}`);
 const bytes=tx.serialize(),signature=base58encode(tx.signature);state[name]={signature,transaction:bytes.toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,submittedAt:new Date().toISOString()};
 fs.writeFileSync(journal+'.tmp',JSON.stringify(state,null,2));fs.renameSync(journal+'.tmp',journal);
 await connection.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:5});await finalized(connection,signature);console.log(JSON.stringify({step:name,signature,finalized:true}));return signature;
}
