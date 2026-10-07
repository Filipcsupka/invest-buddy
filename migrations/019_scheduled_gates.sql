CREATE TABLE scheduled_gates (
  gate_date date PRIMARY KEY,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  symbols text[] NOT NULL DEFAULT '{}',
  reasons jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reasons) = 'object'),
  accessions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(accessions) = 'object'),
  detected_at timestamptz NOT NULL DEFAULT now(),
  extracted_at timestamptz,
  judged_at timestamptz
);
