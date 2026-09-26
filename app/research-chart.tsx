'use client';
import { useId, useState } from 'react';
import { basisLabels, type DatasetInput } from '@/lib/finance/market-data';
const price = (s: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(s) / 1e6);

export default function ResearchChart({ dataset }: { dataset: DatasetInput }) {
  const id = useId().replaceAll(':', ''), points = dataset.observations;
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map(p => Number(p.priceMicros) / 1e6), dates = points.map(p => Date.parse(p.date));
  const min = Math.min(...values), max = Math.max(...values), pad = Math.max((max - min) * .18, max * .005);
  const x = (i: number) => 84 + (dates[i] - dates[0]) / (dates.at(-1)! - dates[0]) * 756;
  const y = (v: number) => 16 + (max + pad - v) / (max - min + pad * 2) * 224;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const index = Math.min(hover ?? points.length - 1, points.length - 1);
  return <div className="research-chart">
    <div className="research-chart-readout"><span>{points[index].date}</span><strong>{price(points[index].priceMicros)}</strong><span>USD · {basisLabels[dataset.basis]}</span></div>
    <svg viewBox="0 0 860 280" role="img" aria-label={`${dataset.symbol} supplied prices, ${points[0].date} to ${points.at(-1)!.date}. Values are also available in the observations table and CSV export.`}
      onPointerMove={e => { const bounds = e.currentTarget.getBoundingClientRect(); const target = (e.clientX - bounds.left) / bounds.width * 860; let nearest = 0; for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - target) < Math.abs(x(nearest) - target)) nearest = i; setHover(nearest); }} onPointerLeave={() => setHover(null)}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20775b" stopOpacity=".17"/><stop offset="100%" stopColor="#20775b" stopOpacity="0"/></linearGradient></defs>
      {[0, .33, .66, 1].map(f => { const value = min + (max - min) * f; return <g key={f}><line x1="84" x2="840" y1={y(value)} y2={y(value)} stroke="#e3e9e5" strokeDasharray="3 5"/><text x="72" y={y(value) + 4} textAnchor="end" fill="#607367" fontSize="12">{value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 })}</text></g>; })}
      <path d={`${line} L840,245 L84,245 Z`} fill={`url(#${id})`}/><path d={line} stroke="#20775b" strokeWidth="2.5" fill="none"/>
      {hover !== null && <g><line x1={x(index)} x2={x(index)} y1="10" y2="245" stroke="#9fb7a8" strokeDasharray="4 4"/><circle cx={x(index)} cy={y(values[index])} r="5" fill="#20775b" stroke="white" strokeWidth="2"/></g>}
      <text x="84" y="270" fill="#607367" fontSize="12">{points[0].date}</text><text x="840" y="270" textAnchor="end" fill="#607367" fontSize="12">{points.at(-1)!.date}</text>
    </svg>
  </div>;
}

