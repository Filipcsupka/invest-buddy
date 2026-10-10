-- D31: news source decision. rss now names both press-release wires; gdelt terms were read on 2026-10-10 (free for commercial use with a citation).
-- Display stays off for both: the terms do not cover the outlets' headline text. Rows only; no schema change.
UPDATE data_sources SET
  name = 'Press-release RSS (PR Newswire, GlobeNewswire)',
  kind = 'news',
  licence_class = 'unknown',
  display_allowed = false,
  redistribution_allowed = false,
  terms_url = NULL,
  terms_checked_on = NULL,
  attribution_text = NULL,
  rate_limit_note = NULL,
  notes = 'Press-release wire feeds. PR Newswire feed read 2026-10-10 (HTTP 200 in 0.3 s); GlobeNewswire answers 403 here and timed out from the cluster. Redistribution terms of both not checked; internal signal only.'
WHERE id = 'rss';

UPDATE data_sources SET
  name = 'GDELT DOC 2.0',
  kind = 'news',
  licence_class = 'public_attrib',
  display_allowed = false,
  redistribution_allowed = false,
  terms_url = 'https://www.gdeltproject.org/about.html',
  terms_checked_on = '2026-10-10',
  attribution_text = 'Source: The GDELT Project (https://www.gdeltproject.org/)',
  rate_limit_note = 'One request per 5 seconds; answers took 11 to 19 s on 2026-10-05.',
  notes = 'GDELT datasets are free for any commercial use; redistribution allowed with a citation and a link to gdeltproject.org (about page, read 2026-10-10). The terms cover GDELT''s own data, not the outlets'' headline text, so display stays off. Metadata only: headline, link, outlet, time, tickers.'
WHERE id = 'gdelt';
