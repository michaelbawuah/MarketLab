'use client';
import { useId } from 'react';
import { ShieldCheck, CircleAlert } from 'lucide-react';
import { confidenceStatus, type ConfidenceCertificate as Certificate } from '@/lib/finance/confidence';

export default function ConfidenceCertificate({ certificate:c }: { certificate: Certificate }) {
  const id=useId(),failed=c.checks.some(v=>v.status==='failed'),internal=c.checks.filter(v=>v.id!=='independent-replay'),replay=c.independentReplay;
  const verified=!!replay&&!failed, checked=internal.length>0&&internal.every(v=>v.status==='passed');
  const fictional=c.sources.some(s=>s.kind==='synthetic');
  return <section className={`confidence-certificate${failed?' confidence-failed':''}`} aria-labelledby={id}>
    <div className="trust-summary"><span className={`trust-badge${failed?' trust-warning':''}`}>{failed?<CircleAlert size={17}/>:<ShieldCheck size={17}/>}<strong>{failed?'Needs a closer look':verified?'Independently verified':checked?'Calculation checks passed':'Checks available'}</strong></span><span className="trust-date">{fictional?'Sample data':'Report'} through {c.coverage.end}</span>{fictional&&<span className="sample-label">Fictional example</span>}</div>
    <h2 id={id} className="sr-only">Confidence certificate</h2>
    <p className="confidence-takeaway">{c.takeaway.replace(/observations/g,'price dates')}</p>
    <details><summary>Details &amp; checks</summary>
      <p className="confidence-subject">{c.subject} · {c.classification}</p>
      <p>{verified?'Verified against an independent calculation.':failed?'A check needs attention. Review the evidence below before relying on this result.':'These checks confirm internal consistency; an independent calculation has not been attached.'} Historical results do not predict future returns.</p>
      <div className="confidence-facts"><div><span>Coverage</span><strong>{c.coverage.observations} observations</strong><small>{c.coverage.start} to {c.coverage.end}</small></div><div><span>Internal consistency</span><strong>{confidenceStatus({...c,checks:internal})}</strong><small>{internal.filter(v=>v.status==='passed').length} passed · {internal.filter(v=>v.status==='failed').length} failed</small></div><div><span>Independent replay</span><strong>{replay?'Python replay passed':'No receipt attached'}</strong><small>{replay?<time dateTime={replay.verifiedAt}>{replay.verifiedAt.replace('T',' ').replace(/\.\d{3}Z$/,' UTC')}</time>:'Separate from project test results'}</small></div></div>
      <h3>Checks on this result</h3><ul className="confidence-checks">{c.checks.map(v=><li key={v.id}><div><strong>{v.label}</strong><span data-status={v.status}>{v.status==='passed'?'Passed':v.status==='failed'?'Failed':'Not run'}</span></div><p>{v.detail}</p></li>)}</ul>
      <h3>Input sources</h3><div className="confidence-sources">{c.sources.length?c.sources.map((s,i)=><article key={i}><strong>{s.role} · {s.symbol}</strong><p>{s.source}</p><p>{s.kind==='synthetic'?'Fictional prices':'Declared historical prices'} · {s.basis} · {s.observations} closes</p><p>{s.firstDate} to {s.lastDate} · {s.origin}</p><p>Events: {s.events}</p>{s.id&&<code>{s.id}</code>}</article>):<p>Cash ledger only; no price series is used.</p>}</div>
      <h3>Assumptions</h3><ul>{c.assumptions.map(v=><li key={v}>{v}</li>)}</ul>
      <h3>What remains uncertain</h3><ul>{c.limitations.map(v=><li key={v}>{v}</li>)}</ul>
      {replay&&<p className="confidence-reference">Verifier: {replay.verifierVersion}<br/>Verifier source SHA-256: <code>{replay.verifierSha256}</code><br/>{replay.comparedFields} comparisons across the complete saved experiment.</p>}
      <p>Longest gap: {c.coverage.longestGapDays} calendar days. Exchange-session completeness is not assessed.</p>
      <p className="confidence-reference">Method: {c.method}<br/>Report reference: <code>{c.reference}</code><br/>{c.version}</p>
    </details>
  </section>;
}
