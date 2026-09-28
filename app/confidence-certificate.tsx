'use client';
import { useId } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { confidenceStatus, type ConfidenceCertificate as Certificate } from '@/lib/finance/confidence';

export default function ConfidenceCertificate({ certificate:c }: { certificate: Certificate }) {
  const id=useId(),failed=c.checks.some(v=>v.status==='failed'),internal=c.checks.filter(v=>v.id!=='independent-replay'),replay=c.independentReplay;
  return <section className={`confidence-certificate${failed?' confidence-failed':''}`} aria-labelledby={id}>
    <header><h2 id={id}><ClipboardCheck size={20}/> Confidence certificate</h2><span className="confidence-kind">{c.classification}</span></header>
    <p className="confidence-subject">{c.subject}</p>
    <p className="confidence-takeaway">{c.takeaway}</p>
    <div className="confidence-facts"><div><span>Coverage</span><strong>{c.coverage.observations} observations</strong><small>{c.coverage.start} to {c.coverage.end}</small></div><div><span>Internal consistency</span><strong>{confidenceStatus({...c,checks:internal})}</strong><small>{internal.filter(v=>v.status==='passed').length} passed · {internal.filter(v=>v.status==='failed').length} failed</small></div><div><span>Independent replay</span><strong>{replay?'Python replay passed':'No receipt attached'}</strong><small>{replay?<time dateTime={replay.verifiedAt}>{replay.verifiedAt.replace('T',' ').replace(/\.\d{3}Z$/,' UTC')}</time>:'Separate from project test results'}</small></div></div>
    <details><summary>View sources, checks & limitations</summary>
      <h3>Checks on this result</h3><ul className="confidence-checks">{c.checks.map(v=><li key={v.id}><div><strong>{v.label}</strong><span data-status={v.status}>{v.status==='passed'?'Passed':v.status==='failed'?'Failed':'Not run'}</span></div><p>{v.detail}</p></li>)}</ul>
      <h3>Input sources</h3><div className="confidence-sources">{c.sources.length?c.sources.map((s,i)=><article key={i}><strong>{s.role} · {s.symbol}</strong><p>{s.source}</p><p>{s.kind==='synthetic'?'Fictional prices':'Declared historical prices'} · {s.basis} · {s.observations} closes</p><p>{s.firstDate} to {s.lastDate} · {s.origin}</p><p>Events: {s.events}</p>{s.id&&<code>{s.id}</code>}</article>):<p>Cash ledger only; no price series is used.</p>}</div>
      <h3>Assumptions</h3><ul>{c.assumptions.map(v=><li key={v}>{v}</li>)}</ul>
      <h3>What remains uncertain</h3><ul>{c.limitations.map(v=><li key={v}>{v}</li>)}</ul>
      {replay&&<p className="confidence-reference">Verifier: {replay.verifierVersion}<br/>Verifier source SHA-256: <code>{replay.verifierSha256}</code><br/>{replay.comparedFields} comparisons across the complete saved experiment.</p>}
      <p>Longest gap: {c.coverage.longestGapDays} calendar days. Exchange-session completeness is not assessed.</p>
      <p className="confidence-reference">Method: {c.method}<br/>Report reference: <code>{c.reference}</code><br/>{c.version}</p>
    </details>
    <p className="confidence-boundary">A record of checks and limitations, not a forecast or guarantee.</p>
  </section>;
}
