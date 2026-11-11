// Rebuilds src/mocks/quotes.snapshot.json, the offline mock behind GET /api/quotes.
// Sources (public, read-only): LaunchLab mainnet GlobalConfigs (research JSON), StonkFun's
// public pair list for names/groups/token program, Jupiter lite-api for icons and USD prices.
// Usage: node scripts/snapshot-quotes.mjs <launchlab-mainnet-configs.json>
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const [cfgPath='../floof-codex/research/launchlab-mainnet-configs.json']=process.argv.slice(2);
const configs=JSON.parse(await readFile(cfgPath,'utf8'));
const j=async u=>{for(let i=0;i<6;i++){const r=await fetch(u);if(r.ok){await new Promise(s=>setTimeout(s,1100));return r.json()}console.error(r.status,u.slice(0,60));await new Promise(s=>setTimeout(s,3000*(i+1)))}throw Error('fetch failed '+u)};
const pairs=(await j('https://stonkfun.xyz/api/public/v1/pairs')).data.pairs;
const T22='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const GROUP={solana:'solana',xstock:'stocks',prestock:'stocks',tessera:'stocks',backpack:'stocks',currency:'currencies',leverage:'leverage',basket:'baskets',collectible:'collectibles',custom:'custom'};
const byMint=new Map(configs.map(c=>[c.mintB,c]));
const meta=new Map(pairs.map(p=>[p.mint,p]));
const mints=[...new Set([...pairs.map(p=>p.mint),...configs.map(c=>c.mintB)])];
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
const prices={},tokens={};
for(const c of chunks(mints,50)){Object.assign(prices,await j('https://lite-api.jup.ag/price/v3?ids='+c.join(',')))}
for(const c of chunks(mints,100)){for(const t of await j('https://lite-api.jup.ag/tokens/v2/search?query='+c.join(',')))tokens[t.id]=t}
const out=[];
for(const mint of mints){
  const p=meta.get(mint),t=tokens[mint],c=byMint.get(mint);
  if(!p&&!t)continue; // configured mint with no public metadata at all: reachable only via paste
  const decimals=p?.decimals??t?.decimals;if(decimals==null)continue;
  out.push({mint,symbol:(p?.symbol??t.symbol??'').trim(),name:(p?.name??t.name??'').trim(),logo:t?.icon??null,decimals,
    group:p?GROUP[p.category]??'custom':'custom',token2022:(p?.tokenProgram??t?.tokenProgram)===T22,
    configId:c?.id??null,minMigration:c?.minFundRaisingB??null,priceUsd:prices[mint]?.usdPrice??null});
}
const ORDER=['solana','currencies','stocks','leverage','baskets','collectibles','custom'];
out.sort((a,b)=>ORDER.indexOf(a.group)-ORDER.indexOf(b.group)||(b.configId?1:0)-(a.configId?1:0));
await mkdir('src/mocks',{recursive:true});
await writeFile('src/mocks/quotes.snapshot.json',JSON.stringify({observedAt:new Date().toISOString(),source:'LaunchLab mainnet configs + stonkfun pair metadata + Jupiter price/v3',quotes:out}));
console.log(out.length,'quotes',out.filter(q=>q.configId).length,'with config',out.filter(q=>q.priceUsd==null).length,'without price');
