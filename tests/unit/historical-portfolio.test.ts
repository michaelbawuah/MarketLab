import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, datasetId, type SavedDataset } from '../../lib/finance/market-data.ts';
import { validateActions } from '../../lib/finance/corporate-actions.ts';
import { analyzePortfolio, parseLedger, validatePortfolioDraft, portfolioFingerprint, ledgerCSV, LEDGER_HEADER, PORTFOLIO_METHOD, type PortfolioSnapshot } from '../../lib/finance/historical-portfolio.ts';
async function fixture(): Promise<PortfolioSnapshot> {
  const d=validateImport({symbol:'FIX',source:'Independent fictional reconciliation',basis:'raw',priceColumn:'close',kind:'synthetic',csv:'date,close\n2026-09-14,100\n2026-09-15,50\n2026-09-16,49\n2026-09-17,50\n2026-09-18,51'},'2026-09-24');
  const dataset:SavedDataset={...d,id:await datasetId(d),firstDate:'2026-09-14',lastDate:'2026-09-18',count:5,created:'2026-09-24'};
  const actions={...validateActions({source:'Fictional fixture events',complete:true,events:[{date:'2026-09-15',type:'split',newShares:'2',oldShares:'1',amount:''},{date:'2026-09-16',type:'dividend',newShares:'',oldShares:'',amount:'1'}]},d),revision:1,updated:'2026-09-24'};
  const transactions=parseLedger(LEDGER_HEADER+'\nd1,2026-09-14,deposit,,0,1000,0,\nb1,2026-09-14,buy,FIX,4,400,1,\nd2,2026-09-16,deposit,,0,250,0,\ns1,2026-09-17,sell,FIX,2,100,1,\np1,2026-09-18,dividend_payment,FIX,0,8,0,2026-09-16','2026-09-18');
  return {method:PORTFOLIO_METHOD,name:'Independent fixture',asOf:'2026-09-18',transactions,bindings:[{dataset,actions}]};
}
test('portfolio independently reconciles split, dividend receivable, funding, sale and payment',async()=>{
  const result=analyzePortfolio(await fixture());
  assert.deepEqual(result.history.map(p=>[p.value,p.cash,p.receivables]),[['99900','59900','0'],['99900','59900','0'],['124900','84900','800'],['125600','94800','800'],['126200','95600','0']]);
  assert.deepEqual([result.contributions,result.gain,result.fees,result.realized,result.unrealized,result.income],['125000','1200','200','-125','525','800']);
  assert.deepEqual([result.holdings[0].shares,result.holdings[0].cost],['6','30075']);
  assert.ok(Math.abs(result.returnPct-0.9397918334667734)<1e-9);assert.ok(Math.abs(result.maxDrawdown+.1)<1e-9);
});
test('a dividend is paid to the original entitlement after all shares are sold',async()=>{
  const s=await fixture();s.transactions[3]={...s.transactions[3],units:'8000000',amount:'40000'};
  const r=analyzePortfolio(s);assert.equal(r.holdings.length,0);assert.equal(r.income,'800');assert.equal(r.dividends[0].earned,'800');assert.equal(r.receivables,'0');
});
test('ex-date buyers are excluded and sellers retain earned dividends',async()=>{
  const s=await fixture();s.transactions[1].date='2026-09-16';s.transactions=s.transactions.filter(t=>t.type!=='dividend_payment');
  assert.equal(analyzePortfolio(s).income,'0');
  const other=await fixture();other.transactions[3].date='2026-09-16';assert.equal(analyzePortfolio(other).income,'800');
});
test('receivables cannot be spent, and payment cannot duplicate or mismatch an entitlement',async()=>{
  const s=await fixture();s.transactions.splice(3,0,{id:'withdraw',date:'2026-09-16',type:'withdrawal',symbol:'',units:'0',amount:'85000',fee:'0',reference:''});
  assert.throws(()=>analyzePortfolio(s),/spendable cash/);
  const a=await fixture();a.transactions.push({...a.transactions.at(-1)!,id:'duplicate'});assert.throws(()=>analyzePortfolio(a),/unpaid/);
  const b=await fixture();b.transactions.at(-1)!.amount='600';assert.throws(()=>analyzePortfolio(b),/entitlement/);
});
test('missing and stale marks, unsupported price basis and incomplete action coverage stop valuation',async()=>{
  const s=await fixture();s.bindings[0].dataset.observations=s.bindings[0].dataset.observations.filter(p=>p.date!=='2026-09-17');assert.throws(()=>analyzePortfolio(s),/Missing FIX close/);
  const a=await fixture();a.bindings[0].dataset.basis='total_return_adjusted';assert.throws(()=>analyzePortfolio(a),/unadjusted/);
  const b=await fixture();b.asOf='2026-09-21';assert.throws(()=>analyzePortfolio(b),/coverage ends/);
});
test('reverse split retains rational shares and aggregate dividend rounding is half up',async()=>{
  const s=await fixture();s.transactions=s.transactions.slice(0,2);s.transactions[1].units='1000000';s.transactions[1].amount='10000';s.transactions[1].fee='0';
  s.bindings[0].actions.events[0].newShares='1';s.bindings[0].actions.events[0].oldShares='3';s.bindings[0].actions.events[1].amount='0.015';
  const r=analyzePortfolio(s);assert.equal(r.holdings[0].shares,'1/3');assert.equal(r.income,'1');
});
test('CSV validation preserves same-date order, rejects malformed or duplicate imports, and round-trips exact amounts',async()=>{
  const s=await fixture(), csv=ledgerCSV(s.transactions);assert.deepEqual(parseLedger(csv,s.asOf),s.transactions);
  assert.throws(()=>parseLedger(csv+'\n'+csv.split('\n')[1],s.asOf),/unique transaction ID/);
  assert.throws(()=>parseLedger(LEDGER_HEADER+'\nbad,2026-02-30,deposit,,0,10,0,',s.asOf),/date/);
  assert.throws(()=>parseLedger(LEDGER_HEADER+'\nbad,2026-09-14,deposit,FIX,0,10,0,',s.asOf),/cash flows/);
  assert.throws(()=>validatePortfolioDraft({name:'Test',asOf:s.asOf,csv,bindings:[],confirmed:true}),/exactly one/);
  assert.throws(()=>validatePortfolioDraft({name:'Test',asOf:s.asOf,csv,bindings:[],confirmed:false}),/confirm/);
});
test('frozen action payloads affect identity even when an action revision number is reused',async()=>{
  const s=await fixture(), first=await portfolioFingerprint(s);s.bindings[0].actions.events[1].amount='2';assert.notEqual(await portfolioFingerprint(s),first);
});
