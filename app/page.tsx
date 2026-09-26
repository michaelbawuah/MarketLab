import Dashboard from './workspace';
import { initialWorkspace } from '@/lib/finance/demo';
export default function Page() { return <Dashboard initial={initialWorkspace()}/>; }
