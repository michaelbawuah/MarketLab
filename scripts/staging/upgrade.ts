/** One operator-approved migration, then staging acceptance. Remove the two
 * migration variables and restore the ordinary start command after success. */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { JobStore } from '../../services/research/store.ts';
import { configFromEnv,createResearchService } from '../../services/research/server.ts';
let phase='configuration',service:Awaited<ReturnType<typeof createResearchService>>|undefined;
try{
  const config=configFromEnv(),username=process.env.RESEARCH_MIGRATION_USERNAME,password=process.env.RESEARCH_MIGRATION_PASSWORD;
  delete process.env.RESEARCH_MIGRATION_USERNAME;delete process.env.RESEARCH_MIGRATION_PASSWORD;
  if(process.env.RESEARCH_DEPLOYMENT_STAGE!=='staging'||!username||!password)throw new Error('Operator migration configuration is required.');
  const operator=new URL(config.uri);operator.username=username;operator.password=password;operator.searchParams.set('authSource','admin');
  const store=new JobStore(config.uri,config.database,'',config.admission);
  phase='admission migration';try{await store.initialize(operator.href);}finally{await store.close();}
  console.log('research_admission_migration_complete');
  phase='service startup';service=await createResearchService(config);
  await new Promise<void>(resolve=>service!.server.listen(config.port,config.host,resolve));
  let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void service!.close().then(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);
  phase='staging acceptance';const output='/tmp/marketlab-admission-acceptance.json';
  const child=spawn(process.execPath,['--experimental-strip-types','scripts/staging/check.ts','staging',output],{stdio:'inherit',env:process.env});
  const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)throw new Error('Staging acceptance did not pass.');
  console.log('research_admission_acceptance_receipt '+(await readFile(output,'utf8')).trim());
}catch{await service?.close();console.error('research_admission_upgrade_failed phase='+phase);process.exitCode=1;}
