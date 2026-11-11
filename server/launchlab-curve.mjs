// Integer math for the STANDARD Raydium LaunchLab constant-product curve used by Floof.
// Same parameters the escrow program pins (programs/floof-escrow/src/launchlab.rs) and the
// Raydium SDK's createLaunchpad defaults: 1B supply (6 dp), 793.1M sold on the curve,
// migration to CPMM once 85 SOL (net of fees) has been raised. No custom curve is solved.
// Parity with the SDK (getInitParam / buyExactIn) is enforced by tests/launchlab.test.mjs.
export const SUPPLY=1_000_000_000_000_000n, SELL=793_100_000_000_000n, GRADUATION_QUOTE=85_000_000_000n, MIGRATE_FEE=0n;
// Pinned fee rates (per 1e6): LaunchLab global trade fee 0.25% + Floof platform 0.5% + creator 0.25%.
export const FEES={protocol:2500n,platform:5000n,creator:2500n},FEE_RATE=FEES.protocol+FEES.platform+FEES.creator,FEE_DENOMINATOR=1_000_000n;
// Configurable cap on raise + creator buy. Must match MAX_FIRST_BUY in the program.
export const MAX_FIRST_BUY=86_000_000_000n, MIN_FIRST_BUY=10_000_000n;
// Fair window opens at creation and lasts MIN..MAX seconds (program-enforced). One creator lock covers
// the creator allocation (>=30 days when used) and the dev buy (0 = delivered at settlement).
export const MIN_WINDOW_SECS=300, MAX_WINDOW_SECS=3600, DEFAULT_WINDOW_SECS=600, MAX_LOCK_DAYS=365;
// Quote pairs. Verified on Devnet LaunchLab (DRay6f…tcm6) GlobalConfigs: SOL (index 0, used by Floof),
// a second SOL config, a Devnet USDC test mint and two unnamed test mints. Mainnet LaunchLab also has
// USDC, USDT and USD1 configs. Floof escrow holds pledges in lamports, so only SOL is live.
export const QUOTES=[
 {symbol:'SOL',name:'Solana',mint:'So11111111111111111111111111111111111111112',live:true,graduation:'85 SOL'},
 {symbol:'USD1',name:'World Liberty USD',mint:'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',live:false,graduation:'stablecoin target',note:'LaunchLab mainnet quote · needs SPL-token escrow'},
 {symbol:'USDC',name:'USD Coin',mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',live:false,graduation:'stablecoin target',note:'LaunchLab quote (Devnet test config exists) · needs SPL-token escrow'},
 {symbol:'USDT',name:'Tether USD',mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',live:false,graduation:'stablecoin target',note:'LaunchLab mainnet quote · needs SPL-token escrow'},
];
const ceil=(a,b)=>(a+b-1n)/b;
/** Virtual reserves for the standard curve (SDK LaunchConstantProductCurve.getInitParam). */
export function standardCurve({locked=0n,supply=SUPPLY,totalSell=SELL,target=GRADUATION_QUOTE,migrateFee=MIGRATE_FEE}={}){
 locked=BigInt(locked);if(locked<0n||locked>supply/20n)throw Error('Invalid locked creator allocation');
 const remaining=supply-totalSell-locked,net=target-migrateFee;if(remaining<=0n||net<=0n)throw Error('Invalid curve parameters');
 const denominator=net*totalSell/remaining-target;if(denominator<=0n)throw Error('Invalid curve denominator');
 return {supply,totalSell,target,locked,virtualBase:(net*totalSell*totalSell/remaining)/denominator,virtualQuote:target*target/denominator,realBase:0n,realQuote:0n};
}
/** LaunchLab buy_exact_in on a curve state: fee taken from input; capped at the remaining curve supply. */
export function buyExactIn(curve,amountIn,feeRate=FEE_RATE){
 amountIn=BigInt(amountIn);if(amountIn<0n)throw Error('Invalid amount');if(amountIn===0n)return {spent:0n,tokens:0n,fee:0n,net:0n,completes:false};
 const x=curve.virtualBase-curve.realBase,y=curve.virtualQuote+curve.realQuote,remaining=curve.totalSell-curve.realBase;
 let fee=ceil(amountIn*feeRate,FEE_DENOMINATOR),net=amountIn-fee,tokens=net*x/(y+net),spent=amountIn,completes=false;
 if(tokens>remaining){net=ceil(y*remaining,x-remaining);spent=ceil(net*FEE_DENOMINATOR,FEE_DENOMINATOR-feeRate);fee=spent-net;tokens=remaining;completes=true}
 return {spent,tokens,fee,net,completes};
}
/** Gross SOL (incl. fees) a single first buy needs to complete the curve and trigger migration. */
export function curveCapacity(opts={}){const c=standardCurve(opts);return buyExactIn(c,c.target*10n).spent}
/** The same split as split_first_buy() in the program: one average price for presale and creator buy. */
export function splitFirstBuy(budget,creatorBuy,spent,tokens){budget=BigInt(budget);creatorBuy=BigInt(creatorBuy);if(creatorBuy===0n||spent===0n)return {creatorSpent:0n,creatorTokens:0n};const creatorSpent=spent*creatorBuy/budget;return {creatorSpent,creatorTokens:tokens*creatorSpent/spent}}
/**
 * Live Create-page quote for a fair-window first buy on the standard curve.
 * raise/creatorBuy in lamports. Returns bigint lamports/base units plus display numbers.
 */
/** Quote-pair aware: `target` (raw quote units, default 85 SOL) and `decimals` (default 9) parameterise the
 * same standard curve for any LaunchLab quote. SOL callers are unchanged. */
export function firstBuyQuote({raise=0n,creatorBuy=0n,locked=0n,target=GRADUATION_QUOTE,decimals=9}={}){
 target=BigInt(target);const unit=10**decimals;
 raise=BigInt(raise);creatorBuy=BigInt(creatorBuy);if(raise<0n||creatorBuy<0n)throw Error('Invalid amount');
 const curve=standardCurve({locked,target}),budget=raise+creatorBuy,buy=buyExactIn(curve,budget);
 const {creatorSpent,creatorTokens}=splitFirstBuy(budget||1n,creatorBuy,buy.spent,buy.tokens);
 const after={...curve,realBase:buy.tokens,realQuote:buy.net},startPrice=Number(curve.virtualQuote)/Number(curve.virtualBase)*1e6/unit;
 const spotAfter=(Number(after.virtualQuote+after.realQuote)/Number(after.virtualBase-after.realBase))*1e6/unit; // quote per whole token
 const avgPrice=buy.tokens>0n?Number(buy.spent)/unit/(Number(buy.tokens)/1e6):startPrice;
 const remainingNet=curve.target>after.realQuote?curve.target-after.realQuote:0n;
 return {budget,spent:buy.spent,fee:buy.fee,tokens:buy.tokens,completes:buy.completes,unspent:budget-buy.spent,creatorSpent,creatorTokens,windowTokens:buy.tokens-creatorTokens,pledgeSpent:buy.spent-creatorSpent,
  pctOfSupply:Number(buy.tokens)/Number(curve.supply)*100,pctOfCurve:Number(buy.tokens)/Number(curve.totalSell)*100,avgPrice,startPrice,spotAfter,
  impliedMcapSol:avgPrice*Number(curve.supply)/1e6,mcapAfterSol:spotAfter*Number(curve.supply)/1e6,curveSolAfter:Number(after.realQuote)/unit,
  remainingToMigrateSol:Number(remainingNet)/unit,remainingToMigrateGrossSol:Number(ceil(remainingNet*FEE_DENOMINATOR,FEE_DENOMINATOR-FEE_RATE))/unit,graduationSol:Number(curve.target)/unit,capacitySol:Number(curveCapacity({locked,target}))/unit,
  target,decimals};
}

/** Program rule (quote.rs max_first_buy): same 86/85 headroom as the SOL path. */
export const maxFirstBuyFor=target=>{target=BigInt(target);return (target*MAX_FIRST_BUY+GRADUATION_QUOTE-1n)/GRADUATION_QUOTE};
/** Migration target in raw quote units = USD value of 85 SOL at creation (rounded down). Prices as decimal strings/numbers in USD. */
export function migrationTarget({solUsd,quoteUsd,decimals}){const scale=1_000_000_000n,s=BigInt(Math.round(Number(solUsd)*1e9)),q=BigInt(Math.round(Number(quoteUsd)*1e9));if(s<=0n||q<=0n)throw Error('Invalid price');return GRADUATION_QUOTE*s*10n**BigInt(decimals)/(q*scale)}
