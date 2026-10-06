-- While someone has a server's Settings page open (the page polls its config), that server syncs every 5 s
-- instead of 15 s, so a saved change reaches it within seconds. Epoch ms; 0 = not open.
ALTER TABLE installs ADD COLUMN hot_until INTEGER NOT NULL DEFAULT 0;
