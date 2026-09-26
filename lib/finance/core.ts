/** Currency is integer cents; fractional shares are integer millionths.
 * All arithmetic is BigInt until display and dimensionless return calculations. */
export type Kind = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend';
export type Transaction = { id: string; date: string; kind: Kind; symbol: string; units: string; amount: string; fee: string };
export type Quote = { symbol: string; date: string; close: string };
export const SCALE = 1000000n;
export function parseDecimal(value: string, places = 2): bigint {
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${places}})?$`).test(value)) throw new Error(`Enter a nonnegative number with at most ${places} decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
}
export function rounded(n: bigint, denominator: bigint): bigint {
  return (n + denominator / 2n) / denominator;
}
export function tradeValue(units: string, price: string): bigint {
  return rounded(BigInt(units) * BigInt(price), SCALE);
}
export function account(transactions: Transaction[]) {
  let cash = 0n, contributions = 0n, realized = 0n, dividends = 0n, fees = 0n;
  const positions = new Map<string, { units: bigint; cost: bigint }>();
  for (const tx of transactions) {
    const amount = BigInt(tx.amount), fee = BigInt(tx.fee), units = BigInt(tx.units);
    if (amount < 0n || fee < 0n || units < 0n) throw new Error('Amounts cannot be negative.');
    const p = positions.get(tx.symbol) ?? { units: 0n, cost: 0n };
    if (tx.kind === 'deposit') { cash += amount; contributions += amount; }
    if (tx.kind === 'withdrawal') { cash -= amount; contributions -= amount; }
    if (tx.kind === 'dividend') { cash += amount; dividends += amount; }
    if (tx.kind === 'buy') { if (!units) throw new Error('Shares must be positive.'); cash -= amount + fee; p.units += units; p.cost += amount + fee; positions.set(tx.symbol, p); }
    if (tx.kind === 'sell') {
      if (!units || units > p.units) throw new Error(`Not enough ${tx.symbol} shares on ${tx.date}.`);
      const basis = units === p.units ? p.cost : rounded(p.cost * units, p.units);
      cash += amount - fee; realized += amount - fee - basis; p.units -= units; p.cost -= basis; positions.set(tx.symbol, p);
    }
    fees += fee;
    if (cash < 0n) throw new Error(`Insufficient cash on ${tx.date}. Add a deposit or reduce the transaction.`);
  }
  return { cash, contributions, realized, dividends, fees, positions };
}
export function analyze(transactions: Transaction[], quotes: Quote[]) {
  const txs = [...transactions].sort((a,b)=>a.date.localeCompare(b.date));
  const dates = [...new Set([...quotes.map(q=>q.date), ...txs.map(t=>t.date)])].sort();
  const daily = new Map<string, Quote[]>();
  for (const q of quotes) { const group = daily.get(q.date) ?? []; group.push(q); daily.set(q.date,group); }
  const latest = new Map<string, Quote>();
  let previous = 0n, growth = 1, high = 1, maxDrawdown = 0;
  const history: { date:string; value:number; contributions:number; returnPct:number }[] = [];
  let final = account([]);
  const processed:Transaction[]=[];
  const mark = (state:ReturnType<typeof account>, date:string) => {
    let value=state.cash;
    for(const [symbol,p] of state.positions){
      if(!p.units)continue;
      const quote=latest.get(symbol);
      if(!quote)throw new Error(`Missing price for ${symbol} on ${date}; valuation stopped.`);
      value+=rounded(p.units*BigInt(quote.close),SCALE);
    }
    return value;
  };
  for (const date of dates) {
    for (const q of daily.get(date) ?? []) latest.set(q.symbol,q);
    // Mark the previous holdings at this day's close before applying ledger events.
    // All events use that closing mark, in stable ledger order. External flows
    // do not change growth; trade slippage, fees and income do.
    let value=mark(final,date);
    if(previous>0n)growth*=Number(value)/Number(previous);
    for(const tx of txs.filter(t=>t.date===date)){
      processed.push(tx);
      final=account(processed);
      const after=mark(final,date);
      if(tx.kind!=='deposit'&&tx.kind!=='withdrawal'&&value>0n)growth*=Number(after)/Number(value);
      value=after;
    }
    high=Math.max(high,growth);maxDrawdown=Math.min(maxDrawdown,growth/high-1);
    history.push({date,value:Number(value)/100,contributions:Number(final.contributions)/100,returnPct:(growth-1)*100});
    previous=value;
  }
  const holdings = [...final.positions].filter(([,p])=>p.units>0n).map(([symbol,p])=>{
    const quote = latest.get(symbol)!;
    const value = rounded(p.units*BigInt(quote.close),SCALE);
    const prior = quotes.filter(q=>q.symbol===symbol && q.date<quote.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
    return { symbol, units:Number(p.units)/1e6, price:Number(quote.close)/100, value:Number(value)/100, cost:Number(p.cost)/100, gain:Number(value-p.cost)/100, gainPct:p.cost?Number(value-p.cost)/Number(p.cost)*100:0, dayPct:prior?(Number(quote.close)/Number(prior.close)-1)*100:0, priceDate:quote.date };
  }).sort((a,b)=>b.value-a.value);
  const value = history.at(-1)?.value ?? 0;
  return { value, cash:Number(final.cash)/100, contributions:Number(final.contributions)/100, gain:value-Number(final.contributions)/100, realized:Number(final.realized)/100, dividends:Number(final.dividends)/100, fees:Number(final.fees)/100, returnPct:(growth-1)*100, maxDrawdown:maxDrawdown*100, holdings, history };
}
export type Analytics = ReturnType<typeof analyze>;
