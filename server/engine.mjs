import {AppError,requireThat} from './errors.mjs';
import {LAMPORTS as L,UNITS as U,SUPPLY,mulDiv,allocation,curveQuote,fixed} from './math.mjs';
import {firstBuyQuote,MAX_FIRST_BUY,MIN_FIRST_BUY,MIN_WINDOW_SECS,MAX_WINDOW_SECS,DEFAULT_WINDOW_SECS,MAX_LOCK_DAYS} from './launchlab-curve.mjs';
const DAYS=86400000;
export const blankTruth=()=>({grade:'N/A',score:0,realPct:0,sybilClusters:0,washPct:0,status:'insufficient_data',sampleSize:0,source:'sandbox',checks:[],clusters:{nodes:[],edges:[]}});
export function seedState(templates,now=Date.now()){
  const state={schema:1,createdAt:now,accounts:{},coins:{},events:[],trades:[],receipts:{},quotes:{},attestations:{},rewards:{},follows:{},grants:0,fees:{protocol:0,platform:0},sequence:0};
  for(const [i,t] of templates.entries()){
    const active=i<5,curve=i>=9;
    const start=active?now-60000:curve?now-3600000:now+(i-4)*600000;
    const sol=curve?30*L:0;state.grants+=sol;
    state.coins[t.id]={...t,ca:`sandbox-${t.id}`,creatorId:null,createdAt:now,windowStart:start,windowEnd:active?now+24*3600000:start+600000,durationMs:active?24*3600000+60000:600000,status:curve?'curve':active?'open':'upcoming',price:curve?30/600e6:0,clearingPrice:curve?30/300e6:0,pledged:0,pledgers:0,holders:0,volume24h:0,change24h:0,snipersBlocked:0,curveSol:sol/L,truth:blankTruth(),tags:[...t.tags,'sandbox'],example:true,maxRaiseL:Math.round(t.priceCeiling*t.windowTokens*L),minTargetL:Math.round(t.minTarget*L),windowUnits:Math.round(t.windowTokens*U),pledges:{},vestAt:0,pool:{sol,tokens:curve?600e6*U:0},refundVault:0,tokenVault:0,raisedL:0,settledAt:curve?now:0,revision:0};
  }
  return state;
}
export function account(s,id){const a=Object.hasOwn(s.accounts,id)?s.accounts[id]:null;requireThat(a,'CONNECT','Open your sandbox wallet first.',401);return a}
export function coin(s,id){const c=Object.hasOwn(s.coins,id)?s.coins[id]:null;requireThat(c,'NOT_FOUND','Coin not found.',404);return c}
export function addEvent(s,c,a,kind,amount,now,extra={}){const e={id:++s.sequence,coin:c?.id||'',ticker:c?.ticker||'',wallet:a?.wallet||'system',accountId:a?.id||'',amount:amount/L,t:now,kind,...extra};s.events.unshift(e);return e}
function position(a,id){return a.positions[id]??={tokens:0,cost:0}}
export function connect(s,id,now){if(s.accounts[id])return s.accounts[id];requireThat(Object.keys(s.accounts).length<1000,'CAPACITY','Sandbox account capacity reached.',503);const short=id.slice(0,10);s.grants+=100*L;return s.accounts[id]={id,wallet:`sandbox:${short}`,balance:100*L,positions:{},claims:[],tickets:[],createdAt:now,creatorFees:0,linkedWallet:null}}
export function validateCoin(f,now){
  const name=String(f.name||'').trim(),ticker=String(f.ticker||'').trim().toUpperCase(),desc=String(f.desc||'').trim();
  requireThat(name.length>=2&&name.length<=32,'NAME','Name must be 2–32 characters.');
  requireThat(/^[A-Z0-9]{2,10}$/.test(ticker),'TICKER','Ticker must be 2–10 letters or digits.');
  requireThat(desc.length<=160,'DESCRIPTION','Description must be at most 160 characters.');
  // The fair window opens at creation; its length is the creator's choice within program bounds.
  const durationMin=f.durationMin??DEFAULT_WINDOW_SECS/60;requireThat(Number.isInteger(durationMin)&&durationMin*60>=MIN_WINDOW_SECS&&durationMin*60<=MAX_WINDOW_SECS,'DURATION',`Fair window must last ${MIN_WINDOW_SECS/60}–${MAX_WINDOW_SECS/60} minutes.`);
  requireThat((f.quote??'SOL')==='SOL','QUOTE','Only SOL pairs are live right now.');
  // The presale is the first buy on the standard LaunchLab curve (85 SOL graduation).
  const solOrZero=v=>v===undefined||v===null||v===''||Number(v)===0?0:fixed(v),maxRaiseL=solOrZero(f.maxRaise),creatorBuyL=solOrZero(f.creatorBuy),firstBuyL=BigInt(maxRaiseL)+BigInt(creatorBuyL);
  requireThat(firstBuyL>=MIN_FIRST_BUY&&firstBuyL<=MAX_FIRST_BUY,'RAISE',`Raise plus creator buy must be ${Number(MIN_FIRST_BUY)/L}–${Number(MAX_FIRST_BUY)/L} SOL.`);
  const quote=firstBuyQuote({raise:BigInt(maxRaiseL),creatorBuy:BigInt(creatorBuyL)}),windowUnits=Number(quote.windowTokens),price=quote.avgPrice;
  const minTargetL=solOrZero(f.minTarget);
  requireThat((maxRaiseL===0?minTargetL===0:minTargetL>=maxRaiseL/10)&&minTargetL<=maxRaiseL,'TARGET','Minimum target must be 10–100% of the maximum raise.');
  const lockDays=f.lockDays??0;requireThat(Number.isInteger(lockDays)&&lockDays>=0&&lockDays<=MAX_LOCK_DAYS,'LOCK',`Dev lock must be 0–${MAX_LOCK_DAYS} days.`);
  const links={};for(const key of ['web','tg','x']){
   let value=String(f[key]||'').trim();requireThat(value.length<=256,'LINK','Link too long.');
   if(value&&key==='web'){let url;try{url=new URL(value)}catch{}requireThat(url?.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.'),'LINK','Website must be a public HTTPS URL.');value=url.href}
   if(value&&key==='x'){requireThat(/^@?[A-Za-z0-9_]{1,15}$/.test(value),'LINK','Use a valid X handle.');value=value.replace(/^@/,'')}
   if(value&&key==='tg'){requireThat(/^(?:https:\/\/)?t\.me\/(?:[A-Za-z0-9_]{5,32}|\+[A-Za-z0-9_-]{5,})$/.test(value),'LINK','Use a valid t.me channel or invite link.');if(!value.startsWith('https://'))value='https://'+value}
   links[key]=value;
  }
  const image=f.image||null;requireThat(!image||/^\/api\/images\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(image),'IMAGE','Upload the image before creating the coin.');
  requireThat(['none','bow','leaf','crown','star','boba','halo','sprout','cap','phones'].includes(f.acc??'none'),'ACCESSORY','Invalid mascot style.');
  requireThat(Number.isInteger(f.hue??200)&&(f.hue??200)>=0&&(f.hue??200)<=359,'COLOR','Invalid color.');
  return {name,ticker,tagline:desc,hue:f.hue??200,accessory:f.acc??'none',priceCeiling:price,maxRaiseL,creatorBuyL,minTargetL,windowUnits,graduationTarget:quote.graduationSol,windowTokens:windowUnits/U,minTarget:minTargetL/L,lockDays,quote:'SOL',windowStart:now,windowEnd:now+durationMin*60000,durationMs:durationMin*60000,links,image,policy:{walletAge:!!f.walletAge,balHistory:!!f.balHistory}};
}
export function createCoin(s,id,f,now){
 const a=account(s,id),v=validateCoin(f,now);requireThat(!Object.values(s.coins).some(c=>c.ticker===v.ticker),'TICKER_EXISTS','This ticker is already taken.',409);
 requireThat(Object.keys(s.coins).length<500,'CAPACITY','Development coin limit reached.',503);
 requireThat(a.balance>=0.02*L,'BALANCE','Insufficient sandbox SOL for the creation fee.',409);
 const cid=`${v.ticker.toLowerCase()}-${crypto.randomUUID().slice(0,8)}`;
 const c={...v,id:cid,ca:`sandbox-${cid}`,creator:`floof-${id.slice(0,8)}`,creatorId:id,status:'open',createdAt:now,pledged:0,pledgers:0,clearingPrice:0,price:0,change24h:0,volume24h:0,curveSol:0,holders:0,snipersBlocked:0,truth:blankTruth(),createdAgo:0,tags:['sandbox'],pledges:{},vestAt:now+v.lockDays*DAYS,pool:{sol:0,tokens:0},refundVault:0,tokenVault:0,raisedL:0,settledAt:0,revision:0};
 a.balance-=0.02*L;s.fees.platform+=0.02*L;s.coins[cid]=c;addEvent(s,c,a,'create',0.02*L,now);return {coin:cid};
}
export function pledge(s,id,b,now){
 const a=account(s,id),c=coin(s,b.coin),amount=fixed(b.amount);
 requireThat(c.status==='open'&&now>=c.windowStart&&now<c.windowEnd,'WINDOW_CLOSED','This window is not accepting pledges.',409);
 requireThat(amount>=0.01*L,'MIN_PLEDGE','Minimum pledge is 0.01 SOL.');
 const previous=c.pledges[id],group=a.cluster||id;
 const total=Object.entries(c.pledges).reduce((sum,[aid,p])=>sum+((s.accounts[aid]?.cluster||aid)===group?p.amount:0),0);
 requireThat(total+amount<=Math.floor(c.maxRaiseL/100),'WALLET_CAP','Your account cluster has reached the 1% cap.',409);
 requireThat(a.balance>=amount,'BALANCE','Insufficient sandbox balance.',409);
 const att=s.attestations[b.attestation];requireThat(att&&att.account===id&&att.coin===c.id&&att.expiry>now&&!att.used,'ATTESTATION','Pledge eligibility expired. Please retry.',409);att.used=true;
 a.balance-=amount;c.pledges[id]={amount:(previous?.amount||0)+amount,at:previous?.at??now,claimed:false,weighted:(previous?.weighted||0)+amount*(now-c.windowStart<=180000?2:1)};
 c.pledged=Object.values(c.pledges).reduce((sum,p)=>sum+p.amount,0)/L;c.pledgers=Object.keys(c.pledges).length;c.revision++;addEvent(s,c,a,'pledge',amount,now);return {coin:c.id,amount:amount/L};
}
export function settleCoin(s,c,now){
 if(c.settledAt||!['open','upcoming'].includes(c.status)||now<c.windowEnd)return false;
 const total=Object.values(c.pledges).reduce((sum,p)=>sum+p.amount,0),failed=total<c.minTargetL;
 c.status=failed?'refunding':'curve';c.settledAt=now;c.raisedL=failed?0:Math.min(total,c.maxRaiseL);c.clearingPrice=failed?0:c.raisedL/L/(c.windowUnits/U);
 let refunds=0,tokens=0,filled=0;
 for(const [aid,p] of Object.entries(c.pledges)){
   Object.assign(p,allocation(p.amount,total,c.maxRaiseL,c.windowUnits,c.minTargetL));refunds+=p.refund;tokens+=p.tokens;filled+=p.filled;
   const a=s.accounts[aid];a.tickets.push({coin:c.id,ticker:c.ticker,no:String(s.sequence+1).padStart(6,'0'),date:new Date(now).toISOString().slice(0,10),pledged:p.amount/L,filled:p.filled/L,rarity:p.at-c.windowStart<=180000?'Gold':'Pink',hue:c.hue,accessory:c.accessory});
 }
 c.refundVault=refunds;c.tokenVault=tokens;c.pool={sol:filled,tokens:failed?0:SUPPLY-c.windowUnits};c.price=c.pool.tokens?c.pool.sol/L/(c.pool.tokens/U):0;c.curveSol=c.pool.sol/L;
 // Pro-rata SOL rounding dust belongs to refunds; using sum(filled) conserves every lamport.
 c.raisedL=filled;
 c.revision++;addEvent(s,c,null,failed?'refunding':'settle',filled,now);return true;
}
export function tick(s,now){let changed=false;for(const c of Object.values(s.coins)){
 if(c.status==='upcoming'&&now>=c.windowStart&&now<c.windowEnd){c.status='open';changed=true}
 if(settleCoin(s,c,now))changed=true;
}return changed}
export function claim(s,id,b,now){
 const a=account(s,id);requireThat(typeof b.id==='string'&&b.id.length<160,'CLAIM','Invalid claim identifier.');
 if(b.id==='creator-fees'){requireThat(a.creatorFees>0,'NO_CLAIM','No creator fees to claim.',409);const amount=a.creatorFees;a.balance+=amount;a.creatorFees=0;return {refund:amount/L,tokens:0}}
 if(b.id.startsWith('window:')){
  const c=coin(s,b.id.slice(7)),p=c.pledges[id];requireThat(c.settledAt&&p,'NO_CLAIM','No settled pledge to claim.',404);requireThat(!p.claimed,'ALREADY_CLAIMED','This pledge was already claimed.',409);
  a.balance+=p.refund;c.refundVault-=p.refund;c.tokenVault-=p.tokens;const pos=position(a,c.id);pos.tokens+=p.tokens;pos.cost+=p.filled;p.claimed=true;c.revision++;addEvent(s,c,a,'claim',p.refund,now);return {refund:p.refund/L,tokens:p.tokens/U};
 }
 const cl=a.claims.find(x=>x.id===b.id);requireThat(cl&&!cl.claimed,'NO_CLAIM','Claim not found or already claimed.',409);a.balance+=cl.amountL;cl.claimed=true;return {refund:cl.amountL/L,tokens:0};
}
export function prepareQuote(s,id,b,now){const a=account(s,id),c=coin(s,b.coin),q=curveQuote(c,b.side,b.amount,b.unit,b.slippageBps);requireThat(b.side==='buy'?a.balance>=q.sol:(a.positions[c.id]?.tokens||0)>=q.tokens,'BALANCE','Insufficient balance.',409);const quoteId=crypto.randomUUID();const data={...q,coin:c.id,account:id,side:b.side,amount:b.amount,unit:b.unit,slippageBps:b.slippageBps,expiresAt:now+30000,revision:c.revision,used:false};s.quotes[quoteId]=data;return {quoteId,sol:q.sol/L,tokens:q.tokens/U,fee:q.fee/L,impact:q.impact,avg:q.avg,minOut:q.minOut/(b.side==='buy'?U:L),expiresAt:data.expiresAt,mode:'sandbox',tx:null};}
export function executeTrade(s,id,b,now){
 const a=account(s,id),stored=s.quotes[b.quoteId];requireThat(stored&&stored.account===id&&!stored.used&&stored.expiresAt>now,'QUOTE_EXPIRED','Quote expired. Review a fresh quote.',409);
 const c=coin(s,stored.coin),q=curveQuote(c,stored.side,stored.amount,stored.unit,stored.slippageBps),buy=stored.side==='buy',pos=position(a,c.id);
 requireThat((buy?q.tokens:q.sol)>=stored.minOut,'SLIPPAGE','Market moved beyond your slippage limit.',409);
 // Exact-out inputs may change too; never charge more than the reviewed input.
 requireThat((buy?q.sol:q.tokens)<=(buy?stored.sol:stored.tokens),'QUOTE_CHANGED','Required input increased. Review a fresh quote.',409);
 requireThat(buy?a.balance>=q.sol:pos.tokens>=q.tokens,'BALANCE','Insufficient balance.',409);
 if(buy){a.balance-=q.sol;pos.tokens+=q.tokens;pos.cost+=q.sol;c.pool.sol+=q.sol-q.fee;c.pool.tokens-=q.tokens}
 else {a.balance+=q.sol;pos.cost-=mulDiv(pos.cost,q.tokens,pos.tokens);pos.tokens-=q.tokens;c.pool.sol-=q.gross;c.pool.tokens+=q.tokens}
 const protocol=Math.floor(q.fee/4),creator=Math.floor(q.fee/4);s.fees.protocol+=protocol;
 if(c.creatorId)s.accounts[c.creatorId].creatorFees+=creator;else s.fees.protocol+=creator;
 s.fees.platform+=q.fee-protocol-creator;stored.used=true;c.price=c.pool.sol/L/(c.pool.tokens/U);c.curveSol=c.pool.sol/L;c.revision++;
 const event=addEvent(s,c,a,stored.side,q.sol,now,{tokens:q.tokens/U,price:c.price,fee:q.fee/L});s.trades.push({...event,solL:q.sol,tokensU:q.tokens});return {sol:q.sol/L,tokens:q.tokens/U,fee:q.fee/L};
}
export function scoutRows(s,now=Date.now()){
 const rows=[];for(const a of Object.values(s.accounts)){
 let points=0,windows=0,held=0,earned=0;for(const c of Object.values(s.coins)){const p=c.pledges[a.id];if(!p||p.at>now)continue;windows++;const allocated=p.tokens||0;const holding=(a.positions[c.id]?.tokens||0)+(!p.claimed?allocated:0);const fraction=allocated?Math.min(1,holding/allocated):0;held+=fraction;points+=p.weighted/L*100*(1+Math.max(0,Math.min(30,(now-(c.settledAt||now))/DAYS))*fraction);if(c.status==='graduated')points+=100*fraction}
 for(const cl of a.claims)if(cl.kind==='scout')earned+=cl.amountL/L;
 if(windows)rows.push({account:a.id,wallet:a.linkedWallet||a.wallet,points:Math.floor(points),windows,hold:Math.round(held/windows*100),earned:+earned.toFixed(6),hue:(a.id.charCodeAt(0)*11)%360,accessory:'star'});
 }return rows.sort((a,b)=>b.points-a.points||a.wallet.localeCompare(b.wallet)).map((a,i)=>({...a,rank:i+1}));
}
export function rewardEpoch(s,epoch,now){
 requireThat(/^\d{4}-\d{2}-\d{2}$/.test(epoch),'EPOCH','Invalid epoch.');const end=Date.parse(epoch+'T00:00:00Z');requireThat(end<=now&&end>s.createdAt,'EPOCH','Epoch must be a closed period after this environment started.');
 requireThat(!s.rewards[epoch],'EPOCH_EXISTS','This epoch is already distributed.',409);const rows=scoutRows(s,end),total=rows.reduce((n,a)=>n+a.points,0),budget=s.fees.platform;requireThat(total>0&&budget>0,'NO_REWARDS','No funded rewards to distribute.',409);
 const leaves=[];let paid=0;for(const row of rows){const amount=mulDiv(budget,row.points,total);if(!amount)continue;s.accounts[row.account].claims.push({id:`scout:${epoch}:${row.account}`,coin:Object.values(s.coins).find(c=>c.pledges[row.account])?.id,kind:'scout',amountL:amount,note:`Scout rewards · ${epoch}`,claimed:false});paid+=amount;leaves.push({wallet:row.wallet,amount:String(amount)})}
 s.fees.platform-=paid;s.rewards[epoch]={epoch,budget:paid,leaves,createdAt:now,mode:'sandbox'};return s.rewards[epoch];
}
export function truthFor(s,c){
 const trades=s.trades.filter(t=>t.coin===c.id),buyers=[...new Set(trades.filter(t=>t.kind==='buy').map(t=>t.accountId))];
 if(trades.length<20||buyers.length<5)return {...blankTruth(),sampleSize:trades.length,reason:'At least 20 indexed trades and 5 distinct buyers are required.'};
 const linked=new Set(),edges=[];for(let i=0;i<buyers.length;i++)for(let j=i+1;j<buyers.length;j++)if(s.accounts[buyers[i]]?.cluster&&s.accounts[buyers[i]].cluster===s.accounts[buyers[j]]?.cluster){linked.add(buyers[i]);linked.add(buyers[j]);edges.push({source:buyers[i],target:buyers[j]})}
 // Fast round trips are a heuristic, not a fraud verdict or slashing proof.
 let suspect=0,total=0;for(const t of trades){total+=t.solL;if(t.kind==='sell'&&trades.some(x=>x.kind==='buy'&&x.accountId===t.accountId&&x.t<t.t&&t.t-x.t<60000))suspect+=t.solL}
 const realPct=(1-linked.size/buyers.length)*100,washPct=total?suspect/total*100:0,score=Math.max(0,Math.round(realPct-washPct/2));
 return {grade:score>=97?'A+':score>=90?'A':score>=78?'B':score>=60?'C':'D',score,realPct,sybilClusters:new Set([...linked].map(id=>s.accounts[id].cluster)).size,washPct,sampleSize:trades.length,status:'heuristic',source:'sandbox',clusters:{nodes:buyers.map(id=>({id,wallet:s.accounts[id].wallet,linked:linked.has(id)})),edges},checks:[{id:'sample',ok:true,label:`${trades.length} recorded sandbox trades`},{id:'clusters',ok:linked.size===0,label:'No linked accounts among observed buyers'},{id:'wash',ok:washPct<8,label:'Rapid round-trip volume below 8%'}]};
}
export function creator(s,handle,now=Date.now()){
 const coins=Object.values(s.coins).filter(c=>c.creator===handle),owner=coins.find(c=>c.creatorId)?.creatorId,a=owner?s.accounts[owner]:null;const real=coins.filter(c=>!c.example),graduated=coins.filter(c=>c.status==='graduated').length,rep=Math.max(0,Math.min(100,real.length*5+real.filter(c=>c.status==='graduated').length*20));
 return {handle,name:a?'Your Floof':handle,rep,tier:rep>=90?'Legend':rep>=75?'Cloud':rep>=50?'Puff':'Sprout',launches:coins.length,graduated,joined:new Date(a?.createdAt||s.createdAt).toLocaleDateString('en',{month:'short',year:'numeric'}),followers:Object.values(s.follows).filter(list=>list.includes(handle)).length,bio:a?'Building fair launches in the Floof sandbox.':'Example creator · sandbox launch fixtures.',hue:coins[0]?.hue||200,accessory:coins[0]?.accessory||'none',wallet:a?.linkedWallet||a?.wallet||'Sandbox fixture',history:s.events.filter(e=>coins.some(c=>c.id===e.coin)&&['create','settle','refunding'].includes(e.kind)).map(e=>({t:e.kind==='create'?'Launch created':e.kind==='settle'?'Window settled':'Window refunded',d:`$${e.ticker} · ${new Date(e.t).toISOString()}`,v:`${e.amount.toFixed(3)} SOL`,ok:e.kind!=='refunding'}))};
}
export function publicCoin(s,c,now){const trades=s.trades.filter(t=>t.coin===c.id&&t.t>=now-DAYS);return Object.fromEntries(Object.entries({...c,pledged:Object.values(c.pledges).reduce((n,p)=>n+p.amount,0)/L,truth:truthFor(s,c),createdAgo:now-c.createdAt,holders:Object.values(s.accounts).filter(a=>(a.positions[c.id]?.tokens||0)>0).length,volume24h:trades.reduce((n,t)=>n+t.amount,0),change24h:trades.length?(c.price/trades[0].price-1)*100:0}).filter(([k])=>!['pledges','creatorId','maxRaiseL','minTargetL','windowUnits','bondL','creatorUnits','pool','refundVault','tokenVault','raisedL'].includes(k)))}
export function snapshot(s,id,now=Date.now()){
 const a=s.accounts[id],scouts=scoutRows(s,now),claims=a?[...a.claims.map(c=>({...c,amount:c.amountL/L})),...Object.values(s.coins).filter(c=>c.settledAt&&c.pledges[id]).map(c=>({id:`window:${c.id}`,coin:c.id,kind:'refund',amount:c.pledges[id].refund/L,tokens:c.pledges[id].tokens/U,note:c.status==='refunding'?'Window missed its target · full refund':'Window tokens + unused SOL',claimed:c.pledges[id].claimed}))]:[];
 if(a){
  if(a.creatorFees>0)claims.push({id:'creator-fees',coin:Object.values(s.coins).find(c=>c.creatorId===id)?.id,kind:'fees',amount:a.creatorFees/L,note:'Accrued creator trading fees',claimed:false});
 }
 return {mode:'sandbox',network:'offchain',now,wallet:!!a,walletAddress:a?.linkedWallet||a?.wallet||'',linkedWallet:a?.linkedWallet||null,sol:(a?.balance||0)/L,coins:Object.values(s.coins).map(c=>publicCoin(s,c,now)),creators:[...new Set(Object.values(s.coins).map(c=>c.creator))].map(h=>creator(s,h,now)),feed:s.events.filter(e=>['pledge','blocked','buy','sell'].includes(e.kind)).slice(0,120).map(e=>({...e,wallet:e.accountId===id?'you':e.wallet})),myPledges:Object.fromEntries(Object.values(s.coins).filter(c=>c.pledges[id]).map(c=>[c.id,c.pledges[id].amount/L])),positions:Object.fromEntries(Object.entries(a?.positions||{}).map(([cid,p])=>[cid,{tokens:p.tokens/U,cost:p.cost/L}])),claims,tickets:a?.tickets||[],scouts:scouts.map(r=>({...r,me:r.account===id,account:undefined})),following:s.follows[id]||[],stats:{launched:Object.values(s.coins).filter(c=>c.settledAt&&!c.example&&c.status!=='refunding').length,snipersBlocked:0,refunded:s.events.filter(e=>e.kind==='claim').reduce((n,e)=>n+e.amount,0),pledged24h:s.events.filter(e=>e.kind==='pledge'&&e.t>=now-DAYS).reduce((n,e)=>n+e.amount,0)},integrations:{solana:'not_deployed',launchlab:'not_connected',indexer:'not_configured',truth:'sandbox_events_only'}};
}
export function holders(s,c){const rows=Object.values(s.accounts).map(a=>({wallet:a.linkedWallet||a.wallet,tokens:a.positions[c.id]?.tokens||0,tag:''})).filter(a=>a.tokens>0);if(c.pool.tokens)rows.push({wallet:'Sandbox pool',tokens:c.pool.tokens,tag:'curve'});if(c.tokenVault)rows.push({wallet:'Unclaimed window tokens',tokens:c.tokenVault,tag:'window'});return rows.sort((a,b)=>b.tokens-a.tokens).map(r=>({...r,pct:r.tokens/SUPPLY*100,tokens:r.tokens/U}))}
export function candles(s,c,tf='1h'){const ms={'5m':300000,'1h':3600000,'4h':14400000,'1d':DAYS}[tf];requireThat(ms,'TIMEFRAME','Unsupported candle timeframe.');const groups=new Map();for(const t of s.trades.filter(t=>t.coin===c.id)){const key=Math.floor(t.t/ms)*ms;if(!groups.has(key))groups.set(key,[key,t.price,t.price,t.price,t.price,t.amount]);else {const g=groups.get(key);g[2]=Math.max(g[2],t.price);g[3]=Math.min(g[3],t.price);g[4]=t.price;g[5]+=t.amount}}return [...groups.values()].slice(-500)}
export function audit(s){let sum=s.fees.protocol+s.fees.platform;for(const a of Object.values(s.accounts)){sum+=a.balance+a.creatorFees;for(const cl of a.claims)if(!cl.claimed)sum+=cl.amountL;requireThat(a.balance>=0&&Object.values(a.positions).every(p=>p.tokens>=0&&p.cost>=0),'INVARIANT','Negative account balance.',500)}for(const c of Object.values(s.coins)){sum+=c.pool.sol+c.refundVault;if(!c.settledAt)sum+=Object.values(c.pledges).reduce((n,p)=>n+p.amount,0);requireThat(c.pool.sol>=0&&c.pool.tokens>=0&&c.refundVault>=0&&c.tokenVault>=0,'INVARIANT','Negative vault balance.',500)}requireThat(sum===s.grants,'INVARIANT',`Ledger conservation failed: ${sum} != ${s.grants}`,500);return {credits:s.grants,accounted:sum,balanced:true}}
export function command(s,id,kind,b,now=Date.now()){
 tick(s,now);let result;
 switch(kind){
  case 'connect':connect(s,id,now);result={connected:true};break;
  case 'create':result=createCoin(s,id,b,now);break;
  case 'pledge':result=pledge(s,id,b,now);break;
  case 'claim':result=claim(s,id,b,now);break;
  case 'trade':result=executeTrade(s,id,b,now);break;
  case 'quote':result=prepareQuote(s,id,b,now);break;
  case 'attest':{account(s,id);const c=coin(s,b.coin);requireThat(c.status==='open','WINDOW_CLOSED','Window is not open.',409);const nonce=crypto.randomUUID(),expiry=now+120000;s.attestations[nonce]={account:id,coin:c.id,expiry,used:false};result={id:nonce,expiry,mode:'sandbox',sig:null,policy:'authenticated-account cap; chain wallet analysis is not active'};break}
  case 'scenario':{
   account(s,id);const c=coin(s,b.coin);requireThat(c.example||c.creatorId===id,'FORBIDDEN','Only the creator may add test participants.',403);requireThat(!c.settledAt,'SETTLED','Window already settled.',409);requireThat(['success','oversubscribed'].includes(b.scenario),'SCENARIO','Choose a test scenario.');
   c.windowStart=Math.min(c.windowStart,now);c.windowEnd=Math.max(c.windowEnd,now+600000);c.status='open';
   const target=b.scenario==='oversubscribed'?Math.ceil(c.maxRaiseL*1.2):Math.max(c.minTargetL,Math.ceil(c.maxRaiseL*0.8)),cap=Math.floor(c.maxRaiseL/100);let total=Object.values(c.pledges).reduce((sum,p)=>sum+p.amount,0),added=0;
   for(let i=0;total<target&&i<200;i++){
    const aid=`fixture_${c.id}_${i}`,a=connect(s,aid,now);a.wallet=`test:${c.ticker}:${String(i+1).padStart(3,'0')}`;a.fixture=true;
    const remaining=cap-(c.pledges[aid]?.amount||0),amount=Math.min(remaining,target-total);if(amount<0.01*L)continue;
    const nonce=crypto.randomUUID();s.attestations[nonce]={account:aid,coin:c.id,expiry:now+120000,used:false};pledge(s,aid,{coin:c.id,amount:amount/L,attestation:nonce},now);total+=amount;added++;
   }
   result={testParticipantsAdded:added,notice:'Explicit sandbox fixtures; no real wallets or deposits.'};break;
  }
  case 'fast-forward':{account(s,id);const c=coin(s,b.coin);requireThat(c.example||c.creatorId===id,'FORBIDDEN','Only the creator can advance this sandbox window.',403);requireThat(!c.settledAt,'SETTLED','Window already settled.',409);const started=now<c.windowStart;c.windowStart=Math.min(c.windowStart,now);c.windowEnd=now+(started?600000:5000);c.status='open';result={endsAt:c.windowEnd,started};break}
  case 'follow':{account(s,id);requireThat(Object.values(s.coins).some(c=>c.creator===b.handle),'NOT_FOUND','Creator not found.',404);const list=s.follows[id]||[];s.follows[id]=list.includes(b.handle)?list.filter(h=>h!==b.handle):[...list,b.handle];result={following:s.follows[id].includes(b.handle)};break}
  case 'creator-fees':{const a=account(s,id);a.balance+=a.creatorFees;result={amount:a.creatorFees/L};a.creatorFees=0;break}
  default:throw new AppError(404,'NOT_FOUND','Unknown action.');
 }
 audit(s);return result;
}
