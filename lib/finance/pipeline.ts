import type { Quote } from './core.ts';
import { assets, demoQuotes } from './demo.ts';
export function validateDataset(quotes:Quote[]){
 const expected=new Set(demoQuotes().map(q=>q.symbol+':'+q.date));
 const seen=new Set<string>();
 for(const q of quotes){const key=q.symbol+':'+q.date;
  if(!assets.some(a=>a.symbol===q.symbol)||!expected.has(key)||!/^\d+$/.test(q.close)||BigInt(q.close)<=0n||BigInt(q.close)>100000000n)throw new Error(`Invalid observation ${key}.`);
  if(seen.has(key))throw new Error(`Duplicate observation ${key}.`);seen.add(key);
 }
 if(seen.size!==expected.size)throw new Error(`Incomplete dataset: ${seen.size} of ${expected.size} observations.`);
 return quotes;
}
