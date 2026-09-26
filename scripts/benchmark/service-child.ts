import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createResearchService, type ServiceConfig } from '../../services/research/server.ts';
import type { AddressInfo } from 'node:net';

if (!process.send) throw new Error('This benchmark helper requires a parent IPC channel.');
let service: Awaited<ReturnType<typeof createResearchService>> | undefined;
let start = 0, cpu = process.cpuUsage(), peakRss = 0;
const lag = monitorEventLoopDelay({ resolution: 10 });
let sampler: NodeJS.Timeout | undefined;
process.on('message', async (message: { type: string; config?: ServiceConfig }) => {
  try {
    if (message.type === 'start' && !service && message.config) {
      const config = message.config;
      if (!/^mongodb:\/\/127\.0\.0\.1:\d+$/.test(config.uri) || !/^marketlab_benchmark_[a-f0-9]+$/.test(config.database) || config.host !== '127.0.0.1' || config.port !== 0) throw new Error('Benchmark requires isolated loopback configuration.');
      service = await createResearchService(config);
      await new Promise<void>(resolve => service!.server.listen(0, '127.0.0.1', resolve));
      process.send!({ type: 'ready', port: (service.server.address() as AddressInfo).port });
    } else if (message.type === 'measure' && service && !sampler) {
      cpu = process.cpuUsage(); start = performance.now(); peakRss = process.memoryUsage().rss;
      lag.reset(); lag.enable(); sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
      process.send!({ type: 'measuring' });
    } else if (message.type === 'metrics' && service && sampler) {
      clearInterval(sampler); sampler = undefined; lag.disable();
      const usage = process.cpuUsage(cpu);
      process.send!({ type: 'metrics', elapsedMs: performance.now() - start,
        cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
        sampledPeakRssBytes: Math.max(peakRss, process.memoryUsage().rss), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
        eventLoopDelayP99Ms: lag.percentile(99) / 1e6, eventLoopDelayMaxMs: lag.max / 1e6 });
    } else if (message.type === 'stop') {
      if (sampler) clearInterval(sampler); lag.disable(); await service?.close(); process.exit(0);
    }
  } catch { process.send!({ type: 'failure', error: 'Benchmark service helper failed.' }); process.exitCode = 1; }
});
