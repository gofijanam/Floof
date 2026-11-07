import {Buffer} from 'buffer';
import {base58decode,hash} from './crypto.mjs';
import {requireThat} from './errors.mjs';
import {pledgeMessage} from './chain-client.mjs';
const SYSTEM='11111111111111111111111111111111';
export async function walletEvidence(rpc,wallet,nowSeconds){
 requireThat(base58decode(wallet).length===32,'WALLET','Invalid wallet.');
 // Exhaustion is required to identify first funding; an arbitrary recent page is not birth evidence.
 const history=await rpc('getSignaturesForAddress',[wallet,{commitment:'finalized',limit:1000}]);
 requireThat(history.length<1000,'HISTORY_COVERAGE','Wallet history requires archival backfill before eligibility can be verified.',409);
 const successful=history.filter(r=>!r.err&&Number.isInteger(r.blockTime));
 requireThat(successful.length>0,'NO_HISTORY','No finalized wallet history is available.',409);
 const oldest=successful.at(-1),tx=await rpc('getTransaction',[oldest.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]);
 requireThat(tx&&!tx.meta?.err,'HISTORY_COVERAGE','Earliest transaction is unavailable; eligibility cannot be verified.',409);
 const instructions=[...(tx.transaction?.message?.instructions||[]),...(tx.meta?.innerInstructions||[]).flatMap(g=>g.instructions||[])];
 const transfers=instructions.filter(i=>i.programId===SYSTEM&&i.parsed?.type==='transfer'&&i.parsed.info.destination===wallet&&i.parsed.info.source!==wallet&&Number(i.parsed.info.lamports)>0);
 const funders=[...new Set(transfers.map(i=>i.parsed.info.source))];
 requireThat(funders.length===1,'FUNDING_COVERAGE','First funding source is ambiguous or unavailable; review is required.',409);
 const age=Math.max(0,nowSeconds-oldest.blockTime),days=new Set(successful.map(t=>Math.floor(t.blockTime/86400))).size;
 return {wallet,firstSeen:oldest.blockTime,firstSignature:oldest.signature,funder:funders[0],finalizedTransactions:successful.length,activeDays:days,ageSeconds:age,coverage:'complete-signature-history',observedAt:nowSeconds};
}
export function checkEligibility(e,w){requireThat(!w.walletAge||e.ageSeconds>=7*86400,'WALLET_AGE','This launch requires a wallet with at least seven days of finalized history.',403);requireThat(!w.history||(e.finalizedTransactions>=5&&e.activeDays>=2),'WALLET_HISTORY','This launch requires at least five finalized transactions across two days.',403)}
export async function clusterFor(db,program,window,account,evidence,now){
 // Common funding and linked account ownership both share caps. Once two roots have
 // issued attestations they are never silently merged into a fresh, empty cap.
 const signals=[await hash(`owner:${account}`),await hash(`funder:${evidence.funder}`)],rows=[];
 for(const signal of signals){const r=await db.prepare('SELECT cluster FROM sybil_signals WHERE program=? AND window=? AND signal=?').bind(program,window,signal).first();if(r)rows.push(r.cluster)}
 const distinct=[...new Set(rows)];requireThat(distinct.length<=1,'CLUSTER_CONFLICT','Funding links overlap previously assigned groups. Further pledges require review.',409);
 const cluster=distinct[0]||await hash(`floof-cluster-v1:${program}:${window}:${signals[1]}`);
 await db.batch(signals.map(signal=>db.prepare('INSERT OR IGNORE INTO sybil_signals(program,window,signal,cluster,created_at) VALUES(?,?,?,?,?)').bind(program,window,signal,cluster,now)));
 // Read back every assignment: racing writers cannot obtain a signature for a losing cluster.
 for(const signal of signals){const row=await db.prepare('SELECT cluster FROM sybil_signals WHERE program=? AND window=? AND signal=?').bind(program,window,signal).first();requireThat(row?.cluster===cluster,'CLUSTER_CONFLICT','Funding group changed during verification. Please retry.',409)}
 await db.prepare('INSERT INTO wallet_evidence(program,wallet,evidence,observed_at) VALUES(?,?,?,?) ON CONFLICT(program,wallet) DO UPDATE SET evidence=excluded.evidence,observed_at=excluded.observed_at').bind(program,evidence.wallet,JSON.stringify(evidence),now).run();
 return cluster;
}
export async function signPledge(env,program,wallet,window,cluster,expiry){
 requireThat(env.ATTESTOR_PKCS8_BASE64,'ATTESTOR_UNAVAILABLE','The Devnet attestor is not configured.',503);
 const secret=await crypto.subtle.importKey('pkcs8',Buffer.from(env.ATTESTOR_PKCS8_BASE64,'base64'),{name:'Ed25519'},false,['sign']);
 const message=pledgeMessage(wallet,window,Buffer.from(cluster,'hex'),expiry,program),signature=await crypto.subtle.sign('Ed25519',secret,message);
 return {cluster,expiry,signature:Buffer.from(signature).toString('base64')};
}
