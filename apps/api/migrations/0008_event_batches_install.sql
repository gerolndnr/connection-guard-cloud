-- event_batches is looked up by server: the activation check on every sync with decisions ("first decisions from this
-- server?") and deleting a server's batches. Without an index both scanned the whole table; on 22 Oct 2026 the
-- activation check alone read 3.5 of 3.8 million rows, 76 % of D1's free daily row reads.
CREATE INDEX event_batches_install ON event_batches(install_id);
