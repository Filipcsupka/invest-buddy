-- Correct the historical SPCX call parsed from "HOLD / NO ADD".
UPDATE ai_cards
SET call = 'HOLD',
    dedupe_key = encode(sha256(convert_to(symbol || '|' || coalesce(card_date::text, '') || '|HOLD|' || raw_text, 'UTF8')), 'hex')
WHERE symbol = 'SPCX'
  AND call = 'STOP_ADD'
  AND call_text ~* '\mHOLD\M'
  AND call_text ~* 'NO ADD';
