CREATE TABLE IF NOT EXISTS market_transactions (
 program TEXT NOT NULL, window TEXT NOT NULL, signature TEXT NOT NULL,
 slot INTEGER NOT NULL, block_time INTEGER NOT NULL, classification TEXT NOT NULL,
 body TEXT NOT NULL, PRIMARY KEY(program,window,signature)
);
CREATE TABLE IF NOT EXISTS market_movements (
 program TEXT NOT NULL, window TEXT NOT NULL, signature TEXT NOT NULL,
 wallet TEXT NOT NULL, delta TEXT NOT NULL, slot INTEGER NOT NULL, block_time INTEGER NOT NULL,
 PRIMARY KEY(program,window,signature,wallet)
);
CREATE INDEX IF NOT EXISTS market_movements_wallet ON market_movements(program,window,wallet,block_time);
CREATE TABLE IF NOT EXISTS market_accounts (
 program TEXT NOT NULL, window TEXT NOT NULL, address TEXT NOT NULL,
 cursor TEXT, complete INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(program,window,address)
);
CREATE TABLE IF NOT EXISTS market_coverage (
 program TEXT NOT NULL, window TEXT NOT NULL, checked_at INTEGER NOT NULL,
 status TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(program,window)
);
