ALTER TABLE score_results ADD COLUMN inputs_fingerprint text;
ALTER TABLE alerts ADD COLUMN active boolean NOT NULL DEFAULT true;
