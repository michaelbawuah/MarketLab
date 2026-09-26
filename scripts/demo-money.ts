import { cashExample, priceExample } from '../lib/finance/money-examples.ts';

const mode = process.argv[2] ?? '--compare';
if (!['--compare', '--naive', '--exact'].includes(mode) || process.argv.length > 3) {
  console.error('Usage: pnpm demo:money [--compare|--naive|--exact]');
  process.exit(2);
}
const cash = cashExample(), price = priceExample();
console.log('MarketLab exact-money demonstration · fictional inputs');
console.log('Contract 1: $0.30 must cover $0.10 and $0.20, leaving zero cents.');
console.log('Contract 2: 1 share × $1.005, rounded half up to cents, must cost 101 cents.');
console.log(JSON.stringify({ cash, price }, null, 2));
const naivePass = cash.naive.accepted && Number(cash.naive.balanceDollars) === 0 && price.naiveCents === '101';
const exactPass = cash.exact.accepted && cash.exact.balanceCents === '0' && price.exactCents === '101';
console.log(`Naive arithmetic: ${naivePass ? 'PASS' : 'FAIL'} (valid payment rejected; price rounds to ${price.naiveCents} cents).`);
console.log(`Canonical exact helpers: ${exactPass ? 'PASS' : 'FAIL'}.`);
const passed = mode === '--naive' ? naivePass : mode === '--exact' ? exactPass : !naivePass && exactPass;
console.log(mode === '--compare' ? `Comparison: ${passed ? 'PASS — failure reproduced, exact results verified' : 'FAIL'}.` : `${mode.slice(2)} contract check: ${passed ? 'PASS' : 'FAIL'}.`);
process.exitCode = passed ? 0 : 1;
