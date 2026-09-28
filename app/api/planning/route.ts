import { database,identity,json,failure,requestBody,HttpError } from '@/lib/server';
import { loadPlan } from '@/lib/planning/store';
import { validatePlan, aggregate, goalResult, planScore } from '@/lib/planning/core';
export async function GET(request:Request){try{const result=await loadPlan(await identity());if(new URL(request.url).searchParams.get('download')==='1'){const total=aggregate(result.plan,result.portfolio);return new Response(JSON.stringify({format:'marketlab-planning-v1',...result,total,goals:result.plan.goals.map(g=>({goal:g,result:goalResult(g,total)})),score:planScore(total,result.plan),assumptions:'Hypothetical constant nominal annual return divided monthly; end-of-month contributions; fees deducted monthly after growth; amounts rounded to cents. No tax, inflation adjustment to target, or automatic balance refresh. Goals use overlapping accounts independently.'},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="marketlab-my-plan.json"','Cache-Control':'private, no-store'}});}return json(result);}catch(e){return failure(e);}}
export async function POST(request:Request){try{const owner=await identity(),body=await requestBody(request,65536) as Record<string,unknown>;
 if(!body||Object.keys(body).some(k=>!['revision','plan'].includes(k))||!Number.isSafeInteger(body.revision)||(body.revision as number)<0)throw new HttpError('Reload your plan and try saving again.');
 let plan;try{plan=validatePlan(body.plan);}catch(e){throw new HttpError((e as Error).message);}
 const revision=body.revision as number,updated=new Date().toISOString(),payload=JSON.stringify(plan),db=database();
 const r=revision===0?await db.prepare('INSERT OR IGNORE INTO planning_workspaces (owner,revision,updated,payload) VALUES (?,1,?,?)').bind(owner,updated,payload).run():await db.prepare('UPDATE planning_workspaces SET revision=revision+1,updated=?,payload=? WHERE owner=? AND revision=?').bind(updated,payload,owner,revision).run();
 if(!r.meta.changes)throw new HttpError('Your plan changed in another tab. Reload it before saving your changes.',409);
 return json({revision:revision+1,updated,plan});
 }catch(e){return failure(e);}}
