import { spawn } from 'node:child_process';
import { mkdtemp,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
const directory=await mkdtemp(join(tmpdir(),'marketlab-test-'));
const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
const mongo=spawn(process.env.MONGOD_BIN||'mongod',['--dbpath',directory,'--bind_ip','127.0.0.1','--port',String(port),'--nounixsocket','--wiredTigerCacheSizeGB','0.25','--setParameter','diagnosticDataCollectionEnabled=false'],{stdio:['ignore','pipe','pipe']});
const exited=new Promise(r=>mongo.once('exit',r));
try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Local MongoDB did not become ready.')),15000);mongo.once('error',e=>{clearTimeout(timeout);reject(e);});mongo.once('exit',code=>{clearTimeout(timeout);reject(new Error(`MongoDB exited during startup (${code}).`));});mongo.stdout.on('data',chunk=>{if(chunk.toString().includes('Waiting for connections')){clearTimeout(timeout);resolve();}});});
  console.log('Running integration checks against a real disposable MongoDB process.');
  const args=process.argv.slice(2);
  const files=(await readdir('tests/integration')).filter(name=>name.endsWith('.test.ts')).sort().map(name=>`tests/integration/${name}`);
  const ci=args[0]==='--ci';
  const command=ci?['verify:ci']:['--experimental-strip-types','--test',...(args.length?args:files)];
  const test=spawn(ci?'pnpm':process.execPath,command,{stdio:'inherit',env:{...process.env,MONGODB_TEST_URI:`mongodb://127.0.0.1:${port}`}});
  process.exitCode=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});
}finally{mongo.kill('SIGTERM');if(mongo.pid)await exited;await rm(directory,{recursive:true,force:true});}
