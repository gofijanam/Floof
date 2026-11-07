import {base58decode,hex} from './crypto.mjs';
import {requireThat} from './errors.mjs';
const text=s=>new TextEncoder().encode(s),bytes=h=>Uint8Array.from(h.match(/../g)||[],b=>parseInt(b,16));
const sha=async(...parts)=>{const data=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){data.set(p,o);o+=p.length}return hex(await crypto.subtle.digest('SHA-256',data))};
function u64(v){requireThat(/^(0|[1-9]\d*)$/.test(String(v)),'AMOUNT','Use unsigned integer amounts.');const n=BigInt(v);requireThat(n<=0xffffffffffffffffn,'AMOUNT','Amount exceeds u64.');const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,n,true);return b}
function address(v){const b=base58decode(v);requireThat(b.length===32,'WALLET','Invalid Solana public key.');return b}
export const scoutLeaf=(program,epoch,wallet,amount)=>sha(text('floof-scout-v2'),address(program),u64(epoch),address(wallet),u64(amount));
const parent=(a,b)=>sha(text('floof-scout-node-v2'),...([a,b].sort().map(bytes)));
export async function scoutTree(program,epoch,leaves){
 requireThat(Array.isArray(leaves)&&leaves.length>0&&leaves.length<=10000,'LEAVES','Use 1–10,000 reward recipients.');
 const wallets=new Set();let budget=0n;
 for(const l of leaves){requireThat(!wallets.has(l.wallet),'DUPLICATE','A wallet may appear only once per epoch.');wallets.add(l.wallet);u64(l.amount);requireThat(BigInt(l.amount)>0n,'AMOUNT','Rewards must be positive.');budget+=BigInt(l.amount)}u64(budget);
 let level=await Promise.all(leaves.map(l=>scoutLeaf(program,epoch,l.wallet,l.amount)));const tree=[level];
 while(level.length>1){level=await Promise.all(Array.from({length:Math.ceil(level.length/2)},(_,i)=>parent(level[2*i],level[2*i+1]||level[2*i])));tree.push(level)}
 return {version:2,program,epoch:String(epoch),root:level[0],budgetLamports:String(budget),leaves:leaves.map((l,i)=>{let j=i;const proof=[];for(const layer of tree.slice(0,-1)){proof.push(layer[j^1]||layer[j]);j=Math.floor(j/2)}return {wallet:l.wallet,amount:String(l.amount),proof}})};
}
export async function verifyScoutProof(root,program,epoch,wallet,amount,proof){if(!/^[a-f0-9]{64}$/.test(root)||!Array.isArray(proof)||proof.length>32||proof.some(p=>!/^[a-f0-9]{64}$/.test(p)))return false;let node=await scoutLeaf(program,epoch,wallet,amount);for(const p of proof)node=await parent(node,p);return node===root}
