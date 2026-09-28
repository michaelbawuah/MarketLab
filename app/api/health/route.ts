import { database,json } from '@/lib/server';
export async function GET(){const checkedAt=new Date().toISOString();try{await database().prepare('SELECT 1 AS ok').first();return json({status:'available',website:'responding',savedData:'responding',checkedAt});}catch{return json({status:'degraded',website:'responding',savedData:'unavailable',checkedAt},503);}}
