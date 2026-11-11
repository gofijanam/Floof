import { motion, useReducedMotion } from 'framer-motion'
import { useId, useMemo } from 'react'
import type { Coin } from '../lib/mock'
import { maxRaise } from '../lib/mock'
import { CoinAvatar } from './CoinAvatar'

const CIRCLES: [number, number, number][] = [[150, 230, 105], [262, 150, 125], [398, 160, 112], [490, 238, 92], [310, 250, 135]]
const CloudShapes = () => (<>{CIRCLES.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}<rect x="90" y="225" width="430" height="115" rx="57" /></>)
const TOP = 25, BOTTOM = 340 // fill range in viewBox units

/** The escrow as a candy cloud that fills with liquid SOL. Oversubscription overflows with a pink glow. */
export function EscrowCloud({ coin, compact = false }: { coin: Coin; compact?: boolean }) {
  const id = useId().replace(/:/g, '')
  const reduced = useReducedMotion()
  const cap = maxRaise(coin)
  const ratio = coin.pledged / cap
  const fill = Math.min(1, ratio)
  const minY = BOTTOM - (coin.minTarget / cap) * (BOTTOM - TOP)
  const level = BOTTOM - fill * (BOTTOM - TOP)
  const over = ratio > 1
  const bubbles = useMemo(() => Array.from({ length: compact ? 8 : 16 }, (_, i) => ({ x: 120 + ((i * 53) % 380), d: 3 + (i % 5) * 1.1, r: 3 + (i % 4) * 2.2, delay: (i * 0.37) % 4 })), [compact])
  const friends = useMemo(() => [[200, 0.2, 120], [330, 0.55, 330], [430, 0.35, 52], [265, 0.8, 285], [380, 0.12, 165]] as const, [])
  return (
    <div className="relative">
      <svg viewBox="0 0 600 380" className="w-full overflow-visible" role="img" aria-label={`Escrow ${coin.pledged.toFixed(1)} of ${cap.toFixed(0)} ${coin.quote ?? 'SOL'}`}>
        <defs>
          <clipPath id={`c${id}`}><CloudShapes /></clipPath>
          <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7FE0FF" /><stop offset=".5" stopColor="#B69CFF" /><stop offset="1" stopColor="#FF5FB8" /></linearGradient>
          <linearGradient id={`l2${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6FBFF" stopOpacity=".9" /><stop offset="1" stopColor="#5FD4FF" stopOpacity=".2" /></linearGradient>
          <radialGradient id={`g${id}`} cx="40%" cy="25%" r="80%"><stop offset="0" stopColor="#3A2668" /><stop offset="1" stopColor="#1A0F2E" /></radialGradient>
          <filter id={`o${id}`} x="-20%" y="-20%" width="140%" height="140%"><feMorphology operator="dilate" radius="4" in="SourceAlpha" result="d" /><feFlood floodColor={over ? '#FF5FB8' : '#B69CFF'} floodOpacity=".9" /><feComposite in2="d" operator="in" result="o" /><feGaussianBlur in="o" stdDeviation={over ? 10 : 6} result="glow" /><feMerge><feMergeNode in="glow" /><feMergeNode in="o" /></feMerge></filter>
        </defs>
        {/* outline glow */}
        <g filter={`url(#o${id})`} opacity={over ? 0.9 : 0.55} className={over && !reduced ? 'anim-glow' : ''}><CloudShapes /></g>
        <g clipPath={`url(#c${id})`}>
          <rect width="600" height="380" fill={`url(#g${id})`} />
          {/* liquid */}
          <motion.g initial={false} animate={{ y: level - 20 }} transition={{ type: 'spring', stiffness: 40, damping: 16 }}>
            <g className={reduced ? '' : 'anim-wave'} style={{ animation: reduced ? undefined : 'wave 6s linear infinite' }}>
              <path d={wavePath(1200, 18, 100)} fill={`url(#l${id})`} opacity=".55" transform="translate(0 -6)" />
            </g>
            <g style={{ animation: reduced ? undefined : 'wave 3.8s linear infinite reverse' }}>
              <path d={wavePath(1200, 12, 150)} fill={`url(#l${id})`} />
            </g>
            <rect y="38" width="600" height="400" fill={`url(#l${id})`} />
            {/* sheen */}
            <rect y="20" width="600" height="10" fill="#fff" opacity=".18" />
          </motion.g>
          {/* bubbles */}
          {!reduced && bubbles.map((b, i) => (
            <circle key={i} cx={b.x} cy={BOTTOM} r={b.r} fill="#fff" opacity=".0" style={{ animation: `bubbleUp ${b.d}s ease-in ${b.delay}s infinite`, transformBox: 'fill-box' }} />
          ))}
          {/* floof friends bobbing in the liquid */}
          {!compact && friends.map(([x, f, hue], i) => fill > f ? (
            <g key={i} transform={`translate(${x - 22} ${Math.max(level, TOP + 30) - 26 + (1 - f) * 40})`} style={{ animation: reduced ? undefined : `floaty ${3 + i * 0.7}s ease-in-out ${i * 0.4}s infinite` }}>
              <foreignObject width="44" height="44"><CoinAvatar hue={hue} size={44} mood="happy" /></foreignObject>
            </g>
          ) : null)}
          {/* gloss highlight */}
          <ellipse cx="230" cy="90" rx="90" ry="30" fill={`url(#l2${id})`} opacity=".25" />
        </g>
        {/* min target line */}
        <g opacity=".95">
          <line x1="70" x2="540" y1={minY} y2={minY} stroke="#FFF4FB" strokeWidth="2" strokeDasharray="6 8" className="anim-dash" opacity=".7" />
          <g transform={`translate(548 ${minY})`}>
            <rect x="0" y="-13" width="82" height="26" rx="13" fill="#0E0818" stroke="#FFF4FB" strokeOpacity=".4" />
            <text x="41" y="5" textAnchor="middle" className="fill-cream font-num text-[13px] font-semibold">min {coin.minTarget}</text>
          </g>
        </g>
        {over && (
          <motion.g initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: -8 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} style={{ transformOrigin: '520px 70px' }}>
            <rect x="452" y="44" width="140" height="44" rx="22" fill="#FF5FB8" />
            <text x="522" y="73" textAnchor="middle" className="fill-night font-num text-[19px] font-semibold">{ratio.toFixed(2)}× over</text>
          </motion.g>
        )}
      </svg>
    </div>
  )
}

function wavePath(w: number, amp: number, len: number) {
  let d = `M0 20`
  for (let x = 0; x <= w; x += len) d += ` Q${x + len / 4} ${20 - amp} ${x + len / 2} 20 T${x + len} 20`
  return d + ` V80 H0Z`
}
