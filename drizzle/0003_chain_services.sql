CREATE TABLE IF NOT EXISTS sybil_signals (
 program TEXT NOT NULL, window TEXT NOT NULL, signal TEXT NOT NULL, cluster TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(program,window,signal)
);
CREATE TABLE IF NOT EXISTS wallet_evidence (
 program TEXT NOT NULL, wallet TEXT NOT NULL, evidence TEXT NOT NULL, observed_at INTEGER NOT NULL,
 PRIMARY KEY(program,wallet)
);
CREATE TABLE IF NOT EXISTS chain_requests (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, wallet TEXT NOT NULL, program TEXT NOT NULL, kind TEXT NOT NULL,
 message_hash TEXT NOT NULL, transaction_json TEXT NOT NULL, expires_at INTEGER NOT NULL, signature TEXT UNIQUE,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_requests_owner ON chain_requests(owner_id,created_at);
CREATE TABLE IF NOT EXISTS chain_distributions (
 program TEXT NOT NULL, epoch TEXT NOT NULL, manifest TEXT NOT NULL, funding_signature TEXT NOT NULL,
 PRIMARY KEY(program,epoch)
);
CREATE TABLE IF NOT EXISTS chain_jobs (
 program TEXT NOT NULL, name TEXT NOT NULL, cursor TEXT, updated_at INTEGER NOT NULL,
 PRIMARY KEY(program,name)
);
CREATE TABLE IF NOT EXISTS chain_trades (
 signature TEXT PRIMARY KEY, program TEXT NOT NULL, window TEXT NOT NULL, wallet TEXT NOT NULL,
 side TEXT NOT NULL, tokens TEXT NOT NULL, lamports TEXT NOT NULL, slot INTEGER NOT NULL, block_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_trades_window ON chain_trades(program,window,block_time);
