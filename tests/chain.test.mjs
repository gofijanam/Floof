import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {decodeEvents,ingestFinalized,chainWindow} from '../server/chain-indexer.mjs';import {hash,base58encode,base58decode} from '../server/crypto.mjs';import {scoutTree,verifyScoutProof,scoutLeaf} from '../server/scout-merkle.mjs';import {sqliteDB} from '../scripts/sqlite-adapter.mjs';
const key=n=>base58encode(new Uint8Array(32).fill(n)),program=key(1),window=key(2),wallet=key(3),other=key(4);
const tx=logs=>({slot:123,blockTime:123,transaction:{message:{accountKeys:[program,other],instructions:[{programIdIndex:0}]}},meta:{err:null,logMessages:logs}});
async function event(kind,parts){return 'Program data: '+Buffer.concat([Buffer.from((await hash('event:'+kind)).slice(0,16),'hex'),...parts]).toString('base64')}
const uint=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b};
const pledged=async(total=10)=>event('Pledged',[base58decode(window),base58decode(wallet),uint(10),uint(total)]);
test('chain events require a successful real invocation; nested foreign logs cannot spoof Floof',async()=>{
 const e=await pledged(),logs=[`Program ${program} invoke [1]`,`Program ${other} invoke [2]`,e,`Program ${other} success`,e,`Program ${program} success`];
 const decoded=await decodeEvents(tx(logs),program);assert.equal(decoded.length,1);assert.equal(decoded[0].amount,'10');assert.equal(decoded[0].wallet,wallet);
 const failed=tx(logs);failed.meta.err={InstructionError:[0,'Custom']};await assert.rejects(()=>decodeEvents(failed,program));
 await assert.rejects(()=>decodeEvents(tx(logs.slice(0,-1)),program),e=>e.code==='LOGS');
 const fake=tx(logs);fake.transaction.message.instructions=[];await assert.rejects(()=>decodeEvents(fake,program),e=>e.code==='PROGRAM_MISMATCH');
});
test('finalized indexing is atomic, replay-safe and independent of arrival order',async()=>{
 const db=sqliteDB();for(const f of ['0000_floof','0002_chain_events'])db.raw.exec(await readFile(`drizzle/${f}.sql`,'utf8'));
 const create=await event('WindowCreated',[base58decode(window),base58decode(wallet),base58decode(other),uint(999)]);
 const one=tx([`Program ${program} invoke [1]`,create,await pledged(20),`Program ${program} success`]);
 assert.deepEqual(await ingestFinalized(db,'sig1',one,program,1000),{inserted:1,events:2});assert.deepEqual(await ingestFinalized(db,'sig1',one,program,1000),{inserted:0,events:0});
 await ingestFinalized(db,'sig0',tx([`Program ${program} invoke [1]`,await pledged(10),`Program ${program} success`]),program,1000);
 const projection=await chainWindow(db,program,window);assert.equal(projection.pledgedLamports,'20');assert.equal(projection.created.mint,other);assert.equal(projection.events,3);
 const broken=tx([`Program ${program} invoke [1]`,'Program data: '+Buffer.from((await hash('event:Pledged')).slice(0,16),'hex').toString('base64'),`Program ${program} success`]);await assert.rejects(()=>ingestFinalized(db,'bad',broken,program,1000));assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM indexed_transactions').get().n,2);
});
test('Scout manifests bind program, epoch, wallet and exact u64 amounts',async()=>{
 const leaves=[{wallet,amount:'9007199254740993'},{wallet:other,amount:'20'},{wallet:window,amount:'30'}],tree=await scoutTree(program,'42',leaves);assert.equal(tree.budgetLamports,'9007199254741043');
 for(const l of tree.leaves){assert.equal(await verifyScoutProof(tree.root,program,'42',l.wallet,l.amount,l.proof),true);assert.equal(await verifyScoutProof(tree.root,program,'43',l.wallet,l.amount,l.proof),false);assert.equal(await verifyScoutProof(tree.root,program,'42',l.wallet,String(BigInt(l.amount)+1n),l.proof),false)}
 await assert.rejects(()=>scoutTree(program,'42',[leaves[0],leaves[0]]));await assert.rejects(()=>scoutTree(program,'42',[{wallet,amount:'18446744073709551616'}]));
 assert.equal(await scoutLeaf(program,42,wallet,100),'393f9cf26565b6f7b1eb8a0c0b29d03c6e85663f5e745d6796a473beeabfffdf');
});
