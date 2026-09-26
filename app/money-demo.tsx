'use client';
import { useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { cashExample, priceExample } from '@/lib/finance/money-examples';
import './money-demo.css';

export default function MoneyDemo() {
  const [example, setExample] = useState('cash');
  const cash = cashExample(), price = priceExample();
  return <section className="money-demo" aria-labelledby="money-demo-title">
    <span className="money-demo-kicker">A PENNY MATTERS</span>
    <h3 id="money-demo-title">Why we count in cents.</h3>
    <p>Small decimal errors can change a payment decision. Try these fictional examples, calculated in your browser.</p>
    <label htmlFor="money-example">Choose an example</label>
    <NativeSelect id="money-example" value={example} onChange={event => setExample(event.target.value)}>
      <option value="cash">Spend 30¢ in two payments</option>
      <option value="price">Round a half-cent trade price</option>
    </NativeSelect>
    <div aria-live="polite" aria-atomic="true">
      <p className="money-demo-scenario">{example === 'cash' ? 'Start with 30¢. Pay 10¢, then 20¢.' : 'Buy 1 share at $1.005. Round the total to the nearest cent, with half cents rounding up.'}</p>
      <div className="money-demo-results">
        <div className="money-demo-naive"><span>Ordinary decimal arithmetic</span><strong>{example === 'cash' ? (cash.naive.accepted ? 'Payment accepted' : '20¢ payment rejected') : `${price.naiveCents}¢ trade cost`}</strong>
          <code>{example === 'cash' ? `0.30 − 0.10 = ${cash.naive.steps[0].balance}` : `Math.round(1.005 × 100) = ${price.naiveCents}`}</code>
          <small>{example === 'cash' ? 'The remaining value is slightly below 0.20.' : 'The value before rounding is slightly below 100.5.'}</small>
        </div>
        <div className="money-demo-exact"><span>MarketLab’s exact calculation</span><strong>{example === 'cash' ? `${cash.exact.balanceCents}¢ left · both accepted` : `${price.exactCents}¢ trade cost`}</strong>
          <code>{example === 'cash' ? '30 − 10 − 20 = 0 cents' : '100.5 cents → 101 cents'}</code>
          <small>{example === 'cash' ? 'Cash stays in whole cents throughout.' : 'The exact total rounds once, at the cent boundary.'}</small>
        </div>
      </div>
      <p className="money-demo-takeaway">{example === 'cash' ? 'Displaying “0.20” would hide the error; it would not repair the payment decision.' : 'This is a price with three decimals. Cash entries themselves accept at most two decimals.'}</p>
    </div>
    <details><summary>How MarketLab keeps the numbers consistent</summary><p>Cash and fees use integer cents. Entered shares use millionths; split-created fractions remain exact. Research prices retain six decimals. Positive amounts round half up when converted to cents. Returns and chart coordinates use approximate ratios; they do not decide whether a trade is affordable.</p></details>
  </section>;
}
