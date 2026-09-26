import { z } from 'zod';
import { parseDecimal, tradeValue, type Transaction } from './core.ts';
import { FIRST_DATE,LAST_DATE,assets } from './demo.ts';
const decimal=z.string().regex(/^\d{1,7}(\.\d{1,6})?$/);
export const inputSchema=z.object({id:z.string().uuid(),version:z.number().int().nonnegative().max(500),kind:z.enum(['buy','sell','deposit','withdrawal','dividend']),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),symbol:z.string().max(6),shares:decimal,price:decimal,amount:decimal,fee:decimal}).strict();
export function normalizeTransaction(input:unknown):{transaction:Transaction;version:number}{
 const result=inputSchema.safeParse(input);if(!result.success)throw new Error('Check the transaction fields and try again.');
 const v=result.data;
 if(v.date<FIRST_DATE||v.date>LAST_DATE||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date)throw new Error('Choose a valid date from Apr 1 through Sep 24, 2026.');
 const trade=v.kind==='buy'||v.kind==='sell';
 if((trade||v.kind==='dividend')&&!assets.some(a=>a.symbol===v.symbol))throw new Error('Choose a supported asset.');
 const units=trade?parseDecimal(v.shares,6):0n;
 const price=trade?parseDecimal(v.price):0n;
 if(trade&&(!units||!price))throw new Error('Shares and price must be greater than zero.');
 const amount=trade?tradeValue(String(units),String(price)):parseDecimal(v.amount);
 const fee=trade?parseDecimal(v.fee):0n;
 if(amount<=0n||amount>1000000000n||fee>100000000n)throw new Error('Amount must be between $0.01 and $10 million; fees cannot exceed $1 million.');
 return {version:v.version,transaction:{id:v.id,date:v.date,kind:v.kind,symbol:trade||v.kind==='dividend'?v.symbol:'',units:String(units),amount:String(amount),fee:String(fee)}};
}
