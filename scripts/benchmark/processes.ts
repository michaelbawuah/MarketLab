import { fork, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { ServiceConfig } from '../../services/research/server.ts';

export async function stopProcess(child: ChildProcess, graceful = false) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  if (graceful && child.connected) child.send({ type: 'stop' }); else child.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), delay(8000, false, { ref: false })]);
  if (!stopped) { child.kill('SIGKILL'); await exited; }
}

export async function startMongo(binary: string, authenticated=false) {
  const directory = await mkdtemp(join(tmpdir(), 'marketlab-benchmark-'));
  let child: ChildProcess | undefined;
  try {
    const reservation = createServer();
    await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    child = spawn(binary, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--nounixsocket', '--wiredTigerCacheSizeGB', '0.25', '--setParameter', 'diagnosticDataCollectionEnabled=false',...(authenticated?['--auth']:[])], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr!.on('data', () => {});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Disposable MongoDB startup timed out.')), 20000);
      let tail = '';
      child!.once('error', () => { clearTimeout(timer); reject(new Error('Could not start mongod. Set MONGOD_BIN to an installed MongoDB executable.')); });
      child!.once('exit', () => { clearTimeout(timer); reject(new Error('Disposable MongoDB exited during startup.')); });
      child!.stdout!.on('data', chunk => { tail = (tail + chunk.toString()).slice(-8192); if (tail.includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
    });
    return { uri: `mongodb://127.0.0.1:${port}`, pid:child.pid!, async close() { await stopProcess(child!); await rm(directory, { recursive: true, force: true }); } };
  } catch (e) { if (child) await stopProcess(child); await rm(directory, { recursive: true, force: true }); throw e; }
}

export function messageFrom<T extends { type: string }>(child: ChildProcess, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exit); child.off('error', error); };
    const message = (value: unknown) => { const data = value as T; if (data?.type === type) { cleanup(); resolve(data); } else if (data?.type === 'failure') { cleanup(); reject(new Error('Benchmark service helper failed.')); } };
    const exit = () => { cleanup(); reject(new Error('Benchmark service process exited unexpectedly.')); };
    const error = () => { cleanup(); reject(new Error('Benchmark service process could not start.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Service ${type} response timed out.`)); }, 15000);
    child.on('message', message); child.once('exit', exit); child.once('error', error);
  });
}

export async function startService(config: ServiceConfig) {
  const child = fork(fileURLToPath(new URL('./service-child.ts', import.meta.url)), [], { execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let diagnosticLines = 0;
  for (const stream of [child.stdout!, child.stderr!]) stream.on('data', chunk => { diagnosticLines += chunk.toString().split('\n').filter(Boolean).length; });
  try {
    const ready = messageFrom<{ type: 'ready'; port: number }>(child, 'ready'); child.send({ type: 'start', config });
    const { port } = await ready;
    return { child, origin: `http://127.0.0.1:${port}`, diagnostics: () => diagnosticLines, close: () => stopProcess(child, true) };
  } catch (e) { await stopProcess(child); throw e; }
}
