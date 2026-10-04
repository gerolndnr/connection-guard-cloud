-- Time-limited access rules ("let this player in for an hour"). NULL: permanent. The plugin enforces the expiry;
-- the dashboard hides expired rules and the daily cleanup removes them.
ALTER TABLE access_rules ADD COLUMN expires_at INTEGER;
