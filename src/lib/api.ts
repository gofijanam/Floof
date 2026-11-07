export const requestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('')
const pending = new Map<string,string>()
export async function api<T=any>(path: string, data?: unknown, key?: string): Promise<T> {
 const headers: Record<string,string>={};
 const fingerprint = path + ':' + JSON.stringify(data)
 const existingKey = pending.get(fingerprint)
 const operationKey = key || existingKey || requestId()
 if(data!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=operationKey;pending.set(fingerprint,operationKey)}
 let response: Response;
 try { response=await fetch(`/api${path}`,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data),credentials:'same-origin',signal:AbortSignal.timeout(20000)}) }
 catch {const error = new Error('Connection lost. Retry this action to recover its saved result without submitting twice.'); (error as any).ambiguous = true; throw error}
 const result=await response.json();pending.delete(fingerprint);if(!response.ok)throw new Error(result.error?.message||`Request failed (${response.status})`);return result;
}
export async function uploadImage(dataUrl: string){const blob=await(await fetch(dataUrl)).blob();const response=await fetch('/api/uploads/image',{method:'POST',headers:{'Content-Type':blob.type},body:blob,credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Image upload failed');return data.uri as string}
