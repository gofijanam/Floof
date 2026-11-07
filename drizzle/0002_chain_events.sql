CREATE TABLE IF NOT EXISTS chain_events (
 signature TEXT NOT NULL,
 log_index INTEGER NOT NULL,
 slot INTEGER NOT NULL,
 program_id TEXT NOT NULL,
 window TEXT NOT NULL,
 kind TEXT NOT NULL,
 body TEXT NOT NULL,
 indexed_at INTEGER NOT NULL,
 PRIMARY KEY (signature,log_index)
);
CREATE INDEX IF NOT EXISTS chain_events_window ON chain_events(program_id,window,slot);
