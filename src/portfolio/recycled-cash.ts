import type { EurTrade } from "./eur";

export interface RecycledSale { date: string; symbol: string; netProceedsEur: number; remainingEur: number }

/** Sales create recyclable cash; later purchases consume the oldest sale first. */
export function recycledCashLedger(trades: readonly EurTrade[], freeCashEur: number): { sales: RecycledSale[]; availableEur: number } {
  const sales: RecycledSale[] = [];
  const ordered = trades.map((trade, index) => ({ trade, index })).sort((a, b) => a.trade.date.localeCompare(b.trade.date) || a.index - b.index);
  for (const { trade } of ordered) {
    if (trade.quantity < 0 && trade.proceedsEur > 0) {
      const net = Math.max(0, Math.round((trade.proceedsEur - trade.feesEur) * 100));
      sales.push({ date: trade.date, symbol: trade.symbol, netProceedsEur: net / 100, remainingEur: net / 100 });
    } else if (trade.quantity > 0) {
      let spent = Math.max(0, Math.round((Math.abs(trade.proceedsEur) + trade.feesEur) * 100));
      for (const sale of sales) {
        const used = Math.min(spent, Math.round(sale.remainingEur * 100));
        sale.remainingEur = (Math.round(sale.remainingEur * 100) - used) / 100;
        spent -= used;
        if (!spent) break;
      }
    }
  }
  // The broker cash balance is authoritative if withdrawals or other cash movements followed a sale.
  let excess = Math.max(0, sales.reduce((sum, sale) => sum + Math.round(sale.remainingEur * 100), 0) - Math.round(Math.max(0, freeCashEur) * 100));
  for (const sale of sales) {
    const used = Math.min(excess, Math.round(sale.remainingEur * 100));
    sale.remainingEur = (Math.round(sale.remainingEur * 100) - used) / 100;
    excess -= used;
  }
  return { sales, availableEur: sales.reduce((sum, sale) => sum + sale.remainingEur, 0) };
}

export function holdingFacts(symbol: string, quantity: number, valueEur: number, costEur: number | undefined, asOf: string, trades: readonly EurTrade[]): { gainFromCostPercent: number | null; daysHeld: number | null } {
  const gainFromCostPercent = costEur && costEur > 0 ? Math.round((valueEur / costEur - 1) * 10000) / 100 : null;
  const lots: { date: string; quantity: number }[] = [];
  let incomplete = false;
  for (const trade of trades.filter((t) => t.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date))) {
    if (trade.quantity > 0) lots.push({ date: trade.date, quantity: trade.quantity });
    else {
      let sold = -trade.quantity;
      while (sold > 0 && lots.length) {
        const used = Math.min(sold, lots[0].quantity);
        lots[0].quantity -= used;
        sold -= used;
        if (lots[0].quantity === 0) lots.shift();
      }
      if (sold > 0) incomplete = true;
    }
  }
  const covered = !incomplete && quantity > 0 && Math.abs(lots.reduce((sum, lot) => sum + lot.quantity, 0) - quantity) < 0.000001;
  const daysHeld = covered ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(lots[0].date)) / 86_400_000)) : null;
  return { gainFromCostPercent, daysHeld };
}
