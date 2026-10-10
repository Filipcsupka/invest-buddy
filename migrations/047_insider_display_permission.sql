-- SK1: keep display permission with each structured SEC transaction.
ALTER TABLE insider_transactions
  ADD COLUMN display_allowed boolean NOT NULL DEFAULT true;

CREATE INDEX insider_transactions_recent_display_idx
  ON insider_transactions(transaction_date DESC, filed_at DESC)
  WHERE display_allowed;
