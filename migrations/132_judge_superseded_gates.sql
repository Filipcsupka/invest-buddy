-- With stored EODHD facts the judge reads the newest pending gate. Older pending gates are closed without a model call and record the gate that replaced them.
ALTER TABLE scheduled_gates ADD COLUMN judge_superseded_by date;
