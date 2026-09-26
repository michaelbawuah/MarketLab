/** Educational comparisons only. Naive Number paths never write to a ledger. */
import { account, parseDecimal, rounded, type Transaction } from './core.ts';

export function cashExample() {
  const payments = ['0.10', '0.20'];
  let naiveBalance = Number('0.30');
  const naiveSteps = payments.map(payment => {
    const accepted = naiveBalance >= Number(payment);
    if (accepted) naiveBalance -= Number(payment);
    return { payment, accepted, balance: naiveBalance.toString() };
  });
  const ledger: Transaction[] = [{ id: 'fund', date: '2026-01-01', kind: 'deposit', symbol: '', units: '0', amount: parseDecimal('0.30').toString(), fee: '0' }];
  const exactSteps = payments.map((payment, i) => {
    ledger.push({ id: `pay-${i}`, date: '2026-01-01', kind: 'withdrawal', symbol: '', units: '0', amount: parseDecimal(payment).toString(), fee: '0' });
    return { payment, accepted: true, balanceCents: account(ledger).cash.toString() };
  });
  return { naive: { steps: naiveSteps, accepted: naiveSteps.every(s => s.accepted), balanceDollars: naiveBalance.toString() }, exact: { steps: exactSteps, accepted: true, balanceCents: account(ledger).cash.toString() } };
}

export function priceExample(shares = '1', price = '1.005') {
  // Shares and research prices have six decimal places. Their product is USD
  // × 10^12; divide by 10^10 for cents, rounding half up once at that boundary.
  const units = parseDecimal(shares, 6), priceMicros = parseDecimal(price, 6);
  return {
    shares, price, units: units.toString(), priceMicros: priceMicros.toString(),
    naiveCents: Math.round(Number(shares) * Number(price) * 100).toString(),
    exactCents: rounded(units * priceMicros, 10000000000n).toString(),
  };
}
