// Integer arithmetic for the pinned Raydium constant-product, classic SPL-token path.
// Keep parity tests against the pinned SDK; never reuse these parameters for other configs.
export const SUPPLY=1_000_000_000_000_000n, SELL=800_000_000_000_000n;
const ceil=(a,b)=>(a+b-1n)/b;
export function initialQuote(target,windowTokens,locked=0n){
 target=BigInt(target);windowTokens=BigInt(windowTokens);locked=BigInt(locked);
 if(target<=0n||locked<0n||locked>SUPPLY/20n||![SUPPLY/5n,SUPPLY*3n/10n,SUPPLY*2n/5n].includes(windowTokens))throw Error('Invalid Floof curve parameters');
 const remaining=SUPPLY-SELL-locked,denominator=target*SELL/remaining-target;
 if(denominator<=0n)throw Error('Invalid curve denominator');
 const virtualBase=(target*SELL*SELL/remaining)/denominator,virtualQuote=target*target/denominator;
 const net=ceil(virtualQuote*windowTokens,virtualBase-windowTokens);
 const gross=ceil(net*1_000_000n,990_000n);
 return {target,virtualBase,virtualQuote,net,gross};
}
export function settlementTarget(budget,windowTokens,locked=0n){
 budget=BigInt(budget);if(budget<1_000_000_000n||budget>2_000_000_000_000n)throw Error('Invalid settlement budget');
 let lo=budget+1n,hi=200_000_000_000_000n;
 while(lo<hi){const m=(lo+hi+1n)/2n;if(initialQuote(m,windowTokens,locked).gross<=budget)lo=m;else hi=m-1n}
 const q=initialQuote(lo,windowTokens,locked);if(q.gross>budget||budget-q.gross>1000n)throw Error('No safe curve target fits the escrow budget');return q;
}
