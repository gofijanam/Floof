import { useId, useMemo, useRef, useState } from 'react'
import { fmtPrice } from '../lib/format'

/** Rounded neon area chart: catmull-rom smoothing, gradient stroke + glow, crosshair. Cheap SVG, no libs. */
export function NeonChart({ data, height = 320, clearing, label = 'Price (SOL)' }: { data: number[]; height?: number; clearing?: number; label?: string }) {
  const id = useId().replace(/:/g, '')
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 1000, H = height
  const pad = { t: 24, b: 28, l: 0, r: 70 }
  const { pts, min, max } = useMemo(() => {
    const min = Math.min(...data, clearing ?? Infinity) * 0.97, max = Math.max(...data) * 1.03
    const pts = data.map((v, i) => [pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r), pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)] as [number, number])
    return { pts, min, max }
  }, [data, H, clearing])
  const line = useMemo(() => smooth(pts), [pts])
  const area = `${line} L${pts[pts.length - 1][0]} ${H - pad.b} L${pts[0][0]} ${H - pad.b}Z`
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b)
  const last = pts[pts.length - 1]
  const up = data[data.length - 1] >= data[0]
  const grid = [0.25, 0.5, 0.75].map((k) => min + (max - min) * k)
  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((x - pad.l) / (W - pad.l - pad.r)) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const hp = hover != null ? pts[hover] : null
  return (
    <div ref={wrap} className="relative w-full select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} data-cursor="native">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        <defs>
          <linearGradient id={`s${id}`} x1="0" x2="1"><stop offset="0" stopColor="#5FD4FF" /><stop offset=".55" stopColor="#B69CFF" /><stop offset="1" stopColor="#FF5FB8" /></linearGradient>
          <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={up ? '#FF5FB8' : '#5FD4FF'} stopOpacity=".32" /><stop offset=".6" stopColor="#B69CFF" stopOpacity=".07" /><stop offset="1" stopColor="#B69CFF" stopOpacity="0" /></linearGradient>
          <filter id={`f${id}`} x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {grid.map((g, i) => <line key={i} x1="0" x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="#B69CFF" strokeOpacity=".08" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />)}
        {clearing != null && (
          <g><line x1="0" x2={W - pad.r} y1={y(clearing)} y2={y(clearing)} stroke="#7CF5C8" strokeOpacity=".55" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" /></g>
        )}
        <path d={area} fill={`url(#a${id})`} />
        <path d={line} fill="none" stroke={`url(#s${id})`} strokeWidth="7" opacity=".55" filter={`url(#f${id})`} vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={`url(#s${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hp && <line x1={hp[0]} x2={hp[0]} y1={pad.t} y2={H - pad.b} stroke="#FFF4FB" strokeOpacity=".25" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* HTML overlays keep text crisp regardless of preserveAspectRatio */}
      <div className="pointer-events-none absolute inset-0">
        {grid.map((g, i) => <span key={i} className="absolute right-0 -translate-y-1/2 font-num text-[10px] font-medium text-lav/60 tnum" style={{ top: `${(y(g) / H) * 100}%` }}>{fmtPrice(g)}</span>)}
        {clearing != null && <span className="absolute left-2 -translate-y-full rounded-md bg-mint/10 px-1.5 py-0.5 text-[10px] font-black text-mint" style={{ top: `${(y(clearing) / H) * 100}%` }}>window price {fmtPrice(clearing)}</span>}
        <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink anim-livep" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }} />
        <span className="absolute -translate-y-1/2 rounded-md bg-pink px-1.5 py-0.5 font-num text-[11px] font-semibold text-night tnum" style={{ left: `calc(${(last[0] / W) * 100}% + 10px)`, top: `${(last[1] / H) * 100}%` }}>{fmtPrice(data[data.length - 1])}</span>
        {hp && hover != null && (
          <>
            <span className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream bg-night" style={{ left: `${(hp[0] / W) * 100}%`, top: `${(hp[1] / H) * 100}%` }} />
            <div className="glass-strong absolute -translate-x-1/2 rounded-xl px-2.5 py-1.5 text-xs font-bold" style={{ left: `${Math.min(88, Math.max(8, (hp[0] / W) * 100))}%`, top: 4 }}>
              <span className="text-lav">{label}</span> <span className="font-num tnum">{fmtPrice(data[hover])}</span>
              <span className="ml-2 text-lav/70 tnum">{Math.round(((data.length - 1 - hover) * 5))}m ago</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function smooth(p: [number, number][]) {
  if (p.length < 2) return ''
  let d = `M${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2
    const t = 0.18
    d += ` C${p1[0] + (p2[0] - p0[0]) * t} ${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t} ${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]} ${p2[1]}`
  }
  return d
}
