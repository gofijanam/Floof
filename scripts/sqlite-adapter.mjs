import {DatabaseSync} from 'node:sqlite';
export function sqliteDB(path=':memory:'){
 const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode = WAL');
 return {raw:db,prepare(sql){return {args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args)||null},async all(){return {results:db.prepare(sql).all(...this.args)}},async run(){const r=db.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(r.changes)}}}}},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const result=[];for(const st of statements)result.push(await st.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}};
}
