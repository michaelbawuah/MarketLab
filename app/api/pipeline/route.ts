import { DATASET,demoQuotes } from '@/lib/finance/demo';
import { validateDataset } from '@/lib/finance/pipeline';
import { identity,database,json,failure,requestBody } from '@/lib/server';
export async function POST(request:Request){
 let owner='',id='',started='',records=0,inserted=0;const clock=Date.now();
 try{
  owner=await identity();await requestBody(request);
  const db=database();id=crypto.randomUUID();started=new Date().toISOString();
  await db.prepare('INSERT INTO runs (id, owner, started, status, records, inserted, duration, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,owner,started,'running',0,0,0,'Validating dataset').run();
  const quotes=validateDataset(demoQuotes());records=quotes.length;
  // Each batch is transactional; a unique primary key makes partial-run recovery safe.
  for(let i=0;i<quotes.length;i+=50){
   const results=await db.batch(quotes.slice(i,i+50).map(q=>db.prepare('INSERT OR IGNORE INTO prices (dataset, symbol, date, close) VALUES (?, ?, ?, ?)').bind(DATASET,q.symbol,q.date,q.close)));
   inserted+=results.reduce((n,r)=>n+(r.meta.changes??0),0);
  }
  const message=inserted?`${inserted} observations added; ${records-inserted} already stored.`:`All ${records} observations already stored. No duplicates added.`;
  await db.prepare('UPDATE runs SET status = ?, records = ?, inserted = ?, duration = ?, message = ? WHERE id = ? AND owner = ?').bind('completed',records,inserted,Date.now()-clock,message,id,owner).run();
  return json({id,records,inserted,message});
 }catch(e){
  if(id)try{await database().prepare('UPDATE runs SET status = ?, records = ?, inserted = ?, duration = ?, message = ? WHERE id = ? AND owner = ?').bind('failed',records,inserted,Date.now()-clock,'Ingestion interrupted. Replay to safely resume.',id,owner).run();}catch(logError){console.error('Could not record failed run',logError);}
  return failure(e);
 }
}
