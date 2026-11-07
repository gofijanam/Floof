CREATE TABLE IF NOT EXISTS launch_drafts (
  owner_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  body TEXT,
  updated_at INTEGER NOT NULL
);
