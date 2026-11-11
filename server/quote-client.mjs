// Instruction builders for token-quoted fair windows (SPL Token / Token-2022 quote mints).
// Account orders mirror programs/floof-escrow/src/quote.rs. SOL windows keep using chain-client.mjs.
import {Buffer} from 'buffer';
import {PublicKey,SystemProgram,SYSVAR_RENT_PUBKEY,SYSVAR_INSTRUCTIONS_PUBKEY,Ed25519Program} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
import {PROGRAM,LAUNCHLAB,METADATA,GLOBAL,key,u64,i64,str,pda,ata,meta,instruction,addresses,pledgeMessage} from './chain-client.mjs';
export const qata=(owner,mint,tokenProgram=TOKEN_PROGRAM_ID)=>getAssociatedTokenAddressSync(key(mint),key(owner),true,key(tokenProgram));
export const quoteConfigAddress=(mint,program=PROGRAM)=>pda(['quote',key(mint)],program);
export const isSolWindow=w=>key(w.global).equals(GLOBAL);
/** Raydium LaunchLab GlobalConfig PDA for a quote mint (curve type 0 = constant product). */
export const launchlabConfigAddress=(mint,curveType=0,index=0)=>{const i=Buffer.alloc(2);i.writeUInt16LE(index);return PublicKey.findProgramAddressSync([Buffer.from('global_config'),key(mint).toBuffer(),Buffer.from([curveType]),i],LAUNCHLAB)[0]};
export function quoteMessage(quoteMint,target,expiry,program=PROGRAM){return Buffer.concat([Buffer.from('floof-quote-v1'),key(program).toBuffer(),key(quoteMint).toBuffer(),u64(target),i64(expiry)])}
const tp=q=>key(q.tokenProgram??TOKEN_PROGRAM_ID);
export async function setQuoteIx(authority,platform,q,p,program=PROGRAM){
 const data=Buffer.concat([Buffer.from([+!!p.enabled,+!!p.issuerControls]),u64(p.minPledge),u64(p.minFirstBuy),u64(p.targetMin),u64(p.targetMax)]);
 return instruction('set_quote',[meta(pda(['config'],program)),meta(authority,true,true),meta(quoteConfigAddress(q.mint,program),true),meta(q.mint),meta(q.global),meta(platform),meta(tp(q)),meta(SystemProgram.programId)],data,program);
}
/** create_coin_quote preceded by the attestor-signed migration target (USD value of 85 SOL in this quote). */
export async function createQuoteIxs(creator,platform,treasury,q,v,{target,expiry,attestor,signature},program=PROGRAM){
 const a=addresses(creator,v.nonce,program),days=Buffer.alloc(2);days.writeUInt16LE(v.lockDays??0);
 const data=Buffer.concat([u64(v.nonce),str(v.name),str(v.symbol),str(v.uri),Buffer.from([+v.walletAge,+v.history]),i64(v.duration),...['minTarget','maxRaise','creatorBuy'].map(k=>u64(v[k]??0)),days,u64(target),i64(expiry)]);
 const escrow=qata(a.launcher,q.mint,tp(q));
 return {addresses:{...a,escrow},instructions:[Ed25519Program.createInstructionWithPublicKey({publicKey:key(attestor).toBytes(),signature:Buffer.from(signature),message:quoteMessage(q.mint,target,expiry,program)}),
  await instruction('create_coin_quote',[meta(pda(['config'],program)),meta(quoteConfigAddress(q.mint,program)),meta(creator,true,true),meta(a.mint),meta(a.window,true),meta(a.launcher,true),meta(q.global),meta(platform),meta(treasury,true),meta(q.mint),meta(escrow,true),meta(qata(creator,q.mint,tp(q)),true),meta(SYSVAR_INSTRUCTIONS_PUBKEY),meta(tp(q)),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],data,program)]};
}
export async function pledgeQuoteIxs(wallet,window,w,q,amount,cluster,expiry,attestor,signature,program=PROGRAM){
 cluster=Buffer.from(cluster);if(cluster.length!==32)throw Error('Invalid cluster');const a=addresses(w.creator,w.nonce,program);
 return [Ed25519Program.createInstructionWithPublicKey({publicKey:key(attestor).toBytes(),signature:Buffer.from(signature),message:pledgeMessage(wallet,window,cluster,expiry,program)}),
  await instruction('pledge_quote',[meta(pda(['config'],program)),meta(window,true),meta(quoteConfigAddress(q.mint,program)),meta(wallet,true,true),meta(pda(['pledge',key(window),key(wallet)],program),true),meta(pda(['cluster',key(window),cluster],program),true),meta(a.launcher),meta(q.mint),meta(qata(a.launcher,q.mint,tp(q)),true),meta(qata(wallet,q.mint,tp(q)),true),meta(SYSVAR_INSTRUCTIONS_PUBKEY),meta(tp(q)),meta(SystemProgram.programId)],Buffer.concat([u64(amount),cluster,i64(expiry)]),program)];
}
export async function settleQuoteIx(window,w,q,program=PROGRAM){
 if(w.pledged<w.minTarget)return instruction('settle',[meta(window,true)],undefined,program);
 const a=addresses(w.creator,w.nonce,program),pool=pda(['pool',w.mint,key(q.mint)],LAUNCHLAB),vault=m=>pda(['pool_vault',pool,key(m)],LAUNCHLAB);
 return instruction('settle_launch_quote',[meta(window,true),meta(quoteConfigAddress(q.mint,program)),meta(w.mint,true),meta(a.launcher,true),meta(LAUNCHLAB),meta(w.global),meta(w.platform),meta(pda(['vault_auth_seed'],LAUNCHLAB)),meta(pool,true),meta(q.mint),meta(vault(w.mint),true),meta(vault(q.mint),true),meta(pda(['metadata',METADATA,w.mint],METADATA),true),meta(ata(a.launcher,w.mint),true),meta(qata(a.launcher,q.mint,tp(q)),true),meta(w.creator,true),meta(ata(w.creator,w.mint),true),meta(qata(w.creator,q.mint,tp(q)),true),meta(ata(window,w.mint),true),meta(pda([w.platform,key(q.mint)],LAUNCHLAB),true),meta(pda([a.launcher,key(q.mint)],LAUNCHLAB),true),meta(pda(['__event_authority'],LAUNCHLAB)),meta(METADATA),meta(TOKEN_PROGRAM_ID),meta(tp(q)),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId),meta(SYSVAR_RENT_PUBKEY)],undefined,program);
}
export async function claimQuoteIxs(wallet,window,w,q,program=PROGRAM){
 const a=addresses(w.creator,w.nonce,program),pledge=pda(['pledge',key(window),key(wallet)],program),walletQuote=qata(wallet,q.mint,tp(q)),escrow=qata(a.launcher,q.mint,tp(q));
 const ensureQuote=createAssociatedTokenAccountIdempotentInstruction(key(wallet),walletQuote,key(wallet),key(q.mint),tp(q));
 if(w.state===2)return [ensureQuote,await instruction('claim_refund_quote',[meta(window,true),meta(wallet,true,true),meta(pledge,true),meta(quoteConfigAddress(q.mint,program)),meta(a.launcher),meta(q.mint),meta(escrow,true),meta(walletQuote,true),meta(tp(q))],undefined,program)];
 if(w.state!==1)throw Error('Window has not settled');
 return [ensureQuote,createAssociatedTokenAccountIdempotentInstruction(key(wallet),ata(wallet,w.mint),key(wallet),w.mint),await instruction('claim_quote',[meta(window,true),meta(wallet,true,true),meta(pledge,true),meta(ata(window,w.mint),true),meta(ata(wallet,w.mint),true),meta(quoteConfigAddress(q.mint,program)),meta(a.launcher),meta(q.mint),meta(escrow,true),meta(walletQuote,true),meta(TOKEN_PROGRAM_ID),meta(tp(q))],undefined,program)];
}
export async function creatorQuoteIx(action,wallet,window,w,q,program=PROGRAM){
 if(!w.creator.equals(key(wallet)))throw Error('Only the immutable creator can claim');const a=addresses(w.creator,w.nonce,program),escrow=qata(a.launcher,q.mint,tp(q)),creatorQuote=qata(wallet,q.mint,tp(q));
 if(action==='creator-buy-refund')return [createAssociatedTokenAccountIdempotentInstruction(key(wallet),creatorQuote,key(wallet),key(q.mint),tp(q)),await instruction('refund_creator_buy_quote',[meta(window,true),meta(wallet,true,true),meta(quoteConfigAddress(q.mint,program)),meta(a.launcher),meta(q.mint),meta(escrow,true),meta(creatorQuote,true),meta(tp(q))],undefined,program)];
 if(action==='creator-fees')return [await instruction('claim_creator_fees_quote',[meta(window),meta(wallet,true,true),meta(quoteConfigAddress(q.mint,program)),meta(a.launcher,true),meta(LAUNCHLAB),meta(pda(['creator_fee_vault_auth_seed'],LAUNCHLAB)),meta(pda([a.launcher,key(q.mint)],LAUNCHLAB),true),meta(q.mint),meta(escrow,true),meta(creatorQuote,true),meta(tp(q)),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)],undefined,program)];
 throw Error('Unsupported creator action');
}
export {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID};
