import http from 'node:http';
import {createServer} from 'vite';
import {build} from 'esbuild';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {sqliteDB} from './sqlite-adapter.mjs';
await mkdir('.local',{recursive:true});
const db=sqliteDB('.local/floof.sqlite');
for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())db.raw.exec(await readFile('drizzle/'+file,'utf8'));
await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'node',packages:'external',target:'node24',outfile:'.local/worker.mjs'});
const worker=(await import('../.local/worker.mjs?'+Date.now())).default;
const bucket={async put(key,data,options){const file='.local/'+key;await mkdir('.local/images',{recursive:true});await writeFile(file,data);await writeFile(file+'.json',JSON.stringify(options))},async get(key){try{const body=await readFile('.local/'+key),meta=JSON.parse(await readFile('.local/'+key+'.json','utf8'));return {body,writeHttpMetadata(headers){headers.set('Content-Type',meta.httpMetadata.contentType)}}}catch{return null}}};
const vite=await createServer({server:{middlewareMode:true,allowedHosts:true},appType:'spa'});
const portIndex=process.argv.indexOf('--port');
const port=Number(portIndex>=0?process.argv[portIndex+1]:process.env.PORT||5173),env={DB:db,BUCKET:bucket};
http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){
  try{const h=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)h.set(k,Array.isArray(v)?v.join(','):v);
  // Preview is a single-user local test harness, never included in the hosted Worker.
  h.set('oai-authenticated-user-id','local-preview');const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?Buffer.concat(chunks):undefined;
  const protocol=h.get('x-forwarded-proto')||'http';const request=new Request(`${protocol}://${req.headers.host}${req.url}`,{method:req.method,headers:h,...(body?{body,duplex:'half'}:{})});
  const response=await worker.fetch(request,env,{waitUntil(p){p.catch(console.error)}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){console.error(error);res.writeHead(500);res.end('Preview error')}
 }else vite.middlewares(req,res);
}).listen(port,'0.0.0.0',()=>console.log(`Floof preview ready on port ${port}`));
