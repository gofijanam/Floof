import {useSyncExternalStore} from 'react'
import {Coin,Creator,setCreators} from './mock'
import {sfx} from './audio'
import {api,uploadImage} from './api'
export interface FeedItem {id:number;coin:string;ticker:string;wallet:string;amount:number;t:number;kind:'pledge'|'blocked'|'buy'|'sell';tokens?:number}
export interface Toast {id:number;ambient?:boolean;kind:'pledge'|'poof'|'info'|'success'|'blocked';title:string;body?:string;coin?:string}
interface State {now:number;coins:Coin[];feed:FeedItem[];toasts:Toast[];wallet:boolean;walletAddress:string;linkedWallet:string|null;connecting:boolean;myPledges:Record<string,number>;poof:string|null;ticks:number;positions:Record<string,{tokens:number;cost:number;costKnown?:boolean}>;claims:any[];tickets:any[];scouts:any[];creators:Creator[];following:string[];sol:number;stats:{launched:number;snipersBlocked:number;refunded:number;pledged24h:number};ready:boolean;error:string|null;mode:string}
let state:State={now:Date.now(),coins:[],feed:[],toasts:[],wallet:false,walletAddress:'',linkedWallet:null,connecting:false,myPledges:{},poof:null,ticks:0,positions:{},claims:[],tickets:[],scouts:[],creators:[],following:[],sol:0,stats:{launched:0,snipersBlocked:0,refunded:0,pledged24h:0},ready:false,error:null,mode:'sandbox'}
const subs=new Set<()=>void>();let tid=0;let disconnected=false;try{disconnected=sessionStorage.getItem('floof-disconnected')==='1'}catch{}
function set(p:Partial<State>){state={...state,...p};subs.forEach(f=>f())}
export const getState=()=>state
export function useStore<T>(sel:(s:State)=>T):T{return useSyncExternalStore(cb=>{subs.add(cb);return()=>{subs.delete(cb)}},()=>sel(state),()=>sel(state))}
export const useCoin=(id?:string)=>useStore(s=>s.coins.find(c=>c.id===id))
export const useNow=()=>useStore(s=>s.now)
export function toast(t:Omit<Toast,'id'>){const id=++tid;set({toasts:[...state.toasts.slice(-3),{...t,id}]});window.setTimeout(()=>dismissToast(id),4600)}
export const dismissToast=(id:number)=>set({toasts:state.toasts.filter(t=>t.id!==id)})
function ingest(data:any){
 const previous=state.coins;setCreators(data.creators||[]);
 const completed=previous.find(c=>['open','upcoming'].includes(c.status)&&data.coins?.some((n:Coin)=>n.id===c.id&&!['open','upcoming'].includes(n.status))&&data.myPledges?.[c.id]);
 set({...data,wallet:!disconnected&&data.wallet,ready:true,error:null,ticks:state.ticks+1,...(completed?{poof:completed.id}:{})});
}
let refreshInFlight:Promise<void>|null=null
export function refresh(){if(refreshInFlight)return refreshInFlight;refreshInFlight=api('/state').then(ingest).catch(e=>{set({error:e.message});throw e}).finally(()=>{refreshInFlight=null});return refreshInFlight}
async function action(path:string,data:unknown){const result=await api(path,data);if(result.state)ingest(result.state);return result}
export async function connectWallet(){if(state.connecting)return;const devnet=state.mode==='devnet';set({connecting:true});try{disconnected=false;try{sessionStorage.removeItem('floof-disconnected')}catch{}if(devnet){await api('/session',{});await linkWallet();return}await action('/session',{});sfx.chime();toast({kind:'success',title:'Sandbox wallet opened',body:'100 test SOL on first use. No on-chain funds are moved.'})}catch(e){toast({kind:'info',title:'Could not open wallet',body:(e as Error).message})}finally{set({connecting:false})}}
export function disconnectWallet(){disconnected=true;try{sessionStorage.setItem('floof-disconnected','1')}catch{}set({wallet:false,positions:{},claims:[],tickets:[],myPledges:{}})}
export async function linkWallet(){try{
 const provider=(window as any).phantom?.solana||(window as any).solana;
 if(!provider?.connect||!provider?.signMessage)throw new Error('Open this page in a browser with Phantom installed to link your Solana wallet.');
 const connected=await provider.connect(),wallet=connected.publicKey.toString(),challenge=await api('/wallet/challenge',{wallet}),signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
 const signature=btoa(String.fromCharCode(...signed.signature));await api('/wallet/verify',{id:challenge.id,signature});await refresh();toast({kind:'success',title:'Wallet ownership verified',body:'Your real wallet is linked. Sandbox balances remain separate.'});
 }catch(e){toast({kind:'info',title:'Wallet link not completed',body:(e as Error).message})}}
const pendingPledges = new Map<string,any>()
export async function pledge(coin:string,amount:number){
 if(state.mode==='devnet')return chainAction('pledge',{window:coin,amount:String(Math.round(amount*1e9))})
 const key = `${coin}:${amount}`
 let payload = pendingPledges.get(key)
 if (!payload) { const att = await api('/pledge/attest',{coin}); payload={coin,amount,attestation:att.id}; pendingPledges.set(key,payload) }
 try { const r=await action('/pledges',payload);pendingPledges.delete(key);sfx.pop(1.2);return r }
 catch(e) { if(!(e as any).ambiguous)pendingPledges.delete(key);throw e }
}
export async function jumpToZero(coin:string,_ms=5000){try{const r=await action('/sandbox/advance',{coin});toast({kind:'info',title:r.started?'Window opened for ten minutes':'Window closes in 5 seconds',body:'Sandbox control only.'});return r}catch(e){toast({kind:'info',title:'Could not advance window',body:(e as Error).message})}}
export const closePoof=()=>set({poof:null})
export const showPoof=(id:string)=>set({poof:id})
let started=false
export function startSim(){if(started)return;started=true;refresh().catch(()=>{});setInterval(()=>set({now:Date.now()}),1000);setInterval(()=>{if(document.visibilityState==='visible'){refresh().catch(()=>{});if(state.mode==='devnet')import('./chain').then(m=>Promise.all(m.pendingDevnet().map(p=>m.confirmDevnet(p).catch(()=>{})))).catch(()=>{})}},4000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh().catch(()=>{})})}
export async function trade(quoteId:string){if(state.mode==='devnet'){if(!state.linkedWallet)throw new Error('Link Phantom first.');const m=await import('./chain'),result=await m.executePrepared(quoteId,state.linkedWallet);if(result.pending)throw new Error('Trade submitted; waiting for finalization. Do not resubmit.');await refresh();return result}return action('/trades',{quoteId})}
export async function claim(id:string){if(state.mode==='devnet'){const [kind,window]=id.split(':');return chainAction(kind==='window'?'claim':kind==='vesting'?'vested':kind,kind==='scout'?{epoch:window}:{window})}const r=await action('/claims',{id});sfx.chime();return r}
export async function addCoin(form:any){const payload={...form,image:form.image?(form.image.startsWith('/api/images/')?form.image:await uploadImage(form.image)):null};if(state.mode==='devnet'){const params=await api('/chain/launch-settings',payload),result=await chainAction('create',{params});return {...result,coin:result.window}}await api('/coins/prepare',payload);return action('/coins',payload)}
export async function followCreator(handle:string){try{const r=await action('/creators/follow',{handle});toast({kind:'success',title:r.following?`Following @${handle}`:`Unfollowed @${handle}`,body:'Your list is saved to your account.'})}catch(e){toast({kind:'info',title:'Could not save follow',body:(e as Error).message})}}

export async function fillTestWindow(coin:string){try{const r=await action('/sandbox/scenario',{coin,scenario:'success'});toast({kind:'info',title:`Added ${r.testParticipantsAdded} test participants`,body:r.notice});return r}catch(e){toast({kind:'info',title:'Could not add participants',body:(e as Error).message})}}

async function chainAction(action:string,params:Record<string,unknown>){if(!state.linkedWallet)throw new Error('Link your Phantom wallet first.');const {executeDevnet}=await import('./chain');const result=await executeDevnet(action,params,state.linkedWallet);if(result.pending)throw new Error('Transaction submitted. Wait for finalization; do not submit it again.');await refresh();return result}
