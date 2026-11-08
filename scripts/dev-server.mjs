import http from 'node:http';
import {Keypair,PublicKey,Transaction} from '@solana/web3.js';import {createPrivateKey,sign} from 'node:crypto';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {sqliteDB} from './sqlite-adapter.mjs';
await mkdir('.preview',{recursive:true});
let qa=null;try{qa=JSON.parse(await readFile('.preview/devnet-preview.json','utf8'));}catch{}
const qaKey=qa?.enabled?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile('.preview/user-0.json','utf8')))):null;
if(qaKey)await writeFile('.preview/qa-wallet.ts',`import {PublicKey,Transaction} from '@solana/web3.js';import {Buffer} from 'buffer';const call=async(kind,value)=>{const r=await fetch('/__qa_wallet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,value})});if(!r.ok)throw Error('QA signer rejected request');return r.json()};window.phantom={solana:{isPhantom:true,publicKey:new PublicKey('${qaKey.publicKey.toBase58()}'),connect:async()=>({publicKey:new PublicKey('${qaKey.publicKey.toBase58()}')}),signMessage:async(bytes)=>({signature:Uint8Array.from(atob((await call('message',new TextDecoder().decode(bytes))).signature),c=>c.charCodeAt(0))}),signTransaction:async(tx)=>Transaction.from(Buffer.from((await call('transaction',tx.serialize({requireAllSignatures:false}).toString('base64'))).transaction,'base64'))}};`);

const db=sqliteDB('.preview/floof.sqlite');
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())db.raw.exec(await readFile('drizzle/'+file,'utf8'));
await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'node',packages:'external',target:'node24',outfile:'.preview/worker.mjs'});
const worker=(await import('../.preview/worker.mjs?'+Date.now())).default;
const bucket={async put(key,data,options){const file='.preview/'+key;await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});await writeFile(file,data);await writeFile(file+'.json',JSON.stringify(options))},async get(key){try{const body=await readFile('.preview/'+key),meta=JSON.parse(await readFile('.preview/'+key+'.json','utf8'));return {body,writeHttpMetadata(headers){headers.set('Content-Type',meta.httpMetadata.contentType)}}}catch{return null}}};
const vite=await createServer({plugins:qaKey?[{name:'private-devnet-qa',transformIndexHtml(html){return html.replace('</head>','<script type="module" src="/.preview/qa-wallet.ts"></script></head>')}}]:[],server:{middlewareMode:true,allowedHosts:true},appType:'spa'});
const portIndex=process.argv.indexOf('--port');
const port=Number(portIndex>=0?process.argv[portIndex+1]:process.env.PORT||5173),env={DB:db,BUCKET:bucket,...(qaKey?{CHAIN_EXECUTION:'devnet',FLOOF_PROGRAM_ID:'7hhrC7N6FRQyQLUbr4q9q5Dgqgj8zoDtDCiCd8m1XX3N',SOLANA_DEVNET_RPC_URL:qa.rpc||'https://api.devnet.solana.com',ATTESTOR_PKCS8_BASE64:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(JSON.parse(await readFile('.preview/attestor.json','utf8')).slice(0,32))]).toString('base64')}:{} )};
http.createServer(async(req,res)=>{
 if(qaKey&&req.url==='/__qa_wallet'&&req.method==='POST'){
 try{const chunks=[];for await(const c of req)chunks.push(c);const b=JSON.parse(Buffer.concat(chunks));let result;if(b.kind==='message'){if(!b.value.startsWith('Floof wallet link\n'))throw Error('Invalid login');const priv=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(qaKey.secretKey.slice(0,32))]),format:'der',type:'pkcs8'});result={signature:sign(null,Buffer.from(b.value),priv).toString('base64')};}else{const tx=Transaction.from(Buffer.from(b.value,'base64'));if(!tx.feePayer.equals(qaKey.publicKey))throw Error('Unexpected payer');tx.partialSign(qaKey);result={transaction:tx.serialize().toString('base64')};}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch{res.writeHead(400);res.end();}return;
 }
 if(req.url.startsWith('/api/')){
  try{const h=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)h.set(k,Array.isArray(v)?v.join(','):v);
  // Preview is a single-user local test harness, never included in the hosted Worker.
  h.set('oai-authenticated-user-id','local-preview');const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?Buffer.concat(chunks):undefined;
  const protocol=h.get('x-forwarded-proto')||'http';const request=new Request(`${protocol}://${req.headers.host}${req.url}`,{method:req.method,headers:h,...(body?{body,duplex:'half'}:{})});
  const response=await worker.fetch(request,env,{waitUntil(p){p.catch(console.error)}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Preview error')}
 }else vite.middlewares(req,res);
}).listen(port,'0.0.0.0',()=>console.log(`Floof preview ready on port ${port}`));
