/** Operator-only child; the production server never imports this module. */
import { JobStore } from '../../services/research/store.ts';
import { ComputePool, type ComputeResult } from '../../services/research/pool.ts';
import { JobRunner } from '../../services/research/runner.ts';
import type { ResearchSnapshot } from '../../lib/finance/research.ts';

const [prefix, leaseText] = process.argv.slice(2), leaseMs = Number(leaseText);
if (!process.send || !['ci', 'staging'].includes(process.env.RESEARCH_DEPLOYMENT_STAGE ?? '') || !/^acceptance_[a-f0-9]{32}_$/.test(prefix ?? '') || ![1000, 60000].includes(leaseMs)) throw new Error('Run this child only through the acceptance command.');
class BarrierPool extends ComputePool {
  async run(snapshot: ResearchSnapshot): Promise<ComputeResult> {
    await super.run(snapshot); // Actual production worker and C++ verification.
    process.send!({ type: 'calculated-before-finalization' });
    return new Promise<ComputeResult>(() => {});
  }
}
const store = new JobStore(process.env.MONGODB_URI!, process.env.MONGODB_DATABASE ?? 'marketlab', prefix);
await store.initialize();
new JobRunner(store, new BarrierPool(1, 'cpp-verify'), leaseMs).start();
