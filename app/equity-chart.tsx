'use client';
import { useEffect,useId,useMemo,useRef,useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import type { ResearchSegment } from '@/lib/finance/research';
import type { ActionDraft } from '@/lib/finance/corporate-actions';
import { equityEvents,groupEquityEvents,type EquityEventGroup } from '@/lib/finance/equity-events';
import './equity-chart.css';
const series=[{key:'strategy',name:'SMA strategy',color:'#20775b'},{key:'buyHold',name:'Asset buy & hold',color:'#a47722'},{key:'benchmark',name:'Benchmark',color:'#657fb5'}] as const;
const glyph={start:'•',buy:'B',sell:'S',split:'↔',dividend:'D'};
function EventDetails({group}:{group:EquityEventGroup}) {
  const [page,setPage]=useState(0),items=group.events.slice(page*20,(page+1)*20);
  return <section className="equity-event-details" aria-label="Selected strategy events"><header><strong>{group.events.length===1?'Recorded event':`${group.events.length} recorded events`}</strong><span>{group.firstDate}{group.lastDate!==group.firstDate?` → ${group.lastDate}`:''}</span></header>
    <ul>{items.map(event=><li key={event.id}><span className={`event-kind event-kind-${event.kind}`}>{event.kind==='start'?'START':event.kind.toUpperCase()}</span><div><h3>{event.title}</h3><p>{event.detail}</p><small>Effective {event.date}{event.observedDate!==event.date?` · first supplied valuation after this event: ${event.observedDate}`:' · marked at that day’s supplied close'}</small></div></li>)}</ul>
    {group.events.length>20&&<div className="equity-event-pagination"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous events</Button><span>{page*20+1}–{Math.min((page+1)*20,group.events.length)} of {group.events.length}</span><Button variant="outline" disabled={(page+1)*20>=group.events.length} onClick={()=>setPage(p=>p+1)}>Next events</Button></div>}
  </section>;
}
export default function EquityChart({part,initial,events=[]}:{part:ResearchSegment;initial:string;events?:ActionDraft[]}) {
  const id=useId(),container=useRef<HTMLDivElement>(null),[width,setWidth]=useState(800),[show,setShow]=useState(true),[selected,setSelected]=useState('');
  useEffect(()=>{if(!container.current)return;const observer=new ResizeObserver(entries=>{const value=entries[0]?.contentRect.width;if(value)setWidth(value);});observer.observe(container.current);return()=>observer.disconnect();},[]);
  const annotations=useMemo(()=>equityEvents(part,events,initial),[part,events,initial]);
  const groups=useMemo(()=>groupEquityEvents(annotations,part.start,part.end,Math.max(2,Math.min(24,Math.floor(width*.85/48)))),[annotations,part.start,part.end,width]);
  const active=groups.find(g=>g.events.some(e=>e.id===selected));
  const rows=part.strategy.history,values=series.flatMap(s=>part[s.key].history.map(p=>Number(p.value)/100)),lo=Math.min(Number(initial),...values),hi=Math.max(Number(initial),...values),pad=Math.max((hi-lo)*.18,1);
  // Use CSS-pixel chart coordinates so labels and hit areas stay readable on
  // narrow screens instead of scaling an 850px desktop drawing down to 280px.
  const chartWidth=Math.max(180,width),left=Math.min(100,Math.max(62,hi.toLocaleString('en-US',{maximumFractionDigits:0}).length*8+16)),right=chartWidth-22;
  const start=Date.parse(part.start),end=Date.parse(part.end),x=(i:number)=>left+(Date.parse(rows[i].date)-start)/Math.max(1,end-start)*(right-left),y=(v:number)=>24+(hi+pad-v)/(hi-lo+2*pad)*215;
  const markerScale=1,hitRadius=22;
  return <div className="equity-chart" ref={container}>
    <div className="equity-legend">{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.name}</span>)}</div>
    <svg viewBox={`0 0 ${chartWidth} 285`} role="group" aria-label={`Hypothetical wealth from ${part.start} to ${part.end}. Strategy event markers are selectable; the event selector below provides the same details.`}>
      {[0,.5,1].map(f=>{const v=lo+(hi-lo)*f;return <g key={f}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#e3e9e5" strokeDasharray="3 5"/><text x={left-10} y={y(v)+4} textAnchor="end" fontSize="13" fill="#536b5c">{v.toLocaleString('en-US',{maximumFractionDigits:0})}</text></g>;})}
      {series.slice().reverse().map(s=><path key={s.key} d={part[s.key].history.map((p,i)=>`${i?'L':'M'}${x(i)},${y(Number(p.value)/100)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={s.key==='strategy'?3:2} strokeDasharray={s.key==='benchmark'?'6 4':undefined}/>)}
      {show&&groups.map(g=>{const event=g.events[0],cx=x(g.pointIndex),cy=y(Number(rows[g.pointIndex].value)/100),label=`${g.events.length} ${g.events.length===1?'event':'events'} from ${g.firstDate}${g.lastDate!==g.firstDate?` to ${g.lastDate}`:''}`;return <g key={g.id} className={`equity-marker${active?.id===g.id?' is-selected':''}`} role="button" tabIndex={0} aria-label={label} aria-pressed={active?.id===g.id} onClick={()=>setSelected(g.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(g.id);}}}>
        <title>{label}</title><circle cx={cx} cy={cy} r={hitRadius} fill="transparent"/><circle className="equity-marker-dot" cx={cx} cy={cy} r={12*markerScale} fill={event.kind==='buy'?'#20775b':event.kind==='sell'?'#935937':'#536888'} stroke="white" strokeWidth={2*markerScale}/><text x={cx} y={cy+4*markerScale} fontSize={12*markerScale} fill="white" textAnchor="middle" fontWeight="600" pointerEvents="none">{g.events.length>99?'99+':g.events.length>1?g.events.length:glyph[event.kind]}</text>
      </g>;})}
      <text x="0" y="278" fontSize="13" fill="#536b5c">{part.start}</text><text x={chartWidth} y="278" fontSize="13" fill="#536b5c" textAnchor="end">{part.end}</text>
    </svg>
    <div className="equity-event-controls"><label className="equity-event-toggle"><Checkbox checked={show} onCheckedChange={v=>setShow(v===true)}/> Show strategy events</label><span>{annotations.length} events · nearby markers are grouped</span></div>
    {show&&<><label className="equity-event-picker" htmlFor={`events-${id}`}>Inspect an event<NativeSelect id={`events-${id}`} value={active?.id??''} onChange={e=>setSelected(e.target.value)}><option value="">Choose a marker or event group…</option>{groups.map(g=><option key={g.id} value={g.id}>{g.firstDate}{g.lastDate!==g.firstDate?` → ${g.lastDate}`:''} · {g.events.length===1?g.events[0].title:`${g.events.length} events`}</option>)}</NativeSelect></label>
      <div aria-live="polite">{active?<EventDetails key={`${active.id}:${active.events.length}`} group={active}/>:<p className="equity-event-hint">B = buy · S = sell · D = dividend · ↔ = split. Select a marker to trace its date, cash effect and execution assumptions.</p>}</div>
    </>}
    <p className="equity-event-caveat">Markers describe strategy executions and declared corporate events. They do not explain every price move. Events between supplied closes appear at the next valuation and retain their original dates.</p>
  </div>;
}
