import test from 'node:test';
import assert from 'node:assert/strict';
import { account, analyze, parseDecimal, tradeValue, type Transaction, type Quote } from '../../lib/finance/core.ts';
import { demoQuotes, demoTransactions } from '../../lib/finance/demo.ts';
import { validateDataset } from '../../lib/finance/pipeline.ts';
import { normalizeTransaction } from '../../lib/finance/validation.ts';
const tx=(kind:Transaction['kind'],amount:string,units='0',date='2026-04-01',fee='0'):Transaction=>({id:crypto.randomUUID(),kind,amount,units,date,fee,symbol:kind==='deposit'||kind==='withdrawal'?'':'AAPL'});
const quotes:Quote[]=[{symbol:'AAPL',date:'2026-04-01',close:'1000'},{symbol:'AAPL',date:'2026-04-02',close:'1100'}];
test('decimal parsing and fractional trade rounding preserve cents',()=>{
 assert.equal(parseDecimal('0.10')+parseDecimal('0.20'),30n);
 assert.equal(parseDecimal('1.000001',6),1000001n);
 assert.equal(tradeValue('1500000','101'),152n);
 assert.throws(()=>parseDecimal('1e3'));assert.throws(()=>parseDecimal('0.001'));assert.throws(()=>parseDecimal('-2'));
});
test('external contributions alone never count as returns',()=>{
 const r=analyze([tx('deposit','10000'),tx('deposit','5000','0','2026-04-02')],quotes);
 assert.equal(r.value,150);assert.equal(r.gain,0);assert.equal(r.returnPct,0);
});
test('withdrawals are excluded from time-weighted performance',()=>{
 const r=analyze([tx('deposit','10000'),tx('buy','10000','10000000'),tx('sell','5500','5000000','2026-04-02'),tx('withdrawal','5500','0','2026-04-02')],quotes);
 assert.equal(r.value,55);assert.ok(Math.abs(r.returnPct-10)<1e-9);assert.equal(r.gain,10);
});
test('average cost, sale fees, and dividends reconcile to total gain',()=>{
 const items=[tx('deposit','20000'),tx('buy','10000','10000000','2026-04-01','100'),tx('sell','5500','5000000','2026-04-02','50'),tx('dividend','200','0','2026-04-02')];
 const r=analyze(items,quotes);assert.equal(r.realized,4);assert.equal(r.dividends,2);assert.equal(r.holdings[0].cost,50.5);assert.equal(r.fees,1.5);
 assert.ok(Math.abs(r.gain-(r.realized+r.dividends+r.holdings[0].gain))<1e-9);
});
test('historical validation prevents overdrafts and short sales',()=>{
 assert.throws(()=>account([tx('buy','1000','1000000')]),/Insufficient cash/);
 assert.throws(()=>account([tx('deposit','10000'),tx('sell','1000','1000000')]),/Not enough/);
 assert.throws(()=>account([tx('deposit','100'),tx('withdrawal','101')]),/Insufficient cash/);
});
test('no future quote can be used to value an earlier purchase',()=>{
 assert.throws(()=>analyze([tx('deposit','10000'),tx('buy','1000','1000000')],[quotes[1]]),/Missing price/);
});
test('daily gain with an end-of-day contribution retains the correct return',()=>{
 const r=analyze([tx('deposit','10000'),tx('buy','10000','10000000'),tx('deposit','5000','0','2026-04-02')],quotes);
 assert.equal(r.value,160);assert.equal(r.gain,10);assert.ok(Math.abs(r.returnPct-10)<1e-9);
});
test('fixture replay is deterministic and complete, malformed data is rejected',()=>{
 const data=demoQuotes();assert.deepEqual(data,demoQuotes());assert.equal(validateDataset(data).length,762);
 assert.throws(()=>validateDataset(data.slice(1)),/Incomplete/);
 assert.throws(()=>validateDataset([...data,data[0]]),/Duplicate/);
 assert.throws(()=>validateDataset([{...data[0],close:'-1'},...data.slice(1)]),/Invalid/);
});
test('sample portfolio reconciles and every chart endpoint matches its valuation',()=>{
 const r=analyze(demoTransactions(),demoQuotes());
 assert.equal(r.contributions,70000);assert.equal(r.cash,9093);assert.equal(r.value,79605.05);
 assert.ok(Math.abs(r.value-r.cash-r.holdings.reduce((n,h)=>n+h.value,0))<1e-8);
 assert.equal(r.history.at(-1)!.value,r.value);assert.equal(r.history.length,127);
});
test('API input normalization rejects invalid dates, unknown symbols and extra fields',()=>{
 const input={id:crypto.randomUUID(),version:0,kind:'buy',date:'2026-05-01',symbol:'AAPL',shares:'1.5',price:'10.01',amount:'0',fee:'0.01'};
 assert.equal(normalizeTransaction(input).transaction.amount,'1502');
 assert.throws(()=>normalizeTransaction({...input,date:'2026-04-31'}),/valid date/);
 assert.throws(()=>normalizeTransaction({...input,symbol:'FAKE'}),/supported asset/);
 assert.throws(()=>normalizeTransaction({...input,owner:'other'}),/fields/);
 assert.throws(()=>normalizeTransaction({...input,shares:'0'}),/greater than zero/);
});

test('a large contribution immediately invested does not create a return below -100%',()=>{
 const items=[tx('deposit','10000'),tx('deposit','1000000','0','2026-04-02'),tx('buy','1000000','1000000','2026-04-02')];
 const r=analyze(items,quotes);
 assert.ok(r.returnPct<0&&r.returnPct>=-100);assert.equal(r.value,111);
});
