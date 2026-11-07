import {api} from './api'
import {Buffer} from 'buffer'
import {Transaction} from '@solana/web3.js'
export interface PreparedChainTransaction {id:string;action:string;transaction:string;expiresAt:number;network:'devnet';window?:string;mint?:string;lastValidBlockHeight:number}
interface Pending {id:string;signature:string;wallet:string;createdAt:number;operation?:string}
const storageKey='floof-devnet-pending-v1'
export function pendingDevnet():Pending[]{try{return JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{return []}}
function save(p:Pending[]){localStorage.setItem(storageKey,JSON.stringify(p))}
export async function confirmDevnet(p:Pending){const result=await api('/chain/confirm',{id:p.id,signature:p.signature});save(pendingDevnet().filter(r=>r.id!==p.id));return result}
// A signed submission is retained until finalized; retrying confirmation never repeats a transfer.
export async function executeDevnet(action:string,params:Record<string,unknown>,expectedWallet:string){
 const provider=(window as any).phantom?.solana||(window as any).solana
 if(!provider?.signAndSendTransaction)throw new Error('A Solana wallet with transaction signing is required.')
 const connected=await provider.connect(),wallet=connected.publicKey.toString()
 if(wallet!==expectedWallet)throw new Error('The connected wallet differs from the verified Floof wallet.')
 if(pendingDevnet().some(p=>p.wallet===wallet))throw new Error('A transaction is awaiting finalization. It will be confirmed automatically; do not submit it again.');
 const prepared=await api<PreparedChainTransaction>('/chain/prepare',{action,...params})
 return submitPrepared(prepared,expectedWallet,provider,wallet)
}
export async function executePrepared(id:string,expectedWallet:string){const provider=(window as any).phantom?.solana||(window as any).solana;if(!provider?.signAndSendTransaction)throw new Error('Connect Phantom first.');const wallet=(await provider.connect()).publicKey.toString();if(wallet!==expectedWallet)throw new Error('Switch to your verified wallet.');if(pendingDevnet().some(p=>p.wallet===wallet))throw new Error('A transaction is awaiting finalization.');const prepared=await api<PreparedChainTransaction>(`/chain/prepared/${id}`);return submitPrepared(prepared,expectedWallet,provider,wallet)}
async function submitPrepared(prepared:PreparedChainTransaction,_expectedWallet:string,provider:any,wallet:string){
 if(prepared.network!=='devnet'||prepared.expiresAt<=Date.now())throw new Error('The Devnet transaction has expired. Prepare it again.')
 const transaction=Transaction.from(Buffer.from(prepared.transaction,'base64'))
 if(transaction.feePayer?.toBase58()!==wallet)throw new Error('Transaction payer does not match your wallet.')
 const {signature}=await provider.signAndSendTransaction(transaction,{preflightCommitment:'confirmed'})
 const pending={id:prepared.id,signature,wallet,createdAt:Date.now()};save([...pendingDevnet().filter(r=>r.id!==prepared.id),pending])
 try{return await confirmDevnet(pending)}catch{return {pending:true,...pending,window:prepared.window,mint:prepared.mint}}
}
