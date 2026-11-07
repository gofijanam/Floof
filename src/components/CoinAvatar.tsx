import { memo, useId, useState } from 'react'
import type { Accessory } from '../lib/mock'

const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`

/** Procedural mochi avatar — every coin gets a sibling of the floof mascot. */
export const CoinAvatar = memo(function CoinAvatar({ hue = 200, accessory = 'none', size = 56, mood = 'idle', className = '', ring = false, image }:
  { image?: string | null; hue?: number; accessory?: Accessory; size?: number; mood?: 'idle' | 'happy' | 'wait' | 'sad'; className?: string; ring?: boolean }) {
  const id = useId().replace(/:/g, '')
  const [failedImage, setFailedImage] = useState<string | null>(null)
  if (image && image !== failedImage) return <img src={image} alt="" width={size} height={size} className={className} style={{width:size,height:size,objectFit:'cover',borderRadius:'28%'}} onError={() => setFailedImage(image)} />
  const light = hsl(hue, 100, 94), mid = hsl(hue, 95, 74), deep = hsl((hue + 40) % 360, 85, 66)
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id={`b${id}`} cx="40%" cy="32%" r="75%"><stop offset="0" stopColor={light} /><stop offset=".5" stopColor={mid} /><stop offset="1" stopColor={deep} /></radialGradient>
        <radialGradient id={`r${id}`} cx="75%" cy="90%" r="55%"><stop offset="0" stopColor="#FF5FB8" stopOpacity=".75" /><stop offset="1" stopColor="#FF5FB8" stopOpacity="0" /></radialGradient>
        <radialGradient id={`h${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {ring && <circle cx="60" cy="60" r="58" fill="none" stroke={mid} strokeOpacity=".35" strokeWidth="2" />}
      <ellipse cx="60" cy="104" rx="30" ry="5" fill="#000" opacity=".28" />
      <g>
        <ellipse cx="34" cy="38" rx="11" ry="10" fill={`url(#b${id})`} />
        <ellipse cx="86" cy="38" rx="11" ry="10" fill={`url(#b${id})`} />
        <path d="M60 32 C88 32 104 48 104 68 C104 88 86 100 60 100 C34 100 16 88 16 68 C16 48 32 32 60 32Z" fill={`url(#b${id})`} />
        <path d="M60 32 C88 32 104 48 104 68 C104 88 86 100 60 100 C34 100 16 88 16 68 C16 48 32 32 60 32Z" fill={`url(#r${id})`} />
        <ellipse cx="44" cy="46" rx="16" ry="8" fill={`url(#h${id})`} opacity=".8" />
        {/* face */}
        {mood === 'happy' ? (
          <g stroke="#1B0E2C" strokeWidth="3.2" strokeLinecap="round" fill="none"><path d="M38 66 q6 -7 12 0" /><path d="M70 66 q6 -7 12 0" /></g>
        ) : (
          <g>
            <ellipse cx="44" cy="66" rx="6.5" ry={mood === 'sad' ? 5.5 : 7.5} fill="#1B0E2C" />
            <ellipse cx="76" cy="66" rx="6.5" ry={mood === 'sad' ? 5.5 : 7.5} fill="#1B0E2C" />
            <circle cx="46" cy="63" r="2.4" fill="#fff" /><circle cx="78" cy="63" r="2.4" fill="#fff" />
            <ellipse cx="44" cy="70" rx="3.6" ry="1.6" fill="#5FD4FF" opacity=".7" /><ellipse cx="76" cy="70" rx="3.6" ry="1.6" fill="#5FD4FF" opacity=".7" />
          </g>
        )}
        <ellipse cx="32" cy="76" rx="7" ry="4" fill="#FF7FC4" opacity=".55" /><ellipse cx="88" cy="76" rx="7" ry="4" fill="#FF7FC4" opacity=".55" />
        {mood === 'wait' ? <circle cx="60" cy="78" r="2.6" fill="#1B0E2C" /> : mood === 'sad' ? <path d="M55 81 q5 -4 10 0" stroke="#1B0E2C" strokeWidth="2.4" fill="none" strokeLinecap="round" /> : <path d="M54 76 q3 3.5 6 0 q3 3.5 6 0" stroke="#1B0E2C" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
      </g>
      <Acc a={accessory} hue={hue} />
    </svg>
  )
})

function Acc({ a, hue }: { a: Accessory; hue: number }) {
  switch (a) {
    case 'bow': return <g transform="translate(78 30) rotate(18)"><path d="M0 0 l-14 -8 v16z M0 0 l14 -8 v16z" fill="#FF5FB8" stroke="#fff" strokeOpacity=".5" /><circle r="4" fill="#FF8CCB" /></g>
    case 'leaf': return <g transform="translate(60 28)"><path d="M0 4 C-2 -6 6 -14 16 -14 C14 -4 8 4 0 4Z" fill="#7CF5C8" /><path d="M0 4 L10 -9" stroke="#2d8f6e" strokeWidth="1.5" /></g>
    case 'crown': return <g transform="translate(60 26)"><path d="M-16 6 L-14 -10 L-6 -2 L0 -14 L6 -2 L14 -10 L16 6Z" fill="#FFD66B" stroke="#fff" strokeOpacity=".6" /><circle cx="0" cy="-2" r="2.5" fill="#FF5FB8" /></g>
    case 'star': return <g transform="translate(86 30) rotate(12)"><path d="M0 -11 L3 -3 L11 -3 L5 2 L7 10 L0 5 L-7 10 L-5 2 L-11 -3 L-3 -3Z" fill="#FFE27A" /></g>
    case 'boba': return <g transform="translate(92 86)"><rect x="-8" y="-14" width="16" height="22" rx="4" fill="#FFF4FB" opacity=".9" /><rect x="-8" y="-6" width="16" height="14" rx="4" fill="#C9A27E" /><circle cx="-3" cy="3" r="2" fill="#3a2430" /><circle cx="3" cy="5" r="2" fill="#3a2430" /><rect x="1" y="-24" width="3" height="14" rx="1" fill="#FF5FB8" /></g>
    case 'halo': return <ellipse cx="60" cy="20" rx="20" ry="5" fill="none" stroke="#FFE27A" strokeWidth="3.5" />
    case 'sprout': return <g transform="translate(60 32)"><path d="M0 0 V-10" stroke="#5fd49a" strokeWidth="2.5" /><path d="M0 -10 C-10 -18 -16 -10 -12 -6 C-8 -4 -2 -8 0 -10Z" fill="#7CF5C8" /><path d="M0 -10 C10 -18 16 -10 12 -6 C8 -4 2 -8 0 -10Z" fill="#7CF5C8" /></g>
    case 'cap': return <g transform="translate(60 34)"><path d="M-22 0 C-22 -16 22 -16 22 0Z" fill={`hsl(${(hue + 180) % 360} 80% 66%)`} /><rect x="-4" y="-3" width="34" height="5" rx="2.5" fill={`hsl(${(hue + 180) % 360} 70% 56%)`} /></g>
    case 'phones': return <g fill="none"><path d="M22 58 C22 26 98 26 98 58" stroke="#FF5FB8" strokeWidth="5" strokeLinecap="round" /><rect x="14" y="54" width="12" height="18" rx="5" fill="#FF5FB8" /><rect x="94" y="54" width="12" height="18" rx="5" fill="#FF5FB8" /></g>
    default: return null
  }
}
