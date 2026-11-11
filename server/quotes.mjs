// GET /api/quotes and the migration-target attestation for token-quoted launches.
// Response shape = src/types/quotes.ts (QuotesResponse). A quote is launchable on this deployment only when
// Floof's on-chain allowlist (QuoteConfig PDA) registers it against a LaunchLab GlobalConfig: those entries
// carry `configId`. Catalogue entries (mainnet LaunchLab metadata snapshot) are returned with configId null.
import {Buffer} from 'buffer';
import {PROGRAM,GLOBAL,WSOL,key,discriminator} from './chain-client.mjs';
import {quoteMessage} from './quote-client.mjs';
import {migrationTarget,maxFirstBuyFor,GRADUATION_QUOTE} from './launchlab-curve.mjs';
import {requireThat} from './errors.mjs';
import {base58encode} from './crypto.mjs';
import catalogue from '../src/mocks/quotes.snapshot.json' with {type:'json'};
const T22='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/** QuoteConfig account (programs/floof-escrow/src/quote.rs). */
export async function decodeQuoteConfig(data){const b=Buffer.from(data);requireThat(b.length===140&&b.subarray(0,8).equals(await discriminator('account:QuoteConfig')),'QUOTE','Invalid QuoteConfig.');const pk=o=>key(b.subarray(o,o+32)).toBase58(),n=o=>b.readBigUInt64LE(o);
 return {mint:pk(8),tokenProgram:pk(40),global:pk(72),decimals:b[104],enabled:!!b[105],issuerControls:!!b[106],minPledge:n(107),minFirstBuy:n(115),targetMin:n(123),targetMax:n(131)}}
export async function quoteRegistry(rpc,program=PROGRAM.toBase58()){
 const rows=await rpc('getProgramAccounts',[program,{encoding:'base64',commitment:'confirmed',filters:[{memcmp:{offset:0,bytes:base58encode(await discriminator('account:QuoteConfig'))}}]}]);
 const out=[];for(const r of rows||[]){try{out.push(await decodeQuoteConfig(Buffer.from(r.account.data[0],'base64')))}catch{}}return out;
}
const minFundRaising=async(rpc,global)=>{const r=await rpc('getAccountInfo',[global,{encoding:'base64',commitment:'confirmed'}]);const b=r?.value?Buffer.from(r.value.data[0],'base64'):null;return b&&b.length>=83?b.readBigUInt64LE(75).toString():null};
let priceCache={at:0,map:new Map()};
/** USD prices from Jupiter's public price API. Devnet test mints price through QUOTE_PRICE_REFS ({"devnetMint":"mainnetMint"}). */
export async function usdPrices(env,mints,fetcher=fetch){
 const refs=(()=>{try{return JSON.parse(env.QUOTE_PRICE_REFS||'{}')}catch{return {}}})(),now=Date.now();if(now-priceCache.at>60000)priceCache={at:now,map:new Map()};
 const want=[...new Set(mints.map(m=>refs[m]||m))].filter(m=>!priceCache.map.has(m));
 for(let i=0;i<want.length;i+=50){const ids=want.slice(i,i+50);try{const r=await fetcher('https://lite-api.jup.ag/price/v3?ids='+ids.join(','),{signal:AbortSignal.timeout(8000)});const j=r.ok?await r.json():{};for(const m of ids){const p=Number(j?.[m]?.usdPrice);priceCache.map.set(m,Number.isFinite(p)&&p>0?p:null)}}catch{for(const m of ids)priceCache.map.set(m,null)}}
 return {observedAt:new Date(priceCache.at).toISOString(),price:m=>priceCache.map.get(refs[m]||m)??null};
}
const meta=new Map(catalogue.quotes.map(q=>[q.mint,q]));
// Well-known Devnet test mints borrow the catalogue entry of the mainnet token they stand in for (labels only; prices still go through QUOTE_PRICE_REFS).
const DEVNET_ALIAS={USDCoctVLVnvTXBEuP9s8hntucdJokbo17RwHuNXemT:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'};
const metaFor=(mint,refs={})=>{const m=meta.get(mint);if(m)return m;const r=meta.get(refs[mint]||DEVNET_ALIAS[mint]);return r?{...r,name:`${r.name} (Devnet)`}:undefined};
export const quoteSymbol=mint=>metaFor(mint)?.symbol??`${mint.slice(0,4)}…`;
/** QuotesResponse for this deployment. `rpc` is null in sandbox mode (SOL only). */
export async function listQuotes(env,rpc,{fetcher=fetch,program=PROGRAM.toBase58()}={}){
 const registry=rpc?(await quoteRegistry(rpc,program)).filter(q=>q.enabled):[];
 const prices=await usdPrices(env,[WSOL.toBase58(),...registry.map(q=>q.mint),...catalogue.quotes.map(q=>q.mint)],fetcher);
 const sol=meta.get(WSOL.toBase58());
 const quotes=[{mint:WSOL.toBase58(),symbol:'SOL',name:'Solana',logo:sol?.logo??null,decimals:9,group:'solana',token2022:false,configId:GLOBAL.toBase58(),minMigration:(rpc?await minFundRaising(rpc,GLOBAL.toBase58()):null)??'1',priceUsd:prices.price(WSOL.toBase58())}];
 const refs=(()=>{try{return JSON.parse(env?.QUOTE_PRICE_REFS||'{}')}catch{return {}}})();
 for(const q of registry){const m=metaFor(q.mint,refs);quotes.push({mint:q.mint,symbol:m?.symbol??`${q.mint.slice(0,4)}…`,name:m?.name??'Devnet test quote',logo:m?.logo??null,decimals:q.decimals,group:m?.group??'custom',token2022:q.tokenProgram===T22,configId:q.global,minMigration:await minFundRaising(rpc,q.global),priceUsd:prices.price(q.mint)})}
 const listed=new Set(quotes.map(q=>q.mint));
 for(const q of catalogue.quotes)if(!listed.has(q.mint))quotes.push({...q,configId:null,minMigration:null,priceUsd:prices.price(q.mint)});
 return {observedAt:prices.observedAt,source:`Floof ${rpc?'Devnet':'sandbox'} quote allowlist (${registry.length+1} launchable) + LaunchLab mainnet catalogue metadata (not launchable here) + Jupiter price/v3`,quotes};
}
/** Price → attested migration target (USD value of 85 SOL in the quote), signed by the Devnet attestor. */
export async function attestTarget(env,rpc,mint,{fetcher=fetch,program=PROGRAM.toBase58(),now=Date.now()}={}){
 const q=(await quoteRegistry(rpc,program)).find(q=>q.mint===mint&&q.enabled);requireThat(q,'QUOTE','This quote is not enabled for Floof launches.',404);
 const prices=await usdPrices(env,[WSOL.toBase58(),mint],fetcher),solUsd=prices.price(WSOL.toBase58()),quoteUsd=prices.price(mint);requireThat(solUsd&&quoteUsd,'PRICE','No live USD price for this quote; try again shortly.',503);
 // Same rule as the picker (src/lib/quotes.ts): the USD value of 85 SOL, or the config's minMigration when larger.
 const usdTarget=migrationTarget({solUsd,quoteUsd,decimals:q.decimals}),floor=BigInt(await minFundRaising(rpc,q.global)??'0'),target=usdTarget>floor?usdTarget:floor;requireThat(target>=q.targetMin&&target<=q.targetMax,'PRICE','Live price is outside this quote\u2019s allowed migration band.',409);
 requireThat(env.ATTESTOR_PKCS8_BASE64,'ATTESTOR_UNAVAILABLE','The Devnet attestor is not configured.',503);
 const expiry=Math.floor(now/1000)+120,secret=await crypto.subtle.importKey('pkcs8',Buffer.from(env.ATTESTOR_PKCS8_BASE64,'base64'),{name:'Ed25519'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',secret,quoteMessage(mint,target,expiry,program))).toString('base64');
 return {mint,quote:q,target:target.toString(),maxFirstBuy:maxFirstBuyFor(target).toString(),expiry,signature,solUsd,quoteUsd,observedAt:prices.observedAt};
}
/** SOL-equivalent lamports → raw quote units at an attested target (exact ratio the program enforces via max_first_buy). */
export const toQuoteUnits=(lamports,target)=>BigInt(lamports)*BigInt(target)/GRADUATION_QUOTE;
export const _resetPriceCache=()=>{priceCache={at:0,map:new Map()}};
