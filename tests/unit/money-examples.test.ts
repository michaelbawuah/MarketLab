import test from 'node:test';
import assert from 'node:assert/strict';
import { account, parseDecimal, type Transaction } from '../../lib/finance/core.ts';
import { cashExample, priceExample } from '../../lib/finance/money-examples.ts';

test('decimal arithmetic rejects a valid payment while the canonical ledger spends every cent', () => {
  const result = cashExample();
  assert.deepEqual(result.naive.steps.map(s => s.accepted), [true, false]);
  assert.equal(result.naive.steps[0].balance, '0.19999999999999998');
  assert.equal(Number(result.naive.steps[0].balance).toFixed(2), '0.20');
  assert.deepEqual(result.exact.steps.map(s => s.balanceCents), ['20', '0']);
  assert.equal(result.exact.accepted, true);
});

test('a six-decimal price rounds exactly at the half-cent boundary', () => {
  const result = priceExample();
  assert.equal(result.naiveCents, '100');
  assert.equal(result.exactCents, '101');
  for (const [price, cents] of [['0.994999','99'], ['0.995000','100'], ['0.995001','100'], ['1.004999','100'], ['1.005000','101'], ['1.005001','101']]) {
    assert.equal(priceExample('1', price).exactCents, cents, price);
  }
});

test('a millionth share crosses the half-cent boundary without losing precision', () => {
  assert.equal(priceExample('0.000001','4999.999999').exactCents, '0');
  assert.equal(priceExample('0.000001','5000').exactCents, '1');
  assert.equal(priceExample('0.000001','5000.000001').exactCents, '1');
  assert.throws(() => parseDecimal('1.005'), /at most 2/);
  assert.throws(() => priceExample('0.0000001','5000'), /at most 6/);
});

const tx = (id: string, kind: Transaction['kind'], amount: string, units = '0'): Transaction => ({ id, kind, amount, units, date: '2026-01-01', symbol: units === '0' ? '' : 'XDEMO', fee: '0' });
test('integer cents still reject a real one-cent overdraft', () => {
  assert.throws(() => account([tx('fund','deposit','30'),tx('first','withdrawal','10'),tx('second','withdrawal','21')]), /Insufficient cash/);
});

test('successive partial sales conserve basis and clear the final holding exactly', () => {
  const ledger = [tx('fund','deposit','10000'), tx('buy','buy','10000','3000000')];
  const remainingBasis = ['6667','3333','0'];
  for (let i=0; i<3; i++) {
    ledger.push(tx(`sell-${i}`,'sell','4000','1000000'));
    const state = account(ledger);
    assert.equal(state.positions.get('XDEMO')!.cost.toString(), remainingBasis[i]);
    assert.equal(state.cash - state.contributions, state.realized - state.positions.get('XDEMO')!.cost);
  }
  const final = account(ledger);
  assert.equal(final.cash, 12000n); assert.equal(final.realized, 2000n);
  assert.equal(final.positions.get('XDEMO')!.units, 0n);
});

test('decimal integer strings retain cents across JSON without a Number conversion', () => {
  const cents = 9007199254740993n;
  const restored = JSON.parse(JSON.stringify({cents: cents.toString()})) as {cents: string};
  assert.equal(BigInt(restored.cents), cents);
  assert.notEqual(BigInt(Number(restored.cents)), cents);
  assert.deepEqual(JSON.parse(JSON.stringify(cashExample())), cashExample());
});
