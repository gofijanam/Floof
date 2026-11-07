CREATE TABLE floof_state (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE wallet_challenges (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, wallet TEXT NOT NULL, message TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE indexed_transactions (signature TEXT PRIMARY KEY NOT NULL, slot INTEGER NOT NULL, block_time INTEGER, program_id TEXT NOT NULL, body TEXT NOT NULL, indexed_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_indexed_slot ON indexed_transactions(slot);
--> statement-breakpoint
CREATE TABLE service_events (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
