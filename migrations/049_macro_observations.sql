-- D24: daily macro series with provenance and point-in-time fields. A revised value is a new row (new realtime_start), never an overwrite.
CREATE TABLE macro_observations (
  series_id text NOT NULL,
  obs_date date NOT NULL,
  value numeric NOT NULL,
  realtime_start date NOT NULL,
  source_id text NOT NULL REFERENCES data_sources(id),
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, obs_date, realtime_start)
);
CREATE INDEX macro_observations_series_date_idx ON macro_observations(series_id, obs_date DESC);
