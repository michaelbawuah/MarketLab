import { database } from '../server';
import { analyzePortfolio, type PortfolioSnapshot } from '../finance/historical-portfolio';
import { emptyPlan, type Plan, type SavedPlan } from './core';
export async function loadPlan(owner:string):Promise<SavedPlan>{
 const db=database(),[plan,portfolio]=await Promise.all([
 db.prepare('SELECT revision,updated,payload FROM planning_workspaces WHERE owner=?').bind(owner).first<{revision:number;updated:string;payload:string}>(),
 db.prepare('SELECT payload FROM historical_portfolios WHERE owner=?').bind(owner).first<{payload:string}>()]);
 const snapshot=portfolio?JSON.parse(portfolio.payload) as PortfolioSnapshot:null;
 return {revision:plan?.revision??0,updated:plan?.updated??null,plan:plan?JSON.parse(plan.payload) as Plan:emptyPlan(),portfolio:snapshot?{name:snapshot.name,asOf:snapshot.asOf,analysis:analyzePortfolio(snapshot)}:null};
}
