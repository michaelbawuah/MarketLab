import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importSchwabCSV, detectPortfolioFormat, brokerageCashMatches, SCHWAB_FORMAT, SCHWAB_HEADER } from '../../lib/finance/brokerage-csv.ts';
import { readPortfolioCSV, validatePortfolioDraft, ledgerCSV, parseLedger, analyzePortfolio, portfolioFingerprint, PORTFOLIO_METHOD, type PortfolioSnapshot } from '../../lib/finance/historical-portfolio.ts';
import { portfolioCertificate, withConfidenceCSV } from '../../lib/finance/confidence.ts';
import { portfolioHistoryCSV } from '../../lib/finance/portfolio-benchmark.ts';
import { exampleDraft, validateImport, datasetId, csvRows, type SavedDataset } from '../../lib/finance/market-data.ts';

const example=readFileSync(new URL('../../public/examples/schwab-transactions.csv',import.meta.url),'utf8');
const parse=(csv=example,order:'newest-first'|'oldest-first'='newest-first')=>importSchwabCSV(csv,'2026-09-18',order,'synthetic');
const cell=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const csv=(rows:string[][])=>[SCHWAB_HEADER,...rows.map(r=>r.map(cell).join(','))].join('\r\n');
const funding=['09/14/2026','MoneyLink Deposit','','Test funding','','','','$1,000.00'];
const buy=['09/14/2026','Buy','XDEMO','Fictional stock','2.5','$100.00','$1.00','-$251.00'];
async function snapshot():Promise<PortfolioSnapshot>{
  const d=validateImport(exampleDraft,'2026-09-26');
  const dataset:SavedDataset={...d,id:await datasetId(d),firstDate:d.observations[0].date,lastDate:d.observations.at(-1)!.date,count:d.observations.length,created:'2026-09-26'};
  const {transactions,receipt}=parse();
  return {method:PORTFOLIO_METHOD,name:'Fictional Schwab verification',asOf:'2026-09-18',transactions,importReceipt:receipt,bindings:[{dataset,actions:{source:'Fictional no-event record',complete:true,events:[],revision:1,updated:'2026-09-26'}}]};
}

test('native Schwab file reconciles quoted USD values, explicit fees, header and footer without cleanup',()=>{
  const {transactions:t,receipt:r}=parse();
  assert.equal(detectPortfolioFormat('\uFEFF'+example),SCHWAB_FORMAT);
  assert.deepEqual(t.map(v=>[v.id,v.type,v.amount,v.fee,v.units]),[['schwab-4','deposit','100000','0','0'],['schwab-3','buy','25000','100','2500000'],['schwab-2','sell','5500','3','500000'],['schwab-1','withdrawal','2500','0','0']]);
  assert.equal(r.cashChange,'77897');assert.equal(r.footerTotal,'77897');assert.equal(r.fees,'103');assert.equal(r.priceDifferences,0);
  assert.equal(r.transactionCount,4);assert.equal(r.preambleRemoved,true);assert.equal(brokerageCashMatches(r,t),true);
  assert.deepEqual(parseLedger(ledgerCSV(t),'2026-09-18'),t);
  assert.ok(!JSON.stringify(r).includes('FICTIONAL-DEMO'));assert.ok(!JSON.stringify(r).includes('Fictional withdrawal'));
});

test('brokerage import reaches the canonical portfolio with independently expected cash, cost and gains',async()=>{
  const s=await snapshot(),a=analyzePortfolio(s);
  assert.deepEqual([a.cash,a.value,a.contributions,a.gain,a.realized,a.unrealized,a.fees],['77897','98472','97500','972','477','495','103']);
  assert.deepEqual([a.holdings[0].shares,a.holdings[0].cost],['2','20080']);
  const c=portfolioCertificate(s,a,null,await portfolioFingerprint(s));
  assert.equal(c.checks.find(v=>v.id==='brokerage-cash')?.status,'passed');
  assert.equal(c.classification,'Fictional inputs');assert.equal(a.synthetic,true);
});

test('brokerage report serialization retains evidence and amounts without account titles or descriptions',async()=>{
  const s=await snapshot(),a=analyzePortfolio(s),fingerprint=await portfolioFingerprint(s),confidence=portfolioCertificate(s,a,null,fingerprint);
  const json=JSON.stringify({snapshot:s,analysis:a,confidence,fingerprint});
  const restored=JSON.parse(json);
  assert.equal(restored.snapshot.importReceipt.cashChange,'77897');
  assert.equal(restored.snapshot.importReceipt.fees,'103');
  assert.deepEqual(analyzePortfolio(restored.snapshot),a);
  assert.equal(await portfolioFingerprint(restored.snapshot),fingerprint);
  const exported=withConfidenceCSV(portfolioHistoryCSV(a,null),confidence);
  assert.match(exported,/brokerage-cash/);
  const rows=csvRows(exported),last=Object.fromEntries(rows[0].map((key,i)=>[key,rows.at(-1)![i]]));
  assert.equal(last.portfolio_cash_cents,'77897');
  assert.equal(last.portfolio_value_cents,'98472');
  assert.equal(last.date,'2026-09-18');
  assert.deepEqual(JSON.parse(rows[1][rows[0].indexOf('confidence_certificate_json')]),confidence);
  assert.match(exported,/Fictional inputs/);
  for(const text of [json,exported]){
    assert.ok(!text.includes('FICTIONAL-DEMO'));
    assert.ok(!text.includes('Fictional withdrawal'));
    assert.ok(!text.includes('Fictional example stock'));
  }
});

test('same-day order is explicit and missing initial funding cannot pass valuation',async()=>{
  const s=await snapshot();s.transactions=parse(example,'oldest-first').transactions;
  assert.throws(()=>analyzePortfolio(s),/insufficient spendable cash/);
  s.transactions=parse(csv([buy]),'oldest-first').transactions;
  assert.throws(()=>analyzePortfolio(s),/insufficient spendable cash/);
  assert.equal(parse(csv([funding,buy]),'oldest-first').transactions[0].type,'deposit');
});

test('all unsupported activity stops the whole import instead of producing a partial ledger',()=>{
  for(const action of ['Cash Dividend','Qualified Dividend','Bank Interest','Reinvest Shares','Stock Split','Security Transfer','Journal','Service Fee','Sell Short','Unknown']) {
    const row=['09/15/2026',action,'','Unsupported example','','','','$10.00'];
    assert.throws(()=>parse(csv([funding,row]),'oldest-first'),/Schwab data record 2:.*(?:not yet support|not supported|cannot be treated|Unsupported action)/);
  }
  const option=[...buy];option[3]='XDEMO CALL 09/18/2026 100';assert.throws(()=>parse(csv([option,funding])),/Options and bonds/);
});

test('cash signs, impossible dates, numeric grouping, currencies and excess precision fail closed',()=>{
  const variants: Array<[number,string]>=[[7,'$251.00'],[0,'02/30/2026'],[0,'09/14/2026 as of 09/13/2026'],[0,'09/19/2026'],[4,'2.5000001'],[4,'-2.5'],[5,'€100.00'],[5,'$100.0000001'],[7,'-$25,1.00'],[7,'-$251.001'],[6,'-$1.00'],[6,'$200.00']];
  for(const [index,value] of variants){const row=[...buy];row[index]=value;assert.throws(()=>parse(csv([row,funding])),/Schwab data record 1:/);}
  const debit=[...funding];debit[7]='-$1000.00';assert.throws(()=>parse(csv([debit])),/transfer direction/);
  const shares=[...funding];shares[2]='XDEMO';assert.throws(()=>parse(csv([shares])),/Cash transfers/);
  assert.throws(()=>importSchwabCSV(example,'2026-02-30','newest-first','synthetic'),/valuation date/);
});

test('multiple accounts, unknown preambles, malformed footers and mismatched totals are rejected',()=>{
  assert.throws(()=>parse(example+'\n'+example),/Multiple account sections/);
  assert.throws(()=>parse('Unexpected title\n'+csv([funding])),/Expected Schwab/);
  assert.throws(()=>parse(example.replace('$778.97','$778.96')),/Transactions Total does not match/);
  assert.throws(()=>parse(example.replace('Transactions Total,""','Transactions Total,"extra"')),/Unexpected Transactions Total/);
  assert.throws(()=>parse(example.replace('"Fees & Comm"','"Unknown fees"')),/Expected Schwab/);
  assert.throws(()=>parse(example+'\nUnrecognized footer'),/Multiple account sections|eight columns/);
});

test('blank lines, BOM, trailing empty columns and quoted descriptions are handled without storing descriptions',()=>{
  const custom=[...buy];custom[3]='Fictional, "quoted" company\nnot an account';
  const source='\uFEFF'+csv([custom,funding]).replaceAll('\r\n',',\r\n')+',\r\n\r\n';
  const result=parse(source);assert.equal(result.transactions.length,2);assert.equal(result.receipt.preambleRemoved,false);assert.equal(result.receipt.footerTotal,null);
  assert.ok(!JSON.stringify(result).includes('quoted'));
});

test('duplicate-looking executions remain distinct and repeated import identities are deterministic',async()=>{
  const source=csv([buy,buy,funding]),first=parse(source),second=parse(source);
  assert.equal(first.transactions.length,3);assert.equal(new Set(first.transactions.map(v=>v.id)).size,3);
  assert.deepEqual(first,second);assert.equal(first.receipt.cashChange,'49800');
  const s=await snapshot();assert.equal(await portfolioFingerprint(s),await portfolioFingerprint({...s,transactions:parse().transactions,importReceipt:parse().receipt}));
  const changed=structuredClone(s);changed.importReceipt!.kind='historical';assert.notEqual(await portfolioFingerprint(s),await portfolioFingerprint(changed));
});

test('reported net cash and fees remain authoritative when the displayed execution price is rounded',()=>{
  const row=[...buy];row[5]='$100.01';const {transactions,receipt}=parse(csv([row,funding]));
  assert.equal(transactions[1].amount,'25000');assert.equal(transactions[1].fee,'100');assert.equal(receipt.priceDifferences,1);
  assert.equal(receipt.records[0].displayedGross,'25003');assert.equal(brokerageCashMatches(receipt,transactions),true);
});

test('API draft validation re-parses raw broker input, rejects forged receipts and preserves legacy ledger input',()=>{
  const draft={name:'Imported account',asOf:'2026-09-18',csv:example,confirmed:true,bindings:[{symbol:'XDEMO',datasetId:'a'.repeat(64)}],importFormat:SCHWAB_FORMAT,brokerageOrder:'newest-first' as const,brokerageKind:'synthetic' as const};
  const parsed=validatePortfolioDraft(draft,'2026-09-26');assert.equal(parsed.importReceipt?.cashChange,'77897');
  assert.throws(()=>validatePortfolioDraft({...draft,importReceipt:{cashChange:'999'}},'2026-09-26'),/Complete the import/);
  assert.throws(()=>validatePortfolioDraft({...draft,brokerageOrder:'guess'},'2026-09-26'),/same-day/);
  assert.throws(()=>validatePortfolioDraft({...draft,brokerageKind:'authenticated'},'2026-09-26'),/historical or fictional/);
  const legacy={name:draft.name,asOf:draft.asOf,csv:ledgerCSV(parsed.transactions),confirmed:true,bindings:draft.bindings};
  assert.deepEqual(validatePortfolioDraft(legacy,'2026-09-26').transactions,parsed.transactions);
  assert.equal(readPortfolioCSV(legacy).importReceipt,undefined);
});

test('conversion certificates detect altered cash, fee and duplicate provenance records',async()=>{
  const s=await snapshot(),a=analyzePortfolio(s);
  for(const mutate of [(v:PortfolioSnapshot)=>{v.importReceipt!.records[0].netCash='1';},(v:PortfolioSnapshot)=>{v.importReceipt!.fees='0';},(v:PortfolioSnapshot)=>{v.importReceipt!.records[1]=v.importReceipt!.records[0];}]){
    const broken=structuredClone(s);mutate(broken);const c=portfolioCertificate(broken,a,null,'review');
    assert.equal(c.checks.find(v=>v.id==='brokerage-cash')?.status,'failed');assert.match(c.takeaway,/consistency check failed/);
  }
  s.bindings[0].dataset.kind='historical';assert.equal(portfolioCertificate(s,analyzePortfolio(s),null,'mixed').classification,'Contains fictional inputs');
});

test('row and byte limits prevent oversized brokerage imports',()=>{
  assert.throws(()=>parse(csv(Array.from({length:501},()=>funding))),/1–500 transactions/);
  assert.throws(()=>parse(' '.repeat(256*1024+1)),/256 KiB/);
});
