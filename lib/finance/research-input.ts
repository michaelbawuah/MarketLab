import { validateImport, priceDecimal, datasetId, MAX_OBSERVATIONS } from './market-data.ts';
import { validateActions } from './corporate-actions.ts';
import { validateResearchDraft, RESEARCH_METHOD, type ResearchSnapshot } from './research.ts';

/** Validate an exported snapshot at the separate service trust boundary. */
export async function validateResearchSnapshot(input:unknown):Promise<ResearchSnapshot> {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a research snapshot.');
  const s=input as ResearchSnapshot;
  if(Object.keys(s).sort().join(',')!=='asset,benchmark,config,method'||s.method!==RESEARCH_METHOD)throw new Error('Unsupported snapshot format.');
  validateResearchDraft(s.config);
  for(const role of ['asset','benchmark'] as const){
    const b=s[role];if(!b||typeof b!=='object'||Object.keys(b).sort().join(',')!=='actions,dataset')throw new Error('Invalid input binding.');
    const d=b.dataset,a=b.actions;
    if(!d||!a||!Array.isArray(d.observations)||d.observations.length<2||d.observations.length>MAX_OBSERVATIONS||d.currency!=='USD'||!Number.isSafeInteger(d.count)||d.count!==d.observations.length||typeof d.id!=='string'||!/^[a-f0-9]{64}$/.test(d.id))throw new Error('Invalid dataset snapshot.');
    const fields=['symbol','source','basis','priceColumn','kind','currency','observations','id','count','firstDate','lastDate','created','origin','providerRefreshed','providerTimezone'];
    if(Object.keys(d).some(k=>!fields.includes(k)))throw new Error('Unknown dataset field.');
    if(typeof d.created!=='string'||d.created.length>40||!Number.isFinite(Date.parse(d.created)))throw new Error('Invalid dataset timestamp.');
    if(d.origin!==undefined&&!['csv','alphavantage','alphavantage-browser'].includes(d.origin))throw new Error('Invalid dataset origin.');
    for(const value of [d.providerRefreshed,d.providerTimezone])if(value!==undefined&&value!==null&&(typeof value!=='string'||value.length>80))throw new Error('Invalid provider metadata.');
    const csv='date,close\n'+d.observations.map(p=>{if(!p||Object.keys(p).sort().join(',')!=='date,priceMicros'||typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||typeof p.priceMicros!=='string'||!/^[1-9]\d{0,12}$/.test(p.priceMicros))throw new Error('Invalid observation.');return `${p.date},${priceDecimal(p.priceMicros)}`;}).join('\n');
    const validated=validateImport({symbol:d.symbol,source:d.source,basis:d.basis,priceColumn:d.priceColumn,kind:d.kind,csv});
    if(JSON.stringify(validated.observations)!==JSON.stringify(d.observations)||d.firstDate!==d.observations[0].date||d.lastDate!==d.observations.at(-1)!.date)throw new Error('Snapshot dates must be ordered and match its coverage.');
    let expectedId=await datasetId(validated);
    if(d.origin==='alphavantage'||d.origin==='alphavantage-browser'){
      if(!d.providerRefreshed||!d.providerTimezone)throw new Error('Provider snapshots require their frozen provenance.');
      const provenance={origin:d.origin,refreshed:d.providerRefreshed,timezone:d.providerTimezone};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['marketlab-provider-v1',expectedId,provenance])));
      expectedId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    }
    if(d.id!==expectedId)throw new Error('Dataset fingerprint does not match its frozen observations and provenance.');
    if(Object.keys(a).sort().join(',')!=='complete,events,revision,source,updated'||!Number.isSafeInteger(a.revision)||a.revision<1||typeof a.updated!=='string'||a.updated.length>40||!Number.isFinite(Date.parse(a.updated)))throw new Error('Invalid event revision.');
    validateActions({source:a.source,complete:a.complete,events:a.events},d);
  }
  if(s.config.assetId!==s.asset.dataset.id||s.config.benchmarkId!==s.benchmark.dataset.id)throw new Error('Dataset IDs do not match the configuration.');
  return s;
}
