import {AppError} from './errors.mjs';
export class Repository {
  constructor(db, seed) {this.db=db;this.seed=seed}
  async read(){
    let row=await this.db.prepare('SELECT revision,body FROM floof_state WHERE id=?').bind('sandbox').first();
    if(!row){await this.db.prepare('INSERT OR IGNORE INTO floof_state (id,revision,body,updated_at) VALUES (?,0,?,?)').bind('sandbox',JSON.stringify(this.seed()),Date.now()).run();row=await this.db.prepare('SELECT revision,body FROM floof_state WHERE id=?').bind('sandbox').first()}
    return {revision:row.revision,state:JSON.parse(row.body)};
  }
  async change(fn){
    for(let attempt=0;attempt<12;attempt++){
      const {revision,state}=await this.read();const result=await fn(state);
      if(result?.unchanged)return result.value;
      const body=JSON.stringify(state);
      if(body.length>12_000_000)throw new AppError(503,'CAPACITY','This development environment has reached its record limit. Export it before continuing.');
      const r=await this.db.prepare('UPDATE floof_state SET body=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(body,Date.now(),'sandbox',revision).run();
      if(r.meta?.changes===1)return result;
    }
    throw new AppError(409,'BUSY','Another action is updating this market. Retry using the same request ID.');
  }
}
