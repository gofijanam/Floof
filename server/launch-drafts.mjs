import {requireThat} from './errors.mjs';
const limits={name:32,ticker:10,desc:160,x:256,tg:256,web:256,ceiling:32,minTarget:32,image:160};
const numeric=['startIn','alloc','bond','creatorPct','vest'];
export function sanitizeDraft(input){
 requireThat(input&&typeof input==='object'&&!Array.isArray(input),'DRAFT','Invalid launch draft.');const form={};
 for(const [key,max] of Object.entries(limits)){const v=input[key];if(v===undefined)continue;if(key==='image'&&v===null){form.image=null;continue}requireThat(typeof v==='string'&&v.length<=max,'DRAFT',`Invalid ${key} in draft.`);if(key==='image')requireThat(/^\/api\/images\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(v),'IMAGE','Upload your image before saving the draft.');form[key]=v}
 for(const key of numeric){if(input[key]===undefined)continue;requireThat(typeof input[key]==='number'&&Number.isFinite(input[key]),'DRAFT',`Invalid ${key} in draft.`);form[key]=input[key]}
 for(const key of ['walletAge','balHistory'])if(input[key]!==undefined){requireThat(typeof input[key]==='boolean','DRAFT',`Invalid ${key} in draft.`);form[key]=input[key]}
 return form;
}
export async function readDraft(db,id){const row=await db.prepare('SELECT revision,body,updated_at FROM launch_drafts WHERE owner_id=?').bind(id).first();return {revision:row?.revision||0,form:row?.body?JSON.parse(row.body):null,updatedAt:row?.updated_at||null}}
export async function saveDraft(db,id,b,now){
 requireThat(Number.isSafeInteger(b.revision)&&b.revision>=0,'DRAFT','Invalid draft revision.');const body=b.form===null?null:JSON.stringify(sanitizeDraft(b.form));
 const current=await readDraft(db,id);
 // Recover a successful write after a lost response; stale divergent writes never replace it.
 if(current.revision===b.revision+1&&JSON.stringify(current.form)===(body||'null'))return current;
 requireThat(current.revision===b.revision,'DRAFT_CONFLICT','This draft changed in another tab. Reload before saving.',409);
 const r=b.revision===0?await db.prepare('INSERT OR IGNORE INTO launch_drafts (owner_id,revision,body,updated_at) VALUES (?,1,?,?)').bind(id,body,now).run():await db.prepare('UPDATE launch_drafts SET revision=revision+1,body=?,updated_at=? WHERE owner_id=? AND revision=?').bind(body,now,id,b.revision).run();
 requireThat(r.meta.changes===1,'DRAFT_CONFLICT','This draft changed in another tab. Reload before saving.',409);return {revision:b.revision+1,form:body?JSON.parse(body):null,updatedAt:now};
}
