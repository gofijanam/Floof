// Resumable, paced loader-v3 upload for public RPCs. Uses the user's existing
// buffer; never allocates another buffer or changes the upgrade authority.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {Connection,Keypair,PublicKey,Transaction,TransactionInstruction,SystemProgram,SYSVAR_RENT_PUBKEY,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import {PROGRAM,pda,meta,u64} from '../server/chain-client.mjs';import {assertDevnet,sendOnce} from './devnet-transactions.mjs';
const buffer=new PublicKey(process.argv[2]),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
let gate=Promise.resolve();const pacedFetch=async(...args)=>{for(let attempt=0;attempt<8;attempt++){const turn=gate;let release;gate=new Promise(r=>release=r);await turn;await new Promise(r=>setTimeout(r,450));release();const response=await fetch(...args);if(response.status!==429)return response;await new Promise(r=>setTimeout(r,15000));}throw Error('Public RPC rate limit persists; upload remains resumable.');};
const c=new Connection(process.env.SOLANA_DEVNET_RPC_URL||'https://api.devnet.solana.com',{commitment:'confirmed',fetch:pacedFetch,disableRetryOnRateLimit:true});await assertDevnet(c);
const load=n=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`.secrets/${n}.json`)))),payer=load('deployer'),program=load('program'),binary=fs.readFileSync('target/deploy/floof_escrow.so');assert(program.publicKey.equals(PROGRAM));
const info=await c.getAccountInfo(buffer);assert(info?.owner.equals(loader));assert.equal(info.data.readUInt32LE(0),1);assert.equal(info.data[4],1);assert(new PublicKey(info.data.subarray(5,37)).equals(payer.publicKey));assert.equal(info.data.length,binary.length+37);
let skipped=0,written=0;
const missing=[];for(let offset=0;offset<binary.length;offset+=900){const chunk=binary.subarray(offset,offset+900);if(info.data.subarray(offset+37,offset+37+chunk.length).equals(chunk)){skipped++;continue;}missing.push({offset,chunk});}
console.log({remaining:missing.length,skipped});
for(let batch=0;batch<missing.length;batch+=4){const latest=await c.getLatestBlockhash();await Promise.all(missing.slice(batch,batch+4).map(async({offset,chunk})=>{
 const data=Buffer.alloc(16+chunk.length);data.writeUInt32LE(1,0);data.writeUInt32LE(offset,4);data.writeBigUInt64LE(BigInt(chunk.length),8);chunk.copy(data,16);
 const tx=new Transaction({feePayer:payer.publicKey,...latest}).add(new TransactionInstruction({programId:loader,keys:[meta(buffer,true),meta(payer.publicKey,false,true)],data}));tx.sign(payer);await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});written++;
 }));if(written%20===0)console.log(JSON.stringify({written,skipped,totalChunks:Math.ceil(binary.length/900)}));}
// Fetch confirmed bytes until all writes landed; never deploy a partial binary.
for(let attempt=0;attempt<20;attempt++){const a=await c.getAccountInfo(buffer);if(a.data.subarray(37).equals(binary))break;if(attempt===19)throw Error('Some writes are pending. Rerun the upload to fill only missing chunks.');await new Promise(r=>setTimeout(r,3000));}
const payload=Buffer.concat([Buffer.from([2,0,0,0]),u64(binary.length)]),programdata=pda([PROGRAM],loader);
const ix=new TransactionInstruction({programId:loader,keys:[meta(payer.publicKey,true,true),meta(programdata,true),meta(PROGRAM,true),meta(buffer,true),meta(SYSVAR_RENT_PUBKEY),meta(SYSVAR_CLOCK_PUBKEY),meta(SystemProgram.programId),meta(payer.publicKey,false,true)],data:payload});
const signature=await sendOnce(c,payer,[SystemProgram.createAccount({fromPubkey:payer.publicKey,newAccountPubkey:PROGRAM,lamports:await c.getMinimumBalanceForRentExemption(36),space:36,programId:loader}),ix],'deploy-program',{signers:[program]});
const actual=await c.getAccountInfo(programdata,'finalized');assert(actual.data.subarray(45).equals(binary));fs.writeFileSync('.local/deployed-elf-verification.json',JSON.stringify({program:PROGRAM.toBase58(),signature,sha256:createHash('sha256').update(binary).digest('hex'),verifiedAt:new Date().toISOString()},null,2));console.log({deployed:true,signature});process.exit(0);
