UPDATE etf_catalog
SET region = CASE region
  WHEN 'United States' THEN 'North America'
  WHEN 'United States and Canada' THEN 'North America'
  WHEN 'Canada' THEN 'North America'
  WHEN 'Developed Europe' THEN 'Europe Developed'
  WHEN 'Denmark' THEN 'Europe Developed'
  WHEN 'Finland' THEN 'Eurozone'
  WHEN 'Netherlands' THEN 'Eurozone'
  WHEN 'Developed Asia Pacific ex-Japan' THEN 'Asia Developed'
  WHEN 'China' THEN 'Asia Emerging'
  WHEN 'Brazil' THEN 'Latin America'
  WHEN 'Chile' THEN 'Latin America'
  WHEN 'Israel' THEN 'Africa/Middle East'
  WHEN 'global' THEN 'Global'
  WHEN 'International' THEN 'Global ex US'
  WHEN 'Global ex United States' THEN 'Global ex US'
  WHEN 'Developed markets ex United States' THEN 'Global ex US'
  WHEN 'Developed markets excluding United States' THEN 'Global ex US'
  WHEN 'Developed markets excluding United States and Canada' THEN 'Global ex US'
  WHEN 'Developed markets ex-North America' THEN 'Global ex US'
  WHEN 'Emerging markets' THEN 'Emerging Markets'
  ELSE region END,
  updated_at = now()
WHERE region IN (
  'United States', 'United States and Canada', 'Canada', 'Developed Europe', 'Denmark',
  'Finland', 'Netherlands', 'Developed Asia Pacific ex-Japan', 'China', 'Brazil', 'Chile',
  'Israel', 'global', 'International', 'Global ex United States',
  'Developed markets ex United States', 'Developed markets excluding United States',
  'Developed markets excluding United States and Canada', 'Developed markets ex-North America',
  'Emerging markets'
);
