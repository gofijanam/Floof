import {requireThat} from './errors.mjs';
export const LAMPORTS=1_000_000_000, UNITS=1_000_000, SUPPLY=1_000_000_000*UNITS;
export const mulDiv=(a,b,d)=>Number(BigInt(a)*BigInt(b)/BigInt(d));
export const mulDivUp=(a,b,d)=>Number((BigInt(a)*BigInt(b)+BigInt(d)-1n)/BigInt(d));
export function fixed(value, decimals=9, max=1e6) {
  requireThat(typeof value==='number'||typeof value==='string','INVALID_AMOUNT','Enter a valid amount.');
  const n=Number(value);
  requireThat(Number.isFinite(n)&&n>0&&n<=max,'INVALID_AMOUNT','Amount is outside the supported range.');
  const v=Math.round(n*10**decimals);
  requireThat(Number.isSafeInteger(v)&&v>0,'INVALID_AMOUNT','Amount is too small or too large.');
  return v;
}
export function allocation(amount, pledged, maxRaise, tokens, minTarget) {
  if(pledged<minTarget) return {filled:0,refund:amount,tokens:0};
  const raised=Math.min(pledged,maxRaise);
  const filled=mulDiv(amount,raised,pledged);
  // Allocate tokens from original contribution, independently of rounded SOL refunds.
  return {filled,refund:amount-filled,tokens:mulDiv(amount,tokens,pledged)};
}
export function curveQuote(c, side, amount, unit='sol', slippageBps=100) {
  requireThat(['buy','sell'].includes(side)&&['sol','token'].includes(unit),'INVALID_TRADE','Choose buy/sell and SOL/token.');
  requireThat(Number.isInteger(slippageBps)&&slippageBps>=0&&slippageBps<=5000,'SLIPPAGE','Slippage must be between 0 and 50%.');
  requireThat(c.status==='curve'||c.status==='graduated','NOT_TRADING','Trading opens only after a successful settlement.',409);
  const x=c.pool.sol,y=c.pool.tokens;
  requireThat(x>0&&y>0,'NO_LIQUIDITY','No trading liquidity.',409);
  let sol,tokens,fee,gross;
  if(side==='buy') {
    if(unit==='sol') {sol=fixed(amount); fee=mulDivUp(sol,100,10000);tokens=mulDiv(y,sol-fee,x+sol-fee)}
    else {tokens=fixed(amount,6,1e9);requireThat(tokens<y,'LIQUIDITY','Amount exceeds pool liquidity.');const net=mulDivUp(x,tokens,y-tokens);sol=mulDivUp(net,10000,9900);fee=mulDivUp(sol,100,10000);tokens=mulDiv(y,sol-fee,x+sol-fee)}
    gross=sol;
  } else {
    if(unit==='token') tokens=fixed(amount,6,1e9);
    else {const target=fixed(amount);gross=mulDivUp(target,10000,9900);requireThat(gross<x,'LIQUIDITY','Amount exceeds pool liquidity.');tokens=mulDivUp(y,gross,x-gross)}
    gross=mulDiv(x,tokens,y+tokens);fee=mulDivUp(gross,100,10000);sol=gross-fee;
  }
  requireThat(sol>0&&tokens>0&&sol<x*100,'INVALID_TRADE','Trade is too small or too large.');
  const price=x/LAMPORTS/(y/UNITS),avg=(sol/LAMPORTS)/(tokens/UNITS);
  const impact=Math.max(0,(side==='buy'?avg/price-1:1-avg/price)*100);
  requireThat(impact<=25,'PRICE_IMPACT','Price impact exceeds 25%.');
  return {sol,tokens,fee,gross,impact,avg,minOut:mulDiv(side==='buy'?tokens:sol,10000-slippageBps,10000)};
}
