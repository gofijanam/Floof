import {PROGRAM} from './chain-client.mjs';import {fetchWindow} from './chain-rpc.mjs';import {hash} from './crypto.mjs';import {requireThat} from './errors.mjs';
export const WEEK=604800000;
// Points are earned over the completed UTC week. Transfers stop earning on the
// transferred allocation; purchases cannot boost holdings above the pledged allocation.
export function earnedPoints({pledged,allocation,early,weightedPledge,settledAt,claimedAt,movements,start,end,graduatedAt}){
 const cap=BigInt(allocation);if(cap<=0n||end<=start||settledAt>=end)return 0n;
 let balance=0n,at=Math.max(start,settledAt),area=0n,graduationHeld=0n;
 const rows=movements.filter(m=>m.time<end).sort((a,b)=>a.time-b.time),grouped=new Map();for(const m of rows)grouped.set(m.time,(grouped.get(m.time)||0n)+BigInt(m.delta));
 const held=t=>t<(claimedAt??Infinity)?cap:balance<0n?0n:balance>cap?cap:balance;
 const points=[...new Set([...grouped.keys(),...(claimedAt!=null?[claimedAt]:[]),...(graduatedAt!=null?[graduatedAt]:[]),end])].filter(t=>t<=end).sort((a,b)=>a-b);
 for(const time of points){if(time>at){area+=held(at)*BigInt(time-at);at=time;}balance+=grouped.get(time)||0n;if(time===graduatedAt)graduationHeld=held(time);}
 let pointsValue=BigInt(weightedPledge??(BigInt(pledged)*BigInt(early?2:1)))*100n*area/(cap*86400000n*1000000000n);
 if(graduatedAt!=null&&Number.isFinite(graduatedAt)&&graduatedAt>=start&&graduatedAt<end&&graduationHeld>0n)pointsValue+=100n*graduationHeld/cap;
 return pointsValue;
}
export async function scoutSnapshot(db,rpc,epoch,now=Date.now()){
 requireThat(/^\d+$/.test(String(epoch))&&Number.isSafeInteger(Number(epoch)),'EPOCH','Invalid epoch');const start=Number(epoch)*WEEK,end=start+WEEK;requireThat(end<=now,'EPOCH_OPEN','Only completed UTC weeks can be distributed.',409);
 const program=PROGRAM.toBase58(),windows=await db.prepare("SELECT window,body,signature,slot FROM chain_events WHERE program_id=? AND kind='WindowCreated' ORDER BY window").bind(program).all();
 const totals=new Map(),evidence=[];
 for(const row of windows.results){const created=JSON.parse(row.body);if(Number(created.end)*1000>=end)continue;
  const settlement=(await db.prepare("SELECT body,slot,signature FROM chain_events WHERE program_id=? AND window=? AND kind='WindowSettled' ORDER BY slot LIMIT 1").bind(program,row.window).first());if(!settlement||JSON.parse(settlement.body).state!==1)continue;
  const coverage=await db.prepare('SELECT * FROM market_coverage WHERE program=? AND window=?').bind(program,row.window).first();requireThat(coverage?.status==='complete-finalized-account-history'&&JSON.parse(coverage.evidence).oldestCheck>=end,'HISTORY_INCOMPLETE','Every token account must be backfilled through the epoch end before rewards can be funded.',409);
  const settleTx=await db.prepare('SELECT block_time FROM indexed_transactions WHERE signature=?').bind(settlement.signature).first();requireThat(settleTx?.block_time,'HISTORY_INCOMPLETE','Settlement block time is missing.',409);
  const pledges=await db.prepare("SELECT e.body,t.block_time FROM chain_events e JOIN indexed_transactions t ON t.signature=e.signature WHERE e.program_id=? AND e.window=? AND e.kind='Pledged' ORDER BY e.slot,e.log_index").bind(program,row.window).all(),claims=await db.prepare("SELECT e.body,t.block_time FROM chain_events e JOIN indexed_transactions t ON t.signature=e.signature WHERE e.program_id=? AND e.window=? AND e.kind='Claimed'").bind(program,row.window).all();
  const windowState=await fetchWindow(rpc,row.window);const migration=await db.prepare("SELECT MIN(block_time) AS time FROM market_transactions WHERE program=? AND window=? AND classification='migration'").bind(program,row.window).first();
  const users=new Map();for(const p of pledges.results){const b=JSON.parse(p.body),u=users.get(b.wallet)||{pledged:0n,weightedPledge:0n};requireThat(p.block_time!=null,'HISTORY_INCOMPLETE','Pledge block time is missing.',409);const amount=BigInt(b.amount);u.pledged+=amount;u.weightedPledge+=amount*(p.block_time*1000<Number(created.end)*1000-420000?2n:1n);users.set(b.wallet,u);}
  const movements=await db.prepare('SELECT wallet,delta,block_time AS time FROM market_movements WHERE program=? AND window=? AND block_time<? ORDER BY block_time,wallet,delta').bind(program,row.window,end).all();
  for(const [wallet,u]of users){const claim=claims.results.find(c=>JSON.parse(c.body).wallet===wallet),allocation=u.pledged*windowState.windowTokens/windowState.pledged;
   const points=earnedPoints({pledged:u.pledged,allocation,weightedPledge:u.weightedPledge,settledAt:settleTx.block_time*1000,claimedAt:claim?claim.block_time*1000:null,movements:movements.results.filter(m=>m.wallet===wallet),start,end,graduatedAt:migration?.time??null});
   const v=totals.get(wallet)||{wallet,points:0n,windows:0};v.points+=points;v.windows++;totals.set(wallet,v);
  }evidence.push({window:row.window,settlement:settlement.signature,movements:movements.results});
 }
 const points=[...totals.values()].filter(r=>r.points>0n).sort((a,b)=>a.wallet.localeCompare(b.wallet)).map(r=>({...r,points:String(r.points)}));
 return {epoch:String(epoch),start,end,coverage:'complete-finalized-history',policy:'pledge-hold-v2',points,evidenceHash:await hash(JSON.stringify({epoch:String(epoch),points,evidence}))};
}
