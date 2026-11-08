import http from 'node:http';
import {readFile,readdir,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {sqliteDB} from './sqlite-adapter.mjs';
import {walletAuth} from '../server/railway-auth.mjs';
import worker from '../dist/server/index.js';
const origin=process.env.APP_ORIGIN;
if(!origin||new URL(origin).origin!==origin)throw Error('APP_ORIGIN must be an exact origin');
if(new URL(origin).protocol!=='https:'&&process.env.NODE_ENV!=='test')throw Error('HTTPS APP_ORIGIN required');
const data=path.resolve(process.env.DATA_DIR||'/data');await mkdir(data,{recursive:true});
const db=sqliteDB(path.join(data,'floof.sqlite'));db.raw.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY)');
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())if(!db.raw.prepare('SELECT name FROM schema_migrations WHERE name=?').get(file)){
 db.raw.exec('BEGIN IMMEDIATE');try{db.raw.exec(await readFile('drizzle/'+file,'utf8'));db.raw.prepare('INSERT INTO schema_migrations VALUES(?)').run(file);db.raw.exec('COMMIT')}catch(e){db.raw.exec('ROLLBACK');throw e}
}
const auth=walletAuth(db.raw,origin),objects=path.join(data,'objects');await mkdir(objects,{recursive:true});
function objectPath(key){if(!/^(images|metadata)\/[a-f0-9]{64}\.(png|jpg|gif|webp|json)$/.test(key))throw Error('Invalid object key');return path.join(objects,key)}
const bucket={async put(key,body,options){const dest=objectPath(key);await mkdir(path.dirname(dest),{recursive:true});const tmp=dest+'.'+crypto.randomUUID();await writeFile(tmp,body);await rename(tmp,dest);await writeFile(dest+'.meta',JSON.stringify(options||{}));},async get(key){try{const dest=objectPath(key),body=await readFile(dest),meta=JSON.parse(await readFile(dest+'.meta','utf8'));return {body,writeHttpMetadata(h){h.set('Content-Type',meta.httpMetadata?.contentType||'application/octet-stream')}}}catch(e){if(e.code==='ENOENT')return null;throw e}}};
const env={...process.env,DB:db,BUCKET:bucket,STORAGE_NAME:'SQLite persistent volume',AUTH_MODE:'wallet'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon','.json':'application/json'};
const client=path.resolve('dist/client');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);if(url.origin!==origin){res.writeHead(400);res.end();return;}
 if(url.pathname.startsWith('/api/')){
  const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v&&!['oai-authenticated-user-id','oai-sites-authorization','host'].includes(k))headers.set(k,Array.isArray(v)?v.join(','):v);
  let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>4*1024*1024+1024){res.writeHead(413);res.end();return;}chunks.push(c)}
  const body=chunks.length?Buffer.concat(chunks):undefined;
  let request=new Request(url,{method:req.method,headers,...(body?{body}:{} )});
  let response;
  if(url.pathname.startsWith('/api/auth/'))response=await auth.route(request);
  else {const wallet=auth.identity(request);if(wallet)headers.set('oai-authenticated-user-id','wallet:'+wallet);request=new Request(url,{method:req.method,headers,...(body?{body}:{} )});response=await worker.fetch(request,{...env,AUTH_WALLET:wallet},{waitUntil(p){p.catch(()=>console.error('Background operation failed'))}});}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 let file=path.resolve(client,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(client+path.sep)&&file!==client){res.writeHead(404);res.end();return;}
 try{if(!(await stat(file)).isFile())file=path.join(client,'index.html')}catch{if(path.extname(url.pathname)){res.writeHead(404);res.end();return;}file=path.join(client,'index.html')}
 const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':file.includes('/assets/')?'public,max-age=31536000,immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
}catch(e){console.error(JSON.stringify({error:e.code||e.name}));if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":{"message":"Service unavailable"}}');}});
server.requestTimeout=30000;server.headersTimeout=15000;server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Floof web ready'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{db.raw.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()});
