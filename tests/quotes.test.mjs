import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {checkMint,lookupMint,filterQuotes,countByGroup,formatUnits,toRaw,fmtQuoteAmount,migrationTarget,quoteNumbers,solUsdFrom,parseQuotesResponse,WSOL_MINT} from '../src/lib/quotes.ts';
import {firstBuyQuote} from '../server/launchlab-curve.mjs';
import {mockQuotesClient} from '../src/lib/quotesClient.ts';
const snap=JSON.parse(await readFile(new URL('../src/mocks/quotes.snapshot.json',import.meta.url),'utf8'));
const q=(o)=>({mint:WSOL_MINT,symbol:'SOL',name:'Wrapped SOL',logo:null,decimals:9,group:'solana',token2022:false,configId:'6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX',minMigration:'24000000000',priceUsd:80,...o});
const USDC=q({mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',symbol:'USDC',name:'USD Coin',decimals:6,group:'currencies',configId:'8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw',minMigration:'1',priceUsd:1});
const NVDAX=q({mint:'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',symbol:'NVDAX',name:'NVIDIA',decimals:8,group:'stocks',token2022:true,configId:'2NuVPU5ViAyQsZamVfJ1vU6Cp77WSzret4LtNTMiWFQ4',minMigration:'1',priceUsd:170});
const USD1=q({mint:'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',symbol:'USD1',name:'World Liberty USD',decimals:6,group:'custom',configId:'EPiZbnrThjyLnoQ6QQzkxeFqyL5uyg9RzNHHAudUPxBz',minMigration:'5000000000',priceUsd:1});
const SOL=q({});

test('mint validation: base58, exactly 32 bytes',()=>{
  assert.deepEqual(checkMint(WSOL_MINT),{ok:true,mint:WSOL_MINT});
  assert.equal(checkMint('  '+USDC.mint+'\n').ok,true,'trims whitespace');
  assert.equal(checkMint('11111111111111111111111111111111').ok,true,'system program (all zero) is 32 bytes');
  assert.deepEqual(checkMint(''),{ok:false,reason:'empty'});
  assert.deepEqual(checkMint('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt0v'),{ok:false,reason:'charset'},'0 is not base58');
  assert.deepEqual(checkMint('So1111111111111111111111111111111111111111I'),{ok:false,reason:'charset'},'I is not base58');
  assert.deepEqual(checkMint('So11111111'),{ok:false,reason:'length'});
  assert.deepEqual(checkMint('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),{ok:false,reason:'length'},'44 chars that overflow 32 bytes');
});
test('pasted mint lookup: ready, no LaunchLab market, invalid',()=>{
  const list=[SOL,USDC,{...NVDAX,configId:null,minMigration:null}];
  assert.equal(lookupMint(USDC.mint,list).kind,'ready');
  const nv=lookupMint(NVDAX.mint,list);assert.equal(nv.kind,'no-market');assert.equal(nv.quote.symbol,'NVDAX');
  assert.deepEqual(lookupMint('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',list),{kind:'no-market',mint:'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',quote:undefined});
  assert.equal(lookupMint('',list),null);
  assert.deepEqual(lookupMint('not a mint!',list),{kind:'invalid',reason:'charset'});
});
test('search ranks tickers first, spans groups, handles $ and mint prefixes; tabs keep launchable first',()=>{
  const nvd2=q({mint:'4vqind26DsicHecdGyrjYc4yhQN9HtyfzJ3d1ouppump',symbol:'NVDAINU',name:'nvda inu',decimals:6,group:'custom',configId:'12vbVGE8Ju18A4cvtTVz8eJ7Nrf3Q8uQPzVDUqjrQBYB'});
  const list=[SOL,USDC,NVDAX,USD1,nvd2,q({mint:'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL',symbol:'PSOL',name:'Phantom Staked SOL',configId:null,minMigration:null})];
  assert.deepEqual(filterQuotes(list,{group:'stocks',query:'nvda'}).map(t=>t.symbol),['NVDAX','NVDAINU']);
  assert.deepEqual(filterQuotes(list,{group:'solana',query:'$usd'}).map(t=>t.symbol),['USDC','USD1']);
  assert.deepEqual(filterQuotes(list,{group:'custom',query:'usd coin'}).map(t=>t.symbol),['USDC']);
  assert.deepEqual(filterQuotes(list,{group:'custom',query:'EPjF'}).map(t=>t.symbol),['USDC']);
  assert.deepEqual(filterQuotes(list,{group:'custom',query:'nvidia'}).map(t=>t.symbol),['NVDAX']);
  assert.deepEqual(filterQuotes(list,{group:'solana',query:''}).map(t=>t.symbol),['SOL','PSOL'],'launchable first within a tab');
  assert.deepEqual(filterQuotes(list,{group:'solana',query:'zzzz'}),[]);
  const c=countByGroup(filterQuotes(list,{group:'solana',query:'nvda'}));assert.equal(c.stocks,1);assert.equal(c.custom,1);assert.equal(c.solana,0);
});
test('exact unit conversion and readable amounts',()=>{
  assert.equal(formatUnits(85_000_000_000n,9),'85');assert.equal(formatUnits(7_049_975_768n,6),'7049.975768');assert.equal(formatUnits(1n,8),'0.00000001');assert.equal(formatUnits(0n,6),'0');
  assert.equal(toRaw(7049.975768,6),7_049_975_768n);assert.equal(toRaw(0.1,9),100_000_000n);assert.equal(toRaw(40.82,8),4_082_000_000n);assert.equal(toRaw(-1,6),null);assert.equal(toRaw(NaN,6),null);
  assert.equal(toRaw(2.5e9,6),2_500_000_000_000_000n,'large pump-style targets stay integer');
  assert.equal(fmtQuoteAmount(7049.975768,6),'7,050');assert.equal(fmtQuoteAmount(40.8231,8),'40.82');assert.equal(fmtQuoteAmount(85,9),'85');
  assert.equal(fmtQuoteAmount(0.000123456,9),'0.0001235');assert.equal(fmtQuoteAmount(2_500_000_000,5),'2.50B');assert.equal(fmtQuoteAmount(12_345_678,6),'12.35M');
  assert.equal(fmtQuoteAmount(0.4,0),'<1');assert.equal(fmtQuoteAmount(0.000001,2),'<0.01','never more fraction digits than the mint has');
});
test('migration target = USD value of 85 SOL in the quote, unless minMigration is larger',()=>{
  const sol=migrationTarget(SOL,80);assert.equal(sol.raw,85_000_000_000n);assert.equal(sol.basis,'standard');assert.equal(sol.usd,6800);
  assert.equal(migrationTarget(SOL,null).raw,85_000_000_000n,'SOL needs no price');
  const u=migrationTarget(USDC,80);assert.equal(u.raw,6_800_000_000n);assert.equal(u.ui,6800);assert.equal(u.basis,'standard');
  const nv=migrationTarget(NVDAX,80);assert.equal(nv.raw,4_000_000_000n,'8 dp: 6800/170 = 40 NVDAX');assert.equal(nv.ui,40);
  const one=migrationTarget(USD1,50);assert.equal(one.basis,'min-migration','85 SOL @ $50 = $4,250 < 5,000 USD1 floor');assert.equal(one.raw,5_000_000_000n);assert.equal(one.usdEquivalentRaw,4_250_000_000n);
  assert.equal(migrationTarget(USD1,80).basis,'standard');
  assert.deepEqual(migrationTarget({...USDC,priceUsd:null},80),{ok:false,reason:'no-price'});
  assert.deepEqual(migrationTarget(USDC,null),{ok:false,reason:'no-price'});
  assert.deepEqual(migrationTarget({...USDC,configId:null},80),{ok:false,reason:'no-market'});
  assert.deepEqual(migrationTarget({...USDC,decimals:18,priceUsd:1e-9},80),{ok:false,reason:'overflow'});
  assert.equal(solUsdFrom([USDC,SOL]),80);assert.equal(solUsdFrom([USDC]),null);
});
test('first-buy numbers in the quote match the SOL curve and scale linearly',()=>{
  const ref=firstBuyQuote({raise:40_000_000_000n,creatorBuy:2_000_000_000n});
  const s=quoteNumbers(SOL,80,40,2);
  assert.equal(s.raise,40);assert.equal(s.firstBuy,42);assert.ok(Math.abs(s.pctOfSupply-ref.pctOfSupply)<1e-9);
  assert.ok(Math.abs(s.avgPrice-ref.avgPrice)<1e-15);assert.ok(Math.abs(s.remainingNet-ref.remainingToMigrateSol)<1e-9);assert.ok(Math.abs(s.remainingGross-ref.remainingToMigrateGrossSol)<1e-9);
  assert.ok(Math.abs(s.mcapAtClearing-ref.impliedMcapSol)<1e-6);
  const u=quoteNumbers(USDC,80,40,2);
  assert.equal(u.raise,3200);assert.equal(u.devBuy,160);assert.ok(Math.abs(u.pctOfSupply-ref.pctOfSupply)<1e-6,'same share of supply');
  assert.ok(Math.abs(u.mcapAtClearing/ref.impliedMcapSol-80)<1e-3,'mcap scales by the SOL price');
  assert.ok(Math.abs(u.remainingNet-ref.remainingToMigrateSol*80)<1e-3);assert.equal(u.usd(100),100);
  const n=quoteNumbers(NVDAX,80,85,0);assert.equal(n.raise,40);assert.equal(n.completes,false);assert.ok(n.remainingNet>0);
  const full=quoteNumbers(USDC,80,86,0);assert.equal(full.completes,true);assert.equal(full.remainingNet,0);assert.equal(full.progressPct,100);
  const zero=quoteNumbers(USDC,80,0,0);assert.equal(zero.pctOfSupply,0);assert.equal(zero.remainingNet,6800);
  const floor=quoteNumbers(USD1,50,40,0);assert.equal(floor.target.basis,'min-migration');assert.ok(Math.abs(floor.raise-40/85*5000)<1e-6);
  assert.equal(quoteNumbers({...USDC,priceUsd:null},80,40,0),null);
});
test('/api/quotes parsing drops malformed rows and non-https logos',()=>{
  const r=parseQuotesResponse({observedAt:'2026-11-11T00:00:00Z',quotes:[USDC,{...NVDAX,logo:'javascript:alert(1)'},{...SOL,mint:'bad'},{...SOL,decimals:40},{...SOL,group:'memes'},{...SOL,minMigration:'1.5'},null]});
  assert.deepEqual(r.quotes.map(t=>t.symbol),['USDC','NVDAX']);assert.equal(r.quotes[1].logo,null);
  assert.throws(()=>parseQuotesResponse({}),/Unexpected/);
});
test('mock client serves the snapshot: every LaunchLab config, SOL first, all rows valid',async()=>{
  const load=async()=>snap;const r=await mockQuotesClient.list({delayMs:0,load});
  assert.equal(r.quotes.length,snap.quotes.length,'snapshot rows are all valid');
  assert.equal(r.quotes[0].mint,WSOL_MINT);
  assert.ok(r.quotes.filter(t=>t.configId).length>=650);
  for(const g of ['solana','stocks','currencies','custom'])assert.ok(r.quotes.some(t=>t.group===g),g);
  const sol=solUsdFrom(r.quotes);assert.ok(sol>0);
  const unsized=r.quotes.filter(t=>t.configId&&t.priceUsd!=null).map(t=>migrationTarget(t,sol)).filter(m=>!m.ok);
  assert.ok(unsized.every(m=>m.reason==='overflow')&&unsized.length<=3,'priced markets size, except dust-priced tokens whose target exceeds u64');
  await assert.rejects(()=>mockQuotesClient.list({delayMs:0,scenario:'error',load}),/unavailable/);
  assert.equal((await mockQuotesClient.list({delayMs:0,scenario:'empty',load})).quotes.length,0);
});
