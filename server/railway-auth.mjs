import {randomBytes,createHash} from 'node:crypto';
import {verifyWallet,base58decode} from './crypto.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const COOKIE='floof_session';
export function walletAuth(db,origin){
 const secure=new URL(origin).protocol==='https:';
 db.exec(`CREATE TABLE IF NOT EXISTS web_auth_challenges(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,wallet TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const cookie=(token,age)=>`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
 const token=req=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return {
  identity(req){const value=token(req);if(!value||!/^[a-f0-9]{64}$/.test(value))return null;return db.prepare('SELECT wallet FROM web_sessions WHERE token_hash=? AND expires>?').get(digest(value),Date.now())?.wallet||null;},
  async route(req){
   const path=new URL(req.url).pathname;
   const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
   if(path==='/api/auth/config'&&req.method==='GET')return json({mode:'wallet'});
   if(!['/api/auth/challenge','/api/auth/verify','/api/auth/logout'].includes(path))return json({error:{message:'Not found'}},404);
   if(req.method!=='POST')return json({error:{message:'POST required'}},405);
   if(req.headers.get('origin')!==origin||req.headers.get('sec-fetch-site')==='cross-site')return json({error:{message:'Same-origin request required'}},403);
   const now=Date.now();db.prepare('DELETE FROM web_auth_challenges WHERE expires<?').run(now);db.prepare('DELETE FROM web_sessions WHERE expires<?').run(now);
   if(path==='/api/auth/logout'){const value=token(req);if(value)db.prepare('DELETE FROM web_sessions WHERE token_hash=?').run(digest(value));return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
   let b;try{b=await req.json()}catch{return json({error:{message:'Invalid JSON'}},400)}
   if(path==='/api/auth/challenge'){
    try{if(typeof b.wallet!=='string'||base58decode(b.wallet).length!==32)throw Error()}catch{return json({error:{message:'Invalid Solana wallet'}},400)}
    // Bound active challenges independently of client-supplied IP headers.
    if(db.prepare('SELECT count(*) AS n FROM web_auth_challenges').get().n>=2000)return json({error:{message:'Please retry later'}},429);
    const id=randomBytes(32).toString('hex'),expires=now+300000,message=`Floof wallet login\nOrigin: ${origin}\nWallet: ${b.wallet}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis signs a login message only. It does not authorize a transfer.`;
    db.prepare('INSERT INTO web_auth_challenges VALUES(?,?,?,?)').run(id,b.wallet,message,expires);return json({id,message});
   }
   const c=typeof b.id==='string'?db.prepare('SELECT * FROM web_auth_challenges WHERE id=? AND expires>?').get(b.id,now):null;
   let valid=false;try{valid=c&&typeof b.signature==='string'&&b.signature.length<200&&await verifyWallet(c.wallet,c.message,b.signature)}catch{}
   if(!valid)return json({error:{message:'Invalid or expired wallet signature'}},401);
   // Atomic consumption prevents concurrent signature replay.
   if(db.prepare('DELETE FROM web_auth_challenges WHERE id=?').run(c.id).changes!==1)return json({error:{message:'Challenge already used'}},409);
   const value=randomBytes(32).toString('hex');db.prepare('INSERT INTO web_sessions VALUES(?,?,?)').run(digest(value),c.wallet,now+7*86400000);
   return json({wallet:c.wallet},200,{'Set-Cookie':cookie(value,7*86400)});
  }
 };
}
