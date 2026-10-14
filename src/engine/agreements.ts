/**
 * Consensus agreements that count as confirmed for a fundamental field, when the quote is also verified: two agents agreed, SEC data decided,
 * one extractor with a stored verbatim quote, or a data rule (epsBeat from Alpha Vantage). The data provider (score inputs) and the signals both use this one list.
 */
export const CONFIRMED_FUNDAMENTAL_AGREEMENTS: readonly string[] = ["agree", "xbrl_override", "verified_single", "data_rule"];
