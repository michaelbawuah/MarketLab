import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkedReplayReceipt, replayDigest, REPLAY_MAX_BYTES, REPLAY_VERSION, type ReplayReceipt } from '../../lib/finance/replay-receipt.ts';
import { RESEARCH_METHOD } from '../../lib/finance/research.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';
import { ServiceError } from './store.ts';

const script=fileURLToPath(new URL('../../verification/python/verify_research.py',import.meta.url));
// One subprocess per service process. No shell, user paths, secrets or temp files.
export class PythonReplay {
  private busy=false;
  private timeoutMs:number;
  constructor(timeoutMs=8000){this.timeoutMs=Math.max(1,Math.min(timeoutMs,8000));}
  async verify(raw:Buffer):Promise<ReplayReceipt> {
    if(raw.length>REPLAY_MAX_BYTES)throw new ServiceError('Report exceeds the replay limit.',413);
    if(this.busy)throw new ServiceError('Independent replay is busy. Retry shortly.',429);
    this.busy=true;
    try {
      let input;
      try {
        input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        if(!input||Object.keys(input).sort().join(',')!=='analysis,format,id,snapshot'||input.format!=='marketlab-research-v1'||typeof input.id!=='string'||!/^[a-f0-9]{64}$/.test(input.id))throw new Error();
        await validateResearchSnapshot(input.snapshot);
      } catch {throw new ServiceError('Invalid full research report.',400);}
      const verifierSha256=await replayDigest(await readFile(script,'utf8'));
      const output=await new Promise<string>((resolve,reject)=>{
        const child=spawn('python3',['-I','-S','-B',script,'--stdin'],{env:{NODE_ENV:'production',PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
        let stdout='',size=0,failed=false;
        const kill=()=>{failed=true;child.kill('SIGKILL');};
        const timer=setTimeout(kill,this.timeoutMs);
        child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384)kill();else stdout+=chunk.toString('utf8');});
        child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384)kill();});
        child.stdin.on('error',()=>{ /* EPIPE is handled by the child's close result. */ });
        child.once('error',()=>{failed=true;});
        child.once('close',code=>{clearTimeout(timer);if(failed||code!==0)reject(new ServiceError(code===1&&!failed?'Independent replay did not match the saved report.':'Independent replay is temporarily unavailable.',code===1&&!failed?422:503));else resolve(stdout);});
        child.stdin.end(raw);
      });
      let summary;try{summary=JSON.parse(output);}catch{throw new ServiceError('Invalid independent replay response.',503);}
      const digest=await replayDigest(raw.toString('utf8'));
      if(summary.format!=='marketlab-python-verification-v1'||summary.method!==RESEARCH_METHOD||summary.id!==input.id||summary.inputDigest!==digest)throw new ServiceError('Independent replay binding failed.',503);
      const receipt=checkedReplayReceipt({format:'marketlab-replay-receipt-v1',verified:summary.verified,reportId:summary.id,reportDigest:digest,verifiedAt:new Date().toISOString(),verifierVersion:REPLAY_VERSION,verifierSha256,segments:summary.segments,simulations:summary.simulations,comparedFields:summary.comparedFields,exactAccounting:summary.exactAccounting,floatAbsoluteTolerance:summary.floatAbsoluteTolerance,floatRelativeTolerance:summary.floatRelativeTolerance},input.id,digest);
      if(!receipt)throw new ServiceError('Invalid independent replay response.',503);
      return receipt;
    } finally {this.busy=false;}
  }
}
