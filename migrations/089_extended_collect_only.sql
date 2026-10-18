-- D36: list 'extended' now means collect-only (collected and priced, not scored, shown or sent to a model).
-- The 7 seeded names (AAPL, ASML, MDB, META, NOW, ORCL, UBER) are live scored names, so they move to 'core'.
UPDATE universe_membership SET list = 'core' WHERE list = 'extended' AND added_by = 'seed';
